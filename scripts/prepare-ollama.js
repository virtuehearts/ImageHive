import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { exec, spawn } from 'child_process';
import util from 'util';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');
const envPath = path.join(projectRoot, '.env');
const ollamaPidFile = path.join(projectRoot, '.ollama.pid');
const logDir = path.join(projectRoot, 'logs');
const ollamaLogFile = path.join(logDir, 'ollama.log');
const modelDir = path.join(projectRoot, 'modelfiles');
const ggufFile = path.join(modelDir, 'Qwen2.5-VL-3B-Instruct-abliterated.Q8_0.gguf');
const modelDownloadUrl =
  'https://huggingface.co/mradermacher/Qwen2.5-VL-3B-Instruct-abliterated-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct-abliterated.Q8_0.gguf?download=true';
const modelfilePath = path.join(modelDir, 'qwen2.5-vl-abliterated-3b-q8_0.Modelfile');

const execAsync = util.promisify(exec);

dotenv.config({ path: envPath });

const defaultHost = 'http://127.0.0.1:11434';
const modelName =
  process.env.OLLAMA_MODEL || process.env.VLLM_MODEL || 'qwen2.5-vl-abliterated:3b';
const ollamaHost = process.env.OLLAMA_HOST || process.env.VLLM_HOST || defaultHost;
const allowOffline = process.env.ALLOW_OLLAMA_OFFLINE === '1' || process.env.ALLOW_VLLM_OFFLINE === '1';
const isInstallMode = process.argv.includes('--install');

function describeMode() {
  return isInstallMode ? 'install' : 'startup verification';
}

async function detectGpu() {
  try {
    const { stdout } = await execAsync('nvidia-smi --query-gpu=name --format=csv,noheader');
    const devices = stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    return { available: devices.length > 0, devices };
  } catch (error) {
    return { available: false, error: error.message, devices: [] };
  }
}

function reportGpuStatus(prefix = 'GPU status') {
  return detectGpu().then((gpu) => {
    if (gpu.available) {
      console.log(`${prefix}: detected devices -> ${gpu.devices.join(', ')}`);
    } else {
      console.log(`${prefix}: no GPU detected (falling back to CPU).`);
    }
    return gpu;
  });
}

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
  if (!updated.get('OLLAMA_HOST')) updated.set('OLLAMA_HOST', ollamaHost || defaultHost);
  if (!updated.get('OLLAMA_MODEL')) updated.set('OLLAMA_MODEL', modelName);
  if (!updated.get('DATA_DIR')) updated.set('DATA_DIR', './data');
  const nextText = Array.from(updated.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(envPath, `${nextText}\n`);
}

function ensureLogDirectory() {
  fs.mkdirSync(logDir, { recursive: true });
}

function isLocalHost(url) {
  try {
    const parsed = new URL(url);
    return ['localhost', '127.0.0.1', '0.0.0.0'].includes(parsed.hostname);
  } catch (error) {
    console.warn(`Invalid OLLAMA_HOST '${url}': ${error.message}`);
    return false;
  }
}

async function isOllamaReachable() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`${ollamaHost}/api/version`, { signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForOllamaReady(timeoutMs = 30000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await isOllamaReachable();
    if (ok) return true;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  return false;
}

function readExistingOllamaPid() {
  if (!fs.existsSync(ollamaPidFile)) return null;
  const pidText = fs.readFileSync(ollamaPidFile, 'utf-8').trim();
  const pid = Number.parseInt(pidText, 10);
  if (Number.isNaN(pid)) return null;
  try {
    process.kill(pid, 0);
    return pid;
  } catch {
    fs.rmSync(ollamaPidFile, { force: true });
    return null;
  }
}

function writeOllamaPid(pid) {
  fs.writeFileSync(ollamaPidFile, String(pid));
}

function formatBytesMB(bytes) {
  return bytes / (1024 * 1024);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '??s';
  if (seconds < 60) return `${Math.max(1, Math.round(seconds))}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.max(0, Math.round(seconds % 60));
  return `${mins}m${secs.toString().padStart(2, '0')}s`;
}

async function downloadWithProgress(url, destination) {
  console.log(`Downloading model file to ${destination}`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Download failed with status ${res.status} ${res.statusText}`);
  }

  await fs.promises.mkdir(path.dirname(destination), { recursive: true });

  const totalBytes = Number(res.headers.get('content-length')) || 0;
  const totalMb = totalBytes ? formatBytesMB(totalBytes) : null;
  const startTime = Date.now();
  let downloadedBytes = 0;

  return new Promise((resolve, reject) => {
    const outStream = fs.createWriteStream(destination);

    const renderProgress = () => {
      const elapsedSec = (Date.now() - startTime) / 1000;
      const speedMb = elapsedSec ? formatBytesMB(downloadedBytes) / elapsedSec : 0;
      const pct = totalBytes ? ((downloadedBytes / totalBytes) * 100).toFixed(1) : '??';
      const etaSec = speedMb > 0 && totalBytes
        ? (formatBytesMB(totalBytes - downloadedBytes) / speedMb)
        : NaN;
      const humanEta = formatDuration(etaSec);
      const downloadedMb = formatBytesMB(downloadedBytes).toFixed(1);
      const totalMbText = totalMb ? totalMb.toFixed(1) : '??';
      const line = `  progress: ${pct}% (${downloadedMb} / ${totalMbText} MB) - ${speedMb.toFixed(2)} MB/s - ETA ${humanEta}`;
      process.stdout.write(`\r${line}`);
    };

    res.body.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      outStream.write(chunk);
      renderProgress();
    });

    res.body.on('end', () => {
      outStream.end();
      renderProgress();
      process.stdout.write('\n');
      resolve();
    });

    res.body.on('error', (error) => {
      outStream.destroy();
      fs.rmSync(destination, { force: true });
      reject(error);
    });
  });
}

