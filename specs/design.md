# HCM Lite — Technical Design Specification

Implements `requirements.md`. Stack: Next.js 16 (App Router, Turbopack) · React 19 · Tailwind 4 · Redux Toolkit · Supabase (dual-backend store) · bcryptjs · jose · zod · date-fns · jspdf.

## 1. Architecture

Single Next.js app acting as SPA + REST API:

```
Browser (client components, Redux)
   │  fetch() JSON, JWT httpOnly cookie
   ▼
/api/* route handlers  ── authn (JWT verify) → RBAC → zod validation → business logic
   │
   ▼
store.js (generic table interface)
   ├── Supabase REST (supabase-js, anon key; schema in supabase/schema.sql)
   └── Local JSON file (.data/db.json) — automatic fallback if Supabase unreachable
```

- JWT: HS256 via `jose`, secret `AUTH_SECRET`, payload `{sub, role, employee_id, email}`, 7-day expiry, httpOnly cookie `hcm_token`. `getSession(req)` verifies; `requireRole(session, [...roles])` guards routes; helpers answer `{status, json}` on failure.
- First-run: `users` empty ⇒ `/setup` enabled; `POST /api/auth/setup` creates Admin + company profile, writes audit log.
- IDs: `crypto.randomUUID()`. Dates: `YYYY-MM-DD`; timestamps: ISO UTC. Server local clock defines "today".
- Audit: every administrative mutation writes `audit_logs {actor_email, action, entity, entity_id, detail, at}`.
- Notifications: `notifications {user_id, type, title, body, link, read, at}`; helper `notify(userId, …)`.

## 2. Data model (Supabase tables; local store uses identical shapes)

| table | key fields |
|---|---|
| users | id, email, password_hash, role(admin/hr/employee), employee_id?, is_active, must_change_pw, created_at |
| company_settings | id, name, address, start_time "09:00", grace_minutes 15, halfday_hours 5, weekend_days [0,6] (Sun=0,Sat=6), latitude, longitude, radius_m, quotas {annual:14, sick:8, casual:10}, currency PKR, setup_done |
| departments / designations | id, name |
| public_holidays | id, date, name |
| employees | id, code, first_name, last_name, email, phone, address, department_id, designation_id, join_date, exit_date?, status active/exited, basic_salary |
| attendance | id, employee_id, date, check_in_at, check_out_at?, status present/late/half_day, worked_hours?, method web/camera, latitude, longitude, distance_m? — unique(employee_id, date) |
| attendance_corrections | id, employee_id, attendance_date, new_check_in, new_check_out, reason, status pending/approved/rejected, reviewed_by?, comment?, created_at |
| leave_requests | id, employee_id, type annual/sick/casual/unpaid, from_date, to_date, days, reason, status pending/approved/rejected/cancelled, decided_by?, comment?, created_at |
| payroll_runs | id, period "YYYY-MM", status draft/locked, totals {employees, gross, deductions, tax, net}, created_by, created_at, locked_by?, locked_at? |
| payslips | id, run_id, employee_id, basic, gross, absent_days, unpaid_days, deductions, tax, net, working_days |
| announcements | id, title, body, posted_by, created_at |
| notifications | as above |
| audit_logs | as above |
| ai_usage | user_id, hour_bucket, count |

Statuses derive: **Absent** = no attendance row on an expected working day; **Missing_Checkout** = row with check-in and no check-out.

## 3. Business logic

- **Attendance tag** (FR-04.2): at check-in, `late = checkin > start+grace` ⇒ late else present; at check-out, if `workedHours < halfday_hours` ⇒ half_day. Duplicate check-in ⇒ 409.
- **Geofence** (FR-04.5): client rejects face-count ≠ 1 and GPS accuracy > 100 m; server recomputes Haversine distance to (latitude, longitude), rejects > radius_m.
- **Working days** (a date is a working day): not in `weekend_days` and not in `public_holidays` and ≤ today, and on/after employee `join_date` (and ≤ exit_date if exited).
- **Leave days** = count of working dates in [from, to]. Overlap with own non-cancelled/rejected requests ⇒ 422. Quota: used = approved days in current year (unpaid exempt) ; `days > quota − used` ⇒ 422. Approve re-validates quota then decrements implicitly (derived balances).
- **Payroll** (period P): for each active employee:
  - working_days WD in P; gross = 1.5 × basic; daily_rate = gross / WD.
  - absent_days = expected working days in P with no attendance row and not covered by approved leave (join-date aware).
  - unpaid_days = approved unpaid leave days in P; half-days count only in KPIs, not payroll deductions (per PRD §4 wording).
  - deductions = (absent_days + unpaid_days) × daily_rate.
  - taxable_monthly = gross − deductions; annual = taxable × 12; annual tax per §5 slabs (0 / 5% / 30k+15% / 210k+25% / 510k+35%); monthly tax = annual / 12.
  - net = gross − deductions − tax.
  - Draft (HR) may be regenerated; finalize (Admin) sets locked ⇒ immutable + blocks re-runs for P; on finalize each employee user is notified.
- **KPIs** (FR-07.2) computed over a month window on expected working days; Missing_Checkout counts as present-equivalent.

## 4. REST API (all under `/api`; every route: JWT → RBAC → zod)

