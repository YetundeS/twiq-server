const express = require('express');
const { streamAssistantResponse } = require('../controllers/linkedinBusinessController');
const router = express.Router();

router.get('/stream', streamAssistantResponse);

module.exports = router;
