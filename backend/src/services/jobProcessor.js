// import cron from 'node-cron';
// import { getFromQueue } from '../config/redis.js';
// import documentProcessor from './documentProcessor.js';
// import logger from '../utils/logger.js';

// class JobProcessor {
//   constructor() {
//     this.isProcessing = false;
//     this.maxConcurrentJobs = 3;
//     this.activeJobs = new Set();
//   }

//   async start() {
//     logger.info('Starting job processor');
    
//     // Process document processing queue
//     this.processQueue('document_processing', this.handleDocumentProcessing.bind(this));
    
//     // Schedule cleanup tasks
//     this.scheduleCleanupTasks();
//   }

//   async processQueue(queueName, handler) {
//     const processNext = async () => {
//       if (this.activeJobs.size >= this.maxConcurrentJobs) {
//         setTimeout(processNext, 1000);
//         return;
//       }

//       try {
//         const job = await getFromQueue(queueName);
//         if (job) {
//           const jobId = `${queueName}_${Date.now()}_${Math.random()}`;
//           this.activeJobs.add(jobId);
          
//           logger.info(`Processing job from queue ${queueName}:`, job);
          
//           handler(job)
//             .then(() => {
//               logger.info(`Job completed: ${jobId}`);
//             })
//             .catch((error) => {
//               logger.error(`Job failed: ${jobId}`, error);
//             })
//             .finally(() => {
//               this.activeJobs.delete(jobId);
//             });
//         }
//       } catch (error) {
//         logger.error(`Error processing queue ${queueName}:`, error);
//       }

//       // Continue processing
//       setTimeout(processNext, 1000);
//     };

//     processNext();
//   }

//   async handleDocumentProcessing(job) {
//     const { documentId, filePath, mimeType } = job;
    
//     if (!documentId || !filePath || !mimeType) {
//       throw new Error('Invalid document processing job data');
//     }

//     await documentProcessor.processDocument(documentId, filePath, mimeType);
//   }

//   scheduleCleanupTasks() {
//     // Clean up old completed jobs every hour
//     cron.schedule('0 * * * *', async () => {
//       try {
//         logger.info('Running job cleanup task');
//         await this.cleanupOldJobs();
//       } catch (error) {
//         logger.error('Job cleanup failed:', error);
//       }
//     });

//     // Clean up old search queries every day at 2 AM
//     cron.schedule('0 2 * * *', async () => {
//       try {
//         logger.info('Running search query cleanup task');
//         await this.cleanupOldSearchQueries();
//       } catch (error) {
//         logger.error('Search query cleanup failed:', error);
//       }
//     });

//     // Health check every 5 minutes
//     cron.schedule('*/5 * * * *', async () => {
//       try {
//         await this.performHealthCheck();
//       } catch (error) {
//         logger.error('Health check failed:', error);
//       }
//     });
//   }

//   async cleanupOldJobs() {
//     const { query } = await import('../config/database.js');
    
//     // Delete completed jobs older than 7 days
//     const result = await query(
//       "DELETE FROM processing_jobs WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '7 days'"
//     );
    
//     if (result.rowCount > 0) {
//       logger.info(`Cleaned up ${result.rowCount} old processing jobs`);
//     }
//   }

//   async cleanupOldSearchQueries() {
//     const { query } = await import('../config/database.js');
    
//     // Delete search queries older than 30 days
//     const result = await query(
//       "DELETE FROM search_queries WHERE created_at < NOW() - INTERVAL '30 days'"
//     );
    
//     if (result.rowCount > 0) {
//       logger.info(`Cleaned up ${result.rowCount} old search queries`);
//     }
//   }

//   async performHealthCheck() {
//     try {
//       const { query } = await import('../config/database.js');
//       const { getRedisClient } = await import('../config/redis.js');
      
//       // Check database
//       await query('SELECT 1');
      
//       // Check Redis
//       const redis = getRedisClient();
//       await redis.ping();
      
//       // Log active jobs count
//       logger.debug(`Health check passed. Active jobs: ${this.activeJobs.size}`);
//     } catch (error) {
//       logger.error('Health check failed:', error);
//     }
//   }

//   getStats() {
//     return {
//       activeJobs: this.activeJobs.size,
//       maxConcurrentJobs: this.maxConcurrentJobs
//     };
//   }
// }

// const jobProcessor = new JobProcessor();

// export async function setupJobProcessors() {
//   await jobProcessor.start();
//   logger.info('Job processors initialized');
// }

// export { jobProcessor };

