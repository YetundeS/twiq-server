-- Migration: Create system_logs table for admin dashboard
-- Purpose: Store application logs in database for admin viewing and analysis

CREATE TABLE IF NOT EXISTS system_logs (
  id BIGSERIAL PRIMARY KEY,
  level VARCHAR(10) NOT NULL, -- 'error', 'warn', 'info', 'debug'
  message TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- user_id, ip, endpoint, stack trace, etc.
  source VARCHAR(50), -- 'stripe', 'auth', 'chat', 'vector_store', 'system', etc.
  stack_trace TEXT, -- Full error stack for debugging
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for fast admin dashboard queries
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level);
CREATE INDEX IF NOT EXISTS idx_system_logs_source ON system_logs(source);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON system_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level_created ON system_logs(level, created_at DESC);

-- Composite index for common admin dashboard filters
CREATE INDEX IF NOT EXISTS idx_system_logs_dashboard ON system_logs(level, source, created_at DESC);

-- GIN index for metadata search capabilities
CREATE INDEX IF NOT EXISTS idx_system_logs_metadata ON system_logs USING GIN (metadata);

-- Full text search index for message content
CREATE INDEX IF NOT EXISTS idx_system_logs_message_search ON system_logs USING GIN (to_tsvector('english', message));

-- Create a function to automatically cleanup old logs (30+ days)
CREATE OR REPLACE FUNCTION cleanup_old_system_logs()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM system_logs 
  WHERE created_at < NOW() - INTERVAL '30 days';
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  
  -- Log the cleanup action
  INSERT INTO system_logs (level, message, source, metadata)
  VALUES (
    'info', 
    'Automatic log cleanup completed',
    'system',
    jsonb_build_object(
      'deleted_count', deleted_count,
      'cleanup_date', NOW()
    )
  );
  
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to limit table size and prevent runaway growth
CREATE OR REPLACE FUNCTION prevent_log_table_overflow()
RETURNS TRIGGER AS $$
DECLARE
  log_count INTEGER;
BEGIN
  -- Check if we have more than 100k logs
  SELECT COUNT(*) INTO log_count FROM system_logs;
  
  IF log_count > 100000 THEN
    -- Delete oldest 10k logs to maintain performance
    DELETE FROM system_logs 
    WHERE id IN (
      SELECT id FROM system_logs 
      ORDER BY created_at ASC 
      LIMIT 10000
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger that runs after each insert
CREATE TRIGGER trigger_prevent_log_overflow
  AFTER INSERT ON system_logs
  FOR EACH STATEMENT
  EXECUTE FUNCTION prevent_log_table_overflow();

-- Insert initial log entry to confirm table creation
INSERT INTO system_logs (level, message, source, metadata)
VALUES (
  'info', 
  'System logs table initialized successfully',
  'system',
  jsonb_build_object(
    'migration_version', '10_system_logs',
    'created_at', NOW(),
    'features', jsonb_build_array(
      'admin_dashboard_integration',
      'automatic_cleanup',
      'overflow_protection',
      'full_text_search',
      'metadata_indexing'
    )
  )
);

-- Grant permissions to application user (if needed)
-- GRANT SELECT, INSERT, DELETE ON system_logs TO your_app_user;
-- GRANT USAGE, SELECT ON SEQUENCE system_logs_id_seq TO your_app_user;

COMMENT ON TABLE system_logs IS 'Application logs for admin dashboard viewing and system monitoring';
COMMENT ON COLUMN system_logs.level IS 'Log level: error, warn, info, debug';
COMMENT ON COLUMN system_logs.message IS 'Human-readable log message';
COMMENT ON COLUMN system_logs.metadata IS 'Additional context data in JSON format';
COMMENT ON COLUMN system_logs.source IS 'Source component: stripe, auth, chat, vector_store, system';
COMMENT ON COLUMN system_logs.stack_trace IS 'Full error stack trace for debugging';