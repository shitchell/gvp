#!/usr/bin/env node
// Reduces the recorded request log to shell-assignable booleans, so the floor
// script never has to nest quoting inside an eval.
// usage: node assert.mjs <logfile> <expected-token>
import fs from 'node:fs';
const [log, tok] = process.argv.slice(2);
const rows = fs
  .readFileSync(log, 'utf8')
  .trim()
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l));
const posts = rows.filter((r) => r.method === 'POST');
const bodyId = (r) => {
  try {
    return JSON.parse(r.body).id;
  } catch {
    return null;
  }
};
const out = {
  COUNT: rows.length,
  THREE_POSTS: posts.length === 3 ? 1 : 0,
  PATH_JOBS: rows.length && rows.every((r) => r.url.replace(/\/+$/, '').endsWith('/jobs')) ? 1 : 0,
  BODIES: ['alpha', 'beta', 'gamma'].every((id) => rows.some((r) => bodyId(r) === id)) ? 1 : 0,
  AUTH: rows.length && rows.every((r) => (r.headers.authorization || '') === `Bearer ${tok}`) ? 1 : 0,
  CTYPE: rows.length && rows.every((r) => /application\/json/.test(r.headers['content-type'] || '')) ? 1 : 0,
  NO_TXT: rows.some((r) => bodyId(r) === 'notes' || /not a job/.test(r.body)) ? 0 : 1,
};
for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
