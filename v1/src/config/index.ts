export type { GVPConfig } from './schema.js';
export { configSchema, userIdentitySchema } from './schema.js';
export {
  loadConfig,
  discoverConfigPaths,
  mergeConfigs,
  applyInlineOverrides,
  applyEnvVarOverrides,
} from './loader.js';
export type { LoadConfigOptions, ConfigPaths } from './loader.js';
