# TypeRPG 개발 인계 문서 (Handoff)

> **다음 세션 Claude를 위한 컨텍스트.** 이 파일 + README.md만 읽으면 즉시 작업 가능.

---

## 1. 프로젝트 개요

**TypeRPG** — 한국 초등학생용 타이핑 기반 실시간 턴제 RPG. 영단어를 타이핑해서 스킬 발동.

- **유저**: madeforanyone.com 운영자 (macOS, 한국어로 소통)
- **타겟 플레이어**: 한국 초등 3학년 영어 학습자
- **개발 환경**: file:// 직접 실행 가능 (별도 빌드 X), Python http.server로 dev
- **현재 버전**: **v0.73 · Phase D-7** (게임 속도 슬라이더 1×~3× + 스킬 풀 확장 70개)

---

## 2. 파일 구조

```
/home/claude/typerpg/
├── index.html         (329 lines)   — 단일 페이지, 모든 화면 오버레이로
├── app.js             (2828 lines)  — 전체 게임 로직
├── style.css          (3023 lines)  — 모든 스타일
├── README.md          (954 lines)   — 사용자 대상 문서 (한국어)
├── HANDOFF.md         (이 파일)
└── assets/
    ├── heroes/        — 애니메이션 sprite sheets (8 클래스)
    ├── heroes_static/ — 정적 초상화 (PNG, 클래스당 1개)
    ├── enemies/       — 적 sprite (22종)
    ├── bg/, sky/, floor/, props/, fx/  — 배경 레이어
    ├── icons/         — 스킬/상태 아이콘 (32×32 픽셀)
    └── hero_sprite_data.json
```

**출력 위치**: `/mnt/user-data/outputs/typerpg/` + `typerpg.zip`

---

## 3. 게임 상태 (v0.58)

### 완성된 시스템

| 카테고리 | 항목 | 비고 |
|---|---|---|
| **전투** | 타이핑 → 스킬 → 데미지, 적 차징 공격 | Phase 2 |
| **클래스** | 8종 (mage/archer/knight/rogue/priest/druid/paladin/monk) | Phase 3 |
| **원소 상성** | 5속성 (fire/water/wind/light/dark) + 0.5/1.0/1.5x | Phase 3.5 |
| **상태이상** | burn, freeze, weaken, guard, dodge (양방향 적용) | Phase 3.5 |
| **방어 시스템** | barrier (HP 흡수) + guard (% 감쇠) 분리 | Phase 3.5 |
| **크리/콤보** | 크리 10% (1.5x), 콤보 3/5/7/10 = +10/20/30/50% | Phase 3.5 |
| **클래스 패시브** | 8개 모두 (Mage 약점+25%, Knight HP+50 등) | Phase 3.5 |
| **캠페인** | 10 스테이지, 클래스별 적응형 튜토리얼 (80 변형) | Phase 4 + 5.6 |
| **던전 모드** | 7 룸 무작위, 보상 선택, 12 레어 스킬 풀 | Phase 5 |
| **다층 던전** | F1-F3, 층별 ×1.5/2.0 강화, 이벤트 룸 (회복샘/도전) | Phase 5.5 |
| **메타 강화** | 4종 × 5단계 (시작 HP/보호막/데미지/크리) | Phase 5.5 |
| **사운드** | Web Audio API 8종 효과음 + 토글 | Phase 5.6 |
| **캐릭터 잠금** | 신규=2 무료, 6개 10💎 해제 | Phase 5.7 |
| **클래스 마스터리** | 5회 클리어 = 패시브 ×1.5 | Phase 5.8 |

### 게임 모드

1. **캠페인**: 10 스테이지 큐레이션 학습 경로
2. **던전**: 3 층 × 7 룸 로그라이크 (반복 플레이)
3. **자유 모드**: 모든 클래스/적/배경 자유 선택 (디버그용)
4. **강화 상점**: 메타 업그레이드 + 캐릭터 잠금 해제 (탭 분리)

---

## 4. 이번 세션 수정한 버그 ✅

**증상**: 던전 모드에서 발견한 레어 스킬을 타이핑해도 발동이 안 됨.

