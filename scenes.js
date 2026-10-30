// ==========================================
// 테마별 실험 장면 (플랫 일러스트 · SVG)
// ------------------------------------------
// 계측기 옆에 '지금 실험실에서 일어나는 일'을 보여 준다.
// 학생이 정한 조건(나이, 음료, 온도, 매의 수, 곰팡이 등)에 따라 그림이 달라지고,
// 측정할 때(busy1 → busy2) 동작 애니메이션이 나온다.
//
// v.phase  : idle / busy1 / busy2 / result / done / mem
// v.cond   : 이 집단의 조건 (변인별 옵션 번호)
// v.label  : 측정 시점 이름 (예: 30분, 3세대)
// v.values : 이 집단의 전체 측정값,  v.index : 지금 보여 주는 측정 시점 번호 (-1이면 아직 측정 전)
// v.long   : 첫 측정이면 true (장면을 길게 보여 줌)
// ==========================================

const SCENE_W = 320, SCENE_H = 190;

function svgWrap(inner, extraClass = '') {
    return `<svg class="scene-svg ${extraClass}" viewBox="0 0 ${SCENE_W} ${SCENE_H}" role="img" aria-label="실험 장면">${inner}</svg>`;
}

function sceneTag(text, x = 8, y = 8) {
    const w = Math.max(60, text.length * 11 + 16);
    return `<g class="scene-tag"><rect x="${x}" y="${y}" width="${w}" height="22" rx="11" fill="rgba(15,23,42,0.75)"/>
        <text x="${x + w / 2}" y="${y + 15}" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">${text}</text></g>`;
}

function bubble(x, y, text) {
    const w = Math.max(56, text.length * 11 + 18);
    return `<g class="scene-bubble"><rect x="${x}" y="${y}" width="${w}" height="24" rx="12" fill="#fff" stroke="#cbd5e1"/>
        <path d="M ${x + 14} ${y + 24} l 6 8 l 4 -8 z" fill="#fff" stroke="#cbd5e1"/>
        <text x="${x + w / 2}" y="${y + 16}" text-anchor="middle" font-size="11" font-weight="700" fill="#2c3e50">${text}</text></g>`;
}

// 사람 그리기 (나이·건강 상태·자세에 따라 모습이 달라짐)
function person({ x, y, old = false, sick = false, shirt = '#3498db', pose = 'stand', armOut = false, cane = false }) {
    const skin = sick ? '#eadfd2' : '#f5cba7';
    const hair = old ? '#d5d8dc' : '#3b2a20';
    const legs = pose === 'sit'
        ? `<path d="M ${x - 7} ${y + 62} h 22 v 26" stroke="#34495e" stroke-width="7" fill="none" stroke-linecap="round"/>
           <path d="M ${x + 3} ${y + 62} h 22 v 26" stroke="#2c3e50" stroke-width="7" fill="none" stroke-linecap="round"/>`
        : pose === 'walk'
            ? `<g class="walk-legs"><line class="leg-a" x1="${x - 4}" y1="${y + 60}" x2="${x - 12}" y2="${y + 92}" stroke="#34495e" stroke-width="7" stroke-linecap="round"/>
               <line class="leg-b" x1="${x + 4}" y1="${y + 60}" x2="${x + 12}" y2="${y + 92}" stroke="#2c3e50" stroke-width="7" stroke-linecap="round"/></g>`
            : `<line x1="${x - 5}" y1="${y + 60}" x2="${x - 6}" y2="${y + 92}" stroke="#34495e" stroke-width="7" stroke-linecap="round"/>
               <line x1="${x + 5}" y1="${y + 60}" x2="${x + 6}" y2="${y + 92}" stroke="#2c3e50" stroke-width="7" stroke-linecap="round"/>`;
    const hairShape = old
        ? `<path d="M ${x - 15} ${y - 2} q 2 -16 15 -17 q 13 1 15 17 q -4 -8 -15 -9 q -11 1 -15 9 z" fill="${hair}"/>`
        : `<path d="M ${x - 15} ${y + 1} q -1 -19 15 -20 q 16 1 15 20 q -3 -10 -15 -11 q -12 1 -15 11 z" fill="${hair}"/>`;
    const face = `
        <circle cx="${x - 5}" cy="${y + 2}" r="1.8" fill="#2c3e50"/><circle cx="${x + 5}" cy="${y + 2}" r="1.8" fill="#2c3e50"/>
        ${old ? `<circle cx="${x - 5}" cy="${y + 2}" r="4.5" fill="none" stroke="#7f8c8d" stroke-width="1.2"/>
                 <circle cx="${x + 5}" cy="${y + 2}" r="4.5" fill="none" stroke="#7f8c8d" stroke-width="1.2"/>
                 <line x1="${x - 0.5}" y1="${y + 2}" x2="${x + 0.5}" y2="${y + 2}" stroke="#7f8c8d" stroke-width="1.2"/>
                 <path d="M ${x - 11} ${y + 8} q 2 2 4 0 M ${x + 7} ${y + 8} q 2 2 4 0" stroke="#c9a27e" fill="none" stroke-width="1"/>` : ''}
        <path d="M ${x - 4} ${y + 9} q 4 ${sick ? -2 : 3} 8 0" stroke="#8e5b3d" stroke-width="1.5" fill="none"/>`;
    const arm = armOut
        ? `<line x1="${x + 9}" y1="${y + 28}" x2="${x + 34}" y2="${y + 40}" stroke="${skin}" stroke-width="6" stroke-linecap="round"/>`
        : `<line x1="${x + 10}" y1="${y + 28}" x2="${x + 14}" y2="${y + 52}" stroke="${skin}" stroke-width="6" stroke-linecap="round"/>`;
    return `<g class="person">
        ${legs}
        <rect x="${x - 13}" y="${y + 18}" width="26" height="44" rx="10" fill="${shirt}"/>
        <line x1="${x - 10}" y1="${y + 28}" x2="${x - 14}" y2="${y + 52}" stroke="${skin}" stroke-width="6" stroke-linecap="round"/>
        ${arm}
        ${cane ? `<line x1="${x - 16}" y1="${y + 52}" x2="${x - 20}" y2="${y + 93}" stroke="#8e5b3d" stroke-width="3"/>` : ''}
        <circle cx="${x}" cy="${y}" r="15" fill="${skin}"/>
        ${hairShape}${face}
    </g>`;
}

