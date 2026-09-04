import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
export default function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cairn-test-registry-'));
  process.env.GVP_REGISTRY_ROOT = root;
  console.error('SETUP ROOT=' + root);
  return () => {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch { /* */ }
    console.error('TEARDOWN ROOT=' + root + ' exists=' + fs.existsSync(root));
  };
}
