// ==========================================
// 학생 화면과 교사 대시보드가 함께 쓰는 공통 기능
// ==========================================
// 학생 화면은 로그인 정보를 쓰지 않는다 (같은 브라우저에 교사가 로그인해 있어도 학생으로 동작)
// 단, 교사가 대시보드에서 '학생 화면으로 보기'를 연 경우(?teacher=1)에는 교사 로그인을 이어서 쓴다.
const IS_TEACHER_PAGE = document.body.classList.contains('teacher');
const TEACHER_VIEW_REQUESTED = new URLSearchParams(location.search).has('teacher');
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY,
    IS_TEACHER_PAGE || TEACHER_VIEW_REQUESTED ? {} : { auth: { persistSession: false, autoRefreshToken: false } });

const STAGES = [
    { no: 1, name: '문제 인식', screen: 'story-screen' },
    { no: 2, name: '탐구 설계', screen: 'hypothesis-screen' },
    { no: 3, name: '실험·데이터', screen: 'simulation-screen' },
    { no: 4, name: '분석·검증', screen: 'analysis-screen' },
    { no: 5, name: '과학 신문', screen: 'newspaper-screen' }
];

// 모둠 역할 (지도안 기준). 각 단계의 제출 버튼은 담당 역할과 연구 책임자만 누를 수 있다.
const ROLES = [
    { id: 'leader', name: '연구 책임자', duty: '가설, 진행, 발표' },
    { id: 'historian', name: '사료 분석가', duty: '귀납(규칙 찾기)' },
    { id: 'designer', name: '실험 설계자', duty: '변인 통제, 예측' },
    { id: 'measurer', name: '측정 기술자', duty: '측정, 기록' },
    { id: 'analyst', name: '데이터 분석가', duty: '그래프, 핵심 수치' },
    { id: 'reporter', name: '과학 기자', duty: '결론, 고찰, 다른 조에 질문' }
];
const STAGE_SUBMITTERS = {
    story: ['historian'],
    design: ['designer'],
    experiment: ['measurer', 'analyst'],
    analysis: ['reporter'],
    newspaper: ['reporter']
};
function roleName(id) {
    const r = ROLES.find(x => x.id === id);
    return r ? r.name : (id === 'teacher' ? '선생님' : '');
}
function submitterNames(stageKey) {
    return [...STAGE_SUBMITTERS[stageKey].map(roleName), '연구 책임자'].join(' 또는 ');
}

// 1차 그래프 버튼 아래에 보여 줄 설명 (교과서 '데이터 시각화 유형')
const CHART_DESCS = {
    line: '시간 또는 순서에 따른 데이터의 변화를 추적할 때 사용한다.',
    bar: '범주로 구분할 수 있는 데이터의 빈도나 비율을 비교할 때 사용한다.',
    pie: '전체에서 각 범주가 차지하는 비율을 보여 줄 때 사용한다.',
    scatter: '두 변수 간의 상관관계나 패턴을 파악할 때 사용한다.'
};

const CHART_NAMES = { line: '선 그래프', bar: '막대그래프', pie: '원그래프', scatter: '분산형 그래프' };
const COLOR_CTRL = '#2c3e50';
const COLOR_EXP = '#e74c3c';

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function toast(message, type = 'info', onClick) {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    if (onClick) {
        el.classList.add('clickable');
        el.addEventListener('click', () => { onClick(); el.remove(); });
    }
    document.getElementById('toast-area').appendChild(el);
    setTimeout(() => el.classList.add('hide'), type === 'feedback' ? 9000 : 3500);
    setTimeout(() => el.remove(), type === 'feedback' ? 9600 : 4100);
}

function teamLabel(t) {
    return `${t.grade}학년 ${t.class_no}반 ${t.team_no}조`;
}

