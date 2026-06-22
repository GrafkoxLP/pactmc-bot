const TAG = '[TicketAI]';

function info(msg) {
    console.log(`${TAG} ${msg}`);
}

function warn(msg) {
    console.warn(`${TAG} ${msg}`);
}

function error(msg, err) {
    console.error(`${TAG} ${msg}`, err ?? '');
}

function truncate(text, max = 200) {
    const s = String(text ?? '').replace(/\s+/g, ' ').trim();
    return s.length > max ? `${s.slice(0, max)}...` : s;
}

module.exports = { info, warn, error, truncate };
