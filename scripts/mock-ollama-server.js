import http from 'http';
import url from 'url';

function buildJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  });
  res.end(body);
}

export function startMockOllama(modelTag = 'qwen2.5-vl-abliterated:3b') {
  return new Promise((resolve) => {
    const server = http.createServer(async (req, res) => {
      const parsed = url.parse(req.url, true);

      if (req.method === 'GET' && parsed.pathname === '/api/tags') {
        buildJson(res, 200, {
          models: [
            {
              name: modelTag,
              model: modelTag,
              modified_at: new Date().toISOString(),
            },
          ],
        });
        return;
      }

      if (req.method === 'POST' && parsed.pathname === '/api/chat') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = Buffer.concat(chunks).toString();
        let parsedBody;
        try {
          parsedBody = JSON.parse(body || '{}');
        } catch {
          parsedBody = {};
        }
        const firstMessage = parsedBody.messages?.[0]?.content || 'Hello';
        const reply = `Mock Qwen (${modelTag}) is responding. I received: ${firstMessage}`;

        buildJson(res, 200, {
          model: modelTag,
          created_at: new Date().toISOString(),
          message: { role: 'assistant', content: reply },
          done: true,
        });
        return;
      }

      buildJson(res, 404, { error: 'Not found' });
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        server,
        url: `http://127.0.0.1:${address.port}`,
      });
    });
  });
}

if (process.argv[1] === url.fileURLToPath(import.meta.url)) {
  startMockOllama().then(({ url: host }) => {
    // eslint-disable-next-line no-console
    console.log(`Mock Ollama server listening at ${host}`);
  });
}
