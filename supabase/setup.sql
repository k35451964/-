-- =====================================================================
-- 과학 탐구 프로젝트 · Supabase 데이터베이스 설정
-- ---------------------------------------------------------------------
-- 사용법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--        여러 번 실행해도 안전합니다(이미 있는 것은 건너뜀).
--        맨 아래 [7] 교사 이메일 부분만 본인 이메일로 바꿔서 실행하세요.
-- =====================================================================

-- [1] 교사 명단 ---------------------------------------------------------
-- 교사마다 고유 id와 6자리 수업 코드(학생 입장 링크용)를 가진다.
create or replace function public.new_teacher_code()
returns text
language plpgsql volatile set search_path = public
as $$
declare
    chars constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';   -- 헷갈리는 0/O, 1/I/L 제외
    c text;
begin
    loop
        c := '';
        for i in 1..6 loop
            c := c || substr(chars, 1 + floor(random() * length(chars))::int, 1);
        end loop;
        exit when not exists (select 1 from public.teachers where code = c);
    end loop;
    return c;
end;
$$;

create table if not exists public.teachers (
    id uuid not null default gen_random_uuid(),
    email text primary key,
    code text not null default public.new_teacher_code(),
    name text,
    created_at timestamptz not null default now()
);
-- (예전 버전에서 업그레이드하는 경우를 위한 보완)
alter table public.teachers add column if not exists id uuid not null default gen_random_uuid();
alter table public.teachers add column if not exists code text;
alter table public.teachers add column if not exists name text;
update public.teachers set code = public.new_teacher_code() where code is null;
alter table public.teachers alter column code set default public.new_teacher_code();
alter table public.teachers alter column code set not null;
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'teachers_id_key') then
        alter table public.teachers add constraint teachers_id_key unique (id);
    end if;
    if not exists (select 1 from pg_constraint where conname = 'teachers_code_key') then
        alter table public.teachers add constraint teachers_code_key unique (code);
    end if;
end;
$$;
alter table public.teachers enable row level security;
-- (teachers 표에는 정책이 없으므로 직접 읽을 수 없고, 아래 함수들로만 필요한 정보를 꺼낸다)

-- 로그인한 교사의 id (교사가 아니면 null)
create or replace function public.my_teacher_id()
returns uuid
language sql stable security definer set search_path = public
as $$
    select id from public.teachers
    where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    limit 1;
$$;

create or replace function public.is_teacher()
returns boolean
language sql stable security definer set search_path = public
as $$
    select public.my_teacher_id() is not null;
$$;

-- 교사 대시보드: 내 수업 코드와 표시 이름
create or replace function public.my_teacher_info()
returns table (id uuid, code text, name text)
language sql stable security definer set search_path = public
as $$
    select t.id, t.code, t.name from public.teachers t where t.id = public.my_teacher_id();
$$;

create or replace function public.set_my_teacher_name(p_name text)
returns void
language sql security definer set search_path = public
as $$
    update public.teachers set name = nullif(left(trim(p_name), 30), '') where id = public.my_teacher_id();
$$;

-- 학생 입장: 수업 코드로 선생님 찾기 (이메일은 알려 주지 않음)
create or replace function public.find_teacher(p_code text)
returns table (id uuid, name text)
language sql stable security definer set search_path = public
as $$
    select t.id, t.name from public.teachers t where t.code = upper(trim(p_code));
$$;

