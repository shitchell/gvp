let verbosity = 0;

export function setVerbosity(level: number): void {
  verbosity = level;
}

export function getVerbosity(): number {
  return verbosity;
}

export function log(level: number, ...args: unknown[]): void {
  if (verbosity >= level) {
    console.error('[cairn]', ...args);
  }
}

export function logv(...args: unknown[]): void { log(1, ...args); }
export function logvv(...args: unknown[]): void { log(2, ...args); }
export function logvvv(...args: unknown[]): void { log(3, ...args); }
