import fetch from 'node-fetch';
import { loadSettings } from './storage.js';

const DEFAULT_MODEL = 'fal-ai/bytedance/seedream/v4.5/text-to-image';
const DEFAULT_ASPECT_RATIO = '9:16';
const DEFAULT_RESOLUTION = 'auto-2k';

function normalizePrompt(payload) {
  if (!payload) return { prompt: '' };
  if (typeof payload === 'string') {
    try {
      const parsed = JSON.parse(payload);
      return normalizePrompt(parsed);
    } catch {
      return { prompt: payload };
    }
  }

  if (typeof payload === 'object') {
    const { prompt, text, description, negative_prompt, negativePrompt, seed, image_url, imageUrl } = payload;
    const basePrompt = prompt || text || description || '';
    const output = { prompt: basePrompt || JSON.stringify(payload) };
    if (negative_prompt || negativePrompt) output.negative_prompt = negative_prompt || negativePrompt;
    if (seed !== undefined) output.seed = seed;
    if (image_url || imageUrl) output.image_url = image_url || imageUrl;
    return output;
  }

  return { prompt: String(payload) };
}

export async function generateFalImage({ promptJson, aspectRatio, resolution }) {
  const settings = loadSettings();
  const apiKey = settings.falApiKey || process.env.FAL_API_KEY;
  if (!apiKey) {
    throw new Error('Fal API key is not configured. Add it in Settings to render images.');
  }

  const normalized = normalizePrompt(promptJson);
  if (!normalized.prompt) {
    throw new Error('Provide a prompt or JSON payload with a "prompt" field.');
  }

  const body = {
    prompt: normalized.prompt,
    aspect_ratio: aspectRatio || DEFAULT_ASPECT_RATIO,
    resolution: resolution || DEFAULT_RESOLUTION,
  };

  if (normalized.negative_prompt) body.negative_prompt = normalized.negative_prompt;
  if (normalized.seed !== undefined) body.seed = normalized.seed;
  if (normalized.image_url) body.image_url = normalized.image_url;

  const response = await fetch(`https://fal.run/${DEFAULT_MODEL}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Key ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Fal API error ${response.status}: ${text}`);
  }

  const data = await response.json();
  const imageUrl = data?.images?.[0]?.url || data?.image?.url || data?.url || '';

  return {
    imageUrl,
    request: body,
    raw: data,
  };
}
