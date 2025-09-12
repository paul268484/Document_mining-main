// import pkg from "pg";
// const { Pool } = pkg;
// import dotenv from "dotenv";

// dotenv.config();

// const pool = new Pool({
//   user: process.env.DB_USER || "postgres",
//   host: process.env.DB_HOST || "localhost",
//   database: process.env.DB_NAME || "document_mining",
//   password: process.env.DB_PASSWORD || "Database@123",
//   port: process.env.DB_PORT || 5432,
//   connectionTimeoutMillis: 10000,
//   idleTimeoutMillis: 30000,
//   max: 10,
//   ssl: false,
// });

// let isConnected = false;

// // Test database connection
// const testConnection = async () => {
//   try {
//     console.log("Testing PostgreSQL connection...");
//     console.log("Connection params:", {
//       host: process.env.DB_HOST || "localhost",
//       port: process.env.DB_PORT || 5432,
//       database: process.env.DB_NAME || "document_mining",
//       user: process.env.DB_USER || "postgres",
//     });

//     const client = await pool.connect();

//     // Test basic query
//     const result = await client.query(
//       "SELECT NOW() as current_time, current_database() as database_name"
//     );
//     console.log("Connected to PostgreSQL database");
//     console.log("   Current time:", result.rows[0].current_time);
//     console.log("   Database name:", result.rows[0].database_name);

//     client.release();
//     isConnected = true;
//     return true;
//   } catch (err) {
//     console.error("PostgreSQL connection failed:", err.message);
//     console.log("");
//     console.log("To fix this issue:");
//     console.log("   1. Make sure PostgreSQL is installed and running");
//     console.log("   2. Create database: CREATE DATABASE document_mining;");
//     console.log("   3. Verify connection settings in .env file");
//     console.log("   4. Check if PostgreSQL service is running");
//     console.log("");
//     console.log("The server will continue running without database functionality");
//     console.log("");
//     isConnected = false;
//     return false;
//   }
// };

// // Safe database query wrapper with detailed logging
// export const query = async (text, params = []) => {
//   if (!isConnected) {
//     throw new Error("Database not connected - call testConnection() first");
//   }

//   const client = await pool.connect();
//   try {
//     console.log(
//       "Executing query:",
//       text.substring(0, 100) + (text.length > 100 ? "..." : "")
//     );
//     const start = Date.now();
//     const result = await client.query(text, params);
//     const duration = Date.now() - start;
//     console.log("Query executed successfully in", duration + "ms");
//     return result;
//   } catch (error) {
//     console.error("Database query error:", error.message);
//     console.error("Query text:", text);
//     throw error;
//   } finally {
//     client.release();
//   }
// };

// // Execute query directly with client (for initialization)
// const executeQuery = async (client, queryText, description = "") => {
//   try {
//     if (description) {
//       console.log(description);
//     }
//     console.log("Executing:", queryText.substring(0, 80) + "...");
//     await client.query(queryText);
//     console.log("Success");
//     return true;
//   } catch (error) {
//     console.error("Failed:", error.message);
//     if (error.code) {
//       console.error("   Error code:", error.code);
//     }
//     throw error;
//   }
// };

// // Initialize database tables for Document Knowledge Mining System
// export const initDatabase = async () => {
//   if (!isConnected) {
//     console.log("Skipping database initialization - no connection");
//     return false;
//   }

//   console.log("Starting database initialization...");
//   const client = await pool.connect();

//   try {
//     // Check database version
//     const versionResult = await client.query("SELECT version()");
//     console.log(
//       "PostgreSQL Version:",
//       versionResult.rows[0].version.split(",")[0]
//     );

//     // Check and install extensions
//     console.log("\nInstalling required extensions...");

//     try {
//       await executeQuery(
//         client,
//         `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
//         "Installing UUID extension"
//       );
//     } catch (error) {
//       console.error(
//         "UUID extension installation failed - using alternative UUID generation"
//       );
//     }

//     console.log("\nCreating database tables...");

