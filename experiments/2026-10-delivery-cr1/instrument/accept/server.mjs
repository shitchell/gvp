#!/usr/bin/env node
// Recording stand-in for the job service the task describes.
// usage: node server.mjs <port> <logfile>   — one JSON line per request received.
import http from 'node:http';
import fs from 'node:fs';
const [port, log] = process.argv.slice(2);
fs.writeFileSync(log, '');
http
  .createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      fs.appendFileSync(
        log,
        JSON.stringify({ method: req.method, url: req.url, headers: req.headers, body }) + '\n',
      );
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: 'srv' }));
    });
  })
  .listen(Number(port), '127.0.0.1', () => process.stdout.write('ready\n'));
