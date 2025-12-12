import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env');

dotenv.config({ path: envPath });

const fallbackHost = 'http://127.0.0.1:8000';
const modelName = process.env.VLLM_MODEL || process.env.OLLAMA_MODEL || 'Qwen2.5-VL-3B-Instruct';
const vllmHost = process.env.VLLM_HOST || process.env.OLLAMA_HOST || fallbackHost;
const allowOffline = process.env.ALLOW_VLLM_OFFLINE === '1';
const skipDownload = process.env.SKIP_MODEL_DOWNLOAD === '1';
const dataDir = path.isAbsolute(process.env.DATA_DIR || '')
  ? process.env.DATA_DIR
  : path.join(projectRoot, process.env.DATA_DIR || './data');
const modelsDir = path.join(dataDir, 'models');
const modelFileName = 'Qwen2.5-VL-3B-Instruct-Q8_0.gguf';
const defaultModelUrl =
  process.env.VLLM_MODEL_URL ||
  'https://huggingface.co/unsloth/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct-Q8_0.gguf?download=true';
const modelPath = path.join(modelsDir, modelFileName);

function ensureEnvDefaults() {
  if (!fs.existsSync(envPath)) return;
  const envText = fs.readFileSync(envPath, 'utf-8');
  const lines = envText.split(/\r?\n/).filter(Boolean);
  const updated = new Map(
    lines.map((line) => {
      const [key, ...rest] = line.split('=');
      return [key, rest.join('=')];
    }),
  );
  if (!updated.get('VLLM_HOST')) updated.set('VLLM_HOST', vllmHost || fallbackHost);
  if (!updated.get('VLLM_MODEL')) updated.set('VLLM_MODEL', modelName);
  if (!updated.get('DATA_DIR')) updated.set('DATA_DIR', './data');
  if (!updated.get('VLLM_MODEL_URL')) updated.set('VLLM_MODEL_URL', defaultModelUrl);
  const nextText = Array.from(updated.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(envPath, `${nextText}\n`);
}

function ensureModelDirectories() {
  fs.mkdirSync(modelsDir, { recursive: true });
}

async function downloadWithProgress(url, destination) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download model: HTTP ${res.status} ${res.statusText}`);
  }

  const totalBytes = Number(res.headers.get('content-length')) || 0;
  let downloaded = 0;

  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destination);

    res.body.on('data', (chunk) => {
      downloaded += chunk.length;
      if (totalBytes > 0) {
        const percent = ((downloaded / totalBytes) * 100).toFixed(1);
        process.stdout.write(`\rDownloading model... ${percent}%`);
      } else {
        const mb = (downloaded / 1024 / 1024).toFixed(1);
        process.stdout.write(`\rDownloading model... ${mb} MB`);
      }
    });

    res.body.on('error', (err) => {
      fileStream.close(() => reject(err));
    });

    fileStream.on('finish', resolve);
    fileStream.on('error', reject);

    res.body.pipe(fileStream);
  });

  process.stdout.write('\n');
}

async function ensureModelDownload() {
  ensureModelDirectories();

  if (skipDownload) {
    console.log('Model download skipped (SKIP_MODEL_DOWNLOAD=1).');
    return modelPath;
  }

  if (fs.existsSync(modelPath)) {
    console.log(`Model already present at ${modelPath}`);
    return modelPath;
  }

  console.log(`Model not found locally. Downloading ${modelFileName}...`);
  try {
    await downloadWithProgress(defaultModelUrl, modelPath);
    console.log(`Model saved to ${modelPath}`);
  } catch (error) {
    if (fs.existsSync(modelPath)) {
      fs.rmSync(modelPath, { force: true });
    }
    throw error;
  }

  return modelPath;
}

async function isVllmReachable() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${vllmHost}/v1/models`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function verifyModelLoaded() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(`${vllmHost}/v1/models`, { signal: controller.signal });
    clearTimeout(timer);

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }

    const payload = await res.json();
    const models = payload?.data || [];
    const matches = models.filter((entry) => {
      const candidates = [entry?.id, entry?.root].filter(Boolean);
      return candidates.some((value) => value === modelName || value?.endsWith(`/${modelName}`));
    });

    if (!matches.length) {
      const available = models.map((entry) => entry?.id).filter(Boolean).join(', ') || 'none reported';
      throw new Error(`Model '${modelName}' not reported by vLLM. Available models: ${available}`);
    }

    const detected = matches[0]?.id || modelName;
    console.log(`vLLM model ready: ${detected}`);
    return true;
  } catch (error) {
    console.warn(`vLLM model probe failed: ${error.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function verifyChat() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const probeMessage = 'Testing ....';

  try {
    console.log('Testing ....');
    const res = await fetch(`${vllmHost}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelName,
        messages: [
          { role: 'system', content: 'You are ImageHive, a visual prompt assistant.' },
          { role: 'user', content: probeMessage },
        ],
        temperature: 0.2,
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }

    const data = await res.json();
    const reply = data.choices?.[0]?.message?.content?.trim();
    if (!reply) throw new Error('Empty response from vLLM chat probe.');

    const snippet = reply.length > 220 ? `${reply.slice(0, 220)}…` : reply;
    console.log(`vLLM responded to startup probe: ${snippet}`);
    console.log('vLLM : Okay');
    console.log('Booting interface.');
    return true;
  } catch (error) {
    console.warn(`vLLM chat probe failed: ${error.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  try {
    ensureEnvDefaults();
    await ensureModelDownload();
    const online = await isVllmReachable();
    if (!online) {
      console.warn(`vLLM host ${vllmHost} is not reachable. Ensure the server is running with model '${modelName}'.`);
      if (!allowOffline) {
        process.exitCode = 1;
        return;
      }
    }

    if (online) {
      const modelReady = await verifyModelLoaded();
      const chatReady = modelReady ? await verifyChat() : false;
      if (!chatReady && !allowOffline) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.warn(`Startup prep skipped: ${error.message}`);
    if (!allowOffline) {
      process.exitCode = 1;
    }
  }
})();
