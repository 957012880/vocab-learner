css = '''

/* ======== 个人中心页面 ======== */
.profile-wrap { max-width: 960px; margin: 0 auto; padding: 28px 24px 60px; }
.profile-header {
  display: flex; align-items: center; gap: 20px;
  background: var(--surface); border-radius: var(--radius-lg);
  box-shadow: var(--shadow); padding: 28px; margin-bottom: 24px;
  border: 1px solid var(--border);
}
.profile-avatar {
  width: 80px; height: 80px; border-radius: 50%; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  font-size: 32px; font-weight: 700; color: #fff;
  background: linear-gradient(135deg, var(--primary), #7c3aed);
  box-shadow: var(--shadow-md);
}
.profile-info { flex: 1; min-width: 0; }
.profile-name { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
.profile-email { font-size: 14px; color: var(--text-secondary); margin-bottom: 8px; }
.profile-meta { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
.verified-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--green); font-weight: 600; }
.verified-badge::before { content: "\\2713"; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: var(--green); color: #fff; font-size: 10px; }
.unverified-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--yellow); font-weight: 600; }
.unverified-badge::before { content: "!"; display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; border-radius: 50%; background: var(--yellow); color: #fff; font-size: 10px; }
.profile-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
.card {
  background: var(--surface); border-radius: var(--radius-lg);
  box-shadow: var(--shadow); padding: 24px; border: 1px solid var(--border);
  transition: var(--transition);
}
.card:hover { box-shadow: var(--shadow-md); }
.card-title { font-size: 16px; font-weight: 700; margin: 0 0 18px; color: var(--text); display: flex; align-items: center; gap: 8px; }
.card-title::before { content: ""; width: 4px; height: 18px; background: var(--primary); border-radius: 2px; }
.card-full { grid-column: 1 / -1; }
.form-label { font-size: 13px; color: var(--text-muted); font-weight: 600; margin-bottom: 6px; display: block; letter-spacing: 0.2px; }
.form-row { display: flex; gap: 10px; align-items: flex-end; }
.form-row .form-group { flex: 1; margin-bottom: 0; }
.form-actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
.form-hint { font-size: 12px; color: var(--text-muted); margin-top: 4px; }
.stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
.stat-item { text-align: center; padding: 18px 12px; background: var(--bg); border-radius: var(--radius); border: 1px solid var(--border); }
.stat-num { font-size: 32px; font-weight: 800; color: var(--primary); line-height: 1.2; }
.stat-label { font-size: 13px; color: var(--text-muted); margin-top: 6px; font-weight: 500; }
.badges-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 14px; }
.badge-item {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 18px 12px; background: var(--bg); border-radius: var(--radius);
  border: 1px solid var(--border); transition: var(--transition); text-align: center;
}
.badge-item:hover { transform: translateY(-2px); box-shadow: var(--shadow-md); }
.badge-icon { font-size: 36px; line-height: 1; }
.badge-name { font-size: 12px; font-weight: 600; color: var(--text); }
.badge-desc { font-size: 11px; color: var(--text-muted); line-height: 1.3; }
.badge-locked { opacity: 0.4; filter: grayscale(1); }
.card-loading { text-align: center; padding: 32px; color: var(--text-muted); font-size: 14px; }
.card-error { text-align: center; padding: 24px; color: var(--red); font-size: 13px; background: var(--red-light); border-radius: var(--radius-sm); }
@media (max-width: 640px) {
  .profile-wrap { padding: 20px 16px 40px; }
  .profile-header { flex-direction: column; text-align: center; padding: 20px; }
  .profile-meta { justify-content: center; }
  .profile-grid { grid-template-columns: 1fr; }
  .stats-row { grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .stat-num { font-size: 24px; }
  .badges-grid { grid-template-columns: repeat(3, 1fr); }
  .form-row { flex-direction: column; }
}
'''
with open('E:/workbuddy/xdc/public/css/style.css', 'a', encoding='utf-8') as f:
    f.write(css)
print('Done')