// src/services/jobProcessor.js
import cron from 'node-cron';
import { query } from '../config/database.js';
import { getFromQueue, getRedisClient } from '../config/redis.js';
import documentProcessor from './documentProcessor.js';
import logger from '../utils/logger.js';

class JobProcessor {
  constructor() {
    this.maxConcurrentJobs = 3;
    this.activeJobs = new Set();
  }

  async start() {
    logger.info('🚀 Starting job processor');

    // Start processing queues
    this.processQueue('document_processing', this.handleDocumentProcessing.bind(this));

    // Schedule cleanup + health checks
    this.scheduleCleanupTasks();
  }

  async processQueue(queueName, handler) {
    while (true) {
      try {
        if (this.activeJobs.size >= this.maxConcurrentJobs) {
          await this.sleep(1000);
          continue;
        }

        logger.debug(`Waiting for job from queue: ${queueName}`);
        const job = await getFromQueue(queueName);

        if (!job) {
          await this.sleep(1000);
          continue;
        }

        const jobId = `${queueName}_${Date.now()}_${Math.random()}`;
        this.activeJobs.add(jobId);

        logger.info(`Processing job: ${jobId}`, job);

        handler(job)
          .then(() => {
            logger.info(`✅ Job completed: ${jobId}`);
          })
          .catch(async (error) => {
            logger.error(`❌ Job failed: ${jobId}`, error);
          })
          .finally(() => {
            this.activeJobs.delete(jobId);
          });
      } catch (error) {
        logger.error(`Error processing queue ${queueName}:`, error);
        await this.sleep(1000);
      }
    }
  }

  async handleDocumentProcessing(job) {
    const { documentId, filePath, mimeType } = job;

    if (!documentId || !filePath || !mimeType) {
      throw new Error('Invalid document processing job data');
    }

    try {
      // Update job to "processing"
      await query(
        "UPDATE processing_jobs SET status = 'processing', started_at = NOW() WHERE document_id = $1",
        [documentId]
      );

      await documentProcessor.processDocument(documentId, filePath, mimeType);

      // Mark completed
      await query(
        "UPDATE processing_jobs SET status = 'completed', completed_at = NOW() WHERE document_id = $1",
        [documentId]
      );
    } catch (err) {
      // Mark failed
      await query(
        "UPDATE processing_jobs SET status = 'failed', error_message = $2, completed_at = NOW() WHERE document_id = $1",
        [documentId, err.message]
      );
      throw err;
    }
  }

  scheduleCleanupTasks() {
    // Clean up old completed jobs every hour
    cron.schedule('0 * * * *', async () => {
      try {
        logger.info('🧹 Running job cleanup task');
        await this.cleanupOldJobs();
      } catch (error) {
        logger.error('Job cleanup failed:', error);
      }
    });

    // Clean up old search queries every day at 2 AM
    cron.schedule('0 2 * * *', async () => {
      try {
        logger.info('🧹 Running search query cleanup task');
        await this.cleanupOldSearchQueries();
      } catch (error) {
        logger.error('Search query cleanup failed:', error);
      }
    });

    // Health check every 5 minutes
    cron.schedule('*/5 * * * *', async () => {
      try {
        await this.performHealthCheck();
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    });
  }

  async cleanupOldJobs() {
    const result = await query(
      "DELETE FROM processing_jobs WHERE status = 'completed' AND completed_at < NOW() - INTERVAL '7 days'"
    );

    if (result.rowCount > 0) {
      logger.info(`Cleaned up ${result.rowCount} old processing jobs`);
    }
  }

  async cleanupOldSearchQueries() {
    const result = await query(
      "DELETE FROM search_queries WHERE created_at < NOW() - INTERVAL '30 days'"
    );

    if (result.rowCount > 0) {
      logger.info(`Cleaned up ${result.rowCount} old search queries`);
    }
  }

  async performHealthCheck() {
    try {
      await query('SELECT 1'); // DB check
      const redis = getRedisClient();
      await redis.ping(); // Redis check
      logger.debug(`✅ Health check passed. Active jobs: ${this.activeJobs.size}`);
    } catch (error) {
      logger.error('❌ Health check failed:', error);
    }
  }

  getStats() {
    return {
      activeJobs: this.activeJobs.size,
      maxConcurrentJobs: this.maxConcurrentJobs,
    };
  }

  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

const jobProcessor = new JobProcessor();

export async function setupJobProcessors() {
  await jobProcessor.start();
  logger.info('Job processors initialized');
}

export { jobProcessor };
