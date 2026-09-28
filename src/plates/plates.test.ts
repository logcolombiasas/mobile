/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractPlates, matchFormat } from './plateParser';
import { PlateTracker } from './PlateTracker';

const ocr = (...lines: string[]) => ({
  resultText: lines.join('\n'),
  blocks: [{ blockText: lines.join(' '), lines: lines.map(l => ({ lineText: l, elements: l.split(' ').map(e => ({ elementText: e })) })) }],
});

test('lee placa de carro con guion y ciudad', () => {
  const plates = extractPlates(ocr('ABC-123', 'BOGOTA D.C.')).map(c => c.plate);
  assert.ok(plates.includes('ABC123'));
  assert.ok(!plates.some(p => p.startsWith('BOGOTA')));
});

test('lee placa separada en dos elementos', () => {
  assert.equal(extractPlates(ocr('XYZ 987'))[0].plate, 'XYZ987');
});

test('lee placa de moto', () => {
  const plates = extractPlates(ocr('KLM45F')).map(c => c.plate);
  assert.ok(plates.includes('KLM45F'));
});

test('corrige confusiones típicas del OCR según la posición', () => {
  assert.deepEqual(matchFormat('A8C1O3', ['L', 'L', 'L', 'D', 'D', 'D']), { plate: 'ABC103', corrections: 2 });
  assert.equal(matchFormat('ABCO1O', ['L', 'L', 'L', 'D', 'D', 'D']), null);
  assert.equal(matchFormat('88812O', ['L', 'L', 'L', 'D', 'D', 'D']), null);
});

test('ignora texto que no parece placa', () => {
  assert.equal(extractPlates(ocr('REPUBLICA', 'DE COLOMBIA')).length, 0);
});

test('confirma una placa solo tras varias lecturas y respeta el cooldown', () => {
  const tracker = new PlateTracker({ minHits: 2, windowMs: 1000, cooldownMs: 5000 });
  assert.deepEqual(tracker.push(['ABC123'], 0), []);
  assert.deepEqual(tracker.push(['ABC123'], 500), ['ABC123']);
  assert.deepEqual(tracker.push(['ABC123'], 600), []);
  assert.deepEqual(tracker.push(['ABC123'], 700), []);
  // Lecturas muy separadas no confirman
  assert.deepEqual(tracker.push(['XYZ987'], 0), []);
  assert.deepEqual(tracker.push(['XYZ987'], 2000), []);
});
