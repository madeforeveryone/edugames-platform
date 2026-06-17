/* ============================================================
   TypeRPG · Phase 5.8 — Class Mastery
   Cycle: fire > wind > water > fire   |   Light ↔ Dark
   ============================================================ */

// ─── FX LIBRARY (sprite sheets) ─────────────────────
// Each sprite is a horizontal frame strip. Frame width is NOT always equal
// to the png height — frames are typically rectangular. Use preview gif size
// as the source of truth.
//   fw = frame width (pixels, == preview gif width)
//   fc = frame count (== preview gif frame count, almost always 16 or 24)
//   fh = frame height (pixels, == png height; needed for non-square frames)
const FX_LIBRARY = {
  // 5 elemental damage effects
  fire:      { src: 'assets/fx/fire_01.png',         fw: 125, fh: 121, fc: 16 },
  water:     { src: 'assets/fx/water_01.png',        fw: 136, fh: 125, fc: 24 },
  wind:      { src: 'assets/fx/typhoon_01.png',      fw: 131, fh: 119, fc: 24 },
  light:     { src: 'assets/fx/thunder_01.png',      fw: 126, fh: 127, fc: 16 },
  dark:      { src: 'assets/fx/smoke_cursed_01.png', fw:  80, fh:  89, fc: 16 },
  // Generic action effects
  slash:     { src: 'assets/fx/slash_01.png',        fw:  91, fh:  96, fc: 16 },
  impact:    { src: 'assets/fx/impact_01.png',       fw: 137, fh:  98, fc: 16 },
  explosion: { src: 'assets/fx/explosion_01.png',    fw: 118, fh: 118, fc: 16 },
  comet:     { src: 'assets/fx/comet_01.png',        fw: 141, fh: 128, fc: 16 },
  heal:      { src: 'assets/fx/spark_02.png',        fw: 152, fh: 116, fc: 16 },
  bubble:    { src: 'assets/fx/bubble_01.png',       fw:  77, fh:  85, fc: 16 },
  confetti:  { src: 'assets/fx/confetti_01.png',     fw: 109, fh: 112, fc: 24 },
  death:     { src: 'assets/fx/death_01.png',        fw: 132, fh: 126, fc: 24 },
};

// Maps element → fx key (for damage-skill spawning)
const ELEMENT_FX = {
  fire:  'fire',
  water: 'water',
  wind:  'wind',
  light: 'light',
  dark:  'dark',
  none:  'slash',   // no element → generic slash
};

// ─── WORD POPUPS (comic-style impact words) ─────────
// Lightweight: just PNG paths, sized via CSS.
const WORD_LIB = [
  'awesome','bad','bam','bang','boom','break','combo','exclamation',
  'extra','good','ko','miss','perfect','poof','pow','wow','yeah',
];
function wordSrc(name) { return 'assets/words/' + name + '.png'; }

// ─── ELEMENT SYSTEM ──────────────────────────────────
const ELEMENTS = {
  fire:  { kr: 'Fire',     color: '#ef4444', emoji: '🔥', light: '#fca5a5' },
  water: { kr: 'Water',     color: '#3b82f6', emoji: '💧', light: '#93c5fd' },
  wind:  { kr: 'Wind',   color: '#22d3ee', emoji: '🌪️', light: '#a5f3fc' },
  light: { kr: 'Light',     color: '#facc15', emoji: '✨', light: '#fde68a' },
  dark:  { kr: 'Dark',   color: '#a855f7', emoji: '🌑', light: '#d8b4fe' },
  none:  { kr: 'Neutral', color: '#94a3b8', emoji: '⚪', light: '#cbd5e1' },
};

// Cycle: fire beats wind, wind beats water, water beats fire
const CYCLE_BEATS = { fire: 'wind', wind: 'water', water: 'fire' };

function getElementalMultiplier(skillEl, enemyEl) {
  if (skillEl === 'none' || enemyEl === 'none') return 1.0;
  if (skillEl === enemyEl) return 0.5;                            // same element = resist
  if (CYCLE_BEATS[skillEl] === enemyEl) return 1.5;               // weakness in cycle
  if (CYCLE_BEATS[enemyEl] === skillEl) return 0.5;               // attacker is the resisted one
  // Light ↔ Dark mutual weakness
  if ((skillEl === 'light' && enemyEl === 'dark') ||
      (skillEl === 'dark'  && enemyEl === 'light')) return 1.5;
  return 1.0;
}

// ─── STATUS EFFECTS ──────────────────────────────────
// Note: barrier (Barrier) is NOT a status — it's a separate HP layer (combat.playerBarrierHp).
// dodge is a status with no duration (consumed on next enemy attack).
const STATUSES = {
  burn: {
    kr: 'Burning', color: '#ef4444', icon: 'fire',
    duration: 3.0, tickDamage: 5, tickInterval: 1.0,
  },
  freeze: {
    kr: 'Frozen', color: '#22d3ee', icon: 'ice_spike',
    duration: 1.5, effect: 'pause_charge',
  },
  guard: {
    kr: 'Guard Stance', color: '#6366f1', icon: 'shield',
    duration: 8.0, effect: 'damage_reduction', value: 0.4,
  },
  weaken: {
    kr: 'Weakened', color: '#a855f7', icon: 'malus',
    duration: 4.0, effect: 'outgoing_damage_reduction', value: 0.3,
  },
  dodge: {
    kr: 'Dodge Stance', color: '#fbbf24', icon: 'flying_boots',
    duration: 12.0, effect: 'dodge_next', // consumed on next enemy attack OR after 12s
  },
};

// ─── META PROGRESSION (Phase E-1: simplified) ──────────
// Removed in E-1: META_UPGRADES (startHp/startBarrier/damage/crit) and the
// essence currency. Permanent upgrades were incompatible with co-op multiplayer
// (one player would dominate). Progression now comes from:
//   - unlockedClasses (based on campaign progress, see DEFAULT_UNLOCKED + checkClassUnlocks)
//   - classClears (mastery: 5+ dungeon clears as a class)
//   - typerpg_codex (skill discovery)
//   - typerpg_max_stage / typerpg_dungeon_depth (progress markers)

function loadMeta() {
  try {
    const raw = localStorage.getItem('typerpg_meta');
    let parsed = raw ? JSON.parse(raw) : {};
    const meta = {
      unlockedClasses: parsed.unlockedClasses,
      classClears: parsed.classClears || {}
    };
    // Backward compat for v0.73 and earlier: if the player has any LEGACY
    // essence/upgrades data (i.e. they previously had the meta system), grant
    // all classes since they already paid for them. New players starting on
    // E-1+ won't trigger this since parsed.essence/upgrades won't exist.
    if (!meta.unlockedClasses) {
      const hadLegacyMeta =
        (parsed.essence || 0) > 0 ||
        Object.keys(parsed.upgrades || {}).length > 0;
      meta.unlockedClasses = hadLegacyMeta
        ? Object.keys(CLASSES).slice()  // all 8 classes for legacy players
        : DEFAULT_UNLOCKED.slice();      // new E-1 players start with 2
    }
    return meta;
  } catch (e) { return { unlockedClasses: DEFAULT_UNLOCKED.slice(), classClears: {} }; }
}
function saveMeta(meta) {
  try { localStorage.setItem('typerpg_meta', JSON.stringify(meta)); } catch (e) {}
}
// Phase E-1: legacy stubs — return 0 so old call sites keep compiling.
// Remove when all call sites are cleaned up.
function getMetaBonus(_key) { return 0; }
function getMetaLevel(_key) { return 0; }

// ─── CLASS MASTERY ──────────────────────────────────
// Track dungeon clears per class. 5+ clears = mastery (passive ~1.5x).
const MASTERY_THRESHOLD = 5;

function getClassClears(classId) {
  const meta = loadMeta();
  return (meta.classClears || {})[classId] || 0;
}
function isMastered(classId) {
  return getClassClears(classId) >= MASTERY_THRESHOLD;
}

// Returns the effective passive value, scaled if mastered (~1.5x).
// For Druid regen interval, mastery REDUCES interval (faster), so we return
// the interval after dividing by 1.5. For boolean effects (first_hit_crit),
// callers check isMastered(classId) separately.
function getPassiveValue(classId) {
  const passive = CLASS_PASSIVES[classId];
  if (!passive || passive.value == null) return 0;
  const m = isMastered(classId);
  return m ? passive.value * 1.5 : passive.value;
}
function getRegenInterval(classId) {
  const passive = CLASS_PASSIVES[classId];
  if (!passive || passive.interval == null) return 5.0;
  const m = isMastered(classId);
  return m ? passive.interval / 1.5 : passive.interval;
}
function getFirstHitCritCount(classId) {
  // Rogue: master can crit on first 2 hits instead of 1
  if (CLASS_PASSIVES[classId] && CLASS_PASSIVES[classId].effect === 'first_hit_crit') {
    return isMastered(classId) ? 2 : 1;
  }
  return 0;
}
function getMasteryLabel(classId) {
  const clears = getClassClears(classId);
  if (clears >= MASTERY_THRESHOLD) return '⭐ Mastered';
  if (clears >= 3) return '⭐ Skilled (' + clears + '/' + MASTERY_THRESHOLD + ')';
  if (clears >= 1) return 'Beginner (' + clears + '/' + MASTERY_THRESHOLD + ')';
  return null;
}

// ─── DUNGEON FLOOR CONFIG ───────────────────────────
// ─── DUNGEON (Phase C-5: 100-depth progressive unlock) ──
// One single dungeon, up to 100 rooms deep. Starts unlocked at depth 10;
// each clear unlocks +5 more depth, up to 100.
//   Clear 1 → unlock 15 ... Clear 18 → unlock 100 (caps there).
// Boss appears every 10 depth (10, 20, 30, ..., 100).
// Elite appears every 5 depth (but not on boss rooms).
// Shop is forced on the room immediately before each boss (9, 19, ..., 99).
const DUNGEON_MIN_DEPTH   = 10;   // starting unlock
const DUNGEON_MAX_DEPTH   = 100;  // hard cap
const DUNGEON_UNLOCK_STEP = 5;    // depth gained per clear
const DUNGEON_BOSS_EVERY  = 10;   // boss every N depth
const DUNGEON_ELITE_EVERY = 5;    // elite every N depth (when not boss)

// Per-depth enemy difficulty curve. Linear scaling from 1.0× at depth 1 to
// ~3.0× at depth 100. Boss depths share the same curve (boss stats already
// strong; multiplier still applies on top).
function getDepthMultiplier(depth) {
  // Smooth scaling: +2% HP, +1.5% ATK per depth (compounding mildly).
  const hp  = 1 + (depth - 1) * 0.02;
  const atk = 1 + (depth - 1) * 0.015;
  return { hpMult: hp, atkMult: atk };
}

// Essence reward for clearing a *floor* (here, a full run to the unlock cap).
// Scales with depth reached so deeper runs feel more rewarding.
function getEssenceReward(depthReached) {
  return Math.max(3, Math.floor(depthReached / 2));
}

// LEGACY shims: keep these names alive for older code paths that haven't been
// migrated yet. They now return values consistent with the depth-based model
// so existing references keep working.
const FLOOR_MULTIPLIERS = {
  1: { hpMult: 1.0, atkMult: 1.0, essenceReward: 3 },
};
const MAX_FLOOR = 1;

// ─── DUNGEON UNLOCK PROGRESS ────────────────────────
// localStorage key 'typerpg_dungeon_depth' stores the highest depth the
// player has unlocked. Defaults to DUNGEON_MIN_DEPTH on first play.
function loadDungeonMaxDepth() {
  try {
    const v = parseInt(localStorage.getItem('typerpg_dungeon_depth'));
    if (!v || isNaN(v)) return DUNGEON_MIN_DEPTH;
    return Math.min(Math.max(v, DUNGEON_MIN_DEPTH), DUNGEON_MAX_DEPTH);
  } catch (e) { return DUNGEON_MIN_DEPTH; }
}
function saveDungeonMaxDepth(newDepth) {
  try {
    const cur = loadDungeonMaxDepth();
    const next = Math.min(Math.max(newDepth, cur), DUNGEON_MAX_DEPTH);
    localStorage.setItem('typerpg_dungeon_depth', String(next));
  } catch (e) {}
}
// Called after a successful clear. Bumps unlock by DUNGEON_UNLOCK_STEP.
function bumpDungeonDepthOnClear() {
  const cur = loadDungeonMaxDepth();
  const next = Math.min(cur + DUNGEON_UNLOCK_STEP, DUNGEON_MAX_DEPTH);
  saveDungeonMaxDepth(next);
}

// Returns the room type for a given depth (1-indexed).
//   depth % 10 === 0 → 'boss'
//   depth + 1 is boss → 'shop' (the room immediately before each boss)
//   depth % 5 === 0 → 'elite' (unless boss or pre-boss shop)
//   otherwise         → 'combat' with occasional 'spring'/'challenge'
function classifyRoom(depth) {
  if (depth % DUNGEON_BOSS_EVERY === 0) return 'boss';
  // Room right before boss → forced shop (Phase C-5 requirement)
  if ((depth + 1) % DUNGEON_BOSS_EVERY === 0) return 'shop';
  if (depth % DUNGEON_ELITE_EVERY === 0) return 'elite';
  // Random event sprinkle for combat rooms (deterministic by seed? use Math.random for now)
  // 10% spring, 10% challenge, otherwise combat. Shop appears only as pre-boss room.
  const r = Math.random();
  if (r < 0.10) return 'spring';
  if (r < 0.20) return 'challenge';
  return 'combat';
}

const DUNGEON = {
  // Legacy field — now dynamic. totalRooms equals the current unlocked depth.
  // Older callers that read DUNGEON.totalRooms still work; new code should
  // prefer `state.dungeonRoomTypes.length` directly.
  get totalRooms() { return loadDungeonMaxDepth(); },
  // Legacy: per-room multipliers used to be a fixed 7-entry array. Now we
  // compute on demand via getDepthMultiplier. Keep this for any leftover refs.
  roomMultipliers: [],
};

// ─── CLASS UNLOCKS (Phase E-1: campaign-progress based) ────────
// 2 classes free for new players, 6 unlock as the player clears campaign stages.
// No more essence cost — progress through the campaign earns each new hero.
const DEFAULT_UNLOCKED = ['mage', 'knight'];
const UNLOCKABLE_CLASSES = ['archer', 'rogue', 'priest', 'druid', 'paladin', 'monk'];

// Stage (1-indexed) the player must have CLEARED to unlock each class.
// "Cleared" = beaten that stage, i.e. campaignProgress >= stageNum.
const CLASS_UNLOCK_STAGE = {
  archer:  2,   // after Stage 2
  rogue:   3,   // after Stage 3
  priest:  5,   // after Stage 5
  druid:   6,   // after Stage 6
  paladin: 8,   // after Stage 8
  monk:   10,   // after Stage 10 (campaign complete)
};

function getClassUnlockStage(classId) {
  return CLASS_UNLOCK_STAGE[classId] || null;
}

function isClassUnlocked(classId) {
  const meta = loadMeta();
  return (meta.unlockedClasses || DEFAULT_UNLOCKED).indexOf(classId) !== -1;
}
function unlockClass(classId) {
  const meta = loadMeta();
  if (!meta.unlockedClasses) meta.unlockedClasses = DEFAULT_UNLOCKED.slice();
  if (meta.unlockedClasses.indexOf(classId) === -1) {
    meta.unlockedClasses.push(classId);
    saveMeta(meta);
  }
}
// Phase E-1: called after every campaign stage clear. Unlocks any class
// whose required stage has now been beaten. Returns newly-unlocked list.
function checkClassUnlocks() {
  const progress = loadCampaignProgress();
  const newly = [];
  UNLOCKABLE_CLASSES.forEach(function (cls) {
    const req = CLASS_UNLOCK_STAGE[cls];
    if (req != null && progress >= req && !isClassUnlocked(cls)) {
      unlockClass(cls);
      newly.push(cls);
    }
  });
  return newly;
}

// ─── PASSIVE ITEMS (Phase C-3) ──────────────────────
// Permanent-for-the-run modifiers earned from elite rewards or shops.
// No slot limit — players can stack as many as they find. Effects are
// applied via getItemModifier() / hasItem() helpers integrated into the
// damage/HP/CD calculation paths.
//
// effect types:
//   'element_dmg' — value: multiplier additive (e.g. +0.2 on fire damage)
//   'flat_dmg_taken' — value: multiplier on incoming damage (0.9 = -10%)
//   'crit_chance' — value: additive crit chance (0.10 = +10%)
//   'cd_reduction' — value: multiplier on CD (0.9 = -10%)
//   'combo_dmg' — value: extra mult when combo >= threshold
//   'room_heal' — value: HP gained at start of each combat
//   'dodge_counter' — value: damage dealt to enemy when dodging
//   'first_hit_dmg' — value: bonus mult on first hit per combat
//   'gold_bonus' — value: extra gold per kill
//   'crit_dmg' — value: extra mult on crit (0.5 = +50%)
//   'hp_max_bonus' — value: extra max HP
//   'lifesteal' — value: % of damage dealt healed (0.1 = 10%)
const PASSIVE_ITEMS = [
  { id: 'flame_amulet',   name: '🔥 Flame Charm',   icon: 'fire',       desc: 'Fire skill damage +20%',         effect: 'element_dmg',     element: 'fire',  value: 0.20 },
  { id: 'water_amulet',   name: '💧 Water Charm',   icon: 'wave',       desc: 'Water skill damage +20%',        effect: 'element_dmg',     element: 'water', value: 0.20 },
  { id: 'wind_amulet',    name: '🌪️ Wind Charm',   icon: 'wind',       desc: 'Wind skill damage +20%',       effect: 'element_dmg',     element: 'wind',  value: 0.20 },
  { id: 'light_amulet',   name: '✨ Light Charm',   icon: 'light_orb',  desc: 'Light skill damage +20%',        effect: 'element_dmg',     element: 'light', value: 0.20 },
  { id: 'dark_amulet',    name: '🌑 Dark Charm',   icon: 'malus',      desc: 'Dark skill damage +20%',       effect: 'element_dmg',     element: 'dark',  value: 0.20 },
  { id: 'iron_skin',      name: '🛡️ Ironhide Armor',   icon: 'shield',     desc: 'All damage taken -10%',                effect: 'flat_dmg_taken',  value: 0.9 },
  { id: 'lucky_coin',     name: '🍀 Lucky Coin', icon: 'bonus',      desc: 'Crit chance +10%',                 effect: 'crit_chance',     value: 0.10 },
  { id: 'swift_wind',     name: '🌬️ Swift Wind', icon: 'flying_boots', desc: 'All skill cooldowns -10%',           effect: 'cd_reduction',    value: 0.9 },
  { id: 'lightning_boots',name: '⚡ Lightning Boots',    icon: 'thunder',    desc: '5+ combo: damage +15%',          effect: 'combo_dmg',       threshold: 5, value: 0.15 },
  { id: 'life_blossom',   name: '❤️ Life Blossom',   icon: 'heal',       desc: 'Room  start: HP +20',                  effect: 'room_heal',       value: 20 },
  { id: 'mirror_shard',   name: '🪞 Mirror Shard',   icon: 'spark',      desc: 'On dodge: 10 damage to enemy',           effect: 'dodge_counter',   value: 10 },
  { id: 'sharp_blade',    name: '⚔️ Keen Blade',   icon: 'sword_slash',desc: 'First hit damage +30%',                effect: 'first_hit_dmg',   value: 0.30 },
  { id: 'gold_pouch',     name: '💰 Gold Pouch', icon: 'bonus',      desc: 'On kill: Gold +3',                    effect: 'gold_bonus',      value: 3 },
  { id: 'crit_charm',     name: '💎 Crit Charm', icon: 'clover',     desc: 'Crit damage +50% (1.5x to 2.0x)',  effect: 'crit_dmg',        value: 0.5 },
  { id: 'vampire_fang',   name: '🩸 Vampire Fang', icon: 'bite',       desc: 'Drain 10% of damage as HP',           effect: 'lifesteal',       value: 0.10 },
  { id: 'titan_heart',    name: '💪 Giant’s Heart', icon: 'melting_heart', desc: 'Max HP +30',                     effect: 'hp_max_bonus',    value: 30 },
];

// Build itemId → meta lookup
const PASSIVE_ITEMS_BY_ID = {};
PASSIVE_ITEMS.forEach(function (i) { PASSIVE_ITEMS_BY_ID[i.id] = i; });

// Returns the total contribution of all owned items for a given effect type.
// For element_dmg, pass elementKey to filter to matching items.
function getItemModifier(effectType, elementKey) {
  if (!state.items || state.items.length === 0) return 0;
  let total = 0;
  state.items.forEach(function (id) {
    const meta = PASSIVE_ITEMS_BY_ID[id];
    if (!meta || meta.effect !== effectType) return;
    if (effectType === 'element_dmg' && meta.element !== elementKey) return;
    total += meta.value;
  });
  return total;
}
// Multiplier-style (1.0 base). For dmg_taken / cd_reduction where each item
// is a multiplier like 0.9. Multiple items multiply (0.9 * 0.9 = 0.81).
function getItemMultiplier(effectType) {
  if (!state.items || state.items.length === 0) return 1.0;
  let mult = 1.0;
  state.items.forEach(function (id) {
    const meta = PASSIVE_ITEMS_BY_ID[id];
    if (!meta || meta.effect !== effectType) return;
    mult *= meta.value;
  });
  return mult;
}
function hasItem(itemId) {
  return state.items && state.items.indexOf(itemId) !== -1;
}
// Returns items where the player has at least one matching effect.
function findItemsByEffect(effectType) {
  if (!state.items) return [];
  return state.items
    .map(function (id) { return PASSIVE_ITEMS_BY_ID[id]; })
    .filter(function (m) { return m && m.effect === effectType; });
}

// ─── PASSIVE ITEMS POOL FOR REWARDS ─────────────────
// Returns items not yet owned by the player.
function getAvailableItems() {
  const owned = new Set(state.items || []);
  return PASSIVE_ITEMS.filter(function (i) { return !owned.has(i.id); });
}

// ─── EVENT ROOMS ────────────────────────────────────
// Special non-combat (or modified-combat) rooms that appear at positions 3 or 5
const EVENT_TYPES = {
  spring: {
    icon: '🌿',
    name: 'Healing Spring',
    desc: 'Full HP + Barrier +30',
  },
  challenge: {
    icon: '⚔️',
    name: 'Challenge',
    desc: 'Powerful enemy! Defeat it to choose from 2 rare skills',
    hpMult: 2.0,
    atkMult: 1.4,
  },
  elite: {
    icon: '⭐',
    name: 'Elite',
    desc: 'Strong enemy. +15 gold and a bonus item!',
    hpMult: 1.5,
    atkMult: 1.3,
  },
  shop: {
    icon: '🏪',
    name: 'Shop',
    desc: 'Spend gold on heals, skills & items',
  },
};

// Phase C-4: shop prices (per-purchase). Centralized for easy balancing.
const SHOP_PRICES = {
  potion: 20,    // HP +40
  newSkill: 40,  // random new skill from pool
  upgrade: 50,   // upgrade a random equipped skill
  item: 60,      // random new passive item
};

// ─── RARE SKILLS POOL (Phase D-7: expanded to 20) ─────
// Earned from elite/challenge rewards and the shop. Stronger than commons,
// usually with shorter cooldowns or unique combinations of effects.
const RARE_SKILLS = [
  // ── Original (D-3) ───────────────────────────────────
  { en: 'blaze', kr: 'blaze', icon: 'fire',         element: 'fire',  action: 'damage', cooldown: 2.0, applies: { status: 'burn', chance: 0.6 } },
  { en: 'flood', kr: 'flood', icon: 'wave',         element: 'water', action: 'stall',  amount: 2.0,   cooldown: 5.0 },
  { en: 'gust',  kr: 'gust', icon: 'wind',         element: 'wind',  action: 'damage', applies: { status: 'freeze', chance: 1.0 }, cooldown: 2.5 },
  { en: 'gleam', kr: 'gleam', icon: 'light_orb',    element: 'light', action: 'heal',   amount: 15,    cooldown: 4.0 },
  { en: 'void',  kr: 'void', icon: 'meteor',       element: 'dark',  action: 'damage' },
  { en: 'boom',  kr: 'boom', icon: 'spark',        element: 'none',  action: 'damage' },
  { en: 'tide',  kr: 'tide', icon: 'wave',         element: 'water', action: 'barrier', amount: 20,   cooldown: 6.0 },
  { en: 'gem',   kr: 'gem', icon: 'bonus',        element: 'none',  action: 'heal',    amount: 20,   cooldown: 4.0 },
  { en: 'iron',  kr: 'iron', icon: 'shield',       element: 'none',  action: 'guard',   cooldown: 8.0 },
  { en: 'swift', kr: 'swift', icon: 'flying_boots', element: 'none',  action: 'dodge',   cooldown: 6.0 },
  { en: 'pyre',  kr: 'pyre', icon: 'fire',         element: 'fire',  action: 'damage' },
  { en: 'mist',  kr: 'mist', icon: 'snow',         element: 'water', action: 'damage' },
  // ── Phase D-7: new rares ─────────────────────────────
  { en: 'rage',  kr: 'rage', icon: 'punch',        element: 'none',  action: 'damage', special: 'crit_next',    cooldown: 4.0 },
  { en: 'feast', kr: 'feast', icon: 'bite',         element: 'dark',  action: 'damage', special: 'lifesteal', amount: 1.0, cooldown: 6.0 },
  { en: 'spell', kr: 'spell', icon: 'meteor',       element: 'dark',  action: 'damage', special: 'next_x2',      cooldown: 5.0 },
  { en: 'quake', kr: 'quake', icon: 'rock_explosion',element: 'none', action: 'damage', special: 'charge_reset', cooldown: 6.0 },
  { en: 'vow',   kr: 'vow', icon: 'resurrection', element: 'none',  action: 'heal',    amount: 40,             cooldown: 6.0 },
  { en: 'bolt',  kr: 'bolt', icon: 'thunder',      element: 'wind',  action: 'damage', applies: { status: 'weaken', chance: 0.8 }, cooldown: 3.0 },
  { en: 'crown', kr: 'crown', icon: 'bonus',        element: 'light', action: 'damage', special: 'gold_steal',   amount: 25, cooldown: 5.0 },
  { en: 'aegis', kr: 'aegis', icon: 'shield',       element: 'light', action: 'barrier', amount: 50,             cooldown: 8.0 },
];

// ─── WORD PACKS (Phase E-2) ─────────────────────────────
// Themed vocabulary expansions tied to each class. When unlocked, the pack's
// 5 words become extra skills available in that class's reward pool. This is
// the main "new content earned by playing" reward in E-1+ since the meta
// upgrades were removed.
//
// Unlock conditions:
//   { campaignStage: N }  — clear that campaign stage WHILE playing this class
//   { dungeonDepth: N }   — reach that depth in dungeon WHILE playing this class
//
// Per-class tracking: localStorage 'typerpg_class_progress' stores
// { mage: { campaignMaxStage: N, dungeonMaxDepth: N }, archer: ..., ... }
const WORD_PACKS = {
  mage_elements: {
    classId: 'mage', emoji: '🔥',
    nameKr: 'Mage · Elements Pack', descKr: 'extra fire & lightning words',
    words: [
      { en: 'flame', kr: 'flame', icon: 'fire',      element: 'fire',  action: 'damage', applies: { status: 'burn', chance: 0.3 } },
      { en: 'spark', kr: 'spark', icon: 'spark',     element: 'fire',  action: 'damage' },
      { en: 'halo',  kr: 'halo', icon: 'light_orb', element: 'light', action: 'damage' },
      { en: 'ember', kr: 'ember', icon: 'fire',      element: 'fire',  action: 'damage', applies: { status: 'burn', chance: 0.5 }, cooldown: 4.0 },
      { en: 'ray',   kr: 'ray', icon: 'spark',     element: 'light', action: 'damage' },
    ],
    unlock: { class: 'mage', campaignStage: 5 },
  },
  archer_hunt: {
    classId: 'archer', emoji: '🎯',
    nameKr: 'Archer · Hunt Pack', descKr: 'tracking & precision words',
    words: [
      { en: 'hunt',  kr: 'hunt', icon: 'arrow',   element: 'none', action: 'damage' },
      { en: 'track', kr: 'track', icon: 'inspect', element: 'none', action: 'damage', special: 'crit_next', cooldown: 5.0 },
      { en: 'scope', kr: 'scope', icon: 'vision',  element: 'none', action: 'damage', special: 'next_x2',   cooldown: 6.0 },
      { en: 'dart',  kr: 'dart', icon: 'cut',     element: 'none', action: 'damage', cooldown: 2.0 },
      { en: 'mark',  kr: 'mark', icon: 'spark',   element: 'none', action: 'damage', applies: { status: 'weaken', chance: 0.6 }, cooldown: 5.0 },
    ],
    unlock: { class: 'archer', dungeonDepth: 15 },
  },
  knight_honor: {
    classId: 'knight', emoji: '⚔️',
    nameKr: 'Knight · Honor Pack', descKr: 'courage & honor words',
    words: [
      { en: 'brave', kr: 'brave', icon: 'sword_slash', element: 'none', action: 'damage' },
      { en: 'oath',  kr: 'oath', icon: 'shield',      element: 'none', action: 'barrier', amount: 35, cooldown: 7.0 },
      { en: 'honor', kr: 'honor', icon: 'bonus',       element: 'none', action: 'guard',   cooldown: 9.0 },
      { en: 'noble', kr: 'noble', icon: 'shield',      element: 'none', action: 'damage', special: 'charge_reset', cooldown: 7.0 },
      { en: 'bold',  kr: 'bold', icon: 'sword_slash', element: 'none', action: 'damage' },
    ],
    unlock: { class: 'knight', campaignStage: 5 },
  },
  rogue_shadow: {
    classId: 'rogue', emoji: '🗡',
    nameKr: 'Rogue · Shadow Pack', descKr: 'stealth & speed words',
    words: [
      { en: 'sneak', kr: 'sneak', icon: 'key_silver', element: 'none', action: 'damage', special: 'crit_next', cooldown: 5.0 },
      { en: 'lurk',  kr: 'lurk', icon: 'key_silver', element: 'none', action: 'dodge', cooldown: 7.0 },
      { en: 'quick', kr: 'quick', icon: 'flying_boots', element: 'none', action: 'damage', cooldown: 1.5 },
      { en: 'trick', kr: 'trick', icon: 'claw',      element: 'none', action: 'damage', applies: { status: 'weaken', chance: 0.5 }, cooldown: 4.0 },
      { en: 'flee',  kr: 'flee', icon: 'flying_boots', element: 'none', action: 'dodge', cooldown: 6.0 },
    ],
    unlock: { class: 'rogue', dungeonDepth: 15 },
  },
  priest_blessing: {
    classId: 'priest', emoji: '✨',
    nameKr: 'Priest · Blessing Pack', descKr: 'holy recovery words',
    words: [
      { en: 'grace', kr: 'grace', icon: 'heal',         element: 'light', action: 'heal', amount: 20, cooldown: 4.0 },
      { en: 'faith', kr: 'faith', icon: 'light_orb',    element: 'light', action: 'damage' },
      { en: 'hope',  kr: 'hope', icon: 'melting_heart',element: 'light', action: 'heal', amount: 30, cooldown: 6.0 },
      { en: 'mercy', kr: 'mercy', icon: 'resurrection', element: 'light', action: 'heal', amount: 45, cooldown: 8.0 },
      { en: 'pure',  kr: 'pure', icon: 'light_orb',    element: 'light', action: 'damage' },
    ],
    unlock: { class: 'priest', campaignStage: 7 },
  },
  druid_wild: {
    classId: 'druid', emoji: '🌿',
    nameKr: 'Druid · Wild Pack', descKr: 'nature & plant words',
    words: [
      { en: 'root',  kr: 'root', icon: 'plant',   element: 'none', action: 'damage', applies: { status: 'freeze', chance: 0.5 }, cooldown: 5.0 },
      { en: 'vine',  kr: 'vine', icon: 'bramble', element: 'none', action: 'damage', special: 'lifesteal', amount: 0.3, cooldown: 4.0 },
      { en: 'bloom', kr: 'bloom', icon: 'clover',  element: 'none', action: 'heal', amount: 25, cooldown: 5.0 },
      { en: 'bark',  kr: 'bark', icon: 'shield', element: 'none', action: 'barrier', amount: 30, cooldown: 7.0 },
      { en: 'moss',  kr: 'moss', icon: 'plant',   element: 'none', action: 'damage', special: 'heal_self', amount: 8, cooldown: 4.0 },
    ],
    unlock: { class: 'druid', dungeonDepth: 15 },
  },
  paladin_divine: {
    classId: 'paladin', emoji: '👑',
    nameKr: 'Paladin · Holy Pack', descKr: 'judgment & light words',
    words: [
      { en: 'sacred', kr: 'sacred', icon: 'light_orb', element: 'light', action: 'damage' },
      { en: 'lance',  kr: 'lance',   icon: 'spark',     element: 'light', action: 'damage', cooldown: 3.0 },
      { en: 'shine',  kr: 'shine', icon: 'light_orb', element: 'light', action: 'heal', amount: 25, cooldown: 5.0 },
      { en: 'truth',  kr: 'truth', icon: 'thunder',   element: 'light', action: 'damage', applies: { status: 'weaken', chance: 0.7 }, cooldown: 6.0 },
      { en: 'pious',  kr: 'pious', icon: 'hourglass', element: 'none',  action: 'heal', amount: 35, cooldown: 7.0 },
    ],
    unlock: { class: 'paladin', campaignStage: 9 },
  },
  monk_discipline: {
    classId: 'monk', emoji: '🥋',
    nameKr: 'Monk · Training Pack', descKr: 'focus & breathing words',
    words: [
      { en: 'calm',   kr: 'calm', icon: 'heal',         element: 'none', action: 'heal', amount: 20, cooldown: 5.0 },
      { en: 'jab',    kr: 'jab',   icon: 'punch',        element: 'none', action: 'damage', cooldown: 1.5 },
      { en: 'breath', kr: 'breath', icon: 'melting_heart',element: 'none', action: 'stall',  amount: 3.0, cooldown: 6.0 },
      { en: 'strike', kr: 'strike', icon: 'hammer',       element: 'none', action: 'damage', cooldown: 3.5 },
      { en: 'flow',   kr: 'flow', icon: 'flying_boots', element: 'none', action: 'damage', special: 'crit_next', cooldown: 5.0 },
    ],
    unlock: { class: 'monk', dungeonDepth: 20 },
  },
};

