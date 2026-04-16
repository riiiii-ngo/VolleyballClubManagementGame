// ============================================================
// ui.js - UI描画
// ============================================================

// ==============================
// ローディングオーバーレイ
// ==============================
function showLoading(msg = '読み込み中...') {
  let el = document.getElementById('loading-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'loading-overlay';
    document.body.appendChild(el);
  }
  el.innerHTML = `<div class="loading-inner"><div class="loading-spinner"></div><div class="loading-msg">${msg}</div></div>`;
  el.style.display = 'flex';
}

function hideLoading() {
  const el = document.getElementById('loading-overlay');
  if (el) el.style.display = 'none';
}

// ==============================
// ログイン・新規登録画面
// ==============================
function renderLoginScreen() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <h1 class="title-logo">🏐 バレー部育成ゲーム</h1>
        <p class="title-sub">アカウントにログインしてプレイ</p>

        <div id="login-error" class="login-error" style="display:none"></div>

        <div class="form-group">
          <label class="form-label">メールアドレス</label>
          <input id="input-email" type="email" class="form-input" placeholder="example@email.com" autocomplete="email">
        </div>
        <div class="form-group">
          <label class="form-label">パスワード</label>
          <input id="input-password" type="password" class="form-input" placeholder="パスワード（6文字以上）" autocomplete="current-password">
        </div>

        <div class="login-actions">
          <button id="btn-login" class="btn-primary btn-large btn-full">ログイン</button>
          <button id="btn-signup" class="btn-secondary btn-large btn-full">新規登録</button>
        </div>

      </div>
    </div>
  `;

  const emailEl    = document.getElementById('input-email');
  const passwordEl = document.getElementById('input-password');
  const errorEl    = document.getElementById('login-error');

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.style.display = 'block';
  }
  function clearError() { errorEl.style.display = 'none'; }

  document.getElementById('btn-login').addEventListener('click', async () => {
    clearError();
    const email    = emailEl.value.trim();
    const password = passwordEl.value;
    if (!email || !password) { showError('メールアドレスとパスワードを入力してください。'); return; }
    showLoading('ログイン中...');
    try {
      const loginData = await signIn(email, password);
      await window.onLoginSuccess(loginData?.session);
    } catch(e) {
      hideLoading();
      showError(getAuthErrorMessage(e));
    }
  });

  document.getElementById('btn-signup').addEventListener('click', async () => {
    clearError();
    const email    = emailEl.value.trim();
    const password = passwordEl.value;
    if (!email || !password) { showError('メールアドレスとパスワードを入力してください。'); return; }
    if (password.length < 6) { showError('パスワードは6文字以上にしてください。'); return; }
    showLoading('アカウント作成中...');
    try {
      await signUp(email, password);
      await window.onLoginSuccess();
    } catch(e) {
      hideLoading();
      showError(getAuthErrorMessage(e));
    }
  });

  // Enterキーでログイン
  [emailEl, passwordEl].forEach(el => {
    el.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('btn-login').click();
    });
  });
}

// Supabaseエラーメッセージを日本語に変換
function getAuthErrorMessage(error) {
  const msg = error.message || '';
  if (msg.includes('Invalid login credentials'))  return 'メールアドレスまたはパスワードが正しくありません。';
  if (msg.includes('User already registered'))     return 'このメールアドレスはすでに登録されています。';
  if (msg.includes('Password should be'))          return 'パスワードは6文字以上にしてください。';
  return `エラー: ${msg}`;
}

// ==============================
// ステータスバー
// ==============================
function updateStatusBar(state) {
  document.getElementById('ui-date').textContent = `${state.year}年目 ${getDateString(state.week)}`;
  const repName = REPUTATIONS[state.reputation];
  const repColor = REPUTATION_COLORS[state.reputation];
  document.getElementById('ui-rep').innerHTML = `評判: <span style="color:${repColor};font-weight:bold">${repName}</span>`;
  document.getElementById('ui-points').textContent = `P: ${state.points}`;

  // 次の試合情報
  const next = getNextMatchInfo(state);
  const nextEl = document.getElementById('ui-next');
  if (next) {
    const weeksLeft = next.week - state.week;
    nextEl.textContent = weeksLeft === 0 ? `今週: ${next.name}` : `次の試合: ${next.name} (${weeksLeft}週後)`;
  } else {
    nextEl.textContent = '今年の試合は終了';
  }
}

// ==============================
// ホーム画面
// ==============================
function renderHome(state) {
  const el = document.getElementById('tab-home');

  // 試合週か練習週か
  const matchInfo = MATCH_SCHEDULE[state.week];
  const tState = matchInfo ? state.tournaments[matchInfo.tournament] : null;
  const isMatchWeek = matchInfo && tState && !tState.eliminated && !tState.champion;
  const isEliminatedMatchWeek = matchInfo && tState && tState.eliminated;

  let weeklyInfo = '';
  if (isMatchWeek) {
    weeklyInfo = `<div class="match-week-banner">
      <span class="banner-icon">🏐</span> 今週は <strong>${matchInfo.name}</strong>！
    </div>`;
  } else if (isEliminatedMatchWeek) {
    weeklyInfo = `<div class="info-box muted">試合週ですが、${TOURNAMENT_NAMES[matchInfo.tournament]}は敗退済みです。練習に集中しましょう。</div>`;
  }

  // スタミナ警告
  const lowStamina = state.players.filter(p => p.currentStamina < 20);
  let staminaWarning = '';
  if (lowStamina.length > 0) {
    staminaWarning = `<div class="warning-box">⚠ スタミナ低下: ${lowStamina.map(p => p.name).join('、')}</div>`;
  }

  // 練習グループ状況
  const groupCount = Math.min(state.practiceGroups.length, maxPracticeGroups(state.reputation));
  let practiceStatus = '<div class="section-title">練習状況</div><div class="group-status">';
  for (let i = 0; i < groupCount; i++) {
    const menuId = state.practiceSelections[i];
    const menu = menuId ? getPracticeMenu(menuId) : null;
    const cnt = state.practiceGroups[i].length;
    practiceStatus += `<div class="group-chip ${menu ? 'active' : 'inactive'}">
      G${i + 1}: ${menu ? menu.name : '未設定'} (${cnt}名)
    </div>`;
  }
  practiceStatus += '</div>';

  // 試合履歴（直近3件）
  let historyHtml = '';
  if (state.matchLog.length > 0) {
    historyHtml = '<div class="section-title">直近の試合</div><div class="match-history">';
    state.matchLog.slice(0, 3).forEach(m => {
      historyHtml += `<div class="history-item ${m.won ? 'win' : 'lose'}">
        <span class="h-year">${m.year}年目</span>
        <span class="h-name">${m.name}</span>
        <span class="h-result">${m.won ? '勝利' : '敗戦'} ${m.score}</span>
        <span class="h-detail">${m.setDetail}</span>
      </div>`;
    });
    historyHtml += '</div>';
  }

  // トーナメント状況
  let tournamentHtml = '<div class="section-title">今年のトーナメント</div><div class="tournament-status">';
  for (const [key, name] of Object.entries(TOURNAMENT_NAMES)) {
    const ts = state.tournaments[key];
    let status, cls;
    if (ts.champion) { status = '優勝！'; cls = 'champion'; }
    else if (ts.eliminated) { status = '敗退'; cls = 'eliminated'; }
    else { status = `${ts.currentRound}回戦突破`; cls = 'active'; }
    tournamentHtml += `<div class="tournament-item ${cls}">
      <span class="t-name">${name}</span>
      <span class="t-status">${status}</span>
    </div>`;
  }
  tournamentHtml += '</div>';

  // 週次ログ
  let weekLogHtml = '';
  if (state.weeklyLog && state.weeklyLog.length > 0) {
    weekLogHtml = '<div class="section-title">先週の出来事</div><div class="weekly-log">';
    state.weeklyLog.forEach(l => { weekLogHtml += `<div class="log-line">${l}</div>`; });
    weekLogHtml += '</div>';
  }

  el.innerHTML = `
    ${weeklyInfo}
    ${staminaWarning}
    <div class="home-grid">
      <div class="home-col">
        ${practiceStatus}
        ${tournamentHtml}
      </div>
      <div class="home-col">
        ${weekLogHtml}
        ${historyHtml}
      </div>
    </div>
    <div class="advance-area">
      <button id="btn-advance" class="btn-primary btn-large ${isMatchWeek ? 'btn-match' : ''}">
        ${isMatchWeek ? `試合へ: ${matchInfo.name}` : '次の週へ進む'}
      </button>
      ${isMatchWeek ? `<div class="match-note">スタメン設定: ${isStarterComplete(state) ? '完了' : '<span class="warn">未完了</span>'}</div>` : ''}
    </div>
  `;

  document.getElementById('btn-advance').addEventListener('click', () => window.onAdvanceWeek());
}

// ==============================
// チーム画面
// ==============================
function renderTeam(state) {
  const el = document.getElementById('tab-team');

  // スタメン設定
  const slotDefs = [
    { slot: 'OH1', label: 'OH①' }, { slot: 'OH2', label: 'OH②' },
    { slot: 'MB1', label: 'MB①' }, { slot: 'MB2', label: 'MB②' },
    { slot: 'OP',  label: 'OP'   }, { slot: 'Se',  label: 'Se'   },
    { slot: 'Li',  label: 'Li'   },
  ];

  let starterHtml = '<div class="section-title">スタメン設定</div><div class="starters-grid">';
  slotDefs.forEach(def => {
    const pid = state.starters[def.slot];
    const player = pid ? getPlayer(state, pid) : null;
    const posName = def.slot.replace(/[0-9]/g,'');
    starterHtml += `
      <div class="starter-slot">
        <div class="slot-label">${def.label}</div>
        <select class="starter-select" data-slot="${def.slot}">
          <option value="">-- 未設定 --</option>
          ${state.players
            .filter(p => p.position === posName || p.isAllRounder)
            .sort((a, b) => b.grade - a.grade || playerOverall(b) - playerOverall(a))
            .map(p => `<option value="${p.id}" ${pid === p.id ? 'selected' : ''}>
              ${p.name} (${p.grade}年 OVR:${playerOverall(p)})
            </option>`).join('')}
        </select>
      </div>`;
  });
  starterHtml += '</div>';

  // 練習グループ設定
  const groupCount = Math.min(state.practiceGroups.length, maxPracticeGroups(state.reputation));
  let groupHtml = '<div class="section-title">練習グループ設定</div>';
  groupHtml += '<div class="group-grid">';
  for (let gi = 0; gi < groupCount; gi++) {
    groupHtml += `<div class="group-col">
      <div class="group-header">グループ${gi + 1}</div>
      <div class="group-players" id="group-${gi}">`;
    state.players.forEach(p => {
      const inGroup = state.practiceGroups[gi].includes(p.id);
      groupHtml += `<label class="player-check">
        <input type="checkbox" class="group-check" data-group="${gi}" data-pid="${p.id}" ${inGroup ? 'checked' : ''}>
        ${p.name} (${p.grade}年 ${p.position})
      </label>`;
    });
    groupHtml += '</div></div>';
  }
  groupHtml += '</div>';
  groupHtml += '<button id="btn-auto-group" class="btn-secondary">自動振り分け</button>';

  // 選手一覧
  let rosterHtml = '<div class="section-title">選手一覧</div><div class="roster-table-wrap">';
  rosterHtml += `<table class="roster-table">
    <thead><tr>
      <th>名前</th><th>学年</th><th>Pos</th><th>OVR</th>
      <th>SP</th><th>RV</th><th>BL</th><th>SV</th><th>TS</th>
      <th>PW</th><th>SP2</th><th>TC</th><th>ST</th>
    </tr></thead><tbody>`;

  state.players
    .sort((a, b) => b.grade - a.grade || playerOverall(b) - playerOverall(a))
    .forEach(p => {
      const sts = staminaStatus(p.currentStamina);
      const isStarter = Object.values(state.starters).includes(p.id);
      rosterHtml += `<tr class="${isStarter ? 'starter-row' : ''}">
        <td>${p.name}${p.isAllRounder ? ' <span class="badge-ar">全</span>' : ''}${isStarter ? ' <span class="badge-st">先</span>' : ''}</td>
        <td>${p.grade}年</td>
        <td>${p.position}</td>
        <td><strong>${playerOverall(p)}</strong></td>
        <td>${p.params.spike}</td>
        <td>${p.params.receive}</td>
        <td>${p.params.block}</td>
        <td>${p.params.serve}</td>
        <td>${p.params.toss}</td>
        <td>${p.params.power}</td>
        <td>${p.params.speed}</td>
        <td>${p.params.technique}</td>
        <td><span style="color:${sts.color}">${p.currentStamina}</span></td>
      </tr>`;
    });

  rosterHtml += '</tbody></table></div>';

  el.innerHTML = starterHtml + groupHtml + rosterHtml;

  // スタメン変更イベント
  el.querySelectorAll('.starter-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const slot = sel.dataset.slot;
      const val  = sel.value ? parseInt(sel.value) : null;
      window.onStarterChange(slot, val);
    });
  });

  // グループ変更イベント
  el.querySelectorAll('.group-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const gi  = parseInt(cb.dataset.group);
      const pid = parseInt(cb.dataset.pid);
      window.onGroupChange(gi, pid, cb.checked);
    });
  });

  // 自動振り分け
  document.getElementById('btn-auto-group').addEventListener('click', () => window.onAutoGroup());
}

// ==============================
// 練習画面
// ==============================
function renderPractice(state) {
  const el = document.getElementById('tab-practice');
  const groupCount = Math.min(state.practiceGroups.length, maxPracticeGroups(state.reputation));
  const menus = getAvailablePracticeMenus(state.reputation);
  const eff = getPracticeEfficiency(state);

  let html = `<div class="section-title">練習メニュー設定</div>
    <div class="efficiency-info">現在の練習効率: <strong>${Math.round(eff * 100)}%</strong>`;

  if (state.activeEfficiency) {
    html += ` （アイテム効果: 残${state.activeEfficiency.weeksLeft}週）`;
  }
  if (state.facilities.length > 0) {
    html += ` / 設備効果: ${state.facilities.map(f => f.name).join('、')}`;
  }
  html += '</div>';

  for (let gi = 0; gi < groupCount; gi++) {
    const selected = state.practiceSelections[gi] || '';
    const members  = state.practiceGroups[gi].map(id => getPlayer(state, id)).filter(Boolean);

    html += `<div class="practice-group-block">
      <div class="group-header">グループ${gi + 1} (${members.length}名: ${members.map(p => p.name).join('、')})</div>
      <div class="menu-grid">`;

    menus.forEach(menu => {
      const isSelected = selected === menu.id;
      html += `<label class="menu-card ${isSelected ? 'selected' : ''}">
        <input type="radio" name="menu-${gi}" value="${menu.id}" ${isSelected ? 'checked' : ''} data-group="${gi}">
        <div class="menu-name">${menu.name}</div>
        <div class="menu-params">↑ ${menu.params.map(k => PARAM_NAMES[k]).join('・')}</div>
        <div class="menu-cost">スタミナ消費: ${menu.staminaCost}</div>
        <div class="menu-tier">Tier ${menu.tier}</div>
      </label>`;
    });

    html += '</div></div>';
  }

  // スタミナ一覧
  html += '<div class="section-title">選手スタミナ</div><div class="stamina-list">';
  state.players.forEach(p => {
    const sts = staminaStatus(p.currentStamina);
    const pct = Math.round((p.currentStamina / p.maxStamina) * 100);
    html += `<div class="stamina-item">
      <span class="st-name">${p.name}</span>
      <div class="st-bar-wrap">
        <div class="st-bar" style="width:${pct}%;background:${sts.color}"></div>
      </div>
      <span class="st-val" style="color:${sts.color}">${p.currentStamina}/${p.maxStamina} ${sts.text}</span>
    </div>`;
  });
  html += '</div>';

  el.innerHTML = html;

  // 練習メニュー選択イベント
  el.querySelectorAll('input[type="radio"]').forEach(radio => {
    radio.addEventListener('change', () => {
      const gi = parseInt(radio.dataset.group);
      window.onPracticeSelect(gi, radio.value);
    });
  });
}

// ==============================
// スカウト画面
// ==============================
function renderScout(state) {
  const el = document.getElementById('tab-scout');

  // スカウトチケット確認
  const tickets = state.inventory.filter(i => i.effect === 'scout' || i.effect === 'scout_gold');

  let html = `<div class="section-title">スカウト</div>
    <div class="info-box">スカウトチケットを使用して、次年度の選手をスカウトします。</div>
    <div class="scout-tickets">
      スカウトチケット: <strong>${tickets.filter(t => t.effect === 'scout').length}枚</strong>
      ／ 金のスカウトチケット: <strong>${tickets.filter(t => t.effect === 'scout_gold').length}枚</strong>
    </div>
    <div class="scout-options">
      <div class="scout-option-block">
        <div class="option-title">ポジション指定</div>
        <select id="scout-position">
          <option value="random">ランダム（オールラウンダー確率UP）</option>
          ${POSITIONS.map(p => `<option value="${p}">${POSITION_NAMES[p]}(${p})</option>`).join('')}
        </select>
      </div>
    </div>
    <div class="scout-actions">`;

  if (tickets.length === 0) {
    html += '<div class="info-box muted">スカウトチケットがありません。ショップで購入するか、試合で獲得してください。</div>';
  } else {
    const normalCount = tickets.filter(t => t.effect === 'scout').length;
    const goldCount   = tickets.filter(t => t.effect === 'scout_gold').length;
    if (normalCount > 0) {
      html += `<button id="btn-scout-normal" class="btn-primary">スカウトチケットを使う (残${normalCount}枚)</button>`;
    }
    if (goldCount > 0) {
      html += `<button id="btn-scout-gold" class="btn-gold">金のスカウトチケットを使う (残${goldCount}枚)</button>`;
    }
  }
  html += '</div>';

  // スカウト済み選手表示 (grade=1の選手 = 今年スカウトした選手)
  const scouted = state.players.filter(p => p.grade === 1 && p._scouted);
  if (scouted.length > 0) {
    html += '<div class="section-title">スカウト済み選手</div><div class="scout-list">';
    scouted.forEach(p => {
      html += `<div class="scout-card">
        <div class="sc-name">${p.name} ${p.isAllRounder ? '<span class="badge-ar">オールラウンダー</span>' : ''}</div>
        <div class="sc-pos">${POSITION_NAMES[p.position]}(${p.position}) / ランク${p.rank || '?'}</div>
        <div class="sc-params">
          ${PARAM_KEYS.filter(k=>k!=='stamina').map(k => `<span class="param-chip">${PARAM_NAMES[k]}:${p.params[k]}</span>`).join('')}
        </div>
      </div>`;
    });
    html += '</div>';
  }

  el.innerHTML = html;

  el.querySelector('#btn-scout-normal')?.addEventListener('click', () => window.onScout(false));
  el.querySelector('#btn-scout-gold')?.addEventListener('click',  () => window.onScout(true));
}

// スカウト結果モーダル
function showScoutResult(player) {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content">
      <h2>スカウト成功！</h2>
      <div class="scout-result">
        <div class="sr-name">${player.name}</div>
        <div class="sr-pos">${POSITION_NAMES[player.position]} (${player.position})
          ${player.isAllRounder ? ' <span class="badge-ar">オールラウンダー</span>' : ''}
        </div>
        <div class="sr-rank">ランク ${player.rank}</div>
        <table class="param-table">
          <tr>${PARAM_KEYS.map(k => `<th>${PARAM_NAMES[k]}</th>`).join('')}</tr>
          <tr>${PARAM_KEYS.map(k => `<td>${player.params[k]}</td>`).join('')}</tr>
        </table>
      </div>
      <button id="modal-close" class="btn-primary">OK</button>
    </div>`;
  modal.style.display = 'flex';
  document.getElementById('modal-close').addEventListener('click', () => modal.style.display = 'none');
}

