// config/ollama.js - Fixed and improved version
import fetch from 'node-fetch';
import logger from '../utils/logger.js';

class OllamaService {
  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://44.213.24.224:8080';
    this.apiKey = process.env.OLLAMA_API_KEY || 'sk-3f41558a25a44e5086a3a30809ab2a8c';
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
    this.chatModel = process.env.CHAT_MODEL || 'llama2';
    
    // Configuration
    this.timeout = parseInt(process.env.OLLAMA_TIMEOUT) || 60000; // 60 seconds
    this.maxRetries = parseInt(process.env.OLLAMA_MAX_RETRIES) || 3;
    this.retryDelay = parseInt(process.env.OLLAMA_RETRY_DELAY) || 2000; // 2 seconds
    
    logger.info('🔧 OllamaService initialized', {
      baseUrl: this.baseUrl,
      embeddingModel: this.embeddingModel,
      chatModel: this.chatModel,
      timeout: this.timeout
    });
  }

  async generateEmbedding(text) {
    if (!text || typeof text !== 'string') {
      throw new Error('Invalid input: text must be a non-empty string');
    }

    // Trim and validate text length
    const cleanText = text.trim();
    if (cleanText.length === 0) {
      throw new Error('Invalid input: text cannot be empty');
    }

    // Limit text length to avoid API issues
    const maxLength = 8000;
    const truncatedText = cleanText.length > maxLength 
      ? cleanText.substring(0, maxLength) + '...' 
      : cleanText;

    let lastError;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        logger.info(`🔄 Generating embedding (attempt ${attempt}/${this.maxRetries})`, {
          textLength: truncatedText.length,
          model: this.embeddingModel
        });

        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
          controller.abort();
          logger.warn('⏰ Request timeout - aborting');
        }, this.timeout);

        // Try the correct Ollama embeddings endpoint
        const response = await fetch(`${this.baseUrl}/api/embeddings`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
          },
          body: JSON.stringify({
            model: this.embeddingModel,
            prompt: truncatedText
          }),
          signal: controller.signal
        });

        clearTimeout(timeoutId);

        logger.info(`📡 HTTP Response: ${response.status} ${response.statusText}`);

        if (!response.ok) {
          const errorText = await response.text();
          logger.error('❌ HTTP Error Response:', {
            status: response.status,
            statusText: response.statusText,
            body: errorText
          });
          
          // If it's a 404, try alternative endpoint
          if (response.status === 404) {
            return await this.tryAlternativeEmbeddingEndpoint(truncatedText, attempt);
          }
          
          throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
        }

        // Check content type
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) {
          const textResponse = await response.text();
          logger.error('❌ Non-JSON response received:', {
            contentType,
            body: textResponse.substring(0, 500)
          });
          throw new Error(`Expected JSON response, got ${contentType}: ${textResponse.substring(0, 200)}`);
        }

        const result = await response.json();
        
        // Handle different response formats
        let embedding;
        if (result.embedding && Array.isArray(result.embedding)) {
          embedding = result.embedding;
        } else if (result.data && result.data[0] && result.data[0].embedding) {
          embedding = result.data[0].embedding;
        } else if (result.embeddings && Array.isArray(result.embeddings[0])) {
          embedding = result.embeddings[0];
        } else {
          logger.error('❌ Unexpected response format:', result);
          throw new Error('Unexpected response format from embeddings API');
        }

        if (!Array.isArray(embedding) || embedding.length === 0) {
          throw new Error('Invalid embedding: not an array or empty');
        }

        logger.info(`✅ Successfully generated embedding`, {
          dimensions: embedding.length,
          attempt,
          model: this.embeddingModel
        });

        return embedding;

      } catch (error) {
        lastError = error;
        
        if (error.name === 'AbortError') {
          logger.error('❌ Request timeout:', { attempt, timeout: this.timeout });
        } else {
          logger.error(`❌ Embedding generation attempt ${attempt} failed:`, {
            error: error.message,
            stack: error.stack,
            model: this.embeddingModel
          });
        }

        // Don't retry on certain errors
        if (error.message.includes('Invalid input') || 
            error.message.includes('Unauthorized') ||
            error.message.includes('403')) {
          throw error;
        }

        if (attempt < this.maxRetries) {
          const delay = this.retryDelay * Math.pow(2, attempt - 1); // Exponential backoff
          logger.info(`⏳ Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    logger.error(`❌ All ${this.maxRetries} embedding attempts failed for text: "${truncatedText.substring(0, 100)}..."`);
    throw new Error(`Embedding generation failed after ${this.maxRetries} attempts: ${lastError.message}`);
  }

  async tryAlternativeEmbeddingEndpoint(text, attempt) {
    try {
      logger.info(`🔄 Trying alternative embedding endpoint (attempt ${attempt})`);
      
      // Try with /embed endpoint (some Ollama setups use this)
      const response = await fetch(`${this.baseUrl}/api/embed`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
        },
        body: JSON.stringify({
          model: this.embeddingModel,
          input: text
        }),
        timeout: this.timeout
      });

      if (!response.ok) {
        throw new Error(`Alternative endpoint failed: ${response.status}`);
      }

      const result = await response.json();
      
      if (result.embedding && Array.isArray(result.embedding)) {
        logger.info('✅ Alternative endpoint succeeded');
        return result.embedding;
      }
      
      throw new Error('Alternative endpoint returned invalid format');
      
    } catch (error) {
      logger.error('❌ Alternative endpoint also failed:', error.message);
      throw error;
    }
  }

  async generateResponse(message, context = '') {
    if (!message || typeof message !== 'string') {
      throw new Error('Invalid input: message must be a non-empty string');
    }

    try {
      logger.info('🤖 Generating response', {
        messageLength: message.length,
        hasContext: !!context,
        model: this.chatModel
      });

      const systemPrompt = context 
        ? `You are a helpful assistant. Use the following context to answer questions accurately and concisely:\n\n${context}\n\nBased on the context above, please answer the following question:`
        : 'You are a helpful assistant. Please answer the following question accurately and concisely:';

      const fullPrompt = `${systemPrompt}\n\nHuman: ${message}\n\nAssistant:`;

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      // Use the correct Ollama generate endpoint
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          ...(this.apiKey && { 'Authorization': `Bearer ${this.apiKey}` })
        },
        body: JSON.stringify({
          model: this.chatModel,
          prompt: fullPrompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 1000,
            stop: ['Human:', 'Assistant:']
          }
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        logger.error('❌ Chat response error:', {
          status: response.status,
          body: errorText
        });
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
      }

      const result = await response.json();
      const responseText = result.response || result.content || result.text || 'No response generated';

      logger.info('✅ Response generated successfully', {
        responseLength: responseText.length
      });

      return responseText.trim();

    } catch (error) {
      logger.error('❌ Failed to generate response:', error);
      
      if (error.name === 'AbortError') {
        throw new Error('Response generation timed out');
      }
      
      throw new Error(`Response generation failed: ${error.message}`);
    }
  }

  async generateEmbeddings(texts) {
    if (!Array.isArray(texts)) {
      throw new Error('Invalid input: texts must be an array');
    }

    logger.info(`🔄 Generating embeddings for ${texts.length} texts`);
    
    const embeddings = [];
    const errors = [];

    for (let i = 0; i < texts.length; i++) {
      try {
        const embedding = await this.generateEmbedding(texts[i]);
        embeddings.push(embedding);
        
        // Add small delay between requests to avoid overwhelming the server
        if (i < texts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
      } catch (error) {
        logger.error(`Failed to generate embedding for text ${i + 1}:`, {
          textPreview: texts[i].substring(0, 100),
          error: error.message
        });
        embeddings.push(null);
        errors.push({ index: i, error: error.message });
      }
    }

    logger.info(`📊 Batch embedding results:`, {
      total: texts.length,
      successful: embeddings.filter(e => e !== null).length,
      failed: errors.length
    });

    return { embeddings, errors };
  }

  async testConnection() {
    try {
      logger.info('🔍 Testing Ollama connection...');
      
      // Test basic connectivity
      const healthResponse = await fetch(`${this.baseUrl}/api/version`, {
        timeout: 5000
      });
      
      if (!healthResponse.ok) {
        throw new Error(`Health check failed: ${healthResponse.status}`);
      }

      const versionInfo = await healthResponse.json();
      logger.info('✅ Ollama server is reachable', versionInfo);

      // Test embeddings
      let embeddingTest = null;
      try {
        embeddingTest = await this.generateEmbedding('test connection');
        logger.info('✅ Embedding generation works', { dimensions: embeddingTest.length });
      } catch (error) {
        logger.error('❌ Embedding test failed:', error.message);
      }

      // Test chat
      let chatTest = null;
      try {
        chatTest = await this.generateResponse('Say hello');
        logger.info('✅ Chat generation works', { responseLength: chatTest.length });
      } catch (error) {
        logger.error('❌ Chat test failed:', error.message);
      }

      return {
        server: true,
        version: versionInfo,
        embeddings: !!embeddingTest,
        chat: !!chatTest,
        embeddingDimensions: embeddingTest ? embeddingTest.length : 0,
        errors: []
      };

    } catch (error) {
      logger.error('❌ Connection test failed:', error);
      return {
        server: false,
        embeddings: false,
        chat: false,
        error: error.message
      };
    }
  }

  // Health check method for monitoring
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/api/version`, {
        timeout: 5000
      });
      return response.ok;
    } catch (error) {
      logger.error('Health check failed:', error);
      return false;
    }
  }

  // Get available models
  async getAvailableModels() {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status}`);
      }
      
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      logger.error('Failed to get available models:', error);
      return [];
    }
  }
}

const ollamaService = new OllamaService();
export default ollamaService;