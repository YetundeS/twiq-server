const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');

const userRoutes = require('./routes/userRoutes.js');
const suggestPromptsRoutes = require('./routes/suggestPromptsRoutes.js');
const chatsRoutes = require('./routes/chats.js');
const chatMessagesRoutes = require('./routes/chatMessages.js');
const stripeRoutes = require('./routes/stripeRoutes.js');
const stripeWebhookRoutes = require('./routes/stripeWebhookRoutes.js');
const cookieParser = require('cookie-parser');

const app = express();


// ✅ This route uses express.raw internally, so mount it first
app.use('/api/stripe/webhook', stripeWebhookRoutes);


dotenv.config(); // Load environment variables

// Middleware
app.use(cors({
  origin: ["http://localhost:3000", "https://twiq.vercel.app"],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Content-Length", "X-Requested-With"],
}));



app.use(bodyParser.json());
app.use(cookieParser());

app.options(/.*/, cors({
  origin: ["http://localhost:3000", "https://twiq.vercel.app"],
  credentials: true,
}));


// Routes
app.use('/api/user', userRoutes);
app.use('/api/suggest-prompts', suggestPromptsRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/chat-message', chatMessagesRoutes);
app.use('/api/stripe/', stripeRoutes);

// Health Check Route
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to TWIQ API!' });
});

module.exports = app;
