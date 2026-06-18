// ============================================================
//  abilityunlock.js — 가벼운 능력 해금 연출 (더블점프·에어대시·월슬라이드)
//  대시 해금(dashunlock.js)의 풀 "코드 붙여넣기" 연출과 달리, 짧은 1회성 팝업:
//    아이템 먹기 → 시간정지 → 능력 아이콘+이름 팝업 → (자동) → 해금 + CMD에 변수 추가 안내.
//  Ctrl+V 같은 입력 없이 잠깐 보여주고 끝(가벼움). physics 멈춤은 main 루프가 active로 판단.
//
//  CMD(편집 메뉴)에 변수가 새로 추가되는 "연출"은: 해금 후 다음에 편집창을 열면
//  새 변수 행이 'bbs-new' 클래스로 잠깐 반짝이도록 hackshell이 처리(여기선 해금 플래그만 세팅).
// ============================================================

import { player } from './state.js';

// kind → { 해금 플래그 세팅, 표시 이름, 편집 변수명(있으면 CMD에 추가됨), 색 }
const SPEC = {
  doubleJumpUnlock: { flag:'doubleJumpUnlocked', title:'DOUBLE JUMP', varName:'jumpCount',      color:'#7fd0ff', sym:'jump' },
  airDashUnlock:    { flag:'airDashUnlocked',    title:'AIR DASH',    varName:'airDashCharges', color:'#ff9d4d', sym:'dash' },
  wallSlideUnlock:  { flag:'wallSlideUnlocked',  title:'WALL SLIDE',  varName:null,             color:'#c89bff', sym:'wall' },
};

export const ABILITY_UNLOCK = {
  active: false,
  _onDone: null,
  _root: null,
  _timers: [],

  el(){ return this._root || (this._root = document.getElementById('ability-unlock')); },

  // 연출 시작. kind=아이템 종류, onDone=완료 콜백(해금된 varName 전달 → 힌트 등).
  start(kind, onDone){
    if(this.active) return;
    const spec = SPEC[kind];
    if(!spec){ if(onDone) onDone(null); return; }
    this.active = true;
    this._onDone = onDone || null;
    this._clearTimers();

    const r = this.el();
    if(r){
      // 내용 주입
      const titleEl = r.querySelector('.au-title');
      const symEl   = r.querySelector('.au-sym');
      const varEl   = r.querySelector('.au-var');
      if(titleEl){ titleEl.textContent = spec.title; }
      if(symEl){ symEl.className = 'au-sym au-' + spec.sym; symEl.style.color = spec.color; }
      if(varEl){
        if(spec.varName){ varEl.textContent = '+ ' + spec.varName; varEl.style.color = spec.color; varEl.style.display = ''; }
        else { varEl.style.display = 'none'; }
      }
      r.style.setProperty('--au-color', spec.color);
      r.className = 'active';                 // 클래스 초기화
      this._t(()=> r.classList.add('s-in'),   60);   // 팝업 등장
      this._t(()=> r.classList.add('s-hold'), 500);  // 강조
    }

    // 해금 플래그 세팅 (연출 도중이라도 즉시 — 실제 능력은 바로 켜짐)
    player[spec.flag] = true;

    // 자동 종료(가벼움): ~1.4초 뒤 닫고 콜백.
    this._t(()=> this._finish(spec), 1400);
  },

  _finish(spec){
    const r = this.el();
    if(r){ r.classList.remove('s-in','s-hold'); r.classList.add('s-out'); }
    this._t(()=>{
      if(r) r.className = '';
      this.active = false;
      const done = this._onDone; this._onDone = null;
      if(done) done(spec.varName);
    }, 220);
  },

  _t(fn, ms){ this._timers.push(setTimeout(fn, ms)); },
  _clearTimers(){ this._timers.forEach(clearTimeout); this._timers = []; },
};
