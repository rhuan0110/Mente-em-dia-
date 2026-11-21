// Servidor local do Mente em Dia: Node.js + SQLite (sql.js)
const http = require('http');
const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const ROOT = __dirname;
const DB_DIR = path.join(ROOT, 'database');
const DB_PATH = path.join(DB_DIR, 'mente_em_dia.sqlite3');
const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.ico': 'image/x-icon'
};

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'X-Content-Type-Options': 'nosniff' });
  res.end(body);
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 2_000_000) reject(new Error('Payload muito grande'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')); }
      catch { reject(new Error('JSON inválido')); }
    });
    req.on('error', reject);
  });
}

function rows(db, sql) {
  return db.prepare(sql).all();
}

function main() {
  fs.mkdirSync(DB_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  db.exec(`CREATE TABLE IF NOT EXISTS app_state (
    id INTEGER PRIMARY KEY CHECK(id=1), consent INTEGER NOT NULL DEFAULT 0,
    nickname TEXT NOT NULL DEFAULT '', updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS checkins (
    date TEXT PRIMARY KEY, mood REAL, stress REAL, sleep REAL, energy REAL,
    observation TEXT NOT NULL DEFAULT ''
  )`);
  db.exec(`CREATE TABLE IF NOT EXISTS journals (
    id TEXT PRIMARY KEY, date TEXT NOT NULL, time TEXT, created_at TEXT,
    feeling TEXT, emoji TEXT, value REAL, motive TEXT, text TEXT NOT NULL
  )`);
  db.prepare('INSERT OR IGNORE INTO app_state(id) VALUES(1)').run();

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${HOST}:${PORT}`);

    if (url.pathname === '/api/state' && req.method === 'GET') {
      const profile = rows(db, 'SELECT consent,nickname FROM app_state WHERE id=1')[0] || {};
      const entries = rows(db, 'SELECT date,mood,stress,sleep,energy,observation FROM checkins ORDER BY date');
      const journals = rows(db, 'SELECT id,date,time,created_at AS createdAt,feeling,emoji,value,motive,text FROM journals ORDER BY created_at');
      const state = { consent: !!profile.consent, nickname: profile.nickname || '', entries, journals };
      const hasData = !!(state.consent || state.nickname || entries.length || journals.length);
      return send(res, 200, JSON.stringify({ hasData, state }));
    }

    if (url.pathname === '/api/state' && req.method === 'PUT') {
      try {
        const data = await readJson(req);
        if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Dados inválidos');
        const entries = Array.isArray(data.entries) ? data.entries : [];
        const journals = Array.isArray(data.journals) ? data.journals : [];
        db.exec('BEGIN TRANSACTION');
        try {
          const profile = db.prepare('UPDATE app_state SET consent=?, nickname=?, updated_at=CURRENT_TIMESTAMP WHERE id=1');
          profile.run(data.consent ? 1 : 0, String(data.nickname || '').slice(0, 80));

          db.prepare('DELETE FROM checkins').run();
          const checkin = db.prepare(`INSERT OR REPLACE INTO checkins(date,mood,stress,sleep,energy,observation) VALUES(?,?,?,?,?,?)`);
          for (const item of entries) {
            if (!item || typeof item !== 'object' || !item.date) continue;
            checkin.run(String(item.date), item.mood ?? null, item.stress ?? null, item.sleep ?? null,
              item.energy ?? null, String(item.observation || '').slice(0, 5000));
          }

          db.prepare('DELETE FROM journals').run();
          const journal = db.prepare(`INSERT OR REPLACE INTO journals(id,date,time,created_at,feeling,emoji,value,motive,text) VALUES(?,?,?,?,?,?,?,?,?)`);
          for (const item of journals) {
            if (!item || typeof item !== 'object' || !item.id || !item.date) continue;
            journal.run(String(item.id), String(item.date), item.time ?? null, item.createdAt ?? null,
              item.feeling ?? null, item.emoji ?? null, item.value ?? null, item.motive ?? null,
              String(item.text || '').slice(0, 10000));
          }
          db.exec('COMMIT');
        } catch (error) {
          db.exec('ROLLBACK');
          throw error;
        }
        return send(res, 200, JSON.stringify({ ok: true }));
      } catch (error) {
        console.error('[Mente em Dia] Falha ao salvar:', error.message);
        return send(res, 400, JSON.stringify({ ok: false, message: 'Não foi possível salvar os dados.' }));
      }
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return send(res, 405, JSON.stringify({ error: 'Método não permitido.' }));
    }

    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { return send(res, 400, 'Endereço inválido.', 'text/plain; charset=utf-8'); }
    if (pathname === '/') pathname = '/index.html';
    const filePath = path.resolve(ROOT, `.${pathname}`);
    if (!filePath.startsWith(ROOT + path.sep) || filePath === DB_PATH) {
      return send(res, 403, 'Acesso negado.', 'text/plain; charset=utf-8');
    }
    fs.readFile(filePath, (error, content) => {
      if (error) return send(res, 404, 'Arquivo não encontrado.', 'text/plain; charset=utf-8');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff' });
      res.end(req.method === 'HEAD' ? undefined : content);
    });
  });

  server.listen(PORT, HOST, () => {
    console.log('\n==============================================');
    console.log('  MENTE EM DIA — SERVIDOR INICIADO');
    console.log('==============================================');
    console.log(`  Aplicativo: http://localhost:${PORT}`);
    console.log(`  Banco SQLite: ${DB_PATH}`);
    console.log('  Para encerrar, pressione Ctrl + C neste terminal.');
    console.log('==============================================\n');
  });
}

try { main(); } catch (error) {
  console.error('\nNão foi possível iniciar o Mente em Dia:', error);
  console.error('Confira se o Node.js 22.13 ou superior está instalado.');
  process.exit(1);
}
