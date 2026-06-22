const { ticketAssistant } = require('../../config');

function completionsUrl() {
    const base = ticketAssistant.openWebUi.baseUrl.replace(/\/+$/, '');
    return `${base}/chat/completions`;
}

async function chatCompletion(model, messages) {
    const { apiKey, timeoutMs } = ticketAssistant.openWebUi;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
        response = await fetch(completionsUrl(), {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ model, messages, stream: false }),
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }

    if (!response.ok) {
        const body = await response.text().catch(() => '');
        throw new Error(`Open WebUI HTTP ${response.status}: ${body.slice(0, 300)}`);
    }

    const data = await response.json();
    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') {
        throw new Error('Open WebUI lieferte keine Textantwort');
    }
    return content;
}

// Entfernt Code-Fences und greift notfalls das erste JSON-Objekt heraus.
function parseStrictJson(raw) {
    let text = raw.trim();

    if (text.startsWith('```')) {
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
    }

    if (!text.startsWith('{')) {
        const start = text.indexOf('{');
        const end = text.lastIndexOf('}');
        if (start !== -1 && end > start) {
            text = text.slice(start, end + 1);
        }
    }

    return JSON.parse(text);
}

// Stufe A bekommt keine Bilder, nur einen Hinweis an der letzten User-Nachricht.
function withImageMarker(history, imageCount) {
    const messages = history.map((m) => ({ ...m }));
    if (imageCount > 0) {
        const marker = `\n\n[${imageCount} Bild(er) angehängt]`;
        for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === 'user') {
                messages[i].content = `${messages[i].content}${marker}`;
                return messages;
            }
        }
        messages.push({ role: 'user', content: marker.trim() });
    }
    return messages;
}

// Stufe B bekommt die Bilder als image_url-Parts an der letzten User-Nachricht.
function withImages(history, images) {
    const messages = history.map((m) => ({ ...m }));
    if (!images.length) return messages;

    const imageParts = images.map((img) => ({
        type: 'image_url',
        image_url: { url: img.dataUrl },
    }));

    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            const text = typeof messages[i].content === 'string' ? messages[i].content : '';
            messages[i].content = [{ type: 'text', text }, ...imageParts];
            return messages;
        }
    }
    messages.push({ role: 'user', content: imageParts });
    return messages;
}

async function runGate(history, { imageCount = 0 } = {}) {
    const messages = withImageMarker(history, imageCount);
    const parsed = parseStrictJson(await chatCompletion(ticketAssistant.openWebUi.gateModel, messages));
    return {
        should_respond: Boolean(parsed.should_respond),
        escalate: Boolean(parsed.escalate),
        reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    };
}

async function runAnswer(history, images = []) {
    const messages = withImages(history, images);
    const parsed = parseStrictJson(await chatCompletion(ticketAssistant.openWebUi.answerModel, messages));
    const response = typeof parsed.response === 'string' && parsed.response.trim() ? parsed.response.trim() : null;
    return {
        response,
        escalate: Boolean(parsed.escalate),
        reason: typeof parsed.reason === 'string' ? parsed.reason : '',
    };
}

module.exports = { chatCompletion, parseStrictJson, runGate, runAnswer };
