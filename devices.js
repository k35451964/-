// ==========================================
// 테마별 가상 계측기 화면
// ------------------------------------------
// v.phase   : idle(대기) / busy1(1단계 작동 중) / busy2(2단계 분석 중) / result(값 표시) / done(측정 완료) / mem(이전 기록 보기)
// v.timeText, v.valueHtml, v.msgText : 기기 화면에 표시할 글자
// v.raw     : 표시 중인 측정값(숫자)  /  v.cond : 이 집단의 조건(변인별 옵션 번호)  /  v.seed : 그림 배치를 고정할 씨앗값
// ==========================================

function deviceScreenText(v, valueClass) {
    return `
        <div class="dv-time">${v.timeText}</div>
        <div class="${valueClass}">${v.valueHtml}</div>
        <div class="dv-msg">${v.msgText}</div>`;
}

// 씨앗값으로 점(쥐, 콜로니) 위치를 고정해서 기기마다 같은 그림이 나오게 한다
function scatterDots(count, seed, avoidCenter) {
    const rnd = makeRandom(seed);
    const dots = [];
    let guard = 0;
    while (dots.length < count && guard < count * 20) {
        guard++;
        const x = 6 + rnd() * 88, y = 6 + rnd() * 88;
        const dx = x - 50, dy = y - 50;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (avoidCenter !== undefined) {
            if (r > 44) continue;                 // 원형 접시 밖
            if (r < avoidCenter) continue;        // 억제 구역
        }
        dots.push({ x, y, s: 0.75 + rnd() * 0.5 });
    }
    return dots;
}

const DEVICES = {
    // 1. 혈당 측정기 (콜라)
    glucose(v) {
        const busy = v.phase === 'busy1' || v.phase === 'busy2';
        return `
        <div class="device device-glucose">
            <div class="glucose-header">CareSens-Sim · 혈당 측정기</div>
            <div class="glucose-screen ${busy ? 'busy' : ''}">${deviceScreenText(v, 'dv-value')}</div>
            <div class="glucose-buttons"><span></span><span></span></div>
            <div class="glucose-port"><div class="glucose-strip ${v.phase === 'busy1' ? 'insert' : ''} ${v.phase === 'busy2' ? 'in' : ''}"></div></div>
        </div>`;
    },

    // 2. 정밀 전자저울 (삼투압)
    scale(v) {
        const loaded = v.phase !== 'idle';
        const stable = v.phase === 'result' || v.phase === 'done' || v.phase === 'mem';
        return `
        <div class="device device-scale">
            <div class="scale-shield">
                <div class="scale-pan">
                    <div class="scale-sample ${loaded ? 'on' : ''}"></div>
                </div>
            </div>
            <div class="scale-body">
                <div class="scale-brand">PRECISION BALANCE <small>d = 0.01 g</small></div>
                <div class="scale-lcd ${v.phase === 'busy2' ? 'flicker' : ''}">
                    <div class="lcd-top"><span>${v.timeText}</span><span class="lcd-stable">${stable ? '● STABLE' : ''}</span></div>
                    <div class="lcd-value">${v.valueHtml}</div>
                    <div class="lcd-msg">${v.msgText}</div>
                </div>
                <div class="scale-keys">
                    <span class="scale-key ${v.phase === 'busy1' ? 'press' : ''}">TARE</span>
                    <span class="scale-key">UNIT</span>
                    <span class="scale-key power">ON/OFF</span>
                </div>
            </div>
        </div>`;
    },

    // 3. 생태 스캐닝 드론 뷰파인더 (자연선택)
    drone(v) {
        const ash = v.cond ? v.cond[1] === 0 : true;
        const black = v.cond ? v.cond[0] === 0 : true;
        const showMice = (v.phase === 'result' || v.phase === 'done' || v.phase === 'mem') && v.raw !== null;
        const mice = showMice ? scatterDots(Math.min(Math.round(v.raw), 150), `${v.seed}|mice`) : [];
        const miceHtml = mice.map(d =>
            `<i class="mouse ${black ? 'black' : 'white'}" style="left:${d.x}%;top:${16 + d.y * 0.68}%;transform:scale(${d.s})"></i>`).join('');
        const scanning = v.phase === 'busy1' || v.phase === 'busy2';
        return `
        <div class="device device-drone">
            <div class="drone-view ${ash ? 'ground-ash' : 'ground-sand'} ${v.phase === 'idle' ? 'standby' : ''}">
                <div class="drone-field">${miceHtml}</div>
                <div class="drone-vignette"></div>
                ${scanning ? '<div class="drone-scanline"></div>' : ''}
                <span class="corner tl"></span><span class="corner tr"></span><span class="corner bl"></span><span class="corner br"></span>
                <div class="drone-target">[&nbsp;&nbsp;&nbsp;]</div>
                <div class="drone-hud top"><span class="rec">● REC</span><span>ALT 120m · ${v.timeText}</span></div>
                <div class="drone-hud bottom"><span>${v.msgText}</span><span class="drone-count">${v.valueHtml}</span></div>
            </div>
            <div class="drone-label">ECO-SCAN DRONE · 생태 조사용</div>
        </div>`;
    },

    // 4. 혈액 원심분리 / 항체 분석기 (백신)
    analyzer(v) {
        const busy = v.phase === 'busy1' || v.phase === 'busy2';
        return `
        <div class="device device-analyzer">
            <div class="an-top">
                <div class="an-window"><div class="an-rotor ${v.phase === 'busy1' ? 'spin-fast' : ''} ${v.phase === 'busy2' ? 'spin' : ''}"><i></i><i></i><i></i><i></i></div></div>
                <div class="an-side"><b>IMMUNO-ANALYZER</b><span>IgG 항체 정량</span><div class="an-leds"><i class="${busy ? 'blink' : 'on'}"></i><i class="${busy ? '' : 'on'}"></i></div></div>
            </div>
            <div class="an-screen">
                ${busy ? '<div class="an-spinner"></div>' : ''}
                ${deviceScreenText(v, 'dv-value')}
            </div>
        </div>`;
    },

    // 5. 현미경 콜로니 카운터 (페니실린)
    counter(v) {
        const mold = v.cond ? v.cond[0] === 1 : false;
        const ecoli = v.cond ? v.cond[2] === 1 : false;
        const showColonies = (v.phase === 'result' || v.phase === 'done' || v.phase === 'mem') && v.raw !== null;
        const count = showColonies ? Math.min(Math.round(v.raw), 260) : 0;
        const size = count > 150 ? 5 : count > 60 ? 7 : 9;
        const dots = scatterDots(count, `${v.seed}|colony`, mold ? 16 : undefined);
        const colonies = dots.map(d =>
            `<i class="colony ${ecoli ? 'ecoli' : 'staph'}" style="left:${d.x}%;top:${d.y}%;width:${size * d.s}px;height:${size * d.s}px"></i>`).join('');
        const busy = v.phase === 'busy1' || v.phase === 'busy2';
        return `
        <div class="device device-counter">
            <div class="counter-lens ${busy ? 'focusing' : ''}">
                <div class="counter-dish">
                    ${mold ? '<div class="mold"></div>' : ''}
                    ${colonies}
                </div>
            </div>
            <div class="counter-panel">
                <div class="counter-title">COLONY COUNTER ×40</div>
                ${deviceScreenText(v, 'counter-value')}
            </div>
        </div>`;
    }
};
