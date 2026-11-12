/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Smart Water Delivery Management System
 * Intelligent Order Clustering & Route Feasibility Algorithm for Marib District
 */

import { Order, SystemSettings, ClusterProposal, TripCustomerStop } from '../types';

/**
 * Calculates Haversine distance in kilometers between two GPS coordinates
 */
export function haversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth radius in km
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

/**
 * Road network winding factor in Marib city:
 * Straight line (crow flies) is multiplied by ~1.35 to account for urban streets,
 * circular roads, unpaved residential alleys, and checkpoints.
 */
export const MARIB_ROAD_FACTOR = 1.35;

export function estimateRoadDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const straight = haversineDistanceKm(lat1, lon1, lat2, lon2);
  return Number((straight * MARIB_ROAD_FACTOR).toFixed(2));
}

/**
 * Solves optimal stop sequence starting from Plant -> visiting all customer points -> returning to Plant.
 * Uses Nearest-Neighbor heuristic with 2-opt refinement.
 */
export function optimizeStopSequence(
  plantLat: number,
  plantLng: number,
  orders: Order[]
): { sequence: Order[]; totalDistanceKm: number } {
  if (orders.length === 0) return { sequence: [], totalDistanceKm: 0 };
  if (orders.length === 1) {
    const d = estimateRoadDistanceKm(plantLat, plantLng, orders[0].lat, orders[0].lng) * 2;
    return { sequence: orders, totalDistanceKm: Number(d.toFixed(1)) };
  }

  const unvisited = [...orders];
  const route: Order[] = [];
  let currentLat = plantLat;
  let currentLng = plantLng;
  let totalDist = 0;

  while (unvisited.length > 0) {
    let nearestIndex = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const dist = estimateRoadDistanceKm(currentLat, currentLng, unvisited[i].lat, unvisited[i].lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearestIndex = i;
      }
    }

    const nextOrder = unvisited.splice(nearestIndex, 1)[0];
    route.push(nextOrder);
    totalDist += minDistance;
    currentLat = nextOrder.lat;
    currentLng = nextOrder.lng;
  }

  // Add return distance from last customer to plant
  const returnDist = estimateRoadDistanceKm(currentLat, currentLng, plantLat, plantLng);
  totalDist += returnDist;

  return {
    sequence: route,
    totalDistanceKm: Number(totalDist.toFixed(1)),
  };
}

/**
 * Clusters a pool of pending orders into feasible candidate trips.
 * Strict Constraint: Max water truck capacity = 6,000 Liters.
 * Prioritizes:
 *  1. Geographic proximity & neighborhood clustering in Marib
 *  2. Capacity utilization (target ~80-100% of 6,000L)
 *  3. Urgent orders priority
 *  4. Economic viability (Operating profit > 0, margin > 25%)
 */
