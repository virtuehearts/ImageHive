import fetch from 'node-fetch';
import { exec } from 'child_process';
import util from 'util';
import { loadSettings } from './storage.js';

const execAsync = util.promisify(exec);

let cachedGpu = null;

export async function getGpuStatus() {
  if (cachedGpu) return cachedGpu;
  const gpuInfo = { available: false, method: 'nvidia-smi', devices: [] };
  try {
    const { stdout } = await execAsync('nvidia-smi --query-gpu=name --format=csv,noheader');
    const lines = stdout.split('\n').map((line) => line.trim()).filter(Boolean);
    gpuInfo.devices = lines;
    gpuInfo.available = lines.length > 0;
  } catch (error) {
    gpuInfo.method = 'fallback-cpu';
    gpuInfo.error = error.message;
  }
  cachedGpu = gpuInfo;
  return gpuInfo;
}

export async function chatWithQwen(messages) {
  const settings = loadSettings();
  const gpu = await getGpuStatus();
  const useGpu = gpu.available;
  const body = {
    model: settings.ollamaModel,
    messages,
    stream: false,
    options: {
      num_gpu: useGpu ? 1 : 0,
      temperature: 0.4,
    },
  };

  try {
    const response = await fetch(`${settings.ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama error ${response.status}: ${text}`);
    }
    const data = await response.json();
    const content = data.message?.content || 'No content returned from Ollama.';
    return { content, fromGpu: useGpu };
  } catch (error) {
    return {
      content: `Local Qwen is unavailable. Check that Ollama is running and the model is pulled. (${error.message})`,
      fromGpu: false,
      offline: true,
    };
  }
}
