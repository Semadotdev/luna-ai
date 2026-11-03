const express = require('express');
const cors = require('cors');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.static(__dirname));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-120b';
const IMAGE_FALLBACK_NOTE = '[Image attached — image analysis is temporarily unavailable.]';

function prepareMessages(messages) {
    let strippedImages = false;
    const prepared = messages.map((message) => {
        if (!Array.isArray(message.content)) return message;
        if (!message.content.some((part) => part.type === 'image_url')) return message;

        strippedImages = true;
        const parts = [];
        let noteAdded = false;
        for (const part of message.content) {
            if (part.type === 'image_url') {
                if (!noteAdded) {
                    parts.push({ type: 'text', text: IMAGE_FALLBACK_NOTE });
                    noteAdded = true;
                }
            } else if (part.type !== 'text' || part.text) {
                parts.push(part);
            }
        }

        return { ...message, content: parts.length ? parts : [{ type: 'text', text: IMAGE_FALLBACK_NOTE }] };
    });

    return { messages: prepared, strippedImages };
}

app.get('/api/health', (req, res) => {
    res.json({ ok: true, groqKeySet: !!GROQ_KEY, model: GROQ_MODEL });
});

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, stream = true, temperature, seed, ...extraParams } = req.body;
        const prepared = prepareMessages(messages);
        if (prepared.strippedImages) {
            console.warn('Image input ignored: no vision model is available on this Groq account.');
        }

        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 30000);
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                ...extraParams,
                model: GROQ_MODEL,
                messages: prepared.messages,
                stream: stream,
                ...(temperature !== undefined && { temperature }),
                ...(seed !== undefined && { seed })
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('Groq API error:', response.status, errorText);
            return res.status(response.status).json({
                error: `Groq API error: ${response.status}`,
                details: errorText
            });
        }

        if (stream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('X-Accel-Buffering', 'no');
            res.flushHeaders();

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    try {
                        const chunk = decoder.decode(value, { stream: true });
                        res.write(chunk);
                    } catch (decodeError) {
                        console.error('Decode error:', decodeError);
                    }
                }
            } finally {
                res.end();
            }
        } else {
            const data = await response.json();
            res.json(data);
        }
    } catch (error) {
        console.error('Groq API error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to fetch from Groq API', details: error.message });
        }
    }
});

app.post('/api/extract-text', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'No file uploaded' });

        let text = '';
        const name = file.originalname;

        if (file.mimetype === 'application/pdf' || name.endsWith('.pdf')) {
            const pdfParse = require('pdf-parse');
            const data = await pdfParse(file.buffer);
            text = data.text;
        } else if (file.mimetype.includes('word') || name.endsWith('.docx')) {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer: file.buffer });
            text = result.value;
        } else if (file.mimetype.includes('text') || name.endsWith('.txt') || name.endsWith('.md') || name.endsWith('.csv') || name.endsWith('.json')) {
            text = file.buffer.toString('utf-8');
        } else {
            return res.status(400).json({ error: `Unsupported file type: ${file.mimetype}` });
        }

        res.json({ text, filename: name });
    } catch (error) {
        console.error('Extract error:', error);
        res.status(500).json({ error: 'Failed to extract text', details: error.message });
    }
});

app.post('/api/transcribe', upload.single('file'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) return res.status(400).json({ error: 'No file uploaded' });

        const formData = new FormData();
        const blob = new Blob([file.buffer], { type: file.mimetype });
        formData.append('file', blob, file.originalname);
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('response_format', 'json');

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${GROQ_KEY}` },
            body: formData
        });

        if (!response.ok) {
            const errText = await response.text();
            return res.status(response.status).json({ error: errText });
        }

        const data = await response.json();
        res.json({ text: data.text });
    } catch (error) {
        console.error('Transcribe error:', error);
        res.status(500).json({ error: 'Transcription failed', details: error.message });
    }
});

app.get('/api/generate-image', async (req, res) => {
    const prompt = req.query.prompt;
    if (!prompt) return res.status(400).json({ error: 'Missing prompt' });
    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?nologo=true&seed=${seed}`;

    // Trigger generation and poll until a valid image is ready (up to ~30s)
    for (let i = 0; i < 30; i++) {
        try {
            const resp = await fetch(url);
            if (resp.ok) {
                const buf = await resp.arrayBuffer();
                if (buf.byteLength > 1000) break;
            }
        } catch {}
        await new Promise(r => setTimeout(r, 1000));
    }

    res.json({ url, status: 'ok' });
});



process.on('SIGINT', () => { console.log('\nShutting down...'); process.exit(0); });
process.on('SIGTERM', () => { console.log('Shutting down...'); process.exit(0); });

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Luna server running at http://localhost:${PORT}`);
    });
}
module.exports = app;