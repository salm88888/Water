/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Interactive Location Picker Map Modal for Customers in Marib
 * Allows users to click, tap, or drag a pin to set precise customer GPS coordinates
 */

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import {
  MapPin,
  Check,
  X,
  Crosshair,
  Compass,
  Building2,
  Navigation,
  Info,
  Layers,
} from 'lucide-react';
import { Customer, SystemSettings } from '../../types';

interface LocationPickerMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation: (location: {
    lat: number;
    lng: number;
    district?: string;
    addressDetails?: string;
  }) => void;
  initialLat?: number;
  initialLng?: number;
  initialDistrict?: string;
  existingCustomers?: Customer[];
  settings: SystemSettings;
  customerName?: string;
  mode?: 'customer' | 'plant';
}

// Known Marib Neighborhood Centroids for quick snapping & proximity detection
const MARIB_DISTRICTS: { name: string; lat: number; lng: number }[] = [
  { name: 'حي الروضة', lat: 15.4712, lng: 45.3340 },
  { name: 'حي الشركة', lat: 15.4590, lng: 45.3180 },
  { name: 'المجمع الحكومي', lat: 15.4610, lng: 45.3260 },
  { name: 'حي السلام', lat: 15.4780, lng: 45.3420 },
  { name: 'حي المطار', lat: 15.4850, lng: 45.3510 },
  { name: 'حي الفاو', lat: 15.4410, lng: 45.3090 },
  { name: 'الخسيف', lat: 15.4510, lng: 45.3390 },
  { name: 'حصون آل جلال', lat: 15.4920, lng: 45.3620 },
  { name: 'جو النسيم', lat: 15.4680, lng: 45.3150 },
];

function getClosestDistrict(lat: number, lng: number): string {
  let closest = MARIB_DISTRICTS[0].name;
  let minDist = Infinity;
  for (const d of MARIB_DISTRICTS) {
    const dist = Math.hypot(d.lat - lat, d.lng - lng);
    if (dist < minDist) {
      minDist = dist;
      closest = d.name;
    }
  }
  return closest;
}

