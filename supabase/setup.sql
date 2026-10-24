-- =====================================================================
-- 과학 탐구 프로젝트 · Supabase 데이터베이스 설정
-- ---------------------------------------------------------------------
-- 사용법: Supabase 대시보드 → SQL Editor → 이 파일 전체를 붙여넣고 Run.
--        여러 번 실행해도 안전합니다(이미 있는 것은 건너뜀).
--        맨 아래 [7] 교사 이메일 부분만 본인 이메일로 바꿔서 실행하세요.
-- =====================================================================

-- [1] 교사 명단 ---------------------------------------------------------
create table if not exists public.teachers (
    email text primary key,
    created_at timestamptz not null default now()
);
alter table public.teachers enable row level security;
-- (teachers 표에는 정책이 없으므로 학생은 읽을 수 없고, 아래 함수만 확인용으로 읽습니다)

create or replace function public.is_teacher()
returns boolean
language sql stable security definer set search_path = public
as $$
    select exists (
        select 1 from public.teachers
        where lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

-- [2] 모둠 ---------------------------------------------------------------
-- state: 학생들이 입력한 모든 내용(변인 설정, 가설, 기록표, 그래프 선택, 결론 등)
create table if not exists public.teams (
    id uuid primary key default gen_random_uuid(),
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
    unique (grade, class_no, team_no)
);

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
grant execute on function public.patch_team_state(uuid, jsonb) to anon, authenticated;
grant execute on function public.advance_team_stage(uuid, int) to anon, authenticated;
grant execute on function public.set_team_theme(uuid, text, jsonb) to anon, authenticated;
grant execute on function public.is_teacher() to anon, authenticated;

-- [5] 보안 정책 (RLS) ---------------------------------------------------
alter table public.teams enable row level security;
alter table public.messages enable row level security;

-- 모둠: 누구나 읽기 가능(학생이 모둠을 고르고 실시간으로 받기 위해), 만들기·고치기·지우기는 교사만
drop policy if exists "teams_read_all" on public.teams;
drop policy if exists "teams_teacher_insert" on public.teams;
drop policy if exists "teams_teacher_update" on public.teams;
drop policy if exists "teams_teacher_delete" on public.teams;
create policy "teams_read_all" on public.teams for select to anon, authenticated using (true);
create policy "teams_teacher_insert" on public.teams for insert to authenticated with check (public.is_teacher());
create policy "teams_teacher_update" on public.teams for update to authenticated using (public.is_teacher()) with check (public.is_teacher());
create policy "teams_teacher_delete" on public.teams for delete to authenticated using (public.is_teacher());

-- 메시지: 누구나 읽기 가능, 학생은 AI 대화만 쓸 수 있음, 피드백은 교사만 쓸 수 있음
drop policy if exists "messages_read_all" on public.messages;
drop policy if exists "messages_student_ai" on public.messages;
drop policy if exists "messages_teacher_insert" on public.messages;
drop policy if exists "messages_teacher_delete" on public.messages;
create policy "messages_read_all" on public.messages for select to anon, authenticated using (true);
create policy "messages_student_ai" on public.messages for insert to anon, authenticated
    with check (channel = 'ai' and role in ('student', 'ai'));
create policy "messages_teacher_insert" on public.messages for insert to authenticated with check (public.is_teacher());
create policy "messages_teacher_delete" on public.messages for delete to authenticated using (public.is_teacher());

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
-- 교사가 여러 명이면 한 줄씩 더 추가하면 됩니다.
insert into public.teachers (email) values ('teacher@example.com') on conflict do nothing;
