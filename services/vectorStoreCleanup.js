const VectorStoreMiddleware = require('../middlewares/vectorStoreMiddleware');
const vectorStoreService = require('./vectorStoreService');

class VectorStoreCleanupService {
  constructor() {
    this.isRunning = false;
    this.cleanupInterval = null;
    this.proactiveRecreationInterval = null;
  }

  /**
   * Start the background cleanup services
   */
  start() {
    if (this.isRunning) {
      console.log('⚠️ Vector store cleanup service is already running');
      return;
    }

    console.log('🚀 Starting vector store cleanup service...');

    // Schedule cleanup every 6 hours (6 * 60 * 60 * 1000 ms)
    this.cleanupInterval = setInterval(async () => {
      console.log('🧹 Running scheduled vector store cleanup...');
      await this.performScheduledCleanup();
    }, 6 * 60 * 60 * 1000);

    // Schedule proactive recreation every 12 hours (12 * 60 * 60 * 1000 ms)
    this.proactiveRecreationInterval = setInterval(async () => {
      console.log('🔄 Running scheduled proactive vector store recreation...');
      await this.performProactiveRecreation();
    }, 12 * 60 * 60 * 1000);

    this.isRunning = true;
    console.log('✅ Vector store cleanup service started');
    console.log('   📅 Cleanup runs every 6 hours');
    console.log('   🔄 Proactive recreation runs every 12 hours');
  }

  /**
   * Stop the background cleanup services
   */
  stop() {
    if (!this.isRunning) {
      console.log('⚠️ Vector store cleanup service is not running');
      return;
    }

    console.log('🛑 Stopping vector store cleanup service...');

    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.proactiveRecreationInterval) {
      clearInterval(this.proactiveRecreationInterval);
      this.proactiveRecreationInterval = null;
    }

    this.isRunning = false;
    console.log('✅ Vector store cleanup service stopped');
  }

  /**
   * Perform scheduled cleanup of expired vector stores
   */
  async performScheduledCleanup() {
    try {
      const startTime = Date.now();
      console.log('🧹 Starting scheduled vector store cleanup...');

      const result = await VectorStoreMiddleware.performCleanup();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (result.success) {
        console.log(`✅ Scheduled cleanup completed in ${duration}s`);
        console.log(`   📊 Expired stores marked: ${result.cleanedCount}`);
        
        // Log cleanup metrics
        this.logCleanupMetrics({
          type: 'cleanup',
          success: true,
          cleanedCount: result.cleanedCount,
          duration: parseFloat(duration),
          timestamp: new Date().toISOString()
        });
      } else {
        console.error(`❌ Scheduled cleanup failed in ${duration}s:`, result.error);
        
        this.logCleanupMetrics({
          type: 'cleanup',
          success: false,
          error: result.error,
          duration: parseFloat(duration),
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('❌ Scheduled cleanup encountered an error:', error);
      
      this.logCleanupMetrics({
        type: 'cleanup',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Perform proactive recreation of expiring vector stores
   */
  async performProactiveRecreation() {
    try {
      const startTime = Date.now();
      console.log('🔄 Starting proactive vector store recreation...');

      const result = await VectorStoreMiddleware.proactiveRecreation();
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      
      if (result.success) {
        console.log(`✅ Proactive recreation completed in ${duration}s`);
        console.log(`   📊 Stores recreated: ${result.recreatedCount}/${result.totalExpiring}`);
        
        // Log recreation metrics
        this.logCleanupMetrics({
          type: 'proactive_recreation',
          success: true,
          recreatedCount: result.recreatedCount,
          totalExpiring: result.totalExpiring,
          duration: parseFloat(duration),
          timestamp: new Date().toISOString()
        });
      } else {
        console.error(`❌ Proactive recreation failed in ${duration}s:`, result.error);
        
        this.logCleanupMetrics({
          type: 'proactive_recreation',
          success: false,
          error: result.error,
          duration: parseFloat(duration),
          timestamp: new Date().toISOString()
        });
      }

    } catch (error) {
      console.error('❌ Proactive recreation encountered an error:', error);
      
      this.logCleanupMetrics({
        type: 'proactive_recreation',
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Run cleanup immediately (useful for testing or manual triggers)
   */
  async runCleanupNow() {
    console.log('🧹 Running immediate vector store cleanup...');
    await this.performScheduledCleanup();
  }

  /**
   * Run proactive recreation immediately
   */
  async runProactiveRecreationNow() {
    console.log('🔄 Running immediate proactive recreation...');
    await this.performProactiveRecreation();
  }

  /**
   * Get service status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      hasCleanupJob: !!this.cleanupJob,
      hasProactiveRecreationJob: !!this.proactiveRecreationJob,
      nextCleanupRun: this.cleanupJob ? 'Every 6 hours' : 'Not scheduled',
      nextProactiveRun: this.proactiveRecreationJob ? 'Every 12 hours' : 'Not scheduled'
    };
  }

  /**
   * Log cleanup metrics for monitoring
   * @param {Object} metrics - Metrics data
   */
  logCleanupMetrics(metrics) {
    console.log('📊 Vector Store Cleanup Metrics:', JSON.stringify(metrics, null, 2));
    
    // Here you could integrate with monitoring services:
    // - Send to database for historical tracking
    // - Send to monitoring service (DataDog, CloudWatch, etc.)
    // - Send metrics to analytics platform
    // - Trigger alerts if cleanup fails repeatedly
  }

  /**
   * Get cleanup statistics
   */
  async getCleanupStats() {
    try {
      const { supabase } = require('../config/supabaseClient');
      
      // Get counts of stores by status
      const { data: statusCounts } = await supabase
        .from('vector_stores')
        .select('status')
        .then(({ data }) => {
          const counts = { active: 0, expired: 0, recreating: 0 };
          data?.forEach(store => {
            counts[store.status] = (counts[store.status] || 0) + 1;
          });
          return { data: counts };
        });

      // Get expiring stores count
      const expiringStores = await vectorStoreService.getExpiringVectorStores();
      
      // Get recent activity
      const oneDayAgo = new Date();
      oneDayAgo.setDate(oneDayAgo.getDate() - 1);
      
      const { data: recentActivity } = await supabase
        .from('vector_stores')
        .select('id')
        .gte('created_at', oneDayAgo.toISOString());

      return {
        statusCounts: statusCounts || { active: 0, expired: 0, recreating: 0 },
        expiringCount: expiringStores.length,
        recentlyCreated: recentActivity?.length || 0,
        serviceStatus: this.getStatus()
      };

    } catch (error) {
      console.error('❌ Failed to get cleanup stats:', error);
      return {
        error: error.message,
        serviceStatus: this.getStatus()
      };
    }
  }
}

// Create singleton instance
const cleanupService = new VectorStoreCleanupService();

// Auto-start in production
if (process.env.NODE_ENV === 'production') {
  cleanupService.start();
  console.log('🚀 Vector store cleanup service auto-started in production mode');
}

module.exports = cleanupService;