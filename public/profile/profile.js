// ============================================================
// 个人中心页面逻辑
// ============================================================

const Profile = {
  user: null,

  init() {
    if (!API.isLoggedIn()) {
      window.location.href = '/';
      return;
    }
    this.user = API.getStoredUser();
    this.loadProfile();
    this.loadEmailVerify();
    this.loadStats();
    this.loadAchievements();
  },

  // ---------------- 邮箱验证 ----------------
  loadEmailVerify() {
    if (!this.user) return;
    const pending = document.getElementById('verify-pending');
    const done = document.getElementById('verify-done');
    const statusText = document.getElementById('verify-status-text');
    if (this.user.emailVerified) {
      if (pending) pending.classList.add('hidden');
      if (done) done.classList.remove('hidden');
      if (statusText) statusText.textContent = '你的邮箱已经完成验证，可正常使用全部功能。';
    } else {
      if (pending) pending.classList.remove('hidden');
      if (done) done.classList.add('hidden');
      if (statusText) statusText.textContent = '你的邮箱尚未验证，请先完成验证以解锁全部功能。';
    }
  },

  async sendEmailCode() {
    const btn = document.getElementById('profile-send-code-btn');
    if (btn) { btn.disabled = true; btn.textContent = '发送中…'; }
    const res = await API.sendVerification();
    if (btn) { btn.disabled = false; btn.textContent = '重新发送'; }
    if (res.ok) {
      this.showToast(res.data?.alreadyVerified ? '邮箱已验证' : '验证码已发送，请查收邮件');
      if (res.data?.alreadyVerified) this.loadEmailVerify();
    } else {
      this.showError('profile-verify-error', res.data.error || '发送失败，请稍后重试');
    }
  },

  async verifyEmail() {
    const code = document.getElementById('profile-verify-code')?.value.trim();
    if (!code) return this.showError('profile-verify-error', '请输入验证码');
    this.showError('profile-verify-error', '');
    const res = await API.verifyEmail(code);
    if (res.ok) {
      this.showToast('邮箱验证成功 🎉');
      if (this.user) { this.user.emailVerified = 1; API.setAuth(API.getToken(), this.user); }
      this.loadProfile();
      this.loadEmailVerify();
    } else {
      this.showError('profile-verify-error', res.data.error || '验证失败');
    }
  },

  logout() {
    API.clearAuth();
    window.location.href = '/';
  },

  showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(t._timer);
    t._timer = setTimeout(() => t.classList.add('hidden'), 2200);
  },

  showError(elId, msg) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = msg; el.classList.remove('hidden');
    setTimeout(() => el.classList.add('hidden'), 5000);
  },

  setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    if (loading) { btn.disabled = true; btn.dataset.orig = btn.textContent; btn.textContent = '处理中…'; }
    else { btn.disabled = false; btn.textContent = btn.dataset.orig || btn.textContent; }
  },

  // ---------------- 个人资料 ----------------
  loadProfile() {
    if (!this.user) return;
    const name = document.getElementById('profile-name');
    const email = document.getElementById('profile-email');
    const initials = document.getElementById('avatar-initials');
    const role = document.getElementById('profile-role');
    const verified = document.getElementById('profile-verified');
    const nickInput = document.getElementById('edit-nickname');
    const emailInput = document.getElementById('edit-email');

    if (name) name.textContent = this.user.username || '用户';
    if (email) email.textContent = this.user.email || '—';
    if (nickInput) nickInput.value = this.user.nickname || '';
    if (emailInput) emailInput.value = this.user.email || '';
    if (initials) initials.textContent = (this.user.username || '?').charAt(0).toUpperCase();
    if (role) role.classList.toggle('hidden', this.user.role !== 'admin');
    if (verified) {
      if (this.user.emailVerified) {
        verified.innerHTML = '<span class="verified-badge">邮箱已验证</span>';
      } else {
        verified.innerHTML = '<span class="unverified-badge">邮箱未验证</span>';
      }
    }
  },

  async updateProfile() {
    const nickname = document.getElementById('edit-nickname')?.value.trim();
    if (nickname === undefined) return;
    this.showError('profile-error', '');
    this.setLoading('save-profile-btn', true);
    const res = await API.updateProfile({ nickname });
    this.setLoading('save-profile-btn', false);
    if (res.ok) {
      this.showToast('个人信息已更新');
      if (nickname !== undefined && this.user) this.user.nickname = nickname;
    } else {
      this.showError('profile-error', res.data.error || '保存失败');
    }
  },

  // ---------------- 密码修改 ----------------
  togglePasswordSection() {
    const codeGroup = document.getElementById('email-code-group');
    const toggleBtn = document.getElementById('change-pwd-toggle');
    const confirmBtn = document.getElementById('change-pwd-btn');
    const pwdCurrent = document.getElementById('pwd-current');
    const pwdNew = document.getElementById('pwd-new');
    const pwdConfirm = document.getElementById('pwd-confirm');

    if (codeGroup && toggleBtn && confirmBtn) {
      const isShowing = !codeGroup.classList.contains('hidden');
      codeGroup.classList.toggle('hidden', isShowing);
      toggleBtn.classList.toggle('hidden', isShowing);
      confirmBtn.classList.toggle('hidden', isShowing);
      if (isShowing) {
        // 收起状态，清空字段
        if (pwdCurrent) pwdCurrent.value = '';
        if (pwdNew) pwdNew.value = '';
        if (pwdConfirm) pwdConfirm.value = '';
        this.showError('pwd-error', '');
      }
    }
  },

  async sendVerificationCode() {
    const btn = document.getElementById('send-code-btn');
    if (!btn) return;
    this.setLoading('send-code-btn', true);
    const res = await API.sendVerification();
    this.setLoading('send-code-btn', false);
    if (res.ok) {
      this.showToast('验证码已发送，请查收邮件');
    } else {
      this.showError('pwd-error', res.data.error || '发送失败，请稍后重试');
    }
  },

  async changePassword() {
    const currentPw = document.getElementById('pwd-current')?.value;
    const newPw = document.getElementById('pwd-new')?.value;
    const confirmPw = document.getElementById('pwd-confirm')?.value;
    const code = document.getElementById('pwd-code')?.value.trim();

    if (!currentPw) return this.showError('pwd-error', '请输入当前密码');
    if (!newPw || newPw.length < 6) return this.showError('pwd-error', '新密码至少6位');
    if (newPw !== confirmPw) return this.showError('pwd-error', '两次输入的密码不一致');
    if (!code) return this.showError('pwd-error', '请输入邮箱验证码');

    this.showError('pwd-error', '');
    this.setLoading('change-pwd-btn', true);
    const res = await API.changePassword(currentPw, newPw, code);
    this.setLoading('change-pwd-btn', false);
    if (res.ok) {
      this.showToast('密码已修改');
      document.getElementById('pwd-current').value = '';
      document.getElementById('pwd-new').value = '';
      document.getElementById('pwd-confirm').value = '';
      document.getElementById('pwd-code').value = '';
      this.togglePasswordSection();
    } else {
      this.showError('pwd-error', res.data.error || '修改失败');
    }
  },

  // ---------------- 学习统计 ----------------
  async loadStats() {
    const loadingEl = document.getElementById('stats-loading');
    const contentEl = document.getElementById('stats-content');
    const errorEl = document.getElementById('stats-error');
    if (!loadingEl || !contentEl) return;

    loadingEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    if (errorEl) errorEl.classList.add('hidden');

    const res = await API.getStats();
    loadingEl.classList.add('hidden');

    if (!res.ok) {
      if (errorEl) {
        errorEl.textContent = res.data.error || '加载失败';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    const data = res.data || {};
    const wordsEl = document.getElementById('stat-words');
    const daysEl = document.getElementById('stat-days');
    const streakEl = document.getElementById('stat-streak');
    if (wordsEl) wordsEl.textContent = data.masteredWords ?? '–';
    if (daysEl) daysEl.textContent = data.studyDays ?? '–';
    if (streakEl) streakEl.textContent = data.currentStreak ?? '–';
    contentEl.classList.remove('hidden');
  },

  // ---------------- 成就徽章 ----------------
  async loadAchievements() {
    const loadingEl = document.getElementById('achievements-loading');
    const contentEl = document.getElementById('achievements-content');
    const emptyEl = document.getElementById('achievements-empty');
    const errorEl = document.getElementById('achievements-error');
    const gridEl = document.getElementById('badges-grid');
    if (!loadingEl || !contentEl) return;

    loadingEl.classList.remove('hidden');
    contentEl.classList.add('hidden');
    if (emptyEl) emptyEl.classList.add('hidden');
    if (errorEl) errorEl.classList.add('hidden');

    const res = await API.getAchievements();
    loadingEl.classList.add('hidden');

    if (!res.ok) {
      if (errorEl) {
        errorEl.textContent = res.data.error || '加载失败';
        errorEl.classList.remove('hidden');
      }
      return;
    }

    const badges = res.data?.achievements || [];
    if (!badges.length) {
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    gridEl.innerHTML = badges.map(b => `
      <div class="badge-item ${b.unlocked ? '' : 'badge-locked'}">
        <div class="badge-icon">${b.unlocked ? b.icon : '🔒'}</div>
        <div class="badge-name">${b.name}</div>
        <div class="badge-desc">${b.description || ''}</div>
      </div>
    `).join('');

    contentEl.classList.remove('hidden');
  },
};

document.addEventListener('DOMContentLoaded', () => Profile.init());
