import { query } from '../config/database.js';
import { ollamaService } from './ollamaService.js';
import logger from '../utils/logger.js';

export const contextService = {
  /**
   * Find relevant document chunks for a given query
   * @param {string} queryText - The text to find relevant chunks for
   * @param {string[]} documentIds - Optional array of document IDs to filter by
   * @param {number} limit - Maximum number of chunks to return
   * @returns {Promise<Array>} Array of relevant chunks with their content and metadata
   */
  async findRelevantChunks(queryText, documentIds = [], limit = 5) {
    try {
      // Generate embedding for the query
      const queryEmbedding = await ollamaService.generateEmbedding(queryText);

      // Build the SQL query with optional document filter
      const documentFilter = documentIds.length > 0 
        ? 'AND document_id = ANY($2)'
        : '';

      // Use vector similarity search to find relevant chunks
      const result = await query(
        `SELECT 
          dc.id,
          dc.content,
          dc.metadata,
          dc.document_id,
          d.original_filename,
          1 - (dc.embedding <=> $1) as similarity
        FROM document_chunks dc
        JOIN documents d ON d.id = dc.document_id
        WHERE 1=1 ${documentFilter}
        ORDER BY dc.embedding <=> $1
        LIMIT $${documentIds.length > 0 ? '3' : '2'}`,
        documentIds.length > 0
          ? [queryEmbedding, documentIds, limit]
          : [queryEmbedding, limit]
      );

      return result.rows;
    } catch (error) {
      logger.error('Error finding relevant chunks:', error);
      throw error;
    }
  },

  /**
   * Format chunks into a context string for the AI
   * @param {Array} chunks - Array of relevant chunks
   * @returns {string} Formatted context string
   */
  formatChunksAsContext(chunks) {
    return chunks
      .map(chunk => {
        return `Document: ${chunk.original_filename}\nContent: ${chunk.content}\n---\n`;
      })
      .join('\n');
  }
};