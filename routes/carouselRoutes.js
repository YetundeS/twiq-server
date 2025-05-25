const express = require('express');
const { streamAssistantResponse } = require('../controllers/carouselController');
const router = express.Router();

router.get('/stream', streamAssistantResponse);

module.exports = router;
