/**
 * Structured LLM output via forced tool-use.
 * ------------------------------------------------------------------
 * The Anthropic SDK pinned here (0.36.x) predates the `output_config` /
 * json_schema response format, but forced tool-use gives the same guarantee:
 * define ONE tool whose `input_schema` is the shape we want, force the model to
 * call it (`tool_choice: {type:'tool'}`), and read the validated `input` object
 * straight off the tool_use block — no fenced-code stripping, no `indexOf('{')`
 * scanning, no "AI response could not be parsed" 502s.
 *
 *   const data = await messagesJson(client, {
 *     system, messages, schema, toolName: 'report', maxTokens: 700, cacheSystem: true,
 *   });
 *
 * Returns the parsed object, or throws if the model somehow returned no tool_use
 * (the caller decides whether that's fatal or a best-effort skip).
 */

// Wrap a stable system prompt as a cacheable content block (prompt caching).
export function cacheable(text) {
  return [{ type: 'text', text, cache_control: { type: 'ephemeral' } }];
}

export async function messagesJson(client, {
  model = 'claude-opus-4-8',
  system,
  messages,
  schema,
  toolName = 'emit',
  toolDescription = 'Return the structured result.',
  maxTokens = 1024,
  cacheSystem = false,
  requestOptions,
}) {
  const params = {
    model,
    max_tokens: maxTokens,
    messages,
    tools: [{ name: toolName, description: toolDescription, input_schema: schema }],
    // Force the model to answer by calling the tool — the only way it can reply,
    // so the output is always schema-shaped.
    tool_choice: { type: 'tool', name: toolName },
  };
  if (system != null) params.system = cacheSystem ? cacheable(system) : system;

  const resp = await client.messages.create(params, requestOptions);
  const block = resp.content?.find(b => b.type === 'tool_use' && b.name === toolName);
  if (!block || typeof block.input !== 'object' || block.input === null) {
    throw new Error('Model did not return a structured tool call.');
  }
  return block.input;
}
