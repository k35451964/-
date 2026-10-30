// ==========================================
// 학생 화면
// ------------------------------------------
// 모든 입력값은 Supabase teams.state에 자동 저장되고,
// 같은 모둠으로 접속한 기기들에 실시간으로 반영된다.
// ==========================================
const DEVICE_ID = Math.random().toString(36).slice(2, 10);

let roster = [];
let team = null;            // 현재 모둠 (teams 테이블의 한 줄)
let state = {};             // 모둠이 함께 쓰는 입력 상태 (teams.state)
let messages = [];          // AI 대화 + 선생님 피드백
let viewStage = 0;          // 이 기기가 보고 있는 단계
let me = { name: '', role: '' };     // 이 기기를 쓰는 학생의 이름·역할
let teacherMode = false;    // 교사 보기 모드 (모든 단계 자유 이동, 역할 제한 없음)
let onlineMembers = [];

const pending = {};         // 아직 서버에 보내지 않은 변경
const inflight = {};        // 서버로 보냈지만 아직 실시간 확인(echo)이 오지 않은 값 (내 입력이 옛 값으로 되돌려지지 않게)
let flushTimer = null;
let flushing = false;
let teamChannel = null;
let presenceChannel = null;
let subscribedOnce = false;

const charts = {};
let measureTarget = 'ctrl';
let memIndex = null;
let busyTicker = null;
const busySeenAt = {};
let lastDeviceHtml = '';
let lastSceneHtml = '';
let lastSummaryMetric = null;
// 측정 애니메이션 시간: 첫 측정은 실험 장면을 길게, 그다음부터는 짧게
const MEASURE_TIME = { long: { phase1: 2200, total: 4300 }, short: { phase1: 1000, total: 2500 } };
const busyTiming = b => (b && b.long ? MEASURE_TIME.long : MEASURE_TIME.short);
let aiThinking = false;
const newsImageCache = {};

const $ = id => document.getElementById(id);
const theme = () => THEMES[team.theme_id];

function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 저장 공간을 못 쓰는 환경 */ }
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(el => el.classList.toggle('active', el.id === screenId));
}

// ==========================================
// 입장 (학년·반·모둠 선택)
// ==========================================
function setIntroMsg(text, isError = false) {
    const el = $('intro-msg');
    el.textContent = text;
    el.classList.toggle('error', isError);
}

// ---------- 수업 코드 → 선생님 찾기 ----------
let currentTeacher = null;     // { id, name, code }

function initIntro() {
    fillRoleSelect($('member-role'));
    $('member-name').value = storageGet('memberName') || '';
    $('member-role').value = storageGet('memberRole') || '';
    showRoleDuty();
    $('member-role').onchange = showRoleDuty;
    if (TEACHER_VIEW_REQUESTED && !teacherMode && !initIntro.triedTeacher) {
        initIntro.triedTeacher = true;
        tryTeacherView();
        return;
    }
    const fromUrl = new URLSearchParams(location.search).get('t');
    const code = (fromUrl || storageGet('lastCode') || '').trim().toUpperCase();
    if (code) loadTeacher(code);
    else showCodeBox();
}

function fillRoleSelect(select) {
    select.innerHTML = '<option value="">-- 역할 선택 --</option>'
        + ROLES.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
}

function showRoleDuty() {
    const r = ROLES.find(x => x.id === $('member-role').value);
    $('role-duty').textContent = r ? `${r.name}: ${r.duty} 담당` : '';
}

// 교사가 대시보드에서 '학생 화면으로 보기'를 눌러 들어온 경우
async function tryTeacherView() {
    const params = new URLSearchParams(location.search);
    setIntroMsg('교사 계정을 확인하는 중...');
    const { data: ok } = await sb.rpc('is_teacher');
    if (!ok) {
        setIntroMsg('교사 로그인 정보가 없어서 학생 화면으로 들어갑니다.');
        history.replaceState(null, '', `${location.pathname}${params.get('t') ? `?t=${params.get('t')}` : ''}`);
        initIntro();
        return;
    }
    teacherMode = true;
    me = { name: '선생님', role: 'teacher' };
    $('teacher-banner').hidden = false;
    document.body.classList.add('teacher-mode');
    await enterTeamById(params.get('team'));
}

function showCodeBox(message = '', isError = false) {
    currentTeacher = null;
    $('code-box').hidden = false;
    $('team-pick').hidden = true;
    $('enter-btn').hidden = true;
    setIntroMsg(message || '선생님께 받은 링크로 들어오거나, 6자리 수업 코드를 입력하세요.', isError);
    $('code-input').focus();
}

function submitCode() {
    const code = $('code-input').value.trim().toUpperCase();
    if (code.length !== 6) {
        setIntroMsg('수업 코드 6자리를 입력해 주세요.', true);
        return;
    }
    loadTeacher(code);
}

function changeCode() {
    storageSet('lastCode', '');
    history.replaceState(null, '', location.pathname);
    $('code-input').value = '';
    showCodeBox();
}

async function loadTeacher(code) {
    setIntroMsg('수업을 찾는 중...');
    const { data, error } = await sb.rpc('find_teacher', { p_code: code });
    if (error) {
        console.error('수업 찾기 오류:', error);
        $('code-input').value = code;
        showCodeBox('수업 정보를 불러오지 못했어요. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.', true);
        return;
    }
    const found = Array.isArray(data) ? data[0] : data;
    if (!found) {
        storageSet('lastCode', '');
        $('code-input').value = code;
        showCodeBox(`'${code}' 수업을 찾을 수 없어요. 코드를 다시 확인해 주세요.`, true);
        return;
    }
    currentTeacher = { id: found.id, name: found.name, code };
    storageSet('lastCode', code);
    // 새로고침해도 같은 수업으로 들어오도록 주소에 코드를 남긴다
    history.replaceState(null, '', `${location.pathname}?t=${code}`);
    $('code-box').hidden = true;
    $('team-pick').hidden = false;
    $('teacher-line').innerHTML = `👩‍🏫 <b>${escapeHtml(found.name ? `${found.name} 선생님` : '선생님')}</b>의 수업 <span class="muted">(코드 ${code})</span>
        <button class="link-btn" onclick="changeCode()">다른 수업 코드 입력</button>`;
    loadRoster();
}

async function loadRoster() {
    if (!currentTeacher) { initIntro(); return; }
    setIntroMsg('모둠 목록을 불러오는 중...');
    $('enter-btn').hidden = false;
    $('enter-btn').disabled = true;
    const { data, error } = await sb.from('teams')
        .select('id, grade, class_no, team_no, theme_id, stage')
        .eq('teacher_id', currentTeacher.id)
        .order('grade').order('class_no').order('team_no');
    if (error) {
        console.error('모둠 목록 오류:', error);
        setIntroMsg('모둠 목록을 불러오지 못했어요. 인터넷 연결을 확인한 뒤 새로고침 해 주세요.', true);
        return;
    }
    roster = data || [];
    if (!roster.length) {
        ['grade-select', 'class-select', 'team-select'].forEach(id => { $(id).innerHTML = ''; });
        setIntroMsg('아직 선생님이 모둠을 만들지 않았어요. 잠시 후 새로고침 해 주세요.');
        return;
    }
    setIntroMsg('');
    const last = roster.find(t => t.id === storageGet('lastTeamId'));
    const grades = [...new Set(roster.map(t => t.grade))];
    $('grade-select').innerHTML = grades.map(g => `<option value="${g}">${g}학년</option>`).join('');
    if (last) $('grade-select').value = last.grade;
    onGradeChange(last);
    $('enter-btn').disabled = false;
}

