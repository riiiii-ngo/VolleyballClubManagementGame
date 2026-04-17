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

async function afterLogin(userId = null) {
  const savedState = await loadGame(userId);
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
    <header class="app-header">
      <div class="header-row">
        <span class="header-team">🏐 バレー部</span>
        <span id="ui-date" class="header-date"></span>
        <button id="btn-logout" class="btn-logout" title="ログアウト">⏏</button>
      </div>
      <div class="header-kpi-row">
        <div class="kpi-chip">
          <span class="kpi-label">評判</span>
          <span id="ui-rep" class="kpi-value"></span>
        </div>
        <div class="kpi-chip">
          <span class="kpi-label">ポイント</span>
          <span id="ui-points" class="kpi-value"></span>
        </div>
        <div class="kpi-chip">
          <span class="kpi-label">体力</span>
          <span id="ui-team-stamina" class="kpi-value"></span>
        </div>
        <div class="kpi-chip" id="kpi-next-chip">
          <span class="kpi-label">次の試合</span>
          <span id="ui-next" class="kpi-value"></span>
        </div>
      </div>
    </header>
    <div class="game-visual-area">
      <div class="bg-image"></div>
      <img src="assets/chara_manager.png" class="chara-image" alt="">
    </div>
    <main class="app-main">
      <div id="tab-home"  class="tab-content active"></div>
      <div id="tab-team"  class="tab-content"></div>
      <div id="tab-scout" class="tab-content"></div>
      <div id="tab-shop"  class="tab-content"></div>
    </main>
    <nav class="tab-nav">
      <button class="tab-btn active" data-tab="home">
        <span class="tab-icon">🏠</span><span class="tab-label">ホーム</span>
      </button>
      <button class="tab-btn" data-tab="team">
        <span class="tab-icon">👥</span><span class="tab-label">チーム</span>
      </button>
      <button class="tab-btn" data-tab="scout">
        <span class="tab-icon">🔍</span><span class="tab-label">スカウト</span>
      </button>
      <button class="tab-btn" data-tab="shop">
        <span class="tab-icon">🛒</span><span class="tab-label">ショップ</span>
      </button>
    </nav>
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

function switchTabPublic(tabId) {
  switchTab(tabId);
}

function renderAll() {
  updateStatusBar(G);
  renderTab('home');
}

function renderTab(tabId) {
  updateStatusBar(G);
  switch (tabId) {
    case 'home': {
      // ホームタブは試合週か練習週かで表示を分ける
      const matchInfo = MATCH_SCHEDULE[G.week];
      const tState = matchInfo ? G.tournaments[matchInfo.tournament] : null;
      const isMatchWeek = matchInfo && tState && !tState.eliminated && !tState.champion;
      // 出場条件も考慮（未達成なら練習画面を表示）
      let qualified = true;
      if (isMatchWeek) {
        if (matchInfo.tournament === 'interhigh' && !G.tournaments.prefectural.champion) qualified = false;
        if (matchInfo.tournament === 'spring' && !G.tournaments.spring_prelim.champion) qualified = false;
      }
      if (isMatchWeek && qualified) {
        renderHome(G); // 試合画面を表示
      } else {
        renderPractice(G); // 練習画面をHomeに描画
      }
      break;
    }
    case 'team':     renderTeam(G);     break;
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

  let qualified = true;
  if (isMatchWeek) {
    if (matchInfo.tournament === 'interhigh' && !G.tournaments.prefectural.champion) qualified = false;
    if (matchInfo.tournament === 'spring' && !G.tournaments.spring_prelim.champion) qualified = false;
  }

  if (isMatchWeek && qualified) {
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
    // 練習週 or 敗退済み試合週 or 出場未達成週
    G.weeklyLog = [];
    const isEliminated = matchInfo && tState && tState.eliminated;
    const isUnqualified = isMatchWeek && !qualified;

    if (isEliminated) {
      // 敗退済み試合週は休養
      G.weeklyLog.push('試合週（敗退済み）。スタミナが少し回復した。');
      executeRestWeek(G);
    } else {
      // 通常練習
      const { logs, results } = executePractice(G);
      if (isUnqualified) G.weeklyLog.push('大会出場条件を満たしていないため練習を行いました。');
      G.weeklyLog.push(...logs);
      G.weeklyResults = results; // UI表示用に保存
    }

    advanceWeekEffects(G);
    G.week++;

    if (G.week >= 48) {
      doYearEnd();
      return;
    }

    // 保存とモーダル表示を開始
    setStateRef(G);
    showPracticeResult(G.weeklyResults || [], G.weeklyLog || []);

    // 翌週のために休憩状態を解除
    G.restingPlayerIds = [];
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

  G.restingPlayerIds = []; // 翌週のためにリセット
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
  const container = document.getElementById('tab-team');
  const scrollY = container ? container.scrollTop : 0;
  const pageScrollY = window.scrollY;
  renderTeam(G);
  if (container) container.scrollTop = scrollY;
  window.scrollTo(0, pageScrollY);
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
  // スクロール位置を保持して再描画
  const container = document.getElementById('tab-team');
  const scrollY = container ? container.scrollTop : 0;
  const pageScrollY = window.scrollY;
  renderTeam(G);
  if (container) container.scrollTop = scrollY;
  window.scrollTo(0, pageScrollY);
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
// 休憩切り替え
// ==============================
window.onToggleRest = function(playerId) {
  // 既存セーブデータ対策: 未定義なら初期化
  if (!G.restingPlayerIds) G.restingPlayerIds = [];
  
  const index = G.restingPlayerIds.indexOf(playerId);
  if (index >= 0) {
    G.restingPlayerIds.splice(index, 1);
  } else {
    G.restingPlayerIds.push(playerId);
  }
  // 保存はせずメモリ上のみ（週をまたがない一時状態）
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
