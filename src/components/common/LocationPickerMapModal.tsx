/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Interactive Google Maps Location Picker Modal for Customers & Plant in Marib
 * Allows users to click, tap, or drag a pin to set precise GPS coordinates without altering entered district text
 */

import React, { useEffect, useState } from 'react';
import {
  Map as GoogleMap,
  AdvancedMarker,
  InfoWindow,
  MapMouseEvent,
  useMap,
  useAdvancedMarkerRef,
  useApiIsLoaded,
} from '@vis.gl/react-google-maps';
import { MapPin, Check, X, Crosshair, Compass, Info } from 'lucide-react';
import { Customer, SystemSettings } from '../../types';
import { AL_WADI_DISTRICTS } from '../../lib/alwadi-districts';
import { useGoogleMapsConfig } from './GoogleMapsProvider';

interface LocationPickerMapModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectLocation: (location: {
    lat: number;
    lng: number;
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

const ATTRIBUTION_IDS = ['gmp_mcp_codeassist_v1_aistudio'];

function CameraPanController({
  target,
}: {
  target: { lat: number; lng: number; zoom: number; seq: number } | null;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || !target) return;
    map.panTo({ lat: target.lat, lng: target.lng });
    map.setZoom(target.zoom);
  }, [map, target]);

  return null;
}