// ─── WORD PACK STATE MANAGEMENT ───────────────────────
function loadUnlockedPacks() {
  try {
    const raw = localStorage.getItem('typerpg_unlocked_packs');
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveUnlockedPacks(packs) {
  try { localStorage.setItem('typerpg_unlocked_packs', JSON.stringify(packs)); }
  catch (e) {}
}
function isPackUnlocked(packId) {
  return loadUnlockedPacks().indexOf(packId) !== -1;
}
function unlockPack(packId) {
  const list = loadUnlockedPacks();
  if (list.indexOf(packId) === -1) {
    list.push(packId);
    saveUnlockedPacks(list);
  }
}
// Per-class progress (campaign & dungeon) for pack-unlock conditions.
function loadClassProgress() {
  try {
    const raw = localStorage.getItem('typerpg_class_progress');
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function saveClassProgress(p) {
  try { localStorage.setItem('typerpg_class_progress', JSON.stringify(p)); }
  catch (e) {}
}
function recordClassCampaignClear(classId, stageNum) {
  const p = loadClassProgress();
  if (!p[classId]) p[classId] = {};
  if (!p[classId].campaignMaxStage || stageNum > p[classId].campaignMaxStage) {
    p[classId].campaignMaxStage = stageNum;
    saveClassProgress(p);
  }
}
function recordClassDungeonDepth(classId, depth) {
  const p = loadClassProgress();
  if (!p[classId]) p[classId] = {};
  if (!p[classId].dungeonMaxDepth || depth > p[classId].dungeonMaxDepth) {
    p[classId].dungeonMaxDepth = depth;
    saveClassProgress(p);
  }
}
// Called after campaign/dungeon clear. Returns list of newly-unlocked pack IDs.
function checkWordPackUnlocks() {
  const progress = loadClassProgress();
  const newly = [];
  Object.keys(WORD_PACKS).forEach(function (packId) {
    if (isPackUnlocked(packId)) return;
    const pack = WORD_PACKS[packId];
    const u = pack.unlock;
    const cp = progress[u.class] || {};
    let met = false;
    if (u.campaignStage && cp.campaignMaxStage >= u.campaignStage) met = true;
    if (u.dungeonDepth && cp.dungeonMaxDepth >= u.dungeonDepth) met = true;
    if (met) {
      unlockPack(packId);
      newly.push(packId);
    }
  });
  return newly;
}
// Find which pack a skill word belongs to, if any. Used for codex lookups.
function findPackForSkill(word) {
  for (const packId in WORD_PACKS) {
    const pack = WORD_PACKS[packId];
    if (pack.words.some(function (w) { return w.en === word; })) {
      return { id: packId, pack: pack };
    }
  }
  return null;
}
// All unlocked pack skills for the CURRENT class(es) (for reward pool inclusion).
// Phase E-3: in coop mode, include packs for BOTH P1 and P2 classes.
function getUnlockedPackSkillsForCurrentClass() {
  const classIds = [state.heroL];
  if (state.coopMode && state.heroR && state.heroR !== state.heroL) {
    classIds.push(state.heroR);
  }
  const skills = [];
  loadUnlockedPacks().forEach(function (packId) {
    const pack = WORD_PACKS[packId];
    if (pack && classIds.indexOf(pack.classId) !== -1) {
      skills.push.apply(skills, pack.words);
    }
  });
  return skills;
}

// ─── ACHIEVEMENTS / TITLES (Phase E-5) ─────────────────
// Persistent badges earned by reaching milestones. Each has a `check(stats)`
// that reads from loadLifetimeStats() + the various localStorage progress keys
// and returns true when the player qualifies. Earned achievements unlock a
// short title the player can wear (display-only — no gameplay effect).
//
// Storage:
//   typerpg_achievements   = ['first_campaign', 'kills_100', ...]
//   typerpg_lifetime_stats = { totalKills, hitlessStages, coopClears, ... }
//   typerpg_active_title   = 'first_campaign' (or null) — equipped title
const ACHIEVEMENTS = {
  // ── Progression ───────────────────────────────
  first_campaign: {
    name: 'First Adventurer', icon: '⚔️', titleKr: '⚔️ First Adventurer',
    desc: 'Clear the first campaign stage',
    check: function (s) { return loadCampaignProgress() >= 1; },
  },
  campaign_done: {
    name: 'Campaign Finisher', icon: '🏆', titleKr: '🏆 Campaign Conqueror',
    desc: 'Clear all 10 campaign stages',
    check: function (s) { return loadCampaignProgress() >= 10; },
  },
  dungeon_25: {
    name: 'Deep Explorer', icon: '🗡️', titleKr: '🗡️ Deep Explorer',
    desc: 'Reach dungeon floor 25',
    check: function (s) { return loadDungeonMaxDepth() >= 25; },
  },
  dungeon_50: {
    name: 'Abyss Challenger', icon: '⚒️', titleKr: '⚒️ Abyss Challenger',
    desc: 'Reach dungeon floor 50',
    check: function (s) { return loadDungeonMaxDepth() >= 50; },
  },
  dungeon_100: {
    name: 'Dungeon Conqueror', icon: '👑', titleKr: '👑 Dungeon Conqueror',
    desc: 'Reach dungeon floor 100',
    check: function (s) { return loadDungeonMaxDepth() >= 100; },
  },
  all_classes: {
    name: 'All-Rounder', icon: '🌟', titleKr: '🌟 All-Rounder',
    desc: 'Unlock all 8 classes',
    check: function (s) {
      const m = loadMeta();
      return (m.unlockedClasses || []).length >= 8;
    },
  },
  all_packs: {
    name: 'Word Collector', icon: '📚', titleKr: '📚 Word Collector',
    desc: 'Unlock all 8 word packs',
    check: function (s) { return loadUnlockedPacks().length >= 8; },
  },
  // ── Combat milestones ─────────────────────────
  kills_100: {
    name: 'A Hundred Wins', icon: '💀', titleKr: '💀 Centurion',
    desc: 'Defeat 100 enemies total',
    check: function (s) { return (s.totalKills || 0) >= 100; },
  },
  kills_500: {
    name: 'A Thousand Blades', icon: '☠️', titleKr: '☠️ Slayer of 500',
    desc: 'Defeat 500 enemies total',
    check: function (s) { return (s.totalKills || 0) >= 500; },
  },
  hitless: {
    name: 'Flawless Hand', icon: '✨', titleKr: '✨ Flawless Hand',
    desc: 'Clear a stage/room without taking a hit',
    check: function (s) { return (s.hitlessStages || 0) >= 1; },
  },
  // ── Co-op ─────────────────────────────────────
  coop_first: {
    name: 'Co-op Begins', icon: '🤝', titleKr: '🤝 Ally',
    desc: 'Clear your first co-op dungeon',
    check: function (s) { return (s.coopClears || 0) >= 1; },
  },
  coop_five: {
    name: 'True Partner', icon: '💞', titleKr: '💞 True Partner',
    desc: 'Clear 5 co-op dungeons',
    check: function (s) { return (s.coopClears || 0) >= 5; },
  },
  // ── Mastery ───────────────────────────────────
  class_master: {
    name: 'Class Master', icon: '🥇', titleKr: '🥇 Class Master',
    desc: 'Clear 10 dungeons with one class',
    check: function (s) {
      const m = loadMeta();
      const clears = m.classClears || {};
      return Object.values(clears).some(function (n) { return n >= 10; });
    },
  },
  all_masters: {
    name: 'End of All Paths', icon: '🎖️', titleKr: '🎖️ End of All Paths',
    desc: 'Clear once with every class',
    check: function (s) {
      const m = loadMeta();
      const clears = m.classClears || {};
      return Object.keys(CLASSES).every(function (c) { return (clears[c] || 0) >= 1; });
    },
  },
};

// ─── LIFETIME STATS (persistent counters) ──────────
function loadLifetimeStats() {
  try {
    const raw = localStorage.getItem('typerpg_lifetime_stats');
    return raw ? JSON.parse(raw) : {};
  } catch (e) { return {}; }
}
function saveLifetimeStats(s) {
  try { localStorage.setItem('typerpg_lifetime_stats', JSON.stringify(s)); }
  catch (e) {}
}
function bumpLifetimeStat(key, delta) {
  const s = loadLifetimeStats();
  s[key] = (s[key] || 0) + (delta == null ? 1 : delta);
  saveLifetimeStats(s);
}

// ─── ACHIEVEMENT STATE ─────────────────────────────
function loadEarnedAchievements() {
  try {
    const raw = localStorage.getItem('typerpg_achievements');
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveEarnedAchievements(list) {
  try { localStorage.setItem('typerpg_achievements', JSON.stringify(list)); }
  catch (e) {}
}
function isAchievementEarned(id) {
  return loadEarnedAchievements().indexOf(id) !== -1;
}
// Check all achievements against current stats. Returns array of newly earned.
function checkAchievements() {
  const earned = loadEarnedAchievements();
  const stats = loadLifetimeStats();
  const newly = [];
  Object.keys(ACHIEVEMENTS).forEach(function (id) {
    if (earned.indexOf(id) !== -1) return;
    if (ACHIEVEMENTS[id].check(stats)) {
      earned.push(id);
      newly.push(id);
    }
  });
  if (newly.length > 0) saveEarnedAchievements(earned);
  return newly;
}

// ─── ACTIVE TITLE (display-only label) ─────────────
function loadActiveTitle() {
  try { return localStorage.getItem('typerpg_active_title') || null; }
  catch (e) { return null; }
}
function saveActiveTitle(id) {
  try {
    if (id) localStorage.setItem('typerpg_active_title', id);
    else    localStorage.removeItem('typerpg_active_title');
  } catch (e) {}
}
function getActiveTitleText() {
  const id = loadActiveTitle();
  if (!id || !isAchievementEarned(id)) return null;
  const a = ACHIEVEMENTS[id];
  return a ? a.titleKr : null;
}

function loadDungeonClears() {
  try { return parseInt(localStorage.getItem('typerpg_dungeon_clears')) || 0; }
  catch (e) { return 0; }
}
function saveDungeonClear() {
  try {
    const cur = loadDungeonClears();
    localStorage.setItem('typerpg_dungeon_clears', String(cur + 1));
  } catch (e) {}
  // Increment per-class mastery counter
  const meta = loadMeta();
  if (!meta.classClears) meta.classClears = {};
  meta.classClears[state.heroL] = (meta.classClears[state.heroL] || 0) + 1;
  saveMeta(meta);
}

// ─── SOUND EFFECTS (Web Audio API tones + sample-based SFX) ──
// Tones (synthesized) are kept as fallback; real .wav samples take priority.
const SFX_LIB = {
  hit:       'assets/sfx/hit.wav',
  punch:     'assets/sfx/punch.wav',
  bonus:     'assets/sfx/bonus.wav',
  powerup:   'assets/sfx/powerup.wav',
  coin:      'assets/sfx/coin.wav',
  menu_move: 'assets/sfx/menu_move.wav',
  alert:     'assets/sfx/alert.wav',
  accept:    'assets/sfx/accept.wav',
  cancel:    'assets/sfx/cancel.wav',
  jump:      'assets/sfx/jump.wav',
};
const SFX_CACHE = {};  // populated on SOUND.init

const SOUND = {
  ctx: null,
  enabled: true,
  init: function () {
    if (this.ctx) return;
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      this.ctx = null;
    }
    try {
      this.enabled = localStorage.getItem('typerpg_sound_off') !== '1';
    } catch (e) {}
    // Preload sfx samples (cloneNode-based concurrent playback)
    Object.keys(SFX_LIB).forEach(function (name) {
      try {
        const a = new Audio(SFX_LIB[name]);
        a.preload = 'auto';
        a.volume = 0.4;
        SFX_CACHE[name] = a;
      } catch (e) {}
    });
  },
  toggle: function () {
    this.enabled = !this.enabled;
    try { localStorage.setItem('typerpg_sound_off', this.enabled ? '0' : '1'); } catch (e) {}
    return this.enabled;
  },
  tone: function (freq, duration, type, volume) {
    if (!this.enabled || !this.ctx) return;
    type = type || 'square';
    volume = volume == null ? 0.1 : volume;
    try {
      // Resume ctx if suspended (browser autoplay policy)
      if (this.ctx.state === 'suspended') this.ctx.resume();
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(volume, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {}
  },
  // Play a preloaded SFX sample. Uses cloneNode so the same sample can overlap
  // (e.g. rapid coin pickups, multi-hit combos). Falls back silently on error.
  sfx: function (name, volume) {
    if (!this.enabled) return;
    const cached = SFX_CACHE[name];
    if (!cached) return;
    try {
      const clone = cached.cloneNode();
      clone.volume = volume != null ? volume : 0.4;
      clone.play().catch(function () {});  // ignore autoplay-policy rejections
    } catch (e) {}
  },
};

// ─── BACKGROUND MUSIC ───────────────────────────────
// Single looping track per scene. Hard-cut transitions (no fade) for now —
// add fadeIn/Out later if needed. Browser autoplay policy means the first
// play() may silently fail until the user interacts with the page; that's OK,
// subsequent transitions (after any click) work fine.
const BGM_TRACKS = {
  menu:    'assets/music/chill.ogg',
  battle:  'assets/music/tension.ogg',
  boss:    'assets/music/majestic.ogg',
  victory: 'assets/music/adventure.ogg',
  defeat:  'assets/music/sadness.ogg',
};

const BGM = {
  audio: null,
  currentTrack: null,
  enabled: true,
  volume: 0.25,
  init: function () {
    try {
      this.enabled = localStorage.getItem('typerpg_bgm_off') !== '1';
    } catch (e) {}
  },
  play: function (track) {
    // Idempotent: same track already playing → no-op
    if (this.currentTrack === track && this.audio && !this.audio.paused) return;
    this.stop();
    this.currentTrack = track;  // remember target even while muted
    if (!this.enabled) return;
    const src = BGM_TRACKS[track];
    if (!src) return;
    try {
      this.audio = new Audio(src);
      this.audio.loop = true;
      this.audio.volume = this.volume;
      const p = this.audio.play();
      if (p && p.catch) p.catch(function () {});  // autoplay block — silent fail
    } catch (e) {}
  },
  stop: function () {
    if (this.audio) {
      try { this.audio.pause(); } catch (e) {}
      this.audio = null;
    }
  },
  toggle: function () {
    this.enabled = !this.enabled;
    try { localStorage.setItem('typerpg_bgm_off', this.enabled ? '0' : '1'); } catch (e) {}
    if (!this.enabled) {
      this.stop();
    } else if (this.currentTrack) {
      // Resume last requested track
      const last = this.currentTrack;
      this.currentTrack = null;  // force play() to actually start
      this.play(last);
    }
    return this.enabled;
  },
};

function playHit()     { SOUND.sfx('hit', 0.35); }
function playCrit()    { SOUND.sfx('punch', 0.5); }
function playHeal()    { SOUND.sfx('bonus', 0.4); }
function playBarrier() { SOUND.sfx('powerup', 0.4); }
function playVictory() { SOUND.sfx('bonus', 0.55); }
function playDefeat()  { SOUND.sfx('alert', 0.45); }
function playClick()   { SOUND.sfx('menu_move', 0.3); }
function playCombo(n)  {
  // Higher pitch / louder for bigger combos via volume
  const vol = 0.3 + Math.min(0.3, n * 0.04);
  SOUND.sfx('coin', vol);
}
function playReward()  { SOUND.sfx('bonus', 0.5); }

// ─── CAMPAIGN STAGES ─────────────────────────────────
// Tutorial text per stage adapts to player's class.
// Each tutorial is a function(classId) returning a string.

// Generic class identity hints (used when stage doesn't specifically target this class)
const CLASS_HINTS = {
  mage:    'Mage: hit elemental weakness for 1.5x damage!',
  archer:  'Archer: +15% crit, chain attacks for combos',
  knight:  'Knight: HP-150 tank. Defend with shield/guard',
  rogue:   'Rogue: first hit auto-crits! Slow foes with dash, dodge with hide',
  priest:  'Priest: manage HP with heal/bless, auto-heal under 30%',
  druid:   'Druid: auto-heal every 5s, strong in long fights',
  paladin: 'Paladin: -10% damage taken, steady pace',
  monk:    'Monk: all cooldowns -20%, rapid attacks',
};

// Class-specific intros for first-run Stages 1-3.
// Stage 1: greet + how to type starter skill
// Stage 2: enemy attacks now + use new skill from reward
// Stage 3: combine both skills + class identity
const CLASS_INTROS = {
  mage: [
    '🔮 Hi, Mage! Your first skill is FIRE — type it to attack with flames!',
    '🌪️ You got WIND. Wind can even freeze enemies',
    '✨ You learned LIGHT. Hit an elemental weakness for 1.5x damage!',
  ],
  archer: [
    '🏹 Hi, Archer! Your first skill is ARROW — type it to shoot true',
    '👁 You learned AIM. Your next attack is more accurate',
    '💥 SHOT added. Archer has +15% crit chance!',
  ],
  knight: [
    '⚔️ Hi, Knight! Your first skill is SWORD — type it to swing your blade!',
    '🛡 You got PARRY — counter the enemy’s attack',
    '✂️ CUT next. Knight is an HP-150 tank — hold the line!',
  ],
  rogue: [
    '🗡 Hi, Rogue! Your first skill is SLASH — cut fast',
    '🔪 You learned STAB. Rogue’s first hit auto-crits!',
    '🌒 HIDE next. Dodge the enemy’s attack',
  ],
  priest: [
    '✨ Hi, Priest! Your first skill is CURE — holy power that heals HP',
    '🙏 You got BLESS — short cooldown for frequent heals',
    '💫 SAVE next. Auto-heals when HP drops below 30%!',
  ],
  druid: [
    '🌿 Hi, Druid! Your first skill is PLANT — attack with the power of nature',
    '🍃 You got LEAF — gentle but steady damage',
    '🌳 THORN next. Auto-heals every 5s — great for long fights!',
  ],
  paladin: [
    '☀️ Hi, Paladin! Your first skill is HOLY — an attack of sacred light',
    '✨ You learned GLOW. Light is strong against Dark enemies',
    '⚡ SMITE next. -10% damage taken for a steady pace!',
  ],
  monk: [
    '👊 Hi, Monk! Your first skill is PUNCH — a quick fist strike',
    '🦵 You learned KICK. All cooldowns -20% for rapid hits',
    '🦷 BITE next. Show the essence of bare-hand combat!',
  ],
};

const CAMPAIGN_STAGES = [
  {
    id: 1, name: 'Warm-up',
    enemyId: 'radish_plant',
    overrides: { hp: 30, atk: 0, charge: 9999 },
    bg: 'bamboo_pink', sky: 'gradient', floor: 'grass', props: 'forest',
    tutorial: function (classId) {
      const intro = CLASS_INTROS[classId] && CLASS_INTROS[classId][0];
      return intro || 'Type the English words to attack. This enemy won’t fight back.';
    }
  },
  {
    id: 2, name: 'Second Encounter',
    enemyId: 'monkey',
    overrides: { hp: 50, atk: 0, charge: 9999 },  // still safe — 학습 친화
    bg: 'tree', sky: 'cloud', floor: 'grass', props: 'forest',
    tutorial: function (classId) {
      const intro = CLASS_INTROS[classId] && CLASS_INTROS[classId][1];
      return intro || 'You learned a new skill! Try using both together.';
    }
  },
  {
    id: 3, name: 'Third Trial',
    enemyId: 'bird',
    overrides: { hp: 55, atk: 0, charge: 9999 },  // still safe
    bg: 'fir', sky: 'cloud_far', floor: 'grass', props: 'mountain',
    tutorial: function (classId) {
      const intro = CLASS_INTROS[classId] && CLASS_INTROS[classId][2];
      return intro || 'Third skill unlocked! Show your class’s true power.';
    }
  },
  {
    id: 4, name: 'Water Foe',
    enemyId: 'frog',
    overrides: { hp: 60, atk: 11, charge: 10 },
    bg: 'bamboo', sky: 'cloud', floor: 'dirt_sand', props: 'forest',
    tutorial: function (classId) {
      if (classId === 'mage') return '💧 Water type. Fire won’t work! Try wind skills';
      return '💧 Water-type enemy. Neutral attacks are unaffected — keep your pace!';
    }
  },
  {
    id: 5, name: 'First Boss',
    enemyId: 'goblinboss',
    overrides: { hp: 100, atk: 15, charge: 9 },
    bg: 'canyon', sky: 'flam', floor: 'checker_dirt', props: 'castle',
    tutorial: function (classId) {
      return '⚠️ Boss incoming! Build combos (3 hits=+10%, 5 hits=+20%) and aim for crits.';
    }
  },
  {
    id: 6, name: 'Into the Dark',
    enemyId: 'mushroom',
    overrides: { hp: 75, atk: 12, charge: 9 },
    bg: 'bamboo_dark', sky: 'star', floor: 'checker_dirt', props: 'mountain_dark',
    tutorial: function (classId) {
      if (classId === 'mage') return '🌑 Dark type with Weaken! ✨ Light is 1.5x effective';
      if (classId === 'knight' || classId === 'paladin') return '🌑 Weaken inflicted! shield/guard still defend reliably';
      if (classId === 'priest' || classId === 'druid') return '🌑 Weaken inflicted! It only lowers attack — healing works normally';
      return '🌑 Weaken-inflicting enemy. Weaken cuts damage -30% — stay calm';
    }
  },
  {
    id: 7, name: 'Flame Raid',
    enemyId: 'candlesnake',
    overrides: { hp: 120, atk: 16, charge: 9 },
    bg: 'fir', sky: 'flam', floor: 'checker_dirt', props: 'mountain',
    tutorial: function (classId) {
      if (classId === 'mage') return '🔥 Fire Boss with Burn! Counter with 💧 water (wave) skills';
      if (classId === 'knight') return '🔥 Burn-inflicting Boss! A shield barrier absorbs burn damage too';
      if (classId === 'priest' || classId === 'druid') return '🔥 Burn inflicted! Burn deals 5 damage/sec — offset with heal/bless';
      if (classId === 'paladin') return '🔥 Burn inflicted! Your -10% damage passive eases burn slightly';
      return '🔥 Burn-inflicting Boss. Focus on HP management';
    }
  },
  {
    id: 8, name: 'Hornheart',
    enemyId: 'hornheart',
    overrides: { hp: 140, atk: 16, charge: 10 },
    bg: 'palm_snow', sky: 'star', floor: 'dungeon', props: 'mountain_dark',
    tutorial: function (classId) {
      if (classId === 'mage') return '🌑 Weaken Boss. Overwhelm it with light skills + combos';
      if (classId === 'knight' || classId === 'paladin') return '🌑 Weaken Boss! Use defensive skills; combos still build while weakened';
      if (classId === 'rogue') return '🌑 Weaken Boss. Slow its charge with dash, dodge big hits with hide';
      return '🌑 Weaken Boss. ' + CLASS_HINTS[classId];
    }
  },
  {
    id: 9, name: 'Fire Demon',
    enemyId: 'flamevil',
    overrides: { hp: 170, atk: 18, charge: 9 },
    bg: 'canyon', sky: 'flam', floor: 'dungeon', props: 'canyon',
    tutorial: function (classId) {
      if (classId === 'mage') return '🔥 Huge Boss. Use everything — water + combo + crit!';
      return '🔥 Huge Boss. Chain 5+ combos for a +20% damage bonus!';
    }
  },
  {
    id: 10, name: 'Final: Dragon',
    enemyId: 'dragon',
    overrides: { hp: 220, atk: 20, charge: 8 },
    bg: 'canyon', sky: 'flam', floor: 'checker_slabs_rock', props: 'mountain',
    tutorial: function (classId) {
      if (classId === 'mage')   return '🐲 Final! Pour it all in — water + light + combo + crit';
      if (classId === 'archer') return '🐲 Final! 25% crit — nearly half crit, so attack rapidly';
      if (classId === 'knight') return '🐲 Final! Lean on shield+guard — your HP 150 is your biggest asset';
      if (classId === 'rogue')  return '🐲 Final! Auto-crit first hit + slow the boss’s charge with dash';
      if (classId === 'priest') return '🐲 Final! Cycle heal/bless and lean on auto-heal under 30%';
      if (classId === 'druid')  return '🐲 Final! Auto-heal every 5s — keep a long-game pace';
      if (classId === 'paladin')return '🐲 Final! -10% damage taken + steady play';
      if (classId === 'monk')   return '🐲 Final! -20% cooldowns — attack 25% more often than others';
      return '🐲 Final Boss! Time to show everything you’ve learned';
    }
  },
];

// ─── CAMPAIGN PROGRESS (localStorage) ────────────────
function loadCampaignProgress() {
  try {
    return parseInt(localStorage.getItem('typerpg_max_stage')) || 0;
  } catch (e) { return 0; }
}
function saveCampaignProgress(stageNum) {
  try {
    const current = loadCampaignProgress();
    if (stageNum > current) {
      localStorage.setItem('typerpg_max_stage', String(stageNum));
    }
  } catch (e) {}
}
// True if the player has never completed the campaign (Stage 10) yet.
// First-run is the tutorial run: forced class-skill rewards, intro modals.
function isFirstRun() {
  return loadCampaignProgress() < CAMPAIGN_STAGES.length;
}

// ─── CAMPAIGN RUN SAVE (Phase C-3.1) ────────────────
// Persists the *in-progress* campaign so "Continue" resumes the actual run
// (same class, skills, gold, items, level), not a fresh start at next stage.
//
// Saved keys: typerpg_campaign_save (JSON object) — only present while a run
// is mid-campaign. Cleared on completion / defeat / manual reset.
function saveCampaignRun() {
  if (state.gameMode !== 'campaign') return;
  try {
    const data = {
      heroL: state.heroL,
      campaignStage: state.campaignStage,
      equippedSkills: (state.equippedSkills || []).map(function (s) { return s.en; }),
      skillLevels: state.skillLevels || {},
      gold: state.gold || 0,
      items: state.items || [],
      druidGrowthBonus: state.druidGrowthBonus || 0,  // Phase D-1
      version: 1,
    };
    localStorage.setItem('typerpg_campaign_save', JSON.stringify(data));
  } catch (e) {}
}
function loadCampaignRun() {
  try {
    const raw = localStorage.getItem('typerpg_campaign_save');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.heroL) return null;
    return data;
  } catch (e) { return null; }
}
function clearCampaignRun() {
  try { localStorage.removeItem('typerpg_campaign_save'); } catch (e) {}
}
function hasCampaignRun() {
  return loadCampaignRun() !== null;
}
// Rehydrate state from a saved run. Skill words → full skill objects via
// findSkill (which checks class catalog + common + rare).
function applyCampaignRun(data) {
  state.gameMode = 'campaign';
  state.heroL = data.heroL;
  state.campaignStage = data.campaignStage;
  state.skillLevels = data.skillLevels || {};
  state.gold = data.gold || 0;
  state.items = data.items || [];
  state.druidGrowthBonus = data.druidGrowthBonus || 0;  // Phase D-1
  state.dungeonExtraSkills = []; // legacy
  // Resolve skill words → objects. findSkill() requires state.heroL to be set
  // first (which we did above), so this works for class-specific lookups too.
  const resolved = [];
  (data.equippedSkills || []).forEach(function (en) {
    const sk = findSkill(en);
    if (sk) resolved.push(sk);
  });
  // Safety: if save was corrupted/empty, fallback to class's first skill.
  if (resolved.length === 0) {
    const c = CLASSES[state.heroL];
    if (c && c.skills[0]) resolved.push(c.skills[0]);
  }
  state.equippedSkills = resolved;
}

// ─── DUNGEON RUN SAVE (Phase F-7) ────────────────
// Solo dungeon mid-run persistence. Coop runs are NOT saved (online needs
// host-only authority + reconnection; local coop has 2 distinct kits to
// snapshot). MVP: solo only — clear path forward to extend later.
//
// Saved keys: typerpg_dungeon_save (JSON object) — present while a run is
// mid-dungeon. Cleared on completion / defeat / fresh start / progress reset.
//
// HP is intentionally NOT saved: resetBattle() fills HP to max on every room
// entry anyway, so resuming at room N is identical to "just walked into N".
function saveDungeonRun() {
  if (state.gameMode !== 'dungeon') return;
  if (state.coopMode) return;          // local coop — not saved
  if (typeof isNetCoop === 'function' && isNetCoop()) return; // online coop — not saved
  try {
    const data = {
      heroL: state.heroL,
      dungeonFloor: state.dungeonFloor,
      dungeonRoom: state.dungeonRoom,
      dungeonEnemySequence: (state.dungeonEnemySequence || []).slice(),
      dungeonRoomTypes:     (state.dungeonRoomTypes     || []).slice(),
      dungeonNextEnemyBuff: state.dungeonNextEnemyBuff || 1.0,
      equippedSkills: (state.equippedSkills || []).map(function (s) { return s.en; }),
      skillLevels:    state.skillLevels    || {},
      gold:           state.gold           || 0,
      items:          (state.items         || []).slice(),
      druidGrowthBonus: state.druidGrowthBonus || 0,
      version: 1,
    };
    localStorage.setItem('typerpg_dungeon_save', JSON.stringify(data));
  } catch (e) {}
}
function loadDungeonRun() {
  try {
    const raw = localStorage.getItem('typerpg_dungeon_save');
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || !data.heroL || !data.dungeonEnemySequence ||
        !data.dungeonRoomTypes || data.dungeonRoomTypes.length === 0) return null;
    return data;
  } catch (e) { return null; }
}
function clearDungeonRun() {
  try { localStorage.removeItem('typerpg_dungeon_save'); } catch (e) {}
}
function hasDungeonRun() {
  return loadDungeonRun() !== null;
}
// Rehydrate state from a saved dungeon run.
function applyDungeonRun(data) {
  state.gameMode = 'dungeon';
  state.coopMode = false;             // saves are solo-only
  state.heroL = data.heroL;
  state.dungeonFloor = data.dungeonFloor || 1;
  state.dungeonRoom  = data.dungeonRoom  || 1;
  state.dungeonEnemySequence = (data.dungeonEnemySequence || []).slice();
  state.dungeonRoomTypes     = (data.dungeonRoomTypes     || []).slice();
  state.dungeonNextEnemyBuff = data.dungeonNextEnemyBuff || 1.0;
  state.dungeonExtraSkills = [];      // legacy field
  state.dungeonEssenceEarned = 0;     // legacy field
  state.skillLevels  = data.skillLevels || {};
  state.gold         = data.gold        || 0;
  state.goldR        = 0;
  state.items        = (data.items      || []).slice();
  state.itemsR       = [];
  state.druidGrowthBonus = data.druidGrowthBonus || 0;
  // Resolve skill words → objects (same as campaign).
  const resolved = [];
  (data.equippedSkills || []).forEach(function (en) {
    const sk = findSkill(en);
    if (sk) resolved.push(sk);
  });
  if (resolved.length === 0) {
    const c = CLASSES[state.heroL];
    if (c && c.skills[0]) resolved.push(c.skills[0]);
  }
  state.equippedSkills  = resolved;
  state.equippedSkillsR = [];
}
const CLASS_PASSIVES = {
  mage:    { kr: 'Elemental Mastery',     desc: 'On weakness hit: damage +25%',                          effect: 'weakness_bonus',   value: 0.25 },
  archer:  { kr: 'Precise Shot',   desc: 'Crit chance +15%',                                 effect: 'crit_bonus',       value: 0.15 },
  knight:  { kr: 'Steel Armor',     desc: 'All damage taken -15%',                              effect: 'damage_reduction', value: 0.15 },
  // ── Phase D-1: redesigned class identities ──
  rogue:   { kr: 'Combo Strike',     desc: 'Different skill than last x1.5, same skill x0.5 (no penalty with 1 skill)', effect: 'variety_combo' },
  priest:  { kr: 'Holy Overflow',   desc: 'Overheal beyond max deals x1.5 as damage to the enemy',           effect: 'overheal_smite' },
  druid:   { kr: 'Life Drain',   desc: 'Casting a spell gives +2 max HP (permanent)',     effect: 'spell_growth',     value: 2 },
  paladin: { kr: 'Light of Judgment',     desc: 'After heal, next attack damage x2',                       effect: 'heal_smite' },
  monk:    { kr: 'Twin Strike',          desc: 'Every attack hits twice at 50% damage',                  effect: 'double_strike' },
};

// ─── DATA: Classes & Skills ──────────────────────────
// As of v0.60 (Phase C-1): each class has 4 unique skills + access to
// COMMON_SKILLS pool (18 skills) via dungeon/campaign rewards.
// Duplicate words (wave/shield/heal/block/dash) moved to COMMON_SKILLS.
// element: fire | water | wind | light | dark | none
// action: 'damage' | 'heal' | 'barrier' | 'guard' | 'stall' | 'dodge'
// ─── DATA: Classes & Skills ──────────────────────────
// Phase D-2: each class gets stats (hp, dmgMult) + 4 skills tuned for passive synergy.
// Phase D-6: skills redesigned for 4 *distinct roles* per class. No two skills in
// one class overlap (e.g. knight's sword vs cut → sword + shield). Each class
// also has at least one skill that directly synergizes with its passive.
//
// Stats become the new max HP source (knight's +50 passive folded in here).
// dmgMult is multiplied into the final damage calc (applied to ALL outgoing damage).
const CLASSES = {
  mage: {
    nameKr: 'Mage', theme: 'Elemental Mastery', themeEn: 'ELEMENTAL',
    vocabKr: 'Nature Nouns', vocabDesc: 'fire/wind/water/light element words',
    color: '#3b82f6',
    stats: { hp: 80, dmgMult: 1.15 },   // 약한 HP, 강한 마법
    // 4 distinct elements — passive (weakness_bonus) rewards element matching
    skills: [
      { en: 'fire',  kr: 'fire',   icon: 'fire',         element: 'fire',  action: 'damage', applies: { status: 'burn', chance: 0.4 } },
      { en: 'wind',  kr: 'wind', icon: 'wind',         element: 'wind',  action: 'damage', applies: { status: 'freeze', chance: 1.0 }, cooldown: 2.5 },
      { en: 'frost', kr: 'frost', icon: 'snow',         element: 'water', action: 'damage', applies: { status: 'freeze', chance: 0.5 }, cooldown: 3.0 },
      { en: 'light', kr: 'light',   icon: 'light_orb',    element: 'light', action: 'damage' },
    ]
  },
  archer: {
    nameKr: 'Archer', theme: 'Precise Shot', themeEn: 'PRECISION',
    vocabKr: 'Archery & Focus', vocabDesc: 'bow, aim & focus words',
    color: '#84cc16',
    stats: { hp: 90, dmgMult: 1.10 },
    // 4 distinct roles: rapid / charge / debuff / weaken-mark
    skills: [
      { en: 'arrow', kr: 'arrow', icon: 'arrow',   element: 'none', action: 'damage' },
      { en: 'aim',   kr: 'aim', icon: 'inspect', element: 'none', action: 'damage', special: 'next_x2', cooldown: 7.0 },
      { en: 'snipe', kr: 'snipe', icon: 'spark',   element: 'none', action: 'damage', applies: { status: 'weaken', chance: 0.7 }, cooldown: 6.0 },
      { en: 'eye',   kr: 'eye',   icon: 'vision',  element: 'none', action: 'damage', special: 'crit_next', cooldown: 5.0 },
    ]
  },
  knight: {
    nameKr: 'Knight', theme: 'Steel Armor', themeEn: 'TANK',
    vocabKr: 'Combat & Defense', vocabDesc: 'sword, shield & defense words',
    color: '#dc2626',
    stats: { hp: 140, dmgMult: 0.95 },
    // 4 distinct roles: attack / interrupt / barrier / hard-guard
    // (Phase D-6: cut → shield to remove sword/cut duplication.)
    skills: [
      { en: 'sword',  kr: 'sword',     icon: 'sword_slash', element: 'none', action: 'damage' },
      { en: 'parry',  kr: 'parry', icon: 'shield',      element: 'none', action: 'damage', special: 'charge_reset', cooldown: 8.0 },
      { en: 'shield', kr: 'shield',   icon: 'shield',      element: 'none', action: 'barrier', amount: 40, cooldown: 8.0 },
      { en: 'guard',  kr: 'guard', icon: 'bonus',       element: 'none', action: 'guard',  cooldown: 10.0 },
    ]
  },
  rogue: {
    nameKr: 'Rogue', theme: 'Combo Strike', themeEn: 'COMBO',
    vocabKr: 'Slashing & Escape', vocabDesc: 'fast attacks & dodging',
    color: '#7c3aed',
    stats: { hp: 85, dmgMult: 1.10 },
    // 4 distinct roles: fast / crit / evade / dot
    // (variety_combo passive rewards rotating between these)
    skills: [
      { en: 'slash', kr: 'slash',   icon: 'slash',      element: 'none', action: 'damage' },
      { en: 'stab',  kr: 'stab', icon: 'cut',        element: 'none', action: 'damage', special: 'crit_next', cooldown: 4.0 },
      { en: 'hide',  kr: 'hide',   icon: 'key_silver', element: 'none', action: 'dodge', cooldown: 8.0 },
      { en: 'claw',  kr: 'claw', icon: 'claw',       element: 'none', action: 'damage', applies: { status: 'burn', chance: 0.5 } },
    ]
  },
  priest: {
    nameKr: 'Priest', theme: 'Holy Overflow', themeEn: 'OVERHEAL',
    vocabKr: 'Healing & Holy', vocabDesc: 'healing & light words',
    color: '#f59e0b',
    stats: { hp: 100, dmgMult: 0.85 },
    // Phase D-6: 3 different-sized heals (each triggers overheal differently)
    // + 1 light-damage attack. 'bless' renamed to 'pray' to avoid clash with
    // earlier 'bless' (now removed from commons too).
    skills: [
      { en: 'cure',  kr: 'cure',   icon: 'heal',         element: 'none', action: 'heal', amount: 25, cooldown: 5.0 },
      { en: 'pray',  kr: 'pray',   icon: 'talk',         element: 'none', action: 'heal', amount: 10, cooldown: 2.0 },
      { en: 'save',  kr: 'save', icon: 'resurrection', element: 'none', action: 'heal', amount: 50, cooldown: 9.0 },
      { en: 'bless', kr: 'bless',   icon: 'light_orb',    element: 'light', action: 'damage' },
    ]
  },
  druid: {
    nameKr: 'Druid', theme: 'Life Drain', themeEn: 'GROWTH',
    vocabKr: 'Nature & Plants', vocabDesc: 'plant & nature words',
    color: '#16a34a',
    stats: { hp: 95, dmgMult: 1.0 },
    // Phase D-6: 4 distinct nature attacks — each builds spell_growth.
    // plant=basic, leaf=lifesteal, thorn=DoT, tree=heavy+self-heal
    skills: [
      { en: 'plant', kr: 'plant', icon: 'plant',   element: 'none', action: 'damage' },
      { en: 'leaf',  kr: 'leaf',   icon: 'clover',  element: 'none', action: 'damage', special: 'lifesteal', amount: 0.3, cooldown: 4.0 },
      { en: 'thorn', kr: 'thorn', icon: 'bramble', element: 'none', action: 'damage', applies: { status: 'burn', chance: 0.5 }, cooldown: 4.0 },
      { en: 'tree',  kr: 'tree', icon: 'torch',   element: 'none', action: 'damage', special: 'heal_self', amount: 15, cooldown: 7.0 },
    ]
  },
  paladin: {
    nameKr: 'Paladin', theme: 'Light of Judgment', themeEn: 'HOLY',
    vocabKr: 'Light & Judgment', vocabDesc: 'holy & judgment words',
    color: '#fbbf24',
    stats: { hp: 120, dmgMult: 1.0 },
    // Phase D-6: 2 attacks + 2 heals — heal_smite passive triggers ×2 on next attack
    skills: [
      { en: 'holy',  kr: 'holy', icon: 'light_orb', element: 'light', action: 'damage' },
      { en: 'glow',  kr: 'glow', icon: 'spark',     element: 'light', action: 'heal', amount: 20, cooldown: 6.0 },
      { en: 'smite', kr: 'smite', icon: 'thunder',   element: 'light', action: 'damage' },
      { en: 'judge', kr: 'judge', icon: 'hourglass', element: 'none',  action: 'heal', amount: 30, cooldown: 8.0 },
    ]
  },
  monk: {
    nameKr: 'Monk', theme: 'Twin Strike', themeEn: 'DOUBLE',
    vocabKr: 'Body & Motion', vocabDesc: 'bare-hand & quick motion words',
    color: '#ea580c',
    stats: { hp: 100, dmgMult: 1.0 },
    // Phase D-6: 4 distinct roles — fast / interrupt / dot / heavy
    // (all damage skills auto-double via double_strike passive)
    skills: [
      { en: 'punch', kr: 'punch',   icon: 'punch',  element: 'none', action: 'damage', cooldown: 1.5 },
      { en: 'kick',  kr: 'kick',   icon: 'hammer', element: 'none', action: 'damage', special: 'stall', amount: 2.0, cooldown: 4.0 },
      { en: 'bite',  kr: 'bite',   icon: 'bite',   element: 'none', action: 'damage', applies: { status: 'burn', chance: 0.4 }, cooldown: 3.0 },
      { en: 'chop',  kr: 'chop', icon: 'cut',  element: 'none', action: 'damage', cooldown: 3.0 },
    ]
  },
};

// ─── COMMON SKILLS (Phase D-7: expanded utility pool, 18 skills) ───
// Each common adds tactical depth beyond what class skills offer.
const COMMON_SKILLS = [
  // ── Pure utility (no damage) ───────────────────────────
  { en: 'dash',   kr: 'dash',   icon: 'flying_boots', element: 'none',  action: 'stall',   amount: 3.0, cooldown: 6.0 },
  { en: 'jump',   kr: 'jump',   icon: 'flying_boots', element: 'none',  action: 'dodge',   cooldown: 7.0 },
  { en: 'heal',   kr: 'heal',   icon: 'heal',         element: 'none',  action: 'heal',    amount: 25, cooldown: 5.0 },
  { en: 'rest',   kr: 'rest',   icon: 'melting_heart',element: 'none',  action: 'heal',    amount: 35, cooldown: 9.0 },
  // ── Status-applying damage (control) ────────────────────
  { en: 'freeze', kr: 'freeze', icon: 'snow',         element: 'water', action: 'damage', applies: { status: 'freeze', chance: 1.0 }, cooldown: 7.0 },
  { en: 'burn',   kr: 'burn', icon: 'fire',         element: 'fire',  action: 'damage', applies: { status: 'burn',   chance: 1.0 }, cooldown: 6.0 },
  { en: 'curse',  kr: 'curse',   icon: 'malus',        element: 'dark',  action: 'damage', applies: { status: 'weaken', chance: 1.0 }, cooldown: 8.0 },
  // ── Special on-hit effects ──────────────────────────────
  { en: 'steal',  kr: 'steal', icon: 'bonus',        element: 'none',  action: 'damage', special: 'gold_steal', amount: 10, cooldown: 5.0 },
  { en: 'drain',  kr: 'drain',   icon: 'bite',         element: 'dark',  action: 'damage', special: 'lifesteal',  amount: 0.5, cooldown: 6.0 },
  { en: 'focus',  kr: 'focus',   icon: 'vision',       element: 'none',  action: 'damage', special: 'next_x2',    cooldown: 7.0 },
  { en: 'shock',  kr: 'shock',   icon: 'thunder',      element: 'wind',  action: 'damage', special: 'charge_reset', cooldown: 9.0 },
  // ── Phase D-7: new utility skills ─────────────────────
  { en: 'pulse',  kr: 'pulse',   icon: 'spark',        element: 'none',  action: 'damage', special: 'crit_next',   cooldown: 6.0 },
  { en: 'pause',  kr: 'pause',   icon: 'hourglass',    element: 'none',  action: 'stall',   amount: 4.0,            cooldown: 8.0 },
  { en: 'sip',    kr: 'sip',icon: 'heal',         element: 'none',  action: 'damage', special: 'heal_self',   amount: 10, cooldown: 5.0 },
  { en: 'mend',   kr: 'mend',   icon: 'shield',       element: 'none',  action: 'barrier', amount: 25,             cooldown: 7.0 },
  { en: 'tap',    kr: 'tap',   icon: 'punch',        element: 'none',  action: 'damage', cooldown: 1.5 },
  { en: 'spike',  kr: 'spike',   icon: 'bramble',      element: 'none',  action: 'damage', applies: { status: 'burn',   chance: 0.7 }, cooldown: 4.0 },
  { en: 'breeze', kr: 'breeze', icon: 'tornado',      element: 'wind',  action: 'damage', special: 'stall', amount: 2.0,  cooldown: 5.0 },
];

// ─── SKILL LOOKUP HELPERS ─────────────────────────────
// Build a unified lookup: skill word → full skill object.
// Used by activateSkill, getActiveSkillWords, and the codex screen.
function findSkill(word) {
  // Equipped skills first (covers both starting class skill and rewards)
  if (state.equippedSkills) {
    const eq = state.equippedSkills.find(function (s) { return s.en === word; });
    if (eq) return eq;
  }
  // Phase E-3: in coop mode, also check P2's equipped skills
  if (state.coopMode && state.equippedSkillsR) {
    const eqR = state.equippedSkillsR.find(function (s) { return s.en === word; });
    if (eqR) return eqR;
  }
  // Class skills catalog (for codex lookups even when not equipped)
  const c = CLASSES[state.heroL];
  if (c) {
    const cs = c.skills.find(function (s) { return s.en === word; });
    if (cs) return cs;
  }
  // Phase E-3: in coop mode, also check P2's class catalog
  if (state.coopMode) {
    const cR = CLASSES[state.heroR];
    if (cR) {
      const csR = cR.skills.find(function (s) { return s.en === word; });
      if (csR) return csR;
    }
  }
  // Common pool
  const cm = COMMON_SKILLS.find(function (s) { return s.en === word; });
  if (cm) return cm;
  // Rare pool
  const r = RARE_SKILLS.find(function (s) { return s.en === word; });
  if (r) return r;
  // Phase E-2: word packs (search through all 8 packs)
  for (const packId in WORD_PACKS) {
    const found = WORD_PACKS[packId].words.find(function (s) { return s.en === word; });
    if (found) return found;
  }
  return null;
}

// True if word belongs to the current class's catalog (4 native skills).
function isClassSkill(word) {
  const c = CLASSES[state.heroL];
  if (!c) return false;
  return c.skills.some(function (s) { return s.en === word; });
}

// ─── SKILL CODEX (discovery tracking) ────────────────
// Each session, the player has "discovered" their class's 4 skills + any
// commons/rares they've picked up via rewards. Persisted in localStorage.
function loadDiscoveredSkills() {
  try {
    const raw = localStorage.getItem('typerpg_codex');
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) { return {}; }
}
function saveDiscoveredSkill(word) {
  try {
    const codex = loadDiscoveredSkills();
    if (!codex[word]) {
      codex[word] = Date.now();
      localStorage.setItem('typerpg_codex', JSON.stringify(codex));
    }
  } catch (e) {}
}
// Bulk-discover all 4 class skills for the given class (called when player
// selects/changes class). Safe to call repeatedly.
function discoverClassSkills(classId) {
  const c = CLASSES[classId];
  if (!c) return;
  c.skills.forEach(function (s) { saveDiscoveredSkill(s.en); });
}
function isDiscovered(word) {
  // Phase D-5: dev mode unlocks every skill in the codex
  if (isDevMode()) return true;
  return !!loadDiscoveredSkills()[word];
}
function getCodexCount() {
  // Total = 32 class + 18 common = 50 (rare skills tracked separately)
  let total = 0;
  Object.keys(CLASSES).forEach(function (k) { total += CLASSES[k].skills.length; });
  total += COMMON_SKILLS.length;
  return total;
}
function getDiscoveredCount() {
  return Object.keys(loadDiscoveredSkills()).length;
}

// ─── SKILL LEVELS / UPGRADES (Phase C-2) ────────────
// Skills can be upgraded via rewards. Each level above 1 adds +25% damage
// (for damage skills) or +5 to amount (for heal/barrier). Levels are
// run-scoped — they reset when starting a new campaign/dungeon run.
function getSkillLevel(word) {
  return state.skillLevels[word] || 1;
}
function upgradeSkill(word) {
  state.skillLevels[word] = getSkillLevel(word) + 1;
}
// Damage multiplier from level. Lvl 1 = 1.0, Lvl 2 = 1.25, Lvl 3 = 1.5, ...
function getSkillLevelMult(word) {
  return 1.0 + (getSkillLevel(word) - 1) * 0.25;
}
// Returns currently equipped skills. Replaces the old "class skills + dungeon
// extras" combo. Backed by state.equippedSkills (max 4, populated via
// class-select start + rewards + swap UI).
function getOwnedSkills() {
  return (state.equippedSkills || []).slice();
}

// One-line effect description for rewards/swap modal cards.
// Format examples:
//   "🔥 damage 12 · Burn 부여 40%"
//   "💧 damage 12 · Freeze"
//   "HP +25 · Cooldown 5s"
//   "🛡 Barrier 30"
//   "방어 -40% · Cooldown 10s"
//   "Dodge x1 · cooldown 8s"
//   "차징 +3s delay"
function getSkillEffectText(skill) {
  if (!skill) return '';
  const parts = [];
  // Element emoji prefix (damage skills only)
  const elemEmoji = {
    fire: '🔥', water: '💧', wind: '🌪️', light: '✨', dark: '🌑',
  };
  // Action-specific summary
  if (skill.action === 'heal') {
    parts.push('HP +' + (skill.amount || 20));
  } else if (skill.action === 'barrier') {
    parts.push('🛡 Barrier ' + (skill.amount || 30));
  } else if (skill.action === 'guard') {
    const pct = Math.round((STATUSES.guard.value || 0.4) * 100);
    parts.push('Damage taken -' + pct + '%');
  } else if (skill.action === 'dodge') {
    parts.push('Dodge x1');
  } else if (skill.action === 'stall') {
    parts.push('Enemy charge +' + (skill.amount || 2) + 's delay');
  } else {
    // Damage (default)
    const prefix = (skill.element && elemEmoji[skill.element]) ? elemEmoji[skill.element] + ' ' : '';
    const dmg = (typeof TUNING !== 'undefined' && TUNING.skillDamage)
      ? TUNING.skillDamage(skill.en) : skill.en.length * 3;
    parts.push(prefix + 'damage ' + dmg);
    // Status application (burn/freeze)
    if (skill.applies) {
      const statusKr = { burn: 'Burn', freeze: 'Freeze', weaken: 'Weaken' }[skill.applies.status] || skill.applies.status;
      const chancePct = Math.round((skill.applies.chance || 1.0) * 100);
      parts.push(statusKr + (chancePct < 100 ? ' ' + chancePct + '%' : ''));
    }
  }
  // ── Phase D-1/D-6: special-effect annotation ─────────
  if (skill.special) {
    const specialKr = {
      gold_steal:   '+' + (skill.amount || 10) + 'G',
      lifesteal:    'HP heal ' + Math.round((skill.amount || 0.5) * 100) + '%',
      next_x2:      'Next attack x2',
      charge_reset: 'Reset enemy charge',
      attack_buff:  'Next attack x2',
      crit_next:    'Next attack crits',                    // Phase D-6
      heal_self:    'HP +' + (skill.amount || 15) + ' Heal', // Phase D-6
      stall:        'Enemy charge +' + (skill.amount || 2) + 's',// Phase D-6
    }[skill.special];
    if (specialKr) parts.push(specialKr);
  }
  // Cooldown info (only if non-default and meaningful)
  if (skill.cooldown != null && skill.cooldown >= 3) {
    parts.push('CD ' + skill.cooldown + 's');
  }
  return parts.join(' · ');
}

// ─── GOLD (Phase C-2) ───────────────────────────────
// Run-scoped currency. Earned per kill; reset when a new run starts.
//   Normal enemy:  5 gold
//   Elite enemy:  15 gold (Phase C-3)
//   Boss enemy:   20 gold
// Phase C-3: gold_pouch item adds +3 per kill (added in getGoldReward).
function getGoldReward() {
  let base = 5;
  if (state.dungeonRoomTypes && state.dungeonRoom) {
    const roomType = state.dungeonRoomTypes[state.dungeonRoom - 1];
    if (roomType === 'elite') base = 15;
  }
  const meta = ASSETS.enemies.find(function (e) { return e.id === state.enemy; });
  if (meta && meta.kind === 'boss') base = Math.max(base, 20);
  // Phase C-3: gold_pouch bonus
  base += getItemModifier('gold_bonus');
  return base;
}
function addGold(amount) {
  // Phase F-6.2: in coop, the enemy gold drop is split — each player gets
  // half (rounded so total equals the original amount; P1 gets the remainder).
  if (state.coopMode) {
    const half  = Math.floor(amount / 2);
    const other = amount - half;  // remainder goes to P1
    state.gold  = (state.gold  || 0) + other;
    state.goldR = (state.goldR || 0) + half;
  } else {
    state.gold = (state.gold || 0) + amount;
  }
  updateHud();
}

// Phase F-6.2: reward-card gold goes ONLY to the receiving player's wallet.
// Use this for reward.apply paths so the choosing player gets the full bag.
function addMyGold(amount) {
  if (isNetCoopGuest()) state.goldR = (state.goldR || 0) + amount;
  else                  state.gold  = (state.gold  || 0) + amount;
  updateHud();
}

// Phase F-6.2: "my" wallet — what the current UI should display + spend from.
//   • Solo / local coop: always P1's gold
//   • Net coop host:     P1's gold
//   • Net coop guest:    P2's gold (state.goldR)
function myGold() {
  if (isNetCoopGuest()) return state.goldR || 0;
  return state.gold || 0;
}
function setMyGold(v) {
  if (isNetCoopGuest()) state.goldR = v;
  else state.gold = v;
}
function spendMyGold(amount) {
  if (isNetCoopGuest()) state.goldR = (state.goldR || 0) - amount;
  else state.gold = (state.gold || 0) - amount;
}
function myItems() {
  if (isNetCoopGuest()) return state.itemsR || (state.itemsR = []);
  return state.items || (state.items = []);
}

// ─── REWARD POOL (Phase C-2) ────────────────────────
// Pool for the "new skill" reward slot. Includes:
//   1) Current class's unequipped skills (since starting kit = 1 skill only)
//   2) Common skills not yet equipped
//   3) Rare skills not yet equipped
// Returns skills the player can still learn (not currently equipped).
// Phase D-4: RARE skills are gated behind elite/challenge rewards. By default
// (combat room rewards), RARE is excluded so the common pool stays predictable.
// Elite reward calls this with includeRare=true; challenge has its own builder.
function getAvailableNewSkills(opts) {
  opts = opts || {};
  const includeRare = !!opts.includeRare;
  const owned = new Set();
  getOwnedSkills().forEach(function (s) { owned.add(s.en); });
  // Phase E-3: in coop mode, P2's equipped skills are also "owned"
  if (state.coopMode) {
    (state.equippedSkillsR || []).forEach(function (s) { owned.add(s.en); });
  }
  const pool = [];
  // 1) Current class skills not yet equipped (highest priority for variety)
  const c = CLASSES[state.heroL];
  if (c) c.skills.forEach(function (s) { if (!owned.has(s.en)) pool.push(s); });
  // Phase E-3: also P2's class skills in coop
  if (state.coopMode && state.heroR && state.heroR !== state.heroL) {
    const cR = CLASSES[state.heroR];
    if (cR) cR.skills.forEach(function (s) { if (!owned.has(s.en)) pool.push(s); });
  }
  // 2) Phase E-2: unlocked word pack skills for the current class(es)
  getUnlockedPackSkillsForCurrentClass().forEach(function (s) {
    if (!owned.has(s.en)) pool.push(s);
  });
  // 3) Common pool
  COMMON_SKILLS.forEach(function (s) { if (!owned.has(s.en)) pool.push(s); });
  // 4) Rare pool — only when explicitly enabled (elite reward, shop, etc.)
  if (includeRare) {
    RARE_SKILLS.forEach(function (s) { if (!owned.has(s.en)) pool.push(s); });
  }
  return pool;
}

// Returns 1-3 reward cards based on context.
//   context = { isFirstStage: bool, forcedClassSkill: skillObj }
//
// First-run campaign tutorial (player has never beaten Stage 10):
//   Stage 1-3 → single fixed card = the class's next skill in catalog order
//     (Stage 1 → class.skills[1], Stage 2 → [2], Stage 3 → [3]).
//     This fills the 4-slot kit with the class's full kit before mixed rewards.
//   Stage 4+ → normal 3-card mixed rewards
//
// Repeat runs (Stage 10 cleared before):
//   All stages → normal 3-card mixed rewards (no forced cards)
//
// Dungeon: always normal 3-card rewards.
function buildRewards(context) {
  context = context || {};

  // ─── Forced class-skill card (first-run Stages 1-3) ───
  if (context.forcedClassSkill) {
    const sk = context.forcedClassSkill;
    return [{
      id: 'forced-class-skill',
      icon: '✨',
      title: sk.en.toUpperCase(),
      desc: sk.kr + ' · ' + getSkillEffectText(sk),
      skill: sk,
      apply: function (onDone) { equipOrSwapSkill(sk, onDone); },
    }];
  }

  // ─── Stage 1 (when NOT first-run forced) — fallback tutorial ───
  if (context.isFirstStage) {
    const available = getAvailableNewSkills();
    if (available.length > 0) {
      const tutorialSkill = available[Math.floor(Math.random() * available.length)];
      return [{
        id: 'tutorial-skill',
        icon: '✨',
        title: tutorialSkill.en.toUpperCase(),
        desc: tutorialSkill.kr + ' · ' + getSkillEffectText(tutorialSkill),
        skill: tutorialSkill,
        apply: function (onDone) { equipOrSwapSkill(tutorialSkill, onDone); },
      }];
    }
    return [{
      id: 'tutorial-heal',
      icon: '🩹',
      title: 'Full HP restore',
      desc: 'Fully restore HP',
      apply: function (onDone) {
        combat.playerHp = combat.playerMaxHp;
        spawnDamageNumber(combat.playerMaxHp, 'player', { tint: 'heal' });
        if (onDone) onDone();
      },
    }];
  }

  const cards = [];

  // === Slot 1: NEW SKILL ===
  const availableNew = getAvailableNewSkills();
  if (availableNew.length > 0) {
    const newSkill = availableNew[Math.floor(Math.random() * availableNew.length)];
    cards.push({
      id: 'new-skill',
      icon: '✨',
      title: newSkill.en.toUpperCase(),
      desc: newSkill.kr + ' · ' + getSkillEffectText(newSkill),
      skill: newSkill,
      apply: function (onDone) { equipOrSwapSkill(newSkill, onDone); },
    });
  }

  // === Slot 2: UPGRADE EXISTING SKILL ===
  const owned = getOwnedSkills();
  if (owned.length > 0) {
    const upTarget = owned[Math.floor(Math.random() * owned.length)];
    const curLevel = getSkillLevel(upTarget.en);
    cards.push({
      id: 'upgrade',
      icon: '⬆',
      title: upTarget.en.toUpperCase() + ' +1',
      desc: 'Lv.' + curLevel + ' → Lv.' + (curLevel + 1) + ' · effect +25%',
      skill: upTarget,
      apply: function (onDone) {
        upgradeSkill(upTarget.en);
        renderHeroes();
        if (onDone) onDone();
      },
    });
  }

  // === Slot 3: RANDOM UTILITY ===
  // (Phase C-3에서 'Training' next-buff 카드 제거: 아이템 시스템으로 대체됨)
  const utilOptions = [
    {
      id: 'gold-bag',
      icon: '💰',
      title: 'Gold Pouch',
      desc: '+30 Gold',
      apply: function (onDone) { addMyGold(30); if (onDone) onDone(); },
    },
    {
      id: 'heal-room',
      icon: '🩹',
      title: 'HP heal',
      desc: 'HP +30',
      apply: function (onDone) {
        const before = combat.playerHp;
        combat.playerHp = Math.min(combat.playerMaxHp, combat.playerHp + 30);
        spawnDamageNumber(combat.playerHp - before, 'player', { tint: 'heal' });
        if (onDone) onDone();
      },
    },
  ];
  cards.push(utilOptions[Math.floor(Math.random() * utilOptions.length)]);

  return cards;
}

// ─── EQUIP / SWAP UI (Phase C-2.1) ──────────────────
// If there's a free slot, equip directly. If all 4 slots full, open the swap
// modal so the player picks which equipped skill to discard.
//
//   skill   — new skill object to add
//   onDone  — optional callback fired AFTER the swap decision is finalized
//             (either swap completed or player declined). Use this to gate
//             stage-advance flow until the modal is dismissed.
// Phase E-4: which slot array should a reward go into?
//   - Solo: always state.equippedSkills (P1)
//   - Co-op:
//     * skill belongs to P2's class (class-skill) → P2 slots
//     * unlocked word pack with P2's classId → P2 slots
//     * everything else (P1 class, common, rare, P1 word pack) → P1 slots
//   - If the preferred slot is full and the other isn't, falls through to that
//     so we never reject a free slot.
function pickSlotForReward(skill) {
  if (!state.coopMode) return 'p1';
  // Default preference based on ownership
  let preferred = 'p1';
  // P2's class catalog
  if (state.heroR && CLASSES[state.heroR]) {
    const inP2Class = CLASSES[state.heroR].skills.some(function (s) { return s.en === skill.en; });
    if (inP2Class) preferred = 'p2';
  }
  // P1's class catalog stays p1 (default)
  // Word pack — match by pack.classId
  if (preferred === 'p1') {
    const packInfo = findPackForSkill(skill.en);
    if (packInfo && packInfo.pack.classId === state.heroR) preferred = 'p2';
  }
  // Fallback: if preferred is full but other has room, send it there
  const p1 = state.equippedSkills  || [];
  const p2 = state.equippedSkillsR || [];
  if (preferred === 'p1' && p1.length >= 4 && p2.length < 4) return 'p2';
  if (preferred === 'p2' && p2.length >= 4 && p1.length < 4) return 'p1';
  return preferred;
}

function equipOrSwapSkill(skill, onDone) {
  state.equippedSkills  = state.equippedSkills  || [];
  state.equippedSkillsR = state.equippedSkillsR || [];

  // Phase E-4: route to the right player slot in coop
  const slot = pickSlotForReward(skill);
  const target = (slot === 'p2') ? state.equippedSkillsR : state.equippedSkills;

  if (target.length < 4) {
    target.push(skill);
    saveDiscoveredSkill(skill.en);
    renderHeroes();
    if (onDone) onDone();
  } else {
    // Open swap modal — player selects which to discard.
    // Phase E-4: tell the modal which slot to show.
    showSwapSkillModal(skill, onDone, slot);
  }
}

// Phase F-6.3: force-equip to a specific slot regardless of routing.
// Used in net coop so guest-side rewards always go to P2 (heroR) slot.
function equipToSlot(skill, slot, onDone) {
  state.equippedSkills  = state.equippedSkills  || [];
  state.equippedSkillsR = state.equippedSkillsR || [];
  const target = (slot === 'p2') ? state.equippedSkillsR : state.equippedSkills;
  if (target.length < 4) {
    target.push(skill);
    saveDiscoveredSkill(skill.en);
    renderHeroes();
    if (onDone) onDone();
  } else {
    // Swap modal restricted to the right slot.
    showSwapSkillModal(skill, onDone, slot);
  }
}

// Phase F-6.3: wrap an arbitrary option list so that each apply() routes its
// equipOrSwapSkill / addGold to the GUEST (P2) slot/wallet. Used for the
// challenge + elite reward screens where opts come from inline closures.
function wrapOptsForGuestSlot(opts) {
  return opts.map(function (opt) {
    const orig = opt.apply;
    const sk = opt.skill || null;
    return Object.assign({}, opt, {
      apply: function (onDone) {
        if (sk) {
          equipToSlot(sk, 'p2', function () {
            // Original closures often also state.dungeonRoom++; we DON'T want
            // that here — checkBothPicksDone() advances the room when both
            // players have picked. Skip orig() entirely; just equip the skill.
            if (onDone) onDone();
          });
          return;
        }
        // Heal / gold variants: handle locally so we don't trigger the
        // original closure's room-advance code path either.
        if (/heal/i.test(opt.id || '')) {
          const before = combat.playerHp;
          combat.playerHp = Math.min(combat.playerMaxHp, combat.playerHp + 40);
          spawnDamageNumber(combat.playerHp - before, 'player', { tint: 'heal' });
          if (onDone) onDone();
          return;
        }
        if (/gold/i.test(opt.id || '')) {
          state.goldR = (state.goldR || 0) + 30;
          updateHud();
          if (onDone) onDone();
          return;
        }
        // Fallback — try original, but don't crash if it cascades.
        try { orig(function () { if (onDone) onDone(); }); }
        catch (e) { if (onDone) onDone(); }
      },
    });
  });
}

// Phase F-6.3: build a reward set from the GUEST's (P2) perspective.
// Temporarily swap P1↔P2 slots + class so buildRewards() sees the guest's
// situation; then re-wire each option.apply so it lands on the guest's slot.
function buildGuestRewards(context) {
  const origL  = state.heroL;
  const origP1 = state.equippedSkills;
  const origP2 = state.equippedSkillsR;
  state.heroL          = state.heroR;
  state.equippedSkills = state.equippedSkillsR || [];

  let opts;
  try {
    opts = buildRewards(context || {});
  } finally {
    state.heroL          = origL;
    state.equippedSkills = origP1;
    state.equippedSkillsR = origP2;
  }
  // Re-wire each option.apply so it lands on the GUEST's P2 slot.
  return opts.map(function (opt) {
    const orig = opt.apply;
    const sk = opt.skill || null;
    return Object.assign({}, opt, {
      apply: function (onDone) {
        if (sk && (opt.id === 'forced-class-skill' ||
                   opt.id === 'tutorial-skill'   ||
                   /^new-skill/.test(opt.id || '') ||
                   /^rare-/.test(opt.id || ''))) {
          equipToSlot(sk, 'p2', onDone);
          return;
        }
        if (opt.id === 'gold-bag') {
          state.goldR = (state.goldR || 0) + 30;
          updateHud();
          if (onDone) onDone();
          return;
        }
        if (opt.id === 'heal-room' || opt.id === 'tutorial-heal') {
          const before = combat.playerHp;
          combat.playerHp = Math.min(combat.playerMaxHp, combat.playerHp + 30);
          spawnDamageNumber(combat.playerHp - before, 'player', { tint: 'heal' });
          if (onDone) onDone();
          return;
        }
        try { orig(onDone); } catch (e) { if (onDone) onDone(); }
      },
    });
  });
}

// Pending swap state: { newSkill, onDone } when modal is open
let _pendingSwapSkill = null;
let _pendingSwapOnDone = null;

// Phase E-4: track which player's slots are being swapped (for coop)
let _pendingSwapSlot = 'p1';

function showSwapSkillModal(newSkill, onDone, slot) {
  _pendingSwapSkill = newSkill;
  _pendingSwapOnDone = onDone || null;
  _pendingSwapSlot = slot || 'p1';
  const modal = document.getElementById('swap-modal');
  if (!modal) { if (onDone) onDone(); return; }
  const list = document.getElementById('swap-list');
  if (!list) { if (onDone) onDone(); return; }
  // Header info: new skill name + effect summary
  // Phase E-4: in coop, prefix with which player this is for
  const slotLabel = (state.coopMode)
    ? '<div class="swap-slot-label ' + _pendingSwapSlot + '">' +
        (_pendingSwapSlot === 'p2' ? '👤 P2 · ' + CLASSES[state.heroR].nameKr
                                   : '👤 P1 · ' + CLASSES[state.heroL].nameKr) +
        ' slot</div>'
    : '';
  const newInfo = document.getElementById('swap-new-info');
  if (newInfo) {
    newInfo.innerHTML = slotLabel +
      '<div class="swap-new-row">' +
        '<img src="assets/icons/' + newSkill.icon + '.png" class="swap-new-icon"> ' +
        '<span class="swap-new-en">' + newSkill.en.toUpperCase() + '</span>' +
        '<span class="swap-new-kr">' + newSkill.kr + '</span>' +
      '</div>' +
      '<div class="swap-new-effect">' + getSkillEffectText(newSkill) + '</div>';
  }
  // Render the appropriate player's 4 slots as choices
  const target = (_pendingSwapSlot === 'p2') ? state.equippedSkillsR : state.equippedSkills;
  list.innerHTML = '';
  target.forEach(function (s) {
    const card = document.createElement('button');
    card.className = 'swap-slot';
    const lvl = getSkillLevel(s.en);
    const lvlBadge = lvl > 1 ? '<span class="swap-lvl">Lv' + lvl + '</span>' : '';
    card.innerHTML =
      '<img src="assets/icons/' + s.icon + '.png" class="swap-slot-icon">' +
      '<div class="swap-slot-en">' + s.en.toUpperCase() + '</div>' +
      '<div class="swap-slot-kr">' + s.kr + '</div>' +
      '<div class="swap-slot-effect">' + getSkillEffectText(s) + '</div>' +
      lvlBadge;
    card.addEventListener('click', function () {
      // Replace this slot with new skill in the right player's array.
      const idx = target.indexOf(s);
      if (idx >= 0) {
        target[idx] = newSkill;
        delete state.skillLevels[s.en];
      }
      saveDiscoveredSkill(newSkill.en);
      finalizeSwap();
    });
    list.appendChild(card);
  });
  modal.classList.remove('hidden');
}

function finalizeSwap() {
  const cb = _pendingSwapOnDone;
  _pendingSwapSkill = null;
  _pendingSwapOnDone = null;
  hideSwapSkillModal();
  renderHeroes();
  if (cb) cb();
}

function hideSwapSkillModal() {
  const modal = document.getElementById('swap-modal');
  if (modal) modal.classList.add('hidden');
}

// "Decline" button on swap modal — keep current kit, discard the new skill
function declineSwapSkill() {
  finalizeSwap();
}

// ─── Hero sprite sheet metadata (for idle animations) ──
const HERO_SPRITES = {
  mage:    { fw: 32, fh: 36, frames: 12, sheet_w: 384 },
  archer:  { fw: 30, fh: 34, frames: 12, sheet_w: 360 },
  knight:  { fw: 38, fh: 40, frames: 12, sheet_w: 456 },
  rogue:   { fw: 42, fh: 34, frames: 6,  sheet_w: 252 },
  priest:  { fw: 32, fh: 32, frames: 12, sheet_w: 384 },
  druid:   { fw: 32, fh: 32, frames: 6,  sheet_w: 192 },
  paladin: { fw: 32, fh: 32, frames: 6,  sheet_w: 192 },
  monk:    { fw: 32, fh: 32, frames: 6,  sheet_w: 192 },
};

// ─── DATA: Asset lists ───────────────────────────────
const ASSETS = {
  enemies: [
    // Fire enemies: chance to burn player
    { id: 'dragon',       name: 'Dragon',         kind: 'boss', element: 'fire',  appliesOnAttack: { status: 'burn',   chance: 0.4 } },
    { id: 'flamevil',     name: 'Fire Demon',      kind: 'boss', element: 'fire',  appliesOnAttack: { status: 'burn',   chance: 0.4 } },
    { id: 'candlesnake',  name: 'Candle Snake',         kind: 'boss', element: 'fire',  appliesOnAttack: { status: 'burn',   chance: 0.3 } },
    { id: 'baby_dragon',  name: 'Baby Dragon',    kind: 'mob',  element: 'fire',  appliesOnAttack: { status: 'burn',   chance: 0.25 } },
    // Dark enemies: chance to weaken player (Phase D-4: expanded mob pool)
    { id: 'centipede',    name: 'Centipede',           kind: 'boss', element: 'dark',  appliesOnAttack: { status: 'weaken', chance: 0.4 } },
    { id: 'hornheart',    name: 'Hornheart',         kind: 'boss', element: 'dark',  appliesOnAttack: { status: 'weaken', chance: 0.4 } },
    { id: 'mushroom',     name: 'Toadstool',         kind: 'mob',  element: 'dark',  appliesOnAttack: { status: 'weaken', chance: 0.3 } },
    { id: 'mimic',        name: 'Mimic',           kind: 'mob',  element: 'dark',  appliesOnAttack: { status: 'weaken', chance: 0.3 } },
    { id: 'mole',         name: 'Mole',    kind: 'mob',  element: 'dark',  appliesOnAttack: { status: 'weaken', chance: 0.25 } },
    { id: 'mutant',       name: 'Dark Mutant',  kind: 'mob',  element: 'dark',  appliesOnAttack: { status: 'weaken', chance: 0.25 } },
    // Water enemies: chance to freeze player (Phase D-4: expanded mob pool)
    { id: 'frog',         name: 'Frog',         kind: 'mob',  element: 'water', appliesOnAttack: { status: 'freeze', chance: 0.2 } },
    { id: 'fish',         name: 'Fish',         kind: 'mob',  element: 'water', appliesOnAttack: { status: 'freeze', chance: 0.2 } },
    { id: 'radish_plant', name: 'Water Plant',      kind: 'mob',  element: 'water', appliesOnAttack: { status: 'freeze', chance: 0.15 } },
    // Wind enemies
    { id: 'bamboo',       name: 'Bamboo Spirit',    kind: 'boss', element: 'wind' },
    { id: 'electric_bat', name: 'Electric Bat',      kind: 'boss', element: 'wind' },
    { id: 'bird',         name: 'Bird',             kind: 'mob',  element: 'wind' },
    // Neutral (no element)
    { id: 'golem',        name: 'Golem',           kind: 'boss', element: 'none' },
    { id: 'goblinboss',   name: 'Goblin King',      kind: 'boss', element: 'none' },
    { id: 'goblinball',   name: 'Goblin Ball',      kind: 'mob',  element: 'none' },
    { id: 'monkey',       name: 'Monkey',         kind: 'mob',  element: 'none' },
    { id: 'racoon',       name: 'Raccoon',         kind: 'mob',  element: 'none' },
    { id: 'golem_guard',  name: 'Golem Guard',      kind: 'mob',  element: 'none' },
  ],
  skies: [
    { id: 'gradient',  name: 'Clear Sky' },
    { id: 'cloud',     name: 'Clouds' },
    { id: 'cloud_far', name: 'Distant Clouds' },
    { id: 'flam',      name: 'Burning Sky' },
    { id: 'star',      name: 'Starry Night' },
  ],
  props: [
    { id: 'none',          name: 'None' },
    { id: 'forest',        name: 'Forest' },
    { id: 'mountain',      name: 'Mountain' },
    { id: 'mountain_dark', name: 'Dark Mountain' },
    { id: 'castle',        name: 'Castle' },
    { id: 'canyon',        name: 'Canyon' },
  ],
  bgs: [
    { id: 'bamboo_pink', name: 'Cherry Bamboo' },
    { id: 'bamboo',      name: 'Bamboo' },
    { id: 'bamboo_dark', name: 'Dark Bamboo' },
    { id: 'bamboo_snow', name: 'Snowy Bamboo' },
    { id: 'fir',         name: 'Fir' },
    { id: 'fir_pink',    name: 'Pink Fir' },
    { id: 'palm',        name: 'Palm Tree' },
    { id: 'palm_snow',   name: 'Snowy Palm' },
    { id: 'tree',        name: 'Tree' },
    { id: 'canyon',      name: 'Canyon' },
  ],
  floors: [
    { id: 'grass',              name: 'Grass' },
    { id: 'dirt_sand',          name: 'Sand' },
    { id: 'dirt_slabs',         name: 'Dirt Floor' },
    { id: 'checker_dirt',       name: 'Checker Dirt' },
    { id: 'dungeon',            name: 'Dungeon' },
    { id: 'checker_slabs_rock', name: 'Stone Floor' },
  ],
};

// ─── COMBAT TUNING ──────────────────────────────────
const TUNING = {
  playerMaxHp: 100,
  defaultCooldown: 1.5,
  bossHp: 150, bossAtk: 18, bossCharge: 10,
  mobHp:  60,  mobAtk:  10,  mobCharge:  8,
  skillDamage: (word) => Math.max(6, word.length * 3),
  critBaseChance: 0.10,        // 10% baseline crit chance
  critMultiplier: 1.5,         // crit deals 1.5x base damage
  comboResetTime: 6.0,         // seconds since last hit before combo resets
  comboBonus: (count) => {     // returns flat damage multiplier from combo
    if (count >= 10) return 1.5;
    if (count >= 7)  return 1.3;
    if (count >= 5)  return 1.2;
    if (count >= 3)  return 1.1;
    return 1.0;
  },
};

// ─── STATE ──────────────────────────────────────────
const state = {
  screen: 'main_menu',
  gameMode: null,
  campaignStage: 1,
  // Dungeon state
  dungeonFloor: 1,                // 1, 2, or 3
  dungeonRoom: 1,                 // current room within floor (1-7)
  dungeonNextEnemyBuff: 1.0,
  dungeonExtraSkills: [],         // array of skill objects (rare + common rewards)
  dungeonEnemySequence: [],       // pre-rolled enemy IDs for current floor
  dungeonRoomTypes: [],           // 'combat' | 'spring' | 'challenge' for each room
  dungeonEssenceEarned: 0,        // essence earned this run (rolled in on clear)
  // Phase C-2: run-scoped economy
  gold: 0,                        // resets per run (campaign or dungeon)
  skillLevels: {},                // skillEn → level (1, 2, 3, ...). +25% dmg per level above 1.
  // Phase C-2.1: equipped skills (start with 1, max 4 via rewards + swap UI)
  equippedSkills: [],             // P1 equipped skills (max 4)
  // Phase C-3: passive items (no slot limit, run-scoped)
  items: [],                      // array of item IDs (from PASSIVE_ITEMS)
  // Phase D-1: druid 'spell_growth' — cumulative max HP gain across the run
  druidGrowthBonus: 0,
  pendingHero: null,
  mode: 'solo',
  heroL: 'mage',
  heroR: 'knight',
  // Phase E-3: Co-op multiplayer
  coopMode: false,                // when true, both heroL and heroR are active
  equippedSkillsR: [],            // P2 equipped skills (max 4) when coopMode
  pendingHeroR: null,             // P2 selected class in class-select screen
  enemy: 'goblinboss',
  sky:   'gradient',
  props: 'forest',
  bg:    'bamboo_pink',
  floor: 'grass',
  typed: '',
};
const DEFAULT_STATE = { ...state };

const combat = {
  playerHp: 100,
  playerMaxHp: 100,            // modified by passive
  playerBarrierHp: 0,
  playerBarrierMax: 0,
  enemyHp: 0, enemyMaxHp: 0,
  enemyAtk: 0,
  enemyElement: 'none',
  charge: 0, chargeMax: 0,
  cooldowns: {},
  status: 'fighting',
  kills: 0,
  enemyStatuses: [],
  playerStatuses: [],
  combo: 0,
  comboLastHit: 0,             // performance.now() of last damaging hit
  firstHit: true,              // true until first damage hit on current enemy
  firstHitCount: 0,            // # of first-hit crits used so far (Rogue mastery)
  druidRegenAccum: 0,          // accumulator for druid passive regen
  // ── Phase D-1: redesigned class passive trackers ──
  lastSkillWord: null,         // rogue 'variety_combo' — track previous skill
  paladinSmiteReady: false,    // paladin 'heal_smite' — set true after heal
  guaranteedCritNext: false,   // Phase D-6: archer eye / rogue stab crit_next
};

// ─── INIT ───────────────────────────────────────────
function init() {
  SOUND.init();
  BGM.init();
  syncDevModeFromUrl(); // Phase D-5: ?dev=1 query → enable dev mode
  applyDevModeUI();    // Phase D-3: hide right panel etc. by default
  detectTouchDevice(); // Phase D-4: enable virtual keyboard on touch devices
  buildSelects();
  bindControls();
  bindTyping();
  bindButtons();
  buildClassSelect();
  bindClassSelect();
  bindMainMenu();
  bindCodexScreen();
  bindSwapModal();
  bindDungeonShop();
  resetBattle();
  render();
  showMainMenu();
  startGameLoop();

  // Phase F-1: bind room screen + check URL for room join
  bindRoomScreen();
  checkUrlForRoomJoin();
}

function bindSwapModal() {
  const decline = document.getElementById('swap-decline');
  if (decline) decline.addEventListener('click', declineSwapSkill);
}

// Returns the current room/role. Internal flag for ignoring our own
// "peer_left" echo after we voluntarily called leaveRoom.
let _suppressNextPeerLeft = false;

// ─── Phase F-1: Online Co-op / Room Screen ─────────────
// Server URL is auto-detected by net.js (localhost in dev, Railway in prod).
// To override: set window.TYPERPG_SERVER_URL before net.js loads.
let _netBound = false;

function showRoomScreen(viewName) {
  const ov = document.getElementById('room-screen');
  if (ov) ov.classList.remove('hidden');
  // Toggle which inner view is visible
  ['host', 'guest', 'error'].forEach(function (v) {
    const el = document.getElementById('room-view-' + v);
    if (el) el.hidden = (v !== viewName);
  });
}
function hideRoomScreen() {
  const ov = document.getElementById('room-screen');
  if (ov) ov.classList.add('hidden');
}
function setRoomStatus(view, text, klass) {
  const el = document.getElementById('room-status-' + view);
  if (!el) return;
  el.textContent = text;
  el.classList.remove('connected', 'error');
  if (klass) el.classList.add(klass);
}
function setRoomError(msg) {
  const el = document.getElementById('room-error-msg');
  if (el) el.textContent = msg;
  showRoomScreen('error');
}

// Connect & wire NET events once. Subsequent calls just ensure connect.
function ensureNetReady() {
  // net.js auto-detects the server URL (localhost vs Railway).
  if (!_netBound) {
    _netBound = true;
    NET.on('open',         function () { /* handlers below act on specific msgs */ });
    NET.on('close',        function () {
      // Only surface if we're actively in a room flow
      const ov = document.getElementById('room-screen');
      if (ov && !ov.classList.contains('hidden')) {
        setRoomError('Disconnected from server');
      }
    });
    NET.on('error', function (e) {
      console.warn('NET error:', e);
      const ov = document.getElementById('room-screen');
      if (ov && !ov.classList.contains('hidden')) {
        const reasons = {
          room_not_found: 'Room not found. Please check the code.',
          room_full:      'This room is already full',
          ws_error:       'Could not connect to the server. Please try again shortly.',
          not_connected:  'Disconnected from server',
        };
        setRoomError(reasons[e.reason] || ('Error: ' + e.reason));
      }
    });
    NET.on('room_created', function (e) {
      const codeEl = document.getElementById('room-code-display');
      if (codeEl) codeEl.textContent = e.roomCode;
      const url = window.location.origin + window.location.pathname + '?room=' + e.roomCode;
      const urlEl = document.getElementById('room-url-display');
      if (urlEl) urlEl.value = url;
      setRoomStatus('host', '⏳ Waiting for a friend...', null);
      showRoomScreen('host');
    });
    NET.on('room_joined', function (e) {
      const codeEl = document.getElementById('room-code-display-guest');
      if (codeEl) codeEl.textContent = e.roomCode;
      setRoomStatus('guest', '✓ Connected to host', 'connected');
      // Phase F-2: guest enters class select immediately; host already in the
      // room sees us via peer_joined and will transition there too.
      setTimeout(function () { startNetCoopClassSelect('guest'); }, 600);
    });
    NET.on('peer_joined', function () {
      setRoomStatus('host', '✓ A friend joined!', 'connected');
      // Phase F-2: host transitions to class select when partner joins.
      setTimeout(function () { startNetCoopClassSelect('host'); }, 600);
    });
    NET.on('peer_left', function (e) {
      // Ignore the server's echo when WE just left the room voluntarily (e.g.
      // host pressing "join via code" — we leave our own room and re-enter as guest).
      if (_suppressNextPeerLeft) {
        _suppressNextPeerLeft = false;
        return;
      }
      // If we're already in a game, return to main menu with an error overlay.
      handlePeerLeftDuringSession(e.reason);
    });
    // Phase F-2: gameplay payloads (class picks, start, etc.)
    NET.on('peer_message', function (e) {
      handleNetPayload(e.payload || {}, e.from);
    });
  }
  NET.connect();
}

// Host: create a room, show code + share URL.
function startOnlineCoopAsHost() {
  ensureNetReady();
  hideClassSelect();  // default-visible class-select must not bleed through
  // Wait for open then create
  const tryCreate = function () {
    if (NET.getState().connected) {
      NET.createRoom();
    } else {
      // Show status while waiting
      setRoomStatus('host', '🔌 Connecting to server...', null);
      showRoomScreen('host');
      const codeEl = document.getElementById('room-code-display');
      if (codeEl) codeEl.textContent = '------';
      const onOpen = function () {
        NET.off('open', onOpen);
        NET.createRoom();
      };
      NET.on('open', onOpen);
    }
  };
  tryCreate();
}

// Guest: join a room with code (from URL).
function startOnlineCoopAsGuest(code) {
  ensureNetReady();
  hideClassSelect();
  const codeEl = document.getElementById('room-code-display-guest');
  if (codeEl) codeEl.textContent = code;
  setRoomStatus('guest', '🔌 Connecting to server...', null);
  showRoomScreen('guest');
  const tryJoin = function () {
    if (NET.getState().connected) {
      NET.joinRoom(code);
    } else {
      const onOpen = function () {
        NET.off('open', onOpen);
        NET.joinRoom(code);
      };
      NET.on('open', onOpen);
    }
  };
  tryJoin();
}

function checkUrlForRoomJoin() {
  try {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room');
    if (code && /^[A-Z2-9]{4,8}$/i.test(code)) {
      hideMainMenu();
      startOnlineCoopAsGuest(code.toUpperCase());
    }
  } catch (e) { /* silent */ }
}

function bindRoomScreen() {
  const closeBtn = document.getElementById('room-close');
  if (closeBtn) closeBtn.addEventListener('click', function () {
    NET.leaveRoom();
    hideRoomScreen();
    showMainMenu();
  });
  const backBtn = document.getElementById('room-back-btn');
  if (backBtn) backBtn.addEventListener('click', function () {
    NET.leaveRoom();
    hideRoomScreen();
    // Strip ?room=... from URL so reload doesn't re-join
    try {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    } catch (e) {}
    showMainMenu();
  });
  const copyBtn = document.getElementById('room-copy-btn');
  if (copyBtn) copyBtn.addEventListener('click', function () {
    const urlEl = document.getElementById('room-url-display');
    if (!urlEl) return;
    urlEl.select();
    try {
      navigator.clipboard.writeText(urlEl.value).then(function () {
        copyBtn.textContent = '✓ Copied';
        copyBtn.classList.add('copied');
        setTimeout(function () {
          copyBtn.textContent = '📋 Copy';
          copyBtn.classList.remove('copied');
        }, 1500);
      });
    } catch (e) {
      // Fallback for browsers without clipboard API
      try { document.execCommand('copy'); } catch (e2) {}
    }
  });

  // Phase F-1.1: manual code entry — allows joining when only the code (not URL) was shared.
  const joinInput = document.getElementById('room-join-input');
  const joinBtn   = document.getElementById('room-join-btn');
  const joinError = document.getElementById('room-join-error');

  function showJoinError(msg) {
    if (joinError) {
      joinError.textContent = msg;
      joinError.hidden = false;
    }
  }
  function clearJoinError() {
    if (joinError) joinError.hidden = true;
  }

  function attemptJoin() {
    if (!joinInput) return;
    const code = (joinInput.value || '').trim().toUpperCase();
    clearJoinError();
    if (code.length !== 6) {
      showJoinError('Enter the 6-digit code');
      return;
    }
    if (!/^[A-Z2-9]+$/.test(code)) {
      showJoinError('Invalid characters (letters/numbers only)');
      return;
    }
    // Leave our own room first (we were the host showing our code), then join the
    // partner's room as guest. The NET module will fire 'room_joined' on success
    // or 'error' (room_not_found / room_full) on failure. The server will echo a
    // peer_left back to us when we voluntarily leave — suppress that.
    _suppressNextPeerLeft = true;
    NET.leaveRoom();
    startOnlineCoopAsGuest(code);
  }

  if (joinInput) {
    // Force uppercase and only allowed chars as the user types
    joinInput.addEventListener('input', function () {
      const raw = joinInput.value || '';
      const filtered = raw.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
      if (filtered !== raw) joinInput.value = filtered;
      clearJoinError();
      // Auto-submit when 6 chars typed (feels snappier on mobile)
      if (filtered.length === 6) attemptJoin();
    });
    joinInput.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); attemptJoin(); }
    });
  }
  if (joinBtn) joinBtn.addEventListener('click', attemptJoin);
}

// ─── Phase F-2: Online Co-op session state ─────────────
// 'host' or 'guest' once we're in a net co-op session. null otherwise.
let _netRole = null;
// What classes each side has picked in the current room (synced via net).
let _netHostHero  = null;
let _netGuestHero = null;
// Did the guest signal ready? (host needs both ready to start)
let _netGuestReady = false;
// Are we currently in an active net co-op game? (vs just lobby/class select)
let _netInGame = false;

function isNetCoop()        { return _netRole !== null; }
function isNetCoopHost()    { return _netRole === 'host'; }
function isNetCoopGuest()   { return _netRole === 'guest'; }

// Entry point after both peers joined the room: hide room screen, jump to a
// special class-select state where each side picks their OWN class only.
function startNetCoopClassSelect(role) {
  _netRole = role;
  _netHostHero = null;
  _netGuestHero = null;
  _netGuestReady = false;
  _netInGame = false;

  hideRoomScreen();
  hideMainMenu();

  // Reuse the existing co-op class-select flow but mark it as networked so
  // selectClassCard() restricts each player to their own slot only.
  state.gameMode = 'dungeon';
  state.coopMode = true;
  state.gold = 0;
  state.goldR = 0;
  state.skillLevels = {};
  state.equippedSkills = [];
  state.equippedSkillsR = [];
  state.items = [];
  state.itemsR = [];
  state.druidGrowthBonus = 0;
  state.dungeonExtraSkills = [];
  state.pendingHero = null;
  state.pendingHeroR = null;

  showClassSelect();
  refreshClassSelectUI();
  // Help text + start-button label is handled inside refreshClassSelectUI()
  // when isNetCoop() is true (see updates below).
}

// Apply remote selection (called from peer_message handler).
function applyRemoteClassPick(senderRole, classId) {
  if (senderRole === 'host') {
    _netHostHero = classId;
    state.pendingHero = classId;
  } else if (senderRole === 'guest') {
    _netGuestHero = classId;
    state.pendingHeroR = classId;
  }
  refreshClassSelectUI();
}

// Receive a game-start broadcast from the host. Guest applies the chosen
// classes + dungeon and enters battle in lockstep.
function applyNetGameStart(payload) {
  // The host has already authored the dungeon, so we honor whatever it sends.
  state.pendingHero  = payload.heroL;
  state.pendingHeroR = payload.heroR;
  _netHostHero  = payload.heroL;
  _netGuestHero = payload.heroR;
  // Commit class picks + initialize equipped skills exactly like cs-start-btn would.
  state.heroL = payload.heroL;
  state.heroR = payload.heroR;
  state.pendingHero = null;
  state.pendingHeroR = null;
  state.mode = 'coop';
  combat.kills = 0;
  discoverClassSkills(state.heroL);
  discoverClassSkills(state.heroR);
  state.equippedSkills  = [CLASSES[state.heroL].skills[0]];
  state.equippedSkillsR = [CLASSES[state.heroR].skills[0]];

  // Reseed Math.random with the host's seed so future calls (e.g. local
  // re-rolls) line up. This is a best-effort: F-2 doesn't yet sync runtime
  // randomness, but seeding the dungeon layout below is what matters.
  _netRunSeed = payload.seed || 0;

  // Replay the dungeon setup using the synced layout.
  applyNetDungeonLayout(payload.dungeon);

  resetBattle();
  render();
  hideClassSelect();
  _netInGame = true;
}

// Host: build a dungeon, then broadcast it + chosen classes, then start locally.
function startNetCoopGame() {
  if (!isNetCoopHost()) return;
  if (!_netHostHero || !_netGuestHero) return;

  state.heroL = _netHostHero;
  state.heroR = _netGuestHero;
  state.pendingHero = null;
  state.pendingHeroR = null;
  state.mode = 'coop';
  combat.kills = 0;
  discoverClassSkills(state.heroL);
  discoverClassSkills(state.heroR);
  state.equippedSkills  = [CLASSES[state.heroL].skills[0]];
  state.equippedSkillsR = [CLASSES[state.heroR].skills[0]];

  // Author the dungeon now (single source of truth = host).
  startDungeon();
  const layout = captureNetDungeonLayout();
  _netRunSeed = Math.floor(Math.random() * 0x7fffffff);

  // Broadcast to guest.
  NET.send({
    kind: 'game_start',
    heroL: state.heroL,
    heroR: state.heroR,
    seed:  _netRunSeed,
    dungeon: layout,
  });

  resetBattle();
  render();
  hideClassSelect();
  _netInGame = true;
}

// Capture the live dungeon shape so the guest can recreate it exactly.
function captureNetDungeonLayout() {
  return {
    floor:        state.dungeonFloor,
    room:         state.dungeonRoom,
    roomTypes:    (state.dungeonRoomTypes || []).slice(),
    enemy:        state.enemy,
    sky:          state.sky,
    props:        state.props,
    bg:           state.bg,
    floorAsset:   state.floor,
  };
}
function applyNetDungeonLayout(layout) {
  if (!layout) return;
  state.gameMode = 'dungeon';
  state.dungeonFloor     = layout.floor || 1;
  state.dungeonRoom      = layout.room  || 1;
  state.dungeonRoomTypes = (layout.roomTypes || []).slice();
  state.enemy = layout.enemy;
  state.sky   = layout.sky;
  state.props = layout.props;
  state.bg    = layout.bg;
  state.floor = layout.floorAsset;
}

// Dispatch a payload received from the peer.
function handleNetPayload(payload, fromRole) {
  if (!payload || typeof payload !== 'object') return;
  switch (payload.kind) {
    case 'class_pick':
      applyRemoteClassPick(fromRole, payload.classId);
      break;
    case 'guest_ready':
      _netGuestReady = !!payload.ready;
      refreshClassSelectUI();
      break;
    case 'game_start':
      if (isNetCoopGuest()) applyNetGameStart(payload);
      break;
    // Phase F-3: ongoing gameplay sync
    case 'state':
      applyNetState(payload.state || {});
      break;
    case 'event':
      applyNetEvent(payload.event || {});
      break;
    case 'input':
      applyNetInput(payload.word, fromRole);
      break;
    // Phase F-4: reward + room transitions
    case 'reward_show':
      applyNetRewardShow(payload);
      break;
    case 'reward_pick':
      applyNetRewardPick(payload.index);
      break;
    case 'reward_close':
      applyNetRewardClose();
      break;
    case 'room_enter':
      applyNetRoomEnter(payload.layout);
      break;
    // Phase F-5
    case 'end_screen':
      applyNetEndScreen(payload.endKind, payload.payload || {});
      break;
    case 'shop_open':
      applyNetShopOpen(payload);
      break;
    case 'shop_close':
      applyNetShopClose();
      break;
    case 'shop_refresh':
      applyNetShopRefresh(payload);
      break;
    case 'shop_buy':
      applyNetShopBuy(payload.offerIdx);
      break;
    case 'shop_leave':
      applyNetShopGuestLeave();
      break;
  }
}

// Bail out if the peer leaves mid-session.
function handlePeerLeftDuringSession(reason) {
  if (_netInGame || isNetCoop()) {
    _netRole = null;
    _netInGame = false;
    // Reset co-op state so leftover hero data doesn't leak into next run.
    state.coopMode = false;
    hideClassSelect();
    setRoomError('Your partner left (' + (reason || 'disconnect') + ')');
  } else {
    setRoomError('Your partner left (' + (reason || 'disconnect') + ')');
  }
}

// Host-only run seed (kept for future F-3 RNG sync).
let _netRunSeed = 0;

// Phase F-4: reward + room transition sync
// Phase F-6.3: each player picks their OWN reward (different options + slots).
// Host caches both players' option lists.
let _netRewardOptionsHost  = null;   // host's own options (P1 slot)
let _netRewardOptionsGuest = null;   // guest's options (P2 slot)
let _netRewardPickedHost   = false;  // host done choosing?
let _netRewardPickedGuest  = false;  // guest done choosing?
let _netRewardKind = null;           // 'normal' | 'challenge' | 'elite' | 'shop'

// Legacy alias for older callers (single-shared pool model).
// Kept so we don't have to chase down every reference; host paths now use
// _netRewardOptionsHost directly.
let _netRewardOptions = null;

// Convert a reward-option object to a wire-safe summary.
function serializeRewardOption(opt) {
  return {
    id: opt.id || null,
    icon: opt.icon || '',
    title: opt.title || '',
    desc: opt.desc || '',
    skillEn: opt.skill && opt.skill.en,
    skillKr: opt.skill && opt.skill.kr,
    skillIcon: opt.skill && opt.skill.icon,
    isDiscover: !!opt.isDiscover,
  };
}

// Host: broadcast a reward screen to the guest. Two option lists — one for
// each side. Host renders its own list; guest renders the guest list. Each
// side applies the picked option to THEIR own slot only.
function broadcastRewardScreen(kind, hostOpts, guestOpts) {
  if (!isNetCoopHost() || !_netInGame) return;
  _netRewardOptionsHost  = hostOpts;
  _netRewardOptionsGuest = guestOpts;
  _netRewardPickedHost   = false;
  _netRewardPickedGuest  = false;
  _netRewardKind = kind;
  _netRewardOptions = hostOpts;  // legacy
  NET.send({
    kind: 'reward_show',
    rewardKind: kind,
    options: (guestOpts || []).map(serializeRewardOption),
  });
}

// Guest: render the reward screen using only the serialized data.
function applyNetRewardShow(payload) {
  if (!isNetCoopGuest()) return;
  state.screen = 'reward';
  try { playReward(); } catch (e) {}
  const ov = document.getElementById('reward-screen');
  if (!ov) return;
  const titleEl = ov.querySelector('.rw-title');
  const subEl   = ov.querySelector('.rw-subtitle');
  if (titleEl && subEl) {
    if (payload.rewardKind === 'challenge') {
      titleEl.textContent = 'CHALLENGE COMPLETE';
      subEl.textContent   = 'My reward: choose from 2 rare skills (P2 slot)';
    } else if (payload.rewardKind === 'elite') {
      titleEl.textContent = 'ELITE DEFEATED';
      subEl.textContent   = 'My reward: upgrade (P2 slot)';
    } else {
      titleEl.textContent = 'VICTORY';
      subEl.textContent   = 'Choose your reward (P2 slot)';
    }
  }
  const list = document.getElementById('reward-options');
  if (!list) return;
  list.innerHTML = '';
  (payload.options || []).forEach(function (opt, idx) {
    const card = document.createElement('button');
    card.className = 'reward-card reward-' + (opt.id || 'sync') +
                     (opt.isDiscover ? ' reward-discover' : '');
    card.innerHTML =
      '<div class="rc-icon">' + (opt.icon || '✨') + '</div>' +
      '<div class="rc-title">' + opt.title + '</div>' +
      '<div class="rc-desc">' + opt.desc + '</div>';
    card.addEventListener('click', function () {
      // Guest picks: tell host to apply this index to P2 slot.
      NET.send({ kind: 'reward_pick', index: idx });
      list.querySelectorAll('.reward-card').forEach(function (c) { c.disabled = true; });
      // Show "waiting for partner" hint
      showWaitingForPartner();
    });
    list.appendChild(card);
  });
  ov.classList.remove('hidden');
}

// Show a small "waiting for partner..." indicator on the reward screen.
function showWaitingForPartner() {
  let hint = document.getElementById('rw-waiting');
  const list = document.getElementById('reward-options');
  if (!hint && list) {
    hint = document.createElement('div');
    hint.id = 'rw-waiting';
    hint.className = 'rw-waiting';
    hint.textContent = '⏳ Waiting for friend’s pick...';
    list.parentNode.appendChild(hint);
  }
  if (hint) hint.style.display = 'block';
}
function hideWaitingForPartner() {
  const hint = document.getElementById('rw-waiting');
  if (hint) hint.style.display = 'none';
}

// Host: receive a guest reward pick, apply to P2 slot only.
function applyNetRewardPick(idx) {
  if (!isNetCoopHost()) return;
  if (_netRewardPickedGuest) return;  // already picked
  if (!_netRewardOptionsGuest) return;
  const opt = _netRewardOptionsGuest[idx];
  if (!opt) return;
  // Apply to P2 slot
  _netRewardPickedGuest = true;
  try { opt.apply(checkBothPicksDone); }
  catch (e) { console.warn('guest opt.apply failed', e); checkBothPicksDone(); }
}

// Host: shared entry for applying HOST's own reward.
// Mirrors the click handler inside showRewardScreen() but coordinates with
// guest pick so both must complete before we advance to the next room.
function invokeHostRewardOption(opt) {
  if (_netRewardPickedHost) return;
  state.dungeonNextEnemyBuff = 1.0;
  _netRewardPickedHost = true;
  // Apply HOST-side option (to P1 slot).
  try { opt.apply(function () {
    // After host applies, if guest still hasn't picked, keep reward screen up
    // but disable cards + show waiting hint. Once both picks done,
    // checkBothPicksDone hides the screen.
    const list = document.getElementById('reward-options');
    if (list) {
      list.querySelectorAll('.reward-card').forEach(function (c) { c.disabled = true; });
    }
    if (!_netRewardPickedGuest) showWaitingForPartner();
    checkBothPicksDone();
  }); }
  catch (e) { console.warn('host opt.apply failed', e); checkBothPicksDone(); }
}

// Check whether both players have made their pick; if so, advance the room.
function checkBothPicksDone() {
  if (!isNetCoopHost()) return;
  if (!(_netRewardPickedHost && _netRewardPickedGuest)) return;
  // Both done — advance.
  _netRewardOptionsHost  = null;
  _netRewardOptionsGuest = null;
  _netRewardOptions = null;
  hideWaitingForPartner();
  hideRewardScreen();
  // Tell guest to close their reward screen.
  NET.send({ kind: 'reward_close' });
  state.dungeonRoom++;
  applyDungeonRoom(state.dungeonRoom);
  resetBattle();
  render();
  broadcastRoomEnter();
}

// Host: when the room layout changes (next room / new floor), tell the guest.
function broadcastRoomEnter() {
  if (!isNetCoopHost() || !_netInGame) return;
  NET.send({ kind: 'room_enter', layout: captureNetDungeonLayout() });
}

// Guest: apply a new room layout from the host (re-render scene + reset HUD).
function applyNetRoomEnter(layout) {
  if (!isNetCoopGuest()) return;
  applyNetDungeonLayout(layout);
  // Hide any leftover reward screen first
  try { hideRewardScreen(); } catch (e) {}
  // Re-render the stage with the new assets.
  try { renderStage(); } catch (e) {}
  try { renderHeroes(); } catch (e) {}
  try { updateHud(); } catch (e) {}
}

// Guest: host signalled the reward screen should close (someone picked).
function applyNetRewardClose() {
  if (!isNetCoopGuest()) return;
  try { hideRewardScreen(); } catch (e) {}
}

// ─── Phase F-5: end-of-run screen sync ────────────
// Host broadcasts when a clear/floor/defeat screen appears so the guest sees
// the same outcome (instead of a stale battle frame).
function broadcastEndScreen(kind, payload) {
  if (!isNetCoopHost() || !_netInGame) return;
  NET.send({ kind: 'end_screen', endKind: kind, payload: payload || {} });
}
function applyNetEndScreen(endKind, payload) {
  if (!isNetCoopGuest()) return;
  // Guests see a simplified mirror: show the same overlay but with passive
  // copy ("Host is viewing"), and a "To main menu" button so they can
  // exit at any time. Either side closing the net session ends the run.
  switch (endKind) {
    case 'dungeon_clear': {
      const ov = document.getElementById('dungeon-clear-screen');
      if (!ov) return;
      ov.classList.remove('hidden');
      const titleEl = ov.querySelector('.dc-title');
      const subEl   = ov.querySelector('.dc-subtitle');
      if (titleEl) titleEl.textContent = payload.title || 'Clear!';
      if (subEl)   subEl.textContent   = '🤝 Co-op Clear · ' + (payload.subtitle || '');
      state.screen = 'ending';
      break;
    }
    case 'floor_clear': {
      const ov = document.getElementById('floor-clear-screen');
      if (!ov) return;
      ov.classList.remove('hidden');
      state.screen = 'ending';
      break;
    }
    case 'defeat': {
      // Host went down; show overlay locally too.
      try { showOverlay('defeat'); } catch (e) {}
      break;
    }
  }
}

// ─── Phase F-5: shop sync (read-only mirror on guest) ────
// ─── Phase F-6.4: net co-op shop sync ─────────────────
// Host builds offers for BOTH players. Host renders its own; the guest's
// list is serialized and pushed via 'shop_open'. The guest renders a real
// shop UI (not a passive overlay) and sends shop_buy / shop_leave back.
// Both players must press leave before we advance to the next room.
let _netShopOffersHost  = null;  // host's own live offers (with closures)
let _netShopOffersGuest = null;  // guest's live offers (closures for P2 apply)
let _netShopHostLeft  = false;
let _netShopGuestLeft = false;

function serializeShopOffer(off) {
  return {
    id: off.id,
    icon: off.icon,
    title: off.title,
    desc: off.desc,
    price: off.price,
    available: !!off.available,
  };
}

function broadcastShopOpen() {
  if (!isNetCoopHost() || !_netInGame) return;
  // _netShopOffersGuest is set by showDungeonShop before this is called.
  NET.send({
    kind: 'shop_open',
    offers: (_netShopOffersGuest || []).map(serializeShopOffer),
    goldR: state.goldR || 0,
  });
}
function broadcastShopClose() {
  if (!isNetCoopHost() || !_netInGame) return;
  NET.send({ kind: 'shop_close' });
}
// Host pushes the guest's gold after a guest purchase so guest sees their new balance.
function broadcastShopRefresh() {
  if (!isNetCoopHost() || !_netInGame) return;
  NET.send({
    kind: 'shop_refresh',
    offers: (_netShopOffersGuest || []).map(serializeShopOffer),
    goldR: state.goldR || 0,
  });
}

// Guest: render a real shop UI from the serialized offer list.
function applyNetShopOpen(payload) {
  if (!isNetCoopGuest()) return;
  state.goldR = payload.goldR || 0;
  _netShopGuestLeft = false;
  // Hide any lingering passive overlay (from earlier sessions / aborted shops).
  const npo = document.getElementById('net-passive-overlay');
  if (npo) npo.classList.add('hidden');
  renderGuestShop(payload.offers || []);
  const ov = document.getElementById('dshop-screen');
  if (ov) ov.classList.remove('hidden');
  state.screen = 'shop';
}
function applyNetShopRefresh(payload) {
  if (!isNetCoopGuest()) return;
  state.goldR = payload.goldR || 0;
  renderGuestShop(payload.offers || []);
}
function applyNetShopClose() {
  if (!isNetCoopGuest()) return;
  hideDungeonShop();
  // Also dismiss the old "host browsing" passive overlay if it was up.
  const npo = document.getElementById('net-passive-overlay');
  if (npo) npo.classList.add('hidden');
}

// Render the guest-side shop UI using serialized offers.
function renderGuestShop(offers) {
  const goldEl = document.getElementById('dshop-gold');
  if (goldEl) goldEl.textContent = state.goldR || 0;
  const list = document.getElementById('dshop-list');
  if (!list) return;
  list.innerHTML = '';
  offers.forEach(function (offer, idx) {
    const canAfford = (state.goldR || 0) >= offer.price;
    const buyable = offer.available && canAfford;
    const card = document.createElement('div');
    card.className = 'dshop-card' + (buyable ? '' : ' dshop-disabled');
    card.innerHTML =
      '<div class="dshop-card-icon">' + offer.icon + '</div>' +
      '<div class="dshop-card-info">' +
        '<div class="dshop-card-title">' + offer.title + '</div>' +
        '<div class="dshop-card-desc">' + offer.desc + '</div>' +
      '</div>' +
      '<button class="dshop-buy-btn' + (buyable ? '' : ' disabled') + '"' +
        (buyable ? '' : ' disabled') + '>' +
        '💰 ' + offer.price + (canAfford ? '' : ' (low)') +
      '</button>';
    if (buyable) {
      const btn = card.querySelector('.dshop-buy-btn');
      btn.addEventListener('click', function () {
        NET.send({ kind: 'shop_buy', offerIdx: idx });
        btn.disabled = true;
      });
    }
    list.appendChild(card);
  });
  // Show "waiting for partner" hint if guest has left but host hasn't.
  let hint = document.getElementById('dshop-waiting');
  if (_netShopGuestLeft && hint) hint.style.display = 'block';
  else if (hint) hint.style.display = 'none';
}

// Host: handle guest's purchase request.
function applyNetShopBuy(idx) {
  if (!isNetCoopHost()) return;
  if (!_netShopOffersGuest) return;
  const offer = _netShopOffersGuest[idx];
  if (!offer) return;
  if (!offer.available) return;
  if ((state.goldR || 0) < offer.price) return;
  state.goldR -= offer.price;
  try { if (offer.onBuy) offer.onBuy(); } catch (e) {}
  // Re-build guest offers (some items become unavailable after purchase).
  _netShopOffersGuest = buildShopOffersForSlot('p2');
  broadcastShopRefresh();
  updateHud();
}

// Host: handle guest pressing leave.
function applyNetShopGuestLeave() {
  if (!isNetCoopHost()) return;
  _netShopGuestLeft = true;
  // If host already left, advance both.
  if (_netShopHostLeft) finishNetShop();
}
function finishNetShop() {
  if (!isNetCoopHost()) return;
  _netShopOffersHost  = null;
  _netShopOffersGuest = null;
  _netShopHostLeft  = false;
  _netShopGuestLeft = false;
  hideDungeonShop();
  broadcastShopClose();
  state.dungeonRoom++;
  applyDungeonRoom(state.dungeonRoom);
  resetBattle();
  render();
  broadcastRoomEnter();
}

// ─── Phase F-3: gameplay state sync ────────────────────
// Broadcast at ~10 Hz. Higher rates waste bandwidth on a 2-player game.
const NET_BROADCAST_INTERVAL_S = 0.1;
let _netBroadcastAccum = 0;
// Track the last applied snapshot so we can detect HP drops on the guest
// side and trigger local hit-flash / damage-number effects.
let _netLastSnapshot = null;
// Damage event sequence number — host increments, guest dedupes.
let _netEventSeq = 0;
const _netSeenEventSeqs = new Set();

// Pack the current combat + dungeon state into a compact JSON payload.
function captureGameState() {
  return {
    // combat snapshot
    enemyHp:          combat.enemyHp,
    enemyMaxHp:       combat.enemyMaxHp,
    playerHp:         combat.playerHp,
    playerMaxHp:      combat.playerMaxHp,
    playerBarrierHp:  combat.playerBarrierHp || 0,
    playerBarrierMax: combat.playerBarrierMax || 0,
    charge:           combat.charge,
    chargeMax:        combat.chargeMax,
    combo:            combat.combo,
    cooldowns:        Object.assign({}, combat.cooldowns),
    enemyStatuses:    (combat.enemyStatuses || []).map(serializeStatus),
    playerStatuses:   (combat.playerStatuses || []).map(serializeStatus),
    status:           combat.status,
    kills:            combat.kills,
    firstHitCount:    combat.firstHitCount || 0,
    // dungeon progress
    dungeonFloor:     state.dungeonFloor,
    dungeonRoom:      state.dungeonRoom,
    // skill grants happened on the host (rewards) — sync the equipped arrays
    equippedSkills:   (state.equippedSkills  || []).slice(),
    equippedSkillsR:  (state.equippedSkillsR || []).slice(),
    // Phase F-6.2: separate gold + items per player
    gold:             state.gold  || 0,
    goldR:            state.goldR || 0,
    items:            (state.items  || []).slice(),
    itemsR:           (state.itemsR || []).slice(),
  };
}
function serializeStatus(s) {
  // Statuses contain { type, remaining, tickAccum, ... }. Plain object works.
  return { type: s.type, remaining: s.remaining, tickAccum: s.tickAccum || 0 };
}

// Host broadcasts the snapshot.
function broadcastGameState() {
  if (!isNetCoopHost() || !_netInGame) return;
  NET.send({ kind: 'state', state: captureGameState() });
}

// Host fires when a discrete event happens (skill cast, enemy attack landed,
// status applied, etc.). Used by the guest to play matching local effects.
function broadcastEvent(ev) {
  if (!isNetCoopHost() || !_netInGame) return;
  ev.seq = ++_netEventSeq;
  NET.send({ kind: 'event', event: ev });
}

// Guest applies a state snapshot to its local mirrors.
function applyNetState(snap) {
  if (!isNetCoopGuest()) return;
  // Cache previous values so we can light up damage numbers locally.
  const prev = _netLastSnapshot;

  combat.enemyHp          = snap.enemyHp;
  combat.enemyMaxHp       = snap.enemyMaxHp;
  combat.playerHp         = snap.playerHp;
  combat.playerMaxHp      = snap.playerMaxHp;
  combat.playerBarrierHp  = snap.playerBarrierHp || 0;
  combat.playerBarrierMax = snap.playerBarrierMax || 0;
  combat.charge           = snap.charge;
  combat.chargeMax        = snap.chargeMax;
  combat.combo            = snap.combo;
  combat.cooldowns        = Object.assign({}, snap.cooldowns || {});
  combat.enemyStatuses    = (snap.enemyStatuses  || []).map(function (s) { return Object.assign({}, s); });
  combat.playerStatuses   = (snap.playerStatuses || []).map(function (s) { return Object.assign({}, s); });
  combat.kills            = snap.kills;
  combat.firstHitCount    = snap.firstHitCount || 0;

  // Equipped skills can change mid-run (rewards on host).
  state.equippedSkills  = (snap.equippedSkills  || []).slice();
  state.equippedSkillsR = (snap.equippedSkillsR || []).slice();
  // Phase F-6.2: separate gold + items
  state.gold   = snap.gold  || 0;
  state.goldR  = snap.goldR || 0;
  state.items  = (snap.items  || []).slice();
  state.itemsR = (snap.itemsR || []).slice();

  // Visual: detect enemy/player HP drop → spawn local damage number + flash.
  // (Skip on first snapshot — prev is null.)
  if (prev) {
    const enemyDelta = prev.enemyHp - snap.enemyHp;
    if (enemyDelta > 0 && combat.status === 'fighting') {
      try { spawnDamageNumber(enemyDelta, 'enemy', { tint: 'crit' }); } catch (e) {}
      try { enemyHitFlash(); } catch (e) {}
    }
    const playerDelta = prev.playerHp - snap.playerHp;
    if (playerDelta > 0) {
      try { spawnDamageNumber(playerDelta, 'player', { tint: 'hit' }); } catch (e) {}
      try { playerHitFlash(); } catch (e) {}
    }
  }

  // Handle status transition: fighting → victory/defeat
  const wasStatus = combat.status;
  combat.status = snap.status;
  if (wasStatus === 'fighting' && snap.status === 'victory') {
    setTimeout(function () { renderHeroes(); updateHud(); }, 100);
  }

  // Dungeon progress (in case host advances room)
  if (snap.dungeonRoom !== state.dungeonRoom || snap.dungeonFloor !== state.dungeonFloor) {
    state.dungeonRoom  = snap.dungeonRoom;
    state.dungeonFloor = snap.dungeonFloor;
  }

  _netLastSnapshot = snap;
  updateHud();
}

// Apply a discrete event from the host (sound/effect cues, etc.)
function applyNetEvent(ev) {
  if (!isNetCoopGuest()) return;
  if (ev.seq != null) {
    if (_netSeenEventSeqs.has(ev.seq)) return;
    _netSeenEventSeqs.add(ev.seq);
    // Trim old seqs to avoid unbounded growth
    if (_netSeenEventSeqs.size > 500) {
      // Just clear it; sequence numbers only matter for short windows.
      _netSeenEventSeqs.clear();
    }
  }
  switch (ev.type) {
    case 'skill_cast':
      // Local SFX so the guest hears the spell going off too
      try { if (typeof SOUND !== 'undefined') SOUND.playSkill(); } catch (e) {}
      break;
    case 'enemy_attack':
      try { if (typeof SOUND !== 'undefined') SOUND.playEnemyAttack(); } catch (e) {}
      break;
    case 'victory':
      try { if (typeof SOUND !== 'undefined') SOUND.playVictory(); } catch (e) {}
      break;
    case 'defeat':
      try { if (typeof SOUND !== 'undefined') SOUND.playDefeat(); } catch (e) {}
      break;
  }
}

// Guest sends typing input to the host. The host validates + activates locally,
// then the next state snapshot reflects the result.
function sendNetInput(word) {
  if (!isNetCoopGuest()) return;
  NET.send({ kind: 'input', word: word });
}

// Host receives a guest input → activate the skill on the host side.
function applyNetInput(word, fromRole) {
  if (!isNetCoopHost()) return;
  if (fromRole !== 'guest') return;
  // Reuse the normal skill path. Cooldowns, ownership, and damage all flow
  // through getSkillOwnerClass() which already routes to heroR for P2 skills.
  if (combat.status !== 'fighting') return;
  activateSkill(word);
}


function bindMainMenu() {
  const campaignBtn = document.getElementById('mm-campaign');
  const freeplayBtn = document.getElementById('mm-freeplay');
  const continueBtn = document.getElementById('mm-continue');
  const dungeonBtn  = document.getElementById('mm-dungeon');
  const shopBtn     = document.getElementById('mm-shop');
  const resetBtn = document.getElementById('mm-reset-progress');

  if (campaignBtn) campaignBtn.addEventListener('click', function () {
    // Phase C-3.1: starting a fresh campaign discards any prior in-progress
    // save (player explicitly chose to restart instead of "Continue").
    clearCampaignRun();
    state.gameMode = 'campaign';
    state.campaignStage = 1;
    // Phase C-2: run-scoped economy resets
    state.gold = 0;
  state.goldR = 0;
    state.skillLevels = {};
    state.equippedSkills = [];
    state.items = [];                // Phase C-3
    state.druidGrowthBonus = 0;    // Phase D-1
    state.dungeonExtraSkills = []; // legacy
    hideMainMenu();
    showClassSelect();
  });
  if (continueBtn) continueBtn.addEventListener('click', function () {
    const saved = loadCampaignRun();
    if (!saved) return;
    // Restore full in-progress state — no class re-select, kit preserved.
    applyCampaignRun(saved);
    hideMainMenu();
    hideClassSelect();   // ensure default-visible class-select gets hidden
    // Skip class-select; jump straight into the saved stage.
    applyCampaignStage(state.campaignStage);
    resetBattle();
    render();
    if (state.gameMode === 'campaign') {
      showStageTutorial();
    }
  });
  // Phase F-7: dungeon continue — solo runs only.
  const dungeonContinueBtn = document.getElementById('mm-dungeon-continue');
  if (dungeonContinueBtn) dungeonContinueBtn.addEventListener('click', function () {
    const saved = loadDungeonRun();
    if (!saved) return;
    applyDungeonRun(saved);
    // Discover the player's class skills (they were already discovered in
    // the original run, but a no-op if so — keeps the codex consistent).
    discoverClassSkills(state.heroL);
    hideMainMenu();
    hideClassSelect();
    // Re-enter the saved room. applyDungeonRoom uses the saved sequence +
    // room types from state, so the layout is preserved exactly.
    applyDungeonRoom(state.dungeonRoom);
    resetBattle();
    state.screen = 'battle';
    render();
  });
  if (dungeonBtn) dungeonBtn.addEventListener('click', function () {
    // Phase F-7: starting a fresh dungeon discards any prior in-progress
    // save (player explicitly chose to restart instead of "Continue").
    clearDungeonRun();
    state.gameMode = 'dungeon';
    state.coopMode = false;        // E-3: solo by default
    // Phase C-2: run-scoped economy resets (mirror campaign handler)
    state.gold = 0;
  state.goldR = 0;
    state.skillLevels = {};
    state.equippedSkills = [];     // set on class confirm
    state.equippedSkillsR = [];    // E-3
    state.items = [];              // Phase C-3
    state.druidGrowthBonus = 0;    // Phase D-1
    state.dungeonExtraSkills = []; // legacy
    hideMainMenu();
    showClassSelect();
  });
  // Phase E-3: Co-op dungeon — same flow as dungeon but with coopMode flag
  const coopBtn = document.getElementById('mm-coop');
  if (coopBtn) coopBtn.addEventListener('click', function () {
    clearDungeonRun();              // Phase F-7: coop doesn't share save format
    state.gameMode = 'dungeon';
    state.coopMode = true;
    state.gold = 0;
  state.goldR = 0;
    state.skillLevels = {};
    state.equippedSkills = [];
    state.equippedSkillsR = [];
    state.items = [];
    state.itemsR = [];
    state.druidGrowthBonus = 0;
    state.dungeonExtraSkills = [];
    state.pendingHero = null;
    state.pendingHeroR = null;
    hideMainMenu();
    showClassSelect();
  });
  // Phase F-1: Online Co-op — open room screen, server creates room code.
  const coopOnlineBtn = document.getElementById('mm-coop-online');
  if (coopOnlineBtn) coopOnlineBtn.addEventListener('click', function () {
    hideMainMenu();
    startOnlineCoopAsHost();
  });
  // Phase E-1: 강화 Shop removed — no shop button binding.
  if (freeplayBtn) freeplayBtn.addEventListener('click', function () {
    state.gameMode = 'freeplay';
    state.coopMode = false;
    hideMainMenu();
    showClassSelect();
  });
  const codexBtn = document.getElementById('mm-codex');
  if (codexBtn) codexBtn.addEventListener('click', function () {
    showCodexScreen();
  });
  if (resetBtn) resetBtn.addEventListener('click', function () {
    if (confirm('Reset ALL campaign progress, dungeon clears, upgrades, skill codex, and your current game?')) {
      try {
        localStorage.removeItem('typerpg_max_stage');
        localStorage.removeItem('typerpg_dungeon_clears');
        localStorage.removeItem('typerpg_dungeon_depth');  // Phase C-5
        localStorage.removeItem('typerpg_meta');
        localStorage.removeItem('typerpg_codex');
        localStorage.removeItem('typerpg_campaign_save');  // Phase C-3.1
        localStorage.removeItem('typerpg_dungeon_save');   // Phase F-7
      } catch(e) {}
      updateMainMenuProgress();
    }
  });

  // Phase D-5: dev mode is now toggled via URL query (?dev=1 / ?dev=0).
  // The old in-menu toggle button has been removed.

  // Sound toggle (SFX)
  const soundBtn = document.getElementById('mm-sound-toggle');
  if (soundBtn) {
    const updateSoundLabel = function () {
      soundBtn.textContent = SOUND.enabled ? '🔊 SFX ON' : '🔇 SFX OFF';
    };
    updateSoundLabel();
    soundBtn.addEventListener('click', function () {
      SOUND.toggle();
      updateSoundLabel();
      if (SOUND.enabled) playClick();
    });
  }

  // BGM toggle (music)
  const bgmBtn = document.getElementById('mm-bgm-toggle');
  if (bgmBtn) {
    const updateBgmLabel = function () {
      bgmBtn.textContent = BGM.enabled ? '🎵 Music ON' : '🔕 Music OFF';
    };
    updateBgmLabel();
    bgmBtn.addEventListener('click', function () {
      BGM.toggle();
      updateBgmLabel();
      if (SOUND.enabled) playClick();
    });
  }

  // Phase D-7: game speed slider
  const speedSlider = document.getElementById('mm-speed-slider');
  const speedVal    = document.getElementById('mm-speed-val');
  if (speedSlider && speedVal) {
    const updateLabel = function () {
      const v = getGameSpeed();
      speedSlider.value = v;
      speedVal.textContent = v.toFixed(1) + '×';
    };
    updateLabel();
    speedSlider.addEventListener('input', function () {
      const v = parseFloat(speedSlider.value);
      setGameSpeed(v);
      speedVal.textContent = v.toFixed(1) + '×';
    });
  }
}

// ─── SKILL CODEX SCREEN ────────────────────────────
// Shows all 50 skills (32 class + 18 common), discovered vs locked.
// Filtered via tabs: all / class / common / discovered-only.
let _codexTab = 'all';   // 'all' | 'class' | 'common' | 'rare' | 'discovered'
let _codexClassFilter = 'all';  // Phase D-4: 'all' | classId — applies only on 'class' tab

function showCodexScreen() {
  const ov = document.getElementById('codex-screen');
  if (!ov) return;
  _codexTab = 'all';
  renderCodex();
  ov.classList.remove('hidden');
}
function hideCodexScreen() {
  const ov = document.getElementById('codex-screen');
  if (ov) ov.classList.add('hidden');
}

function renderCodex() {
  // Update tab active state (always do this so 'packs' tab visually highlights)
  document.querySelectorAll('.codex-tab').forEach(function (t) {
    t.classList.toggle('active', t.dataset.tab === _codexTab);
  });

  // Phase E-2: word pack tab uses a different layout (pack cards, not skill cards)
  if (_codexTab === 'packs') {
    renderCodexPacks();
    return;
  }
  // Phase E-5: titles/achievements tab
  if (_codexTab === 'titles') {
    renderCodexTitles();
    return;
  }

  // Build skill list with metadata
  const all = [];
  Object.keys(CLASSES).forEach(function (classId) {
    CLASSES[classId].skills.forEach(function (sk) {
      all.push({ skill: sk, source: 'class', classId: classId });
    });
  });
  COMMON_SKILLS.forEach(function (sk) {
    all.push({ skill: sk, source: 'common' });
  });
  RARE_SKILLS.forEach(function (sk) {
    all.push({ skill: sk, source: 'rare' });
  });

  // Update progress count (total of every skill in the catalog)
  const progEl = document.getElementById('codex-progress');
  if (progEl) {
    const discovered = all.filter(function (x) { return isDiscovered(x.skill.en); }).length;
    progEl.textContent = 'Discovered skills: ' + discovered + ' / ' + all.length;
  }

  // Apply tab filter
  let filtered = all;
  if (_codexTab === 'class')      filtered = all.filter(function (x) { return x.source === 'class'; });
  else if (_codexTab === 'common') filtered = all.filter(function (x) { return x.source === 'common'; });
  else if (_codexTab === 'rare')   filtered = all.filter(function (x) { return x.source === 'rare'; });
  else if (_codexTab === 'discovered') filtered = all.filter(function (x) { return isDiscovered(x.skill.en); });

  // Phase D-4: class-specific filter (only meaningful on the 'class' tab)
  if (_codexTab === 'class' && _codexClassFilter !== 'all') {
    filtered = filtered.filter(function (x) { return x.classId === _codexClassFilter; });
  }
  // Show/hide class dropdown based on active tab
  const dropdown = document.getElementById('codex-class-filter');
  if (dropdown) {
    dropdown.style.display = (_codexTab === 'class') ? 'inline-block' : 'none';
    dropdown.value = _codexClassFilter;
  }

  const grid = document.getElementById('codex-grid');
  if (!grid) return;
  grid.innerHTML = '';

  filtered.forEach(function (entry) {
    const sk = entry.skill;
    const found = isDiscovered(sk.en);
    const card = document.createElement('div');
    card.className = 'codex-card ' + (found ? 'discovered' : 'locked') + ' src-' + entry.source;

    const elementBadge = (sk.element && sk.element !== 'none')
      ? '<div class="cc-element">' + (ELEMENTS[sk.element] && ELEMENTS[sk.element].emoji || '') + '</div>'
      : '';
    const sourceLabel = entry.source === 'class' ? CLASSES[entry.classId].nameKr
                      : entry.source === 'rare'  ? '⭐ Rare'
                      : 'Common';
    const sourceBadge = '<div class="cc-source ' + entry.source + '">' + sourceLabel + '</div>';

    const iconImg = document.createElement('img');
    iconImg.className = 'cc-icon';
    iconImg.src = found ? 'assets/icons/' + sk.icon + '.png' : 'assets/icons/' + sk.icon + '.png';
    iconImg.alt = sk.en;

    card.innerHTML = elementBadge + sourceBadge;
    card.appendChild(iconImg);

    const en = document.createElement('div');
    en.className = 'cc-en';
    en.textContent = found ? sk.en.toUpperCase() : '???';
    card.appendChild(en);

    const kr = document.createElement('div');
    kr.className = 'cc-kr';
    kr.textContent = found ? sk.kr : '???';
    card.appendChild(kr);

    // Phase D-3: full effect description on discovered cards
    if (found) {
      const meta = document.createElement('div');
      meta.className = 'cc-meta';
      meta.textContent = getSkillEffectText(sk);
      card.appendChild(meta);
    } else {
      // Locked tease — show source category only
      const meta = document.createElement('div');
      meta.className = 'cc-meta cc-locked-hint';
      meta.textContent = 'Undiscovered';
      card.appendChild(meta);
    }

    grid.appendChild(card);
  });
}

// Phase E-2: render the 8 word packs as cards (not individual skill cards).
// Each card shows pack name, the 5 words, and unlock status.
function renderCodexPacks() {
  const progEl = document.getElementById('codex-progress');
  if (progEl) {
    const allPacks = Object.keys(WORD_PACKS);
    const unlocked = allPacks.filter(isPackUnlocked).length;
    progEl.textContent = 'Unlocked packs: ' + unlocked + ' / ' + allPacks.length;
  }
  // Hide class dropdown on this tab
  const dropdown = document.getElementById('codex-class-filter');
  if (dropdown) dropdown.style.display = 'none';

  const grid = document.getElementById('codex-grid');
  if (!grid) return;
  grid.innerHTML = '';

  Object.keys(WORD_PACKS).forEach(function (packId) {
    const pack = WORD_PACKS[packId];
    const unlocked = isPackUnlocked(packId) || isDevMode();
    const card = document.createElement('div');
    card.className = 'codex-pack-card ' + (unlocked ? 'unlocked' : 'locked');

    // Header
    const header = document.createElement('div');
    header.className = 'cpc-header';
    header.innerHTML =
      '<div class="cpc-emoji">' + pack.emoji + '</div>' +
      '<div class="cpc-title">' +
        '<div class="cpc-name">' + pack.nameKr + '</div>' +
        '<div class="cpc-desc">' + pack.descKr + '</div>' +
      '</div>';
    card.appendChild(header);

    // Word list (5 words)
    const wordList = document.createElement('div');
    wordList.className = 'cpc-words';
    pack.words.forEach(function (w) {
      const wEl = document.createElement('div');
      wEl.className = 'cpc-word';
      wEl.innerHTML =
        '<span class="cpc-word-en">' + (unlocked ? w.en : '???') + '</span>' +
        '<span class="cpc-word-kr">' + (unlocked ? w.kr : '???') + '</span>';
      wordList.appendChild(wEl);
    });
    card.appendChild(wordList);

    // Unlock hint or status
    const footer = document.createElement('div');
    footer.className = 'cpc-footer';
    if (unlocked) {
      footer.innerHTML = '<span class="cpc-status unlocked">✓ Unlocked</span>';
    } else {
      const u = pack.unlock;
      const className = CLASSES[u.class] ? CLASSES[u.class].nameKr : u.class;
      let cond = '';
      if (u.campaignStage) cond = className + ' — campaign Stage ' + u.campaignStage + ' Clear';
      else if (u.dungeonDepth) cond = className + ' — dungeon ' + u.dungeonDepth + 'F reached';
      footer.innerHTML = '<span class="cpc-status locked">🔒 ' + cond + '</span>';
    }
    card.appendChild(footer);

    grid.appendChild(card);
  });
}

// Phase E-5: render achievements/titles. Each card shows the title's icon,
// name, description, and earn status. Earned titles are clickable to "equip"
// them as the active title (appears next to character names in HUD).
function renderCodexTitles() {
  const allIds = Object.keys(ACHIEVEMENTS);
  const earned = loadEarnedAchievements();
  const active = loadActiveTitle();

  const progEl = document.getElementById('codex-progress');
  if (progEl) {
    progEl.textContent = 'Earned Titles: ' + earned.length + ' / ' + allIds.length;
  }
  // Hide class dropdown on this tab
  const dropdown = document.getElementById('codex-class-filter');
  if (dropdown) dropdown.style.display = 'none';

  const grid = document.getElementById('codex-grid');
  if (!grid) return;
  grid.innerHTML = '';

  allIds.forEach(function (id) {
    const a = ACHIEVEMENTS[id];
    const isEarned = earned.indexOf(id) !== -1 || isDevMode();
    const isActive = active === id;
    const card = document.createElement('div');
    card.className = 'codex-title-card ' +
      (isEarned ? 'earned' : 'locked') +
      (isActive ? ' active' : '');

    card.innerHTML =
      '<div class="ctc-icon">' + a.icon + '</div>' +
      '<div class="ctc-name">' + a.name + '</div>' +
      '<div class="ctc-desc">' + (isEarned ? a.desc : '???') + '</div>' +
      '<div class="ctc-title-text">' + (isEarned ? a.titleKr : '─') + '</div>' +
      (isEarned
        ? '<button class="ctc-equip' + (isActive ? ' active' : '') + '">' +
            (isActive ? '✓ Equipped' : 'Equip') +
          '</button>'
        : '<div class="ctc-locked-hint">🔒 Not earned</div>');

    if (isEarned) {
      const btn = card.querySelector('.ctc-equip');
      if (btn) btn.addEventListener('click', function () {
        if (isActive) {
          saveActiveTitle(null);  // unequip
        } else {
          saveActiveTitle(id);
        }
        renderCodexTitles();  // re-render to refresh active state
      });
    }
    grid.appendChild(card);
  });
}

function bindCodexScreen() {
  const closeBtn = document.getElementById('codex-close');
  if (closeBtn) closeBtn.addEventListener('click', hideCodexScreen);
  document.querySelectorAll('.codex-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      _codexTab = tab.dataset.tab;
      renderCodex();
    });
  });
  // Phase D-4: class filter dropdown
  const filter = document.getElementById('codex-class-filter');
  if (filter) filter.addEventListener('change', function () {
    _codexClassFilter = filter.value;
    renderCodex();
  });
  // ESC closes codex
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' &&
        !document.getElementById('codex-screen').classList.contains('hidden')) {
      hideCodexScreen();
    }
  });
}

