# CatReader

RSS reader with a React frontend and a Go + SQLite backend.

## Local Config

Create local env files from the examples:

```bash
cp .env.local.example .env.local
cp backend/.env.local.example backend/.env.local
```

Put the admin AskCat config in the root `.env.local`:

```bash
VITE_ASKCAT_BASE_URL=https://api.openai.com/v1
VITE_ASKCAT_API_KEY=...
VITE_ASKCAT_MODEL=gpt-4.1-mini
VITE_ASKCAT_CONTEXT_SIZE=30
```

Put the server-side LLM config in `backend/.env.local`:

```bash
CATREADER_LLM_BASE_URL=https://api.openai.com/v1
CATREADER_LLM_API_KEY=...
CATREADER_LLM_MODEL=gpt-4.1-mini
```

`VITE_*` values are exposed to the browser, so keep AskCat as an admin/local
feature. Feed introductions use the backend `CATREADER_LLM_*` values and are
not generated with browser credentials.

In local development, saving AskCat settings in the UI also asks the backend to
write both `.env.local` and `backend/.env.local`. The backend admin write API is
restricted to localhost requests.

## Run

Start the backend:

```bash
cd backend
go run ./cmd/catreader-server
```

Start the frontend in another terminal:

```bash
npm run dev
```

If you edit `.env.local`, restart the relevant dev server.

## Checks

```bash
cd backend && go test ./...
npm run lint
npm test -- --run
```
