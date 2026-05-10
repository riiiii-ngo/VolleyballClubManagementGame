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
    // ゲストセッションが残っていればゲストモードで続行
    const guestId = localStorage.getItem('volleyball_guest_id');
    if (guestId) {
      window._isGuest = true;
      await afterLogin(null);
    } else {
      renderLoginScreen();
    }
  } else {
    window._isGuest = false;
    await afterLogin(session.user?.id ?? null);
  }
}

// ==============================
// ログイン成功後の処理
// ==============================
window.onLoginSuccess = async function(session) {
  window._isGuest = false;
  showLoading('セーブデータ読み込み中...');
  await afterLogin(session?.user?.id ?? null);
};

// ゲスト→Googleアカウント昇格完了（OAuthリダイレクト後）
window.onGuestUpgradeComplete = async function(session) {
  showLoading('データを移行中...');
  const newUserId = session?.user?.id;
  if (newUserId && G) {
    try {
      await saveToDB(G);
    } catch(e) {
      console.error('ゲストデータ移行失敗:', e);
    }
  }
  localStorage.removeItem('volleyball_guest_id');
  window._isGuest = false;
  hideLoading();
  const modal = document.getElementById('modal');
  if (modal) modal.style.display = 'none';
  showAlert('アカウントを作成し、データをクラウドに移行しました！');
};

