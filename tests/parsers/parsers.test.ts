import { describe, it, expect } from 'vitest';
import {
  MarkdownRefParser,
  PythonRefParser,
  TypeScriptRefParser,
  YamlRefParser,
  createRefParserRegistry,
  findParser,
} from '../../src/parsers/index.js';

describe('MarkdownRefParser', () => {
  const parser = new MarkdownRefParser();

  it('extractIdentifiers returns all headings when no filter', () => {
    const content = [
      '## Goals',
      'Goal content here.',
      '',
      '### Sub-goal',
      'Sub-goal content.',
      '',
      '## Values',
      'Value content here.',
    ].join('\n');

    const results = parser.extractIdentifiers(content);
    const names = results.map(r => r.identifier);
    expect(names).toContain('Goals');
    expect(names).toContain('Sub-goal');
    expect(names).toContain('Values');
    expect(results).toHaveLength(3);
  });

  it('extractIdentifiers filters when matching provided', () => {
    const content = [
      '## Goals',
      'Goal content here.',
      '',
      '## Values',
      'Value content here.',
    ].join('\n');

    const results = parser.extractIdentifiers(content, 'Goals');
    expect(results).toHaveLength(1);
    expect(results[0]!.identifier).toBe('Goals');
    expect(results[0]!.block).toContain('Goal content here.');
    expect(results[0]!.block).not.toContain('Values');
  });

  it('extractBlock finds heading by text', () => {
    const content = '# Introduction\n\nSome text here.\n';
    const result = parser.extractBlock(content, 'Introduction');
    expect(result).not.toBeNull();
    expect(result).toContain('# Introduction');
    expect(result).toContain('Some text here.');
  });

  it('extracts content until next same-level heading', () => {
    const content = [
      '## Goals',
      'Goal content here.',
      '',
      '### Sub-goal',
      'Sub-goal content.',
      '',
      '## Values',
      'Value content here.',
    ].join('\n');

    const result = parser.extractBlock(content, 'Goals');
    expect(result).not.toBeNull();
    expect(result).toContain('## Goals');
    expect(result).toContain('Goal content here.');
    expect(result).toContain('### Sub-goal');
    expect(result).toContain('Sub-goal content.');
    expect(result).not.toContain('## Values');
    expect(result).not.toContain('Value content here.');
  });

  it('returns null for missing heading', () => {
    const content = '# Existing\n\nSome content.\n';
    const result = parser.extractBlock(content, 'Nonexistent');
    expect(result).toBeNull();
  });
});

describe('TypeScriptRefParser', () => {
  const parser = new TypeScriptRefParser();

  it('extractIdentifiers returns all classes/functions', () => {
    const content = [
      'import { Foo } from "./foo.js";',
      '',
      'export class MyClass {',
      '  name: string;',
      '}',
      '',
      'export function greet() {',
      '  return "hello";',
      '}',
      '',
      'export class Other {}',
    ].join('\n');

    const results = parser.extractIdentifiers(content);
    const names = results.map(r => r.identifier);
    expect(names).toContain('MyClass');
    expect(names).toContain('greet');
    expect(names).toContain('Other');
  });

  it('extractIdentifiers filters when matching provided', () => {
    const content = [
      'export class MyClass {',
      '  name: string;',
      '}',
      '',
      'export class Other {}',
    ].join('\n');

    const results = parser.extractIdentifiers(content, 'MyClass');
    expect(results).toHaveLength(1);
    expect(results[0]!.identifier).toBe('MyClass');
  });

  it('extractBlock finds class by name', () => {
    const content = [
      'import { Foo } from "./foo.js";',
      '',
      'export class MyClass {',
      '  name: string;',
      '  constructor(name: string) {',
      '    this.name = name;',
      '  }',
      '}',
      '',
      'export class Other {}',
    ].join('\n');

    const result = parser.extractBlock(content, 'MyClass');
    expect(result).not.toBeNull();
    expect(result).toContain('export class MyClass');
    expect(result).toContain('this.name = name;');
    expect(result).not.toContain('class Other');
  });

  it('extractBlock finds function by name', () => {
    const content = [
      'export function greet(name: string): string {',
      '  return `Hello, ${name}!`;',
      '}',
      '',
      'function other() {}',
    ].join('\n');

    const result = parser.extractBlock(content, 'greet');
    expect(result).not.toBeNull();
    expect(result).toContain('function greet');
    expect(result).toContain('return `Hello,');
    expect(result).not.toContain('function other');
  });

  it('returns null for missing identifier', () => {
    const content = 'export function foo() { return 1; }';
    const result = parser.extractBlock(content, 'bar');
    expect(result).toBeNull();
  });
});