-- [2] 모둠 ---------------------------------------------------------------
-- teacher_id: 이 모둠을 만든 교사 (교사가 모둠을 만들면 자동으로 채워짐)
-- state: 학생들이 입력한 모든 내용(변인 설정, 가설, 기록표, 그래프 선택, 결론 등)
create table if not exists public.teams (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null default public.my_teacher_id() references public.teachers(id) on delete cascade,
    grade smallint not null check (grade between 1 and 6),
    class_no smallint not null check (class_no between 1 and 30),
    team_no smallint not null check (team_no between 1 and 20),
    theme_id text check (theme_id in ('cola', 'osmosis', 'selection', 'vaccine', 'penicillin')),
    stage smallint not null default 0 check (stage between 0 and 5),
    state jsonb not null default '{}'::jsonb,
    -- Supabase 표 화면에서 바로 읽기 편하도록 state에서 자동으로 뽑아 보여 주는 칸
    hypothesis text generated always as (state ->> 'hypothesis') stored,
    validation text generated always as (state ->> 'validation') stored,
    conclusion text generated always as (state ->> 'conclusion') stored,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    constraint teams_teacher_grade_class_team_key unique (teacher_id, grade, class_no, team_no)
);
-- (예전 버전에서 업그레이드하는 경우를 위한 보완: 교사가 정해지지 않은 예전 모둠은 지운다)
alter table public.teams add column if not exists teacher_id uuid;
delete from public.teams where teacher_id is null;
alter table public.teams alter column teacher_id set default public.my_teacher_id();
alter table public.teams alter column teacher_id set not null;
alter table public.teams drop constraint if exists teams_grade_class_no_team_no_key;
do $$
begin
    if not exists (select 1 from pg_constraint where conname = 'teams_teacher_id_fkey') then
        alter table public.teams add constraint teams_teacher_id_fkey
            foreign key (teacher_id) references public.teachers(id) on delete cascade;
    end if;
    if not exists (select 1 from pg_constraint where conname = 'teams_teacher_grade_class_team_key') then
        alter table public.teams add constraint teams_teacher_grade_class_team_key unique (teacher_id, grade, class_no, team_no);
    end if;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql
as $$
begin
    new.updated_at := now();
    return new;
end;
$$;

drop trigger if exists teams_touch_updated_at on public.teams;
create trigger teams_touch_updated_at
    before update on public.teams
    for each row execute function public.touch_updated_at();

-- [3] 메시지 (AI 대화 + 교사 피드백) ------------------------------------
create table if not exists public.messages (
    id bigint generated always as identity primary key,
    team_id uuid not null references public.teams(id) on delete cascade,
    channel text not null check (channel in ('ai', 'feedback')),
    role text not null check (role in ('student', 'ai', 'teacher')),
    content text not null check (char_length(content) between 1 and 4000),
    created_at timestamptz not null default now()
);
create index if not exists messages_team_idx on public.messages (team_id, id);
create index if not exists teams_teacher_idx on public.teams (teacher_id);

-- [4] 학생이 쓰는 함수 (학생은 표를 직접 고칠 수 없고 이 함수들로만 저장) ---
-- 입력 내용 일부를 합쳐 저장 (여러 기기가 동시에 서로 다른 칸을 고쳐도 서로 지우지 않음)
create or replace function public.patch_team_state(p_team_id uuid, p_patch jsonb)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
    if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
        raise exception 'patch must be a JSON object';
    end if;
    if length(p_patch::text) > 20000 then
        raise exception 'patch too large';
    end if;
    update public.teams set state = state || p_patch where id = p_team_id;
    return found;
end;
$$;

-- 진행 단계 올리기 (되돌아가지 않음)
create or replace function public.advance_team_stage(p_team_id uuid, p_stage int)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
    update public.teams
       set stage = greatest(stage, least(greatest(p_stage, 0), 5))
     where id = p_team_id;
    return found;
end;
$$;

-- 테마 고르기 (설계를 전송한 뒤에는 바꿀 수 없음 → 교사가 초기화해야 함)
create or replace function public.set_team_theme(p_team_id uuid, p_theme_id text, p_state jsonb)
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
    if p_theme_id not in ('cola', 'osmosis', 'selection', 'vaccine', 'penicillin') then
        raise exception 'unknown theme';
    end if;
    if p_state is null or jsonb_typeof(p_state) <> 'object' then
        p_state := '{}'::jsonb;
    end if;
    update public.teams
       set theme_id = p_theme_id, state = p_state, stage = 1
     where id = p_team_id
       and coalesce(state ->> 'design.submittedAt', '') = '';
    return found;
end;
$$;

