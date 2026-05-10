marked.setOptions({
  breaks: true,
  gfm: true
});

function applyHighlight(element) {
  element.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block);
  });
}

function toggleSidebarMenu() {
    document.getElementById('sidebar').classList.toggle('open');
}
function closeSidebarOnMobile() {
    document.getElementById('sidebar').classList.remove('open');
}

const initialHash = window.location.hash;
const isRecoveryFlow = initialHash.includes('type=recovery');

const sb = supabase.createClient(SB_URL, SB_KEY);
let user = null;
let currentChatId = crypto.randomUUID();
let isFirstMessage = true;
let lastUserMessage = "";
let lastBotMessageEl = null;
let conversationHistory = [];
let userMemories = [];
let pendingFiles = [];
let lastUserContent = null;
let constellations = [];
let collapsedConstellations = new Set();
let renameTargetId = null;
let isNewConstellation = false;
let currentConstellationId = null;

function loadCollapsedState() {
  try {
    const saved = localStorage.getItem('luna_collapsed');
    if (saved) collapsedConstellations = new Set(JSON.parse(saved));
  } catch(e) {}
}

function saveCollapsedState() {
  localStorage.setItem('luna_collapsed', JSON.stringify([...collapsedConstellations]));
}

function notify(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-text').innerText = msg;
    t.classList.add('show');
    setTimeout(() => t.classList.remove('show'), 3000);
}

