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
  connectionTimeoutMillis: 3000,  // Further reduced
  idleTimeoutMillis: 30000,
  max: 5,  // Reduced max connections for faster startup
  ssl: false,
});

let isConnected = false;
let isInitialized = false;

// Ultra-fast connection test
const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query("SELECT 1");
    client.release();
    isConnected = true;
    return true;
  } catch (err) {
    console.error("❌ PostgreSQL connection failed:", err.message);
    isConnected = false;
    return false;
  }
};

// Lightning-fast initialization check
const checkInitialization = async () => {
  if (!isConnected) return false;
  
  try {
    const client = await pool.connect();
    
    // Single optimized query to check if key tables exist
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'documents'
      ) as is_initialized
    `);
    
    client.release();
    isInitialized = result.rows[0].is_initialized;
    
    if (isInitialized) {
      console.log("✅ Database ready - skipping initialization");
    }
    
    return isInitialized;
  } catch (error) {
    console.error("Error checking database:", error.message);
    return false;
  }
};

// Minimal database query wrapper
export const query = async (text, params = []) => {
  if (!isConnected) {
    throw new Error("Database not connected");
  }

  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } catch (error) {
    console.error("Query error:", error.message);
    throw error;
  } finally {
    client.release();
  }
};

// Ultra-minimal initialization - only essential tables
export const initDatabase = async () => {
  if (!isConnected) {
    console.log("⚠️ No database connection");
    return false;
  }

  // Quick check first
  const alreadyInitialized = await checkInitialization();
  if (alreadyInitialized) {
    return true;
  }

  console.log("🚀 Setting up database...");
  const client = await pool.connect();

  try {
    // Single transaction with only the most essential tables
    await client.query('BEGIN');

    // Extensions
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Only create essential tables needed for immediate startup
    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        filename VARCHAR(255) NOT NULL,
        original_filename VARCHAR(255) NOT NULL,
        file_size BIGINT NOT NULL,
        mime_type VARCHAR(100) NOT NULL,
        content_type VARCHAR(100) NOT NULL,
        upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        processed_date TIMESTAMP,
        status VARCHAR(50) DEFAULT 'pending',
        chunk_count INTEGER DEFAULT 0,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS document_chunks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        content_length INTEGER NOT NULL,
        page_number INTEGER,
        section_title VARCHAR(255),
        embedding JSONB,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL DEFAULT 'New Chat',
        user_id VARCHAR(255) NOT NULL DEFAULT 'anonymous',
        message_count INTEGER DEFAULT 0,
        last_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL,
        content TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        related_chunks UUID[],
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Only essential indexes
    await client.query(`CREATE INDEX IF NOT EXISTS idx_documents_status ON documents(status)`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_chunks_document_id ON document_chunks(document_id)`);

    await client.query('COMMIT');
    
    console.log("✅ Database ready");
    isInitialized = true;
    return true;

  } catch (error) {
    await client.query('ROLLBACK');
    console.error("❌ Database setup failed:", error.message);
    throw error;
  } finally {
    client.release();
  }
};

