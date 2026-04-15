// ============================================================
// config.js - ゲームロジック定数
// アイテム・設備・練習メニュー・スケジュールは data/*.json に分離
// ============================================================

// ポジション
const POSITIONS = ['OH', 'MB', 'OP', 'Se', 'Li'];
const POSITION_NAMES = { OH: 'アウトサイドヒッター', MB: 'ミドルブロッカー', OP: 'オポジット', Se: 'セッター', Li: 'リベロ' };

// 各ポジションで伸びやすいパラメータ
const POSITION_GROWTH_PARAMS = {
  OH: ['spike', 'power', 'serve'],
  MB: ['spike', 'block', 'speed'],
  OP: ['spike', 'receive', 'serve'],
  Se: ['receive', 'toss', 'technique'],
  Li: ['receive', 'technique', 'speed'],
};

// パラメータ
const PARAM_KEYS = ['spike', 'receive', 'block', 'serve', 'toss', 'power', 'speed', 'technique', 'stamina'];
const PARAM_NAMES = {
  spike: 'スパイク', receive: 'レシーブ', block: 'ブロック', serve: 'サーブ',
  toss: 'トス', power: 'パワー', speed: 'スピード', technique: 'テクニック', stamina: 'スタミナ'
};

// 評判
const REPUTATIONS = ['弱小', '普通', '強豪', '名門', 'プロ養成校'];
const REPUTATION_THRESHOLDS = [0, 50, 150, 300, 500];
const REPUTATION_COLORS = ['#888', '#4CAF50', '#2196F3', '#FF9800', '#E91E63'];

// 格下負けペナルティ倍率
const REP_POINTS_LOSS_PENALTY = 1.5;

// 練習効率ボーナス値
const EFFICIENCY_BONUS = {
  efficiency_small:  0.15,
  efficiency_medium: 0.3,
};

// スタミナ回復量
const STAMINA_RECOVERY = {
  stamina_small:  15,
  stamina_medium: 30,
  stamina_all:    40,
};

// ==============================
// 選手名プール
// ==============================
const LAST_NAMES = [
  '田中','鈴木','佐藤','高橋','伊藤','渡辺','山本','中村','小林','加藤',
  '吉田','山田','佐々木','山口','松本','井上','木村','林','清水','山崎',
  '阿部','池田','橋本','斎藤','石川','前田','後藤','岡田','長谷川','村田',
  '近藤','藤田','坂本','遠藤','青木','福田','三浦','西村','藤井','岩崎',
];
const FIRST_NAMES = [
  '翔','大輝','蓮','颯太','悠','拓海','俊介','健太','雄大','誠',
  '陸','航','智也','和也','剛','亮','純','豊','隆','力',
  '颯','碧','湊','蒼','陽翔','大和','悠真','晴人','凌','昂',
  '虎太郎','一輝','優斗','裕太','竜也','修','浩','哲','貴','義',
];

// ==============================
// スカウト選手ランク
// ==============================
const SCOUT_RANK_WEIGHTS = [
  [60, 30, 10,  0,  0],  // 弱小
  [40, 35, 20,  5,  0],  // 普通
  [20, 30, 35, 15,  0],  // 強豪
  [ 5, 20, 35, 30, 10],  // 名門
  [ 0,  5, 25, 40, 30],  // プロ養成校
];
const SCOUT_RANK_BASE = [25, 35, 45, 55, 65];

// 対戦相手の強さベース (tournament × round)
const OPPONENT_STRENGTH = {
  prefectural:  [30, 40, 50],
  interhigh:    [45, 55, 65],
  spring_prelim:[40, 50, 60],
  spring:       [60, 70, 80],
};

// ==============================
// JSONから読み込むマスターデータ（起動時にloadMasterData()で設定される）
// ==============================
let ITEMS           = [];
let FACILITIES      = [];
let PRACTICE_MENUS  = [];
let PRACTICE_GROWTH = {};
let MINIGAME_GROWTH = 1;
let MATCH_SCHEDULE  = {};
let TOURNAMENT_NAMES = {};
let REP_POINTS_WIN  = {};
let MATCH_POINTS_WIN = {};
let MONTHS          = [];
let MONTH_NAMES     = {};

/**
 * data/*.json を並列fetchしてグローバル変数に代入する
 * main.js の initGame() でawaitして呼ぶ
 */
async function loadMasterData() {
  const base = getBasePath();

  const [itemsData, menusData, scheduleData] = await Promise.all([
    fetch(`${base}data/items.json`).then(r => r.json()),
    fetch(`${base}data/practice_menus.json`).then(r => r.json()),
    fetch(`${base}data/schedule.json`).then(r => r.json()),
  ]);

  // アイテム・設備
  ITEMS      = itemsData.items;
  FACILITIES = itemsData.facilities;

  // 練習メニュー
  PRACTICE_MENUS  = menusData.menus;
  PRACTICE_GROWTH = menusData.growth;    // { "1": 2, "2": 4, "3": 6 }
  MINIGAME_GROWTH = menusData.minigameGrowth;

  // スケジュール・トーナメント
  MATCH_SCHEDULE   = scheduleData.matchSchedule;   // キーは文字列 "8" など
  TOURNAMENT_NAMES = scheduleData.tournamentNames;
  REP_POINTS_WIN   = scheduleData.repPointsWin;
  MATCH_POINTS_WIN = scheduleData.matchPointsWin;
  MONTHS           = scheduleData.months;
  MONTH_NAMES      = scheduleData.monthNames;
}

/**
 * GitHub Pages / ローカルどちらでも動くベースパスを返す
 */
function getBasePath() {
  // ファイルを直接開いた場合 (file://) はそのまま
  // GitHub Pages などHTTPSの場合はorigin+pathnameのディレクトリ部分
  const loc = window.location;
  if (loc.protocol === 'file:') return './';
  const path = loc.pathname.replace(/\/[^/]*$/, '/');
  return `${loc.origin}${path}`;
}
