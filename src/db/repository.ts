/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Cloud SQL PostgreSQL Relational Repository Helpers (Drizzle ORM)
 */

import { desc, eq } from 'drizzle-orm';
import { db } from './index.ts';
import {
  appSnapshots,
  customers,
  districts,
  orders,
  trips,
} from './schema.ts';
import { getOrCreateUser } from './users.ts';
import type {
  Customer,
  DriverAccount,
  DriverReconciliation,
  Expense,
  GPSEvent,
  Invoice,
  ManagerDirective,
  AppNotification,
  Order,
  SystemSettings,
  Trip,
  Truck,
} from '../types/index.ts';

export interface CloudSqlStateSnapshot {
  customers: Customer[];
  orders: Order[];
  trips: Trip[];
  invoices: Invoice[];
  reconciliations: DriverReconciliation[];
  expenses: Expense[];
  gpsEvents: GPSEvent[];
  notifications: AppNotification[];
  directives: ManagerDirective[];
  driverAccounts: DriverAccount[];
  truck: Truck;
  settings: SystemSettings;
}

export async function upsertDistrictSql(name: string, ownerUid: string) {
  const cleanName = name.trim();
  if (!cleanName) return null;
  try {
    const result = await db
      .insert(districts)
      .values({ name: cleanName, ownerUid })
      .onConflictDoNothing({ target: districts.name })
      .returning();
    return result[0] || { name: cleanName, ownerUid };
  } catch (error) {
    console.error('Database query failed in upsertDistrictSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getDistrictsSql(ownerUid: string) {
  try {
    return await db
      .select()
      .from(districts)
      .where(eq(districts.ownerUid, ownerUid));
  } catch (error) {
    console.error('Database query failed in getDistrictsSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getCustomersSql(ownerUid: string) {
  try {
    return await db
      .select()
      .from(customers)
      .where(eq(customers.ownerUid, ownerUid))
      .orderBy(desc(customers.updatedAt));
  } catch (error) {
    console.error('Database query failed in getCustomersSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertCustomerSql(customer: Customer, ownerUid: string) {
  try {
    const result = await db
      .insert(customers)
      .values({
        id: customer.id,
        customerCode: customer.customerId,
        ownerUid,
        name: customer.name,
        phone: customer.phone,
        altPhone: customer.altPhone || null,
        district: customer.district,
        addressDetails: customer.addressDetails || null,
        lat: Number(customer.lat),
        lng: Number(customer.lng),
        tankCapacityLiters: Math.round(Number(customer.tankCapacityLiters) || 2000),
        tankRemainingLiters: Math.round(Number(customer.tankRemainingLiters) || 0),
        notes: customer.notes || null,
        isActive: customer.isActive !== false,
        totalOrdersCount: Math.round(Number(customer.totalOrdersCount) || 0),
        totalLitersDelivered: Math.round(Number(customer.totalLitersDelivered) || 0),
        isOfflineCreated: Boolean(customer.isOfflineCreated),
        createdAt: customer.createdAt || new Date().toISOString(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: customers.id,
        set: {
          customerCode: customer.customerId,
          ownerUid,
          name: customer.name,
          phone: customer.phone,
          altPhone: customer.altPhone || null,
          district: customer.district,
          addressDetails: customer.addressDetails || null,
          lat: Number(customer.lat),
          lng: Number(customer.lng),
          tankCapacityLiters: Math.round(Number(customer.tankCapacityLiters) || 2000),
          tankRemainingLiters: Math.round(Number(customer.tankRemainingLiters) || 0),
          notes: customer.notes || null,
          isActive: customer.isActive !== false,
          totalOrdersCount: Math.round(Number(customer.totalOrdersCount) || 0),
          totalLitersDelivered: Math.round(Number(customer.totalLitersDelivered) || 0),
          isOfflineCreated: Boolean(customer.isOfflineCreated),
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in upsertCustomerSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function deleteCustomerSql(id: string) {
  try {
    const deleted = await db
      .delete(customers)
      .where(eq(customers.id, id))
      .returning();
    return deleted[0] || null;
  } catch (error) {
    console.error('Database query failed in deleteCustomerSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getOrdersSql(ownerUid: string) {
  try {
    return await db
      .select()
      .from(orders)
      .where(eq(orders.ownerUid, ownerUid))
      .orderBy(desc(orders.updatedAt));
  } catch (error) {
    console.error('Database query failed in getOrdersSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertOrderSql(order: Order, ownerUid: string) {
  try {
    const result = await db
      .insert(orders)
      .values({
        id: order.id,
        orderNumber: order.orderNumber,
        ownerUid,
        customerId: order.customerId || null,
        customerName: order.customerName,
        phone: order.phone,
        district: order.district,
        addressDetails: order.addressDetails || null,
        lat: Number(order.lat),
        lng: Number(order.lng),
        tankCapacity: Math.round(Number(order.tankCapacity) || 2000),
        tankRemainingLiters: Math.round(Number(order.tankRemainingLiters) || 0),
        requestedLiters: Math.round(Number(order.requestedLiters) || 0),
        pricePerLiter: Number(order.pricePerLiter) || 0,
        totalAmount: Number(order.totalAmount) || 0,
        source: order.source,
        status: order.status,
        tripId: order.tripId || null,
        isUrgent: Boolean(order.isUrgent),
        duplicateWarning: Boolean(order.duplicateWarning),
        duplicateMatchedOrderId: order.duplicateMatchedOrderId || null,
        notes: order.notes || null,
        createdAt: order.createdAt || new Date().toISOString(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: orders.id,
        set: {
          orderNumber: order.orderNumber,
          ownerUid,
          customerId: order.customerId || null,
          customerName: order.customerName,
          phone: order.phone,
          district: order.district,
          addressDetails: order.addressDetails || null,
          lat: Number(order.lat),
          lng: Number(order.lng),
          tankCapacity: Math.round(Number(order.tankCapacity) || 2000),
          tankRemainingLiters: Math.round(Number(order.tankRemainingLiters) || 0),
          requestedLiters: Math.round(Number(order.requestedLiters) || 0),
          pricePerLiter: Number(order.pricePerLiter) || 0,
          totalAmount: Number(order.totalAmount) || 0,
          source: order.source,
          status: order.status,
          tripId: order.tripId || null,
          isUrgent: Boolean(order.isUrgent),
          duplicateWarning: Boolean(order.duplicateWarning),
          duplicateMatchedOrderId: order.duplicateMatchedOrderId || null,
          notes: order.notes || null,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in upsertOrderSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function getTripsSql(ownerUid: string) {
  try {
    return await db
      .select()
      .from(trips)
      .where(eq(trips.ownerUid, ownerUid))
      .orderBy(desc(trips.updatedAt));
  } catch (error) {
    console.error('Database query failed in getTripsSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function upsertTripSql(trip: Trip, ownerUid: string) {
  try {
    const payloadJson: Record<string, unknown> = {
      ...trip,
    };
    const result = await db
      .insert(trips)
      .values({
        id: trip.id,
        tripNumber: trip.tripNumber,
        ownerUid,
        date: trip.date,
        truckId: trip.truckId,
        driverId: trip.driverId,
        driverName: trip.driverName,
        truckPlate: trip.truckPlate,
        status: trip.status,
        syncStatus: trip.syncStatus,
        createdByRole: trip.createdByRole,
        driverAcceptanceStatus: trip.driverAcceptanceStatus || null,
        initialLoadLiters: Math.round(Number(trip.initialLoadLiters) || 0),
        deliveredLiters: Math.round(Number(trip.deliveredLiters) || 0),
        remainingLiters: Math.round(Number(trip.remainingLiters) || 0),
        estimatedDistanceKm: Number(trip.estimatedDistanceKm) || 0,
        actualDistanceKm: trip.actualDistanceKm !== undefined ? Number(trip.actualDistanceKm) : null,
        fuelCost: Number(trip.fuelCost) || 0,
        productionCost: Number(trip.productionCost) || 0,
        driverWageShare: Number(trip.driverWageShare) || 0,
        maintenanceShare: Number(trip.maintenanceShare) || 0,
        otherExpensesShare: Number(trip.otherExpensesShare) || 0,
        totalCost: Number(trip.totalCost) || 0,
        expectedRevenue: Number(trip.expectedRevenue) || 0,
        expectedProfit: Number(trip.expectedProfit) || 0,
        profitMarginPercent: Number(trip.profitMarginPercent) || 0,
        capacityUtilizationPercent: Number(trip.capacityUtilizationPercent) || 0,
        departureRecommendation: trip.departureRecommendation,
        recommendationReason: trip.recommendationReason,
        payloadJson,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: trips.id,
        set: {
          tripNumber: trip.tripNumber,
          ownerUid,
          date: trip.date,
          truckId: trip.truckId,
          driverId: trip.driverId,
          driverName: trip.driverName,
          truckPlate: trip.truckPlate,
          status: trip.status,
          syncStatus: trip.syncStatus,
          createdByRole: trip.createdByRole,
          driverAcceptanceStatus: trip.driverAcceptanceStatus || null,
          initialLoadLiters: Math.round(Number(trip.initialLoadLiters) || 0),
          deliveredLiters: Math.round(Number(trip.deliveredLiters) || 0),
          remainingLiters: Math.round(Number(trip.remainingLiters) || 0),
          estimatedDistanceKm: Number(trip.estimatedDistanceKm) || 0,
          actualDistanceKm: trip.actualDistanceKm !== undefined ? Number(trip.actualDistanceKm) : null,
          fuelCost: Number(trip.fuelCost) || 0,
          productionCost: Number(trip.productionCost) || 0,
          driverWageShare: Number(trip.driverWageShare) || 0,
          maintenanceShare: Number(trip.maintenanceShare) || 0,
          otherExpensesShare: Number(trip.otherExpensesShare) || 0,
          totalCost: Number(trip.totalCost) || 0,
          expectedRevenue: Number(trip.expectedRevenue) || 0,
          expectedProfit: Number(trip.expectedProfit) || 0,
          profitMarginPercent: Number(trip.profitMarginPercent) || 0,
          capacityUtilizationPercent: Number(trip.capacityUtilizationPercent) || 0,
          departureRecommendation: trip.departureRecommendation,
          recommendationReason: trip.recommendationReason,
          payloadJson,
          updatedAt: new Date(),
        },
      })
      .returning();
    return result[0];
  } catch (error) {
    console.error('Database query failed in upsertTripSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function syncFullStateToSql(
  user: { uid: string; email: string; displayName?: string },
  snapshot: CloudSqlStateSnapshot
) {
  try {
    await getOrCreateUser(user.uid, user.email, user.displayName, 'manager');

    if (Array.isArray(snapshot.settings?.customDistricts)) {
      for (const d of snapshot.settings.customDistricts) {
        if (typeof d === 'string' && d.trim()) {
          await upsertDistrictSql(d, user.uid);
        }
      }
    }

    for (const c of snapshot.customers || []) {
      await upsertCustomerSql(c, user.uid);
    }

    for (const o of snapshot.orders || []) {
      await upsertOrderSql(o, user.uid);
    }

    for (const t of snapshot.trips || []) {
      await upsertTripSql(t, user.uid);
    }

    await db
      .insert(appSnapshots)
      .values({
        ownerUid: user.uid,
        settingsJson: snapshot.settings as unknown as Record<string, unknown>,
        truckJson: snapshot.truck as unknown as Record<string, unknown>,
        driverAccountsJson: snapshot.driverAccounts || [],
        invoicesJson: snapshot.invoices || [],
        reconciliationsJson: snapshot.reconciliations || [],
        expensesJson: snapshot.expenses || [],
        gpsEventsJson: snapshot.gpsEvents || [],
        notificationsJson: snapshot.notifications || [],
        directivesJson: snapshot.directives || [],
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: appSnapshots.ownerUid,
        set: {
          settingsJson: snapshot.settings as unknown as Record<string, unknown>,
          truckJson: snapshot.truck as unknown as Record<string, unknown>,
          driverAccountsJson: snapshot.driverAccounts || [],
          invoicesJson: snapshot.invoices || [],
          reconciliationsJson: snapshot.reconciliations || [],
          expensesJson: snapshot.expenses || [],
          gpsEventsJson: snapshot.gpsEvents || [],
          notificationsJson: snapshot.notifications || [],
          directivesJson: snapshot.directives || [],
          updatedAt: new Date(),
        },
      });

    return { syncedAt: new Date().toISOString() };
  } catch (error) {
    console.error('Database query failed in syncFullStateToSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}

export async function loadFullStateFromSql(ownerUid: string) {
  try {
    const [snapRow] = await db
      .select()
      .from(appSnapshots)
      .where(eq(appSnapshots.ownerUid, ownerUid));

    const [customerRows, orderRows, tripRows, districtRows] = await Promise.all([
      getCustomersSql(ownerUid),
      getOrdersSql(ownerUid),
      getTripsSql(ownerUid),
      getDistrictsSql(ownerUid),
    ]);

    return {
      hasData:
        Boolean(snapRow) ||
        customerRows.length > 0 ||
        orderRows.length > 0 ||
        tripRows.length > 0,
      districts: districtRows.map((d) => d.name),
      customers: customerRows.map((row) => ({
        id: row.id,
        customerId: row.customerCode,
        name: row.name,
        phone: row.phone,
        altPhone: row.altPhone || '',
        district: row.district,
        addressDetails: row.addressDetails || '',
        lat: row.lat,
        lng: row.lng,
        tankCapacityLiters: row.tankCapacityLiters,
        tankRemainingLiters: row.tankRemainingLiters,
        notes: row.notes || '',
        createdAt: row.createdAt,
        isActive: row.isActive,
        totalOrdersCount: row.totalOrdersCount,
        totalLitersDelivered: row.totalLitersDelivered,
        isOfflineCreated: row.isOfflineCreated,
      })) as Customer[],
      orders: orderRows.map((row) => ({
        id: row.id,
        orderNumber: row.orderNumber,
        customerId: row.customerId || '',
        customerName: row.customerName,
        phone: row.phone,
        district: row.district,
        addressDetails: row.addressDetails || '',
        lat: row.lat,
        lng: row.lng,
        tankCapacity: row.tankCapacity,
        tankRemainingLiters: row.tankRemainingLiters,
        requestedLiters: row.requestedLiters,
        pricePerLiter: row.pricePerLiter,
        totalAmount: row.totalAmount,
        source: row.source as Order['source'],
        createdAt: row.createdAt,
        notes: row.notes || '',
        status: row.status as Order['status'],
        tripId: row.tripId || undefined,
        isUrgent: row.isUrgent,
        duplicateWarning: row.duplicateWarning,
        duplicateMatchedOrderId: row.duplicateMatchedOrderId || undefined,
      })) as Order[],
      trips: tripRows.map((row) => row.payloadJson as unknown as Trip),
      settings: (snapRow?.settingsJson as unknown as SystemSettings) || null,
      truck: (snapRow?.truckJson as unknown as Truck) || null,
      driverAccounts: (snapRow?.driverAccountsJson as unknown as DriverAccount[]) || [],
      invoices: (snapRow?.invoicesJson as unknown as Invoice[]) || [],
      reconciliations: (snapRow?.reconciliationsJson as unknown as DriverReconciliation[]) || [],
      expenses: (snapRow?.expensesJson as unknown as Expense[]) || [],
      gpsEvents: (snapRow?.gpsEventsJson as unknown as GPSEvent[]) || [],
      notifications: (snapRow?.notificationsJson as unknown as AppNotification[]) || [],
      directives: (snapRow?.directivesJson as unknown as ManagerDirective[]) || [],
    };
  } catch (error) {
    console.error('Database query failed in loadFullStateFromSql:', error);
    throw new Error('Database query failed. Please try again later.', { cause: error });
  }
}
