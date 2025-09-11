import express from 'express';
import { query } from '../config/database.js';
import ollamaService from '../config/ollama.js';
import { validateSearch } from '../middleware/validation.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Full-text search in document chunks
router.post('/text', validateSearch, async (req, res, next) => {
  try {
    const { query: searchQuery, limit = 10, documents = [] } = req.body;
    const startTime = Date.now();

    let queryText = `
      SELECT 
        dc.id, dc.content, dc.chunk_index, dc.page_number, dc.section_title,
        d.id as document_id, d.original_filename, d.filename,
        ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', $1)) as rank
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE to_tsvector('english', dc.content) @@ plainto_tsquery('english', $1)
        AND d.status = 'completed'
    `;

    const params = [searchQuery];
    let paramIndex = 2;

    // Filter by specific documents if provided
    if (documents.length > 0) {
      queryText += ` AND d.id = ANY($${paramIndex++}::uuid[])`;
      params.push(documents);
    }

    queryText += ` ORDER BY rank DESC, dc.chunk_index LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await query(queryText, params);
    const executionTime = Date.now() - startTime;

    // Log search query for analytics
    try {
      await query(
        'INSERT INTO search_queries (query, search_type, results_count, execution_time) VALUES ($1, $2, $3, $4)',
        [searchQuery, 'text', result.rows.length, executionTime]
      );
    } catch (logError) {
      logger.warn('Failed to log search query:', logError.message);
    }

    logger.info(`Text search completed`, {
      query: searchQuery,
      results: result.rows.length,
      executionTime
    });

    res.json({
      results: result.rows,
      query: searchQuery,
      totalResults: result.rows.length,
      executionTime
    });
  } catch (error) {
    next(error);
  }
});

// Semantic search using JSONB embeddings - FIXED
router.post('/semantic', validateSearch, async (req, res, next) => {
  try {
    const { query: searchQuery, limit = 10, documents = [], threshold = 0.7 } = req.body;
    const startTime = Date.now();

    // Generate embedding for the search query
    let queryEmbedding;
    try {
      queryEmbedding = await ollamaService.generateEmbedding(searchQuery);
    } catch (embeddingError) {
      logger.warn('Failed to generate query embedding:', embeddingError.message);
      return res.status(500).json({ 
        error: 'Semantic search unavailable', 
        message: 'Failed to generate query embedding. Try text search instead.' 
      });
    }

    if (!queryEmbedding) {
      return res.status(500).json({ 
        error: 'Semantic search unavailable', 
        message: 'Failed to generate query embedding. Try text search instead.' 
      });
    }

    let queryText = `
      SELECT 
        dc.id, dc.content, dc.chunk_index, dc.page_number, dc.section_title,
        d.id as document_id, d.original_filename, d.filename,
        cosine_similarity(dc.embedding, $1::jsonb) as similarity
      FROM document_chunks dc
      JOIN documents d ON dc.document_id = d.id
      WHERE dc.embedding IS NOT NULL
        AND d.status = 'completed'
        AND cosine_similarity(dc.embedding, $1::jsonb) > $2
    `;

    const params = [JSON.stringify(queryEmbedding), threshold];
    let paramIndex = 3;

    // Filter by specific documents if provided
    if (documents.length > 0) {
      queryText += ` AND d.id = ANY($${paramIndex++}::uuid[])`;
      params.push(documents);
    }

    queryText += ` ORDER BY similarity DESC LIMIT $${paramIndex}`;
    params.push(limit);

    const result = await query(queryText, params);
    const executionTime = Date.now() - startTime;

    // Log search query for analytics
    try {
      await query(
        'INSERT INTO search_queries (query, search_type, results_count, execution_time) VALUES ($1, $2, $3, $4)',
        [searchQuery, 'semantic', result.rows.length, executionTime]
      );
    } catch (logError) {
      logger.warn('Failed to log search query:', logError.message);
    }

    logger.info(`Semantic search completed`, {
      query: searchQuery,
      results: result.rows.length,
      executionTime,
      threshold
    });

    res.json({
      results: result.rows.map(row => ({
        ...row,
        similarity: parseFloat(row.similarity)
      })),
      query: searchQuery,
      totalResults: result.rows.length,
      executionTime,
      threshold
    });
  } catch (error) {
    // Check if error is related to missing cosine_similarity function
    if (error.message.includes('cosine_similarity') || error.message.includes('function does not exist')) {
      logger.warn('Cosine similarity function not available, falling back to text search');
      
      // Fallback to text search
      req.body.query = searchQuery;
      req.body.limit = limit;
      req.body.documents = documents;
      
      return router.handle({ method: 'POST', url: '/text' }, req, res, next);
    }
    next(error);
  }
});

// Hybrid search (combining text and semantic search) - FIXED
router.post('/hybrid', validateSearch, async (req, res, next) => {
  try {
    const { query: searchQuery, limit = 10, documents = [], threshold = 0.5 } = req.body;
    const startTime = Date.now();

    // Perform both text and semantic searches in parallel
    const [textResults, semanticResults] = await Promise.allSettled([
      // Text search
      (async () => {
        let textQuery = `
          SELECT 
            dc.id, dc.content, dc.chunk_index, dc.page_number, dc.section_title,
            d.id as document_id, d.original_filename, d.filename,
            ts_rank(to_tsvector('english', dc.content), plainto_tsquery('english', $1)) as text_score,
            'text' as search_type
          FROM document_chunks dc
          JOIN documents d ON dc.document_id = d.id
          WHERE to_tsvector('english', dc.content) @@ plainto_tsquery('english', $1)
            AND d.status = 'completed'
        `;

        const textParams = [searchQuery];
        let textParamIndex = 2;

        if (documents.length > 0) {
          textQuery += ` AND d.id = ANY($${textParamIndex++}::uuid[])`;
          textParams.push(documents);
        }

        textQuery += ` ORDER BY text_score DESC LIMIT $${textParamIndex}`;
        textParams.push(Math.ceil(limit / 2));

        return await query(textQuery, textParams);
      })(),

      // Semantic search (with error handling)
      (async () => {
        try {
          const queryEmbedding = await ollamaService.generateEmbedding(searchQuery);
          
          if (!queryEmbedding) {
            throw new Error('Failed to generate query embedding');
          }

          let semanticQuery = `
            SELECT 
              dc.id, dc.content, dc.chunk_index, dc.page_number, dc.section_title,
              d.id as document_id, d.original_filename, d.filename,
              cosine_similarity(dc.embedding, $1::jsonb) as semantic_score,
              'semantic' as search_type
            FROM document_chunks dc
            JOIN documents d ON dc.document_id = d.id
            WHERE dc.embedding IS NOT NULL
              AND d.status = 'completed'
              AND cosine_similarity(dc.embedding, $1::jsonb) > $2
          `;

          const semanticParams = [JSON.stringify(queryEmbedding), threshold];
          let semanticParamIndex = 3;

          if (documents.length > 0) {
            semanticQuery += ` AND d.id = ANY($${semanticParamIndex++}::uuid[])`;
            semanticParams.push(documents);
          }

          semanticQuery += ` ORDER BY semantic_score DESC LIMIT $${semanticParamIndex}`;
          semanticParams.push(Math.ceil(limit / 2));

          return await query(semanticQuery, semanticParams);
        } catch (error) {
          logger.warn('Semantic search failed in hybrid search:', error.message);
          throw error;
        }
      })()
    ]);

    const executionTime = Date.now() - startTime;

    // Combine and deduplicate results
    const combinedResults = [];
    const seenIds = new Set();

    // Add text search results
    if (textResults.status === 'fulfilled') {
      textResults.value.rows.forEach(row => {
        if (!seenIds.has(row.id)) {
          combinedResults.push({
            ...row,
            score: row.text_score || 0,
            search_type: 'text'
          });
          seenIds.add(row.id);
        }
      });
    }

    // Add semantic search results
    if (semanticResults.status === 'fulfilled') {
      semanticResults.value.rows.forEach(row => {
        if (!seenIds.has(row.id)) {
          combinedResults.push({
            ...row,
            score: row.semantic_score || 0,
            search_type: 'semantic'
          });
          seenIds.add(row.id);
        } else {
          // If already exists from text search, mark as hybrid
          const existingIndex = combinedResults.findIndex(r => r.id === row.id);
          if (existingIndex !== -1) {
            combinedResults[existingIndex].search_type = 'hybrid';
            combinedResults[existingIndex].score = Math.max(
              combinedResults[existingIndex].score,
              row.semantic_score || 0
            );
          }
        }
      });
    }

    // Sort by score and limit results
    combinedResults.sort((a, b) => b.score - a.score);
    const finalResults = combinedResults.slice(0, limit);

    // Log search query for analytics
    try {
      await query(
        'INSERT INTO search_queries (query, search_type, results_count, execution_time) VALUES ($1, $2, $3, $4)',
        [searchQuery, 'hybrid', finalResults.length, executionTime]
      );
    } catch (logError) {
      logger.warn('Failed to log search query:', logError.message);
    }

    logger.info(`Hybrid search completed`, {
      query: searchQuery,
      textResults: textResults.status === 'fulfilled' ? textResults.value.rows.length : 0,
      semanticResults: semanticResults.status === 'fulfilled' ? semanticResults.value.rows.length : 0,
      finalResults: finalResults.length,
      executionTime
    });

    res.json({
      results: finalResults,
      query: searchQuery,
      totalResults: finalResults.length,
      executionTime,
      searchTypes: {
        text: textResults.status === 'fulfilled',
        semantic: semanticResults.status === 'fulfilled'
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;