function PlantRefPin({
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
        zIndex={15}
      >
        <div className="flex items-center justify-center w-8 h-8 bg-sky-800 text-white rounded-full shadow-md border-2 border-white text-xs font-bold cursor-pointer">
          🏢
        </div>
      </AdvancedMarker>

      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={210}>
          <div dir="rtl" className="text-right font-sans text-xs p-0.5">
            <strong>{plantLocation.name}</strong>
            <br />
            <span>موقع المصنع المركزي</span>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function NeighborPin({
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
        title={`${customer.name} (${customer.district})`}
        onClick={onToggle}
        zIndex={10}
      >
        <div className="w-3.5 h-3.5 bg-slate-400 hover:bg-sky-500 rounded-full border-2 border-white shadow-xs cursor-pointer" />
      </AdvancedMarker>

      {isOpen && marker && (
        <InfoWindow anchor={marker} onCloseClick={onClose} maxWidth={210}>
          <div dir="rtl" className="text-right font-sans text-xs p-0.5">
            <strong>{customer.name}</strong>
            <br />
            <span>
              {customer.district} - خزان {customer.tankCapacityLiters}L
            </span>
          </div>
        </InfoWindow>
      )}
    </>
  );
}

function PickerMapCanvas({
  isPlantMode,
  customerName,
  settings,
  existingCustomers,
  currentLat,
  currentLng,
  cameraTarget,
  onCoordinatesChange,
}: {
  isPlantMode: boolean;
  customerName: string;
  settings: SystemSettings;
  existingCustomers: Customer[];
  currentLat: number;
  currentLng: number;
  cameraTarget: { lat: number; lng: number; zoom: number; seq: number } | null;
  onCoordinatesChange: (lat: number, lng: number) => void;
}) {
  const isApiLoaded = useApiIsLoaded();
  const [activeInfoId, setActiveInfoId] = useState<string | null>(null);

  const pinBg = isPlantMode ? 'bg-sky-700' : 'bg-rose-600';
  const pinEmoji = isPlantMode ? '🏢' : '🚰';
  const pinText = isPlantMode
    ? `📍 ${customerName || settings.plantLocation.name}`
    : `📍 خزان ${customerName}`;

  const handleMapClick = (e: MapMouseEvent) => {
    setActiveInfoId(null);
    const latLng = e.detail?.latLng;
    if (latLng) {
      onCoordinatesChange(latLng.lat, latLng.lng);
    }
  };

  const handlePinDragEnd = (e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      onCoordinatesChange(e.latLng.lat(), e.latLng.lng());
    }
  };

  if (!isApiLoaded) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-100 text-xs text-slate-500">
        جاري تحميل خرائط جوجل لتحديد الموقع...
      </div>
    );
  }

  return (
    <GoogleMap
      mapId="DEMO_MAP_ID"
      defaultCenter={{ lat: currentLat, lng: currentLng }}
      defaultZoom={15}
      gestureHandling="greedy"
      mapTypeControl={true}
      streetViewControl={false}
      fullscreenControl={false}
      internalUsageAttributionIds={ATTRIBUTION_IDS}
      style={{ width: '100%', height: '100%' }}
      onClick={handleMapClick}
    >
      <CameraPanController target={cameraTarget} />

      {!isPlantMode && (
        <PlantRefPin
          plantLocation={settings.plantLocation}
          isOpen={activeInfoId === 'plant-ref'}
          onToggle={() => setActiveInfoId((p) => (p === 'plant-ref' ? null : 'plant-ref'))}
          onClose={() => setActiveInfoId(null)}
        />
      )}

      {existingCustomers
        .filter((cust) => Boolean(cust.lat && cust.lng))
        .map((cust) => (
          <NeighborPin
            key={cust.id}
            customer={cust}
            isOpen={activeInfoId === `nbr-${cust.id}`}
            onToggle={() => setActiveInfoId((p) => (p === `nbr-${cust.id}` ? null : `nbr-${cust.id}`))}
            onClose={() => setActiveInfoId(null)}
          />
        ))}

      <AdvancedMarker
        position={{ lat: currentLat, lng: currentLng }}
        draggable={true}
        onDragEnd={handlePinDragEnd}
        title={pinText}
        zIndex={50}
      >
        <div className="relative flex items-center justify-center cursor-grab active:cursor-grabbing">
          <div className="absolute -top-10 flex flex-col items-center animate-bounce pointer-events-none">
            <div
              className={`${pinBg} text-white text-[11px] font-bold px-2 py-0.5 rounded-full shadow-md whitespace-nowrap border border-white`}
            >
              {pinText}
            </div>
            <div className={`w-2 h-2 ${pinBg} rotate-45 -mt-1 border-r border-b border-white`} />
          </div>
          <div
            className={`w-9 h-9 ${pinBg} text-white rounded-full shadow-xl border-2 border-white flex items-center justify-center text-sm font-bold`}
          >
            {pinEmoji}
          </div>
        </div>
      </AdvancedMarker>
    </GoogleMap>
  );
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
  const { hasKey, isLoadingKey, loadError } = useGoogleMapsConfig();

  const defaultLat = initialLat || settings.plantLocation.lat || 15.492;
  const defaultLng = initialLng || settings.plantLocation.lng || 45.362;

  const [currentLat, setCurrentLat] = useState<number>(defaultLat);
  const [currentLng, setCurrentLng] = useState<number>(defaultLng);
  const [activeJumpName, setActiveJumpName] = useState<string | null>(null);
  const [isLocating, setIsLocating] = useState<boolean>(false);
  const [gpsMessage, setGpsMessage] = useState<string | null>(null);
  const [cameraTarget, setCameraTarget] = useState<{
    lat: number;
    lng: number;
    zoom: number;
    seq: number;
  } | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const startLat = initialLat && initialLat !== 0 ? initialLat : defaultLat;
    const startLng = initialLng && initialLng !== 0 ? initialLng : defaultLng;
    setCurrentLat(startLat);
    setCurrentLng(startLng);
    setActiveJumpName(null);
    setCameraTarget({ lat: startLat, lng: startLng, zoom: 15, seq: Date.now() });
  }, [isOpen, initialLat, initialLng, defaultLat, defaultLng]);

  const handleDistrictJump = (district: (typeof AL_WADI_DISTRICTS)[0]) => {
    setActiveJumpName(district.name);
    setCameraTarget({
      lat: district.lat,
      lng: district.lng,
      zoom: 16,
      seq: Date.now(),
    });
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
        setGpsMessage('تم تحديد موقعك بدقة من الـ GPS');
        setCameraTarget({ lat: latitude, lng: longitude, zoom: 17, seq: Date.now() });
        setTimeout(() => setGpsMessage(null), 3500);
      },
      () => {
        setIsLocating(false);
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
            <div
              className={`w-9 h-9 rounded-xl ${isPlantMode ? 'bg-sky-700' : 'bg-rose-600'} text-white flex items-center justify-center shrink-0 shadow-xs`}
            >
              <MapPin className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-slate-900 flex items-center gap-2">
                <span>
                  {isPlantMode ? 'تحديد موقع مصنع المياه على خريطة مأرب' : 'تحديد موقع خزان العميل على خريطة مأرب'}
                </span>
                <span
                  className={`text-[10px] ${isPlantMode ? 'bg-sky-100 text-sky-800' : 'bg-rose-100 text-rose-800'} font-bold px-2 py-0.5 rounded-full`}
                >
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
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quick Map Navigation Bar (camera pan only - does not change entered region name) */}
        <div className="bg-white px-3 py-2 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar text-xs">
          <span className="text-[11px] font-bold text-slate-500 whitespace-nowrap flex items-center gap-1">
            <Compass className="w-3.5 h-3.5 text-sky-700" />
            <span>تحريك الخريطة السريع:</span>
          </span>
          {AL_WADI_DISTRICTS.map((dist) => (
            <button
              key={dist.name}
              type="button"
              onClick={() => handleDistrictJump(dist)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                activeJumpName === dist.name
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
          {hasKey && !loadError ? (
            <div className="w-full h-full">
              <PickerMapCanvas
                isPlantMode={isPlantMode}
                customerName={customerName}
                settings={settings}
                existingCustomers={existingCustomers}
                currentLat={currentLat}
                currentLng={currentLng}
                cameraTarget={cameraTarget}
                onCoordinatesChange={(lat, lng) => {
                  setCurrentLat(lat);
                  setCurrentLng(lng);
                }}
              />
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center p-4 text-center text-xs text-slate-600">
              {isLoadingKey
                ? 'جاري تهيئة خرائط جوجل...'
                : 'تعذر عرض الخريطة الآن — يمكنك استخدام زر "موقعي الحالي GPS" لالتقاط الإحداثيات.'}
            </div>
          )}

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
              {initialDistrict?.trim() ? (
                <span className="font-bold text-sky-800 bg-sky-50 px-2 py-0.5 rounded text-[11px] truncate max-w-[150px]">
                  {initialDistrict.trim()}
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                  إحداثيات GPS فقط
                </span>
              )}
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
              {initialDistrict?.trim() ? (
                <>
                  المنطقة المدخلة: <strong className="text-slate-900">{initialDistrict.trim()}</strong> (لن تتغير) ·{' '}
                </>
              ) : null}
              الدبوس جاهز لاعتماد الإحداثيات فقط
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
