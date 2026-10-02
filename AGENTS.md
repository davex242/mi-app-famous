# Base44 Dev Environment

## Project Overview
- **Type**: Vite + React + TypeScript + Tailwind frontend (shadcn/ui components)
- **Backend**: Hosted Supabase (credentials hardcoded in `src/lib/supabase.ts` — no env vars needed)
- **No external secrets required** — Supabase URL and anon key are in source code

## Running the App
```bash
docker compose -f docker-compose.base44.yml up -d
```
- Vite dev server runs on port 8080 inside the container, mapped to host port 3000
- Dependencies installed via `npm ci` on container startup
- Source is bind-mounted at `/app` — edits hot-reload automatically
- Healthcheck: `GET /` on port 8080

## Key Files
- `src/lib/supabase.ts` — Supabase client init (hardcoded URL + key)
- `src/context/AuthContext.tsx` — Auth via Supabase `app_users` table
- `src/App.tsx` — Root component with routing (react-router-dom)
- `src/pages/Index.tsx` — Main page
- `vite.config.ts` — Vite config (port 8080, `@` alias to `src/`)
