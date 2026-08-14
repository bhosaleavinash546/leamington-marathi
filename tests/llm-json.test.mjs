// messagesJson wraps EVERY structured LLM call in the platform — server.mjs,
// five route modules, drawing-analysis and idea-deep — and had no test at all.
//
// It is the boundary where a well-behaved model response becomes an object the
// engines act on, so its failure modes are the platform's failure modes: a
// model that answers in prose instead of calling the tool, a tool call with a
// different name, an empty or non-object input. Those surface with a live key
// and never in offline tests, which is exactly why they needed pinning here.
//
// The client is injected, so all of this runs with no network and no key.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { messagesJson, cacheable } from '../llm-json.mjs';

/** Minimal fake of the Anthropic client: records params, returns a scripted reply. */
function fakeClient(reply) {
  const calls = [];
  return {
    calls,
    messages: {
      create: async (params, requestOptions) => {
        calls.push({ params, requestOptions });
        if (reply instanceof Error) throw reply;
        return typeof reply === 'function' ? reply(params) : reply;
      },
    },
  };
}
const toolUse = (name, input) => ({ content: [{ type: 'tool_use', name, input }] });
const SCHEMA = { type: 'object', properties: { total: { type: 'number' } }, required: ['total'] };

describe('messagesJson — the happy path', () => {
  it('returns the tool input straight off the block', async () => {
    const client = fakeClient(toolUse('emit', { total: 42 }));
    const out = await messagesJson(client, { messages: [{ role: 'user', content: 'x' }], schema: SCHEMA });
    assert.deepEqual(out, { total: 42 });
  });

  it('FORCES the tool call — this is what makes the output schema-shaped', async () => {
    const client = fakeClient(toolUse('report', { total: 1 }));
    await messagesJson(client, { messages: [], schema: SCHEMA, toolName: 'report' });
    const { params } = client.calls[0];
    assert.deepEqual(params.tool_choice, { type: 'tool', name: 'report' });
    assert.equal(params.tools.length, 1);
    assert.equal(params.tools[0].name, 'report');
    assert.deepEqual(params.tools[0].input_schema, SCHEMA);
  });

  it('picks the block matching the tool NAME, not merely the first tool_use', async () => {
    // A model that emits an unexpected tool alongside the right one must not
    // have the wrong payload read off it.
    const client = fakeClient({
      content: [
        { type: 'text', text: 'thinking out loud' },
        { type: 'tool_use', name: 'some_other_tool', input: { total: 999 } },
        { type: 'tool_use', name: 'emit', input: { total: 7 } },
      ],
    });
    assert.deepEqual(await messagesJson(client, { messages: [], schema: SCHEMA }), { total: 7 });
  });
});

describe('messagesJson — the failure modes that reach production', () => {
  const cases = [
    ['answered in prose instead of calling the tool', { content: [{ type: 'text', text: '{"total": 5}' }] }],
    ['called a differently-named tool', toolUse('not_emit', { total: 5 })],
    ['returned an empty content array', { content: [] }],
    ['returned no content at all', {}],
    ['returned a tool_use with null input', toolUse('emit', null)],
    ['returned a tool_use whose input is a string', toolUse('emit', '{"total":5}')],
  ];
  for (const [label, reply] of cases) {
    it(`throws a named error when the model ${label}`, async () => {
      const client = fakeClient(reply);
      await assert.rejects(
        () => messagesJson(client, { messages: [], schema: SCHEMA }),
        /did not return a structured tool call/,
        `${label} must fail loudly — a silent null here becomes a fabricated number downstream`,
      );
    });
  }

  it('lets a transport error propagate rather than swallowing it', async () => {
    // Callers decide whether a failed call is fatal or a best-effort skip, and
    // they can only decide that if the error reaches them.
    const client = fakeClient(new Error('529 overloaded'));
    await assert.rejects(() => messagesJson(client, { messages: [], schema: SCHEMA }), /529 overloaded/);
  });

  it('does not invent a value when the model returns an empty object', async () => {
    // An empty object IS a valid tool call — schema enforcement is the API's
    // job, not this layer's. It must pass through untouched, so the caller's
    // own validation sees exactly what arrived.
    assert.deepEqual(await messagesJson(fakeClient(toolUse('emit', {})), { messages: [], schema: SCHEMA }), {});
  });
});

describe('messagesJson — request shaping', () => {
  it('omits system entirely when none is given', async () => {
    const client = fakeClient(toolUse('emit', { total: 1 }));
    await messagesJson(client, { messages: [], schema: SCHEMA });
    assert.equal('system' in client.calls[0].params, false);
  });

  it('passes a plain system prompt through uncached by default', async () => {
    const client = fakeClient(toolUse('emit', { total: 1 }));
    await messagesJson(client, { messages: [], schema: SCHEMA, system: 'be terse' });
    assert.equal(client.calls[0].params.system, 'be terse');
  });

  it('wraps the system prompt as a cacheable block on request', async () => {
    const client = fakeClient(toolUse('emit', { total: 1 }));
    await messagesJson(client, { messages: [], schema: SCHEMA, system: 'long stable prompt', cacheSystem: true });
    assert.deepEqual(client.calls[0].params.system, [
      { type: 'text', text: 'long stable prompt', cache_control: { type: 'ephemeral' } },
    ]);
  });

  it('forwards maxTokens and requestOptions to the client', async () => {
    const client = fakeClient(toolUse('emit', { total: 1 }));
    const signal = { aborted: false };
    await messagesJson(client, { messages: [], schema: SCHEMA, maxTokens: 3500, requestOptions: { signal } });
    assert.equal(client.calls[0].params.max_tokens, 3500);
    assert.equal(client.calls[0].requestOptions.signal, signal);
  });
});

describe('cacheable', () => {
  it('produces one ephemeral text block', () => {
    assert.deepEqual(cacheable('hi'), [{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }]);
  });
});
