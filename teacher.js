// ==========================================
// 교사용 대시보드
// ------------------------------------------
// 교사 계정으로 로그인 → 모든 모둠의 진행 상황을 실시간으로 보고,
// 모둠별 탐구 결과(신문) 전체 보기, 피드백·공지 보내기, 모둠 만들기/초기화를 한다.
// ==========================================
let myInfo = null;            // { id, code, name }
let teams = [];
let allMessages = [];
let onlineByTeam = {};
let membersByTeam = {};
let detailId = null;
let detailSig = '';
let detailStage = 'all';      // 상세 보기에서 보고 있는 단계 (all = 전체)
let dashChannel = null;
let presenceChannel = null;
let subscribedOnce = false;
let renderQueued = false;
const lastChange = {};
const detailCharts = {};

const QUICK_FEEDBACK = [
    '👍 변인 통제를 잘 설정했어요!',
    '🤔 조작 변인이 2개 이상이에요. 결과의 원인을 구별할 수 있을까요?',
    '📈 시간에 따른 변화를 보여 주기에 더 알맞은 그래프는 무엇일까요?',
    '📋 기록표의 값이 기기 측정값과 다른 칸이 있어요. 다시 확인해 보세요.',
    '💡 결론에 데이터(수치)를 근거로 넣어 보세요.'
];

const $ = id => document.getElementById(id);

function storageGet(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
}
function storageSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* 무시 */ }
}

// ==========================================
// 로그인
// ==========================================
async function init() {
    const { data } = await sb.auth.getSession();
    if (data && data.session) await enterDashboard();
}

function setLoginMsg(text, isError = false) {
    $('login-msg').textContent = text;
    $('login-msg').classList.toggle('error', isError);
}

async function login() {
    const email = $('login-email').value.trim();
    const password = $('login-password').value;
    $('login-btn').disabled = true;
    setLoginMsg('로그인 중...');
    const { error } = await sb.auth.signInWithPassword({ email, password });
    $('login-btn').disabled = false;
    if (error) {
        setLoginMsg('이메일 또는 비밀번호가 올바르지 않아요.', true);
        return;
    }
    await enterDashboard();
}

async function enterDashboard() {
    const { data: ok, error } = await sb.rpc('is_teacher');
    if (error || !ok) {
        await sb.auth.signOut();
        setLoginMsg('교사로 등록되지 않은 계정이에요. Supabase의 teachers 표에 이메일을 추가해 주세요.', true);
        return;
    }
    await loadMyInfo();
    setLoginMsg('');
    $('login-view').hidden = true;
    $('dash-view').hidden = false;
    await loadAll();
    subscribe();
    joinPresence();
    setInterval(scheduleRender, 30000);    // "n분 전" 표시 갱신
}

async function logout() {
    await sb.auth.signOut();
    location.reload();
}

// ==========================================
// 데이터 불러오기 · 실시간 반영
// ==========================================
function sortTeams() {
    teams.sort((a, b) => a.grade - b.grade || a.class_no - b.class_no || a.team_no - b.team_no);
}

async function loadAll() {
    const [t, m] = await Promise.all([
        sb.from('teams').select('*'),
        sb.from('messages').select('*').order('id')
    ]);
    if (t.error) {
        console.error(t.error);
        toast('모둠 정보를 불러오지 못했어요. 새로고침 해 주세요.', 'error');
        return;
    }
    teams = t.data || [];
    sortTeams();
    allMessages = m.data || [];
    fillFilters();
    scheduleRender();
    if (detailId) {
        renderDetail(true);
        renderDetailFeedback();
    }
}

function subscribe() {
    dashChannel = sb.channel('teacher-dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'teams' }, onTeamChange)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, p => {
            if (!allMessages.some(m => m.id === p.new.id)) allMessages.push(p.new);
            if (p.new.team_id === detailId) {
                renderDetailFeedback();
                renderDetail();
            }
            scheduleRender();
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, p => {
            if (!allMessages.some(m => m.id === p.old.id)) return;
            allMessages = allMessages.filter(m => m.id !== p.old.id);
            scheduleRender();
        })
        .subscribe(status => {
            $('live-dot').classList.toggle('off', status !== 'SUBSCRIBED');
            if (status === 'SUBSCRIBED') {
                if (subscribedOnce) loadAll();     // 끊겼다 다시 연결되면 빠진 내용을 채운다
                subscribedOnce = true;
            }
        });
}

