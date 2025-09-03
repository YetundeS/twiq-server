const { encoding_for_model } = require('@dqbd/tiktoken');
const logger = require('./logger');

// Cache for encoding instances
const encodingCache = new Map();

/**
 * Get or create an encoding instance for a specific model
 * @param {string} model - The model name (e.g., 'gpt-4', 'gpt-3.5-turbo')
 * @returns {Object} - The encoding instance
 */
const getEncodingForModel = (model) => {
  // Check cache first
  if (encodingCache.has(model)) {
    return encodingCache.get(model);
  }

  // Create new encoding instance
  try {
    const encoding = encoding_for_model(model);
    encodingCache.set(model, encoding);
    return encoding;
  } catch (error) {
    logger.logSystemError('Failed to create encoding for model', error, { model, fallbackModel: 'gpt-4' });
    // Fallback to a default model encoding
    const defaultModel = 'gpt-4';
    if (!encodingCache.has(defaultModel)) {
      const defaultEncoding = encoding_for_model(defaultModel);
      encodingCache.set(defaultModel, defaultEncoding);
    }
    return encodingCache.get(defaultModel);
  }
};

/**
 * Count tokens in a text string
 * @param {string} text - The text to count tokens for
 * @param {string} model - The model to use for encoding (default: 'gpt-4')
 * @returns {number} - The number of tokens
 */
const countTokens = (text, model = 'gpt-4') => {
  if (!text) return 0;
  
  const encoding = getEncodingForModel(model);
  try {
    const tokens = encoding.encode(text);
    return tokens.length;
  } catch (error) {
    logger.logSystemError('Error counting tokens', error, { textLength: text.length, model });
    // Rough estimation as fallback: ~4 characters per token
    return Math.ceil(text.length / 4);
  }
};

/**
 * Batch count tokens for multiple texts
 * @param {string[]} texts - Array of texts to count tokens for
 * @param {string} model - The model to use for encoding
 * @returns {number[]} - Array of token counts
 */
const batchCountTokens = (texts, model = 'gpt-4') => {
  const encoding = getEncodingForModel(model);
  
  return texts.map(text => {
    if (!text) return 0;
    try {
      const tokens = encoding.encode(text);
      return tokens.length;
    } catch (error) {
      logger.logSystemError('Error counting tokens in batch', error, { textIndex: texts.indexOf(text), model });
      return Math.ceil(text.length / 4);
    }
  });
};

/**
 * Estimate tokens for a chat conversation
 * @param {Array} messages - Array of message objects with 'role' and 'content'
 * @param {string} model - The model to use for encoding
 * @returns {number} - Total estimated tokens
 */
const estimateChatTokens = (messages, model = 'gpt-4') => {
  const encoding = getEncodingForModel(model);
  let totalTokens = 0;

  // Add tokens for message formatting overhead
  const messageOverhead = 4; // Approximate tokens per message for formatting
  
  messages.forEach(message => {
    // Count content tokens
    if (message.content) {
      totalTokens += countTokens(message.content, model);
    }
    
    // Add role tokens and formatting
    totalTokens += countTokens(message.role, model) + messageOverhead;
  });

  // Add tokens for conversation structure
  totalTokens += 3; // Additional tokens for conversation wrapper

  return totalTokens;
};

/**
 * Clean up encoding instances (call during shutdown)
 */
const cleanupEncodings = () => {
  encodingCache.forEach(encoding => {
    if (encoding.free) {
      encoding.free();
    }
  });
  encodingCache.clear();
};

// Handle process termination
process.on('SIGINT', cleanupEncodings);
process.on('SIGTERM', cleanupEncodings);

module.exports = {
  getEncodingForModel,
  countTokens,
  batchCountTokens,
  estimateChatTokens,
  cleanupEncodings
};