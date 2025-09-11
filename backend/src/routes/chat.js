import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/database.js';
import ollamaService from '../config/ollama.js';
import { validateChat } from '../middleware/validation.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Get chat sessions
router.get('/sessions', async (req, res, next) => {
  try {
    const { user_id = 'anonymous' } = req.query;
    
    const result = await query(
      `SELECT 
        cs.id, cs.title, cs.created_at, cs.updated_at,
        (SELECT COUNT(*) FROM chat_messages WHERE session_id = cs.id) as message_count,
        (SELECT content FROM chat_messages WHERE session_id = cs.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM chat_sessions cs 
      WHERE cs.user_id = $1 
      ORDER BY cs.updated_at DESC`,
      [user_id]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Create new chat session
router.post('/sessions', async (req, res, next) => {
  try {
    const { title, user_id = 'anonymous' } = req.body;
    const sessionId = uuidv4();

    const result = await query(
      'INSERT INTO chat_sessions (id, user_id, title) VALUES ($1, $2, $3) RETURNING *',
      [sessionId, user_id, title || 'New Chat']
    );

    logger.info(`New chat session created: ${sessionId}`);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Get messages for a session
router.get('/sessions/:sessionId/messages', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const result = await query(
      `SELECT 
        id, role, content, metadata, related_chunks, created_at
      FROM chat_messages 
      WHERE session_id = $1 
      ORDER BY created_at ASC 
      LIMIT $2 OFFSET $3`,
      [sessionId, limit, offset]
    );

    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Send message to chat
router.post('/sessions/:sessionId/messages', validateChat, async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { message, use_documents = true, document_ids = [] } = req.body;

    // Save user message
    const userMessageId = uuidv4();
    await query(
      'INSERT INTO chat_messages (id, session_id, role, content) VALUES ($1, $2, $3, $4)',
      [userMessageId, sessionId, 'user', message]
    );

    let context = '';
    let relatedChunks = [];

    if (use_documents) {
      // Perform semantic search to find relevant context
      try {
        const embedding = await ollamaService.generateEmbedding(message);
        
        if (embedding) {
          let contextQuery = `
            SELECT 
              dc.id, dc.content, dc.chunk_index, dc.page_number, dc.section_title,
              d.original_filename,
              (1 - (dc.embedding <=> $1::vector)) as similarity
            FROM document_chunks dc
            JOIN documents d ON dc.document_id = d.id
            WHERE dc.embedding IS NOT NULL
              AND d.status = 'completed'
              AND (1 - (dc.embedding <=> $1::vector)) > 0.6
          `;

          const contextParams = [JSON.stringify(embedding)];
          let paramIndex = 2;

          if (document_ids.length > 0) {
            contextQuery += ` AND d.id = ANY($${paramIndex++}::uuid[])`;
            contextParams.push(document_ids);
          }

          contextQuery += ` ORDER BY similarity DESC LIMIT 5`;

          const contextResult = await query(contextQuery, contextParams);
          
          if (contextResult.rows.length > 0) {
            context = contextResult.rows.map(row => 
              `[${row.original_filename} - ${row.section_title || `Chunk ${row.chunk_index}`}]\n${row.content}`
            ).join('\n\n');
            
            relatedChunks = contextResult.rows.map(row => row.id);
          }
        }
      } catch (embeddingError) {
        logger.warn('Failed to generate embedding for context search:', embeddingError);
        // Continue without context if embedding fails
      }
    }

    // Generate AI response
    const aiResponse = await ollamaService.generateResponse(message, context);

    // Save AI response
    const aiMessageId = uuidv4();
    await query(
      'INSERT INTO chat_messages (id, session_id, role, content, related_chunks, metadata) VALUES ($1, $2, $3, $4, $5, $6)',
      [
        aiMessageId, 
        sessionId, 
        'assistant', 
        aiResponse, 
        relatedChunks,
        { 
          context_used: context.length > 0,
          related_documents: relatedChunks.length
        }
      ]
    );

    // Update session timestamp
    await query(
      'UPDATE chat_sessions SET updated_at = CURRENT_TIMESTAMP WHERE id = $1',
      [sessionId]
    );

    logger.info(`Chat message processed for session: ${sessionId}`, {
      userMessage: message.substring(0, 100),
      contextLength: context.length,
      relatedChunks: relatedChunks.length
    });

    res.json({
      id: aiMessageId,
      role: 'assistant',
      content: aiResponse,
      related_chunks: relatedChunks,
      metadata: {
        context_used: context.length > 0,
        related_documents: relatedChunks.length
      },
      created_at: new Date().toISOString()
    });
  } catch (error) {
    next(error);
  }
});

// Delete chat session
router.delete('/sessions/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    
    const result = await query(
      'DELETE FROM chat_sessions WHERE id = $1 RETURNING *',
      [sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    logger.info(`Chat session deleted: ${sessionId}`);
    res.json({ message: 'Chat session deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Update chat session title
router.patch('/sessions/:sessionId', async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { title } = req.body;

    if (!title) {
      return res.status(400).json({ error: 'Title is required' });
    }

    const result = await query(
      'UPDATE chat_sessions SET title = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *',
      [title, sessionId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Chat session not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

export default router;