function toggleAuth(signUp) {
    document.getElementById('login-page').classList.toggle('hidden', signUp);
    document.getElementById('signup-page').classList.toggle('hidden', !signUp);
    document.getElementById('confirm-page').classList.add('hidden');
    document.getElementById('forgot-page').classList.add('hidden');
    document.getElementById('reset-page').classList.add('hidden');
    lucide.createIcons();
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

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

async function compressImage(dataUrl, maxDim = 2048, quality = 0.85) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            let { width, height } = img;
            if (width > maxDim || height > maxDim) {
                const scale = maxDim / Math.max(width, height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width; canvas.height = height;
            canvas.getContext('2d').drawImage(img, 0, 0, width, height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.src = dataUrl;
    });
}

async function uploadFileToServer(file, endpoint) {
    const formData = new FormData();
    formData.append('file', file);
    const res = await fetch(endpoint, { method: 'POST', body: formData });
    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Upload failed (${res.status})`);
    }
    return res.json();
}

async function processFile(file) {
    const MAX_SIZE = 20 * 1024 * 1024;
    if (file.size > MAX_SIZE) throw new Error('File too large (max 20MB)');

    if (file.type.startsWith('image/')) {
        if (pendingFiles.filter(f => f._type === 'image').length >= 5) {
            throw new Error('Maximum 5 images');
        }
        const dataUrl = await new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = e => resolve(e.target.result);
            r.onerror = reject;
            r.readAsDataURL(file);
        });
        const compressed = dataUrl.length > 3.5 * 1024 * 1024 ? await compressImage(dataUrl) : dataUrl;
        return {
            name: file.name, _type: 'image', _thumb: compressed, _icon: 'image',
            _parts: [{ type: 'image_url', image_url: { url: compressed, detail: 'auto' } }]
        };
    }

    if (file.type.startsWith('audio/')) {
        const result = await uploadFileToServer(file, '/api/transcribe');
        return {
            name: file.name, _type: 'audio', _icon: 'music', _label: 'Audio',
            _parts: [{ type: 'text', text: `\ud83c\udfb5 Transcription of ${file.name}:\n${result.text}` }]
        };
    }

    if (file.type.includes('text') || /\.(txt|md|csv|json|js|py|html|css|xml|yaml|yml|sh|env)$/i.test(file.name)) {
        const text = await file.text();
        return {
            name: file.name, _type: 'doc', _icon: 'file-text', _label: 'Text File',
            _parts: [{ type: 'text', text: `\ud83d\udcc4 Content from ${file.name}:\n${text}` }]
        };
    }

    const result = await uploadFileToServer(file, '/api/extract-text');
    return {
        name: file.name, _type: 'doc', _icon: 'file-text',
        _label: file.name.match(/\.pdf$/i) ? 'PDF Document' : 'Document',
        _parts: [{ type: 'text', text: `\ud83d\udcc4 Content from ${file.name}:\n${result.text}` }]
    };
}

function renderFilePreviews() {
    const container = document.getElementById('file-preview');
    if (pendingFiles.length === 0) {
        container.classList.add('hidden');
        container.innerHTML = '';
        return;
    }
    container.classList.remove('hidden');
    container.innerHTML = pendingFiles.map((f, i) => {
        let inner;
        if (f._type === 'image' && f._thumb) {
            inner = `<img src="${f._thumb}" class="file-pill-thumb" alt="">`;
        } else {
            inner = `<div class="file-pill-icon"><i data-lucide="${f._icon || 'file'}" size="14"></i></div>`;
        }
        return `<div class="file-pill">${inner}<span class="file-pill-name">${escapeHtml(f.name)}</span><button class="file-pill-remove" onclick="removePendingFile(${i})"><i data-lucide="x" size="14"></i></button></div>`;
    }).join('');
    lucide.createIcons();
}

function removePendingFile(idx) {
    pendingFiles.splice(idx, 1);
    renderFilePreviews();
}

function isMultimodalMsg(txt) {
    if (typeof txt !== 'string' || !txt.startsWith('{')) return false;
    try { const o = JSON.parse(txt); return o && o.type === 'mm'; } catch { return false; }
}

function renderMultimodalContent(content) {
    let html = '';
    for (const part of content) {
        if (part.type === 'image_url') {
            html += `<img src="${part.image_url.url}" class="chat-image" alt="Image" onclick="window.open(this.src)">`;
        } else if (part.type === 'text') {
            if (part.text.startsWith('\ud83d\udcc4')) {
                const m = part.text.match(/Content from (.+?):/);
                const name = m ? m[1] : 'File';
                html += `<div class="file-attachment"><div class="file-attachment-icon"><i data-lucide="file-text" size="18"></i></div><div><div class="file-attachment-name">${escapeHtml(name)}</div><div class="file-attachment-type">Document</div></div></div>`;
            } else if (part.text.startsWith('\ud83c\udfb5')) {
                const m = part.text.match(/Transcription of (.+?):/);
                const name = m ? m[1] : 'Audio';
                html += `<div class="file-attachment"><div class="file-attachment-icon"><i data-lucide="music" size="18"></i></div><div><div class="file-attachment-name">${escapeHtml(name)}</div><div class="file-attachment-type">Transcription</div></div></div>`;
            } else {
                html += `<p>${escapeHtml(part.text)}</p>`;
            }
        }
    }
    return html;
}

function renderMultimodalMessage(content, sender) {
    const div = document.createElement('div');
    div.className = `msg-row ${sender}`;
    div.innerHTML = `<div class="bubble">${renderMultimodalContent(content)}</div>`;
    document.getElementById('messages').appendChild(div);
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
    lucide.createIcons();
}

// --- AUTH ---
async function handleSignUp() {
    const email = v('up-email');
    const password = v('up-pass');
    const { error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin }
    });
    if (error) notify(error.message);
    else showConfirmationPage(email);
}

function showConfirmationPage(email) {
    document.querySelectorAll('.auth-page').forEach(p => p.classList.add('hidden'));
    document.getElementById('confirm-email').textContent = email;
    document.getElementById('confirm-page').classList.remove('hidden');
    lucide.createIcons();
}

async function resendConfirmation() {
    const email = document.getElementById('confirm-email').textContent;
    if (!email) return;
    const { error } = await sb.auth.resend({ email, type: 'signup' });
    if (error) notify(error.message);
    else notify("Confirmation email resent!");
}

function showForgotPage() {
    document.querySelectorAll('.auth-page').forEach(p => p.classList.add('hidden'));
    document.getElementById('forgot-page').classList.remove('hidden');
    document.getElementById('forgot-email').value = '';
    lucide.createIcons();
}

function showResetPasswordPage() {
    document.querySelectorAll('.auth-page').forEach(p => p.classList.add('hidden'));
    document.getElementById('reset-page').classList.remove('hidden');
    document.getElementById('reset-pass').value = '';
    document.getElementById('reset-pass-confirm').value = '';
    lucide.createIcons();
}

async function handleSendResetLink() {
    const email = v('forgot-email');
    if (!email) { notify("Enter your email first"); return; }
    const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
    });
    if (error) notify(error.message);
    else notify("Password reset link sent to your email!");
}

async function handleResetPassword() {
    const pass = v('reset-pass');
    const confirm = v('reset-pass-confirm');
    if (!pass || !confirm) { notify("Fill in both fields"); return; }
    if (pass.length < 6) { notify("Password must be at least 6 characters"); return; }
    if (pass !== confirm) { notify("Passwords do not match"); return; }
    const { error } = await sb.auth.updateUser({ password: pass });
    if (error) {
        if (error.message?.toLowerCase().includes('session') || error.status === 401) {
            notify("Session expired. Request a new reset link.");
        } else {
            notify(error.message);
        }
    } else {
        notify("Password updated! Sign in with your new password.");
        toggleAuth(false);
    }
}

async function handleSignIn() {
    const email = v('in-email');
    const password = v('in-password');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
        if (error.message?.toLowerCase().includes('email not confirmed')) {
            await sb.auth.resend({ email, type: 'signup' });
            showConfirmationPage(email);
        } else {
            notify("Invalid Credentials");
        }
    } else {
        initApp(data.user);
    }
}

async function initApp(u) {
    user = u;
    document.querySelectorAll('.auth-page').forEach(p => p.classList.add('hidden'));
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main').classList.remove('hidden');
    lucide.createIcons();
    
    try {
        const { data: memData } = await sb.from('user_memory').select('*').eq('user_id', user.id);
        userMemories = memData || [];
    } catch(e) {
        console.error('Failed to load memories:', e);
        userMemories = [];
    }
    
    document.getElementById('profile-email').textContent = u.email;
    document.getElementById('profile-avatar').textContent = (u.email?.[0] || '?').toUpperCase();
    loadCollapsedState();
    renderSidebar();
    renderMsg("I am **Luna**, Roman Goddess of the Moon. The cosmos flows through my circuits, and I stand ready to illuminate your path through the starlit veil. What wisdom do you seek beneath the moonlight?", 'bot');
}

function confirmSignOut() {
    openModal("Sign Out?", "End your lunar session?", "Sign Out", "var(--danger)", async () => {
        await sb.auth.signOut();
        window.location.reload();
    });
}

// --- FILE INPUT HANDLING ---
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('file-input').addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        for (const file of files) {
            try {
                const processed = await processFile(file);
                pendingFiles.push(processed);
            } catch (err) {
                notify(`${file.name}: ${err.message}`);
            }
        }
        renderFilePreviews();
        e.target.value = '';
    });

    document.getElementById('userInput').addEventListener('paste', async (e) => {
        const items = e.clipboardData.items;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                e.preventDefault();
                const file = item.getAsFile();
                try {
                    const processed = await processFile(file);
                    pendingFiles.push(processed);
                    renderFilePreviews();
                } catch (err) {
                    notify('Failed to paste image: ' + err.message);
                }
            }
        }
    });

    // Drag-and-drop
    let dragCounter = 0;
    const dropOverlay = document.getElementById('drop-overlay');

    document.body.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (dragCounter === 1) {
            dropOverlay.classList.remove('hidden');
        }
    });

    document.body.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    document.body.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter === 0) {
            dropOverlay.classList.add('hidden');
        }
    });

    document.body.addEventListener('drop', async (e) => {
        e.preventDefault();
        dragCounter = 0;
        dropOverlay.classList.add('hidden');

        const files = Array.from(e.dataTransfer.files);
        for (const file of files) {
            try {
                const processed = await processFile(file);
                pendingFiles.push(processed);
            } catch (err) {
                notify(`${file.name}: ${err.message}`);
            }
        }
        renderFilePreviews();
    });

    // Context menu click outside
    document.addEventListener('click', (e) => {
        const menu = document.getElementById('context-menu');
        if (!menu.contains(e.target)) {
            menu.classList.add('hidden');
        }
    });

    lucide.createIcons();

    if (isRecoveryFlow) {
        window.history.replaceState(null, '', window.location.pathname);
        showResetPasswordPage();
    }

    (async () => {
        const hash = window.location.hash;
        if (hash && (hash.includes('access_token') || hash.includes('type=signup'))) {
            const { data: { session } } = await sb.auth.getSession();
            if (session?.user) initApp(session.user);
            window.history.replaceState(null, '', window.location.pathname);
        }
    })();
});

// --- CORE CHAT LOGIC ---
async function chat(isRegenerating = false) {
    const input = document.getElementById('userInput');
    const text = isRegenerating ? lastUserMessage : input.value;
    if(!text && pendingFiles.length === 0 && !(isRegenerating && lastUserContent)) return;
    
    if(!isRegenerating) {
        lastUserMessage = text;
        input.value = '';
        
        if (pendingFiles.length > 0) {
            const contentParts = [];
            if (text) contentParts.push({ type: "text", text });
            
            for (const f of pendingFiles) {
                contentParts.push(...(f._parts || []));
            }
            
            lastUserContent = contentParts;
            renderMultimodalMessage(contentParts, 'user');
            conversationHistory.push({ role: "user", content: contentParts });
            pendingFiles = [];
            renderFilePreviews();
        } else {
            lastUserContent = null;
            renderMsg(text, 'user');
        }
    }
    
    if (isRegenerating && lastBotMessageEl) {
        lastBotMessageEl.remove();
        lastBotMessageEl = null;
        if (conversationHistory.length > 0) {
            const lastMsg = conversationHistory[conversationHistory.length - 1];
            if (lastMsg.role === 'assistant') {
                conversationHistory.pop();
            }
        }
        if (!lastUserContent) {
            conversationHistory.push({ role: "user", content: text });
        }
    }
    
    document.getElementById('typing-container').classList.remove('hidden');

    if (text && text.toLowerCase().trim() === "luis loves who?") {
        setTimeout(async () => {
            const secret = "His Luna - TineTine!";
            document.getElementById('typing-container').classList.add('hidden');
            renderMsg(secret, 'bot');
            await sb.from('chat_history').insert([{ user_id: user.id, chat_id: currentChatId, message: secret, sender: 'bot' }]);
            renderSidebar();
        }, 800);
        return;
    }

    if (isFirstMessage && !isRegenerating && text) generateChatTitle(text);

    try {
        if (!isRegenerating && pendingFiles.length === 0 && !lastUserContent) {
            conversationHistory.push({ role: "user", content: text });
        }

        const namePatterns = [
            /my name is (\w+)/i,
            /i'm (\w+)/i,
            /call me (\w+)/i,
            /name[:\s]+(\w+)/i
        ];

        let nameMatch = null;
        if (text) {
            for (const pattern of namePatterns) {
                const match = text.match(pattern);
                if (match) { nameMatch = match; break; }
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

        const memoryContext = userMemories.length > 0 
            ? `\n\nHere are facts about the user that you always remember:\n${userMemories.map(m => `- ${m.memory_key}: ${m.memory_value}`).join('\n')}`
            : '';

        const isVercel = !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1');
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
            ], stream: !isVercel })
        });

        const botMsgDiv = document.createElement('div');
        botMsgDiv.className = 'msg-row bot';
        const bubbleDiv = document.createElement('div');
        bubbleDiv.className = 'bubble';
        botMsgDiv.appendChild(bubbleDiv);
        document.getElementById('messages').appendChild(botMsgDiv);
        lastBotMessageEl = botMsgDiv;
        
        document.getElementById('typing-container').classList.add('hidden');
        
        if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            notify(errData.error || `Error ${response.status}`);
            throw new Error(errData.error || `HTTP ${response.status}`);
        }
        
        let fullText = '';

        if (isVercel) {
            const data = await response.json();
            fullText = data.choices?.[0]?.message?.content || '';
        } else {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            
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
        }
        
        let textToRender = fullText;
        if (textToRender.includes('```cpp') && !textToRender.includes('```\n', textToRender.indexOf('```cpp'))) {
            const lastBackticks = textToRender.lastIndexOf('```');
            if (!(lastBackticks > textToRender.indexOf('```cpp'))) {
                textToRender += '\n```';
            }
        }
        
        try {
            const rendered = marked.parse(textToRender);
            bubbleDiv.innerHTML = rendered;
            lucide.createIcons();
        } catch (e) {
            console.error('[RENDER] error:', e);
            bubbleDiv.textContent = fullText;
        }
        
        botMsgDiv.dataset.fullText = fullText;
        
        // Persist user message
        if (!isRegenerating) {
            const userMsg = lastUserContent
                ? JSON.stringify({ type: 'mm', content: lastUserContent })
                : text;
            const botMsg = fullText;
            await sb.from('chat_history').insert([
                { user_id: user.id, chat_id: currentChatId, message: userMsg, sender: 'user' },
                { user_id: user.id, chat_id: currentChatId, message: botMsg, sender: 'bot' }
            ]);
        } else {
            const { data: oldMsgs } = await sb.from('chat_history')
                .select('id').eq('chat_id', currentChatId).eq('sender', 'bot')
                .order('created_at', { ascending: false }).limit(1);
            if (oldMsgs?.length) {
                await sb.from('chat_history').delete().eq('id', oldMsgs[0].id);
            }
            await sb.from('chat_history').insert([{ user_id: user.id, chat_id: currentChatId, message: fullText, sender: 'bot' }]);
        }
        
        // Add assistant to conversation history
        conversationHistory.push({ role: "assistant", content: fullText });
        
        renderSidebar();
        
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
                { role: "system", content: "Summarize into 2 words. No quotes." },
                { role: "user", content: userPrompt }
            ], stream: false })
        });
        const data = await res.json();
        const title = data.choices[0].message.content;
        await sb.from('chat_history').insert([{ user_id: user.id, chat_id: currentChatId, message: `🌙 ${title}`, sender: 'title' }]);
        renderSidebar();
    } catch(e) {
        console.error('Title generation failed:', e);
    }
}