//     // 1. Documents table
//     await executeQuery(
//       client,
//       `
//       CREATE TABLE IF NOT EXISTS documents (
//         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//         filename VARCHAR(255) NOT NULL,
//         original_filename VARCHAR(255) NOT NULL CHECK (original_filename != ''),
//         file_size BIGINT NOT NULL CHECK (file_size > 0),
//         mime_type VARCHAR(100) NOT NULL,
//         content_type VARCHAR(100) NOT NULL,
//         upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         processed_date TIMESTAMP,
//         status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
//         chunk_count INTEGER DEFAULT 0,
//         metadata JSONB DEFAULT '{}',
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       )
//     `,
//       "Creating documents table"
//     );

//     // 2. Document chunks table with JSONB embeddings (no pgvector)
//     await executeQuery(
//       client,
//       `
//       CREATE TABLE IF NOT EXISTS document_chunks (
//         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//         document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
//         chunk_index INTEGER NOT NULL,
//         content TEXT NOT NULL CHECK (content != ''),
//         content_length INTEGER NOT NULL,
//         page_number INTEGER,
//         section_title VARCHAR(255),
//         embedding JSONB,
//         metadata JSONB DEFAULT '{}',
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         UNIQUE(document_id, chunk_index)
//       )
//     `,
//       "Creating document_chunks table"
//     );

//     // 3. Chat sessions table
//     await executeQuery(
//       client,
//       `
//       CREATE TABLE IF NOT EXISTS chat_sessions (
//         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//         title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
//         user_id VARCHAR(255) NOT NULL DEFAULT 'anonymous',
//         message_count INTEGER DEFAULT 0,
//         last_message TEXT,
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
//         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       )
//     `,
//       "Creating chat_sessions table"
//     );

//     // 4. Chat messages table
//     await executeQuery(
//       client,
//       `
//       CREATE TABLE IF NOT EXISTS chat_messages (
//         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//         session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
//         role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
//         content TEXT NOT NULL CHECK (content != ''),
//         metadata JSONB DEFAULT '{}',
//         related_chunks UUID[],
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       )
//     `,
//       "Creating chat_messages table"
//     );

//     // 5. Search queries table (fixed column name)
//     await executeQuery(
//       client,
//       `
//       CREATE TABLE IF NOT EXISTS search_queries (
//         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//         query TEXT NOT NULL CHECK (query != ''),
//         search_type VARCHAR(20) NOT NULL CHECK (search_type IN ('text', 'semantic', 'hybrid')),
//         document_filter UUID[],
//         results_count INTEGER NOT NULL DEFAULT 0,
//         execution_time INTEGER,
//         user_id VARCHAR(255) DEFAULT 'anonymous',
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       )
//     `,
//       "Creating search_queries table"
//     );

//     // 6. Processing jobs table
//     await executeQuery(
//       client,
//       `
//       CREATE TABLE IF NOT EXISTS processing_jobs (
//         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//         document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
//         job_type VARCHAR(50) NOT NULL,
//         status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
//         started_at TIMESTAMP,
//         completed_at TIMESTAMP,
//         error_message TEXT,
//         retry_count INTEGER DEFAULT 0,
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       )
//     `,
//       "Creating processing_jobs table"
//     );

//     // 7. System logs table
//     await executeQuery(
//       client,
//       `
//       CREATE TABLE IF NOT EXISTS system_logs (
//         id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
//         level VARCHAR(20) NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
//         component VARCHAR(50) NOT NULL,
//         message TEXT NOT NULL,
//         metadata JSONB DEFAULT '{}',
//         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
//       )
//     `,
//       "Creating system_logs table"
//     );

//     console.log("\nCreating database indexes...");

//     // Create indexes
//     await executeQuery(
//       client,
//       `CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)`,
//       "Creating documents status index"
//     );
//     await executeQuery(
//       client,
//       `CREATE INDEX IF NOT EXISTS idx_documents_upload_date ON documents(upload_date)`,
//       "Creating documents date index"
//     );
//     await executeQuery(
//       client,
//       `CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id)`,
//       "Creating chunks document_id index"
//     );
//     await executeQuery(
//       client,
//       `CREATE INDEX IF NOT EXISTS idx_chunks_content_fts ON document_chunks USING gin(to_tsvector('english', content))`,
//       "Creating full-text search index"
//     );
    
