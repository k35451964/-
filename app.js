// Firebase 초기화 (가장 위에 배치)
const firebaseConfig = {
  apiKey: "AIzaSyAif_DzuKrQP0Z6kdu3psF76uyEciQ8pQ0",
  authDomain: "exp-simul.firebaseapp.com",
  projectId: "exp-simul",
  storageBucket: "exp-simul.firebasestorage.app",
  messagingSenderId: "1080969991802",
  appId: "1:1080969991802:web:21c0d50ec598d4b21e4dc3",
  measurementId: "G-R61940GG7Q"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();
// 1. 화면 이동 및 뷰 업데이트 로직
// ==========================================
let currentStep = 1;
const totalSteps = 3;
let isOverviewMode = false;

// 1단계에서 선택한 변인 텍스트를 가져와서 2단계 요약창에 뿌려주는 함수
function updateGroupInfo() {
    const getVarText = (varName, target) => {
        const radio = document.querySelector(`input[name="var-${varName}"][value="manipulated"]`);
        const isManip = radio ? radio.checked : false;
        let selectId = (!isManip || target === 'ctrl') ? `ctrl-${varName}` : `exp-${varName}`;
        const selectEl = document.getElementById(selectId);
        return selectEl ? selectEl.options[selectEl.selectedIndex].text : '';
    };

    const infoCtrl = document.getElementById('info-ctrl');
    const infoExp = document.getElementById('info-exp');
    
    if (infoCtrl && infoExp) {
        infoCtrl.innerText = `${getVarText('drink', 'ctrl')} / ${getVarText('state', 'ctrl')} / ${getVarText('amount', 'ctrl')} / ${getVarText('activity', 'ctrl')}`;
        infoExp.innerText = `${getVarText('drink', 'exp')} / ${getVarText('state', 'exp')} / ${getVarText('amount', 'exp')} / ${getVarText('activity', 'exp')}`;
    }
}

function updateView() {
    const steps = document.querySelectorAll('.step');
    const dots = document.querySelectorAll('.step-dot');
    const navButtons = document.querySelectorAll('.nav-buttons');
    const overviewBtn = document.getElementById('overview-btn');
    const submitBtn = document.getElementById('submit-all-btn');

    if (isOverviewMode) {
        steps.forEach(step => step.classList.add('active'));
        navButtons.forEach(nav => nav.style.display = 'none');
        if(overviewBtn) overviewBtn.innerText = '단계별 보기';
        if(submitBtn) submitBtn.classList.remove('hidden');
    } else {
        steps.forEach((step, index) => {
            if (index + 1 === currentStep) {
                step.classList.add('active');
                if (currentStep === 2) updateGroupInfo(); // 2단계 진입 시 정보 업데이트
            } else {
                step.classList.remove('active');
            }
        });
        navButtons.forEach(nav => nav.style.display = 'flex');
        if(overviewBtn) overviewBtn.innerText = '전체 보기';
        
        if (currentStep === totalSteps) {
            if(submitBtn) submitBtn.classList.remove('hidden');
        } else {
            if(submitBtn) submitBtn.classList.add('hidden');
        }
    }

    dots.forEach((dot, index) => {
        if (isOverviewMode) {
            dot.classList.add('active');
        } else {
            if (index + 1 === currentStep) {
                dot.classList.add('active');
            } else {
                dot.classList.remove('active');
            }
        }
    });
}

const next1 = document.getElementById('next-1');
if(next1) next1.addEventListener('click', () => { currentStep = 2; updateView(); });
const next2 = document.getElementById('next-2');
if(next2) next2.addEventListener('click', () => { currentStep = 3; updateView(); });
const prev2 = document.getElementById('prev-2');
if(prev2) prev2.addEventListener('click', () => { currentStep = 1; updateView(); });
const prev3 = document.getElementById('prev-3');
if(prev3) prev3.addEventListener('click', () => { currentStep = 2; updateView(); });
const overviewBtn = document.getElementById('overview-btn');
if(overviewBtn) overviewBtn.addEventListener('click', () => { isOverviewMode = !isOverviewMode; updateView(); });

const dot1 = document.getElementById('dot-1');
if(dot1) dot1.addEventListener('click', () => { isOverviewMode = false; currentStep = 1; updateView(); });
const dot2 = document.getElementById('dot-2');
if(dot2) dot2.addEventListener('click', () => { isOverviewMode = false; currentStep = 2; updateView(); });
const dot3 = document.getElementById('dot-3');
if(dot3) dot3.addEventListener('click', () => { isOverviewMode = false; currentStep = 3; updateView(); });

// ==========================================
// 2. 가설 수용/기각 버튼 이벤트 로직
// ==========================================
const acceptBtn = document.getElementById('accept-btn');
const rejectBtn = document.getElementById('reject-btn');
const rejectSection = document.getElementById('reject-section');

if (acceptBtn && rejectBtn && rejectSection) {
    acceptBtn.addEventListener('click', () => {
        acceptBtn.classList.add('active-accept');
        rejectBtn.classList.remove('active-reject');
        rejectSection.style.opacity = '0';
        setTimeout(() => { rejectSection.classList.add('hidden'); }, 300);
    });

    rejectBtn.addEventListener('click', () => {
        rejectBtn.classList.add('active-reject');
        acceptBtn.classList.remove('active-accept');
        rejectSection.classList.remove('hidden');
        setTimeout(() => {
            rejectSection.style.transition = 'opacity 0.5s ease';
            rejectSection.style.opacity = '1';
        }, 10);
    });
}

// ==========================================
// 3. 변인 통제 토글 (실험군 입력칸 표시/숨김) 로직
// ==========================================
const variableNames = ['drink', 'state', 'amount', 'activity'];
variableNames.forEach(varName => {
    const radios = document.querySelectorAll(`input[name="var-${varName}"]`);
    const expContainer = document.getElementById(`exp-${varName}-container`);
    if (expContainer) {
        const ctrlLabel = expContainer.previousElementSibling.querySelector('.ctrl-label');
        radios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'manipulated') {
                    expContainer.style.display = 'flex';
                    if(ctrlLabel) ctrlLabel.innerText = '대조군(기준):';
                } else {
                    expContainer.style.display = 'none';
                    if(ctrlLabel) ctrlLabel.innerText = '통제값:';
                }
            });
        });
    }
});

