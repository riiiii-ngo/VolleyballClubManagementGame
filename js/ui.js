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
  const dateEl = document.getElementById('ui-date');
  if (dateEl) dateEl.textContent = `${state.year}年目 ${getDateString(state.week)}`;

  const repName  = REPUTATIONS[state.reputation];
  const repColor = REPUTATION_COLORS[state.reputation];
  const repEl = document.getElementById('ui-rep');
  if (repEl) repEl.innerHTML = `<span style="color:${repColor}">${repName}</span>`;

  const pointsEl = document.getElementById('ui-points');
  if (pointsEl) pointsEl.textContent = `${state.points}P`;

  const next = getNextMatchInfo(state);
  const nextEl   = document.getElementById('ui-next');
  const nextChip = document.getElementById('kpi-next-chip');
  if (nextEl) {
    if (next) {
      const weeksLeft = next.week - state.week;
      nextEl.textContent = weeksLeft === 0
        ? `今週！ ${next.name}`
        : `${next.name} ${weeksLeft}W`;
      if (nextChip) nextChip.classList.toggle('kpi-match', weeksLeft === 0);
    } else {
      nextEl.textContent = '試合なし';
      if (nextChip) nextChip.classList.remove('kpi-match');
    }
  }

  const avgEl = document.getElementById('ui-team-stamina');
  if (avgEl && state.players.length > 0) {
    const avg = Math.round(state.players.reduce((s, p) => s + p.currentStamina, 0) / state.players.length);
    const sts = staminaStatus(avg);
    avgEl.innerHTML = `<span style="color:${sts.color}">${avg}</span>`;
  }
}

// action-footer の内容をセット/クリアするヘルパー
function setActionFooter(html) {
  let footer = document.getElementById('action-footer');
  if (!footer) {
    footer = document.createElement('div');
    footer.id = 'action-footer';
    footer.className = 'action-footer';
    const app = document.getElementById('app');
    if (app) app.appendChild(footer);
  }
  if (html) {
    footer.innerHTML = html;
    footer.style.display = 'block';
  } else {
    footer.style.display = 'none';
  }
}

