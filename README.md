# ImageHive 🐝

_Local-first visual prompt assistant powered by Qwen2.5-VL-3B-Instruct_

ImageHive is a friendly, local AI assistant for image creation. It runs Qwen2.5-VL-3B-Instruct on your own machine to understand images and craft prompts, then uses Fal.ai as a remote render farm only when you explicitly confirm the cost.

**Quick links:** [Getting Started](#getting-started) · [Architecture](#architecture) · [Fal.ai Cost Confirmation](#falai-cost-confirmation) · [Privacy & Locality](#privacy--locality)

## ✨ Key Features

- **Local-first, low-requirement SLM** — Runs the low-memory **Qwen2.5-VL-3B-Instruct Q8_0** build locally (CPU or GPU) with no prompts sent to external LLMs by default.
- **GPU-aware startup** — A helper script checks for GPU support before choosing a CPU fallback, and server requests hint to Ollama how many GPUs to use.
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
   This copies `.env.example` into `.env` (if missing) and installs npm packages using the defaults: local Ollama host (`127.0.0.1:11434`), the Unsloth Qwen2.5-VL-3B-Instruct Q8_0 tag, and `./data` for storage.
2. **Configure environment (only Fal.ai if you want)**
   - The only value you need to add manually is `FAL_API_KEY` (for optional Fal.ai renders). Host, model, and data directory are prefilled and auto-created at runtime.
3. **Check GPU readiness (optional)**
   ```bash
   npm run check:gpu
   ```
   The script reports whether `nvidia-smi` detects a GPU. The server will use GPU when available and fall back to CPU otherwise.
4. **Start the local VLM backend**
   - The startup helper now checks whether `ollama serve` is reachable on your configured host and will auto-start it locally when pointing at `127.0.0.1`.
   - ImageHive will auto-create the `qwen2.5-vl-3b-instruct-q8_0` model from the Unsloth GGUF on first run. If you prefer to prepare it yourself:
     ```bash
     OLLAMA_HOST=http://127.0.0.1:11434 \
     ollama create qwen2.5-vl-3b-instruct-q8_0 -f modelfiles/qwen2.5-vl-3b-instruct-q8_0.Modelfile
     ```
5. **Run ImageHive**
   - Cross-platform (Windows, macOS, Linux, Codespaces):
     ```bash
     npm run start:managed
     ```
     This invokes the Node-based startup helper (`scripts/startup.js`) which logs to `logs/server.log`, prepares Ollama, and starts the server with error reporting. It works the same in GitHub Codespaces or PowerShell.
   - Bash helper (Linux/macOS):
     ```bash
     ./ImageHive start
     ```
   Open your browser at `http://localhost:3000` to chat, manage settings (including Fal.ai key), and save JSON prompts to the gallery. Use `./ImageHive stop` to stop the background process and `./ImageHive status` to check if it is still running.

## Architecture

**High-level flow**

1. **Frontend (Chat UI)** — Browser-based chat interface for text, JSON prompt capture, and gallery entries.
2. **Backend (Node.js)** — REST server exposing chat, health, settings, and gallery routes. GPU availability is checked before hinting to Ollama.
3. **Local VLM engine** — Qwen2.5-VL-3B-Instruct served locally through Ollama.
4. **Fal.ai integration** — Backend stores Fal.ai credentials and will later call Fal.ai APIs after user confirmation.

```text
+------------------------+         +-------------------------+
|   Browser Frontend     | <-----> |      Node.js Server     |
|  - Chat UI             |  HTTP   |  - Chat routes          |
|  - Gallery + settings  |         |  - Fal.ai key storage   |
|  - Prompt capture      |         |  - VLM bridge (Ollama)  |
+------------------------+         +-----------+-------------+
                                              |
                                              | local HTTP
                                              v
                                    +------------------------+
                                    |   Ollama (Qwen model)  |
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
