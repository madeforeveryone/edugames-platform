// ============================================================
//  i18n.js — 언어팩 (다국어 지원)
//  게임 내 모든 사용자 표시 텍스트를 여기 한 곳에 모은다.
//  새 언어 추가 = STRINGS에 언어 코드 하나 추가 (다른 코드는 안 건드림).
//
//  사용법:
//    import { t, setLang, LANG } from './i18n.js';
//    t('hud_intro')                       → "방향키 → 로 달리고 ..."
//    t('applied', { vn:'jumpPower', val:14 }) → "jumpPower = 14 적용됨 ..."
//
//  보간: 문자열 안의 {key}가 params[key]로 치환됨.
// ============================================================

// 현재 언어. 기본은 영어(en). 저장된 설정에 언어가 있으면 부팅 시 setLang로 덮어씀.
//   (브라우저 자동감지는 더 이상 기본 동작이 아님 — 기본 영어 + 설정에서 사용자가 직접 변경.)
function detectLang(){
  return 'en';
}

export let LANG = detectLang();

export function setLang(code){
  if(STRINGS[code]) LANG = code;
}

export const STRINGS = {
  ko: {
    // ── 타이틀 화면 ──
    title_name:       'CODEBREAKER',
    title_tagline:    '코드를 고쳐 길을 열어라',
    title_start:      '시작하기',
    title_continue:   '이어하기',
    title_settings:   '설정',
    // ── 설정 패널 ──
    settings_title:   '설정',
    settings_lang:    '언어',
    settings_bgm:     '배경음악',
    settings_sfx:     '효과음',
    settings_back:    '뒤로',
    on_label:         'ON',
    off_label:        'OFF',
    // ── HUD 힌트 ──
    hud_intro:        '방향키 → 로 달리고  스페이스로 점프',
    // (stage_intro 제거 — 스테이지 진입 시 멘트 안 띄움. 힌트 최소화)
    // ── 재시도 힌트 (죽음 후) ──
    //   힌트 최소화: 정답 방향 유도 제거. 가시/산성액은 "무슨 일이 일어났는지"만, 나머지는 중립.
    retry_keys:       '  (C: 코드 수정 · R: 재시도)',
    retry_plain:      '다시',
    retry_spike_ceiling: '천장 가시에 닿았다',
    retry_spike_floor:   '바닥 가시에 닿았다',
    retry_spike_wall:    '벽 가시에 닿았다',
    retry_acid:       '산성액에 닿았다',
    // ── 대시 해금 (조작 안내라 유지) ──
    dash_unlocked:    '대시 해금 — Shift',
    doublejump_unlocked: '더블점프 해금 — 공중에서 한 번 더 점프',
    airdash_unlocked:    '에어대시 해금 — 공중에서 Shift',
    wallslide_unlocked:  '월슬라이드 해금 — 벽에 붙어 미끄러지고, 점프로 벽 차기',
    // ── 클리어 ──
    all_clear:        '모든 스테이지 클리어! 🎉',
    // ── 디버그 ──
    debug_dash_on:    '[디버그] 대시 해금됨 — Shift로 대시! (dashPower={dp}, charges={dc})',
    debug_dash_off:   '[디버그] 대시 잠금',
    // ── CodeBreak 편집 메시지 ──
    msg_need_number:  '숫자를 입력해줘',
    msg_positive:     '0보다 큰 값을 넣어줘',
    msg_two_digits:   '두 자리까지만! (1~99)',
    msg_range:        '범위 {min}–{max}',
    msg_recompiling:  '> recompiling…',
    // ── 코드 주석 (편집 대상 줄 옆) — 중립 (방향 유도 없음) ──
    cm_neutral:       '// editable',
    // ── 적용/취소 후 힌트 — 코칭 톤 제거, 값 확인만 ──
    resume_plain:     '',
    resume_applied:   '{vn} = {val}',
    restart_plain:    '',
    restart_applied:  '{vn} = {val}',
    // ── BBS 변수 선택 메뉴 ──
    bbs_bar:          'CODE BREAK — variables.js',
    bbs_head:         'CODE BREAK',
    bbs_hint:         '숫자 = 선택 · ESC = 닫기',
    term_bar:         'CODE BREAK — player_config.js',
    // ── 정적 UI ──
    win_clear:        'STAGE CLEAR',
    win_sub:          'you broke the code ✓',
    restart_hint:     '스페이스 키로 다시 시작',
    du_prompt:        '함수 사이에 커서를 두고 <b>Ctrl + V</b>',
    btn_run:          'RUN ▶',
  },

  en: {
    title_name:       'CODEBREAKER',
    title_tagline:    'Rewrite the code. Open the way.',
    title_start:      'New Game',
    title_continue:   'Continue',
    title_settings:   'Settings',
    settings_title:   'Settings',
    settings_lang:    'Language',
    settings_bgm:     'Music',
    settings_sfx:     'Sound FX',
    settings_back:    'Back',
    on_label:         'ON',
    off_label:        'OFF',
    hud_intro:        'Press → to run, Space to jump',
    retry_keys:       '  (C: edit code · R: retry)',
    retry_plain:      'Retry',
    retry_spike_ceiling: 'Hit the ceiling spikes',
    retry_spike_floor:   'Hit the floor spikes',
    retry_spike_wall:    'Hit the wall spikes',
    retry_acid:       'Touched the acid',
    dash_unlocked:    'Dash unlocked — Shift',
    doublejump_unlocked: 'Double Jump unlocked — jump again in mid-air',
    airdash_unlocked:    'Air Dash unlocked — Shift in mid-air',
    wallslide_unlocked:  'Wall Slide unlocked — cling to walls, jump to kick off',
    all_clear:        'All stages cleared! 🎉',
    debug_dash_on:    '[DEBUG] Dash unlocked — Shift to dash! (dashPower={dp}, charges={dc})',
    debug_dash_off:   '[DEBUG] Dash locked',
    msg_need_number:  'Enter a number',
    msg_positive:     'Enter a value above 0',
    msg_two_digits:   'Two digits max! (1–99)',
    msg_range:        'Range {min}–{max}',
    msg_recompiling:  '> recompiling…',
    cm_neutral:       '// editable',
    resume_plain:     '',
    resume_applied:   '{vn} = {val}',
    restart_plain:    '',
    restart_applied:  '{vn} = {val}',
    bbs_bar:          'CODE BREAK — variables.js',
    bbs_head:         'CODE BREAK',
    bbs_hint:         'number = select · ESC = close',
    term_bar:         'CODE BREAK — player_config.js',
    win_clear:        'STAGE CLEAR',
    win_sub:          'you broke the code ✓',
    restart_hint:     'Press Space to restart',
    du_prompt:        'Place cursor between functions, <b>Ctrl + V</b>',
    btn_run:          'RUN ▶',
  },
};

// 키로 번역 문자열을 가져오고 {param}을 치환. 없으면 키 자체 반환(디버깅용).
export function t(key, params){
  const table = STRINGS[LANG] || STRINGS.ko;
  let s = table[key];
  if(s == null) s = (STRINGS.ko[key] != null ? STRINGS.ko[key] : key);  // ko 폴백 → 키
  if(params){
    s = s.replace(/\{(\w+)\}/g, (m, k)=> (params[k] != null ? params[k] : m));
  }
  return s;
}
