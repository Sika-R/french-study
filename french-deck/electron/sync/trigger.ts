/**
 * Debounced 触发器：写操作完成后调一下，~8s 内的多次调用合并为一次实际同步。
 */

import { runSync } from './sync.js';

let pendingTimer: NodeJS.Timeout | null = null;

export function scheduleSync(delayMs = 8000): void {
  if (pendingTimer) clearTimeout(pendingTimer);
  pendingTimer = setTimeout(async () => {
    pendingTimer = null;
    try {
      await runSync();
    } catch (err) {
      console.warn('[sync] scheduled run failed:', err);
    }
  }, delayMs);
}

export function cancelScheduledSync(): void {
  if (pendingTimer) { clearTimeout(pendingTimer); pendingTimer = null; }
}