function timeAgo(iso) {
    if (!iso) return '';
    const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (sec < 60) return '방금';
    if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}시간 전`;
    return `${Math.floor(sec / 86400)}일 전`;
}

// ---------- 고정 씨앗 난수 (같은 모둠·같은 설계면 어느 기기에서도 같은 측정값) ----------
function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function makeRandom(seedText) {
    let a = hashString(seedText);
    return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        let t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
}

// ---------- 설계(변인) 해석 ----------
// 테마를 처음 고르면 변인은 아무것도 정하지 않은 상태로 시작한다 (학생이 하나씩 직접 결정)
function defaultThemeState(themeId) {
    return { 'sim.ctrl': 0, 'sim.exp': 0 };
}

// 변인별 선택 옵션 번호 (-1 = 아직 정하지 않음)
function getConditions(theme, state) {
    const ctrl = [], exp = [], manipulated = [], unset = [];
    theme.vars.forEach((v, i) => {
        const mode = state[`var.${i}.mode`];
        const ci = v.options.indexOf(state[`var.${i}.ctrl`]);
        const isManipulated = mode === 'manipulated';
        const ei = isManipulated ? v.options.indexOf(state[`var.${i}.exp`]) : ci;
        ctrl.push(ci);
        exp.push(ei);
        if (isManipulated) manipulated.push(i);
        if (!mode || ci < 0 || ei < 0) unset.push(i);
    });
    return { ctrl, exp, manipulated, unset };
}

function checkDesign(theme, state) {
    const { ctrl, exp, manipulated, unset } = getConditions(theme, state);
    const errors = [], warnings = [];
    if (unset.length) {
        errors.push(`아직 정하지 않은 변인이 있어요: ${unset.map(i => theme.vars[i].name).join(', ')}`);
    }
    if (manipulated.length === 0) {
        errors.push('조작 변인(다르게 할 조건)을 하나 이상 골라야 해요.');
    }
    manipulated.forEach(i => {
        if (ctrl[i] >= 0 && ctrl[i] === exp[i]) errors.push(`'${theme.vars[i].name}'의 대조군과 실험군 값이 같아요. 서로 다르게 설정해야 비교할 수 있어요.`);
    });
    if (manipulated.length >= 2) {
        warnings.push(`조작 변인이 ${manipulated.length}개예요. 결과에 차이가 나도 어떤 변인 때문인지 구별하기 어려울 수 있어요.`);
    }
    return { errors, warnings, manipulated };
}

function designSignature(themeId, state) {
    const { ctrl, exp, manipulated } = getConditions(THEMES[themeId], state);
    return `${themeId}|${ctrl.join(',')}|${exp.join(',')}|${manipulated.join(',')}`;
}

// ---------- 가설 · 예측 ----------
const HYPO_KEYS = ['hypo.control', 'hypo.manip', 'hypo.dep', 'hypo.effect'];
const PRED_KEYS = ['pred.dir'];

function composeHypothesis(state) {
    const v = k => (state[k] || '').trim();
    return `[${v('hypo.control')}]이(가) 같을 때, [${v('hypo.manip')}]은(는) [${v('hypo.dep')}]에 영향을 ${v('hypo.effect') || '___'}.`;
}

// 예측의 '대조군 값 대신 실험군 값'은 변인 표에서 정한 조작 변인 값을 그대로 쓴다
function predictionValues(state, theme) {
    if (!theme) return { b: state['pred.b'] || '', c: state['pred.c'] || '' };
    const c = getConditions(theme, state);
    const pick = idx => c.manipulated.filter(i => idx[i] >= 0).map(i => theme.vars[i].options[idx[i]]).join(' · ');
    return { b: pick(c.ctrl), c: pick(c.exp) };
}

function composePrediction(state, theme) {
    const v = k => (state[k] || '').trim();
    const { b, c } = predictionValues(state, theme);
    const detail = v('pred.detail');
    return `만약 [${b || '___'}] 대신 [${c || '___'}]을(를) 적용하면, [${v('hypo.dep') || '종속 변인'}]은(는) 대조군보다 ${v('pred.dir') || '___'} 것이다.`
        + (detail ? ` (구체적으로: ${detail})` : '');
}

function conditionText(theme, state, group) {
    const c = getConditions(theme, state);
    const idx = group === 'ctrl' ? c.ctrl : c.exp;
    return theme.vars.map((v, i) => ({ name: v.name, value: idx[i] >= 0 ? v.options[idx[i]] : '미정', manipulated: c.manipulated.includes(i) }));
}

// "대조군(일반 콜라)"처럼 조작 변인의 값을 괄호로 붙인 이름
function shortValue(text) {
    return String(text).replace(/\s*\([^)]*\)/g, '').trim() || String(text);
}
function groupLabel(theme, state, group) {
    const base = group === 'ctrl' ? '대조군' : '실험군';
    if (!theme) return base;
    const c = getConditions(theme, state);
    const idx = group === 'ctrl' ? c.ctrl : c.exp;
    const values = c.manipulated.filter(i => idx[i] >= 0).map(i => shortValue(theme.vars[i].options[idx[i]]));
    return values.length ? `${base}(${values.join('·')})` : base;
}

// 실제 측정값(시뮬레이션 결과). 학생 화면에서는 측정한 시점까지만 보여 준다.
function simulate(teamId, themeId, state) {
    const theme = THEMES[themeId];
    const c = getConditions(theme, state);
    const sig = designSignature(themeId, state);
    const d = theme.measure.decimals;
    const run = (cond, g) => theme.model(cond.map(x => Math.max(0, x)), makeRandom(`${teamId}|${sig}|${g}`))
        .map(v => roundTo(Math.max(0, v), d));
    return { ctrl: run(c.ctrl, 'ctrl'), exp: run(c.exp, 'exp') };
}

function roundTo(v, d) {
    const f = Math.pow(10, d);
    return Math.round(v * f) / f;
}

function toNum(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

function fmtNum(n, d) {
    if (n === null || n === undefined || !Number.isFinite(n)) return '-';
    return Number(n).toFixed(d);
}

// 학생이 기록표에 직접 입력한 값 (g: 'c' 대조군, 'e' 실험군)
function readSeries(state, g) {
    return [0, 1, 2, 3, 4].map(i => toNum(state[`data.${g}.${i}`]));
}

function reasonSentence(kind, state) {
    if (state[`reason${kind}.text`]) return state[`reason${kind}.text`].trim();
    const a = state[`reason${kind}.1`], b = state[`reason${kind}.2`];
    if (!a && !b) return '';
    const first = kind === 1 ? '우리 조가 수집한 데이터는' : '우리가 가공한 핵심 데이터는';
    const mid = kind === 1 ? '을(를) 파악하는 것이 중요하므로, 이를 가장 잘 표현하는' : '을(를) 강조해야 하므로, 이를 가장 잘 보여주는';
    return `"${first} ${a || '___'}${mid} ${b || '___'}를(을) 선택했다."`;
}

// 가설 검증 결과(근거 + 결론 또는 수정 가설·새 예측)를 보여 주는 HTML
function validationDetailHtml(state) {
    const block = (title, text) => `<h4>${title}</h4><p>${text && String(text).trim() ? escapeHtml(text) : '<span class="muted">미작성</span>'}</p>`;
    if (!state.validation) return '<p class="muted">아직 가설을 검증하지 않았어요.</p>';
    let html = block('📌 판단 근거', state['val.evidence']);
    if (state.validation === '수용') html += block('✅ 탐구 결론', state.conclusion);
    else html += block('🔧 가설 수정 방안', state['val.revised']) + block('🔮 수정한 가설에 따른 새로운 예측', state['val.newPrediction']);
    return html;
}

function lastAIAnswer(messages) {
    const list = messages.filter(m => m.channel === 'ai' && m.role === 'ai');
    return list.length ? list[list.length - 1].content : '';
}

// ---------- 그래프 ----------
// kind 1: 시간에 따른 로우 데이터 / kind 2: 가공 데이터(대조군 vs 실험군 2개 값)
function buildChartConfig(kind, type, theme, state) {
    const m = theme.measure;
    const yTitle = `${m.name} (${m.unit})`;
    const cl = groupLabel(theme, state, 'ctrl');
    const el = groupLabel(theme, state, 'exp');
    const common = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } }
    };

    if (kind === 1) {
        const ctrl = readSeries(state, 'c');
        const exp = readSeries(state, 'e');
        const labels = m.labels;
        if (type === 'line' || type === 'bar') {
            return {
                type,
                data: {
                    labels,
                    datasets: [
                        { label: cl, data: ctrl, borderColor: COLOR_CTRL, backgroundColor: COLOR_CTRL, borderWidth: 2, tension: 0.3, spanGaps: true },
                        { label: el, data: exp, borderColor: COLOR_EXP, backgroundColor: COLOR_EXP, borderWidth: 2, tension: 0.3, spanGaps: true }
                    ]
                },
                options: { ...common, scales: { x: { title: { display: true, text: m.axis } }, y: { title: { display: true, text: yTitle } } } }
            };
        }
        if (type === 'pie') {
            return {
                type: 'pie',
                data: {
                    labels: [`${cl} ${labels[4]}`, `${el} ${labels[4]}`],
                    datasets: [{ data: [ctrl[4], exp[4]], backgroundColor: [COLOR_CTRL, COLOR_EXP] }]
                },
                options: { ...common, plugins: { ...common.plugins, title: { display: true, text: `마지막 측정 시점(${labels[4]})의 값` } } }
            };
        }
        // scatter
        const toPoints = arr => arr.map((v, i) => (v === null ? null : { x: i, y: v })).filter(Boolean);
        return {
            type: 'scatter',
            data: {
                datasets: [
                    { label: cl, data: toPoints(ctrl), backgroundColor: COLOR_CTRL, pointRadius: 6 },
                    { label: el, data: toPoints(exp), backgroundColor: COLOR_EXP, pointRadius: 6 }
                ]
            },
            options: {
                ...common,
                scales: {
                    x: { type: 'linear', min: -0.5, max: 4.5, title: { display: true, text: m.axis }, ticks: { stepSize: 1, callback: v => labels[v] ?? '' } },
                    y: { title: { display: true, text: yTitle } }
                }
            }
        };
    }

    // kind 2: 학생이 고른 핵심 가공 데이터에 맞는 그래프를 자동으로 그린다
    return buildSummaryChart(theme, state, common);
}

// 그래프가 무엇을 보여 주는지에 대한 사실 설명 (판단은 학생 몫)
function chartNote(kind, type, state) {
    if (type === 'pie' && kind === 1) return '이 원그래프는 마지막 측정 시점의 두 값만 나타냅니다.';
    return '';
}

// 그래프를 이미지(PNG 데이터)로 만든다. 흰 배경을 깔아 신문·대시보드에서 보기 좋게 한다.
const whiteBackgroundPlugin = {
    id: 'whiteBackground',
    beforeDraw(chart) {
        const { ctx, width, height } = chart;
        ctx.save();
        ctx.globalCompositeOperation = 'destination-over';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.restore();
    }
};

function chartToImage(config, width = 720, height = 440) {
    const holder = document.createElement('div');
    holder.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:${height}px;`;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    holder.appendChild(canvas);
    document.body.appendChild(holder);
    const chart = new Chart(canvas, {
        ...config,
        options: { ...config.options, responsive: false, animation: false, devicePixelRatio: 1 },
        plugins: [whiteBackgroundPlugin]
    });
    const url = chart.toBase64Image('image/png');
    chart.destroy();
    holder.remove();
    return url;
}

