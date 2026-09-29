#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// Check the Anthropic key this app will use — in seconds, for a fraction of a
// cent — and print exactly what Anthropic says.
//
//   node scripts/check-ai.mjs            (asks for the key; typing is hidden)
//   ANTHROPIC_API_KEY=… node scripts/check-ai.mjs
//
// It sends the SAME shape of request the app sends — the flagship model with
// adaptive thinking, effort and a tool (Analyze, Prism), and the small model
// with a forced tool call (critique, extraction, Innovation/TRIZ steps) — with
// tiny budgets. Written because a demo failed on "the AI request was
// rejected" and the only way to learn why was Anthropic's own message.
// The key is never printed, logged or written anywhere.
// ─────────────────────────────────────────────────────────────────────────────
import Anthropic from '@anthropic-ai/sdk';
import { anthropicClientOptions } from '../anthropic-options.mjs';
import { readFileSync, existsSync } from 'node:fs';
import { describeLlmError, providerDetail } from '../llm-error.mjs';

const FLAGSHIP = 'claude-opus-4-8';
const SMALL = process.env.CV_SMALL_MODEL || 'claude-sonnet-5';

async function readKey() {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return process.env.ANTHROPIC_API_KEY.trim();
  if (existsSync('.brainspark-local.env')) {
    const m = /^ANTHROPIC_API_KEY=(.+)$/m.exec(readFileSync('.brainspark-local.env', 'utf8'));
    if (m && m[1].trim()) return m[1].trim();
  }
  process.stdout.write('Paste your Anthropic API key (input hidden), then Return: ');
  return await new Promise((resolve) => {
    const stdin = process.stdin; let key = '';
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume(); stdin.setEncoding('utf8');
    stdin.on('data', function onData(ch) {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') { if (stdin.isTTY) stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData); process.stdout.write('\n'); return resolve(key.trim()); }
        if (c === '\u0003') process.exit(1);
        if (c === '\u007f') key = key.slice(0, -1); else key += c;
      }
    });
  });
}

// The app's server reads ANTHROPIC_WORKSPACE_ID from .brainspark-local.env;
// this check must send the same header, or it tests a different request.
if (!process.env.ANTHROPIC_WORKSPACE_ID && existsSync('.brainspark-local.env')) {
  const w = /^ANTHROPIC_WORKSPACE_ID=(.+)$/m.exec(readFileSync('.brainspark-local.env', 'utf8'));
  if (w && w[1].trim()) process.env.ANTHROPIC_WORKSPACE_ID = w[1].trim();
}
const key = await readKey();
if (!key) { console.log('No key given.'); process.exit(1); }
console.log(`Key: ${key.slice(0, 10)}…${key.slice(-4)} (${key.length} characters${/\s/.test(key) ? ', CONTAINS WHITESPACE — re-copy it' : ''})`);
console.log(`Workspace: ${process.env.ANTHROPIC_WORKSPACE_ID ? `${process.env.ANTHROPIC_WORKSPACE_ID} (sent as anthropic-workspace-id)` : 'none set — fine for a key created inside a workspace'}\n`);
const client = new Anthropic({ apiKey: key, maxRetries: 0, timeout: 60_000, ...anthropicClientOptions() });
const tool = { name: 'emit_ideas', description: 'Emit ideas.', input_schema: { type: 'object', properties: { ideas: { type: 'array', items: { type: 'object' } } }, required: ['ideas'] } };

const checks = [
  ['Analyze / Prism generation', FLAGSHIP, { max_tokens: 2048, thinking: { type: 'adaptive' }, output_config: { effort: 'low' }, tools: [tool], tool_choice: { type: 'auto' },
    messages: [{ role: 'user', content: 'Reply with the single word OK.' }] }],
  ['Critique, extraction, Innovation/TRIZ steps', SMALL, { max_tokens: 256, tools: [tool], tool_choice: { type: 'tool', name: 'emit_ideas' },
    messages: [{ role: 'user', content: 'Call emit_ideas with an empty list.' }] }],
];

let failed = 0;
for (const [label, model, params] of checks) {
  process.stdout.write(`${label} (${model}) … `);
  try {
    const r = await client.messages.create({ model, ...params });
    console.log(`OK (stop_reason ${r.stop_reason}, ${r.usage?.input_tokens ?? '?'} in / ${r.usage?.output_tokens ?? '?'} out tokens)`);
  } catch (e) {
    failed++;
    const d = providerDetail(e);
    console.log(`FAILED — HTTP ${e?.status ?? 'no response'}${d.type ? ` ${d.type}` : ''}`);
    console.log(`   Anthropic says: ${d.message || e?.message || '(no message)'}`);
    console.log(`   What to do: ${describeLlmError(e)}\n`);
  }
}
console.log(failed ? `\n${failed} check(s) failed — the message above is Anthropic's own reason.` : '\nAll checks passed: this key can run every AI feature in the app.');
process.exit(failed ? 1 : 0);
