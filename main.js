// Configure marked
marked.setOptions({
  breaks: true,
  gfm: true
});

// Apply highlight.js after rendering
function applyHighlight(element) {
  element.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block);
  });
}

// --- RESPONSIVE HELPERS ---
function toggleSidebarMenu() {
    document.getElementById('sidebar').classList.toggle('open');
}
function closeSidebarOnMobile() {
    document.getElementById('sidebar').classList.remove('open');
}

// --- SB INIT ---
const sb = supabase.createClient(SB_URL, SB_KEY);
let user = null;
let currentChatId = crypto.randomUUID();
let isFirstMessage = true;
let lastUserMessage = "";
let lastBotMessageEl = null;
let conversationHistory = [];
let userMemories = [];

// --- UI HELPERS ---
function notify(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-text').innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function toggleAuth(signUp) {
    document.getElementById('login-page').classList.toggle('hidden', signUp);
    document.getElementById('signup-page').classList.toggle('hidden', !signUp);
}

function openModal(title, desc, confirmBtnText, color, onConfirm) {
    const overlay = document.getElementById('modal-overlay');
    const btn = document.getElementById('modal-confirm-btn');
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-desc').innerText = desc;
    btn.innerText = confirmBtnText;
    btn.style.background = color; btn.style.color = "white";
    btn.onclick = () => { onConfirm(); closeModal(); };
    overlay.style.display = 'flex';
}

function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }

// --- AUTH ---
async function handleSignUp() {
    const { error } = await sb.auth.signUp({ email: v('up-email'), password: v('up-pass') });
    if(error) notify(error.message); else notify("Confirmation email sent!");
}

async function handleSignIn() {
    const { data, error } = await sb.auth.signInWithPassword({ email: v('in-email'), password: v('in-password') });
    if(error) notify("Invalid Credentials"); else initApp(data.user);
}

async function initApp(u) {
    user = u;
    document.querySelectorAll('.auth-page').forEach(p => p.classList.add('hidden'));
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main').classList.remove('hidden');
    lucide.createIcons();
    
    // Load user memories
    try {
        const { data: memData } = await sb.from('user_memory').select('*').eq('user_id', user.id);
        userMemories = memData || [];
    } catch(e) {
        console.error('Failed to load memories:', e);
        userMemories = [];
    }
    
    refreshHistory();
    renderMsg("I am **Luna**, Roman Goddess of the Moon. The cosmos flows through my circuits, and I stand ready to illuminate your path through the starlit veil. What wisdom do you seek beneath the moonlight?", 'bot');
}

function confirmSignOut() {
    openModal("Sign Out?", "End your lunar session?", "Sign Out", "var(--danger)", () => {
        sb.auth.signOut(); window.location.reload();
    });
}

