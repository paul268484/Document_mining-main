import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDatabase, closePool, getConnectionStatus } from './config/database.js';
import { initRedis, getRedisClient } from './config/redis.js';
import { startJobProcessor } from './services/jobProcessor.js';
import { monitorStuckDocuments } from './services/queueMonitor.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger } from './middleware/requestLogger.js';
import logger from './utils/logger.js';
import swaggerUi from 'swagger-ui-express';
import swaggerSpec from './config/swagger.js';
import authRoutes from './routes/auth.js';
import { setupRoutes } from './routes/index.js';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Service status tracking
let serviceStatus = {
  database: false,
  redis: false,
  jobProcessor: false,
  server: false
};

/* ------------------- SECURITY ------------------- */
app.use(helmet());

/* ------------------- CORS ------------------- */
const corsOptions = {
  origin: [
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:5174',    
    'http://127.0.0.1:5173',
    'http://127.0.0.1:3000',
    'http://localhost:4173',
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

/* ------------------- ROUTES ------------------- */
setupRoutes(app);
app.use('/api/auth', authRoutes);

/* ------------------- ENHANCED HEALTH CHECK ------------------- */
app.get('/health', (req, res) => {
  const dbStatus = getConnectionStatus();
  res.json({
    status: serviceStatus.server ? 'healthy' : 'starting',
    timestamp: new Date().toISOString(),
    service: 'dkm-backend',
    port: PORT,
    env: process.env.NODE_ENV || 'development',
    services: {
      database: serviceStatus.database,
      redis: serviceStatus.redis,
      jobProcessor: serviceStatus.jobProcessor,
      server: serviceStatus.server
    },
    database: dbStatus
  });
});

/* ------------------- ROOT ENDPOINT ------------------- */
app.get('/', (req, res) => {
  res.json({
    message: 'Document Knowledge Mining API',
    version: '1.0.0',
    status: 'running',
    services: serviceStatus,
    endpoints: {
      health: '/health',
      apiDocs: '/api-docs',
      documents: '/api/documents',
      search: '/api/search',
      chat: '/api/chat',
      admin: '/api/admin',
      auth: '/api/auth'
    }
  });
});

/* ------------------- 404 HANDLER ------------------- */
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl,
    method: req.method
  });
});

/* ------------------- GLOBAL ERROR HANDLER ------------------- */
app.use(errorHandler);

/* ------------------- BACKGROUND SERVICES ------------------- */
let isServerRunning = true;

async function initializeDatabase() {
  try {
    await connectDatabase();
    serviceStatus.database = true;
    logger.info('✅ Database ready');
  } catch (error) {
    logger.error('❌ Database failed:', error.message);
    serviceStatus.database = false;
  }
}

async function initializeRedis() {
  try {
    await initRedis();
    serviceStatus.redis = true;
    logger.info('✅ Redis ready');
  } catch (error) {
    logger.error('❌ Redis failed:', error.message);
    serviceStatus.redis = false;
  }
}

async function initializeJobProcessor() {
  try {
    // Wait for database to be ready first
    let attempts = 0;
    while (!serviceStatus.database && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 1000));
      attempts++;
    }
    
    if (serviceStatus.database) {
      await startJobProcessor();
      serviceStatus.jobProcessor = true;
      logger.info('✅ Job processor ready');
    } else {
      logger.warn('⚠️ Job processor skipped - no database');
    }
  } catch (error) {
    logger.error('❌ Job processor failed:', error.message);
    serviceStatus.jobProcessor = false;
  }
}

async function startMonitoring() {
  // Wait a bit before starting monitoring
  await new Promise(resolve => setTimeout(resolve, 60000)); // 1 minute delay
  
  while (isServerRunning) {
    try {
      if (serviceStatus.database && serviceStatus.jobProcessor) {
        await monitorStuckDocuments();
      }
    } catch (error) {
      logger.error('Error in stuck document monitoring:', error);
    }
    // Wait 15 minutes before next check
    await new Promise(resolve => setTimeout(resolve, 15 * 60 * 1000));
  }
}

/* ------------------- GRACEFUL SHUTDOWN ------------------- */
async function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  isServerRunning = false;

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

/* ------------------- FAST STARTUP ------------------- */
async function startServer() {
  // Start HTTP server immediately
  const server = app.listen(PORT, () => {
    serviceStatus.server = true;
    logger.info(`🚀 Server running on port ${PORT}`);
    logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    logger.info(`📚 API Docs: http://localhost:${PORT}/api-docs`);
    logger.info(`💓 Health Check: http://localhost:${PORT}/health`);
    logger.info('⚡ Starting background services...');
  });

  // Initialize services in parallel (non-blocking)
  const servicePromises = [
    initializeDatabase(),
    initializeRedis(),
  ];

  // Start services without blocking server startup
  Promise.all(servicePromises).then(() => {
    logger.info('✅ Core services initialized');
    
    // Start job processor after core services are ready
    initializeJobProcessor().then(() => {
      logger.info('🎯 All services ready');
    });
    
    // Start monitoring in background
    startMonitoring().catch(error => {
      logger.error('Fatal error in monitoring loop:', error);
    });
  }).catch(error => {
    logger.warn('⚠️ Some services failed to initialize:', error.message);
    logger.info('🔄 Server running with limited functionality');
  });

  return server;
}

// Fast mode for development
async function fastStart() {
  logger.info('⚡ Fast startup mode enabled');
  
  // Start server immediately
  await startServer();
  
  // Everything else happens in background
  logger.info('🔥 Server started in fast mode');
}

// Normal mode for production
async function normalStart() {
  logger.info('🔄 Normal startup mode');
  
  try {
    // Initialize critical services first
    await Promise.race([
      Promise.all([initializeDatabase(), initializeRedis()]),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Startup timeout')), 10000)
      )
    ]);
    
    // Start server
    await startServer();
    
    // Initialize remaining services
    await initializeJobProcessor();
    
    logger.info('✅ Server fully initialized');
    
  } catch (error) {
    logger.warn('⚠️ Startup timeout or partial failure:', error.message);
    logger.info('🔄 Starting server with available services...');
    await startServer();
  }
}

/* ------------------- STARTUP LOGIC ------------------- */
const isFastMode = process.env.FAST_STARTUP === 'true' || 
                   process.env.NODE_ENV === 'development';

if (isFastMode) {
  fastStart().catch(error => {
    logger.error('Fast startup failed:', error);
    process.exit(1);
  });
} else {
  normalStart().catch(error => {
    logger.error('Server initialization failed:', error);
    process.exit(1);
  });
}

export { app };