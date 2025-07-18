const express = require('express');
const { signup, login, resetPassword, logout, getUser, uploadProfilePicture, resendEmailConfirmation, verifyEmailToken, softDeleteAccount } = require('../controllers/authController');
const { isAuthenticatedUser } = require('../middlewares/authMiddleware');
const { default: upload } = require('../middlewares/uploadMiddleware');

const router = express.Router();

// Routes
router.post('/signup', signup);           // Signup endpoint
router.post('/login', login);             // Login endpoint
router.post('/resend-email-confirmation', isAuthenticatedUser, resendEmailConfirmation);             // resend email confirmation
router.post('/verify-email-token', verifyEmailToken);             // verify email confirmation token
router.get('/getUser', isAuthenticatedUser, getUser);  // fetch user
router.post("/logout", logout);        // Logout User
router.post('/reset-password', resetPassword); // Reset Password endpoint (optional)
router.post("/upload-avatar", isAuthenticatedUser, upload.single("avatar"), uploadProfilePicture);
router.get('/delete-account', isAuthenticatedUser, softDeleteAccount);  // Delete account

module.exports = router;