// ==========================================
// 4. 가상 실험(기기 UI) 시뮬레이션 로직
// ==========================================
let simTime = 0; 
const measureBtn = document.getElementById('measure-btn');
const simScreen = document.getElementById('sim-screen');
const simTimeDisplay = document.getElementById('sim-time');
const simStatus = document.getElementById('sim-status');
const simRadios = document.querySelectorAll('input[name="sim-target"]');

if (measureBtn && simScreen && simTimeDisplay) {
    simRadios.forEach(radio => {
        radio.addEventListener('change', () => {
            simTime = 0;
            simTimeDisplay.innerText = `${simTime}분 경과 시점 측정 대기`;
            simScreen.innerHTML = '--<span class="unit">mg/dL</span>';
            simStatus.innerText = '시험지를 삽입하세요';
            measureBtn.innerText = '🩸 채혈 및 시험지 삽입하기';
            measureBtn.disabled = false;
        });
    });

    function getVariableValue(varName, targetGroup) {
        const radio = document.querySelector(`input[name="var-${varName}"][value="manipulated"]`);
        const isManipulated = radio ? radio.checked : false;
        if (!isManipulated || targetGroup === 'ctrl') {
            const el = document.getElementById(`ctrl-${varName}`);
            return el ? el.value : '';
        } else {
            const el = document.getElementById(`exp-${varName}`);
            return el ? el.value : '';
        }
    }

    measureBtn.addEventListener('click', () => {
        if (simTime > 120) {
            alert('120분까지 모든 측정이 완료되었습니다. 표 기록을 마쳐주세요.');
            return;
        }

        // 혈액 삽입 애니메이션 단계 1
        measureBtn.disabled = true;
        measureBtn.innerText = '혈액 주입 중...';
        simStatus.innerText = '혈액 감지됨';
        simScreen.innerHTML = '--<span class="unit">mg/dL</span>';

        // 1초 뒤 분석 시작
        setTimeout(() => {
            measureBtn.innerText = '혈당 분석 중...';
            simStatus.innerText = '분석 중 (삐-)';

            // 1.5초 뒤 결과 도출
            setTimeout(() => {
                const targetRadio = document.querySelector('input[name="sim-target"]:checked');
                const target = targetRadio ? targetRadio.value : 'ctrl';
                
                const drink = getVariableValue('drink', target);
                const state = getVariableValue('state', target);
                const amount = getVariableValue('amount', target);
                const activity = getVariableValue('activity', target);

                let baseGlucose = (state === 'fasting') ? 90 : 135; 
                const noise = Math.floor(Math.random() * 7) - 3;
                let finalGlucose = baseGlucose;

                if (simTime === 0) {
                    finalGlucose = baseGlucose + noise;
                } else {
                    if (drink === 'regular') {
                        let maxSpike = (amount === '500') ? 65 : 40; 
                        if (activity === 'walk') maxSpike *= 0.6;    

                        let spikeMultiplier = 0;
                        if (simTime === 30) spikeMultiplier = 0.7;       
                        else if (simTime === 60) spikeMultiplier = 1.0;  
                        else if (simTime === 90) spikeMultiplier = 0.5;  
                        else if (simTime === 120) spikeMultiplier = 0.1; 

                        finalGlucose = baseGlucose + (maxSpike * spikeMultiplier) + noise;
                    } else {
                        finalGlucose = baseGlucose + noise;
                    }
                }

                finalGlucose = Math.round(finalGlucose);

                // 화면 업데이트
                simScreen.innerHTML = `${finalGlucose}<span class="unit">mg/dL</span>`;
                simStatus.innerText = '측정 완료';
                
                simTime += 30;
                if (simTime <= 120) {
                    simTimeDisplay.innerText = `다음: ${simTime}분 시점 대기`;
                    measureBtn.innerText = '🩸 다음 시간 채혈하기';
                    measureBtn.disabled = false;
                } else {
                    simTimeDisplay.innerText = `측정 완료`;
                    measureBtn.innerText = '모든 측정 종료';
                    measureBtn.disabled = true;
                }
            }, 1500); 
        }, 1000); 
    });
}

