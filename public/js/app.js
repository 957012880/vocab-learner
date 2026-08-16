// ============================================================
// 主交互逻辑 — 词书浏览 / 点击看释义 / 标记已掌握 / 用户导入
// 学习逻辑参照 remix-words-funny：默认隐藏释义，点击展开；标记已掌握；
// 以「全部 / 已掌握 / 未掌握」组织，未掌握清空即掌握整本书。
// ============================================================

const App = {
  isGuest: false,
  isAdmin: false,
  books: [],
  book: null,            // 当前词书 { slug, name, total, words:[...] }
  wordTab: 'all',        // all | mastered | unknown
  revealed: new Set(),   // 当前已展开释义的 word slug
  config: { siteName: '单词书库', allowRegister: true, maintenanceMode: false, guestBrowse: true, announcement: '' },
};

// ---------------- 全局错误提示（避免点击“毫无反应”却无提示） ----------------
function showErrorBanner(msg) {
  const b = document.getElementById('error-banner');
  if (!b) return;
  b.textContent = '⚠️ ' + msg;
  b.classList.remove('hidden');
  clearTimeout(b._timer);
  b._timer = setTimeout(() => b.classList.add('hidden'), 6000);
}
window.addEventListener('error', e => showErrorBanner((e.message || '脚本错误') + (e.filename ? ' @' + e.filename.split('/').pop() : '')));
window.addEventListener('unhandledrejection', e => showErrorBanner('请求异常：' + ((e.reason && e.reason.message) || e.reason || '未知错误')));

// ---------------- Cloudflare Turnstile 状态 ----------------
const TS = { enabled: false, siteKey: '', loginWidget: null, regWidget: null };

async function loadConfig() {
  try {
    const res = await API.config();
    if (res.ok) {
      TS.enabled = !!res.data.turnstileEnabled;
      TS.siteKey = String(res.data.turnstileSiteKey || '');
      console.log('[Turnstile] enabled:', TS.enabled, 'siteKey:', TS.siteKey, 'type:', typeof TS.siteKey);
      App.config = {
        siteName: res.data.siteName || '单词书库',
        allowRegister: res.data.allowRegister !== false,
        maintenanceMode: !!res.data.maintenanceMode,
        guestBrowse: res.data.guestBrowse !== false,
        announcement: res.data.announcement || '',
      };
      applyConfig();
    }
  } catch (e) {
    console.warn('[Turnstile] Config load failed:', e.message);
    TS.enabled = false;
  }
}

function renderTurnstile(tab) {
  if (!TS.enabled) {
    console.log('[Turnstile] Disabled, skipping render');
    return;
  }
  const key = tab === 'login' ? 'loginWidget' : 'regWidget';
  const container = tab === 'login' ? 'cf-turnstile-login' : 'cf-turnstile-register';
  const el = document.getElementById(container);
  if (!el) {
    console.error('[Turnstile] Container not found:', container);
    return;
  }

  // 已渲染过则 reset 重用
  if (TS[key]) {
    try { window.turnstile?.reset(TS[key]); } catch {}
    return;
  }

  // 检查 Turnstile 脚本是否已加载
  if (!window.turnstile) {
    console.warn('[Turnstile] Script not loaded yet, waiting...');
    // 等待 Turnstile 脚本加载
    const waitScript = setInterval(() => {
      if (window.turnstile) {
        clearInterval(waitScript);
        doRender();
      }
    }, 100);
    // 超时 5 秒
    setTimeout(() => {
      clearInterval(waitScript);
      if (!TS[key]) {
        console.error('[Turnstile] Script not loaded after 5s');
      }
    }, 5000);
    return;
  }

  doRender();

  function doRender() {
    try {
      TS[key] = window.turnstile.render(el, {
        sitekey: String(TS.siteKey) || '0x0000000000000000000000',
        theme: 'light',
        callback: (token) => {
          console.log('[Turnstile] Token received:', token ? '✅' : '❌');
        },
        'expired-callback': () => {
          console.log('[Turnstile] Widget expired, resetting');
          if (TS[key]) try { window.turnstile.reset(TS[key]); } catch {}
          TS[key] = null;
        },
      });
    } catch (e) {
      console.error('[Turnstile] Render error:', e);
    }
  }
}

