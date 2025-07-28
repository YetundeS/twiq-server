const openai = require('../openai');
const { supabase } = require('../config/supabaseClient');

class VectorStoreService {
  constructor() {
    // Set extended expiration to 30 days (max allowed by OpenAI)
    this.DEFAULT_EXPIRATION_DAYS = 30;
  }

  /**
   * Create a new vector store with extended expiration
   * @param {string} userId - User ID
   * @param {string} name - Store name
   * @param {Array} fileIds - Array of OpenAI file IDs
   * @returns {Object} Vector store details
   */
  async createVectorStore(userId, name, fileIds = []) {
    try {
      const expiresAfterDays = this.DEFAULT_EXPIRATION_DAYS;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + expiresAfterDays);

      // Create vector store with OpenAI
      const vectorStore = await openai.vectorStores.create({
        name: name,
        expires_after: {
          anchor: 'last_active_at',
          days: expiresAfterDays
        },
        file_ids: fileIds
      });

      // Save to database
      const { data: storeRecord, error: dbError } = await supabase
        .from('vector_stores')
        .insert([{
          store_id: vectorStore.id,
          user_id: userId,
          name: name,
          file_count: fileIds.length,
          expires_at: expiresAt.toISOString(),
          status: 'active',
          openai_metadata: vectorStore
        }])
        .select()
        .single();

      if (dbError) throw dbError;

      // console.log(`✅ Created vector store ${vectorStore.id} for user ${userId} (expires: ${expiresAt.toISOString()})`);
      
      return {
        success: true,
        vectorStore: vectorStore,
        storeRecord: storeRecord
      };

    } catch (error) {
      console.error('❌ Failed to create vector store:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get or create vector store for user session
   * @param {string} userId - User ID
   * @param {string} sessionId - Chat session ID
   * @param {Array} fileIds - Array of file IDs to add
   * @returns {Object} Vector store details
   */
  async getOrCreateSessionVectorStore(userId, sessionId, fileIds = []) {
    try {
      // Check if session already has a vector store
      const { data: existingStore } = await supabase
        .from('vector_stores')
        .select('*')
        .eq('user_id', userId)
        .eq('session_id', sessionId)
        .eq('status', 'active')
        .single();

      if (existingStore) {
        // Check if store is still valid
        const isValid = await this.validateVectorStore(existingStore.store_id);
        if (isValid) {
          // Add new files to existing store if any
          if (fileIds.length > 0) {
            await this.addFilesToVectorStore(existingStore.store_id, fileIds);
          }
          return {
            success: true,
            vectorStore: { id: existingStore.store_id },
            storeRecord: existingStore,
            isNew: false
          };
        } else {
          // Mark as expired and create new one
          await this.markStoreExpired(existingStore.store_id);
        }
      }

      // Create new vector store
      const storeName = `Session_${sessionId}_${Date.now()}`;
      const result = await this.createVectorStore(userId, storeName, fileIds);
      
      if (result.success) {
        // Link to session
        await supabase
          .from('vector_stores')
          .update({ session_id: sessionId })
          .eq('store_id', result.vectorStore.id);
      }

      return {
        ...result,
        isNew: true
      };

    } catch (error) {
      console.error('❌ Failed to get/create session vector store:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Add files to existing vector store
   * @param {string} storeId - Vector store ID
   * @param {Array} fileIds - Array of file IDs to add
   */
  async addFilesToVectorStore(storeId, fileIds) {
    try {
      if (!fileIds || fileIds.length === 0) return;

      await openai.vectorStores.files.createBatch(storeId, {
        file_ids: fileIds
      });

      // Update file count in database
      await supabase
        .from('vector_stores')
        .update({ 
          file_count: supabase.raw('file_count + ?', [fileIds.length]),
          updated_at: new Date().toISOString()
        })
        .eq('store_id', storeId);

      console.log(`✅ Added ${fileIds.length} files to vector store ${storeId}`);

    } catch (error) {
      console.error('❌ Failed to add files to vector store:', error);
      throw error;
    }
  }

  /**
   * Validate if vector store still exists and is active
   * @param {string} storeId - Vector store ID
   * @returns {boolean} Whether store is valid
   */
  async validateVectorStore(storeId) {
    try {
      const vectorStore = await openai.vectorStores.retrieve(storeId);
      return vectorStore.status !== 'expired';
    } catch (error) {
      if (error.status === 404 || error.message.includes('expired')) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Handle expired vector store by recreating it
   * @param {string} storeId - Expired store ID
   * @param {string} userId - User ID
   * @returns {Object} New vector store details
   */
  async recreateExpiredVectorStore(storeId, userId) {
    try {
      // Get original store details
      const { data: originalStore } = await supabase
        .from('vector_stores')
        .select('*')
        .eq('store_id', storeId)
        .single();

      if (!originalStore) {
        throw new Error('Original store record not found');
      }

      // Get files that were in the original store
      const { data: storeFiles } = await supabase
        .from('chat_files')
        .select('openai_file_id')
        .eq('vector_store_id', storeId);

      const fileIds = storeFiles?.map(f => f.openai_file_id) || [];

      // Create new vector store
      const newStoreName = `${originalStore.name}_recreated_${Date.now()}`;
      const result = await this.createVectorStore(userId, newStoreName, fileIds);

      if (result.success) {
        // Update session reference if exists
        if (originalStore.session_id) {
          await supabase
            .from('vector_stores')
            .update({ session_id: originalStore.session_id })
            .eq('store_id', result.vectorStore.id);
        }

        // Update file references
        if (fileIds.length > 0) {
          await supabase
            .from('chat_files')
            .update({ vector_store_id: result.vectorStore.id })
            .eq('vector_store_id', storeId);
        }

        // Mark original as expired
        await this.markStoreExpired(storeId);

        console.log(`✅ Recreated expired vector store ${storeId} -> ${result.vectorStore.id}`);
      }

      return result;

    } catch (error) {
      console.error('❌ Failed to recreate expired vector store:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Mark vector store as expired in database
   * @param {string} storeId - Vector store ID
   */
  async markStoreExpired(storeId) {
    await supabase
      .from('vector_stores')
      .update({ 
        status: 'expired',
        expired_at: new Date().toISOString()
      })
      .eq('store_id', storeId);
  }

  /**
   * Get expiring vector stores (within next 2 days)
   * @returns {Array} List of expiring stores
   */
  async getExpiringVectorStores() {
    const twoDaysFromNow = new Date();
    twoDaysFromNow.setDate(twoDaysFromNow.getDate() + 2);

    const { data: expiringStores } = await supabase
      .from('vector_stores')
      .select('*')
      .eq('status', 'active')
      .lte('expires_at', twoDaysFromNow.toISOString());

    return expiringStores || [];
  }

  /**
   * Delete vector store from OpenAI and database
   * @param {string} storeId - Vector store ID
   * @returns {Object} Deletion result
   */
  async delete(storeId) {
    try {
      // Delete from OpenAI first
      await openai.vectorStores.del(storeId);
      
      // Mark as deleted in database
      const { error: dbError } = await supabase
        .from('vector_stores')
        .update({ 
          status: 'deleted',
          expired_at: new Date().toISOString()
        })
        .eq('store_id', storeId);

      if (dbError) throw dbError;

      console.log(`🗑️ Deleted vector store: ${storeId}`);
      
      return {
        success: true,
        message: 'Vector store deleted successfully'
      };

    } catch (error) {
      console.error('❌ Failed to delete vector store:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Cleanup expired vector stores
   */
  async cleanupExpiredStores() {
    try {
      const { data: expiredStores } = await supabase
        .from('vector_stores')
        .select('*')
        .eq('status', 'active')
        .lte('expires_at', new Date().toISOString());

      for (const store of expiredStores || []) {
        await this.markStoreExpired(store.store_id);
        console.log(`🧹 Marked expired vector store: ${store.store_id}`);
      }

      return expiredStores?.length || 0;

    } catch (error) {
      console.error('❌ Failed to cleanup expired stores:', error);
      return 0;
    }
  }
}

module.exports = new VectorStoreService();