const express = require('express');
const { streamAssistantResponse } = require('../controllers/storytellerController');
const router = express.Router();

router.get('/stream', streamAssistantResponse);

module.exports = router;
