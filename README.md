# ImageHive 🐝

_Local-first visual prompt assistant powered by Qwen2.5-VL-3B-Instruct_

ImageHive is a friendly, local AI assistant for image creation. It runs Qwen2.5-VL-3B-Instruct on your own machine to understand images and craft prompts, then uses Fal.ai as a remote render farm only when you explicitly confirm the cost.

**Quick links:** [Getting Started](#getting-started) · [Architecture](#architecture) · [Fal.ai Cost Confirmation](#falai-cost-confirmation) · [Privacy & Locality](#privacy--locality)

## ✨ Key Features

- **Local-first, low-requirement SLM** — Runs Qwen2.5-VL-3B-Instruct locally (CPU or GPU) with no prompts sent to external LLMs by default.
- **Visual understanding** — Analyze images for subject, style, composition, and turn them into prompt-ready descriptions.
- **Prompt crafting & refinement** — Chat to iteratively improve prompts, including JSON snippets compatible with prompt tools.
- **Fal.ai integration** — Generate images via Fal.ai with explicit cost confirmation before each call.
- **Chat-style web interface** — Node.js backend with a ChatGPT-like UI for text, image uploads, and prompt previews.

## Getting Started

> ⚠️ This project is in-progress. Replace placeholders as you implement.

1. **Clone the repo**
   ```bash
   git clone https://github.com/virtuehearts/ImageHive.git
   cd ImageHive
   ```
2. **Install dependencies (Node.js ≥ 18)**
   ```bash
   npm install
   # or
   yarn install
   ```
3. **Configure environment**
   - Copy the example env file and fill in values:
     ```bash
     cp .env.example .env
     ```
   - Required variables include:
     - `PORT` — Port for the Node.js server (e.g., `3000`).
     - `FAL_API_KEY` — Fal.ai API key for remote generations.
     - `QWEN_MODEL_PATH` — Local path to Qwen2.5-VL-3B-Instruct weights.
     - `QWEN_BACKEND_URL` — URL for the local VLM backend (e.g., `http://localhost:8000`).
     - `DATA_DIR` (optional) — Storage for conversation/prompt history.
4. **Start the local VLM backend**
   - Implement a runner for Qwen2.5-VL-3B-Instruct (e.g., vLLM, llama.cpp). A minimal Node-friendly approach:
     - Provide an HTTP endpoint (or Python bridge) that accepts text + image inputs and returns model responses.
     - Ensure the endpoint matches `QWEN_BACKEND_URL`.
   - Example placeholder command:
     ```bash
     python run_qwen_vl_server.py \
       --model-path "$QWEN_MODEL_PATH" \
       --port 8000
     ```
5. **Run ImageHive**
   ```bash
   npm run dev
   # or
   npm start
   ```
   Open your browser at `http://localhost:3000`. The UI introduces ImageHive and guides you through analysis and generation.

## Architecture

**High-level flow**

1. **Frontend (Chat UI)** — Browser-based chat interface for text, image uploads, and generation controls.
2. **Backend (Node.js)** — REST + WebSocket/SSE server exposing chat, image analysis, generation, and history routes.
3. **Local VLM engine** — Qwen2.5-VL-3B-Instruct served locally; the backend communicates via HTTP/gRPC or a Python bridge.
4. **Fal.ai integration** — Backend calls Fal.ai APIs for image generation after user confirmation.

```text
+------------------------+         +-------------------------+
|   Browser Frontend     | <-----> |      Node.js Server     |
|  - Chat UI             |  HTTP   |  - Chat routes          |
|  - Image uploads       |  WS/SSE |  - Fal.ai integration   |
|  - Confirm / Cancel    |         |  - VLM bridge (Qwen)    |
+------------------------+         +-----------+-------------+
                                              |
                                              | local IPC / HTTP
                                              v
                                    +------------------------+
                                    | Qwen2.5-VL-3B-Instruct |
                                    |   (local VLM runtime)  |
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
