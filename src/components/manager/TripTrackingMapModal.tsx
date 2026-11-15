/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Interactive Google Maps Trip GPS Tracking, Detected Stops & Plan-vs-Actual Inspection
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  Circle,
  Polyline,
  useMap,
  useAdvancedMarkerRef,
  useApiIsLoaded,
} from '@vis.gl/react-google-maps';
import { DetectedStop, SystemSettings, Trip, TripCustomerStop, TripGPSPoint } from '../../types';
import { useGoogleMapsConfig } from '../common/GoogleMapsProvider';

interface TripTrackingMapProps {
  trip: Trip;
  settings: SystemSettings;
  height?: string;
  showLegend?: boolean;
  liveCoords?: { lat: number; lng: number; speedKmH?: number } | null;
}

const ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

function TripBoundsFitter({ points }: { points: google.maps.LatLngLiteral[] }) {
  const map = useMap();

  useEffect(() => {
    if (!map || points.length === 0 || typeof google === 'undefined' || !google.maps?.LatLngBounds) {
      return;
    }

    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(14);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    map.fitBounds(bounds, 35);

    const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
      const z = map.getZoom();
      if (z && z > 16) {
        map.setZoom(16);
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, points]);

  return null;
}

function PlantPin({
  lat,
  lng,
  name,
  geofenceMeters,
  isOpen,
  onToggle,
  onClose,
}: {
  lat: number;
  lng: number;
  name: string;
  geofenceMeters: number;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat, lng }}
        title={name}
        onClick={onToggle}
        zIndex={30}
      >
        <div className="w-9 h-9 rounded-full bg-sky-800 text-white font-bold text-[10px] flex items-center justify-center border-2 border-white shadow-lg cursor-pointer">
          المصنع
        </div>
      </AdvancedMarker>
      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={230}>
          <div dir="rtl" className="text-right font-sans text-xs p-0.5">
            <strong>نقطة الانطلاق: {name}</strong>
            <br />
            <span>نطاق الوصول: {geofenceMeters} متر</span>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function PlannedStopPin({
  stop,
  isOpen,
  onToggle,
  onClose,
}: {
  stop: TripCustomerStop;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const isDelivered = stop.status === 'delivered';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: stop.lat, lng: stop.lng }}
        title={stop.customerName}
        onClick={onToggle}
        zIndex={25}
      >
        <div
          className={`w-7 h-7 rounded-full ${
            isDelivered ? 'bg-emerald-600' : 'bg-sky-600'
          } text-white font-bold text-xs flex items-center justify-center border-2 border-white shadow cursor-pointer`}
        >
          {stop.stopSequence}
        </div>
      </AdvancedMarker>
      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={240}>
          <div dir="rtl" className="text-right font-sans text-xs min-w-[170px] p-0.5 space-y-0.5">
            <strong>
              #{stop.stopSequence} {stop.customerName}
            </strong>
            <div>
              {stop.district} · {stop.phone}
            </div>
            <div>
              المطلوب: <b>{stop.requestedLiters}L</b> · المسلم: <b>{stop.deliveredLiters}L</b>
            </div>
            <div>
              حالة التسليم: <b>{isDelivered ? 'تم التسليم' : 'لم يُسجل تسليم'}</b>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function BreadcrumbDot({
  point,
  isEndpoint,
  isOpen,
  onToggle,
  onClose,
}: {
  point: TripGPSPoint;
  isEndpoint: boolean;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const sizeClass = isEndpoint ? 'w-3.5 h-3.5' : 'w-2.5 h-2.5';
  const colorClass = point.isWeakSignal
    ? 'bg-rose-400 border-rose-700'
    : 'bg-sky-400 border-sky-800';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: point.lat, lng: point.lng }}
        title={`GPS #${point.seq}`}
        onClick={onToggle}
        zIndex={isEndpoint ? 22 : 12}
      >
        <div className={`${sizeClass} ${colorClass} rounded-full border-2 shadow-xs cursor-pointer`} />
      </AdvancedMarker>
      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={220}>
          <div dir="rtl" className="text-right font-sans text-[11px] p-0.5 space-y-0.5">
            <strong>نقطة GPS #{point.seq}</strong>
            <div>الوقت: {new Date(point.timestamp).toLocaleTimeString('ar-YE')}</div>
            <div>
              السرعة: <b>{point.speedKmH} كم/ساعة</b>
            </div>
            <div>
              الدقة: {point.accuracy ? `${Math.round(point.accuracy)}م` : 'غير متوفرة'}{' '}
              {point.isWeakSignal ? '⚠️ إشارة ضعيفة' : ''}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function DetectedStopPin({
  stop,
  idx,
  isOpen,
  onToggle,
  onClose,
}: {
  stop: DetectedStop;
  idx: number;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const bg = stop.nearCustomerId ? 'bg-emerald-700' : 'bg-amber-600';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: stop.lat, lng: stop.lng }}
        title={`توقف #${idx + 1}`}
        onClick={onToggle}
        zIndex={35}
      >
        <div
          className={`px-2 py-0.5 rounded-full ${bg} text-white font-mono font-bold text-[10px] border-2 border-white shadow-lg whitespace-nowrap cursor-pointer`}
        >
          ⏸ {stop.durationMinutes}د
        </div>
      </AdvancedMarker>
      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={240}>
          <div dir="rtl" className="text-right font-sans text-xs min-w-[190px] p-0.5 space-y-0.5">
            <strong>
              توقف #{idx + 1} ({stop.durationMinutes} دقيقة)
            </strong>
            <div>البداية: {new Date(stop.startTime).toLocaleTimeString('ar-YE')}</div>
            <div>النهاية: {stop.endTime ? new Date(stop.endTime).toLocaleTimeString('ar-YE') : 'مستمر'}</div>
            <div>
              {stop.nearCustomerName ? (
                <span>
                  قرب الزبون: <b className="text-emerald-700">{stop.nearCustomerName}</b> (
                  {stop.distanceToCustomerMeters}م)
                </span>
              ) : (
                <span className="text-amber-700">توقف بعيد عن مواقع الزبائن المعتمدين</span>
              )}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function ReturnPin({
  returnLocation,
  isOpen,
  onToggle,
  onClose,
}: {
  returnLocation: NonNullable<Trip['returnLocation']>;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: returnLocation.lat, lng: returnLocation.lng }}
        title="نقطة تأكيد العودة للمصنع"
        onClick={onToggle}
        zIndex={40}
      >
        <div className="w-4 h-4 rounded-full bg-emerald-500 border-2 border-slate-900 shadow-md cursor-pointer" />
      </AdvancedMarker>
      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={220}>
          <div dir="rtl" className="text-right font-sans text-[11px] p-0.5">
            <strong>نقطة تأكيد العودة للمصنع</strong>
            <br />
            <span>المسافة عن المصنع: {returnLocation.distanceFromPlantMeters} م</span>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function LiveVehiclePin({
  liveCoords,
  isOpen,
  onToggle,
  onClose,
}: {
  liveCoords: { lat: number; lng: number; speedKmH?: number };
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: liveCoords.lat, lng: liveCoords.lng }}
        title="الموقع الحالي للوايت"
        onClick={onToggle}
        zIndex={55}
      >
        <div className="relative flex items-center justify-center w-6 h-6 cursor-pointer">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full w-4 h-4 bg-emerald-500 border-2 border-white shadow-md" />
        </div>
      </AdvancedMarker>
      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={210}>
          <div dir="rtl" className="text-right font-sans text-[11px] p-0.5">
            <strong>الموقع الحالي للوايت</strong>
            <br />
            <span>
              السرعة: <b>{liveCoords.speedKmH ?? 0} كم/ساعة</b>
            </span>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function TripTrackingCanvas({
  trip,
  settings,
  liveCoords = null,
}: {
  trip: Trip;
  settings: SystemSettings;
  liveCoords?: { lat: number; lng: number; speedKmH?: number } | null;
}) {
  const isApiLoaded = useApiIsLoaded();
  const [activeInfoId, setActiveInfoId] = useState<string | null>(null);

  const pLat = settings.plantLocation.lat;
  const pLng = settings.plantLocation.lng;

  const sortedGpsPoints = useMemo(() => {
    return (trip.gpsPoints || [])
      .slice()
      .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }, [trip.gpsPoints]);

  const gpsPolylinePath = useMemo<google.maps.LatLngLiteral[]>(() => {
    return sortedGpsPoints.map((p) => ({ lat: p.lat, lng: p.lng }));
  }, [sortedGpsPoints]);

  const boundPoints = useMemo<google.maps.LatLngLiteral[]>(() => {
    const pts: google.maps.LatLngLiteral[] = [{ lat: pLat, lng: pLng }];
    (trip.customerStops || []).forEach((s) => pts.push({ lat: s.lat, lng: s.lng }));
    sortedGpsPoints.forEach((p) => pts.push({ lat: p.lat, lng: p.lng }));
    (trip.detectedStops || []).forEach((st) => pts.push({ lat: st.lat, lng: st.lng }));
    if (trip.returnLocation) {
      pts.push({ lat: trip.returnLocation.lat, lng: trip.returnLocation.lng });
    }
    if (liveCoords && typeof liveCoords.lat === 'number' && typeof liveCoords.lng === 'number') {
      pts.push({ lat: liveCoords.lat, lng: liveCoords.lng });
    }
    return pts;
  }, [pLat, pLng, trip, sortedGpsPoints, liveCoords]);

  if (!isApiLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 text-xs text-slate-500">
        جاري تحميل خريطة التتبع عبر خرائط جوجل...
      </div>
    );
  }

  return (
    <GoogleMap
      mapId="DEMO_MAP_ID"
      defaultCenter={{ lat: pLat, lng: pLng }}
      defaultZoom={14}
      gestureHandling="greedy"
      mapTypeControl={true}
      streetViewControl={false}
      fullscreenControl={true}
      internalUsageAttributionIds={ATTRIBUTION_IDS}
      style={{ width: '100%', height: '100%' }}
      onClick={() => setActiveInfoId(null)}
    >
      <TripBoundsFitter points={boundPoints} />

      {/* 1. Plant Geofence & Departure Marker */}
      <Circle
        center={{ lat: pLat, lng: pLng }}
        radius={settings.plantGeofenceMeters || 120}
        strokeColor="#0369a1"
        strokeOpacity={0.8}
        strokeWeight={1.5}
        fillColor="#0ea5e9"
        fillOpacity={0.1}
      />
      <PlantPin
        lat={pLat}
        lng={pLng}
        name={settings.plantLocation.name}
        geofenceMeters={settings.plantGeofenceMeters || 120}
        isOpen={activeInfoId === 'plant'}
        onToggle={() => setActiveInfoId((p) => (p === 'plant' ? null : 'plant'))}
        onClose={() => setActiveInfoId(null)}
      />

      {/* 2. Planned Customer Stops & Geofence Circles */}
      {(trip.customerStops || []).map((stop) => (
        <React.Fragment key={`planned-${stop.orderId || stop.customerId}-${stop.stopSequence}`}>
          <Circle
            center={{ lat: stop.lat, lng: stop.lng }}
            radius={settings.stopRadiusMeters || 80}
            strokeColor={stop.status === 'delivered' ? '#16a34a' : '#2563eb'}
            strokeOpacity={0.7}
            strokeWeight={1}
            fillColor={stop.status === 'delivered' ? '#16a34a' : '#2563eb'}
            fillOpacity={0.06}
          />
          <PlannedStopPin
            stop={stop}
            isOpen={activeInfoId === `stop-${stop.stopSequence}`}
            onToggle={() =>
              setActiveInfoId((p) => (p === `stop-${stop.stopSequence}` ? null : `stop-${stop.stopSequence}`))
            }
            onClose={() => setActiveInfoId(null)}
          />
        </React.Fragment>
      ))}

      {/* 3. Actual GPS Track Polyline + Raw Breadcrumbs */}
      {gpsPolylinePath.length > 1 && (
        <Polyline path={gpsPolylinePath} strokeColor="#0284c7" strokeOpacity={0.85} strokeWeight={4} />
      )}
      {sortedGpsPoints.map((pt, idx) => (
        <BreadcrumbDot
          key={pt.id || `gps-${idx}`}
          point={pt}
          isEndpoint={idx === 0 || idx === sortedGpsPoints.length - 1}
          isOpen={activeInfoId === `pt-${pt.id || idx}`}
          onToggle={() =>
            setActiveInfoId((p) => (p === `pt-${pt.id || idx}` ? null : `pt-${pt.id || idx}`))
          }
          onClose={() => setActiveInfoId(null)}
        />
      ))}

      {/* 4. Detected Prolonged Stops */}
      {(trip.detectedStops || []).map((stop, idx) => (
        <DetectedStopPin
          key={stop.id || `dstop-${idx}`}
          stop={stop}
          idx={idx}
          isOpen={activeInfoId === `dstop-${idx}`}
          onToggle={() => setActiveInfoId((p) => (p === `dstop-${idx}` ? null : `dstop-${idx}`))}
          onClose={() => setActiveInfoId(null)}
        />
      ))}

      {/* 5. GPS Gaps highlighted in dashed rose polyline */}
      {(trip.gpsGaps || []).map((gap, idx) =>
        gap.fromLat && gap.fromLng && gap.toLat && gap.toLng ? (
          <Polyline
            key={`gap-${idx}`}
            path={[
              { lat: gap.fromLat, lng: gap.fromLng },
              { lat: gap.toLat, lng: gap.toLng },
            ]}
            strokeColor="#e11d48"
            strokeOpacity={0}
            strokeWeight={3}
            icons={[
              {
                icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: '#e11d48', scale: 3 },
                offset: '0',
                repeat: '12px',
              },
            ]}
          />
        ) : null
      )}

      {/* 6. Return Pin */}
      {trip.returnLocation && (
        <ReturnPin
          returnLocation={trip.returnLocation}
          isOpen={activeInfoId === 'return'}
          onToggle={() => setActiveInfoId((p) => (p === 'return' ? null : 'return'))}
          onClose={() => setActiveInfoId(null)}
        />
      )}

      {/* 7. Live Vehicle Marker */}
      {liveCoords && typeof liveCoords.lat === 'number' && typeof liveCoords.lng === 'number' && (
        <LiveVehiclePin
          liveCoords={liveCoords}
          isOpen={activeInfoId === 'live'}
          onToggle={() => setActiveInfoId((p) => (p === 'live' ? null : 'live'))}
          onClose={() => setActiveInfoId(null)}
        />
      )}
    </GoogleMap>
  );
}