// 既存アカウントへのGoogle連携完了（OAuthリダイレクト後）
window.onAccountLinkComplete = async function() {
  hideLoading();
  const modal = document.getElementById('modal');
  if (modal) modal.style.display = 'none';
  await showAccountModal();
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
        <button id="btn-account" class="btn-account" title="アカウント管理">👤</button>
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

  // アカウント管理ボタン
  document.getElementById('btn-account').addEventListener('click', () => showAccountModal());

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
// アカウント管理モーダル
// ==============================
const _GOOGLE_SVG = `<svg viewBox="0 0 24 24" width="18" height="18" style="vertical-align:middle;margin-right:6px"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>`;

async function showAccountModal() {
  const modal = document.getElementById('modal');
  if (!modal) return;

  const isGuest = !!window._isGuest;
  let session = null;
  let identities = [];

  if (!isGuest) {
    session = await getSession();
    identities = await getUserIdentities();
  }

  const email = session?.user?.email || '';
  const hasGoogle = identities.some(i => i.provider === 'google');
  const hasEmail = identities.some(i => i.provider === 'email');

  const modalHeader = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
      <h2 style="margin:0">アカウント管理</h2>
      <button id="modal-close" class="modal-close-btn">✕</button>
    </div>`;

  if (isGuest) {
    modal.innerHTML = `
      <div class="modal-content">
        ${modalHeader}
        <div class="account-guest-banner">
          <span style="font-size:1.5rem">👤</span>
          <div>
            <div class="account-guest-title">ゲストモードでプレイ中</div>
            <div class="account-guest-sub">データはこの端末のみ保存されます</div>
          </div>
        </div>
        <p class="account-info-text">アカウントを作成するとデータをクラウドに保存でき、複数端末で引き継ぎができます。</p>
        <button id="btn-upgrade-google" class="btn-google btn-full" style="margin-bottom:12px">
          ${_GOOGLE_SVG}Googleアカウントで登録
        </button>
        <div class="login-divider"><span class="login-divider-text">または</span></div>
        <div id="upgrade-error" class="login-error" style="display:none"></div>
        <div class="form-group">
          <label class="form-label">メールアドレス</label>
          <input id="upgrade-email" type="email" class="form-input" placeholder="example@email.com">
        </div>
        <div class="form-group">
          <label class="form-label">パスワード（6文字以上）</label>
          <input id="upgrade-password" type="password" class="form-input" placeholder="パスワード">
        </div>
        <button id="btn-upgrade-email" class="btn-primary btn-full" style="margin-bottom:24px">メールアドレスで登録</button>
        <hr class="account-divider">
        <button id="btn-guest-exit" class="btn-danger btn-full" style="font-size:0.85rem">ゲスト終了（データを削除）</button>
      </div>`;

    modal.style.display = 'flex';
    document.getElementById('modal-close').addEventListener('click', () => { modal.style.display = 'none'; });

    document.getElementById('btn-upgrade-google').addEventListener('click', async () => {
      showLoading('Googleアカウントで登録中...');
      window._oauthGuestUpgradePending = true;
      try {
        await signInWithGoogle();
      } catch(e) {
        hideLoading();
        window._oauthGuestUpgradePending = false;
        const errEl = document.getElementById('upgrade-error');
        errEl.textContent = getAuthErrorMessage(e);
        errEl.style.display = 'block';
      }
    });

    document.getElementById('btn-upgrade-email').addEventListener('click', async () => {
      const emailVal = document.getElementById('upgrade-email').value.trim();
      const pw = document.getElementById('upgrade-password').value;
      const errEl = document.getElementById('upgrade-error');
      errEl.style.display = 'none';
      if (!emailVal || !pw) { errEl.textContent = 'メールアドレスとパスワードを入力してください。'; errEl.style.display = 'block'; return; }
      if (pw.length < 6) { errEl.textContent = 'パスワードは6文字以上にしてください。'; errEl.style.display = 'block'; return; }
      showLoading('アカウント作成中...');
      try {
        const data = await signUp(emailVal, pw);
        if (data.session) {
          // メール確認不要の場合：即座にデータ移行
          await window.onGuestUpgradeComplete(data.session);
        } else {
          // メール確認が必要な場合
          hideLoading();
          modal.style.display = 'none';
          showAlert('確認メールを送信しました。メール内のリンクをクリックしてからログインしてください。');
        }
      } catch(e) {
        hideLoading();
        errEl.textContent = getAuthErrorMessage(e);
        errEl.style.display = 'block';
      }
    });

    document.getElementById('btn-guest-exit').addEventListener('click', () => {
      if (!confirm('ゲストデータをすべて削除してログイン画面に戻りますか？\nこの操作は元に戻せません。')) return;
      localStorage.removeItem('volleyball_guest_id');
      localStorage.removeItem('volleyball_game_save');
      window._isGuest = false;
      G = null;
      modal.style.display = 'none';
      renderLoginScreen();
    });

  } else {
    const providerLabel = hasGoogle && hasEmail ? 'Google・メール両方' :
                          hasGoogle ? 'Google' : 'メール';

    const googleSection = hasGoogle
      ? `<div class="account-linked-badge">✓ Google連携済み</div>`
      : `<button id="btn-link-google" class="btn-google btn-full" style="margin-top:8px">${_GOOGLE_SVG}Googleアカウントを連携</button>`;

    const emailSection = hasEmail
      ? `<div class="account-linked-badge">✓ メール/パスワード設定済み</div>`
      : `<div class="form-group" style="margin-top:8px">
           <label class="form-label">パスワードを設定してメールでもログイン可能にする</label>
           <input id="set-password" type="password" class="form-input" placeholder="新しいパスワード（6文字以上）">
           <button id="btn-set-password" class="btn-secondary btn-full" style="margin-top:8px">パスワードを設定</button>
         </div>`;

    modal.innerHTML = `
      <div class="modal-content">
        ${modalHeader}
        <div class="account-info-row">
          <span class="account-info-label">メールアドレス</span>
          <span class="account-info-value">${email}</span>
        </div>
        <div class="account-info-row">
          <span class="account-info-label">連携方法</span>
          <span class="account-info-value">${providerLabel}</span>
        </div>
        <div class="account-section-title">アカウント連携</div>
        <div id="link-error" class="login-error" style="display:none"></div>
        ${googleSection}
        ${emailSection}
        <hr class="account-divider">
        <button id="btn-do-logout" class="btn-danger btn-full">ログアウト</button>
      </div>`;

    modal.style.display = 'flex';
    document.getElementById('modal-close').addEventListener('click', () => { modal.style.display = 'none'; });

    if (!hasGoogle) {
      document.getElementById('btn-link-google').addEventListener('click', async () => {
        showLoading('Googleアカウントを連携中...');
        window._oauthLinkPending = true;
        try {
          await linkWithGoogle();
        } catch(e) {
          hideLoading();
          window._oauthLinkPending = false;
          const errEl = document.getElementById('link-error');
          errEl.textContent = getAuthErrorMessage(e);
          errEl.style.display = 'block';
        }
      });
    }

    if (!hasEmail) {
      document.getElementById('btn-set-password').addEventListener('click', async () => {
        const pw = document.getElementById('set-password').value;
        const errEl = document.getElementById('link-error');
        errEl.style.display = 'none';
        if (pw.length < 6) { errEl.textContent = 'パスワードは6文字以上にしてください。'; errEl.style.display = 'block'; return; }
        showLoading('パスワードを設定中...');
        try {
          await setEmailPassword(pw);
          hideLoading();
          modal.style.display = 'none';
          await showAccountModal();
        } catch(e) {
          hideLoading();
          errEl.textContent = getAuthErrorMessage(e);
          errEl.style.display = 'block';
        }
      });
    }

    document.getElementById('btn-do-logout').addEventListener('click', () => {
      modal.style.display = 'none';
      onLogout();
    });
  }
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
