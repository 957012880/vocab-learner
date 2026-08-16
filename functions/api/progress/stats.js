// GET /api/progress/stats
// 返回用户学习统计数据
import { requireAuth, json } from '../../_lib/auth.js';

export async function onRequestGet({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  const db = env.DB;

  // 已掌握词数
  const masteredCount = await db.prepare(
    'SELECT COUNT(*) as count FROM user_word_status WHERE user_id = ? AND status = \'mastered\''
  ).bind(user.id).first();

  // 今日掌握词数
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayMastered = await db.prepare(
    'SELECT COUNT(*) as count FROM user_word_status WHERE user_id = ? AND status = \'mastered\' AND updated_at >= ?'
  ).bind(user.id, todayStart.toISOString()).first();

  // 总学习天数（有学习记录的日期数）
  const totalDays = await db.prepare(
    'SELECT COUNT(DISTINCT DATE(updated_at)) as count FROM user_word_status WHERE user_id = ?'
  ).bind(user.id).first();

  // 连续学习天数（streak）
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < 365; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayRecord = await db.prepare(
      "SELECT COUNT(*) as count FROM user_word_status WHERE user_id = ? AND DATE(updated_at) = ?"
    ).bind(user.id, dateStr).first();
    if (dayRecord && dayRecord.count > 0) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }

  // 本周学习记录（最近7天）
  const thisWeek = await db.prepare(
    "SELECT COUNT(*) as count FROM user_word_status WHERE user_id = ? AND updated_at >= date('now', '-6 days')"
  ).bind(user.id).first();

  return json({
    ok: true,
    stats: {
      masteredWords: masteredCount?.count || 0,
      todayMastered: todayMastered?.count || 0,
      totalDays: totalDays?.count || 0,
      currentStreak: streak,
      thisWeek: thisWeek?.count || 0,
    }
  });
}
