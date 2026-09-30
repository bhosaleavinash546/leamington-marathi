// A stand-in for the Anthropic Messages API used by e2e/pcb-live.ts: it answers
// each stage of the photo pipeline with a fixed reading of the radar board
// (fixtures/pcb-radar-replies.json), as the real model answered it on
// 2026-09-29, streaming when asked to. It makes no pricing decision — that is the
// point: everything after it is the tool's own arithmetic.
//
//   PORT=3999 REPLIES=./fixtures/pcb-radar-replies.json node e2e/pcb-stand-in.mjs
import http from 'node:http';
import { readFileSync } from 'node:fs';

const R = JSON.parse(readFileSync(new URL(process.env.REPLIES ?? './fixtures/pcb-radar-replies.json', import.meta.url), 'utf8'));
const PORT = Number(process.env.PORT || 3999);

http.createServer((req, res) => {
  let body = '';
  req.on('data', c => { body += c; });
  req.on('end', () => {
    let j = {};
    try { j = JSON.parse(body); } catch { /* not JSON */ }
    const sys = typeof j.system === 'string' ? j.system : JSON.stringify(j.system ?? '');
    const text = JSON.stringify(j.messages ?? '').slice(-4000);
    let out;
    if (/classification expert/i.test(sys)) out = R.stage1;
    else if (/reading (PCB )?text|reading text from PCB|reading PCB text/i.test(sys)) out = R.ocr;
    else if (/asilLevel/.test(text) || (/ASIL/i.test(sys.slice(0, 300)) && !/cost engineer/i.test(sys))) out = R.asil;
    else out = R.analysis;
    const outText = JSON.stringify(out);
    if (j.stream) {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' });
      const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
      ev('message_start', { message: { id: 'msg_standin', type: 'message', role: 'assistant', model: j.model, content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 1000, output_tokens: 0 } } });
      ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
      for (let i = 0; i < outText.length; i += 2000) ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: outText.slice(i, i + 2000) } });
      ev('content_block_stop', { index: 0 });
      ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 800 } });
      ev('message_stop', {});
      res.end();
      return;
    }
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ id: 'msg_standin', type: 'message', role: 'assistant', model: j.model, stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: outText }], usage: { input_tokens: 1000, output_tokens: 800 } }));
  });
}).listen(PORT, '127.0.0.1', () => console.log(`pcb stand-in on ${PORT}`));
