// ==========================================
// 학생 화면과 교사 대시보드가 함께 쓰는 공통 기능
// ==========================================
// 학생 화면은 로그인 정보를 쓰지 않는다 (같은 브라우저에 교사가 로그인해 있어도 학생으로 동작)
const IS_TEACHER_PAGE = document.body.classList.contains('teacher');
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY,
    IS_TEACHER_PAGE ? {} : { auth: { persistSession: false, autoRefreshToken: false } });

const STAGES = [
    { no: 1, name: '문제 인식', screen: 'story-screen' },
    { no: 2, name: '탐구 설계', screen: 'hypothesis-screen' },
    { no: 3, name: '실험·데이터', screen: 'simulation-screen' },
    { no: 4, name: '분석·검증', screen: 'analysis-screen' },
    { no: 5, name: '과학 신문', screen: 'newspaper-screen' }
];

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
function defaultThemeState(themeId) {
    const s = {};
    THEMES[themeId].vars.forEach((v, i) => {
        s[`var.${i}.mode`] = i === 0 ? 'manipulated' : 'controlled';
        s[`var.${i}.ctrl`] = v.options[0];
        s[`var.${i}.exp`] = v.options[1];
    });
    s['sim.ctrl'] = 0;
    s['sim.exp'] = 0;
    return s;
}

function getConditions(theme, state) {
    const ctrl = [], exp = [], manipulated = [];
    theme.vars.forEach((v, i) => {
        const ci = Math.max(0, v.options.indexOf(state[`var.${i}.ctrl`]));
        const isManipulated = state[`var.${i}.mode`] === 'manipulated';
        const ei = isManipulated ? Math.max(0, v.options.indexOf(state[`var.${i}.exp`])) : ci;
        ctrl.push(ci);
        exp.push(ei);
        if (isManipulated) manipulated.push(i);
    });
    return { ctrl, exp, manipulated };
}

function checkDesign(theme, state) {
    const { ctrl, exp, manipulated } = getConditions(theme, state);
    const errors = [], warnings = [];
    if (manipulated.length === 0) {
        errors.push('조작 변인(다르게 할 조건)을 하나 이상 골라야 해요.');
    }
    manipulated.forEach(i => {
        if (ctrl[i] === exp[i]) errors.push(`'${theme.vars[i].name}'의 대조군과 실험군 값이 같아요. 서로 다르게 설정해야 비교할 수 있어요.`);
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

function composeHypothesis(state) {
    const v = k => (state[k] || '').trim();
    return `만약 통제 변인인 [${v('hypo.control')}] 상태에서 조작 변인으로 [${v('hypo.mctrl')}] 대신 [${v('hypo.mexp')}]을(를) 적용한다면, 결과는 [${v('hypo.predict')}] 것이다.`;
}

function conditionText(theme, state, group) {
    const c = getConditions(theme, state);
    const idx = group === 'ctrl' ? c.ctrl : c.exp;
    return theme.vars.map((v, i) => ({ name: v.name, value: v.options[idx[i]], manipulated: c.manipulated.includes(i) }));
}

// 실제 측정값(시뮬레이션 결과). 학생 화면에서는 측정한 시점까지만 보여 준다.
function simulate(teamId, themeId, state) {
    const theme = THEMES[themeId];
    const c = getConditions(theme, state);
    const sig = designSignature(themeId, state);
    const d = theme.measure.decimals;
    const run = (cond, g) => theme.model(cond, makeRandom(`${teamId}|${sig}|${g}`))
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
    const a = state[`reason${kind}.1`], b = state[`reason${kind}.2`];
    if (!a && !b) return '';
    const first = kind === 1 ? '우리 조가 수집한 데이터는' : '우리가 가공한 핵심 데이터는';
    const mid = kind === 1 ? '을(를) 파악하는 것이 중요하므로, 이를 가장 잘 표현하는' : '을(를) 강조해야 하므로, 이를 가장 잘 보여주는';
    return `"${first} ${a || '___'}${mid} ${b || '___'}를(을) 선택했다."`;
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
                        { label: '대조군', data: ctrl, borderColor: COLOR_CTRL, backgroundColor: COLOR_CTRL, borderWidth: 2, tension: 0.3, spanGaps: true },
                        { label: '실험군', data: exp, borderColor: COLOR_EXP, backgroundColor: COLOR_EXP, borderWidth: 2, tension: 0.3, spanGaps: true }
                    ]
                },
                options: { ...common, scales: { x: { title: { display: true, text: m.axis } }, y: { title: { display: true, text: yTitle } } } }
            };
        }
        if (type === 'pie') {
            return {
                type: 'pie',
                data: {
                    labels: [`대조군 (${labels[4]})`, `실험군 (${labels[4]})`],
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
                    { label: '대조군', data: toPoints(ctrl), backgroundColor: COLOR_CTRL, pointRadius: 6 },
                    { label: '실험군', data: toPoints(exp), backgroundColor: COLOR_EXP, pointRadius: 6 }
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
    const labels = ['대조군', '실험군'];
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
