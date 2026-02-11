# CloudCruise

Next.js app with TypeScript and shadcn/ui (boilerplate only).

## Requirements

- Node.js **18.18.0 or later**

## Setup

```bash
npm install
```

To use the HAR upload feature (which extracts curl from a HAR file), start the NestJS backend (see **Backend** below). The frontend calls `BACKEND_URL` (default `http://localhost:3001`) via the `/api/upload-har` route. Set `BACKEND_URL` in `.env.local` if your backend runs elsewhere.

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

The `backend/` directory contains a NestJS API with a single endpoint **POST /extract-har** that filters a HAR file (excluding HTML responses), reduces requests to API-relevant fields, and uses OpenAI to generate curl command(s).

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

### Endpoint

- **POST /extract-har**
  - **Input**: Either `Content-Type: application/json` with a HAR object `{ "log": { "entries": [...] } }`, or `Content-Type: multipart/form-data` with a `file` field containing a `.har` file.
  - **Output**: `Content-Type: text/plain` with one curl command per non-HTML request (newline-separated).
  - HAR size limit: 10 MB.
