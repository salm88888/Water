/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Al-Wadi District (Marib) Locations & Husoon Al-Jalal Coverage Registry
 */

export interface DistrictGeoPoint {
  name: string;
  lat: number;
  lng: number;
}

export const DEFAULT_AL_WADI_DISTRICT = 'حصون آل جلال';

/**
 * Neighborhoods and areas surrounding the plant near Husoon Al-Jalal
 * extending along Al-Wadi District in Marib, Yemen.
 */
export const AL_WADI_DISTRICTS: DistrictGeoPoint[] = [
  { name: 'حصون آل جلال', lat: 15.4920, lng: 45.3620 },
  { name: 'منطقة آل جلال', lat: 15.4890, lng: 45.3680 },
  { name: 'العرقين', lat: 15.4960, lng: 45.3820 },
  { name: 'الخشعة', lat: 15.4810, lng: 45.3740 },
  { name: 'الصمدة', lat: 15.4760, lng: 45.3560 },
  { name: 'مفرق الوادي', lat: 15.4730, lng: 45.3490 },
  { name: 'المنين - الوادي', lat: 15.4680, lng: 45.3710 },
  { name: 'الحدباء', lat: 15.4840, lng: 45.3910 },
  { name: 'آل شبوان', lat: 15.5020, lng: 45.3980 },
  { name: 'آل فجيح', lat: 15.4720, lng: 45.3850 },
  { name: 'الحزم - الوادي', lat: 15.4630, lng: 45.3610 },
  { name: 'الضمين', lat: 15.4580, lng: 45.3790 },
  { name: 'آل مثنى', lat: 15.4990, lng: 45.3720 },
  { name: 'سميح', lat: 15.4690, lng: 45.4020 },
  { name: 'الخسيف - الوادي', lat: 15.4550, lng: 45.3440 },
  { name: 'وادي عبيدة - الخط الدولي', lat: 15.4860, lng: 45.4120 },
];

export const AL_WADI_DISTRICT_NAMES: string[] = AL_WADI_DISTRICTS.map((d) => d.name);

export function mergeDistrictLists(
  customDistricts?: string[],
  customerDistricts?: string[],
  pendingOfflineDistricts?: string[]
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  const pushUnique = (val?: string) => {
    const clean = (val || '').trim();
    if (!clean || clean === '__other__' || clean === 'أخرى') return;
    if (!seen.has(clean)) {
      seen.add(clean);
      result.push(clean);
    }
  };

  AL_WADI_DISTRICT_NAMES.forEach(pushUnique);
  (customDistricts || []).forEach(pushUnique);
  (pendingOfflineDistricts || []).forEach(pushUnique);
  (customerDistricts || []).forEach(pushUnique);

  return result;
}

export function getClosestAlWadiDistrict(lat: number, lng: number): string {
  let closest = AL_WADI_DISTRICTS[0].name;
  let minDist = Infinity;
  for (const d of AL_WADI_DISTRICTS) {
    const dist = Math.hypot(d.lat - lat, d.lng - lng);
    if (dist < minDist) {
      minDist = dist;
      closest = d.name;
    }
  }
  return closest;
}