describe('PythonRefParser', () => {
  const parser = new PythonRefParser();

  it('extractIdentifiers returns module-level def, class, methods, and nested class', () => {
    const content = [
      'def foo():',
      '    return 1',
      '',
      'class Foo:',
      '    def method_a(self):',
      '        return self',
      '',
      '    def method_b(self):',
      '        return self',
      '',
      'class Outer:',
      '    class Inner:',
      '        pass',
    ].join('\n');

    const results = parser.extractIdentifiers(content);
    const names = results.map(r => r.identifier);
    expect(names).toContain('foo');
    expect(names).toContain('Foo');
    expect(names).toContain('method_a');
    expect(names).toContain('method_b');
    expect(names).toContain('Outer');
    expect(names).toContain('Inner');
  });

  it('async def extracts identifier without async prefix', () => {
    const content = [
      'async def bar():',
      '    return 2',
    ].join('\n');

    const results = parser.extractIdentifiers(content);
    const names = results.map(r => r.identifier);
    expect(names).toContain('bar');
    expect(names).not.toContain('async');
  });

  it('decorated function extracts the def name', () => {
    const content = [
      'class Thing:',
      '    @property',
      '    def prop(self):',
      '        return self._x',
    ].join('\n');

    const results = parser.extractIdentifiers(content);
    const names = results.map(r => r.identifier);
    expect(names).toContain('prop');
  });

  it('extractBlock resolves dotted ClassName.method_name', () => {
    const content = [
      'class Foo:',
      '    def method_name(self):',
      '        return 42',
      '',
      '    def other(self):',
      '        return 0',
    ].join('\n');

    const block = parser.extractBlock(content, 'Foo.method_name');
    expect(block).not.toBeNull();
    expect(block).toContain('def method_name');
    expect(block).toContain('return 42');
    expect(block).not.toContain('def other');
  });

  it('extractBlock returns null for dotted path with missing tail', () => {
    const content = [
      'class Foo:',
      '    def method_name(self):',
      '        return 1',
    ].join('\n');

    const block = parser.extractBlock(content, 'Foo.nonexistent');
    expect(block).toBeNull();
  });

  it('extractBlock returns null for absent identifier', () => {
    const content = [
      'def foo():',
      '    return 1',
    ].join('\n');

    const block = parser.extractBlock(content, 'absent');
    expect(block).toBeNull();
  });

  it('findParser returns PythonRefParser for .py', () => {
    const parsers = createRefParserRegistry();
    const found = findParser('.py', parsers);
    expect(found).toBeInstanceOf(PythonRefParser);
  });
});

describe('YamlRefParser', () => {
  const parser = new YamlRefParser();

  it('extractIdentifiers returns all top-level keys', () => {
    const content = [
      'goals:',
      '  - id: G1',
      '    name: First goal',
      '',
      'values:',
      '  - id: V1',
      '',
      'decisions:',
      '  - id: DC1',
    ].join('\n');

    const results = parser.extractIdentifiers(content);
    const names = results.map(r => r.identifier);
    expect(names).toContain('goals');
    expect(names).toContain('values');
    expect(names).toContain('decisions');
    expect(results).toHaveLength(3);
  });

  it('extractIdentifiers filters when matching provided', () => {
    const content = [
      'goals:',
      '  - id: G1',
      '',
      'values:',
      '  - id: V1',
    ].join('\n');

    const results = parser.extractIdentifiers(content, 'goals');
    expect(results).toHaveLength(1);
    expect(results[0]!.identifier).toBe('goals');
    expect(results[0]!.block).toContain('id: G1');
    expect(results[0]!.block).not.toContain('values');
  });

  it('extractBlock finds top-level key', () => {
    const content = [
      'goals:',
      '  - id: G1',
      '    name: First goal',
      '',
      'values:',
      '  - id: V1',
    ].join('\n');

    const result = parser.extractBlock(content, 'goals');
    expect(result).not.toBeNull();
    expect(result).toContain('goals:');
    expect(result).toContain('id: G1');
  });

  it('extracts indented content', () => {
    const content = [
      'goals:',
      '  - id: G1',
      '    name: First goal',
      '  - id: G2',
      '    name: Second goal',
      '',
      'values:',
      '  - id: V1',
    ].join('\n');

    const result = parser.extractBlock(content, 'goals');
    expect(result).not.toBeNull();
    expect(result).toContain('id: G1');
    expect(result).toContain('id: G2');
    expect(result).not.toContain('values:');
    expect(result).not.toContain('id: V1');
  });

  it('returns null for missing key', () => {
    const content = 'goals:\n  - id: G1\n';
    const result = parser.extractBlock(content, 'principles');
    expect(result).toBeNull();
  });
});

describe('Parser registry', () => {
  it('findParser returns correct parser for .ts', () => {
    const parsers = createRefParserRegistry();
    const parser = findParser('.ts', parsers);
    expect(parser).toBeInstanceOf(TypeScriptRefParser);
  });

  it('findParser returns correct parser for .md', () => {
    const parsers = createRefParserRegistry();
    const parser = findParser('.md', parsers);
    expect(parser).toBeInstanceOf(MarkdownRefParser);
  });

  it('findParser returns correct parser for .yaml', () => {
    const parsers = createRefParserRegistry();
    const parser = findParser('.yaml', parsers);
    expect(parser).toBeInstanceOf(YamlRefParser);
  });

  it('findParser returns undefined for unknown extension', () => {
    const parsers = createRefParserRegistry();
    const parser = findParser('.png', parsers);
    expect(parser).toBeUndefined();
  });

  it('createRefParserRegistry has 4 parsers', () => {
    const parsers = createRefParserRegistry();
    expect(parsers).toHaveLength(4);
  });
});