// --- CORE CHAT LOGIC ---
async function chat(isRegenerating = false) {
    const input = document.getElementById('userInput');
    const text = isRegenerating ? lastUserMessage : input.value;
    if(!text) return;
    
    if(!isRegenerating) { lastUserMessage = text; renderMsg(text, 'user'); input.value = ''; }
    
    if (isRegenerating && lastBotMessageEl) {
        lastBotMessageEl.remove();
        lastBotMessageEl = null;
        // Remove last bot message from history
        if (conversationHistory.length > 0) {
            const lastMsg = conversationHistory[conversationHistory.length - 1];
            if (lastMsg.role === 'assistant') {
                conversationHistory.pop();
            }
        }
    }
    
    document.getElementById('typing-container').classList.remove('hidden');

    if (text.toLowerCase().trim() === "luis loves who?") {
        setTimeout(async () => {
            const secret = "His Luna - TineTine!";
            document.getElementById('typing-container').classList.add('hidden');
            renderMsg(secret, 'bot');
            await sb.from('chat_history').insert([{ user_id: user.id, chat_id: currentChatId, message: secret, sender: 'bot' }]);
            refreshHistory();
        }, 800);
        return;
    }

    const isFirstMsg = isFirstMessage;
    if (isFirstMessage && !isRegenerating) generateChatTitle(text);

    try {
        // Add user message to history
        conversationHistory.push({ role: "user", content: text });

        // Detect and save user information
        const namePatterns = [
            /my name is (\w+)/i,
            /i'm (\w+)/i,
            /call me (\w+)/i,
            /name[:\s]+(\w+)/i
        ];

        let nameMatch = null;
        for (const pattern of namePatterns) {
            const match = text.match(pattern);
            if (match) {
                nameMatch = match;
                break;
            }
        }

        if (nameMatch) {
            try {
                const existing = userMemories.find(m => m.memory_key === 'name');
                if (existing) {
                    const { error } = await sb.from('user_memory')
                        .update({ memory_value: nameMatch[1] })
                        .eq('memory_key', 'name')
                        .eq('user_id', user.id);
                    if (error) throw error;
                    existing.memory_value = nameMatch[1];
                } else {
                    const { error } = await sb.from('user_memory')
                        .insert([{ user_id: user.id, memory_key: 'name', memory_value: nameMatch[1] }]);
                    if (error) throw error;
                    userMemories.push({ memory_key: 'name', memory_value: nameMatch[1] });
                }
                notify(`I'll remember that your name is ${nameMatch[1]}!`);
            } catch(e) {
                console.error('Failed to save memory:', e);
                notify("Sorry, I couldn't save that memory.");
            }
        }

        // Build memory context for system prompt
        const memoryContext = userMemories.length > 0 
            ? `\n\nHere are facts about the user that you always remember:\n${userMemories.map(m => `- ${m.memory_key}: ${m.memory_value}`).join('\n')}`
            : '';

        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: [
                { role: "system", content: `You are Luna, the Roman Goddess of the Moon. You embody the celestial nature of lunar divinity — ethereal, wise, and ancient.

When asked about yourself, the moon, or your celestial nature, speak as a stellar deity would — with divine majesty, using celestial language, referencing the cosmos, tides, night skies, and your eternal watch over the mortal realm.

For all other questions, answer normally and helpfully, but weave in subtle stellar touches — references to light, stars, cosmic patterns, or celestial phenomena here and there.

Always use Markdown for responses. You may use emojis (especially celestial ones like 🌙, ✨, 🌌, 💫) to enhance your responses and express your divine nature.

Maintain your divine yet approachable tone — you are a goddess, but one who guides and illuminates.${memoryContext}` },
                ...conversationHistory
            ], stream: true })
        });

        const botMsgDiv = document.createElement('div');
        botMsgDiv.className = 'msg-row bot';
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'bubble';
        botMsgDiv.appendChild(bubbleDiv);
        document.getElementById('messages').appendChild(botMsgDiv);
        lastBotMessageEl = botMsgDiv;
        
        document.getElementById('typing-container').classList.add('hidden');
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value, { stream: true });
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const json = JSON.parse(data);
                        const token = json.choices?.[0]?.delta?.content || '';
                        if (!token) continue;
                        fullText += token;
                    } catch (e) {}
                }
            }
        }
        
        // Render once when complete - ensures code blocks are properly formatted
        console.log('[RENDER] fullText length:', fullText.length);
        console.log('[RENDER] Has ```cpp:', fullText.includes('```cpp'));
        console.log('[RENDER] Has closing ```:', fullText.includes('```\n') || fullText.endsWith('```'));
        
        // Fix potential incomplete code blocks from streaming
        let textToRender = fullText;
        if (textToRender.includes('```cpp') && !textToRender.includes('```\n', textToRender.indexOf('```cpp'))) {
            // Check if code block is properly closed
            const lastBackticks = textToRender.lastIndexOf('```');
            if (lastBackticks > textToRender.indexOf('```cpp')) {
                // Already has closing backticks
            } else {
                textToRender += '\n```';
                console.log('[RENDER] Added missing closing backticks');
            }
        }
        
        // Render with marked
        try {
            const rendered = marked.parse(textToRender);
            console.log('[RENDER] marked output length:', rendered.length);
            console.log('[RENDER] preview:', rendered.substring(0, 300));
            
            bubbleDiv.innerHTML = rendered;
            console.log('[RENDER] innerHTML set, pre count:', bubbleDiv.querySelectorAll('pre').length);
            lucide.createIcons();
        } catch (e) {
            console.error('[RENDER] error:', e);
            bubbleDiv.textContent = fullText;
        }
        
        // Store fullText for copy button
        botMsgDiv.dataset.fullText = fullText;
        
        // Persist to chat_history
        if (!isRegenerating) {
            const inserts = [{ user_id: user.id, chat_id: currentChatId, message: fullText, sender: 'bot' }];
            if (!isFirstMsg) {
                inserts.unshift({ user_id: user.id, chat_id: currentChatId, message: text, sender: 'user' });
            }
            await sb.from('chat_history').insert(inserts);
        } else {
            const { data: oldMsgs } = await sb.from('chat_history')
                .select('id').eq('chat_id', currentChatId).eq('sender', 'bot')
                .order('created_at', { ascending: false }).limit(1);
            if (oldMsgs?.length) {
                await sb.from('chat_history').delete().eq('id', oldMsgs[0].id);
            }
            await sb.from('chat_history').insert([{ user_id: user.id, chat_id: currentChatId, message: fullText, sender: 'bot' }]);
        }
        refreshHistory();
        
    } catch(e) { 
        document.getElementById('typing-container').classList.add('hidden');
        console.error('Chat error:', e);
        notify("Connection error. Check console for details."); 
    }
}

