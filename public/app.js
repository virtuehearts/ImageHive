const chatLog = document.getElementById('chat-log');
const chatForm = document.getElementById('chat-form');
const chatMessage = document.getElementById('chat-message');
const saveJson = document.getElementById('save-json');
const gpuStatus = document.getElementById('gpu-status');
const clearChat = document.getElementById('clear-chat');
const galleryList = document.getElementById('gallery-list');
const refreshGallery = document.getElementById('refresh-gallery');
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

const conversation = [];

function formatContent(content) {
  return (content ?? '').toString().replace(/\n/g, '<br/>');
}

function appendMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `<small>${role === 'user' ? 'You' : 'ImageHive'}</small>${formatContent(content)}`;
  chatLog.appendChild(div);
  chatLog.scrollTop = chatLog.scrollHeight;
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

async function sendChat(message) {
  conversation.push({ role: 'user', content: message });
  appendMessage('user', message);
  chatMessage.value = '';
  const payload = { messages: conversation };
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
    conversation.push({ role: 'assistant', content: data.content });
    appendMessage('bot', `${data.content} <br/><span class="muted">${data.fromGpu ? 'GPU' : 'CPU'} · ${data.offline ? 'Offline' : 'Ollama'}</span>`);
    if (saveJson.checked) {
      galleryTitle.value = `Chat ${new Date().toLocaleString()}`;
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
  conversation.length = 0;
  chatLog.innerHTML = '';
  showIntroMessage();
});

function showIntroMessage() {
  const intro = [
    'Hi, I\'m ImageHive — your assistant for image styles, themes, and aspect ratios.',
    'I can recommend Fal.ai runners, generate 3×3 cinematic scene builders, and craft production-ready prompts so you can go straight to creating.'
  ].join('\n');
  appendMessage('bot', intro);
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

async function persistGallery() {
  const title = galleryTitle.value.trim();
  const promptJson = galleryJson.value.trim();
  const imageUrl = galleryImage.value.trim();
  if (!title || !promptJson) return alert('Add a title and JSON prompt first.');
  const res = await fetch('/api/gallery', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, promptJson, imageUrl }),
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

saveGallery.addEventListener('click', persistGallery);
refreshGallery.addEventListener('click', loadGallery);
renderFal.addEventListener('click', generateFalRender);

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

showIntroMessage();
fetchHealth();
hydrateSettings();
loadGallery();

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
      galleryImage.value = data.imageUrl;
      galleryTitle.value = galleryTitle.value || `Fal render ${new Date().toLocaleString()}`;
    }
  } catch (error) {
    falStatus.textContent = `Fal error: ${error.message}`;
  }
}