function onGradeChange(preset) {
    const g = Number($('grade-select').value);
    const classes = [...new Set(roster.filter(t => t.grade === g).map(t => t.class_no))];
    $('class-select').innerHTML = classes.map(c => `<option value="${c}">${c}반</option>`).join('');
    if (preset && preset.grade === g) $('class-select').value = preset.class_no;
    onClassChange(preset);
}

function onClassChange(preset) {
    const g = Number($('grade-select').value);
    const c = Number($('class-select').value);
    const teams = roster.filter(t => t.grade === g && t.class_no === c);
    $('team-select').innerHTML = teams.map(t => {
        const th = t.theme_id ? THEMES[t.theme_id] : null;
        return `<option value="${t.id}">${t.team_no}조${th ? ` · ${th.icon} ${th.title}` : ''}</option>`;
    }).join('');
    if (preset && teams.some(t => t.id === preset.id)) $('team-select').value = preset.id;
}

async function enterTeam() {
    const id = $('team-select').value;
    if (!id) return;
    const name = $('member-name').value.trim();
    const role = $('member-role').value;
    if (!name || !role) {
        setIntroMsg('이름을 쓰고 역할을 골라 주세요.', true);
        return;
    }
    me = { name, role };
    storageSet('memberName', name);
    storageSet('memberRole', role);
    await enterTeamById(id);
}

async function enterTeamById(id) {
    if (!id) { setIntroMsg('모둠 정보가 없어요.', true); return; }
    $('enter-btn').disabled = true;
    setIntroMsg('입장하는 중...');
    const { data, error } = await sb.from('teams').select('*').eq('id', id).single();
    $('enter-btn').disabled = false;
    if (error || !data) {
        console.error('입장 오류:', error);
        setIntroMsg('모둠 정보를 불러오지 못했어요. 다시 시도해 주세요.', true);
        return;
    }
    storageSet('lastTeamId', id);
    setIntroMsg('');
    resetLocalSync();
    team = data;
    state = { ...(data.state || {}) };
    $('topbar').hidden = false;
    $('feedback-fab').hidden = false;
    $('team-badge').textContent = teamLabel(team);
    renderMeBadge();
    setSaveStatus('saved');
    subscribeTeam();
    joinPresence();
    await loadMessages();
    openTeamView();
}

async function leaveTeam() {
    await flush();
    if (teamChannel) sb.removeChannel(teamChannel);
    if (presenceChannel) sb.removeChannel(presenceChannel);
    teamChannel = presenceChannel = null;
    team = null;
    state = {};
    messages = [];
    viewStage = 0;
    resetLocalSync();
    destroyAllCharts();
    ['topbar', 'stepper', 'feedback-fab', 'feedback-panel', 'members-pop'].forEach(id => { $(id).hidden = true; });
    showScreen('intro-screen');
    if (teacherMode) {
        // 교사 보기 모드에서 나가면 창을 닫는다 (대시보드에서 연 새 창)
        window.close();
        teacherMode = false;
        $('teacher-banner').hidden = true;
        document.body.classList.remove('teacher-mode');
        history.replaceState(null, '', location.pathname);
        initIntro();
        return;
    }
    loadRoster();
}

function openTeamView() {
    updateThemeBadge();
    if (!team.theme_id) {
        showThemeScreen();
        return;
    }
    buildThemeUI();
    goToStage(Math.max(1, team.stage));
}

function updateThemeBadge() {
    $('theme-badge').textContent = team.theme_id ? `${THEMES[team.theme_id].icon} ${THEMES[team.theme_id].title}` : '테마 선택 전';
}

// ==========================================
// 실시간 동기화 (Supabase)
// ==========================================
function subscribeTeam() {
    subscribedOnce = false;
    teamChannel = sb.channel(`team-${team.id}`)
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'teams', filter: `id=eq.${team.id}` }, payload => onTeamRow(payload.new))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `team_id=eq.${team.id}` }, payload => onMessage(payload.new))
        .subscribe(status => {
            if (status === 'SUBSCRIBED') {
                // 연결이 끊겼다 다시 이어진 경우, 그사이 바뀐 내용을 다시 받아 온다
                if (subscribedOnce) resync();
                subscribedOnce = true;
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
                setSaveStatus('offline');
            }
        });
}

function joinPresence() {
    presenceChannel = sb.channel('online', { config: { presence: { key: DEVICE_ID } } });
    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            if (!team) return;
            const st = presenceChannel.presenceState();
            onlineMembers = Object.values(st)
                .map(list => list.find(p => p.team_id === team.id))
                .filter(p => p && p.role === 'student');
            $('online-badge').textContent = `👥 ${onlineMembers.length}명 접속 중`;
            if (!$('members-pop').hidden) renderMembers();
        })
        .subscribe(async status => {
            if (status === 'SUBSCRIBED' && team) await trackPresence();
        });
}

function trackPresence() {
    if (!presenceChannel || !team) return;
    return presenceChannel.track({
        team_id: team.id,
        role: teacherMode ? 'teacher' : 'student',
        name: me.name,
        job: me.role
    });
}

// ---------- 모둠원 이름·역할 ----------
function renderMeBadge() {
    $('me-badge').textContent = teacherMode ? '👩‍🏫 선생님' : `🙋 ${me.name} · ${roleName(me.role)}`;
    $('me-badge').disabled = teacherMode;
}

function toggleMembers() {
    const pop = $('members-pop');
    pop.hidden = !pop.hidden;
    if (!pop.hidden) renderMembers();
}

function renderMembers() {
    const byRole = ROLES.map(r => {
        const people = onlineMembers.filter(m => m.job === r.id).map(m => escapeHtml(m.name));
        return `<li class="${people.length ? '' : 'empty'}"><b>${r.name}</b><span>${people.length ? people.join(', ') : '비어 있음'}</span></li>`;
    }).join('');
    $('members-pop').innerHTML = `<div class="members-head">지금 접속한 모둠원 <button class="icon-btn" onclick="toggleMembers()" aria-label="닫기">✕</button></div>
        <ul>${byRole}</ul><p class="hint">각 단계의 제출 버튼은 담당 역할과 연구 책임자만 누를 수 있어요.</p>`;
}

function openMemberModal() {
    if (teacherMode) return;
    fillRoleSelect($('member-role-edit'));
    $('member-name-edit').value = me.name;
    $('member-role-edit').value = me.role;
    $('member-modal').hidden = false;
}

function closeMemberModal() {
    $('member-modal').hidden = true;
}

function saveMember() {
    const name = $('member-name-edit').value.trim();
    const role = $('member-role-edit').value;
    if (!name || !role) { alert('이름을 쓰고 역할을 골라 주세요.'); return; }
    me = { name, role };
    storageSet('memberName', name);
    storageSet('memberRole', role);
    renderMeBadge();
    trackPresence();
    closeMemberModal();
    refreshAll();
}

// 이 단계의 제출 버튼을 누를 수 있는지 (담당 역할 + 연구 책임자, 교사 보기 모드는 항상 가능)
function canSubmit(stageKey) {
    return teacherMode || me.role === 'leader' || STAGE_SUBMITTERS[stageKey].includes(me.role);
}

function whoAmI() {
    return teacherMode ? '선생님' : `${me.name}(${roleName(me.role)})`;
}

// 역할 제한이 있는 제출 버튼과 안내 문구를 함께 갱신
function gateButton(btnId, noteId, stageKey, extraDisabled = false) {
    const allowed = canSubmit(stageKey);
    $(btnId).disabled = extraDisabled || !allowed;
    $(noteId).textContent = allowed ? '' : `🔒 이 단계의 제출은 ${submitterNames(stageKey)}가 해요. (나: ${roleName(me.role)})`;
}

