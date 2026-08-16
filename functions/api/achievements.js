// GET /api/achievements
// 返回用户成就列表
import { requireAuth, json } from '../_lib/auth.js';

const ACHIEVEMENTS = [
  { type: 'first_login', name: '初次登录', description: '首次登录系统', icon: '🎉', condition: (stats) => stats.totalLogins >= 1 },
  { type: 'master_10', name: '初出茅庐', description: '掌握10个单词', icon: '📚', condition: (stats) => stats.masteredWords >= 10 },
  { type: 'master_50', name: '学海无涯', description: '掌握50个单词', icon: '📖', condition: (stats) => stats.masteredWords >= 50 },
  { type: 'master_100', name: '胸有成竹', description: '掌握100个单词', icon: '🏆', condition: (stats) => stats.masteredWords >= 100 },
  { type: 'master_500', name: '博学多才', description: '掌握500个单词', icon: '🎓', condition: (stats) => stats.masteredWords >= 500 },
  { type: 'master_1000', name: '学富五车', description: '掌握1000个单词', icon: '👑', condition: (stats) => stats.masteredWords >= 1000 },
  { type: 'streak_7', name: '持之以恒', description: '连续学习7天', icon: '🔥', condition: (stats) => stats.currentStreak >= 7 },
  { type: 'streak_30', name: '坚持不懈', description: '连续学习30天', icon: '⚡', condition: (stats) => stats.currentStreak >= 30 },
  { type: 'quiz_master', name: '测验达人', description: '完成一次测验满分', icon: '✅', condition: (stats) => stats.quizPerfect >= 1 },
  { type: 'spell_master', name: '拼写高手', description: '完成一次拼写满分', icon: '✍️', condition: (stats) => stats.spellPerfect >= 1 },
];

export async function onRequestGet({ request, env }) {
  const user = await requireAuth(request, env);
  if (!user) return json({ error: '未登录' }, 401);

  const db = env.DB;

  // 获取统计信息
  const masteredCount = await db.prepare(
    'SELECT COUNT(*) as count FROM user_word_status WHERE user_id = ? AND status = \'mastered\''
  ).bind(user.id).first();

  const streakResult = await db.prepare(
    "SELECT COUNT(DISTINCT DATE(updated_at)) as count FROM user_word_status WHERE user_id = ? AND updated_at >= date('now', '-30 days')"
  ).bind(user.id).first();

  // 构建统计数据
  const stats = {
    totalLogins: 1, // 简化处理，实际应该从登录日志计算
    masteredWords: masteredCount?.count || 0,
    currentStreak: 0, // 计算连续天数需要更复杂的逻辑
    quizPerfect: 0,
    spellPerfect: 0,
  };

  // 计算连续天数
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
  stats.currentStreak = streak;

  // 获取已解锁的成就
  const unlocked = await db.prepare(
    'SELECT type, unlocked_at FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC'
  ).bind(user.id).all();

  const unlockedTypes = new Set(unlocked.results?.map(r => r.type) || []);

  // 检查新成就
  const achievements = ACHIEVEMENTS.map(a => ({
    ...a,
    unlocked: unlockedTypes.has(a.type),
    unlocked_at: unlocked.find(u => u.type === a.type)?.unlocked_at,
  }));

  // 自动解锁未解锁但满足条件的成就
  for (const achievement of achievements) {
    if (!achievement.unlocked && achievement.condition(stats)) {
      await db.prepare(
        'INSERT INTO achievements (user_id, type, name, description) VALUES (?, ?, ?, ?)'
      ).bind(user.id, achievement.type, achievement.name, achievement.description).run();
      achievement.unlocked = true;
      achievement.unlocked_at = new Date().toISOString();
    }
  }

  return json({ ok: true, achievements });
}
