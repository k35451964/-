// Supabase 초기화 (app.js와 동일한 정보 입력)
const SUPABASE_URL = 'https://krmgbaefpoftggfcmnhs.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtybWdiYWVmcG9mdGdnZmNtbmhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAyNTMxMzMsImV4cCI6MjEwNTgyOTEzM30.TBzADNq8LqtHiwqfu9UrRAyuAciqVDXI7JqRE3dPgXU';
const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const dashboardGrid = document.getElementById('dashboard-grid');
let allReports = [];

let currentTab = 'phase1'; // 기본 탭 설정 ('phase1', 'phase2', 'learning')
let currentSortedData = [];
let currentModalIndex = 0;

let modalChartInstance = null;

// 1. 탭 전환 이벤트 로직
const tabPhase1 = document.getElementById('tab-phase1');
const tabPhase2 = document.getElementById('tab-phase2');
const tabLearning = document.getElementById('tab-learning');

function updateTabStyles() {
    tabPhase1.classList.toggle('active', currentTab === 'phase1');
    tabPhase2.classList.toggle('active', currentTab === 'phase2');
    
    if (currentTab === 'learning') {
        tabLearning.style.backgroundColor = '#27ae60';
        tabLearning.style.color = '#fff';
    } else {
        tabLearning.style.backgroundColor = '#fff';
        tabLearning.style.color = '#27ae60';
    }
}

tabPhase1.addEventListener('click', () => { currentTab = 'phase1'; updateTabStyles(); renderDashboard(); });
tabPhase2.addEventListener('click', () => { currentTab = 'phase2'; updateTabStyles(); renderDashboard(); });
tabLearning.addEventListener('click', () => { currentTab = 'learning'; updateTabStyles(); renderDashboard(); });

// 2. 전체 데이터 불러오기
async function loadReports() {
    const { data, error } = await db.from('reports').select('*');
    if (error) {
        console.error('데이터 로드 실패:', error);
        return;
    }
    allReports = data;
    renderDashboard();
}

// 3. 데이터를 조별 순서로 정렬하고 화면에 그리기
function renderDashboard() {
    dashboardGrid.innerHTML = '';
    
    const targetPhase = currentTab === 'phase1' ? 1 : 2; 
    let filtered = allReports.filter(r => r.report_data.phase === targetPhase);
    
    const uniqueGroups = {};
    filtered.forEach(r => {
        const gNum = r.report_data.group;
        if (!uniqueGroups[gNum]) {
            uniqueGroups[gNum] = r;
        } else {
            if (new Date(r.created_at) > new Date(uniqueGroups[gNum].created_at)) {
                uniqueGroups[gNum] = r;
            }
        }
    });

    currentSortedData = Object.values(uniqueGroups).sort((a, b) => {
        const numA = parseInt(a.report_data.group.replace(/[^0-9]/g, '')) || 0;
        const numB = parseInt(b.report_data.group.replace(/[^0-9]/g, '')) || 0;
        return numA - numB;
    });

    if (currentSortedData.length === 0) {
        dashboardGrid.innerHTML = '<p style="color:#7f8c8d;">아직 제출된 보고서가 없습니다.</p>';
        return;
    }

    if (currentTab === 'learning') {
        currentSortedData.forEach((report, index) => renderLearningCard(report, index));
    } else {
        currentSortedData.forEach((report, index) => renderCard(report, index));
    }
}

// [추가됨] 형성 평가 전용 카드 렌더링 함수
function renderLearningCard(report, index) {
    const rData = report.report_data;
    const card = document.createElement('div');
    card.className = `group-card`;
    card.style.borderTop = '5px solid #27ae60';
    card.style.backgroundColor = '#f0fdf4'; 
    // 커서 기본값 제거하여 클릭 가능한(pointer) 상태 유지
    
    card.innerHTML = `
        <h2 style="margin-top: 0; color: #27ae60;">${rData.group}조</h2>
        <div style="font-size: 16px; font-weight: bold; color: #2c3e50; margin-bottom: 10px;">💡 새롭게 알게 된 점</div>
        <p style="font-size: 17px; line-height: 1.6; color: #34495e;">
            ${rData.learning || '<span style="color:#7f8c8d;">아직 작성되지 않았습니다.</span>'}
        </p>
    `;
    
    // 클릭 시 모달창(2차시 상세) 연결
    card.addEventListener('click', () => openModal(index));
    dashboardGrid.appendChild(card);
}

