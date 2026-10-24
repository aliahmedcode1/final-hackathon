# HCM Lite — Software Requirements Specification

Source: `HCM Lite Product Requirement Document.pdf` (Saylani Hackathon, 24 Oct 2026)
Convention: EARS-style ("When/If … the system shall …"). IDs map to PRD §9 feature numbers.
Roles: **A**=Admin, **H**=HR Manager, **E**=Employee.

## M1 — Authentication & RBAC

- FR-01.1 (PRD 01) On a fresh installation with zero users, when any visitor opens the app, the system shall present a first-run setup screen that creates the initial Admin (company profile + admin credentials) and shall reject any later re-run of first-run setup once an admin exists.
- FR-01.2 (PRD 02) The system shall provide login, logout, and change-own-password for all roles, with passwords stored as bcrypt hashes and sessions carried by a JWT in an httpOnly cookie.
- FR-01.3 (PRD 02) The system shall validate role and session server-side on every API route and shall restrict Employees strictly to their own `employee_id` data scope.
- FR-01.4 (PRD 02) Menus and navigation shall be role-based.

## M2 — Org Setup

- FR-02.1 (PRD 03) Admin shall manage company settings: office start time (default 09:00), grace period (15 min), half-day threshold (<5 worked hours), weekend definition, and office geofence (latitude, longitude, radius). HR may view; Employees have no access. Settings apply dynamically to new records.
- FR-02.2 (PRD 04) Admin shall manage departments, designations, leave quotas (defaults Annual 14, Sick 8, Casual 10, Unpaid unlimited) and public holidays. HR may view.
- FR-02.3 (PRD 05) Admin shall create HR logins, and deactivate or reset credentials of any user.

## M3 — Employees

- FR-03.1 (PRD 06) HR shall register employees (which creates a login with a temporary password shown once), and edit employee details; Admin views; Employees edit only their own phone/address.
- FR-03.2 (PRD 07) The system shall provide an employee directory with server-side pagination, search and filters, and a 360° profile (personal info, department, attendance summary, leave history, payslip history) scoped by role.
- FR-03.3 (PRD 08) HR shall bulk-import employees via CSV with a dry-run mode that returns a row/field-level error report, and no partial writes on failure; HR shall export the directory as CSV.

## M4 — Attendance

- FR-04.1 (PRD 09) Employees shall check in and check out from the web app. Check-in creates the single record for the day; a duplicate check-in for the same employee/day shall return 409 Conflict. Time is stamped server-side.
- FR-04.2 (PRD 10) The system shall auto-tag status: Present (check-in ≤ 09:15), Late (> 09:15), Half-day (worked < 5 h), Absent (no record that working day).
- FR-04.3 (PRD 10) The system shall provide a daily attendance board (Admin/HR: everyone; Employee: own) and an attendance calendar (monthly view).
- FR-04.4 (PRD 11) Employees shall submit attendance correction requests; HR shall approve/reject them; when approved, the attendance record is updated; Admin views all corrections.
- FR-04.5 (PRD §8) On camera check-in the client shall reject the frame if 0 or >1 face is detected; it shall reject GPS accuracy worse than 100 m; the server shall recompute Haversine distance and reject check-in outside the configured radius.

## M5 — Leave

- FR-05.1 (PRD 12) Employees shall apply for and cancel their own leave requests, view balances and history; leave days counted shall exclude weekends and public holidays.
- FR-05.2 (PRD 12, §4) Date overlaps with the employee's existing requests, or quota overflow, shall return 422 Unprocessable Entity. Default quotas: Annual 14, Sick 8, Casual 10, Unpaid unlimited.
- FR-05.3 (PRD 13) HR shall approve or reject pending requests with a comment; Admin views decisions. On decision the employee receives an in-app notification.
- FR-05.4 (PRD 21) Smart Leave: any user shall submit natural text ("Need next Mon and Tue off for wedding") and receive a pre-filled leave form (type, from, to, days, reason) for confirmation before submission.

## M6 — Payroll

- FR-06.1 (PRD 14) HR shall configure a salary structure (basic salary) per employee; Admin views.
- FR-06.2 (PRD 15) HR shall generate a monthly payroll draft for a period (YYYY-MM); the draft computes per employee: Gross = 1.5 × Basic; deductions on daily rate for Absent days and approved Unpaid-leave days in the period; progressive annual tax (slabs below); Net = Gross − deductions − tax.
- FR-06.3 (PRD §5) Annualized progressive tax: 0% ≤ 600k; 5% over 600k–1.2M; 30k + 15% over 1.2M–2.4M; 210k + 25% over 2.4M–3.6M; 510k + 35% over 3.6M (PKR).
- FR-06.4 (PRD 16) Admin shall finalize a draft, permanently locking the month; locked runs and their payslips are immutable and a new run for a locked period is rejected.
- FR-06.5 (PRD 17) Payslips shall be viewable per run and downloadable as PDF by all roles (Employees only their own). On finalization employees are notified.

## M7 — Dashboards & KPIs

- FR-07.1 (PRD 18) Role-scoped dashboards: Admin (company KPIs, trends), HR (per-department KPIs), Employee (personal summary).
- FR-07.2 (PRD §7) KPIs computed exactly as:
  - Attendance Rate = (Present + Late + Missing_Checkout + 0.5 × Half_Day) / (Working Days − On Leave)
  - Late % = Late / (Present + Late) × 100
  - Absenteeism = Absent / Expected Working Days × 100
  - Attrition (YTD) = Exits in Period / Average Headcount × 100
- FR-07.3 (PRD 23) Admin/HR shall post announcements; all users read them.
- FR-07.4 (PRD 24) Users shall receive in-app notifications for leave decisions and payslip availability, with unread badge and mark-as-read.
- FR-07.5 (PRD 25) The system shall keep an audit log of administrative actions (settings, users, employees, imports, approvals, payroll) viewable by Admin.

## M8 — AI Assistant

- FR-08.1 (PRD 19) All users shall chat with the assistant at `POST /ai/chat`; the LLM key (if any) lives only on the server; the assistant answers from real system data via structured tool calls: `get_headcount`, `get_attendance_summary`, `get_late_comers`, `get_leave_summary`, `get_my_leave_balance`, `get_payroll_summary`, `search_employees`.
- FR-08.2 (PRD 19) Tool execution enforces identical RBAC as REST endpoints — e.g., salary data of peers is rejected for Employees.
- FR-08.3 (PRD §6) Guardrails: 15 s timeout per request, max 20 requests/user/hour, 1 retry on JSON parse failure, mandatory "AI-generated" tag in UI.
- FR-08.4 (PRD 20) Admin/HR dashboards include an AI analytical summary widget over current KPIs.
- FR-08.5 (PRD 22) The assistant answers policy questions (attendance, leave, payroll rules) from live company settings.

## Non-Functional

- NFR-1 Zero-data start: on first run the database contains no company data; everything is created by in-app user actions.
- NFR-2 The app is a SPA-style client over one REST API; all business rules and permissions enforced server-side with input validation before writes.
- NFR-3 The data layer targets Supabase (Postgres) but degrades transparently to a local file store when Supabase is unreachable so the demo never dies.
- NFR-4 If no LLM key is configured, the assistant runs an offline deterministic engine exposing the same tools and guardrails.