// ==============================
// ショップ画面
// ==============================
function renderShop(state) {
  const el = document.getElementById('tab-shop');

  const availableItems = ITEMS.filter(i => i.minRep <= state.reputation);
  const availableFacs  = FACILITIES.filter(f => f.minRep <= state.reputation);
  const ownedFacIds    = new Set(state.facilities.map(f => f.id));

  let html = `<div class="section-title">ショップ</div>
    <div class="shop-points">所持ポイント: <strong>${state.points} P</strong></div>`;

  // アイテム
  html += '<div class="section-title sub">アイテム</div><div class="shop-grid">';
  availableItems.forEach((item, idx) => {
    const canBuy = state.points >= item.cost;
    html += `<div class="shop-card ${canBuy ? '' : 'cannot-buy'}">
      <div class="shop-name">${item.name}</div>
      <div class="shop-desc">${item.desc}</div>
      <div class="shop-cost">${item.cost} P</div>
      <button class="btn-buy ${canBuy ? 'btn-primary' : 'btn-disabled'}"
        data-type="item" data-id="${item.id}" ${canBuy ? '' : 'disabled'}>購入</button>
    </div>`;
  });
  html += '</div>';

  // 設備
  html += '<div class="section-title sub">設備</div><div class="shop-grid">';
  availableFacs.forEach(fac => {
    const owned  = ownedFacIds.has(fac.id);
    const canBuy = !owned && state.points >= fac.cost;
    html += `<div class="shop-card ${owned ? 'owned' : (canBuy ? '' : 'cannot-buy')}">
      <div class="shop-name">${fac.name}</div>
      <div class="shop-desc">${fac.desc}</div>
      <div class="shop-cost">${owned ? '設置済み' : fac.cost + ' P'}</div>
      ${owned ? '<div class="badge-owned">設置済み</div>' :
        `<button class="btn-buy ${canBuy ? 'btn-primary' : 'btn-disabled'}"
          data-type="facility" data-id="${fac.id}" ${canBuy ? '' : 'disabled'}>購入</button>`}
    </div>`;
  });
  html += '</div>';

  // 所持アイテム
  html += '<div class="section-title sub">所持アイテム</div>';
  const consumable = state.inventory.filter(i => i.effect !== 'scout' && i.effect !== 'scout_gold');
  const scoutItems = state.inventory.filter(i => i.effect === 'scout' || i.effect === 'scout_gold');

  if (state.inventory.length === 0) {
    html += '<div class="info-box muted">所持アイテムなし</div>';
  } else {
    html += '<div class="inventory-list">';
    state.inventory.forEach((inv, idx) => {
      const def = [...ITEMS, ...FACILITIES].find(i => i.id === inv.id);
      if (!def) return;
      const isScout = inv.effect === 'scout' || inv.effect === 'scout_gold';
      html += `<div class="inv-item">
        <span>${def.name}</span>
        ${inv.duration ? `<span class="inv-dur">残${inv.weeksLeft || inv.duration}週</span>` : ''}
        ${!isScout ? `<button class="btn-use btn-secondary" data-inv-idx="${idx}">使用</button>` : ''}
      </div>`;
    });
    html += '</div>';
  }

  el.innerHTML = html;

  // 購入イベント
  el.querySelectorAll('.btn-buy:not(.btn-disabled)').forEach(btn => {
    btn.addEventListener('click', () => window.onShopBuy(btn.dataset.type, btn.dataset.id));
  });
  // 使用イベント
  el.querySelectorAll('.btn-use').forEach(btn => {
    btn.addEventListener('click', () => window.onUseItem(parseInt(btn.dataset.invIdx)));
  });
}

