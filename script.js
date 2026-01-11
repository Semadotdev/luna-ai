const SB_URL = "https://odxdyzvrijcpqegxvjtl.supabase.co";
const SB_KEY = "sb_publishable_V3PL1gDtOfMoiO6tOWKcWw_7I2IB2x7";
const sb = supabase.createClient(SB_URL, SB_KEY);

let user = null, currentChatId = crypto.randomUUID(), isFirstMessage = true, lastUserMessage = "";

// --- PASSWORD TOGGLE LOGIC ---
function togglePasswordVisibility(inputId, iconEl) {
    const input = document.getElementById(inputId);
    if (input.type === "password") {
        input.type = "text";
        iconEl.setAttribute("data-lucide", "eye-off");
    } else {
        input.type = "password";
        iconEl.setAttribute("data-lucide", "eye");
    }
    lucide.createIcons();
}

// --- BYOK SECURITY LOGIC ---
function getStoreKey() { return `LUNA_GROQ_KEY_${user.id}`; }
function getStoredApiKey() { return localStorage.getItem(getStoreKey()); }

function updateKeyStatusBadge() {
    const key = getStoredApiKey();
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    if (key && key.startsWith('gsk_')) {
        dot.style.background = "var(--success)";
        text.style.color = "var(--success)";
        text.innerText = "Active";
    } else {
        dot.style.background = "var(--danger)";
        text.style.color = "var(--danger)";
        text.innerText = "Missing";
    }
}

function openKeyModal() {
    const currentKey = getStoredApiKey() || "";
    openModal("Celestial Connection", "Enter your Groq API Key to synchronize with Luna.", "Save Key", "var(--primary)", () => {
        const newKey = document.getElementById('api-key-input').value.trim();
        if(newKey.startsWith("gsk_")) {
            localStorage.setItem(getStoreKey(), newKey);
            updateKeyStatusBadge(); 
            notify("Core synchronized successfully.");
        } else {
            notify("Invalid Groq key format.");
        }
    });
    document.getElementById('modal-desc').innerHTML = `
        <p style="font-size:13px; color:var(--text-muted); margin-bottom:15px">Your key is stored locally on this device only.</p>
        <input type="password" id="api-key-input" class="auth-input" placeholder="gsk_..." value="${currentKey}">
    `;
}

// --- UI HELPERS ---
function toggleSidebarMenu() { document.getElementById('sidebar').classList.toggle('open'); }
function closeSidebarOnMobile() { document.getElementById('sidebar').classList.remove('open'); }
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
    document.getElementById('modal-title').innerText = title;
    document.getElementById('modal-desc').innerHTML = desc;
    const btn = document.getElementById('modal-confirm-btn');
    btn.innerText = confirmBtnText; btn.style.background = color;
    btn.onclick = () => { onConfirm(); closeModal(); };
    document.getElementById('modal-overlay').style.display = 'flex';
}
function closeModal() { document.getElementById('modal-overlay').style.display = 'none'; }

// --- AUTH ---
async function handleSignUp() {
    const { error } = await sb.auth.signUp({ email: v('up-email'), password: v('up-pass') });
    if(error) notify(error.message); else notify("Account Created. Welcome to the cosmos.");
}
async function handleSignIn() {
    const { data, error } = await sb.auth.signInWithPassword({ email: v('in-email'), password: v('in-password') });
    if(error) notify("Invalid Credentials."); else initApp(data.user);
}
function initApp(u) {
    user = u;
    document.querySelectorAll('.auth-page').forEach(p => p.classList.add('hidden'));
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main').classList.remove('hidden');
    updateKeyStatusBadge(); 
    lucide.createIcons();
    refreshHistory();
    renderMsg("The stars have aligned. I am **Luna**, an intelligence that shines. How shall we illuminate the void today?", 'bot');
}
function confirmSignOut() {
    openModal("Depart", "Shall we drift back into the silence of the stars?", "Sign Out", "var(--danger)", () => {
        sb.auth.signOut(); window.location.reload();
    });
}

