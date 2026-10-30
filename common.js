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
const PRED_KEYS = ['pred.b', 'pred.c', 'pred.dir'];

function composeHypothesis(state) {
    const v = k => (state[k] || '').trim();
    return `[${v('hypo.control')}]이(가) 같을 때, [${v('hypo.manip')}]은(는) [${v('hypo.dep')}]에 영향을 ${v('hypo.effect') || '___'}.`;
}

function composePrediction(state) {
    const v = k => (state[k] || '').trim();
    const detail = v('pred.detail');
    return `만약 [${v('pred.b')}] 대신 [${v('pred.c')}]을(를) 적용하면, [${v('hypo.dep')}]은(는) ${v('pred.dir') || '___'} 것이다.`
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
    const yTitle = kind === 1 ? `${m.name} (${m.unit})` : (state['summary.label'] || '가공 데이터');
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

    // kind 2
    const c = toNum(state['summary.c']);
    const e = toNum(state['summary.e']);
    const labels = [cl, el];
    if (type === 'bar') {
        return {
            type: 'bar',
            data: { labels, datasets: [{ label: yTitle, data: [c, e], backgroundColor: [COLOR_CTRL, COLOR_EXP] }] },
            options: { ...common, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, title: { display: true, text: yTitle } } } }
        };
    }
    if (type === 'pie') {
        return {
            type: 'pie',
            data: { labels, datasets: [{ data: [c, e], backgroundColor: [COLOR_CTRL, COLOR_EXP] }] },
            options: { ...common, plugins: { ...common.plugins, title: { display: true, text: yTitle } } }
        };
    }
    if (type === 'line') {
        return {
            type: 'line',
            data: { labels, datasets: [{ label: yTitle, data: [c, e], borderColor: '#7f8c8d', pointBackgroundColor: [COLOR_CTRL, COLOR_EXP], pointRadius: 7 }] },
            options: { ...common, plugins: { legend: { display: false } }, scales: { y: { title: { display: true, text: yTitle } } } }
        };
    }
    return {
        type: 'scatter',
        data: { datasets: [{ label: yTitle, data: [c === null ? null : { x: 0, y: c }, e === null ? null : { x: 1, y: e }].filter(Boolean), backgroundColor: [COLOR_CTRL, COLOR_EXP], pointRadius: 8 }] },
        options: {
            ...common,
            plugins: { legend: { display: false } },
            scales: {
                x: { type: 'linear', min: -0.5, max: 1.5, ticks: { stepSize: 1, callback: v => labels[v] ?? '' } },
                y: { title: { display: true, text: yTitle } }
            }
        }
    };
}

// 그래프가 무엇을 보여 주는지에 대한 사실 설명 (판단은 학생 몫)
function chartNote(kind, type, state) {
    if (type === 'pie' && kind === 1) return '이 원그래프는 마지막 측정 시점의 두 값만 나타냅니다.';
    if (type === 'pie' && kind === 2) {
        const c = toNum(state['summary.c']), e = toNum(state['summary.e']);
        if ((c !== null && c < 0) || (e !== null && e < 0)) return '원그래프는 음수 값을 조각으로 나타낼 수 없습니다.';
    }
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
