const { ticketAssistant } = require('../../config');
const { TicketStatus, ensureTicket, getTicket, setStatus, clearTicket } = require('./state');
const { runGate, runAnswer } = require('./openwebui');
const { escalate } = require('./escalation');
const log = require('./log');

const DISCORD_MESSAGE_LIMIT = 2000;

function isConfigured() {
    const { enabled, ticketCategoryIds, openWebUi } = ticketAssistant;
    return Boolean(enabled && openWebUi.baseUrl && openWebUi.apiKey && ticketCategoryIds.length);
}

function isTicketChannel(channel) {
    return Boolean(channel?.parentId && ticketAssistant.ticketCategoryIds.includes(channel.parentId));
}

function memberHasSupportRole(member) {
    if (!member) return false;
    return ticketAssistant.supportRoleIds.some((id) => member.roles.cache.has(id));
}

function extractText(msg) {
    if (msg.content && msg.content.trim()) return msg.content.trim();
    const embedText = msg.embeds.map((e) => e.description || e.title || '').filter(Boolean).join('\n');
    return embedText.trim();
}

function handleTicketChannelCreate(channel) {
    if (!isConfigured() || !isTicketChannel(channel)) return;
    ensureTicket(channel.id);
    log.info(`#${channel.name} | Ticket erkannt`);
}

function handleTicketChannelDelete(channel) {
    if (getTicket(channel?.id)) {
        clearTicket(channel.id);
        log.info(`#${channel.name} | geschlossen`);
    }
}

async function handleTicketMessage(message, client) {
    if (!isConfigured()) return;
    if (!message.guild) return;
    if (message.author.bot) return;
    if (!isTicketChannel(message.channel)) return;

    const channel = message.channel;
    const ticket = ensureTicket(channel.id);

    // Mod oder Probe-Mod schreibt: Bot pausiert dauerhaft. Nur beim Wechsel loggen.
    if (memberHasSupportRole(message.member)) {
        if (ticket.status !== TicketStatus.PAUSED_HUMAN) {
            if (ticket.debounceTimer) clearTimeout(ticket.debounceTimer);
            ticket.debounceTimer = null;
            setStatus(channel.id, TicketStatus.PAUSED_HUMAN);
            log.info(`#${channel.name} | Takeover (${message.author.username})`);
        }
        return;
    }

    if (ticket.status === TicketStatus.PAUSED_HUMAN || ticket.status === TicketStatus.ESCALATED) return;

    if (ticketAssistant.verbose) {
        const imgNote = message.attachments.size ? ` [+${message.attachments.size} Anhang]` : '';
        log.info(`#${channel.name} | ${message.author.username}: "${log.truncate(extractText(message), 100)}"${imgNote}`);
    }

    // Bilder sofort laden, die signierten Attachment-URLs laufen ab.
    await collectImages(message, ticket);

    if (ticket.debounceTimer) clearTimeout(ticket.debounceTimer);
    ticket.debounceTimer = setTimeout(() => {
        ticket.debounceTimer = null;
        processTicketBatch(channel, client).catch((error) => log.error(`#${channel.name} | Batch-Fehler:`, error));
    }, ticketAssistant.debounceSeconds * 1000);
}

