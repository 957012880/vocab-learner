// ============================================================
// API 客户端 — 对接 Cloudflare Pages Functions 后端
// ============================================================

const API = {
  TOKEN_KEY: 'vocab_token',
  USER_KEY: 'vocab_user',

  getToken() { return localStorage.getItem(this.TOKEN_KEY); },
  setAuth(token, user) { localStorage.setItem(this.TOKEN_KEY, token); localStorage.setItem(this.USER_KEY, JSON.stringify(user)); },
  clearAuth() { localStorage.removeItem(this.TOKEN_KEY); localStorage.removeItem(this.USER_KEY); },
  getStoredUser() { try { return JSON.parse(localStorage.getItem(this.USER_KEY)); } catch { return null; } },
  isLoggedIn() { return !!this.getToken(); },

  async request(path, options = {}) {
    const token = this.getToken();
    const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
      const res = await fetch(path, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    } catch (e) {
      return { ok: false, status: 0, data: { error: '网络错误，请确认后端服务已部署' } };
    }
  },

  // 认证
  register(username, email, password) {
    return this.request('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, email, password }) });
  },
  login(identifier, password) {
    return this.request('/api/auth/login', { method: 'POST', body: JSON.stringify({ identifier, password }) });
  },
  me() { return this.request('/api/auth/me'); },

  // 词书
  getBooks() { return this.request('/api/books'); },
  getBookWords(slug, offset = 0, limit = 1000) {
    return this.request(`/api/books/${encodeURIComponent(slug)}/words?offset=${offset}&limit=${limit}`);
  },
  importBook(name, words) {
    return this.request('/api/books/import', { method: 'POST', body: JSON.stringify({ name, words }) });
  },

  // 单词状态
  setWordStatus(wordSlug, status) {
    return this.request(`/api/words/${encodeURIComponent(wordSlug)}/status`, { method: 'POST', body: JSON.stringify({ status }) });
  },

  // 进度 / 会员
  getProgress() { return this.request('/api/progress'); },
  getMembers() { return this.request('/api/admin/members'); },
};
