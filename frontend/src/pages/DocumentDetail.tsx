import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, 
  FileText, 
  Download, 
  Search,
  MessageSquare,
  Database,
  Clock,
  CheckCircle,
  AlertCircle,
  XCircle,
  Eye,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { documentService } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

interface Document {
  id: string;
  filename: string;
  original_filename: string;
  file_size: number;
  mime_type: string;
  content_type: string;
  upload_date: string;
  processed_date?: string;
  status: string;
  metadata: any;
  chunk_count: number;
  chunks?: any[];
}

interface Chunk {
  id: string;
  chunk_index: number;
  content: string;
  content_length: number;
  page_number?: number;
  section_title?: string;
  metadata: any;
}

interface ChunksPagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export default function DocumentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [document, setDocument] = useState<Document | null>(null);
  const [chunks, setChunks] = useState<Chunk[]>([]);
  const [chunksPagination, setChunksPagination] = useState<ChunksPagination>({
    page: 1,
    limit: 10,
    total: 0,
    pages: 0
  });
  const [loading, setLoading] = useState(true);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [selectedChunk, setSelectedChunk] = useState<Chunk | null>(null);

  useEffect(() => {
    if (id) {
      loadDocument();
    }
  }, [id]);

  useEffect(() => {
    if (id && document) {
      loadChunks();
    }
  }, [id, document, chunksPagination.page]);

  const loadDocument = async () => {
    if (!id) return;
    
    try {
      setLoading(true);
      const response = await documentService.get(id);
      setDocument(response.data);
    } catch (error: any) {
      console.error('Failed to load document:', error);
      toast.error('Failed to load document');
      if (error.response?.status === 404) {
        navigate('/documents');
      }
    } finally {
      setLoading(false);
    }
  };

  const loadChunks = async () => {
    if (!id) return;
    
    try {
      setChunksLoading(true);
      const response = await documentService.getChunks(id, {
        page: chunksPagination.page,
        limit: chunksPagination.limit
      });
      setChunks(response.data.chunks);
      setChunksPagination(response.data.pagination);
    } catch (error) {
      console.error('Failed to load chunks:', error);
      toast.error('Failed to load document chunks');
    } finally {
      setChunksLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getStatusBadge = (status: string) => {
    const baseClasses = 'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium';
    
    switch (status) {
      case 'completed':
        return (
          <span className={`${baseClasses} bg-green-100 text-green-800`}>
            <CheckCircle className="w-4 h-4 mr-1" />
            Completed
          </span>
        );
      case 'processing':
        return (
          <span className={`${baseClasses} bg-yellow-100 text-yellow-800`}>
            <Clock className="w-4 h-4 mr-1" />
            Processing
          </span>
        );
      case 'pending':
        return (
          <span className={`${baseClasses} bg-gray-100 text-gray-800`}>
            <Clock className="w-4 h-4 mr-1" />
            Pending
          </span>
        );
      case 'failed':
        return (
          <span className={`${baseClasses} bg-red-100 text-red-800`}>
            <XCircle className="w-4 h-4 mr-1" />
            Failed
          </span>
        );
      default:
        return (
          <span className={`${baseClasses} bg-gray-100 text-gray-800`}>
            {status}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="large" />
      </div>
    );
  }

  if (!document) {
    return (
      <div className="text-center py-12">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">Document not found</h3>
        <p className="mt-1 text-sm text-gray-500">
          The document you're looking for doesn't exist or has been deleted.
        </p>
        <div className="mt-6">
          <Link
            to="/documents"
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Documents
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Link
            to="/documents"
            className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="mr-1 h-4 w-4" />
            Back to Documents
          </Link>
        </div>
        
        <div className="flex items-center space-x-3">
          <Link
            to={`/search?documents=${document.id}`}
            className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <Search className="mr-2 h-4 w-4" />
            Search This Document
          </Link>
          
          <Link
            to={`/chat?document=${document.id}`}
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
          >
            <MessageSquare className="mr-2 h-4 w-4" />
            Chat About This
          </Link>
        </div>
      </div>

      {/* Document Info */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="h-8 w-8 text-gray-400" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {document.original_filename}
                </h1>
                <p className="text-sm text-gray-500">
                  {document.content_type.toUpperCase()} • {formatFileSize(document.file_size)}
                </p>
              </div>
            </div>
            {getStatusBadge(document.status)}
          </div>
        </div>

        <div className="px-6 py-4">
          <dl className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-gray-500">Upload Date</dt>
              <dd className="mt-1 text-sm text-gray-900">
                {new Date(document.upload_date).toLocaleString()}
              </dd>
            </div>
            
            {document.processed_date && (
              <div>
                <dt className="text-sm font-medium text-gray-500">Processed Date</dt>
                <dd className="mt-1 text-sm text-gray-900">
                  {new Date(document.processed_date).toLocaleString()}
                </dd>
              </div>
            )}
            
            <div>
              <dt className="text-sm font-medium text-gray-500">File Type</dt>
              <dd className="mt-1 text-sm text-gray-900">{document.mime_type}</dd>
            </div>
            
            <div>
              <dt className="text-sm font-medium text-gray-500">Content Chunks</dt>
              <dd className="mt-1 text-sm text-gray-900">
                <div className="flex items-center">
                  <Database className="h-4 w-4 text-gray-400 mr-1" />
                  {document.chunk_count || 0} chunks
                </div>
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Document Chunks */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">Document Chunks</h2>
          <p className="text-sm text-gray-500">
            Processed content chunks for search and AI analysis
          </p>
        </div>

        {chunksLoading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="large" />
          </div>
        ) : chunks.length === 0 ? (
          <div className="text-center py-12">
            <Database className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No chunks available</h3>
            <p className="mt-1 text-sm text-gray-500">
              {document.status === 'completed' 
                ? 'This document has not been processed into chunks yet.'
                : `Document is currently ${document.status}. Chunks will be available after processing.`
              }
            </p>
          </div>
        ) : (
          <>
            {/* Chunks List */}
            <div className="divide-y divide-gray-200">
              {chunks.map((chunk) => (
                <div key={chunk.id} className="p-6 hover:bg-gray-50 transition-colors duration-200">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center mb-2">
                        <span className="text-sm font-medium text-gray-900">
                          Chunk {chunk.chunk_index + 1}
                        </span>
                        {chunk.page_number && (
                          <span className="ml-2 text-xs text-gray-500">
                            Page {chunk.page_number}
                          </span>
                        )}
                        {chunk.section_title && (
                          <span className="ml-2 text-xs text-gray-500">
                            • {chunk.section_title}
                          </span>
                        )}
                        <span className="ml-2 text-xs text-gray-400">
                          {chunk.content_length} chars
                        </span>
                      </div>
                      
                      <div className="text-sm text-gray-700 leading-relaxed">
                        {chunk.content.length > 300 ? (
                          <>
                            {chunk.content.substring(0, 300)}
                            <button
                              onClick={() => setSelectedChunk(chunk)}
                              className="text-blue-600 hover:text-blue-800 ml-1"
                            >
                              ... Read more
                            </button>
                          </>
                        ) : (
                          chunk.content
                        )}
                      </div>
                    </div>
                    
                    <button
                      onClick={() => setSelectedChunk(chunk)}
                      className="ml-4 text-gray-400 hover:text-gray-600"
                    >
                      <Eye className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {chunksPagination.pages > 1 && (
              <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
                <div className="text-sm text-gray-700">
                  Showing {((chunksPagination.page - 1) * chunksPagination.limit) + 1} to{' '}
                  {Math.min(chunksPagination.page * chunksPagination.limit, chunksPagination.total)} of{' '}
                  {chunksPagination.total} chunks
                </div>
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setChunksPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                    disabled={chunksPagination.page === 1}
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    Previous
                  </button>
                  <span className="text-sm text-gray-700">
                    Page {chunksPagination.page} of {chunksPagination.pages}
                  </span>
                  <button
                    onClick={() => setChunksPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                    disabled={chunksPagination.page === chunksPagination.pages}
                    className="flex items-center px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                    <ChevronRight className="h-4 w-4 ml-1" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Chunk Detail Modal */}
      {selectedChunk && (
        <div className="fixed inset-0 z-50 overflow-y-auto" onClick={() => setSelectedChunk(null)}>
          <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" />
            
            <div 
              className="inline-block w-full max-w-4xl p-6 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900">
                  Chunk {selectedChunk.chunk_index + 1}
                  {selectedChunk.section_title && ` - ${selectedChunk.section_title}`}
                </h3>
                <button
                  onClick={() => setSelectedChunk(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="h-6 w-6" />
                </button>
              </div>
              
              <div className="mb-4 text-sm text-gray-500">
                {selectedChunk.page_number && (
                  <span className="mr-4">Page {selectedChunk.page_number}</span>
                )}
                <span>{selectedChunk.content_length} characters</span>
              </div>
              
              <div className="max-h-96 overflow-y-auto bg-gray-50 rounded-lg p-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-700 font-mono">
                  {selectedChunk.content}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}