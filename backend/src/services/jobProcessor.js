// src/services/ollamaService.js - Integrated with your project structure
import logger from '../utils/logger.js';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'llama3.2';
const REQUEST_TIMEOUT = parseInt(process.env.OLLAMA_TIMEOUT) || 60000;

export const setupJobProcessors = {
  /**
   * Check if Ollama is available
   */
  async isAvailable() {
    try {
      logger.debug(`Checking Ollama availability at ${OLLAMA_BASE_URL}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(`${OLLAMA_BASE_URL}/api/version`, {
        method: 'GET',
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      const isAvailable = response.ok;
      logger.info(`Ollama availability: ${isAvailable ? '✅ Available' : '❌ Unavailable'}`);
      
      if (isAvailable) {
        const versionData = await response.json();
        logger.debug('Ollama version:', versionData);
      }
      
      return isAvailable;
    } catch (error) {
      if (error.name === 'AbortError') {
        logger.error('Ollama availability check timed out');
      } else {
        logger.error('Ollama availability check failed:', error.message);
      }
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
      logger.debug(`Generating embedding for text length: ${text.length} with model: ${model}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);
      
      const response = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          model: model, 
          prompt: text.substring(0, 2000) // Limit text length to prevent timeout
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama embeddings API error (${response.status}): ${errorText}`);
      }

      const data = await response.json();
      
      if (!data.embedding || !Array.isArray(data.embedding)) {
        throw new Error('Invalid embedding response from Ollama');
      }
      
      logger.debug(`Embedding generated successfully, dimensions: ${data.embedding.length}`);
      return data.embedding;
    } catch (error) {
      logger.error('Error generating embedding:', error.message);
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
      logger.info(`Generating response with model: ${model}`);
      
      // Build the full prompt
      const fullPrompt = this.buildPrompt(prompt, context, chatHistory);
      logger.debug(`Full prompt length: ${fullPrompt.length} characters`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const requestBody = { 
        model, 
        prompt: fullPrompt, 
        stream: false,
        options: {
          temperature: parseFloat(process.env.OLLAMA_TEMPERATURE) || 0.7,
          top_p: parseFloat(process.env.OLLAMA_TOP_P) || 0.9,
          num_predict: parseInt(process.env.OLLAMA_MAX_TOKENS) || 2000,
          stop: ['Human:', 'User:', '\n\nHuman:', '\n\nUser:']
        }
      };

      logger.debug('Ollama request options:', requestBody.options);

      const response = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error(`Ollama generate API error (${response.status}): ${errorText}`);
        
        // Handle specific error cases
        if (response.status === 404) {
          throw new Error(`Model '${model}' not found. Available models can be checked with 'ollama list'`);
        } else if (response.status === 400) {
          throw new Error('Invalid request format or parameters');
        } else {
          throw new Error(`Ollama API error (${response.status}): ${errorText}`);
        }
      }

      const data = await response.json();
      
      if (!data.response || typeof data.response !== 'string') {
        logger.warn('Empty or invalid response from Ollama:', data);
        throw new Error('Invalid response format from AI service');
      }

      const responseText = data.response.trim();
      logger.info(`AI response generated successfully (${responseText.length} characters)`);
      
      return { 
        message: { 
          content: responseText || 'I apologize, but I couldn\'t generate a response. Please try again.' 
        } 
      };
    } catch (error) {
      if (error.name === 'AbortError') {
        logger.error(`AI response generation timed out after ${REQUEST_TIMEOUT}ms`);
        throw new Error('Request timed out. Please try again with a shorter message.');
      }
      
      logger.error('Error generating AI response:', error.message);
      throw error; // Re-throw to preserve original error details
    }
  },

  /**
   * Build prompt with context and chat history
   * @param {string} userMessage - The user's message
   * @param {string} documentContext - Document context if available
   * @param {Array} chatHistory - Previous conversation messages
   * @returns {string} - Formatted prompt
   */
  buildPrompt(userMessage, documentContext, chatHistory) {
    let prompt = 'You are a helpful AI assistant specialized in document analysis and general knowledge. ';
    
    // Add document context if available
    if (documentContext && documentContext.trim()) {
      prompt += `Use the following document context to help answer questions, but also use your general knowledge when appropriate.\n\n`;
      prompt += `DOCUMENT CONTEXT:\n${documentContext.trim()}\n\n`;
      prompt += `Instructions:\n`;
      prompt += `- Answer based on the context above when relevant\n`;
      prompt += `- If the context doesn't contain relevant information, use your general knowledge\n`;
      prompt += `- Always be helpful, accurate, and informative\n`;
      prompt += `- Cite the context when you use information from it\n\n`;
    }
    
    // Add recent chat history for continuity (last 5 messages to avoid token limits)
    if (chatHistory && chatHistory.length > 0) {
      prompt += 'Recent conversation for context:\n';
      const recentHistory = chatHistory.slice(-5);
      recentHistory.forEach((msg, index) => {
        if (msg.role === 'user') {
          prompt += `Human: ${msg.content}\n`;
        } else if (msg.role === 'assistant') {
          prompt += `Assistant: ${msg.content}\n`;
        }
      });
      prompt += '\n';
    }
    
    // Add the current user message
    prompt += `Human: ${userMessage}\n`;
    prompt += `Assistant: `;
    
    return prompt;
  },

  /**
   * Get available models from Ollama
   * @returns {Promise<Array>} - List of available models
   */
  async getAvailableModels() {
    try {
      logger.info('Fetching available models from Ollama...');
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      
      const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`, {
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch models (${response.status}): ${response.statusText}`);
      }
      
      const data = await response.json();
      const models = data.models || [];
      
      logger.info(`Found ${models.length} available models:`, models.map(m => m.name));
      return models;
    } catch (error) {
      if (error.name === 'AbortError') {
        logger.error('Fetching models timed out');
      } else {
        logger.error('Error fetching available models:', error.message);
      }
      return [];
    }
  },

  /**
   * Pull a model if it doesn't exist
   * @param {string} modelName - Name of the model to pull
   * @returns {Promise<boolean>} - Success status
   */
  async pullModel(modelName) {
    try {
      logger.info(`Attempting to pull model: ${modelName}`);
      
      const response = await fetch(`${OLLAMA_BASE_URL}/api/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName })
      });

      if (!response.ok) {
        throw new Error(`Failed to pull model (${response.status})`);
      }

      logger.info(`Model ${modelName} pulled successfully`);
      return true;
    } catch (error) {
      logger.error(`Error pulling model ${modelName}:`, error.message);
      return false;
    }
  },

  /**
   * Check if a specific model is available
   * @param {string} modelName - Name of the model to check
   * @returns {Promise<boolean>} - Whether the model is available
   */
  async isModelAvailable(modelName) {
    try {
      const models = await this.getAvailableModels();
      return models.some(model => model.name === modelName);
    } catch (error) {
      logger.error(`Error checking model availability for ${modelName}:`, error.message);
      return false;
    }
  }
};