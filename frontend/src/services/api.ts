import axios from 'axios';
import toast from 'react-hot-toast';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001/api';

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
api.interceptors.request.use(
  (config) => {
    // Add auth token if available
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    // Handle common errors
    if (error.response) {
      const { status, data } = error.response;
      
      switch (status) {
        case 401:
          localStorage.removeItem('auth_token');
          toast.error('Authentication required');
          break;
        case 403:
          toast.error('Access forbidden');
          break;
        case 404:
          toast.error('Resource not found');
          break;
        case 429:
          toast.error('Too many requests. Please try again later.');
          break;
        case 500:
          toast.error('Server error. Please try again later.');
          break;
        default:
          if (data?.error) {
            toast.error(data.error);
          } else {
            toast.error(`Request failed with status ${status}`);
          }
      }
    } else if (error.request) {
      toast.error('Network error. Please check your connection.');
    } else {
      toast.error('Request failed');
    }
    
    return Promise.reject(error);
  }
);

// API service functions
export const documentService = {
  // Upload document
  upload: (file: File) => {
    const formData = new FormData();
    formData.append('document', file);
    return api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  // Get documents list
  list: (params?: {
    page?: number;
    limit?: number;
    status?: string;
    search?: string;
  }) => {
    return api.get('/documents', { params });
  },

  // Get single document
  get: (id: string) => {
    return api.get(`/documents/${id}`);
  },

  // Delete document
  delete: (id: string) => {
    return api.delete(`/documents/${id}`);
  },

  // Get document chunks
  getChunks: (id: string, params?: { page?: number; limit?: number }) => {
    return api.get(`/documents/${id}/chunks`, { params });
  },
};

export const searchService = {
  // Text search
  textSearch: (query: string, options?: {
    limit?: number;
    documents?: string[];
  }) => {
    return api.post('/search/text', { query, ...options });
  },

  // Semantic search
  semanticSearch: (query: string, options?: {
    limit?: number;
    documents?: string[];
    threshold?: number;
  }) => {
    return api.post('/search/semantic', { query, ...options });
  },

  // Hybrid search
  hybridSearch: (query: string, options?: {
    limit?: number;
    documents?: string[];
    threshold?: number;
  }) => {
    return api.post('/search/hybrid', { query, ...options });
  },
};

export const chatService = {
  // Get chat sessions
  getSessions: (userId?: string) => {
    return api.get('/chat/sessions', { params: { user_id: userId } });
  },

  // Create session
  createSession: (title?: string, userId?: string) => {
    return api.post('/chat/sessions', { title, user_id: userId });
  },

  // Get session messages
  getMessages: (sessionId: string, params?: {
    limit?: number;
    offset?: number;
  }) => {
    return api.get(`/chat/sessions/${sessionId}/messages`, { params });
  },

  // Send message
  sendMessage: (sessionId: string, message: string, options?: {
    use_documents?: boolean;
    document_ids?: string[];
  }) => {
    return api.post(`/chat/sessions/${sessionId}/messages`, {
      message,
      ...options,
    });
  },

  // Delete session
  deleteSession: (sessionId: string) => {
    return api.delete(`/chat/sessions/${sessionId}`);
  },

  // Update session title
  updateSession: (sessionId: string, title: string) => {
    return api.patch(`/chat/sessions/${sessionId}`, { title });
  },
};

export const adminService = {
  // Get system health
  getHealth: () => {
    return api.get('/admin/health');
  },

  // Get system stats
  getStats: () => {
    return api.get('/admin/stats');
  },

  // Get queue status
  getQueue: () => {
    return api.get('/admin/queue');
  },

  // Clear failed jobs
  clearFailedJobs: () => {
    return api.post('/admin/queue/clear-failed');
  },

  // Retry failed jobs
  retryFailedJobs: () => {
    return api.post('/admin/queue/retry-failed');
  },

  // Database maintenance
  vacuum: () => {
    return api.post('/admin/maintenance/vacuum');
  },
};