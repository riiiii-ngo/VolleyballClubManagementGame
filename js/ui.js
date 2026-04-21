// ============================================================
// ui.js - UI描画
// ============================================================

// 大会ラウンドの日本語表示用定数
const ROUND_NAMES = {
  "0": "1回戦",
  "1": "準決勝",
  "2": "決勝"
};

const ROUND_PROGRESS_TEXTS = {
  "0": { win: "準決勝進出", lose: "初戦敗退" },
  "1": { win: "決勝進出", lose: "ベスト4" },
  "2": { win: "優勝", lose: "準優勝" }
};

// ==============================
// 試合ログ共通ユーティリティ
// ==============================

const SPEED_NORMAL = 60; // ms/行
const SPEED_FAST   = 10; // ms/行

function buildLogHtml(lines) {
  return (lines || []).map(line => {
    if (!line) return '';
    if (line.startsWith('---') || line.startsWith('==='))
      return `<div class="log-line-section">${line}</div>`;
    if (/試合結果|終了/.test(line))
      return `<div class="log-line-result">${line}</div>`;
    if (/エース|ブロック！|決まった|強打/.test(line))
      return `<div class="log-line-highlight">${line}</div>`;
    return `<div class="log-line-normal">${line}</div>`;
  }).join('');
}

// lines を containerEl に msPerLine ms ずつ1行ずつ追加する
// 戻り値: タイマーID（clearInterval でスキップ可能）
function playLogStream(lines, containerEl, msPerLine, onDone) {
  containerEl.innerHTML = '';
  const validLines = (lines || []).filter(Boolean);
  if (msPerLine <= 0 || validLines.length === 0) {
    containerEl.innerHTML = buildLogHtml(lines);
    onDone && onDone();
    return null;
  }
  let i = 0;
  const timer = setInterval(() => {
    if (i >= validLines.length) {
      clearInterval(timer);
      onDone && onDone();
      return;
    }
    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildLogHtml([validLines[i++]]);
    const child = wrapper.firstChild;
    if (child) containerEl.appendChild(child);
    containerEl.scrollTop = containerEl.scrollHeight;
  }, msPerLine);
  return timer;
}

// 試合履歴アコーディオンのトグル
window.toggleMlhItem = function(btn) {
  const body = btn.nextElementSibling;
  const isOpen = btn.classList.contains('open');
  btn.classList.toggle('open', !isOpen);
  body.style.display = isOpen ? 'none' : 'block';
};

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
    const avgCurrent = Math.round(state.players.reduce((s, p) => s + p.currentStamina, 0) / state.players.length);
    const avgTotal   = Math.round(state.players.reduce((s, p) => s + p.params.stamina, 0) / state.players.length);
    const sts = staminaStatus(avgCurrent, avgTotal);
    avgEl.innerHTML = `<span style="color:${sts.color}">${avgCurrent}/${avgTotal}</span>`;
  }

  // フッタータブのラベルを動的に変更 (練習/試合タブ)
  const actionTabBtn = document.getElementById('tab-btn-action');
  if (actionTabBtn) {
    const isMatchWeek = next && next.week === state.week;
    
    // 出場資格チェックも考慮
    let qualified = true;
    if (isMatchWeek) {
      if (next.tournament === 'interhigh' && !state.tournaments.prefectural.champion) qualified = false;
      if (next.tournament === 'spring' && !state.tournaments.spring_prelim.champion) qualified = false;
    }

    const labelEl = actionTabBtn.querySelector('.tab-label');
    const iconEl  = actionTabBtn.querySelector('.tab-icon');
    if (labelEl && iconEl) {
      if (isMatchWeek && qualified) {
        labelEl.textContent = '試合';
        iconEl.textContent  = '🏐';
        actionTabBtn.classList.add('match-active-tab');
      } else {
        labelEl.textContent = '練習';
        iconEl.textContent  = '🏠';
        actionTabBtn.classList.remove('match-active-tab');
      }
    }
  }
}

// ==============================
// ホーム画面（ダッシュボード）用ヘルパー
// ==============================

/**
 * 次の試合までの週数を取得する
 */
function getMatchCountdown(state) {
  // 4週間以内を走査
  for (let w = state.week; w <= state.week + 4 && w < 48; w++) {
    const info = MATCH_SCHEDULE[w];
    if (!info) continue;
    const tState = state.tournaments[info.tournament];
    // 出場資格の簡易チェック
    let qualified = true;
    if (info.tournament === 'interhigh' && !state.tournaments.prefectural.champion) qualified = false;
    if (info.tournament === 'spring' && !state.tournaments.spring_prelim.champion) qualified = false;
    
    if (qualified && !tState.eliminated && !tState.champion) {
      return { weeks: w - state.week, name: info.name };
    }
  }
  return null;
}

/**
 * 大会の戦績を日本語テキストに変換する
 */
function getRecordText(tState) {
  if (tState.champion) return "優勝";
  if (tState.eliminated) {
    if (tState.currentRound === 0) return "初戦敗退";
    if (tState.currentRound === 1) return "ベスト4";
    if (tState.currentRound === 2) return "準優勝";
  }
  if (tState.currentRound === 1) return "準決勝進出";
  if (tState.currentRound === 2) return "決勝進出";
  if (tState.currentRound === 0) {
    // 進行中（未敗退・未優勝・1回戦前）
    return "未出場";
  }
  return "-";
}

/**
 * 過去最高戦績を日本語テキストに変換する
 */
