import * as path from 'path';

/**
 * Registry root. Honors GVP_REGISTRY_ROOT (D22), which addresses the
 * ROOT rather than the by-id keyspace — the original getRegistryDir()
 * conflated the two, which blocked adding a sibling keyspace.
 */
export function getRegistryRoot(): string {
  const override = process.env.GVP_REGISTRY_ROOT;
  if (override && override.length > 0) return override;
  const home = process.env.HOME || process.env.USERPROFILE || '';
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
