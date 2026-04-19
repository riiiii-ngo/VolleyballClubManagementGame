// ============================================================
// practice_match.js - 練習試合（オフライン / オンライン）
// ============================================================
// 依存: match.js (simulateSet, consumeMatchStamina, buildRotation)
//       player.js (playerOverall, getStarters)
//       supabase.js (savePracticeMatch, joinOnlinePool, pollForMatch,
//                    getOnlineOpponentSnapshot, leaveOnlinePool, getCurrentUserId)
//       state.js (saveGame)
// ============================================================

let _pmScreen = 'top'; // 'top'|'offline_select'|'pre_match'|'online_mode_select'|'room_waiting'|'room_join'|'online_timeout'
let _pmOfflineOpponent = null;
let _pmMatchType       = 'offline'; // 'offline' | 'online'
let _pmPoolEntryId    = null;
let _pmPollingTimer   = null;
let _pmPollingElapsed = 0;
let _pmRoomCode       = null; // ホストが作成した部屋番号

const PM_POLL_MS  = 3000;
const PM_TIMEOUT_S = 60;

// ============================================================
// エントリポイント（main.js の renderTab から呼ばれる）
// ============================================================
function renderPracticeMatch(state) {
  // タブ切り替え時にポーリングが残っていたらクリア
  if (_pmScreen !== 'online_wait' && _pmPollingTimer) {
    clearInterval(_pmPollingTimer);
    _pmPollingTimer = null;
  }

  const el = document.getElementById('tab-practice_match');
  if (!el) return;

  switch (_pmScreen) {
    case 'top':               renderPMTop(el, state);             break;
    case 'offline_select':    renderPMOfflineSelect(el, state);   break;
    case 'pre_match':         showPMPreMatchScreen(el, state);    break;
    case 'online_mode_select':renderPMOnlineModeSelect(el, state);break;
    case 'room_waiting':      renderPMRoomWaiting(el, state);     break;
    case 'room_join':         renderPMRoomJoin(el, state);        break;
    case 'online_timeout':    renderPMOnlineTimeout(el, state);   break;
    default:                  renderPMTop(el, state);             break;
  }
}

// ============================================================
// トップ画面
// ============================================================
function renderPMTop(el, state) {
  el.innerHTML = `
    <div class="pm-top-screen">
      <div class="pm-section-title">練習試合</div>
      <button class="pm-mode-card" onclick="pmGoOffline()">
        <div class="pm-mode-card-icon">🏐</div>
        <div class="pm-mode-card-title">オフライン対戦</div>
        <div class="pm-mode-card-desc">全国の高校と自由に対戦（評判変化なし）</div>
      </button>
      <button class="pm-mode-card online" onclick="pmGoOnline()">
        <div class="pm-mode-card-icon">🌐</div>
        <div class="pm-mode-card-title">オンライン対戦</div>
        <div class="pm-mode-card-desc">他のプレイヤーのチームとランダムマッチング</div>
      </button>
    </div>`;
}

window.pmGoOffline = function() {
  _pmScreen = 'offline_select';
  renderPracticeMatch(G);
};

window.pmGoOnline = function() {
  _pmScreen = 'online_mode_select';
  renderPracticeMatch(G);
};

// ============================================================
// オフライン: 対戦相手選択画面
// ============================================================
function renderPMOfflineSelect(el, state) {
  const options = ENEMIES.map((t, i) =>
    `<option value="${i}">${t.school}【${t.rank}】</option>`
  ).join('');

  el.innerHTML = `
    <div class="pm-select-screen">
      <div class="pm-section-title">対戦相手を選択</div>
      <div class="pm-field-label">相手校</div>
      <select id="pm-opponent-select" class="pm-opponent-select">
        <option value="random">ランダム</option>
        ${options}
      </select>
      <div class="pm-action-row">
        <button class="btn-secondary" onclick="pmBackToTop()">戻る</button>
        <button class="btn-primary" onclick="pmSelectOpponent()">次へ</button>
      </div>
    </div>`;
}