async function resync() {
    if (!team) return;
    const { data } = await sb.from('teams').select('*').eq('id', team.id).maybeSingle();
    if (data) onTeamRow(data);
    else if (team) teamGone();
    await loadMessages();
}

document.addEventListener('visibilitychange', () => {
    // 휴대폰 화면이 꺼졌다 켜지면 최신 내용을 다시 받아 온다
    if (document.visibilityState === 'visible' && team) resync();
});
window.addEventListener('pagehide', () => { flush(); });

function resetLocalSync() {
    Object.keys(pending).forEach(k => delete pending[k]);
    Object.keys(inflight).forEach(k => delete inflight[k]);
    clearTimeout(flushTimer);
    flushTimer = null;
}

function teamGone() {
    alert('선생님이 이 모둠을 삭제했어요. 처음 화면으로 돌아갑니다.');
    leaveTeam();
}

// 서버에서 모둠 정보가 바뀌었을 때 (다른 모둠원의 입력, 선생님의 초기화 등)
function onTeamRow(row) {
    if (!team || row.id !== team.id) return;

    if (row.theme_id !== team.theme_id) {
        resetLocalSync();
        team.theme_id = row.theme_id;
        team.stage = row.stage;
        state = { ...(row.state || {}) };
        destroyAllCharts();
        if (!team.theme_id) toast('선생님이 모둠 활동을 초기화했어요. 테마부터 다시 골라 주세요.', 'warn');
        else toast(`모둠원이 '${THEMES[team.theme_id].title}' 테마를 골랐어요.`);
        openTeamView();
        return;
    }

    const remote = row.state || {};
    const now = Date.now();
    const changed = [];
    const keys = new Set([...Object.keys(remote), ...Object.keys(state)]);
    keys.forEach(k => {
        if (k in pending) return;
        const remoteJson = JSON.stringify(remote[k]);
        const sent = inflight[k];
        if (sent) {
            // 내가 보낸 값이 반영되기 전에 도착한 옛 값은 무시한다 (다른 모둠원의 이후 수정은 받아들인다)
            if (remoteJson === sent.json || now - sent.at > 4000) delete inflight[k];
            else return;
        }
        if (remoteJson === JSON.stringify(state[k])) return;
        if (remote[k] === undefined) delete state[k];
        else state[k] = remote[k];
        changed.push(k);
    });
    if (changed.length) {
        applyStateToDom(changed);
        scheduleRefresh();
    }

    if (row.stage > team.stage) {
        const prev = Math.max(1, team.stage);
        team.stage = row.stage;
        if (!teacherMode && team.theme_id && viewStage === prev && viewStage < team.stage) {
            toast(`모둠원이 '${STAGES[team.stage - 1].name}' 단계로 이동했어요.`);
            goToStage(team.stage);
        } else {
            renderStepper();
        }
    }
}

function setState(patch, immediate = false) {
    Object.entries(patch).forEach(([k, v]) => {
        state[k] = v;
        pending[k] = v;
    });
    applyStateToDom(Object.keys(patch));
    scheduleRefresh();
    scheduleFlush(immediate ? 0 : 350);
}

function scheduleFlush(delay) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, delay);
    setSaveStatus('saving');
}

async function flush() {
    if (flushing || !team) return;
    const patch = { ...pending };
    const keys = Object.keys(patch);
    if (!keys.length) return;
    const sentAt = Date.now();
    keys.forEach(k => {
        delete pending[k];
        inflight[k] = { json: JSON.stringify(patch[k]), at: sentAt };
    });
    flushing = true;
    const teamId = team.id;
    const { data, error } = await sb.rpc('patch_team_state', { p_team_id: teamId, p_patch: patch });
    flushing = false;
    if (!team || team.id !== teamId) return;
    if (error) {
        console.error('저장 오류:', error);
        keys.forEach(k => {
            if (!(k in pending)) pending[k] = patch[k];
            delete inflight[k];
        });
        setSaveStatus('error');
        clearTimeout(flushTimer);
        flushTimer = setTimeout(flush, 3000);
        return;
    }
    if (data === false) {
        teamGone();
        return;
    }
    if (Object.keys(pending).length) scheduleFlush(0);
    else setSaveStatus('saved');
}

function setSaveStatus(status) {
    const el = $('save-status');
    const map = {
        saving: ['저장 중…', 'pill-saving'],
        saved: ['✔ 저장됨', 'pill-saved'],
        error: ['⚠ 저장 실패 · 재시도 중', 'pill-error'],
        offline: ['⚠ 연결 끊김 · 재연결 중', 'pill-error']
    };
    const [text, cls] = map[status];
    el.textContent = text;
    el.className = `pill ${cls}`;
}

async function saveStage(n, attempt = 0) {
    const { error } = await sb.rpc('advance_team_stage', { p_team_id: team.id, p_stage: n });
    if (error && attempt < 5) setTimeout(() => saveStage(n, attempt + 1), 2000 * (attempt + 1));
}

// 화면 입력 → 상태
document.addEventListener('input', e => {
    const el = e.target;
    if (!el.dataset || !el.dataset.key || el.type === 'radio' || el.tagName === 'SELECT') return;
    setState({ [el.dataset.key]: el.value });
});
document.addEventListener('change', e => {
    const el = e.target;
    if (!el.dataset || !el.dataset.key) return;
    if (el.type === 'radio') {
        if (el.checked) setState({ [el.dataset.key]: el.value }, true);
    } else if (el.tagName === 'SELECT') {
        setState({ [el.dataset.key]: el.value }, true);
    } else if (Object.keys(pending).length) {
        scheduleFlush(0);
    }
});
document.addEventListener('focusout', e => {
    const el = e.target;
    if (el.dataset && el.dataset.key && el.type !== 'radio') setTimeout(() => applyStateToDom([el.dataset.key]), 0);
});

// 상태 → 화면 입력칸 (입력 중인 칸은 건드리지 않는다)
function applyStateToDom(keys) {
    const els = keys
        ? keys.flatMap(k => [...document.querySelectorAll(`[data-key="${k}"]`)])
        : [...document.querySelectorAll('[data-key]')];
    els.forEach(el => {
        const v = state[el.dataset.key];
        if (el.type === 'radio') {
            el.checked = v === el.value;
            return;
        }
        if (el === document.activeElement) return;
        const next = v === undefined || v === null ? '' : String(v);
        if (el.value !== next) el.value = next;
    });
}

let refreshQueued = false;
function scheduleRefresh() {
    if (refreshQueued) return;
    refreshQueued = true;
    // requestAnimationFrame은 백그라운드 탭에서 멈추므로 타이머로 묶어서 다시 그린다
    setTimeout(() => {
        refreshQueued = false;
        refreshAll();
    }, 30);
}

function refreshAll() {
    if (!team || !team.theme_id) return;
    renderStepper();
    $('change-theme-btn').hidden = !!state['design.submittedAt'] || !!state['theme.assigned'];
    gateButton('finish-story-btn', 'story-role-note', 'story');
    refreshDesign();
    refreshExperiment();
    refreshAnalysis();
    if (viewStage === 5) refreshNewspaper();
}

