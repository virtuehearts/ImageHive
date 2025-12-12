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
  const nextText = Array.from(updated.entries())
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');
  fs.writeFileSync(envPath, `${nextText}\n`);
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

async function verifyChat() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  const probeMessage = 'hello, You are ImageHive and AI assistant here to help the user. please tell us your capabilities.';

  try {
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
    const online = await isVllmReachable();
    if (!online) {
      console.warn(`vLLM host ${vllmHost} is not reachable. Ensure the server is running with model '${modelName}'.`);
      if (!allowOffline) {
        process.exitCode = 1;
        return;
      }
    }

    if (online) {
      const chatReady = await verifyChat();
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