const SCENES = {
    // ---------- 1. 제로 콜라와 혈당 ----------
    glucose(v) {
        const [drink, fed, amount, walk] = v.cond;
        const outdoor = walk === 1;
        const bg = outdoor
            ? `<rect width="320" height="130" fill="#d6eefc"/><rect y="130" width="320" height="60" fill="#a8d5a2"/>
               <circle cx="280" cy="30" r="14" fill="#fde68a"/>
               <rect x="262" y="78" width="8" height="55" fill="#8e5b3d"/><circle cx="266" cy="72" r="22" fill="#5fb36b"/>
               <path d="M 0 150 Q 160 132 320 152" stroke="#e7d7a8" stroke-width="10" fill="none"/>`
            : `<rect width="320" height="140" fill="#fbf3e4"/><rect y="140" width="320" height="50" fill="#e3c9a0"/>
               <rect x="236" y="28" width="56" height="40" rx="4" fill="#cfe8f7" stroke="#b9a587" stroke-width="3"/>`;
        const chair = outdoor ? '' : `<rect x="48" y="122" width="44" height="8" rx="3" fill="#8e5b3d"/><rect x="50" y="130" width="5" height="30" fill="#8e5b3d"/><rect x="85" y="130" width="5" height="30" fill="#8e5b3d"/>`;
        const can = (cx, kind) => kind === 2
            ? `<g><rect x="${cx - 7}" y="86" width="14" height="34" rx="5" fill="#bfe3fb" stroke="#5dade2"/><rect x="${cx - 4}" y="80" width="8" height="7" fill="#5dade2"/></g>`
            : `<g><rect x="${cx - 8}" y="92" width="16" height="28" rx="3" fill="${kind === 0 ? '#c0392b' : '#1c1c1c'}"/>
                 <text x="${cx}" y="109" text-anchor="middle" font-size="5.5" font-weight="800" fill="#fff">${kind === 0 ? 'COLA' : 'ZERO'}</text></g>`;
        const drinks = amount === 1 ? can(200, drink) + can(220, drink) : can(210, drink);
        const tray = fed === 1 ? `<g><rect x="232" y="112" width="44" height="8" rx="3" fill="#95a5a6"/>
            <circle cx="243" cy="109" r="5" fill="#f5f5f5"/><circle cx="257" cy="109" r="5" fill="#e67e22"/><circle cx="269" cy="110" r="4" fill="#27ae60"/></g>` : '';
        const table = `<rect x="180" y="120" width="110" height="8" rx="3" fill="#a9744f"/><rect x="190" y="128" width="6" height="34" fill="#a9744f"/><rect x="274" y="128" width="6" height="34" fill="#a9744f"/>`;
        const prick = v.phase === 'busy1'
            ? `<g class="anim-lancet"><rect x="140" y="90" width="26" height="8" rx="3" fill="#7f8c8d"/><polygon points="140,94 132,92 132,96" fill="#566573"/></g>
               <circle class="anim-blood" cx="126" cy="94" r="4" fill="#c0392b"/>`
            : v.phase === 'busy2'
                ? `<circle cx="126" cy="94" r="4" fill="#c0392b"/><g class="anim-strip"><rect x="122" y="86" width="10" height="26" rx="2" fill="#fff" stroke="#cbd5e1"/><rect x="122" y="86" width="10" height="7" fill="#f1c40f"/></g>`
                : '';
        const figure = person({ x: 90, y: outdoor ? 62 : 56, pose: outdoor ? 'walk' : 'sit', armOut: v.phase === 'busy1' || v.phase === 'busy2', shirt: '#5dade2' });
        const talk = v.phase === 'idle' ? bubble(118, 36, '준비 완료!') : v.phase === 'busy1' ? bubble(118, 36, '따끔!') : '';
        return svgWrap(`${bg}${chair}${table}${drinks}${tray}${figure}${prick}${talk}${sceneTag(`⏱ 섭취 후 ${v.label}`, 8, 8)}`, outdoor ? 'walking' : '');
    },

    // ---------- 2. 삼투압 (감자·무 조각) ----------
    scale(v) {
        const [conc, material, size, cold] = v.cond;
        const fill = ['rgba(200,232,255,0.55)', 'rgba(180,220,252,0.65)', 'rgba(160,205,248,0.75)', 'rgba(135,188,242,0.85)'][conc];
        const salt = [0, 3, 8, 16][conc];
        const rnd = makeRandom(`salt|${conc}`);
        const saltDots = Array.from({ length: salt }, () =>
            `<rect x="${118 + rnd() * 84}" y="${96 + rnd() * 58}" width="2.5" height="2.5" fill="#fff" opacity="0.9"/>`).join('');
        const base = v.values && v.values[0] ? v.values[0] : 10;
        const now = v.index >= 0 && v.values ? v.values[v.index] : base;
        const k = Math.min(1.35, Math.max(0.6, 1 + (now / base - 1) * 1.8));    // 질량 변화를 눈에 띄게 보여 줌
        const color = material === 0 ? '#f3d98b' : '#f7f6ee';
        const edge = material === 0 ? '#c9a54a' : '#cfd6c4';
        const pieces = size === 0
            ? `<rect x="-20" y="-14" width="40" height="28" rx="6" fill="${color}" stroke="${edge}" stroke-width="2"/>`
            : [[-20, -12], [-4, -14], [12, -10], [-14, 4], [2, 3], [16, 6]].map(([px, py]) =>
                `<rect x="${px}" y="${py}" width="11" height="10" rx="2" fill="${color}" stroke="${edge}" stroke-width="1.5"/>`).join('');
        const lifted = v.phase === 'busy1' || v.phase === 'busy2';
        const piecesGroup = `<g transform="translate(${v.phase === 'busy2' ? 258 : 160} ${v.phase === 'busy2' ? 134 : 132})"><g class="${v.phase === 'busy1' ? 'anim-lift' : ''}"><g transform="scale(${k})">${pieces}</g></g></g>`;
        const ice = cold === 1 ? `<rect x="124" y="92" width="14" height="12" rx="2" fill="#eaf6ff" stroke="#9fd0f5" transform="rotate(-12 131 98)"/>
            <rect x="180" y="94" width="13" height="11" rx="2" fill="#eaf6ff" stroke="#9fd0f5" transform="rotate(10 186 99)"/>` : '';
        const thermo = `<g><rect x="232" y="44" width="10" height="64" rx="5" fill="#fff" stroke="#95a5a6"/>
            <rect x="234.5" y="${cold === 1 ? 90 : 66}" width="5" height="${cold === 1 ? 14 : 38}" fill="${cold === 1 ? '#3498db' : '#e74c3c'}"/>
            <circle cx="237" cy="112" r="8" fill="${cold === 1 ? '#3498db' : '#e74c3c'}"/>
            <text x="252" y="80" font-size="11" font-weight="800" fill="#2c3e50">${cold === 1 ? '5℃' : '25℃'}</text></g>`;
        const towel = lifted ? `<rect x="226" y="140" width="66" height="10" rx="2" fill="#fdfefe" stroke="#d5dbdb"/>` : '';
        const tweezers = v.phase === 'busy1'
            ? `<g class="anim-tweezers"><path d="M 160 20 L 156 104 M 166 20 L 164 104" stroke="#7f8c8d" stroke-width="3" stroke-linecap="round"/></g>` : '';
        const beaker = `<path d="M 110 70 h 100 v 92 a 10 10 0 0 1 -10 10 h -80 a 10 10 0 0 1 -10 -10 z" fill="rgba(255,255,255,0.35)" stroke="#7fb3d5" stroke-width="3"/>
            <path d="M 112 92 h 96 v 70 a 8 8 0 0 1 -8 8 h -80 a 8 8 0 0 1 -8 -8 z" fill="${fill}"/>
            ${saltDots}${ice}
            <text x="160" y="186" text-anchor="middle" font-size="11" font-weight="800" fill="#2c3e50">${shortValue(THEMES.osmosis.vars[0].options[conc])} 소금물</text>`;
        const bg = `<rect width="320" height="190" fill="#eef6fb"/><rect y="172" width="320" height="18" fill="#d5dde3"/>`;
        return svgWrap(`${bg}${beaker}${thermo}${towel}${piecesGroup}${tweezers}${sceneTag(`⏱ 담근 지 ${v.label}`)}`);
    },

    // ---------- 3. 자연선택 (쥐와 매) ----------
    drone(v) {
        const [fur, ground, hawks, bush] = v.cond;
        const groundColor = ground === 0 ? '#3d3d43' : '#e0c88f';
        const mouseColor = fur === 0 ? '#151515' : '#fafafa';
        const n = v.index >= 0 && v.values ? Math.min(14, Math.round(v.values[v.index] / 8)) : 12;
        const rnd = makeRandom(`mice|${v.cond.join('')}|${v.index}`);
        const mice = Array.from({ length: n }, () => {
            const x = 20 + rnd() * 280, y = 128 + rnd() * 52;
            return `<g class="mouse-run" style="animation-delay:-${(rnd() * 2).toFixed(2)}s"><ellipse cx="${x}" cy="${y}" rx="7" ry="4.5" fill="${mouseColor}" stroke="${fur === 0 ? '#000' : '#bbb'}" stroke-width="0.6"/>
                <circle cx="${x + 6}" cy="${y - 3}" r="2.2" fill="${mouseColor}" stroke="${fur === 0 ? '#000' : '#bbb'}" stroke-width="0.5"/>
                <path d="M ${x - 7} ${y} q -6 2 -9 -2" stroke="${fur === 0 ? '#222' : '#ccc'}" fill="none" stroke-width="1"/></g>`;
        }).join('');
        const hawkCount = hawks === 0 ? 2 : 6;
        const hawkSvg = Array.from({ length: hawkCount }, (_, i) =>
            `<g class="hawk" style="animation-delay:-${(i * 1.3).toFixed(1)}s; --hy:${18 + (i % 3) * 16}px">
                <path d="M -12 0 q 6 -7 12 0 q 6 -7 12 0" stroke="#5d4037" stroke-width="3" fill="none" stroke-linecap="round"/></g>`).join('');
        const bushes = bush === 1 ? [40, 120, 210, 280].map(x =>
            `<g><circle cx="${x}" cy="150" r="14" fill="#3e7d3a"/><circle cx="${x + 14}" cy="154" r="11" fill="#4f9a49"/><circle cx="${x - 12}" cy="156" r="10" fill="#4f9a49"/></g>`).join('') : '';
        const drone = v.phase === 'busy1' || v.phase === 'busy2'
            ? `<g class="${v.phase === 'busy1' ? 'anim-drone-in' : 'anim-drone-hover'}">
                 <rect x="150" y="40" width="22" height="9" rx="3" fill="#2c3e50"/>
                 <line x1="142" y1="40" x2="180" y2="40" stroke="#2c3e50" stroke-width="2"/>
                 <ellipse cx="142" cy="38" rx="8" ry="2" fill="#95a5a6" class="prop"/><ellipse cx="180" cy="38" rx="8" ry="2" fill="#95a5a6" class="prop"/>
                 ${v.phase === 'busy2' ? '<polygon class="scan-beam" points="161,50 110,130 212,130" fill="rgba(0,255,120,0.18)"/>' : ''}
               </g>` : '';
        const bg = `<rect width="320" height="120" fill="#cfe3f3"/>
            <path d="M 210 120 L 250 60 L 262 64 L 300 120 Z" fill="#7b6a63"/><path d="M 250 60 l 6 -10 l 6 14 z" fill="#c0392b" opacity="0.7"/>
            <rect y="118" width="320" height="72" fill="${groundColor}"/>`;
        return svgWrap(`${bg}${bushes}${mice}<g class="hawks">${hawkSvg}</g>${drone}${sceneTag(`🦅 매 ${hawkCount}마리 · ${v.label}`)}`);
    },

    // ---------- 4. 백신과 항체 ----------
    analyzer(v) {
        const [doses, age, ill, since] = v.cond;
        const old = age === 1, sick = ill === 1;
        const figure = person({ x: 92, y: 60, old, sick, shirt: '#a3c4f3', armOut: v.phase === 'busy1', cane: old });
        const bandAids = Array.from({ length: doses }, (_, i) =>
            `<rect x="${97 + i * 2}" y="${84 + i * 8}" width="11" height="6" rx="2" fill="#fde2c4" stroke="#d4a373" transform="rotate(-20 ${102 + i * 2} ${87 + i * 8})"/>`).join('');
        const iv = sick ? `<g><line x1="40" y1="40" x2="40" y2="150" stroke="#95a5a6" stroke-width="3"/><rect x="30" y="40" width="20" height="26" rx="4" fill="#d6eaf8" stroke="#85c1e9"/>
            <path d="M 40 66 q 10 30 38 30" stroke="#85c1e9" stroke-width="1.5" fill="none"/></g>` : '';
        const rnd = makeRandom(`virus|${v.cond.join('')}`);
        const viruses = Array.from({ length: 5 }, () => {
            const x = 150 + rnd() * 50, y = 40 + rnd() * 90;
            return `<g class="virus" style="animation-delay:-${(rnd() * 3).toFixed(1)}s"><circle cx="${x}" cy="${y}" r="5" fill="#58d68d"/>
                ${[0, 60, 120, 180, 240, 300].map(a => `<line x1="${x}" y1="${y}" x2="${x + Math.cos(a * Math.PI / 180) * 8}" y2="${y + Math.sin(a * Math.PI / 180) * 8}" stroke="#28b463" stroke-width="1.5"/>`).join('')}</g>`;
        }).join('');
        const antibodyCount = v.index >= 0 && v.values ? Math.min(16, Math.round(v.values[v.index] / 35)) : 0;
        const rnd2 = makeRandom(`ab|${v.cond.join('')}`);
        const antibodies = Array.from({ length: antibodyCount }, () => {
            const x = 112 + rnd2() * 90, y = 30 + rnd2() * 110;
            return `<path class="antibody" d="M ${x} ${y + 8} v -6 l -5 -6 M ${x} ${y + 2} l 5 -6" stroke="#8e44ad" stroke-width="2.5" fill="none" stroke-linecap="round"/>`;
        }).join('');
        const syringe = v.phase === 'busy1'
            ? `<g class="anim-syringe"><rect x="134" y="94" width="34" height="9" rx="2" fill="#fff" stroke="#95a5a6"/><rect class="syringe-fill" x="136" y="96" width="30" height="5" fill="#c0392b"/>
                 <line x1="134" y1="98.5" x2="124" y2="98.5" stroke="#7f8c8d" stroke-width="1.5"/><rect x="168" y="96" width="8" height="5" fill="#bdc3c7"/></g>` : '';
        const tube = v.phase === 'busy2' ? `<g class="anim-tube"><rect x="230" y="80" width="10" height="34" rx="4" fill="#fff" stroke="#95a5a6"/><rect x="231" y="96" width="8" height="17" rx="3" fill="#c0392b"/></g>` : '';
        const info = `<g><rect x="220" y="14" width="92" height="56" rx="8" fill="#fff" stroke="#d6e4f0"/>
            <text x="266" y="32" text-anchor="middle" font-size="10.5" font-weight="800" fill="#1e5aa8">💉 접종 ${doses}회</text>
            <text x="266" y="48" text-anchor="middle" font-size="10" fill="#2c3e50">${old ? '70대' : '20대'}${sick ? ' · 면역 저하' : ''}</text>
            <text x="266" y="63" text-anchor="middle" font-size="9.5" fill="#7f8c8d">${doses ? `마지막 접종 ${since === 0 ? '1개월' : '1년'} 전` : '접종 기록 없음'}</text></g>`;
        const bg = `<rect width="320" height="190" fill="#eef5fc"/><rect y="160" width="320" height="30" fill="#d4e3f1"/>
            <g opacity="0.25"><rect x="22" y="10" width="20" height="6" fill="#e74c3c"/><rect x="29" y="3" width="6" height="20" fill="#e74c3c"/></g>`;
        return svgWrap(`${bg}${iv}${viruses}${antibodies}${figure}${bandAids}${syringe}${tube}${info}${sceneTag(`🦠 ${v.label === '침입 직후' ? v.label : `침입 후 ${v.label}`}`, 8, 160)}`);
    },

    // ---------- 5. 페니실린 (배양기) ----------
    counter(v) {
        const [mold, temp, ecoli, poor] = v.cond;
        const hot = temp === 1;
        const open = v.phase === 'busy1';
        const dishFill = poor === 1 ? '#f7f2e3' : '#f1dfa8';
        const colonies = v.index >= 0 && v.values ? Math.min(45, Math.round(v.values[v.index] / 25)) : 0;
        const rnd = makeRandom(`dish|${v.cond.join('')}|${v.index}`);
        const dots = Array.from({ length: colonies }, () => {
            const a = rnd() * Math.PI * 2, r = (mold ? 12 : 0) + rnd() * (mold ? 14 : 26);
            return `<circle cx="${(Math.cos(a) * r).toFixed(1)}" cy="${(Math.sin(a) * r * 0.45).toFixed(1)}" r="1.8" fill="${ecoli ? '#c8b28a' : '#e1b12c'}"/>`;
        }).join('');
        const dish = `<g transform="translate(125 112)"><g class="${open ? 'anim-dish-out' : ''}">
            <ellipse rx="34" ry="14" fill="${dishFill}" stroke="#bdc3c7" stroke-width="2"/>
            ${mold ? '<ellipse rx="9" ry="4.5" fill="#2e8b72"/>' : ''}${dots}</g></g>`;
        const incubator = `<rect x="60" y="34" width="130" height="130" rx="10" fill="#d5d8dc" stroke="#aab7b8" stroke-width="2"/>
            <rect x="72" y="58" width="106" height="96" rx="6" fill="#f4f6f7"/>
            <rect x="72" y="120" width="106" height="4" fill="#bfc9ca"/>
            ${dish}
            <rect class="${open ? 'anim-door' : ''}" x="72" y="58" width="106" height="96" rx="6" fill="rgba(174,214,241,0.45)" stroke="#aab7b8"/>
            <rect x="96" y="40" width="58" height="14" rx="3" fill="#111"/>
            <text x="125" y="51" text-anchor="middle" font-size="10" font-weight="800" fill="${hot ? '#ff6b6b' : '#7dffb0'}" font-family="monospace">${hot ? '37.0℃' : '25.0℃'}</text>`;
        const clock = v.phase === 'busy2' ? `<g transform="translate(250 60)"><circle r="20" fill="#fff" stroke="#2c3e50" stroke-width="3"/>
            <line class="clock-hand" x1="0" y1="0" x2="0" y2="-14" stroke="#e74c3c" stroke-width="2.5" stroke-linecap="round"/>
            <line x1="0" y1="0" x2="9" y2="0" stroke="#2c3e50" stroke-width="2.5" stroke-linecap="round"/></g>` : '';
        const zoom = `<g transform="translate(255 132)"><circle r="30" fill="#fff" stroke="#566573" stroke-width="3"/>
            ${ecoli
                ? [[-12, -8, 20], [4, -12, -30], [-4, 6, 60], [10, 6, 10]].map(([x, y, r]) => `<rect x="${x - 7}" y="${y - 3}" width="14" height="6" rx="3" fill="#d7c29e" transform="rotate(${r} ${x} ${y})"/>`).join('')
                : [[-8, -6], [-2, -9], [4, -5], [-5, 0], [2, 1], [8, 2], [-1, 7], [5, 8]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="3.6" fill="#f1c40f" stroke="#b7950b" stroke-width="0.8"/>`).join('')}
            <text y="44" text-anchor="middle" font-size="10" font-weight="800" fill="#2c3e50">${ecoli ? '대장균' : '포도상구균'}</text></g>`;
        const bg = `<rect width="320" height="190" fill="#f3f7f9"/><rect y="164" width="320" height="26" fill="#d5dde3"/>`;
        return svgWrap(`${bg}${incubator}${clock}${zoom}${sceneTag(`⏱ 배양 ${v.label}${poor === 1 ? ' · 영양 부족 배지' : ''}`)}`);
    }
};
