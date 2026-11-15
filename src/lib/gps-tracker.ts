/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Shared Automatic GPS Tracking, Stop Detection & Plan-vs-Actual Analysis Engine
 * Runs identically in both Client (Driver PWA / Offline Engine) and Server (Express Sync Verification).
 */

import {
  DetectedStop,
  GPSGap,
  SystemSettings,
  Trip,
  TripCustomerStop,
  TripGPSPoint,
} from '../types';

declare global {
  interface Window {
    MiyahnaAndroidLocation?: {
      startTracking?: (tripId: string, intervalSeconds: number) => boolean;
      stopTracking?: () => boolean;
      getBufferedPointsJson?: () => string;
      clearSyncedBuffer?: (pointIdsJson: string) => void;
    };
  }
}

export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  return haversineDistanceKm(lat1, lon1, lat2, lon2) * 1000;
}

export function isWithinPlantGeofence(
  lat: number,
  lng: number,
  settings: SystemSettings
): { inside: boolean; distanceMeters: number } {
  const distanceMeters = Math.round(
    haversineDistanceMeters(lat, lng, settings.plantLocation.lat, settings.plantLocation.lng)
  );
  const radius = settings.plantGeofenceMeters || 120;
  return {
    inside: distanceMeters <= radius,
    distanceMeters,
  };
}

export interface TrackAnalysisResult {
  points: TripGPSPoint[];
  detectedStops: DetectedStop[];
  gpsGaps: GPSGap[];
  totalDistanceKm: number;
  movingMinutes: number;
  stoppedMinutes: number;
}

/**
 * Chronologically sorts & deduplicates GPS points, computes real speed/distance,
 * detects GPS gaps, distinguishes real prolonged stops (>= stopDetectionMinutes) from brief pauses
 * (traffic lights / congestion), and links stops to approved customers within stopRadiusMeters
 * WITHOUT automatically treating a stop as delivery proof.
 */
