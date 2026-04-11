import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { configSchema, type GVPConfig } from './schema.js';
import { ConfigError } from '../errors.js';

/** Config layer paths in priority order (closest scope first) */
export interface ConfigPaths {
  system?: string; // /etc/gvp/config.yaml
  global?: string; // ~/.config/gvp/config.yaml
  project?: string; // .gvp/config.yaml (walk-backwards discovery)
  local?: string; // .gvp.yaml (walk-backwards discovery)
}

/**
 * Discover config files by walking backwards from cwd (CFG-1, DEC-8.9).
 * When storePath is provided, use it directly for project/local config
 * discovery instead of walk-back.
 */
export function discoverConfigPaths(cwd: string = process.cwd(), storePath?: string): ConfigPaths {
  const paths: ConfigPaths = {};

  // System config
  const systemPath = '/etc/gvp/config.yaml';
  if (fs.existsSync(systemPath)) paths.system = systemPath;

  // Global config
  const home = process.env.HOME || process.env.USERPROFILE || '';
  if (home) {
    const globalPath = path.join(home, '.config', 'gvp', 'config.yaml');
    if (fs.existsSync(globalPath)) paths.global = globalPath;
  }

  // Walk backwards for project and local configs
  if (storePath) {
    // --store: store IS the .gvp/ directory; config.yaml lives directly inside
    const projectPath = path.join(storePath, 'config.yaml');
    if (fs.existsSync(projectPath)) paths.project = projectPath;
  } else {
    // Default: walk backwards from cwd
    let current = path.resolve(cwd);
    while (true) {
      const projectPath = path.join(current, '.gvp', 'config.yaml');
      const localPath = path.join(current, '.gvp.yaml');

      if (!paths.project && fs.existsSync(projectPath)) paths.project = projectPath;
      if (!paths.local && fs.existsSync(localPath)) paths.local = localPath;

      const parent = path.dirname(current);
      if (parent === current) break; // filesystem root
      current = parent;
    }
  }

  return paths;
}

/**
 * Apply env var overrides for config paths (DEC-8.1).
 * Empty string or /dev/null means skip that layer.
 */
export function applyEnvVarOverrides(paths: ConfigPaths): ConfigPaths {
  const envMap: Record<keyof ConfigPaths, string> = {
    system: 'GVP_CONFIG_SYSTEM',
    global: 'GVP_CONFIG_GLOBAL',
    project: 'GVP_CONFIG_PROJECT',
    local: 'GVP_CONFIG_LOCAL',
  };

  const result = { ...paths };

  for (const [key, envVar] of Object.entries(envMap)) {
    const envValue = process.env[envVar];
    if (envValue !== undefined) {
      if (envValue === '' || envValue === '/dev/null') {
        delete result[key as keyof ConfigPaths];
      } else {
        result[key as keyof ConfigPaths] = envValue;
      }
    }
  }

  return result;
}

/**
 * Load a single YAML config file, returning empty object if not found.
 */
function loadConfigFile(filePath: string): Record<string, unknown> {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(content);
    if (parsed === null || parsed === undefined) return {};
    if (typeof parsed !== 'object') {
      throw new ConfigError(
        `Config file ${filePath} must be a YAML mapping, got ${typeof parsed}`,
      );
    }
    return parsed as Record<string, unknown>;
  } catch (e) {
    if (e instanceof ConfigError) throw e;
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw new ConfigError(`Failed to load config file ${filePath}: ${(e as Error).message}`);
  }
}

/**
 * Merge config layers (CFG-2: closer scope wins on conflict).
 * Order: system < global < project < local (local wins).
 */
export function mergeConfigs(...layers: Record<string, unknown>[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const layer of layers) {
    for (const [key, value] of Object.entries(layer)) {
      if (key === 'suppress_diagnostics' && Array.isArray(value)) {
        // Union merge for suppress_diagnostics
        const existing = result[key] as string[] | undefined;
        result[key] = [...new Set([...(existing || []), ...value])];
      } else if (key === 'validation_rules' && Array.isArray(value)) {
        // Concatenate for validation_rules
        const existing = result[key] as unknown[] | undefined;
        result[key] = [...(existing || []), ...value];
      } else if (key === 'strict') {
        // OR merge for strict (any source enabling wins — once true, stays true)
        if (value === true || result[key] === true) {
          result[key] = true;
        } else {
          result[key] = value;
        }
      } else {
        // Default: closer scope wins (later layer overwrites)
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * Apply inline -c overrides (DEC-8.1: highest precedence).
 * Supports dot-separated keys: -c display.truncation_width=80
 */
export function applyInlineOverrides(
  config: Record<string, unknown>,
  overrides: Record<string, string>,
): Record<string, unknown> {
  const result = { ...config };

  for (const [key, rawValue] of Object.entries(overrides)) {
    // Parse value: try boolean, number, then string
    let value: unknown = rawValue;
    if (rawValue === 'true') value = true;
    else if (rawValue === 'false') value = false;
    else if (!isNaN(Number(rawValue)) && rawValue !== '') value = Number(rawValue);

    // Handle dot-separated keys
    const parts = key.split('.');
    if (parts.length === 1) {
      result[key] = value;
    } else {
      let current: Record<string, unknown> = result;
      for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i]!;
        if (!(part in current) || typeof current[part] !== 'object') {
          current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
      }
      current[parts[parts.length - 1]!] = value;
    }
  }

  return result;
}

/** Options for config loading */
export interface LoadConfigOptions {
  /** Path to specific config file (--config flag, replaces discovery) */
  configPath?: string;
  /** Skip all config files (--no-config flag) */
  noConfig?: boolean;
  /** Inline overrides from -c flag */
  inlineOverrides?: Record<string, string>;
  /** Working directory for discovery */
  cwd?: string;
  /** Store root path (--store flag): use for project/local config discovery instead of walk-back */
  storePath?: string;
}

/**
 * Load, merge, and validate the full config (DEC-5.13: eager validation).
 *
 * Pipeline: discover -> env vars -> load files -> merge -> inline overrides -> validate
 */
export function loadConfig(options: LoadConfigOptions = {}): GVPConfig {
  // --no-config disables everything (DEC-8.1)
  if (options.noConfig) {
    let raw: Record<string, unknown> = {};
    if (options.inlineOverrides) {
      raw = applyInlineOverrides(raw, options.inlineOverrides);
    }
    return configSchema.parse(raw);
  }

  let raw: Record<string, unknown>;

  if (options.configPath) {
    // --config <path>: load only this file, replacing discovery (DEC-8.1)
    raw = loadConfigFile(options.configPath);
  } else {
    // Normal discovery
    let paths = discoverConfigPaths(options.cwd, options.storePath);
    paths = applyEnvVarOverrides(paths);

    // Load in priority order: system, global, project, local
    const layers: Record<string, unknown>[] = [];
    if (paths.system) layers.push(loadConfigFile(paths.system));
    if (paths.global) layers.push(loadConfigFile(paths.global));
    if (paths.project) layers.push(loadConfigFile(paths.project));
    if (paths.local) layers.push(loadConfigFile(paths.local));

    raw = mergeConfigs(...layers);
  }

  // Apply inline overrides (highest precedence)
  if (options.inlineOverrides) {
    raw = applyInlineOverrides(raw, options.inlineOverrides);
  }

  // Eager validation (DEC-5.13)
  try {
    return configSchema.parse(raw);
  } catch (e) {
    throw new ConfigError(`Invalid config: ${(e as Error).message}`);
  }
}