**원인**:
- `tryMatch()`와 `updateTypeDisplay()`가 `CLASSES[state.heroL].skills`만 참조
- 던전 보상으로 받은 `state.dungeonExtraSkills`는 무시됨
- 결과: 타이핑 화면에서 빨간 색(invalid)으로 표시되고 발동 안 함
- `activateSkill()` 자체는 dungeonExtraSkills를 잘 찾았는데, 그 전 단계에서 막힘

**수정**: `getActiveSkillWords()` 헬퍼 함수 추가, 두 곳에서 사용

```js
// app.js 2790~ 부근
function getActiveSkillWords() {
  const list = CLASSES[state.heroL].skills.map(function (s) { return s.en; });
  if (state.gameMode === 'dungeon' && state.dungeonExtraSkills) {
    state.dungeonExtraSkills.forEach(function (s) { list.push(s.en); });
  }
  return list;
}
```

**검증 결과** (Playwright 자동 테스트):
```
Active skill words: ['fire', 'wave', 'wind', 'light', 'boom']  ✓ boom 포함
Boom 데미지: 12 (4글자 × 3, 정상)  ✓
state.typed 클리어 정상  ✓
```

---

## 5. 다음 세션 우선순위

### 옵션 A: Phase 6 — WebSocket 코옵 (큰 작업, 여러 세션)

유저가 설계 동의함: **캐릭터 선택 → 매칭 화면 (룸 코드 방식) → 코옵 던전**

**핵심 디자인 결정 (이미 합의)**:
- **매칭**: 룸 코드 방식 (4글자, 친구끼리만, 안전)
- **인프라**: WebSocket + Node.js 서버 (또는 BroadcastChannel 프로토타입 먼저)
- **동기화**: Host-authoritative (방장이 권위자)
- **HP**: 분리 (각자 HP, 한 명 죽어도 다른 명 계속)
- **부활**: 살아있는 사람이 "revive" 타이핑 (5초)
- **적**: 한 마리 공유 (협동감)
- **보상**: 분리 (각자 자기 보상)
- **채팅**: 빠른 이모지만 (자유 텍스트 X — 한국 초등 안전)

**구현 로드맵 (예상 ~24시간 = 5-6 세션)**:
1. Node.js WebSocket 서버 — 3-4h
2. 클라이언트 네트워크 레이어 — 3-4h
3. 매칭 UI — 2h
4. 코옵 전투 UI (영웅 2개) — 3h
5. 동기화 로직 — 5h (핵심 난이도)
6. 부활 시스템 — 2h
7. 코옵 보상 화면 — 2h
8. 이모지 채팅 — 1h
9. 2 브라우저 동시 테스트 — 3h

**유저가 제안한 첫 단계**: BroadcastChannel 기반 프로토타입 (같은 브라우저 두 탭) → 디자인 검증 후 본격 서버 작업

### 옵션 B: Phase 5.9 — 폴리싱 (작은 작업, 1-2 세션)

- **마스터+ 등급** (10회/20회 클리어 시 추가 강화) — 현재 5회 1 tier만
- **마스터 도전 모드** (마스터 패시브 비활성으로 클리어)
- **마스터 보너스 에센스** — 마스터된 클래스로 클리어 시 +1 에센스
- **모든 클래스 마스터 시 상**: "전능자" 칭호 또는 특별 외형
- **마스터리 진행 화면**: 모든 클래스 진행도 한눈에
- **첫 해제 축하 화면**: 6번째 캐릭터 해제 시 "컬렉션 완료!" 특별 화면
- **레어 스킬 영구 해제**: 에센스로 영구 보유

### 옵션 C: 다른 폴리싱 가치 옵션

이전에 미뤘던 항목들:
- **모바일 터치 입력** — 가상 키보드 UX 검토 필요
- **던전 중간 저장** — 30분 세션 중단/이어하기
- **무한 던전 모드** — Floor 4+ 점수 모드
- **음악/BGM** — 효과음만 있고 배경 음악 없음
- **외형 스킨** — 같은 클래스 다른 외형
- **클래스별 가격 차등** — 현재 모두 10💎 균일, 일부 클래스만 더 비싸게?

---

