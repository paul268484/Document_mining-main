import React, { useState, useRef, useEffect } from 'react';
import { Send, Bot, User, FileText, Loader2, AlertCircle, Trash2, Download } from 'lucide-react';
import { api } from '../services/api';
import { chatService } from '../services/chatService';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  context?: string;
}

interface ChatProps {
  selectedDocuments?: string[];
  onDocumentSelect?: (documentId: string) => void;
}

const Chat: React.FC<ChatProps> = ({ selectedDocuments = [], onDocumentSelect }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Check connection status and load conversation history
  useEffect(() => {
    checkConnection();
    if (conversationId) {
      loadConversationHistory();
    }
  }, [conversationId]);

  const loadConversationHistory = async () => {
    if (!conversationId) return;

    try {
      const history = await chatService.getConversationHistory(conversationId);
      setMessages(history);
    } catch (err) {
      console.error('Error loading chat history:', err);
      setError('Failed to load chat history');
    }
  };

  // Auto-scroll to bottom when new messages are added
  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const checkConnection = async () => {
    try {
      await api.get('/chat/health');
      setIsConnected(true);
      setError(null);
    } catch (err) {
      console.error('Connection error:', err);
      setIsConnected(false);
      setError('Unable to connect to server - check if backend is running');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputMessage.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputMessage('');
    setIsLoading(true);

    try {
      const response = await chatService.sendMessage({
        message: userMessage.content,
        documentIds: selectedDocuments,
        conversationId: conversationId || undefined,
        chatHistory: messages
      });

      if (!conversationId && response.conversationId) {
        setConversationId(response.conversationId);
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.message?.content || response.response || 'No response generated.',
        timestamp: new Date(),
        context: response.context
      };

      setMessages(prev => [...prev, assistantMessage]);
      setIsConnected(true);
    } catch (err: any) {
      console.error('Chat error:', err);
      let errorMessage = 'Failed to send message';

      if (err?.message?.includes('timeout')) {
        errorMessage = 'The response took too long. Please try again with a shorter message or fewer documents.';
      } else if (err?.response?.status === 503) {
        errorMessage = 'AI service is unavailable. Please ensure Ollama is running.';
      } else if (err instanceof Error) {
        errorMessage = err.message;
      }
      setError(errorMessage);
      setIsConnected(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setError(null);
  };

  const exportChat = () => {
    const chatData = {
      timestamp: new Date().toISOString(),
      messages: messages,
      selectedDocuments: selectedDocuments
    };

    const blob = new Blob([JSON.stringify(chatData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatTimestamp = (timestamp: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }).format(timestamp);
  };

  return (
    <div className="flex flex-col h-full bg-white border border-gray-200 rounded-lg shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center space-x-2">
          <Bot className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">AI Chat Assistant</h2>
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
        </div>

        <div className="flex items-center space-x-2">
          {selectedDocuments.length > 0 && (
            <div className="flex items-center space-x-1 px-2 py-1 bg-blue-100 rounded-md">
              <FileText className="w-4 h-4 text-blue-600" />
              <span className="text-xs text-blue-800">{selectedDocuments.length} docs</span>
            </div>
          )}

          {messages.length > 0 && (
            <>
              <button
                onClick={exportChat}
                className="p-1 text-gray-500 hover:text-gray-700 transition-colors"
                title="Export chat"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={clearChat}
                className="p-1 text-gray-500 hover:text-red-600 transition-colors"
                title="Clear chat"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center space-x-2 p-3 bg-red-50 border-b border-red-200">
          <AlertCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm text-red-700">{error}</span>
          <button
            onClick={checkConnection}
            className="ml-auto text-xs text-red-600 hover:text-red-800 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Welcome to AI Chat</h3>
            <p className="text-gray-600 max-w-md mx-auto">
              Ask me anything about your documents or general questions.
              {selectedDocuments.length > 0
                ? ` I'll use context from your ${selectedDocuments.length} selected document${selectedDocuments.length > 1 ? 's' : ''}.`
                : ' Select documents to get more specific answers.'}
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`flex items-start space-x-2 max-w-[80%] ${
                  message.role === 'user' ? 'flex-row-reverse space-x-reverse' : ''
                }`}
              >
                <div
                  className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {message.role === 'user' ? (
                    <User className="w-4 h-4" />
                  ) : (
                    <Bot className="w-4 h-4" />
                  )}
                </div>

                <div
                  className={`px-4 py-2 rounded-lg ${
                    message.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-900'
                  }`}
                >
                  <div className="whitespace-pre-wrap break-words">{message.content}</div>
                  <div
                    className={`text-xs mt-1 ${
                      message.role === 'user' ? 'text-blue-100' : 'text-gray-500'
                    }`}
                  >
                    {formatTimestamp(message.timestamp)}
                  </div>

                  {message.context && (
                    <div className="mt-2 pt-2 border-t border-gray-200">
                      <div className="text-xs text-gray-500 mb-1">Based on document context:</div>
                      <div className="text-xs text-gray-600 italic truncate">
                        {message.context.substring(0, 100)}...
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}

        {/* Loading indicator */}
        {isLoading && (
          <div className="flex justify-start">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                <Bot className="w-4 h-4 text-gray-600" />
              </div>
              <div className="bg-gray-100 rounded-lg px-4 py-2">
                <div className="flex items-center space-x-1">
                  <Loader2 className="w-4 h-4 animate-spin text-gray-600" />
                  <span className="text-gray-600">Thinking...</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-200 p-4">
        <div className="flex items-end space-x-2">
          <div className="flex-1">
            <textarea
              ref={inputRef}
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder={
                selectedDocuments.length > 0
                  ? 'Ask about your documents...'
                  : 'Ask me anything...'
              }
              className="w-full resize-none border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              rows={inputMessage.split('\n').length}
              disabled={isLoading}
            />
          </div>

          <button
            onClick={sendMessage}
            disabled={!inputMessage.trim() || isLoading}
            className="flex-shrink-0 bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </div>

        {selectedDocuments.length > 0 && (
          <div className="mt-2 text-xs text-gray-500">
            Using context from {selectedDocuments.length} document
            {selectedDocuments.length > 1 ? 's' : ''}
          </div>
        )}
      </div>
    </div>
  );
};

export default Chat;
