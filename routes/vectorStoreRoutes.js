const express = require('express');
const router = express.Router();
const { isAuthenticatedUser } = require('../middlewares/authMiddleware');
const { strictSanitization } = require('../middlewares/inputSanitizationMiddleware');
const vectorStoreService = require('../services/vectorStoreService');
const { supabase } = require('../config/supabaseClient');
const logger = require('../utils/logger');

// Get vector store health status
router.get('/health', isAuthenticatedUser, strictSanitization, async (req, res) => {
  try {
    const user_id = req.user.id;
    
    // Get user's vector stores
    const { data: stores, error } = await supabase
      .from('vector_stores')
      .select('id, openai_id, user_id, session_id, assistant_slug, expires_at, file_count, created_at, updated_at, status')
      .eq('user_id', user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const healthStats = {
      total_stores: stores.length,
      active_stores: stores.filter(s => s.status === 'active').length,
      expired_stores: stores.filter(s => s.status === 'expired').length,
      recreating_stores: stores.filter(s => s.status === 'recreating').length,
      stores: stores.map(store => ({
        id: store.id,
        store_id: store.store_id,
        name: store.name,
        status: store.status,
        file_count: store.file_count,
        expires_at: store.expires_at,
        expired_at: store.expired_at,
        created_at: store.created_at
      }))
    };

    res.json(healthStats);
  } catch (error) {
    logger.logSystemError('Vector store health check failed', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to get vector store health' });
  }
});

// Get vector store statistics
router.get('/stats', isAuthenticatedUser, strictSanitization, async (req, res) => {
  try {
    // Get global statistics
    const { data: globalStats, error: globalError } = await supabase
      .from('vector_stores')
      .select('status, file_count')
      .not('status', 'eq', null);

    if (globalError) throw globalError;

    const stats = {
      global: {
        total: globalStats.length,
        active: globalStats.filter(s => s.status === 'active').length,
        expired: globalStats.filter(s => s.status === 'expired').length,
        recreating: globalStats.filter(s => s.status === 'recreating').length,
        total_files: globalStats.reduce((sum, s) => sum + (s.file_count || 0), 0)
      },
      user: {
        user_id: req.user.id,
        stores: globalStats.filter(s => s.user_id === req.user.id).length
      }
    };

    res.json(stats);
  } catch (error) {
    logger.logSystemError('Vector store stats failed', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to get vector store statistics' });
  }
});

// Force cleanup expired stores (admin endpoint)
router.post('/cleanup', isAuthenticatedUser, strictSanitization, async (req, res) => {
  try {
    const user_id = req.user.id;
    
    // Get expired stores for this user
    const { data: expiredStores, error } = await supabase
      .from('vector_stores')
      .select('id, openai_id, user_id, session_id, assistant_slug, expires_at, file_count, created_at, updated_at, status')
      .eq('user_id', user_id)
      .eq('status', 'expired');

    if (error) throw error;

    const cleanupResults = [];
    
    for (const store of expiredStores) {
      const deleteResult = await vectorStoreService.delete(store.store_id);
      cleanupResults.push({
        store_id: store.store_id,
        success: deleteResult.success,
        error: deleteResult.success ? null : deleteResult.error
      });
    }

    res.json({
      message: 'Cleanup completed',
      results: cleanupResults,
      total_processed: expiredStores.length
    });
  } catch (error) {
    logger.logSystemError('Vector store cleanup failed', error, { userId: req.user?.id });
    res.status(500).json({ error: 'Failed to cleanup vector stores' });
  }
});

module.exports = router;