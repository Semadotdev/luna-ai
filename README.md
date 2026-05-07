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

The app expects two Supabase tables:

**`chat_history`**
| Column | Type |
|---|---|
| `id` | uuid (PK, default `gen_random_uuid()`) |
| `user_id` | uuid (references `auth.users`) |
| `chat_id` | uuid |
| `message` | text |
| `sender` | text ('user' or 'bot') |
| `created_at` | timestamptz (default `now()`) |

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
- Session history (auto-saved per conversation)
- User memory (name detection + persistence)
- Light/dark theme toggle
- Mobile-responsive UI
- Regenerate bot responses
- Markdown rendering with syntax-highlighted code blocks
- Easter egg: ask "luis loves who?"

## Project Structure

```
├── server.js      Express server — proxies Groq API
├── main.js        Chat, auth, UI, streaming SSE client
├── styles.css     All styles + markdown rendering
├── config.js      Supabase public config
├── index.html     Main page (loads external CSS/JS)
├── package.json   Node dependencies
└── .env.example   Environment template
```

## License

MIT