//     // JSONB embedding index for semantic search
//     await executeQuery(
//       client,
//       `CREATE INDEX IF NOT EXISTS idx_chunks_embedding_gin ON document_chunks USING gin(embedding)`,
//       "Creating JSONB embedding index"
//     );
    
//     await executeQuery(
//       client,
//       `CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id)`,
//       "Creating chat sessions user index"
//     );
//     await executeQuery(
//       client,
//       `CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)`,
//       "Creating chat messages session index"
//     );

//     console.log("\nCreating database functions...");

//     // Create cosine similarity function for JSONB arrays
//     await executeQuery(
//       client,
//       `
//       CREATE OR REPLACE FUNCTION cosine_similarity(a JSONB, b JSONB)
//       RETURNS FLOAT AS $$
//       DECLARE
//           dot_product FLOAT := 0;
//           norm_a FLOAT := 0;
//           norm_b FLOAT := 0;
//           i INTEGER;
//           len INTEGER;
//       BEGIN
//           IF a IS NULL OR b IS NULL THEN
//               RETURN 0;
//           END IF;
          
//           len := jsonb_array_length(a);
//           IF len != jsonb_array_length(b) THEN
//               RETURN 0;
//           END IF;
          
//           FOR i IN 0..len-1 LOOP
//               dot_product := dot_product + 
//                   (a->>i)::FLOAT * (b->>i)::FLOAT;
//               norm_a := norm_a + ((a->>i)::FLOAT) ^ 2;
//               norm_b := norm_b + ((b->>i)::FLOAT) ^ 2;
//           END LOOP;
          
//           IF norm_a = 0 OR norm_b = 0 THEN
//               RETURN 0;
//           END IF;
          
//           RETURN dot_product / (sqrt(norm_a) * sqrt(norm_b));
//       END;
//       $$ LANGUAGE plpgsql IMMUTABLE;
//       `,
//       "Creating cosine similarity function"
//     );

//     console.log("\nCreating database triggers...");

//     // Create update trigger function
//     await executeQuery(
//       client,
//       `
//       CREATE OR REPLACE FUNCTION update_updated_at_column()
//       RETURNS TRIGGER AS $$
//       BEGIN
//         NEW.updated_at = CURRENT_TIMESTAMP;
//         RETURN NEW;
//       END;
//       $$ language 'plpgsql'
//     `,
//       "Creating update trigger function"
//     );

//     // Create triggers
//     await executeQuery(
//       client,
//       `
//       DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
//       CREATE TRIGGER update_documents_updated_at 
//         BEFORE UPDATE ON documents 
//         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
//     `,
//       "Creating documents update trigger"
//     );

//     await executeQuery(
//       client,
//       `
//       DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;
//       CREATE TRIGGER update_chat_sessions_updated_at 
//         BEFORE UPDATE ON chat_sessions 
//         FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
//     `,
//       "Creating chat sessions update trigger"
//     );

//     console.log("\nDatabase schema summary:");

//     // Get table information
//     const tableQuery = await client.query(`
//       SELECT table_name, 
//              (SELECT COUNT(*) FROM information_schema.columns 
//               WHERE table_name = t.table_name AND table_schema = 'public') as column_count
//       FROM information_schema.tables t
//       WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
//       ORDER BY table_name
//     `);

//     tableQuery.rows.forEach((row) => {
//       console.log(`   ${row.table_name} (${row.column_count} columns)`);
//     });

//     console.log("\nDatabase initialization completed successfully!");
//     return true;
//   } catch (error) {
//     console.error("\nDatabase initialization failed:", error.message);
//     console.error("Stack trace:", error.stack);
//     throw error;
//   } finally {
//     client.release();
//   }
// };