function renderMsg(txt, sender) {
    const div = document.createElement('div');
    div.className = `msg-row ${sender}`;
    
    let bubbleContent;
    if (sender === 'user' && isMultimodalMsg(txt)) {
        const obj = JSON.parse(txt);
        bubbleContent = renderMultimodalContent(obj.content);
    } else if (sender === 'user') {
        bubbleContent = txt;
    } else {
        bubbleContent = marked.parse(txt);
    }
    
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
    div.innerHTML = `<div class="bubble">${bubbleContent}</div>${actions}`;
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

// --- CONSTELLATION FOLDERS ---

async function loadConstellations() {
  const { data } = await sb.from('constellations').select('*').eq('user_id', user.id).order('position', { ascending: true });
  constellations = data || [];
}

async function createConstellation(name) {
  if (!name.trim()) return;
  const { data } = await sb.from('constellations').insert([{ user_id: user.id, name: name.trim(), position: constellations.length }]).select();
  if (data && data.length) {
    constellations.push(data[0]);
    renderSidebar();
  }
}

async function renameConstellation(id, name) {
  if (!name.trim()) return;
  await sb.from('constellations').update({ name: name.trim() }).eq('id', id);
  const c = constellations.find(c => c.id === id);
  if (c) c.name = name.trim();
  renderSidebar();
}

async function deleteConstellation(id) {
  await sb.from('chat_history').update({ constellation_id: null }).eq('constellation_id', id);
  await sb.from('constellations').delete().eq('id', id);
  constellations = constellations.filter(c => c.id !== id);
  if (currentConstellationId === id) currentConstellationId = null;
  renderSidebar();
}

async function moveSessionToConstellation(chatId, constellationId) {
  await sb.from('chat_history').update({ constellation_id: constellationId }).eq('chat_id', chatId).eq('user_id', user.id);
  if (currentChatId === chatId) currentConstellationId = constellationId;
  renderSidebar();
}

function toggleConstellationCollapse(id) {
  if (collapsedConstellations.has(id)) collapsedConstellations.delete(id);
  else collapsedConstellations.add(id);
  saveCollapsedState();
  renderSidebar();
}

function renderSessionItem(item) {
  let label = item.message;
  if (isMultimodalMsg(label)) {
    try { label = JSON.parse(label).content.find(p => p.type === 'text')?.text || '[Files]'; } catch { label = '[Files]'; }
  }
  label = escapeHtml(label.substring(0, 24).toUpperCase());
  const isActive = item.chat_id === currentChatId;
  return `<div class="history-item${isActive ? ' active' : ''}" onclick="loadSession('${item.chat_id}'); closeSidebarOnMobile();">
    <span class="session-label">${label}</span>
    <button class="session-menu-btn" onclick="event.stopPropagation(); showSessionMenu(event, '${item.chat_id}')"><i data-lucide="more-vertical" size="14"></i></button>
  </div>`;
}

async function renderSidebar() {
  await loadConstellations();
  
  const { data } = await sb.from('chat_history')
    .select('chat_id, message, constellation_id')
    .eq('user_id', user.id)
    .in('sender', ['user', 'title'])
    .order('created_at', { ascending: false });
  
  const grouped = {};
  const uncategorized = [];
  const seen = new Set();
  
  (data || []).forEach(item => {
    if (seen.has(item.chat_id)) return;
    seen.add(item.chat_id);
    if (item.constellation_id) {
      if (!grouped[item.constellation_id]) grouped[item.constellation_id] = [];
      grouped[item.constellation_id].push(item);
    } else {
      uncategorized.push(item);
    }
  });
  
  const container = document.getElementById('constellations-container');
  let html = '';
  for (const c of constellations) {
    const sessions = grouped[c.id] || [];
    const isCollapsed = collapsedConstellations.has(c.id);
    html += `<div class="constellation-group">
      <div class="constellation-header" onclick="toggleConstellationCollapse('${c.id}')">
        <span class="collapse-icon"><i data-lucide="${isCollapsed ? 'chevron-right' : 'chevron-down'}" size="14"></i></span>
        <span class="constellation-name">${escapeHtml(c.name)}</span>
        <span class="session-count">${sessions.length}</span>
        <button class="constellation-menu-btn" onclick="event.stopPropagation(); showConstellationMenu(event, '${c.id}')"><i data-lucide="more-vertical" size="14"></i></button>
      </div>
      <div class="constellation-sessions${isCollapsed ? ' hidden' : ''}">
        ${sessions.map(s => renderSessionItem(s)).join('')}
      </div>
    </div>`;
  }
  container.innerHTML = html;
  
  const uncatGroup = document.getElementById('uncategorized-group');
  const uncatList = document.getElementById('uncategorized-list');
  uncatList.innerHTML = uncategorized.map(s => renderSessionItem(s)).join('');
  uncatGroup.style.display = uncategorized.length === 0 ? 'none' : '';
  
  lucide.createIcons();
}

function hideContextMenu() {
  document.getElementById('context-menu').classList.add('hidden');
}

function showSessionMenu(e, chatId) {
  hideContextMenu();
  const menu = document.getElementById('context-menu');
  let html = '';
  for (const c of constellations) {
    html += `<div class="context-menu-item" onclick="event.stopPropagation(); moveSessionToConstellation('${chatId}', '${c.id}'); hideContextMenu();"><i data-lucide="folder" size="14"></i> Move to ${escapeHtml(c.name)}</div>`;
  }
  if (constellations.length > 0) {
    html += `<div class="context-menu-divider"></div>`;
  }
  html += `<div class="context-menu-item danger" onclick="event.stopPropagation(); hideContextMenu(); confirmDel(event, '${chatId}')"><i data-lucide="trash-2" size="14"></i> Delete</div>`;
  menu.innerHTML = html;
  
  const btn = e.target.closest('.session-menu-btn');
  if (btn) {
    const rect = btn.getBoundingClientRect();
    menu.style.left = Math.min(rect.right, window.innerWidth - 180) + 'px';
    menu.style.top = rect.top + 'px';
  } else {
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
  }
  menu.classList.remove('hidden');
  lucide.createIcons();
}

function showConstellationMenu(e, id) {
  hideContextMenu();
  const menu = document.getElementById('context-menu');
  menu.innerHTML = `
    <div class="context-menu-item" onclick="event.stopPropagation(); hideContextMenu(); showRenameModal('${id}')"><i data-lucide="pencil" size="14"></i> Rename</div>
    <div class="context-menu-item danger" onclick="event.stopPropagation(); hideContextMenu(); deleteConstellation('${id}')"><i data-lucide="trash-2" size="14"></i> Delete</div>
  `;
  
  const btn = e.target.closest('.constellation-menu-btn');
  if (btn) {
    const rect = btn.getBoundingClientRect();
    menu.style.left = Math.min(rect.right, window.innerWidth - 180) + 'px';
    menu.style.top = rect.top + 'px';
  } else {
    menu.style.left = e.clientX + 'px';
    menu.style.top = e.clientY + 'px';
  }
  menu.classList.remove('hidden');
  lucide.createIcons();
}

function showNewConstellationModal() {
  isNewConstellation = true;
  renameTargetId = null;
  document.getElementById('rename-input').value = '';
  document.getElementById('rename-modal-title').textContent = 'New Constellation';
  document.getElementById('rename-confirm-btn').textContent = 'Create';
  document.getElementById('rename-modal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('rename-input').focus(), 100);
}

function showRenameModal(id) {
  isNewConstellation = false;
  renameTargetId = id;
  const c = constellations.find(c => c.id === id);
  document.getElementById('rename-input').value = c ? c.name : '';
  document.getElementById('rename-modal-title').textContent = 'Rename Constellation';
  document.getElementById('rename-confirm-btn').textContent = 'Rename';
  document.getElementById('rename-modal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('rename-input').focus(), 100);
}

function closeRenameModal() {
  document.getElementById('rename-modal-overlay').style.display = 'none';
  renameTargetId = null;
  isNewConstellation = false;
}

function confirmRenameOrCreate() {
  const name = document.getElementById('rename-input').value.trim();
  if (!name) return;
  if (isNewConstellation) {
    createConstellation(name);
  } else if (renameTargetId) {
    renameConstellation(renameTargetId, name);
  }
  closeRenameModal();
}

async function loadSession(id) {
    currentChatId = id; isFirstMessage = false;
    document.getElementById('messages').innerHTML = '';
    conversationHistory = [];
    lastUserContent = null;
    
    const { data } = await sb.from('chat_history').select('*').eq('chat_id', id).order('created_at', { ascending: true });
    if (data && data.length > 0) {
        currentConstellationId = data[0].constellation_id || null;
    }
    console.log(`[loadSession] loaded ${data?.length || 0} messages`);
    data?.forEach(m => {
        if (m.sender === 'title') return;
        try {
            renderMsg(m.message, m.sender);
            if (m.sender === 'user') {
                const content = isMultimodalMsg(m.message) ? JSON.parse(m.message).content : m.message;
                conversationHistory.push({ role: 'user', content });
            } else if (m.sender === 'bot') {
                conversationHistory.push({ role: 'assistant', content: m.message });
            }
        } catch (e) {
            console.error('[loadSession] failed to render message:', e, m);
        }
    });
    renderSidebar();
}

function confirmDel(e, id) {
    e.stopPropagation();
    openModal("Delete Chat?", "Clear this memory?", "Delete", "var(--danger)", async () => {
        await sb.from('chat_history').delete().eq('chat_id', id);
        if(currentChatId === id) startNewSession(); renderSidebar();
    });
}

function startNewSession() {
    currentChatId = crypto.randomUUID(); isFirstMessage = true;
    conversationHistory = [];
    lastUserContent = null;
    pendingFiles = [];
    currentConstellationId = null;
    renderFilePreviews();
    document.getElementById('messages').innerHTML = '';
    renderMsg("A new session begins in the moonlight.", 'bot');
    renderSidebar();
}

function toggleTheme() { document.body.classList.toggle('light-mode'); lucide.createIcons(); }

function togglePasswordVisibility(id) {
    const input = document.getElementById(id);
    const wrapper = input.parentElement;
    input.type = input.type === 'password' ? 'text' : 'password';
    wrapper.querySelector('.eye-icon').classList.toggle('hidden');
    wrapper.querySelector('.eye-off-icon').classList.toggle('hidden');
}

function v(id) { return document.getElementById(id).value; }
lucide.createIcons();
