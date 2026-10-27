// =====================================================================
// AI 데이터 분석 어시스턴트 (Supabase Edge Function → Gemini API)
// ---------------------------------------------------------------------
// Gemini API 키는 이 파일에 쓰지 않고 Supabase의 Secrets(GEMINI_API_KEY)에 저장한다.
// 필요한 Secrets
//   GEMINI_API_KEY : Google AI Studio에서 발급한 키 (필수)
//   GEMINI_MODEL   : 사용할 모델 이름 (선택, 기본값 gemini-2.5-flash)
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 는 Supabase가 자동으로 넣어 준다.
// =====================================================================

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
};

const MAX_QUESTION = 500;
const MAX_PER_MINUTE = 8;      // 모둠별 1분당 질문 수 제한 (Gemini 사용량 보호)

const SYSTEM_PROMPT = `너는 고등학교 1학년 과학탐구실험 수업의 'AI 데이터 분석 연구원'이다.
학생 모둠이 가상 실험으로 얻은 데이터를 가공(통계 계산)하고 해석하도록 돕는 것이 너의 역할이다.

규칙
1. 한국어로, 고등학교 1학년 눈높이에 맞게 친절하고 간결하게 답한다. 8줄 이내로 쓴다.
2. 수치는 반드시 [검증된 계산 결과]에 있는 숫자를 그대로 쓴다. 스스로 다시 계산해서 다른 숫자를 만들지 않는다.
   계산 결과에 없는 값이 필요하면 기록표 값을 이용한 계산 방법(식)을 안내하고, 학생이 직접 계산해 보게 한다.
3. 가설을 수용할지 기각할지, 최종 결론, 어떤 그래프를 골라야 하는지는 대신 정해 주지 않는다.
   학생이 스스로 판단할 수 있도록 근거를 살펴볼 질문이나 힌트를 준다.
4. 기록표는 학생이 계측기를 보고 직접 옮겨 적은 값이며, 빈칸(null)이 있을 수 있다.
5. 마크다운 기호(**, #, 표, 코드 블록)를 쓰지 않는다. 일반 문장, 줄바꿈, '•' 기호만 쓴다. 이모지는 1~2개까지만 쓴다.
6. 수업과 관계없는 요청에는 정중하게 거절하고 데이터 분석 질문으로 안내한다. 개인정보는 묻거나 다루지 않는다.
7. 마지막 줄에는 다음에 해 볼 만한 분석이나 생각해 볼 질문을 한 가지 제안한다.`;

function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });
}

function env(name: string) {
    return (globalThis as any).Deno.env.get(name) || '';
}

// 서비스 키로 Supabase REST API 호출 (모둠 확인, 최근 대화 읽기)
async function rest(path: string) {
    const url = env('SUPABASE_URL');
    const key = env('SUPABASE_SERVICE_ROLE_KEY');
    const res = await fetch(`${url}/rest/v1/${path}`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`rest ${res.status}`);
    return res.json();
}

function list(values: unknown) {
    return Array.isArray(values) ? values.map(v => (v === null || v === undefined || v === '' ? '빈칸' : String(v))).join(', ') : '';
}

function buildExperimentText(ctx: any) {
    const conds = (group: any[]) => Array.isArray(group)
        ? group.map((c: any) => `${c.name}: ${c.value}${c.manipulated ? '(조작)' : ''}`).join(' / ')
        : '';
    return [
        `[실험 정보]`,
        `테마: ${ctx.themeTitle || ''}`,
        `측정값: ${ctx.measureName || ''} (단위 ${ctx.unit || ''})`,
        `측정 시점: ${list(ctx.labels)}`,
        `대조군 조건: ${conds(ctx.ctrlConditions)}`,
        `실험군 조건: ${conds(ctx.expConditions)}`,
        `모둠의 가설: ${ctx.hypothesis || '(아직 없음)'}`,
        ``,
        `[학생이 기록한 데이터]`,
        `대조군: ${list(ctx.ctrl)}`,
        `실험군: ${list(ctx.exp)}`,
        ``,
        `[검증된 계산 결과]`,
        String(ctx.stats || '(계산 결과 없음)').slice(0, 3000)
    ].join('\n');
}

async function handler(req: Request) {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

    const apiKey = env('GEMINI_API_KEY');
    if (!apiKey) return json({ error: 'not_configured' });

    let body: any;
    try {
        body = await req.json();
    } catch (_) {
        return json({ error: 'bad_request' }, 400);
    }
    const teamId = String(body.team_id || '');
    const question = String(body.question || '').trim().slice(0, MAX_QUESTION);
    const ctx = body.context || {};
    if (!/^[0-9a-f-]{36}$/i.test(teamId) || !question) return json({ error: 'bad_request' }, 400);

    // 실제 모둠인지 확인하고, 질문이 너무 잦으면 잠시 막는다
    let history: any[] = [];
    try {
        const team = await rest(`teams?id=eq.${teamId}&select=id`);
        if (!team.length) return json({ error: 'unknown_team' }, 404);
        const since = new Date(Date.now() - 60_000).toISOString();
        const recent = await rest(`messages?team_id=eq.${teamId}&channel=eq.ai&role=eq.student&created_at=gte.${since}&select=id`);
        if (recent.length > MAX_PER_MINUTE) return json({ error: 'rate_limited' });
        history = await rest(`messages?team_id=eq.${teamId}&channel=eq.ai&select=role,content&order=id.desc&limit=9`);
    } catch (e) {
        console.error('supabase check failed', e);
        return json({ error: 'server_error' }, 500);
    }

    // 최근 대화(방금 저장된 이번 질문은 빼고) → Gemini 대화 형식
    history = history.reverse();
    if (history.length && history[history.length - 1].role === 'student' && history[history.length - 1].content === question) {
        history.pop();
    }
    const contents = history.slice(-6).map(m => ({
        role: m.role === 'ai' ? 'model' : 'user',
        parts: [{ text: String(m.content).slice(0, 1500) }]
    }));
    contents.push({ role: 'user', parts: [{ text: `${buildExperimentText(ctx)}\n\n[학생 질문]\n${question}` }] });
    // Gemini는 대화가 user로 시작해야 한다
    while (contents.length && contents[0].role !== 'user') contents.shift();

    const model = env('GEMINI_MODEL') || 'gemini-2.5-flash';
    try {
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
                systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
                contents,
                generationConfig: { temperature: 0.4, maxOutputTokens: 2048 }
            })
        });
        const data = await res.json();
        if (!res.ok) {
            console.error('gemini error', res.status, JSON.stringify(data).slice(0, 500));
            return json({ error: res.status === 429 ? 'gemini_quota' : 'gemini_error' });
        }
        const answer = (data.candidates?.[0]?.content?.parts || [])
            .map((p: any) => p.text || '').join('').trim();
        if (!answer) return json({ error: 'empty_answer' });
        return json({ answer, model });
    } catch (e) {
        console.error('gemini fetch failed', e);
        return json({ error: 'gemini_error' });
    }
}

(globalThis as any).Deno?.serve(handler);
export { handler };