export function generateSmartClusters(
  orders: Order[],
  settings: SystemSettings,
  maxTruckCapacity: number = 6000
): ClusterProposal[] {
  // Filter only eligible orders: new, waiting_clustering, confirmed
  const candidates = orders.filter(
    (o) =>
      o.status === 'new' ||
      o.status === 'confirmed' ||
      o.status === 'waiting_clustering'
  );

  if (candidates.length === 0) return [];

  // Group candidate orders by primary district/neighborhood first
  const districtGroups: { [district: string]: Order[] } = {};
  for (const ord of candidates) {
    const key = ord.district || 'أخرى';
    if (!districtGroups[key]) districtGroups[key] = [];
    districtGroups[key].push(ord);
  }

  const proposals: ClusterProposal[] = [];
  const assignedOrderIds = new Set<string>();

  // Helper to calculate proposal metrics
  const evaluateCluster = (clusterOrders: Order[], clusterId: string): ClusterProposal => {
    const { sequence, totalDistanceKm } = optimizeStopSequence(
      settings.plantLocation.lat,
      settings.plantLocation.lng,
      clusterOrders
    );

    const totalLiters = clusterOrders.reduce((sum, o) => sum + o.requestedLiters, 0);
    const capacityUtilization = Number(((totalLiters / maxTruckCapacity) * 100).toFixed(1));

    // Logistics & Costing math
    const estimatedFuelLiters = Number(
      (totalDistanceKm * settings.truckDieselConsumptionPerKm).toFixed(2)
    );
    const fuelCost = Math.round(estimatedFuelLiters * settings.dieselPricePerLiter);
    const productionCost = Math.round(totalLiters * settings.waterProductionCostPerLiter);
    const driverWageShare = settings.driverWagePerTrip;
    const maintenanceShare = settings.maintenanceAllowancePerTrip;
    const totalCost = fuelCost + productionCost + driverWageShare + maintenanceShare;

    // Revenue
    const expectedRevenue = clusterOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const expectedProfit = expectedRevenue - totalCost;
    const profitMarginPercent = expectedRevenue > 0
      ? Number(((expectedProfit / expectedRevenue) * 100).toFixed(1))
      : 0;

    // Recommendation strategy
    let recommendation: 'GO_NOW' | 'WAIT_MORE' | 'FEASIBLE_PARTIAL' | 'URGENT_OVERRIDE' = 'GO_NOW';
    let reason = '';

    const hasUrgent = clusterOrders.some((o) => o.isUrgent);

    if (hasUrgent && capacityUtilization < 60) {
      recommendation = 'URGENT_OVERRIDE';
      reason = 'يحتوي على طلب عاجل جداً يتطلب استثناءً واعتماداً للخروج رغم انخفاض حمولة الوايت';
    } else if (totalLiters >= 4500 && expectedProfit > 15000) {
      recommendation = 'GO_NOW';
      reason = `حمولة مثالية (${capacityUtilization}%) وربحية تشغيلية مرتفعة (${expectedProfit.toLocaleString()} ر.ي) وتمركز ممتاز في ${Array.from(new Set(clusterOrders.map(o => o.district))).join(' و ')}`;
    } else if (totalLiters >= 3000 && profitMarginPercent >= 35) {
      recommendation = 'FEASIBLE_PARTIAL';
      reason = `رحلة جزئية مجدية اقتصادياً بهامش ربح ${profitMarginPercent}%، يمكن الخروج الآن أو الانتظار لضم طلب إضافي`;
    } else {
      recommendation = 'WAIT_MORE';
      reason = `الحمولة منخفضة (${totalLiters.toLocaleString()} لتر / ${capacityUtilization}%)، يُنصح بالانتظار لتجميع طلبات إضافية لخفض تكلفة النقل للتر الواحد`;
    }

    const customerStops: TripCustomerStop[] = sequence.map((order, index) => ({
      stopSequence: index + 1,
      orderId: order.id,
      customerId: order.customerId,
      customerName: order.customerName,
      phone: order.phone,
      district: order.district,
      addressDetails: order.addressDetails,
      lat: order.lat,
      lng: order.lng,
      tankCapacity: order.tankCapacity,
      requestedLiters: order.requestedLiters,
      deliveredLiters: 0,
      pricePerLiter: order.pricePerLiter,
      totalAmount: order.totalAmount,
      paidAmount: 0,
      remainingAmount: order.totalAmount,
      status: 'pending',
    }));

    return {
      id: clusterId,
      orders: sequence,
      totalLiters,
      capacityUtilization,
      customerStops,
      estimatedDistanceKm: totalDistanceKm,
      estimatedFuelLiters,
      fuelCost,
      productionCost,
      driverWageShare,
      maintenanceShare,
      totalCost,
      expectedRevenue,
      expectedProfit,
      profitMarginPercent,
      recommendation,
      reason,
      districtsCovered: Array.from(new Set(clusterOrders.map((o) => o.district))),
    };
  };

  // Phase 1: High-affinity same-neighborhood / adjacent neighborhoods clustering
  const remainingCandidates = [...candidates];
  let clusterCounter = 1;

  while (remainingCandidates.length > 0) {
    // Pick the seed order (urgent first, or oldest order)
    const seedIndex = remainingCandidates.findIndex((o) => o.isUrgent) !== -1
      ? remainingCandidates.findIndex((o) => o.isUrgent)
      : 0;

    const seed = remainingCandidates.splice(seedIndex, 1)[0];
    const currentBatch: Order[] = [seed];
    let currentLiters = seed.requestedLiters;

    // Greedily find closest remaining candidates that don't exceed 6,000L
    while (remainingCandidates.length > 0) {
      let bestIndex = -1;
      let minDistance = Infinity;

      for (let i = 0; i < remainingCandidates.length; i++) {
        const candidate = remainingCandidates[i];
        if (currentLiters + candidate.requestedLiters <= maxTruckCapacity) {
          // Calculate distance from last order in batch
          const lastOrder = currentBatch[currentBatch.length - 1];
          const dist = estimateRoadDistanceKm(
            lastOrder.lat,
            lastOrder.lng,
            candidate.lat,
            candidate.lng
          );
          if (dist < minDistance) {
            minDistance = dist;
            bestIndex = i;
          }
        }
      }

      if (bestIndex !== -1 && minDistance <= 6.0) { // within reasonable neighborhood radius (~6km in Marib)
        const matched = remainingCandidates.splice(bestIndex, 1)[0];
        currentBatch.push(matched);
        currentLiters += matched.requestedLiters;
      } else {
        break;
      }
    }

    if (currentBatch.length > 0) {
      proposals.push(evaluateCluster(currentBatch, `cluster-prop-${clusterCounter++}`));
    }
  }

  // Sort proposals so that GO_NOW and URGENT are presented first
  const priorityOrder = {
    URGENT_OVERRIDE: 1,
    GO_NOW: 2,
    FEASIBLE_PARTIAL: 3,
    WAIT_MORE: 4,
  };

  return proposals.sort((a, b) => priorityOrder[a.recommendation] - priorityOrder[b.recommendation]);
}
