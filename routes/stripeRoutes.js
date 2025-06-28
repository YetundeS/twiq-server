const express = require('express');
const router = express.Router();
const { isAuthenticatedUser } = require('../middlewares/authMiddleware');
const { createCheckoutSession,  createBillingPortalSession, buyTWIQCredit } = require('../controllers/stripeController');

router.post('/create-checkout-session', isAuthenticatedUser, createCheckoutSession);
router.post('/billing-portal', isAuthenticatedUser, createBillingPortalSession);
router.post('/buy-credits', isAuthenticatedUser, buyTWIQCredit);

module.exports = router;