// 초기 화면 렌더링 호출
updateView();

// ==========================================
// 5. 데이터 시각화 (Chart.js 그래프 변환) 로직
// ==========================================
const drawChartBtn = document.getElementById('draw-chart-btn');
let resultChart = null; 

if (drawChartBtn) {
    drawChartBtn.addEventListener('click', () => {
        const timePoints = [0, 30, 60, 90, 120];
        const ctrlData = [];
        const expData = [];
        let hasEmptyInput = false;

        // 1. 표에 입력된 데이터 수집
        timePoints.forEach(time => {
            const cVal = document.getElementById(`c-time-${time}`).value;
            const eVal = document.getElementById(`e-time-${time}`).value;
            
            if (cVal === '' || eVal === '') hasEmptyInput = true;
            ctrlData.push(Number(cVal));
            expData.push(Number(eVal));
        });

        if (hasEmptyInput) {
            alert('표의 모든 칸에 혈당 수치를 먼저 기록해 주세요!');
            return;
        }

        // 2. 조작 변인(다르게 설정한 값) 텍스트 추출 함수 (범례 표시용)
        function getManipulatedText(target) {
            let manipTexts = [];
            const vars = ['drink', 'state', 'amount', 'activity'];
            vars.forEach(v => {
                const isManip = document.querySelector(`input[name="var-${v}"][value="manipulated"]`).checked;
                if (isManip) {
                    const selectId = target === 'ctrl' ? `ctrl-${v}` : `exp-${v}`;
                    const selectEl = document.getElementById(selectId);
                    manipTexts.push(selectEl.options[selectEl.selectedIndex].text);
                }
            });
            // 조작 변인이 없으면 기본 이름, 있으면 괄호 안에 추가
            return manipTexts.length === 0 ? 
                (target === 'ctrl' ? '대조군' : '실험군') : 
                (target === 'ctrl' ? `대조군 (${manipTexts.join(', ')})` : `실험군 (${manipTexts.join(', ')})`);
        }

        if (resultChart != null) {
            resultChart.destroy();
        }

        // 3. 새로운 꺾은선 그래프 생성
        const ctx = document.getElementById('resultChart').getContext('2d');
        resultChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: ['0분', '30분', '60분', '90분', '120분'],
                datasets: [
                    {
                        label: getManipulatedText('ctrl'), // 대조군 구체적 이름
                        data: ctrlData,
                        borderColor: '#2c3e50', 
                        backgroundColor: '#2c3e50',
                        borderWidth: 3,
                        pointBackgroundColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        tension: 0.3 
                    },
                    {
                        label: getManipulatedText('exp'), // 실험군 구체적 이름
                        data: expData,
                        borderColor: '#e74c3c', 
                        backgroundColor: '#e74c3c',
                        borderWidth: 3,
                        pointBackgroundColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 5,
                        tension: 0.3
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                scales: {
                    y: {
                        beginAtZero: false,
                        title: { display: true, text: '혈당 (mg/dL)', font: { size: 14 } }
                    },
                    x: {
                        title: { display: true, text: '경과 시간', font: { size: 14 } }
                    }
                },
                plugins: {
                    title: {
                        display: true,
                        text: '시간에 따른 대조군과 실험군의 혈당 변화 비교',
                        font: { family: "'Pretendard', sans-serif", size: 18, weight: 'bold' },
                        padding: { top: 10, bottom: 20 }
                    },
                    legend: {
                        position: 'top',
                        labels: { font: { family: "'Pretendard', sans-serif", size: 14 } }
                    }
                }
            }
        });

        document.querySelector('.chart-container').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
}
// ==========================================
// 6. 데이터베이스(Supabase) 전송 로직 (1차시 & 2차시 분리)
// ==========================================

// [1차시] 설계 결과 전송
const submitStep1Btn = document.getElementById('submit-step1-btn');
if (submitStep1Btn) {
    submitStep1Btn.addEventListener('click', async () => {
        submitStep1Btn.disabled = true;
        submitStep1Btn.innerText = '전송 중...';

        try {
            const groupNum = document.getElementById('group-num').value;
            const hypoState = document.getElementById('hypo-state').value;
            const hypoCtrl = document.getElementById('hypo-ctrl').value;
            const hypoExp = document.getElementById('hypo-exp').value;
            const hypoResult = document.getElementById('hypo-result').value;

            // 학생이 설정한 4가지 변인 통제 텍스트 수집 (같게 하든 다르게 하든 모두 수집)
            const getVarText = (varName, target) => {
                const radio = document.querySelector(`input[name="var-${varName}"][value="manipulated"]`);
                const isManip = radio ? radio.checked : false;
                let selectId = (!isManip || target === 'ctrl') ? `ctrl-${varName}` : `exp-${varName}`;
                const selectEl = document.getElementById(selectId);
                return selectEl ? selectEl.options[selectEl.selectedIndex].text : '설정 안됨';
            };

            const collectedVars = {
                drink: { name: '음료의 종류', ctrl: getVarText('drink', 'ctrl'), exp: getVarText('drink', 'exp') },
                state: { name: '섭취 전 상태', ctrl: getVarText('state', 'ctrl'), exp: getVarText('state', 'exp') },
                amount: { name: '섭취량', ctrl: getVarText('amount', 'ctrl'), exp: getVarText('amount', 'exp') },
                activity: { name: '섭취 후 활동', ctrl: getVarText('activity', 'ctrl'), exp: getVarText('activity', 'exp') }
            };

            // 1차시 패키지
            const payload = {
                phase: 1, 
                group: groupNum,
                hypothesis: `만약 통제된 [${hypoState}] 상태에서 [${hypoCtrl}] 대신 [${hypoExp}]을(를) 마신다면, 혈당은 [${hypoResult}] 것이다.`,
                variables: collectedVars, // 구조화된 변인 데이터 추가
                timestamp: new Date().toISOString()
            };

            await db.collection('reports').add({
    group_number: groupNum,
    report_data: payload,
    created_at: firebase.firestore.FieldValue.serverTimestamp()
});

            alert(`${groupNum}조의 1차시 탐구 설계가 전송되었습니다! 화면을 통해 다른 조와 비교해 보세요.`);
            
            submitStep1Btn.disabled = false;
            submitStep1Btn.innerText = '📝 1차시 설계 결과 다시 전송하기';
        } catch (error) {
            console.error(error);
            alert('전송 실패. 다시 시도해 주세요.');
            submitStep1Btn.disabled = false;
            submitStep1Btn.innerText = '📝 1차시 설계 결과 전송하기';
        }
    });
}

// [2차시] 최종 결과 전송
const submitAllBtn = document.getElementById('submit-all-btn');
if (submitAllBtn) {
    submitAllBtn.addEventListener('click', async () => {
        submitAllBtn.disabled = true;
        submitAllBtn.innerText = '최종 결과 전송 중...';

        try {
            const groupNum = document.getElementById('group-num').value;
            const dataAnalysis = document.getElementById('data-analysis').value;
            const finalConclusion = document.getElementById('final-conclusion').value;
            const errorDiscussion = document.getElementById('error-discussion').value;
            const learningPoint = document.getElementById('learning-point').value;

            let validationResult = '선택 안함';
            const acceptBtn = document.getElementById('accept-btn');
            const rejectBtn = document.getElementById('reject-btn');
            
            let causeAnalysis = '';
            let newHypothesis = '';

            if (acceptBtn.classList.contains('active-accept')) {
                validationResult = '수용';
            } else if (rejectBtn.classList.contains('active-reject')) {
                validationResult = '기각';
                causeAnalysis = document.getElementById('cause-analysis').value;
                newHypothesis = document.getElementById('new-hypothesis').value;
            }

            // 추가됨: 표에 입력된 혈당 수치 데이터 수집
            const timePoints = [0, 30, 60, 90, 120];
            const chartData = { ctrl: [], exp: [] };
            timePoints.forEach(time => {
                chartData.ctrl.push(Number(document.getElementById(`c-time-${time}`).value) || 0);
                chartData.exp.push(Number(document.getElementById(`e-time-${time}`).value) || 0);
            });

            // 추가됨: 그래프 범례 표시를 위해 실험 조건도 다시 수집
            const getVarText = (varName, target) => {
                const radio = document.querySelector(`input[name="var-${varName}"][value="manipulated"]`);
                const isManip = radio ? radio.checked : false;
                let selectId = (!isManip || target === 'ctrl') ? `ctrl-${varName}` : `exp-${varName}`;
                const selectEl = document.getElementById(selectId);
                return selectEl ? selectEl.options[selectEl.selectedIndex].text : '';
            };
            const collectedVars = {
                drink: { ctrl: getVarText('drink', 'ctrl'), exp: getVarText('drink', 'exp') },
                state: { ctrl: getVarText('state', 'ctrl'), exp: getVarText('state', 'exp') },
                amount: { ctrl: getVarText('amount', 'ctrl'), exp: getVarText('amount', 'exp') },
                activity: { ctrl: getVarText('activity', 'ctrl'), exp: getVarText('activity', 'exp') }
            };

            // 2차시 패키지
            const payload = {
                phase: 2, 
                group: groupNum,
                analysis: dataAnalysis,
                validation: validationResult,
                cause: causeAnalysis,
                newHypo: newHypothesis,
                conclusion: finalConclusion,
                error: errorDiscussion,
                learning: learningPoint,
                chartData: chartData, // 수집한 혈당 데이터 첨부
                variables: collectedVars, // 변인 조건 첨부
                timestamp: new Date().toISOString()
            };

            await db.collection('reports').add({
             group_number: groupNum,
             report_data: payload,
               created_at: firebase.firestore.FieldValue.serverTimestamp()
            });
            alert(`${groupNum}조의 최종 탐구 보고서가 전송되었습니다! 수고하셨습니다.`);
            
            submitAllBtn.disabled = false;
            submitAllBtn.innerText = '🔄 최종 결과 다시 전송하기';
        } catch (error) {
            console.error(error);
            alert('전송 실패. 다시 시도해 주세요.');
            submitAllBtn.disabled = false;
            submitAllBtn.innerText = '전체 결과 전송하기';
        }
    });
}
// ==========================================
let isFirstFeedbackLoad = true;

db.collection('feedbacks')
  .orderBy('created_at', 'desc')
  .limit(1)
  .onSnapshot((snapshot) => {
      // 페이지 처음 로드 시 과거 피드백이 뜨는 것 방지
      if (isFirstFeedbackLoad) {
          isFirstFeedbackLoad = false;
          return;
      }

      snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
              const data = change.doc.data();
              const myGroup = document.getElementById('group-num').value;
              
              if (data.group_number === myGroup && myGroup !== '') {
                  const toast = document.getElementById('feedback-toast');
                  document.getElementById('feedback-message').innerText = data.message;
                  
                  toast.style.display = 'block';
                  
                  setTimeout(() => { 
                      toast.style.display = 'none'; 
                  }, 15000);
              }
          }
      });
  });