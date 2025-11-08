# AI Podcast Clipper Frontend

This package provides the customer-facing experience for generating short-form clips from long-form podcasts. It is a Next.js 14 app that talks to the backend Modal service, manages authentication, and exposes tooling for reviewing, editing, and exporting clips.

## Project Goals

- Deliver a streamlined dashboard where creators can upload or point to podcast videos, then retrieve AI-curated vertical clips.
- Surface clip metadata (hooks, virality score, timestamps) with previews and timeline overlays.
- Offer an editing workspace where users can adjust subtitles, regenerate clips, and manage export-ready assets.
- Integrate billing, usage tracking, and notifications to support paid plans.

## Architecture Overview

- `src/app` – App Router pages, protected dashboard, login/signup, API routes for auth, chat completion, clip edits, transcript access, and background jobs.
- `src/components` – Reusable UI primitives (buttons, dialogs, tables) and feature components such as `clip-display` and `timeline-editor`.
- `src/actions` – Server actions for OpenAI-powered clip generation, S3 uploads, and auth helpers.
- `src/lib` – Shared utilities covering embeddings, vector search (pgvector), chat history persistence, and misc helpers.
- `prisma` – SQLite dev database with Prisma schema; production targets pgvector-enabled Postgres.
- `inngest` – Background jobs for long-running clip generation and post-processing.

## Getting Started

```bash
npm install
npm run dev
```

The app expects a `.env` file. Copy `.env.example` (if present) or create one with:

```
NEXTAUTH_SECRET=changeme
NEXTAUTH_URL=http://localhost:3000
OPENAI_API_KEY=sk-...
DATABASE_URL=file:./prisma/db.sqlite
S3_UPLOAD_BUCKET=ai-podcast-clipper11
S3_REGION=eu-north-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

Run `npx prisma migrate dev` after updating the schema. For pgvector-specific setups, see `README-PGVECTOR.md` and the scripts in `scripts/`.

## Development Scripts

- `npm run dev` – Start Next.js locally.
- `npm run lint` – ESLint with project rules.
- `npm run build` / `npm run start` – Production build preview.
- `npm run inngest` – Start Inngest dev server (requires `inngest` CLI).

## Working With The Backend

- Upload flow: user uploads assets → `src/actions/s3.ts` sends to the shared S3 bucket → backend Modal job processes clips.
- Clip data retrieval: dashboard pages call `/api/edits/*` and `/api/chat/*` routes which proxy to backend services and the vector DB.
- Authentication: NextAuth with credentials provider; server routes use `src/server/auth` to confirm sessions before exposing data.

## Roadmap & Ideas

- Live preview sync between subtitle edits and rendered video.
- Team workspaces, role-based access, and usage quotas.
- Export automation: batch download, direct TikTok/YouTube uploads.
- Rich analytics on clip performance and GPT-driven copy suggestions.

## Contributing

1. Create a feature branch.
2. Update relevant docs/components.
3. Run `npm run lint` and ensure migrations are committed if schema changes.
4. Open a PR describing the feature and how to test it.
