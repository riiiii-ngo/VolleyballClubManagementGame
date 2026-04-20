// ============================================================
// matchlog.js - 試合ログ表示（1点ごとアニメーション）
// ============================================================

function generateLog(point) {
  const scoreLabel = `${point.scoreA} - ${point.scoreB}`;
  let suffix = '';
  if (point.isMatchPoint) suffix = '【マッチポイント】';
  else if (point.isSetPoint) suffix = '【セットポイント】';

  const header = `${point.teamName} 得点！（${scoreLabel}）${suffix}`;

  let detail;
  if (point.type === 'spike') {
    detail = `${point.player}（${point.pos}） スパイク得点`;
  } else if (point.type === 'block') {
    detail = `${point.player}（${point.pos}） ブロック得点`;
  } else if (point.type === 'serve') {
    detail = `${point.player}（${point.pos}） サーブエース！`;
  } else {
    detail = '相手のミスで得点';
  }

  return [header, detail, suffix];
}

function showMatchLog(result, onComplete) {
  const el = document.getElementById('tab-action');
  const allPoints = result.pointLog || [];
  const ownName = result.ownName || 'バレー部';
  const oppName = result.opponent ? result.opponent.name : '相手チーム';

  document.body.classList.add('match-mode');

  function complete() {
    el.style.padding = '';
    el.style.overflow = '';
    document.body.classList.remove('match-mode');
    onComplete();
  }

  if (allPoints.length === 0) {
    complete();
    return;
  }

  // 表示状態
  let pointIdx = 0;
  let speedMs = 1000;
  let currentSetNum = 0;
  let timerId = null;

  // タブ内パディングを無効化してフルWidth表示
  el.style.padding = '0';
  el.style.overflow = 'hidden';

  el.innerHTML = `
    <div class="matchlog-screen">
      <div class="matchlog-header">
        <div class="matchlog-set-label" id="ml-set-label">読み込み中...</div>
        <div class="matchlog-score-row">
          <div class="matchlog-team-label">${ownName}</div>
          <div class="matchlog-score-block">
            <span class="matchlog-score-num team-a" id="ml-score-a">0</span>
            <span class="matchlog-dash">-</span>
            <span class="matchlog-score-num team-b" id="ml-score-b">0</span>
          </div>
          <div class="matchlog-team-label">${oppName}</div>
        </div>
      </div>

      <div class="matchlog-point-area">
        <div class="matchlog-point-card" id="ml-point-card">
          <div class="matchlog-point-header-line">
            <span id="ml-header-text" class="matchlog-header-text"></span>
            <span id="ml-header-suffix" class="matchlog-suffix"></span>
          </div>
          <div id="ml-point-detail" class="matchlog-point-detail"></div>
        </div>
      </div>

      <div class="matchlog-controls">
        <div class="matchlog-speed-row">
          <button class="btn-matchlog-speed active" id="ml-btn-normal">ふつう</button>
          <button class="btn-matchlog-speed" id="ml-btn-fast">はやい</button>
          <button class="btn-matchlog-speed" id="ml-btn-skip-set">スキップ</button>
        </div>
        <button class="btn-matchlog-skip-match" id="ml-btn-skip-match">試合終了までスキップ</button>
      </div>
    </div>
  `;

  function setActiveBtn(id) {
    ['ml-btn-normal', 'ml-btn-fast', 'ml-btn-skip-set'].forEach(bid => {
      document.getElementById(bid)?.classList.toggle('active', bid === id);
    });
  }

  function displayPoint(point) {
    const [, detail, suffix] = generateLog(point);
    const headerText = `${point.teamName} 得点！（${point.scoreA} - ${point.scoreB}）`;

    const headerTextEl = document.getElementById('ml-header-text');
    const suffixEl = document.getElementById('ml-header-suffix');
    const detailEl = document.getElementById('ml-point-detail');
    const card = document.getElementById('ml-point-card');
    const scoreAEl = document.getElementById('ml-score-a');
    const scoreBEl = document.getElementById('ml-score-b');

    if (headerTextEl) headerTextEl.textContent = headerText;
    if (detailEl) detailEl.textContent = detail;

    if (suffixEl) {
      suffixEl.textContent = suffix;
      suffixEl.className = 'matchlog-suffix';
      if (point.isMatchPoint) suffixEl.classList.add('is-match-point');
      else if (point.isSetPoint) suffixEl.classList.add('is-set-point');
    }

    if (card) {
      card.className = 'matchlog-point-card';
      card.classList.add(point.teamIsA ? 'team-a' : 'team-b');
      if (point.isMatchPoint) card.classList.add('is-match-point');
      else if (point.isSetPoint) card.classList.add('is-set-point');
      // アニメーション再トリガー
      void card.offsetWidth;
      card.classList.add('matchlog-animate');
    }

    if (scoreAEl) scoreAEl.textContent = point.scoreA;
    if (scoreBEl) scoreBEl.textContent = point.scoreB;
  }

  function showSetEnd(setNum) {
    const sr = result.setResults && result.setResults[setNum - 1];
    const setLabel = document.getElementById('ml-set-label');
    const headerTextEl = document.getElementById('ml-header-text');
    const suffixEl = document.getElementById('ml-header-suffix');
    const detailEl = document.getElementById('ml-point-detail');
    const card = document.getElementById('ml-point-card');
    const scoreAEl = document.getElementById('ml-score-a');
    const scoreBEl = document.getElementById('ml-score-b');

    if (setLabel) setLabel.textContent = `第${setNum}セット 終了`;
    if (headerTextEl) headerTextEl.textContent = `第${setNum}セット 終了`;
    if (suffixEl) { suffixEl.textContent = ''; suffixEl.className = 'matchlog-suffix'; }
    if (detailEl && sr) detailEl.textContent = `${sr.scoreA} - ${sr.scoreB}`;
    if (card) {
      card.className = 'matchlog-point-card set-end';
      void card.offsetWidth;
      card.classList.add('matchlog-animate');
    }
    if (scoreAEl && sr) scoreAEl.textContent = sr.scoreA;
    if (scoreBEl && sr) scoreBEl.textContent = sr.scoreB;
  }

  function showResult() {
    clearTimeout(timerId);
    const isWin = result.won;
    const ownName = result.ownName || 'バレー部';
    const oppName = result.opponent ? result.opponent.name : '相手チーム';
    const setDetail = (result.setResults || []).map(r => `${r.scoreA}-${r.scoreB}`).join(' / ');
    const sets = result.sets || [];
    const growth = result.growth || [];
    const isPractice = result.matchType === 'practice';
    const lastSetNum = sets.length > 0 ? sets[sets.length - 1].set : 1;

    // セットタブ
    const setTabsHtml = sets.map(s =>
      `<button class="mr-set-tab${s.set === lastSetNum ? ' active' : ''}"
        onclick="mrShowSet(${s.set})" data-set="${s.set}">
        第${s.set}セット
      </button>`
    ).join('');

    // 報酬行（通常試合のみ）
    let rewardsHtml = '';
    if (!isPractice) {
      const repSign = (result.repGain || 0) >= 0 ? '+' : '';
      const repCls  = (result.repGain || 0) >= 0 ? 'positive' : 'negative';
      rewardsHtml = `
        <div class="mr-rewards">
          ${result.repGain !== 0
            ? `<div class="matchresult-chip">評判P <span class="${repCls}">${repSign}${result.repGain}</span></div>`
            : ''}
          ${result.shopGain
            ? `<div class="matchresult-chip">ショップP <span class="positive">+${result.shopGain}</span></div>`
            : ''}
        </div>`;
    }

    // 成長セクション（通常試合かつ成長あり）
    let growthHtml = '';
    if (!isPractice && growth.length > 0) {
      const items = growth.map(g => {
        const statsHtml = Object.entries(g.stats)
          .map(([k, v]) => `<span class="mr-growth-stat">${PARAM_NAMES[k] || k} +${v}</span>`)
          .join('');
        return `
          <div class="mr-growth-player">
            <div class="mr-growth-name">${g.name}</div>
            <div class="mr-growth-stats">${statsHtml}</div>
          </div>`;
      }).join('');
      growthHtml = `
        <div class="mr-section">
          <div class="mr-section-title">選手の成長</div>
          <div class="mr-growth-list">${items}</div>
        </div>`;
    }

    el.style.padding = '0';
    el.style.overflow = 'hidden';
    el.innerHTML = `
      <div class="mr-screen">
        <div class="mr-body">
          <div class="mr-header ${isWin ? 'win' : 'lose'}">
            <div class="mr-match-name">${result.matchName || '試合'}</div>
            <div class="mr-verdict">${isWin ? '勝利' : '敗北'}</div>
            <div class="mr-score-row">
              <span class="mr-team-name">${ownName}</span>
              <span class="mr-sets">${result.setsA} - ${result.setsB}</span>
              <span class="mr-team-name">${oppName}</span>
            </div>
            <div class="mr-set-scores">${setDetail}</div>
          </div>
          ${rewardsHtml}
          <div class="mr-section">
            <div class="mr-set-tabs" id="mr-set-tabs">${setTabsHtml}</div>
            <div class="mr-log-area" id="mr-log-area"></div>
          </div>
          ${growthHtml}
        </div>
        <div class="mr-footer">
          <button class="mr-next-btn" id="mr-next-btn">次へ</button>
        </div>
      </div>`;

    window._mrSets = sets;
    mrShowSet(lastSetNum);
    document.getElementById('mr-next-btn').addEventListener('click', complete);
  }

  window.mrShowSet = function(setNum) {
    document.querySelectorAll('.mr-set-tab').forEach(t =>
      t.classList.toggle('active', parseInt(t.dataset.set) === setNum)
    );
    const logArea = document.getElementById('mr-log-area');
    if (!logArea) return;
    const setData = (window._mrSets || []).find(s => s.set === setNum);
    if (!setData || setData.logs.length === 0) {
      logArea.innerHTML = '<div class="mr-no-log">ログなし</div>';
      return;
    }
    logArea.innerHTML = setData.logs.map(point => {
      const [, detail, suffix] = generateLog(point);
      const headerText = `${point.teamName} 得点！（${point.scoreA} - ${point.scoreB}）`;
      const teamClass = point.teamIsA ? 'team-a' : 'team-b';
      const spClass   = point.isSetPoint   ? 'is-set-point'   : '';
      const mpClass   = point.isMatchPoint ? 'is-match-point' : '';
      const sufClass  = point.isMatchPoint ? 'is-match-point' : point.isSetPoint ? 'is-set-point' : '';
      return `
        <div class="matchlog-point-card ${teamClass} ${spClass} ${mpClass}">
          <div class="matchlog-point-header-line">
            <span class="matchlog-header-text">${headerText}</span>
            ${suffix ? `<span class="matchlog-suffix ${sufClass}">${suffix}</span>` : ''}
          </div>
          <div class="matchlog-point-detail">${detail}</div>
        </div>`;
    }).join('');
    logArea.scrollTop = 0;
  };

  function advance() {
    if (pointIdx >= allPoints.length) {
      // 試合終了 → 少し待ってから結果画面へ
      timerId = setTimeout(showResult, 1000);
      return;
    }

    const point = allPoints[pointIdx];

    // セット切り替え
    if (point.setNum !== currentSetNum) {
      if (currentSetNum > 0) {
        // 前のセット終了表示
        showSetEnd(currentSetNum);
        const nextSetNum = point.setNum;
        currentSetNum = nextSetNum;
        // ノーマルに戻す
        speedMs = 1000;
        setActiveBtn('ml-btn-normal');
        const setLabel = document.getElementById('ml-set-label');
        timerId = setTimeout(() => {
          if (setLabel) setLabel.textContent = `第${currentSetNum}セット`;
          advance();
        }, 900);
        return;
      }
      currentSetNum = point.setNum;
      const setLabel = document.getElementById('ml-set-label');
      if (setLabel) setLabel.textContent = `第${currentSetNum}セット`;
    }

    displayPoint(point);
    pointIdx++;
    timerId = setTimeout(advance, speedMs);
  }

  // ===== ボタンハンドラ =====

  document.getElementById('ml-btn-normal').addEventListener('click', () => {
    speedMs = 1000;
    setActiveBtn('ml-btn-normal');
    clearTimeout(timerId);
    advance();
  });

  document.getElementById('ml-btn-fast').addEventListener('click', () => {
    speedMs = 300;
    setActiveBtn('ml-btn-fast');
    clearTimeout(timerId);
    advance();
  });

  document.getElementById('ml-btn-skip-set').addEventListener('click', () => {
    clearTimeout(timerId);

    if (currentSetNum === 0 || pointIdx >= allPoints.length) {
      advance();
      return;
    }

    // 現在のセットをスキップして最後の点まで飛ばす
    while (pointIdx < allPoints.length && allPoints[pointIdx].setNum === currentSetNum) {
      pointIdx++;
    }

    if (pointIdx >= allPoints.length) {
      // 試合終了
      showSetEnd(currentSetNum);
      timerId = setTimeout(showResult, 900);
      return;
    }

    // セット終了表示してから次セットへ
    showSetEnd(currentSetNum);
    const nextSetNum = allPoints[pointIdx].setNum;
    currentSetNum = nextSetNum;
    speedMs = 1000;
    setActiveBtn('ml-btn-normal');
    const setLabel = document.getElementById('ml-set-label');
    timerId = setTimeout(() => {
      if (setLabel) setLabel.textContent = `第${currentSetNum}セット`;
      advance();
    }, 900);
  });

  document.getElementById('ml-btn-skip-match').addEventListener('click', () => {
    showResult();
  });

  // スタート
  advance();
}
