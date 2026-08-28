# Timeshare Platform

Split rebuild of Forever Timeshare into two independent apps:

- `frontend/` — Vite + React 19 + TypeScript + TanStack Router (client-side SPA), Tailwind v4, shadcn/ui. Same visual design as the original Lovable project (estate heritage luxe theme), fully responsive for desktop and mobile.
- `backend/` — NestJS + TypeScript REST API. Talks to Supabase (Postgres, Auth, Storage) using the service role key. Hosts all business logic (membership, ownership, inventory, booking, payments, notifications, admin, reports).

## Development

```bash
cd frontend && npm install && npm run dev   # http://localhost:5173
cd backend  && npm install && npm run start:dev  # http://localhost:3000
```

The frontend calls the backend via `VITE_API_URL` (see `frontend/.env.example`).
The backend needs Supabase credentials (see `backend/.env.example`).

## Status

Being built incrementally, stage by stage. See each folder's own progress as features land:

1. Project scaffolding (this stage)
2. Design system + shared layout (header/footer/page shell)
3. Public marketing pages (home, resorts, membership, offers, about, FAQ, contact)
4. Backend Supabase wiring + auth
5. Core domain modules (membership, ownership, inventory, booking, payments)
6. Member / Owner / Admin portals
7. Mobile responsiveness + polish pass
