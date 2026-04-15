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
async function loadFromDB() {
  const userId = await getCurrentUserId();
  if (!userId) return null;

  const { data, error } = await _supabase
    .from('game_saves')
    .select('game_state')
    .eq('user_id', userId)
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
// 認証状態の変更を監視
// ==============================
_supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    // ログアウト時はローカルストレージもクリア
    localStorage.removeItem('volleyball_game_save');
  }
});
