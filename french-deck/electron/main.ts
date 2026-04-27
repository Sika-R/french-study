import { app, BrowserWindow } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from '../server/db/migrate.js';
import { lexique, defaultLexiquePath } from '../server/dict/lexique.js';
import { verbiste, defaultVerbistePaths } from '../server/dict/verbiste.js';
import { registerWordHandlers } from './ipc/words.js';
import { registerLookupHandlers } from './ipc/lookup.js';
import { registerReviewHandlers } from './ipc/review.js';
import { registerPracticeHandlers } from './ipc/practice.js';
import { registerNoteHandlers } from './ipc/notes.js';
import { registerSyncHandlers } from './ipc/sync.js';
import { loadConfig } from './sync/config.js';
import { runSync } from './sync/sync.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function resourcesDir(): string {
  // In dev, electron-vite runs from project root; resources are at ./resources
  // In packaged build, resources are bundled into process.resourcesPath
  if (app.isPackaged) return process.resourcesPath;
  return path.join(process.cwd(), 'resources');
}

async function createWindow(): Promise<void> {
  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    title: 'French Deck',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (process.env['ELECTRON_RENDERER_URL']) {
    await win.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    await win.loadFile(path.join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(async () => {
  migrate();
  const res = resourcesDir();
  // Kick off async loading; UI works without dictionaries (just no auto-detection)
  lexique.load(defaultLexiquePath(res)).catch(err => console.warn('lexique load:', err));
  const vp = defaultVerbistePaths(res);
  try { verbiste.load(vp.verbs, vp.conj); } catch (err) { console.warn('verbiste load:', err); }

  registerWordHandlers();
  registerLookupHandlers();
  registerReviewHandlers();
  registerPracticeHandlers();
  registerNoteHandlers();
  registerSyncHandlers();

  await createWindow();

  // 启动后异步触发一次同步（不阻塞 UI）；spell session 由 renderer 自己 mount 时再 push 一次
  if (loadConfig().enabled) {
    runSync().catch(err => console.warn('[startup sync] failed:', err));
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
