// ============================================================
// match.js - 試合シミュレーション
// ============================================================

// ==============================
// 対戦相手チーム生成
// ==============================
function getEnemyTeamId(tournament, round) {
  if (tournament === 'prefectural' || tournament === 'spring_prelim') {
    if (round === 0) return 'weak_team';
    if (round === 1) return 'normal_team';
    return 'strong_team';
  } else {
    // interhigh, spring
    if (round === 0) return 'normal_team';
    if (round === 1) return 'strong_team';
    return Math.random() < 0.5 ? 'elite_team' : 'pro_team';
  }
}

function generateOpponent(tournament, round, year, reputation) {
  const enemyId = getEnemyTeamId(tournament, round);
  const teamDef = ENEMIES.find(e => e.id === enemyId) || ENEMIES[0];
  const stats = teamDef.stats;

  const getStat = (key) => {
    switch (key) {
      case 'spike': return stats.attack;
      case 'power': return stats.attack;
      case 'block': return stats.defense;
      case 'receive': return stats.receive;
      case 'serve': return stats.serve;
      case 'toss': return (stats.attack + stats.receive) / 2;
      case 'speed': return (stats.attack + stats.defense) / 2;
      case 'technique': return (stats.attack + stats.serve) / 2;
      default: return 50;
    }
  };

  const oPositions = ['OH','OH','MB','MB','OP','Se','Li'];
  const players = oPositions.map((pos, i) => {
    const noise = () => Math.floor(Math.random() * 10) - 5;
    const params = {};
    PARAM_KEYS.forEach(k => {
      if (k === 'stamina') { params[k] = 90; return; }
      params[k] = clamp(getStat(k) + noise());
    });
    // ポジション補正
    const growth = POSITION_GROWTH_PARAMS[pos] || [];
    growth.forEach(k => { if (k !== 'stamina') params[k] = clamp(params[k] + 8); });

    return {
      id: -(i + 1),
      name: `相手選手${i + 1}`,
      position: pos,
      params,
      currentStamina: 90,
      maxStamina: 100,
      isAllRounder: false,
      grade: 2,
    };
  });

  const teamAvg = players.reduce((s, p) => s + playerOverall(p), 0) / players.length;
  return { players, name: teamDef.name, avgStat: Math.round(teamAvg) };
}

// ==============================
// ローテーション管理
// ==============================
// rotation: 6要素の配列 [pos1, pos2, pos3, pos4, pos5, pos6]
// pos1 = バックライト(サーバー), pos2 = フロントライト, pos3 = フロントミドル
// pos4 = フロントレフト, pos5 = バックレフト, pos6 = バックミドル

function buildRotation(starters) {
  // Se を pos5 or pos1 あたりに、OH・MB・OP をバランスよく配置
  const slots = ['OH1','MB1','OP','OH2','MB2','Se'];
  return slots.map(slot => starters[slot]).filter(Boolean);
}

function rotate(rotation) {
  // サイドアウト: 時計回り (pos1→pos2, pos2→pos3, ..., pos6→pos1)
  return [rotation[rotation.length - 1], ...rotation.slice(0, rotation.length - 1)];
}

function getFrontRow(rotation) { return [rotation[1], rotation[2], rotation[3]]; }
function getBackRow(rotation)  { return [rotation[4], rotation[5], rotation[0]]; }

// リベロ適用: バックのMBをリベロと交換
function applyLibero(rotation, libero) {
  if (!libero) return rotation;
  const result = [...rotation];
  // バック3人(pos5,pos6)からMBを探して交換。pos1(サーバー位置)は除外
  const backIndices = [5, 4]; // pos6, pos5 (バックミドル, バックレフト)
  for (const i of backIndices) {
    if (result[i] && result[i].position === 'MB') {
      result[i] = { ...libero, _isLiberoSub: true };
      break;
    }
  }
  return result;
}

// ==============================
// ラリーシミュレーション
// ==============================
function roll(chance) { return Math.random() * 100 < chance; }