// 4. 바둑판 카드 생성
function renderCard(report, index) {
    const rData = report.report_data;
    const isPhase1 = rData.phase === 1;
    const isRejected = rData.validation === '기각';
    
    const card = document.createElement('div');
    card.className = `group-card ${!isPhase1 && isRejected ? 'rejected' : ''}`;
    if (isPhase1) card.style.borderTop = '5px solid #f39c12';
    
    const titleText = isPhase1 ? `${rData.group}조 (탐구 설계)` : `${rData.group}조 (최종 보고서)`;
    
    let contentHtml = '';
    if (isPhase1) {
        contentHtml = `
            <p style="font-weight: bold; color: #f39c12; margin-bottom: 5px;">[가설 설정]</p>
            <p style="font-size: 14px; line-height: 1.5; color: #34495e;">${rData.hypothesis}</p>
        `;
    } else {
        contentHtml = `
            <p style="font-weight: bold; margin-bottom: 5px;">가설 검증: ${rData.validation}</p>
            <p style="font-size: 14px; line-height: 1.5; color: #34495e; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical;">
                ${rData.conclusion || '결론 내용이 없습니다.'}
            </p>
        `;
    }

    card.innerHTML = `
        <h2 style="margin-top: 0; color: ${isPhase1 ? '#d35400' : (isRejected ? '#e74c3c' : '#3498db')};">${titleText}</h2>
        <div style="font-size: 14px; color: #7f8c8d; margin-bottom: 15px;">제출 시간: ${new Date(rData.timestamp).toLocaleTimeString()}</div>
        ${contentHtml}
    `;

    card.addEventListener('click', () => openModal(index));
    dashboardGrid.appendChild(card);
}

// 5. 모달 창 열기 및 상세 데이터 매핑
function openModal(index) {
    currentModalIndex = index;
    const report = currentSortedData[index];
    const rData = report.report_data;
    
    const isPhase1 = rData.phase === 1;
    const phase1Content = document.getElementById('modal-phase1-content');
    const phase2Content = document.getElementById('modal-phase2-content');

    const prevBtn = document.getElementById('modal-prev-btn');
    const nextBtn = document.getElementById('modal-next-btn');
    prevBtn.disabled = index === 0;
    nextBtn.disabled = index === currentSortedData.length - 1;

    document.getElementById('modal-title').innerText = isPhase1 ? `${rData.group}조 1차시 설계 상세` : `${rData.group}조 최종 탐구 결과`;
    
    // --- [공통] 2차시 열어도 가설 정보 찾아오기 ---
    let hypothesisText = '';
    if (isPhase1) {
        hypothesisText = rData.hypothesis;
    } else {
        const phase1Reports = allReports.filter(r => r.report_data.group === rData.group && r.report_data.phase === 1);
        if (phase1Reports.length > 0) {
            phase1Reports.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
            hypothesisText = phase1Reports[0].report_data.hypothesis;
        } else {
            hypothesisText = '<span style="color:#e74c3c">1차시 가설 전송 기록이 없습니다.</span>';
        }
    }
    document.getElementById('modal-conclusion-title').innerText = '설정된 탐구 가설';
    document.getElementById('modal-conclusion').innerHTML = hypothesisText;

    // --- [공통] 1,2차시 모두 실험 조건(변인 표) 무조건 렌더링 ---
    const tbody = document.getElementById('modal-vars-tbody');
    if (rData.variables && rData.variables.drink) {
        const v = rData.variables;
        let rows = '';
        for (const key in v) {
            const isManipulated = v[key].ctrl !== v[key].exp; 
            if (isManipulated) {
                rows += `<tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 15px; font-weight: bold; color: #e74c3c;">${v[key].name} <span style="font-size:12px;">(조작)</span></td>
                            <td style="padding: 15px; text-align: center; color: #2c3e50;">${v[key].ctrl}</td>
                            <td style="padding: 15px; text-align: center; color: #e74c3c; font-weight: bold;">${v[key].exp}</td>
                        </tr>`;
            } else {
                rows += `<tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 15px; font-weight: bold; color: #2c3e50;">${v[key].name} <span style="font-size:12px; color:#7f8c8d;">(통제)</span></td>
                            <td colspan="2" style="padding: 15px; text-align: center; color: #2c3e50; background: #f8fafc; font-weight: bold;">${v[key].ctrl} <span style="font-weight:normal; color:#7f8c8d; font-size: 13px;">(공통 적용)</span></td>
                        </tr>`;
            }
        }
        tbody.innerHTML = rows;
    } else {
        tbody.innerHTML = `<tr><td colspan="3" style="padding: 15px; text-align:center; color:#7f8c8d;">조건 데이터가 없습니다.</td></tr>`;
    }
    
    // 조건 표 영역을 항상 표시
    phase1Content.style.display = 'block';

    if (isPhase1) {
        phase2Content.style.display = 'none'; 
    } else {
        phase2Content.style.display = 'block';
        
        // 2차시 최종 결론 텍스트 삽입
        const phase2ConclusionEl = document.getElementById('modal-phase2-conclusion');
        if (phase2ConclusionEl) phase2ConclusionEl.innerText = rData.conclusion || '작성되지 않음';
        
        document.getElementById('modal-analysis').innerText = rData.analysis || '작성되지 않음';
        document.getElementById('modal-error').innerText = rData.error || '작성되지 않음';
        document.getElementById('modal-learning').innerText = rData.learning || '작성되지 않음';
        
        let validationText = rData.validation;
        if (rData.validation === '기각') {
            validationText += `<br><br><strong style="color:#e74c3c;">기각 원인:</strong> ${rData.cause}<br><strong style="color:#e74c3c;">수정 가설:</strong> ${rData.newHypo}`;
        }
        document.getElementById('modal-validation').innerHTML = validationText;

        if (modalChartInstance) {
            modalChartInstance.destroy();
        }
        if (rData.chartData) {
            const ctx = document.getElementById('modalChart').getContext('2d');
            let ctrlLabel = '대조군', expLabel = '실험군';
            if (rData.variables) {
                let manipTexts = [];
                for (const key in rData.variables) {
                    if (rData.variables[key].ctrl !== rData.variables[key].exp) {
                        manipTexts.push(rData.variables[key].exp);
                    }
                }
                if (manipTexts.length > 0) expLabel = `실험군 (${manipTexts.join(', ')})`;
            }

            modalChartInstance = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: ['0분', '30분', '60분', '90분', '120분'],
                    datasets: [
                        {
                            label: ctrlLabel,
                            data: rData.chartData.ctrl,
                            borderColor: '#2c3e50', backgroundColor: '#2c3e50',
                            borderWidth: 3, pointRadius: 5, tension: 0.3 
                        },
                        {
                            label: expLabel,
                            data: rData.chartData.exp,
                            borderColor: '#e74c3c', backgroundColor: '#e74c3c',
                            borderWidth: 3, pointRadius: 5, tension: 0.3
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { title: { display: true, text: '혈당 (mg/dL)' } },
                        x: { title: { display: true, text: '경과 시간' } }
                    }
                }
            });
        }
    }

    const detailModal = document.getElementById('detail-modal');
    detailModal.classList.remove('hidden');
    detailModal.style.display = 'flex';
}