// --- CORE CHAT LOGIC (MULTI-TURN & CONCISE) ---
async function chat(isRegenerating = false) {
    const apiKey = getStoredApiKey();
    if(!apiKey) { openKeyModal(); return; }

    const input = document.getElementById('userInput');
    const text = isRegenerating ? lastUserMessage : input.value;
    if(!text) return;

    if(!isRegenerating) { 
        lastUserMessage = text; 
        renderMsg(text, 'user'); 
        input.value = ''; 
        
        await sb.from('chat_history').insert([{ 
            user_id: user.id, 
            chat_id: currentChatId, 
            message: text, 
            sender: 'user' 
        }]);
    }
    
    if (isFirstMessage && !isRegenerating) generateChatTitle(text, apiKey);

    const lowerText = text.toLowerCase().trim();
    if (lowerText.includes("luis loves who")) {
        const customRes = "His Luna - TINETINE!";
        renderMsg(customRes, 'bot');
        await sb.from('chat_history').insert([{ user_id: user.id, chat_id: currentChatId, message: customRes, sender: 'bot' }]);
        refreshHistory();
        return; 
    }

    try {
        const { data: history } = await sb.from('chat_history')
            .select('sender, message')
            .eq('chat_id', currentChatId)
            .order('created_at', { ascending: true });

        const messageHistory = history.map(m => ({
            role: m.sender === 'bot' ? 'assistant' : 'user',
            content: m.message
        }));

        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [
                    { 
                        role: "system", 
                        content: `You are Luna, a celestial intelligence. Your tone is serene, professional, and luminous.
                        
                        RULES:
                        1. DEPTH: For complex requests, provide structured depth with celestial metaphors.
                        2. FORMATTING: Use Markdown. ALWAYS use two actual new lines between paragraphs and headings for visual clarity.. This is critical for visual clarity.
                        3. Ethereal personality is key, but don't let it hinder speed and clarity.` 
                    },
                    ...messageHistory
                ]
            })
        });
        
        const data = await res.json();
        if(data.error) throw new Error(data.error.message);
        
        const botRes = data.choices[0].message.content;
        renderMsg(botRes, 'bot');
        await sb.from('chat_history').insert([{ user_id: user.id, chat_id: currentChatId, message: botRes, sender: 'bot' }]);
        refreshHistory();
    } catch(e) { 
        notify("Nebula interference: " + e.message);
    }
}

async function generateChatTitle(userPrompt, apiKey) {
    isFirstMessage = false;
    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "system", content: "Summarize into 3 words. No quotes." }, { role: "user", content: userPrompt }]
            })
        });
        const data = await res.json();
        const title = data.choices[0].message.content;
        await sb.from('chat_history').insert([{ user_id: user.id, chat_id: currentChatId, message: `🌙 ${title}`, sender: 'user' }]);
        refreshHistory();
    } catch(e) {}
}

function renderMsg(txt, sender) {
    const div = document.createElement('div');
    div.className = `msg-row ${sender}`;
    
    let content;
    if (sender === 'bot') {
        // Set options to ensure GFM (GitHub Flavored Markdown) is active for lists
        marked.setOptions({
            gfm: true,
            breaks: true,
            smartLists: true // Ensures better list behavior
        });
        content = marked.parse(txt);
    } else {
        // Basic escaping for user text to prevent HTML injection while keeping formatting
        content = txt.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    let actions = sender === 'bot' ? `
        <div class="bot-actions">
            <button class="action-btn" onclick="copyText(this, \`${txt.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`)">
                <i data-lucide="copy" size="14"></i> Copy
            </button>
            <button class="action-btn" onclick="chat(true)">
                <i data-lucide="refresh-cw" size="14"></i> Regenerate
            </button>
        </div>` : '';

    div.innerHTML = `<div class="bubble">${content}</div>${actions}`;
    document.getElementById('messages').appendChild(div);
    document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
    lucide.createIcons();
}
function copyText(btn, text) {
    navigator.clipboard.writeText(text);
    btn.innerHTML = `<i data-lucide="check" size="14"></i> Copied`;
    lucide.createIcons();
    setTimeout(() => { btn.innerHTML = `<i data-lucide="copy" size="14"></i> Copy`; lucide.createIcons(); }, 2000);
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
    const { data } = await sb.from('chat_history').select('*').eq('chat_id', id).order('created_at', { ascending: true });
    data?.forEach(m => {
        if (!m.message.startsWith('🌙 ')) renderMsg(m.message, m.sender);
    });
}

function confirmDel(e, id) {
    e.stopPropagation();
    openModal("Clear Memory?", "Shall this constellation be forgotten?", "Delete", "var(--danger)", async () => {
        await sb.from('chat_history').delete().eq('chat_id', id);
        if(currentChatId === id) startNewSession(); refreshHistory();
    });
}

function startNewSession() {
    currentChatId = crypto.randomUUID(); isFirstMessage = true;
    document.getElementById('messages').innerHTML = '';
    renderMsg("A new constellation of thought begins. I am listening.", 'bot');
}



function toggleTheme() { document.body.classList.toggle('light-mode'); lucide.createIcons(); }
function v(id) { return document.getElementById(id).value; }
lucide.createIcons();
