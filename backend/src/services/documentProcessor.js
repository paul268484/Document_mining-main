// import fs from "fs/promises";
// import path from "path";
// import pdfParse from "pdf-parse";
// import mammoth from "mammoth";
// import { query } from "../config/database.js";
// import ollamaService from "../config/ollama.js";
// import logger from "../utils/logger.js";

// export class DocumentProcessor {
//   constructor() {
//     this.chunkSize = 1000;
//     this.chunkOverlap = 200;
//   }

//   async processDocument(documentId, filePath, mimeType) {
//     try {
//       logger.info(`Starting document processing: ${documentId}`);
//       logger.info("Step: Updating status → processing");
//       logger.info("Step: Extracting text");
//       logger.info("Step: Splitting into chunks");
//       logger.info("Step: Storing chunks");
//       logger.info("Step: Generating embeddings");

//       // Update document status to processing
//       await query(
//         "UPDATE documents SET status = $1, processed_date = CURRENT_TIMESTAMP WHERE id = $2",
//         ["processing", documentId]
//       );

//       // Create processing job
//       const jobId = await this.createProcessingJob(
//         documentId,
//         "document_processing"
//       );

//       // Extract text content based on file type
//       const content = await this.extractTextContent(filePath, mimeType);

//       if (!content) {
//         throw new Error("No text content extracted from document");
//       }

//       // Update job progress
//       await this.updateJobProgress(jobId, 25);

//       // Split content into chunks
//       const chunks = this.splitIntoChunks(content);
//       logger.info(`Document split into ${chunks.length} chunks`);

//       // Update job progress
//       await this.updateJobProgress(jobId, 50);

//       // Process and store chunks
//       await this.processAndStoreChunks(documentId, chunks);

//       // Update job progress
//       await this.updateJobProgress(jobId, 75);

//       // Generate embeddings for chunks
//       await this.generateEmbeddings(documentId);

//       // Update job progress
//       await this.updateJobProgress(jobId, 100);

//       // Update document status to completed
//       await query("UPDATE documents SET status = $1 WHERE id = $2", [
//         "completed",
//         documentId,
//       ]);

//       // Complete processing job
//       await this.completeProcessingJob(jobId);

//       logger.info(`Document processing completed: ${documentId}`);
//     } catch (error) {
//       logger.error(`Document processing failed for ${documentId}:`, error);

//       // Update document status to failed
//       await query("UPDATE documents SET status = $1 WHERE id = $2", [
//         "failed",
//         documentId,
//       ]);

//       // Fail processing job
//       await this.failProcessingJob(documentId, error.message);

//       throw error;
//     }
//   }

//   async extractTextContent(filePath, mimeType) {
//     try {
//       const absolutePath = path.resolve(filePath);
//       const buffer = await fs.readFile(absolutePath);

//       switch (mimeType) {
//         case "application/pdf":
//           const pdfData = await pdfParse(buffer);
//           return pdfData.text;

//         case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
//           const docxResult = await mammoth.extractRawText({ buffer });
//           return docxResult.value;

//         case "text/plain":
//           return buffer.toString("utf-8");

//         default:
//           throw new Error(`Unsupported file type: ${mimeType}`);
//       }
//     } catch (error) {
//       logger.error("Text extraction failed:", error);
//       throw new Error(`Failed to extract text: ${error.message}`);
//     }
//   }

//   splitIntoChunks(text) {
//     const chunks = [];
//     const sentences = text.match(/[^\.!?]+[\.!?]+/g) || [text];
//     let currentChunk = "";
//     let currentLength = 0;

//     for (const sentence of sentences) {
//       const sentenceLength = sentence.length;

//       if (currentLength + sentenceLength > this.chunkSize && currentChunk) {
//         // Add overlap from the beginning of current chunk
//         const overlapText = currentChunk.substring(0, this.chunkOverlap);
//         chunks.push(currentChunk.trim());
//         currentChunk = overlapText + sentence;
//         currentLength = currentChunk.length;
//       } else {
//         currentChunk += sentence;
//         currentLength += sentenceLength;
//       }
//     }

//     if (currentChunk.trim()) {
//       chunks.push(currentChunk.trim());
//     }

//     return chunks.filter((chunk) => chunk.length > 50); // Filter out very small chunks
//   }

//   async processAndStoreChunks(documentId, chunks) {
//     try {
//       const chunkPromises = chunks.map(async (content, index) => {
//         // Extract metadata (page numbers, section titles, etc.)
//         const metadata = this.extractChunkMetadata(content, index);