function applyConfig() {
  const c = App.config;
  // 站点名称
  document.title = `${c.siteName} | Vocab Learner`;
  document.querySelectorAll('.nav-title').forEach(el => el.textContent = c.siteName);
  document.querySelectorAll('.hero-title').forEach(el => el.textContent = `${c.siteName}`);
  // 公告
  const ann = document.getElementById('announcement-bar');
  if (ann) { ann.textContent = c.announcement || ''; ann.classList.toggle('hidden', !c.announcement); }
  // 维护模式（非管理员看到维护提示）
  if (c.maintenanceMode && !App.isAdmin) {
    document.getElementById('maintenance-overlay')?.classList.remove('hidden');
  } else {
    document.getElementById('maintenance-overlay')?.classList.add('hidden');
  }
  // 是否允许注册
  const regBtn = document.querySelector('.auth-tab[data-auth="register"]');
  if (regBtn) regBtn.classList.toggle('hidden', !c.allowRegister);
}
function getTurnstileToken(tab) {
  if (!TS.enabled || !window.turnstile) return '';
  const key = tab === 'login' ? 'loginWidget' : 'regWidget';
  if (!TS[key]) return '';
  return window.turnstile.getResponse(TS[key]) || '';
}
function resetTurnstile() {
  if (!TS.enabled || !window.turnstile) return;
  ['loginWidget', 'regWidget'].forEach(k => { if (TS[k]) { try { window.turnstile.reset(TS[k]); } catch {} TS[k] = null; } });
}

// ---------------- 工具 ----------------
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2200);
}
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US'; u.rate = 0.9;
  window.speechSynthesis.speak(u);
}
// 游客模式下本地保存状态
function guestStatusGet() { try { return JSON.parse(localStorage.getItem('vocab_guest_status') || '{}'); } catch { return {}; } }
function guestStatusSet(map) { localStorage.setItem('vocab_guest_status', JSON.stringify(map)); }

// ---------------- 视图切换 ----------------
function showApp() { document.getElementById('welcome-section')?.classList.add('hidden'); document.getElementById('app-section')?.classList.remove('hidden'); }
function showWelcome() { document.getElementById('welcome-section')?.classList.remove('hidden'); document.getElementById('app-section')?.classList.add('hidden'); }
function showViewBooks() { document.getElementById('view-dashboard')?.classList.add('hidden'); document.getElementById('view-books').classList.remove('hidden'); document.getElementById('view-book').classList.add('hidden'); }
function showViewBook() { document.getElementById('view-books').classList.add('hidden'); document.getElementById('view-book').classList.remove('hidden'); }

function startGuestMode() {
  if (!App.config.guestBrowse) return showToast('管理员已关闭游客浏览，请先登录');
  App.isGuest = true; showApp(); loadBooks(); showToast('游客模式：可浏览词书，但进度不保存（建议注册）');
}

// ---------------- 词书列表 ----------------
async function loadBooks() {
  const grid = document.getElementById('books-grid');
  // 显示骨架屏
  grid.innerHTML = Array(6).fill('').map(() => `
    <div class="book-card">
      <div class="skeleton" style="height:130px;border-radius:var(--radius-lg) var(--radius-lg) 0 0;"></div>
      <div class="book-body">
        <div class="skeleton" style="height:18px;width:80%;margin-bottom:10px;"></div>
        <div class="skeleton" style="height:8px;width:60%;margin-bottom:12px;"></div>
        <div class="skeleton" style="height:14px;width:100%;margin-top:auto;border-radius:var(--radius-sm);"></div>
      </div>
    </div>`).join('');

  const res = await API.getBooks();
  if (!res.ok) {
    grid.innerHTML = `<p class="empty-hint" style="grid-column:1/-1">${res.data.error || '加载失败，请确认已部署后端并导入词库'}</p>`;
    return;
  }
  App.books = res.data.books || [];
  renderBooks();
}

function renderBooks() {
  const grid = document.getElementById('books-grid');
  if (!App.books.length) {
    grid.innerHTML = '<p class="empty-hint">暂无词书，登录后可导入你自己的单词</p>';
    return;
  }
  grid.innerHTML = App.books.map(b => {
    const pct = b.wordCount ? Math.round((b.masteredCount / b.wordCount) * 100) : 0;
    const cover = b.cover
      ? `<img class="book-cover" src="${escapeAttr(b.cover)}" alt="" onerror="this.outerHTML='<div class=&quot;book-cover-fallback&quot;>📘</div>'">`
      : '<div class="book-cover-fallback">📘</div>';
    return `
      <div class="book-card">
        ${cover}
        <div class="book-body">
          <div class="book-name">${escapeHtml(b.name)}</div>
          <div class="book-mini-progress"><div class="book-mini-fill" style="width:${pct}%"></div></div>
          <div class="book-meta"><span>${b.wordCount} 词</span><span>${pct}% 已掌握</span></div>
          <button class="btn btn-primary btn-sm" onclick="openBook('${escapeAttr(b.slug)}')">开始学习</button>
        </div>
      </div>`;
  }).join('');
}