function onTeamChange(p) {
    if (p.eventType === 'DELETE') {
        if (!teams.some(t => t.id === p.old.id)) return;     // 다른 선생님의 모둠
        teams = teams.filter(t => t.id !== p.old.id);
        if (detailId === p.old.id) closeDetail();
    } else {
        const i = teams.findIndex(t => t.id === p.new.id);
        if (i >= 0) teams[i] = p.new;
        else teams.push(p.new);
        sortTeams();
        lastChange[p.new.id] = Date.now();
        if (detailId === p.new.id) renderDetail();
    }
    fillFilters();
    scheduleRender();
}

function joinPresence() {
    presenceChannel = sb.channel('online');
    presenceChannel
        .on('presence', { event: 'sync' }, () => {
            const st = presenceChannel.presenceState();
            onlineByTeam = {};
            membersByTeam = {};
            Object.values(st).forEach(list => {
                const p = list.find(x => x.role === 'student' && x.team_id);
                if (!p) return;
                onlineByTeam[p.team_id] = (onlineByTeam[p.team_id] || 0) + 1;
                (membersByTeam[p.team_id] = membersByTeam[p.team_id] || []).push(p);
            });
            scheduleRender();
            if (detailId) renderDetailMembers();
        })
        .subscribe();
}

// ==========================================
// 필터 · 현황판
// ==========================================
let filterSig = null;
function fillFilters() {
    // 반 구성이 바뀔 때만 다시 만든다 (학생 입력마다 다시 만들면 열려 있던 선택 상자가 닫힘)
    const sig = JSON.stringify([...new Set(teams.map(t => `${t.grade}-${t.class_no}`))]) + $('filter-grade').value + $('filter-class').value;
    if (sig === filterSig) return;
    const gradeSel = $('filter-grade');
    const classSel = $('filter-class');
    const savedGrade = gradeSel.value || storageGet('teacherGrade') || '';
    const grades = [...new Set(teams.map(t => t.grade))];
    gradeSel.innerHTML = '<option value="">전체 학년</option>' + grades.map(g => `<option value="${g}">${g}학년</option>`).join('');
    gradeSel.value = grades.includes(Number(savedGrade)) ? savedGrade : '';

    const savedClass = classSel.value || storageGet('teacherClass') || '';
    const g = Number(gradeSel.value);
    const classes = [...new Set(teams.filter(t => !g || t.grade === g).map(t => t.class_no))];
    classSel.innerHTML = '<option value="">전체 반</option>' + classes.map(c => `<option value="${c}">${c}반</option>`).join('');
    classSel.value = classes.includes(Number(savedClass)) ? savedClass : '';
    filterSig = JSON.stringify([...new Set(teams.map(t => `${t.grade}-${t.class_no}`))]) + gradeSel.value + classSel.value;
}

function onFilterChange() {
    storageSet('teacherGrade', $('filter-grade').value);
    storageSet('teacherClass', $('filter-class').value);
    fillFilters();
    scheduleRender();
}

function filteredTeams() {
    const g = Number($('filter-grade').value);
    const c = Number($('filter-class').value);
    return teams.filter(t => (!g || t.grade === g) && (!c || t.class_no === c));
}

function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    setTimeout(() => {
        renderQueued = false;
        renderGrid();
    }, 50);
}

function progressFlags(t) {
    const s = t.state || {};
    return [
        ['설계', !!s['design.submittedAt']],
        ['측정', (s['sim.ctrl'] || 0) >= 5 && (s['sim.exp'] || 0) >= 5],
        ['분석', !!s['final.submittedAt']],
        ['신문', !!s['newspaper.submittedAt']]
    ];
}