// ==========================================
// 단계 이동
// ==========================================
function renderStepper() {
    const nav = $('stepper');
    if (!team || !team.theme_id) { nav.hidden = true; return; }
    nav.hidden = false;
    const reachedMax = Math.max(1, team.stage);
    nav.innerHTML = STAGES.map(s => {
        const reached = teacherMode || s.no <= reachedMax;
        const cls = [s.no === viewStage ? 'current' : '', s.no < reachedMax ? 'done' : '', reached ? '' : 'locked'].join(' ');
        return `<button class="step ${cls}" ${reached ? `onclick="goToStage(${s.no})"` : 'disabled'}>
            <span class="step-no">${s.no < reachedMax ? '✓' : s.no}</span><span class="step-name">${s.name}</span></button>`;
    }).join('');
}

function goToStage(n) {
    if (!team || !team.theme_id) return;
    n = Math.max(1, Math.min(n, teacherMode ? 5 : Math.max(1, team.stage)));
    viewStage = n;
    showScreen(STAGES[n - 1].screen);
    refreshAll();
    window.scrollTo({ top: 0 });
}

function advance(n) {
    // 교사 보기 모드에서는 화면만 넘기고 모둠의 진행 단계는 바꾸지 않는다
    if (!teacherMode && team.stage < n) {
        team.stage = n;
        saveStage(n);
    }
    goToStage(n);
}

// ==========================================
// 테마 선택
// ==========================================
function finishStory() {
    if (!canSubmit('story')) return;
    if (!(state.problem || '').trim() && !confirm('아직 탐구 문제를 쓰지 않았어요. 그래도 다음 단계로 넘어갈까요?')) return;
    if (!state['story.submittedAt']) setState({ 'story.submittedAt': new Date().toISOString(), 'story.submittedBy': whoAmI() }, true);
    advance(2);
}

function showThemeScreen() {
    if (team.theme_id && state['theme.assigned'] && !teacherMode) {
        alert('선생님이 정해 준 테마예요. 바꾸려면 선생님께 말씀드리세요.');
        return;
    }
    if (team.theme_id && state['design.submittedAt']) {
        alert('설계를 이미 전송해서 테마를 바꿀 수 없어요. 바꾸려면 선생님께 초기화를 요청하세요.');
        return;
    }
    $('theme-cards').innerHTML = THEME_ORDER.map(id => {
        const t = THEMES[id];
        return `<button class="theme-card ${team.theme_id === id ? 'current' : ''}" onclick="chooseTheme('${id}')">
            <span class="theme-icon">${t.icon}</span><b>${t.title}</b><small>${t.teaser}</small></button>`;
    }).join('');
    $('theme-back-btn').hidden = !team.theme_id;
    viewStage = 0;
    showScreen('theme-screen');
    renderStepper();
}

async function chooseTheme(id) {
    if (team.theme_id === id) { goToStage(Math.max(1, team.stage)); return; }
    const msg = team.theme_id
        ? `테마를 '${THEMES[id].title}'(으)로 바꿀까요?\n지금까지 입력한 내용이 모두 지워지고, 모둠원 모두에게 적용돼요.`
        : `'${THEMES[id].title}' 테마로 탐구를 시작할까요?\n모둠원 모두에게 적용돼요.`;
    if (!confirm(msg)) return;
    const init = defaultThemeState(id);
    const { data, error } = await sb.rpc('set_team_theme', { p_team_id: team.id, p_theme_id: id, p_state: init });
    if (error) {
        console.error('테마 저장 오류:', error);
        toast('테마를 저장하지 못했어요. 다시 시도해 주세요.', 'error');
        return;
    }
    if (data === false) {
        alert('모둠원이 이미 설계를 전송해서 테마를 바꿀 수 없어요.');
        resync();
        return;
    }
    resetLocalSync();
    destroyAllCharts();
    team.theme_id = id;
    team.stage = 1;
    state = { ...init };
    openTeamView();
}

// 테마가 정해지면 화면의 테마별 부분을 만든다
function buildThemeUI() {
    const th = theme();
    updateThemeBadge();

    $('story-title').textContent = `${th.icon} ${th.title}`;
    $('story-text').textContent = th.story;
    $('story-visual').innerHTML = th.image
        ? `<img class="story-image" src="${th.image}" alt="${escapeHtml(th.title)} 이야기 그림">`
        : `<div class="comic">${th.comic.map((p, i) => `
            <div class="comic-panel"><span class="comic-no">${i + 1}</span>
                <div class="comic-emoji">${p.emoji}</div><p>${escapeHtml(p.text)}</p></div>`).join('')}</div>`;

    const header = `<div class="var-header"><div>변인 (조건)</div><div>어떻게 할까요?</div><div>구체적인 설정</div></div>`;
    $('dynamic-var-table').innerHTML = header + th.vars.map((v, i) => {
        const opts = '<option value="">-- 선택 --</option>' + v.options.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
        return `
        <div class="var-row" data-row="${i}">
            <div class="var-name">${escapeHtml(v.name)}</div>
            <div class="var-mode">
                <label class="mode-opt"><input type="radio" name="var-${i}" value="manipulated" data-key="var.${i}.mode"><span>다르게 (조작)</span></label>
                <label class="mode-opt"><input type="radio" name="var-${i}" value="controlled" data-key="var.${i}.mode"><span>같게 (통제)</span></label>
            </div>
            <div class="var-values">
                <label class="var-field"><span class="var-field-label" id="ctrl-label-${i}">통제값(공통)</span>
                    <select id="ctrl-var${i}" data-key="var.${i}.ctrl">${opts}</select></label>
                <label class="var-field exp" id="exp-var${i}-container"><span class="var-field-label">실험군(비교)</span>
                    <select id="exp-var${i}" data-key="var.${i}.exp">${opts}</select></label>
            </div>
        </div>`;
    }).join('');

    const m = th.measure;
    $('table-title').textContent = `${m.name} 기록표 (단위: ${m.unit})`;
    $('data-head').innerHTML = '<th>구분</th>' + m.labels.map(l => `<th>${l}</th>`).join('');
    const cells = g => [0, 1, 2, 3, 4].map(i =>
        `<td><input type="number" step="any" inputmode="decimal" class="data-input" id="${g}-${i}" data-key="data.${g}.${i}" aria-label="${g === 'c' ? '대조군' : '실험군'} ${m.labels[i]}"></td>`).join('');
    $('data-row-c').innerHTML = '<td class="row-ctrl" id="data-label-c">대조군</td>' + cells('c');
    $('data-row-e').innerHTML = '<td class="row-exp" id="data-label-e">실험군</td>' + cells('e');

    // AI 추천 질문 + 핵심 가공 데이터 목록 (테마마다 다름)
    const metrics = metricsForTheme(team.theme_id);
    $('ai-prompts').innerHTML = metrics.map(mt =>
        `<button class="ai-prompt-btn" data-prompt="${escapeHtml(mt.prompt)}">💡 ${escapeHtml(mt.name)}</button>`).join('');
    $('ai-prompts').onclick = e => {
        const b = e.target.closest('.ai-prompt-btn');
        if (b) fillAIPrompt(b.dataset.prompt);
    };
    $('metric-list').innerHTML = METRIC_GROUPS.map(g => {
        const list = metrics.filter(mt => mt.group === g.id);
        if (!list.length) return '';
        return `<div class="metric-group"><div class="metric-group-name">${g.name}</div>${list.map(mt => `
            <label class="metric-card"><input type="radio" name="metric" value="${mt.id}" data-key="sum.metric">
                <span class="metric-name">${escapeHtml(mt.name)}</span><span class="metric-desc">${escapeHtml(mt.desc)}</span></label>`).join('')}</div>`;
    }).join('') + `<div class="metric-group"><div class="metric-group-name">직접 정하기</div>
            <label class="metric-card custom"><input type="radio" name="metric" value="custom" data-key="sum.metric">
                <span class="metric-name">✏️ 직접 정한 가공 데이터</span><span class="metric-desc">AI에게 직접 질문해서 구한 값처럼 목록에 없는 데이터 (이름과 모양을 정하고 값을 입력)</span></label></div>`;
    lastSummaryMetric = null;

    memIndex = null;
    lastDeviceHtml = '';
    lastSceneHtml = '';
    applyStateToDom();
}

