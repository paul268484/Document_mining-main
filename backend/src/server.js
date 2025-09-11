import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDatabase, closePool, getConnectionStatus } from '../src/config/database.js';
import { initRedis, getRedisClient } from '../src/config/redis.js';
import { setupRoutes } from '../src/routes/index.js';
import { setupJobProcessors } from '../src/services/jobProcessor.js';
import { errorHandler } from '../src/middleware/errorHandler.js';
import { requestLogger } from '../src/middleware/requestLogger.js';
import logger from '../src/utils/logger.js';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from '../src/config/swagger.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

/* ------------------- SECURITY ------------------- */
app.use(helmet());

/* ------------------- CORS ------------------- */
const corsOptions = {
  origin: [
    'http://localhost:3000',    // React dev server
    'http://localhost:5173',    // Vite dev server
    'http://localhost:5174',    
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://localhost:4173',    // Vite preview
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma'
  ],
  exposedHeaders: ['set-cookie'],
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

/* ------------------- BODY PARSING ------------------- */
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/* ------------------- LOGGING ------------------- */
app.use(requestLogger);

/* ------------------- STATIC FILES ------------------- */
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

/* ------------------- SWAGGER DOCS ------------------- */
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

/* ------------------- HEALTH CHECK ------------------- */
app.get('/health', (req, res) => {
  const dbStatus = getConnectionStatus();
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'dkm-backend',
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    database: dbStatus
  });
});

/* ------------------- ROOT ENDPOINT ------------------- */
app.get('/', (req, res) => {
  res.json({
    message: 'Document Knowledge Mining API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      apiDocs: '/api-docs',
      documents: '/api/documents',
      search: '/api/search',
      chat: '/api/chat',
      admin: '/api/admin'
    }
  });
});

/* ------------------- API ROUTES ------------------- */
setupRoutes(app);

// 404 handler for unknown API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

/* ------------------- GLOBAL ERROR HANDLER ------------------- */
app.use(errorHandler);

/* ------------------- GRACEFUL SHUTDOWN ------------------- */
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);

  try {
    await closePool();
    logger.info('✅ Database connections closed');
  } catch (err) {
    logger.error('❌ Error closing database:', err);
  }

  try {
    const redis = getRedisClient();
    if (redis) {
      await redis.quit();
      logger.info('✅ Redis connections closed');
    }
  } catch (err) {
    logger.error('❌ Error closing Redis:', err);
  }

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

/* ------------------- START SERVER ------------------- */
async function startServer() {
  try {
    logger.info('🚀 Starting Document Knowledge Mining Server...');

    // Connect database
    const dbConnected = await connectDatabase();
    if (dbConnected) {
      logger.info('✅ Database: Connected');
    } else {
      logger.warn('⚠️ Database: Connection failed, running in offline mode');
    }

    // Initialize Redis
    try {
      await initRedis();
      logger.info('✅ Redis: Connected');
    } catch (err) {
      logger.warn('⚠️ Redis: Connection failed, queue disabled');
    }

    // Setup job processors
    try {
      await setupJobProcessors();
      logger.info('✅ Job processors initialized');
    } catch (err) {
      logger.warn('⚠️ Job processors failed:', err.message);
    }

    // Start server
    const server = app.listen(PORT, () => {
      logger.info(`🚀 Server running on port ${PORT}`);
      logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
      logger.info(`📚 API Docs: http://localhost:${PORT}/api-docs`);
      logger.info(`💓 Health Check: http://localhost:${PORT}/health`);
      logger.info(`🔒 CORS Origins: ${corsOptions.origin.join(', ')}`);
    });

    // Handle port errors
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`❌ Port ${PORT} is already in use`);
      } else {
        logger.error('❌ Server error:', err);
      }
      process.exit(1);
    });

    return server;
  } catch (err) {
    logger.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

startServer();

export { app };