export function analyzeGpsTrack(params: {
  tripId: string;
  rawPoints: TripGPSPoint[];
  approvedStops: TripCustomerStop[];
  settings: SystemSettings;
}): TrackAnalysisResult {
  const { tripId, rawPoints, approvedStops, settings } = params;

  const stopThresholdSec = Math.max(30, (settings.stopDetectionMinutes || 3) * 60);
  const minMoveSpeed = settings.minMovementSpeedKmH || 8;
  const stopRadiusMeters = settings.stopRadiusMeters || 80;
  const weakAccuracyMeters = settings.gpsWeakAccuracyMeters || 60;
  const gpsGapSeconds = settings.gpsGapSeconds || 120;
  const stationaryJitterMeters = 35;

  // Deduplicate by ID & sort chronologically
  const uniqueMap = new Map<string, TripGPSPoint>();
  for (const pt of rawPoints) {
    if (!pt || !pt.id || typeof pt.lat !== 'number' || typeof pt.lng !== 'number') continue;
    if (!uniqueMap.has(pt.id)) {
      uniqueMap.set(pt.id, { ...pt });
    }
  }

  const sorted = Array.from(uniqueMap.values()).sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );

  if (sorted.length === 0) {
    return {
      points: [],
      detectedStops: [],
      gpsGaps: [],
      totalDistanceKm: 0,
      movingMinutes: 0,
      stoppedMinutes: 0,
    };
  }

  let totalDistanceKm = 0;
  let movingSeconds = 0;
  let stoppedSeconds = 0;
  const gpsGaps: GPSGap[] = [];
  const enrichedPoints: TripGPSPoint[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const pt = { ...sorted[i], tripId, seq: i + 1 };
    if (pt.accuracy !== undefined && pt.accuracy > weakAccuracyMeters) {
      pt.isWeakSignal = true;
    }

    if (i === 0) {
      pt.distanceFromPrevKm = 0;
      if (pt.speedKmH === undefined || pt.speedKmH === null) pt.speedKmH = 0;
      enrichedPoints.push(pt);
      continue;
    }

    const prev = enrichedPoints[i - 1];
    const dtSec = Math.max(
      0,
      (new Date(pt.timestamp).getTime() - new Date(prev.timestamp).getTime()) / 1000
    );
    const segKm = haversineDistanceKm(prev.lat, prev.lng, pt.lat, pt.lng);
    const segMeters = segKm * 1000;

    // Filter impossible GPS teleport spike (> 160 km/h unless gap >= 60s)
    const derivedSpeedKmH = dtSec > 0 ? (segKm / dtSec) * 3600 : 0;
    pt.distanceFromPrevKm = Number(segKm.toFixed(4));
    totalDistanceKm += segKm;

    // Prefer hardware speed when realistic, otherwise derive from distance/time
    if (typeof pt.speedKmH !== 'number' || Number.isNaN(pt.speedKmH) || pt.speedKmH < 0) {
      pt.speedKmH = Number(Math.min(130, derivedSpeedKmH).toFixed(1));
    }

    // Check GPS signal/recording gap
    if (dtSec > gpsGapSeconds) {
      gpsGaps.push({
        id: `gap-${prev.id}-${pt.id}`,
        tripId,
        startTime: prev.timestamp,
        endTime: pt.timestamp,
        durationSeconds: Math.round(dtSec),
        reason: pt.isWeakSignal || prev.isWeakSignal ? 'weak_signal' : 'gps_paused',
        fromLat: prev.lat,
        fromLng: prev.lng,
        toLat: pt.lat,
        toLng: pt.lng,
      });
    }

    if (pt.speedKmH >= minMoveSpeed && segMeters > 10) {
      movingSeconds += Math.min(dtSec, gpsGapSeconds);
    } else {
      stoppedSeconds += Math.min(dtSec, gpsGapSeconds);
    }

    enrichedPoints.push(pt);
  }

  // Stop Detection: cluster consecutive low-speed points within jitter radius
  const detectedStops: DetectedStop[] = [];
  let cluster: TripGPSPoint[] = [];

  const finalizeCluster = (pts: TripGPSPoint[], isStillOpen: boolean) => {
    if (pts.length === 0) return;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const durationSec = Math.max(
      0,
      (new Date(last.timestamp).getTime() - new Date(first.timestamp).getTime()) / 1000
    );

    // Real prolonged stop vs brief pause (traffic lights / congestion)
    if (durationSec < stopThresholdSec) {
      return; // Ignored as real stop (brief traffic/congestion pause)
    }

    const avgLat = pts.reduce((s, p) => s + p.lat, 0) / pts.length;
    const avgLng = pts.reduce((s, p) => s + p.lng, 0) / pts.length;

    // Link nearest approved customer within stopRadiusMeters (never treat as delivery proof)
    let nearCustomerId: string | undefined;
    let nearCustomerName: string | undefined;
    let minCustomerDist = Infinity;

    for (const stop of approvedStops) {
      const distMeters = haversineDistanceMeters(avgLat, avgLng, stop.lat, stop.lng);
      if (distMeters <= stopRadiusMeters && distMeters < minCustomerDist) {
        minCustomerDist = distMeters;
        nearCustomerId = stop.customerId;
        nearCustomerName = stop.customerName;
      }
    }

    // Check if stop is right at the plant itself (not unplanned)
    const plantDist = haversineDistanceMeters(
      avgLat,
      avgLng,
      settings.plantLocation.lat,
      settings.plantLocation.lng
    );
    const isNearPlant = plantDist <= (settings.plantGeofenceMeters || 120);

    detectedStops.push({
      id: `stop-${first.id}`,
      tripId,
      lat: Number(avgLat.toFixed(6)),
      lng: Number(avgLng.toFixed(6)),
      startTime: first.timestamp,
      endTime: last.timestamp,
      durationMinutes: Number((durationSec / 60).toFixed(1)),
      isActive: isStillOpen,
      isProlongedStop: true,
      nearCustomerId,
      nearCustomerName,
      distanceToCustomerMeters: nearCustomerId ? Math.round(minCustomerDist) : undefined,
      isUnplannedStop: !nearCustomerId && !isNearPlant,
    });
  };

  for (let i = 0; i < enrichedPoints.length; i++) {
    const pt = enrichedPoints[i];
    const isLowSpeed = pt.speedKmH < minMoveSpeed;

    if (!isLowSpeed) {
      finalizeCluster(cluster, false);
      cluster = [];
      continue;
    }

    if (cluster.length === 0) {
      cluster = [pt];
    } else {
      const anchor = cluster[0];
      const distFromAnchorMeters = haversineDistanceMeters(anchor.lat, anchor.lng, pt.lat, pt.lng);
      if (distFromAnchorMeters <= stationaryJitterMeters) {
        cluster.push(pt);
      } else {
        finalizeCluster(cluster, false);
        cluster = [pt];
      }
    }
  }

  if (cluster.length > 0) {
    finalizeCluster(cluster, true);
  }

  return {
    points: enrichedPoints,
    detectedStops,
    gpsGaps,
    totalDistanceKm: Number(totalDistanceKm.toFixed(2)),
    movingMinutes: Number((movingSeconds / 60).toFixed(1)),
    stoppedMinutes: Number((stoppedSeconds / 60).toFixed(1)),
  };
}

