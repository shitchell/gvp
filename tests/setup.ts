import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

// One registry root per RUN, so no test can touch the developer's real
// ~/.gvp/registry. Individual tests may still override GVP_REGISTRY_ROOT;
// this is the floor, not a ceiling.
//
// globalSetup, not setupFiles: setupFiles runs once per test FILE, which
// under the default forks pool accumulates one listener per file in a
// recycled worker and mints ~55 temp roots per run.
export default function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-test-registry-'));
  process.env.GVP_REGISTRY_ROOT = root;
  return () => {
    try {
      // maxRetries: the root is written concurrently by workers still
      // draining, so a bare rmSync races and leaked ~50% of runs.
      fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
    } catch (e) {
      // Never swallow silently: a leaking teardown is precisely the
      // failure you want to see, and it leaves real registry data in /tmp.
      process.stderr.write(`test teardown: failed to remove ${root}: ${(e as Error).message}\n`);
    }
  };
}
