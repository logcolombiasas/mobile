/// <reference types="node" />
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { distanceMeters, formatAddress, gpsLabel } from './address';

test('usa la dirección formateada de Android sin el país', () => {
  assert.equal(formatAddress({ formattedAddress: 'Cl. 80 #15-20, Bogotá, Colombia' }), 'Cl. 80 #15-20, Bogotá');
});

test('arma la dirección con calle, número, barrio y ciudad', () => {
  assert.equal(
    formatAddress({ street: 'Calle 80', streetNumber: '15-20', district: 'Chapinero', city: 'Bogotá' }),
    'Calle 80 # 15-20, Chapinero, Bogotá',
  );
  assert.equal(formatAddress({ name: 'Parque 93', city: 'Bogotá', region: 'Bogotá' }), 'Parque 93, Bogotá');
  assert.equal(formatAddress(null), undefined);
});

test('calcula distancias en metros', () => {
  const d = distanceMeters({ latitude: 4.6860, longitude: -74.0560 }, { latitude: 4.6869, longitude: -74.0560 });
  assert.ok(d > 95 && d < 105, `distancia ${d}`);
});

test('muestra el estado del GPS', () => {
  assert.equal(gpsLabel(null, false), '⚠️ Sin permiso de ubicación');
  assert.equal(gpsLabel(null, true), '📍 Buscando GPS…');
  assert.equal(gpsLabel({ accuracy: 7.6, address: 'Calle 80 # 15-20' }, true), '📍 ±8 m · Calle 80 # 15-20');
});
