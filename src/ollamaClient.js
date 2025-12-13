import fetch from 'node-fetch';
import { exec } from 'child_process';
import util from 'util';
import { loadSettings } from './storage.js';
import { buildSystemPrompt } from './systemPrompt.js';

const execAsync = util.promisify(exec);

let cachedGpu = null;

export async function getOllamaStatus() {
  const settings = loadSettings();
  const status = {
    host: settings.ollamaHost,
    model: settings.ollamaModel,
    reachable: false,
    modelReady: false,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);

  try {
    const res = await fetch(`${settings.ollamaHost}/v1/models`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      status.error = `HTTP ${res.status} ${res.statusText}: ${text}`;
      return status;
    }

    const payload = await res.json();
    const models = payload?.data || [];
    const matches = models.filter((entry) => {
      const candidates = [entry?.id, entry?.root].filter(Boolean);
      return candidates.some((value) => value === status.model || value?.endsWith(`/${status.model}`));
    });

    status.reachable = true;
    status.modelReady = matches.length > 0;
    if (!status.modelReady) {
      status.error = `Model '${status.model}' not reported by Ollama.`;
    }
  } catch (error) {
    clearTimeout(timer);
    status.error = error.message;
  }

  return status;
}

export async function getGpuStatus() {
  if (cachedGpu) return cachedGpu;
  const gpuInfo = { available: false, method: 'nvidia-smi', devices: [] };
  try {
    const { stdout } = await execAsync('nvidia-smi --query-gpu=name --format=csv,noheader');
    const lines = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    gpuInfo.devices = lines;
    gpuInfo.available = lines.length > 0;
  } catch (error) {
    gpuInfo.method = 'fallback-cpu';
    gpuInfo.error = error.message;
  }
  cachedGpu = gpuInfo;
  return gpuInfo;
}

function normalizeMessages(messages = []) {
  return messages.map((message) => {
    const normalized = { ...message };

    if (Array.isArray(message.images) && message.images.length > 0) {
      normalized.images = message.images
        .map((img) => (typeof img === 'string' ? img : ''))
        .filter(Boolean)
        .map((img) => img.replace(/^data:image\/[^;]+;base64,/, ''));
    }

    return normalized;
  });
}

export async function chatWithOllama(messages) {
  const settings = loadSettings();
  const gpu = await getGpuStatus();
  const useGpu = gpu.available;
  const promptPreamble = { role: 'system', content: buildSystemPrompt() };
  const body = {
    model: settings.ollamaModel,
    messages: [promptPreamble, ...normalizeMessages(messages)],
    stream: false,
    temperature: 0.4,
  };

  try {
    const response = await fetch(`${settings.ollamaHost}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama error ${response.status}: ${text}`);
    }
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || 'No content returned from Ollama.';
    return { content, fromGpu: useGpu };
  } catch (error) {
    return {
      content: `Local Qwen is unavailable. Check that Ollama is running and the model is pulled. (${error.message})`,
      fromGpu: false,
      offline: true,
    };
  }
}

export async function streamChatWithOllama(messages, onChunk = () => {}) {
  const settings = loadSettings();
  const gpu = await getGpuStatus();
  const useGpu = gpu.available;
  const promptPreamble = { role: 'system', content: buildSystemPrompt() };
  const body = {
    model: settings.ollamaModel,
    messages: [promptPreamble, ...normalizeMessages(messages)],
    stream: true,
    temperature: 0.4,
  };

  try {
    const response = await fetch(`${settings.ollamaHost}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      const text = await response.text();
      throw new Error(`Ollama error ${response.status}: ${text}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      const lines = buffer.split('\n');
      buffer = lines.pop();

      lines.forEach((line) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        try {
          const parsed = JSON.parse(trimmed);
          const delta = parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.message?.content;
          if (delta) onChunk(delta);
        } catch {
          // ignore malformed chunks
        }
      });
    }

    if (buffer.trim()) {
      try {
        const parsed = JSON.parse(buffer.trim());
        const delta = parsed?.choices?.[0]?.delta?.content || parsed?.choices?.[0]?.message?.content;
        if (delta) onChunk(delta);
      } catch {
        // ignore trailing parse errors
      }
    }

    return { fromGpu: useGpu, offline: false };
  } catch (error) {
    onChunk(
      `Local Qwen is unavailable. Check that Ollama is running and the model is pulled. (${error.message || 'Unknown error'})`,
    );
    return { fromGpu: false, offline: true };
  }
}
