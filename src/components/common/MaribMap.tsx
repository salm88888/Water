/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Interactive Google Map for Marib District
 * Shows Water Plant, Customers, Live Truck GPS Position, Route Lines, and Event Pins.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  Polyline,
  useMap,
  useAdvancedMarkerRef,
  useApiIsLoaded,
} from '@vis.gl/react-google-maps';
import { Customer, Truck, TripCustomerStop, GPSEvent, SystemSettings } from '../../types';
import { useGoogleMapsConfig } from './GoogleMapsProvider';

interface MaribMapProps {
  settings: SystemSettings;
  truck?: Truck;
  customerStops?: TripCustomerStop[];
  allCustomers?: Customer[];
  gpsEvents?: GPSEvent[];
  height?: string;
  selectedStopSequence?: number;
  onMarkerClick?: (customerId: string) => void;
}

const ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

function BoundsFitter({ points }: { points: google.maps.LatLngLiteral[] }) {
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
    points.forEach((pt) => bounds.extend(pt));
    map.fitBounds(bounds, 50);

    const listener = google.maps.event.addListenerOnce(map, 'idle', () => {
      const z = map.getZoom();
      if (z && z > 15) {
        map.setZoom(15);
      }
    });

    return () => {
      google.maps.event.removeListener(listener);
    };
  }, [map, points]);

  return null;
}

