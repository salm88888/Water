/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Dirty Dozen Adversarial Security Rules Specification & Rule Audit
 */

export interface AdversarialTestCase {
  id: number;
  name: string;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  path: string;
  expectedResult: 'PERMISSION_DENIED';
  enforcedByRule: string;
}

export const DIRTY_DOZEN_CASES: AdversarialTestCase[] = [
  {
    id: 1,
    name: 'Unauthenticated Customer Read',
    operation: 'get',
    path: '/customers/cust-1',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'isSignedIn() requires request.auth != null',
  },
  {
    id: 2,
    name: 'Unverified Admin Email Spoof',
    operation: 'get',
    path: '/customers/cust-1',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'isSignedIn() mandates request.auth.token.email_verified == true',
  },
  {
    id: 3,
    name: 'Shadow Field Injection (isVerified: true)',
    operation: 'create',
    path: '/customers/cust-1',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidCustomer enforces keys().hasOnly(...) without extra keys',
  },
  {
    id: 4,
    name: 'Identity Spoofing on Order Create',
    operation: 'create',
    path: '/orders/ord-1',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'hasValidAuditCreate checks incoming().ownerId == request.auth.uid',
  },
  {
    id: 5,
    name: 'Path ID Poisoning',
    operation: 'create',
    path: '/customers/invalid..id',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidId requires ^[a-zA-Z0-9_\\-]+$ and length <= 128',
  },
  {
    id: 6,
    name: 'Client Timestamp Forgery',
    operation: 'create',
    path: '/orders/ord-1',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'hasValidAuditCreate enforces serverCreatedAt == request.time',
  },
  {
    id: 7,
    name: 'Immutable OwnerId Mutation',
    operation: 'update',
    path: '/customers/cust-1',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'hasValidAuditUpdate enforces incoming().ownerId == existing().ownerId',
  },
  {
    id: 8,
    name: 'Cross-User PII Read',
    operation: 'get',
    path: '/users/userA/private/info',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'isOwner(userId) || isAdmin()',
  },
  {
    id: 9,
    name: 'Unscoped Collection List by Non-Admin',
    operation: 'list',
    path: '/customers',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'allow list enforces resource.data.ownerId == request.auth.uid',
  },
  {
    id: 10,
    name: 'Oversized String DoS',
    operation: 'create',
    path: '/customers/cust-1',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'isValidCustomer enforces name.size() <= 150 && district.size() <= 150',
  },
  {
    id: 11,
    name: 'Terminal State Tampering on Closed Trip',
    operation: 'update',
    path: '/trips/trip-1',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'existing().status != "closed" unless isAdmin()',
  },
  {
    id: 12,
    name: 'Self-Assigned Driver Approval / Admin Escalation',
    operation: 'update',
    path: '/driverAccounts/drv-1',
    expectedResult: 'PERMISSION_DENIED',
    enforcedByRule: 'non-admin update hasOnly excludes status/approvedAt/approvedBy',
  },
];
