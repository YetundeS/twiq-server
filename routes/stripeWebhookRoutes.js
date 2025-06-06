const express = require('express');
const router = express.Router();
const { trackSubscription } = require('../controllers/stripeController');

router.post('/webhooks', express.raw({ type: 'application/json' }), trackSubscription);

module.exports = router;
