import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
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

const env = { ...process.env, OLLAMA_HOST: ollamaHost };
const modelfilePath = path.join(projectRoot, 'modelfiles', `${modelTag}.Modelfile`);

function commandExists(cmd) {
  try {
    execSync(`command -v ${cmd}`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function ensureModelfile() {
  if (!fs.existsSync(modelfilePath)) {
    fs.mkdirSync(path.dirname(modelfilePath), { recursive: true });
    const content = [
      '# Auto-generated if missing — backed by Unsloth GGUF release',
      `FROM ${modelUrl}`,
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
}

function hasModel() {
  try {
    execSync(`ollama show ${modelTag}`, { stdio: 'ignore', env });
    return true;
  } catch {
    return false;
  }
}

function ensureModel() {
  if (!commandExists('ollama')) {
    console.warn('Ollama is not installed or not on PATH. Skipping automatic model download.');
    return;
  }

  ensureModelfile();

  if (hasModel()) {
    console.log(`Ollama model '${modelTag}' already available.`);
    return;
  }

  try {
    console.log(`Preparing Ollama model '${modelTag}' from ${modelUrl} ...`);
    execSync(`ollama create ${modelTag} -f "${modelfilePath}"`, { stdio: 'inherit', env });
    console.log(`Model '${modelTag}' downloaded and ready.`);
  } catch (error) {
    console.warn(`Could not auto-create model '${modelTag}'. You can manually run:\nOLLAMA_HOST=${ollamaHost} ollama create ${modelTag} -f ${modelfilePath}\nReason: ${error.message}`);
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

try {
  ensureEnvDefaults();
  ensureModel();
} catch (error) {
  console.warn(`Startup prep skipped: ${error.message}`);
}