// Background setup - runs after server starts
export const setupRemainingTables = async () => {
  if (!isConnected || !isInitialized) return;

  try {
    console.log("🔧 Setting up remaining tables in background...");

    // Create remaining tables
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS search_queries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        query TEXT NOT NULL,
        search_type VARCHAR(20) NOT NULL,
        document_filter UUID[],
        results_count INTEGER NOT NULL DEFAULT 0,
        execution_time INTEGER,
        user_id VARCHAR(255) DEFAULT 'anonymous',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS processing_jobs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        job_type VARCHAR(50) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        started_at TIMESTAMP,
        completed_at TIMESTAMP,
        error_message TEXT,
        retry_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS system_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        level VARCHAR(20) NOT NULL,
        component VARCHAR(50) NOT NULL,
        message TEXT NOT NULL,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create additional indexes
    await query(`CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON chat_sessions(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON chat_messages(session_id)`);

    console.log("✅ Background setup completed");
  } catch (error) {
    console.log("⚠️ Background setup failed:", error.message);
  }
};
// Create expensive features in background (after 10 seconds)
export const createAdvancedFeatures = async () => {
  if (!isConnected || !isInitialized) return;

  try {
    console.log("🔧 Creating advanced features...");

    // Add constraints - check if they exist first
    try {
      // Check and add filename constraint
      const filenameConstraintExists = await query(`
        SELECT COUNT(*) FROM information_schema.table_constraints 
        WHERE table_name = 'documents' 
        AND constraint_name = 'chk_filename'
      `);
      
      if (filenameConstraintExists.rows[0].count === '0') {
        await query(`ALTER TABLE documents ADD CONSTRAINT chk_filename CHECK (original_filename != '')`);
      }
    } catch (error) {
      console.log("⚠️ Filename constraint already exists or failed:", error.message);
    }

    try {
      // Check and add filesize constraint
      const filesizeConstraintExists = await query(`
        SELECT COUNT(*) FROM information_schema.table_constraints 
        WHERE table_name = 'documents' 
        AND constraint_name = 'chk_filesize'
      `);
      
      if (filesizeConstraintExists.rows[0].count === '0') {
        await query(`ALTER TABLE documents ADD CONSTRAINT chk_filesize CHECK (file_size > 0)`);
      }
    } catch (error) {
      console.log("⚠️ Filesize constraint already exists or failed:", error.message);
    }

    try {
      // Check and add status constraint
      const statusConstraintExists = await query(`
        SELECT COUNT(*) FROM information_schema.table_constraints 
        WHERE table_name = 'documents' 
        AND constraint_name = 'chk_status'
      `);
      
      if (statusConstraintExists.rows[0].count === '0') {
        await query(`ALTER TABLE documents ADD CONSTRAINT chk_status CHECK (status IN ('pending', 'processing', 'completed', 'failed'))`);
      }
    } catch (error) {
      console.log("⚠️ Status constraint already exists or failed:", error.message);
    }

    // Create expensive indexes (these have IF NOT EXISTS support)
    await query(`CREATE INDEX IF NOT EXISTS idx_documents_upload_date ON documents(upload_date)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_chunks_content_fts ON document_chunks USING gin(to_tsvector('english', content))`);

    // Create functions and triggers
    await query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = CURRENT_TIMESTAMP;
        RETURN NEW;
      END;
      $$ language 'plpgsql'
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_documents_updated_at ON documents;
      CREATE TRIGGER update_documents_updated_at 
        BEFORE UPDATE ON documents 
        FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()
    `);

    // Cosine similarity function
    await query(`
      CREATE OR REPLACE FUNCTION cosine_similarity(a JSONB, b JSONB)
      RETURNS FLOAT AS $$
      DECLARE
          dot_product FLOAT := 0;
          norm_a FLOAT := 0;
          norm_b FLOAT := 0;
          i INTEGER;
          len INTEGER;
      BEGIN
          IF a IS NULL OR b IS NULL THEN RETURN 0; END IF;
          len := jsonb_array_length(a);
          IF len != jsonb_array_length(b) THEN RETURN 0; END IF;
          FOR i IN 0..len-1 LOOP
              dot_product := dot_product + (a->>i)::FLOAT * (b->>i)::FLOAT;
              norm_a := norm_a + ((a->>i)::FLOAT) ^ 2;
              norm_b := norm_b + ((b->>i)::FLOAT) ^ 2;
          END LOOP;
          IF norm_a = 0 OR norm_b = 0 THEN RETURN 0; END IF;
          RETURN dot_product / (sqrt(norm_a) * sqrt(norm_b));
      END;
      $$ LANGUAGE plpgsql IMMUTABLE
    `);

    console.log("✅ Advanced features ready");
  } catch (error) {
    console.log("⚠️ Advanced features failed:", error.message);
  }
};

// Lightning-fast connection - immediate return
export const connectDatabase = async () => {
  console.log("⚡ Quick database check...");
  
  const connected = await testConnection();
  if (!connected) {
    console.log("⚠️ Database offline - continuing without DB");
    return false;
  }

  try {
    await initDatabase();
    
    // Schedule background tasks
    setTimeout(setupRemainingTables, 2000);      // 2 seconds
    setTimeout(createAdvancedFeatures, 10000);   // 10 seconds
    
    return true;
  } catch (error) {
    console.error("❌ Database error:", error.message);
    return false;
  }
};

// Instant status check
export const getConnectionStatus = () => ({
  isConnected,
  isInitialized,
  poolStats: {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  },
});

// Cached system stats (very fast)
let statsCache = { total_documents: 0, total_chunks: 0, total_sessions: 0 };
let lastStatsUpdate = 0;

export const getSystemStats = async () => {
  if (!isConnected) return statsCache;

  const now = Date.now();
  if (now - lastStatsUpdate < 60000) {  // 1 minute cache
    return statsCache;
  }

  try {
    const result = await query(`
      SELECT
        (SELECT COUNT(*) FROM documents) as total_documents,
        (SELECT COUNT(*) FROM document_chunks) as total_chunks,
        (SELECT COUNT(*) FROM chat_sessions) as total_sessions
    `);

    statsCache = result.rows[0];
    lastStatsUpdate = now;
  } catch (error) {
    console.log("Stats error:", error.message);
  }

  return statsCache;
};

export const testQuery = async () => {
  try {
    await query("SELECT 1");
    return true;
  } catch (error) {
    return false;
  }
};

export const closePool = async () => {
  try {
    await pool.end();
    console.log("✅ Database closed");
  } catch (error) {
    console.error("❌ Close error:", error);
  }
};

export { pool, testConnection, isConnected };