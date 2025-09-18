-- Add error_message column to documents table
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS error_message TEXT;