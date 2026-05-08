const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const GROQ_KEY = process.env.GROQ_API_KEY;
console.log('GROQ_KEY set:', !!GROQ_KEY);

app.post('/api/chat', async (req, res) => {
    try {
        const { messages, stream = true } = req.body;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(GROQ_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages,
                stream: stream
            }),
            signal: controller.signal
        });
        clearTimeout(timeout);

        // Check for non-200 response
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
                        // Continue despite decode errors
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

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Luna server running at http://localhost:${PORT}`);
    });
}
module.exports = app;