// ==========================================
// 2. 탐구 설계
// ==========================================
function currentDesignSig() {
    return designSignature(team.theme_id, state) + '|' + composeHypothesis(state) + '|' + composePrediction(state, theme());
}

function isDesignSubmitted() {
    return !!state['design.submittedAt'] && state['design.sig'] === currentDesignSig();
}

// 측정 가능 여부: 설계를 전송했거나, 교사 보기 모드에서 설계에 오류가 없을 때
function canMeasure() {
    return isDesignSubmitted() || (teacherMode && !checkDesign(theme(), state).errors.length);
}

function isDesignLocked() {
    return (state['sim.ctrl'] || 0) > 0 || (state['sim.exp'] || 0) > 0;
}

function refreshDesign() {
    const th = theme();
    th.vars.forEach((v, i) => {
        const manipulated = state[`var.${i}.mode`] === 'manipulated';
        const row = document.querySelector(`.var-row[data-row="${i}"]`);
        if (!row) return;
        row.classList.toggle('manipulated', manipulated);
        $(`exp-var${i}-container`).hidden = !manipulated;
        const mode = state[`var.${i}.mode`];
        $(`ctrl-label-${i}`).textContent = !mode ? '설정값' : manipulated ? '대조군(기준)' : '통제값(공통)';
        row.classList.toggle('undecided', !mode);
    });
    const dep = (state['hypo.dep'] || '').trim();
    $('pred-dep').textContent = dep || '종속 변인 (위 가설에 먼저 써 주세요)';
    $('pred-dep').classList.toggle('empty', !dep);
    const pv = predictionValues(state, th);
    $('pred-b').textContent = pv.b || '대조군 값 (변인 표에서 정하기)';
    $('pred-c').textContent = pv.c || '실험군 값 (변인 표에서 정하기)';
    $('pred-b').classList.toggle('empty', !pv.b);
    $('pred-c').classList.toggle('empty', !pv.c);
    $('pred-preview').textContent = `📝 ${composePrediction(state, th)}`;

    const check = checkDesign(th, state);
    const box = $('design-check');
    if (check.errors.length) {
        box.className = 'design-check error';
        box.innerHTML = check.errors.map(e => `<div>❗ ${escapeHtml(e)}</div>`).join('');
    } else if (check.warnings.length) {
        box.className = 'design-check warn';
        box.innerHTML = check.warnings.map(w => `<div>⚠️ ${escapeHtml(w)} 그래도 진행할 수는 있어요.</div>`).join('');
    } else {
        const n = check.manipulated.length;
        box.className = 'design-check ok';
        box.innerHTML = `<div>✅ 조작 변인 ${n}개, 통제 변인 ${th.vars.length - n}개로 설계했어요.</div>`;
    }

    const locked = isDesignLocked();
    $('design-lock').hidden = !locked;
    document.querySelectorAll('#hypothesis-screen [data-key]').forEach(el => { el.disabled = locked; });

    const submitted = isDesignSubmitted();
    const btn = $('submit-s1-btn');
    btn.classList.toggle('done', submitted);
    if (submitted) {
        btn.textContent = `전송 완료 ✅${state['design.submittedBy'] ? ` (${state['design.submittedBy']})` : ''}`;
        btn.disabled = true;
        $('design-role-note').textContent = '';
    } else {
        btn.textContent = state['design.submittedAt'] ? '📝 수정한 설계 다시 전송하기' : '📝 설계 결과 전송하기';
        gateButton('submit-s1-btn', 'design-role-note', 'design', locked);
    }
    $('next-step-btn').disabled = !submitted && !teacherMode;
}

function submitDesign() {
    const th = theme();
    const check = checkDesign(th, state);
    if (check.errors.length) {
        alert(check.errors.join('\n'));
        return;
    }
    if (!canSubmit('design')) return;
    if (HYPO_KEYS.some(k => !(state[k] || '').trim())) {
        alert('가설 문장의 빈칸을 모두 채워 주세요!');
        return;
    }
    if (PRED_KEYS.some(k => !(state[k] || '').trim())) {
        alert('예측에서 결과가 어떻게 될지(더 클 / 더 작을 / 비슷할) 골라 주세요!');
        return;
    }
    if (check.warnings.length && !confirm(`${check.warnings.join('\n')}\n\n이대로 전송할까요?`)) return;
    setState({
        hypothesis: composeHypothesis(state),
        prediction: composePrediction(state, th),
        'design.submittedAt': new Date().toISOString(),
        'design.submittedBy': whoAmI(),
        'design.sig': currentDesignSig()
    }, true);
    toast('설계 결과를 선생님께 전송했어요! 다음 단계로 넘어갈 수 있어요.', 'success');
}

function resetDesign() {
    if (!confirm('측정 기록, 기록표, 1차 그래프가 모두 지워져요. 설계를 다시 할까요?')) return;
    const patch = { 'sim.ctrl': 0, 'sim.exp': 0, 'sim.busy': null, 'design.submittedAt': null, 'design.sig': null, 'chart1.type': null };
    for (let i = 0; i < 5; i++) {
        patch[`data.c.${i}`] = '';
        patch[`data.e.${i}`] = '';
    }
    memIndex = null;
    setState(patch, true);
}

// ==========================================
// 3. 가상 실험 (계측기) + 기록표 + 1차 그래프
// ==========================================
function refreshExperiment() {
    const th = theme();
    $('sim-design-warning').hidden = canMeasure();
    const cl = groupLabel(th, state, 'ctrl'), el = groupLabel(th, state, 'exp');
    $('target-label-ctrl').textContent = cl;
    $('target-label-exp').textContent = el;
    if ($('data-label-c')) $('data-label-c').textContent = cl;
    if ($('data-label-e')) $('data-label-e').textContent = el;
    gateButton('finish-experiment-btn', 'experiment-role-note', 'experiment');
    const row = (label, cls, items) => `
        <div class="cond-row ${cls}"><b>${label}</b><div class="cond-items">${items.map(it =>
            `<span class="cond ${it.manipulated ? 'manip' : ''}"><small>${escapeHtml(it.name)}</small>${escapeHtml(it.value)}</span>`).join('')}</div></div>`;
    $('sim-conditions').innerHTML = row('대조군', 'ctrl', conditionText(th, state, 'ctrl')) + row('실험군', 'exp', conditionText(th, state, 'exp'));
    renderDevice();
    if (viewStage === 3) renderChart(1);
}

function activeBusy() {
    const b = state['sim.busy'];
    if (!b || !b.id) return null;
    if (!busySeenAt[b.id]) busySeenAt[b.id] = Date.now();
    const elapsed = Date.now() - busySeenAt[b.id];
    if (elapsed > 8000) return null;      // 측정하던 기기가 꺼진 경우
    return { ...b, elapsed };
}

function setMeasureTarget(target) {
    measureTarget = target;
    memIndex = null;
    renderDevice();
}

