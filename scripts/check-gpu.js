import { getGpuStatus } from '../src/ollamaClient.js';

(async () => {
  const gpu = await getGpuStatus();
  console.log(JSON.stringify(gpu, null, 2));
})();