// ─── META SHOP ──────────────────────────────────────
// Phase E-1: 강화 Shop fully removed. Stubs kept only in case dev code
// still references these names; they no-op. Class unlocks now happen via
// campaign progress (see checkClassUnlocks).
function showShopScreen()  { /* removed in E-1 */ }
function hideShopScreen()  { /* removed in E-1 */ }
function setShopTab(_tab)  { /* removed in E-1 */ }
function renderShop()      { /* removed in E-1 */ }

// ─── DEV MODE (Phase D-3) ───────────────────────────
// Hides the right-side controls panel, the Free Play menu button, and the
// skill codex menu button from end users. Toggle via "🛠️ Dev Mode" button
// at the bottom of the main menu. Persists via localStorage.
// ─── DEV MODE (Phase D-3, updated D-5) ──────────────
// Activated via URL query (?dev=1) — not via a button.
//   ?dev=1 → dev ON  (persists to localStorage)
//   ?dev=0 → dev OFF (clears localStorage)
//   no param → uses last saved localStorage value (default false)
//
// In dev mode:
//   • right-side controls panel is visible
//   • Free Play menu button is visible
//   • virtual keyboard shows even on desktop (for testing)
//   • the codex shows ALL skills as discovered (no "???" anywhere)
// ─── GAME SPEED (Phase D-7) ───────────────────────────
// User-tunable enemy charge speed. Slider goes 1.0× → 3.0× (5 stops).
// Default is 1.0× which is 1/3 the pre-D-7 charge rate (everyone said
// the old default was too fast). 3.0× recovers the old behavior.
//
// Only affects how fast the enemy charge meter decays. Status durations,
// skill cooldowns, and damage values are unchanged — those are driven by
// player input pace, not enemy difficulty.
const GAME_SPEED_STOPS = [1.0, 1.5, 2.0, 2.5, 3.0];
function getGameSpeed() {
  try {
    const v = parseFloat(localStorage.getItem('typerpg_game_speed'));
    if (!isNaN(v) && v >= 1.0 && v <= 3.0) return v;
  } catch (e) {}
  return 1.0;  // default
}
function setGameSpeed(v) {
  // Snap to nearest stop, clamp to [1, 3]
  v = Math.max(1.0, Math.min(3.0, v));
  try { localStorage.setItem('typerpg_game_speed', String(v)); }
  catch (e) {}
}
// Multiplier applied to enemy charge tick.
// gameSpeed=1.0 → factor 0.33 (slow, default); gameSpeed=3.0 → factor 1.0 (legacy).
function getGameSpeedFactor() {
  return getGameSpeed() / 3.0;
}

