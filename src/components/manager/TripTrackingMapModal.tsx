/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Interactive Trip GPS Tracking, Detected Stops & Plan-vs-Actual Map Inspection
 */

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { SystemSettings, Trip } from '../../types';

interface TripTrackingMapProps {
  trip: Trip;
  settings: SystemSettings;
  height?: string;
  showLegend?: boolean;
  liveCoords?: { lat: number; lng: number; speedKmH?: number } | null;
}

export const TripTrackingMap: React.FC<TripTrackingMapProps> = ({
  trip,
  settings,
  height = '420px',
  showLegend = true,
  liveCoords = null,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    if (!mapRef.current) {
      const map = L.map(containerRef.current, {
        center: [settings.plantLocation.lat, settings.plantLocation.lng],
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap | تتبع GPS الفعلي',
        maxZoom: 19,
      }).addTo(map);

      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;

      setTimeout(() => map.invalidateSize(), 150);

      if (typeof ResizeObserver !== 'undefined') {
        const observer = new ResizeObserver(() => {
          map.invalidateSize();
        });
        observer.observe(containerRef.current);
        return () => {
          observer.disconnect();
          if (mapRef.current) {
            mapRef.current.remove();
            mapRef.current = null;
          }
        };
      }
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!mapRef.current || !layerRef.current) return;
    const layer = layerRef.current;
    layer.clearLayers();

    const bounds = L.latLngBounds([]);
    const pLat = settings.plantLocation.lat;
    const pLng = settings.plantLocation.lng;
    bounds.extend([pLat, pLng]);

    // 1. Plant Geofence & Departure Marker
    L.circle([pLat, pLng], {
      radius: settings.plantGeofenceMeters || 120,
      color: '#0369a1',
      fillColor: '#0ea5e9',
      fillOpacity: 0.1,
      weight: 1.5,
      dashArray: '4, 4',
    }).addTo(layer);

    const plantMarker = L.marker([pLat, pLng], {
      icon: L.divIcon({
        className: 'trip-plant-pin',
        html: `<div class="w-9 h-9 rounded-full bg-sky-800 text-white font-bold text-[10px] flex items-center justify-center border-2 border-white shadow-lg">المصنع</div>`,
        iconSize: [36, 36],
        iconAnchor: [18, 18],
      }),
    }).addTo(layer);
    plantMarker.bindPopup(`
      <div style="direction:rtl;text-align:right;font-family:Cairo,sans-serif;font-size:12px;">
        <strong>نقطة الانطلاق: ${settings.plantLocation.name}</strong><br/>
        <span>نطاق الوصول: ${settings.plantGeofenceMeters || 120} متر</span>
      </div>
    `);

    // 2. Approved Planned Customer Stops (with radius ring)
    (trip.customerStops || []).forEach((stop) => {
      bounds.extend([stop.lat, stop.lng]);
      L.circle([stop.lat, stop.lng], {
        radius: settings.stopRadiusMeters || 80,
        color: stop.status === 'delivered' ? '#16a34a' : '#2563eb',
        fillOpacity: 0.06,
        weight: 1,
      }).addTo(layer);

      const m = L.marker([stop.lat, stop.lng], {
        icon: L.divIcon({
          className: 'trip-cust-pin',
          html: `<div class="w-7 h-7 rounded-full ${
            stop.status === 'delivered' ? 'bg-emerald-600' : 'bg-sky-600'
          } text-white font-bold text-xs flex items-center justify-center border-2 border-white shadow">${stop.stopSequence}</div>`,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        }),
      }).addTo(layer);
      m.bindPopup(`
        <div style="direction:rtl;text-align:right;font-family:Cairo,sans-serif;font-size:12px;min-width:170px;">
          <strong>#${stop.stopSequence} ${stop.customerName}</strong><br/>
          <span>${stop.district} · ${stop.phone}</span><br/>
          <span>المطلوب: <b>${stop.requestedLiters}L</b> · المسلم: <b>${stop.deliveredLiters}L</b></span><br/>
          <span>حالة التسليم: <b>${stop.status === 'delivered' ? 'تم التسليم' : 'لم يُسجل تسليم'}</b></span>
        </div>
      `);
    });

    // 3. Actual GPS Track Polyline + Raw Breadcrumb Points
    const pts = (trip.gpsPoints || []).slice().sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    if (pts.length > 0) {
      const coords = pts.map((p) => {
        bounds.extend([p.lat, p.lng]);
        return [p.lat, p.lng] as [number, number];
      });

      L.polyline(coords, {
        color: '#0284c7',
        weight: 4,
        opacity: 0.85,
      }).addTo(layer);

      pts.forEach((pt, idx) => {
        const dot = L.circleMarker([pt.lat, pt.lng], {
          radius: idx === 0 || idx === pts.length - 1 ? 6 : 4,
          color: pt.isWeakSignal ? '#e11d48' : '#0369a1',
          fillColor: pt.isWeakSignal ? '#fb7185' : '#38bdf8',
          fillOpacity: 0.9,
          weight: 1.5,
        }).addTo(layer);

        dot.bindPopup(`
          <div style="direction:rtl;text-align:right;font-family:Cairo,sans-serif;font-size:11px;">
            <strong>نقطة GPS #${pt.seq}</strong><br/>
            <span>الوقت: ${new Date(pt.timestamp).toLocaleTimeString('ar-YE')}</span><br/>
            <span>السرعة: <b>${pt.speedKmH} كم/ساعة</b></span><br/>
            <span>الدقة: ${pt.accuracy ? `${Math.round(pt.accuracy)}م` : 'غير متوفرة'} ${pt.isWeakSignal ? '⚠️ إشارة ضعيفة' : ''}</span>
          </div>
        `);
      });
    }

    // 4. Detected Prolonged Stops Markers (Duration Badge)
    (trip.detectedStops || []).forEach((stop, idx) => {
      bounds.extend([stop.lat, stop.lng]);
      const bg = stop.nearCustomerId ? 'bg-emerald-700' : 'bg-amber-600';
      const marker = L.marker([stop.lat, stop.lng], {
        icon: L.divIcon({
          className: 'detected-stop-pin',
          html: `<div class="px-2 py-0.5 rounded-full ${bg} text-white font-mono font-bold text-[10px] border-2 border-white shadow-lg whitespace-nowrap">⏸ ${stop.durationMinutes}د</div>`,
          iconSize: [52, 22],
          iconAnchor: [26, 11],
        }),
      }).addTo(layer);

      marker.bindPopup(`
        <div style="direction:rtl;text-align:right;font-family:Cairo,sans-serif;font-size:12px;min-width:190px;">
          <strong>توقف #${idx + 1} (${stop.durationMinutes} دقيقة)</strong><br/>
          <span>البداية: ${new Date(stop.startTime).toLocaleTimeString('ar-YE')}</span><br/>
          <span>النهاية: ${stop.endTime ? new Date(stop.endTime).toLocaleTimeString('ar-YE') : 'مستمر'}</span><br/>
          <span>${
            stop.nearCustomerName
              ? `قرب الزبون: <b style="color:#047857">${stop.nearCustomerName}</b> (${stop.distanceToCustomerMeters}م)`
              : '<span style="color:#b45309">توقف بعيد عن مواقع الزبائن المعتمدين</span>'
          }</span>
        </div>
      `);
    });

    // 5. GPS Gaps highlighted in dashed rose polyline
    (trip.gpsGaps || []).forEach((gap) => {
      if (gap.fromLat && gap.fromLng && gap.toLat && gap.toLng) {
        L.polyline(
          [
            [gap.fromLat, gap.fromLng],
            [gap.toLat, gap.toLng],
          ],
          {
            color: '#e11d48',
            weight: 3,
            dashArray: '5, 8',
          }
        )
          .bindPopup(
            `<div style="direction:rtl;text-align:right;font-family:Cairo,sans-serif;font-size:11px;">
              <strong style="color:#be123c">فجوة إشارة GPS (${Math.round(gap.durationSeconds / 60)} دقيقة)</strong>
            </div>`
          )
          .addTo(layer);
      }
    });

    // 6. Return Pin (if returned to plant)
    if (trip.returnLocation) {
      bounds.extend([trip.returnLocation.lat, trip.returnLocation.lng]);
      L.circleMarker([trip.returnLocation.lat, trip.returnLocation.lng], {
        radius: 8,
        color: '#0f172a',
        fillColor: '#10b981',
        fillOpacity: 1,
        weight: 2,
      })
        .bindPopup(
          `<div style="direction:rtl;text-align:right;font-family:Cairo,sans-serif;font-size:11px;">
            <strong>نقطة تأكيد العودة للمصنع</strong><br/>
            <span>المسافة عن المصنع: ${trip.returnLocation.distanceFromPlantMeters} م</span>
          </div>`
        )
        .addTo(layer);
    }

    // 7. Live Vehicle Marker (for live mini-map tracking)
    if (liveCoords && typeof liveCoords.lat === 'number' && typeof liveCoords.lng === 'number') {
      bounds.extend([liveCoords.lat, liveCoords.lng]);
      const liveMarker = L.marker([liveCoords.lat, liveCoords.lng], {
        icon: L.divIcon({
          className: 'live-truck-gps-pin',
          html: `<div class="relative flex items-center justify-center w-6 h-6">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span class="relative inline-flex rounded-full w-4 h-4 bg-emerald-500 border-2 border-white shadow-md"></span>
          </div>`,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        }),
      }).addTo(layer);

      liveMarker.bindPopup(
        `<div style="direction:rtl;text-align:right;font-family:Cairo,sans-serif;font-size:11px;">
          <strong>الموقع الحالي للوايت</strong><br/>
          <span>السرعة: <b>${liveCoords.speedKmH ?? 0} كم/ساعة</b></span>
        </div>`
      );
    }

    if (bounds.isValid()) {
      mapRef.current.invalidateSize();
      mapRef.current.fitBounds(bounds, { padding: [35, 35], maxZoom: 16 });
    }
  }, [trip, settings, liveCoords]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-200 bg-slate-100" style={{ height }}>
      <div ref={containerRef} style={{ height: '100%', width: '100%' }} />
      {showLegend && (
        <div className="absolute bottom-2.5 right-2.5 bg-white/95 backdrop-blur-xs border border-slate-200 px-3 py-2 rounded-lg shadow z-[1000] text-[11px] text-slate-700 space-y-1">
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
