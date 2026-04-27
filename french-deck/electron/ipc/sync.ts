import { ipcMain } from 'electron';
import { loadConfig, saveConfig, publicView } from '../sync/config.js';
import { runSync } from '../sync/sync.js';
import { validateToken, listMyGists } from '../sync/gist.js';

export function registerSyncHandlers(): void {
  ipcMain.handle('sync:status', () => publicView(loadConfig()));

  ipcMain.handle('sync:setConfig', (_e, patch: { enabled?: boolean; token?: string; gistId?: string | null }) => {
    const next = saveConfig(patch);
    return publicView(next);
  });

  ipcMain.handle('sync:validateToken', async (_e, token: string) => {
    try {
      const ok = await validateToken(token);
      return { ok };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  /** 列出当前 token 下所有 description=french-deck-sync 的 gist，给 UI 选 */
  ipcMain.handle('sync:listSyncGists', async () => {
    const cfg = loadConfig();
    if (!cfg.token) return { ok: false, error: '尚未保存 token' };
    try {
      const all = await listMyGists(cfg.token);
      const matches = all
        .filter(g => g.description === 'french-deck-sync')
        .map(g => ({ id: g.id, description: g.description }));
      return { ok: true, gists: matches };
    } catch (err: any) {
      return { ok: false, error: err?.message ?? String(err) };
    }
  });

  ipcMain.handle('sync:run', async (_e, opts: {
    spellSessionPayload?: string | null;
    spellSessionSavedAt?: number;
  } = {}) => {
    const result = await runSync(opts);
    return { ...result, status: publicView(loadConfig()) };
  });
}
