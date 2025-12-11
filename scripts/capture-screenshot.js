import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const SCREENSHOT_DIR = path.join(projectRoot, 'artifacts');
const SCREENSHOT_PATH = path.join(SCREENSHOT_DIR, 'ui.png');
const HOST = process.env.HOST || '127.0.0.1';
const PORT = process.env.PORT || 4173;

function startServer() {
  const env = { ...process.env, HOST, PORT };
  const child = spawn(process.execPath, [path.join(projectRoot, 'src', 'server.js')], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });
  return child;
}

async function waitForServer(url, retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      if (response.ok) return;
    } catch {
      // ignore until ready
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Server not reachable at ${url}`);
}

async function takeScreenshot(url) {
  if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
  }

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: SCREENSHOT_PATH, fullPage: true });
  await browser.close();
}

async function main() {
  const url = `http://${HOST}:${PORT}`;
  const server = startServer();
  try {
    await waitForServer(url);
    await takeScreenshot(url);
    console.log(`Screenshot saved to ${SCREENSHOT_PATH}`);
  } finally {
    server.kill();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
