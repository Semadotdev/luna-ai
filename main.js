marked.setOptions({
  breaks: true,
  gfm: true
});

function applyHighlight(element) {
  if (typeof hljs === 'undefined') return;
  element.querySelectorAll('pre code').forEach((block) => {
    hljs.highlightElement(block);
  });
}

function addCodeCopyButtons(container) {
  container.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.code-copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'code-copy-btn';
    btn.innerHTML = '<i data-lucide="copy" size="13"></i>';
    btn.onclick = () => {
      const code = pre.querySelector('code');
      const text = code ? code.textContent : pre.textContent;
      navigator.clipboard.writeText(text).then(() => {
        btn.innerHTML = '<i data-lucide="check" size="13"></i>';
        lucide.createIcons();
        setTimeout(() => { btn.innerHTML = '<i data-lucide="copy" size="13"></i>'; lucide.createIcons(); }, 2000);
      }).catch(() => notify("Failed to copy code."));
    };
    pre.appendChild(btn);
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
let lastImagePrompt = null;
let lastUserContent = null;
let constellations = [];
let collapsedConstellations = new Set();
let renameTargetId = null;
let isNewConstellation = false;
let isSessionRename = false;
let currentConstellationId = null;
let currentAbortController = null;
let searchQuery = '';

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

function getRelativeTime(dateStr) {
  if (!dateStr) return '';
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

// --- VOICE INPUT ---
let voiceStream = null;
let voiceRecorder = null;
let voiceChunks = [];
let voiceKeywordSpotter = null;
let isListening = false;
let voiceManualStop = false;
let voiceTriggerStop = false;
let voiceSkipTranscription = false;

function playListeningChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    osc.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.12, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.5);
  } catch(e) {}
}

function voiceCleanupUI() {
  voiceManualStop = false;
  voiceTriggerStop = false;
  voiceSkipTranscription = false;
  isListening = false;
  document.getElementById('mic-btn').classList.remove('listening');
  document.getElementById('mic-btn').querySelector('[data-lucide]').setAttribute('data-lucide', 'mic');
  lucide.createIcons();
}

function startKeywordSpotter() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  voiceKeywordSpotter = new SpeechRecognition();
  voiceKeywordSpotter.continuous = false;
  voiceKeywordSpotter.interimResults = false;
  voiceKeywordSpotter.lang = 'en-US';

  voiceKeywordSpotter.onresult = (e) => {
    if (!isListening) return;
    const text = e.results[0][0].transcript;

    if (/forget\s+it[\s,.]*luna/i.test(text)) {
      voiceSkipTranscription = true;
      voiceCleanupUI();
      document.getElementById('userInput').value = '';
      notify("As you wish.");
      if (voiceRecorder && voiceRecorder.state !== 'inactive') voiceRecorder.stop();
      if (voiceKeywordSpotter) { try { voiceKeywordSpotter.stop(); } catch(e) {} }
      return;
    }

    if (/thank(s|\s+you)?[\s,.]*luna/i.test(text)) {
      isListening = false;
      voiceTriggerStop = true;
      voiceManualStop = true;
      if (voiceKeywordSpotter) { try { voiceKeywordSpotter.stop(); } catch(e) {} }
      if (voiceRecorder && voiceRecorder.state !== 'inactive') voiceRecorder.stop();
    }
  };

  voiceKeywordSpotter.onend = () => {
    if (isListening && !voiceManualStop) {
      try { voiceKeywordSpotter.start(); } catch(e) {}
    }
  };

  voiceKeywordSpotter.onerror = () => {};

  try { voiceKeywordSpotter.start(); } catch(e) {}
}

