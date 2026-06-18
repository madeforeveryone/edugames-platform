// ============================================================
//  abilities.js — 해킹 가능한 능력(변수) 레지스트리 (SINGLE SOURCE OF TRUTH)
//  "점프력이 뭔지"가 예전엔 state/engine/변환기 세 곳에 흩어져 있었다.
//  이제 각 능력은 여기 한 곳에서 정의되고, engine·hackshell·변환기는 이걸 참조만 한다.
//  새 능력 추가 = 이 객체에 항목 하나 추가 (engine 코드는 거의 안 건드림).
//
//  각 능력의 필드:
//    default   : 런타임 시작값 (스테이지가 hack.current로 덮어쓸 수 있음)
//    runtimeKey: game 객체에 저장될 런타임 프로퍼티 이름 (보통 `${name}Runtime`)
//    label     : BBS 메뉴/UI에 표시될 사람이 읽는 이름
//    codeExpr  : hackshell 가짜 소스에서 이 변수의 "정의 줄" 텍스트 (값 자리에 %v)
//    codeBlock : (선택) 편집 화면에 보여줄 "여러 줄" 가짜 소스. 있으면 codeExpr 한 줄 대신 이걸 씀.
//                각 줄은 fakeCode와 같은 형식 { t, cls, TARGET? }. TARGET:true 줄의 t에 %v(현재값)가 들어감.
//                목적: 보조 변수(대시 등)도 주 변수(jumpPower)처럼 "코드 맥락"을 갖게 해
//                "달랑 한 줄"의 휑함을 없앤다. 단 주 변수 풀 블록(11줄)보다는 가볍게(5~7줄) 유지.
//    hintName  : 힌트 문구에 쓸 변수명 (보통 변수명 그대로)
//    inFakeCode: (선택, 기본 true) 변환기가 모든 스테이지 fakeCode에 이 변수 줄을 자동 포함할지.
//                대시처럼 "해금되어야 등장"하는 능력은 false로 두고, 해금 연출이 별도 처리.
//
//  ── 물리 적용에 대하여 ──
//  능력마다 "언제/어떻게" 값을 쓰는지가 다르다(점프는 점프키 눌렀을 때 1회,
//  중력은 매 프레임). 그래서 적용 로직은 engine.physics()의 흐름 안에 둔 채,
//  engine이 getRuntime()으로 "현재 값"만 레지스트리 기준으로 읽는다.
//  값의 *의미*(기본값·표시·코드표현)는 레지스트리가, 값의 *물리적 효과*는 engine이 갖는
//  이 분리가 핵심이다. (점프력과 중력은 물리적으로 다른 일을 하므로 효과는 변수마다 불가피.)
// ============================================================

export const ABILITIES = {
  gravity: {
    default: 100,
    runtimeKey: 'gravityRuntime',
    label: 'gravity',
    codeExpr: 'let gravity  = %v;',
    hintName: 'gravity',
    min: 50, max: 150,   // 중력 범위 (낮으면 둥실, 높으면 묵직)
  },
  jumpPower: {
    default: 10,
    runtimeKey: 'jumpPowerRuntime',
    label: 'jumpPower',
    codeExpr: 'let jumpPower = %v;',
    hintName: 'jumpPower',
    min: 5, max: 30,   // 점프력 범위
  },
  dashPower: {
    default: 8,
    runtimeKey: 'dashPowerRuntime',
    label: 'dashPower',
    codeExpr: 'let dashPower = %v;',
    hintName: 'dashPower',
    min: 5, max: 16,   // 대시 거리 범위
    inFakeCode: false,   // 해금 전엔 등장 안 함 (해금 연출이 별도 처리)
    // 편집 화면용 미니 블록 (6줄). jumpPower 풀 블록(11줄)보다 가볍게 — 보조 변수다움 유지.
    //   TARGET 줄에만 %v(현재값) + 편집 가능. 나머지는 "맥락"용 읽기 전용.
    codeBlock: [
      {t:'// ===== DASH MODULE =====', cls:['cm']},
      {t:'let dashSpeed   = 6;', cls:['kw']},
      {t:'let dashPower   = %v;', cls:['kw'], TARGET:true},
      {t:'', cls:[]},
      {t:'function onDash() {', cls:['kw']},
      {t:'  player.vx = facing * dashPower;', cls:[]},
      {t:'}', cls:[]},
    ],
  },
  dashCharges: {
    default: 1,
    runtimeKey: 'dashChargesRuntime',
    label: 'dashCharges',
    codeExpr: 'let dashCharges = %v;',
    hintName: 'dashCharges',
    min: 1, max: 3,   // 지상 대시 충전 범위
    inFakeCode: false,   // 해금 전엔 등장 안 함
  },
  // 더블점프 횟수 (기본 2 = 지상 점프 1 + 공중 1). 해킹으로 늘리면 다단 점프.
  jumpCount: {
    default: 2,
    runtimeKey: 'jumpCountRuntime',
    label: 'jumpCount',
    codeExpr: 'let jumpCount = %v;',
    hintName: 'jumpCount',
    min: 2, max: 4,   // 점프 횟수 범위 (2=더블 ~ 4=쿼드). 무한 증가 방지.
    inFakeCode: false,   // 해금(더블점프 아이템) 전엔 등장 안 함
    codeBlock: [
      {t:'// ===== JUMP MODULE =====', cls:['cm']},
      {t:'let jumpPower   = 10;', cls:['kw']},
      {t:'let jumpCount   = %v;', cls:['kw'], TARGET:true},
      {t:'', cls:[]},
      {t:'function onJump() {', cls:['kw']},
      {t:'  if (jumpsLeft > 0) vy = -jumpPower;', cls:[]},
      {t:'}', cls:[]},
    ],
  },
  // 에어대시 충전 (기본 1 = 공중에서 1회). 지상 대시(dashCharges)와 별개. 해킹으로 늘리면 다단 에어대시.
  airDashCharges: {
    default: 1,
    runtimeKey: 'airDashChargesRuntime',
    label: 'airDashCharges',
    codeExpr: 'let airDashCharges = %v;',
    hintName: 'airDashCharges',
    min: 1, max: 3,   // 에어대시 충전 범위
    inFakeCode: false,   // 해금(에어대시 아이템) 전엔 등장 안 함
    codeBlock: [
      {t:'// ===== AIR DASH MODULE =====', cls:['cm']},
      {t:'let dashPower      = 8;', cls:['kw']},
      {t:'let airDashCharges = %v;', cls:['kw'], TARGET:true},
      {t:'', cls:[]},
      {t:'function onAirDash() {', cls:['kw']},
      {t:'  if (airDashLeft > 0) dash();', cls:[]},
      {t:'}', cls:[]},
    ],
  },
};

