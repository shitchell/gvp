import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as yaml from 'js-yaml';
import { configSchema } from '../../src/config/schema.js';
import {
  mergeConfigs,
  applyInlineOverrides,
  applyEnvVarOverrides,
  discoverConfigPaths,
  loadConfig,
} from '../../src/config/loader.js';
import { ConfigError } from '../../src/errors.js';

describe('configSchema', () => {
  it('validates a complete config', () => {
    const config = configSchema.parse({
      user: { name: 'Test User', email: 'test@example.com' },
      strict: true,
      suppress_diagnostics: ['W001', 'W002'],
      display: { truncation_width: 120 },
      default_timezone: 'America/New_York',
      strict_export_options: false,
      source: 'my-project',
      validation_rules: [{ type: 'custom' }],
      priority: { elements: 'descendant', definitions: 'ancestor' },
    });
    expect(config.user?.name).toBe('Test User');
    expect(config.strict).toBe(true);
    expect(config.suppress_diagnostics).toEqual(['W001', 'W002']);
    expect(config.display?.truncation_width).toBe(120);
    expect(config.priority?.elements).toBe('descendant');
    expect(config.priority?.definitions).toBe('ancestor');
  });

  it('applies defaults (strict=false, suppress_diagnostics=[])', () => {
    const config = configSchema.parse({});
    expect(config.strict).toBe(false);
    expect(config.suppress_diagnostics).toEqual([]);
    expect(config.strict_export_options).toBe(true);
    expect(config.validation_rules).toEqual([]);
  });

  it('validates user identity (DEC-4.3)', () => {
    const config = configSchema.parse({
      user: { name: 'Alice', email: 'alice@example.com' },
    });
    expect(config.user?.name).toBe('Alice');
    expect(config.user?.email).toBe('alice@example.com');
  });

  it('rejects invalid email', () => {
    expect(() =>
      configSchema.parse({
        user: { name: 'Alice', email: 'not-an-email' },
      }),
    ).toThrow();
  });

  it('allows unknown keys via passthrough', () => {
    const config = configSchema.parse({ future_key: 'hello' });
    expect((config as Record<string, unknown>).future_key).toBe('hello');
  });
});

describe('mergeConfigs', () => {
  it('later layer wins on normal keys', () => {
    const result = mergeConfigs(
      { source: 'system', default_timezone: 'UTC' },
      { source: 'local' },
    );
    expect(result.source).toBe('local');
    expect(result.default_timezone).toBe('UTC');
  });

  it('suppress_diagnostics uses union merge', () => {
    const result = mergeConfigs(
      { suppress_diagnostics: ['W001', 'W002'] },
      { suppress_diagnostics: ['W002', 'W003'] },
    );
    expect(result.suppress_diagnostics).toEqual(['W001', 'W002', 'W003']);
  });

  it('strict uses OR merge (any true wins)', () => {
    const result = mergeConfigs({ strict: false }, { strict: true });
    expect(result.strict).toBe(true);

    // Once strict is true, explicit false cannot override (OR merge: any true wins)
    const result2 = mergeConfigs({ strict: true }, { strict: false });
    expect(result2.strict).toBe(true);

    // But once true is set, later true keeps it
    const result3 = mergeConfigs({ strict: true }, { source: 'local' });
    expect(result3.strict).toBe(true);
  });

  it('validation_rules concatenates', () => {
    const result = mergeConfigs(
      { validation_rules: [{ rule: 'a' }] },
      { validation_rules: [{ rule: 'b' }] },
    );
    expect(result.validation_rules).toEqual([{ rule: 'a' }, { rule: 'b' }]);
  });
});

describe('applyInlineOverrides', () => {
  it('simple key=value', () => {
    const result = applyInlineOverrides({}, { source: 'test' });
    expect(result.source).toBe('test');
  });

  it('dot-separated keys', () => {
    const result = applyInlineOverrides({}, { 'display.truncation_width': '80' });
    expect((result.display as Record<string, unknown>).truncation_width).toBe(80);
  });

  it('boolean coercion', () => {
    const result = applyInlineOverrides({}, { strict: 'true' });
    expect(result.strict).toBe(true);

    const result2 = applyInlineOverrides({}, { strict: 'false' });
    expect(result2.strict).toBe(false);
  });

  it('number coercion', () => {
    const result = applyInlineOverrides({}, { 'display.truncation_width': '120' });
    expect((result.display as Record<string, unknown>).truncation_width).toBe(120);
  });

  it('keeps strings that are not booleans or numbers', () => {
    const result = applyInlineOverrides({}, { source: 'my-project' });
    expect(result.source).toBe('my-project');
  });
});

