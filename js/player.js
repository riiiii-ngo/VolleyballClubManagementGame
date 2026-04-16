// ============================================================
// player.js - 選手生成・管理
// ============================================================

function randomName() {
  const last  = LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)];
  const first = FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)];
  return `${last} ${first}`;
}

// パラメータをクランプ
function clamp(v, min=1, max=99) {
  return Math.max(min, Math.min(max, Math.round(v)));
}

// 選手生成
function generatePlayer(id, grade, position, statBase, isAllRounder = false) {
  const noise = () => Math.floor(Math.random() * 16) - 8; // -8..+7
  const params = {};

  PARAM_KEYS.forEach(k => {
    if (k === 'stamina') {
      params[k] = clamp(85 + Math.floor(Math.random() * 15)); // 85-99
    } else {
      params[k] = clamp(statBase + noise());
    }
  });

  // ポジション適性ボーナス
  const growth = POSITION_GROWTH_PARAMS[position] || [];
  if (!isAllRounder) {
    growth.forEach(k => {
      if (k !== 'stamina') params[k] = clamp(params[k] + 10);
    });
  } else {
    // オールラウンダーは全パラメータ均等に少し高め
    PARAM_KEYS.forEach(k => {
      if (k !== 'stamina') params[k] = clamp(params[k] + 5);
    });
  }

  return {
    id,
    name: randomName(),
    grade,
    position,
    isAllRounder,
    params,
    currentStamina: params.stamina,
    maxStamina: 100,
    potential: Math.floor(Math.random() * 3) + 1, // 1-3 (潜在能力)
  };
}

// スカウト選手生成
function generateScoutPlayer(id, reputation, forceAllRounder = false, preferPosition = null) {
  // ランクをランダムで決定
  const weights = SCOUT_RANK_WEIGHTS[reputation];
  let r = Math.random() * 100;
  let rank = 0;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) { rank = i; break; }
  }

  const statBase = SCOUT_RANK_BASE[rank];

  // ポジション決定
  let position;
  if (preferPosition && preferPosition !== 'random') {
    position = preferPosition;
  } else {
    // ランダム: リベロを少し少なめに
    const posPool = [...POSITIONS, ...POSITIONS.filter(p => p !== 'Li')];
    position = posPool[Math.floor(Math.random() * posPool.length)];
  }

  // オールラウンダー判定
  let isAllRounder = forceAllRounder;
  if (!isAllRounder) {
    // ランダム選択でわずかに確率UP
    const baseChance = preferPosition === 'random' ? 8 : 5;
    isAllRounder = Math.random() * 100 < baseChance;
  }

  const player = generatePlayer(id, 1, position, statBase, isAllRounder);
  player.rank = rank + 1; // 表示用
  return player;
}

// 初期チーム生成
function generateInitialTeam(state) {
  const statBase = 22; // 弱小校の初期能力値
  const lineup = [
    // 3年生 (5名)
    { grade: 3, position: 'OH' },
    { grade: 3, position: 'MB' },
    { grade: 3, position: 'OP' },
    { grade: 3, position: 'Se' },
    { grade: 3, position: 'Li' },
    // 2年生 (4名)
    { grade: 2, position: 'OH' },
    { grade: 2, position: 'MB' },
    { grade: 2, position: 'OH' },
    { grade: 2, position: 'MB' },
    // 1年生 (4名)
    { grade: 1, position: 'OH' },
    { grade: 1, position: 'OP' },
    { grade: 1, position: 'Se' },
    { grade: 1, position: 'Li' },
  ];

  const players = lineup.map(def => {
    const p = generatePlayer(state.nextPlayerId++, def.grade, def.position, statBase + (def.grade - 1) * 5);
    return p;
  });

  state.players = players;

  // デフォルトスタメンを設定（グレードが高い選手優先）
  autoSetStarters(state);

  // 練習グループに振り分け
  autoAssignPracticeGroups(state);
}

