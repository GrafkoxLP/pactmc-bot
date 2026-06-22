const { createBrandedEmbed } = require('../../utils/embed');
const { ticketAssistant } = require('../../config');
const { setStatus, TicketStatus } = require('./state');
const log = require('./log');

async function escalate(channel, reason, client) {
    setStatus(channel.id, TicketStatus.ESCALATED);

    const rolePings = ticketAssistant.supportRoleIds.map((id) => `<@&${id}>`).join(', ');
    const embed = createBrandedEmbed(client)
        .setTitle('Support benötigt')
        .setDescription(
            'Hier sollte ein Teammitglied übernehmen, ich konnte nicht abschließend weiterhelfen.' +
            (reason ? `\n\n*Grund:* ${reason}` : ''),
        )
        .setFooter({ text: 'Automatische Eskalation' });

    try {
        await channel.send({ content: rolePings, embeds: [embed] });
        log.info(`#${channel.name} | eskaliert: ${reason}`);
    } catch (error) {
        log.error(`#${channel.name} | Eskalation fehlgeschlagen:`, error);
    }
}

module.exports = { escalate };
