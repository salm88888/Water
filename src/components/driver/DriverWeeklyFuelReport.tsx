/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Driver Weekly Estimated Fuel Consumption Summary Card
 * Read-only performance & fuel efficiency summary for trips completed by the driver in the current week.
 */

import React, { useMemo, useState } from 'react';
import { Fuel, ChevronDown, ChevronUp, Route, Gauge, CheckCircle2, TrendingDown, TrendingUp } from 'lucide-react';
import { SystemSettings, Trip } from '../../types';

interface DriverWeeklyFuelReportProps {
  trips: Trip[];
  settings: SystemSettings;
  driverId?: string;
  driverName?: string;
  onSelectTrip?: (tripId: string) => void;
}

const COMPLETED_STATUSES = new Set<Trip['status']>([
  'returned_to_plant',
  'pending_sync',
  'synced',
  'completed_pending_review',
  'closed',
]);

const ARABIC_DAYS_SHORT = ['ح', 'ن', 'ث', 'ر', 'خ', 'ج', 'س'] as const; // Sun..Sat mapped by getDay()

function getCurrentWeekBounds(now: Date): {
  startMs: number;
  endMs: number;
  startDate: Date;
  endDate: Date;
  dayDates: Date[];
} {
  // Regional work week: Saturday (6) -> Friday (5)
  const diffToSaturday = (now.getDay() + 1) % 7;
  const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diffToSaturday, 0, 0, 0, 0);
  const endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6, 23, 59, 59, 999);
  const dayDates: Date[] = [];
  for (let i = 0; i < 7; i++) {
    dayDates.push(new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + i));
  }
  return {
    startMs: startDate.getTime(),
    endMs: endDate.getTime(),
    startDate,
    endDate,
    dayDates,
  };
}