| route | methods | roles | notes |
|---|---|---|---|
| /setup/status | GET | public | {needsSetup} |
| /auth/setup | POST | public (only if zero users) | creates Admin |
| /auth/login / logout | POST | public / auth | sets/clears cookie; must_change_pw flag returned |
| /auth/me | GET | auth | session + employee profile |
| /auth/password | PATCH | auth | change own password (bcrypt) |
| /settings | GET / PUT | A+H view, A write | company settings |
| /org | GET / POST / PATCH / DELETE | A+H view, A write | departments, designations, holidays (type field) |
| /users | GET / POST / PATCH | A | HR provisioning, deactivate, reset (returns temp password once) |
| /employees | GET / POST | all read, H write | ?q&dept&status&page&pageSize server-side |
| /employees/[id] | GET / PATCH | own phone/addr for E | 360° profile aggregation |
| /employees/csv | POST / GET | H | {mode:dry|commit}; GET = CSV export |
| /attendance | GET / POST | scope by role | GET ?date= board, ?month= calendar, own for E; POST = check-in (409 dup) |
| /attendance/check-out | POST | auth | updates row, half-day recheck |
| /attendance/corrections | GET / POST / PATCH | E req, H decide, A view | |
| /leaves | GET / POST / PATCH | own / H | PATCH cancel own pending |
| /leaves/decision | PATCH | H | approve/reject + comment → notify |
| /leaves/balance | GET | auth | own or any for A/H |
| /leaves/smart | POST | auth | NL → pre-filled form JSON |
| /payroll | GET / POST | A+H (E sees own payslips) | POST creates draft period |
| /payroll/finalize | POST | A | lock + notify |
| /dashboard | GET | auth | role-scoped KPI payload |
| /announcements | GET / POST | A+H post, all read | |
| /notifications | GET / PATCH | auth | mark read |
| /audit | GET | A | paged |
| /ai/chat | POST | auth | guardrails §6 |

## 5. AI Assistant

- `POST /ai/chat {messages:[{role,content}]}` → `{reply, toolCalls[], source:"llm"|"offline", aiGenerated:true}`.
- Provider selection: env `LLM_API_KEY` + `LLM_BASE_URL` + `LLM_MODEL` ⇒ OpenAI-compatible function-calling loop; else **offline engine**: intent classification (regex/keyword) → tool call → markdown formatter. Same tool registry either way.
- Tools (executed with the caller's session, same RBAC as REST):
  - `get_headcount({status?, department?})` — all roles.
  - `get_attendance_summary({date?|month?})` — A/H company-wide, E own-only.
  - `get_late_comers({date?})` — A/H.
  - `get_leave_summary({month?, status?, department?})` — A/H.
  - `get_my_leave_balance({employee_id?})` — self only.
  - `get_payroll_summary({period?})` — A/H; employees rejected (peer salary rule).
  - `search_employees({q, department?})` — all roles; salary fields stripped for E.
- Guardrails: AbortController 15 s; rate limit 20 req/user/hour via `ai_usage`; 1 retry on LLM JSON parse failure; UI badge "AI-generated".
- Policy Q&A answered from live company_settings (grace, quotas, tax rules).
- Smart-leave parser (shared by /leaves/smart): resolves "today/tomorrow/next <weekday>/<weekday>/next week/<n> days/Dec 1" → {type, from, to, days, reason}; keyword mapping wedding→annual, fever/ill→sick, urgent→casual, etc. Returns form JSON for confirmation, never auto-submits.

## 6. Front-end map

- `/` → client redirect by session (`/setup` if needed, `/login`, else role home).
- `(app)` group with persistent shell (Sidebar role-menus, Topbar w/ notifications badge + AI link): `dashboard`, `attendance` (+`corrections`), `leave`, `employees` (+`[id]`), `payroll`, `settings`, `ai`, `announcements`, `notifications`, `audit`.
- Redux: `sessionSlice` (user, settings), `uiSlice` (toasts).
- Shared components: DataTable (sort/paginate client-side), Modal, Badge/StatusPill, StatCard, PageHeader, CheckInCard (camera + GPS flow), Toasts.
- Camera: `getUserMedia` + `FaceDetector` API when available, brightness-variance fallback; single-frame capture → face count check client-side; coordinates + accuracy sent with check-in.
- Payslip PDF: `jspdf` client-side from payslip JSON (company header, earnings/deductions table, net).
- Theme: Tailwind 4 `@theme` tokens — zinc-950 canvas, indigo accent, emerald/amber/rose status colors.

## 7. Error contract

`{error: {code, message, details?}}` with codes: `UNAUTHORIZED 401`, `FORBIDDEN 403`, `NOT_FOUND 404`, `CONFLICT 409` (duplicate check-in), `UNPROCESSABLE 422` (leave overlap/quota, validation), `LOCKED 409` (payroll), `RATE_LIMITED 429`, `TIMEOUT 504`. Zod issues surfaced as 422 details.

## 8. Verification plan (maps to tasks.md §9)

1. `npm run build` clean; dev server boots.
2. Browser walkthrough: setup → login admin → settings → HR user → HR: employee + CSV dry-run (bad rows flagged) → employee logins with temp password → check-in/out (camera+GPS) → duplicate 409 → corrections flow → leave apply/overlap 422/smart-leave → HR approve → payroll draft → admin finalize (locked) → payslip PDF → dashboards KPIs → announcements/notifications/audit → AI chat each role incl. peer-salary rejection.
3. `npm run lint` clean.
