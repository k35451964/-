// ==========================================
// 4가지 탐구 테마: 스토리, 변인, 측정 정보, 시뮬레이션 모델
// ------------------------------------------
// model(c, rnd): c는 변인별로 선택한 옵션의 번호(0부터) 배열,
//                rnd는 0~1 난수 함수(모둠·설계마다 고정된 씨앗값).
//                5개 측정 시점의 값을 배열로 돌려준다.
// comic: 스토리 만화 컷 (image = images 폴더의 컷 그림, text = 컷 설명 · 신문 1면 캡션)
// image: 만화 전체를 한 장으로 보여 주고 싶을 때만 경로를 적는다 (보통은 null)
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
            { image: 'images/cola-1.webp', text: '‘설탕 0g, 칼로리 0kcal!’ 한 문구가 사람들의 마음을 사로잡았다' },
            { image: 'images/cola-2.webp', text: '“당뇨 걱정 없이 마음껏!” 사람들은 열광했다' },
            { image: 'images/cola-3.webp', text: '과학 탐정단(여러분)의 연구실에 쪽지가 날아왔다' },
            { image: 'images/cola-4.webp', text: '“이렇게 달콤한데 어떻게 혈당이 안 오를 수 있죠?”' },
            { image: 'images/cola-5.webp', text: 'A파: “달콤하면 당분이 들어간 거야! 혈당이 치솟을걸!”' },
            { image: 'images/cola-6.webp', text: 'B파: “설탕이 안 들어갔잖아! 혈당은 안 오를 거야!”' },
            { image: 'images/cola-7.webp', text: '“혀가 느끼는 단맛과 혈당, 정말 같은 걸까?”' },
            { image: 'images/cola-8.webp', text: '과학 탐정단인 우리가 그 비밀을 밝혀 주겠어!' }
        ],
        story: '‘설탕 0g, 칼로리 0kcal, 혈당이 오르지 않는 꿈의 음료!’ 제로 콜라 광고에 사람들은 열광했다. 그런데 과학 탐정단의 연구실에 쪽지가 날아왔다. “일반 콜라만큼 달콤한데 어떻게 혈당이 안 오를 수 있죠?” 마을은 “달면 혈당이 치솟는다”는 A파와 “설탕이 없으니 안 오른다”는 B파로 갈라졌다. 혀가 느끼는 단맛과 혈당, 정말 같은 걸까?',
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
        teaser: '같은 물인데, 왜 배추는 정반대로 변할까?',
        image: null,
        comic: [
            { image: 'images/osmosis-1.webp?v=2', text: '약 천 년 전 통일신라, 곡창 지대 상주에서 온 마을이 모여 김장을 했다' },
            { image: 'images/osmosis-2.webp', text: '갓 딴 배추에 굵은 소금을 치고 소금물에 담가 두었더니…' },
            { image: 'images/osmosis-3.webp', text: '몇 시간 뒤, 단단했던 배추가 흐물흐물해졌다?' },
            { image: 'images/osmosis-4.webp', text: '반대로 시든 배추를 깨끗한 찬물에 담가 두었더니…' },
            { image: 'images/osmosis-5.webp', text: '며칠 뒤, 다시 통통하게 살아났다!' },
            { image: 'images/osmosis-6.webp', text: '“예부터 내려온 자연의 이치니라!”' },
            { image: 'images/osmosis-7.webp', text: '소금물에선 물이 빠지고, 맹물에선 물을 머금는다…' },
            { image: 'images/osmosis-8.webp', text: '배추는 김장에 써야 하니… 감자랑 무로 실험해 보자!' }
        ],
        story: '약 천 년 전 통일신라, 곡창 지대 상주에서 김장을 하던 마을. 싱싱한 배추에 굵은 소금을 치고 소금물에 담가 두었더니 몇 시간 뒤 단단했던 배추가 흐물흐물해졌다. 반대로 시들어 쪼글쪼글해진 배추를 깨끗한 찬물에 담가 두었더니 며칠 뒤 다시 통통하게 살아났다. 소금물에선 물이 빠지고 맹물에선 물을 머금는 걸까? 배추는 김장에 써야 하니, 감자와 무로 실험해 보자.',
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
        teaser: '같은 종의 쥐인데, 왜 땅마다 쥐 색이 다를까?',
        image: null,
        comic: [
            { image: 'images/selection-1.webp', text: '태평양 한가운데, 평화로운 모래섬이 있었다' },
            { image: 'images/selection-2.webp', text: '검은털 쥐와 흰털 쥐가 사이좋게 어우러져 살고 있었다' },
            { image: 'images/selection-3.webp', text: '어느 날, 섬 중앙의 화산이 폭발했다!' },
            { image: 'images/selection-4.webp', text: '동쪽은 검은 현무암 지대, 서쪽은 하얀 화산재 지대가 되었다' },
            { image: 'images/selection-5.webp', text: '배고픈 독수리 무리가 나타났다!' },
            { image: 'images/selection-6.webp', text: '검은 땅에선 흰 쥐가, 흰 땅에선 검은 쥐가 잡아먹혔다' },
            { image: 'images/selection-7.webp', text: '시간이 흘러… 검은 땅엔 검은 쥐만, 흰 땅엔 흰 쥐만' },
            { image: 'images/selection-8.webp', text: '같은 종의 쥐인데 왜 땅 색깔마다 쥐 색이 다를까?' }
        ],
        story: '태평양 한가운데 평화로운 모래섬에 검은털 쥐와 흰털 쥐가 어우러져 살고 있었다. 어느 날 섬 중앙의 화산이 폭발해 동쪽은 검은 현무암 지대, 서쪽은 하얀 화산재 지대가 되었다. 그때 배고픈 독수리 무리가 나타났다. 시간이 흐르자 검은 땅엔 검은 쥐만, 흰 땅엔 흰 쥐만 남았다. 같은 종의 쥐인데 왜 땅 색깔마다 쥐 색이 다를까?',
        vars: [
            { name: '쥐의 털색', options: ['검은색', '흰색'] },
            { name: '서식지 바닥 색', options: ['검은 현무암', '하얀 화산재'] },
            { name: '독수리(포식자)의 수', options: ['2마리', '6마리'] },
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

    penicillin: {
        title: '페니실린의 발견',
        icon: '🧫',
        teaser: '곰팡이 주변에만 세균이 사라졌다?',
        image: null,
        comic: [
            { image: 'images/penicillin-1.webp', text: '1928년, 천재 귀차니스트 플레밍이 세균을 연구하고 있었다' },
            { image: 'images/penicillin-2.webp', text: '배양 접시를 그대로 둔 채 여름휴가를 떠났다' },
            { image: 'images/penicillin-3.webp', text: '열린 창문으로 곰팡이 포자가 배양 접시에 내려앉았다' },
            { image: 'images/penicillin-4.webp', text: '휴가에서 돌아온 플레밍: “아니, 또 실험 망했잖아?!”' },
            { image: 'images/penicillin-5.webp', text: '어…? 곰팡이 주변에만 세균이 없잖아?' },
            { image: 'images/penicillin-6.webp', text: '“잠깐… 이 곰팡이가 세균을 죽인 거야?”' },
            { image: 'images/penicillin-7.webp', text: '“귀찮으니까 너희가 좀 알아내 줄래?”' },
            { image: 'images/penicillin-8.webp', text: '우리가 실험으로 밝혀내겠어!' }
        ],
        story: '1928년, 천재지만 극단적인 귀차니스트 플레밍은 무서운 세균을 연구하고 있었다. 배양 접시를 그대로 둔 채 여름휴가를 떠난 사이, 열린 창문으로 곰팡이 포자가 날아와 배양 접시에 내려앉았다. 휴가에서 돌아온 플레밍은 이상한 점을 발견했다. 곰팡이 주변에만 세균이 없었던 것이다. “이 곰팡이가 세균을 죽인 거야?” 귀찮은 플레밍 대신 우리가 실험으로 밝혀내 보자.',
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

const THEME_ORDER = ['cola', 'osmosis', 'selection', 'penicillin'];