function getBestRecordText(bestRecord) {
  if (!bestRecord || bestRecord.round === -1) return "記録なし";
  if (bestRecord.champion) return `${bestRecord.year}年目 優勝`;
  
  // 敗退時の表現としてマッピング
  let roundText = "";
  if (bestRecord.round === 0) roundText = "初戦敗退";
  else if (bestRecord.round === 1) roundText = "ベスト4";
  else if (bestRecord.round === 2) roundText = "準優勝";
  
  return `${bestRecord.year}年目 ${roundText}`;
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
  const lowStamina = state.players.filter(p => p.params.stamina > 0 && p.currentStamina / p.params.stamina < 0.20);
  let staminaWarnHtml = '';
  if (lowStamina.length > 0) {
    staminaWarnHtml = `
      <div class="situation-card situation-warn">
        <div class="situation-title">⚠ スタミナ低下</div>
        <div class="situation-sub">${lowStamina.map(p => p.name).join('、')}</div>
      </div>`;
  }

  // チーム平均スタミナバー
  const teamAvgCurrent = state.players.length > 0
    ? Math.round(state.players.reduce((s, p) => s + p.currentStamina, 0) / state.players.length)
    : 0;
  const teamAvgTotal = state.players.length > 0
    ? Math.round(state.players.reduce((s, p) => s + p.params.stamina, 0) / state.players.length)
    : 100;
  const teamStaminaPct = teamAvgTotal > 0 ? Math.round((teamAvgCurrent / teamAvgTotal) * 100) : 0;
  const sts0 = staminaStatus(teamAvgCurrent, teamAvgTotal);
  const teamStaminaHtml = `
    <div class="situation-card" style="padding:12px 16px">
      <div class="situation-title">チーム体力</div>
      <div class="team-stamina-overview">
        <div class="tso-label">平均</div>
        <div class="tso-bar-track">
          <div class="tso-bar-fill" style="width:${teamStaminaPct}%;background:${sts0.color}"></div>
        </div>
        <div class="tso-value" style="color:${sts0.color}">${teamAvgCurrent}/${teamAvgTotal}</div>
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
    <div class="home-scroll-area">
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
    </div>
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
let teamScreenMode = 'menu'; // 'menu', 'roster', 'starters'

function renderTeam(state) {
  const el = document.getElementById('tab-team');
  el.innerHTML = '<div class="panel-view" id="team-screen-content"></div>';
  
  if (teamScreenMode === 'roster') {
    renderPlayerList(state);
  } else if (teamScreenMode === 'starters') {
    renderStarterSettings(state);
  } else {
    renderTeamMenu(state);
  }
}

function renderTeamMenu(state) {
  const container = document.getElementById('team-screen-content');
  
  const starters = getStarterList(state);
  let radarData = [0, 0, 0, 0, 0];
  if (starters.length > 0) {
    let sumSpike = 0, sumReceive = 0, sumBlock = 0, sumToss = 0, sumServe = 0;
    starters.forEach(p => {
      sumSpike += p.params.spike;
      sumReceive += p.params.receive;
      sumBlock += p.params.block;
      sumToss += p.params.toss;
      sumServe += p.params.serve;
    });
    const len = starters.length;
    radarData = [
      Math.round(sumSpike / len),
      Math.round(sumReceive / len),
      Math.round(sumBlock / len),
      Math.round(sumToss / len),
      Math.round(sumServe / len)
    ];
  }

  container.innerHTML = `
    <div class="team-menu-grid">
      <button class="team-menu-btn" id="btn-goto-roster">
        <div class="team-menu-btn-icon">👥</div>
        <div class="team-menu-btn-content">
          <div class="team-menu-btn-title">選手一覧</div>
          <div class="team-menu-btn-desc">選手の能力確認・グループ設定</div>
        </div>
      </button>
      <button class="team-menu-btn" id="btn-goto-starters">
        <div class="team-menu-btn-icon">📋</div>
        <div class="team-menu-btn-content">
          <div class="team-menu-btn-title">スタメン設定</div>
          <div class="team-menu-btn-desc">試合に出場するメンバーの編成</div>
        </div>
      </button>
    </div>
    <div class="section-title">チーム戦力 (スタメン平均)</div>
    <div class="radar-chart-container">
      <canvas id="team-radar-chart"></canvas>
    </div>
  `;

  document.getElementById('btn-goto-roster').addEventListener('click', () => { teamScreenMode = 'roster'; renderTeam(state); });
  document.getElementById('btn-goto-starters').addEventListener('click', () => { teamScreenMode = 'starters'; renderTeam(state); });

  const ctx = document.getElementById('team-radar-chart');
  if (ctx && window.Chart) {
    const labels = ['スパイク', 'レシーブ', 'ブロック', 'トス', 'サーブ'];
    const radarDataLabels = labels.map((label, i) => `${label}(${getRank(radarData[i]).label})`);

    new Chart(ctx, {
      type: 'radar',
      data: {
        labels: radarDataLabels,
        datasets: [{
          label: 'スタメン平均',
          data: radarData,
          backgroundColor: 'rgba(0, 122, 255, 0.2)',
          borderColor: 'rgba(0, 122, 255, 1)',
          pointBackgroundColor: 'rgba(0, 122, 255, 1)',
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: 'rgba(0, 122, 255, 1)'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          r: {
            angleLines: { color: 'rgba(0,0,0,0.1)' },
            grid: { color: 'rgba(0,0,0,0.1)' },
            pointLabels: { font: { family: "'Noto Sans JP', sans-serif", size: 12, weight: 'bold' }, color: '#1C1C1E' },
            min: 0,
            max: 100,
            ticks: { display: false, stepSize: 20 }
          }
        },
        plugins: { legend: { display: false } }
      }
    });
  }
}

function renderPlayerList(state) {
  const container = document.getElementById('team-screen-content');
  const groupCount = Math.min(state.practiceGroups.length, maxPracticeGroups(state.reputation));

  const playerGroups = {};
  for(let g=0; g<state.practiceGroups.length; g++) {
    state.practiceGroups[g].forEach(id => { playerGroups[id] = g; });
  }

  let rosterHtml = `
    <div class="sub-screen-header">
      <button class="btn-back" id="btn-back-roster"><span>&lt; 戻る</span></button>
      <div class="sub-screen-title">選手一覧</div>
    </div>
    <div style="margin-bottom: 12px; text-align: right;">
      <button id="btn-auto-group" class="btn-secondary">自動振り分け</button>
    </div>
    <div class="roster-table-wrap">
      <table class="roster-table">
        <thead><tr>
          <th>名前</th><th>Grp</th><th>学年</th><th>Pos</th><th>OVR</th>
          <th>SP</th><th>RV</th><th>BL</th><th>SV</th><th>TS</th>
          <th>PW</th><th>SP2</th><th>TC</th><th>ST</th>
        </tr></thead><tbody>`;

  state.players
    .sort((a, b) => b.grade - a.grade || playerOverall(b) - playerOverall(a))
    .forEach(p => {
      const sts = staminaStatus(p.currentStamina, p.params.stamina);
      const isStarter = Object.values(state.starters).includes(p.id);
      const pGroup = playerGroups[p.id] !== undefined ? playerGroups[p.id] : -1;
      
      const grpLabel = pGroup === -1 ? '-' : ['A','B','C','D'][pGroup];
      const grpColor = pGroup === -1 ? '#888' : ['#007AFF','#34C759','#FF9500','#AF52DE'][pGroup];
      const selectHtml = `<span class="group-cycle-btn" data-pid="${p.id}" data-group="${pGroup}" data-groupcount="${groupCount}" style="display:inline-block;min-width:24px;padding:2px 7px;border-radius:5px;background:${grpColor};color:#fff;font-weight:700;font-size:0.85rem;cursor:pointer;text-align:center;">${grpLabel}</span>`;

      const injuryBadge = p.isInjured
        ? ` <span style="background:#FF3B30;color:#fff;font-size:0.6rem;font-weight:800;padding:1px 5px;border-radius:4px;">🩼ケガ中(あと${p.injuryRemainingWeeks}週)</span>`
        : '';

      rosterHtml += `<tr class="${isStarter ? 'starter-row' : ''}" style="${p.isInjured ? 'opacity:0.45;background:#f9f9f9;' : ''}">
        <td>${p.name}${isStarter ? ' <span class="badge-st">先</span>' : ''}${injuryBadge}</td>
        <td>${selectHtml}</td>
        <td>${p.grade}年</td>
        <td>${p.isAllRounder ? '<span class="badge-ar">全</span>' : p.position}</td>
        <td><strong>${playerOverall(p)}</strong></td>
        <td>${renderStatList(p.params.spike)}</td>
        <td>${renderStatList(p.params.receive)}</td>
        <td>${renderStatList(p.params.block)}</td>
        <td>${renderStatList(p.params.serve)}</td>
        <td>${renderStatList(p.params.toss)}</td>
        <td>${renderStatList(p.params.power)}</td>
        <td>${renderStatList(p.params.speed)}</td>
        <td>${renderStatList(p.params.technique)}</td>
        <td><span style="color:${sts.color}">${Math.round(p.currentStamina)}/${Math.round(p.params.stamina)}</span></td>
      </tr>`;
    });

  rosterHtml += '</tbody></table></div>';
  container.innerHTML = rosterHtml;

  document.getElementById('btn-back-roster').addEventListener('click', () => { teamScreenMode = 'menu'; renderTeam(state); });
  document.getElementById('btn-auto-group').addEventListener('click', () => window.onAutoGroup());
  
  container.querySelectorAll('.group-cycle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const pid = parseInt(btn.dataset.pid);
      const current = parseInt(btn.dataset.group);
      const gc = parseInt(btn.dataset.groupcount);
      const next = current === -1 ? 0 : (current + 1) % gc;
      window.onGroupChange(next, pid, true);
    });
  });
}

function renderStarterSettings(state) {
  const container = document.getElementById('team-screen-content');
  setActionFooter('');

  const slotDefs = [
    { slot: 'OH1', label: 'OH①' }, { slot: 'OH2', label: 'OH②' },
    { slot: 'MB1', label: 'MB①' }, { slot: 'MB2', label: 'MB②' },
    { slot: 'OP',  label: 'OP'   }, { slot: 'Se',  label: 'セッター' },
    { slot: 'Li',  label: 'リベロ' },
  ];

  const starterComplete = isStarterComplete(state);
  let starterHtml = `
    <div class="sub-screen-header">
      <button class="btn-back" id="btn-back-starters"><span>&lt; 戻る</span></button>
      <div class="sub-screen-title">スタメン設定</div>
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
            .map(p => {
              const injLabel = p.isInjured ? ` 🩼ケガ中(あと${p.injuryRemainingWeeks}週)` : '';
              const arBadge = p.isAllRounder ? '[全] ' : '';
              return `<option value="${p.id}" ${pid === p.id ? 'selected' : ''} ${p.isInjured ? 'disabled' : ''}>
              ${arBadge}${p.name}${injLabel} (${p.grade}年 OVR:${playerOverall(p)})
            </option>`;
            }).join('')}
        </select>
      </div>`;
  });
  starterHtml += '</div>';

  container.innerHTML = starterHtml;

  document.getElementById('btn-back-starters').addEventListener('click', () => { teamScreenMode = 'menu'; renderTeam(state); });

  container.querySelectorAll('.ssv2-select').forEach(sel => {
    sel.addEventListener('change', () => {
      const slot = sel.dataset.slot;
      const val  = sel.value ? parseInt(sel.value) : null;
      window.onStarterChange(slot, val);
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

  const sts = staminaStatus(player.currentStamina, player.params.stamina);
  const pct = Math.round((player.currentStamina / player.params.stamina) * 100);

  modal.innerHTML = `
    <div class="modal-content" style="padding:0;overflow:hidden">
      <div class="pdc-header">
        <div class="pdc-name">${player.name}${player.isAllRounder ? ' <span class="badge-ar">全</span>' : ''}</div>
        <div class="pdc-meta-line">${player.grade}年生 / ${player.isAllRounder ? '全ポジション対応' : POSITION_NAMES[player.position]}(${player.position})</div>
        <div class="pdc-ovr">${ovr}</div>
        <div class="pdc-ovr-label">Overall</div>
      </div>
      <div class="pdc-body">
        <div class="pdc-params-grid">${paramRows}</div>
        <div class="stamina-compact-item" style="margin-bottom:16px">
          <span class="sci-name">体力</span>
          <div class="sci-bar">
            <div class="sci-bar-fill" style="width:${pct}%;background:${sts.color}"></div>
          </div>
          <span class="sci-val">${Math.round(player.currentStamina)}/${Math.round(player.params.stamina)}</span>
          <span class="sci-status" style="color:${sts.color}">${sts.text}</span>
        </div>
        <button id="modal-close" class="btn-primary btn-full">閉じる</button>
      </div>
    </div>`;

  modal.style.display = 'flex';
  document.getElementById('modal-close').addEventListener('click', () => modal.style.display = 'none');
}

// ==============================
// 練習画面 (新UI)
// ==============================

// グループカラー定義
const PRACTICE_GROUP_COLORS = ['#007AFF', '#34C759', '#FF9500', '#AF52DE'];
const PRACTICE_GROUP_LABELS = ['グループ1', 'グループ2', 'グループ3', 'グループ4'];

// 練習メニューアイコンマップ
const PRACTICE_MENU_ICONS = {
  spike: '⚡', receive: '🛡️', block: '🧱', serve: '🎯',
  toss: '🏐', power: '💪', speed: '💨', technique: '✨', stamina: '❤️'
};

// ランク計算
function getRank(value) {
  if (value >= 120) return { label: "SSS", color: "transparent", bg: "linear-gradient(135deg, #FFD700, #FF8C00)" };
  if (value >= 110) return { label: "SS", color: "#D4AF37" };
  if (value >= 100) return { label: "S", color: "#FF3B30" };
  if (value >= 85)  return { label: "A", color: "#FF9500" };
  if (value >= 70)  return { label: "B", color: "#34C759" };
  if (value >= 55)  return { label: "C", color: "#8E8E93" };
  if (value >= 40)  return { label: "D", color: "#9E9E9E" };
  if (value >= 25)  return { label: "E", color: "#BDBDBD" };
  if (value >= 10)  return { label: "F", color: "#D3D3D3" };
  return { label: "G", color: "#E0E0E0" };
}

function renderRank(value) {
  const rank = getRank(value);
  if (rank.bg) {
    return `<span style="background:${rank.bg}; -webkit-background-clip:text; -webkit-text-fill-color:transparent; font-weight:900;">${rank.label}</span>`;
  }
  return `<span style="color:${rank.color}; font-weight:800;">${rank.label}</span>`;
}

function renderStatList(value) {
  return `${Math.round(value)} <span style="font-size:0.7rem; margin-left:2px;">(${renderRank(value)})</span>`;
}

// ポジション別メイン能力
const POSITION_PRIMARY_PARAM = {
  OH: 'spike', MB: 'block', OP: 'spike', Se: 'toss', Li: 'receive'
};

// 練習画面の選択状態（module-level で保持）
let practiceSelectedGroup = 0;

function renderPractice(state) {
  setActionFooter('');
  const el = document.getElementById('tab-action');
  const groupCount = Math.min(state.practiceGroups.length, maxPracticeGroups(state.reputation));
  const weeklyMenus = (state.weeklyMenuIds || [])
    .map(id => getPracticeMenu(id))
    .filter(Boolean);
  const menus = weeklyMenus.length > 0
    ? weeklyMenus
    : getAvailablePracticeMenus(state.reputation);
  const eff   = getPracticeEfficiency(state);

  // グループインデックスが範囲外なら補正
  if (practiceSelectedGroup >= groupCount) practiceSelectedGroup = 0;

  // 現在選択中のグループのメニューと対象ステータスを特定
  const selectedMenuId = state.practiceSelections[practiceSelectedGroup];
  const selectedMenu = menus.find(m => m.id === selectedMenuId);
  const targetStat = selectedMenu ? selectedMenu.params[0] : 'spike';
  const targetStatName = PARAM_NAMES[targetStat] || targetStat;

  // ────────────────────────────────────────
  // ① 選手一覧カード (フィルタリングと動的ステータス)
  // ────────────────────────────────────────
  const playerGroupMap = {};
  state.practiceGroups.forEach((grp, gi) => {
    grp.forEach(pid => { playerGroupMap[pid] = gi; });
  });

  // 選択中グループに所属する選手のみに絞り込む
  const filteredPlayers = state.players.filter(p => playerGroupMap[p.id] === practiceSelectedGroup);

  const sortedPlayers = filteredPlayers.sort(
    (a, b) => b.grade - a.grade || playerOverall(b) - playerOverall(a)
  );

  const targetStats = selectedMenu ? selectedMenu.params : ['spike'];

  const playerCardsHtml = sortedPlayers.map(p => {
    const sts  = staminaStatus(p.currentStamina, p.params.stamina);
    const pct  = Math.round((p.currentStamina / p.params.stamina) * 100);
    const ovr  = playerOverall(p);

    if (p.isInjured) {
      // ケガ中カード（グレーアウト・操作不可）
      return `<div class="player-card" style="display: flex; gap: 10px; padding: 12px; border: 1.5px solid #e5e5ea; border-radius: 12px; background: #f8f8f8; box-shadow: none; opacity: 0.55; filter: grayscale(60%); pointer-events: none;">
        <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px dashed #d1d1d6; padding-right: 10px;">
          <div>
            <div style="display: flex; gap: 4px; align-items: center; margin-bottom: 4px;">
              <span style="font-size: 0.65rem; color: #999; font-weight: 800; background: #e5e5ea; padding: 2px 6px; border-radius: 6px; white-space: nowrap;">${p.grade}年</span>
              <span style="font-size: 0.7rem; color: #999; font-weight: 800; white-space: nowrap;">${p.isAllRounder ? '全' : p.position}</span>
            </div>
            <div style="font-size: 1.05rem; font-weight: 900; color: #8e8e93; margin-bottom: 4px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              ${p.name}
            </div>
            <div style="display: inline-flex; align-items: center; gap: 3px; background: #FF3B30; color: #fff; font-size: 0.65rem; font-weight: 900; padding: 2px 7px; border-radius: 8px; margin-bottom: 2px;">
              🩼 ケガ中（あと${p.injuryRemainingWeeks}週）
            </div>
          </div>
          <div style="margin-top: 6px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.6rem; color: #aaa; font-weight: 700; margin-bottom: 3px;">
              <span>体力</span>
              <span>${Math.round(p.currentStamina)}/${Math.round(p.params.stamina)}</span>
            </div>
            <div class="pc-stamina-bar-wrap" style="height: 5px; background: #e5e5ea; border-radius: 3px; overflow: hidden;">
              <div style="height: 100%; border-radius: 3px; width:${pct}%; background: #bdbdbd;"></div>
            </div>
          </div>
        </div>
        <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; align-items: center; color: #aaa; font-size: 0.72rem; font-weight: 700; gap: 4px; padding-left: 2px;">
          <span style="font-size: 1.5rem;">🚫</span>
          <span>練習参加不可</span>
        </div>
      </div>`;
    }

    // 通常カード
    const statsHtml = targetStats.map(stat => {
      const val = p.params[stat] || 0;
      const sName = PARAM_NAMES[stat] || stat;
      return `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; font-size: 0.8rem; animation: paramFade 0.3s ease-out;">
          <span style="color: #666; font-weight: 700; font-size: 0.72rem;">${sName}</span>
          <span>${renderRank(val)}</span>
        </div>`;
    }).join('');

    const restingPlayerIds = state.restingPlayerIds || [];
    const isResting = restingPlayerIds.includes(p.id);
    const restingClass = isResting ? ' is-resting' : '';

    return `<div class="player-card${restingClass}" 
                 onclick="window.onToggleRest(${p.id})"
                 style="display: flex; gap: 10px; padding: 12px; border: 1.5px solid #d1d1d6; border-radius: 12px; background: #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.04); cursor:pointer; position:relative; transition: all 0.2s ease;">
      ${isResting ? '<div class="badge-rest">💤 休憩中</div>' : ''}
      <!-- 左側（基本情報） -->
      <div style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: space-between; border-right: 1px dashed #c7c7cc; padding-right: 10px;">
        <div>
          <div style="display: flex; gap: 4px; align-items: center; margin-bottom: 4px;">
            <span style="font-size: 0.65rem; color: #666; font-weight: 800; background: #F2F2F7; padding: 2px 6px; border-radius: 6px; white-space: nowrap;">${p.grade}年</span>
            <span style="font-size: 0.7rem; color: #666; font-weight: 800; white-space: nowrap;">${p.isAllRounder ? '全' : p.position}</span>
          </div>
          <div style="font-size: 1.05rem; font-weight: 900; color: #1c1c1e; margin-bottom: 6px; line-height: 1.25; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            ${p.name}
          </div>
          <div style="font-size: 0.7rem; color: #666; margin-bottom: 4px; font-weight: 700;">
            OVR <strong style="font-size: 0.85rem; color: #333;">${Math.round(ovr)}</strong> ${renderRank(ovr)}
          </div>
        </div>
        <div style="margin-top: 6px;">
          <div style="display: flex; justify-content: space-between; font-size: 0.6rem; color: #8e8e93; font-weight: 700; margin-bottom: 3px;">
            <span>体力</span>
            <span style="color:${sts.color}">${Math.round(p.currentStamina)}/${Math.round(p.params.stamina)}</span>
          </div>
          <div class="pc-stamina-bar-wrap" style="height: 5px; background: #eee; border-radius: 3px; overflow: hidden;">
            <div class="pc-stamina-bar" style="height: 100%; border-radius: 3px; width:${pct}%; background:${sts.color}; transition: width 0.3s ease;"></div>
          </div>
        </div>
      </div>
      <!-- 右側（ステータス） -->
      <div style="flex: 1; display: flex; flex-direction: column; justify-content: center; padding-left: 2px;">
        ${isResting ? '<div style="text-align:center; color:#999; font-size:0.8rem; font-weight:700;">今週は休憩<br>成長停止 / 体力回復</div>' : statsHtml}
      </div>
    </div>`;
  }).join('');


  // ────────────────────────────────────────
  // ② 練習メニューカード
  // ────────────────────────────────────────
  const menuCardsHtml = menus.map(menu => {
    const isSelected = state.practiceSelections[practiceSelectedGroup] === menu.id;
    const isBonus    = menu.id === state.bonusMenuId;
    const icon = PRACTICE_MENU_ICONS[menu.params[0]] || '📋';
    return `<div class="training-menu-card${isSelected ? ' selected' : ''}${isBonus ? ' bonus' : ''}" data-menu-id="${menu.id}" role="button">
      ${isBonus ? '<div class="bonus-badge">★ おすすめ</div>' : ''}
      <div class="tmc-header">
        <span class="tmc-icon">${icon}</span>
        <span class="tmc-name">${menu.name}</span>
      </div>
      <div class="tmc-level">Lv.${menu.tier}</div>
    </div>`;
  }).join('');

  // ────────────────────────────────────────
  // ③ グループセレクター
  // ────────────────────────────────────────
  const groupSelectorHtml = Array.from({ length: groupCount }, (_, gi) => {
    const menuId  = state.practiceSelections[gi];
    const menu    = menuId ? getPracticeMenu(menuId) : null;
    const isActive = gi === practiceSelectedGroup;
    const color   = PRACTICE_GROUP_COLORS[gi];
    return `<div class="group-selector-btn${isActive ? ' active' : ''}" data-group="${gi}"
        style="${isActive ? `border-color:${color};background:${color}18` : ''}">
      <div class="gsb-name" style="${isActive ? `color:${color}` : ''}">${PRACTICE_GROUP_LABELS[gi]}</div>
      <div class="gsb-menu">${menu ? menu.name : '─ 未設定 ─'}</div>
    </div>`;
  }).join('');

  // 練習効率バッジ
  const effBadge = state.activeEfficiency
    ? `<span class="eff-badge eff-active">アイテム効果: 残${state.activeEfficiency.weeksLeft}週</span>`
    : '';
  const facBadge = state.facilities.length > 0
    ? `<span class="eff-badge eff-fac">設備: ${state.facilities.map(f => f.name).join('・')}</span>`
    : '';

  // ────────────────────────────────────────
  // 画面組み立て
  // ────────────────────────────────────────
  el.innerHTML = `
    <style>
      @keyframes paramFade {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
      }
    </style>
    <div class="practice-screen">

      <!-- ① 選手一覧エリア -->
      <div class="practice-players-area">
        <div style="margin-bottom: 8px;">
          <div class="ps-section-label" style="margin-bottom: 0;">
            <span>${PRACTICE_GROUP_LABELS[practiceSelectedGroup]} 所属選手</span>
            <span class="ps-count">${filteredPlayers.length}名</span>
          </div>
        </div>
        <div class="player-cards-grid">
          ${playerCardsHtml || '<div class="ps-empty">このグループに所属している選手はいません</div>'}
        </div>
      </div>

      <!-- ② 練習メニュー選択 -->
      <div class="practice-menu-area">
        <div class="ps-section-label">
          <span>練習メニュー</span>
        </div>
        <div class="training-menu-scroll">
          ${menuCardsHtml}
        </div>
      </div>

      <!-- ③ グループ選択 + 実行ボタン -->
      <div class="practice-bottom-area">
        <div class="group-and-start-row">
          <div class="group-selector-scroll">
            ${groupSelectorHtml}
          </div>
          <button id="btn-advance" class="btn-practice-start">
            <span class="bps-icon">▶</span> 練習開始
          </button>
        </div>
        <div class="practice-eff-row">
          <span class="eff-label">練習効率: <strong>${Math.round(eff * 100)}%</strong></span>
          ${effBadge}${facBadge}
        </div>
      </div>

    </div>
  `;

  // ── イベント: グループ切り替え ──
  el.querySelectorAll('.group-selector-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      practiceSelectedGroup = parseInt(btn.dataset.group);
      renderPractice(state);
    });
  });

  // ── イベント: メニュー選択 ──
  el.querySelectorAll('.training-menu-card').forEach(card => {
    card.addEventListener('click', () => {
      window.onPracticeSelect(practiceSelectedGroup, card.dataset.menuId);
    });
  });

  // ── イベント: 練習開始 ──
  document.getElementById('btn-advance')?.addEventListener('click', () => window.onAdvanceWeek());
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

  // スカウト済み選手表示（来年度入部予定）
  const scouted = state.pendingScouts || [];
  if (scouted.length > 0) {
    html += '<div class="section-title">来年度入部予定</div><div class="scout-list">';
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

  el.innerHTML = `<div class="panel-view">${html}</div>`;

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
          <tr>${PARAM_KEYS.map(k => `<td>${renderRank(player.params[k])}</td>`).join('')}</tr>
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

  el.innerHTML = `<div class="panel-view">${html}</div>`;

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
// 試合前画面
// ==============================
function showPreMatchScreen(state, matchInfo) {
  const opponent = generateOpponent(
    matchInfo.tournament, matchInfo.round, state.year, state.reputation
  );

  const VOLLEYBALL_STATS = ['spike', 'serve', 'block', 'receive', 'toss'];

  // 自チームスターター平均（5項目）
  const starters = getStarters(state);
  const starterList = Object.values(starters).filter(Boolean);
  const ownAvg = {};
  VOLLEYBALL_STATS.forEach(k => {
    ownAvg[k] = starterList.length > 0
      ? Math.round(starterList.reduce((s, p) => s + (p.params[k] || 0), 0) / starterList.length)
      : 0;
  });
  const ownOverall = Math.round(VOLLEYBALL_STATS.reduce((s, k) => s + ownAvg[k], 0) / 5);

  // 相手チーム平均
  const oppAvg = {};
  VOLLEYBALL_STATS.forEach(k => {
    oppAvg[k] = Math.round(opponent.players.reduce((s, p) => s + (p.params[k] || 0), 0) / opponent.players.length);
  });
  const oppOverall = Math.round(VOLLEYBALL_STATS.reduce((s, k) => s + oppAvg[k], 0) / 5);

  // 相手評判
  const oppRepIdx = opponent.avgStat >= 75 ? 4
    : opponent.avgStat >= 60 ? 3
    : opponent.avgStat >= 50 ? 2
    : opponent.avgStat >= 35 ? 1 : 0;

  const dateStr = getDateString(state.week);
  const ownRepLabel = REPUTATIONS[state.reputation];
  const ownRepColor = REPUTATION_COLORS[state.reputation];
  const oppRepLabel = REPUTATIONS[oppRepIdx];
  const oppRepColor = REPUTATION_COLORS[oppRepIdx];

  const statRows = (avg) => VOLLEYBALL_STATS.map(k => `
    <div class="prematch-stat-row">
      <span class="prematch-stat-name">${PARAM_NAMES[k]}</span>
      <span class="prematch-stat-val">${renderRank(avg[k])}</span>
    </div>`).join('');

  setActionFooter('');
  const el = document.getElementById('tab-action');
  // 描画前に確実にクリアし、イベントの再登録を促す
  el.innerHTML = '';
  
  el.innerHTML = `
    <div class="prematch-screen">
      <div class="prematch-info-bar">
        <span class="prematch-info-text">${dateStr}　${matchInfo.name}</span>
        <button class="prematch-settings-btn" id="btn-prematch-settings">⚙️</button>
      </div>

      <div class="prematch-score-area">
        <div class="prematch-score-row">
          <span class="prematch-score-label"></span>
          ${[1,2,3,4,5].map(n => `<span class="prematch-set-num">${n}</span>`).join('')}
        </div>
        <div class="prematch-score-row">
          <span class="prematch-score-label">自チーム</span>
          ${[1,2,3,4,5].map(() => `<span class="prematch-score-val">-</span>`).join('')}
        </div>
        <div class="prematch-score-row">
          <span class="prematch-score-label">相手</span>
          ${[1,2,3,4,5].map(() => `<span class="prematch-score-val">-</span>`).join('')}
        </div>
      </div>

      <div class="prematch-card">
        <div class="prematch-card-title">${matchInfo.name}</div>
        <div class="prematch-teams">
          <div class="prematch-team prematch-team-home">
            <div class="prematch-team-name">${state.schoolName || 'バレー部'}</div>
            <div class="prematch-team-rep" style="color:${ownRepColor}">${ownRepLabel}</div>
            <div class="prematch-radar-wrap">
              <canvas id="prematch-radar-a"></canvas>
            </div>
            <div class="prematch-overall">総合  ${renderRank(ownOverall)}</div>
          </div>

          <div class="prematch-vs">VS</div>

          <div class="prematch-team prematch-team-away">
            <div class="prematch-team-name">${opponent.name}</div>
            <div class="prematch-team-rep" style="color:${oppRepColor}">${oppRepLabel}</div>
            <div class="prematch-radar-wrap">
              <canvas id="prematch-radar-b"></canvas>
            </div>
            <div class="prematch-overall">総合  ${renderRank(oppOverall)}</div>
          </div>
        </div>
      </div>

      <div class="prematch-actions">
        <button class="prematch-btn" id="btn-order">オーダー</button>
        <button class="prematch-btn prematch-btn-start" id="btn-start-match">試合開始 ▶</button>
        <button class="prematch-btn" id="btn-opponent-data">相手データ</button>
      </div>
    </div>
  `;

  // レーダーチャート描画（DOM確定後）
  setTimeout(() => {
    const chartOpts = (color) => ({
      type: 'radar',
      data: {
        labels: ['スパイク', 'サーブ', 'ブロック', 'レシーブ', 'トス'],
        datasets: [{
          data: [0, 0, 0, 0, 0],
          backgroundColor: `rgba(${color}, 0.2)`,
          borderColor: `rgba(${color}, 1)`,
          pointBackgroundColor: `rgba(${color}, 1)`,
          pointBorderColor: '#fff',
          pointHoverBackgroundColor: '#fff',
          pointHoverBorderColor: `rgba(${color}, 1)`
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          r: {
            angleLines: { color: 'rgba(0,0,0,0.1)' },
            grid: { color: 'rgba(0,0,0,0.1)' },
            pointLabels: {
              font: { family: "'Noto Sans JP', sans-serif", size: 10, weight: 'bold' },
              color: '#1C1C1E'
            },
            min: 0, max: 100,
            ticks: { display: false, stepSize: 20 }
          }
        },
        plugins: { legend: { display: false } }
      }
    });

    const ctxA = document.getElementById('prematch-radar-a');
    if (ctxA && window.Chart) {
      const cfg = chartOpts('0, 122, 255');
      cfg.data.labels = VOLLEYBALL_STATS.map(k => `${PARAM_NAMES[k]}(${getRank(ownAvg[k]).label})`);
      cfg.data.datasets[0].data = VOLLEYBALL_STATS.map(k => ownAvg[k]);
      new Chart(ctxA, cfg);
    }
    const ctxB = document.getElementById('prematch-radar-b');
    if (ctxB && window.Chart) {
      const cfg = chartOpts('255, 59, 48');
      cfg.data.labels = VOLLEYBALL_STATS.map(k => `${PARAM_NAMES[k]}(${getRank(oppAvg[k]).label})`);
      cfg.data.datasets[0].data = VOLLEYBALL_STATS.map(k => oppAvg[k]);
      new Chart(ctxB, cfg);
    }
  }, 0);

  // ボタンハンドラ
  const setupHandlers = () => {
    document.getElementById('btn-start-match')?.addEventListener('click', () => {
      window.onStartMatch(opponent);
    });

    document.getElementById('btn-opponent-data')?.addEventListener('click', () => {
      showOpponentDataModal(opponent, state, matchInfo);
    });

    document.getElementById('btn-order')?.addEventListener('click', () => {
      showOrderModal(state, matchInfo);
    });

    document.getElementById('btn-prematch-settings')?.addEventListener('click', () => {
      showAlert(`試合形式: 最大${matchInfo.maxSets}セット`);
    });
  };

  // DOMが確実に構築されたあとにイベントを付与
  setTimeout(setupHandlers, 0);
}

function showOpponentDataModal(opponent, state, matchInfo) {
  const modal = document.getElementById('modal');
  const statsToShow = PARAM_KEYS.filter(k => k !== 'stamina');
  
  const rows = opponent.players.map(p => `
    <tr class="opponent-player-row">
      <td class="opp-pos">${p.position}</td>
      <td class="opp-name">${p.name}</td>
      <td class="opp-ovr"><strong>${playerOverall(p)}</strong></td>
      ${statsToShow.map(k => `<td class="opp-stat">${renderRank(p.params[k])}</td>`).join('')}
    </tr>
  `).join('');

  modal.innerHTML = `
    <div class="prematch-inner-modal wide-modal">
      <div class="prematch-inner-header">
        <span>${opponent.name} 選手データ</span>
      </div>
      <div class="modal-scroll-area">
        <table class="roster-table mini">
          <thead>
            <tr>
              <th>POS</th>
              <th>名前</th>
              <th>OVR</th>
              ${statsToShow.map(k => `<th>${PARAM_NAMES[k].substring(0,2)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <div class="prematch-inner-footer">
        <button class="prematch-inner-close" id="btn-opp-back">← 戻る</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
  document.getElementById('btn-opp-back').addEventListener('click', () => {
    modal.style.display = 'none';
    modal.innerHTML = '';
  });
}

function showOrderModal(state, matchInfo) {
  const modal = document.getElementById('modal');
  const statsToShow = PARAM_KEYS.filter(k => k !== 'stamina');

  // スタメンを優先的に上に表示
  const starterIds = Object.values(state.starters);
  const sortedPlayers = [...state.players].sort((a, b) => {
    const aIsStarter = starterIds.includes(a.id);
    const bIsStarter = starterIds.includes(b.id);
    if (aIsStarter && !bIsStarter) return -1;
    if (!aIsStarter && bIsStarter) return 1;
    return b.grade - a.grade || playerOverall(b) - playerOverall(a);
  });

  const rows = sortedPlayers.map(p => {
    const isStarter = starterIds.includes(p.id);
    return `
      <tr class="${isStarter ? 'starter-row' : ''}" style="${p.isInjured ? 'opacity:0.4' : ''}">
        <td>${isStarter ? '<span class="badge-st">先</span>' : ''} ${p.isAllRounder ? '全' : p.position}</td>
        <td>${p.name}</td>
        <td>${p.grade}年</td>
        <td><strong>${playerOverall(p)}</strong></td>
        ${statsToShow.map(k => `<td>${renderRank(p.params[k])}</td>`).join('')}
      </tr>
    `;
  }).join('');

  modal.innerHTML = `
    <div class="prematch-inner-modal wide-modal">
      <div class="prematch-inner-header">
        <span>自チーム オーダー確認</span>
      </div>
      <div class="modal-scroll-area">
        <table class="roster-table mini">
          <thead>
            <tr>
              <th>Pos</th>
              <th>名前</th>
              <th>学年</th>
              <th>OVR</th>
              ${statsToShow.map(k => `<th>${PARAM_NAMES[k].substring(0,2)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="font-size:0.75rem; color:#666; padding:8px 12px; text-align:right;">
          ※スタメン変更はチームメニューから行えます
        </div>
      </div>
      <div class="prematch-inner-footer">
        <button class="prematch-inner-close" id="btn-order-back">← 戻る</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';

  document.getElementById('btn-order-back').addEventListener('click', () => {
    modal.style.display = 'none';
    modal.innerHTML = '';
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

  const modal       = document.getElementById('modal');
  const isWin       = result.won;
  const headerClass = isWin ? 'win-header' : 'lose-header';
  const setDetail   = result.setResults.map(r => `${r.scoreA}-${r.scoreB}`).join(' / ');
  const repSign     = result.repGain >= 0 ? '+' : '';
  const repCls      = result.repGain >= 0 ? 'positive' : 'negative';
  const champHtml   = (isWin && state_ref && MATCH_SCHEDULE[state_ref.week] &&
    state_ref.tournaments[MATCH_SCHEDULE[state_ref.week].tournament]?.champion)
    ? `<div class="reward-chip"><div class="reward-chip-label">達成</div><div class="reward-chip-value positive">🏆 優勝！</div></div>`
    : '';

  // 過去の試合履歴アコーディオン（現在の試合＝index 0 を除く）
  const history = state_ref ? (state_ref.matchLog || []).slice(1) : [];
  const historyHtml = history.length === 0 ? '' : `
    <div class="match-log-history">
      <div class="mlh-title">試合履歴</div>
      ${history.map(m => `
        <div class="mlh-item">
          <button class="mlh-header ${m.won ? 'win' : 'lose'}" onclick="toggleMlhItem(this)">
            <span>${m.year}年目・${m.name}</span>
            <span>${m.won ? '勝' : '負'} ${m.score}</span>
            <span class="mlh-arrow">▼</span>
          </button>
          <div class="mlh-body" style="display:none">
            ${m.log ? buildLogHtml(m.log) : '<div class="log-line-normal">ログなし</div>'}
          </div>
        </div>`).join('')}
    </div>`;

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
        <div class="match-log-stream-controls">
          <button id="btn-log-skip" class="btn-log-ctrl">⏭ スキップ</button>
          <button id="btn-log-speed" class="btn-log-ctrl">⚡ はやい</button>
        </div>
        <div id="match-log-stream" class="match-log-stream"></div>
        ${historyHtml}
        <button id="modal-close" class="btn-action-primary" style="margin-top:12px">閉じる</button>
      </div>
    </div>`;

  modal.style.display = 'flex';

  // ストリーミング再生
  const streamEl = document.getElementById('match-log-stream');
  const logLines = result.log || [];
  let currentSpeed = SPEED_NORMAL;
  let streamTimer = playLogStream(logLines, streamEl, currentSpeed, onStreamDone);

  function onStreamDone() {
    const skipBtn = document.getElementById('btn-log-skip');
    if (skipBtn) skipBtn.style.display = 'none';
  }

  function skipStream() {
    if (streamTimer) { clearInterval(streamTimer); streamTimer = null; }
    streamEl.innerHTML = buildLogHtml(logLines);
    streamEl.scrollTop = streamEl.scrollHeight;
    onStreamDone();
  }

  document.getElementById('btn-log-skip').addEventListener('click', skipStream);

  document.getElementById('btn-log-speed').addEventListener('click', function() {
    currentSpeed = currentSpeed === SPEED_NORMAL ? SPEED_FAST : SPEED_NORMAL;
    this.textContent = currentSpeed === SPEED_FAST ? '🐢 ふつう' : '⚡ はやい';
    if (streamTimer) { clearInterval(streamTimer); streamTimer = null; }
    streamTimer = playLogStream(logLines, streamEl, currentSpeed, onStreamDone);
  });

  document.getElementById('modal-close').addEventListener('click', () => {
    if (streamTimer) { clearInterval(streamTimer); streamTimer = null; }
    modal.style.display = 'none';
    window.onModalClose();
  });
}

// ==============================
// タイトル画面
// ==============================
function renderSchoolNameScreen(onConfirm) {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <h1 class="title-logo">🏐 バレー部育成ゲーム</h1>
        <p class="title-sub">あなたの高校名を入力してください</p>
        <div class="form-group">
          <label class="form-label">高校名</label>
          <input id="input-school-name" type="text" class="form-input"
            placeholder="例: 桜丘高校" maxlength="20" autocomplete="off">
        </div>
        <div class="login-actions">
          <button id="btn-school-confirm" class="btn-primary btn-large btn-full">決定</button>
        </div>
      </div>
    </div>
  `;
  const input = document.getElementById('input-school-name');
  input.focus();

  const confirm = () => {
    const name = input.value.trim();
    if (!name) {
      input.placeholder = '高校名を入力してください';
      input.classList.add('input-error');
      return;
    }
    onConfirm(name);
  };

  document.getElementById('btn-school-confirm').addEventListener('click', confirm);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') confirm(); });
  input.addEventListener('input', () => input.classList.remove('input-error'));
}

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
// ==============================
// 練習結果モーダル
// ==============================
function showPracticeResult(results, logs) {
  const modal = document.getElementById('modal');
  
  const renderModalContent = (status = 'saving') => {
    let buttonHtml = '';
    let statusHtml = '';

    if (status === 'saving') {
      buttonHtml = `<button id="btn-practice-ok" class="btn-primary" disabled style="opacity:0.7; cursor:not-allowed">
        <div class="loading-spinner-sm" style="display:inline-block; vertical-align:middle; margin-right:8px;"></div>
        保存中...
      </button>`;
    } else if (status === 'success') {
      buttonHtml = `<button id="btn-practice-ok" class="btn-primary">OK / 次へ</button>`;
      statusHtml = `<div class="save-status-badge success">保存完了</div>`;
    } else if (status === 'error') {
      buttonHtml = `<button id="btn-practice-retry" class="btn-match">再試行</button>`;
      statusHtml = `<div class="save-status-badge error">保存に失敗しました。再試行してください。</div>`;
    }

    // パラメータ上昇リストHTML生成
    let resultListHtml = '';
    if (results && results.length > 0) {
      resultListHtml = `
        <div class="result-section-label">以下のパラメータが上昇しました</div>
        <div class="result-list-container">
          <div class="result-list-header">
            <span>選手名</span>
            <span>能力</span>
            <span>上昇</span>
          </div>
          <div class="result-list-body">
            ${results.map(r => `
              <div class="result-row">
                <span class="res-name">${r.name}</span>
                <span class="res-type">${PARAM_NAMES[r.key] || r.key}</span>
                <span class="res-value">+${r.diff}</span>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      resultListHtml = `<div class="ps-empty" style="margin: 20px 0;">目立ったパラメータの上昇はありませんでした。</div>`;
    }

    // ケガログなどの重要通知
    const importantLogs = logs.filter(l => l.includes('🩼') || l.includes('！'));
    let logHtml = '';
    if (importantLogs.length > 0) {
      logHtml = `
        <div class="result-section-label" style="margin-top:16px; color:var(--red)">重要なお知らせ</div>
        <div class="weekly-log" style="background:#FFF0F0; border-color:var(--red); max-height:100px;">
          ${importantLogs.map(l => `<div class="log-line" style="color:var(--red); border-bottom-color:rgba(255,0,0,0.1)">${l}</div>`).join('')}
        </div>
      `;
    }

    modal.innerHTML = `
      <div class="modal-content">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h2 style="margin:0">練習結果</h2>
          ${statusHtml}
        </div>
        
        ${resultListHtml}
        ${logHtml}

        <div class="modal-actions" style="margin-top:24px; text-align:center">
          ${buttonHtml}
        </div>
      </div>`;
    
    // イベント付与
    if (status === 'success') {
      document.getElementById('btn-practice-ok').onclick = () => {
        modal.style.display = 'none';
        switchTabPublic('home');
      };
    } else if (status === 'error') {
      document.getElementById('btn-practice-retry').onclick = async () => {
        await triggerSave();
      };
    }
  };

  const triggerSave = async () => {
    renderModalContent('saving');
    try {
      await saveGame(state_ref);
      renderModalContent('success');
    } catch (e) {
      console.error('Save failed in modal:', e);
      renderModalContent('error');
    }
  };

  modal.style.display = 'flex';
  triggerSave();
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

/**
 * ホーム画面（ダッシュボード）の描画
 */
function renderHomeDashboard(state) {
  const el = document.getElementById('tab-home');
  
  // ① カウントダウン
  const countdown = getMatchCountdown(state);
  let countdownHtml = "";
  if (countdown) {
    const countdownWeeks = Math.max(0, countdown.weeks);
    countdownHtml = `
      <div class="dash-card dash-countdown">
        <div class="dash-card-header">
          <span class="dash-card-icon">🎯</span> 次の試合まで
        </div>
        <div class="dash-countdown-main">
          あと <span class="dash-countdown-number">${countdownWeeks}</span> 週
        </div>
        <div class="dash-countdown-sub">${countdown.name}</div>
      </div>
    `;
  }

  // ② 現在の戦績
  const tournaments = [
    { id: "prefectural",   label: "県大会" },
    { id: "interhigh",     label: "インターハイ" },
    { id: "spring_prelim", label: "春高予選" },
    { id: "spring",        label: "春高" }
  ];

  let currentRecordsHtml = `
    <div class="dash-card">
      <div class="dash-card-header">
        <span class="dash-card-icon">📊</span> 今シーズンの戦績
      </div>
      <div class="dash-records-list">
  `;
  tournaments.forEach(t => {
    const tState = state.tournaments[t.id];
    currentRecordsHtml += `
      <div class="dash-record-item">
        <span class="dash-record-label">${t.label}</span>
        <span class="dash-record-value">${getRecordText(tState)}</span>
      </div>
    `;
  });
  currentRecordsHtml += `</div></div>`;

  // ③ 過去最高戦績
  let bestRecordsHtml = `
    <div class="dash-card">
      <div class="dash-card-header">
        <span class="dash-card-icon">👑</span> 歴代最高記録
      </div>
      <div class="dash-records-list">
  `;
  tournaments.forEach(t => {
    const best = state.bestRecords ? state.bestRecords[t.id] : null;
    bestRecordsHtml += `
      <div class="dash-record-item">
        <span class="dash-record-label">${t.label}</span>
        <span class="dash-record-value">${getBestRecordText(best)}</span>
      </div>
    `;
  });
  bestRecordsHtml += `</div></div>`;

  // ④ 遊び方・設定ボタン
  const helpButtonHtml = `
    <div class="dash-help-container">
      <button class="btn-help" onclick="window.showHowToPlay()">
        <span class="btn-help-icon">❓</span> 遊び方を確認する
      </button>
      <button class="btn-help" onclick="window.showSchoolNameEdit()">
        <span class="btn-help-icon">✏️</span> チーム名を変更する
      </button>
    </div>
  `;

  // メインボタン（練習/試合へ）
  const nextMatch = getNextMatchInfo(state);
  const isMatchWeek = nextMatch && nextMatch.week === state.week;
  
  // 出場資格チェック
  let qualified = true;
  if (isMatchWeek) {
    if (nextMatch.tournament === 'interhigh' && !state.tournaments.prefectural.champion) qualified = false;
    if (nextMatch.tournament === 'spring' && !state.tournaments.spring_prelim.champion) qualified = false;
  }

  const btnText = (isMatchWeek && qualified) ? `🏐 試合に進む（${nextMatch.name}）` : "💪 練習・チーム管理へ進む";

  el.innerHTML = `
    <div class="dash-container">
      ${countdownHtml}
      ${currentRecordsHtml}
      ${bestRecordsHtml}
      ${helpButtonHtml}
      
      <div class="dash-action-area">
        <button class="btn-dash-main" onclick="switchTabPublic('action')">
          ${btnText}
        </button>
      </div>
    </div>
  `;

  // action-footer はクリア
  setActionFooter('');
}

/**
 * チーム名変更モーダル
 */
window.showSchoolNameEdit = function() {
  const modal = document.getElementById('modal');
  const current = G.schoolName || 'バレー部';
  modal.innerHTML = `
    <div class="modal-content">
      <h2 style="margin:0 0 16px">✏️ チーム名の変更</h2>
      <div class="form-group">
        <label class="form-label">高校名</label>
        <input id="input-school-name-edit" type="text" class="form-input"
          value="${current}" maxlength="20" autocomplete="off">
      </div>
      <div class="modal-actions" style="margin-top:20px; display:flex; gap:8px; justify-content:flex-end">
        <button id="btn-school-cancel" class="btn-secondary">キャンセル</button>
        <button id="btn-school-save" class="btn-primary">保存</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';

  const input = document.getElementById('input-school-name-edit');
  input.focus();
  input.select();

  document.getElementById('btn-school-cancel').onclick = () => {
    modal.style.display = 'none';
  };

  const save = () => {
    const name = input.value.trim();
    if (!name) { input.classList.add('input-error'); return; }
    G.schoolName = name;
    saveGame(G);
    modal.style.display = 'none';
    // ヘッダーのチーム名を即時反映
    const headerTeam = document.querySelector('.header-team');
    if (headerTeam) headerTeam.textContent = `🏐 ${name}`;
  };

  document.getElementById('btn-school-save').onclick = save;
  input.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
  input.addEventListener('input', () => input.classList.remove('input-error'));
};

/**
 * 遊び方モーダルの表示
 */
window.showHowToPlay = function() {
  const modal = document.getElementById('modal');
  modal.innerHTML = `
    <div class="modal-content help-modal">
      <div class="help-scroll-body">
        <h2 class="help-title">🏐 遊び方ガイド</h2>
        
        <section class="help-section">
          <h3 class="help-sec-title">【1. 基本のサイクル】</h3>
          <p>ゲームは<strong>1年48週</strong>のサイクルで進みます。</p>
          <ul class="help-list">
            <li><strong>平日:</strong> 練習メニューを組み、「週を進める」で選手を成長させます。</li>
            <li><strong>大会週:</strong> トーナメント戦（インターハイ、春高など）に出場し、勝利を目指します。</li>
            <li><strong>年度末:</strong> 3年生が引退し、スカウトした新入生が加わります。</li>
          </ul>
        </section>

        <section class="help-section">
          <h3 class="help-sec-title">【2. 練習と成長】</h3>
          <ul class="help-list">
            <li><strong>グループ分け:</strong> 選手をA・B・Cの3つのグループに振り分けられます（例：スタメン組、控え組など）。</li>
            <li><strong>メニュー選択:</strong> 「パス練習」「スパイク練習」など、伸ばしたい能力に合わせてメニューを選びましょう。</li>
            <li><strong>スタミナ管理:</strong> 練習を続けると体力が減ります。体力が低いと成長効率が下がるため、適度に<strong>「休憩」</strong>をさせて回復させることが重要です。</li>
          </ul>
        </section>

        <section class="help-section">
          <h3 class="help-sec-title">【3. チーム編成】</h3>
          <ul class="help-list">
            <li><strong>ポジション:</strong> 5つのポジション（OH, MB, OP, Se, Li）があります。適性のある選手をスタメンに配置しましょう。</li>
            <li><strong>スカウト:</strong> 勝利して「評判」が上がると、より才能豊かな中学生を勧誘できるようになります。</li>
          </ul>
        </section>

        <section class="help-section">
          <h3 class="help-sec-title">【4. ショップと設備】</h3>
          <ul class="help-list">
            <li><strong>ポイント:</strong> 試合に勝つとポイントが手に入ります。</li>
            <li><strong>アイテム・設備:</strong> スタミナ回復アイテムや、練習効率を上げる設備をショップで購入できます。</li>
          </ul>
        </section>

        <section class="help-section help-tips">
          <h3 class="help-sec-title">💡 勝利へのコツ</h3>
          <ul class="help-list">
            <li>スタミナを枯らさない</li>
            <li>評判を上げる</li>
            <li>特化育成を意識する</li>
          </ul>
        </section>

        <section class="help-section">
          <h3 class="help-sec-title">📱 画面の見かた</h3>
          <ul class="help-list">
            <li><strong>ホーム:</strong> 現在の戦績や次の試合を確認</li>
            <li><strong>練習:</strong> メニューを決めて1週間を進める</li>
            <li><strong>チーム:</strong> スタメン変更やグループ分け</li>
            <li><strong>スカウト:</strong> 新入生獲得</li>
            <li><strong>ショップ:</strong> アイテム・設備購入</li>
          </ul>
        </section>
      </div>
      <div class="modal-footer">
        <button id="modal-close-help" class="btn-primary btn-full">閉じる</button>
      </div>
    </div>
  `;
  modal.style.display = 'flex';
  document.getElementById('modal-close-help').addEventListener('click', () => modal.style.display = 'none');
};

/**
 * ダッシュボードからのアクション遷移
 */
window.onAdvanceToAction = function() {
  switchTabPublic('action');
};

/**
 * 従来の練習/試合前画面
 */
function renderPracticeArea(state) {
  const el = document.getElementById('tab-action');
  
  const matchInfo = MATCH_SCHEDULE[state.week];
  const tState = matchInfo ? state.tournaments[matchInfo.tournament] : null;
  const isMatchWeek = matchInfo && tState && !tState.eliminated && !tState.champion;
  
  let qualified = true;
  if (isMatchWeek) {
    if (matchInfo.tournament === 'interhigh' && !state.tournaments.prefectural.champion) qualified = false;
    if (matchInfo.tournament === 'spring' && !state.tournaments.spring_prelim.champion) qualified = false;
  }

  if (isMatchWeek && qualified) {
    showPreMatchScreen(state, matchInfo);
  } else {
    renderPractice(state);
  }
}

// グローバル参照（試合結果モーダルで使用）
let state_ref = null;
function setStateRef(s) { state_ref = s; }
