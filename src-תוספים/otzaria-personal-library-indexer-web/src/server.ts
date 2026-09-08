import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { spawn, exec } from 'child_process';
import { randomUUID } from 'crypto';
import { ScanRunner, ScanSummary } from './scanRunner';
import { MissingBookmarksChoice } from './wordDocxProcessor';

const PORT = Number(process.env.PORT) || 4173;
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const PICK_FOLDER_SCRIPT = path.join(__dirname, '..', 'scripts', 'pick-folder.ps1');

interface ScanSession {
  runner: ScanRunner;
  events: Array<{ event: string; data: unknown }>;
  clients: Set<http.ServerResponse>;
  done: boolean;
  summary: ScanSummary | null;
  error: string | null;
}

const sessions = new Map<string, ScanSession>();

function sseWrite(res: http.ServerResponse, event: string, data: unknown) {
  res.write(`event: ${event}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcast(session: ScanSession, event: string, data: unknown) {
  session.events.push({ event, data });
  for (const client of session.clients) {
    sseWrite(client, event, data);
  }
}

function createSession(): { id: string; session: ScanSession } {
  const id = randomUUID();
  const runner = new ScanRunner();
  const session: ScanSession = {
    runner,
    events: [],
    clients: new Set(),
    done: false,
    summary: null,
    error: null,
  };
  sessions.set(id, session);

  const forward = (event: string) => (data: unknown) => broadcast(session, event, data);
  runner.on('log', forward('log'));
  runner.on('phase', forward('phase'));
  runner.on('files-found', forward('files-found'));
  runner.on('file-start', forward('file-start'));
  runner.on('file-done', forward('file-done'));
  runner.on('file-skipped', forward('file-skipped'));
  runner.on('file-error', forward('file-error'));
  runner.on('question', forward('question'));
  runner.on('done', forward('done'));

  return { id, session };
}

function readJsonBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 10 * 1024 * 1024) {
        reject(new Error('גוף בקשה גדול מדי'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, data: unknown) {
  const buf = Buffer.from(JSON.stringify(data), 'utf8');
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
  });
  res.end(buf);
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function serveStatic(reqPath: string, res: http.ServerResponse): boolean {
  const rel = reqPath === '/' ? '/index.html' : reqPath;
  const filePath = path.join(PUBLIC_DIR, rel);
  if (!filePath.startsWith(PUBLIC_DIR)) return false;
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) return false;
  const ext = path.extname(filePath);
  const buf = fs.readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
  res.end(buf);
  return true;
}

/** מריץ סקריפט PowerShell של דיאלוג בחירת תיקייה, ומחזיר את הנתיב שנבחר (או null אם בוטל). */
function pickFolderViaDialog(): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-Sta', '-ExecutionPolicy', 'Bypass', '-File', PICK_FOLDER_SCRIPT],
      { windowsHide: false }
    );
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d.toString('utf8')));
    child.stderr.on('data', (d) => (stderr += d.toString('utf8')));
    child.on('error', reject);
    child.on('close', (code) => {
      if (code !== 0 && stderr.trim()) {
        reject(new Error(`שגיאה בהרצת דיאלוג בחירת התיקייה: ${stderr.trim()}`));
        return;
      }
      const trimmed = stdout.trim();
      resolve(trimmed.length > 0 ? trimmed : null);
    });
  });
}

/** פותח סייר קבצים (Explorer) על תיקייה נתונה, בכלים העומדים לרשות Windows בלבד. */
function openFolderInExplorer(folderPath: string): void {
  exec(`explorer.exe "${folderPath.replace(/"/g, '')}"`, () => {
    /* explorer.exe מחזיר לעיתים קוד יציאה שאינו 0 גם כשהצליח לפתוח - מתעלמים משגיאות */
  });
}

