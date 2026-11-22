// Servidor estático do Mente em Dia — sem banco de dados.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT || 3000);
const HOST = '127.0.0.1';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.ico': 'image/x-icon'
};

http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405); return res.end('Método não permitido.');
  }
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, `http://${HOST}:${PORT}`).pathname); }
  catch { res.writeHead(400); return res.end('Endereço inválido.'); }
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.resolve(ROOT, `.${pathname}`);
  if (!filePath.startsWith(ROOT + path.sep)) {
    res.writeHead(403); return res.end('Acesso negado.');
  }
  fs.readFile(filePath, (error, content) => {
    if (error) { res.writeHead(404); return res.end('Arquivo não encontrado.'); }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  });
}).listen(PORT, HOST, () => {
  console.log('\n==============================================');
  console.log('  MENTE EM DIA — SERVIDOR INICIADO');
  console.log('  Armazenamento: localStorage do navegador');
  console.log(`  Aplicativo: http://localhost:${PORT}`);
  console.log('  Para encerrar, pressione Ctrl + C.');
  console.log('==============================================\n');
});