// ==========================================
// 2차 그래프: 핵심 가공 데이터
// ------------------------------------------
// group  : pair(두 집단 비교 → 막대) / series(시간에 따른 변화 → 선) / ratio(비율 → 원)
// rows   : 입력 표의 줄 (c 대조군, e 실험군, d 두 집단의 차이, s 하나의 값)
// cols   : 1(값 하나) 또는 5(측정 시점마다)
// compute: 학생 기록표 값으로 계산한 '확인용' 값 (학생에게 정답을 보여 주지는 않고, 다른지 여부만 알려 줌)
// ==========================================
const METRIC_GROUPS = [
    { id: 'pair', name: '두 집단 비교', chart: 'bar', why: '두 집단의 값 하나씩을 크기로 비교하는 데이터라서 막대그래프로 그렸어요.' },
    { id: 'series', name: '시간에 따른 변화', chart: 'line', why: '측정 시점(순서)에 따라 값이 어떻게 달라지는지 보여 주는 데이터라서 선 그래프로 그렸어요.' },
    { id: 'ratio', name: '비율', chart: 'pie', why: '전체에서 각 부분이 차지하는 비율을 나타내는 데이터라서 원그래프로 그렸어요.' }
];

const statOf = {
    range: v => (v.some(x => x === null) ? null : Math.max(...v) - Math.min(...v)),
    max: v => (v.some(x => x === null) ? null : Math.max(...v)),
    mean: v => (v.some(x => x === null) ? null : v.reduce((a, b) => a + b, 0) / v.length),
    first: v => v[0],
    last: v => v[4],
    change: v => (v[0] === null || v[4] === null ? null : v[4] - v[0]),
    rate: v => (v[0] === null || v[4] === null || v[0] === 0 ? null : (v[4] - v[0]) / v[0] * 100),
    ratio: (a, b) => (a === null || b === null || b === 0 ? null : a / b)
};