function formatLocalDateKey(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getTripTimestampMs(trip: Trip): number {
  const candidate = trip.returnedToPlantAt || trip.completedAt || trip.startedAt || trip.proposedAt || trip.date;
  const ms = new Date(candidate).getTime();
  return Number.isFinite(ms) ? ms : 0;
}

function getTripLocalDateKey(trip: Trip): string {
  const candidate = trip.returnedToPlantAt || trip.completedAt || trip.startedAt || trip.proposedAt;
  if (candidate) {
    const parsed = new Date(candidate);
    if (Number.isFinite(parsed.getTime())) {
      return formatLocalDateKey(parsed);
    }
  }
  return trip.date;
}

export const DriverWeeklyFuelReport: React.FC<DriverWeeklyFuelReportProps> = ({
  trips,
  settings,
  driverId,
  driverName,
  onSelectTrip,
}) => {
  const [showDetails, setShowDetails] = useState(false);

  const referenceRatePerKm = settings.truckDieselConsumptionPerKm > 0 ? settings.truckDieselConsumptionPerKm : 0.28;
  const dieselPrice = settings.dieselPricePerLiter > 0 ? settings.dieselPricePerLiter : 0;

  const report = useMemo(() => {
    const now = new Date();
    const { startMs, endMs, startDate, endDate, dayDates } = getCurrentWeekBounds(now);
    const cleanDriverName = (driverName || '').trim();

    const weeklyCompleted = trips
      .filter((t) => {
        if (!COMPLETED_STATUSES.has(t.status)) return false;
        const belongsToDriver =
          (!driverId && !cleanDriverName) ||
          (driverId ? t.driverId === driverId : false) ||
          (cleanDriverName ? (t.driverName || '').trim() === cleanDriverName : false);
        if (!belongsToDriver) return false;

        const ts = getTripTimestampMs(t);
        if (ts >= startMs && ts <= endMs) return true;

        // Also match calendar date string if timestamps are missing
        if (t.date) {
          const [y, m, d] = t.date.split('-').map(Number);
          if (y && m && d) {
            const localMs = new Date(y, m - 1, d, 12, 0, 0).getTime();
            return localMs >= startMs && localMs <= endMs;
          }
        }
        return false;
      })
      .sort((a, b) => getTripTimestampMs(b) - getTripTimestampMs(a));

    const tripRows = weeklyCompleted.map((trip) => {
      const distanceKm =
        typeof trip.actualDistanceKm === 'number' && trip.actualDistanceKm > 0
          ? trip.actualDistanceKm
          : trip.estimatedDistanceKm || 0;

      const fuelLiters =
        typeof trip.actualFuelLiters === 'number' && trip.actualFuelLiters > 0
          ? trip.actualFuelLiters
          : trip.estimatedFuelLiters > 0
          ? trip.estimatedFuelLiters
          : Number((distanceKm * referenceRatePerKm).toFixed(2));

      const baselineByPlanOrRate =
        trip.estimatedFuelLiters > 0
          ? trip.estimatedFuelLiters
          : Number((distanceKm * referenceRatePerKm).toFixed(2));

      const ratePerKm = distanceKm > 0 ? Number((fuelLiters / distanceKm).toFixed(2)) : referenceRatePerKm;
      const variancePercent =
        baselineByPlanOrRate > 0
          ? Math.round(((fuelLiters - baselineByPlanOrRate) / baselineByPlanOrRate) * 100)
          : 0;

      return {
        trip,
        dateKey: getTripLocalDateKey(trip),
        distanceKm: Number(distanceKm.toFixed(1)),
        fuelLiters: Number(fuelLiters.toFixed(2)),
        ratePerKm,
        variancePercent,
      };
    });

    const totalFuelLiters = Number(tripRows.reduce((s, r) => s + r.fuelLiters, 0).toFixed(1));
    const totalDistanceKm = Number(tripRows.reduce((s, r) => s + r.distanceKm, 0).toFixed(1));
    const avgFuelPerTrip = tripRows.length > 0 ? Number((totalFuelLiters / tripRows.length).toFixed(1)) : 0;
    const avgDistancePerTrip = tripRows.length > 0 ? Number((totalDistanceKm / tripRows.length).toFixed(1)) : 0;
    const avgLitersPerKm =
      totalDistanceKm > 0 ? Number((totalFuelLiters / totalDistanceKm).toFixed(2)) : referenceRatePerKm;
    const estimatedFuelCost = Math.round(totalFuelLiters * dieselPrice);

    // Efficiency badge based on observed L/km vs configured reference
    let efficiencyStatus: 'efficient' | 'normal' | 'high' | 'empty' = 'empty';
    if (tripRows.length > 0) {
      if (avgLitersPerKm <= referenceRatePerKm * 0.95) {
        efficiencyStatus = 'efficient';
      } else if (avgLitersPerKm <= referenceRatePerKm * 1.1) {
        efficiencyStatus = 'normal';
      } else {
        efficiencyStatus = 'high';
      }
    }

    const dailyBuckets = dayDates.map((d) => {
      const key = formatLocalDateKey(d);
      const dayTrips = tripRows.filter((r) => r.dateKey === key);
      const fuel = Number(dayTrips.reduce((s, r) => s + r.fuelLiters, 0).toFixed(1));
      const isToday = key === formatLocalDateKey(now);
      return {
        key,
        dayShort: ARABIC_DAYS_SHORT[d.getDay()],
        dayNum: d.getDate(),
        fuel,
        tripsCount: dayTrips.length,
        isToday,
      };
    });

    const maxDailyFuel = Math.max(1, ...dailyBuckets.map((b) => b.fuel));
    const rangeLabel = `${startDate.toLocaleDateString('ar-YE', {
      day: 'numeric',
      month: 'short',
    })} – ${endDate.toLocaleDateString('ar-YE', { day: 'numeric', month: 'short' })}`;

    return {
      tripRows,
      totalFuelLiters,
      totalDistanceKm,
      avgFuelPerTrip,
      avgDistancePerTrip,
      avgLitersPerKm,
      estimatedFuelCost,
      efficiencyStatus,
      dailyBuckets,
      maxDailyFuel,
      rangeLabel,
    };
  }, [trips, driverId, driverName, referenceRatePerKm, dieselPrice]);

  const statusBadge = {
    efficient: {
      label: 'كفاءة عالية',
      cls: 'bg-emerald-950 text-emerald-300 border-emerald-700',
    },
    normal: {
      label: 'ضمن المعدل',
      cls: 'bg-sky-950 text-sky-300 border-sky-700',
    },
    high: {
      label: 'أعلى من المرجعي',
      cls: 'bg-amber-950 text-amber-300 border-amber-700',
    },
    empty: {
      label: 'بانتظار الإنجاز',
      cls: 'bg-slate-900 text-slate-400 border-slate-700',
    },
  }[report.efficiencyStatus];

  return (
    <section
      aria-label="تقرير استهلاك الوقود التقديري للأسبوع الحالي"
      className="bg-slate-800 border border-slate-700 rounded-2xl p-3.5 space-y-3 text-xs"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-amber-950/80 border border-amber-700/70 text-amber-400 flex items-center justify-center shrink-0">
            <Fuel className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-slate-100 text-xs truncate">
              استهلاك الوقود التقديري — الأسبوع الحالي
            </h3>
            <p className="text-[10px] text-slate-400 font-mono truncate">{report.rangeLabel}</p>
          </div>
        </div>
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${statusBadge.cls}`}>
          {statusBadge.label}
        </span>
      </div>

      {/* 2x2 Summary KPI Strip */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-2.5 space-y-0.5">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>إجمالي الوقود التقديري</span>
            <Fuel className="w-3 h-3 text-amber-400" />
          </div>
          <div className="font-mono font-bold text-sm text-amber-300 tabular-nums">
            {report.totalFuelLiters.toLocaleString()} لتر
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {dieselPrice > 0 ? `≈ ${report.estimatedFuelCost.toLocaleString()} ر.ي` : 'ديزل تقديري'}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-2.5 space-y-0.5">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>المعدل لكل رحلة</span>
            <CheckCircle2 className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="font-mono font-bold text-sm text-white tabular-nums">
            {report.tripRows.length > 0 ? `${report.avgFuelPerTrip} لتر` : '—'}
          </div>
          <div className="text-[10px] text-slate-400 font-mono">
            {report.tripRows.length} رحلة منجزة هذا الأسبوع
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-2.5 space-y-0.5">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>مسافة الأسبوع المنجزة</span>
            <Route className="w-3 h-3 text-sky-400" />
          </div>
          <div className="font-mono font-bold text-sm text-sky-300 tabular-nums">
            {report.totalDistanceKm.toLocaleString()} كم
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            {report.tripRows.length > 0 ? `متوسط ${report.avgDistancePerTrip} كم/رحلة` : 'لا توجد مسافات بعد'}
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-700/80 rounded-xl p-2.5 space-y-0.5">
          <div className="text-[10px] text-slate-400 flex items-center justify-between">
            <span>مؤشر الكفاءة</span>
            <Gauge className="w-3 h-3 text-emerald-400" />
          </div>
          <div className="font-mono font-bold text-sm text-emerald-300 tabular-nums">
            {report.avgLitersPerKm.toFixed(2)} لتر/كم
          </div>
          <div className="text-[10px] text-slate-500 font-mono">
            المرجعي: {referenceRatePerKm.toFixed(2)} لتر/كم
          </div>
        </div>
      </div>

      {/* Mini 7-Day Activity & Fuel Bar Strip */}
      <div className="bg-slate-900/60 border border-slate-700/70 rounded-xl p-2.5 space-y-2">
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>التوزيع اليومي لاستهلاك الوقود (السبت – الجمعة)</span>
          <span className="font-mono text-slate-300">لتر / يوم</span>
        </div>
        <svg
          viewBox="0 0 280 62"
          className="w-full h-16 overflow-visible"
          role="img"
          aria-label="التوزيع اليومي لاستهلاك الوقود"
        >
          {report.dailyBuckets.map((day, idx) => {
            const slotWidth = 280 / 7;
            const barWidth = 18;
            const x = idx * slotWidth + (slotWidth - barWidth) / 2;
            const maxBarHeight = 36;
            const barHeight =
              day.fuel > 0 ? Math.max(6, Math.round((day.fuel / report.maxDailyFuel) * maxBarHeight)) : 3;
            const y = 46 - barHeight;
            const fill =
              day.fuel > 0
                ? day.isToday
                  ? '#fbbf24'
                  : 'rgba(245, 158, 11, 0.8)'
                : '#1e293b';

            return (
              <g key={day.key}>
                <title>{`${day.fuel} لتر (${day.tripsCount} رحلات)`}</title>
                {day.fuel > 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={y - 3}
                    textAnchor="middle"
                    className="fill-amber-300 text-[8px] font-mono font-bold"
                  >
                    {day.fuel.toFixed(0)}
                  </text>
                )}
                <rect x={x} y={y} width={barWidth} height={barHeight} rx={3} fill={fill} />
                <text
                  x={x + barWidth / 2}
                  y={58}
                  textAnchor="middle"
                  className={`text-[9px] font-bold ${day.isToday ? 'fill-sky-400' : 'fill-slate-400'}`}
                >
                  {day.dayShort}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Empty Note OR Collapsible Per-Trip Breakdown */}
      {report.tripRows.length === 0 ? (
        <div className="text-[11px] text-slate-400 bg-slate-900/50 border border-dashed border-slate-700 rounded-xl p-2.5 text-center leading-relaxed">
          لم تنجز أي رحلات في الأسبوع الحالي بعد — يتم احتساب الوقود التقديري تلقائياً بمعدل{' '}
          <span className="font-mono text-amber-300">{referenceRatePerKm} لتر/كم</span> فور إكمال كل رحلة.
        </div>
      ) : (
        <div className="space-y-2">
          <button
            type="button"
            onClick={() => setShowDetails((v) => !v)}
            className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-950 border border-slate-700 rounded-xl text-[11px] font-bold text-slate-200 flex items-center justify-between transition-colors"
          >
            <span>تفاصيل رحلات الأسبوع المنجزة ({report.tripRows.length})</span>
            {showDetails ? (
              <ChevronUp className="w-4 h-4 text-slate-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {showDetails && (
            <div className="space-y-1.5 max-h-56 overflow-y-auto pr-0.5">
              {report.tripRows.map(({ trip, distanceKm, fuelLiters, ratePerKm, variancePercent }) => (
                <button
                  key={trip.id}
                  type="button"
                  onClick={() => onSelectTrip?.(trip.id)}
                  className="w-full text-right bg-slate-900/90 hover:bg-slate-950 border border-slate-700/80 rounded-xl p-2.5 flex items-center justify-between gap-2 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-bold text-sky-400 text-[11px]">{trip.tripNumber}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{trip.date}</span>
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {distanceKm} كم · {ratePerKm.toFixed(2)} لتر/كم
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="font-mono font-bold text-amber-300 text-xs">{fuelLiters} لتر</div>
                    <div
                      className={`text-[10px] font-semibold flex items-center justify-end gap-0.5 ${
                        variancePercent < -5
                          ? 'text-emerald-400'
                          : variancePercent > 8
                          ? 'text-rose-400'
                          : 'text-slate-400'
                      }`}
                    >
                      {variancePercent < -5 ? (
                        <>
                          <TrendingDown className="w-3 h-3" />
                          <span>توفير {Math.abs(variancePercent)}%</span>
                        </>
                      ) : variancePercent > 8 ? (
                        <>
                          <TrendingUp className="w-3 h-3" />
                          <span>+{variancePercent}%</span>
                        </>
                      ) : (
                        <span>ضمن المقدر</span>
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
};