function renderGrid() {
    const list = filteredTeams();
    const container = $('grid-container');
    $('grid-empty').hidden = list.length > 0;
    $('grid-empty').textContent = teams.length ? '이 반에는 모둠이 없어요.' : '아직 모둠이 없어요. 오른쪽 위 [⚙️ 모둠 관리]에서 학년·반·모둠을 만든 뒤, [🔗 수업 코드]의 링크를 학생들에게 알려 주세요.';

    const count = idx => list.filter(t => progressFlags(t)[idx][1]).length;
    const online = list.reduce((sum, t) => sum + (onlineByTeam[t.id] || 0), 0);
    $('dash-stats').innerHTML = [
        ['모둠', list.length], ['접속 학생', online], ['설계 완료', count(0)],
        ['측정 완료', count(1)], ['분석 완료', count(2)], ['신문 제출', count(3)]
    ].map(([k, v]) => `<div class="stat-box"><span>${k}</span><b>${v}</b></div>`).join('');

    const now = Date.now();
    container.innerHTML = list.map(t => {
        const th = t.theme_id ? THEMES[t.theme_id] : null;
        const stage = t.theme_id ? Math.max(1, t.stage) : 0;
        const on = onlineByTeam[t.id] || 0;
        const fb = allMessages.filter(m => m.team_id === t.id && m.channel === 'feedback').length;
        const recent = now - (lastChange[t.id] || 0) < 4000;
        return `
        <button class="team-card ${recent ? 'pulse' : ''}" onclick="openDetail('${t.id}')">
            <div class="tc-head"><b>${teamLabel(t)}</b><span class="tc-online ${on ? 'on' : ''}">● ${on}명</span></div>
            <div class="tc-theme">${th ? `${th.icon} ${escapeHtml(th.title)}` : '<span class="muted">테마 선택 전</span>'}</div>
            <div class="tc-progress">${STAGES.map(st => `<i class="${st.no < stage ? 'done' : st.no === stage ? 'now' : ''}" title="${st.name}"></i>`).join('')}</div>
            <div class="tc-stage">${stage ? `${stage}. ${STAGES[stage - 1].name}` : '입장 대기'}</div>
            <div class="tc-flags">${progressFlags(t).map(([n, ok]) => `<span class="${ok ? 'ok' : ''}">${ok ? '✔' : '○'} ${n}</span>`).join('')}</div>
            <div class="tc-foot"><span>${t.updated_at && new Date(t.updated_at) - new Date(t.created_at) > 1000 ? `${timeAgo(t.updated_at)} 활동` : ''}</span><span>${fb ? `💬 ${fb}` : ''}</span></div>
        </button>`;
    }).join('');
}

// ==========================================
// 모둠 상세 (탐구 결과 전체 보기)
// ==========================================
function openDetail(id) {
    detailId = id;
    detailSig = '';
    $('detail-view').hidden = false;
    document.body.classList.add('no-scroll');
    $('quick-feedback').innerHTML = QUICK_FEEDBACK.map((q, i) => `<button class="chip" onclick="addQuickFeedback(${i})">${escapeHtml(q)}</button>`).join('');
    $('teacher-comment').value = '';
    renderStageTabs();
    renderDetail(true);
    renderDetailFeedback();
    renderDetailMembers();
    $('detail-report').scrollTop = 0;
}

function renderDetailMembers() {
    const list = membersByTeam[detailId] || [];
    $('detail-members').innerHTML = `<h3>👥 접속 중인 모둠원 (${list.length}명)</h3>`
        + (list.length
            ? `<div class="member-chips">${list.map(p => `<span class="member-chip"><b>${escapeHtml(p.name || '?')}</b> ${escapeHtml(roleName(p.job))}</span>`).join('')}</div>`
            : '<p class="hint">지금 접속한 모둠원이 없어요.</p>');
}

function renderThemeSelect(t) {
    const sel = $('detail-theme');
    sel.innerHTML = '<option value="">테마: 학생이 선택</option>'
        + THEME_ORDER.map(id => `<option value="${id}">테마: ${THEMES[id].icon} ${THEMES[id].title}</option>`).join('');
    sel.value = t.theme_id || '';
}

// 교사가 모둠의 테마를 정해 준다 (이미 진행한 내용이 있으면 확인 후 초기화)
async function assignTheme(themeId) {
    const t = teams.find(x => x.id === detailId);
    if (!t || (t.theme_id || '') === themeId) return;
    const hasProgress = t.theme_id && Object.keys(t.state || {}).some(k => !k.startsWith('sim.') && k !== 'theme.assigned');
    if (hasProgress && !confirm(`${teamLabel(t)}이(가) 이미 진행한 내용이 지워지고 새 테마로 시작합니다. 바꿀까요?`)) {
        renderThemeSelect(t);
        return;
    }
    const patch = themeId
        ? { theme_id: themeId, stage: 1, state: { ...defaultThemeState(themeId), 'theme.assigned': true } }
        : { theme_id: null, stage: 0, state: {} };
    const { error } = await sb.from('teams').update(patch).eq('id', t.id);
    if (error) {
        console.error(error);
        toast('테마를 지정하지 못했어요. 다시 시도해 주세요.', 'error');
        renderThemeSelect(t);
        return;
    }
    Object.assign(t, patch);
    renderDetail(true);
    scheduleRender();
    toast(themeId ? `${teamLabel(t)}에 '${THEMES[themeId].title}' 테마를 지정했어요.` : `${teamLabel(t)}은(는) 학생이 테마를 고르게 했어요.`, 'success');
}

