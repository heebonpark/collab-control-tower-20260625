-- 업무 구분(카테고리)/세부업무를 코드에 하드코딩된 상수에서 DB로 옮긴다.
-- 마스터(관리자)가 화면에서 "회선관리" 같은 새 구분과 세부업무를 추가할 수 있게 하기 위함.

create table if not exists categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#3851D6',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists category_items (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references categories(id) on delete cascade,
  name text not null,
  cycle text[] not null default '{}',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

alter table categories enable row level security;
alter table category_items enable row level security;

create policy "allow all - categories" on categories for all using (true) with check (true);
create policy "allow all - category_items" on category_items for all using (true) with check (true);

do $$
declare
  t text;
begin
  foreach t in array array['categories', 'category_items'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- 기존 코드에 하드코딩되어 있던 4개 구분 + 세부업무를 그대로 이전
do $$
declare
  cat_install uuid;
  cat_rate uuid;
  cat_vehicle uuid;
  cat_goods uuid;
begin
  insert into categories (name, color, sort_order) values ('설치공사', '#3851D6', 0) returning id into cat_install;
  insert into categories (name, color, sort_order) values ('설변징수율', '#1FA67A', 1) returning id into cat_rate;
  insert into categories (name, color, sort_order) values ('차량', '#9B5DE5', 2) returning id into cat_vehicle;
  insert into categories (name, color, sort_order) values ('물품', '#C28E1F', 3) returning id into cat_goods;

  insert into category_items (category_id, name, cycle, sort_order) values
    (cat_install, '설치공사 일반공사, 입찰공사 SIMS 배정업무', array['매일'], 0),
    (cat_install, '설치공사팀 정보 수정 관리', array['상시'], 1),
    (cat_install, '지사 공사팀 섭외 요청건 지원', array['상시'], 2),
    (cat_install, '설치공사비 정산', array['월마감'], 3),
    (cat_install, '고ARPU 사전검토 및 설변시설 검도 승인', array['상시'], 4),
    (cat_install, 'i형 영상 난공사 검증', array['월3회'], 5),
    (cat_install, 'AS 및 공사현장 안전검검 일일보고', array['매일', '월마감'], 6),
    (cat_rate, '일일 실적 공유', array['매일'], 0),
    (cat_rate, '미징수 확인 및 독려', array['매일'], 1),
    (cat_vehicle, '차량 월 마감 업무(과태료 등)', array['월마감'], 0),
    (cat_vehicle, '이륜차 청결유지비 지급', array['월마감'], 1),
    (cat_vehicle, '차량사고 보고(출동서비스팀 회신)', array['상시'], 2),
    (cat_goods, '지사 요청 물품 신청(운영혁신팀, 자산관리팀 등)', array['상시'], 0),
    (cat_goods, '직영공사자재, 유지보수 공구 등', array['분기별'], 1);
end $$;
