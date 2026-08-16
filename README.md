# 单词书库 · Vocab Learner

一个部署在 **Cloudflare Pages** 上的单词学习应用，采用「**词书库**」模型——内置来自 [remix-words-funny](https://github.com/SteveSuv/remix-words-funny)（约 15 万词）的 81 本词书，也支持用户自己导入单词。

学习逻辑参照 remix-words-funny：默认**隐藏释义**，点击展开；可标记「已掌握」；以「全部 / 已掌握 / 未掌握」组织，未掌握清空即代表掌握整本书。

## 核心功能

- 📚 **词书库浏览** — 81 本内置词书（CET4/6、考研、雅思、托福、GRE、中小学课本等），卡片展示词数 / 已掌握进度
- 👁️ **点击看释义** — 单词默认只显示拼写，点一下展开音标 / 释义 / 例句，可一键朗读
- 📝 **选择题测试** — 给出单词 + 音标，从 4 个释义中选出正确项，即时反馈、自动计分
- ⌨️ **拼写练习** — 给出中文释义 + 音标，听发音后拼写单词，回车提交即时校验
- ✅ **标记已掌握** — 点「标记掌握」，进度自动追踪；「未掌握」清零即掌握整本书
- 🏁 **练习结算** — 两种模式结束都可「把答对的词标记为已掌握」，进度即时回写
- 📊 **学习进度** — 全部 / 已掌握 / 未掌握 三个视图切换，实时进度条
- 📥 **自建词书** — 登录后可导入自己的单词（JSON 或 CSV，单次上限 2000 词）
- 👤 **注册登录** — 账号系统（JWT + PBKDF2 加密，无第三方依赖）
- 👥 **会员管理** — 管理员可查看所有会员的学习统计
- 🧑‍💻 **游客模式** — 无需登录即可浏览词书，「已掌握」进度暂存浏览器本地

数据层使用 **Cloudflare D1**（SQLite 数据库，免费额度足够个人使用）。后端用 **Pages Functions**（无需另启服务器）。

---

## 一、本地开发 / 预览

### 1. 安装依赖
```bash
npm install
```

### 2. 准备本地 D1 数据库（建表 + 灌入词库）
```bash
# 建表
npx wrangler d1 execute vocab-db --file=./schema.sql --local
# 灌入词库（见下文「导入词库」生成的 scripts/seed.sql）
npx wrangler d1 execute vocab-db --file=./scripts/seed.sql --local
```

### 3. 启动本地服务
```bash
npm run dev
# 等价于 npx wrangler pages dev public --local --d1 DB
```
打开 http://localhost:8788 即可预览。游客模式下进度保存在浏览器 localStorage；登录后进度存到云端 D1，多端同步。

---

## 二、导入词库（remix-words-funny 的 15 万词）

词库数据来自 `kajweb/dict`（remix-words-funny 的词书源，共 81 本 `.zip`）。脚本 `scripts/import-words.mjs` 会抓取词书清单与每个 zip，解析为 `books` + `words` 两张表，输出 `scripts/seed.sql`。

> 该脚本已内置 curl 重试与超时策略，对大文件更稳定。需要可访问 `raw.githubusercontent.com` 的网络环境。

```bash
# 方式 A：联网直接导入全部 81 本（脚本会自动下载并解析）
node scripts/import-words.mjs

# 方式 B：先手动把 zip 放到 scripts/.tmp/，再纯本地解析（无需联网）
node scripts/import-words.mjs --local

# 调试 / 测试：只处理前 5 本，或只处理某一本
node scripts/import-words.mjs --limit 5
node scripts/import-words.mjs --slug CET4_1
```

生成的 `scripts/seed.sql` 形如：
```sql
INSERT OR IGNORE INTO books (slug, name, cover, is_public, owner_id) VALUES
('CET4_1','四级真题核心词（正序版）','https://.../CET4_1.jpg',1,NULL);
INSERT OR IGNORE INTO words (book_slug, slug, word, phonetic_us, phonetic_uk, meaning, example) VALUES
('CET4_1','CET4_1_1','abruptly','ə''brʌptli',...,'[adv] 突然地','The path ends off abruptly.  这条路突然到头了。');
```

导入 D1：

> ⚠️ `scripts/seed.sql` 约 **31 MB / 15 万行**，单次 `wrangler d1 execute --file` 极易因体积过大超时或报错。**推荐用分片导入**（仓库已预生成 `scripts/seed_parts/*.sql`，每片约 3 MB）：

```bash
# 本地
npm run db:seed:local
# 或远程（推荐，分片逐片执行）
npm run db:seed:parts        # node scripts/seed-parts.cjs，依次执行 seed_parts 下全部分片

# 如果你改过词库、想重新生成分片：
node scripts/split-seed.cjs  # 把 scripts/seed.sql 切回 scripts/seed_parts/
```

如坚持用单文件（不推荐）：
```bash
npx wrangler d1 execute vocab-db --file=./scripts/seed.sql --local
npx wrangler d1 execute vocab-db --file=./scripts/seed.sql --remote
```

---

## 三、部署到 Cloudflare Pages

### 第 1 步：准备代码仓库
把整个项目推送到 GitHub / GitLab（Cloudflare Pages 推荐从 Git 仓库部署）。

### 第 2 步：创建 D1 数据库
```bash
npx wrangler d1 create vocab-db
```
命令会输出一个 `database_id`，复制下来。

### 第 3 步：修改配置
编辑 `wrangler.toml`：
```toml
[[d1_databases]]
binding = "DB"
database_name = "vocab-db"
database_id = "这里替换为你的 database_id"
```
> 同时把 `[vars] JWT_SECRET` 改成一个随机长字符串（或下一步用 secret 设置）。

### 第 4 步：设置 JWT 密钥（推荐用 secret，更安全）
```bash
npx wrangler pages secret put JWT_SECRET
# 然后输入一个随机长字符串，例如：openssl rand -hex 32
```

### 第 5 步：初始化远程数据库表 + 灌词库
```bash
# 建表（含管理员账号 admin / admin123）
npx wrangler d1 execute vocab-db --file=./schema.sql --remote
# 灌入 15 万词库（分片导入，约 12 片，逐片执行）
npm run db:seed:parts
```

### 第 6 步：部署
**方式 A — 命令行：**
```bash
npm run deploy
# 等价于 npx wrangler pages deploy public
```

**方式 B — Git 连接（推荐，支持自动更新）：**
1. 登录 Cloudflare 控制台 → Pages → 创建项目 → 连接 Git 仓库
2. 构建命令：`npx wrangler pages deploy public --commit-dirty=true`
3. 构建输出目录：`public`
4. 在「设置 → 函数 → D1 数据库绑定」中添加绑定：`DB` → `vocab-db`
5. 在「设置 → 环境变量」中添加 `JWT_SECRET`
6. 保存并触发部署

### 第 7 步：管理员账号
`schema.sql` 已预置管理员 `admin`，默认密码 `admin123`（首次登录后请自行修改或重新建管理员账号）。
普通会员在「会员管理」标签页不可见；管理员登录后可查看所有会员的学习统计。

---

## 四、项目结构

```
.
├── public/                  # 前端静态文件（直接由 Pages 托管）
│   ├── index.html           # 单页：欢迎 / 词书库 / 词书详情 / 弹窗
│   ├── css/style.css
│   └── js/
│       ├── api.js           # API 客户端（JWT 鉴权 + 各接口封装）
│       └── app.js           # 主交互逻辑（词书/翻卡/标记/导入/认证）
├── functions/               # Cloudflare Pages Functions（后端 API）
│   ├── _lib/auth.js         # JWT / PBKDF2 密码哈希 / 鉴权（共享库，不暴露为路由）
│   ├── api/auth/            # 注册 / 登录 / 当前用户
│   ├── api/books/           # 词书列表 / 词书单词(分页) / 用户自建导入
│   ├── api/words/[slug]/    # 单词学习状态（标记已掌握等）
│   ├── api/progress/        # 当前用户全局学习统计
│   └── api/admin/           # 会员管理（仅管理员）
├── scripts/
│   ├── import-words.mjs     # 从 kajweb/dict 抓取并生成 seed.sql
│   ├── split-seed.cjs       # 把 seed.sql 切成 seed_parts/ 下的分片（规避大文件超时）
│   ├── seed-parts.cjs       # 顺序执行 seed_parts/ 下全部分片导入 D1
│   ├── seed.sql             # 词库种子数据（31MB，由 import-words.mjs 生成）
│   └── seed_parts/          # 切好的分片（已生成，可直接导入）
├── schema.sql               # D1 建表脚本（users / books / words / user_word_status / user_books）
├── wrangler.toml            # 本地开发 + D1 绑定配置
└── package.json
```

### 数据模型
```
users (id, username, email, password_hash, role)
books (slug, name, cover, is_public, owner_id)          -- 词书（系统内置 + 用户自建）
words (id, book_slug, slug, word, pos, phonetic_us, phonetic_uk, meaning, example)
user_word_status (user_id, word_slug, status)           -- new | learning | mastered
user_books (user_id, book_slug)                         -- 用户订阅/收藏的词书
```

---

## 五、常见问题

**Q：游客模式能用吗？**
能。游客模式下「已掌握」进度用浏览器 localStorage 保存，刷新不丢失，但换设备/清缓存会丢失。登录后进度存到云端 D1，多端同步。

**Q：内置词库不够用，怎么加自己的词？**
登录后点「＋ 导入我的单词」，粘贴 JSON 或 CSV：
- JSON：`[{"word":"apple","meaning":"苹果","phonetic":"/ˈæpl/","example":"I eat an apple."}, ...]`
- CSV（首行写标题）：`word,meaning,phonetic,example` 然后逐行填。

单次最多 2000 个单词，导入后生成一本仅自己可见的私有词书。

**Q：如何重新生成/更新词库？**
修改或重跑 `scripts/import-words.mjs` 生成新的 `scripts/seed.sql`，再执行 `wrangler d1 execute vocab-db --file=./scripts/seed.sql --remote`（注意：使用 `INSERT OR IGNORE`，不会覆盖已有的用户自建数据与学习状态）。

**Q：D1 数据怎么备份？**
```bash
npx wrangler d1 export vocab-db --remote --output ./backup.sql
```

**Q：部署后访问变慢/打不开？**
Pages Functions 在「冷启动」时首次请求会稍慢（几秒）。D1 在免费额度内足够用。

---

## 六、费用说明

Cloudflare Pages + D1 对个人项目均有免费额度，正常学习使用基本零成本。

---

## 七、管理后台与用户管理

管理员登录后，导航栏会出现「管理后台」入口（或直接访问 `/admin/`），可进行用户管理：

- **用户列表**：ID、用户名、邮箱、角色、已掌握词数、注册/登录时间。
- **新增用户**：填写用户名、邮箱、密码、角色（会员/管理员）。
- **重置密码**：为任意用户设置新密码（无需知道旧密码）。
- **删除用户**：删除用户及其学习进度；禁止删除自己、禁止删除最后一个管理员。

管理员账号：用户名 `admin`，密码 `admin123`（部署后请尽快在后台改密）。

后端接口（均要求 `admin` 角色）：
- `GET  /api/admin/members` — 列表
- `POST /api/admin/members` — 新增 `{username,email,password,role}`
- `DELETE /api/admin/members/:id` — 删除
- `POST /api/admin/members/:id/reset-password` — 重置密码 `{password}`

---

## 八、开启 Cloudflare Turnstile 人机验证（登录/注册防刷）

默认未开启，登录/注册无需验证即可使用。如需开启：

1. 在 Cloudflare 控制台 → **Turnstile** → 创建 Widget，得到 **Site Key** 与 **Secret Key**。
   （Widget 的 Domains 里加上你的站点域名，如 `vocab-learner.pages.dev`）
2. 注入密钥（需有 Pages:Edit 权限的 CF API Token）：
   ```bash
   npx wrangler pages secret put TURNSTILE_SITE_KEY --project-name vocab-learner
   npx wrangler pages secret put TURNSTILE_SECRET   --project-name vocab-learner
   ```
   按提示分别粘贴 Site Key 与 Secret Key。
3. 重新部署一次：
   ```bash
   npx wrangler pages deploy public
   ```

开启后：
- 登录/注册表单会出现 Turnstile 验证框，**必须完成验证才能提交**。
- 前端通过 `GET /api/config` 自动判断是否启用（无需改代码）。
- 未设置 `TURNSTILE_SECRET` 时自动放行，方便本地开发与灰度。

