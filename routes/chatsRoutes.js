const express = require('express');
const { listChatSessionsPerModel, listAllChatSessions, getMessagesBySession, fetchOneChatSession } = require('../controllers/chats');
const { isAuthenticatedUser } = require('../middlewares/authMiddleware');
const router = express.Router();



router.get('/', isAuthenticatedUser, listChatSessionsPerModel);
router.get('/all', isAuthenticatedUser, listAllChatSessions);
router.get('/fetchOne/:sessionId', isAuthenticatedUser, fetchOneChatSession);
router.get('/fetch/:sessionId', isAuthenticatedUser, getMessagesBySession );

module.exports = router;
