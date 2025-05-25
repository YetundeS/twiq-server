const express = require('express');
const { streamAssistantResponse } = require('../controllers/headlineController');
const router = express.Router();

router.get('/stream', streamAssistantResponse);

module.exports = router;
