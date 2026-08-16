// ============================================================
// 管理后台逻辑 — 用户管理（列表 / 新增 / 删除 / 重置密码）
// 仅管理员可访问，非管理员会被重定向回首页。
// ============================================================

const Admin = {
  user: null,
};

function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 2400);
}
function showAddError(msg) {
  const e = document.getElementById('add-error');
  e.textContent = msg; e.classList.toggle('hidden', !msg);
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function fmt(v) { return v ? String(v) : '—'; }

async function init() {
  if (!API.isLoggedIn()) { location.href = '/'; return; }
  const res = await API.me();
  if (!res.ok || res.data.user.role !== 'admin') { API.clearAuth(); location.href = '/'; return; }
  Admin.user = res.data.user;
  document.getElementById('admin-name').textContent = '管理员：' + Admin.user.username;
  loadMembers();
}

async function loadMembers() {
  document.getElementById('members-loading').classList.remove('hidden');
  document.getElementById('members-table').classList.add('hidden');
  const res = await API.getMembers();
  document.getElementById('members-loading').classList.add('hidden');
  if (!res.ok) {
    document.getElementById('members-empty').textContent = res.data.error || '加载失败';
    document.getElementById('members-empty').classList.remove('hidden');
    return;
  }
  const members = res.data.members || [];
  // 统计卡片
  document.getElementById('stat-total').textContent = members.length;
  document.getElementById('stat-admin').textContent = members.filter(m => m.role === 'admin').length;
  document.getElementById('stat-member').textContent = members.filter(m => m.role === 'member').length;

  const body = document.getElementById('members-body');
  if (!members.length) {
    document.getElementById('members-empty').classList.remove('hidden');
    return;
  }
  document.getElementById('members-table').classList.remove('hidden');
  body.innerHTML = members.map(m => `
    <tr>
      <td>${m.id}</td>
      <td>${escapeHtml(m.username)}</td>
      <td>${escapeHtml(m.email)}</td>
      <td><span class="role-badge ${m.role}">${m.role === 'admin' ? '管理员' : '会员'}</span></td>
      <td>${fmt(m.mastered_count)} / ${fmt(m.word_count)}</td>
      <td>${fmt(m.created_at)}</td>
      <td>${fmt(m.last_login)}</td>
      <td>
        <div class="row-actions">
          <button class="btn btn-outline btn-sm" onclick="Admin.resetPwd(${m.id}, '${escapeHtml(m.username)}')">改密</button>
          <button class="btn btn-ghost btn-sm" onclick="Admin.remove(${m.id}, '${escapeHtml(m.username)}')">删除</button>
        </div>
      </td>
    </tr>`).join('');
}

async function add() {
  showAddError('');
  const username = document.getElementById('add-username').value.trim();
  const email = document.getElementById('add-email').value.trim();
  const password = document.getElementById('add-password').value;
  const role = document.getElementById('add-role').value;
  if (!username || !email || !password) return showAddError('请填写用户名、邮箱和密码');
  const res = await API.createMember(username, email, password, role);
  if (res.ok) {
    showToast('已添加用户：' + username);
    document.getElementById('add-username').value = '';
    document.getElementById('add-email').value = '';
    document.getElementById('add-password').value = '';
    loadMembers();
  } else {
    showAddError(res.data.error || '添加失败');
  }
}

function remove(id, name) {
  if (!confirm(`确定删除用户「${name}」？该操作不可恢复（其学习进度也会删除）。`)) return;
  (async () => {
    const res = await API.deleteMember(id);
    if (res.ok) { showToast('已删除：' + name); loadMembers(); }
    else showToast(res.data.error || '删除失败');
  })();
}

function resetPwd(id, name) {
  const pw = prompt(`为「${name}」设置新密码（至少 6 位）：`);
  if (pw === null) return;
  if (pw.length < 6) { showToast('密码至少 6 位'); return; }
  (async () => {
    const res = await API.resetMemberPassword(id, pw);
    if (res.ok) showToast(`已重置「${name}」的密码`);
    else showToast(res.data.error || '重置失败');
  })();
}

function logout() {
  API.clearAuth();
  location.href = '/';
}

window.addEventListener('DOMContentLoaded', init);
