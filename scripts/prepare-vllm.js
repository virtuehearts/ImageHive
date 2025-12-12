import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { spawn } from 'child_process';
import util from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env');
const vllmPidFile = path.join(projectRoot, '.vllm.pid');
const logDir = path.join(projectRoot, 'logs');
const vllmLogFile = path.join(logDir, 'vllm.log');

const execAsync = util.promisify(exec);

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

function formatBytesPerSecond(bytesPerSecond) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return '0 B/s';
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s'];
  let value = bytesPerSecond;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(1)} ${units[unitIndex]}`;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'ETA --:--';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0');
  return `ETA ${minutes}m ${remainingSeconds}s`;
}

function formatProgressBar(percent, width = 24) {
  const filled = Math.round((percent / 100) * width);
  const bar = `${'='.repeat(Math.max(0, filled - 1))}${filled > 0 ? '>' : ''}${' '.repeat(
    Math.max(0, width - filled),
  )}`;
  return `[${bar}]`;
}

async function downloadWithProgress(url, destination) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download model: HTTP ${res.status} ${res.statusText}`);
  }

  const totalBytes = Number(res.headers.get('content-length')) || 0;
  let downloaded = 0;
  const startedAt = Date.now();

  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destination);

    res.body.on('data', (chunk) => {
      downloaded += chunk.length;
      const elapsedSeconds = (Date.now() - startedAt) / 1000;
      const speed = downloaded / Math.max(elapsedSeconds, 0.001);
      const speedText = formatBytesPerSecond(speed);

      if (totalBytes > 0) {
        const percent = (downloaded / totalBytes) * 100;
        const etaSeconds = (totalBytes - downloaded) / Math.max(speed, 1);
        const bar = formatProgressBar(percent);
        const percentText = percent.toFixed(1).padStart(5, ' ');
        process.stdout.write(
          `\rDownloading model... ${bar} ${percentText}% | ${speedText} | ${formatDuration(
            etaSeconds,
          )}`,
        );
      } else {
        const mb = (downloaded / 1024 / 1024).toFixed(1);
        process.stdout.write(`\rDownloading model... ${mb} MB | ${speedText}`);
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

async function detectGpu() {
  try {
    const { stdout } = await execAsync('nvidia-smi --query-gpu=name --format=csv,noheader');
    const devices = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (devices.length) {
      console.log(`GPU detected: ${devices.join(', ')}`);
      return { available: true, devices };
    }
  } catch (error) {
    console.log(`GPU check failed (${error.message}). Falling back to CPU mode.`);
  }
  console.log('CPU mode enabled (no compatible GPU detected).');
  return { available: false, devices: [] };
}

function ensureLogDirectory() {
  fs.mkdirSync(logDir, { recursive: true });
}

function isLocalHost(url) {
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
  } catch (error) {
    console.warn(`Invalid VLLM_HOST '${url}': ${error.message}`);
    return false;
  }
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

async function waitForVllmReady(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await isVllmReachable();
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function readExistingVllmPid() {
  if (!fs.existsSync(vllmPidFile)) return null;
  const pidText = fs.readFileSync(vllmPidFile, 'utf-8').trim();
  const pid = Number.parseInt(pidText, 10);
  if (Number.isNaN(pid)) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    fs.rmSync(vllmPidFile, { force: true });
    return null;
  }
}

function writeVllmPid(pid) {
  fs.writeFileSync(vllmPidFile, String(pid));
}

async function hasPythonModule(moduleName) {
  try {
    await execAsync(
      `python3 - <<'PY'\nimport importlib.util, sys\nsys.exit(0 if importlib.util.find_spec("${moduleName}") else 1)\nPY`,
    );
    return true;
  } catch {
    return false;
  }
}

async function ensureVllmDependency() {
  const installed = await hasPythonModule('vllm');
  if (installed) return true;

  console.warn("Python package 'vllm' is missing. Attempting to install it...");

  try {
    await execAsync('python3 -m pip install --quiet --no-cache-dir "vllm>=0.4.2"');
    console.log("Installed 'vllm' Python package for local inference.");
    return true;
  } catch (error) {
    console.warn(
      `Automatic installation of 'vllm' failed: ${error.message}. ` +
        'Install it manually with "python3 -m pip install vllm" or set VLLM_HOST to a reachable server.',
    );
    return false;
  }
}

async function startVllmServer(gpuInfo) {
  if (!isLocalHost(vllmHost)) {
    console.warn(`Skipping auto-start because VLLM_HOST is remote (${vllmHost}).`);
    return false;
  }

  const dependencyReady = await ensureVllmDependency();
  if (!dependencyReady) return false;

  const existingPid = readExistingVllmPid();
  if (existingPid) {
    console.log(`vLLM already appears to be running (PID ${existingPid}).`);
    return true;
  }

  ensureLogDirectory();
  const parsedHost = new URL(vllmHost || fallbackHost);
  const args = [
    '-m',
    'vllm.entrypoints.openai.api_server',
    '--host',
    parsedHost.hostname,
    '--port',
    parsedHost.port || '8000',
    '--model',
    modelPath,
    '--served-model-name',
    modelName,
  ];

  if (gpuInfo.available) {
    const tpSize = Math.max(1, gpuInfo.devices.length);
    args.push('--tensor-parallel-size', String(tpSize));
  } else {
    args.push('--device', 'cpu');
  }

  console.log('Starting local vLLM server...');
  const outFd = fs.openSync(vllmLogFile, 'a');
  let child;
  try {
    child = spawn('python3', args, {
      cwd: projectRoot,
      stdio: ['ignore', outFd, outFd],
      detached: true,
    });
  } catch (error) {
    console.warn(`Failed to launch vLLM process: ${error.message}`);
    return false;
  }

  child.on('error', (error) => {
    console.warn(`vLLM process error: ${error.message}`);
  });
  child.unref();
  writeVllmPid(child.pid);
  console.log(`vLLM launch command: python3 ${args.join(' ')}`);
  console.log(`vLLM logs: ${vllmLogFile}`);

  const ready = await waitForVllmReady(45000);
  if (!ready) {
    console.warn('Timed out waiting for vLLM to become reachable. Check vLLM logs.');
    return false;
  }

  return true;
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
    ensureLogDirectory();
    await ensureModelDownload();
    const gpuInfo = await detectGpu();
    let online = await isVllmReachable();

    if (!online) {
      console.warn(
        `vLLM host ${vllmHost} is not reachable. Attempting to launch local server with model '${modelName}'.`,
      );
      const started = await startVllmServer(gpuInfo);
      online = started ? await isVllmReachable() : false;
      if (!online && !allowOffline) {
        console.warn('vLLM is still offline after attempting to start it.');
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
