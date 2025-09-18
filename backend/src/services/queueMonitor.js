import { query } from '../config/database.js';
import { addToQueue } from '../config/redis.js';
import logger from '../utils/logger.js';

const STUCK_THRESHOLD_MINUTES = 15;
const MAX_RETRIES = 3;
let isMonitoring = false;

export async function monitorStuckDocuments() {
  // Prevent concurrent monitoring runs
  if (isMonitoring) {
    logger.debug('Monitor already running, skipping this iteration');
    return;
  }

  try {
    isMonitoring = true;
    
    // First, let's see what columns actually exist in your documents table
    const tableInfo = await query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'documents'
    `);
    
    const columns = tableInfo.rows.map(row => row.column_name);
    logger.debug('Available columns in documents table:', columns);
    
    // Determine which timestamp column to use
    let timestampColumn = null;
    if (columns.includes('last_updated')) {
      timestampColumn = 'last_updated';
    } else if (columns.includes('updated_at')) {
      timestampColumn = 'updated_at';
    } else if (columns.includes('created_at')) {
      timestampColumn = 'created_at';
    }
    
    if (!timestampColumn) {
      logger.warn('No timestamp column found in documents table. Available columns:', columns);
      logger.warn('Skipping stuck document monitoring until timestamp column is added');
      return;
    }
    
    logger.debug(`Using ${timestampColumn} for timestamp comparisons`);
    
    // Simple query that works with basic columns
    const stuckDocs = await query(`
      SELECT d.id, d.status, d.file_path, d.mime_type,
             EXTRACT(EPOCH FROM (NOW() - d.${timestampColumn})) as seconds_stuck
      FROM documents d
      WHERE (d.status = 'pending' OR d.status = 'processing')
        AND d.${timestampColumn} < NOW() - INTERVAL '${STUCK_THRESHOLD_MINUTES} minutes'
      ORDER BY d.${timestampColumn} ASC
      LIMIT 10
    `);

    if (stuckDocs.rows.length > 0) {
      logger.info(`Found ${stuckDocs.rows.length} stuck documents`);
    }

    for (const doc of stuckDocs.rows) {
      const minutesStuck = Math.floor(doc.seconds_stuck / 60);
      logger.warn(`Found stuck document: ${doc.id} in ${doc.status} state for ${minutesStuck} minutes`);
      
      try {
        // Simple update to reset status to pending
        let updateQuery = 'UPDATE documents SET status = $1';
        let updateParams = ['pending'];
        
        // Add timestamp update if we have the column
        if (columns.includes('last_updated')) {
          updateQuery += ', last_updated = NOW()';
        } else if (columns.includes('updated_at')) {
          updateQuery += ', updated_at = NOW()';
        }
        
        updateQuery += ' WHERE id = $2';
        updateParams.push(doc.id);

        await query(updateQuery, updateParams);

        // Requeue the document
        await addToQueue('document_processing', {
          documentId: doc.id,
          filePath: doc.file_path,
          mimeType: doc.mime_type,
          timestamp: new Date().toISOString(),
          retryCount: 1, // Simple retry count
          maxRetries: MAX_RETRIES
        });

        logger.info(`Requeued stuck document: ${doc.id}`);
        
      } catch (error) {
        logger.error(`Error processing stuck document ${doc.id}:`, error);
        continue;
      }
    }

  } catch (error) {
    logger.error('Error monitoring stuck documents:', error);
  } finally {
    isMonitoring = false;
  }
}