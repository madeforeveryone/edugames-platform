/* ============================================================================
 * learning.js — Buyer-legibility layer for TypeRPG
 * ----------------------------------------------------------------------------
 * Turns the typing/combat data the game already produces into a *visible*
 * record of English learning: word mastery, accuracy, WPM, session summaries,
 * and a print-ready parent/teacher report.
 *
 * Design goals:
 *   - Additive. The game calls Learning.onKey() and Learning.onWord() from two
 *     spots; everything else lives here. If this file is removed the game still
 *     runs (call sites are guarded with `window.Learning &&`).
 *   - No assets, no libraries. Pure DOM. Reuses the game's fonts.
 *   - Reads the game's own data model (CLASSES / COMMON_SKILLS / RARE_SKILLS /
 *     WORD_PACKS) so every typed word maps to a Korean meaning + vocab category.
 * ========================================================================== */
(function () {
  'use strict';

  var STORE_KEY = 'typerpg_learning';
  var IDLE_CAP_MS = 5000; // gaps longer than this don't count as "active typing"

  // Mastery tiers by number of successful completions of a word.
  var TIERS = [
    { min: 0,  key: 'new',      label: 'Not learned',   icon: '·',  color: '#cbd5e1' },
    { min: 1,  key: 'seen',     label: 'Seen',     icon: '🌱', color: '#86efac' },
    { min: 3,  key: 'practice', label: 'Practicing',  icon: '📗', color: '#4ade80' },
    { min: 6,  key: 'familiar', label: 'Familiar',     icon: '📘', color: '#38bdf8' },
    { min: 12, key: 'mastered', label: 'Mastered',   icon: '🏆', color: '#fbbf24' },
  ];
  var MASTER_MIN = 12;

  function tierFor(count) {
    var t = TIERS[0];
    for (var i = 0; i < TIERS.length; i++) if (count >= TIERS[i].min) t = TIERS[i];
    return t;
  }

  /* ── Word index: english → { kr, classId, catLabel } ───────────────────── */
  var WORD_INDEX = {};   // built once at init from the game's globals
  var CATEGORIES = [];   // [{ label, classId, words:[en,...] }]

  function addWord(en, kr, catLabel, classId) {
    if (!en) return;
    en = String(en).toLowerCase();
    if (!WORD_INDEX[en]) WORD_INDEX[en] = { en: en, kr: kr || '', catLabel: catLabel, classId: classId || null };
  }

  function buildWordIndex() {
    var catMap = {}; // label → {label, classId, words:[]}
    function bucket(label, classId) {
      if (!catMap[label]) { catMap[label] = { label: label, classId: classId || null, words: [] }; CATEGORIES.push(catMap[label]); }
      return catMap[label];
    }

    // 1) Class skills (+ any word packs belonging to that class)
    if (typeof CLASSES !== 'undefined') {
      Object.keys(CLASSES).forEach(function (c) {
        var cls = CLASSES[c];
        var label = cls.nameKr + ' · ' + cls.vocabKr;
        var b = bucket(label, c);
        (cls.skills || []).forEach(function (s) { addWord(s.en, s.kr, label, c); b.words.push(s.en.toLowerCase()); });
      });
    }
    if (typeof WORD_PACKS !== 'undefined') {
      Object.keys(WORD_PACKS).forEach(function (p) {
        var pack = WORD_PACKS[p];
        var c = pack.classId;
        var label = (typeof CLASSES !== 'undefined' && CLASSES[c])
          ? CLASSES[c].nameKr + ' · ' + CLASSES[c].vocabKr
          : (pack.nameKr || 'Word Packs');
        var b = bucket(label, c);
        (pack.words || []).forEach(function (s) { addWord(s.en, s.kr, label, c); if (b.words.indexOf(s.en.toLowerCase()) === -1) b.words.push(s.en.toLowerCase()); });
      });
    }
    // 2) Common + rare skills (cross-class utility vocabulary)
    if (typeof COMMON_SKILLS !== 'undefined') {
      var bc = bucket('Common Skills · Action Words', null);
      COMMON_SKILLS.forEach(function (s) { addWord(s.en, s.kr, 'Common Skills · Action Words', null); bc.words.push(s.en.toLowerCase()); });
    }
    if (typeof RARE_SKILLS !== 'undefined') {
      var br = bucket('Rare Skills · Advanced Words', null);
      RARE_SKILLS.forEach(function (s) { addWord(s.en, s.kr, 'Rare Skills · Advanced Words', null); if (br.words.indexOf(s.en.toLowerCase()) === -1) br.words.push(s.en.toLowerCase()); });
    }
  }

  function totalKnownWords() { return Object.keys(WORD_INDEX).length; }

  /* ── Persistent store ──────────────────────────────────────────────────── */
  function load() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      var s = raw ? JSON.parse(raw) : null;
      if (!s) s = {};
    } catch (e) { s = {}; }
    s.words           = s.words           || {}; // en → completion count
    s.totalKeystrokes = s.totalKeystrokes || 0;
    s.totalCorrect    = s.totalCorrect    || 0;  // chars inside completed words
    s.totalWords      = s.totalWords      || 0;  // completed-word events
    s.activeMs        = s.activeMs        || 0;
    s.firstSeen       = s.firstSeen       || null;
    s.lastSeen        = s.lastSeen        || null;
    return s;
  }
  function save(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} }

  /* ── Live session (resets each time a summary is shown) ─────────────────── */
  var session = null;
  function freshSession() { return { keystrokes: 0, correct: 0, words: {}, wordCount: 0, start: Date.now() }; }
  var lastKeyAt = 0;

  /* ── Public capture hooks (called from app.js) ─────────────────────────── */
  function onKey(ch) {
    if (!session) session = freshSession();
    var now = Date.now();
    var s = load();
    s.totalKeystrokes++;
    if (!s.firstSeen) s.firstSeen = now;
    s.lastSeen = now;
    if (lastKeyAt && (now - lastKeyAt) < IDLE_CAP_MS) s.activeMs += (now - lastKeyAt);
    lastKeyAt = now;
    save(s);
    session.keystrokes++;
  }

  function onWord(word) {
    if (!word) return;
    word = String(word).toLowerCase();
    if (!session) session = freshSession();
    var s = load();
    s.words[word] = (s.words[word] || 0) + 1;
    s.totalCorrect += word.length;
    s.totalWords++;
    s.lastSeen = Date.now();
    save(s);
    session.correct += word.length;
    session.words[word] = (session.words[word] || 0) + 1;
    session.wordCount++;
  }

  /* ── Metrics ───────────────────────────────────────────────────────────── */
  function accuracy(correct, keys) { return keys > 0 ? Math.round((correct / keys) * 100) : 0; }
  function wpm(correctChars, ms) {
    var min = ms / 60000;
    return min > 0.0001 ? Math.round((correctChars / 5) / min) : 0;
  }
  function masteredCount(s) {
    return Object.keys(s.words).filter(function (w) { return s.words[w] >= MASTER_MIN; }).length;
  }
  function learnedCount(s) { return Object.keys(s.words).length; }

  /* ── Session summary (appended to victory / dungeon-clear screens) ─────── */
  function sessionSummaryHTML() {
    var sess = session || freshSession();
    var acc = accuracy(sess.correct, sess.keystrokes);
    var dur = Date.now() - sess.start;
    var spd = wpm(sess.correct, Math.max(dur, 1));
    var distinct = Object.keys(sess.words).length;
    // collect new-this-session words (count became 1 for the first time → approximate: distinct words typed)
    var wordChips = Object.keys(sess.words).slice(0, 12).map(function (w) {
      var info = WORD_INDEX[w] || { kr: '' };
      return '<span class="lrn-chip">' + w + (info.kr ? ' <i>' + info.kr + '</i>' : '') + '</span>';
    }).join('');
    session = null; // next keystroke starts a new session
    if (sess.keystrokes === 0) return '';
    return (
      '<div class="lrn-sess">' +
      '<div class="lrn-sess-head">📚 This session summary</div>' +
      '<div class="lrn-sess-grid">' +
        metric('Words typed', sess.wordCount + '') +
        metric('Distinct words', distinct + '') +
        metric('Typing accuracy', acc + '%') +
        metric('Typing speed', spd + ' WPM') +
      '</div>' +
      (wordChips ? '<div class="lrn-sess-words">' + wordChips + '</div>' : '') +
      '</div>'
    );
  }
  function metric(label, val) {
    return '<div class="lrn-metric"><div class="lrn-metric-val">' + val + '</div><div class="lrn-metric-label">' + label + '</div></div>';
  }

  /* ── Dashboard (full cumulative record, opened from main menu) ──────────── */
  function fmtDate(ms) {
    if (!ms) return '—';
    var d = new Date(ms);
    return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate();
  }
  function fmtDuration(ms) {
    var min = Math.round(ms / 60000);
    if (min < 60) return min + 'm';
    return Math.floor(min / 60) + 'h ' + (min % 60) + 'm';
  }

  var view = 'kid'; // 'kid' | 'report'

  function renderDashboard() {
    var body = document.getElementById('lrn-body');
    if (!body) return;
    var s = load();
    body.innerHTML = (view === 'kid') ? renderKidView(s) : renderReportView(s);
  }

  function renderKidView(s) {
    var known = totalKnownWords();
    var learned = learnedCount(s);
    var mastered = masteredCount(s);
    var acc = accuracy(s.totalCorrect, s.totalKeystrokes);
    var spd = wpm(s.totalCorrect, s.activeMs || 1);

    var top =
      '<div class="lrn-cards">' +
        bigCard('🔤', learned + ' / ' + known, 'Words learned') +
        bigCard('🏆', String(mastered), 'Words mastered') +
        bigCard('🎯', acc + '%', 'Typing accuracy') +
        bigCard('⚡', spd, 'Typing speed (WPM)') +
      '</div>';

    var cats = CATEGORIES.map(function (cat) {
      if (!cat.words.length) return '';
      var done = cat.words.filter(function (w) { return (s.words[w] || 0) >= 1; }).length;
      var pct = Math.round((done / cat.words.length) * 100);
      var chips = cat.words.map(function (w) {
        var c = s.words[w] || 0;
        var t = tierFor(c);
        var info = WORD_INDEX[w] || { kr: '' };
        return '<span class="lrn-wchip" title="' + c + ' successes" style="border-color:' + t.color + '">' +
               '<b>' + w + '</b>' + (info.kr ? '<span class="lrn-wkr">' + info.kr + '</span>' : '') +
               '<span class="lrn-wtier">' + t.icon + '</span></span>';
      }).join('');
      return (
        '<div class="lrn-cat">' +
          '<div class="lrn-cat-head"><span>' + cat.label + '</span>' +
            '<span class="lrn-cat-prog">' + done + '/' + cat.words.length + ' · ' + pct + '%</span></div>' +
          '<div class="lrn-cat-bar"><div class="lrn-cat-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="lrn-wgrid">' + chips + '</div>' +
        '</div>'
      );
    }).join('');

    var legend = '<div class="lrn-legend">' + TIERS.slice(1).map(function (t) {
      return '<span>' + t.icon + ' ' + t.label + (t.key === 'mastered' ? ' (' + MASTER_MIN + '+)' : '') + '</span>';
    }).join('') + '</div>';

    return top + legend + '<div class="lrn-cats">' + cats + '</div>';
  }

  function renderReportView(s) {
    var known = totalKnownWords();
    var learned = learnedCount(s);
    var mastered = masteredCount(s);
    var acc = accuracy(s.totalCorrect, s.totalKeystrokes);
    var spd = wpm(s.totalCorrect, s.activeMs || 1);

    var rows = CATEGORIES.filter(function (c) { return c.words.length; }).map(function (cat) {
      var done = cat.words.filter(function (w) { return (s.words[w] || 0) >= 1; }).length;
      var mas  = cat.words.filter(function (w) { return (s.words[w] || 0) >= MASTER_MIN; }).length;
      var wl = cat.words.map(function (w) {
        var c = s.words[w] || 0; var info = WORD_INDEX[w] || { kr: '' };
        var cls = c >= MASTER_MIN ? 'mas' : (c >= 1 ? 'seen' : 'none');
        return '<span class="lrn-rw ' + cls + '">' + w + (info.kr ? ' (' + info.kr + ')' : '') + '</span>';
      }).join(' ');
      return '<tr><td class="lrn-rcat">' + cat.label + '</td><td class="lrn-rnum">' + done + ' / ' + cat.words.length +
             '</td><td class="lrn-rnum">' + mas + '</td><td class="lrn-rwords">' + wl + '</td></tr>';
    }).join('');

    return (
      '<div class="lrn-report">' +
        '<div class="lrn-report-title">TypeRPG English Learning Report</div>' +
        '<div class="lrn-report-sub">Period: ' + fmtDate(s.firstSeen) + ' – ' + fmtDate(s.lastSeen) +
          ' · total typing time: ' + fmtDuration(s.activeMs) + '</div>' +
        '<p class="lrn-report-summary">So far this learner has typed <b>' + learned + '</b> English words while playing, ' +
          'and mastered <b>' + mastered + '</b> of them through enough repetition (' + MASTER_MIN + '+ times). ' +
          'Overall typing accuracy is <b>' + acc + '%</b>, and average typing speed is <b>' + spd + ' WPM. ' +
          'The table below shows progress by vocabulary area, mapped to Grade 3 English-curriculum categories (nature, body, motion, emotion, etc.).</p>' +
        '<table class="lrn-rtable"><thead><tr>' +
          '<th>Vocabulary area</th><th>Words learned</th><th>Mastered</th><th>Word list (green = learned, yellow = mastered)</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table>' +
        '<div class="lrn-report-foot">Accuracy = letters in completed words / total letters typed · WPM = (correct letters / 5) / active typing minutes</div>' +
      '</div>'
    );
  }

  function bigCard(icon, val, label) {
    return '<div class="lrn-bigcard"><div class="lrn-bc-icon">' + icon + '</div>' +
           '<div class="lrn-bc-val">' + val + '</div><div class="lrn-bc-label">' + label + '</div></div>';
  }

  /* ── Export: copy a plain-text summary (parent/teacher) ─────────────────── */
  function copySummary() {
    var s = load();
    var lines = [];
    lines.push('TypeRPG English Learning Report');
    lines.push('Period: ' + fmtDate(s.firstSeen) + ' – ' + fmtDate(s.lastSeen));
    lines.push('Total typing time: ' + fmtDuration(s.activeMs));
    lines.push('Words learned: ' + learnedCount(s) + ' / ' + totalKnownWords());
    lines.push('Words mastered (' + MASTER_MIN + '+ times): ' + masteredCount(s));
    lines.push('Typing accuracy: ' + accuracy(s.totalCorrect, s.totalKeystrokes) + '%');
    lines.push('Typing speed: ' + wpm(s.totalCorrect, s.activeMs || 1) + ' WPM');
    lines.push('');
    CATEGORIES.filter(function (c) { return c.words.length; }).forEach(function (cat) {
      var done = cat.words.filter(function (w) { return (s.words[w] || 0) >= 1; });
      lines.push('[' + cat.label + '] ' + done.length + '/' + cat.words.length);
      lines.push('  ' + cat.words.map(function (w) {
        var c = s.words[w] || 0; var info = WORD_INDEX[w] || { kr: '' };
        return w + (info.kr ? '(' + info.kr + ')' : '') + ':' + c + '';
      }).join(', '));
    });
    var text = lines.join('\n');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { toast('Summary copied'); },
        function () { fallbackCopy(text); });
    } else fallbackCopy(text);
  }
  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Summary copied'); } catch (e) { toast('Copy failed'); }
    document.body.removeChild(ta);
  }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'lrn-toast'; t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(function () { t.classList.add('show'); }, 10);
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 300); }, 1800);
  }

  /* ── Open / close ──────────────────────────────────────────────────────── */
  function show() {
    var ov = document.getElementById('lrn-screen');
    if (!ov) return;
    view = 'kid';
    setTabs();
    renderDashboard();
    ov.classList.remove('lrn-hidden');
  }
  function hide() {
    var ov = document.getElementById('lrn-screen');
    if (ov) ov.classList.add('lrn-hidden');
  }
  function setTabs() {
    var k = document.getElementById('lrn-tab-kid');
    var r = document.getElementById('lrn-tab-report');
    if (k) k.classList.toggle('active', view === 'kid');
    if (r) r.classList.toggle('active', view === 'report');
  }

  /* ── UI injection (style + dashboard screen + main-menu button) ────────── */
  function injectStyle() {
    var css = document.createElement('style');
    css.textContent = LRN_CSS;
    document.head.appendChild(css);
  }

  function injectScreen() {
    var div = document.createElement('div');
    div.id = 'lrn-screen';
    div.className = 'lrn-hidden';
    div.innerHTML =
      '<div class="lrn-panel">' +
        '<div class="lrn-header">' +
          '<h1 class="lrn-title">📊 Learning Record</h1>' +
          '<div class="lrn-tabs">' +
            '<button id="lrn-tab-kid" class="lrn-tab active">Word Mastery</button>' +
            '<button id="lrn-tab-report" class="lrn-tab">Teacher / Parent View</button>' +
          '</div>' +
          '<div class="lrn-actions">' +
            '<button id="lrn-copy" class="lrn-act">📋 Copy summary</button>' +
            '<button id="lrn-print" class="lrn-act">🖨 Print</button>' +
            '<button id="lrn-close" class="lrn-close">✕</button>' +
          '</div>' +
        '</div>' +
        '<div id="lrn-body" class="lrn-body"></div>' +
      '</div>';
    document.body.appendChild(div);

    document.getElementById('lrn-close').addEventListener('click', hide);
    document.getElementById('lrn-copy').addEventListener('click', copySummary);
    document.getElementById('lrn-print').addEventListener('click', function () { view = 'report'; setTabs(); renderDashboard(); setTimeout(function () { window.print(); }, 60); });
    document.getElementById('lrn-tab-kid').addEventListener('click', function () { view = 'kid'; setTabs(); renderDashboard(); });
    document.getElementById('lrn-tab-report').addEventListener('click', function () { view = 'report'; setTabs(); renderDashboard(); });
  }

  function injectMenuButton() {
    var menu = document.querySelector('#main-menu-screen .mm-buttons');
    if (!menu) return;
    var btn = document.createElement('button');
    btn.className = 'mm-btn lrn-menu-btn';
    btn.id = 'mm-learning';
    btn.innerHTML =
      '<span class="mm-btn-icon">📊</span>' +
      '<span class="mm-btn-text">' +
        '<span class="mm-btn-title">Learning Record</span>' +
        '<span class="mm-btn-desc">Words learned · accuracy · parent/teacher report</span>' +
      '</span>';
    btn.addEventListener('click', show);
    // place right after the codex button if present, else append
    var codex = document.getElementById('mm-codex');
    if (codex && codex.parentNode === menu) menu.insertBefore(btn, codex.nextSibling);
    else menu.appendChild(btn);
  }

  function init() {
    try { buildWordIndex(); } catch (e) { /* globals not ready — index stays empty, capture still works */ }
    injectStyle();
    injectScreen();
    injectMenuButton();
  }

  // app.js registers its DOMContentLoaded → init first (it's included earlier),
  // so our listener runs after the menu DOM exists.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  /* ── Public API ────────────────────────────────────────────────────────── */
  window.Learning = {
    onKey: onKey,
    onWord: onWord,
    sessionSummaryHTML: sessionSummaryHTML,
    show: show,
  };

  /* ── Scoped styles ─────────────────────────────────────────────────────── */
  var LRN_CSS = [
    '#lrn-screen{position:fixed;inset:0;z-index:2000;background:rgba(15,23,42,.92);display:flex;align-items:center;justify-content:center;padding:16px;font-family:"Jua",system-ui,sans-serif;}',
    '#lrn-screen.lrn-hidden{display:none;}',
    '.lrn-panel{width:100%;max-width:960px;max-height:92vh;overflow:auto;background:#0f172a;border:2px solid #1e293b;border-radius:18px;box-shadow:0 20px 60px rgba(0,0,0,.5);}',
    '.lrn-header{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:16px 20px;background:#0f172a;border-bottom:1px solid #1e293b;}',
    '.lrn-title{font-size:22px;margin:0;color:#f1f5f9;font-family:"Black Han Sans",sans-serif;}',
    '.lrn-tabs{display:flex;gap:6px;}',
    '.lrn-tab{padding:7px 14px;border:1px solid #334155;background:#1e293b;color:#cbd5e1;border-radius:999px;cursor:pointer;font-size:13px;font-family:inherit;}',
    '.lrn-tab.active{background:#facc15;color:#1e293b;border-color:#facc15;font-weight:bold;}',
    '.lrn-actions{margin-left:auto;display:flex;gap:6px;align-items:center;}',
    '.lrn-act{padding:7px 12px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;border-radius:8px;cursor:pointer;font-size:13px;font-family:inherit;}',
    '.lrn-act:hover{background:#334155;}',
    '.lrn-close{width:34px;height:34px;border-radius:8px;border:1px solid #334155;background:#1e293b;color:#e2e8f0;cursor:pointer;font-size:16px;}',
    '.lrn-body{padding:20px;}',
    '.lrn-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:14px;}',
    '@media(max-width:640px){.lrn-cards{grid-template-columns:repeat(2,1fr);}}',
    '.lrn-bigcard{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:16px;text-align:center;}',
    '.lrn-bc-icon{font-size:22px;}',
    '.lrn-bc-val{font-size:26px;color:#fde047;font-family:"Black Han Sans",sans-serif;margin:4px 0;}',
    '.lrn-bc-label{font-size:12px;color:#94a3b8;}',
    '.lrn-legend{display:flex;gap:14px;flex-wrap:wrap;justify-content:center;color:#94a3b8;font-size:12px;margin:10px 0 18px;}',
    '.lrn-cat{background:#1e293b;border:1px solid #334155;border-radius:14px;padding:14px 16px;margin-bottom:12px;}',
    '.lrn-cat-head{display:flex;justify-content:space-between;color:#e2e8f0;font-size:15px;margin-bottom:8px;}',
    '.lrn-cat-prog{color:#94a3b8;font-size:13px;}',
    '.lrn-cat-bar{height:8px;background:#0f172a;border-radius:6px;overflow:hidden;margin-bottom:12px;}',
    '.lrn-cat-fill{height:100%;background:linear-gradient(90deg,#22c55e,#86efac);}',
    '.lrn-wgrid{display:flex;flex-wrap:wrap;gap:8px;}',
    '.lrn-wchip{display:inline-flex;align-items:center;gap:5px;background:#0f172a;border:1.5px solid #334155;border-radius:10px;padding:5px 9px;font-size:13px;color:#e2e8f0;}',
    '.lrn-wchip b{font-family:"Press Start 2P",monospace;font-size:11px;}',
    '.lrn-wkr{color:#94a3b8;font-size:12px;}',
    '.lrn-wtier{font-size:13px;}',
    '.lrn-chip{display:inline-block;background:#0f172a;border:1px solid #334155;border-radius:8px;padding:3px 8px;margin:3px;font-size:12px;color:#e2e8f0;}',
    '.lrn-chip i{color:#94a3b8;font-style:normal;font-size:11px;}',
    // session summary (inside victory/clear screens — dark on those screens)
    '.lrn-sess{margin-top:14px;padding-top:12px;border-top:1px dashed rgba(148,163,184,.4);text-align:center;}',
    '.lrn-sess-head{font-size:14px;color:#fde047;margin-bottom:8px;}',
    '.lrn-sess-grid{display:flex;justify-content:center;gap:18px;flex-wrap:wrap;}',
    '.lrn-metric{min-width:64px;}',
    '.lrn-metric-val{font-size:20px;color:#fff;font-family:"Black Han Sans",sans-serif;}',
    '.lrn-metric-label{font-size:11px;color:#cbd5e1;}',
    '.lrn-sess-words{margin-top:8px;}',
    // report view
    '.lrn-report{background:#fff;color:#1e293b;border-radius:12px;padding:24px;}',
    '.lrn-report-title{font-size:22px;font-family:"Black Han Sans",sans-serif;}',
    '.lrn-report-sub{color:#64748b;font-size:13px;margin:4px 0 14px;}',
    '.lrn-report-summary{font-size:14px;line-height:1.7;}',
    '.lrn-rtable{width:100%;border-collapse:collapse;margin-top:12px;font-size:13px;}',
    '.lrn-rtable th,.lrn-rtable td{border:1px solid #e2e8f0;padding:8px 10px;text-align:left;vertical-align:top;}',
    '.lrn-rtable th{background:#f1f5f9;}',
    '.lrn-rcat{font-weight:bold;white-space:nowrap;}',
    '.lrn-rnum{text-align:center;white-space:nowrap;}',
    '.lrn-rwords{line-height:1.9;}',
    '.lrn-rw{display:inline-block;padding:1px 6px;margin:1px;border-radius:6px;background:#f1f5f9;color:#94a3b8;font-size:12px;}',
    '.lrn-rw.seen{background:#dcfce7;color:#166534;}',
    '.lrn-rw.mas{background:#fef9c3;color:#854d0e;font-weight:bold;}',
    '.lrn-report-foot{margin-top:14px;color:#94a3b8;font-size:11px;}',
    '.lrn-toast{position:fixed;bottom:30px;left:50%;transform:translateX(-50%) translateY(20px);background:#1e293b;color:#fff;padding:10px 18px;border-radius:10px;font-family:"Jua",sans-serif;font-size:14px;opacity:0;transition:.3s;z-index:3000;}',
    '.lrn-toast.show{opacity:1;transform:translateX(-50%) translateY(0);}',
    // print
    '@media print{body *{visibility:hidden;}#lrn-screen,#lrn-screen *{visibility:visible;}#lrn-screen{position:absolute;inset:0;background:#fff;}.lrn-panel{max-height:none;border:none;box-shadow:none;background:#fff;}.lrn-header,.lrn-tabs,.lrn-actions{display:none!important;}.lrn-body{padding:0;}}',
  ].join('\n');

})();