// 6. 모달 창 닫기 및 네비게이션 로직
const closeModalBtn = document.getElementById('close-modal');
const detailModal = document.getElementById('detail-modal');

if (closeModalBtn && detailModal) {
    closeModalBtn.addEventListener('click', () => {
        detailModal.classList.add('hidden');
    });
    detailModal.addEventListener('click', (e) => {
        if (e.target === detailModal) {
            detailModal.classList.add('hidden');
        }
    });
}

// 이전/다음 버튼 이벤트
document.getElementById('modal-prev-btn').addEventListener('click', () => {
    if (currentModalIndex > 0) openModal(currentModalIndex - 1);
});
document.getElementById('modal-next-btn').addEventListener('click', () => {
    if (currentModalIndex < currentSortedData.length - 1) openModal(currentModalIndex + 1);
});

// 7. 실시간 데이터 구독
db.channel('custom-all-channel')
  .on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'reports' },
    (payload) => {
        allReports.push(payload.new);
        renderDashboard(); 
    }
  )
  .subscribe();

// 페이지 로드 시 기존 데이터 렌더링
loadReports();
// 8. 피드백 전송 로직
const sendFeedbackBtn = document.getElementById('send-feedback-btn');
if (sendFeedbackBtn) {
    sendFeedbackBtn.addEventListener('click', async () => {
        const inputEl = document.getElementById('feedback-input');
        const message = inputEl.value.trim();
        
        if (!message) {
            alert('피드백 내용을 입력해주세요.');
            return;
        }

        // 현재 열려있는 모달창의 조 번호 가져오기
        const targetGroup = currentSortedData[currentModalIndex].report_data.group;
        
        sendFeedbackBtn.disabled = true;
        sendFeedbackBtn.innerText = '전송 중...';

        const { error } = await db.from('feedbacks').insert([{ 
            group_number: targetGroup, 
            message: message 
        }]);

        if (error) {
            console.error(error);
            alert('피드백 전송에 실패했습니다.');
        } else {
            alert(`${targetGroup}조에 피드백이 전송되었습니다!`);
            inputEl.value = ''; // 입력칸 비우기
        }
        
        sendFeedbackBtn.disabled = false;
        sendFeedbackBtn.innerText = '전송';
    });
}