import fetch from 'node-fetch';
import logger from '../utils/logger.js';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama2-uncensored';

export const ollamaService = {
  /**
   * Check if Ollama is available
   */
  async isAvailable() {
    try {
      logger.info('Checking Ollama availability at:', OLLAMA_BASE_URL);
      const response = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
        method: 'GET',
        timeout: 5000
      });
      if (!response.ok) {
        logger.error('Ollama responded with status:', response.status);
        const text = await response.text();
        logger.error('Ollama error response:', text);
      }
      logger.info('Ollama availability check result:', response.ok);
      return response.ok;
    } catch (error) {
      logger.error('Ollama availability check failed:', error.message);
      logger.error('Full error:', error);
      return false;
    }
  },

  /**
   * Generate embeddings for a text using Ollama's embedding API
   * @param {string} text - The text to generate embeddings for
   * @param {string} model - Model to use for embeddings
   * @returns {Promise<number[]>} - Embedding vector
   */
  async generateEmbedding(text, model = DEFAULT_MODEL) {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model: model, 
          prompt: text.substring(0, 2000) // Limit text length
        }),
        timeout: 30000
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama embeddings API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return data.embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  },

  /**
   * Generate AI response with optional document context
   * @param {string} prompt - User question or prompt
   * @param {string} context - Optional context text from documents
   * @param {Array} chatHistory - Previous messages for context
   * @param {string} model - Model to use
   * @returns {Promise<{ message: { content: string } }>}
   */
  async generateWithContext(prompt, context = '', chatHistory = [], model = DEFAULT_MODEL) {
    try {
      // First check if Ollama is available
      const isOllamaAvailable = await this.isAvailable();
      if (!isOllamaAvailable) {
        throw new Error('Ollama service is not available. Please make sure Ollama is running.');
      }

      let fullPrompt = this.buildPrompt(prompt, context, chatHistory);

      logger.info(`Attempting to generate response with model: ${model}`);
      
      const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model, 
          prompt: fullPrompt, 
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 1000, // Reduced max tokens for faster response
            stop: ['Human:', 'User:'],
            num_ctx: 2048 // Set context window
          }
        }),
        timeout: 120000 // 2 minute timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Ollama API error: Status ${response.status}, Response: ${errorText}`);
        
        if (response.status === 404) {
          throw new Error(`Model '${model}' not found. Please make sure it's installed.`);
        }
        throw new Error(`Ollama generate API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      return { 
        message: { 
          content: data.response || 'I apologize, but I couldn\'t generate a response. Please try again.' 
        } 
      };
    } catch (error) {
      logger.error('Error generating AI response:', error);
      throw new Error(`Failed to generate response: ${error.message}`);
    }
  },

  /**
   * Build prompt with context and chat history
   */
  buildPrompt(userMessage, documentContext, chatHistory) {
    let prompt = 'You are a helpful AI assistant. ';
    
    // Add document context if available
    if (documentContext && documentContext.trim()) {
      prompt += `Use the following document context to help answer questions, but also use your general knowledge when appropriate:\n\n`;
      prompt += `CONTEXT:\n${documentContext}\n\n`;
      prompt += `Please answer based on the context above, but if the context doesn't contain relevant information, you can use your general knowledge. Always be helpful and informative.\n\n`;
    }
    
    // Add recent chat history for continuity (last 5 messages)
    if (chatHistory && chatHistory.length > 0) {
      prompt += 'Previous conversation for context:\n';
      const recentHistory = chatHistory.slice(-5);
      recentHistory.forEach(msg => {
        if (msg.role === 'user') {
          prompt += `Human: ${msg.content}\n`;
        } else if (msg.role === 'assistant') {
          prompt += `Assistant: ${msg.content}\n`;
        }
      });
      prompt += '\n';
    }
    
    prompt += `Human: ${userMessage}\nAssistant: `;
    
    return prompt;
  },

  /**
   * Get available models from Ollama
   */
  async getAvailableModels() {
    try {
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      logger.error('Error fetching available models:', error);
      return [];
    }
  }
};