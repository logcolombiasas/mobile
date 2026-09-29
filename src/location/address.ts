/** Utilidades puras de ubicación (sin dependencias nativas, para poder probarlas). */

export interface GeocodedAddress {
  formattedAddress?: string | null;
  name?: string | null;
  street?: string | null;
  streetNumber?: string | null;
  district?: string | null;
  city?: string | null;
  region?: string | null;
}

/** Arma una dirección legible: "Calle 80 # 15-20, Chapinero, Bogotá" */
export function formatAddress(a: GeocodedAddress | null | undefined): string | undefined {
  if (!a) return undefined;
  if (a.formattedAddress) {
    // Android entrega "Cl. 80 #15-20, Bogotá, Colombia": se quita el país
    return a.formattedAddress.replace(/,\s*Colombia\s*$/i, '').trim() || undefined;
  }
  const street = [a.street, a.streetNumber].filter(Boolean).join(' # ') || a.name || '';
  const parts = [street, a.district, a.city || a.region].filter(p => p && p.trim());
  const unique = parts.filter((p, i) => parts.indexOf(p) === i);
  return unique.length ? unique.join(', ') : undefined;
}

/** Distancia en metros entre dos coordenadas (fórmula de haversine) */
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/** Texto corto del estado del GPS para mostrar en pantalla */
export function gpsLabel(fix: { accuracy?: number | null; address?: string } | null, permission: boolean): string {
  if (!permission) return '⚠️ Sin permiso de ubicación';
  if (!fix) return '📍 Buscando GPS…';
  const acc = fix.accuracy != null ? ` ±${Math.round(fix.accuracy)} m` : '';
  return `📍${acc}${fix.address ? ` · ${fix.address}` : ''}`;
}
