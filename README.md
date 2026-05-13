# Luna — Intelligence That Shines

Luna is a chat app with a celestial theme that lets you talk to an AI assistant (powered by Groq's LLM). It includes user accounts, conversation history, voice input, file uploads, and more — all wrapped in a moonlight-inspired UI.

## ✨ What You Can Do

- Chat with an AI that responds in real-time (streaming text as it's generated)
- Upload images, PDFs, Word docs, or audio files for the AI to process
- Use voice input to speak your messages
- Organize conversations into folders ("constellations")
- Search through your chat history
- Switch between light and dark themes
- Works on phone, tablet, or desktop

## Quick Start

**You'll need three things before you begin.** Don't worry — they're all free.

### 1. Install Node.js

Luna runs on Node.js. If you don't have it yet, download it from [nodejs.org](https://nodejs.org/) (version 18 or newer). You can check if it's already installed by running:

```bash
node --version
```

### 2. Create a Supabase project (free)

Supabase handles user accounts and stores your chat history.

1. Go to [supabase.com](https://supabase.com/) and sign up for a free account
2. Create a new project (pick any name and a strong database password)
3. Once it's ready, go to **Project Settings → API** and copy your **Project URL** and **anon public key**
4. Open `config.js` in this project and paste them in:

```js
const SB_URL = "https://your-project-id.supabase.co";     // Your Project URL
const SB_KEY = "your-anon-key";                            // Your anon public key
```

### 3. Get a Groq API key (free)

The AI runs on Groq's servers. You need a key to use it.

1. Go to [console.groq.com/keys](https://console.groq.com/keys) and sign up
2. Create a new API key
3. Copy it — you'll paste it into a file in the next step

### 4. Start the app

Now you're ready. Run these commands in your terminal:

```bash
# Install dependencies
npm install

# Create your environment file (this keeps your API key secret)
cp .env.example .env
```

Open the `.env` file you just created and paste your Groq API key:

```
GROQ_API_KEY=gsk_your_groq_api_key_here
```

Then start the server:

```bash
npm start
```

Open your browser to **http://localhost:3000** and you should see Luna!

> ⚠️ **Important:** Never open `index.html` directly in your browser. The app needs the server running to talk to Groq.

### 5. Set up your database tables

Luna needs three tables in your Supabase database. Go to your Supabase dashboard, open the **SQL Editor**, and paste these SQL statements (click "Run" for each one):

```sql
-- Chat history: stores every message
CREATE TABLE IF NOT EXISTS chat_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  chat_id uuid NOT NULL,
  message text NOT NULL,
  sender text NOT NULL CHECK (sender IN ('user', 'bot', 'title')),
  constellation_id uuid REFERENCES constellations(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Constellations: folders to organize conversations
CREATE TABLE IF NOT EXISTS constellations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  name text NOT NULL,
  position integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- User memory: things Luna remembers about you
CREATE TABLE IF NOT EXISTS user_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users NOT NULL,
  memory_key text NOT NULL,
  memory_value text NOT NULL,
  created_at timestamptz DEFAULT now()
);
```

Then, enable security so users can only see their own data. In the Supabase dashboard:

1. Go to **Authentication → Policies**
2. For each table, click **Enable RLS**
3. Add a policy that allows users to `SELECT`, `INSERT`, `UPDATE`, and `DELETE` their own rows (where `user_id = auth.uid()`)

That's it — you're all set!

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

## Troubleshooting

| Problem | Likely fix |
|---------|------------|
| `npm start` fails | Make sure Node.js 18+ is installed (`node --version`) |
| Blank page at localhost:3000 | Check that `npm install` ran without errors |
| Login/signup doesn't work | Check **Authentication → Settings** in Supabase — make sure email auth is enabled |
| AI says "API key error" | Check that you put your Groq key in `.env` (not `config.js`), then restart the server |
| Messages aren't saving | Make sure the three database tables were created in Supabase SQL Editor |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Static HTML + CSS + Vanilla JS |
| Auth | Supabase Auth (email/password) |
| Backend | Express proxy server |
| AI | Groq API (`llama-3.3-70b-versatile`, streaming) |
| Styling | Poppins + Comfortaa (Google Fonts), Lucide icons |
| Markdown | `marked` v4.3.0 + highlight.js |

## Project Structure

```
├── server.js             Express server — proxies Groq API (your API key stays safe here)
├── main.js               Chat, auth, UI, streaming — all the app logic
├── styles.css            All styles + markdown rendering
├── config.js             Supabase public config (safe to share)
├── index.html            Main page (loads external CSS/JS)
├── email-template.html   Supabase email templates (confirm signup + reset password)
├── package.json          Node dependencies
└── .env.example          Environment template (rename to .env and add your Groq key)
```

## Deploy to Vercel

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new)

1. Push this repo to GitHub
2. Import it in Vercel — the `vercel.json` is already configured
3. Add `GROQ_API_KEY` in **Project Settings → Environment Variables** (same key from [console.groq.com/keys](https://console.groq.com/keys))
4. Deploy — no build step needed

That's it! Vercel detects the Node builder automatically and routes everything through `server.js`.

## License

MIT

## Need help?

Open an issue on [GitHub](https://github.com/anomalyco/opencode/issues) — we're happy to help!
