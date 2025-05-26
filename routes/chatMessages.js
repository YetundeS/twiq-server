const express = require('express');
const router = express.Router();
const { isAuthenticatedUser } = require('../middlewares/authMiddleware');
const { createChatMessage } = require('../controllers/chatMessagesController');

router.post('/create', isAuthenticatedUser, createChatMessage);

module.exports = router;