async function autoAssignThemes() {
    const targets = filteredTeams().filter(t => !t.theme_id);
    if (!targets.length) {
        toast('테마가 없는 모둠이 없어요. (위쪽 필터의 반을 확인하세요)');
        return;
    }
    const plan = targets.map((t, i) => ({ t, themeId: THEME_ORDER[(t.team_no - 1) % THEME_ORDER.length] }));
    if (!confirm(`${plan.map(p => `${teamLabel(p.t)} → ${THEMES[p.themeId].title}`).join('\n')}\n\n이대로 배정할까요?`)) return;
    for (const p of plan) {
        const patch = { theme_id: p.themeId, stage: 1, state: { ...defaultThemeState(p.themeId), 'theme.assigned': true } };
        const { error } = await sb.from('teams').update(patch).eq('id', p.t.id);
        if (error) {
            console.error(error);
            toast('일부 모둠의 테마를 지정하지 못했어요. 다시 시도해 주세요.', 'error');
            return;
        }
        Object.assign(p.t, patch);
    }
    scheduleRender();
    toast(`모둠 ${plan.length}개에 테마를 배정했어요.`, 'success');
}

// 교사 보기 모드로 학생 화면 열기 (모든 단계를 자유롭게 넘겨 볼 수 있음 · 평가용)
function openStudentView() {
    const t = teams.find(x => x.id === detailId);
    if (!t || !myInfo) return;
    window.open(`${studentLink()}&team=${t.id}&teacher=1`, '_blank');
}

const STAGE_TABS = [{ id: 'all', name: '전체' }, ...STAGES.map(st => ({ id: String(st.no), name: `${st.no}. ${st.name}` }))];

function renderStageTabs() {
    $('stage-tabs').innerHTML = '<span class="stage-tabs-label">단계별 크게 보기</span>' + STAGE_TABS.map(tab =>
        `<button class="stage-tab ${tab.id === detailStage ? 'active' : ''}" onclick="setDetailStage('${tab.id}')">${tab.name}</button>`).join('');
}

// 단계를 고르면 그 단계만 크게 보여 준다 (이전·다음 모둠으로 넘겨도 같은 단계를 유지)
function setDetailStage(stage) {
    detailStage = stage;
    $('detail-view').classList.toggle('big', stage !== 'all');
    $('detail-view').classList.toggle('staged', stage !== 'all');
    renderStageTabs();
    renderDetail(true);
    Object.values(detailCharts).forEach(c => c.resize());
    $('detail-report').scrollTop = 0;
}

function closeDetail() {
    detailId = null;
    $('detail-view').hidden = true;
    document.body.classList.remove('no-scroll');
    Object.keys(detailCharts).forEach(k => { detailCharts[k].destroy(); delete detailCharts[k]; });
}

function moveDetail(dir) {
    const list = filteredTeams();
    if (!list.length) return;
    const idx = list.findIndex(t => t.id === detailId);
    const next = list[(idx + dir + list.length) % list.length];
    openDetail(next.id);
}

function toggleBigText() {
    $('detail-view').classList.toggle('big');
    Object.values(detailCharts).forEach(c => c.resize());
}

function renderDetail(force = false) {
    const t = teams.find(x => x.id === detailId);
    if (!t) return;
    const aiMsgs = allMessages.filter(m => m.team_id === t.id && m.channel === 'ai');
    const sig = JSON.stringify([t.theme_id, t.stage, t.state, aiMsgs.length]);
    if (!force && sig === detailSig) return;
    detailSig = sig;

    const th = t.theme_id ? THEMES[t.theme_id] : null;
    $('detail-team').textContent = teamLabel(t);
    renderThemeSelect(t);
    $('detail-sub').textContent = th ? `${th.icon} ${th.title} · ${STAGES[Math.max(1, t.stage) - 1].name} 단계` : '테마 선택 전';

    const report = $('detail-report');
    const scroll = report.scrollTop;
    Object.keys(detailCharts).forEach(k => { detailCharts[k].destroy(); delete detailCharts[k]; });
    report.innerHTML = buildReport(t, aiMsgs);
    report.scrollTop = scroll;

    if (th) {
        const s = t.state || {};
        [1, 2].forEach(kind => {
            const type = kind === 1 ? s['chart1.type'] : s['sum.metric'];
            const canvas = $(`rp-chart${kind}`);
            if (!type || !canvas) return;
            const cfg = buildChartConfig(kind, type, th, s);
            cfg.options = { ...cfg.options, animation: false };
            detailCharts[kind] = new Chart(canvas, cfg);
        });
    }
}