async function collectImages(message, ticket) {
    const images = [...message.attachments.values()].filter((att) => att.contentType?.startsWith('image/'));
    for (const att of images) {
        if (ticket.pendingImages.length >= ticketAssistant.maxImagesPerBatch) break;
        try {
            const res = await fetch(att.url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const buffer = Buffer.from(await res.arrayBuffer());
            const mediaType = att.contentType || 'image/png';
            ticket.pendingImages.push({ dataUrl: `data:${mediaType};base64,${buffer.toString('base64')}` });
        } catch (error) {
            log.error(`#${message.channel.name} | Bild nicht ladbar (${att.url}):`, error);
        }
    }
}

async function buildHistory(channel, client) {
    const fetched = await channel.messages.fetch({ limit: 50 });
    const ordered = [...fetched.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    const history = [];
    let staffPresent = false;
    let botReplies = 0;

    for (const msg of ordered) {
        if (msg.author.id === client.user.id) {
            botReplies += 1;
            const text = extractText(msg);
            if (text) history.push({ role: 'assistant', content: text });
            continue;
        }
        if (msg.author.bot) continue;

        const text = extractText(msg);
        if (!text && msg.attachments.size === 0) continue;

        if (memberHasSupportRole(msg.member)) {
            staffPresent = true;
            history.push({ role: 'user', content: `[Staff] ${text}`.trim() });
        } else {
            history.push({ role: 'user', content: text || '(Anhang ohne Text)' });
        }
    }

    return { history, staffPresent, botReplies };
}

async function processTicketBatch(channel, client) {
    const ticket = getTicket(channel.id);
    if (!ticket) return;
    if (ticket.status === TicketStatus.PAUSED_HUMAN || ticket.status === TicketStatus.ESCALATED) return;

    const tag = `#${channel.name}`;
    const { gateModel, answerModel } = ticketAssistant.openWebUi;
    const max = ticketAssistant.maxAutoReplies;

    const { history, staffPresent, botReplies } = await buildHistory(channel, client);

    if (staffPresent) {
        setStatus(channel.id, TicketStatus.PAUSED_HUMAN);
        log.info(`${tag} | Staff aktiv, pausiert`);
        return;
    }

    // Loop-Guard, aus dem Verlauf rekonstruiert, damit er einen Neustart übersteht.
    ticket.autoReplies = Math.max(ticket.autoReplies, botReplies);
    const imgPart = ticket.pendingImages.length ? ` [${ticket.pendingImages.length} Bild]` : '';

    if (ticket.autoReplies >= max) {
        log.info(`${tag} | Limit ${ticket.autoReplies}/${max}, eskaliert`);
        await escalate(channel, 'Antwort-Limit erreicht, bitte übernehmen.', client);
        return;
    }

    if (!history.length) return;

    const images = ticket.pendingImages;

    let gate;
    const tGate = Date.now();
    try {
        gate = await runGate(history, { imageCount: images.length });
    } catch (error) {
        log.error(`${tag} | ${gateModel} Fehler, eskaliert:`, error);
        await escalate(channel, 'Interner Fehler bei der Vorprüfung.', client);
        return;
    }
    const gMs = ((Date.now() - tGate) / 1000).toFixed(1);

    if (gate.escalate) {
        log.info(`${tag}${imgPart} | ${gateModel} eskaliert (${gMs}s) | "${log.truncate(gate.reason, 140)}"`);
        await escalate(channel, gate.reason || 'Fall sollte von einem Menschen geprüft werden.', client);
        return;
    }
    if (!gate.should_respond) {
        // Bewusst still, Bilder bleiben für den nächsten Batch gepuffert.
        setStatus(channel.id, TicketStatus.ACTIVE_BOT);
        log.info(`${tag}${imgPart} | ${gateModel} still (${gMs}s)`);
        return;
    }

    let answer;
    const tAns = Date.now();
    try {
        answer = await runAnswer(history, images);
    } catch (error) {
        log.error(`${tag} | ${answerModel} Fehler, eskaliert:`, error);
        await escalate(channel, 'Interner Fehler bei der Antwortgenerierung.', client);
        return;
    }
    const aMs = ((Date.now() - tAns) / 1000).toFixed(1);

    if (answer.escalate || !answer.response) {
        log.info(`${tag}${imgPart} | ${gateModel} respond (${gMs}s) | ${answerModel} eskaliert (${aMs}s) | "${log.truncate(answer.reason, 140)}"`);
        await escalate(channel, answer.reason || 'Keine belastbare Antwort aus der Wissensdatenbank.', client);
        return;
    }

    await sendAnswer(channel, answer.response);
    ticket.autoReplies += 1;
    ticket.pendingImages = [];
    setStatus(channel.id, TicketStatus.ACTIVE_BOT);
    log.info(`${tag}${imgPart} | ${gateModel} respond (${gMs}s) | ${answerModel} ok (${aMs}s) | gesendet ${ticket.autoReplies}/${max}`);
    if (ticketAssistant.verbose) log.info(`${tag} | Antwort: "${log.truncate(answer.response, 200)}"`);
}

async function sendAnswer(channel, text) {
    const safe = text.length > DISCORD_MESSAGE_LIMIT ? `${text.slice(0, DISCORD_MESSAGE_LIMIT - 1)}...` : text;
    await channel.send({ content: safe, allowedMentions: { parse: [] } });
}

module.exports = { handleTicketChannelCreate, handleTicketChannelDelete, handleTicketMessage };
