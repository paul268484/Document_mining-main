import axios from 'axios';
import logger from '../utils/logger.js';

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || 'llama2';

class OllamaService {
  constructor() {
    this.baseURL = OLLAMA_BASE_URL;
    this.model = DEFAULT_MODEL;
  }

  async isHealthy() {
    try {
      const response = await axios.get(`${this.baseURL}/api/tags`);
      return response.status === 200;
    } catch (error) {
      logger.error('Ollama health check failed:', error.message);
      return false;
    }
  }

  async pullModel(model = this.model) {
    try {
      logger.info(`Pulling Ollama model: ${model}`);
      const response = await axios.post(`${this.baseURL}/api/pull`, {
        name: model
      });
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to pull model ${model}:`, error.message);
      throw error;
    }
  }

  async generateEmbedding(text, model = 'nomic-embed-text') {
    try {
      const response = await axios.post(`${this.baseURL}/api/embeddings`, {
        model: model,
        prompt: text
      });
      
      return response.data.embedding;
    } catch (error) {
      logger.error('Failed to generate embedding:', error.message);
      throw error;
    }
  }

  async generateResponse(prompt, context = '', model = this.model) {
    try {
      const fullPrompt = context ? 
        `Context: ${context}\n\nQuestion: ${prompt}\n\nAnswer:` : 
        prompt;

      const response = await axios.post(`${this.baseURL}/api/generate`, {
        model: model,
        prompt: fullPrompt,
        stream: false,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          max_tokens: 500
        }
      });

      return response.data.response;
    } catch (error) {
      logger.error('Failed to generate response:', error.message);
      throw error;
    }
  }

  async summarizeText(text, model = this.model) {
    try {
      const prompt = `Please provide a concise summary of the following text:\n\n${text}\n\nSummary:`;
      
      const response = await axios.post(`${this.baseURL}/api/generate`, {
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.3,
          max_tokens: 200
        }
      });

      return response.data.response;
    } catch (error) {
      logger.error('Failed to summarize text:', error.message);
      throw error;
    }
  }

  async extractKeywords(text, model = this.model) {
    try {
      const prompt = `Extract the most important keywords and key phrases from this text. Return them as a comma-separated list:\n\n${text}\n\nKeywords:`;
      
      const response = await axios.post(`${this.baseURL}/api/generate`, {
        model: model,
        prompt: prompt,
        stream: false,
        options: {
          temperature: 0.1,
          max_tokens: 100
        }
      });

      const keywords = response.data.response
        .split(',')
        .map(keyword => keyword.trim())
        .filter(keyword => keyword.length > 0);

      return keywords;
    } catch (error) {
      logger.error('Failed to extract keywords:', error.message);
      throw error;
    }
  }
}

export default new OllamaService();