function serveChance(server) {
  return 40 + server.params.serve * 0.6;
}
function aceChance(server) {
  return server.params.serve * 0.12;
}
function faultChance(server) {
  const staminaMod = server.currentStamina < 10 ? 1.5 : 1;
  return Math.max(2, 15 - server.params.serve * 0.1) * staminaMod;
}
function receiveChance(receiver, isLibero = false) {
  const bonus = isLibero ? 15 : 0;
  const staminaMod = receiver.currentStamina < 10 ? 0.7 : 1;
  return (30 + receiver.params.receive * 0.7 + bonus) * staminaMod;
}
function tossChance(setter) {
  return 30 + setter.params.toss * 0.7;
}
function spikeChance(spiker) {
  const staminaMod = spiker.currentStamina < 10 ? 0.7 : 1;
  return (20 + spiker.params.spike * 0.8) * staminaMod;
}
function blockChance(blockers, spiker) {
  const avgBlock = blockers.reduce((s, b) => s + b.params.block, 0) / blockers.length;
  const numBonus = blockers.length >= 2 ? 8 : 0;
  return Math.max(0, avgBlock * 0.4 + numBonus - spiker.params.spike * 0.15);
}
function digChance(digger) {
  const staminaMod = digger.currentStamina < 10 ? 0.7 : 1;
  return (15 + digger.params.receive * 0.5) * staminaMod;
}

// ランダムで選手を選ぶ（能力値重み付き）
function pickWeighted(players, statKey) {
  const total = players.reduce((s, p) => s + (p.params[statKey] || 1), 0);
  let r = Math.random() * total;
  for (const p of players) {
    r -= (p.params[statKey] || 1);
    if (r <= 0) return p;
  }
  return players[players.length - 1];
}

function simulateRally(rotA, rotB, liberoA, liberoB, servingTeamIsA) {
  const logs = [];
  let servTeamRot  = servingTeamIsA ? [...rotA] : [...rotB];
  let recvTeamRot  = servingTeamIsA ? [...rotB] : [...rotA];
  const servLib    = servingTeamIsA ? liberoA : liberoB;
  const recvLib    = servingTeamIsA ? liberoB : liberoA;

  servTeamRot = applyLibero(servTeamRot, servLib);
  recvTeamRot = applyLibero(recvTeamRot, recvLib);

  const server = servTeamRot[0]; // pos1がサーバー

  // --- サーブ ---
  if (roll(faultChance(server))) {
    logs.push(`${server.name} のサーブがアウト`);
    return { winner: 'recv', logs };
  }
  if (roll(aceChance(server))) {
    logs.push(`${server.name} のサーブがエース！`);
    return { winner: 'serv', logs };
  }
  logs.push(`${server.name} がサーブ`);

  // --- レシーブ ---
  const backRow = getBackRow(recvTeamRot);
  const validBack = backRow.filter(Boolean);
  const recvLib2 = validBack.find(p => p.position === 'Li' || p._isLiberoSub);
  const receiver = pickWeighted(validBack, 'receive');
  const isLiberoReceiving = !!(recvLib2 && receiver.id === recvLib2.id);

  if (!roll(receiveChance(receiver, isLiberoReceiving))) {
    logs.push(`${receiver.name} がレシーブ失敗`);
    return { winner: 'serv', logs };
  }
  logs.push(`${receiver.name} がレシーブ${isLiberoReceiving ? '（リベロ）' : ''}`);

  // --- トス ---
  const setter = recvTeamRot.find(p => p.position === 'Se') || recvTeamRot[0];
  if (!roll(tossChance(setter))) {
    logs.push(`${setter.name} のトスがミス`);
    return { winner: 'serv', logs };
  }

  // --- スパイク ---
  const front = getFrontRow(recvTeamRot).filter(Boolean);
  const validFront = front.filter(p => p.position !== 'Li');
  if (validFront.length === 0) {
    logs.push('スパイクできる選手がいない');
    return { winner: 'serv', logs };
  }
  const spiker = pickWeighted(validFront, 'spike');
  logs.push(`${setter.name} → ${spiker.name} にトス`);

  // --- ブロック ---
  const servFront = getFrontRow(servTeamRot).filter(Boolean).filter(p => p.position !== 'Li');
  const bChance = blockChance(servFront, spiker);
  if (servFront.length > 0 && roll(bChance)) {
    const blocker = servFront[Math.floor(Math.random() * servFront.length)];
    logs.push(`${spiker.name} のスパイクを ${blocker.name} がブロック！`);
    return { winner: 'serv', logs };
  }

  // --- スパイク成功判定 ---
  if (!roll(spikeChance(spiker))) {
    logs.push(`${spiker.name} のスパイクがアウト`);
    return { winner: 'serv', logs };
  }

  // --- ディグ（相手バックのレシーブ）---
  const servBack = getBackRow(servTeamRot).filter(Boolean);
  const digger = pickWeighted(servBack, 'receive');
  if (!roll(digChance(digger))) {
    logs.push(`${spiker.name} のスパイク決まった！`);
    return { winner: 'recv', logs };
  }
  logs.push(`${spiker.name} のスパイクを ${digger.name} がディグ`);

  // --- ラリー継続 → 統計ベースで決着 ---
  const recvPower = validFront.reduce((s, p) => s + combatScore(p), 0);
  const servPower = (servFront.length > 0 ? servFront : servTeamRot).reduce((s, p) => s + combatScore(p), 0) / Math.max(1, servFront.length);
  const recvWin = recvPower / (recvPower + servPower + 0.001);
  if (roll(recvWin * 100)) {
    logs.push(`ラリー続く… ${spiker.name} チームが得点`);
    return { winner: 'recv', logs };
  } else {
    logs.push(`ラリー続く… 相手チームが得点`);
    return { winner: 'serv', logs };
  }
}

