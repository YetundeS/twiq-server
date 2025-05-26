const express = require('express');
const { suggestPrompts } = require('../controllers/suggestPromptsController');
const { isAuthenticatedUser } = require('../middlewares/authMiddleware');

const router = express.Router();

// Routes
router.get('/', isAuthenticatedUser, suggestPrompts);

module.exports = router;