const METRICS = [
    { id: 'range', group: 'pair', name: '최대 변화량', desc: '각 집단에서 가장 큰 값 − 가장 작은 값 (값이 얼마나 크게 움직였나)',
        prompt: '대조군과 실험군의 최대 변화량(최댓값-최솟값)을 각각 계산해 줘.', compute: (c, e) => ({ c: [statOf.range(c)], e: [statOf.range(e)] }) },
    { id: 'final', group: 'pair', name: '마지막 시점의 값', desc: '마지막으로 측정한 시점의 값 (실험이 끝났을 때의 결과)',
        prompt: '최종 시점(마지막 측정)에서 두 집단 간 수치 차이를 비교해 줘.', compute: (c, e) => ({ c: [statOf.last(c)], e: [statOf.last(e)] }) },
    { id: 'mean', group: 'pair', name: '평균', desc: '다섯 번 측정한 값을 모두 더해 5로 나눈 값 (전체적인 수준)', decimalsPlus: 1,
        prompt: '대조군과 실험군의 평균을 각각 구해 줘.', compute: (c, e) => ({ c: [statOf.mean(c)], e: [statOf.mean(e)] }) },
    { id: 'max', group: 'pair', name: '최댓값', desc: '측정한 값 중 가장 큰 값 (가장 높이 올라간 정도)',
        prompt: '두 집단의 최댓값을 각각 알려 줘.', compute: (c, e) => ({ c: [statOf.max(c)], e: [statOf.max(e)] }) },
    { id: 'change', group: 'pair', name: '처음 대비 변화량', desc: '마지막 값 − 처음 값 (처음보다 얼마나 늘거나 줄었나)',
        prompt: '처음 대비 변화량(마지막 값 − 처음 값)을 각각 구해 줘.', compute: (c, e) => ({ c: [statOf.change(c)], e: [statOf.change(e)] }) },
    { id: 'rate', group: 'pair', name: '처음 대비 변화율(%)', desc: '(마지막 값 − 처음 값) ÷ 처음 값 × 100 (처음 값이 달라도 공정하게 비교)', unit: '%', decimals: 1, exclude: ['vaccine'],
        prompt: '처음 측정값 대비 마지막 측정값의 변화율(%)을 구해 줘.', compute: (c, e) => ({ c: [statOf.rate(c)], e: [statOf.rate(e)] }) },
    { id: 'peakTime', group: 'pair', name: '가장 높았던 시점', desc: '값이 가장 높았던 측정 시점 (언제 최고점에 도달했나)', themes: ['cola', 'vaccine'], unit: 'time', decimals: 0,
        prompt: '값이 가장 높았던 시점을 집단별로 알려 줘.',
        compute: (c, e, th) => {
            const t = th.measure.labels.map(l => parseInt(l, 10) || 0);
            const peak = v => (v.some(x => x === null) ? null : t[v.indexOf(Math.max(...v))]);
            return { c: [peak(c)], e: [peak(e)] };
        } },
    { id: 'survival', group: 'pair', name: '생존율(%)', desc: '5세대 개체 수 ÷ 1세대 개체 수 × 100 (처음 무리 중 얼마나 남았나)', themes: ['selection'], unit: '%', decimals: 1,
        prompt: '각 집단의 생존율(5세대 ÷ 1세대 × 100)을 구해 줘.',
        compute: (c, e) => ({ c: [statOf.ratio(c[4], c[0]) === null ? null : statOf.ratio(c[4], c[0]) * 100], e: [statOf.ratio(e[4], e[0]) === null ? null : statOf.ratio(e[4], e[0]) * 100] }) },
    { id: 'fold', group: 'pair', name: '증식 배수', desc: '마지막 콜로니 수 ÷ 처음 콜로니 수 (몇 배로 늘었나)', themes: ['penicillin'], unit: '배', decimals: 1,
        prompt: '각 집단의 증식 배수(마지막 ÷ 처음)를 구해 줘.', compute: (c, e) => ({ c: [statOf.ratio(c[4], c[0])], e: [statOf.ratio(e[4], e[0])] }) },
    { id: 'diffSeries', group: 'series', name: '시점별 두 집단의 차이', desc: '측정 시점마다 (실험군 − 대조군) — 차이가 언제 커지고 작아지나', rows: ['d'], cols: 5,
        prompt: '각 측정 시점마다 두 집단의 차이(실험군 − 대조군)를 구해 줘.',
        compute: (c, e) => ({ d: c.map((x, i) => (x === null || e[i] === null ? null : e[i] - x)) }) },
    { id: 'rateSeries', group: 'series', name: '시점별 처음 대비 변화율(%)', desc: '각 시점의 (값 − 처음 값) ÷ 처음 값 × 100 — 처음 값을 0%로 맞춰 변화 추이를 비교', cols: 5, unit: '%', decimals: 1, exclude: ['vaccine'],
        prompt: '각 측정 시점의 처음 대비 변화율(%)을 집단별로 구해 줘.',
        compute: (c, e) => {
            const r = v => v.map(x => (x === null || v[0] === null || v[0] === 0 ? null : (x - v[0]) / v[0] * 100));
            return { c: r(c), e: r(e) };
        } },
    { id: 'share', group: 'ratio', name: '마지막 세대 생존 개체의 구성 비율(%)', desc: '마지막 세대에 살아남은 쥐 전체 중 각 집단이 차지하는 비율', themes: ['selection'], unit: '%', decimals: 1,
        prompt: '마지막 세대에서 살아남은 개체 중 각 집단이 차지하는 비율(%)을 구해 줘.',
        compute: (c, e) => {
            const total = c[4] === null || e[4] === null ? null : c[4] + e[4];
            return total ? { c: [c[4] / total * 100], e: [e[4] / total * 100] } : { c: [null], e: [null] };
        } },
    { id: 'inhibition', group: 'ratio', name: '세균 억제율(%)', desc: '(대조군 최종 − 실험군 최종) ÷ 대조군 최종 × 100 — 실험군에서 세균이 얼마나 덜 자랐나', themes: ['penicillin'], rows: ['s'], unit: '%', decimals: 1,
        prompt: '세균 억제율((대조군 최종 − 실험군 최종) ÷ 대조군 최종 × 100)을 구해 줘.',
        compute: (c, e) => ({ s: [c[4] === null || e[4] === null || c[4] === 0 ? null : (c[4] - e[4]) / c[4] * 100] }) }
];

