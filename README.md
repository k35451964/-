# 🔬 웹 기반 과학 탐구 프로젝트

고등학교 1학년 과학탐구실험 「과학 탐구의 과정과 절차」 단원용 웹앱입니다.
모둠이 5가지 생명과학 테마 중 하나를 골라 **문제 인식 → 변인 통제·가설 → 가상 실험·데이터 기록 → 데이터 분석·가설 검증 → 과학 신문** 과정을 진행합니다.

- 학생 화면: `index.html`
- 교사용 대시보드: `teacher.html`

## 주요 기능

| 구분 | 기능 |
|---|---|
| 모둠 협업 | 같은 모둠으로 접속한 기기들의 입력이 실시간으로 함께 바뀜 (누구나 수정 가능, 마지막 입력이 남음) |
| 이어하기 | 모든 입력이 Supabase에 자동 저장 → 새로고침하거나 다른 기기에서 들어와도 그대로 이어짐 |
| 탐구 설계 | 변인 4개를 조작/통제로 설정, 설계 오류 안내(조작 변인 0개·같은 값 → 진행 불가, 2개 이상 → 경고 후 진행 가능) |
| 가상 실험 | 테마별 계측기 5종, 학생이 정한 조건에 따라 결과가 달라지는 시뮬레이션 (모둠·설계마다 값이 고정되어 기기마다 같음) |
| 시각화 | 1차(로우 데이터)·2차(가공 데이터) 그래프 4종 중 선택 + 선택 이유 문장 |
| AI 어시스턴트 | 내장 엔진이 통계를 정확히 계산 → Gemini가 고1 눈높이로 해석·힌트 제공 (Gemini 미설정 시 내장 계산으로 답함) |
| 교사별 분리 | 교사 계정마다 자기 반·모둠만 보임. 학생은 선생님 전용 링크(QR)나 6자리 수업 코드로 입장 |
| 교사 대시보드 | 실시간 현황, 모둠별 결과 전체 보기(기록 오류 표시 포함), 크게 보기, 피드백·전체 공지, 모둠 만들기·초기화 |

## 파일 구성

| 파일 | 내용 |
|---|---|
| `index.html`, `style.css` | 학생 화면 |
| `app.js` | 학생 화면 동작 (화면 흐름, 실시간 동기화) |
| `themes.js` | 5개 테마의 이야기·변인·측정 정보·시뮬레이션 공식 |
| `devices.js`, `devices.css` | 테마별 가상 계측기 디자인 |
| `ai.js` | AI 데이터 분석 어시스턴트 |
| `common.js` | 학생·교사 화면 공통 기능 (그래프, 시뮬레이션 계산 등) |
| `teacher.html`, `teacher.css`, `teacher.js` | 교사용 대시보드 |
| `config.js` | Supabase 연결 정보 |
| `supabase/setup.sql` | 데이터베이스 설정 SQL |
| `supabase/functions/ai-assistant/index.ts` | Gemini 연결용 Edge Function (API 키는 Supabase Secrets에 보관) |

## 처음 설정하기

### 1. Supabase 데이터베이스
1. Supabase 대시보드 → **SQL Editor** → `supabase/setup.sql` 내용을 붙여넣습니다.
2. 맨 아래 `teacher@example.com`을 본인 이메일로 바꾸고 **Run** 합니다.
3. **Authentication → Users → Add user**에서 같은 이메일로 교사 계정을 만듭니다(비밀번호 설정, Auto Confirm 체크).

> 예전 버전에서 쓰던 `submissions` 표는 더 이상 쓰지 않습니다. 필요 없으면 지워도 됩니다.
> Supabase 무료 플랜은 7일간 접속이 없으면 일시정지되므로, 수업 전날 대시보드에 한 번 접속해 확인하세요.

### 2. Gemini AI 연결 (선택)
1. Google AI Studio(aistudio.google.com)에서 **API 키**를 발급합니다.
2. Supabase 대시보드 → **Edge Functions → Secrets**에 `GEMINI_API_KEY` 이름으로 키를 저장합니다.
   (모델을 바꾸고 싶으면 `GEMINI_MODEL`도 추가. 기본값 `gemini-2.5-flash`)
3. **Edge Functions → Deploy a new function → Via Editor**에서 이름을 `ai-assistant`로 하고,
   `supabase/functions/ai-assistant/index.ts` 내용을 붙여넣은 뒤 **Deploy** 합니다.
4. 학생 화면 AI 창에 질문해 답 끝에 "※ 기본 계산 결과로 답했어요"가 **없으면** Gemini가 답한 것입니다.

> API 키는 절대 `config.js`나 다른 웹페이지 파일에 넣지 마세요(학생 누구나 볼 수 있음).
> 모둠별로 1분에 8번까지만 질문할 수 있게 제한되어 있습니다.

### 3. 모둠 만들기 · 학생 입장
1. `teacher.html`에 로그인 → **⚙️ 모둠 관리**에서 학년·반·모둠 수를 입력해 만듭니다.
2. 위쪽 **🔗 수업 코드**를 눌러 학생 입장 링크·QR을 학생들에게 알려 줍니다(‘크게 보기’로 화면에 띄울 수 있음).
3. 학생은 링크로 들어와 학년·반·모둠을 골라 입장합니다. 링크 없이 들어오면 6자리 수업 코드를 입력합니다.

> 교사를 추가하려면 Authentication에서 계정을 만들고 `insert into public.teachers (email) values ('이메일');`을 실행하세요. 수업 코드는 자동으로 만들어집니다.

### 예전 버전에서 업그레이드할 때
SQL Editor에서 `delete from public.teams;`를 실행한 뒤(기존 모둠 삭제), `supabase/setup.sql` 전체를 다시 실행합니다(맨 아래 이메일은 본인 이메일로).

### 4. 컷 만화 이미지 넣기 (선택)
`themes.js`에서 테마의 `image: null`을 `image: 'images/cola.png'`처럼 바꾸면 4컷 대신 이미지가 표시됩니다.

## 배포
빌드 과정 없이 파일 그대로 올리는 정적 사이트로, **GitHub Pages**(main 브랜치, 루트 폴더)로 배포합니다. main에 올리면 1~2분 뒤 자동 반영됩니다.
