# 🌙 Luna | Intelligence That Shines

Luna is a sleek, celestial-themed AI chat interface powered by **Groq's Llama 3** models and **Supabase**. It features a "Bring Your Own Key" (BYOK) architecture, ensuring that your API usage remains private and under your control.

---

## ✨ Features

* **BYOK Architecture:** Your Groq API key is stored locally in your browser, never hitting a third-party server besides Groq itself.
* **Persistent Memory:** Chat history is securely stored via Supabase, allowing you to revisit past "lunar sessions."
* **Intelligent Titling:** Luna automatically summarizes your first message into a 3-word title for your history list (with special logic for personal queries).
* **Dual Themes:** Toggle between **Midnight Mode** (Dark) and **Moonlight Mode** (Light).
* **Responsive Design:** Fully optimized for desktop and mobile devices.
* **Markdown Support:** Rich text rendering including code blocks, bolding, and lists.

## 🚀 Getting Started

### Prerequisites
* A **Supabase** project (for authentication and database).
* A **Groq API Key** (Get one at [console.groq.com](https://console.groq.com)).

### Installation
1.  Clone this repository or download the files.
2.  Ensure `index.html`, `style.css`, and `script.js` are in the same directory.
3.  Open `index.html` in any modern web browser.

### Configuration
In `script.js`, replace the Supabase credentials with your own project details:
```javascript
const SB_URL = "YOUR_SUPABASE_URL";
const SB_KEY = "YOUR_SUPABASE_ANON_KEY";
