const { ActivityType } = require('discord.js');

// Liest kommagetrennte IDs aus einer Env-Variable, sonst null (dann gilt der Default).
const csvIds = (value) => (value ? value.split(',').map((s) => s.trim()).filter(Boolean) : null);

module.exports = {
    prefix: '!',
    ownerRoleId: '940232290129301551',

    welcomeChannelId: '940232290628419649',
    supportVoiceChannelId: '940588586921758770',
    supportMessageChannelId: '1096516245186166824',
    supportPingRoleIds: ['940232290129301547'],

    // AI Ticket Assistant, siehe src/features/ticketAssistant/
    ticketAssistant: {
        // Mit TICKET_ASSISTANT_ENABLED=false abschaltbar; ohne baseUrl/apiKey/Kategorie ohnehin inaktiv.
        enabled: process.env.TICKET_ASSISTANT_ENABLED !== 'false',
        // Ausführlichere Logs (eingehende Nachrichten + Antworttext).
        verbose: process.env.TICKET_ASSISTANT_VERBOSE === 'true',

        // Defaults für die Produktion, per Env fürs lokale Testen überschreibbar.
        ticketCategoryIds: csvIds(process.env.TICKET_CATEGORY_IDS) || ['940232291932840022'],
        supportRoleIds: csvIds(process.env.SUPPORT_ROLE_IDS) || ['940232290129301547', '1062080912390627380'], // Mod, Probe Mod

        openWebUi: {
            baseUrl: process.env.OPENWEBUI_BASE_URL || '', // z.B. https://example.com/api
            apiKey: process.env.OPENWEBUI_API_KEY || '',
            gateModel: process.env.GATE_MODEL || 'pact-gate',
            answerModel: process.env.ANSWER_MODEL || 'pact-answer',
            timeoutMs: Number(process.env.OPENWEBUI_TIMEOUT_MS || 30000),
        },

        debounceSeconds: Number(process.env.DEBOUNCE_SECONDS || 4),
        maxAutoReplies: Number(process.env.MAX_AUTO_REPLIES || 5),
        maxImagesPerBatch: 4,
    },

    mcHost: 'pactmc.de',

    embedBranding: {
        color: '#206694',
        websiteUrl: 'https://pactmc.de',
        botPathUrl: 'https://pactmc.de/bot/',
        thumbnailUrl: 'https://pactmc.de/assets/pactmc-icon-i2-transparent.png',
        authorName: 'PactMC',
        footerText: 'Bot made by @grafkox_lp',
        footerIconUrl: 'https://cdn.discordapp.com/avatars/455285844350074881/e799202175df16a29598e9e8969dfb52.png?size=2048',
    },

    statusArray: [
        { name: 'mit (/) Commands', type: ActivityType.Playing, status: 'online' },
        { name: '/help | PactMC', type: ActivityType.Playing, status: 'online' },
    ],
};
