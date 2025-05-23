const express = require('express');
const { suggestPrompts } = require('../controllers/suggestPromptsController');

const router = express.Router();

// Routes
router.get('/', suggestPrompts);

module.exports = router;