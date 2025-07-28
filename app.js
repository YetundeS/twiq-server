const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');
const compression = require('compression');

const userRoutes = require('./routes/userRoutes.js');
const suggestPromptsRoutes = require('./routes/suggestPromptsRoutes.js');
const chatsRoutes = require('./routes/chatsRoutes.js');
const chatMessagesRoutes = require('./routes/chatMessagesRoutes.js');
const stripeRoutes = require('./routes/stripeRoutes.js');
const stripeWebhookRoutes = require('./routes/stripeWebhookRoutes.js');
const cookieParser = require('cookie-parser');
const { generalLimiter } = require('./middlewares/rateLimitMiddleware');

const app = express();


// ✅ This route uses express.raw internally, so mount it first
app.use('/api/stripe/webhook', stripeWebhookRoutes);


dotenv.config(); // Load environment variables

const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || ["https://twiq.vercel.app", "https://twiq-three.vercel.app", "https://app.twiq.ai"];

// Enable compression for all responses except streaming endpoints
app.use(compression({
  // Enable compression for responses larger than 1KB
  threshold: 1024,
  // Use highest compression level for better size reduction
  level: 9,
  // Custom filter to compress JSON and text responses
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      // Don't compress responses if this request header is present
      return false;
    }
    
    // Don't compress Server-Sent Events (SSE) streams
    if (req.url.includes('/api/chat-message/send')) {
      return false;
    }
    
    // Don't compress if Content-Type is text/event-stream
    if (res.getHeader('Content-Type') === 'text/event-stream') {
      return false;
    }
    
    // Use compression for other text-based responses
    return compression.filter(req, res);
  }
}));

// Middleware
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "Content-Length", "X-Requested-With"],
}));



app.use(bodyParser.json());
app.use(cookieParser());

app.options(/.*/, cors({
  origin: allowedOrigins,
  credentials: true,
}));

// Apply general rate limiting to all API routes
app.use('/api/', generalLimiter);

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