function isDevMode() {
  try { return localStorage.getItem('typerpg_dev_mode') === '1'; }
  catch (e) { return false; }
}
function setDevMode(on) {
  try { localStorage.setItem('typerpg_dev_mode', on ? '1' : '0'); }
  catch (e) {}
}
// D-5: read URL query and reconcile localStorage on page load.
function syncDevModeFromUrl() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.has('dev')) {
      const v = params.get('dev');
      setDevMode(v === '1' || v === 'true');
    }
  } catch (e) {}
}
// Apply the dev-mode CSS class on <body> so dev-only DOM nodes show/hide.
function applyDevModeUI() {
  if (isDevMode()) {
    document.body.classList.add('dev-mode-on');
  } else {
    document.body.classList.remove('dev-mode-on');
  }
}

function showMainMenu() {
  state.screen = 'main_menu';
  const ov = document.getElementById('main-menu-screen');
  if (ov) ov.classList.remove('hidden');
  updateMainMenuProgress();
  BGM.play('menu');
}

function hideMainMenu() {
  const ov = document.getElementById('main-menu-screen');
  if (ov) ov.classList.add('hidden');
}

function updateMainMenuProgress() {
  const maxStage = loadCampaignProgress();
  const savedRun = loadCampaignRun();
  const dungeonClears = loadDungeonClears();
  const progressEl = document.getElementById('mm-progress');
  const continueBtn = document.getElementById('mm-continue');
  const dungeonStatsEl = document.getElementById('mm-dungeon-stats');

  // Continue button — driven by saved RUN (not just max-stage). Shows
  // exactly which stage and class the in-progress run is on.
  if (savedRun) {
    const c = CLASSES[savedRun.heroL];
    const cname = c ? c.nameKr : savedRun.heroL;
    if (progressEl) {
      progressEl.textContent =
        'In progress: ' + cname + ' · Stage ' + savedRun.campaignStage + ' / ' + CAMPAIGN_STAGES.length;
    }
    if (continueBtn) {
      continueBtn.disabled = false;
      continueBtn.textContent =
        '▶ Continue (' + cname + ' Stage ' + savedRun.campaignStage + ')';
    }
  } else if (maxStage > 0) {
    // No active run, but player has finished the campaign before
    if (progressEl) {
      progressEl.textContent = 'Best progress: Stage ' + maxStage + ' / ' + CAMPAIGN_STAGES.length;
    }
    if (continueBtn) { continueBtn.disabled = true; continueBtn.textContent = 'No campaign in progress'; }
  } else {
    if (progressEl) progressEl.textContent = 'No campaign played yet';
    if (continueBtn) { continueBtn.disabled = true; continueBtn.textContent = 'Continue'; }
  }

  if (dungeonStatsEl) {
    const maxDepth = (typeof loadDungeonMaxDepth === 'function') ? loadDungeonMaxDepth() : 10;
    const lines = [];
    lines.push('🗺️ Unlocked Depth: ' + maxDepth + ' / ' + DUNGEON_MAX_DEPTH + 'F');
    if (dungeonClears > 0) {
      lines.push('🏆 Clear: ' + dungeonClears + '');
    }
    dungeonStatsEl.innerHTML = lines.join(' · ');
    dungeonStatsEl.style.display = 'block';
  }

  // Phase F-7: dungeon continue button — driven by typerpg_dungeon_save.
  const dungeonContinueBtn = document.getElementById('mm-dungeon-continue');
  if (dungeonContinueBtn) {
    const savedDungeon = loadDungeonRun();
    if (savedDungeon) {
      const c = CLASSES[savedDungeon.heroL];
      const cname = c ? c.nameKr : savedDungeon.heroL;
      dungeonContinueBtn.disabled = false;
      dungeonContinueBtn.textContent =
        '▶ Continue Dungeon (' + cname + ' · ' + savedDungeon.dungeonRoom + 'F)';
      dungeonContinueBtn.style.display = '';
    } else {
      // Hide entirely when no save — keeps the menu visually clean.
      dungeonContinueBtn.disabled = true;
      dungeonContinueBtn.textContent = '▶ Continue Dungeon';
      dungeonContinueBtn.style.display = 'none';
    }
  }

  // Phase E-1: essence currency removed — no display needed.
}

