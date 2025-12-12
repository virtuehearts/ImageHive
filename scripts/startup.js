import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

const envPath = path.join(projectRoot, '.env');
const envExamplePath = path.join(projectRoot, '.env.example');
const logDir = path.join(projectRoot, 'logs');
const logFile = path.join(logDir, 'server.log');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

function writeLog(message) {
  const line = `[${new Date().toISOString()}] ${message}`;
  fs.appendFileSync(logFile, `${line}\n`);
  console.log(message);
}

function describeEnvironment() {
  const parts = [process.platform, process.arch];
  if (process.env.CODESPACES) parts.push('codespaces');
  if (process.env.WSL_DISTRO_NAME) parts.push('wsl');
  return parts.join(' | ');
}

function ensureEnvFile() {
  if (fs.existsSync(envPath) || !fs.existsSync(envExamplePath)) return;
  fs.copyFileSync(envExamplePath, envPath);
  writeLog('Created .env from .env.example with default host/model/data settings.');
}

dotenv.config({ path: envPath });

async function runScript(label, scriptPath) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: projectRoot,
      env: { ...process.env },
    });

    child.stdout.on('data', (data) => writeLog(`[${label}] ${data.toString().trimEnd()}`));
    child.stderr.on('data', (data) => writeLog(`[${label} ERROR] ${data.toString().trimEnd()}`));
    child.on('error', (error) => {
      writeLog(`[${label}] failed to start: ${error.message}`);
      reject(error);
    });
    child.on('close', (code) => {
      if (code === 0) return resolve();
      const error = new Error(`${label} exited with code ${code}`);
      writeLog(`[${label}] ${error.message}`);
      reject(error);
    });
  });
}

function startServer() {
  const host = process.env.HOST || '0.0.0.0';
  const port = process.env.PORT || 3000;

  writeLog(`Starting server on ${host}:${port} (env: ${describeEnvironment()}) ...`);

  const server = spawn(process.execPath, [path.join(projectRoot, 'src', 'server.js')], {
    cwd: projectRoot,
    env: { ...process.env },
  });

  server.stdout.on('data', (data) => writeLog(`[server] ${data.toString().trimEnd()}`));
  server.stderr.on('data', (data) => writeLog(`[server ERROR] ${data.toString().trimEnd()}`));
  server.on('error', (error) => writeLog(`[server] failed to start: ${error.message}`));
  server.on('close', (code) => writeLog(`[server] exited with code ${code}`));

  const shutdown = () => {
    writeLog('Shutting down server...');
    server.kill();
    process.exit();
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

async function main() {
  try {
    ensureEnvFile();
    await runScript('prepare-vllm', path.join(projectRoot, 'scripts', 'prepare-vllm.js'));
    startServer();
  } catch (error) {
    writeLog(`Startup failed: ${error.message}`);
    process.exitCode = 1;
  }
}

main();
