# CloudCruise

A HAR workbench for reverse-engineering APIs. Upload a `.har` file, describe the API you want to find, and get a matching curl command with optional in-browser execute.

Next.js app with TypeScript and shadcn/ui.

## Features

- HAR upload (drag-and-drop)
- Filtered request list with search
- Natural-language match via OpenAI
- curl generation
- In-browser execute

## Requirements

- Node.js **18.18.0 or later**

## Setup

```bash
npm install
```

To use the HAR feature, start the NestJS backend (see **Backend** below). The frontend calls `BACKEND_URL` (default `http://localhost:3001`) via `/api/parse-har` and `/api/match-request`. Set `BACKEND_URL` in `.env.local` if your backend runs elsewhere.

## Scripts

- `npm run dev` – start development server
- `npm run build` – build for production
- `npm run start` – start production server
- `npm run lint` – run ESLint

## Adding shadcn components

```bash
npx shadcn@latest add <component>
```

Example: `npx shadcn@latest add card`

## Backend (NestJS)

The `backend/` directory contains a NestJS API with two endpoints for HAR processing.

### Requirements

- **OPENAI_API_KEY** must be set (e.g. in `backend/.env` or environment). See `backend/.env.example`.

### Setup and run

```bash
cd backend
npm install
cp .env.example .env
# Edit .env and set OPENAI_API_KEY
npm run start:dev
```

By default the server listens on port **3001**.

### Endpoints

- **POST /extract-har/parse**
  - **Input**: `Content-Type: multipart/form-data` with a `file` field containing a `.har` file, or `Content-Type: application/json` with a HAR object `{ "log": { "entries": [...] } }`.
  - **Output**: JSON `{ "count": number, "entries": [...] }` — filtered non-HTML requests with method, url, headers, postData, status.

- **POST /extract-har/match**
  - **Input**: JSON `{ "description": string, "entries": [...] }` (request list from parse).
  - **Output**: JSON `{ "curl", "matchedIndex?", "confidence?", "explanationBullets?" }` — best-matching request curl and explanation.

- HAR size limit: 100 MB.
