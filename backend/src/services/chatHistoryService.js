import { pool } from '../config/database.js';
import logger from '../utils/logger.js';

export const chatHistoryService = {
  /**
   * Save a chat message to the database
   */
  async saveMessage({ userId, conversationId, role, content, context }) {
    try {
      const query = `
        INSERT INTO chat_history (user_id, conversation_id, role, content, context)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *`;
      
      const values = [userId, conversationId, role, content, context];
      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      logger.error('Error saving chat message:', error);
      throw new Error('Failed to save chat message');
    }
  },

  /**
   * Get chat history for a conversation
   */
  async getConversationHistory(conversationId, limit = 50) {
    try {
      const query = `
        SELECT id, role, content, context, created_at
        FROM chat_history
        WHERE conversation_id = $1
        ORDER BY created_at ASC
        LIMIT $2`;
      
      const result = await pool.query(query, [conversationId, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching chat history:', error);
      throw new Error('Failed to fetch chat history');
    }
  },

  /**
   * Get recent conversations for a user
   */
  async getUserConversations(userId, limit = 10) {
    try {
      const query = `
        SELECT DISTINCT ON (conversation_id)
          conversation_id,
          first_value(content) OVER (PARTITION BY conversation_id ORDER BY created_at DESC) as last_message,
          max(created_at) as last_activity
        FROM chat_history
        WHERE user_id = $1
        GROUP BY conversation_id, content, created_at
        ORDER BY last_activity DESC
        LIMIT $2`;
      
      const result = await pool.query(query, [userId, limit]);
      return result.rows;
    } catch (error) {
      logger.error('Error fetching user conversations:', error);
      throw new Error('Failed to fetch user conversations');
    }
  },

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId, userId) {
    try {
      const query = `
        DELETE FROM chat_history
        WHERE conversation_id = $1 AND user_id = $2
        RETURNING *`;
      
      const result = await pool.query(query, [conversationId, userId]);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('Error deleting conversation:', error);
      throw new Error('Failed to delete conversation');
    }
  }
};