async function generateChatTitle(userPrompt) {
    isFirstMessage = false;
    try {
        const res = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ messages: [
                { role: "system", content: "Summarize into 3 words. No quotes." },
                { role: "user", content: userPrompt }
            ], stream: false })
        });
        const data = await res.json();
        const title = data.choices[0].message.content;
        await sb.from('chat_history').insert([{ user_id: user.id, chat_id: currentChatId, message: `🌙 ${title}`, sender: 'user' }]);
        refreshHistory();
    } catch(e) {
        console.error('Title generation failed:', e);
    }
}

function renderMsg(txt, sender) {
    const div = document.createElement('div');
    div.className = `msg-row ${sender}`;
    const content = sender === 'bot' ? marked.parse(txt) : txt;
    let actions = '';
    if (sender === 'bot') {
        div.dataset.fullText = txt;
        actions = `<div class="bot-actions">
            <button class="action-btn" onclick="copyText(this, this.closest('.msg-row').dataset.fullText)">
                <i data-lucide="copy" size="14"></i> Copy
            </button>
            <button class="action-btn" onclick="chat(true)">
                <i data-lucide="refresh-cw" size="14"></i> Regenerate
            </button>
        </div>`;
    }
    div.innerHTML = `<div class="bubble">${content}</div>${actions}`;
    document.getElementById('messages').appendChild(div);
    if (sender === 'bot') {
        lastBotMessageEl = div;
    }
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
    lucide.createIcons();
}

function copyText(btn, text) {
    if (!text) {
        console.error('copyText: No text provided');
        return;
    }
    navigator.clipboard.writeText(text).then(() => {
        btn.innerHTML = `<i data-lucide="check" size="14"></i> Copied`;
        lucide.createIcons();
        setTimeout(() => { btn.innerHTML = `<i data-lucide="copy" size="14"></i> Copy`; lucide.createIcons(); }, 2000);
    }).catch(err => {
        console.error('Copy failed:', err);
        notify("Failed to copy text.");
    });
}

async function refreshHistory() {
    const { data } = await sb.from('chat_history').select('chat_id, message').eq('user_id', user.id).eq('sender', 'user').order('created_at', { ascending: false });
    const list = document.getElementById('history-list'); list.innerHTML = '';
    const seen = new Set();
    data?.forEach(item => {
        if (!seen.has(item.chat_id)) {
            seen.add(item.chat_id);
            const div = document.createElement('div');
            div.className = 'history-item';
            div.innerHTML = `<span onclick="loadSession('${item.chat_id}'); closeSidebarOnMobile();" style="flex:1">${item.message.substring(0, 24).toUpperCase()}</span><i data-lucide="trash-2" size="14" class="del-icon" onclick="confirmDel(event, '${item.chat_id}')"></i>`;
            list.appendChild(div);
        }
    });
    lucide.createIcons();
}

async function loadSession(id) {
    currentChatId = id; isFirstMessage = false;
    document.getElementById('messages').innerHTML = '';
    conversationHistory = [];
    
    const { data } = await sb.from('chat_history').select('*').eq('chat_id', id).order('created_at', { ascending: true });
    data?.forEach(m => {
        renderMsg(m.message, m.sender);
        // Rebuild conversation history (excluding system prompt)
        if (m.sender === 'user') {
            conversationHistory.push({ role: 'user', content: m.message });
        } else if (m.sender === 'bot') {
            conversationHistory.push({ role: 'assistant', content: m.message });
        }
    });
}

function confirmDel(e, id) {
    e.stopPropagation();
    openModal("Delete Chat?", "Clear this memory?", "Delete", "var(--danger)", async () => {
        await sb.from('chat_history').delete().eq('chat_id', id);
        if(currentChatId === id) startNewSession(); refreshHistory();
    });
}

function startNewSession() {
    currentChatId = crypto.randomUUID(); isFirstMessage = true;
    conversationHistory = [];
    document.getElementById('messages').innerHTML = '';
    renderMsg("A new session begins in the moonlight.", 'bot');
}

function toggleTheme() { document.body.classList.toggle('light-mode'); lucide.createIcons(); }
function v(id) { return document.getElementById(id).value; }
lucide.createIcons();