function metricsForTheme(themeId) {
    return METRICS.filter(m => (!m.themes || m.themes.includes(themeId)) && !(m.exclude || []).includes(themeId));
}

function metricById(id) {
    return METRICS.find(m => m.id === id) || null;
}

// '직접 정한 가공 데이터': AI에게 직접 질문해서 구한 값처럼 목록에 없는 데이터
const CUSTOM_SHAPES = [
    { id: 'pair', name: '두 집단의 값 하나씩', rows: ['c', 'e'], cols: 1 },
    { id: 'series', name: '측정 시점마다 두 집단의 값', rows: ['c', 'e'], cols: 5 },
    { id: 'ratio', name: '전체 중 두 집단의 비율(%)', rows: ['c', 'e'], cols: 1 }
];

function customMetric(state) {
    const shape = CUSTOM_SHAPES.find(x => x.id === state['sum.custom.shape']) || CUSTOM_SHAPES[0];
    const unit = (state['sum.custom.unit'] || '').trim();
    return {
        id: 'custom', custom: true, group: shape.id,
        name: (state['sum.custom.name'] || '').trim() || '직접 정한 가공 데이터',
        desc: 'AI에게 직접 질문해서 구한 값처럼 목록에 없는 가공 데이터',
        rows: shape.rows, cols: shape.cols,
        unit: shape.id === 'ratio' ? '%' : unit, decimals: 2,
        compute: () => ({})     // 자동 확인은 하지 않음
    };
}

