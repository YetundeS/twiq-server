const express = require('express');
const router = express.Router();
const { isAuthenticatedUser } = require('../middlewares/authMiddleware');
const { sendMessage } = require('../controllers/chatMessagesController');

router.post('/create', isAuthenticatedUser, sendMessage);

module.exports = router;
