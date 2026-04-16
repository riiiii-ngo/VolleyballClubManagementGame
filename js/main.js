// ============================================================
// main.js - ゲームループ・イベントハンドラ
// ============================================================

let G = null; // グローバルゲーム状態

// ==============================
// 初期化（非同期）
// ==============================
async function initGame() {
  showLoading('データ読み込み中...');
  try {
    // JSONマスターデータを並列fetch
    await loadMasterData();
  } catch(e) {
    console.error('マスターデータ読み込み失敗:', e);
    hideLoading();
    document.getElementById('app').innerHTML =
      '<div style="padding:40px;text-align:center;color:#ef5350">データの読み込みに失敗しました。ページを再読み込みしてください。</div>';
    return;
  }

  // Supabaseセッション確認
  let session = null;
  try {
    session = await getSession();
  } catch(e) {
    console.error('セッション確認失敗:', e);
  }

  hideLoading();

  if (!session) {
    // 未ログイン → ログイン画面へ
    renderLoginScreen();
  } else {
    // ログイン済み → セーブデータ読み込みへ
    await afterLogin(session.user?.id ?? null);
  }
}

// ==============================
// ログイン成功後の処理
// ==============================
window.onLoginSuccess = async function(session) {
  showLoading('セーブデータ読み込み中...');
  await afterLogin(session?.user?.id ?? null);
};