describe('applyEnvVarOverrides', () => {
  const savedEnv: Record<string, string | undefined> = {};
  const envVars = [
    'GVP_CONFIG_SYSTEM',
    'GVP_CONFIG_GLOBAL',
    'GVP_CONFIG_PROJECT',
    'GVP_CONFIG_LOCAL',
  ];

  beforeEach(() => {
    for (const v of envVars) {
      savedEnv[v] = process.env[v];
      delete process.env[v];
    }
  });

  afterEach(() => {
    for (const v of envVars) {
      if (savedEnv[v] === undefined) {
        delete process.env[v];
      } else {
        process.env[v] = savedEnv[v];
      }
    }
  });

  it('overrides path from env var', () => {
    process.env.GVP_CONFIG_GLOBAL = '/custom/config.yaml';
    const result = applyEnvVarOverrides({ global: '/original/config.yaml' });
    expect(result.global).toBe('/custom/config.yaml');
  });

  it('removes layer when env var is empty string', () => {
    process.env.GVP_CONFIG_SYSTEM = '';
    const result = applyEnvVarOverrides({ system: '/etc/gvp/config.yaml' });
    expect(result.system).toBeUndefined();
  });

  it('removes layer when env var is /dev/null', () => {
    process.env.GVP_CONFIG_LOCAL = '/dev/null';
    const result = applyEnvVarOverrides({ local: '/some/path.yaml' });
    expect(result.local).toBeUndefined();
  });
});

describe('loadConfig', () => {
  it('with noConfig returns defaults', () => {
    const config = loadConfig({ noConfig: true });
    expect(config.strict).toBe(false);
    expect(config.suppress_diagnostics).toEqual([]);
  });

  it('with noConfig + inline overrides applies overrides', () => {
    const config = loadConfig({
      noConfig: true,
      inlineOverrides: { strict: 'true', source: 'cli' },
    });
    expect(config.strict).toBe(true);
    expect(config.source).toBe('cli');
  });

  it('with configPath loads that file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gvp-config-test-'));
    const configFile = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(
      configFile,
      yaml.dump({ source: 'from-file', strict: true }),
    );

    try {
      const config = loadConfig({ configPath: configFile });
      expect(config.source).toBe('from-file');
      expect(config.strict).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('with invalid config throws ConfigError', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gvp-config-test-'));
    const configFile = path.join(tmpDir, 'config.yaml');
    fs.writeFileSync(
      configFile,
      yaml.dump({ user: { name: 'Alice', email: 'not-an-email' } }),
    );

    try {
      expect(() => loadConfig({ configPath: configFile })).toThrow(ConfigError);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('with configPath to nonexistent file returns defaults', () => {
    const config = loadConfig({ configPath: '/nonexistent/config.yaml' });
    expect(config.strict).toBe(false);
  });
});

describe('discoverConfigPaths', () => {
  it('finds .gvp/config.yaml in a temp directory', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gvp-discover-test-'));
    const gvpDir = path.join(tmpDir, '.gvp');
    fs.mkdirSync(gvpDir);
    const configFile = path.join(gvpDir, 'config.yaml');
    fs.writeFileSync(configFile, yaml.dump({ source: 'discovered' }));

    try {
      const paths = discoverConfigPaths(tmpDir);
      expect(paths.project).toBe(configFile);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('finds .gvp.yaml local config', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gvp-discover-test-'));
    const localFile = path.join(tmpDir, '.gvp.yaml');
    fs.writeFileSync(localFile, yaml.dump({ strict: true }));

    try {
      const paths = discoverConfigPaths(tmpDir);
      expect(paths.local).toBe(localFile);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });
});