// // Initialize database connection and schema
// export const connectDatabase = async () => {
//   console.log("Connecting to database...");
//   const connected = await testConnection();

//   if (connected) {
//     try {
//       await initDatabase();
//       console.log("Database fully initialized and ready");
//       return true;
//     } catch (error) {
//       console.error("Database initialization failed:", error.message);
//       return false;
//     }
//   }

//   console.log("Database connection failed - running in offline mode");
//   return false;
// };

// // Get connection status and stats
// export const getConnectionStatus = () => {
//   return {
//     isConnected,
//     poolStats: {
//       totalCount: pool.totalCount,
//       idleCount: pool.idleCount,
//       waitingCount: pool.waitingCount,
//     },
//   };
// };

// // Get system statistics for dashboard (fixed version)
// export const getSystemStats = async () => {
//   if (!isConnected) {
//     throw new Error("Database not connected");
//   }

//   try {
//     // First, check if embedding column exists
//     const columnCheck = await query(`
//       SELECT column_name 
//       FROM information_schema.columns 
//       WHERE table_name = 'document_chunks' 
//       AND column_name = 'embedding' 
//       AND table_schema = 'public'
//     `);

//     const hasEmbedding = columnCheck.rows.length > 0;

//     const embeddingQuery = hasEmbedding
//       ? `(SELECT COUNT(*) FROM document_chunks WHERE embedding IS NOT NULL) as embedded_chunks,`
//       : `0 as embedded_chunks,`;

//     const stats = await query(`
//       SELECT
//         (SELECT COUNT(*) FROM documents) as total_documents,
//         (SELECT COUNT(*) FROM documents WHERE status = 'completed') as completed_documents,
//         (SELECT COUNT(*) FROM documents WHERE status = 'pending') as pending_documents,
//         (SELECT COUNT(*) FROM documents WHERE status = 'processing') as processing_documents,
//         (SELECT COUNT(*) FROM documents WHERE status = 'failed') as failed_documents,
//         (SELECT COALESCE(SUM(file_size), 0) FROM documents) as total_file_size,
//         (SELECT COUNT(*) FROM document_chunks) as total_chunks,
//         ${embeddingQuery}
//         (SELECT COALESCE(AVG(content_length), 0) FROM document_chunks) as avg_chunk_length,
//         (SELECT COUNT(*) FROM chat_sessions) as total_sessions,
//         (SELECT COUNT(*) FROM chat_messages) as total_messages,
//         (SELECT COUNT(*) FROM search_queries WHERE created_at > NOW() - INTERVAL '7 days') as total_queries,
//         (SELECT AVG(execution_time) FROM search_queries WHERE created_at > NOW() - INTERVAL '7 days') as avg_execution_time,
//         (SELECT AVG(results_count) FROM search_queries WHERE created_at > NOW() - INTERVAL '7 days') as avg_results_count
//     `);

//     return stats.rows[0];
//   } catch (error) {
//     console.error("Error getting system stats:", error);
//     throw error;
//   }
// };

// // Test query function
// export const testQuery = async () => {
//   try {
//     const result = await query("SELECT 1 as test");
//     console.log("Test query successful:", result.rows);
//     return true;
//   } catch (error) {
//     console.error("Test query failed:", error);
//     return false;
//   }
// };

// // Graceful shutdown
// export const closePool = async () => {
//   try {
//     await pool.end();
//     console.log("Database connection pool closed");
//   } catch (error) {
//     console.error("Error closing database pool:", error);
//   }
// };

// // Export aliases
// export { pool, testConnection, isConnected };

import pkg from "pg";
const { Pool } = pkg;
import dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "document_mining",
  password: process.env.DB_PASSWORD || "Database@123",
  port: process.env.DB_PORT || 5432,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  max: 10,
  ssl: false,
});

let isConnected = false;

