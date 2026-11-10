/**
 * Offline proof (test F of the plan): the drawing reader runs with every way out of the machine blocked — on a vector
 * PDF, on a PDF whose text is drawn as curves (render + OCR) and on a scanned image (decode + OCR). Any socket, DNS
 * lookup, HTTP request or fetch throws AND is counted; the count must stay zero.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import https from 'node:https';
import dns from 'node:dns';
import dgram from 'node:dgram';
import { readDrawing } from '../server/drawing/index';

const FIX = join(__dirname, 'fixtures', 'drawings');
const attempts: string[] = [];
const restore: Array<() => void> = [];

function block<T extends object, K extends keyof T>(obj: T, key: K, name: string): void {
  const orig = obj[key];
  (obj as Record<K, unknown>)[key] = function blocked(): never { attempts.push(name); throw new Error(`network blocked in test: ${name}`); };
  restore.push(() => { obj[key] = orig; });
}

beforeAll(() => {
  block(net.Socket.prototype, 'connect', 'net.Socket.connect');
  block(net, 'connect', 'net.connect');
  block(net, 'createConnection', 'net.createConnection');
  block(tls, 'connect', 'tls.connect');
  block(http, 'request', 'http.request'); block(http, 'get', 'http.get');
  block(https, 'request', 'https.request'); block(https, 'get', 'https.get');
  block(dns, 'lookup', 'dns.lookup'); block(dns, 'resolve', 'dns.resolve');
  block(dns.promises, 'lookup', 'dns.promises.lookup');
  block(dgram.Socket.prototype, 'send', 'dgram.send'); block(dgram.Socket.prototype, 'connect', 'dgram.connect');
  block(globalThis, 'fetch', 'fetch');
});
afterAll(() => { for (const r of restore.reverse()) r(); });

describe('the drawing reader with all outbound connections blocked', () => {
  it('the block works: a connection attempt throws and is counted', async () => {
    expect(() => net.connect(80, 'example.com')).toThrow(/network blocked/);
    expect(() => new net.Socket().connect(80, '127.0.0.1')).toThrow(/network blocked/);
    await expect((async () => fetch('https://example.com'))()).rejects.toThrow(/network blocked/);
    expect(attempts.length).toBe(3);
    attempts.length = 0;
  });

  it('reads a vector PDF', async () => {
    const ex = await readDrawing(readFileSync(join(FIX, 'gen-casting.pdf')), 'gen-casting.pdf');
    expect(ex.parameters.find(p => p.name === 'material.designation')?.value).toBe('EN-GJS-500-7');
    expect(ex.parameters.length).toBeGreaterThan(40);
    expect(attempts).toEqual([]);
  });

  it('renders and OCRs a PDF whose text is drawn as curves', async () => {
    const ex = await readDrawing(readFileSync(join(FIX, 'gen-gear.curves.pdf')), 'gen-gear.curves.pdf');
    expect(ex.sheets[0].content).toBe('text-as-curves');
    const m = ex.parameters.find(p => p.name === 'material.designation');
    expect(m).toMatchObject({ value: '16MnCr5', method: 'ocr', status: 'needs-validation' });
    expect(attempts).toEqual([]);
  }, 120_000);

  it('decodes and OCRs a scanned image', async () => {
    const ex = await readDrawing(readFileSync(join(FIX, 'gen-moulding.scan200.jpg')), 'gen-moulding.scan200.jpg');
    expect(ex.fileKind).toBe('image');
    expect(ex.sheets[0].content).toBe('scanned');
    expect(ex.text.length).toBeGreaterThan(40);
    expect(ex.parameters.find(p => p.name === 'material.designation')?.value).toBe('PA66-GF30');
    expect(ex.parameters.every(p => p.method === 'ocr' && p.status === 'needs-validation')).toBe(true);
    expect(attempts).toEqual([]);
  }, 120_000);
});
