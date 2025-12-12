import { getGpuStatus } from '../src/vllmClient.js';

(async () => {
  const gpu = await getGpuStatus();
  console.log(JSON.stringify(gpu, null, 2));
})();