// ─── CLASS SELECT SCREEN ────────────────────────────
function buildClassSelect() {
  const grid = document.getElementById('cs-grid');
  if (!grid) return;
  grid.innerHTML = '';

  Object.entries(CLASSES).forEach(function (entry) {
    const id = entry[0];
    const c  = entry[1];
    const sp = HERO_SPRITES[id];
    const unlocked = isClassUnlocked(id);

    const card = document.createElement('div');
    card.className = 'cs-card' + (unlocked ? '' : ' locked');
    card.dataset.classId = id;
    card.style.setProperty('--class-color', c.color);

    // Build skill icons preview
    const skillIcons = c.skills.map(function (s) {
      return '<div class="cs-skill" title="' + s.en + '">' +
               '<img src="assets/icons/' + s.icon + '.png" alt="' + s.en + '">' +
               '<span class="cs-skill-en">' + s.en + '</span>' +
             '</div>';
    }).join('');

    // Phase D-2: stats display (HP and damage modifier)
    const stats = c.stats || { hp: 100, dmgMult: 1.0 };
    const dmgPct = Math.round((stats.dmgMult - 1) * 100);
    const dmgLabel = dmgPct > 0 ? '+' + dmgPct + '%' : (dmgPct < 0 ? dmgPct + '%' : '0%');
    const statsHtml =
      '<div class="cs-stats">' +
        '<span class="cs-stat-hp">❤️ HP ' + stats.hp + '</span>' +
        '<span class="cs-stat-dmg">⚔️ ATK ' + dmgLabel + '</span>' +
      '</div>';

    // Card layout
    card.innerHTML =
      '<div class="cs-card-glow"></div>' +
      '<div class="cs-card-inner">' +
        '<div class="cs-sprite-wrap">' +
          '<div class="cs-sprite-shadow"></div>' +
        '</div>' +
        '<div class="cs-name-kr">' + c.nameKr + '</div>' +
        '<div class="cs-name-en">' + id.toUpperCase() + ' · ' + c.themeEn + '</div>' +
        '<div class="cs-vocab-pill">' + c.vocabKr + '</div>' +
        '<div class="cs-vocab-desc">' + c.vocabDesc + '</div>' +
        statsHtml +
        (CLASS_PASSIVES[id]
          ? '<div class="cs-passive' + (isMastered(id) ? ' mastered' : '') + '" title="' + CLASS_PASSIVES[id].desc + '">' +
              '<span class="cs-passive-icon">' + (isMastered(id) ? '⭐⭐' : '⭐') + '</span>' +
              '<span class="cs-passive-name">' + CLASS_PASSIVES[id].kr + '</span>' +
              '<span class="cs-passive-desc">' + CLASS_PASSIVES[id].desc + (isMastered(id) ? ' (×1.5)' : '') + '</span>' +
            '</div>'
          : '') +
        '<div class="cs-skills-row">' + skillIcons + '</div>' +
      '</div>' +
      (unlocked ? '' : (function () {
        // Phase E-1: unlock by clearing campaign stages, no essence cost.
        const req = getClassUnlockStage(id);
        const hint = req
          ? 'Campaign Stage ' + req + ' (cleared on win)'
          : 'Progress required';
        return '<div class="cs-lock-overlay">' +
          '<div class="cs-lock-icon">🔒</div>' +
          '<div class="cs-lock-label">Locked</div>' +
          '<div class="cs-lock-cost">⚔️ Stage ' + (req || '?') + '</div>' +
          '<div class="cs-lock-hint">' + hint + '</div>' +
        '</div>';
      })()) +
      (unlocked && getMasteryLabel(id)
        ? '<div class="cs-mastery-badge' + (isMastered(id) ? ' max' : '') + '">' +
            getMasteryLabel(id) +
          '</div>'
        : '');

    // Build sprite via DOM API to avoid HTML-attribute quote conflicts
    const scale = 3;
    const animDuration = (sp.frames * 0.1).toFixed(2);
    const sprite = document.createElement('div');
    sprite.className = 'cs-sprite';
    sprite.style.width  = (sp.fw * scale) + 'px';
    sprite.style.height = (sp.fh * scale) + 'px';
    sprite.style.backgroundImage = 'url(assets/heroes/' + id + '.png)';
    sprite.style.backgroundSize  = (sp.sheet_w * scale) + 'px auto';
    sprite.style.animation = 'cs-cycle-' + id + ' ' + animDuration + 's steps(' + sp.frames + ') infinite';

    // Insert sprite before shadow inside .cs-sprite-wrap
    const wrap = card.querySelector('.cs-sprite-wrap');
    wrap.insertBefore(sprite, wrap.firstChild);

    // Inject keyframes for this hero (once)
    injectIdleKeyframes(id, sp.sheet_w * scale);

    grid.appendChild(card);
  });
}

const injectedKeyframes = new Set();
function injectIdleKeyframes(id, totalScaledWidth) {
  if (injectedKeyframes.has(id)) return;
  injectedKeyframes.add(id);
  const style = document.createElement('style');
  style.textContent =
    '@keyframes cs-cycle-' + id + ' {' +
    '  to { background-position: -' + totalScaledWidth + 'px 0; }' +
    '}';
  document.head.appendChild(style);
}

function bindClassSelect() {
  // Card click
  document.getElementById('cs-grid').addEventListener('click', function (e) {
    const card = e.target.closest('.cs-card');
    if (!card) return;
    const id = card.dataset.classId;
    if (!isClassUnlocked(id)) {
      // Pulse the lock overlay + offer to open shop
      card.classList.remove('lock-shake');
      void card.offsetWidth;  // restart animation
      card.classList.add('lock-shake');
      playClick();
      return;
    }
    selectClassCard(id);
  });

  // Start battle button
  document.getElementById('cs-start-btn').addEventListener('click', function () {
    // Phase F-2: in network co-op, only the HOST can start the game.
    // Both classes are tracked separately (_netHostHero / _netGuestHero).
    if (isNetCoop()) {
      if (!isNetCoopHost()) return;
      if (!_netHostHero || !_netGuestHero) return;
      startNetCoopGame();
      return;
    }
    if (!state.pendingHero) return;
    // Phase E-3: in coop mode, both P1 and P2 must be picked
    if (state.coopMode && !state.pendingHeroR) return;

    state.heroL = state.pendingHero;
    state.pendingHero = null;
    document.getElementById('sel-hero-l').value = state.heroL;
    combat.kills = 0;
    discoverClassSkills(state.heroL);

    // Phase C-2.1: equip only the FIRST class skill.
    if (state.gameMode === 'freeplay') {
      state.equippedSkills = CLASSES[state.heroL].skills.slice();
    } else {
      state.equippedSkills = [CLASSES[state.heroL].skills[0]];
    }
    // Phase E-3: P2 setup in coop mode
    if (state.coopMode) {
      state.heroR = state.pendingHeroR;
      state.pendingHeroR = null;
      state.mode = 'coop';  // legacy free-play flag — also makes renderHeroes show two cards
      document.getElementById('sel-hero-r').value = state.heroR;
      discoverClassSkills(state.heroR);
      // P2 starts with their first class skill too
      state.equippedSkillsR = [CLASSES[state.heroR].skills[0]];
    } else {
      state.mode = 'solo';
      state.equippedSkillsR = [];
    }
    state.dungeonExtraSkills = [];

    // Apply mode-specific setup
    if (state.gameMode === 'campaign') {
      applyCampaignStage(state.campaignStage);
    } else if (state.gameMode === 'dungeon') {
      startDungeon();
    }
    resetBattle();
    render();
    if (state.gameMode === 'campaign') {
      saveCampaignRun();
      showStageTutorial();
    }
    hideClassSelect();
  });

  // "⬅ Main" topbar button — always returns to the main menu, regardless of
  // game mode. (Previously dungeon/freeplay went to class-select, which didn't
  // match the button label.)
  document.getElementById('btn-change-class').addEventListener('click', function () {
    hideEndingScreen();
    hideDungeonShop();
    hideOverlay();
    showMainMenu();
  });
}

function selectClassCard(classId) {
  // Phase F-2: in NETWORK co-op each side picks only their own slot.
  if (isNetCoop()) {
    if (isNetCoopHost()) {
      _netHostHero = classId;
      state.pendingHero = classId;
    } else {
      // Guest cannot pick the same class as the host
      if (classId === _netHostHero) return;
      _netGuestHero = classId;
      state.pendingHeroR = classId;
    }
    NET.send({ kind: 'class_pick', classId: classId });
    refreshClassSelectUI();
    return;
  }
  // Phase E-3: in LOCAL coop mode, the first click sets P1, second click sets P2.
  if (state.coopMode) {
    if (!state.pendingHero) {
      state.pendingHero = classId;
    } else if (classId !== state.pendingHero) {
      // P2 cannot be the same class as P1
      state.pendingHeroR = classId;
    } else {
      // Clicked P1's class again — ignore (or treat as "deselect & re-pick")
      return;
    }
  } else {
    state.pendingHero = classId;
  }
  refreshClassSelectUI();
}

// Phase E-3: refactored UI refresh so both solo + coop selection paths share it.
// Phase F-2: extended for online co-op (sync indicator + role-specific labels).
function refreshClassSelectUI() {
  document.querySelectorAll('.cs-card').forEach(function (card) {
    const id = card.dataset.classId;
    card.classList.remove('selected', 'selected-p1', 'selected-p2', 'partner-locked');
    if (state.coopMode) {
      if (id === state.pendingHero)  card.classList.add('selected', 'selected-p1');
      if (id === state.pendingHeroR) card.classList.add('selected', 'selected-p2');
      // Phase F-2: in network co-op, mark the partner's pick as visually locked
      // so a player can't accidentally try to claim it.
      if (isNetCoop()) {
        const partnerHero = isNetCoopHost() ? _netGuestHero : _netHostHero;
        if (partnerHero && id === partnerHero) card.classList.add('partner-locked');
      }
    } else {
      if (id === state.pendingHero) card.classList.add('selected');
    }
  });

  const info = document.getElementById('cs-selected-info');
  const btn  = document.getElementById('cs-start-btn');

  // Phase F-2: network co-op gets its own labels (one player can't speak for both).
  if (isNetCoop()) {
    const p1 = _netHostHero ? CLASSES[_netHostHero] : null;
    const p2 = _netGuestHero ? CLASSES[_netGuestHero] : null;
    const myRoleLabel = isNetCoopHost() ? '👤 P1 (Host)' : '👤 P2 (Guest)';
    const myPick    = isNetCoopHost() ? p1 : p2;
    const partnerPick = isNetCoopHost() ? p2 : p1;
    if (info) {
      const myLine = myPick
        ? '<b>Me ' + myRoleLabel + '</b>: ' + myPick.nameKr + ' ✓'
        : '<b>Me ' + myRoleLabel + '</b>: <span class="cs-coop-hint">Choose a hero</span>';
      const peerLine = partnerPick
        ? '<b>Friend</b>: ' + partnerPick.nameKr + ' ✓'
        : '<b>Friend</b>: <span class="cs-coop-hint">⏳ choosing...</span>';
      info.innerHTML = '<div class="cs-net-row">' + myLine + '</div>' +
                       '<div class="cs-net-row">' + peerLine + '</div>';
    }
    if (btn) {
      const bothPicked = p1 && p2;
      if (isNetCoopHost()) {
        btn.disabled = !bothPicked;
        btn.textContent = bothPicked
          ? '▶ Start co-op battle (all ready)'
          : (myPick ? '▶ Waiting for friend...' : '▶ Choose a hero');
      } else {
        // Guest never starts the game — only the host does.
        btn.disabled = true;
        btn.textContent = bothPicked
          ? '⏳ Waiting for host to start...'
          : (myPick ? '⏳ Friend is choosing...' : '▶ Choose a hero');
      }
    }
    return;
  }

  if (state.coopMode) {
    const p1 = state.pendingHero ? CLASSES[state.pendingHero] : null;
    const p2 = state.pendingHeroR ? CLASSES[state.pendingHeroR] : null;
    if (info) {
      if (!p1) {
        info.innerHTML = '<span class="cs-coop-hint">👤 P1: choose the first hero</span>';
      } else if (!p2) {
        info.innerHTML =
          '<span class="cs-coop-hint">' +
          '<b>P1:</b> ' + p1.nameKr + ' · ' +
          '👥 P2: choose the second hero' +
          '</span>';
      } else {
        info.innerHTML =
          '<span class="cs-coop-pair">' +
          '<b>P1:</b> ' + p1.nameKr + '   ⚔   <b>P2:</b> ' + p2.nameKr +
          '</span>';
      }
    }
    if (btn) {
      btn.disabled = !(p1 && p2);
      btn.textContent = (p1 && p2) ? '▶ Start co-op battle' : '▶ Pick two heroes';
    }
  } else {
    const c = state.pendingHero ? CLASSES[state.pendingHero] : null;
    if (info && c) {
      info.innerHTML =
        '<span class="cs-selected-name">' + c.nameKr + '</span>' +
        ' <span class="cs-selected-vocab">(' + c.vocabKr + ')</span>' +
        ' <span class="cs-selected-skills">Skills: ' +
        c.skills.map(function (s) { return s.en; }).join(' · ') +
        '</span>';
    }
    if (btn) {
      btn.disabled = !c;
      btn.textContent = '▶ Battle Start';
    }
  }
}

