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
import { chatService, documentService } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  message_count: number;
  last_message?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
  metadata?: {
    context_used: boolean;
    related_documents: number;
  };
  related_chunks?: string[];
}

interface Document {
  id: string;
  original_filename: string;
  status: string;
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
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (sessionId) {
      loadSession(sessionId);
    } else if (sessions.length > 0) {
      // Navigate to the most recent session
      navigate(`/chat/${sessions[0].id}`, { replace: true });
    }
  }, [sessionId, sessions, navigate]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const loadInitialData = async () => {
    try {
      const [sessionsResponse, documentsResponse] = await Promise.all([
        chatService.getSessions('anonymous'),
        documentService.list({ limit: 100, status: 'completed' })
      ]);

      setSessions(sessionsResponse.data);
      setDocuments(documentsResponse.data.documents);
    } catch (error) {
      console.error('Failed to load initial data:', error);
      toast.error('Failed to load chat data');
    } finally {
      setLoading(false);
    }
  };

  const loadSession = async (id: string) => {
    try {
      const session = sessions.find(s => s.id === id);
      if (session) {
        setCurrentSession(session);
        const messagesResponse = await chatService.getMessages(id);
        setMessages(messagesResponse.data);
      }
    } catch (error) {
      console.error('Failed to load session:', error);
      toast.error('Failed to load chat session');
    }
  };

  const createNewSession = async () => {
    try {
      const response = await chatService.createSession('New Chat', 'anonymous');
      const newSession = response.data;
      
      setSessions(prev => [newSession, ...prev]);
      navigate(`/chat/${newSession.id}`);
      toast.success('New chat session created');
    } catch (error) {
      console.error('Failed to create session:', error);
      toast.error('Failed to create chat session');
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !currentSession || sending) return;

    const userMessage = inputMessage.trim();
    setInputMessage('');
    setSending(true);

    // Add user message immediately
    const tempUserMessage: ChatMessage = {
      id: 'temp-user',
      role: 'user',
      content: userMessage,
      created_at: new Date().toISOString(),
    };
    setMessages(prev => [...prev, tempUserMessage]);

    try {
      const response = await chatService.sendMessage(currentSession.id, userMessage, {
        use_documents: useDocuments,
        document_ids: selectedDocuments,
      });

      // Remove temp message and add real messages
      setMessages(prev => [
        ...prev.filter(m => m.id !== 'temp-user'),
        {
          ...tempUserMessage,
          id: `user-${Date.now()}`,
        },
        response.data,
      ]);

      // Update session in the list
      setSessions(prev => 
        prev.map(s => 
          s.id === currentSession.id 
            ? { ...s, updated_at: new Date().toISOString(), message_count: s.message_count + 2 }
            : s
        )
      );
    } catch (error) {
      console.error('Failed to send message:', error);
      toast.error('Failed to send message');
      // Remove temp message on error
      setMessages(prev => prev.filter(m => m.id !== 'temp-user'));
    } finally {
      setSending(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const toggleDocumentFilter = (documentId: string) => {
    setSelectedDocuments(prev =>
      prev.includes(documentId)
        ? prev.filter(id => id !== documentId)
        : [...prev, documentId]
    );
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

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

        {/* Settings Panel */}
        {showSettings && (
          <div className="p-4 border-b border-gray-200 bg-gray-50">
            <div className="space-y-4">
              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={useDocuments}
                    onChange={(e) => setUseDocuments(e.target.checked)}
                    className="mr-2 rounded"
                  />
                  <span className="text-sm text-gray-700">Use document context</span>
                </label>
              </div>
              
              {useDocuments && documents.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-2">
                    Filter documents ({selectedDocuments.length} selected)
                  </label>
                  <div className="space-y-1 max-h-32 overflow-y-auto">
                    {documents.map((doc) => (
                      <label key={doc.id} className="flex items-start">
                        <input
                          type="checkbox"
                          checked={selectedDocuments.includes(doc.id)}
                          onChange={() => toggleDocumentFilter(doc.id)}
                          className="mr-2 mt-0.5 rounded"
                        />
                        <span className="text-xs text-gray-600 leading-tight">
                          {doc.original_filename}
                        </span>
                      </label>
                    ))}
                  </div>
                  {selectedDocuments.length > 0 && (
                    <button
                      onClick={() => setSelectedDocuments([])}
                      className="text-xs text-blue-600 hover:text-blue-800"
                    >
                      Clear selection
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Sessions List */}
        <div className="flex-1 overflow-y-auto">
          {sessions.length === 0 ? (
            <div className="p-4 text-center text-gray-500">
              <MessageSquare className="h-8 w-8 mx-auto mb-2 text-gray-400" />
              <p className="text-sm">No chat sessions yet</p>
            </div>
          ) : (
            <div className="space-y-1 p-2">
              {sessions.map((session) => (
                <button
                  key={session.id}
                  onClick={() => navigate(`/chat/${session.id}`)}
                  className={`w-full text-left p-3 rounded-lg transition-colors duration-200 ${
                    currentSession?.id === session.id
                      ? 'bg-blue-50 border border-blue-200'
                      : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-900 truncate">
                    {session.title}
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    {session.message_count} messages • {formatTime(session.updated_at)}
                  </div>
                  {session.last_message && (
                    <div className="text-xs text-gray-400 mt-1 truncate">
                      {session.last_message}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {currentSession ? (
          <>
            {/* Chat Header */}
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">
                {currentSession.title}
              </h3>
              <p className="text-sm text-gray-500">
                {useDocuments 
                  ? selectedDocuments.length > 0 
                    ? `Using ${selectedDocuments.length} selected documents`
                    : 'Using all documents for context'
                  : 'Document context disabled'
                }
              </p>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {messages.length === 0 ? (
                <div className="text-center text-gray-500 mt-12">
                  <Bot className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-lg font-medium">Start a conversation</p>
                  <p className="text-sm mt-2">
                    Ask questions about your documents or have a general conversation.
                  </p>
                </div>
              ) : (
                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div className={`flex max-w-xs lg:max-w-md xl:max-w-lg ${
                      message.role === 'user' ? 'flex-row-reverse' : 'flex-row'
                    }`}>
                      <div className={`flex-shrink-0 ${
                        message.role === 'user' ? 'ml-3' : 'mr-3'
                      }`}>
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          message.role === 'user' 
                            ? 'bg-blue-600' 
                            : 'bg-gray-600'
                        }`}>
                          {message.role === 'user' ? (
                            <User className="h-4 w-4 text-white" />
                          ) : (
                            <Bot className="h-4 w-4 text-white" />
                          )}
                        </div>
                      </div>
                      
                      <div>
                        <div className={`px-4 py-2 rounded-2xl ${
                          message.role === 'user'
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-900'
                        }`}>
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        </div>
                        
                        <div className={`text-xs text-gray-500 mt-1 ${
                          message.role === 'user' ? 'text-right' : 'text-left'
                        }`}>
                          {formatTime(message.created_at)}
                          {message.metadata?.context_used && (
                            <span className="ml-2 inline-flex items-center">
                              <FileText className="h-3 w-3 mr-1" />
                              {message.metadata.related_documents} docs
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
              
              {sending && (
                <div className="flex justify-start">
                  <div className="flex">
                    <div className="flex-shrink-0 mr-3">
                      <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center">
                        <Bot className="h-4 w-4 text-white" />
                      </div>
                    </div>
                    <div className="bg-gray-100 px-4 py-2 rounded-2xl">
                      <div className="flex items-center space-x-2">
                        <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
                        <span className="text-sm text-gray-500">Thinking...</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
              
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-4 border-t border-gray-200">
              <div className="flex space-x-3">
                <input
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyPress={handleKeyPress}
                  placeholder="Ask a question about your documents..."
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={sending}
                />
                <button
                  onClick={sendMessage}
                  disabled={!inputMessage.trim() || sending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
                >
                  <Send className="h-5 w-5" />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <MessageSquare className="h-16 w-16 mx-auto mb-4 text-gray-400" />
              <p className="text-xl font-medium text-gray-900 mb-2">Welcome to Chat</p>
              <p className="text-gray-500 mb-6">
                Create a new chat session to start asking questions about your documents.
              </p>
              <button
                onClick={createNewSession}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-5 w-5 mr-2" />
                New Chat
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}