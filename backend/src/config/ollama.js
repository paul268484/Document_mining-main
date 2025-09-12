// import axios from 'axios';
// import logger from '../utils/logger.js';

// // ✅ Cloud API config from .env
// const CLOUD_API_URL = process.env.CLOUD_API_URL || 'http://44.213.24.224:8080/ollama/api/generate';
// const CLOUD_API_KEY = process.env.CLOUD_API_KEY || 'sk-c0d1431a856a4192be18a355dab88eb3';
// const DEFAULT_MODEL = process.env.CLOUD_MODEL || 'gpt-oss:20b';

// class CloudAIService {
//   constructor() {
//     this.baseURL = CLOUD_API_URL;
//     this.model = DEFAULT_MODEL;
//     this.apiKey = CLOUD_API_KEY;
//   }

//   async generateResponse(prompt, context = '', model = this.model) {
//     try {
//       const fullPrompt = context
//         ? `Context: ${context}\n\nQuestion: ${prompt}\n\nAnswer:`
//         : prompt;

//       const response = await axios.post(
//         this.baseURL,
//         {
//           model: model,
//           prompt: fullPrompt,
//           stream: false,
//           options: {
//             temperature: 0.7,
//             top_p: 0.9,
//             max_tokens: 500
//           }
//         },
//         {
//           headers: {
//             'Authorization': `Bearer ${this.apiKey}`,
//             'Content-Type': 'application/json'
//           }
//         }
//       );

//       return response.data.response;
//     } catch (error) {
//       logger.error('❌ Failed to generate response from Cloud API:', error.message);
//       throw error;
//     }
//   }

//   async summarizeText(text, model = this.model) {
//     try {
//       const prompt = `Please provide a concise summary of the following text:\n\n${text}\n\nSummary:`;

//       const response = await axios.post(
//         this.baseURL,
//         {
//           model: model,
//           prompt: prompt,
//           stream: false,
//           options: {
//             temperature: 0.3,
//             max_tokens: 200
//           }
//         },
//         {
//           headers: {
//             'Authorization': `Bearer ${this.apiKey}`,
//             'Content-Type': 'application/json'
//           }
//         }
//       );

//       return response.data.response;
//     } catch (error) {
//       logger.error('❌ Failed to summarize text via Cloud API:', error.message);
//       throw error;
//     }
//   }

//   async extractKeywords(text, model = this.model) {
//     try {
//       const prompt = `Extract the most important keywords and key phrases from this text. Return them as a comma-separated list:\n\n${text}\n\nKeywords:`;

//       const response = await axios.post(
//         this.baseURL,
//         {
//           model: model,
//           prompt: prompt,
//           stream: false,
//           options: {
//             temperature: 0.1,
//             max_tokens: 100
//           }
//         },
//         {
//           headers: {
//             'Authorization': `Bearer ${this.apiKey}`,
//             'Content-Type': 'application/json'
//           }
//         }
//       );

//       return response.data.response
//         .split(',')
//         .map(keyword => keyword.trim())
//         .filter(keyword => keyword.length > 0);
//     } catch (error) {
//       logger.error('❌ Failed to extract keywords via Cloud API:', error.message);
//       throw error;
//     }
//   }
// }

// export default new CloudAIService();

// config/ollama.js - Updated with embeddings support
import fetch from 'node-fetch';
import logger from '../utils/logger.js';

class OllamaService {
  constructor() {
    this.baseUrl = process.env.OLLAMA_BASE_URL || 'http://44.213.24.224:8080';
    this.apiKey = process.env.OLLAMA_API_KEY || 'sk-3f41558a25a44e5086a3a30809ab2a8c';
    this.embeddingModel = process.env.EMBEDDING_MODEL || 'nomic-embed-text:latest';
    this.chatModel = process.env.CHAT_MODEL || 'gpt-oss:20b';
  }

  async generateEmbedding(text) {
    try {
      const response = await fetch(`${this.baseUrl}/api/embeddings`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.embeddingModel,
          input: text
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const result = await response.json();
      
      // Handle different response formats
      if (result.data && result.data[0] && result.data[0].embedding) {
        return result.data[0].embedding;
      } else if (result.embedding) {
        return result.embedding;
      } else {
        throw new Error('Unexpected response format from embeddings API');
      }
    } catch (error) {
      logger.error('Failed to generate embedding:', error);
      throw new Error(`Embedding generation failed: ${error.message}`);
    }
  }

  async generateResponse(message, context = '') {
    try {
      const systemPrompt = context 
        ? `You are a helpful assistant. Use the following context to answer questions:\n\n${context}\n\nBased on the context above, please answer the following question:`
        : 'You are a helpful assistant. Please answer the following question:';

      const fullPrompt = `${systemPrompt}\n\nHuman: ${message}\n\nAssistant:`;

      const response = await fetch(`${this.baseUrl}/ollama/api/generate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: this.chatModel,
          prompt: fullPrompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error! status: ${response.status}, body: ${errorText}`);
      }

      const result = await response.json();
      return result.response || result.content || 'No response content';
    } catch (error) {
      logger.error('Failed to generate response:', error);
      throw new Error(`Response generation failed: ${error.message}`);
    }
  }

  async generateEmbeddings(texts) {
    const embeddings = [];
    for (const text of texts) {
      try {
        const embedding = await this.generateEmbedding(text);
        embeddings.push(embedding);
      } catch (error) {
        logger.error(`Failed to generate embedding for text: ${text.substring(0, 100)}...`, error);
        embeddings.push(null); // or skip this text
      }
    }
    return embeddings;
  }

  // Test connection to the service
  async testConnection() {
    try {
      const testEmbedding = await this.generateEmbedding('test');
      const testResponse = await this.generateResponse('Hello, are you working?');
      
      return {
        embeddings: !!testEmbedding,
        chat: !!testResponse,
        embeddingDimension: testEmbedding ? testEmbedding.length : 0
      };
    } catch (error) {
      logger.error('Connection test failed:', error);
      return {
        embeddings: false,
        chat: false,
        error: error.message
      };
    }
  }
}

const ollamaService = new OllamaService();
export default ollamaService;