function PlantMarker({
  plantLocation,
  isOpen,
  onToggle,
  onClose,
}: {
  plantLocation: SystemSettings['plantLocation'];
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: plantLocation.lat, lng: plantLocation.lng }}
        title={plantLocation.name}
        onClick={onToggle}
        zIndex={30}
      >
        <div className="flex items-center justify-center w-10 h-10 bg-sky-700 text-white rounded-full shadow-lg border-2 border-white cursor-pointer hover:scale-105 transition-transform">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
        </div>
      </AdvancedMarker>

      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={260}>
          <div dir="rtl" className="text-right font-sans p-1">
            <h4 className="font-bold text-sky-700 text-sm mb-1">{plantLocation.name}</h4>
            <p className="text-xs text-slate-600 m-0">{plantLocation.city}</p>
            <div className="mt-1.5 text-[11px] text-sky-700 bg-sky-50 px-2 py-1 rounded">
              محطة الانطلاق والتعبئة المركزية للوايت
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function StopMarker({
  stop,
  isSelected,
  isOpen,
  onSelect,
  onClose,
}: {
  stop: TripCustomerStop;
  isSelected: boolean;
  isOpen: boolean;
  onSelect: () => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();
  const isDelivered = stop.status === 'delivered';
  const isArrived = stop.status === 'arrived';
  const pinColor = isDelivered ? 'bg-emerald-600' : isArrived ? 'bg-amber-500' : 'bg-sky-600';
  const ring = isSelected ? 'ring-4 ring-sky-400 ring-offset-2' : '';

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: stop.lat, lng: stop.lng }}
        title={stop.customerName}
        onClick={onSelect}
        zIndex={isSelected ? 40 : 20}
      >
        <div
          className={`flex items-center justify-center w-8 h-8 ${pinColor} ${ring} text-white font-bold text-xs rounded-full shadow-md border-2 border-white cursor-pointer hover:scale-110 transition-transform`}
        >
          {stop.stopSequence}
        </div>
      </AdvancedMarker>

      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={240}>
          <div dir="rtl" className="text-right font-sans min-w-[180px] p-1 space-y-1">
            <div className="font-bold text-sm text-slate-900">{stop.customerName}</div>
            <div className="text-xs text-slate-500">
              {stop.district} - {stop.phone}
            </div>
            <hr className="border-slate-200 my-1" />
            <div className="flex justify-between text-xs">
              <span>المطلوب:</span>
              <span className="font-bold text-sky-700">{stop.requestedLiters.toLocaleString()} لتر</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>سعة الخزان:</span>
              <span>{stop.tankCapacity.toLocaleString()} لتر</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>الحالة:</span>
              <span
                className={`font-semibold ${
                  isDelivered ? 'text-emerald-600' : isArrived ? 'text-amber-600' : 'text-sky-600'
                }`}
              >
                {isDelivered ? 'تم التسليم' : isArrived ? 'الوايت عند العميل' : 'في الانتظار'}
              </span>
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function CustomerDotMarker({
  customer,
  isOpen,
  onToggle,
  onClose,
}: {
  customer: Customer;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: customer.lat, lng: customer.lng }}
        title={customer.name}
        onClick={onToggle}
        zIndex={10}
      >
        <div className="w-3.5 h-3.5 bg-sky-500 hover:bg-sky-700 rounded-full border-2 border-white shadow cursor-pointer transition-colors" />
      </AdvancedMarker>

      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={220}>
          <div dir="rtl" className="text-right font-sans p-1">
            <div className="font-bold text-xs text-slate-900">{customer.name}</div>
            <div className="text-[11px] text-slate-500">
              {customer.district} - {customer.phone}
            </div>
            <div className="text-[11px] text-sky-700 mt-1">
              سعة الخزان: {customer.tankCapacityLiters.toLocaleString()} لتر
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function TruckLiveMarker({
  truck,
  isOpen,
  onToggle,
  onClose,
}: {
  truck: Truck;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: truck.lastLat, lng: truck.lastLng }}
        title={`وايت المياه - ${truck.driverName}`}
        onClick={onToggle}
        zIndex={50}
      >
        <div className="relative flex items-center justify-center w-11 h-11 bg-amber-600 text-white rounded-full shadow-2xl border-2 border-white animate-bounce cursor-pointer">
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"
            />
          </svg>
        </div>
      </AdvancedMarker>

      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={250}>
          <div dir="rtl" className="text-right font-sans min-w-[190px] p-1 space-y-1">
            <h4 className="font-bold text-amber-700 text-xs">وايت المياه (6,000L)</h4>
            <p className="text-xs text-slate-600 m-0">السائق: {truck.driverName}</p>
            <hr className="border-slate-200 my-1" />
            <div className="text-xs flex justify-between">
              <span>السرعة الحالية:</span>
              <span className="font-bold font-mono">{truck.lastSpeed || 0} كم/ساعة</span>
            </div>
            <div className="text-xs flex justify-between">
              <span>الماء المتبقي بالوايت:</span>
              <span className="font-bold text-sky-700">{truck.currentWaterLiters.toLocaleString()} لتر</span>
            </div>
            <div className="text-xs flex justify-between">
              <span>آخر حدث:</span>
              <span className="font-semibold text-slate-800">{truck.lastEvent}</span>
            </div>
            <div className="text-[11px] text-slate-500">
              تحديث: {new Date(truck.lastUpdateTimestamp).toLocaleTimeString('ar-YE')}
            </div>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function MaribMapCanvas({
  settings,
  truck,
  customerStops = [],
  allCustomers = [],
  gpsEvents = [],
  selectedStopSequence,
  onMarkerClick,
}: MaribMapProps) {
  const isApiLoaded = useApiIsLoaded();
  const [activeInfoId, setActiveInfoId] = useState<string | null>(null);

  const plantLat = settings.plantLocation.lat || 15.4645;
  const plantLng = settings.plantLocation.lng || 45.3235;

  const routePath = useMemo<google.maps.LatLngLiteral[]>(() => {
    if (customerStops.length === 0) return [];
    return [
      { lat: plantLat, lng: plantLng },
      ...customerStops.map((s) => ({ lat: s.lat, lng: s.lng })),
      { lat: plantLat, lng: plantLng },
    ];
  }, [customerStops, plantLat, plantLng]);

  const gpsTrailPath = useMemo<google.maps.LatLngLiteral[]>(() => {
    if (gpsEvents.length <= 1) return [];
    return gpsEvents.map((g) => ({ lat: g.lat, lng: g.lng }));
  }, [gpsEvents]);

  const allBoundPoints = useMemo<google.maps.LatLngLiteral[]>(() => {
    const pts: google.maps.LatLngLiteral[] = [{ lat: plantLat, lng: plantLng }];
    if (customerStops.length > 0) {
      customerStops.forEach((s) => pts.push({ lat: s.lat, lng: s.lng }));
    } else if (allCustomers.length > 0) {
      allCustomers.forEach((c) => {
        if (c.lat && c.lng) pts.push({ lat: c.lat, lng: c.lng });
      });
    }
    if (truck && truck.lastLat && truck.lastLng) {
      pts.push({ lat: truck.lastLat, lng: truck.lastLng });
    }
    return pts;
  }, [plantLat, plantLng, customerStops, allCustomers, truck]);

  if (!isApiLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 text-xs text-slate-500">
        جاري تحميل خرائط جوجل لمحافظة مأرب...
      </div>
    );
  }

  return (
    <GoogleMap
      mapId="DEMO_MAP_ID"
      defaultCenter={{ lat: plantLat, lng: plantLng }}
      defaultZoom={14}
      gestureHandling="greedy"
      mapTypeControl={true}
      streetViewControl={false}
      fullscreenControl={true}
      internalUsageAttributionIds={ATTRIBUTION_IDS}
      style={{ width: '100%', height: '100%' }}
      onClick={() => setActiveInfoId(null)}
    >
      <BoundsFitter points={allBoundPoints} />

      <PlantMarker
        plantLocation={{ ...settings.plantLocation, lat: plantLat, lng: plantLng }}
        isOpen={activeInfoId === 'plant'}
        onToggle={() => setActiveInfoId((prev) => (prev === 'plant' ? null : 'plant'))}
        onClose={() => setActiveInfoId(null)}
      />

      {customerStops.length > 0
        ? customerStops.map((stop) => (
            <StopMarker
              key={`stop-${stop.orderId || stop.customerId}-${stop.stopSequence}`}
              stop={stop}
              isSelected={selectedStopSequence === stop.stopSequence}
              isOpen={activeInfoId === `stop-${stop.customerId}-${stop.stopSequence}`}
              onSelect={() => {
                setActiveInfoId(`stop-${stop.customerId}-${stop.stopSequence}`);
                if (onMarkerClick) onMarkerClick(stop.customerId);
              }}
              onClose={() => setActiveInfoId(null)}
            />
          ))
        : allCustomers
            .filter((c) => c.lat && c.lng)
            .map((cust) => (
              <CustomerDotMarker
                key={cust.id}
                customer={cust}
                isOpen={activeInfoId === `cust-${cust.id}`}
                onToggle={() => setActiveInfoId((prev) => (prev === `cust-${cust.id}` ? null : `cust-${cust.id}`))}
                onClose={() => setActiveInfoId(null)}
              />
            ))}

      {routePath.length > 1 && (
        <Polyline
          path={routePath}
          strokeColor="#0284c7"
          strokeOpacity={0}
          strokeWeight={3.5}
          icons={[
            {
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.85, strokeColor: '#0284c7', scale: 3 },
              offset: '0',
              repeat: '12px',
            },
          ]}
        />
      )}

      {gpsTrailPath.length > 1 && (
        <Polyline path={gpsTrailPath} strokeColor="#f59e0b" strokeOpacity={0.65} strokeWeight={3} />
      )}

      {truck && truck.lastLat && truck.lastLng && (
        <TruckLiveMarker
          truck={truck}
          isOpen={activeInfoId === 'truck'}
          onToggle={() => setActiveInfoId((prev) => (prev === 'truck' ? null : 'truck'))}
          onClose={() => setActiveInfoId(null)}
        />
      )}
    </GoogleMap>
  );
}

