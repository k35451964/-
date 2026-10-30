// ==========================================
// AI 데이터 분석 어시스턴트
// ------------------------------------------
// 1) 내장 계산 엔진(ruleBasedAnswer)이 기록표 값으로 통계를 정확히 계산하고,
// 2) Supabase Edge Function(ai-assistant)이 그 계산 결과를 Gemini에 넘겨 설명을 만든다.
// Gemini가 설정되지 않았거나 응답이 없으면 내장 계산 결과로 대신 답한다.
// (Gemini API 키는 이 파일이 아니라 Supabase Secrets에 저장한다)
// ==========================================
const AI_TIMEOUT_MS = 25000;

const AI_ERROR_NOTES = {
    rate_limited: '질문이 너무 많아서 잠시 쉬는 중이에요. 1분 뒤에 다시 물어봐 주세요.',
    gemini_quota: 'AI 사용량이 잠시 꽉 찼어요. 조금 뒤에 다시 물어봐 주세요.'
};

async function getAIAnswer(question, ctx) {
    const local = ruleBasedAnswer(question, ctx);
    // Gemini가 숫자를 틀리지 않도록, 모든 통계를 미리 계산해서 함께 보낸다
    const stats = ruleBasedAnswer('최대 변화량 최종 시점 평균 처음 대비 변화율', ctx);
    try {
        const call = sb.functions.invoke('ai-assistant', {
            body: { team_id: ctx.teamId, question, context: { ...ctx, stats } }
        });
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), AI_TIMEOUT_MS));
        const { data, error } = await Promise.race([call, timeout]);
        if (error) throw error;
        if (data && data.answer) return cleanAIText(data.answer);
        if (data && AI_ERROR_NOTES[data.error]) return `${AI_ERROR_NOTES[data.error]}\n\n${local}`;
        throw new Error((data && data.error) || 'empty');
    } catch (e) {
        console.warn('Gemini 연결 실패, 내장 계산으로 답합니다:', e && e.message ? e.message : e);
        return `${local}\n\n※ 지금은 AI 연결이 원활하지 않아 기본 계산 결과로 답했어요.`;
    }
}

