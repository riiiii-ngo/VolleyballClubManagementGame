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
  renderSchoolNameScreen((name) => {
    G.schoolName = name;
    saveGame(G);
    startMainGame();
  });
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
  // 週次メニューが未設定の場合（新規 or 旧セーブデータ）は生成して保存
  if (!G.weeklyMenuIds || G.weeklyMenuIds.length === 0) {
    generateWeeklyMenus(G);
    saveGame(G);
  }
  setStateRef(G);
  document.getElementById('app').innerHTML = `
    <header class="app-header">
      <div class="header-row">
        <span class="header-team">🏐 ${G.schoolName || 'バレー部'}</span>
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
      <div id="tab-home"           class="tab-content active"></div>
      <div id="tab-action"         class="tab-content"></div>
      <div id="tab-team"           class="tab-content"></div>
      <div id="tab-scout"          class="tab-content"></div>
      <div id="tab-shop"           class="tab-content"></div>
      <div id="tab-practice_match" class="tab-content"></div>
    </main>
    <div id="action-footer" class="action-footer" style="display:none"></div>
    <nav class="tab-nav">
      <button class="tab-btn active" data-tab="home" id="tab-btn-home">
        <span class="tab-icon">🏠</span><span class="tab-label">ホーム</span>
      </button>
      <button class="tab-btn" data-tab="action" id="tab-btn-action">
        <span class="tab-icon">🏠</span><span class="tab-label">練習</span>
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
      <button class="tab-btn" data-tab="practice_match">
        <span class="tab-icon">⚔️</span><span class="tab-label">練習試合</span>
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

function preserveScroll(selector, fn) {
  const el = document.querySelector(selector);
  const scrollTop = el ? el.scrollTop : 0;
  fn();
  if (scrollTop > 0) {
    requestAnimationFrame(() => {
      const newEl = document.querySelector(selector);
      if (newEl) newEl.scrollTop = scrollTop;
    });
  }
}

// 練習画面の縦スクロール（選手一覧）と横スクロール（メニュー・グループ）を両方保存・復元
function preservePracticeScroll(fn) {
  const playersEl = document.querySelector('.practice-players-area');
  const menuEl    = document.querySelector('.training-menu-scroll');
  const groupEl   = document.querySelector('.group-selector-scroll');
  const playersTop = playersEl ? playersEl.scrollTop  : 0;
  const menuLeft   = menuEl   ? menuEl.scrollLeft    : 0;
  const groupLeft  = groupEl  ? groupEl.scrollLeft   : 0;
  fn();
  requestAnimationFrame(() => {
    const newPlayers = document.querySelector('.practice-players-area');
    const newMenu    = document.querySelector('.training-menu-scroll');
    const newGroup   = document.querySelector('.group-selector-scroll');
    if (newPlayers) newPlayers.scrollTop  = playersTop;
    if (newMenu)    newMenu.scrollLeft    = menuLeft;
    if (newGroup)   newGroup.scrollLeft   = groupLeft;
  });
}

function renderAll() {
  updateStatusBar(G);
  renderTab('home');
}

function renderTab(tabId) {
  updateStatusBar(G);
  switch (tabId) {
    case 'home': {
      renderHomeDashboard(G);
      break;
    }
    case 'action': {
      renderPracticeArea(G);
      break;
    }
    case 'team':     renderTeam(G);     break;
    case 'scout':    renderScout(G);    break;
    case 'shop':           renderShop(G);         break;
    case 'practice_match': renderPracticeMatch(G); break;
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
  // 練習週・敗退済み試合週・出場未達成週の処理
  const matchInfo = MATCH_SCHEDULE[G.week];
  const tState = matchInfo ? G.tournaments[matchInfo.tournament] : null;
  const isMatchWeek = matchInfo && tState && !tState.eliminated && !tState.champion;

  let qualified = true;
  if (isMatchWeek) {
    if (matchInfo.tournament === 'interhigh' && !G.tournaments.prefectural.champion) qualified = false;
    if (matchInfo.tournament === 'spring' && !G.tournaments.spring_prelim.champion) qualified = false;
  }

  G.weeklyLog = [];
  const isEliminated = matchInfo && tState && tState.eliminated;

  if (isEliminated) {
    G.weeklyLog.push('試合週（敗退済み）。スタミナが少し回復した。');
    executeRestWeek(G);
  } else {
    const { logs, results } = executePractice(G);
    if (isMatchWeek && !qualified) G.weeklyLog.push('大会出場条件を満たしていないため練習を行いました。');
    G.weeklyLog.push(...logs);
    G.weeklyResults = results;
  }

  advanceWeekEffects(G);
  G.week++;

  if (G.week >= 48) {
    doYearEnd();
    return;
  }

  G.restingPlayerIds = [];
  generateWeeklyMenus(G);
  saveGame(G);
  setStateRef(G);
  showPracticeResult(G.weeklyResults || [], G.weeklyLog || []);
};

// ==============================
// 試合前画面から試合を開始
// ==============================
window.onStartMatch = function(opponent) {
  const matchInfo = MATCH_SCHEDULE[G.week];
  const result = simulateMatch(G, matchInfo, opponent);
  if (!result.success) {
    showAlert(result.msg);
    return;
  }
  saveGame(G);
  setStateRef(G);
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === 'action'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === 'tab-action'));
  showMatchLog(result, () => onModalClose());
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

  G.restingPlayerIds = [];
  generateWeeklyMenus(G);
  saveGame(G);
  setStateRef(G);
  switchTabPublic('home');
};

// ==============================
// 年度末処理
// ==============================
function doYearEnd() {
  const graduates = G.players.filter(p => p.grade === 3).map(p => ({ ...p }));
  yearEnd(G);

  // スカウト済み選手を入部させる
  const pendingScouts = G.pendingScouts || [];
  pendingScouts.forEach(p => G.players.push(p));
  G.pendingScouts = [];

  // 残り枠を自動生成で補充
  const newPlayers = [...pendingScouts];
  const needed = Math.max(0, 4 - pendingScouts.length);
  for (let i = 0; i < needed; i++) {
    const p = generatePlayer(G.nextPlayerId++, 1, POSITIONS[i % POSITIONS.length], 22);
    newPlayers.push(p);
    G.players.push(p);
  }

  ensurePracticeGroups(G);
  // 新入生のみグループAに追加（既存選手のグループ設定は維持）
  newPlayers.forEach(p => {
    if (!G.practiceGroups[0]) G.practiceGroups[0] = [];
    G.practiceGroups[0].push(p.id);
  });
  autoSetStarters(G);
  generateWeeklyMenus(G);

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
  preserveScroll('#team-screen-content', () => { renderTeam(G); updateStatusBar(G); });
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
  preserveScroll('#team-screen-content', () => renderTeam(G));
};

window.onAutoGroup = function() {
  autoAssignPracticeGroups(G);
  saveGame(G);
  preserveScroll('#team-screen-content', () => renderTeam(G));
};

// ==============================
// 練習メニュー選択
// ==============================
window.onPracticeSelect = function(groupIndex, menuId) {
  G.practiceSelections[groupIndex] = menuId;
  saveGame(G);
  preservePracticeScroll(() => renderPractice(G));
};

// ==============================
// 休憩切り替え
// ==============================
window.onToggleRest = function(playerId) {
  if (!G.restingPlayerIds) G.restingPlayerIds = [];
  const index = G.restingPlayerIds.indexOf(playerId);
  if (index >= 0) {
    G.restingPlayerIds.splice(index, 1);
  } else {
    G.restingPlayerIds.push(playerId);
  }
  preservePracticeScroll(() => renderPractice(G));
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
    preserveScroll('#tab-shop .panel-view', () => { renderShop(G); updateStatusBar(G); });
  } else if (type === 'facility') {
    const def = FACILITIES.find(f => f.id === itemId);
    if (!def) return;
    if (G.points < def.cost) { showAlert('ポイントが足りません。'); return; }
    if (G.facilities.find(f => f.id === itemId)) { showAlert('すでに設置済みです。'); return; }
    G.points -= def.cost;
    G.facilities.push({ id: def.id, effect: def.effect, name: def.name });
    saveGame(G);
    preserveScroll('#tab-shop .panel-view', () => { renderShop(G); updateStatusBar(G); });
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
  preserveScroll('#tab-shop .panel-view', () => renderShop(G));
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
  G.pendingScouts = G.pendingScouts || [];
  G.pendingScouts.push(player);

  saveGame(G);
  setStateRef(G);
  preserveScroll('#tab-scout .panel-view', () => renderScout(G));
  showScoutResult(player);
};

// ==============================
// エントリーポイント
// ==============================
document.addEventListener('DOMContentLoaded', initGame);