// 지금 모둠이 고른 핵심 가공 데이터 (목록 + 직접 정한 데이터)
function resolveMetric(state) {
    const id = state['sum.metric'];
    if (id === 'custom') return customMetric(state);
    return metricById(id);
}

function metricRows(m) {
    return m.rows || ['c', 'e'];
}

function metricCols(m) {
    return m.cols || 1;
}

function metricUnit(m, theme) {
    if (m.unit === 'time') return theme.measure.labels[4].replace(/[0-9.\s]/g, '');
    if (m.custom) return m.unit;
    return m.unit || theme.measure.unit;
}

function metricDecimals(m, theme) {
    if (typeof m.decimals === 'number') return m.decimals;
    return theme.measure.decimals + (m.decimalsPlus || 0);
}

function metricRowLabel(m, theme, state, row) {
    if (row === 'c') return groupLabel(theme, state, 'ctrl');
    if (row === 'e') return groupLabel(theme, state, 'exp');
    if (row === 'd') return '차이 (실험군 − 대조군)';
    return m.name;
}

function metricColLabels(m, theme) {
    return metricCols(m) === 5 ? theme.measure.labels : [m.name];
}

function summaryKey(metricId, row, col) {
    return `sum.${metricId}.${row}.${col}`;
}

// 학생이 입력한 가공 데이터 값 { c: [..], e: [..] } 등
function summaryValues(m, state) {
    const out = {};
    metricRows(m).forEach(r => {
        out[r] = Array.from({ length: metricCols(m) }, (_, i) => toNum(state[summaryKey(m.id, r, i)]));
    });
    return out;
}

// 입력값 확인: 기록표 값으로 계산한 값과 비교 (반올림 차이는 허용)
function summaryCheck(theme, state) {
    const m = resolveMetric(state);
    if (!m) return null;
    const expected = m.compute(readSeries(state, 'c'), readSeries(state, 'e'), theme);
    const entered = summaryValues(m, state);
    const d = metricDecimals(m, theme);
    const status = {};
    let wrong = 0, unknown = 0, empty = 0;
    metricRows(m).forEach(r => entered[r].forEach((v, i) => {
        const key = summaryKey(m.id, r, i);
        const exp = expected[r] ? expected[r][i] : null;
        if (v === null) { status[key] = 'empty'; empty++; return; }
        if (exp === null || exp === undefined) { status[key] = 'unknown'; unknown++; return; }
        const tol = Math.max(0.51 * Math.pow(10, -d), Math.abs(exp) * 0.01);
        if (Math.abs(v - exp) <= tol) status[key] = 'ok';
        else { status[key] = 'wrong'; wrong++; }
    }));
    return { metric: m, expected, entered, status, wrong, unknown, empty };
}

function buildSummaryChart(theme, state, common) {
    const m = resolveMetric(state);
    if (!m) return { type: 'bar', data: { labels: [], datasets: [] }, options: common };
    const group = METRIC_GROUPS.find(g => g.id === m.group);
    const v = summaryValues(m, state);
    const unit = metricUnit(m, theme);
    const yTitle = `${m.name}${unit && !m.name.includes(`(${unit})`) ? ` (${unit})` : ''}`;
    const cl = groupLabel(theme, state, 'ctrl'), el = groupLabel(theme, state, 'exp');
    if (group.chart === 'bar') {
        return {
            type: 'bar',
            data: { labels: [cl, el], datasets: [{ label: yTitle, data: [v.c[0], v.e[0]], backgroundColor: [COLOR_CTRL, COLOR_EXP] }] },
            options: { ...common, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: yTitle } } } }
        };
    }
    if (group.chart === 'line') {
        const datasets = m.id === 'diffSeries'
            ? [{ label: '차이 (실험군 − 대조군)', data: v.d, borderColor: '#8e44ad', backgroundColor: '#8e44ad', borderWidth: 2, tension: 0.3, spanGaps: true }]
            : [{ label: cl, data: v.c, borderColor: COLOR_CTRL, backgroundColor: COLOR_CTRL, borderWidth: 2, tension: 0.3, spanGaps: true },
               { label: el, data: v.e, borderColor: COLOR_EXP, backgroundColor: COLOR_EXP, borderWidth: 2, tension: 0.3, spanGaps: true }];
        return {
            type: 'line',
            data: { labels: theme.measure.labels, datasets },
            options: { ...common, scales: { x: { title: { display: true, text: theme.measure.axis } }, y: { title: { display: true, text: yTitle } } } }
        };
    }
    // 원그래프
    const pie = m.id === 'inhibition'
        ? { labels: ['줄어든 비율 (억제)', '남은 비율'], data: [v.s[0], v.s[0] === null ? null : 100 - v.s[0]], colors: ['#27ae60', '#d5dbdb'] }
        : { labels: [cl, el], data: [v.c[0], v.e[0]], colors: [COLOR_CTRL, COLOR_EXP] };
    return {
        type: 'pie',
        data: { labels: pie.labels, datasets: [{ data: pie.data, backgroundColor: pie.colors }] },
        options: { ...common, plugins: { ...common.plugins, title: { display: true, text: yTitle } } }
    };
}

