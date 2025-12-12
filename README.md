# ImageHive 🐝

_Local-first visual prompt assistant powered by Qwen2.5-VL-3B-Instruct via vLLM_

ImageHive is a friendly, local AI assistant for image creation. Think of it as the **OpenRouter for image models**: one place to connect all of your image providers and APIs with consistent prompting. The framework runs the Qwen2.5-VL-3B-Instruct model through a vLLM OpenAI-compatible server that works on either CPU or GPU, so you always have a capable local brain for understanding images and crafting prompts (including JSON payloads). Remote render farms are used only when you explicitly confirm the cost.

We are actively seeking funding and collaborators to add more image providers and API integrations—if you want to see your favorite model supported, please reach out.

**Quick links:** [Getting Started](#getting-started) · [Architecture](#architecture) · [JSON Prompting](#json-prompting) · [Fal.ai Cost Confirmation](#falai-cost-confirmation) · [Privacy & Locality](#privacy--locality) · [Contributing](#contributing)

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
   ```
   The helper script copies `.env.example` into `.env` (if missing) and installs npm packages using sensible defaults: local vLLM host (`127.0.0.1:8000`), the Qwen2.5-VL-3B-Instruct model name, and `./data` for storage.
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
   - **Single command (Linux/macOS Bash):**
     ```bash
     ./ImageHive start
     ```
   - **Cross-platform (Windows, macOS, Linux, Codespaces):**
     ```bash
     npm run start:managed
     ```
     Both options invoke the Node-based startup helper (`scripts/startup.js`) which logs to `logs/server.log`, verifies vLLM connectivity, and starts the server with error reporting. It works the same in GitHub Codespaces or PowerShell.

Open your browser at `http://localhost:3000` to chat, manage settings (including Fal.ai key), and save JSON prompts to the gallery. Use `./ImageHive stop` to stop the background process and `./ImageHive status` to check if it is still running.

## Architecture

**High-level flow**

1. **Frontend (Chat UI)** — Browser-based chat interface for text, JSON prompt capture, and gallery entries.
2. **Backend (Node.js)** — REST server exposing chat, health, settings, and gallery routes. GPU availability is checked before hinting to vLLM.
3. **Local VLM engine** — Qwen2.5-VL-3B-Instruct served locally through vLLM’s OpenAI-compatible API (CPU or GPU).
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

## JSON Prompting

ImageHive treats prompts as **data**. You can chat normally or ask for structured JSON payloads that downstream image services understand (e.g., prompt text plus size, steps, sampler, and safety flags). The UI captures these JSON blobs alongside rendered images in the gallery so you can replay or share exact generations. This approach makes it easy to swap providers or models without rewriting your workflow—just hand the JSON to whichever API you prefer.

> Coming soon: when your GPU and VRAM allow, ImageHive will add a fully local image-generation path so you can render without any remote calls.

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

## Funding & Support

We want ImageHive to be the universal bridge for every image provider and API, but adding and maintaining integrations takes time. If you or your organization want broader model coverage, please reach out about funding partnerships or sponsorships.

## Contributing

We welcome community help to make ImageHive more robust and feature-rich:

- **Testers:** Try new builds, reproduce bugs, and share feedback on the startup helper and JSON prompt flows.
- **Developers:** Add providers, improve the gallery/JSON experience, or harden the startup scripts.
- **Docs & UX:** Refine onboarding, clarify configuration, and keep examples up to date.

Open an issue with what you’d like to work on, or submit a pull request. Every contribution moves us closer to the “OpenRouter for images” vision.

## Credits

- **Author / Lab:** Darknet.ca Labs
- **Concept & design:** Warren Kreklo (X: @virtue_hearts, admin@darknet.ca)
- Related project: [`JSON_prompt_tool`](https://github.com/virtuehearts/JSON_prompt_tool)

## License

TBD (suggested: MIT or Apache-2.0; update once chosen).
