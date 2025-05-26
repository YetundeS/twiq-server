const express = require('express');
const { createNewChat, listChatSessionsPerModel, listAllChatSessions, streamAssistantResponse } = require('../controllers/chats');
const { isAuthenticatedUser } = require('../middlewares/authMiddleware');
const router = express.Router();

router.post('/new', isAuthenticatedUser, createNewChat);
router.get('/', isAuthenticatedUser, listChatSessionsPerModel);
router.get('/all', isAuthenticatedUser, listAllChatSessions);
router.get('/stream/:chatId', isAuthenticatedUser, streamAssistantResponse);

module.exports = router;
