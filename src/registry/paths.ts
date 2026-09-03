import * as os from 'os';
import * as path from 'path';

/**
 * Registry root. Honors GVP_REGISTRY_ROOT (D22), which addresses the
 * ROOT rather than the by-id keyspace — the original getRegistryDir()
 * conflated the two, which blocked adding a sibling keyspace.
 *
 * The override is resolved to an absolute path so that
 * `getRegistryRoot()` and `path.dirname(getProjectsDir())` agree for
 * trailing-slash input, and so a relative override is cwd-independent.
 *
 * The home fallback uses os.homedir() rather than `|| ''`: an empty
 * string makes path.join yield the RELATIVE path `.gvp/registry`, so
 * with HOME unset (systemd units, cron, some CI) recording would write
 * into whatever directory the process happened to be in. D43 makes that
 * reachable on every invocation. os.homedir() never returns '' and
 * already honors $HOME on POSIX, so test overrides still work — this is
 * the mechanism src/inheritance/source-resolver.ts already uses (P11).
 */
export function getRegistryRoot(): string {
  const override = process.env.GVP_REGISTRY_ROOT;
  if (override && override.length > 0) return path.resolve(override);
  const home = process.env.HOME || process.env.USERPROFILE || os.homedir();
  return path.join(home, '.gvp', 'registry');
}

/** Project entries keyspace (D22). */
export function getProjectsDir(): string {
  return path.join(getRegistryRoot(), 'by-id');
}

/** Library entries keyspace (D40, D51). */
export function getLibrariesDir(): string {
  return path.join(getRegistryRoot(), 'libraries');
}