function renderDevice() {
    const th = theme();
    const target = measureTarget;
    const step = state[`sim.${target}`] || 0;
    const truth = simulate(team.id, team.theme_id, state)[target];
    const conds = getConditions(th, state);
    const { unit, decimals: d, labels } = th.measure;
    const big = text => `${text} <span class="dv-unit">${unit}</span>`;
    const busy = activeBusy();
    const v = { cond: target === 'ctrl' ? conds.ctrl : conds.exp, raw: null, seed: `${team.id}|${target}|${step}` };

    if (busy && busy.target === target) {
        const phase = busy.elapsed < busyTiming(busy).phase1 ? 'busy1' : 'busy2';
        Object.assign(v, {
            phase,
            timeText: `${labels[busy.step]} 시점`,
            valueHtml: `<span class="dv-working">${phase === 'busy1' ? '작동 중...' : '분석 중...'}</span>`,
            msgText: phase === 'busy1' ? '잠시만 기다려 주세요' : '데이터를 처리하고 있습니다'
        });
    } else if (memIndex !== null && memIndex < step) {
        Object.assign(v, {
            phase: 'mem', raw: truth[memIndex], seed: `${team.id}|${target}|${memIndex + 1}`,
            timeText: `지난 기록 ${memIndex + 1}/${step} · ${labels[memIndex]}`,
            valueHtml: big(fmtNum(truth[memIndex], d)),
            msgText: '앞에서 측정했던 값입니다'
        });
    } else if (step === 0) {
        Object.assign(v, { phase: 'idle', timeText: `${labels[0]} 측정 대기`, valueHtml: big('--'), msgText: '버튼을 눌러 측정을 시작하세요' });
    } else if (step < 5) {
        Object.assign(v, {
            phase: 'result', raw: truth[step - 1],
            timeText: `${labels[step - 1]} 측정값 · 다음 ${labels[step]}`,
            valueHtml: big(fmtNum(truth[step - 1], d)),
            msgText: '수치를 표에 기록하고 다음 측정을 진행하세요'
        });
    } else {
        Object.assign(v, {
            phase: 'done', raw: truth[4],
            timeText: `${labels[4]} 측정값 · 측정 완료`,
            valueHtml: big(fmtNum(truth[4], d)),
            msgText: '모든 측정이 끝났습니다'
        });
    }

    const html = DEVICES[th.device](v);
    if (html !== lastDeviceHtml) {       // 같은 화면이면 다시 그리지 않아 애니메이션이 끊기지 않게 한다
        $('dynamic-device-area').innerHTML = html;
        lastDeviceHtml = html;
    }

    // 실험 장면: 측정 중에는 직전 측정 결과까지의 모습을 보여 준다 (값이 미리 드러나지 않게)
    const measuringHere = busy && busy.target === target;
    const labelIndex = measuringHere ? busy.step : v.phase === 'mem' ? memIndex : v.phase === 'idle' ? 0 : step - 1;
    const shownIndex = measuringHere ? busy.step - 1 : v.phase === 'mem' ? memIndex : step - 1;
    const sceneHtml = SCENES[th.device]({
        phase: v.phase,
        cond: v.cond.map(x => Math.max(0, x)),
        label: labels[Math.max(0, Math.min(4, labelIndex))],
        values: truth,
        index: shownIndex,
        long: !!(busy && busy.long)
    });
    if (sceneHtml !== lastSceneHtml) {
        $('scene-area').innerHTML = sceneHtml;
        lastSceneHtml = sceneHtml;
    }

    const btn = $('measure-btn');
    const txt = th.deviceText;
    btn.classList.toggle('busy', !!busy);
    if (busy) {
        btn.disabled = true;
        btn.textContent = busy.target === target ? (busy.elapsed < busyTiming(busy).phase1 ? txt.anim1 : txt.anim2) : '⏳ 모둠원이 다른 집단을 측정 중...';
    } else if (!canMeasure()) {
        btn.disabled = true;
        btn.textContent = '🔒 설계를 전송해야 측정할 수 있어요';
    } else if (step >= 5) {
        btn.disabled = true;
        btn.textContent = `✅ ${target === 'ctrl' ? '대조군' : '실험군'} 측정 완료`;
    } else {
        btn.disabled = false;
        btn.textContent = step === 0 ? txt.btn : txt.nextBtn;
    }
    const mem = $('mem-btn');
    mem.disabled = step === 0 || !!busy;
    mem.textContent = memIndex === null ? '📋 지난 측정값 다시 보기' : (memIndex + 1 < step ? '다음 기록 ▶' : '↩ 지금 화면으로');

    if (busy && !busyTicker) {
        busyTicker = setInterval(() => {
            if (!team || !activeBusy()) {
                clearInterval(busyTicker);
                busyTicker = null;
            }
            if (team && team.theme_id) renderDevice();
        }, 200);
    }
}

function measureData() {
    if (!canMeasure() || activeBusy()) return;
    const target = measureTarget;
    const step = state[`sim.${target}`] || 0;
    if (step >= 5) return;
    memIndex = null;
    const id = Math.random().toString(36).slice(2, 10);
    busySeenAt[id] = Date.now();
    const long = step === 0;
    setState({ 'sim.busy': { id, target, step, long } }, true);
    setTimeout(() => {
        if (!team) return;
        setState({ [`sim.${target}`]: step + 1, 'sim.busy': null }, true);
    }, busyTiming({ long }).total);
}

function showMemory() {
    const step = state[`sim.${measureTarget}`] || 0;
    if (!step) return;
    if (memIndex === null) memIndex = 0;
    else if (memIndex + 1 < step) memIndex++;
    else memIndex = null;
    renderDevice();
}