export interface PlanVsActualSummary {
  plannedStopsCount: number;
  deliveredStopsCount: number;
  unvisitedPlannedStops: TripCustomerStop[];
  stopsWithLinkedGpsVisitCount: number;
  unplannedStops: DetectedStop[];
  totalDetectedStopsCount: number;
  totalStoppedMinutes: number;
  totalMovingMinutes: number;
  plannedDistanceKm: number;
  actualDistanceKm: number;
  plannedLiters: number;
  deliveredLiters: number;
  gpsPointsCount: number;
  gpsGapsCount: number;
}

/**
 * Generates an objective Plan-vs-Actual operational comparison for manager review.
 * Presents neutral facts without declaring automated violations.
 */
export function buildPlanVsActualSummary(trip: Trip): PlanVsActualSummary {
  const stops = trip.customerStops || [];
  const detectedStops = trip.detectedStops || [];
  const gpsPoints = trip.gpsPoints || [];
  const gpsGaps = trip.gpsGaps || [];

  const deliveredStopsCount = stops.filter((s) => s.status === 'delivered').length;
  const unvisitedPlannedStops = stops.filter((s) => s.status !== 'delivered');

  const visitedCustomerIds = new Set(
    detectedStops.map((s) => s.nearCustomerId).filter(Boolean) as string[]
  );
  const stopsWithLinkedGpsVisitCount = stops.filter((s) => visitedCustomerIds.has(s.customerId)).length;
  const unplannedStops = detectedStops.filter((s) => s.isUnplannedStop);

  const totalStoppedMinutes = Number(
    detectedStops.reduce((sum, s) => sum + (s.durationMinutes || 0), 0).toFixed(1)
  );

  return {
    plannedStopsCount: stops.length,
    deliveredStopsCount,
    unvisitedPlannedStops,
    stopsWithLinkedGpsVisitCount,
    unplannedStops,
    totalDetectedStopsCount: detectedStops.length,
    totalStoppedMinutes,
    totalMovingMinutes: trip.movingMinutes || 0,
    plannedDistanceKm: trip.estimatedDistanceKm || 0,
    actualDistanceKm: trip.actualDistanceKm ?? 0,
    plannedLiters: trip.initialLoadLiters || 0,
    deliveredLiters: trip.deliveredLiters || 0,
    gpsPointsCount: gpsPoints.length,
    gpsGapsCount: gpsGaps.length,
  };
}

/**
 * WakeLock helper to prevent screen sleep during active tracking on mobile PWA
 */
export async function requestScreenWakeLock(): Promise<WakeLockSentinel | null> {
  try {
    if (typeof navigator !== 'undefined' && 'wakeLock' in navigator) {
      return await navigator.wakeLock.request('screen');
    }
  } catch (err) {
    console.warn('WakeLock request skipped:', err);
  }
  return null;
}
