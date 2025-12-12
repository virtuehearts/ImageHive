# ImageHive 🐝

_Local-first visual prompt assistant powered by Qwen2.5-VL-3B-Instruct via vLLM_

ImageHive is a friendly, local AI assistant for image creation. It runs Qwen2.5-VL-3B-Instruct on your own machine through a vLLM OpenAI-compatible server to understand images and craft prompts, then uses Fal.ai as a remote render farm only when you explicitly confirm the cost.

**Quick links:** [Getting Started](#getting-started) · [Architecture](#architecture) · [Fal.ai Cost Confirmation](#falai-cost-confirmation) · [Privacy & Locality](#privacy--locality)

## ✨ Key Features

- **Local-first, low-requirement SLM** — Runs the low-memory **Qwen2.5-VL-3B-Instruct** build through vLLM (CPU or GPU) with no prompts sent to external LLMs by default.
- **GPU-aware startup** — A helper script checks for GPU support before choosing a CPU fallback, and server requests hint to vLLM how many GPUs to use.
- **Visual understanding** — Analyze images for subject, style, composition, and turn them into prompt-ready descriptions.
- **Prompt crafting & refinement** — Chat to iteratively improve prompts, including JSON snippets compatible with prompt tools.
- **Fal.ai integration** — Generate images via Fal.ai with explicit cost confirmation before each call.
- **Chat-style web interface** — Node.js backend with a ChatGPT-like UI for text, image uploads, and prompt previews.
- **Gallery for JSON_prompt_tool** — Save JSON prompts and associated images locally so you can reuse them later.

## Getting Started

1. **Install dependencies (Node.js ≥ 18)**
   ```bash
   ./ImageHive install
   # or use the alias
   ./HiveMind install
   ```
   This copies `.env.example` into `.env` (if missing) and installs npm packages using the defaults: local vLLM host (`127.0.0.1:8000`), the Qwen2.5-VL-3B-Instruct model name, and `./data` for storage.
2. **Configure environment (only Fal.ai if you want)**
   - The only value you need to add manually is `FAL_API_KEY` (for optional Fal.ai renders). Host, model, and data directory are prefilled and auto-created at runtime.
   - If your vLLM server runs on a different port or machine, update `VLLM_HOST` and `VLLM_MODEL` in `.env`.
3. **Check GPU readiness (optional)**
   ```bash
   npm run check:gpu
   ```
   The script reports whether `nvidia-smi` detects a GPU. vLLM will use the GPU when available and fall back to CPU otherwise.
4. **Start the local VLM backend (vLLM OpenAI server)**
   - Install vLLM (example for Python users):
     ```bash
     pip install vllm
     python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-VL-3B-Instruct --host 0.0.0.0 --port 8000 --trust-remote-code
     ```
   - If you already have weights downloaded locally, point vLLM at the checkpoint path with `--model /path/to/Qwen2.5-VL-3B-Instruct`.
   - For remote hosts or non-default ports, update `VLLM_HOST` in `.env`.
5. **Run ImageHive**
   - Cross-platform (Windows, macOS, Linux, Codespaces):
     ```bash
     npm run start:managed
     ```
     This invokes the Node-based startup helper (`scripts/startup.js`) which logs to `logs/server.log`, checks that vLLM is reachable, and starts the server with error reporting. It works the same in GitHub Codespaces or PowerShell.
   - Bash helper (Linux/macOS):
     ```bash
     ./ImageHive start
     ```
   Open your browser at `http://localhost:3000` to chat, manage settings (including Fal.ai key), and save JSON prompts to the gallery. Use `./ImageHive stop` to stop the background process and `./ImageHive status` to check if it is still running.

## Architecture

**High-level flow**

1. **Frontend (Chat UI)** — Browser-based chat interface for text, JSON prompt capture, and gallery entries.
2. **Backend (Node.js)** — REST server exposing chat, health, settings, and gallery routes. GPU availability is checked before hinting to vLLM.
3. **Local VLM engine** — Qwen2.5-VL-3B-Instruct served locally through vLLM’s OpenAI-compatible API.
4. **Fal.ai integration** — Backend stores Fal.ai credentials and will later call Fal.ai APIs after user confirmation.

```text
+------------------------+         +-------------------------+
|   Browser Frontend     | <-----> |      Node.js Server     |
|  - Chat UI             |  HTTP   |  - Chat routes          |
|  - Gallery + settings  |         |  - Fal.ai key storage   |
|  - Prompt capture      |         |  - VLM bridge (vLLM)    |
+------------------------+         +-----------+-------------+
                                              |
                                              | local HTTP
                                              v
                                    +------------------------+
                                    |   vLLM (Qwen model)    |
                                    +------------------------+

                                    +------------------------+
                                    |       Fal.ai API       |
                                    | (remote image models)  |
                                    +------------------------+
```

## Fal.ai Cost Confirmation

ImageHive treats Fal.ai as a remote render farm and never triggers billing without your approval:

1. Build prompt + parameters from chat or image analysis.
2. Compute and display the estimated Fal.ai cost (per call/image) with model name and key settings (size, steps, CFG, etc.).
3. Present a confirmation card with **Confirm** / **Cancel** buttons in the UI.
4. Only after confirmation does the backend call Fal.ai and stream results back to the chat.

## Privacy & Locality

- Qwen2.5-VL-3B-Instruct runs locally; prompts and image reasoning stay on-device.
- Uploaded images are only processed by the local VLM and optionally stored in `DATA_DIR` for history.
- Fal.ai receives only the final prompt and required generation parameters—no intermediate reasoning.

## Example Prompts

- “Describe this image as a neon cyberpunk poster prompt.”
- “Convert this prompt into JSON compatible with JSON_prompt_tool.”
- “Show me the cost and controls before generating an image with Fal.ai.”
- “Make this more anime and dreamy, less gritty.”

## Roadmap (concept)

- Prompt library with tags, search, and favorites
- Multi-provider support beyond Fal.ai
- Export prompt + image pairs as self-contained HTML
- Style presets (portrait, landscape, anime, logo, etc.)
- CLI mode for prompt operations from the terminal

## Credits

- **Author / Lab:** Darknet.ca Labs
- **Concept & design:** Warren Kreklo (X: @virtue_hearts, admin@darknet.ca)
- Related project: [`JSON_prompt_tool`](https://github.com/virtuehearts/JSON_prompt_tool)

## License

TBD (suggested: MIT or Apache-2.0; update once chosen).
