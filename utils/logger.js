const winston = require('winston');
const path = require('path');
const fs = require('fs');
const { supabase } = require('../config/supabaseClient');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom Winston transport for database logging
class DatabaseTransport extends winston.Transport {
  constructor(options = {}) {
    super(options);
    this.name = 'database';
    this.level = options.level || 'info';
  }

  async log(info, callback) {
    const { level, message, timestamp, service, environment, category, stack, error, userId, endpoint, ip, ...metadata } = info;
    
    try {
      // Prepare log entry for database
      const logEntry = {
        level,
        message: message || 'No message provided',
        source: category || 'system',
        metadata: {
          timestamp,
          service,
          environment,
          userId,
          endpoint,
          ip,
          ...metadata
        },
        stack_trace: stack || (error && typeof error === 'string' ? error : null)
      };

      // Insert into database
      const { error: dbError } = await supabase
        .from('system_logs')
        .insert([logEntry]);

      if (dbError) {
        // Don't throw error to prevent logging loops, just console.error as fallback
        console.error('DatabaseTransport: Failed to insert log:', dbError.message);
      }
    } catch (error) {
      // Fallback to console.error to prevent infinite loops
      console.error('DatabaseTransport: Critical error:', error.message);
    }

    // Always call callback to prevent Winston from hanging
    callback();
  }
}

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    service: 'twiq-backend',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    // Error logs
    new winston.transports.File({ 
      filename: path.join(logsDir, 'error.log'), 
      level: 'error',
      maxsize: 50 * 1024 * 1024, // 50MB max file size
      maxFiles: 5 // Keep 5 old files
    }),
    // Combined logs
    new winston.transports.File({ 
      filename: path.join(logsDir, 'combined.log'),
      maxsize: 50 * 1024 * 1024,
      maxFiles: 5
    }),
    // Database transport for admin dashboard
    new DatabaseTransport({ 
      level: 'info' // Log info and above to database
    }),
    // Console transport for development
    ...(process.env.NODE_ENV !== 'production' ? [
      new winston.transports.Console({ 
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      })
    ] : [])
  ]
});

// Helper methods for common logging patterns
// Enhanced helper methods with better categorization for admin dashboard
logger.logUserAction = (message, userId, metadata = {}) => {
  logger.info(message, { userId, ...metadata, category: 'user_action' });
};

logger.logStripeEvent = (message, metadata = {}) => {
  logger.info(message, { ...metadata, category: 'stripe' });
};

logger.logAuthEvent = (message, metadata = {}) => {
  logger.info(message, { ...metadata, category: 'auth' });
};

logger.logVectorStoreEvent = (message, metadata = {}) => {
  logger.info(message, { ...metadata, category: 'vector_store' });
};

logger.logChatEvent = (message, metadata = {}) => {
  logger.info(message, { ...metadata, category: 'chat' });
};

logger.logSystemError = (message, error, metadata = {}) => {
  logger.error(message, { 
    error: error.message, 
    stack: error.stack,
    ...metadata, 
    category: 'system_error' 
  });
};

logger.logInfo = (message, metadata = {}) => {
  logger.info(message, { ...metadata, category: 'info' });
};

// New helper for admin-specific logging
logger.logAdminAction = (message, adminUserId, metadata = {}) => {
  logger.info(message, { adminUserId, ...metadata, category: 'admin' });
};

// Security event logging
logger.logSecurityEvent = (message, metadata = {}) => {
  logger.warn(message, { ...metadata, category: 'security' });
};

// Database operation logging
logger.logDatabaseEvent = (message, metadata = {}) => {
  logger.info(message, { ...metadata, category: 'database' });
};

// Log successful initialization
logger.info('Enhanced Winston logging system with database support initialized', {
  category: 'system',
  transports: logger.transports.length,
  databaseEnabled: true,
  environment: process.env.NODE_ENV || 'development'
});

module.exports = logger;