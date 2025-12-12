import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const dataDir = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const settingsPath = path.join(dataDir, 'settings.json');
const galleryPath = path.join(dataDir, 'gallery.json');

export function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(settingsPath, JSON.stringify(defaultSettings(), null, 2));
  }
  if (!fs.existsSync(galleryPath)) {
    fs.writeFileSync(galleryPath, JSON.stringify([], null, 2));
  }
}

function defaultSettings() {
  return {
    falApiKey: process.env.FAL_API_KEY || '',
    ollamaHost: process.env.OLLAMA_HOST || process.env.VLLM_HOST || 'http://127.0.0.1:11434',
    ollamaModel: process.env.OLLAMA_MODEL || process.env.VLLM_MODEL || 'qwen2.5-vl-3b-instruct',
  };
}

export function loadSettings() {
  try {
    const text = fs.readFileSync(settingsPath, 'utf-8');
    const stored = JSON.parse(text);
    const migrated = { ...stored };
    if (!migrated.ollamaHost && stored.vllmHost) migrated.ollamaHost = stored.vllmHost;
    if (!migrated.ollamaModel && stored.vllmModel) migrated.ollamaModel = stored.vllmModel;
    if (!migrated.ollamaHost && stored.ollamaHost) migrated.ollamaHost = stored.ollamaHost;
    if (!migrated.ollamaModel && stored.ollamaModel) migrated.ollamaModel = stored.ollamaModel;
    return { ...defaultSettings(), ...migrated };
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings) {
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

export function loadGallery() {
  try {
    const text = fs.readFileSync(galleryPath, 'utf-8');
    return JSON.parse(text);
  } catch {
    return [];
  }
}

export function saveGallery(entries) {
  fs.writeFileSync(galleryPath, JSON.stringify(entries, null, 2));
}
