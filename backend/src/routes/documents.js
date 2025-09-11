import express from 'express';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';

import { query } from '../config/database.js';
import { addToQueue } from '../config/redis.js';
import { validateDocument } from '../middleware/validation.js';
import logger from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const router = express.Router();

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadDir = path.join(__dirname, '../../uploads');
    try {
      await fs.mkdir(uploadDir, { recursive: true });
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueId = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueId}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf', 
      'text/plain', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, TXT, and DOCX files are allowed.'));
    }
  }
});

// Get all documents
router.get('/', async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status, search } = req.query;
    const offset = (page - 1) * limit;
    
    let queryText = `
      SELECT 
        id, filename, original_filename, file_size, mime_type, 
        content_type, upload_date, processed_date, status, metadata,
        (SELECT COUNT(*) FROM document_chunks WHERE document_id = documents.id) as chunk_count
      FROM documents 
    `;
    
    const conditions = [];
    const params = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`status = $${paramIndex++}`);
      params.push(status);
    }

    if (search) {
      conditions.push(`(original_filename ILIKE $${paramIndex++} OR filename ILIKE $${paramIndex})`);
      params.push(`%${search}%`, `%${search}%`);
      paramIndex += 2;
    }

    if (conditions.length > 0) {
      queryText += ' WHERE ' + conditions.join(' AND ');
    }

    queryText += ` ORDER BY upload_date DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    const result = await query(queryText, params);

    // Get total count for pagination
    let countQuery = 'SELECT COUNT(*) FROM documents';
    const countParams = [...params];
    countParams.pop(); // Remove limit
    countParams.pop(); // Remove offset
    
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    
    const countResult = await query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    res.json({
      documents: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

// Get single document
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    const result = await query(
      `SELECT 
        d.*,
        (SELECT COUNT(*) FROM document_chunks WHERE document_id = d.id) as chunk_count,
        (SELECT json_agg(
          json_build_object(
            'id', dc.id,
            'chunk_index', dc.chunk_index,
            'content_length', dc.content_length,
            'page_number', dc.page_number,
            'section_title', dc.section_title
          ) ORDER BY dc.chunk_index
        ) FROM document_chunks dc WHERE dc.document_id = d.id) as chunks
      FROM documents d 
      WHERE d.id = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    next(error);
  }
});

// Upload document - FIXED
router.post('/upload', upload.single('document'), validateDocument, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const { file } = req;
    console.log(file.path, "file path");
    const documentId = uuidv4();

    // FIXED: Remove file_path from INSERT query since column might not exist
    const result = await query(
      `INSERT INTO documents 
       (id, filename, original_filename, file_size, mime_type, content_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        documentId,
        file.filename,
        file.originalname,
        file.size,
        file.mimetype,
        path.extname(file.originalname).slice(1).toLowerCase(), 
        'pending'
      ]
    );
    

    // Try to update file_path if column exists
    try {
      await query(
        'UPDATE documents SET file_path = $1 WHERE id = $2',
        [file.path, documentId]
      );
    } catch (filePathError) {
      logger.warn('file_path column not found, skipping file path update');
    }

    // Add document processing job to queue
    try {
      await addToQueue('document_processing', {
        documentId,
        filePath: file.path,
        mimeType: file.mimetype,
        timestamp: new Date().toISOString()
      });
      logger.info(`Added processing job for document: ${documentId}`);
    } catch (queueError) {
      logger.warn('Failed to add job to queue:', queueError.message);
    }

    logger.info(`Document uploaded: ${documentId}`, {
      filename: file.originalname,
      size: file.size,
      type: file.mimetype
    });

    res.status(201).json({
      ...result.rows[0],
      file_path: file.path // Include file path in response
    });
  } catch (error) {
    logger.error('Upload error:', error);
    next(error);
  }
});

// Delete document
router.delete('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Get document info before deletion (handle missing file_path column)
    let filePath = null;
    try {
      const docResult = await query(
        'SELECT file_path FROM documents WHERE id = $1',
        [id]
      );
      if (docResult.rows.length > 0) {
        filePath = docResult.rows[0].file_path;
      }
    } catch (error) {
      logger.warn('Could not retrieve file_path, continuing with deletion');
    }

    // Delete from database (cascading will delete chunks and related data)
    const deleteResult = await query('DELETE FROM documents WHERE id = $1 RETURNING *', [id]);

    if (deleteResult.rows.length === 0) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Delete physical file if path exists
    if (filePath) {
      try {
        await fs.unlink(filePath);
        logger.info(`Physical file deleted: ${filePath}`);
      } catch (fileError) {
        logger.warn(`Could not delete physical file: ${filePath}`, fileError);
      }
    }

    logger.info(`Document deleted: ${id}`);
    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    next(error);
  }
});

// Get document content/chunks
router.get('/:id/chunks', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT 
        id, chunk_index, content, content_length, page_number, section_title, metadata
       FROM document_chunks 
       WHERE document_id = $1 
       ORDER BY chunk_index 
       LIMIT $2 OFFSET $3`,
      [id, limit, offset]
    );

    // Get total chunks count
    const countResult = await query(
      'SELECT COUNT(*) FROM document_chunks WHERE document_id = $1',
      [id]
    );

    const total = parseInt(countResult.rows[0].count);

    res.json({
      chunks: result.rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
});

export default router;