async function ensureLocalModelFile() {
  if (fs.existsSync(ggufFile)) {
    const stats = fs.statSync(ggufFile);
    const mb = formatBytesMB(stats.size).toFixed(1);
    console.log(`Model file already present (${mb} MB): ${ggufFile}`);
    return true;
  }

  await downloadWithProgress(modelDownloadUrl, ggufFile);
  const stats = fs.statSync(ggufFile);
  const mb = formatBytesMB(stats.size).toFixed(1);
  console.log(`Downloaded model file (${mb} MB).`);
  return true;
}

async function ensureOllamaBinary() {
  try {
    const { stdout } = await execAsync('ollama --version');
    console.log(`Found Ollama: ${stdout.trim()}`);
    return true;
  } catch (error) {
    console.warn(
      `Ollama CLI is not available: ${error.message}. Attempting automatic installation...`,
    );
    return installOllama();
  }
}

async function installOllama() {
  try {
    console.log('Installing Ollama...');
    await execAsync('curl -fsSL https://ollama.com/install.sh | sh');
    const { stdout } = await execAsync('ollama --version');
    console.log(`Ollama installed successfully: ${stdout.trim()}`);
    return true;
  } catch (installError) {
    console.warn(
      `Automatic Ollama installation failed: ${installError.message}. Please install manually from https://ollama.com/download.`,
    );
    return false;
  }
}

async function getOllamaLaunchEnv() {
  const gpu = await detectGpu();
  const env = { ...process.env };

  if (!gpu.available) {
    env.OLLAMA_NUM_GPU = '0';
    console.log('No GPU detected. Ollama will run in CPU mode.');
  } else {
    console.log(`Detected GPU devices for Ollama: ${gpu.devices.join(', ')}`);
  }

  return env;
}

async function ensureModelCreated() {
  try {
    await execAsync(`ollama show ${modelName}`);
    console.log(`Ollama model '${modelName}' already exists.`);
    return true;
  } catch {
    // fall through to create
  }

  if (!fs.existsSync(modelfilePath)) {
    console.warn(`Modelfile missing at ${modelfilePath}`);
    return false;
  }

  console.log(`Creating Ollama model '${modelName}' from ${modelfilePath}...`);
  const ollamaEnv = await getOllamaLaunchEnv();

  return new Promise((resolve) => {
    const child = spawn('ollama', ['create', modelName, '-f', modelfilePath], {
      cwd: projectRoot,
      env: ollamaEnv,
    });
    child.stdout.on('data', (data) => process.stdout.write(data.toString()));
    child.stderr.on('data', (data) => process.stderr.write(data.toString()));
    child.on('close', (code) => {
      if (code === 0) {
        console.log(`Created model '${modelName}'.`);
        resolve(true);
      } else {
        console.warn(`ollama create exited with code ${code}`);
        resolve(false);
      }
    });
    child.on('error', (error) => {
      console.warn(`Failed to create model '${modelName}': ${error.message}`);
      resolve(false);
    });
  });
}

