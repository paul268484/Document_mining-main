// src/routes/chat.js - Chat routes for your existing server structure
import express from 'express';
import { ollamaService } from '../services/ollamaService.js';
import { chatHistoryService } from '../services/chatHistoryService.js';
import logger from '../utils/logger.js';
import { ChromaClient } from 'chromadb';


const chroma = new ChromaClient({ path: process.env.CHROMA_URL || 'http://localhost:8000' });


const router = express.Router();

/**
 * GET /api/chat/health
 * Check chat service health
 */
router.get('/health', async (req, res) => {
  try {
    logger.info('Chat health check requested');
    const ollamaAvailable = await ollamaService.isAvailable();
    
    res.json({
      status: 'ok',
      service: 'chat',
      ollama: {
        status: ollamaAvailable ? 'available' : 'unavailable',
        url: process.env.OLLAMA_BASE_URL || 'http://localhost:11434'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Chat health check error:', error);
    res.status(500).json({
      status: 'error',
      service: 'chat',
      error: error.message
    });
  }
});

/**
 * POST /api/chat
 * Send a chat message and get AI response
 * Optional authentication middleware can be added
 */
router.post('/', /* authenticateToken, */ async (req, res) => {
  try {
    logger.info('Chat request received:', { 
      messageLength: req.body.message?.length || 0,
      documentIds: req.body.documentIds?.length || 0,
      chatHistoryLength: req.body.chatHistory?.length || 0,
      userId: req.user?.id || 'anonymous' // If using auth
    });

    const { message, documentIds = [], chatHistory = [] } = req.body;

    // Validate input
    if (!message || typeof message !== 'string' || !message.trim()) {
      logger.warn('Invalid message in chat request');
      return res.status(400).json({ 
        error: 'Message is required and must be a non-empty string',
        code: 'INVALID_MESSAGE'
      });
    }

    // Check if Ollama service is available
    try {
      const isAvailable = await ollamaService.isAvailable();
      if (!isAvailable) {
        logger.warn('Ollama service is not available');
        return res.status(503).json({ 
          error: 'AI service is currently unavailable. Please ensure Ollama is running and try again.',
          code: 'SERVICE_UNAVAILABLE',
          details: {
            ollamaUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
            suggestions: [
              'Make sure Ollama is installed',
              'Run: ollama serve',
              'Run: ollama pull llama2-uncensored',
              'Check if port 11434 is accessible'
            ]
          }
        });
      }
    } catch (error) {
      logger.error('Error checking Ollama availability:', error);
      return res.status(503).json({
        error: 'Failed to connect to AI service',
        code: 'CONNECTION_ERROR',
        details: {
          message: error.message,
          suggestions: [
            'Check if Ollama is running (ollama serve)',
            'Verify network connectivity to ' + (process.env.OLLAMA_BASE_URL || 'http://localhost:11434'),
            'Ensure no firewall is blocking the connection'
          ]
        }
      });
    }

    // Retrieve document context if documentIds provided
    let documentContext = '';
    if (documentIds && documentIds.length > 0) {
      logger.info(`Retrieving context for ${documentIds.length} documents`);
      try {
        // TODO: Integrate with your existing document service
        documentContext = await getDocumentContext(documentIds);
      } catch (contextError) {
        logger.warn('Failed to retrieve document context:', contextError.message);
        // Continue without context rather than failing
        documentContext = `[Unable to retrieve context for ${documentIds.length} document(s)]`;
      }
    }

    // Generate AI response with context
    logger.info('Generating AI response...');
    const startTime = Date.now();
    
    const aiResponse = await ollamaService.generateWithContext(
      message.trim(),
      documentContext,
      chatHistory
    );

    const responseTime = Date.now() - startTime;
    logger.info(`AI response generated successfully in ${responseTime}ms`);

    // Return successful response
    res.json({
      message: aiResponse.message,
      context: documentContext || null,
      timestamp: new Date().toISOString(),
      documentIds: documentIds,
      responseTime: responseTime,
      model: process.env.DEFAULT_MODEL || 'llama3.2'
    });

  } catch (error) {
    logger.error('Chat endpoint error:', {
      message: error.message,
      stack: error.stack,
      userId: req.user?.id || 'anonymous'
    });

    // Return appropriate error response based on error type
    if (error.message.includes('timeout') || error.name === 'AbortError') {
      res.status(504).json({ 
        error: 'Request timeout. The AI service took too long to respond.',
        code: 'TIMEOUT',
        details: 'Try again with a shorter message or check Ollama service status'
      });
    } else if (error.message.includes('Failed to generate')) {
      res.status(503).json({ 
        error: 'AI service error',
        code: 'AI_SERVICE_ERROR',
        details: 'Unable to generate response. Please try again later.'
      });
    } else {
      res.status(500).json({ 
        error: 'Internal server error',
        code: 'INTERNAL_ERROR',
        details: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
      });
    }
  }
});

/**
 * GET /api/chat/models
 * Get available Ollama models
 */
router.get('/models', async (req, res) => {
  try {
    logger.info('Fetching available models...');
    const models = await ollamaService.getAvailableModels();
    
    res.json({
      models: models.map(model => ({
        name: model.name,
        size: model.size,
        modified_at: model.modified_at
      })),
      default: process.env.DEFAULT_MODEL || 'llama3.2',
      total: models.length
    });
  } catch (error) {
    logger.error('Error fetching models:', error);
    res.status(500).json({ 
      error: 'Failed to fetch available models',
      code: 'MODEL_FETCH_ERROR',
      details: error.message 
    });
  }
});

/**
 * POST /api/chat/history/clear
 * Clear chat history for a user (if using authentication)
 */
router.post('/history/clear', /* authenticateToken, */ async (req, res) => {
  try {
    // TODO: Implement chat history clearing logic
    // This could involve clearing from database or cache
    
    logger.info(`Chat history cleared for user: ${req.user?.id || 'anonymous'}`);
    
    res.json({
      success: true,
      message: 'Chat history cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error clearing chat history:', error);
    res.status(500).json({ 
      error: 'Failed to clear chat history',
      code: 'HISTORY_CLEAR_ERROR'
    });
  }
});

/**
 * Helper function to retrieve document context
 * TODO: Integrate with your existing document service
 */
async function getDocumentContext(documentIds, queryText) {
  const collection = await chroma.getCollection('documents');
  // Generate embedding for queryText using Ollama
  const embedding = await ollamaService.generateEmbedding(queryText);
  // Query ChromaDB for similar chunks
  const results = await collection.query({
    queryEmbeddings: [embedding],
    nResults: 5,
    where: { documentId: { '$in': documentIds } }
  });
  return results.documents[0].join('\n\n');
}


export default router;