function buildReport(t, aiMsgs) {
    if (!t.theme_id) return '<div class="report-empty">아직 테마를 고르지 않았어요.</div>';
    const th = THEMES[t.theme_id];
    const s = t.state || {};
    const c = getConditions(th, s);
    const m = th.measure;
    const none = '<span class="muted">미작성</span>';
    const text = v => (v && String(v).trim() ? escapeHtml(v) : none);
    // 단계 탭을 고르면 그 단계의 내용만 크게 보여 준다
    const sec = (title, body, cls = '', stage = 0) => (detailStage === 'all' || Number(detailStage) === stage
        ? `<section class="rp-sec ${cls}" data-stage="${stage}"><h3>${title}</h3>${body}</section>` : '');
    if (detailStage === '5') {
        const chart1Url = s['chart1.type'] ? chartToImage(buildChartConfig(1, s['chart1.type'], th, s)) : '';
        const chart2Url = s['sum.metric'] ? chartToImage(buildChartConfig(2, null, th, s)) : '';
        return `<div class="rp-newspaper">${buildNewspaperHtml({ team: t, theme: th, state: s, chart1Url, chart2Url, editable: false })}</div>`;
    }

    // 설계
    const check = checkDesign(th, s);
    const designRows = th.vars.map((v, i) => {
        const manip = c.manipulated.includes(i);
        return `<tr class="${manip ? 'manip' : ''}"><td>${escapeHtml(v.name)}</td><td>${manip ? '조작' : '통제'}</td>
            <td>${c.ctrl[i] >= 0 ? escapeHtml(v.options[c.ctrl[i]]) : '<span class="muted">미정</span>'}</td><td>${manip ? (c.exp[i] >= 0 ? escapeHtml(v.options[c.exp[i]]) : '<span class="muted">미정</span>') : '<span class="muted">(같음)</span>'}</td></tr>`;
    }).join('');
    const checkHtml = [...check.errors.map(e => `<div class="rp-alert error">❗ ${escapeHtml(e)}</div>`),
        ...check.warnings.map(w => `<div class="rp-alert warn">⚠️ ${escapeHtml(w)}</div>`)].join('');
    const submitted = !!s['design.submittedAt'];
    const hypo = submitted ? s.hypothesis : composeHypothesis(s);
    const pred = submitted ? (s.prediction || composePrediction(s, th)) : composePrediction(s, th);
    const cl = groupLabel(th, s, 'ctrl'), el = groupLabel(th, s, 'exp');
    const by = key => (s[`${key}.submittedBy`] ? `<span class="rp-by">제출: ${escapeHtml(s[`${key}.submittedBy`])}</span>` : '');

    // 기록표 (학생 기록값 vs 실제 측정값)
    const truth = simulate(t.id, t.theme_id, s);
    const dataRow = (g, label, cls) => {
        const key = g === 'c' ? 'ctrl' : 'exp';
        const measured = s[`sim.${key}`] || 0;
        return `<tr><td class="${cls}">${label}</td>${[0, 1, 2, 3, 4].map(i => {
            const typed = toNum(s[`data.${g}.${i}`]);
            const real = i < measured ? truth[key][i] : null;
            const wrong = typed !== null && real !== null && Math.abs(typed - real) > Math.pow(10, -m.decimals) / 2;
            return `<td class="${wrong ? 'wrong' : ''}">${typed === null ? '<span class="muted">-</span>' : fmtNum(typed, m.decimals)}
                ${real !== null ? `<small class="real">측정 ${fmtNum(real, m.decimals)}</small>` : ''}</td>`;
        }).join('')}</tr>`;
    };

    const chartBlock = kind => {
        const type = s[`chart${kind}.type`];
        if (!type) return '<p class="muted">아직 그래프를 그리지 않았어요.</p>';
        return `<div class="rp-chart-type">${CHART_NAMES[type]}</div>
            <div class="rp-chart"><canvas id="rp-chart${kind}"></canvas></div>
            <p class="rp-reason">${escapeHtml(reasonSentence(kind, s)) || none}</p>`;
    };

    // 핵심 가공 데이터: 학생 입력값 + 기록표로 계산한 값(교사에게만 보임)
    const summaryBlock = () => {
        const chk = summaryCheck(th, s);
        if (!chk) return '<p class="muted">아직 핵심 가공 데이터를 고르지 않았어요.</p>';
        const mt = chk.metric;
        const d = metricDecimals(mt, th);
        const cols = metricColLabels(mt, th);
        const rows = metricRows(mt).map(r => `<tr><td class="row-${r === 'e' ? 'exp' : 'ctrl'}">${escapeHtml(metricRowLabel(mt, th, s, r))}</td>${cols.map((_, i) => {
            const key = summaryKey(mt.id, r, i);
            const v = chk.entered[r][i];
            const exp = chk.expected[r] ? chk.expected[r][i] : null;
            return `<td class="${chk.status[key] === 'wrong' ? 'wrong' : ''}">${v === null ? '<span class="muted">-</span>' : v}
                ${exp !== null && exp !== undefined ? `<small class="real">계산 ${fmtNum(exp, d)}</small>` : ''}</td>`;
        }).join('')}</tr>`).join('');
        return `<div class="rp-chart-type">${escapeHtml(mt.name)} <small class="muted">(${escapeHtml(metricUnit(mt, th))})</small></div>
            <div class="table-scroll"><table class="rp-table data"><thead><tr><th>구분</th>${cols.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>
            ${chk.wrong ? `<p class="hint">빨간 칸: 기록표 값으로 계산한 값과 다름 (${chk.wrong}칸)</p>` : ''}
            <div class="rp-chart"><canvas id="rp-chart2"></canvas></div>`;
    };

    const aiLog = aiMsgs.length
        ? `<details class="rp-ai"><summary>AI와 나눈 대화 ${aiMsgs.length}개 보기</summary>${aiMsgs.map(x =>
            `<div class="bubble ${x.role === 'student' ? 'me' : 'ai'}">${escapeHtml(x.content)}</div>`).join('')}</details>`
        : '<p class="muted">AI와 나눈 대화가 없어요.</p>';

    const val = s.validation
        ? `<span class="rp-val ${s.validation === '수용' ? 'accept' : 'reject'}">가설 ${escapeHtml(s.validation)}</span>`
        : '<span class="rp-val">미선택</span>';

    return `
    <div class="report-grid">
        ${sec('1. 문제 인식', `<p>${text(s.problem)}</p>${by('story')}`, '', 1)}
        ${sec('2. 탐구 설계', `
            <table class="rp-table"><thead><tr><th>변인</th><th>방법</th><th>대조군</th><th>실험군</th></tr></thead><tbody>${designRows}</tbody></table>
            ${checkHtml}
            <div class="rp-hypo"><span class="rp-tag ${submitted ? 'ok' : ''}">${submitted ? '전송됨' : '작성 중'}</span> <b>가설</b> ${escapeHtml(hypo)}</div>
            <div class="rp-hypo pred"><b>예측</b> ${escapeHtml(pred)}</div>${by('design')}`, '', 2)}
        ${sec(`3. 측정 기록 <small>(${escapeHtml(m.name)}, ${escapeHtml(m.unit)})</small>`, `
            <div class="table-scroll"><table class="rp-table data"><thead><tr><th>구분</th>${m.labels.map(l => `<th>${l}</th>`).join('')}</tr></thead>
            <tbody>${dataRow('c', escapeHtml(cl), 'row-ctrl')}${dataRow('e', escapeHtml(el), 'row-exp')}</tbody></table></div>
            <p class="hint">빨간 칸: 학생이 기록한 값이 기기 측정값과 다름</p>${by('experiment')}`, 'wide', 3)}
        ${sec('📈 1차 그래프 (과정의 추이)', chartBlock(1), '', 3)}
        ${sec('📊 2차 그래프 (핵심 가공 데이터)', summaryBlock(), '', 4)}
        ${sec('🤖 AI 데이터 분석', aiLog, '', 4)}
        ${sec('✅ 가설 검증 · 결론', `<div class="center">${val}</div><div class="rp-validation">${validationDetailHtml(s)}</div>${by('final')}`, '', 4)}
        ${sec('🎤 연구팀 인터뷰', INTERVIEW_QUESTIONS.map(q => `<p class="rp-q">Q. ${escapeHtml(q.q)}</p><p>${text(s[q.key])}</p>`).join('') + by('newspaper'), 'wide', 5)}
    </div>`;
}