// ==============================
// ホーム画面（試合週用）
// ==============================
function renderHome(state) {
  const el = document.getElementById('tab-home');

  const matchInfo = MATCH_SCHEDULE[state.week];
  const tState = matchInfo ? state.tournaments[matchInfo.tournament] : null;
  const isMatchWeek = matchInfo && tState && !tState.eliminated && !tState.champion;
  const isEliminatedMatchWeek = matchInfo && tState && tState.eliminated;

  let qualified = true;
  let qualCondition = '';
  if (isMatchWeek) {
    if (matchInfo.tournament === 'interhigh' && !state.tournaments.prefectural.champion) {
      qualified = false; qualCondition = '出場条件：県大会優勝';
    }
    if (matchInfo.tournament === 'spring' && !state.tournaments.spring_prelim.champion) {
      qualified = false; qualCondition = '出場条件：春高予選優勝';
    }
  }

  // 状況カード
  let situationHtml = '';
  if (isMatchWeek && qualified) {
    situationHtml = `
      <div class="situation-card situation-match">
        <div class="situation-title">今週の試合</div>
        <div class="situation-main">🏐 ${matchInfo.name}</div>
        <div class="situation-sub">スタメン: ${isStarterComplete(state) ? '✓ 準備完了' : '⚠ 未設定あり'}</div>
      </div>`;
  } else if (isMatchWeek && !qualified) {
    situationHtml = `
      <div class="situation-card situation-warn">
        <div class="situation-title">試合週 (出場不可)</div>
        <div class="situation-main">${matchInfo.name}</div>
        <div class="situation-sub">${qualCondition} — 練習に切り替え</div>
      </div>`;
  } else if (isEliminatedMatchWeek) {
    situationHtml = `
      <div class="situation-card">
        <div class="situation-title">試合週 (敗退済み)</div>
        <div class="situation-main">今週は練習</div>
        <div class="situation-sub">${TOURNAMENT_NAMES[matchInfo.tournament]} は敗退済み</div>
      </div>`;
  } else {
    const next = getNextMatchInfo(state);
    const nextText = next
      ? `次の試合: ${next.name}（${next.week - state.week}週後）`
      : '今年の試合は全て終了';
    situationHtml = `
      <div class="situation-card situation-practice">
        <div class="situation-title">練習週</div>
        <div class="situation-main">${getDateString(state.week)}</div>
        <div class="situation-sub">${nextText}</div>
      </div>`;
  }

  // スタミナ警告
  const lowStamina = state.players.filter(p => p.currentStamina < 20);
  let staminaWarnHtml = '';
  if (lowStamina.length > 0) {
    staminaWarnHtml = `
      <div class="situation-card situation-warn">
        <div class="situation-title">⚠ スタミナ低下</div>
        <div class="situation-sub">${lowStamina.map(p => p.name).join('、')}</div>
      </div>`;
  }

  // チーム平均スタミナバー
  const teamAvgStamina = state.players.length > 0
    ? Math.round(state.players.reduce((s, p) => s + p.currentStamina, 0) / state.players.length)
    : 0;
  const sts0 = staminaStatus(teamAvgStamina);
  const teamStaminaHtml = `
    <div class="situation-card" style="padding:12px 16px">
      <div class="situation-title">チーム体力</div>
      <div class="team-stamina-overview">
        <div class="tso-label">平均</div>
        <div class="tso-bar-track">
          <div class="tso-bar-fill" style="width:${teamAvgStamina}%;background:${sts0.color}"></div>
        </div>
        <div class="tso-value" style="color:${sts0.color}">${teamAvgStamina}</div>
      </div>
    </div>`;

  // グループ簡易チップ
  const groupCount = Math.min(state.practiceGroups.length, maxPracticeGroups(state.reputation));
  let groupQuickHtml = '<div class="group-quick-row">';
  for (let gi = 0; gi < groupCount; gi++) {
    const menuId  = state.practiceSelections[gi];
    const menu    = menuId ? PRACTICE_MENUS.find(m => m.id === menuId) : null;
    const members = state.practiceGroups[gi].map(id => getPlayer(state, id)).filter(Boolean);
    groupQuickHtml += `
      <div class="group-quick-chip">
        <div class="gqc-name">Gr.${gi + 1}</div>
        <div class="gqc-menu ${menu ? '' : 'unset'}">${menu ? menu.name : '未設定'}</div>
        <div class="gqc-members">${members.map(p => p.name.split(' ')[0]).join(' · ') || '未割当'}</div>
      </div>`;
  }
  groupQuickHtml += '</div>';

  // トーナメント状況
  let tournamentHtml = '<div class="section-title">トーナメント状況</div><div class="tournament-status">';
  for (const [key, name] of Object.entries(TOURNAMENT_NAMES)) {
    const ts = state.tournaments[key];
    let condText = '';
    if (key === 'interhigh' && !state.tournaments.prefectural.champion && !ts.eliminated && !ts.champion && ts.currentRound === 0) {
      condText = '<span class="t-condition">条件: 県大会優勝</span>';
    }
    if (key === 'spring' && !state.tournaments.spring_prelim.champion && !ts.eliminated && !ts.champion && ts.currentRound === 0) {
      condText = '<span class="t-condition">条件: 春高予選優勝</span>';
    }
    let status, cls;
    if (ts.champion)        { status = '🏆 優勝！'; cls = 'champion'; }
    else if (ts.eliminated) { status = '敗退';      cls = 'eliminated'; }
    else                    { status = `${ts.currentRound}回戦突破`; cls = 'active'; }
    tournamentHtml += `<div class="tournament-item ${cls}">
      <span class="t-name">${name}${condText}</span>
      <span class="t-status">${status}</span>
    </div>`;
  }
  tournamentHtml += '</div>';

  // 試合履歴
  let historyHtml = '';
  if (state.matchLog.length > 0) {
    historyHtml = '<div class="section-title">直近の試合</div><div class="match-history">';
    state.matchLog.slice(0, 3).forEach(m => {
      historyHtml += `<div class="history-item ${m.won ? 'win' : 'lose'}">
        <span class="h-year">${m.year}年目</span>
        <span class="h-name">${m.name}</span>
        <span class="h-result">${m.won ? '勝' : '負'} ${m.score}</span>
        <span class="h-detail">${m.setDetail}</span>
      </div>`;
    });
    historyHtml += '</div>';
  }

  // 週次ログ
  let weekLogHtml = '';
  if (state.weeklyLog && state.weeklyLog.length > 0) {
    weekLogHtml = '<div class="section-title">先週の出来事</div><div class="weekly-log">';
    state.weeklyLog.forEach(l => { weekLogHtml += `<div class="log-line">${l}</div>`; });
    weekLogHtml += '</div>';
  }

  el.innerHTML = `
    ${situationHtml}
    ${staminaWarnHtml}
    ${teamStaminaHtml}
    ${groupQuickHtml}
    <div class="btn-action-secondary-row">
      <button class="btn-action-secondary" onclick="switchTabPublic('team')">👥 チーム設定</button>
      <button class="btn-action-secondary" onclick="switchTabPublic('scout')">🔍 スカウト</button>
    </div>
    ${tournamentHtml}
    ${weekLogHtml}
    ${historyHtml}
  `;

  // action-footer に進むボタン
  const isMatch = isMatchWeek && qualified;
  setActionFooter(`
    <button id="btn-advance" class="btn-action-primary ${isMatch ? 'btn-match-action' : ''}">
      ${isMatch ? `🏐 試合へ: ${matchInfo.name}` : '次の週へ進む →'}
    </button>
  `);
  document.getElementById('btn-advance').addEventListener('click', () => window.onAdvanceWeek());
}

