import { api } from '../services/api';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  context?: string;
}

interface SendMessageParams {
  message: string;
  documentIds: string[];
  conversationId?: string;
  chatHistory: Message[];
}

export const chatService = {
  /**
   * Send a message and get response
   */
  async sendMessage({ message, documentIds, conversationId, chatHistory }: SendMessageParams) {
    const response = await api.post('/chat', {
      message,
      documentIds,
      conversationId,
      chatHistory
    });
    return response.data;
  },

  /**
   * Get conversation history
   */
  async getConversationHistory(conversationId: string) {
    const response = await api.get<Message[]>(`/chat/history/${conversationId}`);
    return response.data;
  },

  /**
   * Get user's recent conversations
   */
  async getUserConversations() {
    const response = await api.get('/chat/conversations');
    return response.data;
  },

  /**
   * Delete a conversation
   */
  async deleteConversation(conversationId: string) {
    const response = await api.delete(`/chat/conversations/${conversationId}`);
    return response.data;
  }
};