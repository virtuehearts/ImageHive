import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import { startMockOllama } from './mock-ollama-server.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

async function runPrepareWithMock(mockHost) {
  return new Promise((resolve, reject) => {
    const outputChunks = [];
    const child = spawn(process.execPath, ['scripts/prepare-ollama.js'], {
      cwd: projectRoot,
      env: {
        ...process.env,
        OLLAMA_HOST: mockHost,
        SKIP_OLLAMA_DOWNLOAD: '1',
        SKIP_OLLAMA_MODEL: '1',
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
      if (!/Ollama responded to startup probe/i.test(output)) {
        reject(new Error(`Did not see Ollama probe response. Output was:\n${output}`));
        return;
      }
      resolve(output);
    });
  });
}

async function main() {
  const modelTag = process.env.OLLAMA_MODEL || 'qwen2.5-vl-3b-instruct-q8_0';
  const { server, url: mockHost } = await startMockOllama(modelTag);
  try {
    const output = await runPrepareWithMock(mockHost);
    // eslint-disable-next-line no-console
    console.log('Startup test completed successfully. Output snippet:');
    // eslint-disable-next-line no-console
    console.log(
      output
        .split('\n')
        .filter((line) => /Ollama responded to startup probe/.test(line))[0],
    );
  } finally {
    server.close();
  }
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error.message);
  process.exitCode = 1;
});
