import { createClient } from 'redis';
import logger from '../utils/logger.js';

let redisClient;

export async function initRedis() {
  try {
    redisClient = createClient({
      url: process.env.REDIS_URL || 'redis://localhost:6379'
    });

    redisClient.on('error', (error) => {
      logger.error('Redis Client Error:', error);
    });

    redisClient.on('connect', () => {
      logger.info('Connected to Redis');
    });

    await redisClient.connect();
  } catch (error) {
    logger.error('Failed to connect to Redis:', error);
    throw error;
  }
}

export function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis not initialized. Call initRedis() first.');
  }
  return redisClient;
}

export async function addToQueue(queueName, job) {
  try {
    await redisClient.lPush(queueName, JSON.stringify(job));
    logger.info(`Added job to queue ${queueName}:`, job);
  } catch (error) {
    logger.error('Failed to add job to queue:', error);
    throw error;
  }
}

export async function getFromQueue(queueName) {
  try {
    const job = await redisClient.brPop(queueName, 1);
    if (job) {
      return JSON.parse(job.element);
    }
    return null;
  } catch (error) {
    logger.error('Failed to get job from queue:', error);
    throw error;
  }
}