// ---------------- 打开词书 ----------------
async function openBook(slug) {
  showViewBook();
  document.getElementById('word-list').innerHTML = '<p class="empty-hint">加载单词中…</p>';
  App.revealed = new Set();
  App.book = { slug, name: slug, total: 0, words: [] };

  // 分页拉取全部单词
  let offset = 0, limit = 1000, all = [];
  while (true) {
    const res = await API.getBookWords(slug, offset, limit);
    if (!res.ok) { document.getElementById('word-list').innerHTML = `<p class="empty-hint">${res.data.error || '加载失败'}</p>`; return; }
    App.book.name = res.data.book?.name || slug;
    App.book.total = res.data.total || 0;
    all = all.concat(res.data.words || []);
    if (res.data.words.length < limit) break;
    offset += limit;
    if (offset > 50000) break; // 安全上限
  }
  // 游客模式：把本地保存的已掌握状态叠加回去（服务端无 userId，默认返回 new）
  if (!API.isLoggedIn()) {
    const g = guestStatusGet();
    all = all.map(w => ({ ...w, status: g[w.slug] || w.status }));
  }
  App.book.words = all;
  document.getElementById('book-title').textContent = App.book.name;
  App.wordTab = 'all';
  document.querySelectorAll('#view-book .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === 'all'));
  renderBook();
}

function renderBook() {
  const b = App.book; if (!b) return;
  const words = b.words;
  const mastered = words.filter(w => w.status === 'mastered').length;
  const unknown = words.length - mastered;
  const pct = words.length ? Math.round((mastered / words.length) * 100) : 0;

  document.getElementById('book-progress-fill').style.width = pct + '%';
  document.getElementById('book-progress-text').textContent = `${mastered} / ${words.length}`;
  document.getElementById('cnt-all').textContent = words.length;
  document.getElementById('cnt-mastered').textContent = mastered;
  document.getElementById('cnt-unknown').textContent = unknown;
  document.getElementById('complete-banner').classList.toggle('hidden', !(words.length > 0 && unknown === 0));

  const list = (App.wordTab === 'all') ? words
    : (App.wordTab === 'mastered') ? words.filter(w => w.status === 'mastered')
    : words.filter(w => w.status !== 'mastered');

  const box = document.getElementById('word-list');
  document.getElementById('word-list-empty').classList.toggle('hidden', list.length > 0);
  box.innerHTML = list.map(w => {
    const revealed = App.revealed.has(w.slug);
    const isMastered = w.status === 'mastered';
    const phonetic = w.phonetic_us || w.phonetic_uk || '';
    return `
      <div class="word-row ${isMastered ? 'mastered' : ''}" data-slug="${escapeAttr(w.slug)}">
        <div class="word-main" onclick="toggleReveal('${escapeAttr(w.slug)}')">
          <div class="word-top">
            <span class="word-text">${escapeHtml(w.word)}</span>
            ${phonetic ? `<span class="word-phonetic">${escapeHtml(phonetic)}</span>` : ''}
            <button class="btn-audio" onclick="event.stopPropagation();speak('${escapeAttr(w.word)}')" title="发音">🔊</button>
          </div>
          <div class="word-meaning ${revealed ? '' : 'hidden'}">${escapeHtml(w.meaning || '（无释义）')}</div>
          ${w.example ? `<div class="word-example ${revealed ? '' : 'hidden'}">${escapeHtml(w.example)}</div>` : ''}
        </div>
        <div class="word-actions">
          <button class="btn-mark ${isMastered ? 'done' : ''}" onclick="event.stopPropagation();markWord('${escapeAttr(w.slug)}')">${isMastered ? '✓ 已掌握' : '标记掌握'}</button>
        </div>
      </div>`;
  }).join('');
}

function switchWordTab(tab) {
  App.wordTab = tab;
  document.querySelectorAll('#view-book .tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  renderBook();
}

function toggleReveal(slug) {
  if (App.revealed.has(slug)) App.revealed.delete(slug); else App.revealed.add(slug);
  renderBook();
}

async function markWord(slug) {
  const b = App.book; if (!b) return;
  const w = b.words.find(x => x.slug === slug);
  if (!w) return;
  const newStatus = w.status === 'mastered' ? 'learning' : 'mastered';

  if (!API.isLoggedIn()) {
    // 游客：本地保存
    const map = guestStatusGet();
    map[slug] = newStatus;
    guestStatusSet(map);
    w.status = newStatus;
    renderBook();
    showToast(newStatus === 'mastered' ? '已标记为掌握（仅本地）' : '已取消标记');
    return;
  }
  const res = await API.setWordStatus(slug, newStatus);
  if (res.ok) {
    w.status = newStatus;
    renderBook();
    showToast(newStatus === 'mastered' ? '已掌握 🎉' : '已取消掌握');
  } else {
    showToast(res.data.error || '操作失败');
  }
}

function backToBooks() { App.book = null; showViewBooks(); loadBooks(); }

// ---------------- 学习模式：选择题 / 拼写 ----------------
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
// 归一化：小写、去空格、去标点，用于拼写比较
function normWord(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, '').replace(/[.。,，!！?？;；:：'"()（）]/g, '');
}

// 从当前词书抽样生成练习队列（优先未掌握，其次已掌握）
function buildStudyQueue(size) {
  const words = (App.book?.words || []).filter(w => w && w.word);
  if (!words.length) return [];
  const unknown = shuffle(words.filter(w => w.status !== 'mastered' && w.meaning));
  const known = shuffle(words.filter(w => w.status === 'mastered' && w.meaning));
  let pool = unknown.concat(known);
  if (pool.length < size) {
    const extra = shuffle(words.filter(w => !w.meaning && !pool.includes(w)));
    pool = pool.concat(extra);
  }
  return shuffle(pool).slice(0, Math.min(size, pool.length));
}

function startQuiz() {
  if (!App.book || !App.book.words.length) return showToast('请先打开一本词书');
  const queue = buildStudyQueue(10);
  if (!queue.length) return showToast('这本书暂无可用单词');
  App.study = { mode: 'quiz', queue, idx: 0, correct: 0, wrong: 0, shown: [] };
  openStudy();
}
function startSpell() {
  if (!App.book || !App.book.words.length) return showToast('请先打开一本词书');
  const queue = buildStudyQueue(10).filter(w => w.word);
  if (!queue.length) return showToast('这本书暂无可用单词');
  App.study = { mode: 'spell', queue, idx: 0, correct: 0, wrong: 0, shown: [] };
  openStudy();
}
function openStudy() {
  showViewStudy();
  document.getElementById('study-title').textContent =
    (App.study.mode === 'quiz' ? '选择题测试' : '拼写练习') + ' · ' + (App.book?.name || '');
  renderStudy();
}
function showViewStudy() {
  document.getElementById('view-study').classList.remove('hidden');
  document.getElementById('view-book').classList.add('hidden');
}
function closeStudy() {
  App.study = null;
  document.getElementById('view-study').classList.add('hidden');
  showViewBook();
  renderBook();
}
function renderStudy() {
  const s = App.study; if (!s) return;
  const w = s.queue[s.idx];
  if (!w) return finishStudy();
  const total = s.queue.length;
  const body = document.getElementById('study-body');
  body.innerHTML = (s.mode === 'quiz') ? quizHtml(w, s.idx, total) : spellHtml(w, s.idx, total);
}

function quizHtml(w, idx, total) {
  const pool = App.book.words.filter(x => x.word !== w.word && x.meaning && x.meaning !== w.meaning);
  const distract = shuffle(pool).slice(0, 3).map(x => x.meaning);
  const opts = shuffle([w.meaning, ...distract]);
  const phon = w.phonetic_us || w.phonetic_uk;
  return `
    <div class="study-card">
      <div class="study-progress">第 ${idx + 1} / ${total} 题 · 已答对 ${App.study.correct}</div>
      <div class="quiz-word">
        <div class="quiz-word-text">${escapeHtml(w.word)}</div>
        ${phon ? `<div class="quiz-word-phon">${escapeHtml(phon)}</div>` : ''}
        <button class="btn-audio" onclick="speak('${escapeAttr(w.word)}')" title="听发音">🔊</button>
      </div>
      <div class="quiz-prompt">选择正确的释义</div>
      <div class="quiz-options">
        ${opts.map(o => `<button class="quiz-opt" onclick="answerQuiz(this)">${escapeHtml(o)}</button>`).join('')}
      </div>
      <div class="study-feedback" id="study-feedback"></div>
      <div class="study-actions"><button class="btn btn-primary hidden" id="study-next" onclick="nextStudy()">下一题 →</button></div>
    </div>`;
}

function answerQuiz(btn) {
  const s = App.study; const w = s.queue[s.idx];
  const btns = Array.from(document.querySelectorAll('.quiz-opt'));
  const correctMeaning = (w.meaning || '').trim();
  let chosenCorrect = false;
  btns.forEach(b => {
    const isCorrect = b.textContent.trim() === correctMeaning;
    if (isCorrect) { b.classList.add('correct'); if (b === btn) chosenCorrect = true; }
    else if (b === btn) b.classList.add('wrong');
    b.disabled = true;
  });
  s.shown.push({ word: w, correct: chosenCorrect });
  if (chosenCorrect) s.correct++; else s.wrong++;
  const fb = document.getElementById('study-feedback');
  if (chosenCorrect) {
    fb.textContent = '✅ 答对了！';
    fb.className = 'study-feedback ok';
  } else {
    fb.innerHTML = '❌ 正确答案：' + escapeHtml(w.meaning) + (w.example ? '　例句：' + escapeHtml(w.example) : '');
    fb.className = 'study-feedback no';
  }
  document.getElementById('study-next').classList.remove('hidden');
}

function spellHtml(w, idx, total) {
  const phon = w.phonetic_us || w.phonetic_uk;
  return `
    <div class="study-card">
      <div class="study-progress">第 ${idx + 1} / ${total} 词 · 拼写正确 ${App.study.correct}</div>
      <div class="spell-prompt">请根据释义拼写单词：</div>
      <div class="spell-meaning">${escapeHtml(w.meaning || '（无释义）')}</div>
      ${phon ? `<div class="spell-phon">${escapeHtml(phon)}</div>` : ''}
      <button class="btn-audio-lg" onclick="speak('${escapeAttr(w.word)}')">🔊 听发音</button>
      <input type="text" id="spell-input" class="input spell-input" placeholder="输入英文拼写…" autocomplete="off" onkeydown="if(event.key==='Enter')submitSpell()">
      <div class="study-actions">
        <button class="btn btn-primary" onclick="submitSpell()">提交</button>
        <button class="btn btn-ghost" onclick="revealSpell()">看答案</button>
      </div>
      <div class="study-feedback" id="study-feedback"></div>
      <div class="study-actions"><button class="btn btn-primary hidden" id="study-next" onclick="nextStudy()">下一个 →</button></div>
    </div>`;
}

function submitSpell() {
  const s = App.study; const w = s.queue[s.idx];
  const input = document.getElementById('spell-input');
  if (!input) return;
  const raw = input.value;
  if (!normWord(raw)) return showToast('请输入拼写');
  recordSpell(w, normWord(raw) === normWord(w.word), raw, false);
}
function revealSpell() {
  const w = App.study.queue[App.study.idx];
  recordSpell(w, false, null, true);
}
function recordSpell(w, ok, userVal, revealed) {
  const s = App.study;
  const fb = document.getElementById('study-feedback');
  const input = document.getElementById('spell-input');
  if (input) input.disabled = true;
  s.shown.push({ word: w, correct: ok });
  if (ok) s.correct++; else s.wrong++;
  if (ok) {
    fb.innerHTML = '✅ 拼写正确！';
    fb.className = 'study-feedback ok';
  } else if (revealed) {
    fb.innerHTML = '正确答案：<b>' + escapeHtml(w.word) + '</b>';
    fb.className = 'study-feedback no';
  } else {
    fb.innerHTML = '❌ 正确拼写：<b>' + escapeHtml(w.word) + '</b>　（你写的是：' + escapeHtml(userVal || '') + '）';
    fb.className = 'study-feedback no';
  }
  const nx = document.getElementById('study-next');
  if (nx) nx.classList.remove('hidden');
}

function nextStudy() {
  const s = App.study;
  s.idx++;
  if (s.idx >= s.queue.length) return finishStudy();
  renderStudy();
}

function finishStudy() {
  const s = App.study; if (!s) return;
  const total = s.queue.length;
  const pct = total ? Math.round((s.correct / total) * 100) : 0;
  const emoji = pct >= 80 ? '🏆' : pct >= 60 ? '👍' : '💪';
  const body = document.getElementById('study-body');
  body.innerHTML = `
    <div class="study-card study-result">
      <div class="result-emoji">${emoji}</div>
      <h3 class="result-title">${s.mode === 'quiz' ? '选择题测试' : '拼写练习'}完成！</h3>
      <div class="result-score">答对 ${s.correct} / ${total}（${pct}%）</div>
      <div class="study-actions study-result-actions">
        <button class="btn btn-primary" onclick="${s.mode === 'quiz' ? 'startQuiz' : 'startSpell'}()">再来一局</button>
        <button class="btn btn-outline" onclick="markStudyMastered()">把答对的标记为已掌握</button>
        <button class="btn btn-ghost" onclick="closeStudy()">返回词书</button>
      </div>
    </div>`;
}

// 把本轮答对的词标记为已掌握（登录用户写云端，游客存本地）
async function markStudyMastered() {
  const s = App.study;
  if (!s || !s.shown.length) return;
  const correctWords = s.shown.filter(x => x.correct).map(x => x.word);
  if (!correctWords.length) return showToast('本轮没有答对的词');
  let done = 0;
  for (const w of correctWords) {
    if (w.status === 'mastered') { done++; continue; }
    if (!API.isLoggedIn()) {
      const map = guestStatusGet(); map[w.slug] = 'mastered'; guestStatusSet(map); w.status = 'mastered'; done++;
    } else {
      const res = await API.setWordStatus(w.slug, 'mastered');
      if (res.ok) { w.status = 'mastered'; done++; }
    }
  }
  renderBook();
  showToast(`已将 ${done} 个答对的词标记为已掌握`);
}

// ---------------- 用户导入 ----------------
function showImportModal() { document.getElementById('import-modal').classList.remove('hidden'); }
function closeImportModal() { document.getElementById('import-modal').classList.add('hidden'); document.getElementById('import-error').classList.add('hidden'); }
function showImportError(msg) { const e = document.getElementById('import-error'); e.textContent = msg; e.classList.remove('hidden'); }

function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];
  const header = splitCSVLine(lines[0]).map(h => h.trim().toLowerCase());
  const idx = k => header.indexOf(k);
  const wi = idx('word'), mi = idx('meaning') < 0 ? idx('trans') : idx('meaning'), pi = idx('phonetic'), ei = idx('example'), psi = idx('pos');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCSVLine(lines[i]);
    const word = (wi >= 0 ? cells[wi] : cells[0] || '').trim();
    const meaning = (mi >= 0 ? cells[mi] : cells[1] || '').trim();
    if (!word) continue;
    out.push({ word, meaning, phonetic: pi >= 0 ? cells[pi] : '', example: ei >= 0 ? cells[ei] : '', pos: psi >= 0 ? cells[psi] : '' });
  }
  return out;
}
function splitCSVLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === ',' && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur); return out;
}