## 6. 핵심 데이터 구조 (코드 위치)

### 상수 (app.js 상단 ~200 lines)
```js
CLASSES         — 8 클래스 정의 (이름, 스킬 4개, 색상)
CLASS_PASSIVES  — 8 패시브 정의 (effect, value, kr, desc)
ELEMENTS        — 5 속성 (fire/water/wind/light/dark)
ELEMENT_CHART   — 상성 매트릭스 (1.5/1.0/0.5)
STATUSES        — burn/freeze/weaken/guard/dodge 정의
TUNING          — 데미지 공식, 크리/콤보 임계점
RARE_SKILLS     — 던전 발견 풀 12종
DUNGEON         — totalRooms (7), roomMultipliers (룸별 적 강화)
FLOOR_MULTIPLIERS — F1-F3 곱셈 (1.0/1.5/2.0)
EVENT_TYPES     — spring/challenge 정의
META_UPGRADES   — 4종 영구 강화 정의
CLASS_HINTS     — 클래스 정체성 한 줄 (캠페인 튜토리얼용)
CAMPAIGN_STAGES — 10 스테이지 (tutorial은 function(classId))
CLASS_UNLOCK_COST = 10
DEFAULT_UNLOCKED = ['mage', 'knight']
MASTERY_THRESHOLD = 5
```

### 런타임 상태
```js
state {
  screen: 'main_menu' | 'select' | 'battle' | 'reward' | 'ending'
  gameMode: 'campaign' | 'freeplay' | 'dungeon'
  campaignStage: 1-10
  dungeonFloor: 1-3
  dungeonRoom: 1-7
  dungeonExtraSkills: []     ← max 2 rare skills
  dungeonRoomTypes: []        ← 'combat'|'spring'|'challenge'
  dungeonEssenceEarned: 0     ← 미정산 (사망 시 손실)
  heroL: 'mage' | ...
  ...
}

combat {
  playerHp, playerMaxHp
  playerBarrierHp, playerBarrierMax
  enemyHp, enemyMaxHp, enemyAtk, enemyElement
  charge, chargeMax
  cooldowns: { skill: secLeft, ... }
  enemyStatuses: [{type, remaining, tickAccum}, ...]
  playerStatuses: [...]
  combo, comboLastHit, firstHit, firstHitCount
  ...
}

// localStorage (key → value)
typerpg_max_stage          — 캠페인 최대 클리어 stage
typerpg_dungeon_clears      — 던전 클리어 총횟수
typerpg_meta               — JSON { essence, upgrades, unlockedClasses, classClears }
typerpg_sound_off           — '0' | '1'
```

### 핵심 함수

| 함수 | 위치 | 역할 |
|---|---|---|
| `init()` | ~720 | 부팅, init 모든 시스템 |
| `resetBattle()` | 1880~ | 새 전투 시작 (적 stat, 메타 보너스 적용) |
| `activateSkill(word)` | 2125~ | 스킬 발동 (데미지/회복/버프 모든 액션) |
| `enemyAttack()` | 2220~ | 적 공격 (방어/회피/burn 적용 후 데미지) |
| `tick(dt)` | 2025~ | 게임 루프 (차징/상태이상/패시브 회복) |
| `getActiveSkillWords()` | 2790~ | 현재 타이핑 가능한 단어 목록 (버그 수정 헬퍼) |
| `getPassiveValue(classId)` | ~660 | 패시브 값 (마스터 시 ×1.5) |
| `loadMeta()`, `saveMeta()` | ~570 | localStorage 메타 데이터 |
| `startDungeon()` | 1240~ | 던전 시작 (3 층 전체 리셋) |
| `onDungeonVictory()` | 1305~ | 룸 클리어 후 보상/층 전환 분기 |
| `showRewardScreen()` | 1530~ | 던전 보상 카드 3개 표시 |
| `applyDungeonRoom(n)` | 1270~ | 룸 진입 (적/배경/이벤트 적용) |

---

## 7. 알려진 디자인 결정사항 (변경 시 주의)

