const vectorStoreService = require('../services/vectorStoreService');

class VectorStoreErrorHandler {
  
  /**
   * Check if error is related to expired vector store
   * @param {Error} error - Error object
   * @returns {boolean} Whether error indicates expired vector store
   */
  static isVectorStoreExpiredError(error) {
    if (!error) return false;
    
    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code?.toLowerCase() || '';
    
    // Common expired vector store error patterns
    const expiredPatterns = [
      'vector_store_expired',
      'vector store expired',
      'vector store not found',
      'expired',
      'no longer available'
    ];
    
    return expiredPatterns.some(pattern => 
      errorMessage.includes(pattern) || errorCode.includes(pattern)
    ) || error.status === 404;
  }

  /**
   * Extract vector store ID from error context
   * @param {Error} error - Error object
   * @param {Object} context - Additional context (request data, etc.)
   * @returns {string|null} Vector store ID if found
   */
  static extractVectorStoreId(error, context = {}) {
    // Try to extract from error message
    const errorMessage = error.message || '';
    const storeIdMatch = errorMessage.match(/vector_store[_-]([a-zA-Z0-9_-]+)/i);
    if (storeIdMatch) {
      return storeIdMatch[1];
    }

    // Try to extract from context
    if (context.vectorStoreId) {
      return context.vectorStoreId;
    }

    if (context.storeId) {
      return context.storeId;
    }

    return null;
  }

  /**
   * Handle expired vector store with automatic recreation
   * @param {Error} error - Original error
   * @param {string} userId - User ID
   * @param {Object} context - Error context
   * @returns {Object} Recovery result
   */
  static async handleExpiredVectorStore(error, userId, context = {}) {
    try {
      console.log('🔄 Handling expired vector store error:', error.message);

      const storeId = this.extractVectorStoreId(error, context);
      if (!storeId) {
        return {
          success: false,
          error: 'Could not identify expired vector store ID',
          shouldRetry: false
        };
      }

      // Attempt to recreate the expired vector store
      const recreationResult = await vectorStoreService.recreateExpiredVectorStore(storeId, userId);
      
      if (recreationResult.success) {
        return {
          success: true,
          newVectorStore: recreationResult.vectorStore,
          message: 'Vector store recreated successfully',
          shouldRetry: true,
          retryContext: {
            ...context,
            vectorStoreId: recreationResult.vectorStore.id,
            isRecreated: true
          }
        };
      } else {
        return {
          success: false,
          error: `Failed to recreate vector store: ${recreationResult.error}`,
          shouldRetry: false
        };
      }

    } catch (recoveryError) {
      console.error('❌ Failed to handle expired vector store:', recoveryError);
      return {
        success: false,
        error: `Recovery failed: ${recoveryError.message}`,
        shouldRetry: false
      };
    }
  }

  /**
   * Wrapper for OpenAI API calls with automatic vector store recovery
   * @param {Function} apiCall - Function that makes the OpenAI API call
   * @param {string} userId - User ID
   * @param {Object} context - Call context
   * @param {number} maxRetries - Maximum retry attempts
   * @returns {Promise<any>} API call result
   */
  static async withVectorStoreRecovery(apiCall, userId, context = {}, maxRetries = 1) {
    let lastError = null;
    let attempts = 0;

    while (attempts <= maxRetries) {
      try {
        return await apiCall(context);
      } catch (error) {
        lastError = error;
        attempts++;

        console.log(`🔄 API call attempt ${attempts} failed:`, error.message);

        // Check if this is a vector store expiration error
        if (this.isVectorStoreExpiredError(error) && attempts <= maxRetries) {
          console.log('🔄 Detected expired vector store, attempting recovery...');

          const recoveryResult = await this.handleExpiredVectorStore(error, userId, context);
          
          if (recoveryResult.success && recoveryResult.shouldRetry) {
            console.log('✅ Vector store recreated, retrying API call...');
            // Update context with new vector store ID for retry
            context = { ...context, ...recoveryResult.retryContext };
            continue;
          } else {
            console.log('❌ Vector store recovery failed:', recoveryResult.error);
            throw new Error(`Vector store recovery failed: ${recoveryResult.error}`);
          }
        } else {
          // Not a vector store error or max retries reached
          throw error;
        }
      }
    }

    throw lastError;
  }

  /**
   * Create a recovery-enabled wrapper for vector store operations
   * @param {Object} operations - Object containing vector store operations
   * @param {string} userId - User ID
   * @returns {Object} Wrapped operations with automatic recovery
   */
  static createRecoveryWrapper(operations, userId) {
    const wrappedOps = {};

    for (const [opName, opFunction] of Object.entries(operations)) {
      wrappedOps[opName] = async (context = {}) => {
        return await this.withVectorStoreRecovery(
          opFunction,
          userId,
          context,
          1 // Allow 1 retry for vector store recovery
        );
      };
    }

    return wrappedOps;
  }

  /**
   * Log vector store error for monitoring
   * @param {Error} error - Error object
   * @param {Object} context - Error context
   */
  static logVectorStoreError(error, context = {}) {
    const logData = {
      timestamp: new Date().toISOString(),
      error: error.message,
      errorCode: error.code,
      errorStatus: error.status,
      context,
      isVectorStoreError: this.isVectorStoreExpiredError(error)
    };

    console.error('📊 Vector Store Error Log:', JSON.stringify(logData, null, 2));

    // Here you could integrate with monitoring services like:
    // - Sentry
    // - DataDog
    // - CloudWatch
    // - Custom analytics
  }
}

module.exports = VectorStoreErrorHandler;