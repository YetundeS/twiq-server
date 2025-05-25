const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bodyParser = require('body-parser');

const userRoutes = require('./routes/userRoutes.js');
const suggestPromptsRoutes = require('./routes/suggestPromptsRoutes.js');
const carouselRoutes = require('./routes/carouselRoutes.js');
const carouselRoutes = require('./routes/storytellerRoutes.js');
const carouselRoutes = require('./routes/headlinesRoutes.js');
const carouselRoutes = require('./routes/linkedinBusinessRoutes.js');
const carouselRoutes = require('./routes/linkedinPersonalRoutes.js');
const carouselRoutes = require('./routes/captionsRoutes.js');
const carouselRoutes = require('./routes/videoScriptsRoutes.js');
const cookieParser = require('cookie-parser');

const app = express();


dotenv.config(); // Load environment variables

// Middleware
const allowedOrigins = ["http://localhost:3000"];

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true); // Use `true` instead of `origin`
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
    })
);
app.use(bodyParser.json());
app.use(cookieParser());

// Routes
app.use('/api/user', userRoutes);
app.use('/api/suggest-prompts', suggestPromptsRoutes);
app.use('/api/carousel', carouselRoutes);
app.use('/api/storyteller', storytellerRoutes);
app.use('/api/headlines', headlinesRoutes);
app.use('/api/linkedin-business', linkedinBusinessRoutes);
app.use('/api/linkedin-personal', linkedinPersonalRoutes);
app.use('/api/captions', captionsRoutes);
app.use('/api/video-scripts', videoScriptsRoutes);

// Health Check Route
app.get('/', (req, res) => {
    res.status(200).json({ message: 'Welcome to TWIQ API!' });
});

module.exports = app;