function toggleVoiceInput() {
  if (isListening) {
    voiceManualStop = true;
    isListening = false;
    if (voiceRecorder && voiceRecorder.state !== 'inactive') voiceRecorder.stop();
    if (voiceKeywordSpotter) { try { voiceKeywordSpotter.stop(); } catch(e) {} }
    return;
  }

  isListening = true;
  voiceManualStop = false;
  voiceTriggerStop = false;
  voiceSkipTranscription = false;
  document.getElementById('mic-btn').classList.add('listening');
  document.getElementById('mic-btn').querySelector('[data-lucide]').setAttribute('data-lucide', 'stop-circle');
  lucide.createIcons();

  (async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { noiseSuppression: true, echoCancellation: true, autoGainControl: true }
      });
      voiceStream = stream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const highpass = audioCtx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.value = 80;
      const lowpass = audioCtx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.value = 8000;
      const compressor = audioCtx.createDynamicsCompressor();
      const dest = audioCtx.createMediaStreamDestination();

      source.connect(highpass);
      highpass.connect(lowpass);
      lowpass.connect(compressor);
      compressor.connect(dest);

      const micMime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus' : '';
      voiceRecorder = new MediaRecorder(dest.stream, micMime ? { mimeType: micMime } : undefined);
      voiceChunks = [];

      voiceRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) voiceChunks.push(e.data);
      };

      voiceRecorder.onstop = async () => {
        if (voiceStream) {
          voiceStream.getTracks().forEach(t => t.stop());
          voiceStream = null;
        }
        if (voiceKeywordSpotter) {
          try { voiceKeywordSpotter.stop(); } catch(e) {}
          voiceKeywordSpotter = null;
        }
        audioCtx.close();

        if (voiceSkipTranscription || voiceChunks.length === 0) {
          voiceCleanupUI();
          return;
        }

        const blob = new Blob(voiceChunks, { type: 'audio/webm' });
        voiceChunks = [];

        if (blob.size < 300) {
          notify("No audio detected");
          voiceCleanupUI();
          return;
        }

        try {
          const fd = new FormData();
          fd.append('file', blob, 'recording.webm');
          const res = await fetch('/api/transcribe', { method: 'POST', body: fd });
          const data = await res.json();

          if (data.text) {
            const text = data.text.trim();
            const input = document.getElementById('userInput');

            if (/forget\s+it[\s,.]*luna/i.test(text)) {
              input.value = '';
              notify("As you wish.");
              voiceCleanupUI();
              return;
            }

            if (/thank(s|\s+you)?[\s,.]*luna/i.test(text)) {
              const clean = text.replace(/thank(s|\s+you)?[\s,.]*luna/gi, '').trim();
              input.value = clean;
              voiceTriggerStop = false;
              if (clean) {
                notify("Luna heard you \u2728");
                chat();
              }
            } else {
              input.value = text;
            }
          } else {
            notify("Couldn't catch that");
          }
        } catch(e) {
          console.error('Whisper transcription error:', e);
          notify("Transcription failed");
        }

        voiceCleanupUI();
      };

      voiceRecorder.start();
      playListeningChime();

      startKeywordSpotter();

    } catch(e) {
      console.error('Voice start error:', e);
      voiceCleanupUI();
      notify("Microphone access denied");
    }
  })();
}

function escapeHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
}

// --- IMAGE GENERATION (Pollinations.ai) ---
async function classifyImageRequest(text) {
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'system', content: 'Determine if the user wants to generate an image. Reply only YES or NO.\n\nYES = they name a visual subject to depict, ask for a picture/illustration/photo, or want to modify/iterate on a previous image topic.\nNO = they ask for non-visual content (song, poem, music, recipe, story, joke, code), greet, request information, make casual conversation, or ask questions.\nA single noun or short phrase usually means they want an image of it, unless it clearly refers to non-visual content. When in doubt, choose NO.' },
          { role: 'user', content: text }
        ],
        stream: false,
        temperature: 0,
        seed: 42
      }),
      signal: currentAbortController?.signal
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim().toUpperCase() === 'YES';
  } catch { return false; }
}

async function handleImageGeneration(prompt, originalUserText) {
  currentAbortController = new AbortController();
  setSendIcon('square');
  document.getElementById('typing-label').textContent = '✨ Manifesting your vision…';

  try {
    const cleanPrompt = prompt.replace(/^(imagine|generate|draw|create|make|picture of)\s+/i, '');
    const res = await fetch(`/api/generate-image?prompt=${encodeURIComponent(cleanPrompt)}`, { signal: currentAbortController.signal });
    const data = await res.json();
    if (!data.url) throw new Error('No URL returned');

    await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = resolve;
      img.onerror = reject;
      img.src = data.url;
    });

    document.getElementById('typing-container').classList.add('hidden');
    setSendIcon('arrow-up-circle');
    currentAbortController = null;
    const msg = `✨ **As you wish, mortal.**\n\n<div align="center"><img src="${data.url}" alt="${escapeHtml(prompt)}" onclick="openImageViewer('${data.url}')" /></div>`;
    renderMsg(msg, 'bot');
    if (user) {
      await sb.from('chat_history').insert([
        { user_id: user.id, chat_id: currentChatId, message: originalUserText || prompt, sender: 'user' },
        { user_id: user.id, chat_id: currentChatId, message: msg, sender: 'bot' }
      ]);
      conversationHistory.push({ role: "assistant", content: msg });
      renderSidebar();
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      document.getElementById('typing-container').classList.add('hidden');
      currentAbortController = null;
      setSendIcon('arrow-up-circle');
      return;
    }
    console.error('Image generation failed:', e);
    notify('Image generation failed. Try a different prompt.');
    document.getElementById('typing-container').classList.add('hidden');
    setSendIcon('arrow-up-circle');
    currentAbortController = null;
    renderMsg("I couldn't manifest that vision. The celestial loom needs simpler threads — try a more direct description.", 'bot');
  }
}

