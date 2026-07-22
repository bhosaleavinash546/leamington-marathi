import { describe, it, expect, afterEach } from 'vitest';
import { isUsableKey, resolveApiKey, hasUsableServerKey } from '../server/utils/api-key.js';

const req = (h: Record<string, unknown>) => ({ headers: h });
const KEY = 'sk-ant-api03-' + 'x'.repeat(40);

describe('api-key resolver', () => {
  const orig = process.env.ANTHROPIC_API_KEY;
  afterEach(() => { if (orig === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = orig; });

  it('isUsableKey accepts real-looking keys, rejects blank/placeholder/short', () => {
    expect(isUsableKey(KEY)).toBe(true);
    expect(isUsableKey('')).toBe(false);
    expect(isUsableKey(undefined)).toBe(false);
    expect(isUsableKey('sk-ant-...')).toBe(false);   // the .env.example placeholder
    expect(isUsableKey('sk-ant-x')).toBe(false);     // too short
    expect(isUsableKey('not-a-key-at-all')).toBe(false);
  });

  it('a usable server key wins over the header', () => {
    process.env.ANTHROPIC_API_KEY = KEY;
    expect(resolveApiKey(req({ 'x-api-key': 'sk-ant-api03-' + 'z'.repeat(40) }))).toBe(KEY);
  });

  it('a placeholder server key does NOT shadow a real header key (the reported bug)', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-...';
    const headerKey = 'sk-ant-api03-' + 'h'.repeat(40);
    expect(resolveApiKey(req({ 'x-api-key': headerKey }))).toBe(headerKey);
  });

  it('an unset server key falls back to the header key', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(resolveApiKey(req({ 'x-api-key': KEY }))).toBe(KEY);
  });

  it('handles array-valued headers', () => {
    delete process.env.ANTHROPIC_API_KEY;
    expect(resolveApiKey(req({ 'x-api-key': [KEY] }))).toBe(KEY);
  });

  it('hasUsableServerKey reflects the env key honestly', () => {
    process.env.ANTHROPIC_API_KEY = KEY; expect(hasUsableServerKey()).toBe(true);
    process.env.ANTHROPIC_API_KEY = 'sk-ant-...'; expect(hasUsableServerKey()).toBe(false);
    delete process.env.ANTHROPIC_API_KEY; expect(hasUsableServerKey()).toBe(false);
  });
});
