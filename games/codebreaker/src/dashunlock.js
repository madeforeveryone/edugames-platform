// ============================================================
//  dashunlock.js — 대시 해금 연출 시퀀스
//  아이템 먹기 → 아이콘 확대 → cmd 창 → 하이라이트 → Ctrl+V → 함수 삽입 → 해금.
//  기존 CodeBreak(값 편집)와 다른 1회성 연출. 시간 정지(physics 멈춤)는
//  main 루프가 DASH_UNLOCK.active를 체크해서 처리.
//
//  단계는 CSS 클래스로 표현 (#dash-unlock에 s-icon → s-zoom → ... 누적):
//    s-icon  : 아이콘 등장
//    s-zoom  : 아이콘 확대(빨려듦)
//    s-src   : 우상단 dash() 원본 창 등장
//    s-hl    : 원본 코드 하이라이트(복사됨)
//    s-fn    : 하단 player.js 창 등장 (커서 깜빡)
//    s-await : Ctrl+V 프롬프트 표시 (입력 대기)
//    s-paste : 붙여넣기 완료 (dash 블록 삽입 펼침)
// ============================================================

import { player } from './state.js';

export const DASH_UNLOCK = {
  active: false,       // 연출 진행 중? (main 루프가 physics 멈춤 판단)
  awaiting: false,     // Ctrl+V 입력 대기 중?
  _onDone: null,       // 완료 콜백 (main이 주입: dashUnlocked=true 등)
  _root: null,

  el(){ return this._root || (this._root = document.getElementById('dash-unlock')); },

  // 연출 시작 (아이템 먹었을 때 main이 호출). onDone은 완료 시 콜백.
  start(onDone){
    if(this.active) return;
    this.active = true;
    this.awaiting = false;
    this._onDone = onDone || null;
    const r = this.el();
    r.className = 'active';   // 모든 단계 클래스 초기화 후 active만

    // 단계 타임라인 (누적 클래스 추가). 마지막에 Ctrl+V 대기.
    const add = (cls, t)=> setTimeout(()=>{ if(this.active) r.classList.add(cls); }, t);
    add('s-icon',   100);   // 아이콘 등장
    add('s-zoom',   700);   // 확대
    add('s-src',   1500);   // 원본 창
    add('s-hl',    2300);   // 하이라이트(복사)
    add('s-fn',    3100);   // 함수 창 + 커서
    setTimeout(()=>{
      if(!this.active) return;
      r.classList.add('s-await');
      this.awaiting = true;   // 이제 Ctrl+V 받음
    }, 3900);
  },

  // Ctrl+V 입력 처리 (main 키 핸들러가 호출). 대기 중일 때만 동작.
  paste(){
    if(!this.active || !this.awaiting) return;
    this.awaiting = false;
    const r = this.el();
    r.classList.remove('s-await');
    r.classList.add('s-paste');   // dash 블록 삽입 펼침 애니메이션

    // 삽입 애니메이션(0.5s) 후 잠깐 보여주고 연출 종료 → 해금.
    setTimeout(()=>{
      this.finish();
    }, 1300);
  },

  // 연출 종료 + 해금 콜백.
  finish(){
    if(!this.active) return;
    this.active = false;
    this.awaiting = false;
    const r = this.el();
    r.className = '';   // 오버레이 숨김 (display:none)
    player.dashUnlocked = true;
    if(this._onDone) this._onDone();
    this._onDone = null;
  },
};