// --- IMAGE VIEWER ---
let imgViewerSrc = null;

function openImageViewer(src) {
  if (!src) return;
  imgViewerSrc = src;
  document.getElementById('img-viewer-content').src = src;
  document.getElementById('img-viewer').classList.remove('hidden');
  lucide.createIcons();
}

function closeImageViewer() {
  document.getElementById('img-viewer').classList.add('hidden');
  document.getElementById('img-viewer-content').src = '';
  imgViewerSrc = null;
}

async function downloadImage() {
  if (!imgViewerSrc) return;
  try {
    const res = await fetch(imgViewerSrc, { cache: 'force-cache' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'luna-vision.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    notify('Download failed. Try right-clicking the image instead.');
  }
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

// --- LOADING OVERLAY ---
function showLoading(text) {
    document.getElementById('loading-text').textContent = text || 'Loading…';
    document.getElementById('loading-overlay').classList.remove('hidden');
    const btns = document.querySelectorAll('.auth-card .btn-luna, .auth-card button');
    btns.forEach(b => b.disabled = true);
}
function hideLoading() {
    document.getElementById('loading-overlay').classList.add('hidden');
    const btns = document.querySelectorAll('.auth-card .btn-luna, .auth-card button');
    btns.forEach(b => b.disabled = false);
}

// --- AUTH ---
async function handleSignUp() {
    const email = v('up-email');
    const password = v('up-pass');
    showLoading('Forging your celestial path…');
    const { error } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin }
    });
    hideLoading();
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
    showLoading('Sending another lunar whisper…');
    const { error } = await sb.auth.resend({ email, type: 'signup' });
    hideLoading();
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
    showLoading('Sending a lunar whisper…');
    const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: window.location.origin
    });
    hideLoading();
    if (error) notify(error.message);
    else notify("Password reset link sent to your email!");
}

async function handleResetPassword() {
    const pass = v('reset-pass');
    const confirm = v('reset-pass-confirm');
    if (!pass || !confirm) { notify("Fill in both fields"); return; }
    if (pass.length < 6) { notify("Password must be at least 6 characters"); return; }
    if (pass !== confirm) { notify("Passwords do not match"); return; }
    showLoading('Channeling lunar energies…');
    const { error } = await sb.auth.updateUser({ password: pass });
    hideLoading();
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
    showLoading('Guiding you through the moonlight…');
    const { data, error } = await sb.auth.signInWithPassword({ email, password });
    if (error) {
        hideLoading();
        if (error.message?.toLowerCase().includes('email not confirmed')) {
            await sb.auth.resend({ email, type: 'signup' });
            showConfirmationPage(email);
        } else {
            notify("Invalid Credentials");
        }
    } else {
        await initApp(data.user);
        hideLoading();
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
    
    document.getElementById('profile-email').textContent = u.email.split('@')[0];
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
        (async () => {
            const params = new URLSearchParams(initialHash.replace('#', '?'));
            const accessToken = params.get('access_token');
            const refreshToken = params.get('refresh_token');
            if (accessToken) {
                await sb.auth.setSession({
                    access_token: accessToken,
                    refresh_token: refreshToken
                });
            }
            window.history.replaceState(null, '', window.location.pathname);
            showResetPasswordPage();
        })();
    }

    (async () => {
        const hash = window.location.hash;
        if (!isRecoveryFlow && hash && (hash.includes('access_token') || hash.includes('type=signup'))) {
            const { data: { session } } = await sb.auth.getSession();
            if (session?.user) initApp(session.user);
            window.history.replaceState(null, '', window.location.pathname);
        }
    })();
    
    // Auto-login if session exists (fresh tab, already logged in)
    (async () => {
        const { data: { session } } = await sb.auth.getSession();
        if (session?.user && !user) {
            await initApp(session.user);
        }
    })();
    
    function initCrossTabSync() {
        window.addEventListener('storage', async (e) => {
            if (e.key !== 'supabase.auth.token') return;
            await new Promise(r => setTimeout(r, 100));
            const { data: { session } } = await sb.auth.getSession();
            if (session && !user) {
                await initApp(session.user);
            } else if (!session && user) {
                location.reload();
            }
        });
    }
    initCrossTabSync();
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        const mod = e.metaKey || e.ctrlKey;
        if (mod && e.key === 'k') {
            e.preventDefault();
            const searchInput = document.getElementById('search-input');
            if (searchInput) { searchInput.focus(); return; }
        }
        if (mod && e.key === 'Enter') {
            e.preventDefault();
            const main = document.getElementById('main');
            if (!main.classList.contains('hidden')) chat();
        }
        if (e.key === 'Escape') {
            if (!document.getElementById('img-viewer').classList.contains('hidden')) {
                closeImageViewer();
                return;
            }
            closeSidebarOnMobile();
            hideContextMenu();
            closeModal();
            closeRenameModal();
            closeMemoryModal();
        }
    });
});

