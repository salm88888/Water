/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Interactive Leaflet Map for Marib District
 * Shows Water Plant, Customers, Live Truck GPS Position, Route Lines, and Event Pins.
 */

import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { Customer, Truck, TripCustomerStop, GPSEvent, SystemSettings } from '../../types';

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

export const MaribMap: React.FC<MaribMapProps> = ({
  settings,
  truck,
  customerStops = [],
  allCustomers = [],
  gpsEvents = [],
  height = '500px',
  selectedStopSequence,
  onMarkerClick,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const initialLat = settings.plantLocation.lat || 15.4645;
      const initialLng = settings.plantLocation.lng || 45.3235;

      const map = L.map(mapContainerRef.current, {
        center: [initialLat, initialLng],
        zoom: 14,
        zoomControl: true,
      });

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors | مأرب - اليمن',
        maxZoom: 19,
      }).addTo(map);

      layerGroupRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update Markers & Layers
  useEffect(() => {
    if (!mapInstanceRef.current || !layerGroupRef.current) return;

    const layer = layerGroupRef.current;
    layer.clearLayers();

    const bounds = L.latLngBounds([]);

    // 1. Plant Marker
    const plantLat = settings.plantLocation.lat;
    const plantLng = settings.plantLocation.lng;
    bounds.extend([plantLat, plantLng]);

    const plantIcon = L.divIcon({
      className: 'custom-plant-pin',
      html: `
        <div class="flex items-center justify-center w-10 h-10 bg-sky-700 text-white rounded-full shadow-lg border-2 border-white">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"></path>
          </svg>
        </div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
    });

    const plantMarker = L.marker([plantLat, plantLng], { icon: plantIcon }).addTo(layer);
    plantMarker.bindPopup(`
      <div style="direction: rtl; text-align: right; font-family: Cairo, sans-serif;">
        <h4 style="font-weight: 700; color: #0369a1; margin-bottom: 4px;">${settings.plantLocation.name}</h4>
        <p style="font-size: 12px; color: #475569; margin: 0;">${settings.plantLocation.city}</p>
        <div style="margin-top: 6px; font-size: 11px; color: #0284c7; background: #e0f2fe; padding: 4px 8px; border-radius: 4px;">
          محطة الانطلاق والتعبئة المركزية للوايت
        </div>
      </div>
    `);

    // 2. Customer Stops (Active Trip)
    const routeCoords: [number, number][] = [[plantLat, plantLng]];

    if (customerStops.length > 0) {
      customerStops.forEach((stop) => {
        bounds.extend([stop.lat, stop.lng]);
        routeCoords.push([stop.lat, stop.lng]);

        const isDelivered = stop.status === 'delivered';
        const isArrived = stop.status === 'arrived';
        const isSelected = selectedStopSequence === stop.stopSequence;

        const pinColor = isDelivered ? 'bg-emerald-600' : isArrived ? 'bg-amber-500' : 'bg-sky-600';
        const ring = isSelected ? 'ring-4 ring-sky-400 ring-offset-2' : '';

        const stopIcon = L.divIcon({
          className: 'custom-stop-pin',
          html: `
            <div class="flex items-center justify-center w-8 h-8 ${pinColor} ${ring} text-white font-bold text-xs rounded-full shadow-md border-2 border-white">
              ${stop.stopSequence}
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        });

        const marker = L.marker([stop.lat, stop.lng], { icon: stopIcon }).addTo(layer);
        marker.bindPopup(`
          <div style="direction: rtl; text-align: right; font-family: Cairo, sans-serif; min-width: 180px;">
            <div style="font-weight: 700; font-size: 14px; color: #0f172a;">${stop.customerName}</div>
            <div style="font-size: 12px; color: #64748b;">${stop.district} - ${stop.phone}</div>
            <hr style="margin: 6px 0; border: none; border-top: 1px solid #e2e8f0;" />
            <div style="display: flex; justify-content: space-between; font-size: 12px;">
              <span>المطلوب:</span>
              <span style="font-weight: 700; color: #0284c7;">${stop.requestedLiters.toLocaleString()} لتر</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 2px;">
              <span>سعة الخزان:</span>
              <span>${stop.tankCapacity.toLocaleString()} لتر</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 12px; margin-top: 2px;">
              <span>الحالة:</span>
              <span style="font-weight: 600; color: ${isDelivered ? '#16a34a' : isArrived ? '#d97706' : '#2563eb'};">
                ${isDelivered ? 'تم التسليم' : isArrived ? 'الوايت عند العميل' : 'في الانتظار'}
              </span>
            </div>
          </div>
        `);

        if (onMarkerClick) {
          marker.on('click', () => onMarkerClick(stop.customerId));
        }
      });

      // Close route back to plant
      routeCoords.push([plantLat, plantLng]);

      // Draw Route Polyline
      L.polyline(routeCoords, {
        color: '#0284c7',
        weight: 3.5,
        opacity: 0.8,
        dashArray: '6, 6',
      }).addTo(layer);
    } else if (allCustomers.length > 0) {
      // Show general customer points
      allCustomers.forEach((cust) => {
        bounds.extend([cust.lat, cust.lng]);
        const dotIcon = L.divIcon({
          className: 'custom-dot-pin',
          html: `
            <div class="w-3.5 h-3.5 bg-sky-500 rounded-full border-2 border-white shadow"></div>
          `,
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        });
        const marker = L.marker([cust.lat, cust.lng], { icon: dotIcon }).addTo(layer);
        marker.bindPopup(`
          <div style="direction: rtl; text-align: right; font-family: Cairo, sans-serif;">
            <div style="font-weight: 700; font-size: 13px;">${cust.name}</div>
            <div style="font-size: 11px; color: #64748b;">${cust.district} - ${cust.phone}</div>
            <div style="font-size: 11px; color: #0284c7; margin-top: 4px;">سعة الخزان: ${cust.tankCapacityLiters.toLocaleString()} لتر</div>
          </div>
        `);
      });
    }

    // 3. Live Truck Position Marker
    if (truck && truck.lastLat && truck.lastLng) {
      bounds.extend([truck.lastLat, truck.lastLng]);

      const truckIcon = L.divIcon({
        className: 'custom-truck-pin',
        html: `
          <div class="relative flex items-center justify-center w-11 h-11 bg-amber-600 text-white rounded-full shadow-2xl border-2 border-white animate-bounce">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16V6a1 1 0 00-1-1H4a1 1 0 00-1 1v10a1 1 0 001 1h1m8-1a1 1 0 01-1 1H9m4-1V8a1 1 0 011-1h2.586a1 1 0 01.707.293l3.414 3.414a1 1 0 01.293.707V16a1 1 0 01-1 1h-1m-6-1a1 1 0 001 1h1M5 17a2 2 0 104 0m-4 0a2 2 0 114 0m6 0a2 2 0 104 0m-4 0a2 2 0 114 0"></path>
            </svg>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [22, 22],
      });

      const truckMarker = L.marker([truck.lastLat, truck.lastLng], { icon: truckIcon }).addTo(layer);
      truckMarker.bindPopup(`
        <div style="direction: rtl; text-align: right; font-family: Cairo, sans-serif; min-width: 200px;">
          <h4 style="font-weight: 700; color: #b45309; margin-bottom: 2px;">وايت المياه (6,000L)</h4>
          <p style="font-size: 12px; color: #475569; margin: 0;">السائق: ${truck.driverName}</p>
          <hr style="margin: 6px 0; border: none; border-top: 1px solid #e2e8f0;" />
          <div style="font-size: 12px; margin-bottom: 3px;">
            <span>السرعة الحالية:</span>
            <span style="font-weight: 700; font-family: monospace;">${truck.lastSpeed || 0} كم/ساعة</span>
          </div>
          <div style="font-size: 12px; margin-bottom: 3px;">
            <span>الماء المتبقي بالوايت:</span>
            <span style="font-weight: 700; color: #0284c7;">${truck.currentWaterLiters.toLocaleString()} لتر</span>
          </div>
          <div style="font-size: 12px; margin-bottom: 3px;">
            <span>آخر حدث:</span>
            <span style="font-weight: 600; color: #1e293b;">${truck.lastEvent}</span>
          </div>
          <div style="font-size: 11px; color: #64748b;">
            تحديث: ${new Date(truck.lastUpdateTimestamp).toLocaleTimeString('ar-YE')}
          </div>
        </div>
      `);
    }

    // 4. GPS breadcrumb trail
    if (gpsEvents.length > 1) {
      const trailCoords: [number, number][] = gpsEvents.map((g) => [g.lat, g.lng]);
      L.polyline(trailCoords, {
        color: '#f59e0b',
        weight: 3,
        opacity: 0.6,
      }).addTo(layer);
    }

    // Fit map bounds
    if (bounds.isValid()) {
      mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [settings, truck, customerStops, allCustomers, gpsEvents, selectedStopSequence]);

  return (
    <div className="relative w-full rounded-xl overflow-hidden border border-slate-200 shadow-sm bg-slate-100">
      <div ref={mapContainerRef} style={{ height, width: '100%' }} />
      {/* Map Legend */}
      <div className="absolute bottom-3 right-3 bg-white/95 backdrop-blur-sm border border-slate-200 px-3 py-2 rounded-lg shadow-md z-[1000] text-xs text-slate-700 space-y-1">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-sky-700"></div>
          <span>مصنع مياهنا المركزي</span>
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
