import { useEffect, useState } from 'react';
import { SPELL_SESSION_KEY } from './IntegratedSpellReview';

interface Status {
  enabled: boolean;
  hasToken: boolean;
  gistId: string | null;
  lastSyncAt: number;
  lastError: string | null;
}

export default function Settings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [token, setToken] = useState('');
  const [tokenTouched, setTokenTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [validateMsg, setValidateMsg] = useState<string | null>(null);
  const [runMsg, setRunMsg] = useState<string | null>(null);
  const [gistList, setGistList] = useState<Array<{ id: string; description: string | null }> | null>(null);

  const refresh = async () => {
    const s = await (window as any).api.sync.status() as Status;
    setStatus(s);
  };

  useEffect(() => { refresh(); }, []);

  const onToggle = async (next: boolean) => {
    setBusy(true);
    try {
      await (window as any).api.sync.setConfig({ enabled: next });
      await refresh();
    } finally { setBusy(false); }
  };

  const onSaveToken = async () => {
    if (!tokenTouched || !token.trim()) return;
    setBusy(true);
    try {
      await (window as any).api.sync.setConfig({ token: token.trim() });
      setTokenTouched(false);
      setToken('');
      await refresh();
    } finally { setBusy(false); }
  };

  const onValidate = async () => {
    setValidateMsg('检查中...');
    try {
      const t = tokenTouched && token.trim() ? token.trim() : null;
      if (!t && !status?.hasToken) {
        setValidateMsg('先填一个 token');
        return;
      }
      // 如果用户在输入框里改了 token，先存
      if (t) await (window as any).api.sync.setConfig({ token: t });
      const res = await (window as any).api.sync.validateToken(t || '__use_saved__');
      // backend 不接 __use_saved__，简单做：必须传一个 token；让用户先点保存
      if (!t) { setValidateMsg('请重新输入 token 并保存后再测试'); return; }
      setValidateMsg(res.ok ? '✓ token 有效' : `✗ 失败：${res.error || '无权限'}`);
    } catch (err: any) {
      setValidateMsg('✗ ' + (err?.message ?? String(err)));
    }
  };

  const onRunNow = async () => {
    setBusy(true);
    setRunMsg('同步中...');
    try {
      const raw = localStorage.getItem(SPELL_SESSION_KEY);
      let savedAt = 0;
      if (raw) {
        try { savedAt = (JSON.parse(raw) as { savedAt?: number }).savedAt || 0; } catch {}
      }
      const res = await (window as any).api.sync.run({
        spellSessionPayload: raw,
        spellSessionSavedAt: savedAt
      });
      if (res.spellSessionPayload) {
        localStorage.setItem(SPELL_SESSION_KEY, res.spellSessionPayload);
      }
      if (res.ok) {
        const c = res.mergedCounts;
        setRunMsg(c
          ? `✓ 完成 — words +${c.words} · srs +${c.srsState} · notes +${c.notes} · note_srs +${c.noteSrsState} · logs +${c.reviewLogs} · note_logs +${c.noteReviewLogs}`
          : '✓ 完成');
      } else {
        setRunMsg('✗ ' + (res.error || '未知错误'));
      }
      await refresh();
    } catch (err: any) {
      setRunMsg('✗ ' + (err?.message ?? String(err)));
    } finally { setBusy(false); }
  };

  const onListGists = async () => {
    setBusy(true);
    setRunMsg(null);
    try {
      const res = await (window as any).api.sync.listSyncGists();
      if (res.ok) {
        setGistList(res.gists);
      } else {
        setRunMsg('✗ ' + (res.error || '获取失败'));
        setGistList(null);
      }
    } catch (err: any) {
      setRunMsg('✗ ' + (err?.message ?? String(err)));
    } finally { setBusy(false); }
  };

  const onAdoptGist = async (gistId: string) => {
    setBusy(true);
    setRunMsg('切换并同步中...');
    try {
      await (window as any).api.sync.setConfig({ gistId });
      // 立刻同步一次拉取该 gist 内容
      const raw = localStorage.getItem(SPELL_SESSION_KEY);
      let savedAt = 0;
      if (raw) {
        try { savedAt = (JSON.parse(raw) as { savedAt?: number }).savedAt || 0; } catch {}
      }
      const res = await (window as any).api.sync.run({ spellSessionPayload: raw, spellSessionSavedAt: savedAt });
      if (res?.spellSessionPayload) localStorage.setItem(SPELL_SESSION_KEY, res.spellSessionPayload);
      if (res.ok) {
        setRunMsg(`✓ 已切换到 ${gistId.slice(0, 8)}…，并已同步`);
      } else {
        setRunMsg('✗ ' + (res.error || '同步失败'));
      }
      await refresh();
      // 重新刷新一下 gist 列表
      const list = await (window as any).api.sync.listSyncGists();
      if (list.ok) setGistList(list.gists);
    } catch (err: any) {
      setRunMsg('✗ ' + (err?.message ?? String(err)));
    } finally { setBusy(false); }
  };

  if (!status) return <div className="card"><p>加载中…</p></div>;

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>云同步</h2>
      <p className="muted">
        通过 GitHub Gist 在多台电脑之间同步单词、笔记、复习日志、拼写复习进度。
        不需要安装 git，只要 token 即可。
      </p>

      <div style={{ marginTop: 20, padding: 16, border: '1px solid #e6e8ef', borderRadius: 8 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 0 }}>
          <input
            type="checkbox"
            checked={status.enabled}
            disabled={busy || !status.hasToken}
            onChange={e => onToggle(e.target.checked)}
          />
          <span><strong>启用云同步</strong> {!status.hasToken && <span className="muted">(先设置 token)</span>}</span>
        </label>
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>GitHub Personal Access Token</h3>
        <p className="muted" style={{ fontSize: 13 }}>
          打开 GitHub → Settings → Developer settings → Personal access tokens (classic) → Generate new token，
          只勾 <code>gist</code> 权限即可。生成后粘贴到下面。
        </p>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label>Token {status.hasToken && <span className="muted">(已设置；填新值会替换)</span>}</label>
            <input
              type="password"
              value={token}
              placeholder={status.hasToken ? '••••••••（保留原值留空）' : 'ghp_...'}
              onChange={e => { setToken(e.target.value); setTokenTouched(true); }}
            />
          </div>
          <button onClick={onSaveToken} disabled={busy || !tokenTouched || !token.trim()}>保存 token</button>
          <button className="ghost" onClick={onValidate} disabled={busy}>测试连接</button>
        </div>
        {validateMsg && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{validateMsg}</div>}
      </div>

      <div style={{ marginTop: 20 }}>
        <h3>状态</h3>
        <div className="muted" style={{ fontSize: 13, lineHeight: 1.8 }}>
          <div>Gist ID: <code>{status.gistId ?? '(未创建，首次同步时自动建)'}</code></div>
          <div>上次同步: {status.lastSyncAt ? new Date(status.lastSyncAt).toLocaleString() : '从未'}</div>
          {status.lastError && <div style={{ color: '#b1261e' }}>上次错误: {status.lastError}</div>}
        </div>
        <div className="row" style={{ marginTop: 12 }}>
          <button onClick={onRunNow} disabled={busy || !status.enabled}>立即同步</button>
          <button className="ghost" onClick={onListGists} disabled={busy || !status.hasToken}>查看云端 gist</button>
        </div>
        {runMsg && <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{runMsg}</div>}

        {gistList && (
          <div style={{ marginTop: 12, padding: 12, border: '1px solid #e6e8ef', borderRadius: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
              当前 token 下找到 {gistList.length} 个 french-deck-sync gist
              {gistList.length > 1 && <span style={{ color: '#b1261e' }}> — 多个机器各自创建了，请选一个统一用</span>}
            </div>
            {gistList.length === 0 && <div className="muted" style={{ fontSize: 13 }}>没找到。可能是别的机器还没成功推送过；或者那台机器用的是另一个 token。</div>}
            {gistList.map(g => (
              <div key={g.id} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 0', borderTop: '1px solid #eef0f4'
              }}>
                <code style={{ fontSize: 12 }}>{g.id}</code>
                {g.id === status.gistId && <span className="tag">当前</span>}
                {g.id !== status.gistId && (
                  <button className="ghost" style={{ padding: '4px 10px', fontSize: 12, marginLeft: 'auto' }}
                    onClick={() => onAdoptGist(g.id)} disabled={busy}>
                    切换到这个
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
