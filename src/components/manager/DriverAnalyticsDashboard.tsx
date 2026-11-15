/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Driver Performance Analytics Dashboard inside Trips Management
 * Computes completed trips, average delivery duration, and fuel consumption per trip from recorded data.
 */

import React, { useMemo, useState } from 'react';
import {
  BarChart3,
  Clock,
  CheckCircle2,
  Fuel,
  Route,
  ChevronDown,
  ChevronUp,
  ArrowUpDown,
  Plus,
} from 'lucide-react';
import { DriverAccount, Expense, SystemSettings, Trip } from '../../types';

interface DriverAnalyticsDashboardProps {
  trips: Trip[];
  driverAccounts: DriverAccount[];
  expenses: Expense[];
  settings: SystemSettings;
  onSelectTrip?: (tripId: string) => void;
  onCreateTrip?: () => void;
}

type TimeRange = 'all' | 'today' | '7d' | '30d';
type ChartMetric = 'duration' | 'fuel' | 'trips';
type SortField = 'completed' | 'duration' | 'fuel';

const COMPLETED_STATUSES = new Set<Trip['status']>([
  'returned_to_plant',
  'pending_sync',
  'synced',
  'completed_pending_review',
  'closed',
]);

function isCompletedTrip(trip: Trip): boolean {
  return COMPLETED_STATUSES.has(trip.status);
}

function getTripTimestampMs(trip: Trip): number {
  const candidate = trip.returnedToPlantAt || trip.completedAt || trip.startedAt || trip.proposedAt || trip.date;
  const ms = new Date(candidate).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function getTripDeliveryMinutes(trip: Trip): number | null {
  if (trip.startedAt) {
    const startMs = new Date(trip.startedAt).getTime();
    const endIso = trip.returnedToPlantAt || trip.completedAt || trip.closedAt;
    if (endIso) {
      const endMs = new Date(endIso).getTime();
      if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
        const diffMin = (endMs - startMs) / 60000;
        if (diffMin > 0 && diffMin <= 60 * 24 * 7) {
          return Number(diffMin.toFixed(1));
        }
      }
    }
  }

  const telemetryMin = (trip.movingMinutes || 0) + (trip.stoppedMinutes || 0);
  if (telemetryMin > 0) {
    return Number(telemetryMin.toFixed(1));
  }

  if (trip.gpsPoints && trip.gpsPoints.length >= 2) {
    const times = trip.gpsPoints
      .map((p) => new Date(p.timestamp).getTime())
      .filter((t) => Number.isFinite(t));
    if (times.length >= 2) {
      const spanMin = (Math.max(...times) - Math.min(...times)) / 60000;
      if (spanMin > 0 && spanMin <= 60 * 24 * 7) {
        return Number(spanMin.toFixed(1));
      }
    }
  }

  return null;
}

function getTripDistanceKm(trip: Trip): number {
  if (typeof trip.actualDistanceKm === 'number' && trip.actualDistanceKm > 0) {
    return trip.actualDistanceKm;
  }
  return trip.estimatedDistanceKm || 0;
}

function getTripFuelLiters(
  trip: Trip,
  dieselExpenseByTrip: Record<string, number>,
  settings: SystemSettings
): { liters: number; isActual: boolean } {
  if (typeof trip.actualFuelLiters === 'number' && trip.actualFuelLiters > 0) {
    return { liters: trip.actualFuelLiters, isActual: true };
  }
  const expenseLiters = dieselExpenseByTrip[trip.id] || 0;
  if (expenseLiters > 0) {
    return { liters: expenseLiters, isActual: true };
  }
  if (typeof trip.estimatedFuelLiters === 'number' && trip.estimatedFuelLiters > 0) {
    return { liters: trip.estimatedFuelLiters, isActual: false };
  }
  const distKm = getTripDistanceKm(trip);
  const derived = distKm * (settings.truckDieselConsumptionPerKm || 0.28);
  return { liters: Number(derived.toFixed(2)), isActual: false };
}

