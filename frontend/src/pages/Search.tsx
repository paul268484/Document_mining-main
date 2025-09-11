import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { 
  Search as SearchIcon, 
  Filter,
  FileText,
  Zap,
  Target,
  Clock
} from 'lucide-react';
import { searchService, documentService } from '../services/api';
import LoadingSpinner from '../components/LoadingSpinner';
import toast from 'react-hot-toast';

interface SearchResult {
  id: string;
  content: string;
  chunk_index: number;
  page_number?: number;
  section_title?: string;
  document_id: string;
  original_filename: string;
  filename: string;
  rank?: number;
  similarity?: number;
  distance?: number;
  search_type?: string;
  score?: number;
}

interface Document {
  id: string;
  original_filename: string;
  status: string;
}

export default function Search() {
  const [query, setQuery] = useState('');
  const [searchType, setSearchType] = useState<'text' | 'semantic' | 'hybrid'>('hybrid');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [executionTime, setExecutionTime] = useState<number | null>(null);
  const [totalResults, setTotalResults] = useState(0);

  useEffect(() => {
    loadDocuments();
  }, []);

  const loadDocuments = async () => {
    try {
      const response = await documentService.list({ limit: 100, status: 'completed' });
      setDocuments(response.data.documents);
      toast.success('Documents loaded successfully');
    } catch (error) {
      console.error('Failed to load documents:', error);
      toast.error('Failed to load documents');
    }
  };

  const performSearch = async () => {
    if (!query.trim()) {
      toast.error('Please enter a search query');
      return;
    }

    setLoading(true);
    setResults([]);
    setExecutionTime(null);

    try {
      let response;
      const searchOptions = {
        limit: 20,
        ...(selectedDocuments.length > 0 && { documents: selectedDocuments }),
      };

      switch (searchType) {
        case 'text':
          response = await searchService.textSearch(query, searchOptions);
          break;
        case 'semantic':
          response = await searchService.semanticSearch(query, {
            ...searchOptions,
            threshold: 0.6,
          });
          break;
        case 'hybrid':
          response = await searchService.hybridSearch(query, {
            ...searchOptions,
            threshold: 0.5,
          });
          break;
        default:
          throw new Error('Invalid search type');
      }

      setResults(response.data.results);
      setTotalResults(response.data.totalResults);
      setExecutionTime(response.data.executionTime);

      if (response.data.results.length === 0) {
        toast.custom(
          <div className="bg-blue-100 text-blue-800 px-4 py-2 rounded shadow">
            No results found for your query
          </div>,
          { duration: 3000 }
        );
      }
    } catch (error: any) {
      console.error('Search failed:', error);
      toast.error(error.response?.data?.error || 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      performSearch();
    }
  };

  const toggleDocumentFilter = (documentId: string) => {
    setSelectedDocuments(prev =>
      prev.includes(documentId)
        ? prev.filter(id => id !== documentId)
        : [...prev, documentId]
    );
  };

  const getSearchTypeIcon = (type: string) => {
    switch (type) {
      case 'text':
        return <FileText className="h-4 w-4 text-blue-600" />;
      case 'semantic':
        return <Zap className="h-4 w-4 text-purple-600" />;
      case 'hybrid':
        return <Target className="h-4 w-4 text-green-600" />;
      default:
        return <SearchIcon className="h-4 w-4 text-gray-600" />;
    }
  };

  const getSearchTypeColor = (type: string) => {
    switch (type) {
      case 'text':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      case 'semantic':
        return 'text-purple-600 bg-purple-50 border-purple-200';
      case 'hybrid':
        return 'text-green-600 bg-green-50 border-green-200';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text;
    
    const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 px-1 rounded">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Search</h1>
        <p className="mt-2 text-gray-600">
          Find information across your document collection using AI-powered search
        </p>
      </div>

      {/* Search interface */}
      <div className="bg-white shadow rounded-lg p-6">
        {/* Search input */}
        <div className="space-y-4">
          <div className="relative">
            <SearchIcon className="absolute left-3 top-1/2 h-5 w-5 text-gray-400 transform -translate-y-1/2" />
            <input
              type="text"
              placeholder="Ask a question or search for specific information..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
            />
          </div>

          {/* Search type selection */}
          <div className="flex flex-wrap gap-2">
            {[
              { type: 'hybrid' as const, label: 'Smart Search', description: 'Best results combining text and meaning' },
              { type: 'text' as const, label: 'Text Search', description: 'Fast keyword matching' },
              { type: 'semantic' as const, label: 'Semantic Search', description: 'AI understanding of context' },
            ].map(({ type, label }) => (
              <button
                key={type}
                onClick={() => setSearchType(type)}
                className={`flex items-center px-4 py-2 rounded-lg border text-sm transition-colors duration-200 ${
                  searchType === type
                    ? getSearchTypeColor(type)
                    : 'text-gray-600 bg-white border-gray-300 hover:bg-gray-50'
                }`}
              >
                {getSearchTypeIcon(type)}
                <span className="ml-2 font-medium">{label}</span>
              </button>
            ))}
          </div>

          {/* Document filter */}
          {documents.length > 0 && (
            <div className="border-t pt-4">
              <div className="flex items-center mb-3">
                <Filter className="h-4 w-4 text-gray-500 mr-2" />
                <span className="text-sm font-medium text-gray-700">
                  Filter by documents ({selectedDocuments.length} selected)
                </span>
                {selectedDocuments.length > 0 && (
                  <button
                    onClick={() => setSelectedDocuments([])}
                    className="ml-2 text-xs text-blue-600 hover:text-blue-800"
                  >
                    Clear all
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                {documents.map((doc) => (
                  <button
                    key={doc.id}
                    onClick={() => toggleDocumentFilter(doc.id)}
                    className={`px-3 py-1 text-sm rounded-full border transition-colors duration-200 ${
                      selectedDocuments.includes(doc.id)
                        ? 'bg-blue-100 border-blue-300 text-blue-800'
                        : 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    {doc.original_filename}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Search button */}
          <button
            onClick={performSearch}
            disabled={loading || !query.trim()}
            className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 font-medium"
          >
            {loading ? (
              <div className="flex items-center justify-center">
                <LoadingSpinner size="small" />
                <span className="ml-2">Searching...</span>
              </div>
            ) : (
              'Search Documents'
            )}
          </button>
        </div>
      </div>

      {/* Search results */}
      {(results.length > 0 || executionTime !== null) && (
        <div className="bg-white shadow rounded-lg">
          {/* Results header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                Search Results ({totalResults})
              </h2>
              {executionTime !== null && (
                <div className="flex items-center text-sm text-gray-500">
                  <Clock className="h-4 w-4 mr-1" />
                  {executionTime}ms
                </div>
              )}
            </div>
          </div>

          {/* Results list */}
          <div className="divide-y divide-gray-200">
            {results.map((result) => (
              <div key={result.id} className="p-6 hover:bg-gray-50 transition-colors duration-200">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    {/* Document info */}
                    <div className="flex items-center mb-2">
                      <Link
                        to={`/documents/${result.document_id}`}
                        className="text-sm font-medium text-blue-600 hover:text-blue-800"
                      >
                        {result.original_filename}
                      </Link>
                      {result.search_type && (
                        <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs border ${getSearchTypeColor(result.search_type)}`}>
                          {getSearchTypeIcon(result.search_type)}
                          <span className="ml-1 capitalize">{result.search_type}</span>
                        </span>
                      )}
                    </div>

                    {/* Content preview */}
                    <div className="text-gray-900 leading-relaxed mb-2">
                      {highlightText(result.content, query)}
                    </div>

                    {/* Metadata */}
                    <div className="flex items-center space-x-4 text-xs text-gray-500">
                      <span>Chunk {result.chunk_index + 1}</span>
                      {result.page_number && <span>Page {result.page_number}</span>}
                      {result.section_title && <span>{result.section_title}</span>}
                      {result.similarity && (
                        <span>Similarity: {(result.similarity * 100).toFixed(1)}%</span>
                      )}
                      {result.rank && (
                        <span>Rank: {result.rank.toFixed(3)}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {results.length === 0 && !loading && (
            <div className="text-center py-12">
              <SearchIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900">No results found</h3>
              <p className="mt-1 text-sm text-gray-500">
                Try adjusting your search query or search type.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Search tips */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">Search Tips</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>Smart Search:</strong> Combines keyword matching with AI understanding for best results</li>
          <li>• <strong>Text Search:</strong> Fast and precise for finding exact terms or phrases</li>
          <li>• <strong>Semantic Search:</strong> Understands meaning and context, great for conceptual queries</li>
          <li>• Use document filters to search within specific files</li>
          <li>• Ask questions in natural language for better semantic results</li>
        </ul>
      </div>
    </div>
  );
}
