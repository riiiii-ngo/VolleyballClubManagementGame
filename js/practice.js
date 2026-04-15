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

// 1週間の練習を実行
// state を直接変更し、ログを返す
function executePractice(state) {
  const logs = [];
  const efficiency = getPracticeEfficiency(state);

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

    const baseGrowth = menu.mini
      ? MINIGAME_GROWTH
      : PRACTICE_GROWTH[menu.tier] || 2;

    let groupLog = `グループ${gi + 1}【${menu.name}】`;
    const growResults = [];

    group.forEach(pid => {
      const player = getPlayer(state, pid);
      if (!player) return;

      // パラメータ成長
      applyParamGrowth(player, menu.params, baseGrowth, efficiency);

      // スタミナ消費（スタミナ自体も少し上げる場合、gymはstaminaを成長させる）
      if (menu.params.includes('stamina')) {
        // 筋トレやサーブレシーブ系はスタミナのmaxを少し上げる
        player.maxStamina = Math.min(100, player.maxStamina + 0.3);
      }
      consumeStamina(player, menu.staminaCost);

      growResults.push(player.name);
    });

    groupLog += ` → ${growResults.join('、')} が練習`;
    logs.push(groupLog);
  }

  // スタミナ少し自然回復（練習しないグループも）
  state.players.forEach(p => {
    recoverStaminaWeekly(p);
  });

  return logs;
}

// 試合週（練習なし）の週次処理
function executeRestWeek(state) {
  state.players.forEach(p => {
    // 試合週は回復多め
    p.currentStamina = Math.min(p.maxStamina, p.currentStamina + 5);
    p.params.stamina = p.currentStamina;
  });
}
