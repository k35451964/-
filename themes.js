// ==========================================
// 5가지 탐구 테마: 스토리, 변인, 측정 정보, 시뮬레이션 모델
// ------------------------------------------
// model(c, rnd): c는 변인별로 선택한 옵션의 번호(0부터) 배열,
//                rnd는 0~1 난수 함수(모둠·설계마다 고정된 씨앗값).
//                5개 측정 시점의 값을 배열로 돌려준다.
// image: 나중에 컷 만화 이미지를 넣으려면 'images/cola.png'처럼 경로를 적는다.
//        (비워 두면 아래 comic 4컷이 표시된다)
// ==========================================

// 표준정규분포 난수 (Box-Muller)
function gaussian(rnd) {
    let u = 0, v = 0;
    while (u === 0) u = rnd();
    while (v === 0) v = rnd();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

const THEMES = {
    cola: {
        title: '제로 콜라와 혈당 변화',
        icon: '🥤',
        teaser: '단맛은 나는데, 혈당은 정말 안 오를까?',
        image: null,
        comic: [
            { emoji: '🍱', text: '오늘 급식에 제로 콜라가 나왔다!' },
            { emoji: '🤔', text: '"설탕이 0인데 이렇게 달다고? 혈당 오르는 거 아냐?"' },
            { emoji: '😤', text: '"제로니까 괜찮아!" vs "달면 똑같아!" 논쟁 시작' },
            { emoji: '🩸', text: '보건실 혈당 측정기로 직접 확인해 보기로 했다' }
        ],
        story: '급식으로 제로 콜라가 나왔다. "단맛이 나는데 진짜 혈당이 안 오를까?" 친구들 사이에 논쟁이 붙었다. 보건 선생님은 혈당 측정기로 직접 확인해 보라며 실험 기회를 주셨다.',
        vars: [
            { name: '음료의 종류', options: ['일반 콜라', '제로 콜라', '물'] },
            { name: '섭취 전 상태', options: ['공복(8시간)', '식후 1시간'] },
            { name: '섭취량', options: ['250mL', '500mL'] },
            { name: '섭취 후 활동', options: ['휴식', '가벼운 산책'] }
        ],
        measure: { name: '혈당', unit: 'mg/dL', decimals: 0, axis: '섭취 후 시간', labels: ['0분', '30분', '60분', '90분', '120분'] },
        device: 'glucose',
        deviceText: { btn: '🩸 채혈 후 시험지 넣기', nextBtn: '🩸 다음 시간 채혈하기', anim1: '혈액 주입 중... 🩸', anim2: '혈당 분석 중... 🧪' },
        model(c, rnd) {
            const fed = c[1] === 1;
            const base = fed ? [128, 117, 107, 100, 95] : [90, 90, 89, 89, 88];
            const sugar = [1, 0.08, 0][c[0]];          // 일반 콜라 / 제로 콜라 / 물
            const volume = c[2] === 1 ? 1.45 : 1;
            const walk = c[3] === 1;
            const shape = [0, 1, 0.62, 0.25, 0.06];      // 섭취 후 혈당 상승 곡선
            const peak = 48 * sugar * volume * (walk ? 0.7 : 1) * (fed ? 0.85 : 1);
            const walkDrop = [0, 4, 7, 9, 9];
            return shape.map((s, i) => base[i] + peak * s - (walk ? walkDrop[i] : 0) + gaussian(rnd) * 2.5);
        }
    },

    osmosis: {
        title: '세포 삼투압 미스터리',
        icon: '🥔',
        teaser: '같은 물인데, 왜 채소는 정반대로 변할까?',
        image: null,
        comic: [
            { emoji: '🥬', text: '김장 날, 소금물에 담근 배추가 흐물흐물해졌다' },
            { emoji: '🥗', text: '그런데 시든 상추는 찬물에 담그니 다시 아삭!' },
            { emoji: '❓', text: '"둘 다 물에 담갔는데 왜 결과가 반대지?"' },
            { emoji: '⚖️', text: '감자·무 조각을 용액에 담그고 질량을 재 보기로 했다' }
        ],
        story: '김장하는 날, 소금물에 절인 배추는 흐물흐물해졌다. 그런데 시든 상추를 찬물에 담가 두었더니 다시 아삭해졌다. 똑같이 물에 담갔는데 왜 정반대의 일이 일어날까? 실험실의 감자와 무 조각으로 비밀을 밝혀 보자.',
        vars: [
            { name: '소금물 농도', options: ['0% (증류수)', '0.9%', '3%', '10%'] },
            { name: '식물 재료', options: ['감자', '무'] },
            { name: '조각의 크기', options: ['큰 덩어리 1개 (총 10g)', '잘게 썬 조각 여러 개 (총 10g)'] },
            { name: '용액의 온도', options: ['25℃ (상온)', '5℃ (냉장)'] }
        ],
        measure: { name: '조각의 질량', unit: 'g', decimals: 2, axis: '담근 시간', labels: ['0분', '10분', '20분', '30분', '40분'] },
        device: 'scale',
        deviceText: { btn: '⚖️ 조각 꺼내 질량 재기', nextBtn: '⚖️ 다음 시간 질량 재기', anim1: '물기 닦고 올리는 중... 🧻', anim2: '질량 안정화 중... ⚖️' },
        model(c, rnd) {
            const conc = [0, 0.9, 3, 10][c[0]];
            const iso = [1.0, 0.7][c[1]];               // 재료별 세포액과 같은 농도(등장액)
            const amp = [1, 1.15][c[1]];
            const k = [0.022, 0.05][c[2]] * [1, 0.6][c[3]];   // 작게 썰수록, 따뜻할수록 빨리 변함
            const delta = -0.33 * Math.tanh((conc - iso) / 2.5) * amp;   // 최종 질량 변화율
            const m0 = 10 + gaussian(rnd) * 0.08;
            return [0, 10, 20, 30, 40].map((t, i) =>
                m0 * (1 + delta * (1 - Math.exp(-k * t))) + (i === 0 ? 0 : gaussian(rnd) * 0.03));
        }
    },

    selection: {
        title: '자연선택: 하얀 쥐와 검은 쥐',
        icon: '🐭',
        teaser: '화산재로 뒤덮인 섬, 누가 살아남을까?',
        image: null,
        comic: [
            { emoji: '🌋', text: '섬의 화산이 폭발했다!' },
            { emoji: '🌑', text: '바닥이 온통 검은 화산재로 뒤덮였다' },
            { emoji: '🦅', text: '하늘에서는 매가 쥐를 노리고 있다' },
            { emoji: '🛸', text: '흰 쥐와 검은 쥐, 누가 살아남을까? 드론으로 관찰해 보자' }
        ],
        story: '화산이 폭발한 뒤, 섬의 바닥이 검은 화산재로 뒤덮였다. 섬에는 털이 흰 쥐와 검은 쥐가 살고, 하늘에서는 매가 사냥을 한다. 몇 세대가 지나면 이 섬의 쥐들은 어떻게 달라질까?',
        vars: [
            { name: '쥐의 털색', options: ['검은색', '흰색'] },
            { name: '서식지 바닥 색', options: ['어두운 화산재', '밝은 모래'] },
            { name: '매(포식자)의 수', options: ['2마리', '6마리'] },
            { name: '숨을 곳(덤불)', options: ['없음', '있음'] }
        ],
        measure: { name: '살아남은 쥐의 수', unit: '마리', decimals: 0, axis: '세대', labels: ['1세대', '2세대', '3세대', '4세대', '5세대'] },
        device: 'drone',
        deviceText: { btn: '🛸 드론 스캔 시작', nextBtn: '🛸 다음 세대 스캔하기', anim1: '드론 이륙 중... 🛸', anim2: '개체 수 세는 중... 📸' },
        model(c, rnd) {
            const camouflaged = c[0] === c[1];          // 검은 쥐-화산재, 흰 쥐-모래
            let p = c[2] === 0 ? 0.22 : 0.5;            // 한 세대 동안 잡아먹힐 확률
            if (camouflaged) p *= 0.25;
            if (c[3] === 1) p *= 0.6;
            const K = 150;                              // 섬이 품을 수 있는 최대 개체 수
            let n = 100 + gaussian(rnd) * 2;
            const out = [n];
            for (let g = 1; g < 5; g++) {
                n = n * (1 - p) * (1 + 0.3 * (1 - n / K));
                n = Math.max(0, n + gaussian(rnd) * Math.sqrt(n) * 0.6);
                out.push(n);
            }
            return out;
        }
    },

    vaccine: {
        title: '백신과 항체 형성',
        icon: '💉',
        teaser: '같은 바이러스, 왜 누구는 멀쩡할까?',
        image: null,
        comic: [
            { emoji: '💉', text: '가을, 독감 예방 주사를 맞을지 고민하는 친구들' },
            { emoji: '🤧', text: '겨울, 반에 독감이 퍼졌다' },
            { emoji: '🏠', text: '주사를 안 맞은 친구들만 줄줄이 결석…?' },
            { emoji: '🔬', text: '바이러스가 들어온 뒤 몸속 항체 농도를 분석해 보자' }
        ],
        story: '독감이 유행한 겨울, 예방 주사를 맞은 친구들은 대부분 멀쩡했지만 맞지 않은 친구들은 줄줄이 결석했다. 똑같은 독감 바이러스가 몸에 들어왔는데 왜 결과가 달랐을까? 바이러스가 들어온 뒤 몸속 항체의 변화를 추적해 보자.',
        vars: [
            { name: '사전 백신 접종', options: ['접종 안 함', '1회 접종', '2회 접종'] },
            { name: '나이', options: ['20대', '70대'] },
            { name: '면역 저하 질환', options: ['없음', '있음'] },
            { name: '마지막 접종 후 지난 기간', options: ['1개월', '1년'] }
        ],
        measure: { name: '항체 농도', unit: 'AU/mL', decimals: 0, axis: '바이러스 침입 후 경과 일수', labels: ['침입 직후', '7일', '14일', '21일', '28일'] },
        device: 'analyzer',
        deviceText: { btn: '🧪 혈액 분석 시작', nextBtn: '🧪 다음 시점 혈액 분석', anim1: '원심분리 가동 중... 🌀', anim2: '항체 농도 분석 중... 🔬' },
        model(c, rnd) {
            const old = c[1] === 1;
            const F = (old ? 0.55 : 1) * (c[2] === 1 ? 0.6 : 1);
            let values;
            if (c[0] === 0) {
                // 1차 면역 반응: 늦고 약하다 (기억 세포 없음 → 지난 기간은 영향 없음)
                const shape = old ? [0, 0.06, 0.45, 0.85, 1] : [0, 0.12, 0.7, 1, 0.75];
                values = shape.map(s => 60 * F * s);
            } else {
                // 2차 면역 반응: 기억 세포 덕분에 빠르고 강하다
                const dose = c[0] === 2 ? 1.6 : 1;
                const wane = c[3] === 1 ? 0.6 : 1;
                const A = 420 * dose * wane * F;
                const b = (c[3] === 0 ? 45 : 10) * dose * F;   // 이미 남아 있던 항체
                const shape = old ? [0, 0.5, 0.9, 1, 0.85] : [0, 0.75, 1, 0.82, 0.65];
                values = shape.map(s => b + A * s);
            }
            return values.map(v => v * (1 + gaussian(rnd) * 0.05) + gaussian(rnd) * 1.5);
        }
    },

    penicillin: {
        title: '페니실린의 발견',
        icon: '🧫',
        teaser: '곰팡이 주변에만 세균이 사라졌다?',
        image: null,
        comic: [
            { emoji: '🏖️', text: '1928년 여름, 휴가를 떠난 플레밍' },
            { emoji: '🧫', text: '돌아와 보니 세균 배양 접시에 푸른곰팡이가!' },
            { emoji: '👀', text: '그런데 곰팡이 주변에만 세균이 없다?!' },
            { emoji: '🔍', text: '현미경으로 세균 군집 수를 세어 보자' }
        ],
        story: '1928년 여름휴가에서 돌아온 플레밍은 실험실에 두고 간 세균 배양 접시에 푸른곰팡이가 피어 있는 것을 발견했다. 그런데 이상하게도 곰팡이 주변에만 세균이 자라지 못하고 텅 비어 있었다. 이 곰팡이에는 어떤 비밀이 있을까?',
        vars: [
            { name: '푸른곰팡이', options: ['없음', '있음'] },
            { name: '배양 온도', options: ['25℃', '37℃'] },
            { name: '세균의 종류', options: ['포도상구균', '대장균'] },
            { name: '배지의 영양', options: ['풍부함', '부족함'] }
        ],
        measure: { name: '세균 군집(콜로니) 수', unit: '개', decimals: 0, axis: '배양 시간', labels: ['0시간', '12시간', '24시간', '36시간', '48시간'] },
        device: 'counter',
        deviceText: { btn: '🔬 콜로니 스캔하기', nextBtn: '🔬 다음 시간 스캔하기', anim1: '배양 접시 올리는 중... 🧫', anim2: '콜로니 세는 중... 🔍' },
        model(c, rnd) {
            let r = c[1] === 1 ? 0.25 : 0.14;           // 37℃에서 더 빨리 자람
            if (c[2] === 1) r *= 1.1;
            const K = c[3] === 0 ? 1500 : 500;
            if (c[3] === 1) r *= 0.75;
            // 곰팡이(페니실린)의 억제 효과: 포도상구균(그람 양성)에 강하고 대장균(그람 음성)에는 약함.
            // 푸른곰팡이는 37℃보다 25℃에서 잘 자라 페니실린을 더 많이 만든다.
            let I = 0;
            if (c[0] === 1) I = c[2] === 0 ? (c[1] === 0 ? 0.95 : 0.7) : 0.08;
            const reff = r * (1 - I) - 0.08 * I;
            const N0 = 10;
            return [0, 12, 24, 36, 48].map((t, i) => {
                const n = reff > 0 ? K / (1 + ((K - N0) / N0) * Math.exp(-reff * t)) : N0 * Math.exp(reff * t);
                return i === 0 ? n + gaussian(rnd) * 0.8 : n * (1 + gaussian(rnd) * 0.06);
            });
        }
    }
};

const THEME_ORDER = ['cola', 'osmosis', 'selection', 'vaccine', 'penicillin'];