// 2차 그래프 아래 안내: 왜 이 그래프로 그렸는지
function summaryChartWhy(state) {
    const m = resolveMetric(state);
    if (!m) return '';
    const group = METRIC_GROUPS.find(g => g.id === m.group);
    const v = summaryValues(m, state);
    const negative = group.chart === 'pie' && Object.values(v).some(arr => arr.some(x => x !== null && (x < 0 || x > 100)));
    const notHundred = m.id === 'share' && v.c[0] !== null && v.e[0] !== null && Math.abs(v.c[0] + v.e[0] - 100) > 1;
    return `📊 ${group.why}${negative ? ' (원그래프는 0~100% 범위 밖의 값을 나타낼 수 없어요. 값을 다시 확인해 보세요.)' : ''}`
        + (notHundred ? ' (구성 비율은 두 값을 더하면 100%가 되어야 해요.)' : '');
}

// 가설 검증·신문·교사 화면에 쓰는 한 줄 요약
function summaryText(theme, state) {
    const m = resolveMetric(state);
    if (!m) return '';
    const v = summaryValues(m, state);
    const unit = metricUnit(m, theme);
    const f = x => (x === null ? '?' : `${x}${unit === '%' ? '%' : unit ? ` ${unit}` : ''}`);
    if (metricCols(m) === 5) {
        return `${m.name} — ` + metricRows(m).map(r =>
            `${metricRowLabel(m, theme, state, r)}: ${theme.measure.labels.map((l, i) => `${l} ${v[r][i] === null ? '?' : v[r][i]}`).join(', ')}`).join(' / ');
    }
    return `${m.name} — ` + metricRows(m).map(r => (r === 's' ? f(v[r][0]) : `${metricRowLabel(m, theme, state, r)}: ${f(v[r][0])}`)).join(' / ');
}

// ==========================================
// 과학 신문 (학생 화면과 교사 대시보드가 같은 모양으로 그린다)
// ------------------------------------------
// editable: 학생 화면이면 인터뷰 답변을 신문 안에서 바로 쓸 수 있게 입력칸으로 만든다
// ==========================================
const INTERVIEW_QUESTIONS = [
    { key: 'interview.q1', q: '실제 실험이었다면 어떤 오차 요인이 있었을까요?',
        example: '예: (식물 실험이라면) 화분마다 흙의 양이 조금씩 달랐을 수 있고, 키를 잴 때 자의 눈금을 읽는 위치가 달랐을 수 있어요.' },
    { key: 'interview.q2', q: '그 오차를 고려해도, 여러분의 결론은 실제 상황에서도 성립한다고 말할 수 있을까요? 어떤 상황에 적용할 수 있을까요?',
        example: '예: (식물 실험이라면) 오차보다 두 집단의 차이가 훨씬 커서 결론은 성립한다고 생각해요. 베란다 화분을 키울 때 햇빛이 잘 드는 곳에 두는 데 적용할 수 있어요.' }
];

function comicPanelHtml(theme, index, big = false) {
    const p = theme.comic[index] || theme.comic[0];
    const visual = p.image
        ? `<img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.text)}">`
        : `<div class="np-emoji">${p.emoji}</div>`;
    return `<div class="np-panel ${big ? 'big' : ''}">${visual}<p>${escapeHtml(p.text)}</p></div>`;
}

