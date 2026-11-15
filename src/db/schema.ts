/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Cloud SQL PostgreSQL Relational Schema (Drizzle ORM)
 */

import { relations } from 'drizzle-orm';
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  uid: text('uid').notNull().unique(),
  email: text('email').notNull(),
  displayName: text('display_name'),
  role: text('role').notNull().default('manager'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const districts = pgTable('districts', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  ownerUid: text('owner_uid').references(() => users.uid, { onDelete: 'set null' }),
  createdAt: timestamp('created_at').defaultNow(),
});

export const customers = pgTable('customers', {
  id: text('id').primaryKey(),
  customerCode: text('customer_code').notNull(),
  ownerUid: text('owner_uid').references(() => users.uid, { onDelete: 'set null' }),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  altPhone: text('alt_phone'),
  district: text('district').notNull(),
  addressDetails: text('address_details'),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  tankCapacityLiters: integer('tank_capacity_liters').notNull(),
  tankRemainingLiters: integer('tank_remaining_liters').notNull().default(0),
  notes: text('notes'),
  isActive: boolean('is_active').notNull().default(true),
  totalOrdersCount: integer('total_orders_count').notNull().default(0),
  totalLitersDelivered: integer('total_liters_delivered').notNull().default(0),
  isOfflineCreated: boolean('is_offline_created').notNull().default(false),
  createdAt: text('created_at').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const orders = pgTable('orders', {
  id: text('id').primaryKey(),
  orderNumber: text('order_number').notNull(),
  ownerUid: text('owner_uid').references(() => users.uid, { onDelete: 'set null' }),
  customerId: text('customer_id'),
  customerName: text('customer_name').notNull(),
  phone: text('phone').notNull(),
  district: text('district').notNull(),
  addressDetails: text('address_details'),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  tankCapacity: integer('tank_capacity').notNull(),
  tankRemainingLiters: integer('tank_remaining_liters').notNull().default(0),
  requestedLiters: integer('requested_liters').notNull(),
  pricePerLiter: doublePrecision('price_per_liter').notNull(),
  totalAmount: doublePrecision('total_amount').notNull(),
  source: text('source').notNull(),
  status: text('status').notNull(),
  tripId: text('trip_id'),
  isUrgent: boolean('is_urgent').notNull().default(false),
  duplicateWarning: boolean('duplicate_warning').notNull().default(false),
  duplicateMatchedOrderId: text('duplicate_matched_order_id'),
  notes: text('notes'),
  createdAt: text('created_at').notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const trips = pgTable('trips', {
  id: text('id').primaryKey(),
  tripNumber: text('trip_number').notNull(),
  ownerUid: text('owner_uid').references(() => users.uid, { onDelete: 'set null' }),
  date: text('date').notNull(),
  truckId: text('truck_id').notNull(),
  driverId: text('driver_id').notNull(),
  driverName: text('driver_name').notNull(),
  truckPlate: text('truck_plate').notNull(),
  status: text('status').notNull(),
  syncStatus: text('sync_status').notNull(),
  createdByRole: text('created_by_role').notNull(),
  driverAcceptanceStatus: text('driver_acceptance_status'),
  initialLoadLiters: integer('initial_load_liters').notNull(),
  deliveredLiters: integer('delivered_liters').notNull(),
  remainingLiters: integer('remaining_liters').notNull(),
  estimatedDistanceKm: doublePrecision('estimated_distance_km').notNull(),
  actualDistanceKm: doublePrecision('actual_distance_km'),
  fuelCost: doublePrecision('fuel_cost').notNull(),
  productionCost: doublePrecision('production_cost').notNull(),
  driverWageShare: doublePrecision('driver_wage_share').notNull(),
  maintenanceShare: doublePrecision('maintenance_share').notNull(),
  otherExpensesShare: doublePrecision('other_expenses_share').notNull(),
  totalCost: doublePrecision('total_cost').notNull(),
  expectedRevenue: doublePrecision('expected_revenue').notNull(),
  expectedProfit: doublePrecision('expected_profit').notNull(),
  profitMarginPercent: doublePrecision('profit_margin_percent').notNull(),
  capacityUtilizationPercent: doublePrecision('capacity_utilization_percent').notNull(),
  departureRecommendation: text('departure_recommendation').notNull(),
  recommendationReason: text('recommendation_reason').notNull(),
  payloadJson: jsonb('payload_json').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const appSnapshots = pgTable('app_snapshots', {
  ownerUid: text('owner_uid')
    .primaryKey()
    .references(() => users.uid, { onDelete: 'cascade' }),
  settingsJson: jsonb('settings_json').$type<Record<string, unknown>>().notNull(),
  truckJson: jsonb('truck_json').$type<Record<string, unknown>>().notNull(),
  driverAccountsJson: jsonb('driver_accounts_json').$type<unknown[]>().notNull(),
  invoicesJson: jsonb('invoices_json').$type<unknown[]>().notNull(),
  reconciliationsJson: jsonb('reconciliations_json').$type<unknown[]>().notNull(),
  expensesJson: jsonb('expenses_json').$type<unknown[]>().notNull(),
  gpsEventsJson: jsonb('gps_events_json').$type<unknown[]>().notNull(),
  notificationsJson: jsonb('notifications_json').$type<unknown[]>().notNull(),
  directivesJson: jsonb('directives_json').$type<unknown[]>().notNull(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

export const usersRelations = relations(users, ({ many, one }) => ({
  districts: many(districts),
  customers: many(customers),
  orders: many(orders),
  trips: many(trips),
  snapshot: one(appSnapshots, {
    fields: [users.uid],
    references: [appSnapshots.ownerUid],
  }),
}));

export const districtsRelations = relations(districts, ({ one }) => ({
  owner: one(users, {
    fields: [districts.ownerUid],
    references: [users.uid],
  }),
}));

export const customersRelations = relations(customers, ({ one }) => ({
  owner: one(users, {
    fields: [customers.ownerUid],
    references: [users.uid],
  }),
}));

export const ordersRelations = relations(orders, ({ one }) => ({
  owner: one(users, {
    fields: [orders.ownerUid],
    references: [users.uid],
  }),
}));

export const tripsRelations = relations(trips, ({ one }) => ({
  owner: one(users, {
    fields: [trips.ownerUid],
    references: [users.uid],
  }),
}));

export const appSnapshotsRelations = relations(appSnapshots, ({ one }) => ({
  owner: one(users, {
    fields: [appSnapshots.ownerUid],
    references: [users.uid],
  }),
}));
