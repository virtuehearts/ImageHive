const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatMessage = document.getElementById('chat-message');
const chatImage = document.getElementById('chat-image');
const attachImage = document.getElementById('attach-image');
const imagePreview = document.getElementById('image-preview');
const imagePreviewImg = document.getElementById('image-preview-img');
const imagePreviewName = document.getElementById('image-preview-name');
const removeImage = document.getElementById('remove-image');
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
const ollamaHost = document.getElementById('ollama-host');
const ollamaModel = document.getElementById('ollama-model');
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
const startupOverlay = document.getElementById('startup-overlay');
const startupMessage = document.getElementById('startup-message');
const sendButton = chatForm.querySelector('button[type="submit"]');

const SESSION_KEY = 'imagehive-sessions-v1';
let sessions = [];
let activeSessionId = null;
let pendingImageDataUrl = '';
let pendingImageName = '';

function formatContent(content) {
  return (content ?? '').toString().replace(/\n/g, '<br/>');
}

function buildFootnote(meta) {
  if (!meta) return '';
  if (meta.footnote) return meta.footnote;
  const source = meta.offline ? 'Offline' : 'Ollama';
  const accel = meta.fromGpu ? 'GPU' : 'CPU';
  return `${accel} · ${source}`;
}

function attachFootnote(body, text) {
  if (!text) return;
  const footnote = document.createElement('div');
  footnote.className = 'muted small';
  footnote.innerHTML = formatContent(text);
  body.appendChild(document.createElement('br'));
  body.appendChild(footnote);
}

