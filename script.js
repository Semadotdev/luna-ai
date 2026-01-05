// --- CONFIG ---
const SB_URL = "https://odxdyzvrijcpqegxvjtl.supabase.co";
const SB_KEY = "sb_publishable_V3PL1gDtOfMoiO6tOWKcWw_7I2IB2x7";
const sb = supabase.createClient(SB_URL, SB_KEY);

let user = null;
let currentChatId = crypto.randomUUID();
let isFirstMessage = true;
let lastUserMessage = "";

// --- SECURITY: Hiding Credentials via LocalStorage ---
function getGroqKey() {
    return localStorage.getItem('LUNA_KEY');
}

function openKeyModal() {
    const currentKey = getGroqKey() || "";
    openModal("API Settings", "Enter your Groq API Key (gsk_...). It is saved locally on this browser only.", "Save Key", "var(--primary)", () => {
        const key = document.getElementById('key-input').value.trim();
        if(key.startsWith('gsk_')) {
            localStorage.setItem('LUNA_KEY', key);
            notify("Key secured successfully!");
        } else {
            notify("Invalid key format.");
        }
    });
    // Inject input into modal
    document.getElementById('modal-desc').innerHTML += `
        <input type="password" id="key-input" class="auth-input" style="margin-top:15px" placeholder="gsk_..." value="${currentKey}">
    `;
}

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
function toggleSidebarMenu() { document.getElementById('sidebar').classList.toggle('open'); }
function closeSidebarOnMobile() { document.getElementById('sidebar').classList.remove('open'); }

// --- AUTH ---
async function handleSignUp() {
    const { error } = await sb.auth.signUp({ email: v('up-email'), password: v('up-pass') });
    if(error) notify(error.message); else notify("Check your email!");
}

async function handleSignIn() {
    const { data, error } = await sb.auth.signInWithPassword({ email: v('in-email'), password: v('in-password') });
    if(error) notify("Invalid Credentials"); else initApp(data.user);
}

function initApp(u) {
    user = u;
    document.querySelectorAll('.auth-page').forEach(p => p.classList.add('hidden'));
    document.getElementById('sidebar').classList.remove('hidden');
    document.getElementById('main').classList.remove('hidden');
    lucide.createIcons();
    refreshHistory();
    renderMsg("I am **Luna**, intelligence that shines. How can I brighten your quest today?", 'bot');
}

function confirmSignOut() {
    openModal("Sign Out?", "End your lunar session?", "Sign Out", "var(--danger)", () => {
        sb.auth.signOut(); window.location.reload();
    });
}

// --- CORE CHAT LOGIC ---
async function chat(isRegenerating = false) {
    const key = getGroqKey();
    if(!key) { notify("API Key Required"); openKeyModal(); return; }

    const input = document.getElementById('userInput');
    const text = isRegenerating ? lastUserMessage : input.value;
    if(!text) return;
    if(!isRegenerating) { lastUserMessage = text; renderMsg(text, 'user'); input.value = ''; }
    
    document.getElementById('typing-container').classList.remove('hidden');

    // Secret Response
    if (text.toLowerCase().trim() === "luis loves who?") {
        setTimeout(async () => {
            const secret = "His Luna - TINETINE!";
            document.getElementById('typing-container').classList.add('hidden');
            renderMsg(secret, 'bot');
            await sb.from('chat_history').insert([{ user_id: user.id, chat_id: currentChatId, message: secret, sender: 'bot' }]);
            refreshHistory();
        }, 800);
        return;
    }

    if (isFirstMessage && !isRegenerating) generateChatTitle(text);

    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "system", content: "You are Luna. Use Markdown for every response." }, { role: "user", content: text }]
            })
        });
        const data = await res.json();
        const botRes = data.choices[0].message.content;
        document.getElementById('typing-container').classList.add('hidden');
        renderMsg(botRes, 'bot');
        await sb.from('chat_history').insert([{ user_id: user.id, chat_id: currentChatId, message: botRes, sender: 'bot' }]);
        refreshHistory();
    } catch(e) { 
        document.getElementById('typing-container').classList.add('hidden');
        notify("Check API Key or Connection."); 
    }
}

async function generateChatTitle(userPrompt) {
    isFirstMessage = false;
    const key = getGroqKey();
    try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json" },
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
    const content = sender === 'bot' ? marked.parse(txt) : txt;
    let actions = sender === 'bot' ? `<div class="bot-actions"><button class="action-btn" onclick="copyText(this, \`${txt.replace(/`/g, '\\`')}\`)"><i data-lucide="copy" size="14"></i> Copy</button><button class="action-btn" onclick="chat(true)"><i data-lucide="refresh-cw" size="14"></i> Regenerate</button></div>` : '';
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
    data?.forEach(m => renderMsg(m.message, m.sender));
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
    document.getElementById('messages').innerHTML = '';
    renderMsg("A new session begins in the moonlight.", 'bot');
}

function toggleTheme() { document.body.classList.toggle('light-mode'); lucide.createIcons(); }
function v(id) { return document.getElementById(id).value; }
lucide.createIcons();