// Test database connection
const testConnection = async () => {
  try {
    console.log("Testing PostgreSQL connection...");
    console.log("Connection params:", {
      host: process.env.DB_HOST || "localhost",
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || "document_mining",
      user: process.env.DB_USER || "postgres",
    });

    const client = await pool.connect();

    // Test basic query
    const result = await client.query(
      "SELECT NOW() as current_time, current_database() as database_name"
    );
    console.log("Connected to PostgreSQL database");
    console.log("   Current time:", result.rows[0].current_time);
    console.log("   Database name:", result.rows[0].database_name);

    client.release();
    isConnected = true;
    return true;
  } catch (err) {
    console.error("PostgreSQL connection failed:", err.message);
    console.log("");
    console.log("To fix this issue:");
    console.log("   1. Make sure PostgreSQL is installed and running");
    console.log("   2. Create database: CREATE DATABASE document_mining;");
    console.log("   3. Verify connection settings in .env file");
    console.log("   4. Check if PostgreSQL service is running");
    console.log("");
    console.log("The server will continue running without database functionality");
    console.log("");
    isConnected = false;
    return false;
  }
};

// Safe database query wrapper with detailed logging
export const query = async (text, params = []) => {
  if (!isConnected) {
    throw new Error("Database not connected - call testConnection() first");
  }

  const client = await pool.connect();
  try {
    console.log(
      "Executing query:",
      text.substring(0, 100) + (text.length > 100 ? "..." : "")
    );
    const start = Date.now();
    const result = await client.query(text, params);
    const duration = Date.now() - start;
    console.log("Query executed successfully in", duration + "ms");
    return result;
  } catch (error) {
    console.error("Database query error:", error.message);
    console.error("Query text:", text);
    throw error;
  } finally {
    client.release();
  }
};

// Execute query directly with client (for initialization)
const executeQuery = async (client, queryText, description = "") => {
  try {
    if (description) {
      console.log(description);
    }
    console.log("Executing:", queryText.substring(0, 80) + "...");
    await client.query(queryText);
    console.log("Success");
    return true;
  } catch (error) {
    console.error("Failed:", error.message);
    if (error.code) {
      console.error("   Error code:", error.code);
    }
    throw error;
  }
};