function openBrowser(url: string): void {
  exec(`start "" "${url}"`, { shell: 'cmd.exe' } as any, () => {
    /* אם לא הצליח, המשתמש יכול לפתוח ידנית - אין צורך להיכשל */
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://localhost:${PORT}`);
    const pathname = url.pathname;

    if (req.method === 'GET' && !pathname.startsWith('/api/')) {
      if (serveStatic(pathname, res)) return;
      if (pathname === '/') {
        sendJson(res, 404, { error: 'index.html not found' });
        return;
      }
    }

    if (req.method === 'POST' && pathname === '/api/pick-folder') {
      try {
        const folder = await pickFolderViaDialog();
        sendJson(res, 200, { folder });
      } catch (err) {
        sendJson(res, 500, { error: (err as Error).message });
      }
      return;
    }

    if (req.method === 'POST' && pathname === '/api/scan/start') {
      const body = await readJsonBody(req);
      const folder: string | undefined = body.folder;
      if (!folder || typeof folder !== 'string') {
        sendJson(res, 400, { error: 'חסר שדה folder' });
        return;
      }
      if (!fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) {
        sendJson(res, 400, { error: `התיקייה לא קיימת: ${folder}` });
        return;
      }
      const { id, session } = createSession();
      sendJson(res, 200, { scanId: id });

      session.runner
        .run({
          folder,
          indexPath: body.indexPath || undefined,
          companionSubfolder: body.companionSubfolder || null,
        })
        .then((summary) => {
          session.done = true;
          session.summary = summary;
        })
        .catch((err) => {
          session.done = true;
          session.error = (err as Error).message;
          broadcast(session, 'fatal-error', { message: session.error });
        });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/scan/stream') {
      const scanId = url.searchParams.get('id') || '';
      const session = sessions.get(scanId);
      if (!session) {
        sendJson(res, 404, { error: 'סשן סריקה לא נמצא' });
        return;
      }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write(': connected\n\n');
      // replay all events that already happened before this client connected
      for (const ev of session.events) {
        sseWrite(res, ev.event, ev.data);
      }
      if (session.done) {
        sseWrite(res, 'done', session.summary);
      }
      session.clients.add(res);
      req.on('close', () => {
        session.clients.delete(res);
      });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/scan/answer') {
      const body = await readJsonBody(req);
      const { scanId, questionId, choice } = body as {
        scanId: string;
        questionId: string;
        choice: MissingBookmarksChoice;
      };
      const session = sessions.get(scanId);
      if (!session) {
        sendJson(res, 404, { error: 'סשן סריקה לא נמצא' });
        return;
      }
      const ok = session.runner.answerQuestion(questionId, choice);
      sendJson(res, ok ? 200 : 409, { ok });
      return;
    }

    if (req.method === 'GET' && pathname === '/api/scan/result') {
      const scanId = url.searchParams.get('id') || '';
      const session = sessions.get(scanId);
      if (!session) {
        sendJson(res, 404, { error: 'סשן סריקה לא נמצא' });
        return;
      }
      if (!session.done) {
        sendJson(res, 202, { done: false });
        return;
      }
      if (session.error) {
        sendJson(res, 500, { done: true, error: session.error });
        return;
      }
      sendJson(res, 200, { done: true, summary: session.summary });
      return;
    }

    if (req.method === 'POST' && pathname === '/api/open-folder') {
      const body = await readJsonBody(req);
      const targetPath: string | undefined = body.path;
      if (!targetPath) {
        sendJson(res, 400, { error: 'חסר שדה path' });
        return;
      }
      const folder = fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()
        ? targetPath
        : path.dirname(targetPath);
      openFolderInExplorer(folder);
      sendJson(res, 200, { ok: true });
      return;
    }

    sendJson(res, 404, { error: 'נתיב לא נמצא' });
  } catch (err) {
    sendJson(res, 500, { error: (err as Error).message });
  }
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  // eslint-disable-next-line no-console
  console.log(`שרת סורק הספרייה האישית פועל: ${url}`);
  if (process.env.NO_OPEN_BROWSER !== '1') {
    openBrowser(url);
  }
});
