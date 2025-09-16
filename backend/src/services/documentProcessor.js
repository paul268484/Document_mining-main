
// services/documentProcessor.js - Updated with your embeddings
import ollamaService from '../config/ollama.js';
import { query } from '../config/database.js';
import logger from '../utils/logger.js';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { ChromaClient } from 'chromadb'; // install chromadb client

const chroma = new ChromaClient({ path: process.env.CHROMA_URL || 'http://localhost:8000' });

class DocumentProcessor {
  constructor() {
    this.textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
      separators: ['\n\n', '\n', '. ', ' ', '']
    });
  }

  async processDocument(documentId, filePath, mimeType) {
    try {
      logger.info(`Processing document: ${documentId}`);
      
      // Update status to processing
      await query(
        'UPDATE documents SET status = $1, processed_date = CURRENT_TIMESTAMP WHERE id = $2',
        ['processing', documentId]
      );

      // Load document content
      const documents = await this.loadDocument(filePath, mimeType);
      
      if (!documents || documents.length === 0) {
        throw new Error('No content extracted from document');
      }

      // Split into chunks
      const chunks = await this.textSplitter.splitDocuments(documents);
      
      if (chunks.length === 0) {
        throw new Error('No chunks generated from document');
      }

      logger.info(`Generated ${chunks.length} chunks for document ${documentId}`);

      // Process chunks and generate embeddings
      const processedChunks = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        try {
          // Generate embedding using your custom service
          const embedding = await ollamaService.generateEmbedding(chunk.pageContent);
          
          processedChunks.push({
            documentId,
            chunkIndex: i,
            content: chunk.pageContent,
            embedding: JSON.stringify(embedding), // Store as JSON string for PostgreSQL
            metadata: chunk.metadata || {},
            pageNumber: chunk.metadata?.loc?.pageNumber || null,
            sectionTitle: this.extractSectionTitle(chunk.pageContent)
          });

          // Log progress every 10 chunks
          if ((i + 1) % 10 === 0) {
            logger.info(`Processed ${i + 1}/${chunks.length} chunks for document ${documentId}`);
          }

        } catch (embeddingError) {
          logger.error(`Failed to generate embedding for chunk ${i}:`, embeddingError);
          // Continue with null embedding - you might want to retry or skip
          processedChunks.push({
            documentId,
            chunkIndex: i,
            content: chunk.pageContent,
            embedding: null,
            metadata: chunk.metadata || {},
            pageNumber: chunk.metadata?.loc?.pageNumber || null,
            sectionTitle: this.extractSectionTitle(chunk.pageContent)
          });
        }
      }

      // Save chunks to database
      await this.saveChunks(processedChunks);

      // Update document status
      await query(
        'UPDATE documents SET status = $1, chunk_count = $2, processed_date = CURRENT_TIMESTAMP WHERE id = $3',
        ['completed', processedChunks.length, documentId]
      );

      logger.info(`Document processing completed: ${documentId} with ${processedChunks.length} chunks`);
      return { success: true, chunkCount: processedChunks.length };

    } catch (error) {
      logger.error(`Document processing failed for ${documentId}:`, error);
      
      // Update status to failed
      await query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        ['failed', documentId]
      );

      throw error;
    }
  }

  async loadDocument(filePath, mimeType) {
    try {
      let loader;
      
      switch (mimeType) {
        case 'application/pdf':
          loader = new PDFLoader(filePath);
          break;
        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          loader = new DocxLoader(filePath);
          break;
        case 'text/plain':
          loader = new TextLoader(filePath);
          break;
        default:
          throw new Error(`Unsupported file type: ${mimeType}`);
      }

      const documents = await loader.load();
      return documents;
      
    } catch (error) {
      logger.error('Failed to load document:', error);
      throw new Error(`Document loading failed: ${error.message}`);
    }
  }

  extractSectionTitle(content) {
    // Simple heuristic to extract section titles
    const lines = content.split('\n');
    for (const line of lines.slice(0, 3)) {
      const trimmed = line.trim();
      if (trimmed.length > 0 && trimmed.length < 100) {
        // Check if it looks like a title (short, maybe capitalized)
        if (trimmed === trimmed.toUpperCase() || 
            /^[A-Z][^.]*$/.test(trimmed) ||
            /^\d+\.?\s/.test(trimmed)) {
          return trimmed;
        }
      }
    }
    return null;
  }

  async saveChunks(chunks) {
    try {
      // Delete existing chunks for this document
      await query('DELETE FROM document_chunks WHERE document_id = $1', [chunks[0].documentId]);

      // Insert new chunks in batches for better performance
      const batchSize = 50;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const batch = chunks.slice(i, i + batchSize);
        
        const values = [];
        const placeholders = [];
        let paramIndex = 1;

        for (const chunk of batch) {
          placeholders.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`);
          values.push(
            chunk.documentId,
            chunk.chunkIndex,
            chunk.content,
            chunk.embedding, // JSON string
            JSON.stringify(chunk.metadata),
            chunk.pageNumber,
            chunk.sectionTitle
          );
          paramIndex += 7;
        }

        const insertQuery = `
          INSERT INTO document_chunks 
          (document_id, chunk_index, content, embedding, metadata, page_number, section_title)
          VALUES ${placeholders.join(', ')}
        `;

        await query(insertQuery, values);
      }

    } catch (error) {
      logger.error('Failed to save chunks:', error);
      throw new Error(`Chunk saving failed: ${error.message}`);
    }


    const collection = await chroma.getOrCreateCollection('documents');
    for (const chunk of chunks) {
      await collection.add({
        ids: [chunk.documentId + '-' + chunk.chunkIndex],
        embeddings: [JSON.parse(chunk.embedding)],
        documents: [chunk.content],
        metadatas: [{ documentId: chunk.documentId, chunkIndex: chunk.chunkIndex, ...chunk.metadata }]
      });
    }
    logger.info(`Saved ${chunks.length} chunks to database and vector store`);
  }
  

  // Method to reprocess documents with failed embeddings
  async reprocessFailedEmbeddings(documentId) {
    try {
      const result = await query(
        'SELECT id, content FROM document_chunks WHERE document_id = $1 AND embedding IS NULL',
        [documentId]
      );

      const failedChunks = result.rows;
      
      if (failedChunks.length === 0) {
        logger.info(`No failed embeddings found for document ${documentId}`);
        return { success: true, processedCount: 0 };
      }

      logger.info(`Reprocessing ${failedChunks.length} failed embeddings for document ${documentId}`);

      let processedCount = 0;
      for (const chunk of failedChunks) {
        try {
          const embedding = await ollamaService.generateEmbedding(chunk.content);
          
          await query(
            'UPDATE document_chunks SET embedding = $1 WHERE id = $2',
            [JSON.stringify(embedding), chunk.id]
          );

          processedCount++;
        } catch (error) {
          logger.error(`Failed to reprocess embedding for chunk ${chunk.id}:`, error);
        }
      }

      logger.info(`Reprocessed ${processedCount}/${failedChunks.length} embeddings for document ${documentId}`);
      return { success: true, processedCount };

    } catch (error) {
      logger.error(`Failed to reprocess embeddings for document ${documentId}:`, error);
      throw error;
    }
  }
}

const documentProcessor = new DocumentProcessor();
export default documentProcessor;
  