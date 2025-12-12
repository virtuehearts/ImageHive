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
    vllmHost: process.env.VLLM_HOST || process.env.OLLAMA_HOST || 'http://127.0.0.1:8000',
    vllmModel: process.env.VLLM_MODEL || process.env.OLLAMA_MODEL || 'Qwen2.5-VL-3B-Instruct'
  };
}

export function loadSettings() {
  try {
    const text = fs.readFileSync(settingsPath, 'utf-8');
    const stored = JSON.parse(text);
    const migrated = { ...stored };
    if (!migrated.vllmHost && stored.ollamaHost) migrated.vllmHost = stored.ollamaHost;
    if (!migrated.vllmModel && stored.ollamaModel) migrated.vllmModel = stored.ollamaModel;
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
