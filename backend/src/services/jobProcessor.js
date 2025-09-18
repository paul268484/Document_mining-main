import { getRedisClient } from '../config/redis.js';
import { query } from '../config/database.js';
import logger from '../utils/logger.js';

const MAX_RETRIES = 3;
let isProcessing = false;

async function processDocument(documentId, filePath, mimeType) {
    try {
        logger.info(`Processing document ${documentId} (${mimeType})`);

        await query('UPDATE documents SET last_updated = NOW() WHERE id = $1', [documentId]);

        // Short processing simulation to keep startup responsive
        await new Promise((resolve) => setTimeout(resolve, 500));

        const chunkCount = Math.floor(Math.random() * 10) + 1;
        await query('UPDATE documents SET chunk_count = $1, last_updated = NOW() WHERE id = $2', [chunkCount, documentId]);

        return true;
    } catch (err) {
        logger.error('processDocument error:', err);
        throw err;
    }
}

async function startJobProcessor() {
    if (isProcessing) {
        logger.warn('Job processor already running');
        return;
    }

    let redisClient = null;
    try {
        isProcessing = true;
        redisClient = await getRedisClient();
        logger.info('Starting document job processor...');

        while (isProcessing) {
            try {
                const result = await redisClient.brPop('document_processing', 1);
                if (!result) continue;

                const job = JSON.parse(result.element);
                logger.info(`Processing document job: ${job.documentId}`);

                try {
                    await query('UPDATE documents SET status = $1, last_updated = NOW() WHERE id = $2', ['processing', job.documentId]);
                    await processDocument(job.documentId, job.filePath, job.mimeType);
                    await query('UPDATE documents SET status = $1, last_updated = NOW() WHERE id = $2', ['completed', job.documentId]);
                    logger.info(`Document processed: ${job.documentId}`);
                } catch (err) {
                    logger.error(`Document processing failed for ${job.documentId}:`, err.message || err);
                    try {
                        await query('UPDATE documents SET status = $1, error_message = $2, last_updated = NOW() WHERE id = $3', ['failed', err.message || 'processing error', job.documentId]);
                    } catch (uErr) {
                        logger.warn('Failed to write error_message to documents table:', uErr.message || uErr);
                        await query('UPDATE documents SET status = $1, last_updated = NOW() WHERE id = $2', ['failed', job.documentId]);
                    }

                    const retryCount = (job.retryCount || 0) + 1;
                    if (retryCount <= MAX_RETRIES) {
                        const retryJob = { ...job, retryCount, timestamp: new Date().toISOString() };
                        await redisClient.lPush('document_processing', JSON.stringify(retryJob));
                        logger.info(`Requeued ${job.documentId} (attempt ${retryCount}/${MAX_RETRIES})`);
                    } else {
                        logger.warn(`${job.documentId} exceeded max retries`);
                    }
                }
            } catch (err) {
                // Fatal Redis error => stop processor and let server handle restart
                if (err && (err.code === 'ECONNREFUSED' || (err.message && err.message.includes('not initialized')))) {
                    logger.error('Redis connection lost, stopping job processor:', err.message || err);
                    isProcessing = false;
                    throw err;
                }
                logger.error('Job processor loop error:', err.message || err);
                await new Promise((r) => setTimeout(r, 5000));
            }
        }
    } catch (err) {
        logger.error('startJobProcessor error:', err.message || err);
        throw err;
    } finally {
        isProcessing = false;
        if (redisClient) {
            try {
                await redisClient.quit();
                logger.info('Redis connection closed by job processor');
            } catch (err) {
                logger.warn('Error closing Redis client in job processor:', err.message || err);
            }
        }
    }
}

export { startJobProcessor };