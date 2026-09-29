/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCameraOptions, CameraLike, pickCamera } from './cameraOptions';

const back: CameraLike = { id: 'b0', position: 'back', type: 'wide-angle', localizedName: 'Back', isVirtualDevice: false };
const wide: CameraLike = { id: 'b1', position: 'back', type: 'ultra-wide-angle', localizedName: 'Back UW', isVirtualDevice: false };
const triple: CameraLike = { id: 'b2', position: 'back', type: 'triple', localizedName: 'Triple', isVirtualDevice: true };
const front: CameraLike = { id: 'f0', position: 'front', type: 'wide-angle', localizedName: 'Front', isVirtualDevice: false };
const depth: CameraLike = { id: 'd0', position: 'front', type: 'true-depth', localizedName: 'TrueDepth', isVirtualDevice: false };
const usb: CameraLike = { id: 'u0', position: 'external', type: 'external', localizedName: 'USB Video', isVirtualDevice: false };

test('lista externas primero y omite sensores de profundidad', () => {
  const labels = buildCameraOptions([front, back, depth, usb, triple, wide]).map(o => o.label);
  assert.deepEqual(labels, ['Externa: USB Video', 'Trasera Automática (triple)', 'Trasera Principal', 'Trasera Gran angular', 'Frontal']);
});

test('por defecto usa la trasera automática del celular', () => {
  assert.equal(pickCamera([front, back, triple], null)?.id, 'b2');
  assert.equal(pickCamera([front, back], null)?.id, 'b0');
});

test('respeta la cámara elegida por el usuario', () => {
  assert.equal(pickCamera([front, back, usb], 'f0', ['f0', 'b0', 'u0'])?.id, 'f0');
});

test('cambia a la cámara externa cuando se conecta', () => {
  assert.equal(pickCamera([front, back, usb], 'b0', ['f0', 'b0'])?.id, 'u0');
});

test('si se desconecta la externa vuelve a la del celular', () => {
  assert.equal(pickCamera([front, back], 'u0', ['f0', 'b0', 'u0'])?.id, 'b0');
});
