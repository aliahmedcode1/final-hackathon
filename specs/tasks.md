# HCM Lite — Implementation Tasks

Spec-driven checklist. Updated as tasks complete. [x] done · [~] in progress · [ ] todo.

## 1. Foundation
- [x] 1.1 `supabase/schema.sql` (all tables, indexes, unique constraints)
- [x] 1.2 Deps: bcryptjs, jose, zod, date-fns, jspdf; `AUTH_SECRET` in .env.local
- [x] 1.3 `lib/supabase.js`, `lib/local-db.js`, `lib/store.js` (dual backend + health probe + env override)
- [x] 1.4 `lib/auth.js` (JWT, getSession, requireRole, error helpers), `lib/audit.js`, `lib/notify.js`
- [x] 1.5 Domain libs: `lib/dates.js`, `lib/geo.js`, `lib/payroll.js`, `lib/kpi.js`
- [x] 1.6 Redux store + slices + Provider; `lib/api.js` client helper
- [x] 1.7 Root layout, globals.css (Tailwind 4 theme), `/` redirect, `/setup`, `/login` pages
- [x] 1.8 Auth API routes (setup/status, auth/setup, login, logout, me, password)
- [x] 1.9 App shell: `(app)/layout.js`, Sidebar (role menus), Topbar (notifications badge), Toasts, shared components

## 2. Org & Employees
- [x] 2.1 `/api/settings`, `/api/org` (departments/designations/holidays CRUD)
- [x] 2.2 `/api/users` (HR provisioning, deactivate, reset w/ temp password)
- [x] 2.3 `/api/employees` (server-side pagination/search/filter), `/api/employees/[id]` (360°)
- [x] 2.4 `/api/employees/csv` (dry-run report + commit + export)
- [x] 2.5 Settings page (Admin), Users page (Admin), Employees pages (directory + 360° + CSV import UI + salary tab)

## 3. Attendance
- [x] 3.1 `/api/attendance` (board/calendar GET, check-in POST w/ 409 + geofence + status tag), `/api/attendance/check-out`
- [x] 3.2 `/api/attendance/corrections` (request/decide/view)
- [x] 3.3 CheckInCard (camera + face check + GPS accuracy), Attendance page (board, calendar), Corrections page

## 4. Leave
- [x] 4.1 `/api/leaves` (apply/cancel/history + 422 rules), `/api/leaves/decision` (+notify), `/api/leaves/balance`
- [x] 4.2 `lib/ai/smartleave.js` + `/api/leaves/smart`
- [x] 4.3 Leave page (apply form + smart-leave box, balances, history, HR approval queue)

## 5. Payroll
- [x] 5.1 `/api/payroll` (draft gen per §3 design, own payslips for E), `/api/payroll/finalize` (lock + notify)
- [x] 5.2 Payroll page (HR draft review table, Admin finalize w/ confirm, Employee payslip list)
- [x] 5.3 Payslip PDF via jspdf

## 6. Dashboards & comms
- [x] 6.1 `/api/dashboard` (role-scoped KPIs + trends + AI summary text)
- [x] 6.2 Dashboard pages (Admin/HR/Employee) + KPI cards + charts (pure-CSS/SVG bars)
- [x] 6.3 `/api/announcements`, `/api/notifications` + pages
- [x] 6.4 `/api/audit` + Admin audit page

## 7. AI Assistant
- [x] 7.1 `lib/ai/tools.js` (7 tools, RBAC-scoped executions)
- [x] 7.2 `lib/ai/engine.js` (offline intent engine + OpenAI-compatible provider + guardrails)
- [x] 7.3 `/api/ai/chat` (rate limit, timeout, retry)
- [x] 7.4 AI chat page (thread UI, tool-call trace, AI-generated tag) + dashboard AI widget

## 8. Polish
- [x] 8.1 README (setup, Supabase schema step, demo script, env vars)
- [x] 8.2 Lint clean + `next build` clean

## 9. Verification (spec §8)
- [x] 9.1 Build + boot; setup→login flow (Admin)
- [x] 9.2 HR provisioning, employee create + CSV dry-run with bad rows
- [x] 9.3 Employee: temp-password login, check-in/out, duplicate 409, correction flow
- [x] 9.4 Leave: apply, overlap 422, smart-leave, approve + notification
- [x] 9.5 Payroll: draft, finalize lock, payslip PDF, locked-period rejection
- [x] 9.6 Dashboards/KPIs, announcements, audit visible
- [x] 9.7 AI chat all roles; peer-salary rejection for Employee
