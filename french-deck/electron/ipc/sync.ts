import { ipcMain } from 'electron';
import { loadConfig, saveConfig, publicView } from '../sync/config.js';
import { runSync } from '../sync/sync.js';
import { validateToken } from '../sync/gist.js';

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

  ipcMain.handle('sync:run', async (_e, opts: {
    spellSessionPayload?: string | null;
    spellSessionSavedAt?: number;
  } = {}) => {
    const result = await runSync(opts);
    return { ...result, status: publicView(loadConfig()) };
  });
}