// ==============================
// セットシミュレーション
// ==============================
function simulateSet(rotA, rotB, liberoA, liberoB, targetScore, isFinalSet) {
  let scoreA = 0, scoreB = 0;
  let servingA = roll(50); // コイントス
  let rotAcur = [...rotA];
  let rotBcur = [...rotB];
  const logs = [];
  let rallyCount = 0;

  while (true) {
    rallyCount++;
    const result = simulateRally(rotAcur, rotBcur, liberoA, liberoB, servingA);
    const logLine = result.logs[result.logs.length - 1]; // 最後のログのみ使用（簡略）

    const rallyWonByA = result.winner === (servingA ? 'serv' : 'recv');
    if (rallyWonByA) {
      scoreA++;
      if (!servingA) {
        servingA = true;
        rotAcur = rotate(rotAcur); // サイドアウトでローテーション
      }
    } else {
      scoreB++;
      if (servingA) {
        servingA = false;
        rotBcur = rotate(rotBcur);
      }
    }

    // ログ記録
    logs.push({ text: `${scoreA}-${scoreB} ${logLine}`, scoreA, scoreB });

    // セット終了判定
    const target = isFinalSet ? 15 : targetScore;
    const diff = Math.abs(scoreA - scoreB);
    if ((scoreA >= target || scoreB >= target) && diff >= 2) break;
    if (rallyCount > 200) break; // 無限ループ防止
  }

  return { scoreA, scoreB, logs, winner: scoreA > scoreB ? 'A' : 'B' };
}