async function doImport() {
  const name = document.getElementById('import-name').value.trim();
  if (!name) return showImportError('请填写词书名');
  const fileInput = document.getElementById('import-file');
  const textarea = document.getElementById('import-text');
  let text = '';
  if (fileInput && fileInput.files && fileInput.files[0]) {
    text = await fileInput.files[0].text();
  } else if (textarea && textarea.value.trim()) {
    text = textarea.value.trim(); // 兜底：允许直接粘贴
  } else {
    return showImportError('请选择单词文件（JSON / CSV / TXT），或直接在文本框粘贴');
  }
  let words;
  try { words = parseImportText(text); }
  catch (e) { return showImportError('解析失败：' + e.message); }
  words = words.filter(w => w && w.word && w.meaning);
  if (!words.length) return showImportError('没有解析到有效单词（每行需含 word 和 meaning）');
  if (words.length > 2000) return showImportError('单次最多导入 2000 个单词（当前 ' + words.length + '）');

  document.getElementById('import-loading').classList.remove('hidden');
  const res = await API.importBook(name, words);
  document.getElementById('import-loading').classList.add('hidden');
  if (res.ok) {
    closeImportModal();
    if (fileInput) fileInput.value = '';
    if (textarea) textarea.value = '';
    showToast(`导入成功：${res.data.count} 个单词`);
    loadBooks();
  } else showImportError(res.data.error || '导入失败');
}

