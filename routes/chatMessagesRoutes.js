const express = require('express');
const router = express.Router();
const { isAuthenticatedUser } = require('../middlewares/authMiddleware');
const { sendMessage } = require('../controllers/chatMessagesController');
const { default: chatFileUpload } = require('../middlewares/fileUploadMiddleware');
const { chatMessageLimiter, fileUploadLimiter, subscriptionQuotaCheck } = require('../middlewares/rateLimitMiddleware');
const { deduplicationMiddleware } = require('../middlewares/deduplicationMiddleware');
const VectorStoreMiddleware = require('../middlewares/vectorStoreMiddleware');

// Apply rate limiting: chat message limiter first, then file upload limiter if files present
router.post('/create', 
  isAuthenticatedUser,
  chatMessageLimiter,
  subscriptionQuotaCheck,
  VectorStoreMiddleware.addRecoveryContext,
  deduplicationMiddleware({
    ttl: 30000, // 30 seconds
    onDuplicate: (req, existing) => {
      console.log(`Duplicate request detected for user ${req.user.id}, original request: ${existing.id}`);
    }
  }),
  (req, res, next) => {
    // Apply file upload limiter only if files are being uploaded
    if (req.headers['content-type']?.includes('multipart/form-data')) {
      fileUploadLimiter(req, res, next);
    } else {
      next();
    }
  },
  chatFileUpload.array('files', 5), 
  sendMessage
);

module.exports = router;