function showClassSelect() {
  state.screen = 'select';
  // Rebuild to reflect current unlock state (in case shop was used)
  buildClassSelect();
  bindSpriteFactoryAfterRebuild();
  const ov = document.getElementById('class-select-screen');
  if (ov) ov.classList.remove('hidden');
  // Pre-select current hero IF unlocked, otherwise first unlocked
  let toSelect = state.heroL;
  if (!isClassUnlocked(toSelect)) {
    const meta = loadMeta();
    toSelect = (meta.unlockedClasses && meta.unlockedClasses[0]) || 'mage';
  }
  selectClassCard(toSelect);
}

// Sprites are inserted via DOM in buildClassSelect; the click-binding on #cs-grid
// uses delegation, so it still works after rebuild. This stub exists only to make
// the call site explicit; no extra action is needed.
function bindSpriteFactoryAfterRebuild() { /* no-op */ }

function hideClassSelect() {
  state.screen = 'battle';
  const ov = document.getElementById('class-select-screen');
  if (ov) ov.classList.add('hidden');
}

// ─── CAMPAIGN FLOW ──────────────────────────────────
let campaignOverride = null;  // current stage override (if any)

function applyCampaignStage(stageNum) {
  const stage = CAMPAIGN_STAGES[stageNum - 1];
  if (!stage) return;
  campaignOverride = stage.overrides;
  state.enemy = stage.enemyId;
  state.bg    = stage.bg    || state.bg;
  state.sky   = stage.sky   || state.sky;
  state.floor = stage.floor || state.floor;
  state.props = stage.props || state.props;
  document.getElementById('sel-enemy').value = state.enemy;
  document.getElementById('sel-bg').value    = state.bg;
  document.getElementById('sel-sky').value   = state.sky;
  document.getElementById('sel-floor').value = state.floor;
  document.getElementById('sel-props').value = state.props;
  updateStageIndicator();
}

function updateStageIndicator() {
  const ind = document.getElementById('stage-indicator');
  if (!ind) return;
  if (state.gameMode === 'campaign') {
    const stage = CAMPAIGN_STAGES[state.campaignStage - 1];
    ind.style.display = 'flex';
    ind.querySelector('.si-label').textContent = 'STAGE';
    ind.querySelector('.si-num').textContent = state.campaignStage + ' / ' + CAMPAIGN_STAGES.length;
    ind.querySelector('.si-name').textContent = stage ? stage.name : '';
    ind.classList.remove('dungeon-mode');
  } else if (state.gameMode === 'dungeon') {
    ind.style.display = 'flex';
    // Phase C-5: depth-based label. Show current depth / unlocked depth.
    const totalDepth = state.dungeonRoomTypes.length;
    ind.querySelector('.si-label').textContent = 'DEPTH';
    ind.querySelector('.si-num').textContent = state.dungeonRoom + ' / ' + totalDepth;
    const roomType = state.dungeonRoomTypes[state.dungeonRoom - 1] || 'combat';
    const isBoss = roomType === 'boss';
    let label;
    if (isBoss) label = '⚠️ Boss';
    else if (roomType === 'spring') label = '🌿 Healing Spring';
    else if (roomType === 'challenge') label = '⚔️ Challenge';
    else if (roomType === 'elite') label = '⭐ Elite';
    else if (roomType === 'shop') label = '🏪 Shop';
    else label = 'Room ' + state.dungeonRoom;
    ind.querySelector('.si-name').textContent = label;
    ind.classList.add('dungeon-mode');
  } else {
    ind.style.display = 'none';
  }
}

function showStageTutorial() {
  if (state.gameMode !== 'campaign') return;
  // Phase C-2.1: tutorials only appear on the first run (never beat Stage 10).
  // Repeat-run players know the mechanics; skip the modal.
  if (!isFirstRun()) return;
  const stage = CAMPAIGN_STAGES[state.campaignStage - 1];
  if (!stage || !stage.tutorial) return;
  const el = document.getElementById('stage-tutorial');
  if (!el) return;
  // tutorial may be string (legacy) or function(classId)
  const text = (typeof stage.tutorial === 'function')
    ? stage.tutorial(state.heroL)
    : stage.tutorial;
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.add('show');
  setTimeout(function () {
    el.classList.remove('show');
    setTimeout(function () { el.classList.add('hidden'); }, 400);
  }, 5000);
}

function onCampaignVictory() {
  saveCampaignProgress(state.campaignStage);
  // Phase E-1: campaign stage clear may unlock new classes
  const newlyUnlocked = checkClassUnlocks();
  if (newlyUnlocked.length > 0) {
    state.pendingClassUnlocks = newlyUnlocked;
  }
  // Phase E-2: record class-specific campaign progress + check word packs
  // Phase E-3: in coop mode, BOTH classes get progress credit
  recordClassCampaignClear(state.heroL, state.campaignStage);
  if (state.coopMode && state.heroR) {
    recordClassCampaignClear(state.heroR, state.campaignStage);
  }
  const newlyPacks = checkWordPackUnlocks();
  if (newlyPacks.length > 0) {
    state.pendingPackUnlocks = newlyPacks;
  }
  // Phase E-5: check achievements after every stage clear
  const newlyAchievs = checkAchievements();
  if (newlyAchievs.length > 0) {
    state.pendingAchievements = newlyAchievs;
  }
  if (state.campaignStage >= CAMPAIGN_STAGES.length) {
    // Final stage cleared — campaign done, clear the in-progress save.
    clearCampaignRun();
    setTimeout(function () { showEndingScreen(); }, 800);
  } else {
    // Persist run-in-progress (current kit before applying reward).
    // After reward selection we save again with the new state.
    saveCampaignRun();
    setTimeout(function () { showCampaignRewardScreen(); }, 1200);
  }
}

// Reward screen for campaign — same UI as dungeon but advances stage on pick.
function showCampaignRewardScreen() {
  state.screen = 'reward';
  playReward();
  const ov = document.getElementById('reward-screen');
  if (!ov) return;

  // Build context. First-run + Stage 1-3 = forced class skill from catalog.
  // Player's starting kit = skills[0]; Stage N reward (N=1,2,3) = skills[N].
  const stage = state.campaignStage;
  const firstRun = isFirstRun();
  let context = {};
  let isForcedTutorial = false;
  if (firstRun && stage >= 1 && stage <= 3) {
    const c = CLASSES[state.heroL];
    const forced = c && c.skills[stage]; // [1]/[2]/[3]
    if (forced) {
      context.forcedClassSkill = forced;
      isForcedTutorial = true;
    }
  }
  // Note: repeat-run Stage 1 falls through to normal 3-card rewards.
  // (No isFirstStage flag — that path was a first-run-only tutorial.)

  const opts = buildRewards(context);

  // Update header — different copy for forced tutorial vs normal stage clear
  if (isForcedTutorial) {
    ov.querySelector('.rw-label').textContent = 'NEW SKILL';
    ov.querySelector('.rw-title').textContent =
      'Class skill ' + stage + '/3 collected';
    ov.querySelector('.rw-sub').textContent =
      'Try it on the next stage';
  } else {
    ov.querySelector('.rw-label').textContent = 'STAGE CLEAR';
    ov.querySelector('.rw-title').textContent =
      'Stage ' + stage + ' Clear!';
    ov.querySelector('.rw-sub').textContent =
      opts.length > 1 ? 'Pick 1 of 3 and continue' : 'Take the reward and continue';
  }

  const list = document.getElementById('reward-options');
  list.innerHTML = '';
  opts.forEach(function (opt) {
    const card = document.createElement('button');
    card.className = 'reward-card reward-' + opt.id;
    card.innerHTML =
      '<div class="rc-icon">' + opt.icon + '</div>' +
      '<div class="rc-title">' + opt.title + '</div>' +
      '<div class="rc-desc">' + opt.desc + '</div>';
    card.addEventListener('click', function () {
      hideRewardScreen();
      // Restore default header for the next time the screen is opened.
      ov.querySelector('.rw-label').textContent = 'REWARD';
      ov.querySelector('.rw-title').textContent = 'Choose a reward';
      ov.querySelector('.rw-sub').textContent = 'Pick only one of three';
      // Apply the reward, then advance — but gate advance behind onDone so
      // that if a swap-modal is opened, we wait for it to close first.
      opt.apply(function () {
        state.campaignStage++;
        applyCampaignStage(state.campaignStage);
        resetBattle();
        render();
        // Phase C-3.1: persist run state (skills/items/gold/levels applied)
        saveCampaignRun();
        showStageTutorial();
      });
    });
    list.appendChild(card);
  });
  ov.classList.remove('hidden');
}

function onCampaignDefeat() {
  // Just allow retry of same stage; campaign override stays
}

function showEndingScreen() {
  state.screen = 'ending';
  const ov = document.getElementById('ending-screen');
  if (ov) ov.classList.remove('hidden');
  const stat = document.getElementById('ending-stats');
  if (stat) {
    stat.innerHTML =
      '<div class="es-row"><span>Total kills</span><span>' + combat.kills + '</span></div>' +
      '<div class="es-row"><span>Final class</span><span>' + CLASSES[state.heroL].nameKr + '</span></div>' +
      (window.Learning ? Learning.sessionSummaryHTML() : '');
  }
  BGM.play('victory');
}

function hideEndingScreen() {
  const ov = document.getElementById('ending-screen');
  if (ov) ov.classList.add('hidden');
}

// ─── DUNGEON FLOW ───────────────────────────────────
function startDungeon() {
  // Reset dungeon-specific state for a new run.
  // Note: equippedSkills/items/skillLevels/gold are reset in the dungeonBtn
  // handler BEFORE class-select, so that the subsequent class-confirm code
  // can populate equippedSkills with the starting skill. Resetting them here
  // (after class confirm) would wipe out the starting kit.
  state.dungeonFloor = 1;
  state.dungeonRoom = 1;
  state.dungeonNextEnemyBuff = 1.0;
  state.dungeonExtraSkills = [];   // legacy field
  state.dungeonEssenceEarned = 0;
  generateFloorContent();
  applyDungeonRoom(1);
}

function startNextFloor() {
  state.dungeonFloor++;
  state.dungeonRoom = 1;
  state.dungeonNextEnemyBuff = 1.0;
  // Keep extra skills (carry over between floors)
  generateFloorContent();
  applyDungeonRoom(1);
}

function generateFloorContent() {
  state.dungeonEnemySequence = generateDungeonSequence();
  state.dungeonRoomTypes = generateRoomTypes();
}

function generateDungeonSequence() {
  // Phase C-5: generate one mob/boss per depth (boss at every multiple of 10).
  // Length matches loadDungeonMaxDepth(). Run after generateRoomTypes so we
  // can align bosses with 'boss' room types.
  const mobs   = ASSETS.enemies.filter(function (e) { return e.kind === 'mob'; });
  const bosses = ASSETS.enemies.filter(function (e) { return e.kind === 'boss'; });
  const pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  const depth = loadDungeonMaxDepth();
  const sequence = [];
  for (let i = 0; i < depth; i++) {
    const d = i + 1;
    if (d % DUNGEON_BOSS_EVERY === 0) {
      // Boss room — pick a boss
      sequence.push(pick(bosses).id);
    } else {
      // Avoid immediate repeats of the same mob
      let candidate;
      let attempts = 0;
      do {
        candidate = pick(mobs).id;
        attempts++;
      } while (sequence.length > 0 && candidate === sequence[sequence.length - 1] && attempts < 5);
      sequence.push(candidate);
    }
  }
  return sequence;
}

function generateRoomTypes() {
  // Phase C-5: depth-based layout. Generate exactly N rooms where
  // N = loadDungeonMaxDepth() (10/15/20/.../100 depending on clears).
  //
  // For each depth d ∈ [1, N]:
  //   d % 10 === 0 → 'boss'
  //   d+1 % 10 === 0 → 'shop' (forced pre-boss shop — Phase C-5 req)
  //   d % 5 === 0  → 'elite'
  //   else 10% spring, 10% challenge, 80% combat
  const depth = loadDungeonMaxDepth();
  const types = [];
  for (let d = 1; d <= depth; d++) {
    types.push(classifyRoom(d));
  }
  return types;
}

function applyDungeonRoom(roomNum) {
  const enemyId = state.dungeonEnemySequence[roomNum - 1];
  if (!enemyId) return;
  state.enemy = enemyId;
  const enemyMeta = ASSETS.enemies.find(function (e) { return e.id === enemyId; });
  const el = enemyMeta ? enemyMeta.element : 'none';
  const bgMap = {
    fire:  { bg: 'canyon',      sky: 'flam',     floor: 'checker_dirt', props: 'mountain' },
    water: { bg: 'bamboo',      sky: 'cloud',    floor: 'dirt_sand',    props: 'forest' },
    wind:  { bg: 'fir',         sky: 'cloud_far',floor: 'grass',        props: 'mountain' },
    dark:  { bg: 'bamboo_dark', sky: 'star',     floor: 'dungeon',      props: 'mountain_dark' },
    light: { bg: 'palm',        sky: 'gradient', floor: 'grass',        props: 'forest' },
    none:  { bg: 'tree',        sky: 'cloud',    floor: 'grass',        props: 'forest' },
  };
  const env = bgMap[el] || bgMap.none;
  state.bg    = env.bg;
  state.sky   = env.sky;
  state.floor = env.floor;
  state.props = env.props;
  document.getElementById('sel-enemy').value = state.enemy;
  document.getElementById('sel-bg').value    = state.bg;
  document.getElementById('sel-sky').value   = state.sky;
  document.getElementById('sel-floor').value = state.floor;
  document.getElementById('sel-props').value = state.props;
  updateStageIndicator();

  // Phase C-3: elite room visual mark — purple glow on enemy sprite wrap
  const roomType = state.dungeonRoomTypes[roomNum - 1];
  const enemyWrap = document.querySelector('.stage-enemy-wrap');
  if (enemyWrap) {
    enemyWrap.classList.toggle('elite-enemy', roomType === 'elite');
  }

  // If this is an event room (spring), apply effect immediately
  if (roomType === 'spring') {
    setTimeout(function () { triggerSpringEvent(); }, 500);
  }
  // Phase C-4: shop room — show shop UI
  if (roomType === 'shop') {
    setTimeout(function () { showDungeonShop(); }, 400);
  }
  // Phase F-7: persist run state at every room entry. Central choke point —
  // catches advancement from reward, shop-leave, event rooms, and startDungeon.
  // saveDungeonRun() itself guards against coop & wrong gameMode.
  saveDungeonRun();
}

function getDungeonEnemyStats(enemyId, roomNum) {
  const meta = ASSETS.enemies.find(function (e) { return e.id === enemyId; });
  const isBoss = meta && meta.kind === 'boss';
  const baseHp     = isBoss ? TUNING.bossHp     : TUNING.mobHp;
  const baseAtk    = isBoss ? TUNING.bossAtk    : TUNING.mobAtk;
  const baseCharge = isBoss ? TUNING.bossCharge : TUNING.mobCharge;
  // Phase C-5: depth-based multiplier replaces both per-room curve and floor mult.
  // roomNum here is the absolute depth in the dungeon (1-100).
  const depthMult = getDepthMultiplier(roomNum);
  // Event room multipliers: challenge and elite stack on top of depth scaling.
  const roomType = state.dungeonRoomTypes[roomNum - 1];
  let eventMult = { hpMult: 1, atkMult: 1 };
  if (roomType === 'challenge') eventMult = { hpMult: EVENT_TYPES.challenge.hpMult, atkMult: EVENT_TYPES.challenge.atkMult };
  else if (roomType === 'elite') eventMult = { hpMult: EVENT_TYPES.elite.hpMult, atkMult: EVENT_TYPES.elite.atkMult };
  return {
    maxHp: Math.round(baseHp * depthMult.hpMult * eventMult.hpMult),
    atk:   Math.round(baseAtk * depthMult.atkMult * eventMult.atkMult),
    chargeTime: baseCharge,
    isBoss: isBoss,
    isChallenge: roomType === 'challenge',
    isElite: roomType === 'elite',
  };
}

function triggerSpringEvent() {
  // Full HP + barrier 30
  combat.playerHp = combat.playerMaxHp;
  combat.playerBarrierHp = 30;
  combat.playerBarrierMax = 30;
  playerHealFlash();
  playerBarrierFlash();
  showEffectivenessBanner('🌿 Healing Spring +HP +🛡', 'spring');
  updateHud();
  // After spring effect, auto-advance to next room after 2 seconds
  setTimeout(function () {
    if (state.dungeonRoom < DUNGEON.totalRooms) {
      state.dungeonRoom++;
      applyDungeonRoom(state.dungeonRoom);
      resetBattle();
      render();
      // Phase F-4: sync new room layout to guest
      broadcastRoomEnter();
    }
  }, 2000);
}

function onDungeonVictory() {
  const totalDepth = state.dungeonRoomTypes.length;
  const isFinalRoom = state.dungeonRoom >= totalDepth;
  const roomType = state.dungeonRoomTypes[state.dungeonRoom - 1];

  if (isFinalRoom) {
    // Reached the unlock cap — run complete.
    // Phase C-5: bump unlock by +5 (capped at 100). E-1: essence currency
    // removed; we no longer accumulate it, but still track depth progress.
    bumpDungeonDepthOnClear();
    saveDungeonClear();
    clearDungeonRun();          // Phase F-7: run complete — wipe resume save
    // Phase E-2: record class-specific dungeon depth + check word packs
    // Phase E-3: coop credits both heroes
    const totalDepth = loadDungeonMaxDepth();
    recordClassDungeonDepth(state.heroL, totalDepth);
    if (state.coopMode && state.heroR) {
      recordClassDungeonDepth(state.heroR, totalDepth);
    }
    const newlyPacks = checkWordPackUnlocks();
    if (newlyPacks.length > 0) {
      state.pendingPackUnlocks = newlyPacks;
    }
    // Phase E-5: bump lifetime stats + check achievements
    if (state.coopMode) bumpLifetimeStat('coopClears');
    const newlyAchievs = checkAchievements();
    if (newlyAchievs.length > 0) {
      state.pendingAchievements = newlyAchievs;
    }
    setTimeout(function () { showDungeonClearScreen(true); }, 800);
  } else if (roomType === 'challenge') {
    setTimeout(function () { showChallengeRewardScreen(); }, 1200);
  } else if (roomType === 'elite') {
    setTimeout(function () { showEliteRewardScreen(); }, 1200);
  } else {
    setTimeout(function () { showRewardScreen(); }, 1200);
  }
}

// Phase C-3: Elite reward screen — 3 cards = [item] [new skill] [upgrade/gold]
function showEliteRewardScreen() {
  state.screen = 'reward';
  playReward();
  const ov = document.getElementById('reward-screen');
  if (!ov) return;
  ov.querySelector('.rw-label').textContent = '⭐ ELITE';
  ov.querySelector('.rw-title').textContent = 'Elite kills!';
  ov.querySelector('.rw-sub').textContent = 'Choose an item or a reward';

  // Build elite-specific 3-card set
  const opts = buildEliteRewards();
  const list = document.getElementById('reward-options');
  list.innerHTML = '';
  opts.forEach(function (opt) {
    // Wrap opt.apply to also restore the header (matches original behaviour
    // for both single-player and host paths).
    const origApply = opt.apply;
    opt.apply = function (onDone) {
      ov.querySelector('.rw-label').textContent = 'REWARD';
      ov.querySelector('.rw-title').textContent = 'Choose a reward';
      ov.querySelector('.rw-sub').textContent = 'Pick only one of three';
      origApply(function () {
        // Phase F-6.3: in net co-op, both players must pick before advancing.
        if (!isNetCoop()) {
          state.dungeonRoom++;
          applyDungeonRoom(state.dungeonRoom);
          resetBattle();
          render();
        }
        if (onDone) onDone();
      });
    };
    const card = document.createElement('button');
    card.className = 'reward-card reward-' + opt.id;
    card.innerHTML =
      '<div class="rc-icon">' + opt.icon + '</div>' +
      '<div class="rc-title">' + opt.title + '</div>' +
      '<div class="rc-desc">' + opt.desc + '</div>';
    card.addEventListener('click', function () {
      if (isNetCoopHost()) {
        invokeHostRewardOption(opt);
        return;
      }
      hideRewardScreen();
      opt.apply();
    });
    list.appendChild(card);
  });
  if (isNetCoopHost()) broadcastRewardScreen('elite', opts, wrapOptsForGuestSlot(opts));
  ov.classList.remove('hidden');
}

// Returns 3 cards for elite rewards: 1 item + 1 new skill + 1 utility/upgrade.
function buildEliteRewards() {
  const cards = [];

  // === Slot 1: PASSIVE ITEM ===
  const availItems = getAvailableItems();
  if (availItems.length > 0) {
    const item = availItems[Math.floor(Math.random() * availItems.length)];
    cards.push({
      id: 'item',
      icon: '🎁',
      title: item.name,
      desc: item.desc,
      apply: function (onDone) {
        state.items.push(item.id);
        renderItemsBar();
        if (onDone) onDone();
      },
    });
  }

  // === Slot 2: NEW SKILL (fallback to upgrade) ===
  // Phase D-4: elite rewards include rare skills (combat rewards don't)
  const availableNew = getAvailableNewSkills({ includeRare: true });
  if (availableNew.length > 0) {
    const newSkill = availableNew[Math.floor(Math.random() * availableNew.length)];
    cards.push({
      id: 'new-skill',
      icon: '✨',
      title: newSkill.en.toUpperCase(),
      desc: newSkill.kr + ' · ' + getSkillEffectText(newSkill),
      apply: function (onDone) { equipOrSwapSkill(newSkill, onDone); },
    });
  } else {
    // No new skills left — offer upgrade
    const owned = getOwnedSkills();
    if (owned.length > 0) {
      const upTarget = owned[Math.floor(Math.random() * owned.length)];
      const curLevel = getSkillLevel(upTarget.en);
      cards.push({
        id: 'upgrade',
        icon: '⬆',
        title: upTarget.en.toUpperCase() + ' +1',
        desc: 'Lv.' + curLevel + ' → Lv.' + (curLevel + 1) + ' · effect +25%',
        apply: function (onDone) {
          upgradeSkill(upTarget.en);
          renderHeroes();
          if (onDone) onDone();
        },
      });
    }
  }

  // === Slot 3: GOLD or HEAL ===
  if (Math.random() < 0.5) {
    cards.push({
      id: 'gold-bag',
      icon: '💰',
      title: 'Big Gold Pouch',
      desc: '+50 Gold (Elite bonus)',
      apply: function (onDone) { addGold(50); if (onDone) onDone(); },
    });
  } else {
    cards.push({
      id: 'heal-room',
      icon: '🩹',
      title: 'Full HP restore',
      desc: 'Fully restore HP',
      apply: function (onDone) {
        const before = combat.playerHp;
        combat.playerHp = combat.playerMaxHp;
        spawnDamageNumber(combat.playerHp - before, 'player', { tint: 'heal' });
        if (onDone) onDone();
      },
    });
  }

  return cards;
}

// ─── DUNGEON SHOP (Phase C-4) ───────────────────────
// In-dungeon shop room. Lets the player spend gold on healing/skills/items.
// Opens automatically when entering a 'shop' room; player clicks "leave"
// (or runs out of relevant items to buy) to advance to the next room.
function showDungeonShop() {
  state.screen = 'shop';
  const ov = document.getElementById('dshop-screen');
  if (!ov) return;
  // Phase F-6.4: in net coop, host pre-builds both players' offer lists so
  // the guest's purchase requests can be applied against a stable snapshot.
  if (isNetCoopHost()) {
    _netShopOffersHost  = buildShopOffersForSlot('p1');
    _netShopOffersGuest = buildShopOffersForSlot('p2');
    _netShopHostLeft  = false;
    _netShopGuestLeft = false;
  }
  renderDungeonShop();
  ov.classList.remove('hidden');
  // Tell guest to open their own shop UI (with their own offers).
  if (isNetCoopHost()) broadcastShopOpen();
}

function hideDungeonShop() {
  const ov = document.getElementById('dshop-screen');
  if (ov) ov.classList.add('hidden');
  // BUGFIX (Phase F-7): shop sets state.screen = 'shop' on open, but until
  // now nothing restored it. handleTypeInput blocks on screen !== 'battle',
  // so the post-shop room (always a boss, by classifyRoom layout) was
  // unplayable — keys went nowhere. Mirrors hideRewardScreen() behaviour.
  state.screen = 'battle';
}

// Phase F-6.4: build the shop offer list for a specific player slot.
//   slot = 'p1' (host) or 'p2' (guest)
// In coop, slot p2 uses heroR's class catalog + equippedSkillsR for routing.
function buildShopOffersForSlot(slot) {
  const isP2 = (slot === 'p2');
  // Temporarily swap state references so the existing helpers (which read
  // state.heroL / state.equippedSkills / state.items) work for the target slot.
  const origL  = state.heroL;
  const origP1 = state.equippedSkills;
  const origItems = state.items;
  if (isP2) {
    state.heroL          = state.heroR;
    state.equippedSkills = state.equippedSkillsR || [];
    state.items          = state.itemsR         || (state.itemsR = []);
  }

  const offers = [];

  // 1) HP potion (HP is shared, but only buyer pays)
  const hpFull = combat.playerHp >= combat.playerMaxHp;
  offers.push({
    id: 'potion',
    icon: '🩹',
    title: 'HP heal potion',
    desc: hpFull ? 'Already at full HP' : 'HP +40 (current ' + combat.playerHp + '/' + combat.playerMaxHp + ')',
    price: SHOP_PRICES.potion,
    available: !hpFull,
    onBuy: function () {
      const before = combat.playerHp;
      combat.playerHp = Math.min(combat.playerMaxHp, combat.playerHp + 40);
      spawnDamageNumber(combat.playerHp - before, 'player', { tint: 'heal' });
    },
  });

  // 2) New skill — pulled from the target slot's available pool
  const availSkills = getAvailableNewSkills({ includeRare: true });
  if (availSkills.length > 0) {
    const skill = availSkills[Math.floor(Math.random() * availSkills.length)];
    offers.push({
      id: 'newSkill',
      icon: '✨',
      title: skill.en.toUpperCase(),
      desc: skill.kr + ' · ' + getSkillEffectText(skill),
      price: SHOP_PRICES.newSkill,
      available: true,
      skill: skill,
      onBuy: function () {
        // Route to the buying player's slot.
        if (isP2) equipToSlot(skill, 'p2');
        else      equipOrSwapSkill(skill);
      },
    });
  } else {
    offers.push({
      id: 'newSkill', icon: '✨', title: 'New skill',
      desc: 'No more skills to learn',
      price: SHOP_PRICES.newSkill, available: false,
    });
  }

  // 3) Upgrade
  const owned = getOwnedSkills();
  if (owned.length > 0) {
    const target = owned[Math.floor(Math.random() * owned.length)];
    const curLv = getSkillLevel(target.en);
    offers.push({
      id: 'upgrade',
      icon: '⬆',
      title: target.en.toUpperCase() + ' +1',
      desc: 'Lv.' + curLv + ' → Lv.' + (curLv + 1) + ' · effect +25%',
      price: SHOP_PRICES.upgrade,
      available: true,
      onBuy: function () {
        upgradeSkill(target.en);
        renderHeroes();
      },
    });
  } else {
    offers.push({
      id: 'upgrade', icon: '⬆', title: 'Upgrade skill',
      desc: 'No skill to upgrade',
      price: SHOP_PRICES.upgrade, available: false,
    });
  }

  // 4) Passive item — added to the buying player's items list.
  const availItems = getAvailableItems();
  if (availItems.length > 0) {
    const item = availItems[Math.floor(Math.random() * availItems.length)];
    offers.push({
      id: 'item',
      icon: '🎁',
      title: item.name,
      desc: item.desc,
      price: SHOP_PRICES.item,
      available: true,
      onBuy: function () {
        if (isP2) state.itemsR.push(item.id);
        else      state.items.push(item.id);
        renderItemsBar();
      },
    });
  } else {
    offers.push({
      id: 'item', icon: '🎁', title: 'Passive item',
      desc: 'No more items available',
      price: SHOP_PRICES.item, available: false,
    });
  }

  // Restore swapped state
  if (isP2) {
    state.heroL          = origL;
    state.equippedSkills = origP1;
    state.items          = origItems;
  }
  return offers;
}

function renderDungeonShop() {
  const goldEl = document.getElementById('dshop-gold');
  if (goldEl) goldEl.textContent = myGold();

  const list = document.getElementById('dshop-list');
  if (!list) return;
  list.innerHTML = '';

  // Phase F-6.4: in net coop, host uses its cached offers (also broadcast to guest).
  // In solo / local coop, build fresh each time.
  let offers;
  if (isNetCoopHost()) {
    if (!_netShopOffersHost) _netShopOffersHost = buildShopOffersForSlot('p1');
    offers = _netShopOffersHost;
  } else {
    offers = buildShopOffersForSlot('p1');
  }

  offers.forEach(function (offer) {
    const canAfford = (state.gold || 0) >= offer.price;
    const buyable = offer.available && canAfford;

    const card = document.createElement('div');
    card.className = 'dshop-card' + (buyable ? '' : ' dshop-disabled');

    card.innerHTML =
      '<div class="dshop-card-icon">' + offer.icon + '</div>' +
      '<div class="dshop-card-info">' +
        '<div class="dshop-card-title">' + offer.title + '</div>' +
        '<div class="dshop-card-desc">' + offer.desc + '</div>' +
      '</div>' +
      '<button class="dshop-buy-btn' + (buyable ? '' : ' disabled') + '"' +
        (buyable ? '' : ' disabled') + '>' +
        '💰 ' + offer.price + (canAfford ? '' : ' (low)') +
      '</button>';

    if (buyable) {
      const btn = card.querySelector('.dshop-buy-btn');
      btn.addEventListener('click', function () {
        state.gold -= offer.price;
        updateHud();
        if (offer.onBuy) offer.onBuy();
        playReward();
        // Phase F-6.4: in net coop, rebuild host's offers (items become
        // unavailable after purchase) — note guest's offers are independent.
        if (isNetCoopHost()) {
          _netShopOffersHost = buildShopOffersForSlot('p1');
        }
        renderDungeonShop();
      });
    }

    list.appendChild(card);
  });
  // Show "waiting for partner" hint if host has left but guest hasn't.
  showDshopWaitingIfNeeded();
}

function showDshopWaitingIfNeeded() {
  if (!isNetCoopHost()) return;
  let hint = document.getElementById('dshop-waiting');
  if (!hint) {
    const list = document.getElementById('dshop-list');
    if (!list) return;
    hint = document.createElement('div');
    hint.id = 'dshop-waiting';
    hint.className = 'rw-waiting';
    hint.textContent = '⏳ Waiting for friend to leave the Shop...';
    list.parentNode.appendChild(hint);
  }
  hint.style.display = _netShopHostLeft ? 'block' : 'none';
}

function bindDungeonShop() {
  const leaveBtn = document.getElementById('dshop-leave');
  if (leaveBtn) leaveBtn.addEventListener('click', function () {
    // Phase F-6.4: in net coop, both players must press leave first.
    if (isNetCoopGuest()) {
      NET.send({ kind: 'shop_leave' });
      // Hide shop locally + show waiting overlay
      hideDungeonShop();
      _netShopGuestLeft = true;
      // Show passive overlay so guest knows the wait is on the host now.
      let npo = document.getElementById('net-passive-overlay');
      if (!npo) {
        npo = document.createElement('div');
        npo.id = 'net-passive-overlay';
        npo.className = 'net-passive-overlay';
        npo.innerHTML =
          '<div class="npo-inner">' +
            '<div class="npo-icon">🛒</div>' +
            '<div class="npo-title">Host is in the Shop</div>' +
            '<div class="npo-sub">Please wait a moment...</div>' +
          '</div>';
        document.body.appendChild(npo);
      }
      npo.classList.remove('hidden');
      return;
    }
    if (isNetCoopHost()) {
      _netShopHostLeft = true;
      if (!_netShopGuestLeft) {
        // Wait for guest to also leave — show waiting hint on host's shop.
        showDshopWaitingIfNeeded();
        return;
      }
      // Both pressed leave — advance.
      finishNetShop();
      return;
    }
    // Solo / local coop path (unchanged)
    hideDungeonShop();
    state.dungeonRoom++;
    applyDungeonRoom(state.dungeonRoom);
    resetBattle();
    render();
  });
}

// Phase E-1: essence currency removed. This function is now a no-op,
// kept for back-compat in case any code still calls it. Safe to delete
// once all call sites are gone.
function finalizeRunEssence() { /* essence removed in E-1 */ }

// Legacy reward generator — kept for back-compat ref. Phase C-2 onward
// uses buildRewards() from the unified Phase C-2 reward pool.
function generateRewardOptions() {
  return buildRewards({});
}

function showRewardScreen() {
  state.screen = 'reward';
  playReward();
  const ov = document.getElementById('reward-screen');
  if (!ov) return;
  const opts = buildRewards({});
  const list = document.getElementById('reward-options');
  list.innerHTML = '';
  opts.forEach(function (opt) {
    const card = document.createElement('button');
    card.className = 'reward-card reward-' + opt.id;
    card.innerHTML =
      '<div class="rc-icon">' + opt.icon + '</div>' +
      '<div class="rc-title">' + opt.title + '</div>' +
      '<div class="rc-desc">' + opt.desc + '</div>';
    card.addEventListener('click', function () {
      // Phase F-4: in net co-op host applies via invokeHostRewardOption so the
      // pair-completion logic kicks in. Solo path stays identical.
      if (isNetCoopHost()) {
        invokeHostRewardOption(opt);
        return;
      }
      state.dungeonNextEnemyBuff = 1.0;
      hideRewardScreen();
      opt.apply(function () {
        state.dungeonRoom++;
        applyDungeonRoom(state.dungeonRoom);
        resetBattle();
        render();
      });
    });
    list.appendChild(card);
  });
  // Phase F-6.3: in net co-op, generate a separate reward set for the guest.
  if (isNetCoopHost()) {
    const guestOpts = buildGuestRewards({});
    broadcastRewardScreen('normal', opts, guestOpts);
  }
  ov.classList.remove('hidden');
}

function showChallengeRewardScreen() {
  // Show 2 rare skills (both are 'discover' cards)
  state.screen = 'reward';
  const ov = document.getElementById('reward-screen');
  if (!ov) return;

  const ownedEns = new Set();
  CLASSES[state.heroL].skills.forEach(function (s) { ownedEns.add(s.en); });
  state.dungeonExtraSkills.forEach(function (s) { ownedEns.add(s.en); });
  const available = RARE_SKILLS.filter(function (s) { return !ownedEns.has(s.en); });

  // Update header
  ov.querySelector('.rw-label').textContent = 'CHALLENGE COMPLETE';
  ov.querySelector('.rw-title').textContent = 'Choose from 2 rare skills';
  ov.querySelector('.rw-sub').textContent = 'Challenge cleared! Pick a powerful skill';

  // Phase F-4: build option objects so we can store + serialize them.
  const restoreHeader = function () {
    ov.querySelector('.rw-label').textContent = 'REWARD';
    ov.querySelector('.rw-title').textContent = 'Choose a reward';
    ov.querySelector('.rw-sub').textContent = 'Pick only one of three';
  };

  const opts = [];
  // Pick 2 unique random rare skills (or 1 if only 1 available)
  const shuffled = available.slice().sort(function () { return Math.random() - 0.5; });
  const numPicks = Math.min(2, shuffled.length);
  for (let i = 0; i < numPicks; i++) {
    const rare = shuffled[i];
    opts.push({
      id: 'rare-' + rare.en,
      icon: '✨',
      title: rare.en,
      desc: rare.kr,
      skill: rare,
      isDiscover: true,
      apply: function (onDone) {
        restoreHeader();
        equipOrSwapSkill(rare, function () {
          // Phase F-6.3: in net co-op, both players must pick before advancing.
          if (!isNetCoop()) {
            state.dungeonRoom++;
            applyDungeonRoom(state.dungeonRoom);
            resetBattle();
            render();
          }
          if (onDone) onDone();
        });
      },
    });
  }
  // "Skip / heal" option
  opts.push({
    id: 'heal',
    icon: '🩹',
    title: 'Heal instead',
    desc: 'Restore 40 HP',
    apply: function (onDone) {
      const before = combat.playerHp;
      combat.playerHp = Math.min(combat.playerMaxHp, combat.playerHp + 40);
      spawnDamageNumber(combat.playerHp - before, 'player', { tint: 'heal' });
      restoreHeader();
      if (!isNetCoop()) {
        state.dungeonRoom++;
        applyDungeonRoom(state.dungeonRoom);
        resetBattle();
        render();
      }
      if (onDone) onDone();
    },
  });

  const list = document.getElementById('reward-options');
  list.innerHTML = '';
  opts.forEach(function (opt) {
    const card = document.createElement('button');
    card.className = 'reward-card reward-' + opt.id + (opt.isDiscover ? ' reward-discover' : '');
    card.innerHTML =
      '<div class="rc-icon">' + opt.icon + '</div>' +
      '<div class="rc-title">' + opt.title + '</div>' +
      '<div class="rc-desc">' + opt.desc + '</div>';
    card.addEventListener('click', function () {
      if (isNetCoopHost()) {
        invokeHostRewardOption(opt);
        return;
      }
      hideRewardScreen();
      opt.apply();
    });
    list.appendChild(card);
  });

  if (isNetCoopHost()) broadcastRewardScreen('challenge', opts, wrapOptsForGuestSlot(opts));
  ov.classList.remove('hidden');
}

