import { describe, it, expect, afterEach } from 'vitest';
import { createAnthropic, isAirGapped, aiEndpointDescription, AirGappedError } from '../server/utils/ai-client.js';

const saved = { AIR_GAPPED: process.env.AIR_GAPPED, ANTHROPIC_BASE_URL: process.env.ANTHROPIC_BASE_URL };
afterEach(() => {
  if (saved.AIR_GAPPED === undefined) delete process.env.AIR_GAPPED; else process.env.AIR_GAPPED = saved.AIR_GAPPED;
  if (saved.ANTHROPIC_BASE_URL === undefined) delete process.env.ANTHROPIC_BASE_URL; else process.env.ANTHROPIC_BASE_URL = saved.ANTHROPIC_BASE_URL;
});

describe('AI client factory — enterprise deployment controls', () => {
  it('AIR_GAPPED=1 blocks every LLM client construction with a clear error', () => {
    process.env.AIR_GAPPED = '1';
    expect(isAirGapped()).toBe(true);
    expect(() => createAnthropic('sk-test')).toThrow(AirGappedError);
    expect(() => createAnthropic('sk-test')).toThrow(/AIR-GAPPED/);
    expect(aiEndpointDescription()).toMatch(/AIR-GAPPED/);
  });

  it('ANTHROPIC_BASE_URL routes the client to the private endpoint', () => {
    delete process.env.AIR_GAPPED;
    process.env.ANTHROPIC_BASE_URL = 'https://llm-gateway.internal.test';
    const client = createAnthropic('sk-test');
    expect(String((client as unknown as { baseURL: string }).baseURL)).toContain('llm-gateway.internal.test');
    expect(aiEndpointDescription()).toContain('llm-gateway.internal.test');
    expect(aiEndpointDescription()).toMatch(/PRIVATE/);
  });

  it('default posture is the public API, and says so (even if the env pins the public URL)', () => {
    delete process.env.AIR_GAPPED;
    process.env.ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
    expect(isAirGapped()).toBe(false);
    const client = createAnthropic('sk-test');
    expect(String((client as unknown as { baseURL: string }).baseURL)).toContain('api.anthropic.com');
    expect(aiEndpointDescription()).toMatch(/PUBLIC/);
  });
});