revoke all on function public.patch_team_state(uuid, jsonb) from public;
revoke all on function public.advance_team_stage(uuid, int) from public;
revoke all on function public.set_team_theme(uuid, text, jsonb) from public;
revoke all on function public.is_teacher() from public;
revoke all on function public.my_teacher_id() from public;
revoke all on function public.my_teacher_info() from public;
revoke all on function public.set_my_teacher_name(text) from public;
revoke all on function public.find_teacher(text) from public;
revoke all on function public.new_teacher_code() from public;
grant execute on function public.patch_team_state(uuid, jsonb) to anon, authenticated;
grant execute on function public.advance_team_stage(uuid, int) to anon, authenticated;
grant execute on function public.set_team_theme(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.is_teacher() to anon, authenticated;
grant execute on function public.my_teacher_id() to anon, authenticated;
grant execute on function public.my_teacher_info() to authenticated;
grant execute on function public.set_my_teacher_name(text) to authenticated;
grant execute on function public.find_teacher(text) to anon, authenticated;

-- [5] 보안 정책 (RLS) ---------------------------------------------------
alter table public.teams enable row level security;
alter table public.messages enable row level security;

-- 모둠
--  · 학생(로그인 안 함): 읽기만 가능 (모둠을 고르고 실시간으로 받기 위해). 저장은 [4]의 함수로만.
--  · 교사: 자기가 만든 모둠만 보고, 만들고, 고치고, 지울 수 있음
drop policy if exists "teams_read_all" on public.teams;
drop policy if exists "teams_read_students" on public.teams;
drop policy if exists "teams_read_own" on public.teams;
drop policy if exists "teams_teacher_insert" on public.teams;
drop policy if exists "teams_teacher_update" on public.teams;
drop policy if exists "teams_teacher_delete" on public.teams;
create policy "teams_read_students" on public.teams for select to anon using (true);
create policy "teams_read_own" on public.teams for select to authenticated using (teacher_id = public.my_teacher_id());
create policy "teams_teacher_insert" on public.teams for insert to authenticated with check (teacher_id = public.my_teacher_id());
create policy "teams_teacher_update" on public.teams for update to authenticated
    using (teacher_id = public.my_teacher_id()) with check (teacher_id = public.my_teacher_id());
create policy "teams_teacher_delete" on public.teams for delete to authenticated using (teacher_id = public.my_teacher_id());

-- 메시지
--  · 학생: 읽기 가능, AI 대화만 쓸 수 있음
--  · 교사: 자기 모둠의 메시지만 보고, 피드백을 쓰고, 지울 수 있음
drop policy if exists "messages_read_all" on public.messages;
drop policy if exists "messages_read_students" on public.messages;
drop policy if exists "messages_read_own" on public.messages;
drop policy if exists "messages_student_ai" on public.messages;
drop policy if exists "messages_teacher_insert" on public.messages;
drop policy if exists "messages_teacher_delete" on public.messages;
create policy "messages_read_students" on public.messages for select to anon using (true);
create policy "messages_read_own" on public.messages for select to authenticated
    using (exists (select 1 from public.teams t where t.id = team_id and t.teacher_id = public.my_teacher_id()));
create policy "messages_student_ai" on public.messages for insert to anon, authenticated
    with check (channel = 'ai' and role in ('student', 'ai'));
create policy "messages_teacher_insert" on public.messages for insert to authenticated
    with check (exists (select 1 from public.teams t where t.id = team_id and t.teacher_id = public.my_teacher_id()));
create policy "messages_teacher_delete" on public.messages for delete to authenticated
    using (exists (select 1 from public.teams t where t.id = team_id and t.teacher_id = public.my_teacher_id()));

-- [6] 실시간(Realtime) 켜기 -------------------------------------------
do $$
begin
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'teams') then
        alter publication supabase_realtime add table public.teams;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
        alter publication supabase_realtime add table public.messages;
    end if;
end;
$$;

-- [7] 교사 이메일 등록 ---------------------------------------------------
-- 아래 'teacher@example.com'을 Authentication → Users에서 만든 교사 계정 이메일로 바꾸고 실행하세요.
-- 교사가 여러 명이면 한 줄씩 더 추가하면 됩니다. 교사마다 수업 코드가 자동으로 만들어집니다.
insert into public.teachers (email) values ('teacher@example.com') on conflict do nothing;

-- 내 수업 코드 확인: select email, code, name from public.teachers;
