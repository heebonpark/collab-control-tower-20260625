-- 강북강원본부 협업 관제 시스템 — 초기 스키마
-- Supabase SQL Editor에서 이 파일 전체를 그대로 실행하세요.

create extension if not exists pgcrypto;

create table if not exists accounts (
  id uuid primary key default gen_random_uuid(),
  "group" text not null check ("group" in ('hq', 'branch')),
  unit_id text not null,
  role text not null,
  name text not null,
  email text,
  phone text,
  password text not null,
  created_at timestamptz not null default now()
);

create table if not exists admins (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  password text not null,
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  category_id text not null,
  item_id text not null,
  title text not null,
  cycle text[] not null default '{}',
  unit_id text not null,
  role text not null,
  owner text not null,
  status text not null default 'pending',
  due date,
  priority text not null default 'mid',
  description text,
  requested boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  text text not null,
  by_name text not null,
  by_group text not null,
  kind text,
  created_at timestamptz not null default now()
);

create table if not exists task_attachments (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references tasks(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  file_size int,
  uploaded_by_name text not null,
  uploaded_by_group text not null,
  created_at timestamptz not null default now()
);

create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  text text not null,
  task_id uuid references tasks(id) on delete set null,
  recipient_scope text not null check (recipient_scope in ('all_hq', 'all_admin', 'unit', 'account')),
  recipient_id text,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists sent_links (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  token text not null unique,
  name text not null,
  unit text not null,
  role text not null,
  method text not null,
  task_id uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz
);

-- 내부 협업 도구 전제로 permissive RLS를 사용합니다.
-- Supabase Auth를 쓰지 않고 자체 로그인 로직을 쓰기 때문에 anon key 자체가
-- 이미 클라이언트에 공개되어 있습니다. 외부에 공개되는 SaaS로 전환할 경우
-- 반드시 계정별 정책으로 재검토하세요.
alter table accounts enable row level security;
alter table admins enable row level security;
alter table tasks enable row level security;
alter table task_logs enable row level security;
alter table task_attachments enable row level security;
alter table notifications enable row level security;
alter table sent_links enable row level security;

create policy "allow all - accounts" on accounts for all using (true) with check (true);
create policy "allow all - admins" on admins for all using (true) with check (true);
create policy "allow all - tasks" on tasks for all using (true) with check (true);
create policy "allow all - task_logs" on task_logs for all using (true) with check (true);
create policy "allow all - task_attachments" on task_attachments for all using (true) with check (true);
create policy "allow all - notifications" on notifications for all using (true) with check (true);
create policy "allow all - sent_links" on sent_links for all using (true) with check (true);

-- 여러 사용자가 실시간으로 같은 화면을 보도록 Realtime publication에 추가.
-- 이미 추가되어 있으면 에러가 나므로 존재 여부를 먼저 확인합니다.
do $$
declare
  t text;
begin
  foreach t in array array['tasks', 'task_logs', 'notifications', 'task_attachments', 'sent_links'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- 데모 시드 데이터 (기존 collab_control_tower.jsx의 seedAccounts/seedAdmins와 동일)
insert into accounts ("group", unit_id, role, name, email, phone, password) values
  ('hq', 'hq-gbgw', '본부담당', '한소율', 'hsy@gbgw.co.kr', '010-1111-2222', '1234'),
  ('hq', 'hq-gbgw', '본부담당', '임도현', 'idh@gbgw.co.kr', '010-1111-3333', '1234'),
  ('branch', 'br-jungang', '지사장', '이서연', 'lsy@gbgw.co.kr', '010-2222-1111', '1234'),
  ('branch', 'br-jungang', '지사담당', '김민재', 'kmj@gbgw.co.kr', '010-2222-2222', '1234'),
  ('branch', 'br-gangbuk', '지사담당', '김도윤', 'kdy@gbgw.co.kr', '010-3333-1111', '1234'),
  ('branch', 'br-gangbuk', '영업팀장', '오하늘', 'ohn@gbgw.co.kr', '010-3333-2222', '1234'),
  ('branch', 'br-seodaemun', '영업팀장', '송하윤', 'shy@gbgw.co.kr', '010-4444-1111', '1234'),
  ('branch', 'br-goyang', '지사담당', '조은우', 'jeu@gbgw.co.kr', '010-5555-1111', '1234'),
  ('branch', 'br-uijeongbu', '고객팀장', '윤서아', 'ysa@gbgw.co.kr', '010-6666-1111', '1234'),
  ('branch', 'br-namyangju', '고객팀장', '강유진', 'kyj@gbgw.co.kr', '010-7777-1111', '1234'),
  ('branch', 'br-gangneung', '지사장', '정하은', 'jhe@gbgw.co.kr', '010-8888-1111', '1234'),
  ('branch', 'br-wonju', '영업팀장', '박지훈', 'pjh@gbgw.co.kr', '010-9999-1111', '1234')
on conflict do nothing;

insert into admins (name, email, phone, password) values
  ('최관리', 'admin@gbgw.co.kr', '010-0000-0000', 'admin123')
on conflict do nothing;

-- Storage 버킷은 SQL로 만들 수 없으므로 대시보드에서 직접 생성하세요:
-- Storage → New bucket → 이름 "task-attachments" → Public bucket 체크 해제(비공개) → Create