// ==============================
// 試合結果モーダル
// ==============================
function showMatchResult(result) {
  if (!result.success) {
    showAlert(result.msg);
    return;
  }

  const modal = document.getElementById('modal');
  const bgClass = result.won ? 'result-win' : 'result-lose';
  const sets = result.setResults.map(r => `第${r.setNum}セット ${r.scoreA}-${r.scoreB}`).join('\n');

  let logHtml = '';
  if (result.log && result.log.length > 0) {
    logHtml = '<div class="match-log-area">' +
      result.log.map(l => `<div class="match-log-line">${l}</div>`).join('') +
      '</div>';
  }

  modal.innerHTML = `
    <div class="modal-content ${bgClass}">
      <h2>${result.matchName}</h2>
      <div class="result-main">
        <div class="result-badge ${result.won ? 'win' : 'lose'}">${result.won ? '勝利' : '敗戦'}</div>
        <div class="result-score">${result.setsA} - ${result.setsB}</div>
        <div class="result-sets">${result.setResults.map(r => `${r.scoreA}-${r.scoreB}`).join(' / ')}</div>
      </div>
      <div class="result-rewards">
        ${result.repGain >= 0 ? `評判ポイント +${result.repGain}` : `評判ポイント ${result.repGain}`}
        ${result.shopGain ? ` ／ ショップポイント +${result.shopGain}` : ''}
        ${result.won && state_ref.tournaments[MATCH_SCHEDULE[state_ref.week]?.tournament]?.champion
          ? ' 🏆 優勝！' : ''}
      </div>
      <div class="log-toggle">
        <button id="btn-log-toggle" class="btn-secondary">試合ログを見る</button>
      </div>
      <div id="match-log-detail" style="display:none">${logHtml}</div>
      <button id="modal-close" class="btn-primary">閉じる</button>
    </div>`;

  modal.style.display = 'flex';
  document.getElementById('modal-close').addEventListener('click', () => {
    modal.style.display = 'none';
    window.onModalClose();
  });
  document.getElementById('btn-log-toggle').addEventListener('click', () => {
    const detail = document.getElementById('match-log-detail');
    detail.style.display = detail.style.display === 'none' ? 'block' : 'none';
  });
}