export const MaribMap: React.FC<MaribMapProps> = (props) => {
  const { height = '500px', settings } = props;
  const { hasKey, isLoadingKey, loadError } = useGoogleMapsConfig();

  return (
    <div
      className="relative w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100"
      style={{ height, minHeight: '280px' }}
    >
      {hasKey && !loadError ? (
        <div style={{ height: '100%', width: '100%', minHeight: '280px' }}>
          <MaribMapCanvas {...props} />
        </div>
      ) : (
        <div
          className="w-full h-full flex flex-col items-center justify-center p-4 text-center text-slate-600 text-xs"
          style={{ minHeight: '280px' }}
        >
          {isLoadingKey
            ? 'جاري تهيئة خرائط جوجل...'
            : 'تتعذر تهيئة الخريطة حالياً. يمكنك متابعة العمل من الجداول وحفظ الموقع.'}
        </div>
      )}

      {/* Map Legend */}
      <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-sm border border-slate-200 px-3 py-2 rounded-lg shadow-md z-10 text-xs text-slate-700 space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-sky-700"></div>
          <span>{settings.plantLocation.name}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-amber-600"></div>
          <span>وايت المياه (مباشر)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-sky-600"></div>
          <span>منازل العملاء (المسار)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-emerald-600"></div>
          <span>تم تسليم المياه</span>
        </div>
      </div>
    </div>
  );
};
