const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatMessage = document.getElementById('chat-message');
const saveJson = document.getElementById('save-json');
const gpuStatus = document.getElementById('gpu-status');
const clearChat = document.getElementById('clear-chat');
const openRender = document.getElementById('open-render');
const chatSessionTitle = document.getElementById('chat-session-title');
const historyList = document.getElementById('history-list');
const newChat = document.getElementById('new-chat');
const galleryList = document.getElementById('gallery-list');
const saveGallery = document.getElementById('save-gallery');
const galleryTitle = document.getElementById('gallery-title');
const galleryJson = document.getElementById('gallery-json');
const galleryImage = document.getElementById('gallery-image');
const renderFal = document.getElementById('render-fal');
const falAspectRatio = document.getElementById('fal-aspect-ratio');
const falResolution = document.getElementById('fal-resolution');
const falStatus = document.getElementById('fal-status');
const settingsModal = document.getElementById('settings-modal');
const openSettings = document.getElementById('open-settings');
const closeSettings = document.getElementById('close-settings');
const settingsForm = document.getElementById('settings-form');
const falKey = document.getElementById('fal-key');
const vllmHost = document.getElementById('vllm-host');
const vllmModel = document.getElementById('vllm-model');
const renderDetails = document.getElementById('render-details');
const toggleRenderDetails = document.getElementById('toggle-render-details');
const summaryAspect = document.getElementById('summary-aspect');
const summaryResolution = document.getElementById('summary-resolution');
const summaryJson = document.getElementById('summary-json');
const confirmRender = document.getElementById('confirm-render');
const editRender = document.getElementById('edit-render');
const renderConfirmation = document.getElementById('render-confirmation');
const galleryModal = document.getElementById('gallery-modal');
const openGallery = document.getElementById('open-gallery');
const closeGallery = document.getElementById('close-gallery');

const SESSION_KEY = 'imagehive-sessions-v1';
let sessions = [];
let activeSessionId = null;

function formatContent(content) {
  return (content ?? '').toString().replace(/\n/g, '<br/>');
}

function loadSessions() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    sessions = raw ? JSON.parse(raw) : [];
  } catch {
    sessions = [];
  }
  if (!sessions.length) {
    const id = createSession();
    activeSessionId = id;
  } else if (!activeSessionId) {
    activeSessionId = sessions[0].id;
  }
}

function saveSessions() {
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessions));
}

function createSession() {
  const session = {
    id: `chat-${Date.now()}`,
    title: 'New chat',
    messages: [],
    createdAt: new Date().toISOString(),
  };
  sessions.unshift(session);
  saveSessions();
  return session.id;
}

function getActiveSession() {
  return sessions.find((s) => s.id === activeSessionId) || sessions[0];
}

function setActiveSession(id) {
  activeSessionId = id;
  renderHistory();
  renderConversation();
  saveSessions();
}

function renderHistory() {
  historyList.innerHTML = '';
  if (!sessions.length) {
    historyList.innerHTML = '<p class="history-empty">No chats yet. Start a new one!</p>';
    return;
  }

  sessions.forEach((session) => {
    const button = document.createElement('button');
    button.className = `history-item${session.id === activeSessionId ? ' active' : ''}`;
    const lastMessage = session.messages[session.messages.length - 1]?.content || 'Empty chat';
    button.innerHTML = `
      <div class="title-row">
        <strong>${session.title}</strong>
        <span class="chip">${session.messages.length} msgs</span>
      </div>
      <small>${lastMessage.slice(0, 60)}${lastMessage.length > 60 ? '…' : ''}</small>
    `;
    button.addEventListener('click', () => setActiveSession(session.id));
    historyList.appendChild(button);
  });
}

function appendMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `<small>${role === 'user' ? 'You' : 'ImageHive'}</small>${formatContent(content)}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function renderConversation() {
  const session = getActiveSession();
  chatLog.innerHTML = '';
  chatSessionTitle.textContent = session?.title || 'Conversation';
  renderConfirmation.classList.add('hidden-block');
  if (!session || !session.messages.length) {
    showIntroMessage();
    return;
  }
  session.messages.forEach((msg) => appendMessage(msg.role, msg.content));
}

function updateSessionTitleFromMessage(message) {
  const session = getActiveSession();
  if (!session) return;
  if (session.title === 'New chat' || session.title.startsWith('Chat ')) {
    const trimmed = message.slice(0, 42).trim();
    session.title = trimmed || 'New chat';
    saveSessions();
    renderHistory();
  }
}

async function fetchHealth() {
  gpuStatus.textContent = 'Checking GPU...';
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    gpuStatus.textContent = data.gpu?.available ? `GPU ready (${data.gpu.devices?.join(', ') || 'detected'})` : 'CPU fallback';
  } catch (error) {
    gpuStatus.textContent = 'Health check failed';
  }
}

function setRenderDetailsVisibility(open) {
  if (open) {
    renderDetails.classList.remove('hidden');
    toggleRenderDetails.textContent = 'Hide JSON & Settings';
    toggleRenderDetails.setAttribute('aria-expanded', 'true');
  } else {
    renderDetails.classList.add('hidden');
    toggleRenderDetails.textContent = 'View JSON & Settings';
    toggleRenderDetails.setAttribute('aria-expanded', 'false');
  }
}

function updateRenderSummary() {
  const aspectLabel = falAspectRatio?.selectedOptions?.[0]?.textContent || falAspectRatio.value;
  const resolutionLabel = falResolution?.selectedOptions?.[0]?.textContent || falResolution.value;
  summaryAspect.textContent = aspectLabel;
  summaryResolution.textContent = resolutionLabel.replace('(default)', '').trim();

  const promptJson = galleryJson.value.trim();
  summaryJson.textContent = promptJson || 'Add a JSON prompt above to preview it here.';
}

function showRenderPanel() {
  renderConfirmation.classList.remove('hidden-block');
  updateRenderSummary();
}

async function sendChat(message) {
  const session = getActiveSession();
  if (!session) return;
  session.messages.push({ role: 'user', content: message });
  updateSessionTitleFromMessage(message);
  appendMessage('user', message);
  chatMessage.value = '';
  const payload = { messages: session.messages };
  appendMessage('bot', '<em>Thinking...</em>');
  const spinner = chatLog.lastChild;
  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    chatLog.removeChild(spinner);
    session.messages.push({ role: 'assistant', content: data.content });
    appendMessage('bot', `${data.content} <br/><span class="muted">${data.fromGpu ? 'GPU' : 'CPU'} · ${data.offline ? 'Offline' : 'Ollama'}</span>`);
    saveSessions();
    renderHistory();
    if (saveJson.checked) {
      galleryTitle.value = session.title || `Chat ${new Date().toLocaleString()}`;
      galleryJson.value = data.content;
      saveJson.checked = false;
    }
  } catch (error) {
    chatLog.removeChild(spinner);
    appendMessage('bot', `Error contacting server: ${error.message}`);
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = chatMessage.value.trim();
  if (!msg) return;
  sendChat(msg);
});

clearChat.addEventListener('click', () => {
  const session = getActiveSession();
  if (!session) return;
  session.messages = [];
  saveSessions();
  renderConversation();
});

openRender.addEventListener('click', () => {
  populateRenderDefaultsFromChat();
  showRenderPanel();
});

function showIntroMessage() {
  const intro = [
    "Hi, I'm ImageHive — your assistant for image styles, themes, and aspect ratios.",
    'I can recommend Fal.ai runners, generate 3×3 cinematic scene builders, and craft production-ready prompts so you can go straight to creating.'
  ].join('\n');
  appendMessage('bot', intro);
}

function setRenderDetailsVisibilityFromButton() {
  const isHidden = renderDetails.classList.contains('hidden');
  updateRenderSummary();
  setRenderDetailsVisibility(isHidden);
}

document.querySelectorAll('.suggestion').forEach((btn) => {
  btn.addEventListener('click', () => {
    chatMessage.value = btn.dataset.prompt;
    chatMessage.focus();
  });
});

async function loadGallery() {
  galleryList.innerHTML = '<p class="muted">Loading gallery...</p>';
  try {
    const res = await fetch('/api/gallery');
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) {
      galleryList.innerHTML = '<p class="muted">No entries yet. Save JSON prompts to build your library.</p>';
      return;
    }
    galleryList.innerHTML = '';
    data.forEach((entry) => {
      const card = document.createElement('article');
      card.className = 'gallery-card';
      card.innerHTML = `
        <header>
          <div>
            <strong>${entry.title}</strong>
            <div class="muted">${new Date(entry.createdAt).toLocaleString()}</div>
            ${entry.sessionTitle ? `<div class="muted">From ${entry.sessionTitle}</div>` : ''}
          </div>
          <span class="chip">${entry.imageUrl ? 'Image + JSON' : 'JSON only'}</span>
        </header>
        <pre>${entry.promptJson}</pre>
        ${entry.imageUrl ? `<img src="${entry.imageUrl}" alt="${entry.title}" />` : ''}
      `;
      galleryList.appendChild(card);
    });
  } catch (error) {
    galleryList.innerHTML = `<p class="muted">Failed to load gallery: ${error.message}</p>`;
  }
}

async function persistGallery(sessionId) {
  const title = galleryTitle.value.trim();
  const promptJson = galleryJson.value.trim();
  const imageUrl = galleryImage.value.trim();
  if (!title || !promptJson) return alert('Add a title and JSON prompt first.');
  const res = await fetch('/api/gallery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title,
      promptJson,
      imageUrl,
      sessionId,
      sessionTitle: getActiveSession()?.title,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    return alert(text);
  }
  galleryTitle.value = '';
  galleryJson.value = '';
  galleryImage.value = '';
  loadGallery();
}

saveGallery.addEventListener('click', () => persistGallery(activeSessionId));
renderFal.addEventListener('click', () => {
  updateRenderSummary();
  setRenderDetailsVisibility(true);
  renderDetails.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
toggleRenderDetails.addEventListener('click', setRenderDetailsVisibilityFromButton);
confirmRender.addEventListener('click', () => {
  updateRenderSummary();
  generateFalRender();
});
editRender.addEventListener('click', () => {
  setRenderDetailsVisibility(true);
  galleryJson.focus();
});

[falAspectRatio, falResolution, galleryJson].forEach((el) => {
  el?.addEventListener('change', updateRenderSummary);
  el?.addEventListener('input', updateRenderSummary);
});

openSettings.addEventListener('click', () => settingsModal.classList.remove('hidden'));
closeSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));

settingsForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    falApiKey: falKey.value,
    vllmHost: vllmHost.value || undefined,
    vllmModel: vllmModel.value || undefined,
  };
  await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  settingsModal.classList.add('hidden');
  fetchHealth();
});

async function hydrateSettings() {
  const res = await fetch('/api/settings');
  const data = await res.json();
  if (data.falApiKey === 'stored') falKey.placeholder = '•••• saved locally';
  if (data.vllmHost) vllmHost.value = data.vllmHost;
  if (data.vllmModel) vllmModel.value = data.vllmModel;
}

function startNewChat() {
  const id = createSession();
  setActiveSession(id);
  renderConversation();
}

newChat.addEventListener('click', startNewChat);

openGallery.addEventListener('click', () => {
  galleryModal.classList.remove('hidden');
  loadGallery();
});
closeGallery.addEventListener('click', () => galleryModal.classList.add('hidden'));

function populateRenderDefaultsFromChat() {
  const session = getActiveSession();
  if (!session) return;
  const latestBotJson = [...session.messages].reverse().find((m) => m.role === 'assistant')?.content || '';
  if (!galleryJson.value) galleryJson.value = latestBotJson;
  if (!galleryTitle.value) galleryTitle.value = session.title;
}

async function autoSaveImageToGallery(imageUrl) {
  const session = getActiveSession();
  populateRenderDefaultsFromChat();
  if (!galleryJson.value || !imageUrl) return;
  galleryImage.value = imageUrl;
  galleryTitle.value = galleryTitle.value || `Fal render ${new Date().toLocaleString()}`;
  await persistGallery(session?.id);
}

async function generateFalRender() {
  const promptJson = galleryJson.value.trim();
  if (!promptJson) return alert('Add a JSON prompt before sending to Fal.');
  falStatus.textContent = 'Sending to Fal...';
  try {
    const res = await fetch('/api/fal/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptJson,
        aspectRatio: falAspectRatio.value,
        resolution: falResolution.value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.message || 'Fal render failed.');
    }
    falStatus.textContent = data.imageUrl
      ? 'Fal render ready — image URL added below.'
      : 'Fal render finished (no image URL returned).';
    if (data.imageUrl) {
      await autoSaveImageToGallery(data.imageUrl);
    }
  } catch (error) {
    falStatus.textContent = `Fal error: ${error.message}`;
  }
}

function bootstrap() {
  loadSessions();
  renderHistory();
  renderConversation();
  fetchHealth();
  hydrateSettings();
  updateRenderSummary();
  loadGallery();
}

bootstrap();
