// ============================================================
// supabase.js - Supabase クライアント + 認証 + DB操作
// ============================================================
// SupabaseプロジェクトURLとAnon Keyを設定してください
// Supabaseダッシュボード → Project Settings → API から取得
// ============================================================

const SUPABASE_URL = 'https://nktkbutqoldhtgtreucq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5rdGtidXRxb2xkaHRndHJldWNxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYyNTY3MjQsImV4cCI6MjA5MTgzMjcyNH0.pa4VRNEbl1zt-mtGXJ4wGwu5t_8NDNoA6hLApaoEYSQ';

const _supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==============================
// 認証
// ==============================

/** メールアドレスとパスワードで新規登録 */
async function signUp(email, password) {
  const { data, error } = await _supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

/** メールアドレスとパスワードでログイン */
async function signIn(email, password) {
  const { data, error } = await _supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

/** ログアウト */
async function signOut() {
  const { error } = await _supabase.auth.signOut();
  if (error) console.error('signOut error:', error);
}

/** 現在のセッションを取得（未ログインならnull） */
async function getSession() {
  const { data, error } = await _supabase.auth.getSession();
  if (error) return null;
  return data.session || null;
}

/** 現在ログイン中のユーザーIDを取得 */
async function getCurrentUserId() {
  const session = await getSession();
  return session ? session.user.id : null;
}

// ==============================
// セーブデータ操作
// ==============================

/**
 * Supabaseからセーブデータを読み込む
 * @returns {Object|null} game_state オブジェクト、なければnull
 */
async function loadFromDB(userId = null) {
  const uid = userId || await getCurrentUserId();
  if (!uid) return null;

  const { data, error } = await _supabase
    .from('game_saves')
    .select('game_state')
    .eq('user_id', uid)
    .maybeSingle();

  if (error) {
    console.error('loadFromDB error:', error.message);
    return null;
  }
  return data ? data.game_state : null;
}

/**
 * Supabaseへセーブデータを書き込む（upsert）
 * fire-and-forgetで呼ぶこと（awaitしない）
 * @param {Object} state - ゲーム状態オブジェクト
 */
async function saveToDB(state) {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const { error } = await _supabase
    .from('game_saves')
    .upsert(
      { user_id: userId, game_state: state },
      { onConflict: 'user_id' }
    );

  if (error) {
    console.error('saveToDB error:', error.message);
  }
}

/**
 * Supabaseのセーブデータを削除する
 */
async function deleteSaveFromDB() {
  const userId = await getCurrentUserId();
  if (!userId) return;

  const { error } = await _supabase
    .from('game_saves')
    .delete()
    .eq('user_id', userId);

  if (error) {
    console.error('deleteSaveFromDB error:', error.message);
  }
}

// ==============================
// 練習試合 DB操作
// ==============================

async function savePracticeMatch(record) {
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await _supabase
    .from('practice_matches')
    .insert({ user_id: userId, ...record });
  if (error) throw error;
}

/** 部屋を作る: 部屋コード付きでプールに待機エントリを挿入 */
async function createRoom(snapshot) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('未ログイン');

  // 自分の既存エントリを削除
  await _supabase.from('online_match_pool')
    .delete().eq('user_id', userId).eq('matched', false);

  const roomCode = String(Math.floor(100000 + Math.random() * 900000));

  const { data, error } = await _supabase
    .from('online_match_pool')
    .insert({
      user_id:       userId,
      school_name:   snapshot.school_name,
      reputation:    snapshot.reputation,
      team_snapshot: snapshot,
      room_code:     roomCode,
    })
    .select('id').single();
  if (error) throw error;
  return { poolEntryId: data.id, roomCode };
}

/** 部屋を探す: 部屋コードでマッチ成立させる */
async function joinRoomByCode(code, snapshot) {
  const userId = await getCurrentUserId();
  if (!userId) throw new Error('未ログイン');

  // 部屋コードで待機中エントリを検索
  const { data: host, error: findError } = await _supabase
    .from('online_match_pool')
    .select('id, user_id, school_name, team_snapshot')
    .eq('room_code', code)
    .eq('matched', false)
    .neq('user_id', userId)
    .maybeSingle();

  if (findError) throw findError;
  if (!host) throw new Error('部屋が見つかりません。部屋番号を確認してください。');

  // マッチ成立: online_matchesにレコードを作成
  const { data: match, error: matchError } = await _supabase
    .from('online_matches')
    .insert({
      player_a_id: host.user_id,
      player_b_id: userId,
      school_a:    host.school_name,
      school_b:    snapshot.school_name,
    })
    .select('id').single();
  if (matchError) throw matchError;

  // ホスト側のエントリを matched に更新
  await _supabase.from('online_match_pool')
    .update({ matched: true, match_id: match.id })
    .eq('id', host.id);

  // 自分のエントリを matched で挿入
  const { data: myEntry, error: myError } = await _supabase
    .from('online_match_pool')
    .insert({
      user_id:       userId,
      school_name:   snapshot.school_name,
      reputation:    snapshot.reputation,
      team_snapshot: snapshot,
      matched:       true,
      match_id:      match.id,
    })
    .select('id').single();
  if (myError) throw myError;

  return {
    poolEntryId: myEntry.id,
    immediateOpponent: {
      team_snapshot: host.team_snapshot,
      school_name:   host.school_name,
    },
  };
}

async function pollForMatch(poolEntryId) {
  const { data, error } = await _supabase
    .from('online_match_pool')
    .select('matched, match_id')
    .eq('id', poolEntryId)
    .single();
  if (error) throw error;
  return data;
}

async function getOnlineOpponentSnapshot(matchId, myUserId) {
  const { data, error } = await _supabase
    .from('online_match_pool')
    .select('team_snapshot, school_name')
    .eq('match_id', matchId)
    .neq('user_id', myUserId)
    .single();
  if (error) throw error;
  return data;
}

async function leaveOnlinePool(poolEntryId) {
  if (!poolEntryId) return;
  await _supabase.from('online_match_pool').delete().eq('id', poolEntryId);
}

// ==============================
// 認証状態の変更を監視
// ==============================
_supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    // ログアウト時はローカルストレージもクリア
    localStorage.removeItem('volleyball_game_save');
  }
});
