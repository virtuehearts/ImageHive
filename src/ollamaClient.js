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

export async function chatWithOllama(messages) {
  const settings = loadSettings();
  const gpu = await getGpuStatus();
  const useGpu = gpu.available;
  const promptPreamble = { role: 'system', content: buildSystemPrompt() };
  const body = {
    model: settings.ollamaModel,
    messages: [promptPreamble, ...messages],
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
