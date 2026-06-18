// ============================================================
//  state.js — 공유 가변 상태 (SHARED MUTABLE STATE)
//  여러 모듈(engine, hackshell, main)이 함께 읽고 쓰는 런타임 값.
//  ES 모듈은 import한 원시 let 을 외부에서 재할당할 수 없으므로,
//  변경이 필요한 값은 모두 이 객체의 "프로퍼티"로 둔다.
// ============================================================

import { defaultRuntimes } from './abilities.js';

// ---- 월드 상수 (불변) ----
// 32px 타일 세계 (lab 테마). 이전 16px에서 2배 스케일.
//   물리 상수(RUN_SPEED 등)도 함께 2배여서 "타일 대비 동일한 움직임 느낌"을 유지한다.
export const TILE = 32;
// 중력은 더 이상 상수가 아니라 game.gravityRuntime (해킹 대상). 능력 레지스트리(abilities.js) 참조.
export const RUN_SPEED = 3.4;   // 16px 시절 1.7의 2배
export const FRICTION = 0.75;   // 비율 감쇠라 스케일 무관

// 타일셋 소스 좌표 (확인된 좌표)
export const SRC = {
  grassTop: {x:0,  y:0},
  dirt:     {x:0,  y:32},
  spike:    {x:0,  y:320},  // lab 가시: Tiles.png 하단에 추가한 칸 (Spikes.png 3번 프레임=완전히 솟음)
};

// 이동/고정/점멸 발판 스프라이트(Platform.png)는 192x32 = 6프레임(32x32) 가로 시트.
//   발판이 "생겨나는" 애니메이션(frame0 얇음 → frame4~5 완전히 형성). 캡/중간 타일이 아님.
//   - 고정 발판: 마지막 프레임(완성형)만 표시.
//   - 점멸 발판: 켜질 때 frame0→5로 나타나는 연출, 꺼지면 사라짐.
//   - 폭 widthTiles>1이면 각 칸에 같은 프레임을 나란히 그림(가로로 늘림).
export const PLATFORM_SRC = { frameW: 32, frameH: 32, frames: 6 };

// 산성액 스프라이트: Acid1/Acid2(+생성한 Acid3)는 각각 432x72 = 6프레임(72x72) 가로 시트.
//   frame 0~5를 가로로 자른다. acid_drip은 꼬리(위)가 있어 떨어지는 느낌, acid_burst는 제자리.
export const ACID_SRC = { frameW: 72, frameH: 72, frames: 6 };
// 산성액 "충돌 중심"이 프레임 안에서 차지하는 세로 비율(0=위, 1=아래).
//   에셋 측정값: 방울이 맺힌/터지는 중심이 프레임의 약 60% 지점(72px 중 ~43px).
//   이 지점이 바닥 표면에 닿도록 그려야 공중이 아니라 바닥에서 터지는 것처럼 보인다.
export const ACID_IMPACT_FRAC = 0.60;

// 가시 스프라이트(Spikes.png): 192x32 = 6프레임(32x32) 가로 시트. 솟았다 들어가는 전체 사이클.
//   프레임 의미(작가 에셋 확인): f0=받침대(완전히 들어감, 안전) → f1=솟는 중 → f2=독침 만개(진짜 위험)
//     → f3=독침 작아지며 들어가기 시작 → f4→f5=더 내려감 → (f0으로 복귀).
//   사용 규칙(platform과 동일 철학):
//     off(안전)  : f0 고정.
//     솟기 전환  : f0→f1→f2 재생(짧게).
//     on(위험)   : f2 고정 — 이 상태에서만 칸 전체 사망 판정.
//     들어가기 전환: f3→f4→f5 재생 후 f0.
export const SPIKE_SRC = { frameW: 32, frameH: 32, frames: 6 };
// 가시 솟기/들어가기 전환 애니의 길이(초). on/off 유지 시간과 별개로 짧게 고정(전환이 유지시간을 깎지 않음).
export const SPIKE_RISE_SECONDS    = 0.18;   // f0→f1→f2 (3프레임)
export const SPIKE_RETRACT_SECONDS = 0.30;   // f3→f4→f5 (3프레임), 들어가는 건 조금 더 느긋하게