// ---------- 그래프 ----------
function chooseChart(kind, type) {
    setState({ [`chart${kind}.type`]: type }, true);
    requestAnimationFrame(() => {
        renderChart(kind);
        $(`chart-area-${kind}`).scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
}

function destroyChart(key) {
    if (charts[key]) {
        charts[key].destroy();
        delete charts[key];
    }
}

function destroyAllCharts() {
    Object.keys(charts).forEach(destroyChart);
    Object.keys(newsImageCache).forEach(k => delete newsImageCache[k]);
}

// key: 그래프 인스턴스 이름, kind: 1(로우) / 2(가공)
function drawChartInto(key, kind, canvasId) {
    const type = kind === 1 ? state['chart1.type'] : null;
    const cfg = buildChartConfig(kind, type, theme(), state);
    const existing = charts[key];
    if (existing && existing.config.type === cfg.type) {
        existing.data = cfg.data;
        existing.options = cfg.options;
        existing.update();
    } else {
        destroyChart(key);
        charts[key] = new Chart($(canvasId), cfg);
    }
}

// ---------- 2차 그래프: 핵심 가공 데이터 ----------
function renderSummary() {
    const th = theme();
    const m = resolveMetric(state);
    document.querySelectorAll('.metric-card').forEach(card =>
        card.classList.toggle('selected', card.querySelector('input').value === state['sum.metric']));
    $('metric-input').hidden = !m;
    if (!m) {
        destroyChart(2);
        lastSummaryMetric = null;
        return;
    }
    // 고른 데이터가 바뀌었을 때만 입력 표를 새로 만든다 (입력 중인 칸이 사라지지 않게)
    $('custom-fields').hidden = !m.custom;
    const sig = `${m.id}|${m.group}|${m.name}|${metricUnit(m, th)}|${groupLabel(th, state, 'ctrl')}|${groupLabel(th, state, 'exp')}`;
    if (sig !== lastSummaryMetric) {
        lastSummaryMetric = sig;
        const unit = metricUnit(m, th);
        $('metric-chosen').innerHTML = `<b>${escapeHtml(m.name)}</b> <span class="muted">(단위: ${escapeHtml(unit || '없음')})</span> — ${escapeHtml(m.desc)}`;
        const cols = metricColLabels(m, th);
        $('summary-table').innerHTML = `<thead><tr><th>구분</th>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>`
            + metricRows(m).map(r => `<tr><td class="row-${r === 'e' ? 'exp' : 'ctrl'}">${escapeHtml(metricRowLabel(m, th, state, r))}</td>`
                + cols.map((_, i) => `<td><input type="number" step="any" inputmode="decimal" class="data-input" data-key="${summaryKey(m.id, r, i)}"></td>`).join('')
                + '</tr>').join('') + '</tbody>';
        applyStateToDom(metricRows(m).flatMap(r => cols.map((_, i) => summaryKey(m.id, r, i))));
    }
    // 입력값 확인 (정답은 알려 주지 않고, 다른 칸만 표시)
    const chk = summaryCheck(th, state);
    document.querySelectorAll('#summary-table input').forEach(inp => {
        const st = chk.status[inp.dataset.key];
        inp.classList.toggle('mismatch', st === 'wrong');
        inp.classList.toggle('match', st === 'ok');
    });
    const box = $('summary-check');
    if (m.custom) {
        box.className = 'summary-check';
        box.textContent = '직접 정한 데이터는 자동으로 확인하지 않아요. AI 답변이나 직접 계산한 값과 한 번 더 비교해 보세요.';
    } else if (chk.wrong) {
        box.className = 'summary-check warn';
        box.textContent = `⚠️ 기록표 값으로 계산하면 다른 값이 나오는 칸이 ${chk.wrong}개 있어요(빨간 칸). 계산 방법과 기록표를 다시 확인해 보세요.`;
    } else if (chk.unknown) {
        box.className = 'summary-check';
        box.textContent = '기록표에 빈칸이 있어서 입력한 값이 맞는지 확인할 수 없어요.';
    } else if (!chk.empty) {
        box.className = 'summary-check ok';
        box.textContent = '✅ 기록표 값으로 계산한 결과와 일치해요.';
    } else {
        box.className = 'summary-check';
        box.textContent = 'AI 어시스턴트와 함께 값을 구해서 표를 채워 보자.';
    }
    // 값이 하나라도 있으면 그래프를 자동으로 그린다
    const hasValue = Object.values(chk.entered).some(arr => arr.some(x => x !== null));
    $('chart-area-2').hidden = !hasValue;
    $('chart-why').textContent = hasValue ? summaryChartWhy(state) : '';
    if (hasValue && viewStage === 4) drawChartInto(2, 2, 'resultChart2');
    else if (!hasValue) destroyChart(2);
}

function renderChart(kind) {
    const type = state[`chart${kind}.type`];
    document.querySelectorAll(`.chart-type-container[data-kind="${kind}"] .chart-btn`)
        .forEach(b => b.classList.toggle('active', b.dataset.type === type));
    $(`chart-note-${kind}`).textContent = type ? chartNote(kind, type, state) : '';
    const area = $(`chart-area-${kind}`);
    if (!type) {
        area.hidden = true;
        destroyChart(kind);
        return;
    }
    area.hidden = false;
    drawChartInto(kind, kind, kind === 1 ? 'resultChart1' : 'resultChart2');
}

function finishExperiment() {
    if (!canSubmit('experiment')) return;
    const missing = [];
    if ([...readSeries(state, 'c'), ...readSeries(state, 'e')].some(v => v === null)) missing.push('기록표 빈칸');
    if (!state['chart1.type']) missing.push('1차 그래프');
    if (!(state['reason1.text'] || '').trim()) missing.push('그래프 선택 이유');
    if (missing.length && !confirm(`아직 ${missing.join(', ')}이(가) 완성되지 않았어요.\n그래도 다음 단계로 넘어갈까요?`)) return;
    if (!state['experiment.submittedAt']) setState({ 'experiment.submittedAt': new Date().toISOString(), 'experiment.submittedBy': whoAmI() }, true);
    advance(4);
}

// ==========================================
// 4. 데이터 분석 (AI) + 2차 그래프 + 가설 검증
// ==========================================
function refreshAnalysis() {
    renderSummary();
    if (viewStage === 4) {
        const hasChart1 = !!state['chart1.type'];
        $('ref-chart-area').hidden = !hasChart1;
        $('ref-chart-empty').hidden = hasChart1;
        if (hasChart1) drawChartInto('ref', 1, 'refChart1');
        else destroyChart('ref');
    }
    const th = theme();
    const cl = groupLabel(th, state, 'ctrl'), el = groupLabel(th, state, 'exp');
    $('hypo-recall').textContent = state.hypothesis || composeHypothesis(state);
    $('pred-recall').textContent = state.prediction || composePrediction(state, th);
    $('result-recall').textContent = summaryText(th, state)
        || '(위에서 핵심 가공 데이터를 고르고 값을 입력하면 여기에 표시돼요. 1차 그래프는 위쪽 ‘다시 보기’에서 확인하세요.)';
    $('btn-accept').classList.toggle('selected', state.validation === '수용');
    $('btn-reject').classList.toggle('selected', state.validation === '기각');
    $('val-fields').hidden = !state.validation;
    $('val-accept-fields').hidden = state.validation !== '수용';
    $('val-reject-fields').hidden = state.validation !== '기각';
    gateButton('finish-analysis-btn', 'analysis-role-note', 'analysis');
}

function selectValidation(result) {
    setState({ validation: result }, true);
}

function finishAnalysis() {
    if (!canSubmit('analysis')) return;
    const filled = k => !!(state[k] || '').trim();
    if (!state.validation) { alert('가설 수용 여부를 선택해 주세요!'); return; }
    if (!filled('val.evidence')) { alert('판단 근거를 작성해 주세요!'); return; }
    if (state.validation === '수용' && !filled('conclusion')) { alert('탐구 결론을 작성해 주세요!'); return; }
    if (state.validation === '기각' && (!filled('val.revised') || !filled('val.newPrediction'))) {
        alert('가설 수정 방안과 새로운 예측을 작성해 주세요!');
        return;
    }
    const missing = [];
    const chk = summaryCheck(theme(), state);
    if (!chk) missing.push('핵심 가공 데이터 선택');
    else if (chk.empty) missing.push('핵심 가공 데이터 값');
    else if (chk.wrong && !confirm(`핵심 가공 데이터 중 기록표로 계산한 값과 다른 칸이 ${chk.wrong}개 있어요.\n그래도 제출할까요?`)) return;
    if (missing.length && !confirm(`아직 ${missing.join(', ')}이(가) 완성되지 않았어요.\n그래도 제출할까요?`)) return;
    setState({ 'final.submittedAt': new Date().toISOString(), 'final.submittedBy': whoAmI() }, true);
    advance(5);
    $('tada-overlay').hidden = false;
}

function closeTada() {
    $('tada-overlay').hidden = true;
}

// ---------- AI 어시스턴트 ----------
async function loadMessages() {
    if (!team) return;
    const { data, error } = await sb.from('messages').select('*').eq('team_id', team.id).order('id');
    if (error) {
        console.error('메시지 불러오기 오류:', error);
        return;
    }
    messages = data || [];
    renderChat();
    renderFeedback();
}

function onMessage(m) {
    if (!team || m.team_id !== team.id || messages.some(x => x.id === m.id)) return;
    messages.push(m);
    messages.sort((a, b) => a.id - b.id);
    if (m.channel === 'ai') {
        renderChat();
    } else {
        renderFeedback();
        if (m.role === 'teacher' && $('feedback-panel').hidden) {
            toast(`👩‍🏫 선생님 피드백: ${m.content}`, 'feedback', () => toggleFeedbackPanel(true));
        }
    }
}

function renderChat() {
    const box = $('ai-chat-box');
    const list = messages.filter(m => m.channel === 'ai');
    box.innerHTML = '<div class="bubble ai">안녕하세요! 데이터 분석을 돕는 AI 연구원입니다. 표에 기록된 데이터를 분석해 드릴게요. 어떤 통계값이 필요한가요?</div>'
        + list.map(m => `<div class="bubble ${m.role === 'student' ? 'me' : 'ai'}">${escapeHtml(m.content)}</div>`).join('')
        + (aiThinking ? '<div class="bubble ai typing"><span></span><span></span><span></span></div>' : '');
    box.scrollTop = box.scrollHeight;
}

function fillAIPrompt(text) {
    const input = $('ai-input');
    input.value = text;
    input.focus();
}

async function insertMessage(channel, role, content) {
    const { data, error } = await sb.from('messages').insert({ team_id: team.id, channel, role, content }).select().single();
    if (error) {
        console.error('메시지 저장 오류:', error);
        toast('메시지를 보내지 못했어요. 다시 시도해 주세요.', 'error');
        return null;
    }
    onMessage(data);
    return data;
}

function buildAIContext() {
    const th = theme();
    return {
        themeTitle: th.title,
        measureName: th.measure.name,
        unit: th.measure.unit,
        decimals: th.measure.decimals,
        labels: th.measure.labels,
        ctrl: readSeries(state, 'c'),
        exp: readSeries(state, 'e'),
        hypothesis: `${state.hypothesis || composeHypothesis(state)} / 예측: ${state.prediction || composePrediction(state, th)}`,
        ctrlLabel: groupLabel(th, state, 'ctrl'),
        expLabel: groupLabel(th, state, 'exp'),
        teamId: team.id,
        themeId: team.theme_id,
        ctrlConditions: conditionText(th, state, 'ctrl'),
        expConditions: conditionText(th, state, 'exp')
    };
}

async function askAI() {
    const input = $('ai-input');
    const question = input.value.trim();
    if (!question || aiThinking) return;
    input.value = '';
    const sent = await insertMessage('ai', 'student', question);
    if (!sent) { input.value = question; return; }
    aiThinking = true;
    $('ai-send-btn').disabled = true;
    renderChat();
    let answer;
    try {
        [answer] = await Promise.all([getAIAnswer(question, buildAIContext()), new Promise(r => setTimeout(r, 700))]);
    } catch (e) {
        console.error('AI 오류:', e);
        answer = '죄송해요, 지금은 답변을 만들 수 없어요. 잠시 후 다시 시도해 주세요.';
    }
    aiThinking = false;
    $('ai-send-btn').disabled = false;
    await insertMessage('ai', 'ai', answer);
    renderChat();
}

// ---------- 선생님 피드백 ----------
function renderFeedback() {
    if (!team) return;
    const list = messages.filter(m => m.channel === 'feedback');
    $('feedback-list').innerHTML = list.length
        ? list.map(m => `<div class="fb-item"><div class="fb-meta">👩‍🏫 선생님 · ${new Date(m.created_at).toLocaleString('ko-KR', { hour: '2-digit', minute: '2-digit', month: 'numeric', day: 'numeric' })}</div>
            <div class="fb-text">${escapeHtml(m.content)}</div></div>`).join('')
        : '<p class="hint center">아직 받은 피드백이 없어요.</p>';
    if (!$('feedback-panel').hidden) markFeedbackSeen();
    const seen = Number(storageGet(`seenFeedback:${team.id}`) || 0);
    const unread = list.filter(m => m.id > seen).length;
    $('feedback-badge').hidden = unread === 0;
    $('feedback-badge').textContent = unread;
    $('feedback-fab').classList.toggle('has-unread', unread > 0);
}

function markFeedbackSeen() {
    const list = messages.filter(m => m.channel === 'feedback');
    if (list.length) storageSet(`seenFeedback:${team.id}`, String(list[list.length - 1].id));
    $('feedback-badge').hidden = true;
    $('feedback-fab').classList.remove('has-unread');
}

function toggleFeedbackPanel(force) {
    const open = typeof force === 'boolean' ? force : $('feedback-panel').hidden;
    $('feedback-panel').hidden = !open;
    if (open) {
        markFeedbackSeen();
        const list = $('feedback-list');
        list.scrollTop = list.scrollHeight;
    }
}

// ==========================================
// 5. 과학 신문 (디자인은 추후 개선 예정)
// ==========================================
function newsChartImage(kind) {
    const type = kind === 1 ? state['chart1.type'] : state['sum.metric'];
    if (!type) return '';
    const cfg = buildChartConfig(kind, type, theme(), state);
    const sig = JSON.stringify([type, cfg.data, cfg.options && cfg.options.scales ? cfg.options.scales.y : '']);
    if (newsImageCache[kind] && newsImageCache[kind].sig === sig) return newsImageCache[kind].url;
    const url = chartToImage(cfg);
    newsImageCache[kind] = { sig, url };
    return url;
}

let newspaperSig = '';
function refreshNewspaper() {
    const th = theme();
    // 문제 상황 장면 고르기 (4컷 중 하나)
    $('np-editor').hidden = !!th.image;
    const pickerSig = `${team.theme_id}`;
    if ($('panel-picker').dataset.sig !== pickerSig) {
        $('panel-picker').dataset.sig = pickerSig;
        $('panel-picker').innerHTML = th.comic.map((p, i) => `
            <label class="panel-choice"><input type="radio" name="news-panel" value="${i}" data-key="news.panel">
                ${comicPanelHtml(th, i)}</label>`).join('');
        applyStateToDom(['news.panel']);
    }
    if (state['news.panel'] === undefined) document.querySelector('input[name="news-panel"][value="0"]').checked = true;

    // 신문은 내용이 바뀔 때만 다시 만든다 (인터뷰를 쓰는 중에 입력칸이 사라지지 않게)
    const chart1Url = newsChartImage(1);
    const chart2Url = newsChartImage(2);
    const sigState = Object.fromEntries(Object.entries(state).filter(([k]) => !k.startsWith('interview.') && !k.startsWith('sim.busy')));
    const sig = JSON.stringify([sigState, chart1Url.length, chart2Url.length, team.theme_id]);
    if (sig !== newspaperSig) {
        newspaperSig = sig;
        $('newspaper-area').innerHTML = buildNewspaperHtml({ team, theme: th, state, chart1Url, chart2Url, editable: true });
        applyStateToDom(INTERVIEW_QUESTIONS.map(q => q.key));
    }
    const btn = $('final-submit-btn');
    btn.textContent = state['newspaper.submittedAt'] ? '✅ 발행 완료 (고친 뒤 다시 발행할 수 있어요)' : '🚀 최종 신문 발행 및 선생님께 제출';
    gateButton('final-submit-btn', 'newspaper-role-note', 'newspaper');
}

function submitNewspaper() {
    if (!canSubmit('newspaper')) return;
    const blank = INTERVIEW_QUESTIONS.filter(q => !(state[q.key] || '').trim());
    if (blank.length && !confirm(`인터뷰 답변 ${blank.length}개가 비어 있어요. 그래도 발행할까요?`)) return;
    setState({ 'newspaper.submittedAt': new Date().toISOString(), 'newspaper.submittedBy': whoAmI() }, true);
    toast(`🎉 ${teamLabel(team)}의 과학 신문을 선생님께 제출했어요!`, 'success');
}

// ==========================================
// 시작
// ==========================================
initIntro();