window.pmBackToTop = function() {
  _pmScreen = 'top';
  _pmOfflineOpponent = null;
  renderPracticeMatch(G);
};

window.pmSelectOpponent = function() {
  const sel = document.getElementById('pm-opponent-select');
  const val = sel ? sel.value : 'random';
  if (val === 'random') {
    _pmOfflineOpponent = buildOpponentFromEnemyTeam(
      ENEMIES[Math.floor(Math.random() * ENEMIES.length)]
    );
  } else {
    _pmOfflineOpponent = buildOpponentFromEnemyTeam(ENEMIES[parseInt(val, 10)]);
  }
  _pmMatchType = 'offline';
  _pmScreen = 'pre_match';
  renderPracticeMatch(G);
};

// ============================================================
// 試合前画面（インターハイ等と同一UI）
// ============================================================
function showPMPreMatchScreen(el, state) {
  const opp = _pmOfflineOpponent;
  if (!opp) { _pmScreen = 'offline_select'; renderPracticeMatch(state); return; }

  const VOLLEYBALL_STATS = ['spike', 'serve', 'block', 'receive', 'toss'];

  const starters = getStarters(state);
  const starterList = Object.values(starters).filter(Boolean);
  const ownAvg = {};
  VOLLEYBALL_STATS.forEach(k => {
    ownAvg[k] = starterList.length > 0
      ? Math.round(starterList.reduce((s, p) => s + (p.params[k] || 0), 0) / starterList.length)
      : 0;
  });
  const ownOverall = Math.round(VOLLEYBALL_STATS.reduce((s, k) => s + ownAvg[k], 0) / 5);

  const oppAvg = {};
  VOLLEYBALL_STATS.forEach(k => {
    oppAvg[k] = Math.round(opp.players.reduce((s, p) => s + (p.params[k] || 0), 0) / opp.players.length);
  });
  const oppOverall = Math.round(VOLLEYBALL_STATS.reduce((s, k) => s + oppAvg[k], 0) / 5);

  const oppRepIdx = opp.avgStat >= 75 ? 4 : opp.avgStat >= 60 ? 3
    : opp.avgStat >= 50 ? 2 : opp.avgStat >= 35 ? 1 : 0;

  const ownRepLabel = REPUTATIONS[state.reputation];
  const ownRepColor = REPUTATION_COLORS[state.reputation];
  const oppRepLabel = REPUTATIONS[oppRepIdx];
  const oppRepColor = REPUTATION_COLORS[oppRepIdx];

  const backFn = _pmMatchType === 'offline' ? 'pmBackFromPreMatch()' : 'pmBackToTop()';

  el.innerHTML = `
    <div class="prematch-screen">
      <div class="prematch-info-bar">
        <span class="prematch-info-text">練習試合　${_pmMatchType === 'online' ? '🌐 オンライン' : ''}</span>
        <span class="prematch-info-badge">評判変化なし</span>
      </div>

      <div class="prematch-score-area">
        <div class="prematch-score-row">
          <span class="prematch-score-label"></span>
          ${[1,2,3].map(n => `<span class="prematch-set-num">${n}</span>`).join('')}
        </div>
        <div class="prematch-score-row">
          <span class="prematch-score-label">自チーム</span>
          ${[1,2,3].map(() => `<span class="prematch-score-val">-</span>`).join('')}
        </div>
        <div class="prematch-score-row">
          <span class="prematch-score-label">相手</span>
          ${[1,2,3].map(() => `<span class="prematch-score-val">-</span>`).join('')}
        </div>
      </div>

      <div class="prematch-card">
        <div class="prematch-card-title">練習試合</div>
        <div class="prematch-teams">
          <div class="prematch-team prematch-team-home">
            <div class="prematch-team-name">${state.schoolName || 'バレー部'}</div>
            <div class="prematch-team-rep" style="color:${ownRepColor}">${ownRepLabel}</div>
            <div class="prematch-radar-wrap">
              <canvas id="pm-prematch-radar-a"></canvas>
            </div>
            <div class="prematch-overall">総合  ${renderRank(ownOverall)}</div>
          </div>

          <div class="prematch-vs">VS</div>

          <div class="prematch-team prematch-team-away">
            <div class="prematch-team-name">${opp.name}</div>
            <div class="prematch-team-rep" style="color:${oppRepColor}">${oppRepLabel}</div>
            <div class="prematch-radar-wrap">
              <canvas id="pm-prematch-radar-b"></canvas>
            </div>
            <div class="prematch-overall">総合  ${renderRank(oppOverall)}</div>
          </div>
        </div>
      </div>

      <div class="prematch-actions">
        <button class="prematch-btn" onclick="${backFn}">戻る</button>
        <button class="prematch-btn prematch-btn-start" onclick="pmDoStartMatch()">試合開始 ▶</button>
        <button class="prematch-btn" onclick="pmShowOpponentData()">相手データ</button>
      </div>
    </div>`;

  // レーダーチャート描画
  setTimeout(() => {
    const chartOpts = (color) => ({
      type: 'radar',
      data: {
        labels: VOLLEYBALL_STATS.map(k => PARAM_NAMES[k]),
        datasets: [{
          data: [0, 0, 0, 0, 0],
          backgroundColor: `rgba(${color}, 0.2)`,
          borderColor: `rgba(${color}, 1)`,
          pointBackgroundColor: `rgba(${color}, 1)`,
          pointBorderColor: '#fff',
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        scales: {
          r: {
            angleLines: { color: 'rgba(0,0,0,0.1)' },
            grid:       { color: 'rgba(0,0,0,0.1)' },
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

    const ctxA = document.getElementById('pm-prematch-radar-a');
    if (ctxA && window.Chart) {
      const cfg = chartOpts('0, 122, 255');
      cfg.data.labels = VOLLEYBALL_STATS.map(k => `${PARAM_NAMES[k]}(${getRank(ownAvg[k]).label})`);
      cfg.data.datasets[0].data = VOLLEYBALL_STATS.map(k => ownAvg[k]);
      new Chart(ctxA, cfg);
    }
    const ctxB = document.getElementById('pm-prematch-radar-b');
    if (ctxB && window.Chart) {
      const cfg = chartOpts('255, 59, 48');
      cfg.data.labels = VOLLEYBALL_STATS.map(k => `${PARAM_NAMES[k]}(${getRank(oppAvg[k]).label})`);
      cfg.data.datasets[0].data = VOLLEYBALL_STATS.map(k => oppAvg[k]);
      new Chart(ctxB, cfg);
    }
  }, 0);
}

window.pmBackFromPreMatch = function() {
  _pmScreen = 'offline_select';
  renderPracticeMatch(G);
};

window.pmDoStartMatch = function() {
  startPracticeMatch(G, _pmOfflineOpponent, _pmMatchType);
};

window.pmShowOpponentData = function() {
  const PM_MATCH_INFO = { name: '練習試合', tournament: 'practice', round: 0, maxSets: 3 };
  showOpponentDataModal(_pmOfflineOpponent, G, PM_MATCH_INFO);
};

// ============================================================
// オンライン: 部屋作成処理（ホスト側）
// ============================================================
async function startCreateRoom(state) {
  _pmScreen = 'room_waiting';
  _pmPollingElapsed = 0;
  _pmRoomCode = null;
  renderPracticeMatch(state);

  const snapshot = {
    starters:    state.starters,
    players:     state.players,
    school_name: state.schoolName || 'バレー部',
    reputation:  state.reputation,
  };

  let result;
  try {
    result = await createRoom(snapshot);
  } catch (e) {
    console.error('createRoom error:', e);
    showAlert('部屋の作成に失敗しました。');
    _pmScreen = 'online_mode_select';
    renderPracticeMatch(state);
    return;
  }

  _pmPoolEntryId = result.poolEntryId;
  _pmRoomCode = result.roomCode;

  // 部屋コードを表示して待機
  const el = document.getElementById('tab-practice_match');
  if (el) renderPMRoomWaiting(el, state);

  // ポーリング開始（相手が参加したら matched になる）
  _pmPollingTimer = setInterval(() => pollRoomMatch(state), PM_POLL_MS);
}

async function pollRoomMatch(state) {
  _pmPollingElapsed += PM_POLL_MS / 1000;

  if (_pmPollingElapsed >= PM_TIMEOUT_S) {
    clearInterval(_pmPollingTimer);
    _pmPollingTimer = null;
    leaveOnlinePool(_pmPoolEntryId).catch(e => console.error('leaveOnlinePool:', e));
    _pmPoolEntryId = null;
    _pmScreen = 'online_timeout';
    renderPracticeMatch(state);
    return;
  }

  const el = document.getElementById('tab-practice_match');
  if (el && _pmScreen === 'room_waiting') renderPMRoomWaiting(el, state);

  try {
    const { matched, match_id } = await pollForMatch(_pmPoolEntryId);
    if (matched && match_id) {
      clearInterval(_pmPollingTimer);
      _pmPollingTimer = null;
      const myUserId = await getCurrentUserId();
      const opponentData = await getOnlineOpponentSnapshot(match_id, myUserId);
      _pmOfflineOpponent = buildOpponentFromSnapshot(
        opponentData.team_snapshot,
        opponentData.school_name
      );
      _pmPoolEntryId = null;
      _pmMatchType = 'online';
      _pmScreen = 'pre_match';
      renderPracticeMatch(state);
    }
  } catch (e) {
    console.error('pollRoomMatch error:', e);
  }
}

// ============================================================
// オンライン: モード選択（部屋を作る / 部屋を探す）
// ============================================================
function renderPMOnlineModeSelect(el, state) {
  el.innerHTML = `
    <div class="pm-top-screen">
      <div class="pm-section-title">オンライン対戦</div>
      <button class="pm-mode-card online" onclick="pmCreateRoom()">
        <div class="pm-mode-card-icon">🏠</div>
        <div class="pm-mode-card-title">部屋を作る</div>
        <div class="pm-mode-card-desc">部屋番号を発行して相手を待つ</div>
      </button>
      <button class="pm-mode-card online" onclick="pmGoRoomJoin()">
        <div class="pm-mode-card-icon">🔍</div>
        <div class="pm-mode-card-title">部屋を探す</div>
        <div class="pm-mode-card-desc">部屋番号を入力して参加する</div>
      </button>
      <button class="btn-secondary" style="margin-top:8px" onclick="pmBackToTop()">戻る</button>
    </div>`;
}

window.pmCreateRoom = function() {
  startCreateRoom(G);
};

window.pmGoRoomJoin = function() {
  _pmScreen = 'room_join';
  renderPracticeMatch(G);
};

// ============================================================
// オンライン: 部屋コード表示・待機画面（ホスト側）
// ============================================================
function renderPMRoomWaiting(el, state) {
  const elapsed = Math.min(_pmPollingElapsed, PM_TIMEOUT_S);
  const pct = Math.round((elapsed / PM_TIMEOUT_S) * 100);

  el.innerHTML = `
    <div class="pm-online-wait">
      <div class="pm-wait-label">部屋を作成しました</div>
      <div class="pm-room-code-label">部屋番号</div>
      <div class="pm-room-code-display">${_pmRoomCode || '------'}</div>
      <div class="pm-wait-label" style="font-size:0.8rem;margin-top:8px">相手の参加を待っています...</div>
      <div class="pm-wait-elapsed">${elapsed} / ${PM_TIMEOUT_S} 秒</div>
      <div class="pm-wait-bar-wrap">
        <div class="pm-wait-bar" style="width:${pct}%"></div>
      </div>
      <button class="btn-secondary" onclick="cancelOnlineMatching()">キャンセル</button>
    </div>`;
}

// ============================================================
// オンライン: 部屋番号入力画面（ゲスト側）
// ============================================================
function renderPMRoomJoin(el, state) {
  el.innerHTML = `
    <div class="pm-select-screen">
      <div class="pm-section-title">部屋を探す</div>
      <div class="pm-field-label">部屋番号（6桁）</div>
      <input id="pm-room-code-input" type="number" inputmode="numeric"
        class="pm-opponent-select" placeholder="例: 123456"
        style="font-size:1.3rem;letter-spacing:0.15em;text-align:center"
        maxlength="6" />
      <div id="pm-room-join-error" style="color:var(--red);font-size:0.8rem;min-height:1.2em;margin-top:4px"></div>
      <div class="pm-action-row">
        <button class="btn-secondary" onclick="pmBackToOnlineModeSelect()">戻る</button>
        <button class="btn-primary" onclick="pmJoinRoomByCode()">参加する</button>
      </div>
    </div>`;
}

window.pmBackToOnlineModeSelect = function() {
  _pmScreen = 'online_mode_select';
  renderPracticeMatch(G);
};

window.pmJoinRoomByCode = async function() {
  const input = document.getElementById('pm-room-code-input');
  const errEl = document.getElementById('pm-room-join-error');
  const code = input ? input.value.trim() : '';
  if (!code || code.length < 4) {
    if (errEl) errEl.textContent = '部屋番号を入力してください。';
    return;
  }

  const joinBtn = document.querySelector('#tab-practice_match .btn-primary');
  if (joinBtn) { joinBtn.disabled = true; joinBtn.textContent = '接続中...'; }

  const snapshot = {
    starters:    G.starters,
    players:     G.players,
    school_name: G.schoolName || 'バレー部',
    reputation:  G.reputation,
  };

  try {
    const result = await joinRoomByCode(code, snapshot);
    _pmPoolEntryId = result.poolEntryId;
    _pmOfflineOpponent = buildOpponentFromSnapshot(
      result.immediateOpponent.team_snapshot,
      result.immediateOpponent.school_name
    );
    _pmMatchType = 'online';
    _pmScreen = 'pre_match';
    renderPracticeMatch(G);
  } catch (e) {
    if (errEl) errEl.textContent = e.message || '接続に失敗しました。';
    if (joinBtn) { joinBtn.disabled = false; joinBtn.textContent = '参加する'; }
  }
};

// ============================================================
// オンライン: マッチング待機画面（旧ランダムマッチ用・未使用だが残置）
// ============================================================
function renderPMOnlineWait(el, state) {
  const elapsed = Math.min(_pmPollingElapsed, PM_TIMEOUT_S);
  const pct = Math.round((elapsed / PM_TIMEOUT_S) * 100);

  el.innerHTML = `
    <div class="pm-online-wait">
      <div class="pm-wait-spinner"></div>
      <div class="pm-wait-label">対戦相手を探しています...</div>
      <div class="pm-wait-elapsed">${elapsed} / ${PM_TIMEOUT_S} 秒</div>
      <div class="pm-wait-bar-wrap">
        <div class="pm-wait-bar" style="width:${pct}%"></div>
      </div>
      <button class="btn-secondary" onclick="cancelOnlineMatching()">キャンセル</button>
    </div>`;
}

// ============================================================
// オンライン: タイムアウト画面
// ============================================================
function renderPMOnlineTimeout(el, state) {
  el.innerHTML = `
    <div class="pm-online-wait">
      <div class="pm-wait-label" style="font-size:1.1rem">⏱ マッチングタイムアウト</div>
      <div class="pm-wait-elapsed">対戦相手が見つかりませんでした</div>
      <div class="pm-action-row" style="flex-direction:column;gap:8px;width:100%">
        <button class="btn-primary" onclick="pmRetryOnline()">再試行</button>
        <button class="btn-secondary" onclick="pmGoToOfflineFromTimeout()">オフラインで対戦</button>
        <button class="btn-secondary" onclick="pmBackToTop()">戻る</button>
      </div>
    </div>`;
}

window.pmRetryOnline = function() {
  _pmScreen = 'online_mode_select';
  renderPracticeMatch(G);
};

window.pmGoToOfflineFromTimeout = function() {
  _pmScreen = 'offline_select';
  renderPracticeMatch(G);
};

// ============================================================
// オンライン: マッチング処理
// ============================================================
async function startOnlineMatching(state) {
  _pmScreen = 'online_wait';
  _pmPollingElapsed = 0;
  renderPracticeMatch(state);

  const snapshot = {
    starters:    state.starters,
    players:     state.players,
    school_name: state.schoolName || 'バレー部',
    reputation:  state.reputation,
  };

  let joinResult;
  try {
    joinResult = await joinOnlinePool(snapshot);
  } catch (e) {
    console.error('joinOnlinePool error:', e);
    showAlert('オンライン対戦への接続に失敗しました。');
    _pmScreen = 'top';
    renderPracticeMatch(state);
    return;
  }

  _pmPoolEntryId = joinResult.poolEntryId;

  // 自分が2人目だった場合: 即時マッチ成立 → 試合前画面へ
  if (joinResult.immediateOpponent) {
    _pmPoolEntryId = null;
    _pmOfflineOpponent = buildOpponentFromSnapshot(
      joinResult.immediateOpponent.team_snapshot,
      joinResult.immediateOpponent.school_name
    );
    _pmMatchType = 'online';
    _pmScreen = 'pre_match';
    renderPracticeMatch(state);
    return;
  }

  // 1人目: ポーリング開始
  _pmPollingTimer = setInterval(() => pollOnlineMatch(state), PM_POLL_MS);
}

async function pollOnlineMatch(state) {
  _pmPollingElapsed += PM_POLL_MS / 1000;

  // タイムアウト
  if (_pmPollingElapsed >= PM_TIMEOUT_S) {
    clearInterval(_pmPollingTimer);
    _pmPollingTimer = null;
    leaveOnlinePool(_pmPoolEntryId).catch(e => console.error('leaveOnlinePool:', e));
    _pmPoolEntryId = null;
    _pmScreen = 'online_timeout';
    renderPracticeMatch(state);
    return;
  }

  // 経過時間UIを更新
  const el = document.getElementById('tab-practice_match');
  if (el && _pmScreen === 'online_wait') renderPMOnlineWait(el, state);

  try {
    const { matched, match_id } = await pollForMatch(_pmPoolEntryId);
    if (matched && match_id) {
      clearInterval(_pmPollingTimer);
      _pmPollingTimer = null;
      const myUserId = await getCurrentUserId();
      const opponentData = await getOnlineOpponentSnapshot(match_id, myUserId);
      const opponent = buildOpponentFromSnapshot(
        opponentData.team_snapshot,
        opponentData.school_name
      );
      _pmPoolEntryId = null;
      _pmOfflineOpponent = opponent;
      _pmMatchType = 'online';
      _pmScreen = 'pre_match';
      renderPracticeMatch(state);
    }
  } catch (e) {
    console.error('pollOnlineMatch error:', e);
    // 非致命的: ポーリング継続
  }
}

window.cancelOnlineMatching = function() {
  if (_pmPollingTimer) {
    clearInterval(_pmPollingTimer);
    _pmPollingTimer = null;
  }
  if (_pmPoolEntryId) {
    leaveOnlinePool(_pmPoolEntryId).catch(e => console.error('leaveOnlinePool:', e));
    _pmPoolEntryId = null;
  }
  _pmRoomCode = null;
  _pmScreen = 'online_mode_select';
  renderPracticeMatch(G);
};

// ページ離脱時にプールから退出（best-effort）
window.addEventListener('beforeunload', () => {
  if (_pmPoolEntryId) leaveOnlinePool(_pmPoolEntryId);
});

// ============================================================
// 対戦相手オブジェクト生成
// ============================================================
function buildOpponentFromEnemyTeam(team) {
  const players = team.players.map((p, i) => ({
    id: -(i + 1),
    name: p.name,
    position: p.position,
    params: {
      spike: p.spike, receive: p.receive, block: p.block,
      serve: p.serve, toss: p.toss, power: p.power,
      speed: p.speed, technique: p.technique, stamina: p.stamina,
    },
    currentStamina: 90,
    maxStamina: 100,
    isAllRounder: false,
    grade: 2,
  }));
  const teamAvg = players.reduce((s, p) => s + playerOverall(p), 0) / players.length;
  return { players, name: team.school, avgStat: Math.round(teamAvg), rank: team.rank };
}

function buildOpponentFromSnapshot(snapshot, schoolName) {
  const players = (snapshot.players || []).map((p, i) => ({
    id: -(i + 1),
    name:       p.name || `選手${i + 1}`,
    position:   p.position || 'OH',
    params:     { ...p.params },
    currentStamina: p.currentStamina || 80,
    maxStamina:     p.maxStamina     || 100,
    isAllRounder:   p.isAllRounder   || false,
    grade:          p.grade          || 2,
  }));
  const teamAvg = players.length
    ? players.reduce((s, p) => s + playerOverall(p), 0) / players.length
    : 50;
  return { players, name: schoolName || '対戦相手', avgStat: Math.round(teamAvg) };
}

// ============================================================
// 練習試合シミュレーション（副作用: スタミナ消費のみ）
// ============================================================
function simulatePracticeMatch(state, opponent) {
  const starters = getStarters(state);
  const rotationSlots = ['OH1', 'MB1', 'OP', 'OH2', 'MB2', 'Se'];
  const rotA = rotationSlots.map(s => starters[s]).filter(Boolean);

  if (rotA.length < 6) {
    return {
      success: false,
      msg: 'スタメンが揃っていません。チーム設定でスタメンを設定してください。',
    };
  }

  const liberoA = starters.Li || null;
  const rotB    = opponent.players.filter(p => p.position !== 'Li');
  const liberoB = opponent.players.find(p => p.position === 'Li') || null;

  const setsToWin = 2;
  let setsA = 0, setsB = 0;
  const setResults = [];
  const allLogs = ['--- 練習試合 ---', `対戦相手: ${opponent.name}（総合力 ${opponent.avgStat}）`];

  let setNum = 0;
  while (setsA < setsToWin && setsB < setsToWin) {
    setNum++;
    const setResult = simulateSet(rotA, rotB, liberoA, liberoB, 25, false);
    if (setResult.winner === 'A') setsA++; else setsB++;
    setResults.push({ setNum, scoreA: setResult.scoreA, scoreB: setResult.scoreB });

    allLogs.push(`\n--- 第${setNum}セット ---`);
    const sample = setResult.logs.filter(
      (_, i) => i % Math.max(1, Math.floor(setResult.logs.length / 20)) === 0
    );
    sample.forEach(l => allLogs.push(l.text));
    allLogs.push(`第${setNum}セット終了: ${setResult.scoreA}-${setResult.scoreB}`);
  }

  const won = setsA > setsB;
  const finalScore = setResults.map(r => `${r.scoreA}-${r.scoreB}`).join(', ');
  allLogs.push(`\n=== 試合結果: ${won ? '勝利' : '敗戦'} (${setsA}-${setsB}) ===`);

  // スタミナ消費（通常の半分）
  rotA.forEach(p => consumeMatchStamina(p, Math.ceil(setNum / 2)));
  if (liberoA) consumeMatchStamina(liberoA, Math.ceil(setNum / 2));

  return {
    success: true, won, setsA, setsB, setResults,
    finalScore, log: allLogs,
    matchName: '練習試合', opponent,
    repGain: 0, shopGain: 0,
  };
}

// ============================================================
// 試合を開始してDB保存
// ============================================================
function startPracticeMatch(state, opponent, matchType) {
  const result = simulatePracticeMatch(state, opponent);

  if (!result.success) {
    showAlert(result.msg);
    _pmScreen = 'top';
    renderPracticeMatch(state);
    return;
  }

  // DB保存 fire-and-forget
  savePracticeMatch({
    school_name:   state.schoolName || 'バレー部',
    opponent_name: opponent.name,
    won:           result.won,
    sets_a:        result.setsA,
    sets_b:        result.setsB,
    set_detail:    result.finalScore,
    match_type:    matchType,
  }).catch(e => console.error('practice_match save:', e));

  // 履歴をGに保存
  if (!state.practiceMatchHistory) state.practiceMatchHistory = [];
  state.practiceMatchHistory.unshift({
    won:       result.won,
    score:     `${result.setsA}-${result.setsB}`,
    setDetail: result.finalScore,
    opponent:  opponent.name,
    log:       (result.log || []).slice(0, 80),
  });
  if (state.practiceMatchHistory.length > 15) state.practiceMatchHistory.length = 15;

  showPracticeMatchResult(result, state);
}

// ============================================================
// 試合結果モーダル（fast固定・スピード切替なし）
// ============================================================
function showPracticeMatchResult(result, state) {
  const modal       = document.getElementById('modal');
  const isWin       = result.won;
  const headerClass = isWin ? 'win-header' : 'lose-header';
  const setDetail   = result.setResults.map(r => `${r.scoreA}-${r.scoreB}`).join(' / ');
  const logLines    = result.log || [];

  // 過去の練習試合履歴アコーディオン（index 0 = 今回 を除く）
  const history = (state && state.practiceMatchHistory || []).slice(1);
  const historyHtml = history.length === 0 ? '' : `
    <div class="match-log-history">
      <div class="mlh-title">練習試合履歴</div>
      ${history.map(m => `
        <div class="mlh-item">
          <button class="mlh-header ${m.won ? 'win' : 'lose'}" onclick="toggleMlhItem(this)">
            <span>vs ${m.opponent}</span>
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
            <div class="reward-chip-label">練習試合</div>
            <div class="reward-chip-value" style="color:var(--text2)">評判変化なし</div>
          </div>
        </div>
        <div class="match-log-stream-controls">
          <button id="pm-btn-skip" class="btn-log-ctrl">⏭ スキップ</button>
        </div>
        <div id="pm-log-stream" class="match-log-stream"></div>
        ${historyHtml}
        <button id="pm-modal-close" class="btn-action-primary" style="margin-top:12px">閉じる</button>
      </div>
    </div>`;

  modal.style.display = 'flex';

  // はやい固定でストリーミング再生
  const streamEl = document.getElementById('pm-log-stream');
  let streamTimer = playLogStream(logLines, streamEl, SPEED_FAST, () => {
    const skipBtn = document.getElementById('pm-btn-skip');
    if (skipBtn) skipBtn.style.display = 'none';
  });

  document.getElementById('pm-btn-skip').addEventListener('click', () => {
    if (streamTimer) { clearInterval(streamTimer); streamTimer = null; }
    streamEl.innerHTML = buildLogHtml(logLines);
    streamEl.scrollTop = streamEl.scrollHeight;
    const skipBtn = document.getElementById('pm-btn-skip');
    if (skipBtn) skipBtn.style.display = 'none';
  });

  document.getElementById('pm-modal-close').addEventListener('click', () => {
    if (streamTimer) { clearInterval(streamTimer); streamTimer = null; }
    modal.style.display = 'none';
    returnToPracticeMatchTop();
  });
}

// ============================================================
// 試合後 → 練習試合トップへ戻る
// ============================================================
function returnToPracticeMatchTop() {
  _pmScreen = 'top';
  _pmOfflineOpponent = null;
  saveGame(G); // スタミナ消費を保存
  switchTabPublic('practice_match');
}
