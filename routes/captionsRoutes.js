const express = require('express');
const { streamAssistantResponse } = require('../controllers/captionController');
const router = express.Router();

router.get('/stream', streamAssistantResponse);

module.exports = router;
