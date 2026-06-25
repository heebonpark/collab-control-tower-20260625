-- 비밀번호 해싱 + 컬럼 단위 권한 제한
-- Supabase SQL Editor에서 0001_init.sql 다음에 이 파일 전체를 실행하세요.
--
-- 지금까지는 password 컬럼이 평문으로 저장되고, anon key로 테이블 전체를
-- select/insert/update 할 수 있어 비밀번호가 그대로 클라이언트에 노출됐습니다.
-- 이 마이그레이션은:
--   1) 기존 평문 비밀번호를 bcrypt 해시로 변환
--   2) anon/authenticated 권한에서 password 컬럼 자체를 select/insert/update 못하게 차단
--   3) 로그인 검증/계정 생성/비밀번호 재설정을 SECURITY DEFINER 함수로만 가능하게 함
--      (이 함수들은 테이블 소유자 권한으로 실행되어 컬럼 제한을 우회합니다)

update accounts set password = crypt(password, gen_salt('bf'))
  where password not like '$2a$%' and password not like '$2b$%';
update admins set password = crypt(password, gen_salt('bf'))
  where password not like '$2a$%' and password not like '$2b$%';

revoke select, insert, update on accounts from anon, authenticated;
revoke select, insert, update on admins from anon, authenticated;

grant select (id, "group", unit_id, role, name, email, phone, created_at) on accounts to anon, authenticated;
grant insert ("group", unit_id, role, name, email, phone) on accounts to anon, authenticated;
grant update ("group", unit_id, role, name, email, phone) on accounts to anon, authenticated;

grant select (id, name, email, phone, created_at) on admins to anon, authenticated;

create or replace function verify_staff_login(p_account_id uuid, p_password text)
returns table (id uuid, "group" text, unit_id text, role text, name text, email text, phone text)
language sql security definer set search_path = public, extensions as $$
  select a.id, a."group", a.unit_id, a.role, a.name, a.email, a.phone
  from accounts a
  where a.id = p_account_id and a.password = crypt(p_password, a.password);
$$;

create or replace function verify_admin_login(p_admin_id uuid, p_password text)
returns table (id uuid, name text, email text, phone text)
language sql security definer set search_path = public, extensions as $$
  select m.id, m.name, m.email, m.phone
  from admins m
  where m.id = p_admin_id and m.password = crypt(p_password, m.password);
$$;

create or replace function create_account(
  p_group text, p_unit_id text, p_role text, p_name text, p_email text, p_phone text, p_password text
)
returns table (id uuid, "group" text, unit_id text, role text, name text, email text, phone text, created_at timestamptz)
language plpgsql security definer set search_path = public, extensions as $$
declare new_id uuid;
begin
  insert into accounts ("group", unit_id, role, name, email, phone, password)
  values (p_group, p_unit_id, p_role, p_name, p_email, p_phone, crypt(p_password, gen_salt('bf')))
  returning accounts.id into new_id;
  return query select a.id, a."group", a.unit_id, a.role, a.name, a.email, a.phone, a.created_at from accounts a where a.id = new_id;
end;
$$;

create or replace function set_account_password(p_account_id uuid, p_password text)
returns void
language sql security definer set search_path = public, extensions as $$
  update accounts set password = crypt(p_password, gen_salt('bf')) where id = p_account_id;
$$;

grant execute on function verify_staff_login(uuid, text) to anon, authenticated;
grant execute on function verify_admin_login(uuid, text) to anon, authenticated;
grant execute on function create_account(text, text, text, text, text, text, text) to anon, authenticated;
grant execute on function set_account_password(uuid, text) to anon, authenticated;
