const express = require('express');
const router = express.Router();
const { isAuthenticatedUser } = require('../middlewares/authMiddleware');
const vectorStoreService = require('../services/vectorStoreService');
const { supabase } = require('../config/supabaseClient');

// Get vector store health status
router.get('/health', isAuthenticatedUser, async (req, res) => {
  try {
    const user_id = req.user.id;
    
    // Get user's vector stores
    const { data: stores, error } = await supabase
      .from('vector_stores')
      .select('*')
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
    console.error('Vector store health check failed:', error);
    res.status(500).json({ error: 'Failed to get vector store health' });
  }
});

// Get vector store statistics
router.get('/stats', isAuthenticatedUser, async (req, res) => {
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
    console.error('Vector store stats failed:', error);
    res.status(500).json({ error: 'Failed to get vector store statistics' });
  }
});

// Force cleanup expired stores (admin endpoint)
router.post('/cleanup', isAuthenticatedUser, async (req, res) => {
  try {
    const user_id = req.user.id;
    
    // Get expired stores for this user
    const { data: expiredStores, error } = await supabase
      .from('vector_stores')
      .select('*')
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
    console.error('Vector store cleanup failed:', error);
    res.status(500).json({ error: 'Failed to cleanup vector stores' });
  }
});

module.exports = router;