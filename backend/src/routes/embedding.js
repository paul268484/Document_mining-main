// routes/test.js - Add this to test your embeddings service
import express from 'express';
import ollamaService from '../config/ollama.js';
import { query } from '../config/database.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Test embeddings generation
router.post('/embeddings', async (req, res, next) => {
  try {
    const { text = "This is a test text for embedding generation" } = req.body;
    
    logger.info(`Testing embedding generation for text: ${text.substring(0, 100)}...`);
    
    const startTime = Date.now();
    const embedding = await ollamaService.generateEmbedding(text);
    const endTime = Date.now();
    
    res.json({
      success: true,
      text: text,
      embedding: embedding,
      dimensions: embedding ? embedding.length : 0,
      processingTime: endTime - startTime,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Embedding test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test semantic search
router.post('/semantic-search', async (req, res, next) => {
  try {
    const { query: searchQuery, limit = 5, threshold = 0.6 } = req.body;
    
    if (!searchQuery) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }
    
    logger.info(`Testing semantic search for query: ${searchQuery}`);
    
    // Generate embedding for the search query
    const queryEmbedding = await ollamaService.generateEmbedding(searchQuery);
    
    // Perform similarity search
    const searchResult = await query(`
      SELECT 
        dc.id,
        dc.content,
        dc.chunk_index,
        dc.page_number,
        dc.section_title,
        d.original_filename,
        (1 - (dc.embedding <=> $1::vector)) as similarity
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE dc.embedding IS NOT NULL
        AND d.status = 'completed'
        AND (1 - (dc.embedding <=> $1::vector)) > $2
      ORDER BY similarity DESC
      LIMIT $3
    `, [JSON.stringify(queryEmbedding), threshold, limit]);
    
    res.json({
      success: true,
      query: searchQuery,
      results: searchResult.rows,
      resultCount: searchResult.rows.length,
      threshold: threshold,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Semantic search test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Test full service connection
router.get('/connection', async (req, res, next) => {
  try {
    logger.info('Testing Ollama service connection...');
    
    const connectionTest = await ollamaService.testConnection();
    
    // Also test database connection
    const dbTest = await query('SELECT COUNT(*) as document_count FROM documents');
    const chunksTest = await query('SELECT COUNT(*) as chunk_count FROM document_chunks WHERE embedding IS NOT NULL');
    
    res.json({
      success: true,
      ollama: connectionTest,
      database: {
        documents: parseInt(dbTest.rows[0].document_count),
        chunks: parseInt(chunksTest.rows[0].chunk_count)
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error('Connection test failed:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Reprocess failed embeddings for a document
router.post('/reprocess-embeddings/:documentId', async (req, res, next) => {
  try {
    const { documentId } = req.params;
    
    logger.info(`Reprocessing failed embeddings for document: ${documentId}`);
    
    const result = await documentProcessor.reprocessFailedEmbeddings(documentId);
    
    res.json({
      success: true,
      documentId: documentId,
      processedCount: result.processedCount,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    logger.error(`Failed to reprocess embeddings for document ${req.params.documentId}:`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

export default router;