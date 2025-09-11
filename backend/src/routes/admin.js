import express from 'express';
import { query } from '../config/database.js';
import ollamaService from '../config/ollama.js';
import { getRedisClient } from '../config/redis.js';
import logger from '../utils/logger.js';

const router = express.Router();

// System health check
router.get('/health', async (req, res, next) => {
  try {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: {}
    };

    // Check database
    try {
      const dbResult = await query('SELECT NOW()');
      health.services.database = {
        status: 'healthy',
        latency: Date.now() - new Date(dbResult.rows[0].now).getTime()
      };
    } catch (error) {
      health.services.database = {
        status: 'unhealthy',
        error: error.message
      };
      health.status = 'degraded';
    }

    // Check Redis
    try {
      const redis = getRedisClient();
      const start = Date.now();
      await redis.ping();
      health.services.redis = {
        status: 'healthy',
        latency: Date.now() - start
      };
    } catch (error) {
      health.services.redis = {
        status: 'unhealthy',
        error: error.message
      };
      health.status = 'degraded';
    }

    // Check Ollama
    try {
      const ollamaHealthy = await ollamaService.isHealthy();
      health.services.ollama = {
        status: ollamaHealthy ? 'healthy' : 'unhealthy'
      };
      if (!ollamaHealthy) {
        health.status = 'degraded';
      }
    } catch (error) {
      health.services.ollama = {
        status: 'unhealthy',
        error: error.message
      };
      health.status = 'degraded';
    }

    res.json(health);
  } catch (error) {
    next(error);
  }
});

// System statistics
router.get('/stats', async (req, res, next) => {
  try {
    const stats = {};

    // Document statistics
    const docStats = await query(`
      SELECT 
        COUNT(*) as total_documents,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_documents,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_documents,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_documents,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_documents,
        SUM(file_size) as total_file_size,
        AVG(file_size) as avg_file_size
      FROM documents
    `);

    stats.documents = docStats.rows[0];

    // Chunk statistics
    const chunkStats = await query(`
      SELECT 
        COUNT(*) as total_chunks,
        AVG(content_length) as avg_chunk_length,
        COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as embedded_chunks
      FROM document_chunks
    `);

    stats.chunks = chunkStats.rows[0];

    // Chat statistics
    const chatStats = await query(`
      SELECT 
        COUNT(DISTINCT cs.id) as total_sessions,
        COUNT(cm.id) as total_messages,
        COUNT(CASE WHEN cm.role = 'user' THEN 1 END) as user_messages,
        COUNT(CASE WHEN cm.role = 'assistant' THEN 1 END) as assistant_messages
      FROM chat_sessions cs
      LEFT JOIN chat_messages cm ON cs.id = cm.session_id
    `);

    stats.chat = chatStats.rows[0];

    // Search statistics
    const searchStats = await query(`
      SELECT 
        COUNT(*) as total_queries,
        AVG(execution_time) as avg_execution_time,
        AVG(results_count) as avg_results_count
      FROM search_queries
      WHERE created_at > NOW() - INTERVAL '7 days'
    `);

    stats.search = {
      ...searchStats.rows[0],
      period: 'last_7_days'
    };

    // Processing job statistics
    const jobStats = await query(`
      SELECT 
        COUNT(*) as total_jobs,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_jobs,
        COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_jobs,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_jobs,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_jobs,
        AVG(retry_count) as avg_progress
      FROM processing_jobs
      WHERE created_at > NOW() - INTERVAL '24 hours'
    `);

    stats.jobs = {
      ...jobStats.rows[0],
      period: 'last_24_hours'
    };

    res.json(stats);
  } catch (error) {
    next(error);
  }
});

// Processing queue status
router.get('/queue', async (req, res, next) => {
  try {
    const redis = getRedisClient();
    
    const queueStats = {
      document_processing: await redis.lLen('document_processing'),
      embedding_generation: await redis.lLen('embedding_generation') || 0,
      total_active_jobs: 0
    };

    queueStats.total_active_jobs = Object.values(queueStats).reduce((sum, count) => sum + count, 0);

    // Get recent processing jobs
    const recentJobs = await query(`
      SELECT 
        id, document_id, job_type, status, progress, 
        error_message, created_at, started_at, completed_at
      FROM processing_jobs 
      ORDER BY created_at DESC 
      LIMIT 20
    `);

    res.json({
      queue: queueStats,
      recent_jobs: recentJobs.rows
    });
  } catch (error) {
    next(error);
  }
});

// Clear failed jobs
router.post('/queue/clear-failed', async (req, res, next) => {
  try {
    const result = await query(
      "DELETE FROM processing_jobs WHERE status = 'failed' AND created_at < NOW() - INTERVAL '24 hours' RETURNING COUNT(*)"
    );

    const deletedCount = result.rows[0].count || 0;
    
    logger.info(`Cleared ${deletedCount} failed jobs`);
    res.json({ message: `Cleared ${deletedCount} failed jobs` });
  } catch (error) {
    next(error);
  }
});

// Retry failed jobs
router.post('/queue/retry-failed', async (req, res, next) => {
  try {
    const result = await query(
      `UPDATE processing_jobs 
       SET status = 'pending', progress = 0, error_message = NULL, started_at = NULL 
       WHERE status = 'failed' 
       RETURNING COUNT(*)`
    );

    const retryCount = result.rows[0].count || 0;
    
    logger.info(`Retrying ${retryCount} failed jobs`);
    res.json({ message: `Retrying ${retryCount} failed jobs` });
  } catch (error) {
    next(error);
  }
});

// Database maintenance
router.post('/maintenance/vacuum', async (req, res, next) => {
  try {
    await query('VACUUM ANALYZE');
    logger.info('Database vacuum completed');
    res.json({ message: 'Database maintenance completed successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;