function buildNewspaperHtml({ team, theme, state, chart1Url, chart2Url, editable }) {
    const s = state;
    const none = '<span class="np-empty">(아직 작성하지 않았어요)</span>';
    const text = v => (v && String(v).trim() ? escapeHtml(v) : none);
    const c = getConditions(theme, s);
    const cl = groupLabel(theme, s, 'ctrl'), el = groupLabel(theme, s, 'exp');
    const when = s['newspaper.submittedAt'] ? new Date(s['newspaper.submittedAt']) : new Date();
    const dateText = when.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });

    // 1면: 문제 상황
    const panelIndex = Math.max(0, Math.min(theme.comic.length - 1, Number(s['news.panel'] || 0)));
    const figure = theme.image
        ? `<div class="np-panel big"><img src="${escapeHtml(theme.image)}" alt="${escapeHtml(theme.title)}"></div>`
        : comicPanelHtml(theme, panelIndex, true);

    // 탐구 설계
    const nManip = c.manipulated.length;
    const designRows = theme.vars.map((v, i) => {
        const manip = c.manipulated.includes(i);
        const val = idx => (idx >= 0 ? escapeHtml(shortValue(v.options[idx])) : '미정');
        return manip
            ? `<tr class="manip"><td>${escapeHtml(v.name)}<small>조작</small></td><td>${val(c.ctrl[i])}</td><td>${val(c.exp[i])}</td></tr>`
            : `<tr><td>${escapeHtml(v.name)}<small>통제</small></td><td colspan="2">같게: ${val(c.ctrl[i])}</td></tr>`;
    }).join('');

    // 2차 그래프 제목은 데이터 모양에 따라
    const m = resolveMetric(s);
    const head2 = !m ? '숫자로 확인한 결정적 증거' : m.group === 'series' ? '시간이 말해 주는 결정적 차이' : m.group === 'ratio' ? '비율로 본 결정적 증거' : '숫자 하나가 모든 것을 말한다';

    // 가설 검증
    const verdict = s.validation === '수용' ? { cls: 'accept', stamp: '가설 수용', head: '예측 적중! 가설, 데이터로 증명되다' }
        : s.validation === '기각' ? { cls: 'reject', stamp: '가설 기각', head: '반전! 가설 기각… 그러나 탐구는 계속된다' }
            : { cls: '', stamp: '판정 대기', head: '판정을 기다리는 중' };
    const conclusionBlock = s.validation === '기각'
        ? `<h3 class="np-head">다음 탐구를 향해</h3>
           <div class="np-quote"><span class="np-label">수정한 가설</span>${text(s['val.revised'])}</div>
           <div class="np-quote pred"><span class="np-label">새로운 예측</span>${text(s['val.newPrediction'])}</div>`
        : `<h3 class="np-head">그래서, 결론은?</h3><p class="np-conclusion">${s.validation ? text(s.conclusion) : none}</p>`;

    const img = (url, alt) => (url ? `<img class="np-chart" src="${url}" alt="${alt}">` : `<div class="np-chart empty">${none}</div>`);

    const interview = INTERVIEW_QUESTIONS.map(item => `
        <div class="np-qa">
            <p class="np-q">Q. ${escapeHtml(item.q)}</p>
            ${editable
                ? `<textarea class="np-answer-input" data-key="${item.key}" rows="3" placeholder="${escapeHtml(item.example)}"></textarea>`
                : `<p class="np-a">A. ${text(s[item.key])}</p>`}
        </div>`).join('');

    return `
    <article class="np">
        <header class="np-mast">
            <div class="np-meta"><span>제1호</span><span>${dateText}</span><span>과학탐구실험 특별판</span></div>
            <h1 class="np-title">${escapeHtml(teamLabel(team))} 과학 일보</h1>
            <div class="np-slogan">데이터가 말해 주는 생명과학의 진실 · ${theme.icon} ${escapeHtml(theme.title)}</div>
        </header>

        <section class="np-lead">
            ${figure}
            <div class="np-lead-text">
                <span class="np-kicker">문제 상황</span>
                <h2 class="np-headline">“${escapeHtml(theme.teaser)}” 미스터리에 도전한 연구팀</h2>
                <p class="np-story">${escapeHtml(theme.story)}</p>
                <div class="np-quote problem"><span class="np-label">우리가 풀 미스터리</span>${text(s.problem)}</div>
            </div>
        </section>

        <div class="np-grid">
            <section class="np-col">
                <h3 class="np-head">그들은 탐구 설계부터 남달랐다</h3>
                <p class="np-deck">조작 변인 ${nManip}개, 통제 변인 ${theme.vars.length - nManip}개 — 공정한 비교를 위한 치밀한 준비</p>
                <table class="np-table"><thead><tr><th>변인</th><th>${escapeHtml(cl)}</th><th>${escapeHtml(el)}</th></tr></thead><tbody>${designRows}</tbody></table>
                <h3 class="np-head">과감한 가설, 대담한 예측</h3>
                <div class="np-quote"><span class="np-label">가설</span>${text(s.hypothesis || (s['hypo.manip'] ? composeHypothesis(s) : ''))}</div>
                <div class="np-quote pred"><span class="np-label">예측</span>${text(s.prediction || (s['pred.dir'] ? composePrediction(s, theme) : ''))}</div>
            </section>

            <section class="np-col">
                <h3 class="np-head">데이터는 거짓말을 하지 않는다</h3>
                ${img(chart1Url, '1차 그래프')}
                <p class="np-caption">그래프를 고른 이유: ${text(reasonSentence(1, s))}</p>
                <h3 class="np-head">${head2}</h3>
                ${img(chart2Url, '2차 그래프')}
                <p class="np-caption">${m ? escapeHtml(summaryText(theme, s)) : none}</p>
            </section>

            <section class="np-col">
                <h3 class="np-head">${verdict.head}</h3>
                <div class="np-stamp ${verdict.cls}">${verdict.stamp}</div>
                <div class="np-quote"><span class="np-label">판단 근거</span>${text(s['val.evidence'])}</div>
                ${conclusionBlock}
            </section>
        </div>

        <section class="np-interview">
            <h3 class="np-head">연구팀 단독 인터뷰 — “오차까지 따져 봤습니다”</h3>
            ${interview}
        </section>
    </article>`;
}
