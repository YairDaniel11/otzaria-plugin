import { app, BrowserWindow, dialog, ipcMain, shell, IpcMainInvokeEvent } from 'electron';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { runLibraryScan, ScanProgressEvent } from './core/libraryScan';
import { MissingBookmarksChoice } from './core/wordDocxProcessor';

let mainWindow: BrowserWindow | null = null;

/** בקשות החלטה על סימניות חסרות שממתינות כרגע לתשובה מהרנדרר, לפי requestId. */
const pendingBookmarkDecisions = new Map<string, (choice: MissingBookmarksChoice) => void>();

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (process.env.OTZARIA_DEBUG_CONSOLE === '1') {
    mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
      console.log(`[renderer console level=${level}] ${message} (${sourceId}:${line})`);
    });
    mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription) => {
      console.log(`[did-fail-load] ${errorCode} ${errorDescription}`);
    });
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// --- IPC: בחירת תיקייה עם דיאלוג native אמיתי של המערכת ---
ipcMain.handle('dialog:choose-folder', async () => {
  if (!mainWindow) return null;
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'בחר תיקיית ספרייה אישית לסריקה',
  });
  if (result.canceled || result.filePaths.length === 0) return null;
  return result.filePaths[0];
});

// --- IPC: הפעלת סריקה, עם דיווח התקדמות חי ---
ipcMain.handle('scan:start', async (event: IpcMainInvokeEvent, folder: string, outputSubfolder?: string) => {
  const sender = event.sender;

  const result = await runLibraryScan(
    folder,
    { companionSubfolder: outputSubfolder },
    {
      onProgress: (evt: ScanProgressEvent) => {
        sender.send('scan:progress', evt);
      },
      resolveBookmarksChoice: (fileLabel, missingCount, absPath) => {
        return new Promise<MissingBookmarksChoice>((resolve) => {
          const requestId = randomUUID();
          pendingBookmarkDecisions.set(requestId, resolve);
          sender.send('scan:bookmark-request', { requestId, fileLabel, missingCount, filePath: absPath });
        });
      },
    }
  );

  return result;
});

// --- IPC: תשובת המשתמש להחלטת סימניות חסרות (מגיעה מהמודל ברנדרר) ---
ipcMain.handle(
  'scan:bookmark-response',
  (_event: IpcMainInvokeEvent, payload: { requestId: string; choice: MissingBookmarksChoice }) => {
    const resolver = pendingBookmarkDecisions.get(payload.requestId);
    if (!resolver) return false;
    pendingBookmarkDecisions.delete(payload.requestId);
    resolver(payload.choice);
    return true;
  }
);

// --- IPC: חשיפת קובץ/תיקייה בסייר הקבצים של Windows ---
ipcMain.handle('shell:show-in-folder', (_event: IpcMainInvokeEvent, targetPath: string) => {
  shell.showItemInFolder(targetPath);
});
