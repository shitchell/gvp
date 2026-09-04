import { describe, it, expect } from 'vitest';
import { configSchema } from '../../src/config/schema.js';

describe('registry default (D43)', () => {
  it('is enabled when the config omits the registry key entirely', () => {
    const cfg = configSchema.parse({});
    expect(cfg.registry?.enabled).toBe(true);
  });

  it('is enabled when registry is present but empty', () => {
    const cfg = configSchema.parse({ registry: {} });
    expect(cfg.registry?.enabled).toBe(true);
  });

  it('honors an explicit opt-out', () => {
    const cfg = configSchema.parse({ registry: { enabled: false } });
    expect(cfg.registry?.enabled).toBe(false);
  });
});
