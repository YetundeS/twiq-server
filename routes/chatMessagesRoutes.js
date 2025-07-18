const express = require('express');
const router = express.Router();
const { isAuthenticatedUser } = require('../middlewares/authMiddleware');
const { sendMessage } = require('../controllers/chatMessagesController');
const { default: chatFileUpload } = require('../middlewares/fileUploadMiddleware');

router.post('/create', isAuthenticatedUser, chatFileUpload.array('files', 5), sendMessage);

module.exports = router;
