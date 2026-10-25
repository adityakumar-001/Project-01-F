# Get-Attended

Attendance app for Organizer -> Admins -> Employees.

- Frontend: React 19 + Vite in `frontend/` with routes `/organizer`, `/admin`, `/employee` and `/legacy-unified`.
- Backend: Node.js + Express + MySQL in `backend/` (`server.js`, `db.sql`).
- Legacy root HTML files are kept only as behavior references; the server redirects their URLs to the React routes.

## Setup

1. Create the database and import the schema:
   `mysql -u root -p < backend/db.sql`
2. Configure the backend:
   `copy backend\.env.example backend\.env` (then edit values).
3. Install the backend and build the frontend:
   `cd backend`
   `npm install`
   `cd ..\frontend`
   `npm install`
   `npm run build`
4. Start the server:
   `cd ..\backend`
   `npm start`

The server serves the built frontend and the API from the same port (default `3000`).

For frontend development, run `npm run dev` in `frontend/` (Vite proxies `/api` to
`http://localhost:3000`), and keep the backend running separately.

`docker compose up --build` builds the React app automatically with the multi-stage
`Dockerfile`; no local `frontend/dist` is required.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `3000` | HTTP port. |
| `DB_HOST` / `DB_PORT` | `localhost` / `3306` | MySQL server. |
| `DB_USER` / `DB_PASS` / `DB_NAME` | `root` / empty / `attend` | MySQL credentials. |
| `DB_SSL` | empty | Set `1`/`true` for TLS (managed MySQL). |
| `API_SECRET` | empty | Optional shared app-key. When set, every request must send `x-api-secret`. |
| `CORS_ORIGIN` | empty | Comma-separated allowed origins. Empty = same-origin only. |
| `TOKEN_TTL_ORGANIZER` | `3600` | Organizer token lifetime (seconds). |
| `TOKEN_TTL_ADMIN` | `3600` | Admin token lifetime (seconds). |
| `TOKEN_TTL_EMPLOYEE` | `900` | Employee token lifetime (seconds). |

## Security model

- Passwords are stored as `scrypt` hashes. Legacy plaintext rows are upgraded on login and on boot.
- Login returns an opaque bearer token; only its SHA-256 is stored (`auth_tokens`). Send it as `Authorization: Bearer <token>`.
- Every API is role-scoped:
  - Organizer: admins + own profile only. No employee or attendance details.
  - Admin: own employees, attendance, leaves, and own profile.
  - Employee: own profile, attendance, and leaves.
- Passwords are never returned by the API or rendered in tables.
- Disabling an Admin or Employee revokes their active tokens immediately.
- Per-IP login rate limiting is built in.

## Default accounts

Fresh installs seed one Organizer and one Admin (change both after first login):

- Organizer: `organizer` / `Organizer@124`
- Admin: `admin` / `Admin@124`

## Frontend checks

Run from `frontend/`:

- `npm test` — Vitest + Testing Library unit and sign-in flow tests.
- `npm run lint` — ESLint.
- `npm run build` — production build into `frontend/dist`.

## Offline mode

Every portal works offline with local data when no API URL is configured.
Once a cloud API URL is set, login and sync go through the server, and any
locally stored plaintext passwords are removed.
