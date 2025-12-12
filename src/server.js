import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureDataDir, loadSettings, saveSettings, loadGallery, saveGallery } from './storage.js';
import { chatWithVllm, getGpuStatus } from './vllmClient.js';
import { generateFalImage } from './falClient.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';
ensureDataDir();

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', async (req, res) => {
  try {
    const gpuStatus = await getGpuStatus();
    res.json({ status: 'ok', gpu: gpuStatus });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/settings', (req, res) => {
  const settings = loadSettings();
  res.json({
    falApiKey: settings.falApiKey ? 'stored' : '',
    vllmHost: settings.vllmHost,
    vllmModel: settings.vllmModel,
  });
});

app.post('/api/settings', (req, res) => {
  const { falApiKey, vllmHost, vllmModel } = req.body || {};
  const nextSettings = loadSettings();
  if (falApiKey !== undefined) nextSettings.falApiKey = falApiKey;
  if (vllmHost) nextSettings.vllmHost = vllmHost;
  if (vllmModel) nextSettings.vllmModel = vllmModel;
  saveSettings(nextSettings);
  res.json({ success: true });
});

app.get('/api/gallery', (req, res) => {
  res.json(loadGallery());
});

app.post('/api/gallery', (req, res) => {
  const { title, promptJson, imageUrl, sessionId, sessionTitle } = req.body || {};
  if (!promptJson || !title) {
    return res.status(400).json({ message: 'Title and prompt JSON are required.' });
  }
  const gallery = loadGallery();
  const entry = {
    id: `entry-${Date.now()}`,
    title,
    promptJson,
    imageUrl: imageUrl || '',
    sessionId: sessionId || '',
    sessionTitle: sessionTitle || '',
    createdAt: new Date().toISOString(),
  };
  gallery.unshift(entry);
  saveGallery(gallery);
  res.json(entry);
});

app.post('/api/chat', async (req, res) => {
  const { messages } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ message: 'Messages array is required.' });
  }
  try {
    const reply = await chatWithVllm(messages);
    res.json(reply);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/fal/generate', async (req, res) => {
  const { promptJson, aspectRatio, resolution } = req.body || {};
  if (!promptJson) {
    return res.status(400).json({ message: 'promptJson is required.' });
  }
  try {
    const result = await generateFalImage({ promptJson, aspectRatio, resolution });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.listen(PORT, HOST, () => {
  console.log(`ImageHive server running at http://${HOST}:${PORT}`);
});
