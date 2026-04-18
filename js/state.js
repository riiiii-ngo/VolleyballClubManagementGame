// ============================================================
// state.js - ゲーム状態管理
// 保存戦略: メモリ(G) → localStorage(即時) → Supabase(非同期)
// 読み込み: Supabase優先、失敗時はlocalStorageフォールバック
// ============================================================

const SAVE_KEY = 'volleyball_game_save';

// デフォルト状態
function createDefaultState() {
  return {
    year: 1,
    week: 0,             // 0=4月1週 ... 47=3月4週
    points: 100,         // ショップポイント
    repPoints: 0,        // 評判ポイント
    reputation: 0,       // 0=弱小...4=プロ養成校
    players: [],         // 選手一覧
    nextPlayerId: 1,
    starters: {          // スタメン (選手ID or null)
      OH1: null, OH2: null,
      MB1: null, MB2: null,
      OP:  null,
      Se:  null,
      Li:  null,
    },
    practiceGroups: [[], []],  // グループ毎の選手ID配列
    inventory: [],       // 所持アイテム [{id, effect, duration?}]
    facilities: [],      // 設置済み設備 [{id, effect}]
    activeEfficiency: null, // {effect, weeksLeft} アイテムによる練習効率UP
    tournaments: {
      prefectural:   { eliminated: false, champion: false, currentRound: 0 },
      interhigh:     { eliminated: false, champion: false, currentRound: 0 },
      spring_prelim: { eliminated: false, champion: false, currentRound: 0 },
      spring:        { eliminated: false, champion: false, currentRound: 0 },
    },
    matchLog: [],        // 試合ログ [{week, name, result, log, score}]
    weeklyLog: [],       // 今週の出来事
    weeklyResults: [],   // 今週の成長結果詳細
    practiceSelections: {}, // グループ毎の選択練習メニューID {groupIndex: menuId}
    restingPlayerIds: [],   // 個別に休憩させる選手のID
    pendingScouts: [],      // 来年度入部予定のスカウト選手
    gameOver: false,
    titleScreenDone: false,
  };
}

// ==============================
// 保存・読み込み
// ==============================

/**
 * ゲーム状態を保存する
 * 1. メモリ(G)はすでに更新済み（呼び出し元で更新）
 * 2. localStorageへ即時書き込み（同期）
 * 3. Supabaseへ非同期書き込み（fire-and-forget）
 */
function saveGame(state) {
  // localStorage即時書き込み（高速・オフライン対応）
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch(e) {
    console.error('localStorage save failed:', e);
  }
  // Supabase非同期書き込み（Promiseを返すことで待機可能にする）
  return saveToDB(state).catch(e => {
    console.error('Supabase save failed:', e);
    throw e;
  });
}

/**
 * ゲーム状態を読み込む
 * Supabase優先、失敗時はlocalStorageフォールバック
 * @returns {Promise<Object|null>}
 */
async function loadGame(userId = null) {
  // Supabaseから読み込み試行
  try {
    const dbState = await loadFromDB(userId);
    if (dbState) {
      const migrated = migrateState(dbState);
      // ローカルキャッシュも更新
      localStorage.setItem(SAVE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch(e) {
    console.error('Supabase load failed, falling back to localStorage:', e);
  }
  // フォールバック: localStorage
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const state = JSON.parse(raw);
      return migrateState(state);
    }
  } catch(e) {
    console.error('localStorage load failed:', e);
  }
  return null;
}

/**
 * 状態の互換性を確保する (新フィールドの追加など)
 */
function migrateState(state) {
  if (!state) return state;
  const def = createDefaultState();
  
  // restingPlayerIds の初期化
  if (state.restingPlayerIds === undefined) {
    state.restingPlayerIds = [];
  }
  
  // その他の将来的なフィールド追加にも対応しやすいように
  return state;
}

/**
 * セーブデータが存在するか確認する
 * @returns {Promise<boolean>}
 */
async function hasSave(userId = null) {
  try {
    const dbState = await loadFromDB(userId);
    if (dbState) return true;
  } catch(e) {}
  return !!localStorage.getItem(SAVE_KEY);
}

/**
 * セーブデータを削除する（DBとlocalStorage両方）
 */
async function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
  await deleteSaveFromDB().catch(e => console.error('Supabase delete failed:', e));
}

// ==============================
// 現在の日付情報
// ==============================
function getDateInfo(week) {
  const monthIndex = Math.floor(week / 4);
  const weekInMonth = (week % 4) + 1;
  const month = MONTHS[monthIndex];
  return { month, weekInMonth, monthName: MONTH_NAMES[month] };
}

function getDateString(week) {
  const { monthName, weekInMonth } = getDateInfo(week);
  return `${monthName} 第${weekInMonth}週`;
}

// ==============================
// 評判管理
// ==============================
function getReputation(state) {
  for (let i = REPUTATION_THRESHOLDS.length - 1; i >= 0; i--) {
    if (state.repPoints >= REPUTATION_THRESHOLDS[i]) return i;
  }
  return 0;
}

function addRepPoints(state, pts) {
  state.repPoints = Math.max(0, state.repPoints + pts);
  state.reputation = getReputation(state);
}

/**
 * 状態オブジェクトに必要なフィールドが欠けている場合（旧セーブデータ等）に補填する
 */
function ensureStateFields(state) {
  if (!state.restingPlayerIds) state.restingPlayerIds = [];
  if (!state.weeklyResults) state.weeklyResults = [];
  if (!state.practiceSelections) state.practiceSelections = {};
  if (!state.pendingScouts) state.pendingScouts = [];
  return state;
}

// ==============================
// 練習グループ管理
// ==============================
function maxPracticeGroups(reputation) {
  if (reputation >= 3) return 4;
  if (reputation >= 2) return 3;
  return 2;
}

