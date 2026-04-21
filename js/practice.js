// ============================================================
// practice.js - 練習処理
// ============================================================

// 利用可能な練習メニュー一覧
function getAvailablePracticeMenus(reputation) {
  return PRACTICE_MENUS.filter(m => m.minRep <= reputation);
}

// 練習メニューIDから定義を取得
function getPracticeMenu(menuId) {
  return PRACTICE_MENUS.find(m => m.id === menuId) || null;
}

// 週次メニューを抽選してstateに保存する
// ・onAdvanceWeek / doYearEnd / 初回ロード時のみ呼ぶ（renderでは呼ばない）
function generateWeeklyMenus(state) {
  const available = getAvailablePracticeMenus(state.reputation);
  const count = Math.min(WEEKLY_MENU_COUNT, available.length);

  const shuffled = available.slice().sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, count);
  state.weeklyMenuIds = selected.map(m => m.id);

  // ボーナスメニューをランダムに1つ選ぶ
  const bonusIdx = Math.floor(Math.random() * selected.length);
  state.bonusMenuId = selected[bonusIdx].id;

  // 今週の選択肢から外れたグループ選択をクリア
  Object.keys(state.practiceSelections).forEach(gi => {
    if (!state.weeklyMenuIds.includes(state.practiceSelections[gi])) {
      delete state.practiceSelections[gi];
    }
  });
}

// 1週間の練習を実行
// state を直接変更し、ログと詳細な成長データを返す
function executePractice(state) {
  const logs = [];
  const results = []; // 成長詳細 [{name, key, diff}]
  const efficiency = getPracticeEfficiency(state);
  const injuryLogs = []; // ケガ通知は末尾にまとめて出す

  const groupCount = Math.min(state.practiceGroups.length, maxPracticeGroups(state.reputation));

  for (let gi = 0; gi < groupCount; gi++) {
    const menuId = state.practiceSelections[gi];
    const menu = menuId ? getPracticeMenu(menuId) : null;

    if (!menu) {
      logs.push(`グループ${gi + 1}：練習メニュー未設定`);
      continue;
    }

    const group = state.practiceGroups[gi];
    if (group.length === 0) {
      logs.push(`グループ${gi + 1}：選手なし`);
      continue;
    }

    const isBonus = menuId === state.bonusMenuId;
    const baseGrowth = (PRACTICE_GROWTH[menu.tier] || 2) * (isBonus ? BONUS_MULTIPLIER : 1);

    let groupLog = `グループ${gi + 1}【${menu.name}】`;
    const growResults = [];

    group.forEach(pid => {
      const player = getPlayer(state, pid);
      if (!player) return;

      // ── ケガ中の選手は完全スキップ ──
      if (player.isInjured) return;

      // 成長前の値を記録
      const before = { ...player.params };

      // ── 休憩判定 ──
      const isResting = state.restingPlayerIds && state.restingPlayerIds.includes(player.id);

      // ── 体力0での練習：ケガ判定（休憩中は除外）──
      if (!isResting && player.currentStamina <= 0) {
        if (Math.random() < 0.30) {
          const weeks = Math.floor(Math.random() * 6) + 3;
          player.isInjured = true;
          player.injuryRemainingWeeks = weeks;
          for (const slot of Object.keys(state.starters)) {
            if (state.starters[slot] === player.id) {
              state.starters[slot] = null;
            }
          }
          injuryLogs.push(`🩼 ${player.name} がケガをしました！（離脱 ${weeks}週間）`);
          return;
        }
      }
      
      if (isResting) {
        // 休憩中：成長なし、現在体力回復(+20、総体力上限)
        player.currentStamina = Math.min(player.params.stamina, player.currentStamina + 20);
      } else {
        // 練習参加：通常通り成長とスタミナ消費
        applyParamGrowth(player, menu.params, baseGrowth, efficiency);

        if (menu.params.includes('stamina')) {
          // スタミナ練習で総体力が増加
          player.params.stamina = Math.min(150, player.params.stamina + 0.3);
        }
        consumeStamina(player, menu.staminaCost);
      }

      // 成長後の差分を記録 (休憩中ならdiff=0になる)
      PARAM_KEYS.forEach(key => {
        if (key === 'stamina') return;
        const diff = player.params[key] - before[key];
        if (diff > 0) {
          results.push({
            name: player.name,
            key: key,
            diff: Math.round(diff * 10) / 10 // 小数点1位まで
          });
        }
      });

      growResults.push(player.name);
    });

    if (growResults.length > 0) {
      groupLog += ` → ${growResults.join('、')} が練習`;
    } else {
      groupLog += ` → 参加者なし`;
    }
    logs.push(groupLog);
  }

  // スタミナ自然回復
  state.players.forEach(p => {
    if (p.isInjured) {
      p.currentStamina = Math.min(p.params.stamina, p.currentStamina + 4);
    } else {
      recoverStaminaWeekly(p);
    }
  });

  logs.push(...injuryLogs);

  return { logs, results };
}

// 試合週（練習なし）の週次処理
function executeRestWeek(state) {
  state.players.forEach(p => {
    // 試合週は回復多め
    p.currentStamina = Math.min(p.params.stamina, p.currentStamina + 5);
  });
}
