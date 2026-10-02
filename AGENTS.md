# Base44 Dev Environment

## Overview
Vite + React + TypeScript frontend using shadcn/ui components and Supabase as its backend (hosted; credentials hardcoded in `src/lib/supabase.ts`).

## Running
- `docker compose -f docker-compose.base44.yml up -d`
- App served on host port 3000 (mapped to Vite's port 8080 inside the container)
- Vite dev server with HMR; edits appear live without rebuild

## Key Details
- Vite dev server runs on port 8080 (configured in `vite.config.ts`, overridden to `0.0.0.0` via CLI)
- Supabase URL and anon key are hardcoded in `src/lib/supabase.ts` — no env vars or secrets needed
- Uses `npm` with `package-lock.json`; deps installed on container startup via `npm ci`
- React Router for routing, React Query for data fetching, Tailwind CSS for styling
