const { Events } = require('discord.js');
const { handleTicketMessage } = require('../features/ticketAssistant');

// Zusätzlicher Listener neben messageCreate.js; der Loader bindet jede Datei einzeln.
module.exports = {
    name: Events.MessageCreate,

    execute(message, client) {
        handleTicketMessage(message, client).catch((error) => {
            console.error('[TicketAI] handleTicketMessage:', error);
        });
    },
};
