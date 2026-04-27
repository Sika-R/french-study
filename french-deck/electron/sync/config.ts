import fs from 'node:fs';
import path from 'node:path';
import { app } from 'electron';

export interface SyncConfig {
  enabled: boolean;
  token: string;
  gistId: string | null;
  lastSyncAt: number;
  lastError: string | null;
}

const DEFAULT: SyncConfig = {
  enabled: false,
  token: '',
  gistId: null,
  lastSyncAt: 0,
  lastError: null
};

function configPath(): string {
  return path.join(app.getPath('userData'), 'sync-config.json');
}

export function loadConfig(): SyncConfig {
  try {
    const p = configPath();
    if (!fs.existsSync(p)) return { ...DEFAULT };
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as Partial<SyncConfig>;
    return { ...DEFAULT, ...parsed };
  } catch (err) {
    console.warn('[sync] loadConfig failed:', err);
    return { ...DEFAULT };
  }
}

export function saveConfig(patch: Partial<SyncConfig>): SyncConfig {
  const cur = loadConfig();
  const next = { ...cur, ...patch };
  try {
    fs.writeFileSync(configPath(), JSON.stringify(next, null, 2), 'utf8');
  } catch (err) {
    console.warn('[sync] saveConfig failed:', err);
  }
  return next;
}

/** 给 renderer 用的安全视图（不暴露 token 本体） */
export function publicView(cfg: SyncConfig) {
  return {
    enabled: cfg.enabled,
    hasToken: !!cfg.token,
    gistId: cfg.gistId,
    lastSyncAt: cfg.lastSyncAt,
    lastError: cfg.lastError
  };
}
