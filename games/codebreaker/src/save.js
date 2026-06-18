// ============================================================
//  save.js — 진행도·설정 저장 (localStorage 래퍼)
//  분기 동선(복귀 포함)이라 "마지막으로 있던 방 인덱스"를 저장한다(가장 멀리 간 방 아님).
//  설정(언어, 사운드 토글)도 같은 저장소에 보관.
//
//  localStorage가 막힌 환경(사생활 모드 등)에서도 죽지 않도록 모든 접근을 try/catch로 감싼다.
//  → 저장 안 되면 "이번 세션만 유지"로 폴백(메모리). 게임 자체는 항상 동작.
// ============================================================

const KEY = 'codebreaker.save.v1';

// 메모리 폴백(스토리지 막혔을 때). 형태는 저장 데이터와 동일.
let mem = null;

function read(){
  try {
    const raw = localStorage.getItem(KEY);
    if(raw) return JSON.parse(raw);
  } catch(e){ /* 접근 불가 → 메모리 폴백 */ }
  return mem;
}

function write(obj){
  mem = obj;   // 항상 메모리에도 보관(스토리지 실패 대비)
  try {
    localStorage.setItem(KEY, JSON.stringify(obj));
  } catch(e){ /* 무시: 메모리 폴백으로 이번 세션은 유지됨 */ }
}

// 기본 저장 데이터 (없을 때).
function defaults(){
  return {
    lastRoom: null,          // 마지막으로 있던 스테이지 인덱스. null=진행 없음(이어하기 비활성).
    settings: {
      lang: null,            // 'ko'|'en'|null(자동감지). 사용자가 설정에서 고르면 채워짐.
      bgm: true,             // BGM 온오프 (지금은 토글 UI만; 실제 사운드 연결 시 사용).
      sfx: true,             // 효과음 온오프.
    },
  };
}

// 현재 저장 데이터 가져오기 (없으면 기본값 객체, 저장은 안 함).
function load(){
  const d = read();
  if(!d) return defaults();
  // 누락 필드 보강(구버전/부분 데이터 대비).
  const base = defaults();
  return {
    lastRoom: (d.lastRoom != null) ? d.lastRoom : base.lastRoom,
    settings: Object.assign(base.settings, d.settings || {}),
  };
}

// ── 진행도 ──
export function saveRoom(index){
  const d = load();
  d.lastRoom = index;
  write(d);
}
export function getLastRoom(){
  return load().lastRoom;   // null이면 진행 없음
}
export function hasProgress(){
  return load().lastRoom != null;
}
export function clearProgress(){
  const d = load();
  d.lastRoom = null;
  write(d);
}

// ── 설정 ──
export function getSettings(){
  return load().settings;
}
export function setSetting(key, value){
  const d = load();
  d.settings[key] = value;
  write(d);
}