// ==============================
// 試合シミュレーション
// ==============================
function simulateMatch(state, matchInfo) {
  const starters = getStarters(state);
  const libero = starters.Li;
  const rotationSlots = ['OH1','MB1','OP','OH2','MB2','Se'];
  const rotA = rotationSlots.map(s => starters[s]).filter(Boolean);

  // スタメン不足チェック
  if (rotA.length < 6) {
    return {
      success: false,
      msg: 'スタメンが揃っていません。チーム設定でスタメンを設定してください。',
    };
  }

  const opponent = generateOpponent(
    matchInfo.tournament,
    matchInfo.round,
    state.year,
    state.reputation
  );
  const liberoA = libero || null;
  const rotB = opponent.players.filter(p => p.position !== 'Li');
  const liberoB = opponent.players.find(p => p.position === 'Li') || null;

  const maxSets = matchInfo.maxSets;
  const setsToWin = Math.ceil(maxSets / 2);
  const targetScore = 25;

  let setsA = 0, setsB = 0;
  const setResults = [];
  const allLogs = [];

  allLogs.push(`--- ${matchInfo.name} ---`);
  allLogs.push(`対戦相手 総合力: ${opponent.avgStat}`);

  let setNum = 0;
  while (setsA < setsToWin && setsB < setsToWin) {
    setNum++;
    // 第5セットのみ15点マッチ（5セットマッチの場合のみ）
    const isFinalSet = maxSets === 5 && setNum === 5;
    const setResult = simulateSet(rotA, rotB, liberoA, liberoB, targetScore, isFinalSet);

    if (setResult.winner === 'A') setsA++;
    else setsB++;

    setResults.push({ setNum, scoreA: setResult.scoreA, scoreB: setResult.scoreB });
    allLogs.push(`\n--- 第${setNum}セット ---`);
    // 詳細ログ（最大20行）
    const logSample = setResult.logs.filter((_, i) => i % Math.max(1, Math.floor(setResult.logs.length / 20)) === 0);
    logSample.forEach(l => allLogs.push(l.text));
    allLogs.push(`第${setNum}セット終了: ${setResult.scoreA}-${setResult.scoreB}`);
  }

  const won = setsA > setsB;
  const finalScore = setResults.map(r => `${r.scoreA}-${r.scoreB}`).join(', ');

  allLogs.push(`\n=== 試合結果: ${won ? '勝利' : '敗戦'} (${setsA}-${setsB}) ===`);
  allLogs.push(`セット詳細: ${finalScore}`);

  // ポイント・評判更新
  let repGain = 0, shopGain = 0;
  if (won) {
    repGain  = REP_POINTS_WIN[matchInfo.tournament][matchInfo.round];
    shopGain = MATCH_POINTS_WIN[matchInfo.tournament][matchInfo.round];
  } else {
    // 格下負けペナルティ
    const opponentRep = estimateOpponentRep(matchInfo.tournament, matchInfo.round);
    const penalty = opponentRep < state.reputation ? REP_POINTS_LOSS_PENALTY : 1.0;
    repGain = -Math.round(5 * penalty);
  }

  // スタメン選手のスタミナ消費
  rotA.forEach(p => consumeMatchStamina(p, setNum));
  if (liberoA) consumeMatchStamina(liberoA, setNum);

  // トーナメント状態更新
  const tState = state.tournaments[matchInfo.tournament];
  if (won) {
    tState.currentRound++;
    if (matchInfo.round === 2) tState.champion = true;
  } else {
    tState.eliminated = true;
  }

  addRepPoints(state, repGain);
  state.points = Math.max(0, state.points + shopGain);

  const result = {
    success: true,
    won,
    setsA, setsB,
    setResults,
    finalScore,
    repGain,
    shopGain,
    log: allLogs,
    matchName: matchInfo.name,
    opponent,
  };

  // 試合ログに追加
  state.matchLog.unshift({
    week: state.week,
    year: state.year,
    name: matchInfo.name,
    won,
    score: `${setsA}-${setsB}`,
    setDetail: finalScore,
  });

  return result;
}

// 対戦相手の推定評判（ポイント計算用）
function estimateOpponentRep(tournament, round) {
  const base = { prefectural: 0, interhigh: 1, spring_prelim: 1, spring: 2 };
  return (base[tournament] || 0) + Math.floor(round / 2);
}
