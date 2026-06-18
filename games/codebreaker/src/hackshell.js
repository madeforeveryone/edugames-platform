// ============================================================
//  hackshell.js — LAYER 3: HACK SHELL (완전 공통)
//  CodeBreak! 연출 (그레이스케일 → cmd → 코드 스트리밍 → 입력 → 복귀).
//  값 변경형 해킹의 핵심. 새 기능(복붙형)은 이 위에 모드를 추가할 예정.
// ============================================================

import { game, player } from './state.js';
import { cv, resetPlayer } from './engine.js';
import { getRuntime, setRuntime, editableAbilities, ABILITIES, rangeOf, clampValue } from './abilities.js';
import { t } from '../data/i18n.js';

export const HACK = {
  active:false,
  used:false,
  isReopen:false,
  keepPos:false,   // true면 코드 적용 후 현재 위치 유지(실시간 조정), false면 시작점 복귀
  termOpen:false,  // 터미널이 실제로 열려 상호작용 가능한가 (연출 1.4초 중엔 false → cancel 무시)
  menuOpen:false,  // BBS 변수 선택 메뉴가 떠 있는가
  activeVar:null,  // 현재 편집 중인 변수명 (메뉴에서 고른 것 / 주 변수). null이면 주 변수 사용.
  _wired:false,
  _menuWired:false,

  // 첫 편집(보통 죽음 후): 극적 CodeBreak 연출 + 시작점 복귀
  trigger(){
    if(this.active) return;
    this.active=true;
    this.isReopen=false;
    this.keepPos=false;
    cv.style.transition='filter 1.4s ease';
    cv.style.filter='grayscale(1) brightness(.6) contrast(1.1)';
    const banner=document.getElementById('codebreak-banner');
    banner.classList.add('show');
    setTimeout(()=>{
      banner.classList.remove('show'); banner.style.opacity='0';
      this._enterEditing();
    },1400);
  },

  // 빠른 재오픈: 연출 생략, 시간만 멈춤(그레이스케일).
  //   keepPos=true → 실시간 조정(현재 위치 유지), false → 재시도(시작점 복귀)
  reopen(keepPos){
    if(this.active) return;
    this.active=true;
    this.isReopen=true;
    this.keepPos = !!keepPos;
    cv.style.transition='filter .35s ease';
    cv.style.filter='grayscale(1) brightness(.6) contrast(1.1)';
    setTimeout(()=>this._enterEditing(),300);
  },

  // 현재 편집 가능한 능력 목록 (주 변수 + 해금된 능력 변수들).
  _abilities(){
    const primary = game.currentStage.hack.varName;
    return editableAbilities(primary, {
      dash:       player.dashUnlocked,
      doubleJump: player.doubleJumpUnlocked,
      airDash:    player.airDashUnlocked,
    });
  },

  // 편집 진입: 능력이 2개 이상이면 BBS 메뉴, 1개면 바로 편집창.
  _enterEditing(){
    const abilities = this._abilities();
    if(abilities.length >= 2){
      this._showMenu(abilities);
    } else {
      this.activeVar = abilities.length ? abilities[0].name : game.currentStage.hack.varName;
      this.openTerminal();
    }
  },

  // BBS 변수 선택 메뉴 표시. 숫자 키로 선택, ESC로 닫기.
  _showMenu(abilities){
    this.menuOpen = true;
    this.termOpen = true;   // ESC 허용
    const menu = document.getElementById('bbs-menu');
    const list = document.getElementById('bbs-list');
    const term = document.getElementById('terminal');
    term.classList.remove('open');   // 편집창은 닫아둠

    // 목록 렌더. 처음 등장하는 변수(새로 해금된 능력)는 'bbs-new'로 잠깐 반짝임.
    if(!this._seenVars) this._seenVars = new Set();
    list.innerHTML = '';
    abilities.forEach((a, i)=>{
      const cur = getRuntime(game, a.name);
      const row = document.createElement('div');
      const isNew = !this._seenVars.has(a.name);
      row.className = 'bbs-opt' + (isNew ? ' bbs-new' : '');
      row.innerHTML = '<span class="bbs-num">'+(i+1)+'.</span> '+a.label+
                      ' <span class="bbs-val">= '+cur+'</span>'+
                      (isNew ? ' <span class="bbs-tag">NEW</span>' : '');
      row.addEventListener('click', ()=>this._pickVar(i));
      list.appendChild(row);
      this._seenVars.add(a.name);   // 다음부턴 NEW 안 붙음
    });
    document.getElementById('bbs-prompt-num').textContent = '';
    menu.classList.add('show');

    // 키 핸들러 결선 (최초 1회). 숫자=선택, ESC=닫기.
    if(!this._menuWired){
      this._menuWired = true;
      document.addEventListener('keydown', (e)=>{
        if(!this.menuOpen) return;
        if(e.key==='Escape'){ e.preventDefault(); e.stopPropagation(); this.cancel(); return; }
        const n = parseInt(e.key, 10);
        if(!isNaN(n) && n>=1){
          const abilities = this._abilities();
          if(n <= abilities.length){ e.preventDefault(); this._pickVar(n-1); }
        }
      });
    }
  },

  // 메뉴에서 변수 선택 → 메뉴 닫고 편집창으로.
  _pickVar(index){
    const abilities = this._abilities();
    if(index < 0 || index >= abilities.length) return;
    this.activeVar = abilities[index].name;
    this.menuOpen = false;
    document.getElementById('bbs-menu').classList.remove('show');
    this.openTerminal();
  },

  openTerminal(){
    const term=document.getElementById('terminal');
    term.classList.add('open');
    this.termOpen=true;   // 이제부터 상호작용 가능 (cancel 허용)
    const scroll=document.getElementById('term-scroll');
    const termInput=document.getElementById('term-input');

    // 이전 동적 코드줄 제거 (재오픈 대비), 입력 영역 초기화
    [...scroll.querySelectorAll('.code-line')].forEach(n=>n.remove());
    termInput.classList.remove('show','paste-flash');

    const STAGE = game.currentStage;
    // 활성 변수 결정 (메뉴에서 고른 것 / 주 변수).
    const vn = this.activeVar || STAGE.hack.varName;
    const isPrimary = (vn === STAGE.hack.varName);

    // 표시할 코드 줄: 주 변수면 스테이지의 fakeCode 그대로,
    //   부가 변수면 레지스트리의 codeBlock(여러 줄)을, 없으면 codeExpr(한 줄)을 TARGET으로 구성.
    let lines;
    if(isPrimary){
      lines = STAGE.fakeCode;
    } else {
      const ab = ABILITIES[vn];
      if(ab.codeBlock){
        // 미니 블록: TARGET 줄은 값이 shownVal로 따로 렌더되므로 t는 자리표시만 둔다.
        lines = ab.codeBlock.map(l => ({ ...l }));
      } else {
        lines = [{ t: ab.codeExpr.replace('%v', getRuntime(game, vn)), cls:['kw'], TARGET:true }];
      }
    }

    let idx=0;
    // 부가 변수는 항상 "현재값"을 보여줌 (해금 후 자유 조정이므로 isReopen 취급).
    const shownVal = (this.isReopen || !isPrimary) ? getRuntime(game, vn) : STAGE.hack.current;
    const self=this;

    // 편집 대상 줄 옆 주석: 힌트 최소화(데모) — 방향 유도("더 줄여/키워봐")를 모두 제거하고
    //   중립적인 표시 하나만 둔다. 어느 쪽으로 바꿀지는 플레이어가 직접 판단.
    let comment = t('cm_neutral');

    // 스트리밍 속도: 첫 침입은 한 줄씩 타이핑되는 연출(극적), 재조정은 즉시 전부 출력(리듬 유지).
    //   재조정(isReopen)은 이미 본 코드라 매번 다시 타이핑하면 "값만 살짝 바꾸려는데 또 풀 연출"이 됨.
    const streamDelay = this.isReopen ? 0 : 85;
    let targetLineEl=null;

    function streamLine(){
      if(idx>=lines.length){
        // 모든 코드 줄 출력 완료 → 드래그 선택 → 하단 입력 영역 활성화
        setTimeout(()=>self.runDragSequence(vn, shownVal, targetLineEl),
                   self.isReopen?60:550);
        return;
      }
      const l=lines[idx];
      const div=document.createElement('div');
      div.className='code-line';

      if(l.TARGET){
        // 조작 대상 줄: let varName = [value]  (selectable 덩어리, 읽기 전용 강조)
        div.classList.add('target-code');
        div.innerHTML =
          '<span class="selectable"><span class="kw">let</span> '+vn+
          ' <span class="eq">=</span> '+
          '<span class="editable" id="ed-num">'+shownVal+'</span></span>;'+
          '  <span class="cm">'+comment+'</span>';
        targetLineEl=div;
      } else {
        div.innerHTML = highlightCode(l.t);
      }
      scroll.appendChild(div);
      idx++;
      // 재조정이면 즉시(setTimeout 0이라도 한 틱) 다음 줄 — 사실상 한 프레임에 전부 그림.
      if(streamDelay <= 0) streamLine();
      else setTimeout(streamLine, streamDelay);
    }
    streamLine();

    // 입력 영역 이벤트 결선 (정적 요소이므로 최초 1회)
    if(!this._wired){
      this._wired=true;
      document.getElementById('hack-run').addEventListener('click',()=>this.runHack());
      document.getElementById('hack-input').addEventListener('keydown',e=>{
        if(e.key==='Enter') this.runHack();
        else if(e.key==='Escape'){
          // 입력 도중 ESC → 친 값 버리고 변경 없이 닫기 (③).
          //   window 핸들러와 중복 발화 방지: 여기서 처리하고 전파 중단.
          e.preventDefault(); e.stopPropagation();
          this.cancel();
        }
      });
    }
  },

  // ── 드래그 선택 → 하단 입력 영역 활성화 ──
  runDragSequence(vn, shownVal, targetLineEl){
    const self=this;
    const termInput=document.getElementById('term-input');
    if(!targetLineEl) return;

    // 입력 영역의 변수명 갱신 (스테이지마다 다를 수 있음)
    const vnEl=document.getElementById('input-vn');
    if(vnEl) vnEl.textContent=vn;

    // 재조정은 연출을 압축(빠르게), 첫 침입은 묵직하게.
    const tGrab  = self.isReopen ? 120 : 560;   // 드래그 선택 잡히는 시간
    const tInput = self.isReopen ? 200 : 1000;  // 입력창 뜨는 시간

    // 1) 드래그 선택 (왼→오 쓸기 + 색반전)
    targetLineEl.classList.add('dragging');

    // 2) 선택 완료 → 잡힌 느낌
    setTimeout(()=>{
      targetLineEl.classList.remove('dragging');
      targetLineEl.classList.add('grabbed');
    }, tGrab);

    // 3) 하단 입력 영역 활성화 (붙여넣어진 듯 깜빡)
    setTimeout(()=>{
      termInput.classList.add('show','paste-flash');
      const inp=document.getElementById('hack-input');
      inp.value = self.isReopen ? String(shownVal) : '';
      setTimeout(()=>{ inp.focus(); inp.select(); }, 120);
      setTimeout(()=>termInput.classList.remove('paste-flash'), 520);
    }, tInput);
  },

  runHack(){
    const inp=document.getElementById('hack-input');
    if(!inp) return;
    const raw=inp.value.trim();
    let val=parseInt(raw,10);

    if(raw===''||isNaN(val)){
      this.showMsg(t('msg_need_number'), '#ffb84d');
      return;
    }
    // 변수별 범위로 클램프 (abilities.js의 min/max). 범위 밖이면 한계값으로 맞추고 알림.
    const varName = this.activeVar || game.currentStage.hack.varName;
    const { min, max } = rangeOf(varName);
    const clamped = clampValue(varName, val);
    if(clamped !== val){
      // 한계 도달 안내 (예: "범위 2–4"). 값은 한계로 맞춰 계속 진행.
      this.showMsg(t('msg_range').replace('{min}', min).replace('{max}', max), '#ffb84d');
    }
    val = clamped;
    const ed=document.getElementById('ed-num');
    if(ed) ed.textContent=val;

    // 정답 판정은 "실행해보면 안다" — 틀려도 게임으로 돌려보내 직접 확인하게
    setRuntime(game, varName, val);
    this.closeAndResume(val);
  },

  closeAndResume(val){
    // 값 적용 경로: recompiling 메시지 → 잠깐 뜸 들인 뒤 종료.
    this.showMsg(t('msg_recompiling'), '#3cf06a');
    setTimeout(()=>{
      this._teardown({ keepPos:this.keepPos, val });
    }, 650);
  },

  // 값 변경 없이 닫기.
  //   살아있을 때(keepPos=true): 멈춘 그 위치에서 그대로 재개.
  //   죽은 상태(keepPos=false): R과 동일 — 이전 값으로 시작점 재시작.
  //   연출 중(termOpen=false)엔 무시. recompiling 없이 즉시(~300ms) 페이드.
  cancel(){
    if(!this.active || !this.termOpen) return;   // 연출 중/비활성: 무시 (②번 가드)
    this._teardown({ keepPos:this.keepPos, val:null });
  },

  // 공통 종료 시퀀스: terminal 닫기 → 그레이스케일 해제 → 상태 복원 → 재개/재시작.
  //   opts.val===null 이면 "변경 없이 닫기"(cancel). 아니면 "값 적용"(closeAndResume).
  _teardown({ keepPos, val }){
    const STAGE = game.currentStage;
    const term=document.getElementById('terminal');
    term.classList.remove('open');
    // BBS 메뉴가 떠 있었다면 같이 닫기 (메뉴에서 ESC로 취소한 경우).
    this.menuOpen = false;
    const menu = document.getElementById('bbs-menu');
    if(menu) menu.classList.remove('show');
    cv.style.transition = (val===null) ? 'filter .3s ease' : 'filter 1.4s ease';
    cv.style.filter='none';
    document.getElementById('term-input').classList.remove('show');
    const shownVn = this.activeVar || STAGE.hack.varName;
    setTimeout(()=>{
      this.active=false;
      this.termOpen=false;
      this.activeVar=null;   // 다음 편집을 위해 초기화
      const vn = shownVn;
      if(keepPos){
        // 살아서 멈춤 → 그 위치 그대로 이어서 (부활 안 함).
        if(val===null) showHint(t('resume_plain'));
        else { this.used=true; showHint(t('resume_applied', { vn, val })); }
      } else {
        // 죽은 상태 → 시작점에서 다시 시작 (cancel이든 적용이든 동일).
        resetPlayer();
        if(val===null) showHint(t('restart_plain'));
        else { this.used=true; showHint(t('restart_applied', { vn, val })); }
      }
    }, (val===null) ? 300 : 500);
  },

  showMsg(text,color){
    const msg=document.getElementById('term-msg');
    if(!msg) return;
    msg.textContent=text; msg.style.color=color; msg.classList.add('show');
  }
};

// ---- HUD 힌트 ----
export function showHint(text){
  const h=document.getElementById('hud-hint');
  if(!h) return;
  // 빈 문자열이면 힌트를 띄우지 않고 숨긴다 (힌트 최소화로 일부 멘트가 빈 값이 될 수 있음).
  if(text == null || String(text).trim() === ''){
    h.classList.remove('show');
    clearTimeout(showHint._t);
    return;
  }
  h.textContent=text; h.classList.add('show');
  clearTimeout(showHint._t);
  showHint._t=setTimeout(()=>h.classList.remove('show'),3200);
}

// ---- 코드 토큰 컬러링 ----
export function highlightCode(t){
  let s=t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  s=s.replace(/\b(function|if|else|return|const|let|var|while|for)\b/g,'<span class="kw">$1</span>');
  s=s.replace(/(\/\/.*)$/g,'<span class="cm">$1</span>');
  s=s.replace(/\b(\d+\.?\d*)\b/g,'<span class="num">$1</span>');
  return s;
}