<<<<<<< HEAD
async function afterLogin(userId = null) {
  const savedState = await loadGame(userId);
=======
async function afterLogin() {
  await new Promise(r => setTimeout(r, 300)
  const savedState = await loadGame();
>>>>>>> 6841ad0f70816ce2e482bb8efd9d2293c15f2d93
  hideLoading();
  if (savedState) {
    G = savedState;
    startMainGame();
  } else {
    G = null;
    await renderTitleScreen(userId);
  }
}

// ==============================
// タイトルからゲーム開始
// ==============================
window.onNewGame = async function() {
  await deleteSave();
  G = createDefaultState();
  generateInitialTeam(G);
  // 初期スカウトチケット2枚
  G.inventory.push({ id: 'scout_ticket', effect: 'scout' });
  G.inventory.push({ id: 'scout_ticket', effect: 'scout' });
  saveGame(G);
  startMainGame();
};

window.onContinue = async function() {
  showLoading('セーブデータ読み込み中...');
  const savedState = await loadGame();
  hideLoading();
  if (!savedState) {
    showAlert('セーブデータが見つかりません。');
    return;
  }
  G = savedState;
  startMainGame();
};

// ==============================
// メインゲーム画面へ
// ==============================
function startMainGame() {
  setStateRef(G);
  document.getElementById('app').innerHTML = `
    <header>
      <div class="header-title">🏐 バレー部育成ゲーム</div>
      <div id="status-bar">
        <span id="ui-date"></span>
        <span id="ui-rep"></span>
        <span id="ui-points"></span>
        <span id="ui-next"></span>
        <button id="btn-logout" class="btn-logout" title="ログアウト">⏏</button>
      </div>
    </header>
    <nav class="tab-nav">
      <button class="tab-btn active" data-tab="home">ホーム</button>
      <button class="tab-btn" data-tab="team">チーム</button>
      <button class="tab-btn" data-tab="practice">練習</button>
      <button class="tab-btn" data-tab="scout">スカウト</button>
      <button class="tab-btn" data-tab="shop">ショップ</button>
    </nav>
    <main>
      <div id="tab-home"     class="tab-content active"></div>
      <div id="tab-team"     class="tab-content"></div>
      <div id="tab-practice" class="tab-content"></div>
      <div id="tab-scout"    class="tab-content"></div>
      <div id="tab-shop"     class="tab-content"></div>
    </main>
    <div id="modal" class="modal-overlay" style="display:none"></div>
  `;

  // タブ切り替え
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  // ログアウトボタン
  document.getElementById('btn-logout').addEventListener('click', () => onLogout());

  renderAll();
}

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabId}`));
  renderTab(tabId);
}

function renderAll() {
  updateStatusBar(G);
  renderHome(G);
}

function renderTab(tabId) {
  updateStatusBar(G);
  switch (tabId) {
    case 'home':     renderHome(G);     break;
    case 'team':     renderTeam(G);     break;
    case 'practice': renderPractice(G); break;
    case 'scout':    renderScout(G);    break;
    case 'shop':     renderShop(G);     break;
  }
}

// ==============================
// ログアウト
// ==============================
async function onLogout() {
  if (!confirm('ログアウトしますか？')) return;
  showLoading('ログアウト中...');
  try {
    await signOut();
  } catch(e) {
    console.error('ログアウト失敗:', e);
  }
  G = null;
  hideLoading();
  renderLoginScreen();
}

// ==============================
// 週を進める
// ==============================
window.onAdvanceWeek = function() {
  const matchInfo = MATCH_SCHEDULE[G.week];
  const tState = matchInfo ? G.tournaments[matchInfo.tournament] : null;
  const isMatchWeek = matchInfo && tState && !tState.eliminated && !tState.champion;

  if (isMatchWeek) {
    // 試合週
    if (!isStarterComplete(G)) {
      showAlert('スタメンが揃っていません。チーム設定でスタメンを設定してください。');
      return;
    }
    const result = simulateMatch(G, matchInfo);
    saveGame(G);
    setStateRef(G);
    showMatchResult(result);
  } else {
    // 練習週 or 敗退済み試合週
    G.weeklyLog = [];
    const isEliminatedMatchWeek = matchInfo && tState && tState.eliminated;

    if (!isEliminatedMatchWeek) {
      // 通常練習
      const practiceLogs = executePractice(G);
      G.weeklyLog.push(...practiceLogs);
    } else {
      // 敗退済み試合週は休養
      G.weeklyLog.push('試合週（敗退済み）。スタミナが少し回復した。');
      executeRestWeek(G);
    }

    advanceWeekEffects(G);
    G.week++;

    if (G.week >= 48) {
      doYearEnd();
      return;
    }

    saveGame(G);
    setStateRef(G);
    renderAll();
  }
};

// ==============================
// 試合後モーダルを閉じた後
// ==============================
window.onModalClose = function() {
  G.weeklyLog = [];
  advanceWeekEffects(G);
  G.week++;

  if (G.week >= 48) {
    doYearEnd();
    return;
  }

  saveGame(G);
  setStateRef(G);
  renderAll();
};

// ==============================
// 年度末処理
// ==============================
function doYearEnd() {
  const graduates = G.players.filter(p => p.grade === 3).map(p => ({ ...p }));
  yearEnd(G);

  // スカウト済みでない分を補充入学
  const newPlayers = [];
  const scoutedCount = G.players.filter(p => p.grade === 1 && p._scouted).length;
  const needed = Math.max(0, 4 - scoutedCount);
  for (let i = 0; i < needed; i++) {
    const p = generatePlayer(G.nextPlayerId++, 1, POSITIONS[i % POSITIONS.length], 22);
    newPlayers.push(p);
    G.players.push(p);
  }

  ensurePracticeGroups(G);
  autoAssignPracticeGroups(G);
  autoSetStarters(G);

  saveGame(G);
  setStateRef(G);
  showYearEnd(G, graduates, newPlayers);
}

// ==============================
// スタメン変更
// ==============================
window.onStarterChange = function(slot, playerId) {
  if (playerId) {
    for (const [s, id] of Object.entries(G.starters)) {
      if (s !== slot && id === playerId) G.starters[s] = null;
    }
  }
  G.starters[slot] = playerId;
  saveGame(G);
  renderTeam(G);
  updateStatusBar(G);
};

// ==============================
// 練習グループ変更
// ==============================
window.onGroupChange = function(groupIndex, playerId, checked) {
  G.practiceGroups.forEach(grp => {
    const idx = grp.indexOf(playerId);
    if (idx >= 0) grp.splice(idx, 1);
  });
  if (checked) {
    if (!G.practiceGroups[groupIndex]) G.practiceGroups[groupIndex] = [];
    G.practiceGroups[groupIndex].push(playerId);
  }
  saveGame(G);
  renderTeam(G);
};

window.onAutoGroup = function() {
  autoAssignPracticeGroups(G);
  saveGame(G);
  renderTeam(G);
};

// ==============================
// 練習メニュー選択
// ==============================
window.onPracticeSelect = function(groupIndex, menuId) {
  G.practiceSelections[groupIndex] = menuId;
  saveGame(G);
  renderPractice(G);
};

// ==============================
// ショップ購入
// ==============================
window.onShopBuy = function(type, itemId) {
  if (type === 'item') {
    const def = ITEMS.find(i => i.id === itemId);
    if (!def) return;
    if (G.points < def.cost) { showAlert('ポイントが足りません。'); return; }
    G.points -= def.cost;
    G.inventory.push({ id: def.id, effect: def.effect, duration: def.duration });
    saveGame(G);
    renderShop(G);
    updateStatusBar(G);
  } else if (type === 'facility') {
    const def = FACILITIES.find(f => f.id === itemId);
    if (!def) return;
    if (G.points < def.cost) { showAlert('ポイントが足りません。'); return; }
    if (G.facilities.find(f => f.id === itemId)) { showAlert('すでに設置済みです。'); return; }
    G.points -= def.cost;
    G.facilities.push({ id: def.id, effect: def.effect, name: def.name });
    saveGame(G);
    renderShop(G);
    updateStatusBar(G);
  }
};

// ==============================
// アイテム使用
// ==============================
window.onUseItem = function(invIdx) {
  const result = useItem(G, invIdx);
  if (!result.success) { showAlert(result.msg); return; }
  if (result.isScout) { showAlert('スカウトチケットはスカウト画面から使用してください。'); return; }
  saveGame(G);
  renderShop(G);
  showAlert(result.msg);
};

// ==============================
// スカウト
// ==============================
window.onScout = function(isGold) {
  const effect = isGold ? 'scout_gold' : 'scout';
  const ticketIdx = G.inventory.findIndex(i => i.effect === effect);
  if (ticketIdx < 0) { showAlert('チケットがありません。'); return; }

  const position = document.getElementById('scout-position')?.value || 'random';
  G.inventory.splice(ticketIdx, 1);

  const player = generateScoutPlayer(G.nextPlayerId++, G.reputation, isGold, position);
  player._scouted = true;
  player.grade = 1;
  G.players.push(player);

  saveGame(G);
  setStateRef(G);
  renderScout(G);
  showScoutResult(player);
};

// ==============================
// エントリーポイント
// ==============================
document.addEventListener('DOMContentLoaded', initGame);