function hideRewardScreen() {
  const ov = document.getElementById('reward-screen');
  if (ov) ov.classList.add('hidden');
  state.screen = 'battle';
}

function showFloorClearScreen() {
  state.screen = 'ending';
  const ov = document.getElementById('floor-clear-screen');
  if (!ov) return;
  ov.classList.remove('hidden');
  // Phase F-5: tell guest to mirror this screen
  if (isNetCoopHost()) broadcastEndScreen('floor_clear', { floor: state.dungeonFloor });
  const title = document.getElementById('fc-title');
  const earned = document.getElementById('fc-earned');
  const total = document.getElementById('fc-total');
  const continueBtn = document.getElementById('fc-continue');
  const quitBtn = document.getElementById('fc-quit');

  if (title) title.textContent = 'FLOOR ' + state.dungeonFloor + ' Clear!';
  // Phase E-1: essence removed — show a progress line instead.
  if (earned) earned.textContent = '⭐ Depth ' + state.dungeonRoom + 'Room cleared';
  if (total) total.textContent = 'Onward, deeper!';

  // Wire buttons (replace listeners to avoid stacking)
  const newContinue = continueBtn.cloneNode(true);
  continueBtn.parentNode.replaceChild(newContinue, continueBtn);
  newContinue.addEventListener('click', function () {
    hideFloorClearScreen();
    hideOverlay();
    startNextFloor();
    resetBattle();
    render();
  });
  newContinue.textContent = '▶ Floor ' + (state.dungeonFloor + 1) + ' Enter';

  const newQuit = quitBtn.cloneNode(true);
  quitBtn.parentNode.replaceChild(newQuit, quitBtn);
  newQuit.addEventListener('click', function () {
    // Cash out and go to menu
    finalizeRunEssence();
    saveDungeonClear();
    hideFloorClearScreen();
    hideOverlay();
    showDungeonClearScreen(false);
  });
}

function hideFloorClearScreen() {
  const ov = document.getElementById('floor-clear-screen');
  if (ov) ov.classList.add('hidden');
}

function showDungeonClearScreen(isFullClear) {
  state.screen = 'ending';
  const ov = document.getElementById('dungeon-clear-screen');
  if (ov) ov.classList.remove('hidden');
  const stat = document.getElementById('dc-stats');
  const titleEl = ov.querySelector('.dc-title');
  const subEl = ov.querySelector('.dc-subtitle');

  const depthReached = state.dungeonRoomTypes.length;
  const newMaxDepth = loadDungeonMaxDepth();   // already bumped by bumpDungeonDepthOnClear
  const isMaxedOut = newMaxDepth >= DUNGEON_MAX_DEPTH;

  if (titleEl) titleEl.textContent = isFullClear
    ? (isMaxedOut ? '👑 100F fully conquered!' : '⛰ ' + depthReached + 'F cleared!')
    : 'EXIT';
  if (subEl) subEl.textContent = isFullClear
    ? (isMaxedOut ? 'You are the strongest adventurer!' : '+' + DUNGEON_UNLOCK_STEP + 'F unlocked (next: ' + newMaxDepth + 'F)')
    : 'Leaving the dungeon';
  if (stat) {
    const skillNames = (state.equippedSkills || []).map(function (s) { return s.en; }).join(', ');
    const itemNames = (state.items || []).map(function (id) {
      const m = PASSIVE_ITEMS_BY_ID[id]; return m ? m.name : id;
    }).join(', ');
    // Phase E-1: essence rows removed.
    stat.innerHTML =
      '<div class="es-row"><span>Depth reached</span><span>' + depthReached + 'F</span></div>' +
      '<div class="es-row"><span>Next unlock</span><span>' + newMaxDepth + 'F</span></div>' +
      '<div class="es-row"><span>Final class</span><span>' + CLASSES[state.heroL].nameKr + '</span></div>' +
      '<div class="es-row"><span>Equipped skills</span><span>' + (skillNames || 'None') + '</span></div>' +
      '<div class="es-row"><span>Items</span><span>' + (itemNames || 'None') + '</span></div>' +
      (window.Learning ? Learning.sessionSummaryHTML() : '');
  }
  BGM.play('victory');

  // Phase F-5: tell guest to show matching clear screen.
  if (isNetCoopHost()) {
    broadcastEndScreen('dungeon_clear', {
      title:    titleEl ? titleEl.textContent : 'Clear!',
      subtitle: subEl   ? subEl.textContent   : '',
      depthReached: depthReached,
      newMaxDepth: newMaxDepth,
    });
  }
}

function hideDungeonClearScreen() {
  const ov = document.getElementById('dungeon-clear-screen');
  if (ov) ov.classList.add('hidden');
  // Phase F-5: end the net session cleanly on either side. The peer will see
  // a "Your partner left" toast and can also press menu to leave.
  if (isNetCoop()) {
    try { NET.leaveRoom(); } catch (e) {}
    _netRole = null;
    _netInGame = false;
    state.coopMode = false;
    // Strip ?room=... from URL so reload doesn't auto-rejoin
    try {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.history.replaceState({}, '', cleanUrl);
    } catch (e) {}
  }
}

// ─── UI BUILDERS ────────────────────────────────────
function buildSelects() {
  const fill = (selId, items, current) => {
    const sel = document.getElementById(selId);
    sel.innerHTML = '';
    items.forEach(it => {
      const opt = document.createElement('option');
      opt.value = it.id;
      opt.textContent = it.kind === 'boss' ? '★ ' + it.name : it.name;
      if (it.id === current) opt.selected = true;
      sel.appendChild(opt);
    });
  };
  fill('sel-enemy', ASSETS.enemies, state.enemy);
  fill('sel-sky',   ASSETS.skies,   state.sky);
  fill('sel-props', ASSETS.props,   state.props);
  fill('sel-bg',    ASSETS.bgs,     state.bg);
  fill('sel-floor', ASSETS.floors,  state.floor);
  const heroItems = Object.entries(CLASSES).map(function (e) {
    return { id: e[0], name: e[1].nameKr + ' (' + e[0] + ')' };
  });
  fill('sel-hero-l', heroItems, state.heroL);
  fill('sel-hero-r', heroItems, state.heroR);
}

function bindControls() {
  document.getElementById('sel-enemy').addEventListener('change', function (e) {
    state.enemy = e.target.value; resetBattle(); renderStage(); updateHud();
  });
  document.getElementById('sel-sky').addEventListener('change', function (e) {
    state.sky = e.target.value; renderStage();
  });
  document.getElementById('sel-props').addEventListener('change', function (e) {
    state.props = e.target.value; renderStage();
  });
  document.getElementById('sel-bg').addEventListener('change', function (e) {
    state.bg = e.target.value; renderStage();
  });
  document.getElementById('sel-floor').addEventListener('change', function (e) {
    state.floor = e.target.value; renderStage();
  });
  document.getElementById('sel-hero-l').addEventListener('change', function (e) {
    state.heroL = e.target.value; resetBattle(); renderHeroes(); updateHud();
  });
  document.getElementById('sel-hero-r').addEventListener('change', function (e) {
    state.heroR = e.target.value; renderHeroes(); updateHud();
  });

  document.querySelectorAll('.mode-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      state.mode = btn.dataset.mode;
      document.querySelectorAll('.mode-btn').forEach(function (b) {
        b.classList.toggle('active', b === btn);
      });
      document.body.classList.toggle('mode-coop', state.mode === 'coop');
      document.getElementById('lbl-h1').textContent = state.mode === 'coop' ? 'left' : 'center';
      renderHeroes();
      updateHud();
    });
  });
}

function bindButtons() {
  document.getElementById('btn-random').addEventListener('click', randomize);
  document.getElementById('btn-reset').addEventListener('click', function () {
    Object.assign(state, DEFAULT_STATE);
    buildSelects();
    document.querySelectorAll('.mode-btn').forEach(function (b) {
      b.classList.toggle('active', b.dataset.mode === state.mode);
    });
    document.body.classList.toggle('mode-coop', state.mode === 'coop');
    combat.kills = 0;
    resetBattle();
    render();
  });
}

function randomize() {
  const pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)].id; };
  state.enemy = pick(ASSETS.enemies);
  state.sky   = pick(ASSETS.skies);
  state.props = pick(ASSETS.props);
  state.bg    = pick(ASSETS.bgs);
  state.floor = pick(ASSETS.floors);
  const heroes = Object.keys(CLASSES);
  state.heroL = heroes[Math.floor(Math.random() * heroes.length)];
  state.heroR = heroes[Math.floor(Math.random() * heroes.length)];
  buildSelects();
  resetBattle();
  render();
}

// ─── RENDER ─────────────────────────────────────────
function render() {
  renderStage();
  renderHeroes();
  updateHud();
}

function renderStage() {
  const setBg = function (id, file) {
    document.getElementById(id).style.backgroundImage = file ? 'url("' + file + '")' : 'none';
  };
  setBg('layer-sky',   'assets/sky/' + state.sky + '.png');
  setBg('layer-props', state.props === 'none' ? null : 'assets/props/' + state.props + '.png');
  setBg('layer-bg-l',  'assets/bg/' + state.bg + '.png');
  setBg('layer-bg-r',  'assets/bg/' + state.bg + '.png');
  setBg('layer-floor', 'assets/floor/' + state.floor + '.png');
  const enemyImg = document.getElementById('enemy-sprite');
  enemyImg.src = 'assets/enemies/' + state.enemy + '.png';
  enemyImg.alt = state.enemy;
}

function renderHeroes() {
  const row = document.getElementById('hero-row');
  row.innerHTML = '';
  if (state.coopMode) {
    // Phase E-3: both heroes are active in coop
    row.appendChild(buildHeroCard(state.heroL, 'left',  true, 'p1'));
    row.appendChild(buildHeroCard(state.heroR, 'right', true, 'p2'));
  } else if (state.mode === 'solo') {
    row.appendChild(buildHeroCard(state.heroL, 'center', true, 'p1'));
  } else {
    row.appendChild(buildHeroCard(state.heroL, 'left',  true,  'p1'));
    row.appendChild(buildHeroCard(state.heroR, 'right', false, 'p2'));
  }
}

function buildHeroCard(classId, side, isActive, playerSlot) {
  const c = CLASSES[classId];
  const card = document.createElement('div');
  card.className = 'hero-card ' + side + ' ' + (isActive ? 'active-hero' : 'preview-hero');
  if (playerSlot) card.classList.add('slot-' + playerSlot);
  card.dataset.classId = classId;

  // Phase E-3: which equippedSkills array to read from
  const equipped = (playerSlot === 'p2') ? state.equippedSkillsR : state.equippedSkills;

  // Compose skill list. For the active hero we use the equipped skills
  // (1-4 items, populated via class-select + rewards + swap). For preview
  // (other class cards in freeplay sidebar), show the class catalog so the
  // player can see what they'd get.
  let allSkills;
  if (isActive && equipped && equipped.length > 0) {
    allSkills = equipped.slice();
  } else {
    allSkills = c.skills.slice();
  }

  const skillsHtml = allSkills.map(function (s) {
    const el = s.element || 'none';
    const elMeta = ELEMENTS[el];
    const elBadge = (el !== 'none')
      ? '<div class="skill-element-badge" style="background:' + elMeta.color + '" title="' + elMeta.kr + '">' + elMeta.emoji + '</div>'
      : '';
    // Action icon (heal/barrier/guard/stall/dodge show different cues from damage)
    let actionTag = '';
    if (s.action === 'heal')    actionTag = '<div class="skill-action-tag heal">+HP</div>';
    if (s.action === 'barrier') actionTag = '<div class="skill-action-tag barrier">🛡' + (s.amount || 30) + '</div>';
    if (s.action === 'guard')   actionTag = '<div class="skill-action-tag guard">-' + Math.round((STATUSES.guard.value||0.4) * 100) + '%</div>';
    if (s.action === 'stall')   actionTag = '<div class="skill-action-tag stall">+' + (s.amount || 2) + 's</div>';
    if (s.action === 'dodge')   actionTag = '<div class="skill-action-tag dodge">Dodge</div>';
    // Damage pill only shown for damage actions
    const dmgPill = (s.action === 'damage' || !s.action)
      ? '<div class="skill-dmg-pill">-' + TUNING.skillDamage(s.en) + '</div>'
      : '';
    // Phase C-2: upgrade level badge (Lv 2+ only)
    const lvl = getSkillLevel(s.en);
    const lvlBadge = (lvl > 1)
      ? '<div class="skill-lvl-badge">Lv' + lvl + '</div>'
      : '';
    return '' +
      '<div class="skill-slot" data-word="' + s.en + '">' +
        '<div class="skill-icon"><img src="assets/icons/' + s.icon + '.png" alt="' + s.en + '"></div>' +
        '<div class="skill-en">' + s.en + '</div>' +
        '<div class="skill-kr">' + s.kr + '</div>' +
        '<div class="skill-cd-overlay"></div>' +
        dmgPill + actionTag + elBadge + lvlBadge +
      '</div>';
  }).join('');

  card.innerHTML =
    '<div class="hero-card-top">' +
      '<div class="hero-portrait">' +
        '<img src="assets/heroes_static/' + classId + '.png" alt="' + classId + '">' +
      '</div>' +
      '<div class="hero-info">' +
        '<div class="hero-name">' + c.nameKr +
          // Phase E-5: show active title next to P1 only (P2 is the partner)
          ((playerSlot === 'p1' || !playerSlot) && getActiveTitleText()
            ? ' <span class="active-title-display">' + getActiveTitleText() + '</span>'
            : '') +
        '</div>' +
        '<div class="hero-class-en">' + classId.toUpperCase() + ' · ' + c.themeEn + '</div>' +
        '<div class="hero-class-theme">' + c.theme + '</div>' +
        (CLASS_PASSIVES[classId]
          ? '<div class="hero-passive' + (isMastered(classId) ? ' mastered' : '') + '" title="' + CLASS_PASSIVES[classId].desc + (isMastered(classId) ? ' (Master: ~+50% effect)' : '') + '">' +
              (isMastered(classId) ? '⭐⭐ ' : '⭐ ') + CLASS_PASSIVES[classId].kr +
            '</div>'
          : '') +
        '<div class="hero-barrier" style="display:none">' +
          '<div class="hero-barrier-fill" style="width:100%"></div>' +
          '<div class="hero-barrier-text">🛡 0/0</div>' +
        '</div>' +
        '<div class="hero-hp' + (state.coopMode ? ' shared-hp' : '') + '">' +
          '<div class="hero-hp-fill" style="width: 100%"></div>' +
          '<div class="hero-hp-text">' + (state.coopMode ? '🤝 ' : '') + 'HP 100/100</div>' +
        '</div>' +
        '<div class="hero-status-icons"></div>' +
      '</div>' +
    '</div>' +
    '<div class="skill-grid">' + skillsHtml + '</div>' +
    (isActive ? '' : '<div class="preview-badge">PREVIEW</div>');
  return card;
}

// ─── COMBAT: stat helpers ───────────────────────────
function getEnemyStats(enemyId) {
  const meta = ASSETS.enemies.find(function (e) { return e.id === enemyId; });
  const isBoss = meta && meta.kind === 'boss';
  return {
    maxHp:      isBoss ? TUNING.bossHp     : TUNING.mobHp,
    atk:        isBoss ? TUNING.bossAtk    : TUNING.mobAtk,
    chargeTime: isBoss ? TUNING.bossCharge : TUNING.mobCharge,
    isBoss: isBoss
  };
}

function resetBattle() {
  const s = getEnemyStats(state.enemy);
  const enemyMeta = ASSETS.enemies.find(function (e) { return e.id === state.enemy; });
  const passive = CLASS_PASSIVES[state.heroL];

  // Phase D-2: base HP comes from CLASSES.stats.hp (replaces flat playerMaxHp).
  // Knight 140, Paladin 120, Priest/Monk 100, Druid 95, Archer 90, Rogue 85, Mage 80.
  // Phase E-3: in coop mode, the shared HP pool is the SUM of both classes' HP.
  const classDef = CLASSES[state.heroL];
  let baseHp = (classDef && classDef.stats && classDef.stats.hp) || TUNING.playerMaxHp;
  if (state.coopMode && state.heroR) {
    const classDefR = CLASSES[state.heroR];
    const hpR = (classDefR && classDefR.stats && classDefR.stats.hp) || TUNING.playerMaxHp;
    baseHp = baseHp + hpR;
  }
  let maxHp = baseHp;
  maxHp += getMetaBonus('startHp');
  maxHp += getItemModifier('hp_max_bonus');   // Phase C-3: titan_heart
  maxHp += (state.druidGrowthBonus || 0);     // Phase D-1: druid spell_growth
  combat.playerMaxHp      = maxHp;
  combat.playerHp         = maxHp;

  // Meta upgrade: start barrier
  const startBarrier = getMetaBonus('startBarrier');
  combat.playerBarrierHp  = startBarrier;
  combat.playerBarrierMax = startBarrier;

  // Campaign override (if in campaign mode)
  if (state.gameMode === 'campaign' && campaignOverride) {
    combat.enemyHp      = campaignOverride.hp;
    combat.enemyMaxHp   = campaignOverride.hp;
    combat.enemyAtk     = campaignOverride.atk;
    combat.charge       = campaignOverride.charge;
    combat.chargeMax    = campaignOverride.charge;
  } else if (state.gameMode === 'dungeon') {
    const ds = getDungeonEnemyStats(state.enemy, state.dungeonRoom);
    combat.enemyHp     = ds.maxHp;
    combat.enemyMaxHp  = ds.maxHp;
    combat.enemyAtk    = ds.atk;
    combat.charge      = ds.chargeTime;
    combat.chargeMax   = ds.chargeTime;
  } else {
    combat.enemyHp      = s.maxHp;
    combat.enemyMaxHp   = s.maxHp;
    combat.enemyAtk     = s.atk;
    combat.charge       = s.chargeTime;
    combat.chargeMax    = s.chargeTime;
  }

  combat.enemyElement = (enemyMeta && enemyMeta.element) || 'none';
  combat.cooldowns    = {};
  combat.enemyStatuses  = [];
  combat.playerStatuses = [];
  combat.combo        = 0;
  combat.comboLastHit = 0;
  combat.firstHit     = true;
  combat.firstHitCount = 0;     // Rogue mastery: tracks how many first-hit crits used
  combat.druidRegenAccum = 0;
  combat.lastSkillWord = null;          // Phase D-1: rogue variety_combo
  combat.paladinSmiteReady = false;     // Phase D-1: paladin heal_smite
  combat.guaranteedCritNext = false;    // Phase D-6: crit_next special
  combat.status       = 'fighting';
  state.typed = '';

  // Phase C-3: life_blossom — heal at start of each combat (but only mid-run,
  // not at the very first room, since HP just maxed out above).
  // Apply after setting playerHp = maxHp; this caps at max anyway.
  const roomHeal = getItemModifier('room_heal');
  if (roomHeal > 0) {
    combat.playerHp = Math.min(combat.playerMaxHp, combat.playerHp + roomHeal);
  }

  hideOverlay();
  updateTypeDisplay();
  updateStageIndicator();

  // BGM: battle for combat rooms, boss for final stage / any boss room
  if (state.gameMode) {
    const dungeonBossNow = state.gameMode === 'dungeon' &&
      state.dungeonRoomTypes &&
      state.dungeonRoomTypes[state.dungeonRoom - 1] === 'boss';
    const isBossStage =
      (state.gameMode === 'campaign' && state.campaignStage >= CAMPAIGN_STAGES.length) ||
      dungeonBossNow;
    BGM.play(isBossStage ? 'boss' : 'battle');
  }
}

// ─── GAME LOOP ──────────────────────────────────────
let lastTickTime = 0;
function startGameLoop() {
  lastTickTime = performance.now();
  requestAnimationFrame(loop);
}

function loop(now) {
  const dt = (now - lastTickTime) / 1000;
  lastTickTime = now;
  // Phase F-3: in network co-op, only the HOST runs the game simulation.
  // The guest renders state pushed from the host (see applyNetState).
  if (isNetCoopGuest()) {
    // Guest skips local tick — host owns truth. We still let render run so
    // sprite animations, HUD digits, etc. keep painting smoothly.
  } else {
    tick(dt);
    // Phase F-3: host broadcasts a snapshot at ~10 Hz to keep the guest in sync.
    if (isNetCoopHost() && _netInGame) {
      _netBroadcastAccum += dt;
      if (_netBroadcastAccum >= NET_BROADCAST_INTERVAL_S) {
        _netBroadcastAccum = 0;
        broadcastGameState();
      }
    }
  }
  requestAnimationFrame(loop);
}

function tick(dt) {
  if (state.screen !== 'battle') return;
  if (combat.status !== 'fighting') return;

  // Phase D-7.2: apply the game-speed factor to ALL time-based systems so that
  // changing speed acts like a true slow-motion. Otherwise (D-7 v1) only the
  // enemy charge slowed down, which made low speeds trivially easy because the
  // player's cooldowns kept firing at full pace. Combo-timeout stays on real
  // time since that's bound to the player's typing input, not in-game flow.
  const speed = getGameSpeedFactor();
  const sdt = dt * speed;

  // cooldowns
  for (const word in combat.cooldowns) {
    combat.cooldowns[word] -= sdt;
    if (combat.cooldowns[word] <= 0) delete combat.cooldowns[word];
  }

  // Update enemy statuses (burn ticks, decay)
  combat.enemyStatuses = combat.enemyStatuses.filter(function (st) {
    st.remaining -= sdt;
    if (STATUSES[st.type].tickDamage != null) {
      st.tickAccum = (st.tickAccum || 0) + sdt;
      while (st.tickAccum >= STATUSES[st.type].tickInterval) {
        st.tickAccum -= STATUSES[st.type].tickInterval;
        const tickDmg = STATUSES[st.type].tickDamage;
        combat.enemyHp = Math.max(0, combat.enemyHp - tickDmg);
        spawnDamageNumber(tickDmg, 'enemy', { tint: 'tick' });
        enemyHitFlash();
        if (combat.enemyHp <= 0) {
          combat.status = 'victory';
          combat.kills++; bumpLifetimeStat("totalKills");
          addGold(getGoldReward());
          updateHud();
          setTimeout(function () { showOverlay('victory'); }, 500);
          return false;
        }
      }
    }
    return st.remaining > 0;
  });

  // Update player statuses (burn ticks player too, decay)
  combat.playerStatuses = combat.playerStatuses.filter(function (st) {
    st.remaining -= sdt;
    if (STATUSES[st.type] && STATUSES[st.type].tickDamage != null) {
      st.tickAccum = (st.tickAccum || 0) + sdt;
      while (st.tickAccum >= STATUSES[st.type].tickInterval) {
        st.tickAccum -= STATUSES[st.type].tickInterval;
        const tickDmg = STATUSES[st.type].tickDamage;
        combat.playerHp = Math.max(0, combat.playerHp - tickDmg);
        spawnDamageNumber(tickDmg, 'player', { tint: 'tick' });
        playerHitFlash();
        if (combat.playerHp <= 0) {
          combat.status = 'defeat';
          setTimeout(function () { showOverlay('defeat'); }, 500);
          return false;
        }
      }
    }
    return st.remaining > 0;
  });

  // Enemy charge — PAUSED if frozen
  const isFrozen = combat.enemyStatuses.some(function (s) { return s.type === 'freeze'; });
  if (!isFrozen) {
    combat.charge -= sdt;
    if (combat.charge <= 0) {
      enemyAttack();
      combat.charge = combat.chargeMax;
    }
  }

  // Combo timeout: bound to player's typing input pace, NOT in-game time —
  // keep on real-time dt so combo windows don't change with speed setting.
  if (combat.combo > 0 && (performance.now() - combat.comboLastHit) / 1000 > TUNING.comboResetTime) {
    combat.combo = 0;
  }

  // Class passive ticks (regen, druid) also use scaled time.
  applyPassiveTicks(sdt);

  updateHud();
}

function applyPassiveTicks(dt) {
  const passive = CLASS_PASSIVES[state.heroL];
  if (!passive) return;
  if (passive.effect === 'low_hp_regen') {
    const pct = combat.playerHp / combat.playerMaxHp;
    if (pct <= 0.3 && combat.playerHp < combat.playerMaxHp && combat.playerHp > 0) {
      combat.druidRegenAccum = (combat.druidRegenAccum || 0) + dt;
      while (combat.druidRegenAccum >= 1.0) {
        combat.druidRegenAccum -= 1.0;
        const before = combat.playerHp;
        combat.playerHp = Math.min(combat.playerMaxHp, combat.playerHp + getPassiveValue(state.heroL));
        const healed = combat.playerHp - before;
        if (healed > 0) spawnDamageNumber(healed, 'player', { tint: 'heal' });
      }
    }
  } else if (passive.effect === 'regen') {
    combat.druidRegenAccum = (combat.druidRegenAccum || 0) + dt;
    const interval = getRegenInterval(state.heroL);
    while (combat.druidRegenAccum >= interval) {
      combat.druidRegenAccum -= interval;
      if (combat.playerHp < combat.playerMaxHp) {
        const before = combat.playerHp;
        combat.playerHp = Math.min(combat.playerMaxHp, combat.playerHp + getPassiveValue(state.heroL));
        const healed = combat.playerHp - before;
        if (healed > 0) spawnDamageNumber(healed, 'player', { tint: 'heal' });
      }
    }
  }
}

// Helpers for status management
function applyEnemyStatus(type) {
  // Refresh if same status already exists, else add
  const existing = combat.enemyStatuses.find(function (s) { return s.type === type; });
  if (existing) {
    existing.remaining = STATUSES[type].duration;
    existing.tickAccum = 0;
  } else {
    combat.enemyStatuses.push({
      type: type,
      remaining: STATUSES[type].duration,
      tickAccum: 0,
    });
  }
  flashStatusBanner(type, 'enemy');
}

function applyPlayerStatus(type) {
  const existing = combat.playerStatuses.find(function (s) { return s.type === type; });
  if (existing) {
    existing.remaining = STATUSES[type].duration;
  } else {
    combat.playerStatuses.push({
      type: type,
      remaining: STATUSES[type].duration,
    });
  }
  flashStatusBanner(type, 'player');
}

// ─── COMBAT ACTIONS ─────────────────────────────────
function activateSkill(word) {
  if (combat.status !== 'fighting') return false;
  if (combat.cooldowns[word] > 0) {
    flashCooldownReject(word);
    return false;
  }
  // Phase C-2.1: use findSkill() which checks equippedSkills first.
  const skill = findSkill(word);
  if (!skill) return false;
  // Must be currently equipped to activate
  // Phase E-3: in coop mode either P1 or P2 may own this skill
  const isEquippedP1 = (state.equippedSkills  || []).some(function (s) { return s.en === word; });
  const isEquippedP2 = (state.equippedSkillsR || []).some(function (s) { return s.en === word; });
  if (!isEquippedP1 && !isEquippedP2) return false;

  // Phase E-3: who's casting? Affects which passive + dmgMult applies.
  const activeHero = getSkillOwnerClass(word);

  // Per-skill cooldown (with Monk passive -20% + swift_wind item -10%)
  let cd = (skill.cooldown != null) ? skill.cooldown : TUNING.defaultCooldown;
  const passive = CLASS_PASSIVES[activeHero];
  if (passive && passive.effect === 'cd_reduction') {
    cd = cd * (1 - getPassiveValue(activeHero));
  }
  // Phase C-3: swift_wind item — multiplicative
  cd = cd * getItemMultiplier('cd_reduction');
  combat.cooldowns[word] = cd;
  flashSkillSlot(word);

  // Action dispatch — non-damage actions
  if (skill.action === 'heal') {
    // Phase C-2: each upgrade level adds +25% to heal amount
    const baseAmt = skill.amount || 20;
    const amt = Math.round(baseAmt * getSkillLevelMult(word));
    const before = combat.playerHp;
    combat.playerHp = Math.min(combat.playerMaxHp, combat.playerHp + amt);
    const healed = combat.playerHp - before;
    spawnDamageNumber(healed, 'player', { tint: 'heal' });
    playerHealFlash();
    spawnFxSprite('player', 'heal', { scale: 1.4 });

    // ─── Phase D-1: priest 'overheal_smite' — wasted heal becomes damage ──
    // Phase D-4: damage = wasted × 1.5 (was 1.0 — too weak as a "wasted heal")
    if (passive && passive.effect === 'overheal_smite') {
      const wasted = amt - healed;  // amount that would've gone over max HP
      if (wasted > 0) {
        const smiteDmg = Math.round(wasted * 1.5);
        combat.enemyHp = Math.max(0, combat.enemyHp - smiteDmg);
        spawnDamageNumber(smiteDmg, 'enemy', { tint: 'crit' });
        spawnFxSprite('enemy', 'explosion', { scale: 1.0 });
        enemyHitFlash();
        showEffectivenessBanner('SMITE!', 'crit');
        if (combat.enemyHp <= 0 && combat.status === 'fighting') {
          combat.status = 'victory';
          combat.kills++; bumpLifetimeStat("totalKills");
          addGold(getGoldReward());
          updateHud();
          spawnWord('ko', { variant: 'ko' });
          setTimeout(function () { showOverlay('victory'); }, 400);
        }
      }
    }
    // ─── Phase D-1: paladin 'heal_smite' — next attack doubles ──
    if (passive && passive.effect === 'heal_smite') {
      combat.paladinSmiteReady = true;
      flashStatusBanner('bless', 'player');
    }
    // ─── Phase D-1: skill-level 'attack_buff' special (e.g. 'bless') ──
    // Same flag as paladin smite — next attack hits ×2.
    if (skill.special === 'attack_buff') {
      combat.paladinSmiteReady = true;
      flashStatusBanner('bless', 'player');
    }
    return true;
  }

  if (skill.action === 'barrier') {
    // Phase C-2: each upgrade level adds +25% to barrier amount
    const baseAmt = skill.amount || 30;
    const amt = Math.round(baseAmt * getSkillLevelMult(word));
    combat.playerBarrierHp  = amt;
    combat.playerBarrierMax = amt;
    playerBarrierFlash();
    playBarrier();
    flashStatusBanner('barrier', 'player');
    spawnFxSprite('player', 'bubble', { scale: 1.6 });
    return true;
  }

  if (skill.action === 'guard') {
    applyPlayerStatus('guard');
    playerShieldFlash();
    return true;
  }

  if (skill.action === 'stall') {
    const amt = skill.amount || 2.0;
    combat.charge += amt;
    showEffectivenessBanner('+' + amt + 's', 'stall');
    return true;
  }

  if (skill.action === 'dodge') {
    applyPlayerStatus('dodge');
    return true;
  }

  // ─── Damage action ──────────────────────────────
  const baseDamage = TUNING.skillDamage(word);
  const skillEl  = skill.element || 'none';
  const enemyEl  = combat.enemyElement;
  const mult     = getElementalMultiplier(skillEl, enemyEl);

  // Mage passive: weakness damage +25%
  let elementMult = mult;
  if (mult >= 1.5 && passive && passive.effect === 'weakness_bonus') {
    elementMult = mult + getPassiveValue(activeHero);
  }

  // Crit chance
  let critChance = TUNING.critBaseChance;
  if (passive && passive.effect === 'crit_bonus') critChance += getPassiveValue(activeHero);
  critChance += getMetaBonus('crit');  // meta upgrade
  critChance += getItemModifier('crit_chance');  // Phase C-3: lucky_coin
  // Rogue passive: first hit on enemy is always crit (mastery: first 2 hits)
  let isCrit = Math.random() < critChance;
  if (passive && passive.effect === 'first_hit_crit') {
    const masterCount = getFirstHitCritCount(activeHero);
    if (combat.firstHitCount < masterCount) isCrit = true;
  }
  // Phase D-6: guaranteed crit from previous skill's 'crit_next' special
  if (combat.guaranteedCritNext) {
    isCrit = true;
    combat.guaranteedCritNext = false;
  }
  // Crit multiplier: base + crit_charm item bonus
  let critMultBase = TUNING.critMultiplier;
  if (isCrit) critMultBase += getItemModifier('crit_dmg');  // Phase C-3
  const critMult = isCrit ? critMultBase : 1.0;

  // Weaken debuff on player: outgoing damage -30%
  const weakened = combat.playerStatuses.some(function (s) { return s.type === 'weaken'; });
  const weakenMult = weakened ? (1 - STATUSES.weaken.value) : 1.0;

  // Combo bonus
  const comboMult = TUNING.comboBonus(combat.combo);

  // Dungeon temp damage buff
  const dungeonMult = (state.gameMode === 'dungeon') ? state.dungeonNextEnemyBuff : 1.0;

  // Meta damage bonus
  const metaDmgMult = 1 + getMetaBonus('damage');

  // Skill level mult (Phase C-2): each upgrade +25% damage
  const levelMult = getSkillLevelMult(word);

  // ─── Phase C-3: passive item modifiers ───
  // element_dmg: e.g. flame_amulet adds +20% for fire skills
  const itemElementMult = 1 + getItemModifier('element_dmg', skillEl);
  // combo_dmg: e.g. lightning_boots adds +15% if combo >= 5
  let itemComboMult = 1.0;
  findItemsByEffect('combo_dmg').forEach(function (m) {
    if (combat.combo >= (m.threshold || 5)) itemComboMult += m.value;
  });
  // first_hit_dmg: e.g. sharp_blade adds +30% on first hit
  let itemFirstHitMult = 1.0;
  if (combat.firstHitCount === 0) {  // first hit of this combat
    itemFirstHitMult += getItemModifier('first_hit_dmg');
  }

  // ─── Phase D-1: redesigned class passives (damage-modifying) ───
  // rogue 'variety_combo' — alternating skill use: different ×1.5, same ×0.5
  // Phase D-4: if player only has 1 attack skill equipped, no ×0.5 penalty
  //   (otherwise rogue would be punished for not having yet earned rewards)
  let varietyMult = 1.0;
  if (passive && passive.effect === 'variety_combo') {
    const attackSkills = (state.equippedSkills || []).filter(function (s) {
      return s.action === 'damage';
    });
    const hasMultipleAttacks = attackSkills.length > 1;
    if (combat.lastSkillWord && combat.lastSkillWord === word && hasMultipleAttacks) {
      varietyMult = 0.5;
    } else if (combat.lastSkillWord && combat.lastSkillWord !== word) {
      varietyMult = 1.5;
    }
    // (first cast of run, or only 1 attack skill: 1.0× neutral)
  }
  // ─── Phase D-1: smite-ready flag — applies ×2 to next damage ──
  // Set by: paladin 'heal_smite' passive on heal, 'focus' skill (next_x2),
  // 'bless' skill (attack_buff). Consumed by the first damage hit.
  let smiteMult = 1.0;
  if (combat.paladinSmiteReady) {
    smiteMult = 2.0;
    combat.paladinSmiteReady = false;
    spawnFxSprite('enemy', 'explosion', { scale: 1.0 });
  }

  // Phase D-2: class-specific damage multiplier (CLASSES.stats.dmgMult).
  // Phase E-3: in coop mode this uses the casting hero's stat.
  const classDef2 = CLASSES[activeHero];
  const classDmgMult = (classDef2 && classDef2.stats && classDef2.stats.dmgMult) || 1.0;

  // Final damage
  let final = Math.round(baseDamage * elementMult * critMult * weakenMult * comboMult *
                          dungeonMult * metaDmgMult * levelMult *
                          itemElementMult * itemComboMult * itemFirstHitMult *
                          varietyMult * smiteMult * classDmgMult);

  // ─── Phase D-1: monk 'double_strike' — split into 2 half-damage hits ──
  // Each hit halved; both apply on enemy. Show each hit as a separate number.
  let totalDealt = 0;
  if (passive && passive.effect === 'double_strike') {
    const halfHit = Math.max(1, Math.round(final * 0.5));
    combat.enemyHp = Math.max(0, combat.enemyHp - halfHit);
    totalDealt += halfHit;
    spawnDamageNumber(halfHit, 'enemy', { tint: isCrit ? 'crit' : 'normal' });
    // 2nd hit fires after a short delay for visible separation
    setTimeout(function () {
      if (combat.enemyHp > 0 || combat.status === 'fighting') {
        const h2 = Math.max(1, Math.round(final * 0.5));
        combat.enemyHp = Math.max(0, combat.enemyHp - h2);
        spawnDamageNumber(h2, 'enemy', { tint: isCrit ? 'crit' : 'normal' });
        enemyHitFlash();
        if (combat.enemyHp <= 0 && combat.status === 'fighting') {
          // Trigger victory from second hit
          combat.status = 'victory';
          combat.kills++; bumpLifetimeStat("totalKills");
          addGold(getGoldReward());
          updateHud();
          spawnWord('ko', { variant: 'ko' });
          setTimeout(function () { showOverlay('victory'); }, 400);
        }
      }
    }, 180);
  } else {
    combat.enemyHp = Math.max(0, combat.enemyHp - final);
    totalDealt = final;
  }

  // Track last-skill for rogue variety_combo (after dmg applies)
  combat.lastSkillWord = word;

  // ─── Phase D-1: druid 'spell_growth' — gain +1 max HP per attack ──
  // Stored in state.druidGrowthBonus so it persists across room resets and
  // is added back in resetBattle()'s max-HP calculation.
  if (passive && passive.effect === 'spell_growth') {
    const gain = passive.value || 1;
    state.druidGrowthBonus = (state.druidGrowthBonus || 0) + gain;
    combat.playerMaxHp += gain;
    combat.playerHp += gain;  // also heal so it feels rewarding immediately
    spawnDamageNumber(gain, 'player', { tint: 'heal' });
  }

  // ─── Phase C-3: lifesteal (vampire_fang) — based on total damage dealt ───
  const lifestealPct = getItemModifier('lifesteal');
  if (lifestealPct > 0 && totalDealt > 0 && combat.playerHp < combat.playerMaxHp) {
    const healed = Math.max(1, Math.round(totalDealt * lifestealPct));
    combat.playerHp = Math.min(combat.playerMaxHp, combat.playerHp + healed);
    spawnDamageNumber(healed, 'player', { tint: 'heal' });
  }

  // ─── Phase D-1/D-6: skill-level special effects ───────
  // skill.special tags:
  //   'gold_steal'     — +N gold
  //   'lifesteal'      — heal N% of damage dealt
  //   'next_x2'        — next attack ×2 (rogue stab/eye, archer aim, focus, attack_buff)
  //   'crit_next'      — next attack guaranteed crit (rogue stab, archer eye)
  //   'charge_reset'   — push enemy charge meter back to max
  //   'heal_self'      — heal self by N (druid tree)
  //   'stall'          — delay enemy charge by N sec (monk kick)
  if (skill.special && totalDealt > 0) {
    if (skill.special === 'gold_steal') {
      const amt = skill.amount || 10;
      addGold(amt);
      spawnDamageNumber('+' + amt + 'G', 'player', { tint: 'gold' });
    } else if (skill.special === 'lifesteal') {
      const pct = skill.amount || 0.5;
      const heal = Math.max(1, Math.round(totalDealt * pct));
      const before = combat.playerHp;
      combat.playerHp = Math.min(combat.playerMaxHp, combat.playerHp + heal);
      if (combat.playerHp > before) {
        spawnDamageNumber(combat.playerHp - before, 'player', { tint: 'heal' });
      }
    } else if (skill.special === 'next_x2') {
      combat.paladinSmiteReady = true;
      flashStatusBanner('bless', 'player');
    } else if (skill.special === 'crit_next') {
      // D-6: guarantee crit on next attack
      combat.guaranteedCritNext = true;
      flashStatusBanner('bless', 'player');
    } else if (skill.special === 'charge_reset') {
      combat.charge = combat.chargeMax;
      flashStatusBanner('freeze', 'enemy');
    } else if (skill.special === 'heal_self') {
      // D-6: druid tree — self heal on top of damage
      const amt = skill.amount || 15;
      const before = combat.playerHp;
      combat.playerHp = Math.min(combat.playerMaxHp, combat.playerHp + amt);
      if (combat.playerHp > before) {
        spawnDamageNumber(combat.playerHp - before, 'player', { tint: 'heal' });
      }
    } else if (skill.special === 'stall') {
      // D-6: monk kick — delay enemy charge
      const sec = skill.amount || 2.0;
      combat.charge = Math.min(combat.chargeMax, combat.charge + sec);
      flashStatusBanner('freeze', 'enemy');
    }
  }

  // ─── VFX: elemental sprite at enemy ───────────────
  // Pick fx by skill element; crit uses bigger 'explosion' instead.
  if (isCrit) {
    spawnFxSprite('enemy', 'explosion', { scale: 1.2 });
  } else {
    const fxKey = ELEMENT_FX[skillEl] || 'slash';
    spawnFxSprite('enemy', fxKey, { scale: 1.0 });
  }

  // Tint priority: crit > weakness > resist > normal
  // Phase D-1: monk double_strike already spawned its own damage numbers,
  // so skip the regular spawn for monk (avoid duplicate displays).
  const isDoubleStrike = passive && passive.effect === 'double_strike';
  if (!isDoubleStrike) {
    let tint = 'normal';
    if (isCrit)             tint = 'crit';
    else if (mult >= 1.5)   tint = 'weakness';
    else if (mult <= 0.5)   tint = 'resist';
    spawnDamageNumber(final, 'enemy', { tint: tint, mult: mult, crit: isCrit });
  }

  // Effectiveness banner + comic word (crit takes priority)
  if (isCrit) {
    showEffectivenessBanner('CRIT!', 'crit');
    // Random crit word for variety
    const critWords = ['perfect', 'bam', 'pow', 'awesome'];
    spawnWord(critWords[Math.floor(Math.random() * critWords.length)], { variant: 'crit' });
  } else if (mult >= 1.5) {
    showEffectivenessBanner('GOOD!', 'weakness');
    spawnWord('good', { variant: 'good' });
  } else if (mult <= 0.5) {
    showEffectivenessBanner('RESIST', 'resist');
    spawnWord('bad', { variant: 'bad' });
  }

  enemyHitFlash();

  // Combo increment (only on damage hit)
  combat.combo++;
  combat.comboLastHit = performance.now();
  combat.firstHit = false;
  combat.firstHitCount++;
  if (combat.combo >= 3 && [3,5,7,10].includes(combat.combo)) {
    showComboBanner(combat.combo);
    playCombo(combat.combo);
    // Comic word scales with combo height
    if      (combat.combo >= 10) spawnWord('wow',   { variant: 'combo-mega' });
    else if (combat.combo >= 7)  spawnWord('extra', { variant: 'combo-big' });
    else if (combat.combo >= 5)  spawnWord('combo', { variant: 'combo-big' });
    else                          spawnWord('combo', { variant: 'combo' });
  }

  if (skill.applies && Math.random() < (skill.applies.chance || 1.0)) {
    applyEnemyStatus(skill.applies.status);
  }

  if (combat.enemyHp <= 0) {
    combat.status = 'victory';
    combat.kills++; bumpLifetimeStat("totalKills");
    addGold(getGoldReward());
    updateHud();
    spawnWord('ko', { variant: 'ko' });
    setTimeout(function () { showOverlay('victory'); }, 500);
  }
  return true;
}