// 혹시 섞여 나온 마크다운 기호를 정리한다
function cleanAIText(text) {
    return String(text)
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/^#{1,6}\s*/gm, '')
        .replace(/^\s*[-*]\s+/gm, '• ')
        .replace(/`/g, '')
        .trim();
}

function ruleBasedAnswer(question, ctx) {
    const q = question.replace(/\s+/g, ' ');
    const d = ctx.decimals;
    const u = ctx.unit;
    const f = n => fmtNum(n, d);

    if (/^(안녕|하이|hello|hi)/i.test(q.trim())) {
        return '안녕하세요! 저는 데이터 분석을 돕는 AI 연구원이에요. 기록표의 값으로 최대 변화량, 최종 시점 차이, 평균, 변화율 등을 계산해 드릴 수 있어요.';
    }

    const groups = [
        { name: ctx.ctrlLabel || '대조군', values: ctx.ctrl },
        { name: ctx.expLabel || '실험군', values: ctx.exp }
    ];
    const filled = groups.map(g => g.values.filter(v => v !== null));
    if (filled[0].length === 0 && filled[1].length === 0) {
        return '아직 기록표에 입력된 데이터가 없어요. 가상 계측기로 측정한 값을 표에 먼저 기록해 주세요! 📋';
    }

    const intents = [];
    if (/최대\s*변화|변화\s*폭|최댓값\s*[-−–]\s*최솟값|범위/.test(q)) intents.push('range');
    if (/최종|마지막|끝/.test(q)) intents.push('final');
    if (/평균/.test(q)) intents.push('mean');
    if (/변화율|퍼센트|%|증가율|감소율|비율/.test(q)) intents.push('rate');
    if (/처음|시작|초기/.test(q) && !intents.includes('rate')) intents.push('change');
    if (!intents.includes('range') && /최댓값|최대값|최고|가장 높|정점|피크/.test(q)) intents.push('max');
    if (!intents.includes('range') && /최솟값|최소값|최저|가장 낮/.test(q)) intents.push('min');
    if (/가설|수용|기각|맞아|맞을까|정답/.test(q)) intents.push('hypo');
    if (intents.length === 0 && /차이|비교/.test(q)) intents.push('final');

    if (intents.length === 0) {
        return [
            '음, 어떤 계산이 필요한지 잘 모르겠어요. 🤔 이런 것들을 물어볼 수 있어요:',
            '• "최대 변화량(최댓값-최솟값)을 구해 줘"',
            '• "최종 시점에서 두 집단의 차이를 비교해 줘"',
            '• "두 집단의 평균을 구해 줘"',
            '• "처음 대비 변화율(%)을 구해 줘"',
            '• "가장 높은 값은 언제였어?"'
        ].join('\n');
    }

    const lines = [];
    const missing = groups.map(g => g.values.filter(v => v === null).length);
    if (missing[0] || missing[1]) {
        const parts = groups.map((g, i) => (missing[i] ? `${g.name} ${missing[i]}칸` : null)).filter(Boolean);
        lines.push(`⚠️ 기록표에 빈칸(${parts.join(', ')})이 있어서, 입력된 값만으로 계산했어요.`);
    }

    const label = i => ctx.labels[i];
    const stat = values => {
        const pts = values.map((v, i) => ({ v, i })).filter(p => p.v !== null);
        if (!pts.length) return null;
        const max = pts.reduce((a, b) => (b.v > a.v ? b : a));
        const min = pts.reduce((a, b) => (b.v < a.v ? b : a));
        const mean = pts.reduce((s, p) => s + p.v, 0) / pts.length;
        return { pts, max, min, mean, first: pts[0], last: pts[pts.length - 1] };
    };
    const S = groups.map(g => stat(g.values));
    const compare = (a, b, what) => {
        const diff = a - b;
        if (Math.abs(diff) < Math.pow(10, -d) / 2) return `➡ 두 집단의 ${what}이(가) 같아요.`;
        return `➡ ${diff > 0 ? groups[0].name : groups[1].name}의 ${what}이(가) ${f(Math.abs(diff))} ${u} 더 커요.`;
    };

    for (const intent of intents) {
        if (intent === 'range') {
            lines.push('📊 최대 변화량 (최댓값 − 최솟값)');
            S.forEach((s, i) => {
                if (!s) return lines.push(`• ${groups[i].name}: 데이터 없음`);
                lines.push(`• ${groups[i].name}: ${f(s.max.v)}(${label(s.max.i)}) − ${f(s.min.v)}(${label(s.min.i)}) = ${f(s.max.v - s.min.v)} ${u}`);
            });
            if (S[0] && S[1]) lines.push(compare(S[0].max.v - S[0].min.v, S[1].max.v - S[1].min.v, '변화 폭'));
        }
        if (intent === 'final') {
            lines.push('📍 최종 시점 비교');
            const c = ctx.ctrl[4], e = ctx.exp[4];
            if (c === null || e === null) {
                lines.push(`• 마지막 측정(${label(4)}) 칸이 비어 있어요. 측정 후 기록해 주세요.`);
            } else {
                lines.push(`• ${label(4)} ${groups[0].name}: ${f(c)} ${u}`);
                lines.push(`• ${label(4)} ${groups[1].name}: ${f(e)} ${u}`);
                lines.push(`• 차이(${groups[0].name} − ${groups[1].name}): ${f(c - e)} ${u}`);
            }
        }
        if (intent === 'mean') {
            lines.push('🧮 평균 (입력된 값의 합 ÷ 개수)');
            S.forEach((s, i) => {
                if (!s) return lines.push(`• ${groups[i].name}: 데이터 없음`);
                lines.push(`• ${groups[i].name}: ${f(s.mean)} ${u} (${s.pts.length}개 값)`);
            });
            if (S[0] && S[1]) lines.push(compare(S[0].mean, S[1].mean, '평균'));
        }
        if (intent === 'change') {
            lines.push('↕️ 처음 대비 변화량 (마지막 값 − 처음 값)');
            S.forEach((s, i) => {
                if (!s) return lines.push(`• ${groups[i].name}: 데이터 없음`);
                const ch = s.last.v - s.first.v;
                lines.push(`• ${groups[i].name}: ${f(s.last.v)} − ${f(s.first.v)} = ${ch > 0 ? '+' : ''}${f(ch)} ${u}`);
            });
        }
        if (intent === 'rate') {
            lines.push('📈 처음 대비 변화율 ((마지막 값 − 처음 값) ÷ 처음 값 × 100)');
            S.forEach((s, i) => {
                if (!s) return lines.push(`• ${groups[i].name}: 데이터 없음`);
                if (s.first.v === 0) return lines.push(`• ${groups[i].name}: 처음 값이 0이라 변화율을 계산할 수 없어요. (변화량은 ${f(s.last.v - s.first.v)} ${u})`);
                const rate = (s.last.v - s.first.v) / s.first.v * 100;
                lines.push(`• ${groups[i].name}: ${rate > 0 ? '+' : ''}${rate.toFixed(1)}%`);
            });
        }
        if (intent === 'max') {
            lines.push('🔝 가장 높은 값');
            S.forEach((s, i) => s && lines.push(`• ${groups[i].name}: ${f(s.max.v)} ${u} (${label(s.max.i)})`));
        }
        if (intent === 'min') {
            lines.push('🔻 가장 낮은 값');
            S.forEach((s, i) => s && lines.push(`• ${groups[i].name}: ${f(s.min.v)} ${u} (${label(s.min.i)})`));
        }
        if (intent === 'hypo') {
            lines.push('🧑‍🔬 가설을 받아들일지(수용) 버릴지(기각)는 여러분이 데이터를 근거로 판단해야 해요!');
            if (ctx.hypothesis) lines.push(`우리 가설: ${ctx.hypothesis}`);
            lines.push('힌트 ① 가설에서 예측한 방향이 그래프에서도 나타났나요?');
            lines.push('힌트 ② 두 집단의 차이가 측정할 때 생기는 작은 흔들림(오차)보다 충분히 큰가요?');
        }
    }

    if (intents.some(i => ['range', 'final', 'mean', 'change', 'rate'].includes(i))) {
        lines.push('💡 이 중 결론을 가장 잘 보여 주는 값을 골라 아래 요약표에 적어 보세요.');
    }
    return lines.join('\n');
}