// ---------- 피드백 ----------
function renderDetailFeedback() {
    const list = allMessages.filter(m => m.team_id === detailId && m.channel === 'feedback');
    const box = $('detail-feedback-list');
    box.innerHTML = list.length
        ? list.map(m => `<div class="fb-item"><div class="fb-meta">${new Date(m.created_at).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div><div class="fb-text">${escapeHtml(m.content)}</div></div>`).join('')
        : '<p class="hint center">아직 보낸 피드백이 없어요.</p>';
    box.scrollTop = box.scrollHeight;
}

function addQuickFeedback(i) {
    const ta = $('teacher-comment');
    ta.value = ta.value ? `${ta.value}\n${QUICK_FEEDBACK[i]}` : QUICK_FEEDBACK[i];
    ta.focus();
}

async function sendFeedback() {
    const content = $('teacher-comment').value.trim();
    if (!content || !detailId) return;
    const { data, error } = await sb.from('messages')
        .insert({ team_id: detailId, channel: 'feedback', role: 'teacher', content }).select().single();
    if (error) {
        console.error(error);
        toast('피드백을 보내지 못했어요. 다시 시도해 주세요.', 'error');
        return;
    }
    if (!allMessages.some(m => m.id === data.id)) allMessages.push(data);
    $('teacher-comment').value = '';
    renderDetailFeedback();
    scheduleRender();
    toast('피드백을 보냈어요. 학생 화면에 바로 표시됩니다.', 'success');
}

