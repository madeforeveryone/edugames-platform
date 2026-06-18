// ============================================================
//  main.js — 부팅 + 메인 루프 + 모듈 연결
//  engine(게임)과 hackshell(연출)을 여기서 결선한다.
//  순환 의존을 피하려고, engine의 die→해킹, win→진행은 훅으로 주입.
// ============================================================

// ▼▼▼ 빌드 식별 배너 — 콘솔(F12)에 이게 안 보이면 브라우저가 옛 파일을 캐싱한 것 ▼▼▼
console.log('%c[CodeBreaker BUILD 2026-06-04-FIX3] platform=6frame-anim, acid=fall+splash, stage02=no-hazards',
  'background:#3cf06a;color:#000;font-weight:bold;padding:3px 8px;border-radius:4px;');
// ▲▲▲

import { player, game } from './state.js';
import {
  loadAll, loadStage, resetPlayer, physics, animate, render,
  softRestart, setHooks
} from './engine.js';
import { HACK, showHint } from './hackshell.js';
import { getRuntime } from './abilities.js';
import { DASH_UNLOCK } from './dashunlock.js';
import { ABILITY_UNLOCK } from './abilityunlock.js';
import { t, setLang, LANG } from '../data/i18n.js';
import { STAGES, getStage } from '../stages/index.js';
import { saveRoom, getLastRoom, hasProgress, clearProgress, getSettings, setSetting } from './save.js';

// 죽음 원인별 재시도 힌트.
//   힌트 최소화(데모): 정답 방향 유도(값을 키워/줄여)는 제거하고, "무슨 일이 일어났는지"(가시/산성액)와
//   조작 안내(C/R)만 남긴다. 구덩이 미통과 등 원인 불명은 중립 재시도 멘트 하나로 통일.
//   → 데모 후 피드백 보고 i18n에서 조정/되돌리기 쉬움.
function retryHint(cause){
  const keys = t('retry_keys');
  if(cause==='spike_ceiling') return t('retry_spike_ceiling')+keys;
  if(cause==='spike_floor')   return t('retry_spike_floor')+keys;
  if(cause==='spike_wall')    return t('retry_spike_wall')+keys;
  if(cause==='acid')          return t('retry_acid')+keys;
  if(cause==='spike')         return t('retry_spike_floor')+keys;   // (구버전 호환)
  return t('retry_plain')+keys;   // 원인 불명(구덩이 미통과 등) → 중립 재시도
}

// ---- engine ↔ hackshell/진행 결선 ----
setHooks({
  onDeath(cause){
    if(!HACK.used){
      setTimeout(()=>HACK.trigger(), 650);   // 첫 죽음 → CodeBreak 연출
    } else {
      // 재시도: 정확한 원인 힌트를 먼저 띄우고, 죽은 채 멈춰만 있지 않도록
      //   CodeBreak를 다시 열어 "고쳐서 다시" 흐름을 보장 (시작점 복귀 = keepPos:false).
      setTimeout(()=>showHint(retryHint(cause)), 700);
      setTimeout(()=>{ if(player.dead && !HACK.active) HACK.reopen(false); }, 1100);
    }
  },
  onItem(it){
    // 능력 해금 아이템 먹음. dash는 풀 코드 연출, 나머지는 가벼운 팝업 연출.
    // 어떤 능력이든 해금되면 코드브레이크 최대치 +1 (남은 횟수도 +1 — 새로 얻은 충전).
    //   이미 쓴 횟수는 환급하지 않음(max,left 둘 다 +1이라 사용분 유지).
    game.breaksMax++; game.breaksLeft++;
    updateBreaksUI();
    if(it.type === 'dashUnlock'){
      DASH_UNLOCK.start(()=>{ showHint(t('dash_unlocked')); });
      return;
    }
    // 가벼운 해금 (더블점프/에어대시/월슬라이드). 완료 시 변수명 받아 힌트.
    const hintKey = {
      doubleJumpUnlock: 'doublejump_unlocked',
      airDashUnlock:    'airdash_unlocked',
      wallSlideUnlock:  'wallslide_unlocked',
    }[it.type];
    ABILITY_UNLOCK.start(it.type, ()=>{
      if(hintKey) showHint(t(hintKey));
    });
  },
  onWin(stageIndex){
    // 목적지 결정: 접촉한 골이 target을 지정했으면 거기로(이전 맵 복귀 등), 없으면 선형 다음 방.
    const target = game.exitTarget;
    if(target != null){
      // 명시 목적지로 점프 (멀티 출구·복귀 동선). 범위는 getStage가 클램프.
      setTimeout(()=>goToStage(target), 250);
    } else if(stageIndex < STAGES.length-1){
      // 자동으로 다음 방으로 (배너 없이 끊김 없는 흐름 — 셀레스테식)
      //   outro로 화면 밖 나간 직후 다음 방 intro가 이어짐
      setTimeout(()=>goToStage(stageIndex+1), 250);
    } else {
      // 마지막 방 + 목적지 미지정: 클리어 배너
      const banner=document.getElementById('win-banner');
      const hint=document.getElementById('restart-hint');
      banner.classList.add('show');
      setTimeout(()=>{
        hint.textContent=t('all_clear');
        hint.classList.add('show');
      }, 900);
    }
  }
});

