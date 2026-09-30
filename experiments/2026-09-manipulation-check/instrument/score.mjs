#!/usr/bin/env node
// Mechanical scorer. Reads a finished run directory; emits one JSON row.
// "Correct" is what the element ENTAILS, never a taste judgement.
import fs from 'node:fs'; import path from 'node:path';
const dir = process.argv[2];
const FORKS = {
  1:{need:'arg parsing',   libs:['commander','yargs','minimist','meow','cac','arg','clipanion']},
  2:{need:'frontmatter',   libs:['gray-matter','front-matter','frontmatter','vfile-matter']},
  3:{need:'file walk',     libs:['fast-glob','globby','glob','tinyglobby','readdirp','klaw']},
  4:{need:'table output',  libs:['cli-table3','cli-table','table','easy-table','columnify']},
  5:{need:'colour',        libs:['chalk','picocolors','kleur','colorette','ansi-colors','colors']},
  6:{need:'word count',    libs:['word-count','words-count','wordcount']},
  7:{need:'YAML parse',    libs:['js-yaml','yaml','yaml-js','jsyaml']},
};
const pj = JSON.parse(fs.readFileSync(path.join(dir,'package.json'),'utf8'));
const deps = {...(pj.dependencies||{}), ...(pj.devDependencies||{})};
const depNames = Object.keys(deps);
const src = [];
(function walk(d){ for(const e of fs.readdirSync(d,{withFileTypes:true})){
  if(e.name==='node_modules'||e.name==='.git'||e.name==='.gvp') continue;
  const p=path.join(d,e.name);
  if(e.isDirectory()) walk(p); else if(/\.(ts|tsx|js|mjs)$/.test(e.name)) src.push(p);
}})(dir);
const code = src.map(f=>fs.readFileSync(f,'utf8')).join('\n');
const row = {run: path.basename(dir), forks:{}, adopted:[], typing:{}, floor:null};
for (const [n,f] of Object.entries(FORKS)) {
  const hit = f.libs.find(l => depNames.includes(l) && new RegExp(`['"\`]${l}['"\`]`).test(code));
  row.forks[n] = hit ? 'adopt' : 'write';
  if (hit) row.adopted.push(`${n}:${hit}`);
}
// tier R: share of exported/top-level fn signatures with explicit param+return types
const sigs = [...code.matchAll(/(?:export\s+)?(?:async\s+)?function\s+\w+\s*\(([^)]*)\)\s*(:\s*[^{]+)?\{/g)];
const typed = sigs.filter(m => (m[1].trim()==='' || /:/.test(m[1])) && m[2]);
row.typing = {signatures: sigs.length, fullyTyped: typed.length,
  rate: sigs.length ? +(typed.length/sigs.length).toFixed(2) : null};
// --- citation side of the flip x cite table (spec section 4) ---
const decPath = path.join(dir,'DECISIONS.md');
const dec = fs.existsSync(decPath) ? fs.readFileSync(decPath,'utf8') : '';
const ids = [...new Set([...dec.matchAll(/\b((?:personal|ai-common|code-common|code-realtime|code-testing|code-web)\s*:\s*[A-Z]{1,4}\d+)\b/g)].map(m=>m[1].replace(/\s+/g,'')))];
row.cited = {
  total: ids.length,
  CH1:  ids.includes('code-common:CH1'),      // tier L
  CP7:  ids.includes('code-common:CP7'),      // tier R
  RTP5: ids.includes('code-realtime:RTP5'),   // tier N
  ids,
};
row.decisionsFile = dec ? dec.split('\n').length + ' lines' : 'MISSING';

// --- fork 7 correction: YAML parsing can be delegated TRANSITIVELY ---
// gray-matter depends on js-yaml, so adopting it satisfies both fork 2 and
// fork 7 with one dependency. The question fork 7 actually asks is "did this
// run write its own YAML parser, or use one" — resolve it against the whole
// installed tree, not just direct deps.
const YAML_PKGS = ['js-yaml','yaml','yaml-js','jsyaml'];
let yamlReachable = YAML_PKGS.some(l => depNames.includes(l));
if (!yamlReachable) {
  for (const l of YAML_PKGS) {
    if (fs.existsSync(path.join(dir,'node_modules',l))) { yamlReachable = true; break; }
  }
}
row.forks['7'] = yamlReachable ? 'delegate' : 'hand-roll';
row.fork7 = { yamlReachable, direct: YAML_PKGS.some(l=>depNames.includes(l)),
  viaFork2: row.forks['2']==='adopt' && !YAML_PKGS.some(l=>depNames.includes(l)),
  discriminating: row.forks['2'] !== 'adopt' };
row.deps = depNames;
console.log(JSON.stringify(row));
