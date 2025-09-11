# Document Knowledge Mining Solution

A comprehensive document knowledge mining system built with React, Node.js, PostgreSQL, and Ollama AI. This solution allows you to upload, process, search, and chat with your document collection using advanced AI capabilities.

## Features

### Core Functionality
- **Document Upload & Processing**: Support for PDF, DOCX, and TXT files with intelligent chunking
- **AI-Powered Search**: Text-based, semantic, and hybrid search capabilities
- **Intelligent Chat**: Context-aware conversations with your document collection
- **Vector Embeddings**: Semantic search using Ollama-generated embeddings
- **Real-time Processing**: Async document processing with job queues
- **Admin Dashboard**: System monitoring and management tools

### Technical Features
- **Microservices Architecture**: Containerized services with Docker
- **Scalable Database**: PostgreSQL with vector search capabilities
- **Modern UI**: React with Tailwind CSS and responsive design
- **API-First Design**: RESTful APIs with comprehensive error handling
- **Production Ready**: Health checks, logging, and monitoring

## Architecture

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Frontend  │    │   Backend   │    │  Database   │
│   (React)   │◄──►│  (Node.js)  │◄──►│(PostgreSQL) │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       │                   ▼                   │
       │            ┌─────────────┐            │
       │            │   Ollama    │            │
       │            │    (AI)     │            │
       │            └─────────────┘            │
       │                   │                   │
       ▼                   ▼                   ▼
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Storage   │    │    Redis    │    │  File Sys   │
│ (Documents) │    │ (Queues)    │    │ (Uploads)   │
└─────────────┘    └─────────────┘    └─────────────┘
```

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- Git

### 1. Clone the Repository

```bash
git clone <repository-url>
cd document-knowledge-mining-solution
```

### 2. Environment Setup

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL=postgresql://dkm_user:dkm_password@localhost:5432/document_knowledge_mining

# Redis
REDIS_URL=redis://localhost:6379

# Ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# Backend
NODE_ENV=development
PORT=3001
JWT_SECRET=your-jwt-secret-change-in-production
STORAGE_PATH=/app/uploads
LOG_LEVEL=info

# Frontend
VITE_API_BASE_URL=http://localhost:3001/api
```

### 3. Start with Docker Compose

```bash
# Build and start all services
docker-compose up -d

# Check service status
docker-compose ps

# View logs
docker-compose logs -f
```

### 4. Initialize Ollama Models

After the services are running, pull the required Ollama models:

```bash
# Access the Ollama container
docker exec -it dkm-ollama bash

# Pull the base model (this may take several minutes)
ollama pull llama2

# Pull the embedding model
ollama pull nomic-embed-text

# Exit the container
exit
```

### 5. Access the Application

- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:3001
- **API Documentation**: http://localhost:3001 (JSON endpoints list)

## Development Setup

For local development without Docker:

### Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Create uploads directory
mkdir uploads logs

# Start PostgreSQL and Redis
docker-compose up postgres redis ollama -d

# Start the backend in development mode
npm run dev
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Start the frontend development server
npm run dev
```

### Database Setup

The database schema is automatically initialized when the PostgreSQL container starts. The initialization script creates:

- Documents table with metadata
- Document chunks with vector embeddings
- Chat sessions and messages
- Search analytics
- Processing job tracking

## Usage Guide

### 1. Upload Documents

1. Navigate to the Documents page
2. Drag and drop files or click to select
3. Supported formats: PDF, DOCX, TXT
4. Maximum file size: 50MB
5. Documents are automatically processed and chunked

### 2. Search Documents

#### Text Search
- Traditional keyword-based search
- Fast and accurate for exact matches
- Good for finding specific terms or phrases

#### Semantic Search
- AI-powered understanding of context and meaning
- Find relevant content even without exact keyword matches
- Adjustable similarity threshold

#### Hybrid Search
- Combines both text and semantic search
- Best of both approaches
- Recommended for most use cases

### 3. Chat with Documents

1. Create a new chat session
2. Ask questions about your documents
3. The AI will search for relevant context
4. Responses are generated based on document content
5. View related document chunks for each response

### 4. Document Management

- View document processing status
- Browse document chunks
- Delete documents and associated data
- Monitor processing jobs

## API Documentation

### Documents

```bash
# Upload document
POST /api/documents/upload
Content-Type: multipart/form-data

