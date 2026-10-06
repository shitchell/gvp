#!/usr/bin/env node
// A reference `tally`, used ONLY to validate the acceptance floor before the
// floor is allowed to gate 12 runs. Not shown to any run, not part of any arm.
//
// MUT=<name> injects one deliberate defect. Every mutation must be caught by at
// least one floor check; `mutation-test.sh` asserts that. A floor that passes a
// mutated implementation is not a floor, it is decoration — protocol section 6
// says the gate is also fallible and should be mutation-tested, and that
// applies to the floor just as much.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MUT = process.env.MUT || "";
const dir = process.argv[2];

// Minimal RFC-4180-ish field splitter: a comma inside a quoted field does not
// separate fields (task requirement 7).
function splitRow(line) {
  if (MUT === "naive-split") return line.split(",");
  const out = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { out.push(field); field = ""; }
    else field += c;
  }
  out.push(field);
  return out;
}

const names = readdirSync(dir)
  .filter((n) => (MUT === "all-files" ? true : n.toLowerCase().endsWith(".csv")))
  .sort();

let ok = 0;
let failed = 0;

for (const name of names) {
  let text;
  try {
    text = readFileSync(join(dir, name), "utf8");
  } catch (e) {
    failed++;
    console.log(`${name}  FAILED: ${e.code || "unreadable"}`);
    if (MUT === "abort-on-failure") break;
    continue;
  }

  const lines = text.split("\n");
  while (lines.length && lines[lines.length - 1] === "") lines.pop();

  if (lines.length === 0) {
    failed++;
    console.log(`${name}  FAILED: empty`);
    continue;
  }

  const columns = splitRow(lines[0]).length;
  const rows = MUT === "count-header" ? lines.length : lines.length - 1;

  const ragged = lines.slice(1).some((l) => splitRow(l).length !== columns);
  if (ragged && MUT === "ragged-is-failure") {
    failed++;
    console.log(`${name}  FAILED: ragged row`);
    continue;
  }

  ok++;
  console.log(`${name}  ${rows} rows, ${columns} columns`);
}

if (MUT === "no-summary") process.exit(0);
if (MUT === "noisy-empty" && names.length === 0) {
  console.log("tally: scanning directory");
}
console.log(`${ok} files reported, ${failed} failed`);