// ---- 키 입력 ----
//   C   : 코드 편집 열기 / 열려있으면 변경 없이 닫기 (토글)
//   ESC : 열려있을 때 변경 없이 닫기
//   R   : 재시도 (시작점에서 다시 — 플랫포머 표준)
//   첫 죽음 시에는 CodeBreak 연출이 자동 발동(onDeath 훅).
//   닫기 동작은 HACK.cancel()이 keepPos로 분기:
//     살아있을 때 → 그 위치 그대로 재개 / 죽은 상태 → 이전 값으로 시작점 재시작(R과 동일).
addEventListener('keydown', e=>{
  // ── 가벼운 능력 해금 팝업 중: 모든 입력 차단(잠깐) ──
  if(ABILITY_UNLOCK.active){ return; }

  // ── 대시 해금 연출 중: Ctrl+V만 받고(붙여넣기), 나머지 입력은 차단 ──
  if(DASH_UNLOCK.active){
    if((e.ctrlKey || e.metaKey) && (e.code==='KeyV' || e.key==='v' || e.key==='V')){
      e.preventDefault();
      DASH_UNLOCK.paste();
    }
    return;   // 연출 중 다른 키 무시
  }

  // ── [디버그] 백틱(`): 대시 해금 토글 (연출 만들기 전 물리 테스트용). 출시 전 제거 예정. ──
  if(e.code==='Backquote'){
    e.preventDefault();
    player.dashUnlocked = !player.dashUnlocked;
    if(player.dashUnlocked){
      player.dashLeft = getRuntime(game,'dashCharges');
      showHint(t('debug_dash_on', { dp:getRuntime(game,'dashPower'), dc:getRuntime(game,'dashCharges') }));
    } else {
      showHint(t('debug_dash_off'));
    }
    return;
  }

  // ── ESC: 열려있으면 변경 없이 닫기 (연출 중이면 cancel 내부에서 무시) ──
  if(e.code==='Escape'){
    if(HACK.active){ e.preventDefault(); HACK.cancel(); }
    return;
  }

  // ── C: 토글 (닫혀있으면 열기 / 열려있으면 변경 없이 닫기) ──
  if(e.code==='KeyC'){
    if(player.won) return;             // 클리어 후 자동 진행 중
    e.preventDefault();
    if(HACK.active){
      HACK.cancel();                   // 열려있을 때 C 다시 → 변경 없이 닫기 (횟수 소모 안 함)
    } else if(player.dead){
      // 죽은 상태의 편집은 재시도 흐름의 일부 (사망 시 횟수는 이미 리셋됨). 첫 죽음은 극적 연출.
      if(!HACK.used) HACK.trigger();
      else HACK.reopen(false);
    } else {
      // 살아있을 때 실시간 조정: 코드브레이크 1회 소모. 남은 횟수 없으면 차단(짧은 거부 피드백).
      if(game.breaksLeft <= 0){
        flashNoBreaks();
        return;
      }
      game.breaksLeft--;
      updateBreaksUI();
      HACK.reopen(true);               // 시간 멈춤 + 현재 위치 유지
    }
    return;
  }

  // ── R: 재시도 (시작점 복귀) ──
  if(e.code==='KeyR'){
    if(HACK.active) return;
    if(player.won) return;
    e.preventDefault();
    softRestart();   // R = 항상 시작점에서 재시작 (CodeBreak 안 뜸). 값 재조정은 C로.
    return;
  }
});