- **차징 9999s = 적이 공격 안 함** (Stage 1 사용)
- **Mage 패시브만 원소 보너스** — 다른 클래스에 원소 부여 안 함 (디자인 결정)
- **light 속성 적 없음** — Mage의 `light`는 dark 적 카운터 전용
- **에센스 가격 균일 10💎** — 캐릭터 해제 (모든 클래스 동일)
- **마스터 단일 tier** — 5회 클리어로 모두 ×1.5 (10회+ 추가 tier는 미구현)
- **레어 스킬은 한 던전 내에서만** — 사망/완료 시 소실 (영구화 검토 중)
- **사망 시 미정산 에센스만 손실** — meta.essence (기존 누적분)은 안전
- **역호환**: 기존 진행도가 있는 플레이어는 8 클래스 자동 해제

---

## 8. 테스트 실행 방법

### 로컬 개발
```bash
cd /home/claude/typerpg
python3 -m http.server 8765
# 브라우저: http://localhost:8765/index.html
```

### 자동화 테스트 (Playwright)
```bash
# Python에서 playwright 사용. 컨버전스: 큰 변경 후 항상 자동 테스트로 검증
# 예시 패턴:
from playwright.sync_api import sync_playwright
with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_context(viewport={'width': 1400, 'height': 900}).new_page()
    page.goto('http://localhost:8765/index.html')
    # ... 인터랙션
    page.screenshot(path='/tmp/test.png')
```

### 상태 초기화 (테스트용)
```js
// 브라우저 콘솔에서:
localStorage.clear();
// 또는 메인 메뉴 "진행도 초기화" 버튼
```

### 에센스 빠르게 받기 (개발 테스트)
```js
// 브라우저 콘솔:
const m = JSON.parse(localStorage.getItem('typerpg_meta') || '{}');
m.essence = 100;
m.unlockedClasses = Object.keys(CLASSES);  // 모든 클래스
m.classClears = { mage: 5, knight: 5 };    // 마스터 상태
localStorage.setItem('typerpg_meta', JSON.stringify(m));
location.reload();
```

---

## 9. 코드 작성 스타일

- **ES5 호환** — `function()` 표현식 위주, arrow function 일부 사용. const/let OK.
- **단일 파일** — app.js 하나에 모든 로직. (분리 안 함)
- **DOM 조작은 직접** — 프레임워크 X (vanilla JS)
- **innerHTML 사용** — 단, sprite 같은 url() 포함은 DOM API로 (escape 문제 회피)
- **CSS 변수** — `:root` 에 정의 (--accent, --line, --panel 등)
- **한국어 주석/UI** — 개발 주석은 영어 OK, UI 텍스트는 한국어

---

## 10. 인계 순간 체크리스트

다음 세션 시작 시:

1. ☐ `/home/claude/typerpg/` 파일 존재 확인
2. ☐ HANDOFF.md (이 파일) + README.md 읽기
3. ☐ `python3 -m http.server 8765` 실행 후 게임 정상 로드 확인
4. ☐ topbar에 `💰 0` 골드 카운터 보임
5. ☐ 메인 메뉴 → 캠페인 → mage 선택 → Stage 1 클리어 → 보상 화면 1장 (튜토리얼) → Stage 2 진행
6. ☐ Stage 2 클리어 → 보상 화면 3장 (신규/강화/무작위)
7. ☐ Phase C-3 (엘리트 적 + 패시브 아이템) 시작 준비

---

## 11. v0.61 (Phase C-2) 변경 사항

### 핵심 신규 시스템

**Run-scoped 경제** (캠페인/던전 시작 시 리셋):
- `state.gold` — 적 처치 시 획득 (일반 5, 보스 20, 엘리트 15 [Phase C-3])
- `state.skillLevels` — `{ skillEn: level }` 매핑, Lv 2+ 시 효과 +25%/Lv

**통합 보상 시스템** (`buildRewards(context)`):
- 캠페인/던전 모두 같은 함수 사용
- 컨텍스트별로 다른 보상 생성:
  - `context.isFirstStage = true` → tutorial heal 1장만 (Stage 1)
  - 그 외 → 3장 (신규 / 강화 / 무작위 유틸)