// 능력 이름 → 런타임 프로퍼티 키 (예: 'jumpPower' → 'jumpPowerRuntime')
export function runtimeKeyOf(name){
  const a = ABILITIES[name];
  return a ? a.runtimeKey : (name + 'Runtime');
}

// game 객체에서 능력의 현재 런타임 값 읽기 (없으면 default).
export function getRuntime(game, name){
  const a = ABILITIES[name];
  const key = runtimeKeyOf(name);
  const v = game[key];
  return (v == null) ? (a ? a.default : 0) : v;
}

// game 객체에 능력 런타임 값 쓰기.
export function setRuntime(game, name, val){
  game[runtimeKeyOf(name)] = val;
}

// 능력의 허용 값 범위 {min,max}. 미정의면 안전한 폴백(1~99).
export function rangeOf(name){
  const a = ABILITIES[name];
  const min = (a && a.min != null) ? a.min : 1;
  const max = (a && a.max != null) ? a.max : 99;
  return { min, max };
}

// 입력값을 그 변수의 허용 범위로 클램프. 정수로 반올림.
export function clampValue(name, val){
  const { min, max } = rangeOf(name);
  let v = Math.round(Number(val));
  if(!Number.isFinite(v)) v = min;
  return Math.max(min, Math.min(max, v));
}

// 모든 능력의 런타임 슬롯을 default로 초기화 (state 부팅 시 사용).
export function defaultRuntimes(){
  const out = {};
  for(const name in ABILITIES){
    out[ABILITIES[name].runtimeKey] = ABILITIES[name].default;
  }
  return out;
}

// BBS 메뉴에 올릴 "현재 편집 가능한 능력" 목록.
//   - stage의 주 변수(primaryVar, 보통 hack.varName)는 항상 포함.
//   - 해금된 능력만 합류 (해금 순서대로 뒤에): 대시→대시충전 / 더블점프 / 에어대시.
//   unlocks: { dash, doubleJump, airDash } (없으면 false 취급).
//   반환: [{ name, label }] (메뉴 번호 순서대로).
export function editableAbilities(primaryVar, unlocks){
  const u = unlocks || {};
  const list = [];
  const seen = new Set();
  const push = (name)=>{
    if(!name || seen.has(name) || !ABILITIES[name]) return;
    seen.add(name);
    list.push({ name, label: ABILITIES[name].label });
  };
  push(primaryVar);                 // 주 변수 먼저 (원래 있던 것)
  if(u.dash){                       // 대시 해금 시 합류
    push('dashPower');
    // push('dashCharges');   // ⏸ 지금은 숨김 (지상 대시 충전은 고정 1). 레지스트리/기본값은 유지.
  }
  if(u.doubleJump){                 // 더블점프 해금 시 jumpCount 편집 가능
    push('jumpCount');
  }
  if(u.airDash){                    // 에어대시 해금 시 airDashCharges 편집 가능
    push('airDashCharges');
  }
  return list;
}
