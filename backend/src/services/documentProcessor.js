import fs from 'fs/promises';
import path from 'path';
import pkg from 'pdf-parse';
import mammoth from 'mammoth';
import { query } from '../config/database.js';
import ollamaService from '../config/ollama.js';
import logger from '../utils/logger.js';
const pdfParse = pkg.default || pkg;
export class DocumentProcessor {
  constructor() {
    this.chunkSize = 1000;
    this.chunkOverlap = 200;
  }

  async processDocument(documentId, filePath, mimeType) {
    try {
      logger.info(`Starting document processing: ${documentId}`);
      
      // Update document status to processing
      await query(
        'UPDATE documents SET status = $1, processed_date = CURRENT_TIMESTAMP WHERE id = $2',
        ['processing', documentId]
      );

      // Create processing job
      const jobId = await this.createProcessingJob(documentId, 'document_processing');

      // Extract text content based on file type
      const content = await this.extractTextContent(filePath, mimeType);
      
      if (!content) {
        throw new Error('No text content extracted from document');
      }

      // Update job progress
      await this.updateJobProgress(jobId, 25);

      // Split content into chunks
      const chunks = this.splitIntoChunks(content);
      logger.info(`Document split into ${chunks.length} chunks`);

      // Update job progress
      await this.updateJobProgress(jobId, 50);

      // Process and store chunks
      await this.processAndStoreChunks(documentId, chunks);

      // Update job progress
      await this.updateJobProgress(jobId, 75);

      // Generate embeddings for chunks
      await this.generateEmbeddings(documentId);

      // Update job progress
      await this.updateJobProgress(jobId, 100);

      // Update document status to completed
      await query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        ['completed', documentId]
      );

      // Complete processing job
      await this.completeProcessingJob(jobId);

      logger.info(`Document processing completed: ${documentId}`);
    } catch (error) {
      logger.error(`Document processing failed for ${documentId}:`, error);
      
      // Update document status to failed
      await query(
        'UPDATE documents SET status = $1 WHERE id = $2',
        ['failed', documentId]
      );

      // Fail processing job
      await this.failProcessingJob(documentId, error.message);
      
      throw error;
    }
  }

  async extractTextContent(filePath, mimeType) {
    try {
      const buffer = await fs.readFile(filePath);

      switch (mimeType) {
        case 'application/pdf':
          const pdfData = await pdfParse(buffer);
          return pdfData.text;

        case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
          const docxResult = await mammoth.extractRawText({ buffer });
          return docxResult.value;

        case 'text/plain':
          return buffer.toString('utf-8');

        default:
          throw new Error(`Unsupported file type: ${mimeType}`);
      }
    } catch (error) {
      logger.error('Text extraction failed:', error);
      throw new Error(`Failed to extract text: ${error.message}`);
    }
  }

  splitIntoChunks(text) {
    const chunks = [];
    const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
    let currentChunk = '';
    let currentLength = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.length;

      if (currentLength + sentenceLength > this.chunkSize && currentChunk) {
        // Add overlap from the beginning of current chunk
        const overlapText = currentChunk.substring(0, this.chunkOverlap);
        chunks.push(currentChunk.trim());
        currentChunk = overlapText + sentence;
        currentLength = currentChunk.length;
      } else {
        currentChunk += sentence;
        currentLength += sentenceLength;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks.filter(chunk => chunk.length > 50); // Filter out very small chunks
  }

  async processAndStoreChunks(documentId, chunks) {
    try {
      const chunkPromises = chunks.map(async (content, index) => {
        // Extract metadata (page numbers, section titles, etc.)
        const metadata = this.extractChunkMetadata(content, index);

        await query(
          `INSERT INTO document_chunks 
           (document_id, chunk_index, content, content_length, page_number, section_title, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            documentId,
            index,
            content,
            content.length,
            metadata.pageNumber,
            metadata.sectionTitle,
            metadata
          ]
        );
      });

      await Promise.all(chunkPromises);
      logger.info(`Stored ${chunks.length} chunks for document ${documentId}`);
    } catch (error) {
      logger.error('Failed to store chunks:', error);
      throw error;
    }
  }

  async generateEmbeddings(documentId) {
    try {
      const chunksResult = await query(
        'SELECT id, content FROM document_chunks WHERE document_id = $1 AND embedding IS NULL',
        [documentId]
      );

      if (chunksResult.rows.length === 0) {
        logger.info(`No chunks need embeddings for document ${documentId}`);
        return;
      }

      logger.info(`Generating embeddings for ${chunksResult.rows.length} chunks`);

      const embeddingPromises = chunksResult.rows.map(async (chunk) => {
        try {
          const embedding = await ollamaService.generateEmbedding(chunk.content);
          
          if (embedding) {
            await query(
              'UPDATE document_chunks SET embedding = $1 WHERE id = $2',
              [JSON.stringify(embedding), chunk.id]
            );
          }
        } catch (error) {
          logger.warn(`Failed to generate embedding for chunk ${chunk.id}:`, error);
          // Continue with other chunks even if one fails
        }
      });

      await Promise.all(embeddingPromises);
      logger.info(`Embeddings generated for document ${documentId}`);
    } catch (error) {
      logger.error('Failed to generate embeddings:', error);
      throw error;
    }
  }

  extractChunkMetadata(content, index) {
    const metadata = {
      chunkIndex: index,
      pageNumber: null,
      sectionTitle: null,
      wordCount: content.split(/\s+/).length,
      hasImages: false,
      hasTables: false
    };

    // Try to extract page numbers from content
    const pageMatch = content.match(/(?:page|p\.?)\s*(\d+)/i);
    if (pageMatch) {
      metadata.pageNumber = parseInt(pageMatch[1]);
    }

    // Try to extract section titles (lines that are short and start with capital or numbers)
    const lines = content.split('\n');
    for (const line of lines.slice(0, 3)) {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 100 && trimmedLine.length > 5) {
        if (/^[A-Z0-9]/.test(trimmedLine) && !trimmedLine.endsWith('.')) {
          metadata.sectionTitle = trimmedLine;
          break;
        }
      }
    }

    // Check for images and tables indicators
    metadata.hasImages = /\b(?:figure|image|photo|diagram)\b/i.test(content);
    metadata.hasTables = /\b(?:table|column|row)\b/i.test(content);

    return metadata;
  }

  async createProcessingJob(documentId, jobType) {
    const result = await query(
      'INSERT INTO processing_jobs (document_id, job_type, status, progress) VALUES ($1, $2, $3, $4) RETURNING id',
      [documentId, jobType, 'processing', 0]
    );
    
    return result.rows[0].id;
  }

  async updateJobProgress(jobId, progress) {
    await query(
      'UPDATE processing_jobs SET progress = $1, started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = $2',
      [progress, jobId]
    );
  }

  async completeProcessingJob(jobId) {
    await query(
      'UPDATE processing_jobs SET status = $1, progress = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $3',
      ['completed', 100, jobId]
    );
  }

  async failProcessingJob(documentId, errorMessage) {
    await query(
      'UPDATE processing_jobs SET status = $1, error_message = $2, completed_at = CURRENT_TIMESTAMP WHERE document_id = $3 AND status = $4',
      ['failed', errorMessage, documentId, 'processing']
    );
  }
}

export default new DocumentProcessor();