- **신규 슬롯**: COMMON_SKILLS + RARE_SKILLS 통합 풀에서 미보유 스킬 하나
- **강화 슬롯**: 현재 보유 스킬 무작위 → Lv +1 (데미지/회복/보호막 +25%)
- **유틸 슬롯**: 골드 +30, HP +30, 다음 적 데미지 +30% 중 하나

### 새 함수 (app.js, findSkill 근처 ~885)

```js
// 스킬 강화
getSkillLevel(word)          // → 1 기본, 강화될 때마다 +1
upgradeSkill(word)            // level 1 증가
getSkillLevelMult(word)       // Lv N 시 (1.0 + (N-1)*0.25)
getOwnedSkills()              // 현재 보유 스킬 (직업 4 + dungeonExtraSkills)

// 골드
getGoldReward()               // 현재 적의 골드 보상 (kind/elite 기반)
addGold(amount)               // 누적 + updateHud()

// 보상 풀
getAvailableNewSkills()       // COMMON_SKILLS + RARE_SKILLS 미보유분
buildRewards({ isFirstStage }) // 보상 카드 1~3장
```

### 통합 지점

**`activateSkill()`**:
- 데미지 계산에 `levelMult` 추가 (final = baseDamage × ... × levelMult)
- heal/barrier 액션에 `getSkillLevelMult(word)` 적용
- 적 처치 시 `addGold(getGoldReward())` 호출 (메인 + burn-tick 두 군데)

**캠페인 클리어 흐름**:
- `onCampaignVictory()` → 마지막 스테이지면 ending, 아니면 1200ms 후 `showCampaignRewardScreen()`
- 보상 선택 → state.campaignStage++ → 다음 스테이지 진행
- Stage 1 보상은 `isFirstStage: true` 컨텍스트로 호출 → tutorial-heal 1장 강제

**던전 보상**:
- 기존 `generateRewardOptions()`를 `buildRewards({})`로 통합
- `showRewardScreen()` 동일하게 `buildRewards({})` 호출
- 카드 클릭 → `opt.apply()` → 다음 룸 진행 (기존 로직 유지)

**`getActiveSkillWords()` 변경**:
- 기존: `state.gameMode === 'dungeon'`일 때만 dungeonExtraSkills 인식
- 변경: gameMode 무관하게 인식 (캠페인도 reward로 채워지니까)

### Run-scoped state 리셋 지점

- `startDungeon()`: gold=0, skillLevels={}, dungeonExtraSkills=[]
- 메인 메뉴 "캠페인 시작" / "이어하기" 핸들러: 동일 리셋
- 변수 이름은 `dungeonExtraSkills` 유지 (기존 코드 참조 호환)

### UI

**topbar** (index.html):
```html
<span class="gold-pill">💰 <span id="gold-counter">0</span></span>
```
- `.gold-pill` CSS: `kill-pill`과 같은 형태, 노란색 (`#fbbf24`)

**스킬 슬롯** (renderHeroes):
- Lv 2+ 스킬에 좌하단 배지: `<div class="skill-lvl-badge">Lv2</div>`
- 주황 그라데이션 + 글로우

**보상 화면 헤더 (캠페인용)**:
- Stage 1: `TUTORIAL` / `첫 보상 (튜토리얼)` / `HP를 회복하고 다음 스테이지로`
- Stage 2-10: `STAGE CLEAR` / `스테이지 N 클리어!` / `3개 중 하나를 골라 다음 스테이지로`
- 카드 클릭 후 헤더는 기본값(`REWARD` / `보상을 선택하세요`)으로 복원

### 알려진 한계

- **레벨 정보가 도감에 안 보임** — Phase C-3에서 도감에 강화 상태 표시 검토
- **보상 풀이 너무 자주 같은 카드** — 작은 풀(50개)이라 후반에 신규 슬롯 빈약. Phase C-3 후에 RARE_SKILLS 확장 또는 풀 가중치 조정
- **던전 카드 클릭 후 다음 룸 자동 진행** — 캠페인은 보상 후 자동 진행, 던전도 동일하지만 사용자가 "한 박자 쉬어가는" UX 부족. 후속 폴리싱 후보

---

## 12. Phase C 전체 로드맵 (남은 3-4 세션)