// ==============================
// チーム画面
// ==============================
function renderTeam(state) {
  const el = document.getElementById('tab-team');
  setActionFooter('');

  const slotDefs = [
    { slot: 'OH1', label: 'OH①' }, { slot: 'OH2', label: 'OH②' },
    { slot: 'MB1', label: 'MB①' }, { slot: 'MB2', label: 'MB②' },
    { slot: 'OP',  label: 'OP'   }, { slot: 'Se',  label: 'セッター' },
    { slot: 'Li',  label: 'リベロ' },
  ];

  const starterComplete = isStarterComplete(state);
  let starterHtml = `
    <div class="team-section-header">
      <span class="team-section-label">スタメン設定</span>
      <span style="font-size:0.75rem;color:${starterComplete ? 'var(--green)' : 'var(--red)'}">
        ${starterComplete ? '✓ 完了' : '⚠ 未完了'}
      </span>
    </div>
    <div class="starter-grid-v2">`;

  slotDefs.forEach(def => {
    const pid     = state.starters[def.slot];
    const posName = def.slot.replace(/[0-9]/g, '');
    starterHtml += `
      <div class="starter-slot-v2">
        <div class="ssv2-label">${def.label}</div>
        <select class="ssv2-select" data-slot="${def.slot}">
          <option value="">-- 未設定 --</option>
          ${state.players
            .filter(p => p.position === posName || p.isAllRounder)
            .sort((a, b) => b.grade - a.grade || playerOverall(b) - playerOverall(a))
            .map(p => `<option value="${p.id}" ${pid === p.id ? 'selected' : ''}>
              ${p.name} (${p.grade}年)
            </option>`).join('')}
        </select>
      </div>`;
  });
  starterHtml += '</div>';

  // 練習グループ設定
  const groupCount = Math.min(state.practiceGroups.length, maxPracticeGroups(state.reputation));
  let groupHtml = `
    <div class="team-section-header">
      <span class="team-section-label">練習グループ</span>
      <button class="team-section-action" id="btn-auto-group">自動振り分け</button>
    </div>
    <div class="group-grid">`;

  for (let gi = 0; gi < groupCount; gi++) {
    groupHtml += `
      <div class="group-col">
        <div class="group-header">グループ${gi + 1}</div>
        <div class="group-players" id="group-${gi}">`;
    state.players.forEach(p => {
      const inGroup = state.practiceGroups[gi].includes(p.id);
      groupHtml += `
        <label class="player-check">
          <input type="checkbox" class="group-check" data-group="${gi}" data-pid="${p.id}" ${inGroup ? 'checked' : ''}>
          ${p.name} (${p.grade}年 ${p.position})
        </label>`;
    });
    groupHtml += '</div></div>';
  }
  groupHtml += '</div>';

  // 選手カードリスト
  let rosterHtml = `
    <div class="team-section-header">
      <span class="team-section-label">選手一覧 <small style="font-weight:400;text-transform:none">(タップで詳細)</small></span>
    </div>
    <div class="player-card-list">`;

  state.players
    .sort((a, b) => b.grade - a.grade || playerOverall(b) - playerOverall(a))
    .forEach(p => {
      const sts       = staminaStatus(p.currentStamina);
      const isStarter = Object.values(state.starters).includes(p.id);
      const ovr       = playerOverall(p);
      rosterHtml += `
        <div class="player-card ${isStarter ? 'starter-card' : ''}" data-pid="${p.id}">
          <div class="pc-identity">
            <div class="pc-name">${p.name}</div>
            <div class="pc-meta">${p.grade}年生 · ${POSITION_NAMES[p.position]}(${p.position})</div>
            <div class="pc-badges">
              ${isStarter ? '<span class="badge-st">スタメン</span>' : ''}
              ${p.isAllRounder ? '<span class="badge-ar">全ラ</span>' : ''}
            </div>
          </div>
          <div class="pc-ovr-block">
            <div class="pc-ovr">${ovr}</div>
            <div class="pc-ovr-label">OVR</div>
          </div>
          <div class="pc-stamina-pill">
            <div class="pc-stamina-num" style="color:${sts.color}">${p.currentStamina}</div>
            <div class="pc-stamina-text" style="color:${sts.color}">${sts.text}</div>
          </div>
        </div>`;
    });
  rosterHtml += '</div>';

  el.innerHTML = starterHtml + groupHtml + rosterHtml;

  // スタメン変更イベント
  el.querySelectorAll('.ssv2-select').forEach(sel => {
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

  document.getElementById('btn-auto-group').addEventListener('click', () => window.onAutoGroup());

  // 選手カードタップ → 詳細モーダル
  el.querySelectorAll('.player-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('select') || e.target.closest('input') || e.target.closest('label')) return;
      const pid    = parseInt(card.dataset.pid);
      const player = getPlayer(state, pid);
      if (player) showPlayerDetail(player);
    });
  });
}