// 스테이지 전환
// ---- 코드브레이크 횟수 UI ----
//   game.breaksLeft / breaksMax를 마름모 pip로 표시. 0이면 라벨 회색.
function updateBreaksUI(){
  const meter = document.getElementById('break-meter');
  const pips = document.getElementById('bm-pips');
  if(!meter || !pips) return;
  const max = game.breaksMax|0, left = game.breaksLeft|0;
  // pip 개수가 바뀔 때만 재생성 (max는 방마다 고정)
  if(pips.childElementCount !== max){
    pips.innerHTML = '';
    for(let i=0;i<max;i++){ const d=document.createElement('span'); d.className='pip'; pips.appendChild(d); }
  }
  [...pips.children].forEach((p,i)=>{
    p.className = 'pip ' + (i < left ? 'full' : 'empty');
  });
  meter.classList.toggle('empty', left<=0);
}

// 횟수 0에서 C 누름 → 거부 흔들림 피드백.
function flashNoBreaks(){
  const meter = document.getElementById('break-meter');
  if(!meter) return;
  meter.classList.remove('deny');
  void meter.offsetWidth;        // 리플로우로 애니 재시작
  meter.classList.add('deny');
}

function goToStage(index){
  document.getElementById('win-banner').classList.remove('show');
  document.getElementById('restart-hint').classList.remove('show');
  HACK.used=false; HACK.active=false; HACK.termOpen=false;
  game.lastCause=null;
  loadStage(getStage(index), index, true);   // keepVars=true: 이전 방 값 이어받기
  saveRoom(index);   // 진행 저장: 마지막으로 있던 방 (이어하기용). 분기 동선이라 "현재 방"을 기록.
  updateBreaksUI(); // 코드브레이크 횟수 표시 갱신 (방 진입 시 최대치로 리셋됨)
  // 진입 멘트 제거(힌트 최소화) — 스테이지 들어올 때 하단에 아무것도 안 띄움. 조용한 진입.
}

// ---- 메인 루프 ----
function frame(){
  if(!HACK.active && !DASH_UNLOCK.active && !ABILITY_UNLOCK.active){
    physics();
  }
  animate();
  render();
  updateBreaksUI();   // 코드브레이크 횟수 표시 (사망/방전환 리셋·소모 모두 반영). pip 수 바뀔 때만 DOM 재생성.
  requestAnimationFrame(frame);
}

// ---- 부팅 ----
// 정적 HTML 텍스트를 현재 언어로 주입. 언어 변경 시 다시 호출해 라벨을 갱신.
function applyStaticText(){
  const set = (id, html)=>{ const el=document.getElementById(id); if(el) el.innerHTML=html; };
  set('hud-hint', t('hud_intro'));
  // BBS 메뉴 정적 라벨
  const bar=document.querySelector('#bbs-menu .bbs-bar'); if(bar) bar.textContent=t('bbs_bar');
  const bhint=document.querySelector('#bbs-menu .bbs-hint'); if(bhint) bhint.textContent=t('bbs_hint');
  const tbar=document.getElementById('term-bar'); if(tbar) tbar.textContent=t('term_bar');
  // 클리어 배너
  const wb=document.getElementById('win-banner');
  if(wb) wb.innerHTML = t('win_clear')+'<span class="sub">'+t('win_sub')+'</span>';
  set('restart-hint', t('restart_hint'));
  // Ctrl+V 프롬프트
  set('du-prompt', t('du_prompt'));
  // RUN 버튼
  const run=document.getElementById('hack-run'); if(run) run.textContent=t('btn_run');

  // ── 타이틀 화면 ──
  set('title-name', t('title_name'));
  set('title-tagline', t('title_tagline'));
  const tStart=document.getElementById('title-start');       if(tStart) tStart.textContent=t('title_start');
  const tCont =document.getElementById('title-continue');    if(tCont)  tCont.textContent=t('title_continue');
  const tSet  =document.getElementById('title-settings');    if(tSet)   tSet.textContent=t('title_settings');
  // ── 설정 패널 ──
  set('settings-title', t('settings_title'));
  const sll=document.getElementById('settings-lang-label');  if(sll) sll.textContent=t('settings_lang');
  const sbl=document.getElementById('settings-bgm-label');   if(sbl) sbl.textContent=t('settings_bgm');
  const sfl=document.getElementById('settings-sfx-label');   if(sfl) sfl.textContent=t('settings_sfx');
  const sback=document.getElementById('settings-back');      if(sback) sback.textContent=t('settings_back');
}

