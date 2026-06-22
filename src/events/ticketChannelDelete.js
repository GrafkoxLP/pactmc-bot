const { Events } = require('discord.js');
const { handleTicketChannelDelete } = require('../features/ticketAssistant');

module.exports = {
    name: Events.ChannelDelete,

    execute(channel) {
        handleTicketChannelDelete(channel);
    },
};