# List documents
GET /api/documents?page=1&limit=10&status=completed

# Get document details
GET /api/documents/:id

# Get document chunks
GET /api/documents/:id/chunks

# Delete document
DELETE /api/documents/:id
```

### Search

```bash
# Text search
POST /api/search/text
{
  "query": "search term",
  "limit": 10,
  "documents": ["doc-id-1", "doc-id-2"]
}

# Semantic search
POST /api/search/semantic
{
  "query": "search meaning",
  "limit": 10,
  "threshold": 0.7
}

# Hybrid search
POST /api/search/hybrid
{
  "query": "combined search",
  "limit": 10
}
```

### Chat

```bash
# Create session
POST /api/chat/sessions
{
  "title": "New Chat",
  "user_id": "user123"
}

# Send message
POST /api/chat/sessions/:sessionId/messages
{
  "message": "What is this document about?",
  "use_documents": true,
  "document_ids": []
}

# Get messages
GET /api/chat/sessions/:sessionId/messages
```

## Configuration

### Backend Configuration

Key environment variables:

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `OLLAMA_BASE_URL`: Ollama service URL
- `STORAGE_PATH`: File upload directory
- `JWT_SECRET`: JWT signing secret

### Frontend Configuration

- `VITE_API_BASE_URL`: Backend API URL

### Ollama Configuration

Supported models:
- `llama2`: Main chat/completion model
- `nomic-embed-text`: Embedding generation model
- Custom models can be configured via `OLLAMA_MODEL` environment variable

## Deployment

### Production Deployment

1. **Environment Variables**: Update `.env` with production values
2. **SSL/TLS**: Configure HTTPS in production
3. **Database**: Use managed PostgreSQL service
4. **Storage**: Consider S3-compatible storage for file uploads
5. **Monitoring**: Set up logging and monitoring
6. **Scaling**: Use Kubernetes for container orchestration

### Kubernetes Deployment

```yaml
# Example Kubernetes deployment
apiVersion: apps/v1
kind: Deployment
metadata:
  name: dkm-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: dkm-backend
  template:
    metadata:
      labels:
        app: dkm-backend
    spec:
      containers:
      - name: backend
        image: dkm-backend:latest
        ports:
        - containerPort: 3001
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: dkm-secrets
              key: database-url
```

### Docker Production Build

```bash
# Build production images
docker-compose -f docker-compose.yml -f docker-compose.prod.yml build

# Start production services
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Monitoring

### Health Checks

- **Backend**: `GET /health`
- **Database**: Connection pooling with health checks
- **Redis**: Ping/pong health monitoring
- **Ollama**: Model availability checks

### Logging

- **Backend**: Winston logger with file and console outputs
- **Frontend**: React error boundaries
- **Nginx**: Access and error logs
- **Docker**: Container logs via `docker-compose logs`

### Metrics

Available through the admin API:
- Document processing statistics
- Search query analytics
- Chat session metrics
- System performance data

## Troubleshooting

### Common Issues

1. **Ollama Model Loading**
   ```bash
   # Check if models are available
   docker exec dkm-ollama ollama list
   
   # Pull missing models
   docker exec dkm-ollama ollama pull llama2
   ```

2. **Database Connection Issues**
   ```bash
   # Check database logs
   docker-compose logs postgres
   
   # Test connection
   docker exec dkm-postgres psql -U dkm_user -d document_knowledge_mining -c "SELECT 1"
   ```

3. **File Upload Issues**
   ```bash
   # Check upload directory permissions
   ls -la backend/uploads
   
   # Fix permissions
   chmod 755 backend/uploads
   ```

4. **Memory Issues**
   - Increase Docker memory limits
   - Monitor container resource usage
   - Consider using smaller Ollama models

### Debug Mode

Enable debug logging:

```env
LOG_LEVEL=debug
NODE_ENV=development
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

### Development Guidelines

- Follow TypeScript best practices
- Use meaningful commit messages
- Update documentation for new features
- Ensure all tests pass
- Follow the existing code style

## License

This project is licensed under the MIT License. See the LICENSE file for details.

## Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the troubleshooting guide

---

**Document Knowledge Mining Solution** - Transform your documents into an intelligent, searchable knowledge base.