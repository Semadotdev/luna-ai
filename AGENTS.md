# AGENTS.md

## Project
Modular static HTML app with Express backend proxy for API key security. Supports streaming responses and showcases celestial-themed UI with modern fonts.

## File Structure
- `index.html` — Main HTML markup, loads external CSS/JS and Google Fonts (Poppins + Comfortaa)
- `styles.css` — All CSS styles with custom Markdown rendering, emoji font stack, and Lucide icon colors
- `config.js` — Supabase config (`SB_URL`, `SB_KEY`) — safe to expose
- `main.js` — All chat, auth, UI logic + streaming SSE client + `marked` with syntax highlighting
- `server.js` — Express server, proxies Groq API with streaming support (keeps `GROQ_API_KEY` server-side)
- `package.json` — Node dependencies (`express`, `cors`, `dotenv`)

## Key Facts
- **Run locally**: `npm install && npm start` — opens at `http://localhost:3000`
- **Never open `index.html` directly** — Groq API calls require the server proxy at `/api/chat` with streaming
- `config.js` contains only Supabase anon key (safe to commit); Groq key lives in `.env` (gitignored)
- Copy `.env.example` to `.env` and add your Groq API key before running
- External dependencies loaded via CDN in `<head>`:
  - Supabase JS (`@supabase/supabase-js@2`)
  - Lucide icons (`lucide`)
  - Marked (`marked` v4.3.0 — renders bot markdown responses)
  - highlight.js (syntax highlighting for code blocks)
  - Google Fonts: Poppins (body) + Comfortaa (headings/branding)
- Backend: Supabase (auth + `chat_history` table) + Groq API (`llama-3.3-70b-versatile` with streaming via server proxy)

## Conventions
- Edit `main.js` for chat/auth/UI logic; `styles.css` for styling; `server.js` for API proxy changes
- Mobile-first responsive breakpoints at 1024px and 768px
- Bot responses use Markdown (rendered via `marked`), enforced by system prompt
- Luna system prompt: Roman Goddess of the Moon persona, uses emojis, celestial language
- **Streaming**: Server sends SSE chunks, client renders tokens progressively in chat bubble
- **Regeneration**: Previous bot message is removed before generating new response
- **Paragraph spacing**: 16px bottom margin in `.bubble p` for readability
- **Icons**: Lucide icons styled via CSS `[data-lucide]` selector (not HTML attributes)
- Never hardcode API keys in client-side JS files