function enemyAttack() {
  let dmg = combat.enemyAtk;

  // Dodge: consume status if present, attack misses
  const dodgeIdx = combat.playerStatuses.findIndex(function (s) { return s.type === 'dodge'; });
  if (dodgeIdx !== -1) {
    combat.playerStatuses.splice(dodgeIdx, 1);
    showEffectivenessBanner('MISS!', 'dodge');
    spawnWord('miss', { variant: 'miss' });
    enemyLunge();
    // Phase C-3: mirror_shard — deal damage to enemy on dodge
    const counterDmg = getItemModifier('dodge_counter');
    if (counterDmg > 0) {
      combat.enemyHp = Math.max(0, combat.enemyHp - counterDmg);
      spawnDamageNumber(counterDmg, 'enemy', { tint: 'normal' });
      enemyHitFlash();
      if (combat.enemyHp <= 0) {
        combat.status = 'victory';
        combat.kills++; bumpLifetimeStat("totalKills");
        addGold(getGoldReward());
        updateHud();
        spawnWord('ko', { variant: 'ko' });
        setTimeout(function () { showOverlay('victory'); }, 500);
      }
    }
    return;
  }

  // Paladin passive: damage reduction -10%
  const passive = CLASS_PASSIVES[state.heroL];
  if (passive && passive.effect === 'damage_reduction') {
    dmg = Math.round(dmg * (1 - getPassiveValue(state.heroL)));
  }

  // Guard buff: -40% damage
  const guardStatus = combat.playerStatuses.find(function (s) { return s.type === 'guard'; });
  if (guardStatus) {
    dmg = Math.round(dmg * (1 - STATUSES.guard.value));
  }

  // Phase C-3: iron_skin — incoming damage reduction
  dmg = Math.round(dmg * getItemMultiplier('flat_dmg_taken'));

  // Barrier absorbs first
  if (combat.playerBarrierHp > 0) {
    const absorbed = Math.min(combat.playerBarrierHp, dmg);
    combat.playerBarrierHp -= absorbed;
    dmg -= absorbed;
    spawnDamageNumber(absorbed, 'player', { tint: 'absorb' });
    playerBarrierHitFlash();
    if (combat.playerBarrierHp === 0) {
      showEffectivenessBanner('BREAK!', 'resist');
      spawnWord('break', { variant: 'bad' });
    }
  }

  // Remaining to HP
  if (dmg > 0) {
    combat.playerHp = Math.max(0, combat.playerHp - dmg);
    playerHitFlash();
    spawnDamageNumber(dmg, 'player');
  }

  enemyLunge();

  // Apply enemy status to player (adversarial)
  const enemyMeta = ASSETS.enemies.find(function (e) { return e.id === state.enemy; });
  if (enemyMeta && enemyMeta.appliesOnAttack && combat.playerHp > 0) {
    if (Math.random() < (enemyMeta.appliesOnAttack.chance || 0)) {
      applyPlayerStatus(enemyMeta.appliesOnAttack.status);
    }
  }

  if (combat.playerHp <= 0) {
    combat.status = 'defeat';
    setTimeout(function () { showOverlay('defeat'); }, 500);
  }
}

// ─── VISUAL FEEDBACK ────────────────────────────────
function flashSkillSlot(word) {
  document.querySelectorAll('.skill-slot').forEach(function (slot) {
    if (slot.dataset.word === word) {
      slot.classList.add('active');
      setTimeout(function () { slot.classList.remove('active'); }, 600);
    }
  });
}

function flashCooldownReject(word) {
  document.querySelectorAll('.skill-slot').forEach(function (slot) {
    if (slot.dataset.word === word) {
      slot.classList.add('cd-reject');
      setTimeout(function () { slot.classList.remove('cd-reject'); }, 400);
    }
  });
}

function enemyHitFlash() {
  const wrap = document.querySelector('.stage-enemy-wrap');
  if (!wrap) return;
  wrap.classList.add('hit-flash');
  setTimeout(function () { wrap.classList.remove('hit-flash'); }, 200);
}

function playerHitFlash() {
  const card = document.querySelector('.hero-card.active-hero');
  if (card) {
    card.classList.add('hit-flash');
    setTimeout(function () { card.classList.remove('hit-flash'); }, 350);
  }
  const stage = document.getElementById('stage');
  if (stage) {
    stage.classList.add('shake');
    setTimeout(function () { stage.classList.remove('shake'); }, 350);
  }
}

function enemyLunge() {
  const wrap = document.querySelector('.stage-enemy-wrap');
  if (!wrap) return;
  wrap.classList.add('lunge');
  setTimeout(function () { wrap.classList.remove('lunge'); }, 400);
}

function spawnDamageNumber(amount, target, opts) {
  opts = opts || {};
  // Sound based on tint
  if (opts.tint === 'heal') {
    // healing sound only on player heal
    if (target === 'player') playHeal();
  } else if (opts.crit) {
    playCrit();
  } else if (opts.tint !== 'tick' && opts.tint !== 'absorb') {
    playHit();
  }
  const el = document.createElement('div');
  el.className = 'damage-number ' + target;
  if (opts.tint) el.classList.add('tint-' + opts.tint);
  if (opts.mult && opts.mult >= 1.5) el.classList.add('big');

  // If `amount` is already a formatted string (e.g. "+10G"), use as-is.
  // Otherwise prepend "+" for heal/gold, "-" for damage.
  let text;
  if (typeof amount === 'string') {
    text = amount;
  } else {
    const prefix = (opts.tint === 'heal' || opts.tint === 'gold') ? '+' : '-';
    text = prefix + amount;
  }
  el.textContent = text;

  let anchor;
  if (target === 'enemy') {
    anchor = document.querySelector('.stage-enemy-wrap');
  } else {
    anchor = document.querySelector('.hero-card.active-hero');
  }
  if (!anchor) return;

  const rect = anchor.getBoundingClientRect();
  const xJitter = (Math.random() - 0.5) * 60;
  el.style.left = (rect.left + rect.width / 2 + xJitter) + 'px';
  el.style.top  = (rect.top + rect.height * 0.3) + 'px';
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 1200);
}

function playerHealFlash() {
  const card = document.querySelector('.hero-card.active-hero');
  if (!card) return;
  card.classList.add('heal-flash');
  setTimeout(function () { card.classList.remove('heal-flash'); }, 600);
}

function playerShieldFlash() {
  const card = document.querySelector('.hero-card.active-hero');
  if (!card) return;
  card.classList.add('shield-flash');
  setTimeout(function () { card.classList.remove('shield-flash'); }, 500);
}

function playerBarrierFlash() {
  const card = document.querySelector('.hero-card.active-hero');
  if (!card) return;
  card.classList.add('barrier-flash');
  setTimeout(function () { card.classList.remove('barrier-flash'); }, 600);
}

function playerBarrierHitFlash() {
  const bar = document.querySelector('.hero-card.active-hero .hero-barrier');
  if (!bar) return;
  bar.classList.add('barrier-hit');
  setTimeout(function () { bar.classList.remove('barrier-hit'); }, 250);
}

function showEffectivenessBanner(text, kind) {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const banner = document.createElement('div');
  banner.className = 'effectiveness-banner ' + kind;
  banner.textContent = text;
  stage.appendChild(banner);
  setTimeout(function () { banner.remove(); }, 900);
}

// ─── SPRITE FX ──────────────────────────────────────
// Spawns a sprite-sheet animation at a target. Used for skill activations,
// enemy hits, healing, barrier, etc.
//
//   target — 'enemy' | 'player' | 'center'  (where to render)
//   fxKey  — key in FX_LIBRARY
//   opts   — { scale: 1.0, frameDuration: 40 (ms), tint: '#hex' }
function spawnFxSprite(target, fxKey, opts) {
  const meta = FX_LIBRARY[fxKey];
  if (!meta) return;
  opts = opts || {};
  const stage = document.getElementById('stage');
  if (!stage) return;

  // Locate anchor element
  let anchor;
  if (target === 'enemy')      anchor = document.querySelector('.stage-enemy-wrap');
  else if (target === 'player') anchor = stage;  // stage left-center area
  else                          anchor = stage;

  const div = document.createElement('div');
  div.className = 'fx-sprite';
  const scale = opts.scale || 1.0;
  const fw = meta.fw;
  const fh = meta.fh || fw;  // backward compat
  div.style.width  = fw + 'px';
  div.style.height = fh + 'px';
  div.style.backgroundImage = "url('" + meta.src + "')";
  // Explicit background-size = (frame width × frame count) × frame height.
  // Without this, browser scales the image based on container vs intrinsic
  // ratio, which mis-aligns when frames aren't square.
  div.style.backgroundSize = (fw * meta.fc) + 'px ' + fh + 'px';
  div.style.backgroundPosition = '0 0';
  div.style.transform = 'translate(-50%, -50%) scale(' + scale + ')';

  // Position relative to anchor
  if (target === 'enemy') {
    // Anchor fx center on the enemy sprite's actual body center.
    // The wrap contains: HP bar row → status icons → sprite (~160px) → shadow,
    // and sprite height varies per enemy, so measuring offsetTop+offsetHeight/2
    // is more reliable than a fixed bottom percentage.
    const sprite = anchor.querySelector('.stage-enemy');
    div.style.left = '50%';
    if (sprite && sprite.offsetHeight > 0) {
      div.style.top = (sprite.offsetTop + sprite.offsetHeight / 2) + 'px';
    } else {
      // Fallback (sprite not yet rendered)
      div.style.bottom = '40%';
    }
    anchor.appendChild(div);
  } else if (target === 'player') {
    // Player healing/barrier — render in lower-left area of stage
    div.style.left = '22%';
    div.style.bottom = '28%';
    stage.appendChild(div);
  } else {
    // Center of stage
    div.style.left = '50%';
    div.style.top  = '50%';
    stage.appendChild(div);
  }

  // Advance frames via setInterval (simple, sprite-agnostic)
  const frameDuration = opts.frameDuration || 40;
  let frame = 0;
  const fc = meta.fc;
  const tick = setInterval(function () {
    frame++;
    if (frame >= fc) {
      clearInterval(tick);
      if (div.parentNode) div.remove();
      return;
    }
    div.style.backgroundPosition = (-frame * fw) + 'px 0';
  }, frameDuration);
}

// ─── WORD POPUPS ────────────────────────────────────
// Floats a comic-style word PNG up the screen, then fades out.
//   name — base filename (no .png) in assets/words/
//   opts — { variant: 'crit'|'combo'|'miss'|'ko'|'wow' (sets size/duration) }
function spawnWord(name, opts) {
  const stage = document.getElementById('stage');
  if (!stage) return;
  opts = opts || {};
  const img = document.createElement('img');
  img.className = 'word-popup ' + (opts.variant ? 'wp-' + opts.variant : '');
  img.src = wordSrc(name);
  img.alt = name;
  // Small random horizontal jitter so consecutive words don't stack
  const jitter = (Math.random() - 0.5) * 80;
  img.style.left = 'calc(50% + ' + jitter.toFixed(0) + 'px)';
  stage.appendChild(img);
  // Auto-remove after animation duration (matches CSS)
  setTimeout(function () { if (img.parentNode) img.remove(); }, 1200);
}

function showComboBanner(count) {
  const stage = document.getElementById('stage');
  if (!stage) return;
  const banner = document.createElement('div');
  banner.className = 'combo-banner combo-' + count;
  banner.textContent = 'x' + count + ' COMBO!';
  stage.appendChild(banner);
  setTimeout(function () { banner.remove(); }, 1100);
}

function flashStatusBanner(type, target) {
  const stage = document.getElementById('stage');
  if (!stage) return;
  // Allow synthetic 'barrier' type even though it's not in STATUSES
  const meta = STATUSES[type] || { kr: 'Barrier', color: '#22d3ee' };
  const banner = document.createElement('div');
  banner.className = 'status-banner status-' + type + ' status-target-' + target;
  banner.textContent = meta.kr + '!';
  stage.appendChild(banner);
  setTimeout(function () { banner.remove(); }, 1000);
}

// ─── HUD UPDATE ─────────────────────────────────────
function updateHud() {
  // Enemy HP
  const enemyPct = (combat.enemyHp / combat.enemyMaxHp) * 100;
  const enemyFill = document.querySelector('.hp-fill');
  const enemyTxt  = document.querySelector('.hp-text');
  if (enemyFill) enemyFill.style.width = enemyPct + '%';
  if (enemyTxt)  enemyTxt.textContent  = 'HP ' + Math.round(combat.enemyHp) + '/' + combat.enemyMaxHp;

  // Enemy element badge
  updateElementBadge();

  // Enemy status icons
  updateStatusIcons('enemy', combat.enemyStatuses);
  updateStatusIcons('player', combat.playerStatuses);

  // Charge timer
  // Phase D-7: campaign stages 1-3 use charge=9999 to disable enemy attacks
  // ("learning mode"). Show "Practice mode" instead of the giant number.
  const isPracticeMode = combat.chargeMax >= 100;
  const chargePct = isPracticeMode ? 100 : Math.max(0, (combat.charge / combat.chargeMax) * 100);
  const chargeFill = document.getElementById('charge-fill');
  const chargeTxt  = document.getElementById('charge-text');
  const isFrozen   = combat.enemyStatuses.some(function (s) { return s.type === 'freeze'; });
  if (chargeFill) chargeFill.style.width = chargePct + '%';
  if (chargeTxt) {
    if (isPracticeMode) {
      chargeTxt.textContent = 'Practice';
    } else if (isFrozen) {
      chargeTxt.textContent = 'Ice!';
    } else {
      chargeTxt.textContent = combat.charge.toFixed(1) + 's';
    }
  }
  if (chargeFill) {
    if (isPracticeMode) {
      chargeFill.style.background = 'linear-gradient(90deg, #94a3b8, #64748b)';  // 회색
    } else if (isFrozen) {
      chargeFill.style.background = 'linear-gradient(90deg, #22d3ee, #06b6d4)';
    } else if (combat.charge < 2) {
      chargeFill.style.background = 'linear-gradient(90deg, #ff4444, #ff0000)';
    } else {
      chargeFill.style.background = 'linear-gradient(90deg, var(--accent-2), var(--accent))';
    }
  }

  // Player HP — Phase E-3 fix: update ALL active hero cards (both in coop).
  // HP is a shared pool, so both cards show the same value/bar.
  const heroCards = document.querySelectorAll('.hero-card.active-hero');
  heroCards.forEach(function (heroCard) {
    const fill = heroCard.querySelector('.hero-hp-fill');
    const txt  = heroCard.querySelector('.hero-hp-text');
    const pct  = (combat.playerHp / combat.playerMaxHp) * 100;
    if (fill) fill.style.width = pct + '%';
    if (txt) {
      const prefix = state.coopMode ? '🤝 ' : '';
      txt.textContent = prefix + 'HP ' + Math.round(combat.playerHp) + '/' + combat.playerMaxHp;
    }
    if (fill) {
      if (pct < 30)      fill.style.background = 'linear-gradient(180deg, #ef4444, #b91c1c)';
      else if (pct < 60) fill.style.background = 'linear-gradient(180deg, #f59e0b, #d97706)';
      else               fill.style.background = 'linear-gradient(180deg, var(--hp-green), #16a34a)';
    }

    // Barrier bar (only shown when active)
    const barrierEl = heroCard.querySelector('.hero-barrier');
    if (barrierEl) {
      if (combat.playerBarrierHp > 0) {
        barrierEl.style.display = 'block';
        const bPct = (combat.playerBarrierHp / combat.playerBarrierMax) * 100;
        const bFill = barrierEl.querySelector('.hero-barrier-fill');
        const bTxt  = barrierEl.querySelector('.hero-barrier-text');
        if (bFill) bFill.style.width = bPct + '%';
        if (bTxt)  bTxt.textContent  = '🛡 ' + combat.playerBarrierHp + '/' + combat.playerBarrierMax;
      } else {
        barrierEl.style.display = 'none';
      }
    }
  });

  // Combo counter
  updateComboDisplay();

  // Cooldown overlays — per-skill duration
  document.querySelectorAll('.hero-card.active-hero .skill-slot').forEach(function (slot) {
    const word = slot.dataset.word;
    const cd = combat.cooldowns[word];
    const ov = slot.querySelector('.skill-cd-overlay');
    // Look up this skill's full cooldown for accurate height %
    const skill = findSkill(word);
    const fullCd = (skill && skill.cooldown != null) ? skill.cooldown : TUNING.defaultCooldown;
    if (cd && cd > 0 && ov) {
      slot.classList.add('on-cd');
      ov.style.height = (cd / fullCd) * 100 + '%';
    } else {
      slot.classList.remove('on-cd');
      if (ov) ov.style.height = '0%';
    }
  });

  // Kill counter
  const killEl = document.getElementById('kill-counter');
  if (killEl) killEl.textContent = combat.kills;

  // Gold counter (Phase C-2)
  const goldEl = document.getElementById('gold-counter');
  if (goldEl) goldEl.textContent = myGold();

  // Items bar (Phase C-3)
  renderItemsBar();
}

// Phase C-3: render passive item icons in the topbar.
// Each chip has a native title attribute for hover-tooltip showing effect.
function renderItemsBar() {
  const bar = document.getElementById('items-bar');
  if (!bar) return;
  if (!state.items || state.items.length === 0) { bar.innerHTML = ''; return; }
  bar.innerHTML = state.items.map(function (id) {
    const m = PASSIVE_ITEMS_BY_ID[id];
    if (!m) return '';
    const tooltip = (m.name + ': ' + m.desc).replace(/"/g, '&quot;');
    return '<span class="item-chip" title="' + tooltip + '">' +
           '<img src="assets/icons/' + m.icon + '.png" alt="' + m.id + '">' +
           '</span>';
  }).join('');
}

function updateElementBadge() {
  const badge = document.getElementById('enemy-element-badge');
  if (!badge) return;
  const el = combat.enemyElement;
  const meta = ELEMENTS[el];
  if (!meta || el === 'none') {
    badge.style.display = 'none';
    return;
  }
  badge.style.display = 'flex';
  badge.style.background = meta.color;
  badge.style.borderColor = meta.light;
  badge.querySelector('.eb-emoji').textContent = meta.emoji;
  badge.querySelector('.eb-name').textContent  = meta.kr;
}

function updateStatusIcons(target, statuses) {
  const containerSel = target === 'enemy'
    ? '#enemy-status-icons'
    : '.hero-card.active-hero .hero-status-icons';
  const container = document.querySelector(containerSel);
  if (!container) return;

  container.innerHTML = '';
  statuses.forEach(function (st) {
    const meta = STATUSES[st.type];
    if (!meta) return;
    const wrap = document.createElement('div');
    wrap.className = 'status-icon status-icon-' + st.type;
    wrap.style.background = meta.color;
    wrap.title = meta.kr;
    const remain = Math.max(0, st.remaining);
    wrap.innerHTML =
      '<img src="assets/icons/' + meta.icon + '.png" alt="' + st.type + '">' +
      '<span class="si-time">' + remain.toFixed(1) + 's</span>';
    container.appendChild(wrap);
  });
}

function updateComboDisplay() {
  const el = document.getElementById('combo-display');
  if (!el) return;
  if (combat.combo < 3) {
    el.style.display = 'none';
    return;
  }
  el.style.display = 'flex';
  const bonus = Math.round((TUNING.comboBonus(combat.combo) - 1) * 100);
  el.querySelector('.combo-count').textContent = 'x' + combat.combo;
  el.querySelector('.combo-bonus').textContent = '+' + bonus + '%';
}

// ─── OVERLAY ────────────────────────────────────────
function showOverlay(kind) {
  const ov = document.getElementById('battle-overlay');
  if (!ov) return;
  // Sound feedback
  if (kind === 'victory') playVictory();
  else if (kind === 'defeat') { playDefeat(); BGM.play('defeat'); }
  // Phase F-5: only broadcast defeat; victories cascade through the
  // dungeon/floor clear screens which already broadcast.
  if (kind === 'defeat' && isNetCoopHost()) {
    broadcastEndScreen('defeat', {});
  }
  ov.classList.remove('hidden', 'victory', 'defeat');
  ov.classList.add(kind);
  const enemyMeta = ASSETS.enemies.find(function (e) { return e.id === state.enemy; });
  const enemyName = enemyMeta ? enemyMeta.name : state.enemy;

  if (state.gameMode === 'campaign') {
    if (kind === 'victory') {
      const stageNum = state.campaignStage;
      const isFinal = stageNum >= CAMPAIGN_STAGES.length;
      document.getElementById('overlay-title').textContent = isFinal ? 'CLEAR!' : 'STAGE ' + stageNum + ' Clear!';
      document.getElementById('overlay-sub').textContent   = enemyName + ' kills · ' +
        (isFinal ? 'Campaign Clear!' : 'Advancing to next stage...');
      document.getElementById('overlay-action').textContent = isFinal ? '🎉 View ending' : '▶ Continue now';
    } else {
      document.getElementById('overlay-title').textContent = 'DEFEAT';
      document.getElementById('overlay-sub').textContent   = 'Stage ' + state.campaignStage + ' retry';
      document.getElementById('overlay-action').textContent = '↻ Retry';
    }
  } else if (state.gameMode === 'dungeon') {
    if (kind === 'victory') {
      const isFinalRoom = state.dungeonRoom >= DUNGEON.totalRooms;
      const isFinalFloor = state.dungeonFloor >= MAX_FLOOR;
      const roomType = state.dungeonRoomTypes[state.dungeonRoom - 1];
      let title, sub, action;
      if (isFinalRoom && isFinalFloor) {
        title = 'DUNGEON CLEAR!';
        sub = 'Floor 3 boss defeated · dungeon conquered!';
        action = '🏆 See results';
      } else if (isFinalRoom) {
        title = 'FLOOR ' + state.dungeonFloor + ' CLEAR!';
        sub = 'Press Enter for the next floor';
        action = '▶ See results';
      } else if (roomType === 'challenge') {
        title = 'Challenge conquered!';
        sub = enemyName + ' · Pick a powerful skill';
        action = '✨ View skills';
      } else {
        title = 'Room ' + state.dungeonRoom + ' Clear';
        sub = enemyName + ' kills · Choose reward!';
        action = '▶ Choose reward';
      }
      document.getElementById('overlay-title').textContent = title;
      document.getElementById('overlay-sub').textContent = sub;
      document.getElementById('overlay-action').textContent = action;
    } else {
      document.getElementById('overlay-title').textContent = 'DEFEAT';
      document.getElementById('overlay-sub').textContent   = 'F' + state.dungeonFloor + ' Room ' + state.dungeonRoom + ' died · Essence lost';
      document.getElementById('overlay-action').textContent = '↻ Main menu';
    }
  } else {
    document.getElementById('overlay-title').textContent = kind === 'victory' ? 'VICTORY!' : 'DEFEAT';
    document.getElementById('overlay-sub').textContent   = kind === 'victory'
      ? enemyName + ' kills!'
      : 'Give it another try';
    document.getElementById('overlay-action').textContent = kind === 'victory' ? '▶ Next enemy' : '↻ Retry';
  }

  // Auto-advance in campaign on victory
  if (state.gameMode === 'campaign' && kind === 'victory') {
    onCampaignVictory();
  }
  // Auto-advance in dungeon on victory
  if (state.gameMode === 'dungeon' && kind === 'victory') {
    onDungeonVictory();
  }
}

function hideOverlay() {
  const ov = document.getElementById('battle-overlay');
  if (ov) ov.classList.add('hidden');
}

function onOverlayAction() {
  if (state.gameMode === 'campaign') {
    if (combat.status === 'victory') {
      // onCampaignVictory already handles advance; here just hide overlay
      hideOverlay();
    } else {
      // retry same stage
      resetBattle();
      render();
    }
  } else if (state.gameMode === 'dungeon') {
    if (combat.status === 'victory') {
      // onDungeonVictory triggers reward screen (or clear screen). Just close overlay.
      hideOverlay();
    } else {
      // defeat = run ends; reset dungeon state and go to main menu
      state.dungeonFloor = 1;
      state.dungeonRoom = 1;
      state.dungeonNextEnemyBuff = 1.0;
      state.dungeonExtraSkills = [];
      state.dungeonEnemySequence = [];
      state.dungeonRoomTypes = [];
      state.dungeonEssenceEarned = 0;  // lost on death
      clearDungeonRun();               // Phase F-7: death wipes the resume save
      hideOverlay();
      showMainMenu();
    }
  } else {
    if (combat.status === 'victory') {
      const others = ASSETS.enemies.filter(function (e) { return e.id !== state.enemy; });
      state.enemy = others[Math.floor(Math.random() * others.length)].id;
      document.getElementById('sel-enemy').value = state.enemy;
      resetBattle();
      renderStage();
      render();
    } else {
      resetBattle();
      render();
    }
  }
}

// ─── TYPING ─────────────────────────────────────────
// Phase D-4: typing input handler — reusable from physical + virtual keyboard.
// `key` matches the same names as KeyboardEvent.key.
function handleTypeInput(key) {
  // Block all typing while not on battle screen
  if (state.screen !== 'battle') {
    if (key === 'Enter' && state.pendingHero) {
      document.getElementById('cs-start-btn').click();
    }
    return;
  }
  if (combat.status !== 'fighting') {
    if (key === ' ' || key === 'Enter') onOverlayAction();
    return;
  }
  if (key === 'Backspace') {
    state.typed = state.typed.slice(0, -1);
    updateTypeDisplay();
    return;
  }
  if (key === 'Escape' || key === ' ') {
    state.typed = '';
    updateTypeDisplay();
    return;
  }
  if (key.length === 1 && /^[a-zA-Z]$/.test(key)) {
    state.typed += key.toLowerCase();
    if (window.Learning) Learning.onKey(key.toLowerCase());
    updateTypeDisplay();
    tryMatch();
  }
}

function bindTyping() {
  document.addEventListener('keydown', function (e) {
    if (e.target.matches('select, button, input')) return;
    handleTypeInput(e.key);
    // Prevent default for keys we consumed
    if (e.key === 'Escape' || e.key === ' ' ||
        (state.screen === 'battle' && e.key.length === 1 && /^[a-zA-Z]$/.test(e.key))) {
      e.preventDefault();
    }
  });

  // Phase D-4: virtual keyboard buttons → forward to handleTypeInput
  const vk = document.getElementById('virtual-keyboard');
  if (vk) {
    vk.querySelectorAll('.vk-key').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        const k = btn.dataset.k;
        handleTypeInput(k);
        playClick();
      });
      // Prevent button focus stealing on touch
      btn.addEventListener('mousedown', function (e) { e.preventDefault(); });
      btn.addEventListener('touchstart', function (e) {
        e.preventDefault();
        const k = btn.dataset.k;
        handleTypeInput(k);
        playClick();
      }, { passive: false });
    });
  }

  const ovBtn = document.getElementById('overlay-action');
  if (ovBtn) ovBtn.addEventListener('click', onOverlayAction);
}

// Phase D-4: detect touch device and toggle virtual keyboard visibility.
// We attach 'has-touch' to <body> on any pointer:coarse media or maxTouchPoints>0.
function detectTouchDevice() {
  const hasTouch = ('ontouchstart' in window) ||
                   (navigator.maxTouchPoints && navigator.maxTouchPoints > 0) ||
                   window.matchMedia('(pointer: coarse)').matches;
  if (hasTouch) {
    document.body.classList.add('has-touch');
  }
}

function updateTypeDisplay() {
  const disp = document.getElementById('type-display');
  if (!disp) return;
  if (state.typed === '') {
    disp.innerHTML = '<span class="type-cursor">_</span>';
  } else {
    const activeSkills = getActiveSkillWords();
    const isPrefix = activeSkills.some(function (w) { return w.startsWith(state.typed); });
    disp.innerHTML = isPrefix
      ? '<span class="type-valid">' + state.typed + '</span><span class="type-cursor">|</span>'
      : '<span class="type-invalid">' + state.typed + '</span><span class="type-cursor">|</span>';
  }
}

// Returns the list of skill words available to type RIGHT NOW.
// Includes class default skills + any rare skills discovered in dungeon mode.
function getActiveSkillWords() {
  // Phase C-2.1: equippedSkills is the single source of truth.
  // Phase E-3: in coop mode, P2's equipped skills also count.
  const words = (state.equippedSkills || []).map(function (s) { return s.en; });
  if (state.coopMode && state.equippedSkillsR) {
    state.equippedSkillsR.forEach(function (s) {
      if (words.indexOf(s.en) === -1) words.push(s.en);
    });
  }
  return words;
}

// Phase F-6.1: which words can THIS player (local UI) actually fire?
// In network co-op, host fires P1 only; guest fires P2 only.
// In solo / local co-op, all equipped words are fireable.
function getOwnSkillWords() {
  if (!isNetCoop()) return getActiveSkillWords();
  const slot = isNetCoopHost()
    ? (state.equippedSkills  || [])
    : (state.equippedSkillsR || []);
  return slot.map(function (s) { return s.en; });
}

// Phase F-6.1: words equipped by the OTHER player. Used to detect when the
// user accidentally typed a partner skill (we show a brief hint).
function getPartnerSkillWords() {
  if (!isNetCoop()) return [];
  const slot = isNetCoopHost()
    ? (state.equippedSkillsR || [])
    : (state.equippedSkills  || []);
  return slot.map(function (s) { return s.en; });
}

// Phase E-3: which hero "owns" this skill activation?
//   - solo mode: always heroL
//   - coop mode:
//       1) skill equipped on P2 → heroR
//       2) word pack with classId matching heroR → heroR
//       3) otherwise → heroL (covers heroL skills, common, rare, P1 word packs)
function getSkillOwnerClass(word) {
  if (!state.coopMode) return state.heroL;
  // P2's equipped skills
  if ((state.equippedSkillsR || []).some(function (s) { return s.en === word; })) {
    return state.heroR;
  }
  // P1's equipped skills (explicit check — covers P1's class word that's
  // also in P2's class catalog though equippedSkills should be distinct)
  if ((state.equippedSkills || []).some(function (s) { return s.en === word; })) {
    return state.heroL;
  }
  // Word pack ownership (by classId)
  const packInfo = findPackForSkill(word);
  if (packInfo) {
    if (packInfo.pack.classId === state.heroR) return state.heroR;
    if (packInfo.pack.classId === state.heroL) return state.heroL;
  }
  // Default to P1 (common/rare/uncertain)
  return state.heroL;
}

function tryMatch() {
  const typed = state.typed;
  const own = getOwnSkillWords();

  // Phase F-6.1: in net co-op, only fire the player's OWN skills.
  // Partner's words are completely passive — they don't match anything for
  // this player, just like any unrelated letters.
  if (own.includes(typed)) {
    if (window.Learning) Learning.onWord(typed);
    // Full match on a skill I own — always clear input, even if rejected by cooldown.
    if (isNetCoopGuest()) {
      sendNetInput(typed);  // ask host to activate on our behalf
    } else {
      activateSkill(typed);
    }
    state.typed = '';
    setTimeout(updateTypeDisplay, 50);
    return;
  }
  // Still typing toward something I own? Keep it. Otherwise reset.
  const stillValid = own.some(function (w) { return w.startsWith(typed); });
  if (!stillValid && typed.length > 0) {
    setTimeout(function () {
      if (state.typed === typed) {
        state.typed = '';
        updateTypeDisplay();
      }
    }, 300);
  }
}

// ─── BOOT ───────────────────────────────────────────
// Scripts (net.js / app.js / learning.js) are loaded at the bottom of <body>,
// so the DOM is parsed by the time this runs. Don't wait for DOMContentLoaded —
// it gets delayed by stalled defer scripts (notably the Cloudflare Insights
// beacon, which intermittently times out on KR networks and would otherwise
// leave the menu blank for ~30s before init() fires).
init();
