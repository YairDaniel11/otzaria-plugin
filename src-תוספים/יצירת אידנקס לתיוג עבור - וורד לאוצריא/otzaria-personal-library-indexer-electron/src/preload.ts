import { contextBridge, ipcRenderer } from 'electron';
import type { ScanProgressEvent, ScanResult } from './core/libraryScan';
import type { MissingBookmarksChoice } from './core/wordDocxProcessor';

export interface BookmarkRequestPayload {
  requestId: string;
  fileLabel: string;
  missingCount: number;
  filePath: string;
}

/**
 * ה-API היחיד שנחשף לרנדרר (contextIsolation מופעל, nodeIntegration כבוי) -
 * אוסף פונקציות מפורש וצר, בלי גישה כללית ל-Node/Electron מתוך דף הרינדור.
 */
const api = {
  chooseFolder: (): Promise<string | null> => ipcRenderer.invoke('dialog:choose-folder'),

  startScan: (folder: string, outputSubfolder?: string): Promise<ScanResult> =>
    ipcRenderer.invoke('scan:start', folder, outputSubfolder),

  onProgress: (callback: (event: ScanProgressEvent) => void): void => {
    ipcRenderer.on('scan:progress', (_event, data: ScanProgressEvent) => callback(data));
  },

  onBookmarkRequest: (callback: (payload: BookmarkRequestPayload) => void): void => {
    ipcRenderer.on('scan:bookmark-request', (_event, data: BookmarkRequestPayload) => callback(data));
  },

  respondBookmarkChoice: (requestId: string, choice: MissingBookmarksChoice): Promise<boolean> =>
    ipcRenderer.invoke('scan:bookmark-response', { requestId, choice }),

  showItemInFolder: (targetPath: string): Promise<void> => ipcRenderer.invoke('shell:show-in-folder', targetPath),
};

export type OtzariaIndexerApi = typeof api;

contextBridge.exposeInMainWorld('otzariaIndexer', api);
