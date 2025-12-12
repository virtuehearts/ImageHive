import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

async function runPrepare() {
  return new Promise((resolve, reject) => {
    const outputChunks = [];
    const child = spawn(process.execPath, ['scripts/prepare-vllm.js'], {
      cwd: projectRoot,
      env: {
        ...process.env,
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
      if (!/vLLM responded to startup probe/i.test(output)) {
        reject(new Error(`Did not see vLLM probe response. Output was:\n${output}`));
        return;
      }
      resolve(output);
    });
  });
}

async function main() {
  const output = await runPrepare();
  // eslint-disable-next-line no-console
  console.log('Startup test completed successfully. Output snippet:');
  // eslint-disable-next-line no-console
  console.log(
    output
      .split('\n')
      .filter((line) => /vLLM responded to startup probe/.test(line))[0],
  );
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(error.message);
  process.exitCode = 1;
});