// 自動スタメン設定
function autoSetStarters(state) {
  const slotPositions = {
    OH1: 'OH', OH2: 'OH',
    MB1: 'MB', MB2: 'MB',
    OP:  'OP',
    Se:  'Se',
    Li:  'Li',
  };

  const used = new Set();

  for (const [slot, pos] of Object.entries(slotPositions)) {
    // そのポジションの選手をグレード降順・能力値降順でソート
    const candidates = state.players
      .filter(p => p.position === pos && !used.has(p.id))
      .sort((a, b) => {
        if (b.grade !== a.grade) return b.grade - a.grade;
        return totalStats(b) - totalStats(a);
      });

    if (candidates.length > 0) {
      state.starters[slot] = candidates[0].id;
      used.add(candidates[0].id);
    }
  }
}

// 自動練習グループ振り分け
function autoAssignPracticeGroups(state) {
  const groupCount = state.practiceGroups.length;
  state.practiceGroups = Array.from({ length: groupCount }, () => []);
  state.players.forEach((p, i) => {
    state.practiceGroups[i % groupCount].push(p.id);
  });
}

// 選手の総合能力値（スタミナを除く）
function totalStats(player) {
  return PARAM_KEYS.filter(k => k !== 'stamina').reduce((s, k) => s + player.params[k], 0);
}

// 選手のオーバーオール（100点満点換算）
function playerOverall(player) {
  const keys = PARAM_KEYS.filter(k => k !== 'stamina');
  const avg = keys.reduce((s, k) => s + player.params[k], 0) / keys.length;
  return Math.round(avg);
}

// パラメータ増加（練習）
function applyParamGrowth(player, params, baseGrowth, efficiency) {
  const isMini = false;
  const staminaFactor = player.currentStamina < 10 ? 0.4 : 1.0;
  const posGrowth = POSITION_GROWTH_PARAMS[player.position] || [];
  const isAllRounder = player.isAllRounder;

  params.forEach(key => {
    if (key === 'stamina') return; // スタミナは別管理

    // 現在のステータスに応じた基本成長量
    const currentVal = player.params[key] || 1;
    let statGrowth = 3;
    if (currentVal >= 80) statGrowth = 0.5;
    else if (currentVal >= 60) statGrowth = 1;
    else if (currentVal >= 30) statGrowth = 2;

    // baseGrowth(Tier1=2)を基準にスケーリング
    let growth = statGrowth * (baseGrowth / 2) * efficiency * staminaFactor;

    // ポジション適性ボーナス
    if (isAllRounder || posGrowth.includes(key)) {
      growth *= 1.3;
    }

    // ランダム要素
    growth *= (0.8 + Math.random() * 0.4);

    player.params[key] = clamp(player.params[key] + growth);
  });
}

// スタミナ消費（練習）
function consumeStamina(player, amount) {
  player.currentStamina = Math.max(0, player.currentStamina - amount);
  player.params.stamina = player.currentStamina;
}

// スタミナ自然回復（週次）
function recoverStaminaWeekly(player) {
  const recovery = 8;
  player.currentStamina = Math.min(player.maxStamina, player.currentStamina + recovery);
  player.params.stamina = player.currentStamina;
}

// 試合後スタミナ消費
function consumeMatchStamina(player, sets) {
  const base = 10 + sets * 5;
  consumeStamina(player, base + Math.floor(Math.random() * 5));
}

// スタミナ状態テキスト
function staminaStatus(stamina) {
  if (stamina >= 70) return { text: '良好', color: '#4CAF50' };
  if (stamina >= 40) return { text: '普通', color: '#FF9800' };
  if (stamina >= 10) return { text: '疲労', color: '#F44336' };
  return { text: '限界', color: '#9C27B0' };
}

// 選手の強さスコア（試合計算用, ポジション考慮）
function combatScore(player) {
  const pos = player.position;
  const p = player.params;
  const staminaMod = player.currentStamina < 10 ? 0.6 : (player.currentStamina < 30 ? 0.8 : 1.0);

  let score;
  switch (pos) {
    case 'OH': score = (p.spike * 2 + p.power + p.serve + p.receive) / 5; break;
    case 'MB': score = (p.spike * 2 + p.block * 2 + p.speed) / 5; break;
    case 'OP': score = (p.spike * 2 + p.serve + p.receive + p.power) / 5; break;
    case 'Se': score = (p.toss * 2 + p.technique * 2 + p.receive) / 5; break;
    case 'Li': score = (p.receive * 3 + p.technique + p.speed) / 5; break;
    default:   score = totalStats(player) / 8;
  }
  return score * staminaMod;
}
