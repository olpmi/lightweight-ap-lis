import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { isDemoMode } from '../../lib/demoMode.js';

const originalNodeEnv = process.env.NODE_ENV;
const originalDemoMode = process.env.DEMO_MODE;

function setEnv(nodeEnv?: string, demoMode?: string): void {
  if (nodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = nodeEnv;

  if (demoMode === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = demoMode;
}

beforeEach(() => setEnv(undefined, undefined));

afterAll(() => {
  if (originalNodeEnv === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = originalNodeEnv;

  if (originalDemoMode === undefined) delete process.env.DEMO_MODE;
  else process.env.DEMO_MODE = originalDemoMode;
});

describe('isDemoMode', () => {
  it('defaults to on outside production, so a stack is never unmarked by omission', () => {
    setEnv('development');
    expect(isDemoMode()).toBe(true);

    setEnv('test');
    expect(isDemoMode()).toBe(true);

    setEnv(undefined);
    expect(isDemoMode()).toBe(true);
  });

  it('defaults to off in production', () => {
    setEnv('production');
    expect(isDemoMode()).toBe(false);
  });

  it('lets DEMO_MODE override the default in both directions', () => {
    setEnv('development', 'false');
    expect(isDemoMode()).toBe(false);

    setEnv('production', 'true');
    expect(isDemoMode()).toBe(true);
  });

  it('treats any value other than "true" as off once DEMO_MODE is set', () => {
    setEnv('development', '1');
    expect(isDemoMode()).toBe(false);

    setEnv('development', 'yes');
    expect(isDemoMode()).toBe(false);
  });
});