async function sendBroadcast() {
    const content = $('broadcast-text').value.trim();
    const list = filteredTeams();
    if (!content || !list.length) return;
    const { data, error } = await sb.from('messages')
        .insert(list.map(t => ({ team_id: t.id, channel: 'feedback', role: 'teacher', content }))).select();
    if (error) {
        console.error(error);
        toast('공지를 보내지 못했어요. 다시 시도해 주세요.', 'error');
        return;
    }
    (data || []).forEach(d => { if (!allMessages.some(m => m.id === d.id)) allMessages.push(d); });
    $('broadcast-text').value = '';
    closeModal('broadcast-modal');
    scheduleRender();
    toast(`모둠 ${list.length}개에 공지를 보냈어요.`, 'success');
}

// ==========================================
// 학생 입장 링크 · QR
// ==========================================
function studentLink() {
    const base = new URL('./', location.href);    // teacher.html과 같은 폴더의 학생 화면
    return `${base.href}?t=${myInfo ? myInfo.code : ''}`;
}

// 내 수업 코드·표시 이름 불러오기
async function loadMyInfo() {
    const { data, error } = await sb.rpc('my_teacher_info');
    myInfo = data && (Array.isArray(data) ? data[0] : data);
    if (error || !myInfo || !myInfo.code) {
        console.error('수업 코드 불러오기 실패:', error, data);
        myInfo = null;
        $('my-code').textContent = '확인 필요';
        return error ? (error.message || String(error)) : '수업 코드가 비어 있음';
    }
    $('my-code').textContent = myInfo.code;
    return null;
}

async function openLinkModal() {
    if (!myInfo) {
        const reason = await loadMyInfo();
        if (reason) {
            alert(`수업 코드를 불러오지 못했어요.\n\nSupabase SQL Editor에서 supabase/setup.sql을 다시 실행했는지 확인해 주세요.\n\n(오류 내용: ${reason})`);
            return;
        }
    }
    const url = studentLink();
    $('link-code').textContent = myInfo.code;
    $('link-url').value = url;
    $('teacher-name-input').value = myInfo.name || '';
    if (window.qrcode) {
        const qr = qrcode(0, 'M');
        qr.addData(url);
        qr.make();
        $('link-qr').innerHTML = qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
    } else {
        $('link-qr').innerHTML = '';
    }
    openModal('link-modal');
}

async function copyLink() {
    const url = $('link-url').value;
    try {
        await navigator.clipboard.writeText(url);
    } catch (e) {
        $('link-url').select();
        document.execCommand('copy');
    }
    toast('학생 입장 링크를 복사했어요.', 'success');
}

