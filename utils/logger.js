const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
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
logger.logUserAction = (message, userId, metadata = {}) => {
  logger.info(message, { userId, ...metadata, category: 'user_action' });
};

logger.logStripeEvent = (message, metadata = {}) => {
  logger.info(message, { ...metadata, category: 'stripe' });
};

logger.logAuthEvent = (message, metadata = {}) => {
  logger.info(message, { ...metadata, category: 'auth' });
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

module.exports = logger;