//         await query(
//           `INSERT INTO document_chunks 
//            (document_id, chunk_index, content, content_length, page_number, section_title, metadata)
//            VALUES ($1, $2, $3, $4, $5, $6, $7)`,
//           [
//             documentId,
//             index,
//             content,
//             content.length,
//             metadata.pageNumber,
//             metadata.sectionTitle,
//             metadata,
//           ]
//         );
//       });

//       await Promise.all(chunkPromises);
//       logger.info(`Stored ${chunks.length} chunks for document ${documentId}`);
//     } catch (error) {
//       logger.error("Failed to store chunks:", error);
//       throw error;
//     }
//   }

//   async generateEmbeddings(documentId) {
//     try {
//       const chunksResult = await query(
//         "SELECT id, content FROM document_chunks WHERE document_id = $1 AND embedding IS NULL",
//         [documentId]
//       );

//       if (chunksResult.rows.length === 0) {
//         logger.info(`No chunks need embeddings for document ${documentId}`);
//         return;
//       }

//       logger.info(
//         `Generating embeddings for ${chunksResult.rows.length} chunks`
//       );

//       const embeddingPromises = chunksResult.rows.map(async (chunk) => {
//         try {
//           const embedding = await ollamaService.generateEmbedding(
//             chunk.content
//           );

//           if (embedding) {
//             await query(
//               "UPDATE document_chunks SET embedding = $1 WHERE id = $2",
//               [JSON.stringify(embedding), chunk.id]
//             );
//           }
//         } catch (error) {
//           logger.warn(
//             `Failed to generate embedding for chunk ${chunk.id}:`,
//             error
//           );
//           // Continue with other chunks even if one fails
//         }
//       });

//       await Promise.all(embeddingPromises);
//       logger.info(`Embeddings generated for document ${documentId}`);
//     } catch (error) {
//       logger.error("Failed to generate embeddings:", error);
//       throw error;
//     }
//   }

//   extractChunkMetadata(content, index) {
//     const metadata = {
//       chunkIndex: index,
//       pageNumber: null,
//       sectionTitle: null,
//       wordCount: content.split(/\s+/).length,
//       hasImages: false,
//       hasTables: false,
//     };

//     // Try to extract page numbers from content
//     const pageMatch = content.match(/(?:page|p\.?)\s*(\d+)/i);
//     if (pageMatch) {
//       metadata.pageNumber = parseInt(pageMatch[1]);
//     }

//     // Try to extract section titles (lines that are short and start with capital or numbers)
//     const lines = content.split("\n");
//     for (const line of lines.slice(0, 3)) {
//       const trimmedLine = line.trim();
//       if (trimmedLine.length < 100 && trimmedLine.length > 5) {
//         if (/^[A-Z0-9]/.test(trimmedLine) && !trimmedLine.endsWith(".")) {
//           metadata.sectionTitle = trimmedLine;
//           break;
//         }
//       }
//     }

//     // Check for images and tables indicators
//     metadata.hasImages = /\b(?:figure|image|photo|diagram)\b/i.test(content);
//     metadata.hasTables = /\b(?:table|column|row)\b/i.test(content);

//     return metadata;
//   }

//   async createProcessingJob(documentId, jobType) {
//     const result = await query(
//       "INSERT INTO processing_jobs (document_id, job_type, status, progress) VALUES ($1, $2, $3, $4) RETURNING id",
//       [documentId, jobType, "processing", 0]
//     );

//     return result.rows[0].id;
//   }

//   async updateJobProgress(jobId, progress) {
//     await query(
//       "UPDATE processing_jobs SET progress = $1, started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = $2",
//       [progress, jobId]
//     );
//   }

//   async completeProcessingJob(jobId) {
//     await query(
//       "UPDATE processing_jobs SET status = $1, progress = $2, completed_at = CURRENT_TIMESTAMP WHERE id = $3",
//       ["completed", 100, jobId]
//     );
//   }

//   async failProcessingJob(documentId, errorMessage) {
//     await query(
//       `UPDATE processing_jobs 
//      SET status = $1, error_message = $2, completed_at = CURRENT_TIMESTAMP 
//      WHERE document_id = $3`,
//       ["failed", errorMessage, documentId]
//     );
//   }
// }

// export default new DocumentProcessor();


// services/documentProcessor.js - Updated with your embeddings
import ollamaService from '../config/ollama.js';
import { query } from '../config/database.js';
import logger from '../utils/logger.js';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { DocxLoader } from "@langchain/community/document_loaders/fs/docx";
import { TextLoader } from "langchain/document_loaders/fs/text";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

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