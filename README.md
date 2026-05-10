# Luna — Intelligence That Shines

A celestial-themed AI chat app with Supabase auth, streaming Groq API responses, and a server-side proxy for API key security.

## Quick Start

```bash
npm install
cp .env.example .env   # add your Groq API key
npm start              # opens at http://localhost:3000
```

> **Never open `index.html` directly** — the Groq API requires the Express proxy.

## Setup

### Prerequisites
- Node.js 18+
- Supabase project (for auth + chat_history table)
- Groq API key

### Environment
| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq API key (server-side, `.env` file) |

Supabase config (`SB_URL`, `SB_KEY`) lives in `config.js` — these are anon keys safe to commit.

### Database

The app expects three Supabase tables:

**`chat_history`**
| Column | Type |
|---|---|
| `id` | uuid (PK, default `gen_random_uuid()`) |
| `user_id` | uuid (references `auth.users`) |
| `chat_id` | uuid |
| `message` | text |
| `sender` | text ('user', 'bot', or 'title') |
| `constellation_id` | uuid (nullable, FK → constellations.id ON DELETE SET NULL) |
| `created_at` | timestamptz (default `now()`) |

**`constellations`**
| Column | Type |
|---|---|
| `id` | uuid (PK, default `gen_random_uuid()`) |
| `user_id` | uuid (references `auth.users`) |
| `name` | text |
| `position` | integer |
| `created_at` | timestamptz |

**`user_memory`**
| Column | Type |
|---|---|
| `id` | uuid (PK) |
| `user_id` | uuid (references `auth.users`) |
| `memory_key` | text |
| `memory_value` | text |
| `created_at` | timestamptz |

Enable Row-Level Security and add policies for authenticated users to read/write their own rows.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Static HTML + CSS + Vanilla JS |
| Auth | Supabase Auth (email/password) |
| Backend | Express proxy server |
| AI | Groq API (`llama-3.3-70b-versatile`, streaming) |
| Styling | Poppins + Comfortaa (Google Fonts), Lucide icons |
| Markdown | `marked` v4.3.0 + highlight.js |

## Features

- Streaming AI responses with real-time token rendering
- **Stop generation** — abort mid-stream with a stop button in the input
- Session history (auto-saved per conversation)
- **Constellation folders** — group sessions with CRUD, move, collapse
- **Search chat history** — filter sessions by text in the sidebar
- **Session rename** — rename from context menu
- **Message timestamps** — relative time on each message
- **User memory** — auto-detected (name) + manual memory manager modal
- **Code copy button** — per-code-block copy on hover
- **Voice input** — browser speech-to-text with "thank you luna" auto-send
- **Keyboard shortcuts** — Cmd+K (search), Cmd+Enter (send), Escape (close)
- **File attachments** — images (vision), PDF/DOCX, audio transcription
- **Email auth** — sign-up confirmation, forgot/reset password flow
- Light/dark theme toggle
- Mobile-responsive UI
- Regenerate bot responses
- Markdown rendering with syntax-highlighted code blocks (highlight.js)
- Easter egg: ask "luis loves who?"

## Project Structure

```
├── server.js      Express server — proxies Groq API
├── main.js        Chat, auth, UI, streaming SSE client
├── styles.css     All styles + markdown rendering
├── config.js           Supabase public config
├── index.html          Main page (loads external CSS/JS)
├── email-template.html Supabase email templates (confirm signup + reset password)
├── package.json        Node dependencies
└── .env.example        Environment template
```

## Deploy to Vercel

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Push this repo to GitHub
2. Import it in Vercel — the `vercel.json` is already configured
3. Add `GROQ_API_KEY` in **Project Settings → Environment Variables**
4. Deploy — that's it

Vercel detects the `@vercel/node` builder automatically and routes all requests through `server.js`.

### Required env variables

| Variable | Source |
|---|---|
| `GROQ_API_KEY` | [Groq Console](https://console.groq.com/keys) |

No build step needed — `npm install` runs automatically.

## License

MIT