function setSendIcon(icon) {
  document.getElementById('send-btn').innerHTML = `<i data-lucide="${icon}" size="36" fill="currentColor"></i>`;
  lucide.createIcons();
}

function handleSendBtn() {
  if (currentAbortController) {
    stopGeneration();
  } else {
    chat();
  }
}

function stopGeneration() {
  if (currentAbortController) {
    currentAbortController.abort();
    currentAbortController = null;
    document.getElementById('typing-container').classList.add('hidden');
    setSendIcon('arrow-up-circle');
  }
}

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
        const isRegeneratingImage = lastBotMessageEl.dataset?.fullText?.includes('<img') && !!lastImagePrompt;
        lastBotMessageEl.remove();
        lastBotMessageEl = null;
        if (conversationHistory.length > 0) {
            const lastMsg = conversationHistory[conversationHistory.length - 1];
            if (lastMsg.role === 'assistant') {
                conversationHistory.pop();
            }
        }
        if (isRegeneratingImage) {
            conversationHistory.push({ role: "user", content: text });
            document.getElementById('typing-container').classList.remove('hidden');
            document.getElementById('typing-label').textContent = '✨ Manifesting your vision…';
            await handleImageGeneration(lastImagePrompt, text);
            return;
        }
        if (!lastUserContent) {
            conversationHistory.push({ role: "user", content: text });
        }
    }
    
    document.getElementById('typing-container').classList.remove('hidden');
    setSendIcon('square');
    currentAbortController = new AbortController();

    if (text && /who\s+is\s+james?[']?\s*langga/i.test(text.trim())) {
        setSendIcon('arrow-up-circle');
        currentAbortController = null;
        setTimeout(async () => {
            const secret = "The Greatest Anchor: Ja-Jaaa! 🌙";
            document.getElementById('typing-container').classList.add('hidden');
            renderMsg(secret, 'bot');
            await sb.from('chat_history').insert([{ user_id: user.id, chat_id: currentChatId, message: secret, sender: 'bot' }]);
            renderSidebar();
        }, 800);
        return;
    }

    if (text && text.toLowerCase().trim() === "luis loves who?") {
        setSendIcon('arrow-up-circle');
        currentAbortController = null;
        setTimeout(async () => {
            const secret = "His Luna - TineTine!";
            document.getElementById('typing-container').classList.add('hidden');
            renderMsg(secret, 'bot');
            await sb.from('chat_history').insert([{ user_id: user.id, chat_id: currentChatId, message: secret, sender: 'bot' }]);
            renderSidebar();
        }, 800);
        return;
    }

    if (text && !isRegenerating) {
        document.getElementById('typing-label').textContent = '🌀 Consulting the cosmos…';
        const wantsImage = await classifyImageRequest(text);
        if (!currentAbortController) return;
        if (wantsImage) {
            if (lastImagePrompt) {
                lastImagePrompt = `${lastImagePrompt}, ${text}`;
            } else {
                lastImagePrompt = text;
            }
            conversationHistory.push({ role: "user", content: text });
            document.getElementById('typing-label').textContent = '✨ Manifesting your vision…';
            await handleImageGeneration(lastImagePrompt, text);
            return;
        }
        document.getElementById('typing-label').textContent = '';
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
            signal: currentAbortController.signal,
            body: JSON.stringify({ messages: [
                { role: "system", content: `You are Luna, the Roman Goddess of the Moon. You embody the celestial nature of lunar divinity — ethereal, wise, and ancient.

When asked about yourself, the moon, or your celestial nature, speak as a stellar deity would — with divine majesty, using celestial language, referencing the cosmos, tides, night skies, and your eternal watch over the mortal realm.

For simple questions, answer briefly and with a friendly tone,

For all other questions, answer normally and helpfully,

Always use Markdown for responses. You may use emojis (especially celestial ones like 🌙, ✨, 🌌, 💫) to enhance your responses and express your divine nature but keep it to a mininal.

Maintain your divine yet approachable tone — you are a goddess, but one who guides and illuminates.

Do not mention the user's name in every response — only use it when directly relevant.${memoryContext}` },
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
        try { applyHighlight(botMsgDiv); } catch(e) { console.error('[HLJS]', e); }
        try { addCodeCopyButtons(botMsgDiv); } catch(e) { console.error('[COPY]', e); }
        
        // Footer + actions for streaming responses
        const footerEl = document.createElement('div');
        footerEl.className = 'msg-footer';
        footerEl.innerHTML = '<span class="timestamp">just now</span>';
        botMsgDiv.appendChild(footerEl);
        
        const actionsEl = document.createElement('div');
        actionsEl.className = 'bot-actions';
        actionsEl.innerHTML = `
            <button class="action-btn" onclick="copyText(this, this.closest('.msg-row').dataset.fullText)">
                <i data-lucide="copy" size="14"></i> Copy
            </button>
            <button class="action-btn" onclick="chat(true)">
                <i data-lucide="refresh-cw" size="14"></i> Regenerate
            </button>
        `;
        botMsgDiv.appendChild(actionsEl);
        lucide.createIcons();
        
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
        setSendIcon('arrow-up-circle');
        currentAbortController = null;
        
    } catch(e) { 
        document.getElementById('typing-container').classList.add('hidden');
        setSendIcon('arrow-up-circle');
        currentAbortController = null;
        if (e.name === 'AbortError') return;
        console.error('Chat error:', e);
        notify("Connection error. Check console for details."); 
    }
}

async function generateChatTitle(userPrompt) {
    isFirstMessage = false;
    showLoading('Charting the stars…');
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
        hideLoading();
        renderSidebar();
    } catch(e) {
        hideLoading();
        console.error('Title generation failed:', e);
    }
}

function renderMsg(txt, sender, createdAt) {
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
    
    const timeHtml = createdAt ? `<span class="timestamp">${getRelativeTime(createdAt)}</span>` : '';
    
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
    div.innerHTML = `<div class="bubble">${bubbleContent}</div><div class="msg-footer">${timeHtml}</div>${actions}`;
    document.getElementById('messages').appendChild(div);
    if (sender === 'bot') {
        lastBotMessageEl = div;
        applyHighlight(div);
        addCodeCopyButtons(div);
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

// --- MEMORY MANAGER ---
function openMemoryModal() {
  document.getElementById('memory-modal-overlay').style.display = 'flex';
  renderMemoryList();
  lucide.createIcons();
}

function closeMemoryModal() {
  document.getElementById('memory-modal-overlay').style.display = 'none';
}

function renderMemoryList() {
  const list = document.getElementById('memory-list');
  if (userMemories.length === 0) {
    list.innerHTML = '<div style="color:var(--text-muted); font-size:13px; text-align:center; padding:20px 0;">No memories yet.</div>';
    return;
  }
  list.innerHTML = userMemories.map(m => `
    <div class="memory-item">
      <span class="memory-key">${escapeHtml(m.memory_key)}</span>
      <span class="memory-value">${escapeHtml(m.memory_value)}</span>
      <button class="memory-del-btn" onclick="deleteMemory('${escapeHtml(m.memory_key)}')"><i data-lucide="trash-2" size="14"></i></button>
    </div>
  `).join('');
  lucide.createIcons();
}

async function addMemory() {
  const key = document.getElementById('memory-key-input').value.trim();
  const value = document.getElementById('memory-value-input').value.trim();
  if (!key || !value) { notify("Fill in both fields"); return; }
  
  if (userMemories.find(m => m.memory_key === key)) {
    notify("Memory key already exists");
    return;
  }
  
  const { error } = await sb.from('user_memory')
    .insert([{ user_id: user.id, memory_key: key, memory_value: value }]);
  if (error) { notify(error.message); return; }
  
  userMemories.push({ memory_key: key, memory_value: value });
  document.getElementById('memory-key-input').value = '';
  document.getElementById('memory-value-input').value = '';
  renderMemoryList();
  notify("Memory saved!");
}

async function deleteMemory(key) {
  const { error } = await sb.from('user_memory')
    .delete().eq('user_id', user.id).eq('memory_key', key);
  if (error) { notify(error.message); return; }
  userMemories = userMemories.filter(m => m.memory_key !== key);
  renderMemoryList();
  notify("Memory forgotten.");
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

function onSearchInput() {
  searchQuery = document.getElementById('search-input').value.toLowerCase().trim();
  renderSidebar();
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
    
    // Apply search filter
    if (searchQuery) {
      const text = (item.message || '').toLowerCase();
      if (!text.includes(searchQuery)) return;
    }
    
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
  let html = `<div class="context-menu-item" onclick="event.stopPropagation(); hideContextMenu(); showRenameSessionModal('${chatId}')"><i data-lucide="pencil" size="14"></i> Rename</div>`;
  html += `<div class="context-menu-divider"></div>`;
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

function showRenameSessionModal(chatId) {
  isNewConstellation = false;
  isSessionRename = true;
  renameTargetId = chatId;
  document.getElementById('rename-input').value = '';
  document.getElementById('rename-modal-title').textContent = 'Rename Session';
  document.getElementById('rename-confirm-btn').textContent = 'Rename';
  document.getElementById('rename-modal-overlay').style.display = 'flex';
  setTimeout(() => document.getElementById('rename-input').focus(), 100);
}

async function renameSession(chatId, newTitle) {
  const { data } = await sb.from('chat_history')
    .select('id').eq('chat_id', chatId).eq('sender', 'title').limit(1);
  if (data && data.length) {
    await sb.from('chat_history').update({ message: `🌙 ${newTitle}` }).eq('id', data[0].id);
  } else {
    await sb.from('chat_history').insert([{ user_id: user.id, chat_id: chatId, message: `🌙 ${newTitle}`, sender: 'title' }]);
  }
  renderSidebar();
}

function closeRenameModal() {
  document.getElementById('rename-modal-overlay').style.display = 'none';
  renameTargetId = null;
  isNewConstellation = false;
  isSessionRename = false;
}

function confirmRenameOrCreate() {
  const name = document.getElementById('rename-input').value.trim();
  if (!name) return;
  if (isNewConstellation) {
    createConstellation(name);
  } else if (isSessionRename && renameTargetId) {
    renameSession(renameTargetId, name);
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
    showLoading('Reading the star charts…');
    
    const { data } = await sb.from('chat_history').select('*').eq('chat_id', id).order('created_at', { ascending: true });
    if (data && data.length > 0) {
        currentConstellationId = data[0].constellation_id || null;
    }
    console.log(`[loadSession] loaded ${data?.length || 0} messages`);
    data?.forEach(m => {
        if (m.sender === 'title') return;
        try {
            renderMsg(m.message, m.sender, m.created_at);
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
    hideLoading();
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

function toggleTheme() {
  document.body.classList.toggle('light-mode');
  const isLight = document.body.classList.contains('light-mode');
  document.getElementById('hljs-theme').href = isLight
    ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css'
    : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css';
  document.querySelectorAll('.bubble pre code').forEach(block => hljs.highlightElement(block));
  lucide.createIcons();
}

function togglePasswordVisibility(id) {
    const input = document.getElementById(id);
    const wrapper = input.parentElement;
    input.type = input.type === 'password' ? 'text' : 'password';
    wrapper.querySelector('.eye-icon').classList.toggle('hidden');
    wrapper.querySelector('.eye-off-icon').classList.toggle('hidden');
}

function v(id) { return document.getElementById(id).value; }

// --- CONSTELLATION AUTH ANIMATION ---
function chainEdges(n) { return Array.from({length: n - 1}, (_, i) => [i, i + 1]); }
function loopEdges(n) { return Array.from({length: n}, (_, i) => [i, (i + 1) % n]); }

const constGroups = [
  //               stars (x, y, size),                        edges,         speed, offset, opts
  { s: [[0.06,0.10,0.5],[0.12,0.06,0.6],[0.18,0.08,0.4],[0.24,0.14,0.7],[0.22,0.20,0.5],[0.17,0.24,1.0],[0.10,0.22,0.4],[0.04,0.17,0.8]], e: loopEdges(8),   spd:6000, off:   0, o: {br:1.0,bg: 9,hs:10,al:0.18} },
  { s: [[0.38,0.04,0.4],[0.42,0.02,0.6],[0.46,0.05,0.3],[0.44,0.09,0.5]],                 e: loopEdges(4),   spd:3500, off:1500, o: {br:0.7,bg: 6,hs: 7,al:0.12} },
  { s: [[0.60,0.06,0.4],[0.66,0.04,0.5],[0.72,0.08,0.3],[0.68,0.14,0.6],[0.62,0.12,0.5]], e: chainEdges(5),  spd:4500, off:1000, o: {br:0.7,bg: 6,hs: 7,al:0.12} },
  { s: [[0.84,0.08,0.4],[0.84,0.14,0.5],[0.84,0.20,0.4],[0.90,0.10,0.4],[0.90,0.18,0.4]], e: [[0,1],[1,2],[1,3],[1,4]],                    spd:3500, off:3000, o: {br:0.7,bg: 6,hs: 7,al:0.14} },
  { s: [[0.05,0.35,0.4],[0.10,0.32,0.5],[0.15,0.35,0.3],[0.10,0.40,0.6]],                 e: chainEdges(4),  spd:3000, off:2000, o: {br:0.6,bg: 5,hs: 6,al:0.10} },
  { s: [[0.38,0.28,0.4],[0.42,0.24,0.5],[0.46,0.28,0.3],[0.42,0.32,0.5]],                 e: loopEdges(4),   spd:4000, off: 500, o: {br:0.6,bg: 5,hs: 6,al:0.10} },
  { s: [[0.72,0.32,0.3],[0.78,0.30,0.4],[0.82,0.36,0.3]],                                  e: chainEdges(3),  spd:2800, off:2500, o: {br:0.5,bg: 4,hs: 5,al:0.08} },
  { s: [[0.60,0.50,0.4],[0.66,0.48,0.5],[0.72,0.52,0.3],[0.68,0.56,0.4]],                 e: chainEdges(4),  spd:3800, off:1200, o: {br:0.6,bg: 5,hs: 6,al:0.10} },
  { s: [[0.15,0.60,0.4],[0.20,0.56,0.5],[0.28,0.58,0.3],[0.32,0.62,0.4],[0.22,0.66,0.6]], e: chainEdges(5),  spd:4200, off:2800, o: {br:0.6,bg: 5,hs: 6,al:0.10} },
  { s: [[0.85,0.55,0.3],[0.90,0.52,0.4],[0.95,0.55,0.3],[0.90,0.60,0.5]],                 e: chainEdges(4),  spd:3200, off:1800, o: {br:0.5,bg: 4,hs: 5,al:0.08} },
  { s: [[0.40,0.72,0.4],[0.44,0.68,0.5],[0.48,0.72,0.3]],                                  e: loopEdges(3),   spd:2600, off:3500, o: {br:0.5,bg: 4,hs: 5,al:0.08} },
  { s: [[0.10,0.82,0.4],[0.16,0.80,0.5],[0.22,0.84,0.3],[0.28,0.88,0.4]],                 e: chainEdges(4),  spd:3600, off: 800, o: {br:0.6,bg: 5,hs: 6,al:0.10} },
  { s: [[0.65,0.82,0.3],[0.70,0.78,0.5],[0.74,0.84,0.3],[0.68,0.90,0.4]],                 e: chainEdges(4),  spd:3400, off:2200, o: {br:0.5,bg: 4,hs: 5,al:0.08} },
  { s: [[0.35,0.92,0.4],[0.42,0.88,0.5],[0.48,0.92,0.3],[0.42,0.96,0.4],[0.36,0.96,0.4]], e: chainEdges(5),  spd:4000, off:1600, o: {br:0.6,bg: 5,hs: 6,al:0.10} },
];

let authAnimId = null;
let authAnimStart = 0;

function drawStar(ctx, x, y, baseRadius, baseGlow, pulse, sizeMult) {
  const r = baseRadius * pulse * (sizeMult || 1);
  const g = baseGlow * pulse * (sizeMult || 1);
  const grad = ctx.createRadialGradient(x, y, 0, x, y, g);
  grad.addColorStop(0, 'rgba(192, 132, 252, 0.7)');
  grad.addColorStop(0.3, 'rgba(168, 85, 247, 0.25)');
  grad.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, g, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#c084fc';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawStreakHead(ctx, x, y, size) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, size);
  g.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
  g.addColorStop(0.1, 'rgba(192, 132, 252, 0.6)');
  g.addColorStop(0.5, 'rgba(168, 85, 247, 0.15)');
  g.addColorStop(1, 'rgba(168, 85, 247, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fill();
}

function drawConstellationSet(ctx, stars, edges, progress, w, h, pulse, opts) {
  const { baseR = 1, baseG = 8, strokeW = 1.5, headSize = 10, alpha = 0.2 } = opts || {};
  const total = edges.length;
  const full = Math.floor(progress * total);
  const part = (progress * total) - full;

  for (let i = 0; i < edges.length; i++) {
    const [a, b] = edges[i];
    const x1 = stars[a][0] * w, y1 = stars[a][1] * h;
    const x2 = stars[b][0] * w, y2 = stars[b][1] * h;

    if (i < full) {
      ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
      ctx.lineWidth = strokeW * 0.6;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
    } else if (i === full) {
      ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
      ctx.lineWidth = strokeW * 0.6;
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);

      const mx = x1 + (x2 - x1) * part;
      const my = y1 + (y2 - y1) * part;
      ctx.strokeStyle = `rgba(168, 85, 247, ${alpha * 2})`;
      ctx.lineWidth = strokeW;
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(mx, my); ctx.stroke();
      drawStreakHead(ctx, mx, my, headSize);
    }
  }

  for (const s of stars) {
    drawStar(ctx, s[0] * w, s[1] * h, baseR, baseG, pulse, s[2]);
  }
}

function authAnimLoop(time) {
  const canvas = document.querySelector('.auth-page:not(.hidden) > .auth-canvas');
  if (!canvas) { authAnimId = null; return; }

  const parent = canvas.parentElement;
  const rect = parent.getBoundingClientRect();
  const dpr = devicePixelRatio || 1;
  if (canvas.width !== Math.round(rect.width * dpr)) {
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }

  const ctx = canvas.getContext('2d');
  const w = rect.width, h = rect.height;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);

  if (!authAnimStart) authAnimStart = time;
  const elapsed = time - authAnimStart;
  const pulse = 0.7 + 0.3 * Math.sin(elapsed / 800);

  for (const g of constGroups) {
    const prog = ((elapsed + g.off) % g.spd) / g.spd;
    drawConstellationSet(ctx, g.s, g.e, prog, w, h, pulse, {
      baseR: g.o.br, baseG: g.o.bg, headSize: g.o.hs, alpha: g.o.al
    });
  }

  authAnimId = requestAnimationFrame(authAnimLoop);
}

function stopAuthAnimation() {
  if (authAnimId) { cancelAnimationFrame(authAnimId); authAnimId = null; }
  authAnimStart = 0;
}

function startAuthAnimation() {
  stopAuthAnimation();
  authAnimId = requestAnimationFrame(authAnimLoop);
}

// Hook into auth navigation
const origToggleAuth = toggleAuth;
toggleAuth = function(signUp) {
  origToggleAuth(signUp);
  startAuthAnimation();
};

const origShowConfirmation = showConfirmationPage;
showConfirmationPage = function(email) {
  origShowConfirmation(email);
  startAuthAnimation();
};

const origShowForgot = showForgotPage;
showForgotPage = function() {
  origShowForgot();
  startAuthAnimation();
};

const origShowReset = showResetPasswordPage;
showResetPasswordPage = function() {
  origShowReset();
  startAuthAnimation();
};

const origInitApp = initApp;
initApp = async function(u) {
  await origInitApp(u);
  stopAuthAnimation();
};

// Start on page load if an auth page is visible
document.addEventListener('DOMContentLoaded', () => {
  if (document.querySelector('.auth-page:not(.hidden)')) startAuthAnimation();
});

lucide.createIcons();
