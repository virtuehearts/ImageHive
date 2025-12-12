import { execFileSync, execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const envPath = path.join(projectRoot, '.env');
dotenv.config({ path: envPath });

const fallbackHost = 'http://127.0.0.1:11434';
const modelTag = process.env.OLLAMA_MODEL || 'qwen2.5-vl-3b-instruct-q8_0';
const modelUrl =
  process.env.OLLAMA_MODEL_URL ||
  'https://huggingface.co/unsloth/Qwen2.5-VL-3B-Instruct-GGUF/resolve/main/Qwen2.5-VL-3B-Instruct-Q8_0.gguf';
const ollamaHost = process.env.OLLAMA_HOST || fallbackHost;
const isLocalHost = /127\.0\.0\.1|localhost/.test(ollamaHost);

const env = { ...process.env, OLLAMA_HOST: ollamaHost };
const skipOllamaInstall = process.env.SKIP_OLLAMA_INSTALL === '1';
const modelfilePath = path.join(projectRoot, 'modelfiles', `${modelTag}.Modelfile`);
const dataDir = process.env.DATA_DIR || path.join(projectRoot, 'data');
const modelDir = path.join(dataDir, 'models');
const modelFileName = path.basename(new URL(modelUrl).pathname);
const modelDownloadPath = path.join(modelDir, modelFileName);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const skipDownload = process.env.SKIP_OLLAMA_DOWNLOAD === '1' || process.env.SKIP_HF_DOWNLOAD === '1';
const skipModelCreate = process.env.SKIP_OLLAMA_MODEL === '1';

function commandExists(cmd) {
  const checkCommand = process.platform === 'win32' ? `where ${cmd}` : `command -v ${cmd}`;
  try {
    execSync(checkCommand, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

let cachedOllamaBinary = null;

async function downloadOllamaBinary() {
  if (skipOllamaInstall) return null;
  if (process.platform !== 'linux') return null;

  const binDir = path.join(dataDir, 'bin');
  const destination = path.join(binDir, 'ollama');
  const downloadUrl = 'https://github.com/ollama/ollama/releases/latest/download/ollama-linux-amd64';

  fs.mkdirSync(binDir, { recursive: true });

  console.log(`Downloading Ollama CLI from ${downloadUrl} ...`);
  const res = await fetch(downloadUrl);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download Ollama CLI: ${res.status} ${res.statusText}`);
  }

  await new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(destination);
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });

  fs.chmodSync(destination, 0o755);
  console.log(`Ollama CLI downloaded to ${destination}.`);
  return destination;
}

async function findOllamaBinary() {
  if (cachedOllamaBinary !== null) return cachedOllamaBinary;

  const defaultName = process.platform === 'win32' ? 'ollama.exe' : 'ollama';
  if (commandExists(defaultName)) {
    cachedOllamaBinary = defaultName;
    return cachedOllamaBinary;
  }

  const candidates = [];
  if (process.platform === 'win32') {
    const programFiles = process.env.ProgramFiles || 'C:/Program Files';
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:/Program Files (x86)';
    const localAppData = process.env.LOCALAPPDATA || path.join(process.env.USERPROFILE || 'C:/Users/Public', 'AppData', 'Local');
    candidates.push(
      path.join(programFiles, 'Ollama', 'ollama.exe'),
      path.join(programFilesX86, 'Ollama', 'ollama.exe'),
      path.join(localAppData, 'Programs', 'Ollama', 'ollama.exe'),
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/usr/local/bin/ollama',
      '/opt/homebrew/bin/ollama',
      '/Applications/Ollama.app/Contents/MacOS/Ollama',
    );
  } else {
    candidates.push('/usr/local/bin/ollama', '/usr/bin/ollama', '/opt/ollama/bin/ollama');
  }

  cachedOllamaBinary = candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
  if (cachedOllamaBinary) return cachedOllamaBinary;

  try {
    cachedOllamaBinary = await downloadOllamaBinary();
  } catch (error) {
    console.warn(`Unable to download Ollama CLI automatically: ${error.message}`);
  }
  return cachedOllamaBinary;
}

function resolveModelSource() {
  if (fs.existsSync(modelDownloadPath)) {
    return path.resolve(modelDownloadPath);
  }
  return modelUrl;
}

function ensureModelfile() {
  fs.mkdirSync(path.dirname(modelfilePath), { recursive: true });
  const content = [
    '# Auto-generated if missing — backed by Unsloth GGUF release',
    `FROM ${resolveModelSource()}`,
    '',
    '{{- if .System }}<|im_start|>system',
    '{{ .System }}<|im_end|>',
    '{{- end }}{{- range .Messages }}',
    '<|im_start|>{{ .Role }}',
    '{{- if .Content }}',
    '{{ .Content }}{{ end }}<|im_end|>',
    '{{- end }}<|im_start|>assistant',
  ].join('\n');
  const modelfile = `# ${modelTag}\n# Lightweight Qwen2.5-VL-3B-Instruct via Unsloth\nTEMPLATE """${content}\n{{ .Response }}"""\nPARAMETER num_ctx 8192\nPARAMETER temperature 0.4\n`;
  fs.writeFileSync(modelfilePath, modelfile);
}

async function isOllamaRunning() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 1500);
    const res = await fetch(`${ollamaHost}/api/tags`, { method: 'GET', signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

async function startOllamaServe() {
  const ollamaBinary = await findOllamaBinary();
  if (!ollamaBinary) {
    console.warn('Ollama is not installed or not on PATH. Skipping automatic start.');
    return false;
  }

  try {
    const child = spawn(ollamaBinary, ['serve'], {
      detached: true,
      stdio: 'ignore',
      env,
    });
    child.unref();
    console.log('Started local ollama serve in the background.');
    return true;
  } catch (error) {
    console.warn(`Unable to auto-start ollama serve: ${error.message}`);
    return false;
  }
}

async function ensureOllamaOnline() {
  const alreadyRunning = await isOllamaRunning();
  if (alreadyRunning) return true;

  if (!isLocalHost) {
    console.warn(`Ollama host ${ollamaHost} is unreachable. Ensure the remote instance is running.`);
    return false;
  }

  const started = await startOllamaServe();
  if (!started) return false;

  for (let attempt = 0; attempt < 6; attempt += 1) {
    await sleep(500 * (attempt + 1));
    if (await isOllamaRunning()) return true;
  }

  console.warn('Ollama did not report ready state after starting.');
  return false;
}

async function verifyOllamaChat() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const probeMessage =
    'hello, You are ImageHive and AI assistant here to help the user. please tell us your capabilities.';

  try {
    const res = await fetch(`${ollamaHost}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: modelTag,
        messages: [{ role: 'user', content: probeMessage }],
        stream: false,
        options: { temperature: 0.2 },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }

    const data = await res.json();
    const reply = data.message?.content?.trim();
    if (!reply) throw new Error('Empty response from Ollama chat probe.');

    const snippet = reply.length > 220 ? `${reply.slice(0, 220)}…` : reply;
    console.log(`Ollama responded to startup probe: ${snippet}`);
    return true;
  } catch (error) {
    console.warn(`Ollama chat probe failed: ${error.message}`);
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function hasModel() {
  const ollamaBinary = await findOllamaBinary();
  if (!ollamaBinary) return false;

  try {
    execFileSync(ollamaBinary, ['show', modelTag], { stdio: 'ignore', env });
    return true;
  } catch {
    return false;
  }
}

async function ensureModel() {
  if (skipModelCreate) {
    console.log('Skipping model creation because SKIP_OLLAMA_MODEL=1.');
    return;
  }

  const ollamaBinary = await findOllamaBinary();
  if (!ollamaBinary) {
    console.warn('Ollama is not installed or not on PATH. Skipping automatic model download.');
    return;
  }

  if (await hasModel()) {
    console.log(`Ollama model '${modelTag}' already available.`);
    return;
  }

  try {
    ensureModelfile();
    const resolvedSource = resolveModelSource();
    console.log(`Preparing Ollama model '${modelTag}' from ${resolvedSource} ...`);
    execFileSync(ollamaBinary, ['create', modelTag, '-f', modelfilePath], { stdio: 'inherit', env });
    console.log(`Model '${modelTag}' downloaded and ready.`);
  } catch (error) {
    console.warn(
      `Could not auto-create model '${modelTag}'. You can manually run:\nOLLAMA_HOST=${ollamaHost} ${ollamaBinary} create ${modelTag} -f ${modelfilePath}\nReason: ${error.message}`,
    );
  }
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
  if (!updated.get('OLLAMA_HOST')) updated.set('OLLAMA_HOST', fallbackHost);
  if (!updated.get('OLLAMA_MODEL')) updated.set('OLLAMA_MODEL', modelTag);
  if (!updated.get('OLLAMA_MODEL_URL')) updated.set('OLLAMA_MODEL_URL', modelUrl);
  if (!updated.get('DATA_DIR')) updated.set('DATA_DIR', './data');
  const nextText = Array.from(updated.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(envPath, nextText + '\n');
}

async function ensureHuggingFaceDownload() {
  if (skipDownload) {
    console.log('Skipping Hugging Face model download because SKIP_OLLAMA_DOWNLOAD=1.');
    return;
  }

  if (fs.existsSync(modelDownloadPath)) return;

  fs.mkdirSync(modelDir, { recursive: true });
  console.log(`Downloading model file to ${modelDownloadPath} ...`);
  const res = await fetch(modelUrl);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download model file: ${res.status} ${res.statusText}`);
  }

  const contentLength = Number(res.headers.get('content-length')) || null;
  const startTime = Date.now();
  let downloaded = 0;

  const formatBytes = (bytes) => {
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex += 1;
    }
    return `${value.toFixed(value >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
  };

  const renderProgress = () => {
    if (contentLength) {
      const percent = Math.min(100, (downloaded / contentLength) * 100);
      const filled = Math.round((percent / 100) * 20);
      const bar = `${'='.repeat(filled)}${' '.repeat(20 - filled)}`;
      process.stdout.write(
        `\r[${bar}] ${percent.toFixed(1)}% (${formatBytes(downloaded)}/${formatBytes(contentLength)})`,
      );
    } else {
      const seconds = (Date.now() - startTime) / 1000;
      process.stdout.write(`\rDownloaded ${formatBytes(downloaded)} in ${seconds.toFixed(1)}s`);
    }
  };

  const fileStream = fs.createWriteStream(modelDownloadPath);
  await new Promise((resolve, reject) => {
    res.body.on('data', (chunk) => {
      downloaded += chunk.length;
      renderProgress();
    });
    res.body.pipe(fileStream);
    res.body.on('error', reject);
    fileStream.on('finish', resolve);
    fileStream.on('error', reject);
  });
  process.stdout.write('\n');
  console.log('Model file downloaded.');
}

  try {
    await ensureEnvDefaults();
    await ensureHuggingFaceDownload();
    const online = await ensureOllamaOnline();
    if (!online) {
      console.warn('Ollama host is not reachable; model preparation skipped.');
      process.exitCode = 1;
    } else {
      await ensureModel();
      const chatReady = await verifyOllamaChat();
      if (!chatReady) {
        process.exitCode = 1;
      }
    }
  } catch (error) {
    console.warn(`Startup prep skipped: ${error.message}`);
  }
