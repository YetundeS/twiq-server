const vectorStoreService = require('../services/vectorStoreService');
const VectorStoreErrorHandler = require('../utils/vectorStoreErrorHandler');

/**
 * Middleware to validate and manage vector stores for requests
 */
class VectorStoreMiddleware {
  
  /**
   * Validate vector store exists and is not expired
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static async validateVectorStore(req, res, next) {
    try {
      const { vectorStoreId } = req.body || req.params || req.query;
      
      if (!vectorStoreId) {
        return next(); // No vector store ID provided, continue without validation
      }

      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
      }

      // Validate the vector store
      const isValid = await vectorStoreService.validateVectorStore(vectorStoreId);
      
      if (!isValid) {
        console.log(`⚠️ Vector store ${vectorStoreId} is expired, attempting recreation...`);
        
        // Attempt to recreate the expired vector store
        const recoveryResult = await VectorStoreErrorHandler.handleExpiredVectorStore(
          new Error(`Vector store ${vectorStoreId} expired`),
          userId,
          { vectorStoreId }
        );

        if (recoveryResult.success) {
          // Update request with new vector store ID
          if (req.body.vectorStoreId) req.body.vectorStoreId = recoveryResult.newVectorStore.id;
          if (req.params.vectorStoreId) req.params.vectorStoreId = recoveryResult.newVectorStore.id;
          if (req.query.vectorStoreId) req.query.vectorStoreId = recoveryResult.newVectorStore.id;
          
          // Add recovery info to request context
          req.vectorStoreRecovered = true;
          req.originalVectorStoreId = vectorStoreId;
          req.newVectorStoreId = recoveryResult.newVectorStore.id;
          
          console.log(`✅ Vector store recreated: ${vectorStoreId} -> ${recoveryResult.newVectorStore.id}`);
        } else {
          return res.status(400).json({
            error: 'Vector store expired and could not be recreated',
            details: recoveryResult.error
          });
        }
      }

      next();

    } catch (error) {
      console.error('❌ Vector store validation failed:', error);
      
      // Log error for monitoring
      VectorStoreErrorHandler.logVectorStoreError(error, {
        route: req.route?.path,
        method: req.method,
        userId: req.user?.id,
        vectorStoreId: req.body?.vectorStoreId || req.params?.vectorStoreId || req.query?.vectorStoreId
      });

      res.status(500).json({
        error: 'Vector store validation failed',
        message: error.message
      });
    }
  }

  /**
   * Ensure user has a valid vector store for their session
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static async ensureSessionVectorStore(req, res, next) {
    try {
      const userId = req.user?.id;
      const sessionId = req.body?.session_id || req.params?.sessionId;
      const fileIds = req.body?.fileIds || [];

      if (!userId) {
        return res.status(401).json({ error: 'User authentication required' });
      }

      if (!sessionId) {
        return res.status(400).json({ error: 'Session ID required' });
      }

      // Get or create vector store for session
      const result = await vectorStoreService.getOrCreateSessionVectorStore(
        userId, 
        sessionId, 
        fileIds
      );

      if (!result.success) {
        return res.status(500).json({
          error: 'Failed to manage session vector store',
          details: result.error
        });
      }

      // Add vector store info to request
      req.vectorStore = result.vectorStore;
      req.vectorStoreRecord = result.storeRecord;
      req.isNewVectorStore = result.isNew;

      console.log(`${result.isNew ? '🆕' : '♻️'} Vector store for session ${sessionId}: ${result.vectorStore.id}`);

      next();

    } catch (error) {
      console.error('❌ Failed to ensure session vector store:', error);
      
      VectorStoreErrorHandler.logVectorStoreError(error, {
        route: req.route?.path,
        method: req.method,
        userId: req.user?.id,
        sessionId: req.body?.session_id || req.params?.sessionId
      });

      res.status(500).json({
        error: 'Failed to manage session vector store',
        message: error.message
      });
    }
  }

  /**
   * Add vector store recovery context to request
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static addRecoveryContext(req, res, next) {
    // Add recovery helper methods to request
    req.withVectorStoreRecovery = async (apiCall, context = {}) => {
      const userId = req.user?.id;
      if (!userId) {
        throw new Error('User authentication required for vector store recovery');
      }

      return await VectorStoreErrorHandler.withVectorStoreRecovery(
        apiCall,
        userId,
        context,
        1 // Allow 1 retry
      );
    };

    // Add error handler
    req.handleVectorStoreError = (error, context = {}) => {
      VectorStoreErrorHandler.logVectorStoreError(error, {
        ...context,
        route: req.route?.path,
        method: req.method,
        userId: req.user?.id
      });
    };

    next();
  }

  /**
   * Cleanup expired vector stores periodically
   * This can be called as a background job or via cron
   */
  static async performCleanup() {
    try {
      console.log('🧹 Starting vector store cleanup...');
      
      const cleanedCount = await vectorStoreService.cleanupExpiredStores();
      
      console.log(`✅ Vector store cleanup completed: ${cleanedCount} stores marked as expired`);
      
      return { success: true, cleanedCount };

    } catch (error) {
      console.error('❌ Vector store cleanup failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Proactive recreation of expiring vector stores
   * Run this as a background job to recreate stores before they expire
   */
  static async proactiveRecreation() {
    try {
      console.log('🔄 Starting proactive vector store recreation...');
      
      const expiringStores = await vectorStoreService.getExpiringVectorStores();
      let recreatedCount = 0;
      
      for (const store of expiringStores) {
        console.log(`🔄 Proactively recreating expiring store: ${store.store_id}`);
        
        const result = await vectorStoreService.recreateExpiredVectorStore(
          store.store_id, 
          store.user_id
        );
        
        if (result.success) {
          recreatedCount++;
          console.log(`✅ Proactively recreated: ${store.store_id} -> ${result.vectorStore.id}`);
        } else {
          console.error(`❌ Failed to proactively recreate ${store.store_id}:`, result.error);
        }
      }
      
      console.log(`✅ Proactive recreation completed: ${recreatedCount}/${expiringStores.length} stores recreated`);
      
      return { success: true, recreatedCount, totalExpiring: expiringStores.length };

    } catch (error) {
      console.error('❌ Proactive recreation failed:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = VectorStoreMiddleware;