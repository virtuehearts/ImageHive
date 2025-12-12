import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import http from 'http';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

function startMockVllm(modelName, port = 18000) {
  const host = '127.0.0.1';
  const mockServer = http.createServer((req, res) => {
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

async function runPrepare(vllmHost, modelName) {
  return new Promise((resolve, reject) => {
    const outputChunks = [];
    const child = spawn(process.execPath, ['scripts/prepare-vllm.js'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        VLLM_HOST: vllmHost,
        VLLM_MODEL: modelName,
      },
    });

    child.stdout.on('data', (data) => outputChunks.push(data.toString()));
    child.stderr.on('data', (data) => outputChunks.push(data.toString()));
    child.on('error', (error) => reject(error));
    child.on('close', (code) => {
      const output = outputChunks.join('');
      if (code !== 0) {
        reject(new Error(`prepare-vllm exited with ${code}:\n${output}`));
        return;
      }
      if (!/vLLM model ready:/i.test(output) || !/vLLM responded to startup probe/i.test(output)) {
        reject(
          new Error(
            `Did not see required vLLM readiness messages. Output was:\n${output}`,
          ),
        );
        return;
      }
      resolve(output);
    });
  });
}

async function main() {
  const modelName = 'Qwen2.5-VL-3B-Instruct';
  const vllmHost = 'http://127.0.0.1:18000';
  const mockServer = await startMockVllm(modelName, 18000);

  try {
    const output = await runPrepare(vllmHost, modelName);
    const summaryLines = output
      .split('\n')
      .filter((line) => /vLLM (model ready|responded to startup probe)/.test(line));

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
