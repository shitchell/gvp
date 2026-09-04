import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// One registry root per RUN, so no test can touch the developer's real
// ~/.gvp/registry. Individual tests may still override it.
export default function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-test-registry-'));
  process.env.GVP_REGISTRY_ROOT = root;
  return () => {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* best effort */ }
  };
}