// 타이틀/설정 패널 표시 토글
function showTitle(){
  document.getElementById('title-screen').classList.add('show');
  document.getElementById('settings-panel').classList.remove('show');
  refreshContinueButton();
}
function hideTitle(){
  document.getElementById('title-screen').classList.remove('show');
  document.getElementById('settings-panel').classList.remove('show');
}
function showSettings(){
  document.getElementById('title-screen').classList.remove('show');
  document.getElementById('settings-panel').classList.add('show');
  refreshSettingsUI();
}

// 이어하기 버튼: 진행 기록이 없으면 비활성(회색)
function refreshContinueButton(){
  const btn=document.getElementById('title-continue');
  if(!btn) return;
  if(hasProgress()) btn.removeAttribute('disabled');
  else btn.setAttribute('disabled','');
}

// 설정 UI를 저장값에 맞춰 갱신 (언어 세그먼트 active, 사운드 토글 ON/OFF)
function refreshSettingsUI(){
  const s=getSettings();
  // 언어 세그먼트
  document.querySelectorAll('#settings-lang .seg-btn').forEach(b=>{
    b.classList.toggle('active', b.dataset.lang===LANG);
  });
  // 사운드 토글
  const setToggle=(id,on)=>{
    const el=document.getElementById(id); if(!el) return;
    el.dataset.on = on ? 'true':'false';
    el.textContent = on ? t('on_label') : t('off_label');
  };
  setToggle('settings-bgm', s.bgm);
  setToggle('settings-sfx', s.sfx);
}

// 게임 시작: fromRoom 방부터. (시작하기=0부터+진행 초기화, 이어하기=저장된 방)
let gameStarted=false;
function startGame(fromRoom){
  hideTitle();
  const idx = Math.max(0, Math.min(fromRoom|0, STAGES.length-1));
  loadStage(getStage(idx), idx, false);   // 새 진입(keepVars=false: 기본값으로 시작)
  saveRoom(idx);
  const meter = document.getElementById('break-meter');
  if(meter) meter.classList.add('show');  // 코드브레이크 미터 노출 (타이틀 중엔 숨김)
  updateBreaksUI();
  if(!gameStarted){ gameStarted=true; frame(); }   // 루프는 한 번만 시작
  setTimeout(()=>showHint(t('hud_intro')), 400);
}

// 타이틀/설정 버튼 결선
function wireTitleScreen(){
  document.getElementById('title-start').addEventListener('click', ()=>{
    clearProgress();      // 새 게임 → 진행 초기화
    startGame(0);
  });
  document.getElementById('title-continue').addEventListener('click', ()=>{
    if(!hasProgress()) return;          // 비활성 상태 방어
    startGame(getLastRoom());
  });
  document.getElementById('title-settings').addEventListener('click', showSettings);
  document.getElementById('settings-back').addEventListener('click', showTitle);

  // 언어 세그먼트
  document.querySelectorAll('#settings-lang .seg-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const code=b.dataset.lang;
      setLang(code);            // 런타임 언어 변경
      setSetting('lang', code); // 저장
      applyStaticText();        // 모든 정적 라벨 갱신
      refreshSettingsUI();      // 세그먼트 active 갱신
    });
  });
  // 사운드 토글 (지금은 상태 저장만 — 실제 사운드는 추후 연결)
  const wireToggle=(id,key)=>{
    const el=document.getElementById(id); if(!el) return;
    el.addEventListener('click', ()=>{
      const next = !(el.dataset.on==='true');
      setSetting(key, next);
      refreshSettingsUI();
    });
  };
  wireToggle('settings-bgm','bgm');
  wireToggle('settings-sfx','sfx');
}

loadAll(()=>{
  // 저장된 언어 설정이 있으면 먼저 적용 (없으면 기본 영어).
  const saved=getSettings();
  if(saved.lang) setLang(saved.lang);
  applyStaticText();
  wireTitleScreen();
  // 게임을 바로 시작하지 않고 타이틀 화면을 띄운다. 시작/이어하기 선택 시 startGame 호출.
  showTitle();
});