// ---------------- 认证 ----------------
function showAuthModal(tab) { document.getElementById('auth-modal').classList.remove('hidden'); switchAuthTab(tab || 'login'); }
function closeAuthModal() { document.getElementById('auth-modal').classList.add('hidden'); resetTurnstile(); }
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.auth-tab[data-auth="${tab}"]`)?.classList.add('active');
  document.getElementById('login-form').classList.toggle('hidden', tab !== 'login');
  document.getElementById('register-form').classList.toggle('hidden', tab !== 'register');
  document.getElementById('auth-error').classList.add('hidden');
  renderTurnstile(tab);
}
function showAuthError(msg) { const e = document.getElementById('auth-error'); e.textContent = msg; e.classList.remove('hidden'); }

function setLoading(btnId, loading, originalText) {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  if (loading) { btn.disabled = true; btn.dataset.originalText = btn.textContent; btn.textContent = '处理中…'; }
  else { btn.disabled = false; btn.textContent = btn.dataset.originalText || originalText; }
}

async function doRegister(e) {
  e.preventDefault();
  if (TS.enabled && !getTurnstileToken('register')) return showAuthError('请先完成人机验证（点一下验证框）');
  setLoading('register-btn', true, '注册');
  const res = await API.register(
    document.getElementById('reg-username').value.trim(),
    document.getElementById('reg-email').value.trim(),
    document.getElementById('reg-password').value,
    getTurnstileToken('register')
  );
  setLoading('register-btn', false, '注册');
  if (res.ok) {
    API.setAuth(res.data.token, res.data.user);
    onLoggedIn(res.data.user);
    closeAuthModal();
    showToast('注册成功，欢迎！');
    // 触发邮箱验证闭环：未验证则弹出验证框（未配置 SMTP 时回填测试验证码）
    if (res.data.needsVerification) {
      setTimeout(() => showVerifyModal(res.data.devCode), 600);
    }
  }
  else showAuthError(res.data.error || '注册失败');
}
async function doLogin(e) {
  e.preventDefault();
  if (TS.enabled && !getTurnstileToken('login')) return showAuthError('请先完成人机验证（点一下验证框）');
  setLoading('login-btn', true, '登录');
  const res = await API.login(
    document.getElementById('login-username').value.trim(),
    document.getElementById('login-password').value,
    getTurnstileToken('login')
  );
  setLoading('login-btn', false, '登录');
  if (res.ok) { API.setAuth(res.data.token, res.data.user); onLoggedIn(res.data.user); closeAuthModal(); showToast('登录成功！'); }
  else showAuthError(res.data.error || '登录失败');
}
async function logout() {
  API.clearAuth(); App.isGuest = false; App.isAdmin = false; App.book = null;
  document.getElementById('nav-user').classList.add('hidden');
  document.getElementById('nav-login-btn').classList.remove('hidden');
  document.getElementById('import-book-btn').classList.add('hidden');
  showWelcome(); showToast('已退出登录');
}

function onLoggedIn(user) {
  App.isGuest = false; App.isAdmin = user.role === 'admin';
  document.getElementById('nav-login-btn').classList.add('hidden');
  document.getElementById('nav-user').classList.remove('hidden');
  document.getElementById('nav-username').textContent = user.username;
  document.getElementById('nav-role')?.classList.toggle('hidden', !App.isAdmin);
  document.getElementById('nav-admin-btn')?.classList.toggle('hidden', !App.isAdmin);
  document.getElementById('import-book-btn')?.classList.toggle('hidden', !API.isLoggedIn());
  showApp();
  navTo('dashboard');
  // 邮箱未验证提示
  updateVerifyBanner(user);
}

// 顶部邮箱验证提示条
function updateVerifyBanner(user) {
  const banner = document.getElementById('verify-banner');
  if (!banner) return;
  if (user && !user.emailVerified) {
    banner.classList.remove('hidden');
  } else {
    banner.classList.add('hidden');
  }
}

// ---------------- 忘记密码弹窗 ----------------
function showForgotModal() {
  const modal = document.getElementById('forgot-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.getElementById('forgot-error').classList.add('hidden');
}
function closeForgotModal() {
  const modal = document.getElementById('forgot-modal');
  if (!modal) return;
  modal.classList.add('hidden');
  document.getElementById('forgot-error').classList.add('hidden');
}
async function doForgotPassword(e) {
  e.preventDefault();
  const identifier = document.getElementById('forgot-identifier').value.trim();
  if (!identifier) return showForgotError('请输入用户名或邮箱');
  setLoading('forgot-btn', true, '发送');
  const res = await API.forgotPassword(identifier);
  setLoading('forgot-btn', false, '发送');
  if (res.ok) {
    showForgotError('验证码已发送至您的邮箱，请查收后重置密码。', true);
  } else {
    showForgotError(res.data.error || '发送失败');
  }
}
function showForgotError(msg, success) {
  const el = document.getElementById('forgot-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  el.style.background = success ? 'var(--green-light)' : '';
  el.style.color = success ? 'var(--green)' : '';
  el.style.borderColor = success ? 'var(--green)' : '';
  if (success) setTimeout(() => closeForgotModal(), 4000);
}

// ---------------- 学习中心（仪表盘）----------------
function navTo(tab) {
  if (tab === 'dashboard') {
    showViewDashboard();
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.nav === 'dashboard'));
    renderDashboard();
  } else {
    showViewBooks();
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.toggle('active', t.dataset.nav === 'books'));
    loadBooks();
  }
}

function showViewDashboard() {
  ['view-books', 'view-book', 'view-study'].forEach(id => document.getElementById(id)?.classList.add('hidden'));
  document.getElementById('view-dashboard')?.classList.remove('hidden');
}

async function renderDashboard() {
  const root = document.getElementById('dashboard-content');
  if (!root) return;
  root.innerHTML = '<div class="card-loading">加载中…</div>';

  const [statsRes, booksRes, achRes] = await Promise.all([
    API.getStats(), API.getBooks(), API.getAchievements(),
  ]);
  const stats = statsRes.ok ? (statsRes.data || {}) : {};
  const books = booksRes.ok ? (booksRes.data.books || []) : [];
  const achievements = achRes.ok ? (achRes.data.achievements || []) : [];

  let totalWords = 0, totalMastered = 0;
  books.forEach(b => { totalWords += b.wordCount || 0; totalMastered += b.masteredCount || 0; });
  const overallPct = totalWords ? Math.round(totalMastered / totalWords * 100) : 0;

  const inProgress = books.filter(b => b.wordCount > 0 && b.masteredCount < b.wordCount);
  const continueBook = (inProgress.sort((a, b) =>
    (b.masteredCount / b.wordCount) - (a.masteredCount / a.wordCount))[0]) || books[0];
  const unlocked = achievements.filter(a => a.unlocked);

  root.innerHTML = `
    <div class="dash-grid">
      <div class="dash-card dash-overview">
        <div class="progress-ring" style="--pct:${overallPct}">
          <div class="progress-ring-inner">
            <span class="progress-ring-num">${overallPct}%</span>
            <span class="progress-ring-label">总掌握率</span>
          </div>
        </div>
        <div class="overview-stats">
          <div class="ov-stat"><div class="ov-num">${stats.masteredWords ?? 0}</div><div class="ov-label">已掌握词</div></div>
          <div class="ov-stat"><div class="ov-num">${stats.studyDays ?? 0}</div><div class="ov-label">学习天数</div></div>
          <div class="ov-stat"><div class="ov-num">${stats.currentStreak ?? 0}</div><div class="ov-label">连续打卡</div></div>
          <div class="ov-stat"><div class="ov-num">${stats.todayMastered ?? 0}</div><div class="ov-label">今日掌握</div></div>
        </div>
      </div>

      <div class="dash-card dash-continue">
        <div class="card-title">继续学习</div>
        ${continueBook ? `
          <div class="continue-book">
            <div class="continue-name">${escapeHtml(continueBook.name)}</div>
            <div class="continue-prog"><div class="continue-fill" style="width:${Math.round((continueBook.masteredCount / continueBook.wordCount) * 100)}%"></div></div>
            <div class="continue-meta">${continueBook.masteredCount} / ${continueBook.wordCount} 已掌握</div>
            <div class="continue-actions">
              <button class="btn btn-primary btn-sm" onclick="openBook('${escapeAttr(continueBook.slug)}')">继续学习 →</button>
              <button class="btn btn-outline btn-sm" onclick="startQuizFromBook('${escapeAttr(continueBook.slug)}')">📝 测试</button>
            </div>
          </div>` : '<p class="empty-hint">还没有词书，去「词书库」开始吧</p>'}
      </div>

      ${unlocked.length ? `
      <div class="dash-card dash-ach">
        <div class="card-title">成就墙 (${unlocked.length})</div>
        <div class="dash-badges">
          ${unlocked.slice(0, 4).map(a => `<div class="dash-badge" title="${escapeAttr(a.description || '')}">
            <span class="dash-badge-icon">${a.icon || '🏅'}</span>
            <span class="dash-badge-name">${escapeHtml(a.name)}</span>
          </div>`).join('')}
        </div>
        <a class="dash-link" href="/profile/">查看全部成就 →</a>
      </div>` : ''}

      <div class="dash-card dash-start">
        <div class="card-title">开始一本词书</div>
        <div class="start-list">
          ${books.slice(0, 6).map(b => `
            <div class="start-item" onclick="openBook('${escapeAttr(b.slug)}')">
              <span class="start-name">${escapeHtml(b.name)}</span>
              <span class="start-meta">${b.wordCount} 词 · ${Math.round(((b.masteredCount || 0) / (b.wordCount || 1)) * 100)}%</span>
            </div>`).join('') || '<p class="empty-hint">暂无词书</p>'}
        </div>
        <a class="dash-link" href="javascript:void(0)" onclick="navTo('books')">浏览全部词书 →</a>
      </div>
    </div>`;
}

async function startQuizFromBook(slug) {
  await openBook(slug);
  startQuiz();
}

// ---------------- 邮箱验证弹窗 ----------------
function showVerifyModal(prefillCode) {
  const m = document.getElementById('verify-modal');
  if (!m) return;
  m.classList.remove('hidden');
  const input = document.getElementById('verify-code-input');
  if (prefillCode && input) input.value = prefillCode;
  document.getElementById('verify-error')?.classList.add('hidden');
  document.getElementById('verify-success')?.classList.add('hidden');
}
function closeVerifyModal() { document.getElementById('verify-modal')?.classList.add('hidden'); }
async function sendVerifyCode() {
  const btn = document.getElementById('verify-send-btn');
  if (!btn) return;
  btn.disabled = true; btn.textContent = '发送中…';
  const res = await API.sendVerification();
  btn.disabled = false; btn.textContent = '重新发送验证码';
  if (res.ok) {
    const msg = res.data?.alreadyVerified ? '邮箱已验证' : '验证码已发送，请查收邮件';
    showToast(msg);
  } else {
    showToast(res.data?.error || '发送失败');
  }
}
async function submitVerifyCode() {
  const input = document.getElementById('verify-code-input');
  const code = input?.value.trim();
  if (!code) return showToast('请输入验证码');
  const res = await API.verifyEmail(code);
  if (res.ok) {
    showToast('邮箱验证成功 🎉');
    const u = API.getStoredUser();
    if (u) { u.emailVerified = 1; API.setAuth(API.getToken(), u); }
    updateVerifyBanner(API.getStoredUser());
    closeVerifyModal();
    const s = document.getElementById('verify-success'); if (s) { s.classList.remove('hidden'); }
  } else {
    const e = document.getElementById('verify-error');
    if (e) { e.textContent = res.data?.error || '验证失败'; e.classList.remove('hidden'); }
  }
}

// ---------------- 导入文件解析辅助 ----------------
function parseImportText(text) {
  let words;
  if (text.trimStart().startsWith('[')) {
    const arr = JSON.parse(text);
    words = arr.map(w => ({
      word: w.word, meaning: w.meaning,
      phonetic: w.phonetic || w.phoneticUs || '', example: w.example || '', pos: w.pos || '',
    }));
  } else {
    words = parseCSV(text);
  }
  return words;
}

// ---------------- HTML 转义 ----------------
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function escapeAttr(s) { return escapeHtml(s).replace(/"/g, '&quot;'); }

// ---------------- 初始化 ----------------
async function init() {
  // 显示加载状态
  const body = document.body;
  body.classList.add('loading');

  await loadConfig();
  body.classList.remove('loading');

  // 维护模式检查（非管理员）
  if (App.config.maintenanceMode && !API.isLoggedIn()) {
    document.getElementById('maintenance-overlay')?.classList.remove('hidden');
    return;
  }

  // 关闭注册时隐藏注册 Tab
  if (!App.config.allowRegister) {
    const regTab = document.querySelector('.auth-tab[data-auth="register"]');
    if (regTab) regTab.classList.add('hidden');
  }

  if (API.isLoggedIn()) {
    const res = await API.me();
    if (res.ok) {
      onLoggedIn(res.data.user);
      applyConfig();
      return;
    }
    API.clearAuth();
  }

  showWelcome();
}
window.addEventListener('DOMContentLoaded', init);