### Phase C-3 · 엘리트 적 + 패시브 아이템 (다음, ~2-3시간)

**엘리트 적**:
- 적 정의(`ASSETS.enemies`)에 `elite: true` 플래그 추가
- 일부 적을 엘리트로 표시 (예: 던전 마지막 룸, 캠페인 4/7/10 보스)
- 엘리트는 HP/공격력 +50%, 시각적 마크 (보라색 테두리, ⭐ 아이콘)
- 엘리트 보상: 골드 + **아이템** + 스킬 (현재 일반은 골드+스킬, 엘리트만 아이템)

**패시브 아이템** (~15개 풀):
- 슬롯 제한 없음 → 가로 스크롤 또는 그리드 UI
- `state.items = [itemId, ...]`
- 효과 적용 헬퍼: 데미지/방어/콤보 등 stat 계산 함수에서 통합 modifier
- 후보 (이전 세션 합의 안):
  - 🔥 불꽃 부적 (fire +20%), 🛡️ 철피 (받는 피해 -10%)
  - ⚡ 번개 신발 (5콤보+ 데미지 +10%), 🍀 행운의 동전 (크리 +10%)
  - ❤️ 생명의 꽃 (룸 시작 +20 HP), 🌪️ 신속의 바람 (CD -10%)
  - 🪞 거울 조각 (회피 시 적 10 데미지), 나머지 ~7개 디자인 필요

### Phase C-4 · 인-던전 상점 (~1.5시간)

- 룸 타입 추가: `shop` (combat/spring/challenge에 더해)
- 던전 시퀀스 생성 시 상점 1-2개 보장
- 상점 인벤토리 (가격 안):
  - HP 회복 포션: 20G (+30 HP)
  - 새 스킬 구매: 40G
  - 아이템 구매: 60G
  - 스킬 강화권: 50G

### Phase C-5 · 던전 구조 100층 재설계 (~2-3시간)

**시작 전 확정 필요**:
> **"2~9 던전도 적용"** 정확한 의미:
> - (A) 던전 1개, 100층 깊이만 있음
> - (B) 던전 9개의 다른 테마, MVP는 던전 1만 100층
> - (C) 다른 해석

**구조 안 (해석 A 기준)**:
- 단일 던전, 100층
- 초기엔 10층까지만 진입 가능
- 매 클리어마다 +5층 해금: 10 → 15 → 20 → ... → 100
- 매 10층마다 보스 룸 (10F, 20F, ... 100F)
- 매 5층마다 엘리트 룸
- 그 외: 일반 + 회복샘 + 도전 + 상점 무작위 믹스

**관련 변경**:
- `DUNGEON.totalRooms = 7` → `DUNGEON.maxDepth = 100`
- `dungeonFloor` (1-3) + `dungeonRoom` (1-7) → **`dungeonDepth` (1-100)**으로 단일화

---

## 13. 이전 세션 (v0.60 Phase C-1) 요약

**스킬 풀 50개**: 직업 32 (8×4) + 공용 18 (`COMMON_SKILLS`)
- 중복 단어 5개 (wave/shield/heal/block/dash) 직업 → 공용 이동
- 빈 자리 새 직업 스킬 (flash/parry/cure/stab/chop/glow)

**도감 시스템**:
- localStorage `typerpg_codex` (`{ skillEn: timestamp }`)
- 메인 메뉴 보라색 진입점, 4 탭 (전체/직업/공용/발견됨)
- 발견됨은 컬러, 미발견은 회색+`???`
- 클래스 선택 시 4 스킬 자동 발견, 보상 시 추가 발견

**FX sprite 차원 버그 수정**:
- preview gif에서 정답 추출 (frame count 거의 다 16 또는 24)
- `FX_LIBRARY`에 `fh` 추가, CSS `background-size` 명시
- enemy fx 위치를 sprite 실측 offsetTop+offsetHeight/2로 (% → 픽셀)

---

**팁**: 유저는 *플레이 체감*을 매우 중시함. 새 기능 구현 후 "직접 플레이해보고 알려줘"를 자주 요청. 가능하면 자동 검증 + 스크린샷으로 *시각 증거*까지 보여주는 게 좋음.