function formatDurationArabic(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return '—';
  const rounded = Math.round(minutes);
  if (rounded < 60) return `${rounded} دقيقة`;
  const hrs = Math.floor(rounded / 60);
  const rem = rounded % 60;
  return rem > 0 ? `${hrs} س ${rem} د` : `${hrs} ساعة`;
}

interface DriverAggregate {
  key: string;
  name: string;
  totalTrips: number;
  completedTrips: number;
  inProgressTrips: number;
  avgDeliveryMinutes: number | null;
  avgMovingMinutes: number;
  avgStoppedMinutes: number;
  totalFuelLiters: number;
  avgFuelPerTrip: number;
  actualFuelTripsCount: number;
  totalDistanceKm: number;
  totalDeliveredLiters: number;
  deliveredStopsCount: number;
  plannedStopsCount: number;
}

export const DriverAnalyticsDashboard: React.FC<DriverAnalyticsDashboardProps> = ({
  trips,
  driverAccounts,
  expenses,
  settings,
  onSelectTrip,
  onCreateTrip,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [selectedDriverKey, setSelectedDriverKey] = useState<string>('all');
  const [chartMetric, setChartMetric] = useState<ChartMetric>('duration');
  const [chartScope, setChartScope] = useState<'drivers' | 'recent_trips'>('drivers');
  const [sortBy, setSortBy] = useState<SortField>('completed');
  const [hoveredBarKey, setHoveredBarKey] = useState<string | null>(null);

  const dieselExpenseByTrip = useMemo(() => {
    const map: Record<string, number> = {};
    for (const exp of expenses) {
      if (exp.category === 'diesel' && exp.tripId && typeof exp.liters === 'number' && exp.liters > 0) {
        map[exp.tripId] = (map[exp.tripId] || 0) + exp.liters;
      }
    }
    return map;
  }, [expenses]);

  const timeFilteredTrips = useMemo(() => {
    if (timeRange === 'all') return trips;
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const cutoffMs =
      timeRange === 'today'
        ? new Date(`${todayStr}T00:00:00`).getTime()
        : now.getTime() - (timeRange === '7d' ? 7 : 30) * 24 * 60 * 60 * 1000;

    return trips.filter((t) => {
      if (timeRange === 'today' && t.date === todayStr) return true;
      const ms = getTripTimestampMs(t);
      return ms >= cutoffMs;
    });
  }, [trips, timeRange]);

  const driverOptions = useMemo(() => {
    const entries: Record<string, string> = {};
    for (const acc of driverAccounts) {
      if (acc.status === 'approved' || trips.some((t) => t.driverId === acc.id)) {
        entries[acc.id] = acc.name;
      }
    }
    for (const t of trips) {
      const key = t.driverId || `name:${t.driverName}`;
      if (!entries[key]) {
        entries[key] = t.driverName || 'سائق غير محدد';
      }
    }
    return Object.entries(entries).map(([key, name]) => ({ key, name }));
  }, [driverAccounts, trips]);

  const scopedTrips = useMemo(() => {
    if (selectedDriverKey === 'all') return timeFilteredTrips;
    return timeFilteredTrips.filter((t) => {
      const key = t.driverId || `name:${t.driverName}`;
      return key === selectedDriverKey;
    });
  }, [timeFilteredTrips, selectedDriverKey]);

  const completedScopedTrips = useMemo(
    () => scopedTrips.filter(isCompletedTrip),
    [scopedTrips]
  );

  const summary = useMemo(() => {
    const completedCount = completedScopedTrips.length;
    const totalCount = scopedTrips.length;
    const completionRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    const durations = completedScopedTrips
      .map(getTripDeliveryMinutes)
      .filter((v): v is number => v !== null);
    const avgDeliveryMinutes =
      durations.length > 0
        ? Number((durations.reduce((s, v) => s + v, 0) / durations.length).toFixed(1))
        : null;

    const movingList = completedScopedTrips
      .map((t) => t.movingMinutes)
      .filter((v): v is number => typeof v === 'number' && v > 0);
    const stoppedList = completedScopedTrips
      .map((t) => t.stoppedMinutes)
      .filter((v): v is number => typeof v === 'number' && v >= 0);

    const avgMovingMinutes =
      movingList.length > 0
        ? Math.round(movingList.reduce((s, v) => s + v, 0) / movingList.length)
        : 0;
    const avgStoppedMinutes =
      stoppedList.length > 0
        ? Math.round(stoppedList.reduce((s, v) => s + v, 0) / stoppedList.length)
        : 0;

    let totalFuelLiters = 0;
    let actualFuelTripsCount = 0;
    let totalDistanceKm = 0;
    let totalDeliveredLiters = 0;
    let totalDeliveredStops = 0;

    for (const t of completedScopedTrips) {
      const fuel = getTripFuelLiters(t, dieselExpenseByTrip, settings);
      totalFuelLiters += fuel.liters;
      if (fuel.isActual) actualFuelTripsCount += 1;
      totalDistanceKm += getTripDistanceKm(t);
      totalDeliveredLiters += t.deliveredLiters || 0;
      totalDeliveredStops += (t.customerStops || []).filter((s) => s.status === 'delivered').length;
    }

    const avgFuelPerTrip = completedCount > 0 ? Number((totalFuelLiters / completedCount).toFixed(2)) : 0;
    const avgFuelPerKm = totalDistanceKm > 0 ? Number((totalFuelLiters / totalDistanceKm).toFixed(2)) : 0;
    const avgFuelCostPerTrip = Math.round(avgFuelPerTrip * (settings.dieselPricePerLiter || 0));

    return {
      completedCount,
      totalCount,
      completionRate,
      avgDeliveryMinutes,
      measuredDurationCount: durations.length,
      avgMovingMinutes,
      avgStoppedMinutes,
      totalFuelLiters: Number(totalFuelLiters.toFixed(1)),
      avgFuelPerTrip,
      avgFuelPerKm,
      avgFuelCostPerTrip,
      actualFuelTripsCount,
      totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
      totalDeliveredLiters,
      totalDeliveredStops,
    };
  }, [completedScopedTrips, scopedTrips.length, dieselExpenseByTrip, settings]);

  const driverAggregates = useMemo<DriverAggregate[]>(() => {
    const groups: Record<
      string,
      {
        key: string;
        name: string;
        trips: Trip[];
      }
    > = {};

    for (const opt of driverOptions) {
      if (selectedDriverKey !== 'all' && opt.key !== selectedDriverKey) continue;
      groups[opt.key] = { key: opt.key, name: opt.name, trips: [] };
    }

    for (const t of scopedTrips) {
      const key = t.driverId || `name:${t.driverName}`;
      if (!groups[key]) {
        groups[key] = { key, name: t.driverName || 'سائق غير محدد', trips: [] };
      }
      groups[key].trips.push(t);
    }

    const list: DriverAggregate[] = Object.values(groups)
      .filter((g) => g.trips.length > 0 || selectedDriverKey === 'all')
      .map((g) => {
        const completed = g.trips.filter(isCompletedTrip);
        const inProgressTrips = g.trips.filter((t) => t.status === 'in_progress').length;
        const durations = completed
          .map(getTripDeliveryMinutes)
          .filter((v): v is number => v !== null);
        const avgDeliveryMinutes =
          durations.length > 0
            ? Number((durations.reduce((s, v) => s + v, 0) / durations.length).toFixed(1))
            : null;

        const movingVals = completed
          .map((t) => t.movingMinutes)
          .filter((v): v is number => typeof v === 'number' && v > 0);
        const stoppedVals = completed
          .map((t) => t.stoppedMinutes)
          .filter((v): v is number => typeof v === 'number' && v >= 0);

        let totalFuel = 0;
        let actualCount = 0;
        let totalDist = 0;
        let totalLiters = 0;
        let deliveredStops = 0;
        let plannedStops = 0;

        for (const t of completed) {
          const fuel = getTripFuelLiters(t, dieselExpenseByTrip, settings);
          totalFuel += fuel.liters;
          if (fuel.isActual) actualCount += 1;
          totalDist += getTripDistanceKm(t);
          totalLiters += t.deliveredLiters || 0;
          deliveredStops += (t.customerStops || []).filter((s) => s.status === 'delivered').length;
          plannedStops += (t.customerStops || []).length;
        }

        return {
          key: g.key,
          name: g.name,
          totalTrips: g.trips.length,
          completedTrips: completed.length,
          inProgressTrips,
          avgDeliveryMinutes,
          avgMovingMinutes:
            movingVals.length > 0
              ? Math.round(movingVals.reduce((s, v) => s + v, 0) / movingVals.length)
              : 0,
          avgStoppedMinutes:
            stoppedVals.length > 0
              ? Math.round(stoppedVals.reduce((s, v) => s + v, 0) / stoppedVals.length)
              : 0,
          totalFuelLiters: Number(totalFuel.toFixed(1)),
          avgFuelPerTrip: completed.length > 0 ? Number((totalFuel / completed.length).toFixed(2)) : 0,
          actualFuelTripsCount: actualCount,
          totalDistanceKm: Number(totalDist.toFixed(1)),
          totalDeliveredLiters: totalLiters,
          deliveredStopsCount: deliveredStops,
          plannedStopsCount: plannedStops,
        };
      });

    return list.sort((a, b) => {
      if (sortBy === 'duration') {
        const av = a.avgDeliveryMinutes ?? Number.MAX_SAFE_INTEGER;
        const bv = b.avgDeliveryMinutes ?? Number.MAX_SAFE_INTEGER;
        return av - bv;
      }
      if (sortBy === 'fuel') {
        if (b.completedTrips === 0 && a.completedTrips > 0) return -1;
        if (a.completedTrips === 0 && b.completedTrips > 0) return 1;
        return a.avgFuelPerTrip - b.avgFuelPerTrip;
      }
      return b.completedTrips - a.completedTrips || b.totalTrips - a.totalTrips;
    });
  }, [driverOptions, scopedTrips, selectedDriverKey, dieselExpenseByTrip, settings, sortBy]);

  // Decide chart bars: drivers mode vs recent completed trips mode
  const effectiveChartScope =
    chartScope === 'drivers' && driverAggregates.filter((d) => d.completedTrips > 0).length > 1
      ? 'drivers'
      : 'recent_trips';

  const chartBars = useMemo(() => {
    if (effectiveChartScope === 'drivers') {
      return driverAggregates
        .filter((d) => d.completedTrips > 0 || d.totalTrips > 0)
        .slice(0, 7)
        .map((d) => {
          const value =
            chartMetric === 'duration'
              ? d.avgDeliveryMinutes || 0
              : chartMetric === 'fuel'
              ? d.avgFuelPerTrip
              : d.completedTrips;
          return {
            key: d.key,
            label: d.name,
            sublabel: `${d.completedTrips} منجزة`,
            value,
            tripId: undefined as string | undefined,
          };
        });
    }

    return completedScopedTrips
      .slice()
      .sort((a, b) => getTripTimestampMs(a) - getTripTimestampMs(b))
      .slice(-8)
      .map((t) => {
        const dur = getTripDeliveryMinutes(t) || 0;
        const fuel = getTripFuelLiters(t, dieselExpenseByTrip, settings).liters;
        const value =
          chartMetric === 'duration' ? dur : chartMetric === 'fuel' ? fuel : t.customerStops.length;
        return {
          key: t.id,
          label: t.tripNumber.replace('TRIP-2026-', '#'),
          sublabel: t.driverName,
          value,
          tripId: t.id,
        };
      });
  }, [effectiveChartScope, driverAggregates, completedScopedTrips, chartMetric, dieselExpenseByTrip, settings]);

  const maxBarValue = useMemo(() => {
    const vals = chartBars.map((b) => b.value);
    const max = vals.length > 0 ? Math.max(...vals) : 0;
    return max > 0 ? max : 10;
  }, [chartBars]);

  const metricMeta = {
    duration: {
      title: 'متوسط وقت التوصيل (دقيقة)',
      unit: 'دقيقة',
      color: '#0369a1',
      hoverColor: '#075985',
    },
    fuel: {
      title: 'معدل استهلاك الوقود (لتر/رحلة)',
      unit: 'لتر',
      color: '#d97706',
      hoverColor: '#b45309',
    },
    trips: {
      title: effectiveChartScope === 'drivers' ? 'إجمالي الرحلات المنجزة' : 'الوجهات المسلمة في الرحلة',
      unit: effectiveChartScope === 'drivers' ? 'رحلة' : 'وجهة',
      color: '#059669',
      hoverColor: '#047857',
    },
  }[chartMetric];

  return (
    <section
      aria-label="لوحة مؤشرات أداء السائقين والرحلات"
      className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden"
    >
      {/* Top Bar of Analytics Section */}
      <div className="px-4 py-3.5 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/70">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-sky-700 text-white flex items-center justify-center shrink-0">
            <BarChart3 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 truncate">
              لوحة مؤشرات أداء السائقين والرحلات
            </h3>
            <p className="text-[11px] text-slate-500 truncate">
              تحليل حي مبني على الرحلات المسجلة · وقت التوصيل · الإنجاز · استهلاك الديزل
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Driver selector */}
          <select
            aria-label="تصفية حسب السائق"
            value={selectedDriverKey}
            onChange={(e) => setSelectedDriverKey(e.target.value)}
            className="px-2.5 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="all">جميع السائقين ({driverOptions.length})</option>
            {driverOptions.map((d) => (
              <option key={d.key} value={d.key}>
                {d.name}
              </option>
            ))}
          </select>

          {/* Timeframe segmented buttons */}
          <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg text-xs">
            {(
              [
                { id: 'all', label: 'الكل' },
                { id: 'today', label: 'اليوم' },
                { id: '7d', label: '7 أيام' },
                { id: '30d', label: '30 يوماً' },
              ] as { id: TimeRange; label: string }[]
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTimeRange(opt.id)}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  timeRange === opt.id
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setIsExpanded((v) => !v)}
            className="px-2.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>{isExpanded ? 'إخفاء اللوحة' : 'عرض التحليلات'}</span>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-4 space-y-5">
          {/* Primary 4-Column KPI Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
            {/* KPI 1: Completed Trips */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold">إجمالي عدد الرحلات المنجزة</span>
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                {summary.completedCount.toLocaleString()}
                <span className="text-xs font-sans font-medium text-slate-500 mr-1.5">رحلة منجزة</span>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                <span className="font-mono tabular-nums">من إجمالي {summary.totalCount}</span>
                <span aria-hidden="true">·</span>
                <span className="font-semibold text-emerald-700 font-mono tabular-nums">
                  نسبة الإنجاز {summary.completionRate}%
                </span>
              </div>
            </div>

            {/* KPI 2: Average Delivery Time */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold">متوسط وقت التوصيل</span>
                <Clock className="w-4 h-4 text-sky-700 shrink-0" />
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-sky-900">
                {formatDurationArabic(summary.avgDeliveryMinutes)}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                {summary.measuredDurationCount > 0 ? (
                  <>
                    <span className="font-mono tabular-nums">حركة {summary.avgMovingMinutes}د</span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums">توقف {summary.avgStoppedMinutes}د</span>
                  </>
                ) : (
                  <span>لا توجد أزمنة رحلات مكتملة بعد</span>
                )}
              </div>
            </div>

            {/* KPI 3: Average Fuel Consumption per Trip */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold">معدل استهلاك الوقود / رحلة</span>
                <Fuel className="w-4 h-4 text-amber-600 shrink-0" />
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                {summary.completedCount > 0 ? `${summary.avgFuelPerTrip.toFixed(1)} لتر` : '—'}
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                <span className="font-mono tabular-nums">الإجمالي {summary.totalFuelLiters} لتر</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  {summary.avgFuelCostPerTrip.toLocaleString()} ر.ي/رحلة
                </span>
              </div>
            </div>

            {/* KPI 4: Distance & Water Delivered */}
            <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 space-y-1.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-semibold">المسافة والمياه المسلمة</span>
                <Route className="w-4 h-4 text-slate-700 shrink-0" />
              </div>
              <div className="text-xl font-bold font-mono tabular-nums text-slate-900">
                {summary.totalDistanceKm.toLocaleString()} <span className="text-xs font-sans font-medium text-slate-500">كم</span>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                <span className="font-mono tabular-nums">{summary.totalDeliveredLiters.toLocaleString()} لتر مياه</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">{summary.totalDeliveredStops} وجهة</span>
              </div>
            </div>
          </div>

          {completedScopedTrips.length === 0 ? (
            <div className="border border-dashed border-slate-300 rounded-xl p-6 text-center space-y-2 bg-slate-50/50">
              <p className="text-xs font-bold text-slate-700">
                لا توجد رحلات منجزة مطابقة للنطاق المحدد بعد
              </p>
              <p className="text-[11px] text-slate-500 max-w-md mx-auto">
                بمجرد اعتماد رحلة وعودة السائق إلى نقطة الانطلاق أو إغلاق الرحلة، ستظهر هنا رسومات مقارنة وقت التوصيل ومعدل استهلاك الديزل لكل سائق تلقائياً.
              </p>
              <div className="flex items-center justify-center gap-2 pt-1">
                {(timeRange !== 'all' || selectedDriverKey !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setTimeRange('all');
                      setSelectedDriverKey('all');
                    }}
                    className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-semibold text-slate-700 cursor-pointer"
                  >
                    عرض كل الفترات والسائقين
                  </button>
                )}
                {onCreateTrip && (
                  <button
                    type="button"
                    onClick={onCreateTrip}
                    className="px-3 py-1.5 bg-sky-700 hover:bg-sky-800 text-white rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>إنشاء مخطط رحلة</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
              {/* Chart Column (5 cols) */}
              <div className="lg:col-span-5 border border-slate-200 rounded-xl p-4 flex flex-col justify-between bg-white">
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h4 className="text-xs font-bold text-slate-900">{metricMeta.title}</h4>
                    {driverAggregates.filter((d) => d.completedTrips > 0).length > 1 && (
                      <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg text-[11px]">
                        <button
                          type="button"
                          onClick={() => setChartScope('drivers')}
                          className={`px-2 py-1 rounded-md font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                            effectiveChartScope === 'drivers'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600'
                          }`}
                        >
                          حسب السائق
                        </button>
                        <button
                          type="button"
                          onClick={() => setChartScope('recent_trips')}
                          className={`px-2 py-1 rounded-md font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                            effectiveChartScope === 'recent_trips'
                              ? 'bg-white text-slate-900 shadow-xs'
                              : 'text-slate-600'
                          }`}
                        >
                          آخر الرحلات
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Metric Switcher Tabs */}
                  <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg text-[11px]">
                    {(
                      [
                        { id: 'duration', label: 'وقت التوصيل' },
                        { id: 'fuel', label: 'استهلاك الوقود' },
                        { id: 'trips', label: 'الإنجاز' },
                      ] as { id: ChartMetric; label: string }[]
                    ).map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => setChartMetric(m.id)}
                        className={`flex-1 py-1 px-2 rounded-md font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                          chartMetric === m.id
                            ? 'bg-white text-slate-900 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Crisp SVG Bar Chart */}
                <div className="mt-4 pt-2">
                  <svg
                    viewBox="0 0 420 185"
                    className="w-full h-44 overflow-visible"
                    role="img"
                    aria-label={metricMeta.title}
                  >
                    {[0.25, 0.5, 0.75, 1].map((ratio) => {
                      const y = 140 - ratio * 115;
                      const tickVal = Math.round(maxBarValue * ratio);
                      return (
                        <g key={ratio}>
                          <line
                            x1={32}
                            y1={y}
                            x2={410}
                            y2={y}
                            stroke="#e2e8f0"
                            strokeWidth={1}
                            strokeDasharray="3 3"
                          />
                          <text
                            x={26}
                            y={y + 3}
                            textAnchor="end"
                            className="fill-slate-400 text-[9px] font-mono"
                          >
                            {tickVal}
                          </text>
                        </g>
                      );
                    })}
                    <line x1={32} y1={140} x2={410} y2={140} stroke="#cbd5e1" strokeWidth={1} />

                    {chartBars.map((bar, idx) => {
                      const slotWidth = 372 / Math.max(chartBars.length, 1);
                      const barWidth = Math.min(34, Math.max(16, slotWidth * 0.55));
                      const x = 38 + idx * slotWidth + (slotWidth - barWidth) / 2;
                      const barHeight = Math.max(bar.value > 0 ? 6 : 2, (bar.value / maxBarValue) * 115);
                      const y = 140 - barHeight;
                      const isHovered = hoveredBarKey === bar.key;

                      return (
                        <g
                          key={bar.key}
                          onMouseEnter={() => setHoveredBarKey(bar.key)}
                          onMouseLeave={() => setHoveredBarKey(null)}
                          onClick={() => {
                            if (bar.tripId && onSelectTrip) {
                              onSelectTrip(bar.tripId);
                            } else if (!bar.tripId) {
                              setSelectedDriverKey(bar.key);
                            }
                          }}
                          className="cursor-pointer"
                        >
                          <rect
                            x={x}
                            y={y}
                            width={barWidth}
                            height={barHeight}
                            rx={5}
                            fill={isHovered ? metricMeta.hoverColor : metricMeta.color}
                            opacity={hoveredBarKey && !isHovered ? 0.65 : 1}
                          />
                          <text
                            x={x + barWidth / 2}
                            y={y - 5}
                            textAnchor="middle"
                            className="fill-slate-800 text-[10px] font-mono font-bold"
                          >
                            {chartMetric === 'fuel' ? bar.value.toFixed(1) : Math.round(bar.value)}
                          </text>
                          <text
                            x={x + barWidth / 2}
                            y={156}
                            textAnchor="middle"
                            className="fill-slate-700 text-[10px] font-semibold"
                          >
                            {bar.label.length > 10 ? `${bar.label.slice(0, 9)}…` : bar.label}
                          </text>
                          <text
                            x={x + barWidth / 2}
                            y={170}
                            textAnchor="middle"
                            className="fill-slate-400 text-[9px]"
                          >
                            {bar.sublabel.length > 11 ? `${bar.sublabel.slice(0, 10)}…` : bar.sublabel}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                  <span>
                    {effectiveChartScope === 'drivers'
                      ? 'انقر على عمود السائق لتصفية مؤشراته'
                      : 'انقر على عمود الرحلة لفتح خريطتها وتفاصيلها'}
                  </span>
                  <span className="font-mono tabular-nums">
                    {summary.actualFuelTripsCount > 0
                      ? `${summary.actualFuelTripsCount} رحلة بقياس وقود فعلي`
                      : `معدل الديزل ${settings.truckDieselConsumptionPerKm} لتر/كم`}
                  </span>
                </div>
              </div>

              {/* Driver Breakdown Table (7 cols) */}
              <div className="lg:col-span-7 border border-slate-200 rounded-xl overflow-hidden flex flex-col justify-between bg-white">
                <div>
                  <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50/50">
                    <h4 className="text-xs font-bold text-slate-900">مقارنة كفاءة السائقين التفصيلية</h4>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-600">
                      <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
                      <span>ترتيب:</span>
                      {(
                        [
                          { id: 'completed', label: 'الأكثر إنجازاً' },
                          { id: 'duration', label: 'الأسرع توصيلاً' },
                          { id: 'fuel', label: 'الأقل وقوداً' },
                        ] as { id: SortField; label: string }[]
                      ).map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => setSortBy(s.id)}
                          className={`px-2 py-0.5 rounded font-semibold whitespace-nowrap shrink-0 cursor-pointer ${
                            sortBy === s.id
                              ? 'bg-sky-700 text-white'
                              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-right text-xs">
                      <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">السائق</th>
                          <th className="py-2.5 px-3">الرحلات المنجزة</th>
                          <th className="py-2.5 px-3">متوسط وقت التوصيل</th>
                          <th className="py-2.5 px-3">معدل الوقود / رحلة</th>
                          <th className="py-2.5 px-3">المسافة والمياه</th>
                          <th className="py-2.5 px-3">إنجاز الوجهات</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {driverAggregates.map((drv) => {
                          const stopRate =
                            drv.plannedStopsCount > 0
                              ? Math.round((drv.deliveredStopsCount / drv.plannedStopsCount) * 100)
                              : 0;
                          const isSelected = selectedDriverKey === drv.key;
                          return (
                            <tr
                              key={drv.key}
                              onClick={() =>
                                setSelectedDriverKey((prev) => (prev === drv.key ? 'all' : drv.key))
                              }
                              className={`cursor-pointer transition-colors ${
                                isSelected ? 'bg-sky-50/80' : 'hover:bg-slate-50'
                              }`}
                            >
                              <td className="py-2.5 px-3 font-semibold text-slate-900">
                                <div>{drv.name}</div>
                                <div className="text-[11px] font-normal text-slate-500">
                                  إجمالي {drv.totalTrips} · جارية {drv.inProgressTrips}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-mono tabular-nums font-bold text-emerald-700">
                                {drv.completedTrips}
                              </td>
                              <td className="py-2.5 px-3 font-mono tabular-nums text-sky-900 font-semibold">
                                <div>{formatDurationArabic(drv.avgDeliveryMinutes)}</div>
                                {drv.avgDeliveryMinutes !== null && (
                                  <div className="text-[10px] font-normal text-slate-500">
                                    حركة {drv.avgMovingMinutes}د · توقف {drv.avgStoppedMinutes}د
                                  </div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 font-mono tabular-nums">
                                <div className="font-bold text-amber-700">
                                  {drv.completedTrips > 0 ? `${drv.avgFuelPerTrip.toFixed(1)} لتر` : '—'}
                                </div>
                                <div className="text-[10px] text-slate-500">
                                  الإجمالي {drv.totalFuelLiters} لتر
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-mono tabular-nums text-slate-700">
                                <div>{drv.totalDistanceKm.toLocaleString()} كم</div>
                                <div className="text-[10px] text-slate-500">
                                  {drv.totalDeliveredLiters.toLocaleString()} لتر ماء
                                </div>
                              </td>
                              <td className="py-2.5 px-3 font-mono tabular-nums">
                                <div className="font-bold text-slate-800">{stopRate}%</div>
                                <div className="text-[10px] text-slate-500">
                                  {drv.deliveredStopsCount}/{drv.plannedStopsCount} وجهة
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/50 text-[11px] text-slate-500 flex items-center justify-between flex-wrap gap-2">
                  <span>انقر على صف أي سائق لعرض مؤشراته منفردة أو إلغاء التحديد</span>
                  <span className="font-mono tabular-nums">
                    سعر الديزل المرجعي: {settings.dieselPricePerLiter.toLocaleString()} ر.ي/لتر
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
