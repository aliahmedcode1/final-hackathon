-- HCM Lite schema — paste into Supabase SQL Editor and Run (one time).
-- Demo-grade: RLS intentionally disabled; authorization is enforced in the API layer.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  password_hash text not null,
  role text not null check (role in ('admin','hr','employee')),
  employee_id uuid,
  is_active boolean not null default true,
  must_change_pw boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists company_settings (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'My Company',
  address text default '',
  start_time text not null default '09:00',
  grace_minutes int not null default 15,
  halfday_hours numeric not null default 5,
  weekend_days jsonb not null default '[0,6]',
  latitude double precision not null default 0,
  longitude double precision not null default 0,
  radius_m int not null default 200,
  quotas jsonb not null default '{"annual":14,"sick":8,"casual":10}',
  currency text not null default 'PKR',
  setup_done boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table if not exists designations (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table if not exists public_holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  name text not null,
  unique (date)
);

create table if not exists employees (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  first_name text not null,
  last_name text not null default '',
  email text not null,
  phone text default '',
  address text default '',
  department_id uuid,
  designation_id uuid,
  join_date date not null,
  exit_date date,
  status text not null default 'active' check (status in ('active','exited')),
  basic_salary numeric not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  date date not null,
  check_in_at timestamptz not null,
  check_out_at timestamptz,
  status text not null check (status in ('present','late','half_day')),
  worked_hours numeric,
  method text not null default 'web' check (method in ('web','camera')),
  latitude double precision,
  longitude double precision,
  distance_m double precision,
  unique (employee_id, date)
);

create table if not exists attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  attendance_date date not null,
  new_check_in text not null,
  new_check_out text not null,
  reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewed_by text,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null,
  type text not null check (type in ('annual','sick','casual','unpaid')),
  from_date date not null,
  to_date date not null,
  days numeric not null,
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled')),
  decided_by text,
  comment text,
  created_at timestamptz not null default now()
);

create table if not exists payroll_runs (
  id uuid primary key default gen_random_uuid(),
  period text not null unique,
  status text not null default 'draft' check (status in ('draft','locked')),
  totals jsonb not null default '{}',
  created_by text,
  created_at timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz
);

create table if not exists payslips (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  employee_id uuid not null,
  basic numeric not null,
  gross numeric not null,
  absent_days numeric not null default 0,
  unpaid_days numeric not null default 0,
  deductions numeric not null default 0,
  tax numeric not null default 0,
  net numeric not null,
  working_days numeric not null,
  unique (run_id, employee_id)
);

create table if not exists announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  posted_by text,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  title text not null,
  body text default '',
  link text default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_email text not null,
  action text not null,
  entity text not null,
  entity_id text default '',
  detail jsonb default '{}',
  at timestamptz not null default now()
);

create table if not exists ai_usage (
  user_id uuid not null,
  hour_bucket text not null,
  count int not null default 0,
  primary key (user_id, hour_bucket)
);

alter table users enable row level security; -- enabled without policies = blocked for anon;
-- demo shortcut: disable again (API layer enforces real authz)
alter table users disable row level security;
alter table company_settings disable row level security;
alter table departments disable row level security;
alter table designations disable row level security;
alter table public_holidays disable row level security;
alter table employees disable row level security;
alter table attendance disable row level security;
alter table attendance_corrections disable row level security;
alter table leave_requests disable row level security;
alter table payroll_runs disable row level security;
alter table payslips disable row level security;
alter table announcements disable row level security;
alter table notifications disable row level security;
alter table audit_logs disable row level security;
alter table ai_usage disable row level security;
