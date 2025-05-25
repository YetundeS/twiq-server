const express = require('express');
const { createNewChat, listChatSessionsPerModel, listAllChatSessions, streamAssistantResponse } = require('../controllers/chats');
const router = express.Router();

router.post('/new', createNewChat);
router.get('/', listChatSessionsPerModel);
router.get('/all', listAllChatSessions);
router.get('/stream/:chatId', streamAssistantResponse);

module.exports = router;