function setUiLocked(locked) {
  [
    chatMessage,
    saveJson,
    openRender,
    clearChat,
    newChat,
    openGallery,
    openSettings,
    saveGallery,
    renderFal,
    confirmRender,
    editRender,
    toggleRenderDetails,
    falAspectRatio,
    falResolution,
    galleryJson,
    galleryImage,
    sendButton,
    attachImage,
    removeImage,
    chatImage,
  ].forEach((el) => {
    if (el) el.disabled = locked;
  });

  document.querySelectorAll('.suggestion').forEach((btn) => {
    btn.disabled = locked;
  });
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

function appendMessage(role, content, options = {}) {
  const div = document.createElement('div');
  div.className = `message ${role}`;

  const label = document.createElement('small');
  label.textContent = role === 'user' ? 'You' : 'ImageHive';
  const body = document.createElement('div');
  body.className = 'message-body';
  body.innerHTML = formatContent(content);

  div.appendChild(label);
  div.appendChild(body);

  if (options.images?.length) {
    const wrap = document.createElement('div');
    wrap.className = 'message-images';
    options.images.forEach((src) => {
      const img = document.createElement('img');
      img.src = src.startsWith('data:') ? src : `data:image/*;base64,${src}`;
      img.alt = 'Attached reference';
      wrap.appendChild(img);
    });
    div.appendChild(wrap);
  }

  const footnoteText = buildFootnote(options.meta);
  attachFootnote(body, footnoteText);

  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
  return { container: div, body };
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
  session.messages.forEach((msg) =>
    appendMessage(msg.role, msg.content, { images: msg.images, meta: msg.meta }),
  );
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

function describeStartupStatus(ollama) {
  if (!ollama) return 'Waiting for server to answer…';
  if (!ollama.reachable) return 'Starting Ollama locally…';
  if (!ollama.modelReady) return 'Downloading and loading the Qwen model…';
  return 'Local model is ready. Loading ImageHive.';
}

async function waitForStartupReady() {
  setUiLocked(true);
  startupOverlay.classList.remove('hidden');

  while (true) {
    try {
      const res = await fetch('/api/health');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const { ollama } = data || {};
      startupMessage.textContent = describeStartupStatus(ollama);

      if (ollama?.reachable && ollama?.modelReady) {
        startupOverlay.classList.add('hidden');
        setUiLocked(false);
        fetchHealth();
        bootstrap();
        return;
      }
    } catch (error) {
      startupMessage.textContent = `Waiting for startup: ${error.message}`;
    }

    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 1500));
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

function showImagePreview(dataUrl, name) {
  if (!imagePreview || !imagePreviewImg || !imagePreviewName) return;
  imagePreviewImg.src = dataUrl;
  imagePreviewName.textContent = name || 'Attached image';
  imagePreview.classList.remove('hidden');
}

function clearPendingImage() {
  pendingImageDataUrl = '';
  pendingImageName = '';
  if (chatImage) chatImage.value = '';
  if (imagePreview) imagePreview.classList.add('hidden');
  if (imagePreviewImg) imagePreviewImg.src = '';
  if (imagePreviewName) imagePreviewName.textContent = '';
}

function handleImageSelection(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (event) => {
    pendingImageDataUrl = event.target?.result || '';
    pendingImageName = file.name;
    showImagePreview(pendingImageDataUrl, pendingImageName);
  };
  reader.readAsDataURL(file);
}

if (attachImage) {
  attachImage.addEventListener('click', () => chatImage?.click());
}

if (chatImage) {
  chatImage.addEventListener('change', (event) => {
    const file = event.target?.files?.[0];
    handleImageSelection(file);
  });
}

if (removeImage) {
  removeImage.addEventListener('click', clearPendingImage);
}

async function sendChat(message) {
  const session = getActiveSession();
  if (!session) return;
  const images = pendingImageDataUrl ? [pendingImageDataUrl] : [];
  const userText = message || (images.length ? 'Describe this image' : '');
  const userMessage = { role: 'user', content: userText };
  if (images.length) userMessage.images = images;

  session.messages.push(userMessage);
  updateSessionTitleFromMessage(userText);
  appendMessage('user', userText, { images });
  chatMessage.value = '';
  clearPendingImage();

  const payload = { messages: session.messages };
  const assistantMessage = appendMessage('bot', 'On it — sketching your prompt...', {
    meta: { footnote: 'Streaming response' },
  });
  const assistantBody = assistantMessage.body;
  let fullText = '';
  const meta = { fromGpu: false, offline: false };
  let streamError = null;

  const fetchNonStreamingReply = async () => {
    const res = await fetch('/api/chat?stream=false', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    let data = null;
    try {
      data = await res.json();
    } catch {
      // continue to error handling
    }

    if (!res.ok) {
      const messageText = data?.message || `HTTP ${res.status}`;
      throw new Error(messageText);
    }

    return data;
  };

  try {
    const res = await fetch('/api/chat?stream=true', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const processEvent = (event) => {
      if (!event?.type) return;
      if (event.type === 'token') {
        fullText += event.content || '';
        assistantBody.innerHTML = formatContent(`On it — sketching your prompt...\n${fullText}`);
      } else if (event.type === 'done') {
        meta.fromGpu = !!event.fromGpu;
        meta.offline = !!event.offline;
        if (!fullText) fullText = event.content || '';
      } else if (event.type === 'error') {
        streamError = new Error(event.message || 'Streaming error');
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      buffer += value ? decoder.decode(value, { stream: true }) : '';

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary).trim();
        buffer = buffer.slice(boundary + 2);
        if (raw.startsWith('data:')) {
          try {
            processEvent(JSON.parse(raw.replace(/^data:\s*/, '')));
          } catch (error) {
            streamError = streamError || error;
          }
        }
        boundary = buffer.indexOf('\n\n');
      }

      if (done) break;
    }

    const finalRaw = buffer.trim();
    if (finalRaw.startsWith('data:')) {
      try {
        processEvent(JSON.parse(finalRaw.replace(/^data:\s*/, '')));
      } catch (error) {
        streamError = streamError || error;
      }
    }

    if (streamError) throw streamError;

    assistantBody.innerHTML = formatContent(fullText || 'No content returned from ImageHive yet.');
    attachFootnote(assistantBody, buildFootnote(meta));

    session.messages.push({ role: 'assistant', content: fullText, meta });
    saveSessions();
    renderHistory();

    if (saveJson.checked && fullText) {
      galleryTitle.value = session.title || `Chat ${new Date().toLocaleString()}`;
      galleryJson.value = fullText;
      saveJson.checked = false;
    }
  } catch (error) {
    try {
      const fallback = await fetchNonStreamingReply();
      fullText = fallback.content || 'No content returned from ImageHive yet.';
      meta.fromGpu = !!fallback.fromGpu;
      meta.offline = !!fallback.offline;

      assistantBody.innerHTML = formatContent(fullText);
      attachFootnote(assistantBody, buildFootnote(meta));

      session.messages.push({ role: 'assistant', content: fullText, meta });
      saveSessions();
      renderHistory();
    } catch (fallbackError) {
      assistantBody.innerHTML = formatContent(
        `Error contacting server: ${error.message}. Fallback failed: ${fallbackError.message}`,
      );
    }
  }
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const msg = chatMessage.value.trim();
  if (!msg && !pendingImageDataUrl) return;
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
    ollamaHost: ollamaHost.value || undefined,
    ollamaModel: ollamaModel.value || undefined,
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
  if (data.ollamaHost) ollamaHost.value = data.ollamaHost;
  if (data.ollamaModel) ollamaModel.value = data.ollamaModel;
}

function startNewChat() {
  const id = createSession();
  setActiveSession(id);
  renderConversation();
  clearPendingImage();
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
  hydrateSettings();
  updateRenderSummary();
  loadGallery();
}

waitForStartupReady();