export const LocationPickerMapModal: React.FC<LocationPickerMapModalProps> = ({
  isOpen,
  onClose,
  onSelectLocation,
  initialLat,
  initialLng,
  initialDistrict,
  existingCustomers = [],
  settings,
  customerName = 'العميل الجديد',
  mode = 'customer',
}) => {
  const isPlantMode = mode === 'plant';
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const pinMarkerRef = useRef<L.Marker | null>(null);

  const defaultLat = initialLat || settings.plantLocation.lat || 15.4645;
  const defaultLng = initialLng || settings.plantLocation.lng || 45.3235;

  const [currentLat, setCurrentLat] = useState<number>(defaultLat);
  const [currentLng, setCurrentLng] = useState<number>(defaultLng);
  const [detectedDistrict, setDetectedDistrict] = useState<string>(
    initialDistrict || getClosestDistrict(defaultLat, defaultLng)
  );
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);

  // Initialize or update map when opened
  useEffect(() => {
    if (!isOpen) {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        pinMarkerRef.current = null;
      }
      return;
    }

    // Set initial position
    const startLat = initialLat && initialLat !== 0 ? initialLat : defaultLat;
    const startLng = initialLng && initialLng !== 0 ? initialLng : defaultLng;
    setCurrentLat(startLat);
    setCurrentLng(startLng);
    setDetectedDistrict(getClosestDistrict(startLat, startLng));

    // Delay map initialization slightly for modal transition
    const timer = setTimeout(() => {
      if (!mapContainerRef.current) return;

      if (!mapInstanceRef.current) {
        const map = L.map(mapContainerRef.current, {
          center: [startLat, startLng],
          zoom: 15,
          zoomControl: true,
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap | مأرب - اليمن',
          maxZoom: 19,
        }).addTo(map);

        // Water Plant Marker for reference (hidden when dragging the plant pin itself)
        if (!isPlantMode) {
          const plantIcon = L.divIcon({
            className: 'plant-reference-pin',
            html: `
              <div class="flex items-center justify-center w-8 h-8 bg-sky-800 text-white rounded-full shadow-md border-2 border-white text-xs font-bold" title="${settings.plantLocation.name}">
                🏢
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          L.marker([settings.plantLocation.lat, settings.plantLocation.lng], { icon: plantIcon })
            .addTo(map)
            .bindPopup(`<strong>${settings.plantLocation.name}</strong><br/>موقع المصنع المركزي`);
        }

        // Neighboring Customers for reference
        existingCustomers.forEach((cust) => {
          if (!cust.lat || !cust.lng) return;
          const neighborIcon = L.divIcon({
            className: 'neighbor-pin',
            html: `
              <div class="w-3.5 h-3.5 bg-slate-400 hover:bg-sky-500 rounded-full border-2 border-white shadow-xs" title="${cust.name} (${cust.district})"></div>
            `,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          });
          L.marker([cust.lat, cust.lng], { icon: neighborIcon })
            .addTo(map)
            .bindPopup(`<strong>${cust.name}</strong><br/>${cust.district} - خزان ${cust.tankCapacityLiters}L`);
        });

        // The Draggable Pin (Customer or Plant)
        const pinBg = isPlantMode ? 'bg-sky-700' : 'bg-rose-600';
        const pinEmoji = isPlantMode ? '🏢' : '🚰';
        const pinText = isPlantMode ? `📍 ${customerName || settings.plantLocation.name}` : `📍 خزان ${customerName}`;

        const customerPinIcon = L.divIcon({
          className: 'active-draggable-customer-pin',
          html: `
            <div class="relative flex items-center justify-center">
              <div class="absolute -top-10 flex flex-col items-center animate-bounce">
                <div class="${pinBg} text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-md whitespace-nowrap border border-white">
                  ${pinText}
                </div>
                <div class="w-2 h-2 ${pinBg} rotate-45 -mt-1 border-r border-b border-white"></div>
              </div>
              <div class="w-9 h-9 ${pinBg} text-white rounded-full shadow-xl border-3 border-white flex items-center justify-center text-sm font-bold">
                ${pinEmoji}
              </div>
              <div class="absolute -bottom-1 w-4 h-1.5 bg-black/30 rounded-full blur-xs"></div>
            </div>
          `,
          iconSize: [36, 36],
          iconAnchor: [18, 18],
        });

        const pinMarker = L.marker([startLat, startLng], {
          icon: customerPinIcon,
          draggable: true,
          autoPan: true,
        }).addTo(map);

        // Update coordinates on drag
        pinMarker.on('dragend', () => {
          const pos = pinMarker.getLatLng();
          setCurrentLat(pos.lat);
          setCurrentLng(pos.lng);
          const district = getClosestDistrict(pos.lat, pos.lng);
          setDetectedDistrict(district);
        });

        // Click anywhere on map to move pin
        map.on('click', (e: L.LeafletMouseEvent) => {
          const { lat, lng } = e.latlng;
          pinMarker.setLatLng([lat, lng]);
          setCurrentLat(lat);
          setCurrentLng(lng);
          const district = getClosestDistrict(lat, lng);
          setDetectedDistrict(district);
        });

        pinMarkerRef.current = pinMarker;
        mapInstanceRef.current = map;
      }
    }, 150);

    return () => {
      clearTimeout(timer);
    };
  }, [isOpen]);

  const handleDistrictJump = (district: typeof MARIB_DISTRICTS[0]) => {
    setCurrentLat(district.lat);
    setCurrentLng(district.lng);
    setDetectedDistrict(district.name);

    if (mapInstanceRef.current && pinMarkerRef.current) {
      mapInstanceRef.current.flyTo([district.lat, district.lng], 16, { duration: 1 });
      pinMarkerRef.current.setLatLng([district.lat, district.lng]);
    }
  };

  const handleGetCurrentLocation = () => {
    if (!navigator.geolocation) {
      setGpsMessage('خاصية تحديد الموقع غير مدعومة في متصفحك');
      return;
    }

    setIsLocating(true);
    setGpsMessage('جاري استدعاء إحداثيات GPS من هاتفك...');

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setIsLocating(false);
        setCurrentLat(latitude);
        setCurrentLng(longitude);
        const district = getClosestDistrict(latitude, longitude);
        setDetectedDistrict(district);
        setGpsMessage('تم تحديد موقعك بدقة من الـ GPS');

        if (mapInstanceRef.current && pinMarkerRef.current) {
          mapInstanceRef.current.flyTo([latitude, longitude], 17);
          pinMarkerRef.current.setLatLng([latitude, longitude]);
        }

        setTimeout(() => setGpsMessage(null), 3500);
      },
      (err) => {
        setIsLocating(false);
        // Default graceful Marib snap
        setGpsMessage('تعذر التقاط الـ GPS تلقائياً، يمكنك وضع الدبوس يدوياً على الخريطة');
        setTimeout(() => setGpsMessage(null), 3500);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleConfirm = () => {
    onSelectLocation({
      lat: Number(currentLat.toFixed(6)),
      lng: Number(currentLng.toFixed(6)),
      district: detectedDistrict,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-60 flex items-center justify-center p-2 sm:p-4">
      <div className="bg-white rounded-2xl w-full max-w-4xl h-[92vh] sm:h-[88vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in duration-150">
        {/* Modal Header */}
        <div className="p-3.5 sm:p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl ${isPlantMode ? 'bg-sky-700' : 'bg-rose-600'} text-white flex items-center justify-center shrink-0 shadow-xs`}>
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                <span>{isPlantMode ? 'تحديد موقع مصنع المياه على خريطة مأرب' : 'تحديد موقع خزان العميل على خريطة مأرب'}</span>
                <span className={`text-[10px] ${isPlantMode ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'} font-bold px-2 py-0.5 rounded-full`}>
                  {isPlantMode ? 'موقع المصنع القابل للتغيير' : 'وضع الدبوس المباشر'}
                </span>
              </h3>
              <p className="text-[11px] text-slate-500">
                {isPlantMode
                  ? 'انقر على الخريطة أو اسحب الدبوس الأزرق إلى الموقع الجديد للمصنع أو المحطة'
                  : 'انقر على الخريطة أو اسحب الدبوس الأحمر مباشرة إلى موقع منزل العميل'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Neighborhood Selector Tabs */}
        <div className="bg-white px-3 py-2 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
          <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-sky-700" />
            <span>الانتقال السريع للحي:</span>
          </span>
          {MARIB_DISTRICTS.map((dist) => (
            <button
              key={dist.name}
              type="button"
              onClick={() => handleDistrictJump(dist)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                detectedDistrict === dist.name
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {dist.name}
            </button>
          ))}
        </div>

        {/* Map Container Area */}
        <div className="relative flex-1 bg-slate-100">
          <div ref={mapContainerRef} className="w-full h-full z-0" />

          {/* Floating Crosshair Center Button */}
          <div className="absolute top-3 right-3 z-10 flex flex-col gap-2">
            <button
              type="button"
              onClick={handleGetCurrentLocation}
              disabled={isLocating}
              className="px-3 py-2 bg-white/95 backdrop-blur-xs hover:bg-white text-slate-800 border border-slate-200 rounded-xl shadow-md text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer hover:shadow-lg"
              title="تحديد موقعي الحالي GPS"
            >
              <Crosshair className={`w-4 h-4 text-rose-600 ${isLocating ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {isLocating ? 'جاري تحديد GPS...' : 'موقعي الحالي GPS'}
              </span>
            </button>
          </div>

          {/* Notification / Toast Banner if GPS or info */}
          {gpsMessage && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-slate-900/90 text-white text-xs font-semibold rounded-full shadow-lg backdrop-blur-xs flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400" />
              <span>{gpsMessage}</span>
            </div>
          )}

          {/* Live Coordinates Floating Card */}
          <div className="absolute bottom-3 right-3 left-3 sm:left-auto sm:w-80 z-10 bg-white/95 backdrop-blur-sm border border-slate-200 rounded-xl p-3 shadow-lg text-xs space-y-1.5">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-100">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-600 animate-pulse"></span>
                <span>الإحداثيات الملتقطة</span>
              </span>
              <span className="font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded text-[11px]">
                {detectedDistrict}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-slate-600">
              <div className="bg-slate-50 p-1.5 rounded border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-sans">خط العرض (Lat):</span>
                <span className="font-bold text-slate-800">{currentLat.toFixed(6)}</span>
              </div>
              <div className="bg-slate-50 p-1.5 rounded border border-slate-100">
                <span className="text-[10px] text-slate-400 block font-sans">خط الطول (Lng):</span>
                <span className="font-bold text-slate-800">{currentLng.toFixed(6)}</span>
              </div>
            </div>

            <div className="text-[10px] text-slate-500 flex items-center gap-1 pt-0.5">
              <Info className="w-3 h-3 text-sky-600 shrink-0" />
              <span>تُستخدم هذه الإحداثيات لخوارزمية تحسين مسار وتوجيه الوايت.</span>
            </div>
          </div>
        </div>

        {/* Modal Footer Controls */}
        <div className="p-3 sm:p-4 bg-white border-t border-slate-100 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="text-xs text-slate-600 flex items-center gap-2 w-full sm:w-auto">
            <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[11px] shrink-0">
              ✓
            </div>
            <span>
              الحي المقترح: <strong className="text-slate-900">{detectedDistrict}</strong> · الدبوس جاهز للاعتماد
            </span>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 text-xs transition-colors cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className={`flex-1 sm:flex-none px-6 py-2.5 ${isPlantMode ? 'bg-sky-700 hover:bg-sky-800' : 'bg-rose-600 hover:bg-rose-700'} text-white font-bold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 shadow-sm cursor-pointer`}
            >
              <Check className="w-4 h-4" />
              <span>{isPlantMode ? 'اعتماد وتثبيت موقع المصنع' : 'اعتماد وتثبيت الموقع'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
