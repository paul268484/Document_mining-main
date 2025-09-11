import documentRoutes from './documents.js';
import searchRoutes from './search.js';
import chatRoutes from './chat.js';
import adminRoutes from './admin.js';

export function setupRoutes(app) {
  // API routes
  app.use('/api/documents', documentRoutes);
  app.use('/api/search', searchRoutes);
  app.use('/api/chat', chatRoutes);
  app.use('/api/admin', adminRoutes);

  // 404 handler for API routes
  app.use('/api/*', (req, res) => {
    res.status(404).json({ 
      error: 'API endpoint not found',
      path: req.originalUrl 
    });
  });

  // Default route
  app.get('/', (req, res) => {
    res.json({ 
      message: 'Document Knowledge Mining API',
      version: '1.0.0',
      endpoints: {
        health: '/health',
        documents: '/api/documents',
        search: '/api/search',
        chat: '/api/chat',
        admin: '/api/admin'
      }
    });
  });
}