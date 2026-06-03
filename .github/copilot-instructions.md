# files-to-text-extractor — Copilot Instructions

## Project Overview

REST API service that accepts PDF and image files (medical prescriptions), sends them to an AI provider (currently Anthropic Claude), and returns the fully extracted text content.

## Stack

- **Runtime**: Node.js + TypeScript (strict mode)
- **Framework**: Express 4
- **Database**: PostgreSQL via Prisma ORM (latest)
- **AI**: Anthropic Claude (`@anthropic-ai/sdk`) — provider-agnostic by design
- **File uploads**: Multer (disk storage, cleaned up after processing)
- **Validation**: Zod (env vars + future request validation)

## Project Structure

```
src/
  config/       — Environment config (validated with Zod)
  middleware/   — Express middleware (upload.ts, errorHandler.ts)
  routes/       — Express routers (extract.ts)
  services/     — Business logic (aiService.ts, fileService.ts)
  types/        — Shared TypeScript types
  index.ts      — Express app bootstrap
prisma/
  schema.prisma — Database schema (Extraction model)
```

## Key Conventions

- All route handlers must use `next(err)` for error propagation — never `throw` inside async handlers without `.catch(next)`.
- Uploaded files are always deleted after processing (success or failure) via `deleteFile()`.
- The `config/index.ts` is the single source of truth for env vars — never read `process.env` directly elsewhere.
- Prisma client should be instantiated once per module (not per request).
- API responses always follow `ApiResponse<T>` shape: `{ success: boolean, data?: T, error?: string }`.
- File type detection uses MIME type, not extension.

## AI Provider Pattern

- The active provider is selected by `AI_PROVIDER` env var (`anthropic` | `openai`).
- To add a new provider: add a `extractWith<Provider>` function in `aiService.ts` and add a case to the switch.
- The extraction prompt is defined in `aiService.ts` as `EXTRACTION_PROMPT` — refine it for accuracy on medical prescriptions.

## Prisma Workflow

```bash
pnpm prisma:migrate    # create and apply migrations
pnpm prisma:generate   # regenerate Prisma client after schema changes
pnpm prisma:studio     # open Prisma Studio
```

## Running Locally

```bash
cp .env.example .env      # fill in DATABASE_URL and ANTHROPIC_API_KEY
pnpm install
pnpm prisma:migrate
pnpm dev
```

## Endpoints

| Method | Path               | Description                                                      |
| ------ | ------------------ | ---------------------------------------------------------------- |
| POST   | `/api/extract`     | Upload file (multipart `file` field), extract and return content |
| GET    | `/api/extract/:id` | Get extraction by ID                                             |
| GET    | `/api/extract`     | List extractions (`?page=1&limit=20`)                            |
| GET    | `/health`          | Health check                                                     |

## Security Notes

- Never log or expose file contents in error messages.
- Validate MIME types server-side (Multer `fileFilter`) — do not trust client-supplied types.
- Uploaded files are stored temporarily and deleted immediately after AI processing.
- API keys must never be committed — use `.env` (gitignored).
