# HCM Lite — AI-assisted Human Capital Management

Saylani Hackathon build (24 Oct 2026). Next.js 16 App Router · React 19 · Tailwind 4 · Redux Toolkit · Supabase (optional) · bcryptjs/jose auth · jsPDF payslips · offline-capable AI assistant.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

On first open the app shows the **first-run setup** screen: create the company profile (office time, grace, weekends, geofence) and the System Admin. Everything else is built from in-app actions — the database starts empty.

## Demo walkthrough (5 minutes)

1. **Setup** → create company "Acme Ltd", admin `admin@acme.com`.
2. **Settings → Departments** → add `Engineering`, `Sales`. **User Accounts** → create an HR login (note the temp password).
3. Login as **HR** → **Employees** → add an employee (login credentials shown once) or use **CSV Import** → *Insert sample* → *Dry run* (rows with bad department/emails are flagged with exact field errors) → *Import*.
4. Login as **Employee** → **Attendance** → **Check in** (or 📷 camera check-in with face + GPS geofence) → later **Check out**. A second check-in returns **409**.
5. **Leave** → ✦ Smart leave: type `Need next Mon and Tue off for wedding` → Parse → form pre-fills → Submit. Overlapping dates or quota overflow → **422**.
6. Login as **HR** → **Leave** → approve. Employee gets a notification.
7. **Payroll** (HR) → pick month → *Generate draft* (gross = 1.5 × basic, daily-rate deductions for absent/unpaid days, PK tax slabs). Admin → *Finalize & lock* (permanent, re-run rejected).
8. **Dashboards** → KPIs (attendance rate, late %, absenteeism, attrition), department table, 6-month trend, ✦ AI summary widget.
9. **AI Assistant** → ask *“How many employees do we have?”*, *“My leave balance”*, *“Who was late today?”* (HR/Admin), *“What is the grace period?”*. Employees asking for payroll data are **denied by policy**.

## Accounts

| Role | Powers |
|---|---|
| Admin | First-run setup, company settings, org data, HR logins, payroll finalize (lock), audit log |
| HR | Employee onboarding + CSV, salary structures, attendance board, leave approvals, payroll drafts |
| Employee | Check-in/out (web/camera), corrections, leave, own payslip PDFs, own data only |

## Database: Supabase or local fallback

The store prefers Supabase and **falls back automatically** to a local JSON DB (`.data/db.json`) when Supabase is unreachable — the demo never dies. To use Supabase:

1. Open the Supabase dashboard → SQL Editor.
2. Paste `supabase/schema.sql` and run it.
3. Set `.env.local`:
   ```
   NEXT_PUBLIC_SUPABASE_URL=...
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
   ```
4. Restart the dev server (the backend probe runs once per process). Force a backend with `DB_BACKEND=local|supabase`.

> Schema changes require re-running the SQL; the local store needs no setup (delete `.data/` for a factory reset).

## AI Assistant

- `POST /api/ai/chat` — tools: `get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`, `search_employees`. Identical RBAC to the REST API.
- **Offline engine** (default): deterministic intent parsing + policy Q&A from live settings. No key needed.
- **Live LLM** (optional): set in `.env.local` — any OpenAI-compatible endpoint:
  ```
  LLM_API_KEY=...
  LLM_BASE_URL=https://api.openai.com/v1   # or Groq/OpenRouter/GLM etc.
  LLM_MODEL=gpt-4o-mini
  ```
- Guardrails: 15 s timeout · 20 requests/user/hour · 1 retry on JSON failure · "AI-generated" tag in UI.

## Spec-driven docs

- `specs/requirements.md` — EARS requirements traced to PRD feature numbers
- `specs/design.md` — architecture, data model, API contract, business rules
- `specs/tasks.md` — implementation checklist (all complete)

## Scripts

```bash
npm run dev     # dev server (Turbopack)
npm run build   # production build
npm run start   # serve production build
npm run lint    # eslint
```
