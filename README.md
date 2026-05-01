# CatReader

RSS reader with a React frontend and a Go + SQLite backend.

## Local Config

Create the local env file from the backend example:

```bash
cp backend/.env.local.example backend/.env.local
```

Put local config in `backend/.env.local`:

```bash
VITE_ASKCAT_BASE_URL=https://api.openai.com/v1
VITE_ASKCAT_API_KEY=...
VITE_ASKCAT_MODEL=gpt-4.1-mini
VITE_ASKCAT_CONTEXT_SIZE=30
CATREADER_USER_DB_DRIVER=mysql
CATREADER_USER_DB_HOST=...
CATREADER_USER_DB_PORT=3306
CATREADER_USER_DB_NAME=...
CATREADER_USER_DB_USER=...
CATREADER_USER_DB_PASSWORD=...
```

`VITE_*` values are exposed to the browser, so keep AskCat as an admin/local
feature. Vite is configured to read env values from `backend/.env.local`. The backend reads the same file; feed introductions reuse
the `VITE_ASKCAT_*` LLM settings unless explicit `CATREADER_LLM_*` environment
variables are provided.

In local development, saving AskCat settings in the UI also asks the backend to
write `backend/.env.local`. The backend admin write API is restricted to
localhost requests.

## Run

Start the full local development stack from the project root:

```bash
npm run dev
```

This starts three services and stops them together when you press `Ctrl+C`:

- React + Vite frontend: `http://127.0.0.1:5173`
- Go backend: `http://127.0.0.1:8080/health`
- `opencli-rss-bridge`: `http://localhost:3847/feeds`

The bridge is expected at `../opencli-rss-bridge` next to this repository. If
it lives somewhere else, set `CATREADER_BRIDGE_DIR` before running `npm run dev`.
The backend uses `GOCACHE=/private/tmp/catreader-go-cache` by default on this
Mac so Go builds do not depend on a locked cache directory.

For focused debugging, each service can still be started independently:

Start the backend:

```bash
npm run dev:backend
```

Start the frontend:

```bash
npm run dev:frontend
```

Start the OpenCLI RSS bridge:

```bash
npm run dev:bridge
```

If you edit `backend/.env.local`, restart the relevant dev server.

## Checks

```bash
cd backend && go test ./...
npm run lint
npm test -- --run
```
