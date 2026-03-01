# 🎬 ReelVideoMaker (ScrollSage)

> **Turn doomscrolling into deep learning** — AI-powered short-form clips from long-form podcasts, now running on AMD MI300X GPUs.

[![AMD Slingshot](https://img.shields.io/badge/AMD-Slingshot%20Hackathon-ED1C24?style=for-the-badge&logo=amd)](https://www.amd.com)
[![Demo](https://img.shields.io/badge/Demo-Watch%20on%20YouTube-FF0000?style=for-the-badge&logo=youtube)](https://www.youtube.com/watch?v=xaGF5_I9Uu8)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)

**Team:** BIT WIZARDS &nbsp;|&nbsp; **Leader:** Mitarth Pandey

---

## 📌 Table of Contents

- [About the Project](#about-the-project)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [AMD GPU Integration](#amd-gpu-integration)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Backend Setup](#backend-setup)
  - [Frontend Setup](#frontend-setup)
  - [Environment Variables](#environment-variables)
- [Usage](#usage)
- [API Reference](#api-reference)
- [Project Structure](#project-structure)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## About the Project

Creators spend hours manually clipping podcasts. Viewers waste time doomscrolling with zero learning. **ReelVideoMaker** solves both.

It is a full-stack AI platform that:
1. Takes any long-form podcast or video
2. Transcribes it with word-level timestamps using **WhisperX on AMD GPU**
3. Uses **GPT-4o-mini** to identify the most viral 30–60 second moments
4. Renders subtitle-burned **9:16 vertical clips** ready to post on TikTok, Reels, or YouTube Shorts
5. Lets viewers **Chat with Video** — ask any question and get timestamped AI answers
6. Tracks **Addiction Analytics** — replaces mindless watch time with purposeful learning streaks

Built for the **AMD Slingshot Hackathon** — the entire GPU pipeline runs on **AMD MI300X via ROCm**, delivering 2× cost efficiency and 192 GB HBM3 memory headroom over NVIDIA alternatives.

---

## Features

| Feature | Description |
|---|---|
| 🤖 **AI Clip Generation** | GPT-4o-mini scores transcript segments and selects the top viral moments automatically |
| 🎙️ **WhisperX Transcription** | Word-level timestamp alignment on AMD GPU for pixel-perfect subtitle rendering |
| 📱 **9:16 Vertical Conversion** | FFmpeg-powered crop + ASS subtitle burn-in optimised for mobile short-form platforms |
| 💬 **Chat with Video** *(New)* | pgvector semantic search over transcripts — ask any question, get timestamped answers |
| 📊 **Addiction Analytics** *(New)* | Learning streaks, topic coverage maps, and screen-time nudges to fight doomscrolling |
| ☁️ **Serverless GPU Pipeline** | Runs on Modal with AMD MI300X — scales to zero when idle, spins up instantly on demand |
| 🗄️ **S3 Clip Storage** | Input videos and output clips stored in AWS S3; creator dashboard streams everything |
| ✏️ **In-Browser Subtitle Editor** | Edit ASS subtitle tracks before re-render directly from the Next.js dashboard |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     FRONTEND (Next.js 14)                        │
│  Upload → Dashboard → Clip Viewer → Chat with Video → Analytics  │
│  NextAuth │ Prisma ORM │ pgvector │ Inngest background jobs       │
└────────────────────────┬────────────────────────────────────────┘
                         │  POST { s3_key }
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│               BACKEND (Modal + AMD MI300X via ROCm)              │
│                                                                   │
│  FastAPI Endpoint                                                 │
│       │                                                           │
│       ├─► AWS S3 Download (source video)                         │
│       │                                                           │
│       ├─► WhisperX (ROCm GPU)                                    │
│       │     └─ audio extract → transcribe → word-align           │
│       │                                                           │
│       ├─► GPT-4o-mini                                            │
│       │     └─ score segments → select top 30–60s windows        │
│       │                                                           │
│       ├─► FFmpeg                                                  │
│       │     └─ cut clip → 9:16 crop → burn ASS subtitles         │
│       │                                                           │
│       └─► AWS S3 Upload (/clips/clip_N.mp4)                      │
└─────────────────────────────────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                      DATA LAYER                                   │
│  AWS S3 (eu-north-1) │ PostgreSQL + pgvector │ Prisma ORM        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

**AI / ML**
- [WhisperX](https://github.com/m-bain/whisperX) — Speech-to-text with word-level timestamp alignment
- [GPT-4o-mini](https://platform.openai.com/docs/models) — Clip virality scoring and moment selection
- [OpenAI Embeddings](https://platform.openai.com/docs/guides/embeddings) — Semantic indexing for Chat with Video
- [pgvector](https://github.com/pgvector/pgvector) — Vector similarity search over transcript chunks

**GPU / Compute**
- [AMD MI300X](https://www.amd.com/en/products/accelerators/instinct/mi300/mi300x.html) — 192 GB HBM3 GPU powering all inference
- [ROCm](https://rocm.docs.amd.com/) — Open GPU software stack replacing CUDA
- [Modal](https://modal.com/) — Serverless GPU deployment with volume-cached Torch models

**Video Processing**
- [FFmpeg](https://ffmpeg.org/) — Video cutting, 9:16 conversion, subtitle burn-in
- [ffmpegcv](https://github.com/chenxinfeng4/ffmpegcv) — Face-tracking crop support
- [pysubs2](https://github.com/tkarabela/pysubs2) — ASS subtitle file generation

**Backend**
- Python 3.12, FastAPI, Modal
- AWS S3 (eu-north-1), CUDA 12.4 / ROCm image build

**Frontend**
- [Next.js 14](https://nextjs.org/) (App Router), TypeScript
- [NextAuth.js](https://next-auth.js.org/) — Authentication
- [Prisma ORM](https://www.prisma.io/) + PostgreSQL / SQLite
- [Inngest](https://www.inngest.com/) — Background job orchestration
- Tailwind CSS, shadcn/ui

---

## AMD GPU Integration

This project was migrated from NVIDIA to **AMD MI300X** for the AMD Slingshot Hackathon.

| | NVIDIA A100 | AMD MI300X |
|---|---|---|
| VRAM | 80 GB HBM | **192 GB HBM3** |
| Software Stack | CUDA (vendor lock-in) | **ROCm (open source)** |
| Cost / TFLOP | $$$$ | **$$ (2× cheaper)** |
| Batch Throughput | Baseline | **+40% for LLM inference** |

**What runs on AMD:**
- WhisperX transcription and word alignment (PyTorch via ROCm)
- Torch model weights cached in `ai-podcast-clipper-model-cache` Modal Volume
- All GPU-accelerated video pre/post-processing

---

## Getting Started

### Prerequisites

- Python 3.12+
- Node.js 18+
- [Modal CLI](https://modal.com/docs/guide) account
- AWS account with S3 bucket
- OpenAI API key
- (Optional) AMD GPU + ROCm for local GPU testing

### Backend Setup

```bash
# Clone the repo
git clone https://github.com/newcomer119/ReelVideoMaker.git
cd ReelVideoMaker

# Create and activate a virtual environment
python -m venv .venv
source .venv/bin/activate       # Linux/macOS
# .venv\Scripts\activate        # Windows

# Install dependencies
pip install -r requirements.txt

# Authenticate with Modal
modal token new

# Deploy (or serve locally for development)
modal serve main.py
```

### Frontend Setup

```bash
cd frontend   # or wherever your Next.js app lives

# Install dependencies
npm install

# Run the development server
npm run dev

# Apply database migrations
npx prisma migrate dev

# (Optional) Start Inngest dev server
npm run inngest
```

### Environment Variables

Create a `.env` file in both the backend and frontend roots.

**Backend `.env`**

```env
OPENAI_API_KEY=sk-...
AUTH_TOKEN=your-secret-bearer-token
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_DEFAULT_REGION=eu-north-1
MODAL_TOKEN_ID=...
MODAL_TOKEN_SECRET=...
```

**Frontend `.env`**

```env
NEXTAUTH_SECRET=changeme
NEXTAUTH_URL=http://localhost:3000
OPENAI_API_KEY=sk-...
DATABASE_URL=file:./prisma/db.sqlite
S3_UPLOAD_BUCKET=ai-podcast-clipper11
S3_REGION=eu-north-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

---

## Usage

### Process a Video

1. Upload your podcast/video to the S3 bucket (or use the dashboard upload page)
2. Send a POST request to the processing endpoint:

```bash
curl -X POST http://localhost:5001/process-video \
     -H "Authorization: Bearer ${AUTH_TOKEN}" \
     -H "Content-Type: application/json" \
     -d '{"s3_key": "your-folder/podcast.mp4"}'
```

3. Clips will appear in S3 under `<input-prefix>/clips/clip_N.mp4`
4. The dashboard will automatically display the clips with metadata, hooks, and virality scores

### Chat with Video

Once a video is processed, navigate to the video page in the dashboard and use the chat input to ask questions about the content. The AI will return answers with clickable timestamps.

---

## API Reference

### `POST /process-video`

Triggers the full AI clip generation pipeline.

| Field | Type | Description |
|---|---|---|
| `s3_key` | `string` | S3 object key of the source video |

**Headers:** `Authorization: Bearer <AUTH_TOKEN>`

**Response:**
```json
{
  "clips": [
    {
      "index": 1,
      "s3_url": "https://...",
      "start": 142.3,
      "end": 198.7,
      "hook": "The most interesting insight...",
      "virality_score": 0.91
    }
  ],
  "transcript": { ... }
}
```

---

## Project Structure

```
ReelVideoMaker/
├── main.py                  # Modal app, FastAPI entrypoint, core pipeline
├── requirements.txt         # Backend dependencies
├── asd/                     # Columbia face tracking model assets
│
└── frontend/
    ├── src/
    │   ├── app/             # Next.js App Router pages + API routes
    │   ├── components/      # UI primitives and feature components
    │   ├── actions/         # Server actions (S3, OpenAI, auth)
    │   └── lib/             # Embeddings, vector search, chat history
    ├── prisma/              # Prisma schema + migrations
    └── inngest/             # Background job definitions
```

---

## Roadmap

- [x] AI clip generation with WhisperX + GPT-4o-mini
- [x] 9:16 vertical conversion with subtitle burn-in
- [x] Creator dashboard with clip preview and download
- [x] Chat with Video (pgvector semantic Q&A)
- [x] Addiction Analytics (learning streaks + screen-time nudges)
- [x] **AMD MI300X + ROCm migration**
- [ ] Columbia face-tracker for dynamic 9:16 subject-following crop
- [ ] Real-time log streaming to frontend dashboard
- [ ] Multi-language transcription support
- [ ] Direct TikTok / YouTube Shorts / Instagram Reels export
- [ ] Team workspaces with role-based access control
- [ ] Redis job queue for status persistence and analytics

---

## Contributing

Contributions are welcome!

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'Add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request describing the change, deployment implications, and how to test it

Please run `npm run lint` (frontend) and ensure any schema changes include committed migrations before opening a PR.

---

## License

Distributed under the MIT License. See `LICENSE` for more information.

---

<div align="center">

**Built with ❤️ by BIT WIZARDS for AMD Slingshot Hackathon**

[🎬 Watch Demo](https://www.youtube.com/watch?v=xaGF5_I9Uu8) · [📂 GitHub](https://github.com/newcomer119/ReelVideoMaker/)

</div>