function ensurePracticeGroups(state) {
  const max = maxPracticeGroups(state.reputation);
  while (state.practiceGroups.length < max) state.practiceGroups.push([]);
  // 超過分は削除せず、UIで非表示にする
}

// ==============================
// 選手取得ヘルパー
// ==============================
function getPlayer(state, id) {
  return state.players.find(p => p.id === id) || null;
}

function getStarters(state) {
  const result = {};
  for (const [slot, id] of Object.entries(state.starters)) {
    result[slot] = id ? getPlayer(state, id) : null;
  }
  return result;
}

function getStarterList(state) {
  return Object.values(state.starters)
    .filter(id => id)
    .map(id => getPlayer(state, id))
    .filter(Boolean);
}

// スタメンが最低6名（リベロ以外）揃っているか
function isStarterComplete(state) {
  const requiredSlots = ['OH1', 'OH2', 'MB1', 'MB2', 'OP', 'Se'];
  return requiredSlots.every(slot => state.starters[slot] !== null);
}

// ==============================
// 練習効率計算
// ==============================
function getPracticeEfficiency(state) {
  let bonus = 0;
  // アイテム効果
  if (state.activeEfficiency) {
    bonus += EFFICIENCY_BONUS[state.activeEfficiency.effect] || 0;
  }
  // 設備効果
  for (const fac of state.facilities) {
    bonus += EFFICIENCY_BONUS[fac.effect] || 0;
  }
  return 1 + bonus;
}

// ==============================
// アイテム使用
// ==============================
function useItem(state, itemIndex) {
  const invItem = state.inventory[itemIndex];
  if (!invItem) return { success: false, msg: 'アイテムが見つかりません' };
  const itemDef = ITEMS.find(i => i.id === invItem.id);
  if (!itemDef) return { success: false, msg: '不明なアイテムです' };

  let msg = '';
  switch (itemDef.effect) {
    case 'stamina_small':
      state.players.forEach(p => {
        p.currentStamina = Math.min(p.maxStamina, p.currentStamina + STAMINA_RECOVERY.stamina_small);
      });
      msg = `${itemDef.name}を使用。スタミナが少し回復した。`;
      break;
    case 'stamina_medium':
      state.players.forEach(p => {
        p.currentStamina = Math.min(p.maxStamina, p.currentStamina + STAMINA_RECOVERY.stamina_medium);
      });
      msg = `${itemDef.name}を使用。スタミナが回復した。`;
      break;
    case 'stamina_all':
      state.players.forEach(p => {
        p.currentStamina = Math.min(p.maxStamina, p.currentStamina + STAMINA_RECOVERY.stamina_all);
      });
      msg = `${itemDef.name}を使用。全員のスタミナが回復した。`;
      break;
    case 'efficiency_small':
    case 'efficiency_medium':
      if (state.activeEfficiency) {
        state.activeEfficiency.weeksLeft += itemDef.duration;
        msg = `${itemDef.name}を使用。練習効率UPの期間が${itemDef.duration}週延長された。`;
      } else {
        state.activeEfficiency = { effect: itemDef.effect, weeksLeft: itemDef.duration };
        msg = `${itemDef.name}を使用。${itemDef.duration}週の間、練習効率が上がる。`;
      }
      break;
    case 'scout':
    case 'scout_gold':
      return { success: true, msg: 'scout', isScout: true, isGold: itemDef.effect === 'scout_gold', itemIndex };
    default:
      return { success: false, msg: '使用できません' };
  }

  state.inventory.splice(itemIndex, 1);
  return { success: true, msg };
}

// ==============================
// 週進行の補助
// ==============================
function advanceWeekEffects(state) {
  // 練習効率アイテムのカウントダウン
  if (state.activeEfficiency) {
    state.activeEfficiency.weeksLeft--;
    if (state.activeEfficiency.weeksLeft <= 0) {
      state.activeEfficiency = null;
    }
  }

  // ケガ選手の回復カウントダウン
  state.players.forEach(p => {
    if (!p.isInjured) return;
    p.injuryRemainingWeeks = Math.max(0, (p.injuryRemainingWeeks || 1) - 1);
    if (p.injuryRemainingWeeks <= 0) {
      p.isInjured = false;
      p.injuryRemainingWeeks = 0;
    }
  });
}

// ==============================
// 年度末処理
// ==============================
function yearEnd(state) {
  // 3年生を卒業させる
  const graduates = state.players.filter(p => p.grade === 3);
  state.players = state.players.filter(p => p.grade !== 3);

  // 学年進級
  state.players.forEach(p => p.grade++);

  state.restingPlayerIds = []; // 卒業・進級時にリセット

  // スタメンから卒業生を除外
  const graduateIds = new Set(graduates.map(p => p.id));
  for (const slot of Object.keys(state.starters)) {
    if (graduateIds.has(state.starters[slot])) {
      state.starters[slot] = null;
    }
  }

  // 練習グループから卒業生を除外
  state.practiceGroups = state.practiceGroups.map(g => g.filter(id => !graduateIds.has(id)));

  // トーナメント状態リセット
  for (const t of Object.keys(state.tournaments)) {
    state.tournaments[t] = { eliminated: false, champion: false, currentRound: 0 };
  }

  state.year++;
  state.week = 0;

  return graduates.length;
}

// ==============================
// 次の試合情報
// ==============================
function getNextMatchInfo(state) {
  for (let w = state.week; w < 48; w++) {
    const info = MATCH_SCHEDULE[w];
    if (!info) continue;
    const tState = state.tournaments[info.tournament];
    if (!tState.eliminated && !tState.champion) {
      return { week: w, ...info };
    }
  }
  return null;
}
