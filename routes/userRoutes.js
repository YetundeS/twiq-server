const express = require('express');
const { signup, login, resetPassword, logout, getUser } = require('../controllers/authController');
const { isAuthenticatedUser } = require('../middlewares/authMiddleware');

const router = express.Router();

// Routes
router.post('/signup', signup);           // Signup endpoint
router.post('/login', login);             // Login endpoint
router.post("/logout", logout);        // Logout User
router.post('/reset-password', resetPassword); // Reset Password endpoint (optional)
router.get('/getUser', isAuthenticatedUser, getUser);  // Request Reset Password

module.exports = router;