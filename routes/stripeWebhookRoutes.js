const express = require('express');
const router = express.Router();
const { trackSubscription } = require('../controllers/stripeController');

router.post('/', express.raw({ type: 'application/json' }), trackSubscription);

module.exports = router;