function showPlayerDetail(player) {
  const modal = document.getElementById('modal');
  const ovr   = playerOverall(player);
  const paramRows = PARAM_KEYS.filter(k => k !== 'stamina').map(k => {
    const val = player.params[k];
    const cls = val >= 70 ? 'high' : (val < 30 ? 'low' : '');
    return `<div class="pdc-param-item">
      <span class="pdc-param-name">${PARAM_NAMES[k]}</span>
      <span class="pdc-param-val ${cls}">${val}</span>
    </div>`;
  }).join('');

  const sts = staminaStatus(player.currentStamina);
  const pct = Math.round((player.currentStamina / player.maxStamina) * 100);

  modal.innerHTML = `
    <div class="modal-content" style="padding:0;overflow:hidden">
      <div class="pdc-header">
        <div class="pdc-name">${player.name}${player.isAllRounder ? ' <span class="badge-ar">全ラ</span>' : ''}</div>
        <div class="pdc-meta-line">${player.grade}年生 / ${POSITION_NAMES[player.position]}(${player.position})</div>
        <div class="pdc-ovr">${ovr}</div>
        <div class="pdc-ovr-label">Overall</div>
      </div>
      <div class="pdc-body">
        <div class="pdc-params-grid">${paramRows}</div>
        <div class="stamina-compact-item" style="margin-bottom:16px">
          <span class="sci-name">スタミナ</span>
          <div class="sci-bar">
            <div class="sci-bar-fill" style="width:${pct}%;background:${sts.color}"></div>
          </div>
          <span class="sci-val">${player.currentStamina}</span>
          <span class="sci-status" style="color:${sts.color}">${sts.text}</span>
        </div>
        <button id="modal-close" class="btn-primary btn-full">閉じる</button>
      </div>
    </div>`;

  modal.style.display = 'flex';
  document.getElementById('modal-close').addEventListener('click', () => modal.style.display = 'none');
}