// QR을 인쇄·게시용 PNG로 저장 (아래에 수업 코드 글자도 함께 넣는다)
function downloadQR() {
    if (!myInfo || !window.qrcode) return;
    const qr = qrcode(0, 'M');
    qr.addData(studentLink());
    qr.make();
    const cells = qr.getModuleCount();
    const cell = 12, margin = 4 * cell, size = cells * cell + margin * 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size + 90;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < cells; r++) {
        for (let c = 0; c < cells; c++) {
            if (qr.isDark(r, c)) ctx.fillRect(margin + c * cell, margin + r * cell, cell, cell);
        }
    }
    ctx.fillStyle = '#2c3e50';
    ctx.textAlign = 'center';
    ctx.font = 'bold 44px sans-serif';
    ctx.fillText(`수업 코드 ${myInfo.code}`, size / 2, size + 50);
    canvas.toBlob(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `class-code-${myInfo.code}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
    }, 'image/png');
}

function toggleLinkBig() {
    $('link-modal').classList.toggle('big');
}

async function saveTeacherName() {
    const name = $('teacher-name-input').value.trim();
    const { error } = await sb.rpc('set_my_teacher_name', { p_name: name });
    if (error) {
        console.error(error);
        toast('이름을 저장하지 못했어요. 다시 시도해 주세요.', 'error');
        return;
    }
    myInfo.name = name || null;
    toast('표시 이름을 저장했어요.', 'success');
}

// ==========================================
// 모둠 관리
// ==========================================
function openModal(id) {
    if (id === 'broadcast-modal') {
        const list = filteredTeams();
        const g = $('filter-grade').value, c = $('filter-class').value;
        const where = g ? `${g}학년 ${c ? `${c}반` : '전체 반'}` : '전체 학년';
        $('broadcast-target').textContent = `받는 모둠: ${where} · ${list.length}개 모둠 (위쪽 필터로 범위를 바꿀 수 있어요)`;
    }
    $(id).hidden = false;
}

function closeModal(id) {
    $(id).hidden = true;
}

function openManage() {
    renderClassList();
    openModal('manage-modal');
}

function renderClassList() {
    const groups = {};
    teams.forEach(t => {
        const key = `${t.grade}-${t.class_no}`;
        (groups[key] = groups[key] || { grade: t.grade, class_no: t.class_no, n: 0 }).n++;
    });
    const list = Object.values(groups);
    $('class-list').innerHTML = list.length
        ? list.map(g => `<div class="class-row"><span>${g.grade}학년 ${g.class_no}반 · 모둠 ${g.n}개</span>
            <button class="btn btn-small btn-ghost danger" onclick="deleteClass(${g.grade}, ${g.class_no})">반 삭제</button></div>`).join('')
        : '<p class="hint">아직 만든 반이 없어요.</p>';
}

async function createTeams() {
    const grade = Number($('new-grade').value);
    const classNo = Number($('new-class').value);
    const count = Number($('new-count').value);
    if (!(grade >= 1 && grade <= 6 && classNo >= 1 && classNo <= 30 && count >= 1 && count <= 20)) {
        alert('학년(1~6), 반(1~30), 모둠 수(1~20)를 확인해 주세요.');
        return;
    }
    const existing = new Set(teams.filter(t => t.grade === grade && t.class_no === classNo).map(t => t.team_no));
    const rows = [];
    for (let n = 1; n <= count; n++) {
        if (!existing.has(n)) rows.push({ grade, class_no: classNo, team_no: n });
    }
    if (!rows.length) {
        toast('이미 모든 모둠이 만들어져 있어요.');
        return;
    }
    const { data, error } = await sb.from('teams').insert(rows).select();
    if (error) {
        console.error(error);
        toast('모둠을 만들지 못했어요. 다시 시도해 주세요.', 'error');
        return;
    }
    (data || []).forEach(d => { if (!teams.some(t => t.id === d.id)) teams.push(d); });
    sortTeams();
    fillFilters();
    renderClassList();
    scheduleRender();
    toast(`${grade}학년 ${classNo}반에 모둠 ${rows.length}개를 만들었어요.`, 'success');
}

async function deleteClass(grade, classNo) {
    if (!confirm(`${grade}학년 ${classNo}반의 모든 모둠과 활동 기록(피드백 포함)이 삭제됩니다.\n되돌릴 수 없어요. 삭제할까요?`)) return;
    const { error } = await sb.from('teams').delete().eq('grade', grade).eq('class_no', classNo);
    if (error) {
        console.error(error);
        toast('삭제하지 못했어요. 다시 시도해 주세요.', 'error');
        return;
    }
    teams = teams.filter(t => !(t.grade === grade && t.class_no === classNo));
    fillFilters();
    renderClassList();
    scheduleRender();
    toast(`${grade}학년 ${classNo}반을 삭제했어요.`);
}

async function resetTeam() {
    const t = teams.find(x => x.id === detailId);
    if (!t) return;
    if (!confirm(`${teamLabel(t)}의 테마, 설계, 측정 기록, AI 대화, 피드백이 모두 지워지고 처음부터 다시 시작합니다.\n초기화할까요?`)) return;
    const r1 = await sb.from('teams').update({ theme_id: null, stage: 0, state: {} }).eq('id', t.id);
    const r2 = await sb.from('messages').delete().eq('team_id', t.id);
    if (r1.error || r2.error) {
        console.error(r1.error || r2.error);
        toast('초기화하지 못했어요. 다시 시도해 주세요.', 'error');
        return;
    }
    Object.assign(t, { theme_id: null, stage: 0, state: {} });
    allMessages = allMessages.filter(m => m.team_id !== t.id);
    renderDetail(true);
    renderDetailFeedback();
    scheduleRender();
    toast(`${teamLabel(t)}을(를) 초기화했어요.`);
}

document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        if (!$('link-modal').hidden) closeModal('link-modal');
        else if (!$('manage-modal').hidden) closeModal('manage-modal');
        else if (!$('broadcast-modal').hidden) closeModal('broadcast-modal');
        else if (detailId) closeDetail();
    }
    if (detailId && e.target.tagName !== 'TEXTAREA' && e.target.tagName !== 'INPUT') {
        if (e.key === 'ArrowRight') moveDetail(1);
        if (e.key === 'ArrowLeft') moveDetail(-1);
        if (/^[0-5]$/.test(e.key)) setDetailStage(e.key === '0' ? 'all' : e.key);
    }
});

init();