// ---- 런타임 상태 (가변) ----
// 단일 객체로 묶어 모듈 간 공유. engine이 갱신하고 hackshell이 읽는 식.
export const game = {
  // 현재 스테이지 (레지스트리에서 main이 주입). engine/hackshell이 이걸 읽음.
  currentStage: null,
  stageIndex: 0,
  // 해킹 대상 변수들의 런타임 값. 능력 레지스트리(abilities.js)에서 자동 생성.
  //   스테이지가 어떤 변수를 쓰든 여기 담김. 새 능력은 abilities.js에만 추가하면 됨.
  ...defaultRuntimes(),
  // 마지막 사망 원인 ('fall' | 'spike')
  lastCause: null,
  // 대시 해금 아이템: 이번 방에서 먹었는지 (먹으면 연출 후 dashUnlocked=true).
  //   dashUnlocked는 player에, 이건 "아이템 소비 여부"라 game에 둠 (방 전환 시 리셋).
  dashItemTaken: false,
  // 동적 위험/장치(이동 발판 등) 런타임 인스턴스. buildHazards()가 data/hazards.js로부터 채움.
  hazards: [],
  // 위험 위상용 프레임 카운터. play 단계에서만 증가(시간정지·연출 중엔 멈춤) → 결정론적 주기.
  tick: 0,
  // 마지막으로 접촉한 Exit의 목적지: target(방 인덱스) + targetEntry(그 방의 Enter id).
  //   Exit 접촉 시 engine이 설정, main의 onWin이 target으로 방 전환, buildLevel이 targetEntry로 입구 선택.
  exitTarget: null,
  exitTargetEntry: null,
  // ── 코드브레이크 횟수 제한 ──
  //   breaksMax = 이번 방에서 쓸 수 있는 최대 횟수(해금할수록 증가). breaksLeft = 남은 횟수.
  //   C로 편집창을 "열 때" 1회 소모. 0이면 코드브레이크 비활성. 방 진입/사망 시 breaksLeft=breaksMax로 리셋.
  breaksMax: 1,
  breaksLeft: 1,
};

// ---- 플레이어 ----
export const player = {
  // 충돌박스: "보이는 몸"에 맞춘 타이트 박스 (이전 48x60은 스프라이트 프레임 전체라 너무 컸음).
  //   Platform Boy 60px 원본에서 idle/walk 몸통은 대략 폭 16~18 · 높이 24 → 2배 시 ~36x48.
  //   여기서 살짝 더 줄여 30x46으로 잡으면 "보이는 것보다 약간 작은" 관대한 판정이 됨.
  //   ⚠️ 스프라이트 그리기는 박스 중심(x+w/2)·바닥(y+h)에 맞춰 그리므로(engine drawPlayer),
  //      박스를 대칭으로 줄여도 캐릭터 외형 위치는 그대로 유지된다(발=바닥 정렬 불변).
  x:0, y:0, vx:0, vy:0, w:30, h:46,
  grounded:false, facing:1, dead:false, won:false,
  anim:'idle', frame:0, frameT:0,
  // 대시 상태 (런타임): dashUnlocked=해금 여부, dashLeft=현재 남은 지상 대시 충전.
  //   조작 대상 변수(dashPower/dashCharges)는 abilities.js 레지스트리에 있음.
  //   착지하면 dashLeft가 dashCharges(런타임값)로 리셋됨.
  dashUnlocked:false, dashLeft:0, dashing:0,   // dashing>0이면 대시 가속 지속 프레임
  // ── 데모 추가 능력 (전부 아이템으로 해금) ──
  //   더블점프: jumpsLeft가 0보다 크면 점프 발동. 착지/벽붙음 시 jumpCount(런타임)로 리셋.
  doubleJumpUnlocked:false, jumpsLeft:0,
  //   에어대시: 공중에서 airDashLeft 소비(지상 대시와 별개). 착지 시 airDashCharges로 리셋.
  airDashUnlocked:false, airDashLeft:0,
  //   월슬라이드/월점프: touchingWallDir = 현재 밀착한 벽 방향(-1 왼쪽벽, +1 오른쪽벽, 0 없음).
  //     wallSliding = 이번 프레임 슬라이드 중인가(낙하 감속 적용 여부, 애니/연출용).
  wallSlideUnlocked:false, touchingWallDir:0, wallSliding:false,
  wallJumpLock:0,   // 월점프 직후 수평 입력을 잠깐 무시하는 프레임(벽으로 즉시 다시 붙는 것 방지).
  // 현재 올라타 있는 이동 발판 인스턴스(없으면 null). 매 프레임 재판정. 발판 carry에 사용.
  ridingPlatform:null,
  // 연출 단계: 'intro'(화면 밖→시작점 자동 달리기) | 'play'(조작 가능) | 'outro'(깃발→화면 밖)
  phase:'play',
  introTargetX:0,   // intro에서 멈출 x (시작점)
  introTargetY:0,   // 수직 intro에서 멈출 y (시작점 바닥)
  introDir:1,       // intro 진행(주행) 방향. 수평: +1 오른쪽으로/-1 왼쪽으로 달려와 멈춤. 수직: -1 위로/+1 아래로.
  introAxis:'x',    // intro 진입 축 ('x' 수평 달리기 | 'y' 수직 낙하/상승). enter 필드·직전 퇴장으로 결정.
  outroDir:1,       // outro 퇴장 방향. 수평(x): +1 오른쪽/-1 왼쪽. 수직(y): -1 위/+1 아래.
  outroAxis:'x',    // outro 퇴장 축 ('x' 수평 달리기 | 'y' 수직 점프상승/낙하). 골 위치 또는 exit 필드로 결정.
};

// ---- 카메라 ----
export const camera = {x:0};

// ---- 입력 ----
export const keys = {};

// ---- 먼지 파티클 ----
export const dustParticles = [];

// ---- 로드된 이미지 ----
export const img = {};
