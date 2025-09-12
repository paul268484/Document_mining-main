import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  MessageSquare,
  Send,
  Plus,
  Settings,
  FileText,
  Bot,
  User,
  Loader2
} from 'lucide-react';
import { documentService } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

// Environment configuration
const getEnvVar = (key: string, fallback: string = ''): string => {
  return import.meta.env[key] || fallback;
};

// Backend Chat API service
const chatApiService = {
  async getSessions() {
    try {
      const response = await fetch('/api/chat/sessions', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      return Array.isArray(data) ? data : []; // Defensive
    } catch (error) {
      console.error('Failed to fetch sessions:', error);
      const sessions = localStorage.getItem('chat_sessions');
      return sessions ? JSON.parse(sessions) : [];
    }
  },

  async createSession(title = 'New Chat') {
    try {
      const response = await fetch('/api/chat/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to create session:', error);
      return localChatService.createSession(title);
    }
  },

  async getMessages(sessionId: string) {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('Failed to fetch messages:', error);
      return localChatService.getMessages(sessionId);
    }
  },

  async saveMessage(sessionId: string, payload: { message: string, use_documents: boolean, document_ids: string[] }) {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to save message:', error);
    }
  },

  async updateSession(sessionId: string, updates: any) {
    try {
      const response = await fetch(`/api/chat/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Failed to update session:', error);
      throw error;
    }
  }
};

// Ollama Cloud API service
const ollamaService = {
  getApiUrl() {
    return getEnvVar('VITE_CLOUD_API_URL', 'http://44.213.24.224:8080/ollama/api/generate');
  },

  getApiKey() {
    return getEnvVar('VITE_CLOUD_API_KEY', 'sk-c0d1431a856a4192be18a355dab88eb3');
  },

  isDebugMode() {
    return !!import.meta.env.DEV;
  },

  getHeaders() {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const apiKey = this.getApiKey();
    if (apiKey) {
      headers['Authorization'] = `Bearer ${apiKey}`;
      headers['X-API-Key'] = apiKey;
      headers['api-key'] = apiKey;
    }
    return headers;
  },

  async generateWithContext(prompt: string, context: string, model = getEnvVar('VITE_CLOUD_MODEL', 'gpt-oss:20b')) {
    const systemPrompt = context
      ? `You are a helpful assistant. Use the following context to answer questions:\n\n${context}\n\nBased on the context above, please answer the following question:`
      : 'You are a helpful assistant. Please answer the following question:';

    const fullPrompt = `${systemPrompt}\n\nHuman: ${prompt}\n\nAssistant:`;

    if (this.isDebugMode()) {
      console.log('API Request Details:', {
        url: this.getApiUrl(),
        model,
        apiKeyPresent: !!this.getApiKey(),
        hasContext: !!context
      });
    }
    console.log('Full Prompt:', fullPrompt);
    const response = await fetch(this.getApiUrl(), {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        model,
        prompt: fullPrompt,
        stream: false,
        options: { temperature: 0.7, top_p: 0.9 }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (response.status === 401) throw new Error(`Authentication failed (401). Check your API key.`);
      throw new Error(`Ollama Cloud API error (${response.status}): ${response.statusText}\n${errorText}`);
    }

    const data = await response.json();
    return { message: { content: data.response || data.content || 'No response content' } };
  }
};

// Local storage fallback
const localChatService = {
  getSessions() {
    const sessions = localStorage.getItem('chat_sessions');
    return sessions ? JSON.parse(sessions) : [];
  },

  saveSession(session: any) {
    const sessions = this.getSessions();
    const existingIndex = sessions.findIndex((s: any) => s.id === session.id);
    if (existingIndex >= 0) sessions[existingIndex] = session;
    else sessions.unshift(session);
    localStorage.setItem('chat_sessions', JSON.stringify(sessions));
    return session;
  },

  createSession(title = 'New Chat') {
    const session = {
      id: Date.now().toString(),
      title,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      message_count: 0,
      messages: []
    };
    return this.saveSession(session);
  },

  getMessages(sessionId: string) {
    const sessions = this.getSessions();
    const session = sessions.find((s: any) => s.id === sessionId);
    return session ? session.messages : [];
  },

  addMessage(sessionId: string, message: any) {
    const sessions = this.getSessions();
    const sessionIndex = sessions.findIndex((s: any) => s.id === sessionId);
    if (sessionIndex >= 0) {
      sessions[sessionIndex].messages.push(message);
      sessions[sessionIndex].message_count = sessions[sessionIndex].messages.length;
      sessions[sessionIndex].updated_at = new Date().toISOString();
      sessions[sessionIndex].last_message = message.content.substring(0, 100) + '...';
      localStorage.setItem('chat_sessions', JSON.stringify(sessions));
      return message;
    }
    throw new Error('Session not found');
  }
};

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message?: string;
  messages?: ChatMessage[];
}

interface ChatMessage {
  id: string;
  session_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  metadata?: {
    context_used: boolean;
    related_documents: number;
    model_used?: string;
  };
  related_chunks?: any[];
  created_at: string;
}

interface Document {
  id: string;
  original_filename: string;
  status: string;
  content?: string;
}

export default function Chat() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [useDocuments, setUseDocuments] = useState(true);
  const [selectedModel, setSelectedModel] = useState(getEnvVar('VITE_CLOUD_MODEL', 'gpt-oss:20b'));
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const availableModels = [
    'gpt-oss:20b', 'llama2', 'llama2:7b', 'llama2:13b',
    'codellama', 'mistral', 'mixtral', 'gemma', 'qwen'
  ];

  useEffect(() => {
    loadInitialData();
    // eslint-disable-next-line
  }, []);
  useEffect(() => {
    if (sessionId && sessions.length > 0) loadSession(sessionId);
    else if (sessions.length > 0 && !sessionId) navigate(`/chat/${sessions[0].id}`, { replace: true });
    // eslint-disable-next-line
  }, [sessionId, sessions, navigate]);
  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadInitialData = async () => {
    try {
      const sessionsData = await chatApiService.getSessions();
      setSessions(Array.isArray(sessionsData) ? sessionsData.filter(s => s && s.id) : []);
      try {
        const documentsResponse = await documentService.list({ limit: 100, status: 'completed' });
        setDocuments(documentsResponse.data.documents);
      } catch (docError) {
        console.warn('Failed to load documents:', docError);
      }
      const savedModel = localStorage.getItem('selected_model');
      if (savedModel && availableModels.includes(savedModel)) setSelectedModel(savedModel);
      const savedUseDocuments = localStorage.getItem('use_documents');
      if (savedUseDocuments !== null) setUseDocuments(JSON.parse(savedUseDocuments));
      const savedSelectedDocs = localStorage.getItem('selected_documents');
      if (savedSelectedDocs) setSelectedDocuments(JSON.parse(savedSelectedDocs));
    } catch (error) {
      console.error('Failed to load initial data:', error);
      toast.error('Failed to load chat data');
    } finally { setLoading(false); }
  };

  const loadSession = async (id: string) => {
    try {
      const session = sessions.find(s => s.id === id);
      if (session) {
        setCurrentSession(session);
        const messagesData = await chatApiService.getMessages(id);
        setMessages(Array.isArray(messagesData) ? messagesData.filter(m => m && m.id) : []);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
      toast.error('Failed to load chat session');
    }
  };

  const createNewSession = async () => {
    try {
      const newSession = await chatApiService.createSession();
      setSessions(prev => [newSession, ...prev].filter(s => s && s.id));
      navigate(`/chat/${newSession.id}`);
      toast.success('New chat session created');
    } catch (error) {
      console.error('Failed to create session:', error);
      toast.error('Failed to create chat session');
    }
  };

  const getDocumentContext = async () => {
    if (!useDocuments || selectedDocuments.length === 0) return '';
    try {
      const selectedDocs = documents.filter(doc => selectedDocuments.includes(doc.id));
      return selectedDocs.map(doc =>
        `Document: ${doc.original_filename}\n[Document content would be retrieved here]`
      ).join('\n\n');
    } catch (error) {
      console.error('Failed to get document context:', error);
      return '';
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !currentSession || sending) return;
    const userMessage = inputMessage.trim();
    setInputMessage('');
    setSending(true);

    try {
      // Step 1: Save user message to backend and get response
      const userMsgRes = await chatApiService.saveMessage(currentSession.id, {
        message: userMessage,
        use_documents: useDocuments,
        document_ids: selectedDocuments
      });

      setMessages(prev => [...prev, userMsgRes]);

      // Step 2: Get document context (for Ollama, if desired).
      const context = await getDocumentContext();

      // Step 3: Get AI response from Ollama
      const ollamaResponse = await ollamaService.generateWithContext(userMessage, context, selectedModel);

      // Step 4: Save assistant reply to backend and get response
      const assistantMsgRes = await chatApiService.saveMessage(currentSession.id, {
        message: ollamaResponse.message.content,
        use_documents: useDocuments,
        document_ids: selectedDocuments
      });

      setMessages(prev => [...prev, assistantMsgRes]);

      // Step 5: Update session metadata
      try {
        await chatApiService.updateSession(currentSession.id, {
          updated_at: new Date().toISOString(),
          message_count: messages.length + 2,
          last_message: assistantMsgRes.content.substring(0, 100) + '...'
        });
        setSessions(prev => prev.map(s => s.id === currentSession.id ? {
          ...s,
          updated_at: new Date().toISOString(),
          message_count: messages.length + 2,
          last_message: assistantMsgRes.content.substring(0, 100) + '...'
        } : s));
      } catch (updateError) {
        console.warn('Failed to update session metadata:', updateError);
      }
      toast.success('Message sent successfully');
    } catch (error: any) {
      console.error('Failed to send message:', error);
      toast.error(`Failed to send message: ${error.message}`);
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const toggleDocumentFilter = (documentId: string) => {
    setSelectedDocuments(prev => {
      const newSelection = prev.includes(documentId) ? prev.filter(id => id !== documentId) : [...prev, documentId];
      localStorage.setItem('selected_documents', JSON.stringify(newSelection));
      return newSelection;
    });
  };

  const handleModelChange = (model: string) => { setSelectedModel(model); localStorage.setItem('selected_model', model); };
  const handleUseDocumentsChange = (use: boolean) => { setUseDocuments(use); localStorage.setItem('use_documents', JSON.stringify(use)); };
  const scrollToBottom = () => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); };
  const formatTime = (dateString: string) => new Date(dateString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-8rem)] flex bg-white rounded-lg shadow">
      {/* Sidebar */}
      <div className="w-80 border-r border-gray-200 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Chat Sessions</h2>
            <button
              onClick={createNewSession}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors duration-200"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="flex items-center w-full px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 rounded-lg transition-colors duration-200"
          >
            <Settings className="h-4 w-4 mr-2" />
            Chat Settings
          </button>
        </div>

        {/* Settings */}
        {showSettings && (
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded p-2">
                <div className="text-xs font-medium text-blue-800">Cloud API Configuration</div>
                <div className="text-xs text-blue-700">URL: {ollamaService.getApiUrl()}</div>
                <div className="text-xs text-blue-700">API Key: {ollamaService.getApiKey() ? `${ollamaService.getApiKey().substring(0, 12)}...` : 'Missing'}</div>
                <div className="text-xs text-blue-600 mt-1">
                  Mode: {import.meta.env.DEV ? 'development' : 'production'} | Debug: {ollamaService.isDebugMode() ? 'ON' : 'OFF'}
                </div>
                <div className="text-xs text-blue-600">
                  Backend Integration: {import.meta.env.DEV ? 'Development' : 'Production'}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Model Selection</label>
                <select value={selectedModel} onChange={(e) => handleModelChange(e.target.value)} className="w-full px-3 py-1 text-sm border border-gray-300 rounded">
                  {availableModels.map(model => (<option key={model} value={model}>{model}</option>))}
                </select>
              </div>
              <div>
                <label className="flex items-center">
                  <input type="checkbox" checked={useDocuments} onChange={(e) => handleUseDocumentsChange(e.target.checked)} className="mr-2 rounded" />
                  <span className="text-sm text-gray-700">Use document context in responses</span>
                </label>
              </div>
              {useDocuments && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">Select Documents</label>
                  <div className="max-h-32 overflow-y-auto border rounded">
                    {documents.map(doc => (
                      <label key={doc.id} className="flex items-center px-2 py-1 text-sm hover:bg-gray-50 cursor-pointer">
                        <input type="checkbox" checked={selectedDocuments.includes(doc.id)} onChange={() => toggleDocumentFilter(doc.id)} className="mr-2 rounded" />
                        <span className="truncate">{doc.original_filename}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sessions */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {Array.isArray(sessions) &&
            sessions
              .filter(session => session && session.id)
              .map(session => (
                <button
                  key={session.id}
                  onClick={() => navigate(`/chat/${session.id}`)}
                  className={`w-full p-3 text-left rounded-lg transition-colors duration-200 ${
                    currentSession?.id === session.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <div className="font-medium text-gray-900 truncate">{session.title}</div>
                  {session.last_message && (
                    <div className="text-sm text-gray-500 truncate mt-1">{session.last_message}</div>
                  )}
                </button>
              ))}
        </div>
      </div>

      {/* Main Chat */}
      <div className="flex-1 flex flex-col">
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
          {messages.filter(m => m && m.id).map(message => (
            <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`flex items-end space-x-2 max-w-[80%] ${message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''}`}>
                <div className={`p-3 rounded-lg ${
                  message.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white border border-gray-200 text-gray-900'
                }`}>
                  <div className="flex items-center space-x-2 mb-1">
                    {message.role === 'user' ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                    <span className="text-sm font-medium">
                      {message.role === 'user' ? 'You' : 'Assistant'}
                    </span>
                  </div>
                  <div className="text-sm whitespace-pre-wrap">{message.content}</div>
                </div>
                <div className={`text-xs text-gray-500 mt-1 ${
                  message.role === 'user' ? 'text-right' : 'text-left'
                }`}>
                  {formatTime(message.created_at)}
                  {message.metadata && (
                    <span className="ml-2 inline-flex items-center space-x-2">
                      {message.metadata.context_used && (
                        <>
                          <FileText className="h-3 w-3" />
                          <span>{message.metadata.related_documents} chunks</span>
                        </>
                      )}
                      {message.related_chunks && message.related_chunks.length > 0 && (
                        <span className="text-blue-600">
                          ({message.related_chunks.length} sources)
                        </span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-200 bg-white">
          <div className="flex space-x-2">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              className="flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
              rows={1}
              disabled={sending}
            />
            <button
              onClick={sendMessage}
              disabled={sending || !inputMessage.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}