async function startOllamaServer() {
  if (!isLocalHost(ollamaHost)) {
    console.warn(`Skipping auto-start because OLLAMA_HOST is remote (${ollamaHost}).`);
    return false;
  }

  const binaryPresent = await ensureOllamaBinary();
  if (!binaryPresent) return false;

  const existingPid = readExistingOllamaPid();
  if (existingPid) {
    console.log(`Ollama already appears to be running (PID ${existingPid}).`);
    return true;
  }

  ensureLogDirectory();
  console.log('Starting local Ollama server...');
  const outFd = fs.openSync(ollamaLogFile, 'a');
  const ollamaEnv = await getOllamaLaunchEnv();

  let child;
  try {
    child = spawn('ollama', ['serve'], {
      cwd: projectRoot,
      env: ollamaEnv,
      stdio: ['ignore', outFd, outFd],
      detached: true,
    });
  } catch (error) {
    console.warn(`Failed to launch Ollama process: ${error.message}`);
    return false;
  }

  child.on('error', (error) => {
    console.warn(`Ollama process error: ${error.message}`);
  });
  child.unref();
  writeOllamaPid(child.pid);
  console.log(`Ollama launch command: ollama serve`);
  console.log(`Ollama logs: ${ollamaLogFile}`);

  const ready = await waitForOllamaReady(45000);
  if (!ready) {
    console.warn('Timed out waiting for Ollama to become reachable. Check ollama logs.');
    return false;
  }

  return true;
}

async function ensureModelAvailable() {
  if (!(await isOllamaReachable())) return false;

  if (!isLocalHost(ollamaHost)) {
    console.log(`Skipping local pull because OLLAMA_HOST is remote (${ollamaHost}).`);
    return true;
  }

  const binaryPresent = await ensureOllamaBinary();
  if (!binaryPresent) {
    console.warn('Cannot prepare model locally because the Ollama CLI is missing.');
    return true;
  }

  if (isLocalHost(ollamaHost)) {
    await ensureLocalModelFile();
  }

  console.log(`Ensuring Ollama model '${modelName}' is available...`);
  if (!isLocalHost(ollamaHost)) {
    console.log(`Remote host detected; assuming model '${modelName}' is managed remotely.`);
    return true;
  }

  return ensureModelCreated();
}

function normalizeModel(value) {
  if (!value) return null;
  const [base, tag] = value.split(':');
  return { base, tag, full: value };
}

async function verifyModelLoaded() {
  try {
    const res = await fetch(`${ollamaHost}/v1/models`);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }
    const payload = await res.json();
    const models = payload?.data || [];
    const requested = normalizeModel(modelName);
    const matches = models.filter((entry) => {
      const candidates = [entry?.id, entry?.root].filter(Boolean).map(normalizeModel);
      return candidates.some((candidate) => {
        if (!candidate) return false;
        if (candidate.full === modelName || candidate.full?.endsWith(`/${modelName}`)) return true;
        if (candidate.base && requested?.base && candidate.base === requested.base) return true;
        if (requested?.base && candidate.full?.startsWith(`${requested.base}:`)) return true;
        return false;
      });
    });

    if (!matches.length) {
      const available = models.map((entry) => entry?.id).filter(Boolean).join(', ') || 'none reported';
      throw new Error(`Model '${modelName}' not reported by Ollama. Available models: ${available}`);
    }

    const detected = matches[0]?.id || modelName;
    console.log(`Ollama model ready: ${detected}`);
    return true;
  } catch (error) {
    console.warn(`Ollama model probe failed: ${error.message}`);
    return false;
  }
}

async function verifyChat() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const probeMessage = 'Testing ImageHive startup...';

  try {
    const res = await fetch(`${ollamaHost}/v1/chat/completions`, {
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
    if (!reply) throw new Error('Empty response from Ollama chat probe.');

    const snippet = reply.length > 220 ? `${reply.slice(0, 220)}…` : reply;
    console.log(`Ollama responded to startup probe: ${snippet}`);
    console.log('Ollama is online.');
    console.log('Booting interface.');
    return true;
  } catch (error) {
    console.warn(`Ollama chat probe failed: ${error.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

(async () => {
  try {
    console.log(`Preparing Ollama for ${describeMode()}...`);
    ensureEnvDefaults();
    ensureLogDirectory();
    await reportGpuStatus('Hardware probe');
    const reachability = await isOllamaReachable();

    if (!reachability) {
      console.warn(
        `Ollama host ${ollamaHost} is not reachable. Attempting to launch local server with model '${modelName}'.`,
      );
      const started = await startOllamaServer();
      if (!started && !allowOffline) {
        console.warn('Ollama is still offline after attempting to start it.');
        process.exitCode = 1;
        return;
      }
    }

    const online = await waitForOllamaReady();
    if (!online) {
      if (!allowOffline) process.exitCode = 1;
      return;
    }

    const modelPulled = await ensureModelAvailable();
    const modelReady = modelPulled ? await verifyModelLoaded() : false;
    const chatReady = modelReady ? await verifyChat() : false;
    if (!chatReady && !allowOffline) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.warn(`Startup prep skipped: ${error.message}`);
    if (!allowOffline) {
      process.exitCode = 1;
    }
  }
})();
