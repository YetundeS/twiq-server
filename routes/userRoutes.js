const express = require('express');
const { signup, login, resetPassword, logout, getUser, uploadProfilePicture, resendEmailConfirmation, verifyEmailToken, softDeleteAccount } = require('../controllers/authController');
const { isAuthenticatedUser } = require('../middlewares/authMiddleware');
const { default: upload } = require('../middlewares/uploadMiddleware');
const { authLimiter, emailVerificationLimiter, passwordResetLimiter } = require('../middlewares/rateLimitMiddleware');
const { authSanitization } = require('../middlewares/inputSanitizationMiddleware');

const router = express.Router();

// Routes with rate limiting and input sanitization
router.post('/signup', authLimiter, authSanitization, signup);           
router.post('/login', authLimiter, authSanitization, login);             
router.post('/resend-email-confirmation', emailVerificationLimiter, isAuthenticatedUser, resendEmailConfirmation);             
router.post('/verify-email-token', emailVerificationLimiter, authSanitization, verifyEmailToken);             
router.get('/getUser', isAuthenticatedUser, getUser);  
router.post("/logout", authSanitization, logout);        
router.post('/reset-password', passwordResetLimiter, authSanitization, resetPassword); 
router.post("/upload-avatar", isAuthenticatedUser, upload.single("avatar"), uploadProfilePicture);
router.get('/delete-account', isAuthenticatedUser, softDeleteAccount);

module.exports = router;