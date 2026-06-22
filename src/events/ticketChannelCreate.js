const { Events } = require('discord.js');
const { handleTicketChannelCreate } = require('../features/ticketAssistant');

module.exports = {
    name: Events.ChannelCreate,

    execute(channel) {
        handleTicketChannelCreate(channel);
    },
};