export const TripTrackingMap: React.FC<TripTrackingMapProps> = ({
  trip,
  settings,
  height = '420px',
  showLegend = true,
  liveCoords = null,
}) => {
  const { hasKey, isLoadingKey, loadError } = useGoogleMapsConfig();

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100" style={{ height }}>
      {hasKey && !loadError ? (
        <div style={{ height: '100%', width: '100%' }}>
          <TripTrackingCanvas trip={trip} settings={settings} liveCoords={liveCoords} />
        </div>
      ) : (
        <div className="w-full h-full flex items-center justify-center p-4 text-center text-xs text-slate-600">
          {isLoadingKey ? 'جاري تهيئة خريطة التتبع...' : 'بيانات تتبع المسار والـ GPS محفوظة رقمياً في سجل الرحلة.'}
        </div>
      )}

      {showLegend && (
        <div className="absolute bottom-2.5 right-2.5 bg-white/95 backdrop-blur-xs border border-slate-200 px-3 py-2 rounded-lg shadow z-10 text-[11px] text-slate-700 space-y-1">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-sky-800 inline-block" />
            <span>المصنع ({settings.plantGeofenceMeters || 120}م)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-1 bg-sky-600 inline-block rounded" />
            <span>المسار الفعلي للوايت ({trip.gpsPoints?.length || 0} نقطة)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-1 rounded bg-emerald-700 text-white text-[9px]">⏸</span>
            <span>توقف قرب زبون</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-1 rounded bg-amber-600 text-white text-[9px]">⏸</span>
            <span>توقف خارج مواقع الزبائن</span>
          </div>
        </div>
      )}
    </div>
  );
};
