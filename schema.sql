-- D1 数据库建表脚本（词书 / 单词 / 学习状态 模型）
-- 运行: npx wrangler d1 execute vocab-db --file=./schema.sql --remote
-- 之后再运行: npx wrangler d1 execute vocab-db --file=./scripts/seed.sql --remote

-- 用户
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'member',          -- member | admin
  created_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);

-- 词书（系统内置 + 用户自建）
CREATE TABLE IF NOT EXISTS books (
  slug TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  cover TEXT DEFAULT '',
  is_public INTEGER DEFAULT 1,
  owner_id INTEGER,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 单词
CREATE TABLE IF NOT EXISTS words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  book_slug TEXT NOT NULL,
  slug TEXT NOT NULL,
  word TEXT NOT NULL,
  pos TEXT DEFAULT '',
  phonetic_us TEXT DEFAULT '',
  phonetic_uk TEXT DEFAULT '',
  meaning TEXT DEFAULT '',
  example TEXT DEFAULT '',
  UNIQUE(book_slug, slug),
  FOREIGN KEY (book_slug) REFERENCES books(slug) ON DELETE CASCADE
);

-- 用户单词状态（new 未掌握 / learning 模糊 / mastered 已掌握）
CREATE TABLE IF NOT EXISTS user_word_status (
  user_id INTEGER NOT NULL,
  word_slug TEXT NOT NULL,
  status TEXT DEFAULT 'new',
  updated_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, word_slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 用户收藏/订阅的词书
CREATE TABLE IF NOT EXISTS user_books (
  user_id INTEGER NOT NULL,
  book_slug TEXT NOT NULL,
  PRIMARY KEY (user_id, book_slug),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (book_slug) REFERENCES books(slug) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_words_book ON words(book_slug);
CREATE INDEX IF NOT EXISTS idx_status_user ON user_word_status(user_id);
CREATE INDEX IF NOT EXISTS idx_status_word ON user_word_status(word_slug);

-- 系统配置（管理后台可编辑的站点设置）
CREATE TABLE IF NOT EXISTS sys_config (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by INTEGER
);

-- 默认配置项
INSERT OR IGNORE INTO sys_config (key, value) VALUES
  ('site_name', '单词书库'),
  ('allow_register', '1'),         -- 1=允许注册 0=关闭注册
  ('maintenance_mode', '0'),       -- 1=维护模式(仅管理员可访问) 0=正常
  ('guest_browse', '1'),           -- 1=允许游客浏览 0=必须登录
  ('announcement', '');            -- 公告文本(空=不显示)

-- 默认管理员 (用户名: admin, 密码: admin123)
INSERT OR IGNORE INTO users (username, email, password_hash, role) VALUES
  ('admin', 'admin@vocab.local', 'bz69R7DWRysZbI0_YJjXeg:YlJeDRDk5XfNNKYOaoF71XwHujNMKMm53y8gxB-1HG0', 'admin');
