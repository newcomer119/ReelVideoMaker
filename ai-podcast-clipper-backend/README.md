AI Podcast Clipper Backend
==========================

This service ingests long-form podcast video from S3, transcribes with WhisperX, asks OpenAI to pick viral moments, and renders 9:16 subtitle-ready clips that are pushed back to S3 for the frontend dashboard.

Project Objectives
------------------

- Automate clipping and subtitling so creators can publish short-form content faster.
- Combine speech-to-text alignment, GPT-powered highlight selection, and GPU-accelerated video rendering.
- Provide clear logs, fallback behaviour, and reliable S3 hand-off for downstream consumers.
- Maintain a reusable Modal deployment (GPU + Torch cache volume) that scales on demand.

High-Level Flow
---------------

1. Frontend posts `{ s3_key }` to the FastAPI endpoint exposed through Modal `AiPodcastClipper.process_video`.
2. Service downloads the original video from `ai-podcast-clipper11` S3.
3. `whisperx` extracts audio, transcribes, and aligns word-level timestamps on GPU.
4. OpenAI (`gpt-4o-mini`) scores segments and returns 30-60s clip windows.
5. Each clip is cut with FFmpeg, converted to 9:16, subtitled, and uploaded back to S3 in `/clips/clip_{n}.mp4`.
6. Response payload includes clip metadata, transcript with word timings, and URLs.

Repository Layout
-----------------

- `main.py` – Modal app definition, FastAPI entrypoint, core pipeline.
- `requirements.txt` – Runtime dependencies (WhisperX, Modal, OpenAI, ffmpegcv).
- `asd/` – Columbia face tracking model assets (optional advanced cropping).
- `modal.Image` build steps – Installs CUDA 12.4, FFmpeg, CUDNN, fonts, and project wheelhouse.

Running Locally
---------------

This project is intended to run inside Modal. For local iteration:

1. Install Python 3.12 and CUDA toolkit compatible with your GPU (optional for CPU-only testing).
2. Create a virtualenv and install requirements:
   ```
   python -m venv .venv
   .venv\Scripts\activate
   pip install -r requirements.txt
   ```
3. Set environment variables (see below) or create a `.env` file and load it via `python-dotenv`.
4. Launch the `main` local entrypoint to trigger a sample request:
   ```
   modal serve main.py
   ```
   or run `python main.py` which executes the `@app.local_entrypoint()` block.

Required Environment Variables
------------------------------

- `OPENAI_API_KEY` – For GPT-based clip identification.
- `AUTH_TOKEN` – Bearer token required by the FastAPI endpoint.
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEFAULT_REGION` – S3 credentials (defaults to `eu-north-1`).
- `MODAL_TOKEN_ID`, `MODAL_TOKEN_SECRET` – Needed when invoking from Modal CLI.

Testing The Pipeline
--------------------

- Place a sample video in the S3 bucket referenced by `s3_key`.
- Run `modal serve main.py` and send a POST request to the printed local URL:
  ```
  curl -X POST http://localhost:5001/process-video \
       -H "Authorization: Bearer ${AUTH_TOKEN}" \
       -H "Content-Type: application/json" \
       -d "{\"s3_key\": \"test1/sample.mp4\"}"
  ```
- Inspect logs for each clip (`PROCESSING CLIP`, FFmpeg commands, subtitle status).
- Verify resulting files in S3 under `<input-prefix>/clips/`.

Development Notes
-----------------

- GPU Model Cache: Modal volume `ai-podcast-clipper-model-cache` is mounted at `/root/.cache/torch/` to cache WhisperX assets.
- Face Tracking: `create_vertical_video` uses `ffmpegcv` + face tracks for smart cropping. Currently the pipeline defaults to `create_basic_vertical_video` as a reliable path.
- Subtitles: `create_subtitles_with_ffmpeg` writes ASS files via `pysubs2`. If FFmpeg subtitle burn fails, it falls back to the clip without subtitles.
- Error Handling: API raises FastAPI HTTP errors for auth/S3 failures and returns fallback clips if OpenAI call fails.

Future Enhancements
-------------------

- Integrate the Columbia face tracker for dynamic crops when GPU/memory allow.
- Add Redis/DB persistence for job status and analytics.
- Stream logs back to the frontend in real time.
- Support non-English transcription and multi-channel audio.
- Add unit/integration tests and CI for key command execution paths.

Contributing
------------

1. Fork or branch from `main`.
2. Update code and add logging/tests where sensible.
3. Run linting/tools you rely on locally.
4. Open a PR summarizing behaviour changes, deployment implications, and testing steps.

