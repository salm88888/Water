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

export interface PlantDepartureEvaluation {
  distanceFromPlantMeters: number;
  geofenceRadius: number;
  triggerDistanceMeters: number;
  maxAllowedAccuracy: number;
  isReliableAccuracy: boolean;
  insidePlant: boolean;
  outsideTriggerZone: boolean;
  highConfidenceFastDeparture: boolean;
}

/**
 * Evaluates whether a GPS reading indicates the truck has genuinely left the plant perimeter
 * (beyond geofence radius + buffer) with reliable GPS accuracy, avoiding false starts from drift.
 */
export function evaluatePlantDepartureTrigger(params: {
  lat: number;
  lng: number;
  accuracy?: number;
  speedKmH?: number;
  settings: SystemSettings;
}): PlantDepartureEvaluation {
  const { lat, lng, accuracy, speedKmH, settings } = params;
  const distanceFromPlantMeters = Math.round(
    haversineDistanceMeters(lat, lng, settings.plantLocation.lat, settings.plantLocation.lng)
  );
  const geofenceRadius = Math.max(60, settings.plantGeofenceMeters || 120);
  const triggerDistanceMeters = Math.max(geofenceRadius + 35, 150);
  const maxAllowedAccuracy = Math.max(settings.gpsWeakAccuracyMeters || 60, 80);
  const isReliableAccuracy = accuracy === undefined || accuracy <= maxAllowedAccuracy;
  const insidePlant = distanceFromPlantMeters <= geofenceRadius;
  const outsideTriggerZone = isReliableAccuracy && distanceFromPlantMeters >= triggerDistanceMeters;
  const minMoveSpeed = settings.minMovementSpeedKmH || 8;
  const highConfidenceFastDeparture =
    outsideTriggerZone &&
    typeof speedKmH === 'number' &&
    speedKmH >= minMoveSpeed &&
    distanceFromPlantMeters >= triggerDistanceMeters + 50;

  return {
    distanceFromPlantMeters,
    geofenceRadius,
    triggerDistanceMeters,
    maxAllowedAccuracy,
    isReliableAccuracy,
    insidePlant,
    outsideTriggerZone,
    highConfidenceFastDeparture,
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

    // Prefer hardware speed when realistic, otherwise derive from distance/time
    if (typeof pt.speedKmH !== 'number' || Number.isNaN(pt.speedKmH) || pt.speedKmH < 0) {
      pt.speedKmH = Number(Math.min(130, derivedSpeedKmH).toFixed(1));
    }

    const isTeleportSpike = dtSec > 0 && dtSec < 60 && derivedSpeedKmH > 160;
    const isWeakSignalDrift =
      Boolean(pt.isWeakSignal) &&
      segMeters <= Math.max(pt.accuracy || 0, 120) &&
      pt.speedKmH < minMoveSpeed;
    const isStationaryJitter = segMeters < 18 && pt.speedKmH < 2;

    if (isTeleportSpike || isWeakSignalDrift || isStationaryJitter) {
      pt.distanceFromPrevKm = 0;
    } else {
      pt.distanceFromPrevKm = Number(segKm.toFixed(4));
      totalDistanceKm += segKm;
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

export interface TripCompletionReadiness {
  qualified: boolean;
  hasDeparted: boolean;
  hasConfirmedReturn: boolean;
  visitedCustomerStop: boolean;
  maxDistanceFromOriginMeters: number;
  filteredDistanceKm: number;
  elapsedSeconds: number;
  departureThresholdMeters: number;
  geofenceRadius: number;
  reason: string;
}

/**
 * Evaluates whether an in-progress trip genuinely left the starting point/plant,
 * executed a real route (either >= 450m radial departure & >= 0.8km filtered travel & >= 2m duration,
 * or visited a planned customer stop >= 180m away), and returned inside the plant/origin geofence
 * for at least 2 consecutive reliable GPS readings.
 * Prevents premature completion when moving only a few meters or during GPS drift/jitter.
 */
export function evaluateTripCompletionReadiness(params: {
  trip: Trip;
  settings: SystemSettings;
  points?: TripGPSPoint[];
  originOverride?: { lat: number; lng: number };
  candidateReturnLocation?: { lat: number; lng: number; accuracy?: number };
}): TripCompletionReadiness {
  const { trip, settings, originOverride, candidateReturnLocation } = params;
  const rawPoints = params.points ?? trip.gpsPoints ?? [];

  const geofenceRadius = Math.max(60, settings.plantGeofenceMeters || 120);
  const departureThresholdMeters = Math.max(geofenceRadius * 3.5, 450);
  const stopVisitRadiusMeters = Math.max(settings.stopRadiusMeters || 80, 100);
  const minNearbyCustomerOriginMeters = Math.max(geofenceRadius * 1.5, 180);
  const maxAllowedAccuracy = Math.max(settings.gpsWeakAccuracyMeters || 60, 80);

  const analysis = analyzeGpsTrack({
    tripId: trip.id,
    rawPoints,
    approvedStops: trip.customerStops || [],
    settings,
  });

  const points = analysis.points;
  const firstReliable = points.find(
    (p) => p.accuracy === undefined || p.accuracy <= maxAllowedAccuracy
  );
  const startInsidePlant =
    trip.startLocation !== undefined &&
    isWithinPlantGeofence(trip.startLocation.lat, trip.startLocation.lng, settings).inside;
  const anchorToStartOrPlant = trip.id.startsWith('trip-auto-') || startInsidePlant;
  const origin =
    originOverride ||
    (anchorToStartOrPlant
      ? trip.startLocation || settings.plantLocation
      : (firstReliable ? { lat: firstReliable.lat, lng: firstReliable.lng } : undefined) ||
        trip.startLocation ||
        settings.plantLocation);

  const reliablePoints = points.filter(
    (p) => p.accuracy === undefined || p.accuracy <= maxAllowedAccuracy
  );

  // Elapsed time since trip start or first GPS point
  const startMsCandidates: number[] = [];
  if (trip.startedAt) startMsCandidates.push(new Date(trip.startedAt).getTime());
  if (points.length > 0) startMsCandidates.push(new Date(points[0].timestamp).getTime());
  const startMs =
    startMsCandidates.length > 0
      ? Math.min(...startMsCandidates.filter((v) => Number.isFinite(v)))
      : Date.now();
  const latestPtMs =
    points.length > 0
      ? new Date(points[points.length - 1].timestamp).getTime()
      : Date.now();
  const elapsedSeconds = Math.max(0, Math.round((latestPtMs - startMs) / 1000));

  let maxDistanceFromOriginMeters = 0;
  let consecutiveOutsideDeparture = 0;
  let departureConfirmIdx = -1;
  let consecutiveCustomerHits = 0;
  let visitedCustomerStop = (trip.detectedStops || []).some((s) => Boolean(s.nearCustomerId));

  const stops = trip.customerStops || [];

  for (let i = 0; i < reliablePoints.length; i++) {
    const pt = reliablePoints[i];
    const distFromOrigin = haversineDistanceMeters(pt.lat, pt.lng, origin.lat, origin.lng);
    const distFromPlant = haversineDistanceMeters(
      pt.lat,
      pt.lng,
      settings.plantLocation.lat,
      settings.plantLocation.lng
    );
    if (distFromOrigin > maxDistanceFromOriginMeters) {
      maxDistanceFromOriginMeters = distFromOrigin;
    }

    const isOutsideDeparture =
      distFromOrigin >= departureThresholdMeters && distFromPlant >= departureThresholdMeters;

    if (isOutsideDeparture) {
      consecutiveOutsideDeparture += 1;
      if (consecutiveOutsideDeparture >= 2 && departureConfirmIdx === -1) {
        departureConfirmIdx = i;
      }
    } else {
      consecutiveOutsideDeparture = 0;
    }

    // Also detect genuine visit to a planned customer stop (even if close to plant)
    const isNearCustomer =
      distFromOrigin >= minNearbyCustomerOriginMeters &&
      stops.some(
        (s) => haversineDistanceMeters(pt.lat, pt.lng, s.lat, s.lng) <= stopVisitRadiusMeters
      );

    if (isNearCustomer) {
      consecutiveCustomerHits += 1;
      if (consecutiveCustomerHits >= 2) {
        visitedCustomerStop = true;
        if (departureConfirmIdx === -1) {
          departureConfirmIdx = i;
        }
      }
    } else {
      consecutiveCustomerHits = 0;
    }
  }

  const hasDeparted = departureConfirmIdx !== -1;

  // Check return confirmation ONLY from points strictly after departure confirmation
  const postDeparturePoints = hasDeparted ? reliablePoints.slice(departureConfirmIdx + 1) : [];
  const checkInsideReturnGeofence = (lat: number, lng: number) => {
    const dOrigin = haversineDistanceMeters(lat, lng, origin.lat, origin.lng);
    const dPlant = haversineDistanceMeters(
      lat,
      lng,
      settings.plantLocation.lat,
      settings.plantLocation.lng
    );
    return dOrigin <= geofenceRadius || dPlant <= geofenceRadius;
  };

  let consecutiveReturnHits = 0;
  if (postDeparturePoints.length >= 2) {
    const lastTwo = postDeparturePoints.slice(-2);
    if (lastTwo.every((p) => checkInsideReturnGeofence(p.lat, p.lng))) {
      consecutiveReturnHits = 2;
    }
  } else if (
    postDeparturePoints.length === 1 &&
    candidateReturnLocation &&
    (candidateReturnLocation.accuracy === undefined ||
      candidateReturnLocation.accuracy <= maxAllowedAccuracy)
  ) {
    if (
      checkInsideReturnGeofence(postDeparturePoints[0].lat, postDeparturePoints[0].lng) &&
      checkInsideReturnGeofence(candidateReturnLocation.lat, candidateReturnLocation.lng)
    ) {
      consecutiveReturnHits = 2;
    }
  }

  const hasConfirmedReturn = consecutiveReturnHits >= 2;

  const filteredDistanceKm = analysis.totalDistanceKm;
  const minDistanceKmRequired = visitedCustomerStop ? 0.3 : 0.8;
  const minDurationSecRequired = visitedCustomerStop ? 60 : 120;

  const hasSufficientTravel =
    (visitedCustomerStop &&
      maxDistanceFromOriginMeters >= minNearbyCustomerOriginMeters &&
      filteredDistanceKm >= minDistanceKmRequired) ||
    (maxDistanceFromOriginMeters >= departureThresholdMeters &&
      filteredDistanceKm >= minDistanceKmRequired);

  const hasMinDuration = elapsedSeconds >= minDurationSecRequired;

  const qualified = hasDeparted && hasSufficientTravel && hasMinDuration && hasConfirmedReturn;

  let reason = 'قيد التتبع';
  if (!hasDeparted) {
    reason = `لم يبتعد الوايت عن نقطة الانطلاق بمسافة كافية بعد (أقصى مسافة: ${Math.round(maxDistanceFromOriginMeters)}م من أصل ${departureThresholdMeters}م)`;
  } else if (!hasSufficientTravel) {
    reason = `المسافة الفعلية المقطوعة غير كافية لاعتبارها رحلة مكتملة (${filteredDistanceKm} كم من أصل ${minDistanceKmRequired} كم المطلوبة)`;
  } else if (!hasMinDuration) {
    reason = `مدة الرحلة قصيرة جداً (${elapsedSeconds} ث من أصل ${minDurationSecRequired} ث المطلوبة)`;
  } else if (!hasConfirmedReturn) {
    reason = 'الوايت خارج نطاق العودة أو بانتظار تأكيد قراءتين متتاليتين داخل نقطة الانطلاق';
  } else {
    reason = 'اكتملت شروط الانطلاق الفعلي والعودة المؤكدة لنقطة الانطلاق';
  }

  return {
    qualified,
    hasDeparted,
    hasConfirmedReturn,
    visitedCustomerStop,
    maxDistanceFromOriginMeters: Math.round(maxDistanceFromOriginMeters),
    filteredDistanceKm,
    elapsedSeconds,
    departureThresholdMeters,
    geofenceRadius,
    reason,
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
