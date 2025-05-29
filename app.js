const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');

const userRoutes = require('./routes/userRoutes.js');
const suggestPromptsRoutes = require('./routes/suggestPromptsRoutes.js');
const chatsRoutes = require('./routes/chats.js');
const chatMessagesRoutes = require('./routes/chatMessages.js');
const cookieParser = require('cookie-parser');

const app = express();


dotenv.config(); // Load environment variables

// Middleware
app.use(
    cors({
      origin: ["http://localhost:3000", "https://twiq.vercel.app/"], // Restrict to known origins
      credentials: true, // Allow cookies & authentication
      methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
      allowedHeaders: [
        "Content-Type",
        "Authorization",
        "Content-Length",
        "X-Requested-With",
      ],
    })
  );
app.use(bodyParser.json());
app.use(cookieParser());

app.options(/.*/, cors());


// Routes
app.use('/api/user', userRoutes);
app.use('/api/suggest-prompts', suggestPromptsRoutes);
app.use('/api/chats', chatsRoutes);
app.use('/api/chat-message', chatMessagesRoutes);

// Health Check Route
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to TWIQ API!' });
});

module.exports = app;