// ==============================
// 練習画面
// ==============================
function renderPractice(state) {
  const el = document.getElementById('tab-home');
  const groupCount = Math.min(state.practiceGroups.length, maxPracticeGroups(state.reputation));
  const menus = getAvailablePracticeMenus(state.reputation);
  const eff   = getPracticeEfficiency(state);

  let effDetail = '';
  if (state.activeEfficiency) effDetail += ` / アイテム効果: 残${state.activeEfficiency.weeksLeft}週`;
  if (state.facilities.length > 0) effDetail += ` / ${state.facilities.map(f => f.name).join('・')}`;

  let html = `
    <div class="practice-screen-header">
      <span class="psh-eff-label">練習効率${effDetail}</span>
      <span class="psh-eff-value">${Math.round(eff * 100)}%</span>
    </div>`;

  for (let gi = 0; gi < groupCount; gi++) {
    const selected = state.practiceSelections[gi] || '';
    const members  = state.practiceGroups[gi].map(id => getPlayer(state, id)).filter(Boolean);

    const memberPills = members.map(p => {
      const sts = staminaStatus(p.currentStamina);
      return `<div class="pgc-player-pill">
        <div class="pgc-player-dot" style="background:${sts.color}"></div>
        ${p.name.split(' ')[0]}(${p.currentStamina})
      </div>`;
    }).join('');

    html += `
      <div class="practice-group-card">
        <div class="pgc-header">
          <span class="pgc-title">グループ ${gi + 1}</span>
          <span class="pgc-members-count">${members.length}名</span>
        </div>
        <div class="pgc-stamina-row">
          ${memberPills || '<span style="font-size:0.72rem;color:var(--text2);padding:4px">選手未割り当て</span>'}
        </div>
        <div class="practice-menu-grid">`;

    menus.forEach(menu => {
      const isSelected = selected === menu.id;
      const tierCls = menu.tier === 3 ? 'tier-3' : (menu.tier === 2 ? 'tier-2' : '');
      html += `
        <label class="practice-menu-card ${isSelected ? 'selected' : ''}">
          <input type="radio" name="menu-${gi}" value="${menu.id}" ${isSelected ? 'checked' : ''} data-group="${gi}">
          <div class="pmc-name">${menu.name}</div>
          <div class="pmc-params">↑ ${menu.params.map(k => PARAM_NAMES[k]).join('・')}</div>
          <div>
            <span class="pmc-tier-badge ${tierCls}">Tier${menu.tier}</span>
            <span class="pmc-cost">消費${menu.staminaCost}</span>
          </div>
        </label>`;
    });

    html += `</div></div>`;
  }

  // スタミナ一覧（コンパクト版）
  html += '<div class="section-title">選手スタミナ</div><div class="stamina-compact-list">';
  state.players.forEach(p => {
    const sts = staminaStatus(p.currentStamina);
    const pct = Math.round((p.currentStamina / p.maxStamina) * 100);
    html += `
      <div class="stamina-compact-item">
        <span class="sci-name">${p.name.split(' ')[0]}</span>
        <span class="sci-pos">${p.position}</span>
        <div class="sci-bar">
          <div class="sci-bar-fill" style="width:${pct}%;background:${sts.color}"></div>
        </div>
        <span class="sci-val">${p.currentStamina}</span>
        <span class="sci-status" style="color:${sts.color}">${sts.text}</span>
      </div>`;
  });
  html += '</div>';

  // 週次ログ
  if (state.weeklyLog && state.weeklyLog.length > 0) {
    html += '<div class="section-title">先週の出来事</div><div class="weekly-log">';
    state.weeklyLog.forEach(l => { html += `<div class="log-line">${l}</div>`; });
    html += '</div>';
  }

  el.innerHTML = html;

  // 常時固定の進む/試合ボタン
  setActionFooter(`
    <button id="btn-advance" class="btn-action-primary">次の週へ進む →</button>
  `);
  document.getElementById('btn-advance').addEventListener('click', () => window.onAdvanceWeek());

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
  setActionFooter('');

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
  setActionFooter('');

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

  const modal      = document.getElementById('modal');
  const isWin      = result.won;
  const headerClass = isWin ? 'win-header' : 'lose-header';
  const setDetail  = result.setResults.map(r => `${r.scoreA}-${r.scoreB}`).join(' / ');

  const logHtml = (result.log || []).map(line => {
    if (!line) return '';
    if (line.startsWith('---') || line.startsWith('===')) {
      return `<div class="log-line-section">${line}</div>`;
    }
    const isHighlight = /エース|ブロック！|決まった|強打/.test(line);
    const isResultLine = /試合結果|終了/.test(line);
    if (isResultLine)  return `<div class="log-line-result">${line}</div>`;
    if (isHighlight)   return `<div class="log-line-highlight">${line}</div>`;
    return `<div class="log-line-normal">${line}</div>`;
  }).join('');

  const repSign = result.repGain >= 0 ? '+' : '';
  const repCls  = result.repGain >= 0 ? 'positive' : 'negative';
  const champHtml = (isWin && state_ref && MATCH_SCHEDULE[state_ref.week] &&
    state_ref.tournaments[MATCH_SCHEDULE[state_ref.week].tournament]?.champion)
    ? `<div class="reward-chip"><div class="reward-chip-label">達成</div><div class="reward-chip-value positive">🏆 優勝！</div></div>`
    : '';

  modal.innerHTML = `
    <div class="modal-content" style="padding:0;overflow:hidden">
      <div class="match-result-header ${headerClass}">
        <div class="mrhv-name">${result.matchName}</div>
        <div class="mrhv-verdict">${isWin ? '勝利' : '敗戦'}</div>
        <div class="mrhv-score">${result.setsA} - ${result.setsB}</div>
        <div class="mrhv-sets">${setDetail}</div>
      </div>
      <div class="match-result-body">
        <div class="match-rewards-row">
          <div class="reward-chip">
            <div class="reward-chip-label">評判P</div>
            <div class="reward-chip-value ${repCls}">${repSign}${result.repGain}</div>
          </div>
          ${result.shopGain ? `<div class="reward-chip">
            <div class="reward-chip-label">ショップP</div>
            <div class="reward-chip-value positive">+${result.shopGain}</div>
          </div>` : ''}
          ${champHtml}
        </div>
        <div class="log-toggle">
          <button id="btn-log-toggle" class="btn-secondary">試合ログを見る</button>
        </div>
        <div id="match-log-detail" class="match-log-area-v2" style="display:none">${logHtml}</div>
        <button id="modal-close" class="btn-action-primary" style="margin-top:4px">閉じる</button>
      </div>
    </div>`;

  modal.style.display = 'flex';
  document.getElementById('modal-close').addEventListener('click', () => {
    modal.style.display = 'none';
    window.onModalClose();
  });
  document.getElementById('btn-log-toggle').addEventListener('click', () => {
    const d = document.getElementById('match-log-detail');
    d.style.display = d.style.display === 'none' ? 'block' : 'none';
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
