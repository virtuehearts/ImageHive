import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import http from 'http';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

function startMockOllama(modelName, port = 18000) {
  const host = '127.0.0.1';
  const mockServer = http.createServer((req, res) => {
    if (req.url === '/api/version') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ version: 'mock' }));
      return;
    }

    if (req.url === '/v1/models') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          object: 'list',
          data: [
            {
              id: modelName,
              object: 'model',
              created: Date.now(),
              owned_by: 'mock',
              root: modelName,
            },
          ],
        }),
      );
      return;
    }

    if (req.method === 'POST' && req.url === '/v1/chat/completions') {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            id: 'chatcmpl-mock',
            object: 'chat.completion',
            choices: [
              {
                index: 0,
                message: {
                  role: 'assistant',
                  content: `Model ${modelName} is ready to chat!`,
                },
                finish_reason: 'stop',
              },
            ],
          }),
        );
      });
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  return new Promise((resolve, reject) => {
    mockServer.on('error', reject);
    mockServer.listen(port, host, () => resolve(mockServer));
  });
}

async function runPrepare(ollamaHost, modelName) {
  return new Promise((resolve, reject) => {
    const outputChunks = [];
    const child = spawn(process.execPath, ['scripts/prepare-ollama.js'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        OLLAMA_HOST: ollamaHost,
        OLLAMA_MODEL: modelName,
        ALLOW_OLLAMA_OFFLINE: '0',
      },
    });

    child.stdout.on('data', (data) => outputChunks.push(data.toString()));
    child.stderr.on('data', (data) => outputChunks.push(data.toString()));
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      const output = outputChunks.join('');
      if (code !== 0) {
        reject(new Error(`prepare-ollama exited with ${code}:\n${output}`));
        return;
      }
      if (!/Ollama model ready:/i.test(output) || !/Ollama responded to startup probe/i.test(output)) {
        reject(new Error(`Did not see required Ollama readiness messages. Output was:\n${output}`));
        return;
      }
      resolve(output);
    });
  });
}

async function main() {
  const modelName = 'qwen2.5-vl-abliterated:3b';
  const ollamaHost = 'http://127.0.0.1:18000';
  const mockServer = await startMockOllama(modelName, 18000);

  try {
    const output = await runPrepare(ollamaHost, modelName);
    const summaryLines = output
      .split('\n')
      .filter((line) => /Ollama (model ready|responded to startup probe)/.test(line));

    // eslint-disable-next-line no-console
    console.log('Startup test completed successfully. Output snippet:');
    summaryLines.forEach((line) => console.log(line));
  } finally {
    mockServer.close();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error.message);
  process.exitCode = 1;
});