// ==============================
// タイトル画面
// ==============================
async function renderTitleScreen(userId = null) {
  const app = document.getElementById('app');
  // セーブデータ確認中はスピナー表示
  app.innerHTML = `<div style="display:flex;justify-content:center;align-items:center;height:100vh"><div class="loading-spinner"></div></div>`;

  let hasSaveData = false;
  try {
    hasSaveData = await hasSave(userId);
  } catch(e) {
    console.error('hasSave failed:', e);
  }

  app.innerHTML = `
    <div class="title-screen">
      <div class="title-main">
        <h1 class="title-logo">🏐 バレー部育成ゲーム</h1>
        <p class="title-sub">高校バレー部の監督となって日本一を目指せ！</p>
        <div class="title-btns">
          <button id="btn-new-game" class="btn-primary btn-large">ニューゲーム</button>
          ${hasSaveData ? '<button id="btn-continue" class="btn-secondary btn-large">コンティニュー</button>' : ''}
        </div>
      </div>
    </div>`;

  document.getElementById('btn-new-game').addEventListener('click', () => window.onNewGame());
  document.getElementById('btn-continue')?.addEventListener('click', () => window.onContinue());
}

// ==============================
// 年度末画面
// ==============================
function showYearEnd(state, graduates, newPlayers) {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content">
      <h2>${state.year - 1}年目 終了</h2>
      <div class="year-summary">
        <div class="section-title">卒業生 (${graduates.length}名)</div>
        <div>${graduates.length > 0 ? graduates.map(p => `${p.name}(${p.position})`).join('、') : 'なし'}</div>
        <div class="section-title" style="margin-top:12px">新入部員</div>
        <div>${newPlayers.length > 0 ? newPlayers.map(p => `${p.name}(${p.position} OVR:${playerOverall(p)})`).join('、') : 'なし'}</div>
      </div>
      <button id="modal-close" class="btn-primary">${state.year}年目開始！</button>
    </div>`;
  modal.style.display = 'flex';
  document.getElementById('modal-close').addEventListener('click', () => {
    modal.style.display = 'none';
    window.onModalClose();
  });
}

// ==============================
// 汎用アラート
// ==============================
function showAlert(msg) {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content">
      <p>${msg}</p>
      <button id="modal-close" class="btn-primary">OK</button>
    </div>`;
  modal.style.display = 'flex';
  document.getElementById('modal-close').addEventListener('click', () => modal.style.display = 'none');
}

// グローバル参照（試合結果モーダルで使用）
let state_ref = null;
function setStateRef(s) { state_ref = s; }
