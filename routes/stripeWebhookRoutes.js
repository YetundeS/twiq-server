const express = require('express');
const router = express.Router();
const { webhookLimiter } = require('../middlewares/rateLimitMiddleware');
const { trackSubscription } = require('../controllers/stripeController');

router.post('/', webhookLimiter, express.raw({ type: 'application/json' }), trackSubscription);

module.exports = router;