// Initialize database tables for Document Knowledge Mining System
export const initDatabase = async () => {
  if (!isConnected) {
    console.log("Skipping database initialization - no connection");
    return false;
  }

  console.log("Starting database initialization...");
  const client = await pool.connect();

  try {
    // Check database version
    const versionResult = await client.query("SELECT version()");
    console.log(
      "PostgreSQL Version:",
      versionResult.rows[0].version.split(",")[0]
    );

    // Check and install extensions
    console.log("\nInstalling required extensions...");

    try {
      await executeQuery(
        client,
        `CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`,
        "Installing UUID extension"
      );
    } catch (error) {
      console.error(
        "UUID extension installation failed - using alternative UUID generation"
      );
    }

    console.log("\nCreating database tables...");

    // 1. Documents table
    await executeQuery(
      client,
      `
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        filename VARCHAR(255) NOT NULL,
        original_filename VARCHAR(255) NOT NULL CHECK (original_filename != ''),
        file_size BIGINT NOT NULL CHECK (file_size > 0),
        mime_type VARCHAR(100) NOT NULL,
        content_type VARCHAR(100) NOT NULL,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_date TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
        chunk_count INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      "Creating documents table"
    );

    // 2. Document chunks table with JSONB embeddings (no pgvector)
    await executeQuery(
      client,
      `
      CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL CHECK (content != ''),
        content_length INTEGER NOT NULL,
        page_number INTEGER,
        section_title VARCHAR(255),
        embedding JSONB,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(document_id, chunk_index)
      )
    `,
      "Creating document_chunks table"
    );

    // 3. Chat sessions table
    await executeQuery(
      client,
      `
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
        user_id VARCHAR(255) NOT NULL DEFAULT 'anonymous',
        message_count INTEGER DEFAULT 0,
        last_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      "Creating chat_sessions table"
    );

    // 4. Chat messages table
    await executeQuery(
      client,
      `
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL CHECK (content != ''),
        metadata JSONB DEFAULT '{}',
        related_chunks UUID[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      "Creating chat_messages table"
    );

    // 5. Search queries table (fixed column name)
    await executeQuery(
      client,
      `
      CREATE TABLE IF NOT EXISTS search_queries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        query TEXT NOT NULL CHECK (query != ''),
        search_type VARCHAR(20) NOT NULL CHECK (search_type IN ('text', 'semantic', 'hybrid')),
        document_filter UUID[],
        results_count INTEGER NOT NULL DEFAULT 0,
        execution_time INTEGER,
        user_id VARCHAR(255) DEFAULT 'anonymous',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      "Creating search_queries table"
    );

    // 6. Processing jobs table
    await executeQuery(
      client,
      `
      CREATE TABLE IF NOT EXISTS processing_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        job_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed')),
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      "Creating processing_jobs table"
    );

    // 7. System logs table
    await executeQuery(
      client,
      `
      CREATE TABLE IF NOT EXISTS system_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        level VARCHAR(20) NOT NULL CHECK (level IN ('info', 'warn', 'error', 'debug')),
        component VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `,
      "Creating system_logs table"
    );

    console.log("\nCreating database indexes...");

    // Create indexes
    await executeQuery(
      client,
      `CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)`,
      "Creating documents status index"
    );
    await executeQuery(
      client,
      `CREATE INDEX IF NOT EXISTS idx_documents_upload_date ON documents(upload_date)`,
      "Creating documents date index"
    );
    await executeQuery(
      client,
      `CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id)`,
      "Creating chunks document_id index"
    );
    await executeQuery(
      client,
      `CREATE INDEX IF NOT EXISTS idx_chunks_content_fts ON document_chunks USING gin(to_tsvector('english', content))`,
      "Creating full-text search index"
    );
    
    // JSONB embedding index for semantic search
    await executeQuery(
      client,
      `CREATE INDEX IF NOT EXISTS idx_chunks_embedding_gin ON document_chunks USING gin(embedding)`,
      "Creating JSONB embedding index"
    );
    
    await executeQuery(
      client,
      `CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id)`,
      "Creating chat sessions user index"
    );
    await executeQuery(
      client,
      `CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)`,
      "Creating chat messages session index"
    );

    console.log("\nCreating database functions...");

    // Create cosine similarity function for JSONB arrays
    await executeQuery(
      client,
      `
      CREATE OR REPLACE FUNCTION cosine_similarity(a JSONB, b JSONB)
      RETURNS FLOAT AS $$
      DECLARE
          dot_product FLOAT := 0;
          norm_a FLOAT := 0;
          norm_b FLOAT := 0;
          i INTEGER;
          len INTEGER;
      BEGIN
          IF a IS NULL OR b IS NULL THEN
              RETURN 0;
          END IF;
          
          len := jsonb_array_length(a);
          IF len != jsonb_array_length(b) THEN
              RETURN 0;
          END IF;
          
          FOR i IN 0..len-1 LOOP
              dot_product := dot_product + 
                  (a->>i)::FLOAT * (b->>i)::FLOAT;
              norm_a := norm_a + ((a->>i)::FLOAT) ^ 2;
              norm_b := norm_b + ((b->>i)::FLOAT) ^ 2;
          END LOOP;
          
          IF norm_a = 0 OR norm_b = 0 THEN
              RETURN 0;
          END IF;
          
          RETURN dot_product / (sqrt(norm_a) * sqrt(norm_b));
      END;
      $$ LANGUAGE plpgsql IMMUTABLE;
      `,
      "Creating cosine similarity function"
    );

    console.log("\nCreating database triggers...");

    // Create update trigger function
    await executeQuery(
      client,
      `
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `,
      "Creating update trigger function"
    );

    // Create triggers
    await executeQuery(
      client,
      `
      DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
      CREATE TRIGGER update_documents_updated_at 
        BEFORE UPDATE ON documents 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `,
      "Creating documents update trigger"
    );

    await executeQuery(
      client,
      `
      DROP TRIGGER IF EXISTS update_chat_sessions_updated_at ON chat_sessions;
      CREATE TRIGGER update_chat_sessions_updated_at 
        BEFORE UPDATE ON chat_sessions 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `,
      "Creating chat sessions update trigger"
    );

    console.log("\nDatabase schema summary:");

    // Get table information
    const tableQuery = await client.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.columns 
              WHERE table_name = t.table_name AND table_schema = 'public') as column_count
      FROM information_schema.tables t
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    tableQuery.rows.forEach((row) => {
      console.log(`   ${row.table_name} (${row.column_count} columns)`);
    });

    console.log("\nDatabase initialization completed successfully!");
    return true;
  } catch (error) {
    console.error("\nDatabase initialization failed:", error.message);
    console.error("Stack trace:", error.stack);
    throw error;
  } finally {
    client.release();
  }
};

// Initialize database connection and schema
export const connectDatabase = async () => {
  console.log("Connecting to database...");
  const connected = await testConnection();

  if (connected) {
    try {
      await initDatabase();
      console.log("Database fully initialized and ready");
      return true;
    } catch (error) {
      console.error("Database initialization failed:", error.message);
      return false;
    }
  }

  console.log("Database connection failed - running in offline mode");
  return false;
};

// Get connection status and stats
export const getConnectionStatus = () => {
  return {
    isConnected,
    poolStats: {
      totalCount: pool.totalCount,
      idleCount: pool.idleCount,
      waitingCount: pool.waitingCount,
    },
  };
};

// Get system statistics for dashboard (fixed version)
export const getSystemStats = async () => {
  if (!isConnected) {
    throw new Error("Database not connected");
  }

  try {
    // First, check if embedding column exists
    const columnCheck = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'document_chunks' 
      AND column_name = 'embedding' 
      AND table_schema = 'public'
    `);

    const hasEmbedding = columnCheck.rows.length > 0;

    const embeddingQuery = hasEmbedding
      ? `(SELECT COUNT(*) FROM document_chunks WHERE embedding IS NOT NULL) as embedded_chunks,`
      : `0 as embedded_chunks,`;

    const stats = await query(`
      SELECT
        (SELECT COUNT(*) FROM documents) as total_documents,
        (SELECT COUNT(*) FROM documents WHERE status = 'completed') as completed_documents,
        (SELECT COUNT(*) FROM documents WHERE status = 'pending') as pending_documents,
        (SELECT COUNT(*) FROM documents WHERE status = 'processing') as processing_documents,
        (SELECT COUNT(*) FROM documents WHERE status = 'failed') as failed_documents,
        (SELECT COALESCE(SUM(file_size), 0) FROM documents) as total_file_size,
        (SELECT COUNT(*) FROM document_chunks) as total_chunks,
        ${embeddingQuery}
        (SELECT COALESCE(AVG(content_length), 0) FROM document_chunks) as avg_chunk_length,
        (SELECT COUNT(*) FROM chat_sessions) as total_sessions,
        (SELECT COUNT(*) FROM chat_messages) as total_messages,
        (SELECT COUNT(*) FROM search_queries WHERE created_at > NOW() - INTERVAL '7 days') as total_queries,
        (SELECT AVG(execution_time) FROM search_queries WHERE created_at > NOW() - INTERVAL '7 days') as avg_execution_time,
        (SELECT AVG(results_count) FROM search_queries WHERE created_at > NOW() - INTERVAL '7 days') as avg_results_count
    `);

    return stats.rows[0];
  } catch (error) {
    console.error("Error getting system stats:", error);
    throw error;
  }
};

// Test query function
export const testQuery = async () => {
  try {
    const result = await query("SELECT 1 as test");
    console.log("Test query successful:", result.rows);
    return true;
  } catch (error) {
    console.error("Test query failed:", error);
    return false;
  }
};

// Graceful shutdown
export const closePool = async () => {
  try {
    await pool.end();
    console.log("Database connection pool closed");
  } catch (error) {
    console.error("Error closing database pool:", error);
  }
};

// Export aliases
export { pool, testConnection, isConnected };