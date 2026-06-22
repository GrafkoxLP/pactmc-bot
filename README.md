# PactMC-Bot

Discord-Bot für den PactMC-Server, gebaut mit [discord.js](https://discord.js.org/).

## Features

| Slash-Command | Beschreibung | Berechtigung |
|---|---|---|
| `/ping` | Aktuelle Bot-Latenz anzeigen | jeder |
| `/mc` | Status des Minecraft-Servers (`pactmc.de`) abfragen | jeder |
| `/kopfoderzahl` | Eine Münze werfen | jeder |
| `/rules` | Server-Regeln als Embed posten | nur Owner |
| `/bewerbung_info` | Bewerbungs-Infos als Embed posten | nur Owner |

| Prefix-Command | Beschreibung |
|---|---|
| `!dm @user <text>` | Schickt `<text>` als DM an den erwähnten User (Owner-only) |
| `!message #channel <text>` | Schickt `<text>` in den erwähnten Channel (Owner-only) |

Außerdem:
- Begrüßt neue Mitglieder automatisch im Welcome-Channel + per DM.
- Pingt das Support-Team, sobald jemand den Support-Warteraum betritt.
- Rotiert seine Discord-Status-Aktivität alle 30 Sekunden.
- AI Ticket Assistant (siehe unten): liest in Ticket-Channels mit und beantwortet einfache Support-Fragen.

## AI Ticket Assistant

Der Bot liest in Ticket-Channels mit (Text-Channels unter einer konfigurierten Kategorie) und
beantwortet einfache Support-Fragen über [Open WebUI](https://github.com/open-webui/open-webui)
(OpenAI-kompatibler Endpoint). Die Entscheidung läuft zweistufig:

1. `pact-gate` (günstig): entscheidet, ob geantwortet oder direkt an das Team eskaliert wird.
2. `pact-answer` (Vision und RAG): formuliert die Antwort. System-Prompts und Knowledge liegen in
   Open WebUI, nicht im Bot.

Weitere Punkte:

- Kurz aufeinanderfolgende Nachrichten werden gesammelt (Debounce) und als Batch verarbeitet.
- Bild-Anhänge werden sofort geladen und an das Vision-Modell weitergereicht.
- Schreibt ein Mod oder Probe-Mod im Ticket, pausiert der Bot dort dauerhaft.
- Nach `MAX_AUTO_REPLIES` Antworten pingt der Bot das Team und hält sich raus.
- Bei Fehler, Timeout oder ungültigem JSON wird eskaliert statt geraten.

Einrichtung in Open WebUI: zwei Workspace-Modelle anlegen, `pact-gate` (Gating-Prompt, keine Knowledge)
und `pact-answer` (Antwort-Prompt plus Knowledge-Collection). API-Key in den User-Settings erzeugen und
als `OPENWEBUI_API_KEY` hinterlegen.

Ticket-Kategorie und Mod-Rollen haben Defaults in [src/config.js](src/config.js) und lassen sich zum
Testen per Env (`TICKET_CATEGORY_IDS`, `SUPPORT_ROLE_IDS`) überschreiben.

## Setup (lokal)

Voraussetzung: **Node.js 24** (LTS Krypton) oder neuer.

```bash
# 1. Repo klonen
git clone https://github.com/GrafkoxLP/pactmc-bot.git
cd pactmc-bot

# 2. Environment-Variablen anlegen
cp .env.example .env
# anschließend .env öffnen und Werte eintragen (siehe unten)

# 3. Dependencies installieren
npm install

# 4. Bot starten
npm start
```

Für Live-Reload während der Entwicklung: `npm run dev`.

## Setup (Docker)

```bash
docker build -t pactmc-bot .
docker run --rm --env-file .env pactmc-bot
```

Das im Repo enthaltene GitHub-Actions-Workflow [docker-image.yml](.github/workflows/docker-image.yml) baut bei jedem Push auf `main` automatisch ein Image und pusht es nach GHCR.

## Environment-Variablen

| Variable | Beschreibung | Pflicht |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Bot-Token aus dem Discord Developer Portal | ja |
| `DISCORD_APPLICATION_ID` | Application-ID des Bots | ja |
| `DEV_GUILD_ID` | Falls gesetzt UND in [src/handlers/loadCommands.js](src/handlers/loadCommands.js) der entsprechende Routes-Aufruf einkommentiert wird, registrieren sich die Slash-Commands sofort auf diesem Test-Server statt global | nein |
| `OPENWEBUI_BASE_URL` | Open-WebUI-Basis-URL inkl. `/api`, z.B. `https://example.com/api` (für den AI Ticket Assistant) | für AI nötig |
| `OPENWEBUI_API_KEY` | Open-WebUI-API-Key (User-Settings). Der Bot kennt keinen OpenAI-Key direkt | für AI nötig |
| `GATE_MODEL` / `ANSWER_MODEL` | Namen der Open-WebUI-Workspace-Modelle | nein (Default `pact-gate` / `pact-answer`) |
| `OPENWEBUI_TIMEOUT_MS` | Timeout für Open-WebUI-Aufrufe in ms | nein (Default `30000`) |
| `TICKET_ASSISTANT_ENABLED` | `false` schaltet das Feature ab | nein (Default an) |
| `TICKET_ASSISTANT_VERBOSE` | `true` loggt zusätzlich eingehende Nachrichten + Antworttexte | nein |
| `DEBOUNCE_SECONDS` / `MAX_AUTO_REPLIES` | Debounce-Fenster bzw. max. Auto-Antworten pro Ticket | nein (Default `4` / `5`) |
| `TICKET_CATEGORY_IDS` / `SUPPORT_ROLE_IDS` | Komma-separierte ID-Overrides (nur lokales Testen); leer = Defaults aus `config.js` | nein |

Token und Application-ID findest du im [Discord Developer Portal](https://discord.com/developers/applications) unter deiner Application: ID auf der Seite *General Information*, Token unter *Bot* → *Reset Token*.

## Projektstruktur

```
src/
├── index.js                 # Entry: Client, Login, Loader-Aufrufe, Error-Handler
├── config.js                # IDs, Owner-Rolle, Branding, Status-Array
├── utils/
│   ├── embed.js             # createBrandedEmbed(client) → vorbefüllter EmbedBuilder
│   └── isOwner.js           # Role-ID-basierter Owner-Check
├── commands/                # Slash-Commands ({ data, execute })
├── events/                  # Event-Handler ({ name, once?, execute })
├── features/
│   └── ticketAssistant/     # AI Ticket Assistant (Orchestrierung, State, Open-WebUI-Client, Eskalation)
└── handlers/                # Auto-Discovery für commands/* und events/*
```

Neue Slash-Commands oder Events können einfach als Datei in `src/commands/` bzw. `src/events/` abgelegt werden und werden beim nächsten Bot-Start automatisch geladen.

## Lizenz

ISC
