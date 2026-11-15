# Miyahna Cloud Firestore Security Specification

## 1. Data Invariants
1. **Authenticated & Verified Access Only**: Every read, list, create, update, and delete operation requires `request.auth != null && request.auth.token.email_verified == true`.
2. **Ownership & Admin Isolation**: Every operational document stores an immutable `ownerId` matching `request.auth.uid` at creation. Non-admin users can only `get`, `list`, `update`, and `delete` documents where `ownerId == request.auth.uid`. Bootstrapped admin (`salemjalaal1@gmail.com` with verified email) and registered UIDs in `/admins/{uid}` have administrative access.
3. **Strict Path IDs**: All document IDs (`docId`) must match `^[a-zA-Z0-9_\-]+$` and have length `1..128`.
4. **Temporal & Audit Immutability**: `serverCreatedAt` and `serverUpdatedAt` must equal `request.time` on creation; `id`, `ownerId`, and `serverCreatedAt` are strictly immutable on update, and `serverUpdatedAt` must equal `request.time`.
5. **PII Split Collection**: User PII (`email`, `phone`) is isolated in `/users/{userId}/private/{docId}`, readable only by `userId` or admin.
6. **Zero-Trust Validation & Terminal Locking**: Every `create` and `update` invokes its `isValid[Entity]` helper with `keys().hasAll(...)` and `keys().hasOnly(...)` plus strict type and `.size()` limits on all strings and lists. Closed trips, delivered/cancelled orders, and completed directives lock against non-admin mutations.

## 2. The "Dirty Dozen" Adversarial Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated Customer Read**: `GET /customers/cust-1` with `request.auth == null`.
2. **Unverified Admin Email Spoof**: `GET /customers/cust-1` with `email: 'salemjalaal1@gmail.com'` and `email_verified: false`.
3. **Shadow Field Injection on Customer**: `CREATE /customers/cust-1` including `"isVerified": true` or `"isAdmin": true`.
4. **Identity Spoofing on Order**: `CREATE /orders/ord-1` with `ownerId: "victim_uid"` while authenticated as `"attacker_uid"`.
5. **ID Poisoning**: `CREATE /customers/../../etc/passwd` or a 300-character ID.
6. **Timestamp Forgery**: `CREATE /orders/ord-1` with client-supplied `serverCreatedAt` != `request.time`.
7. **Immutable Owner Mutation**: `UPDATE /customers/cust-1` changing `ownerId` from `"userA"` to `"userB"`.
8. **Cross-Tenant PII Read**: `GET /users/userA/private/info` as `"userB"` (non-admin).
9. **Unscoped Collection List**: `LIST /customers` by non-admin `"userB"` without `where('ownerId', '==', 'userB')`.
10. **Oversized String DoS**: `CREATE /customers/cust-1` with 10,000-character `district` or `name`.
11. **Terminal State Tampering**: Non-admin `UPDATE /trips/trip-1` when existing `status == 'closed'`.
12. **Self-Assigned Admin Escalation**: Non-admin `CREATE /admins/attacker_uid` or `UPDATE /users/attacker_uid` changing `role` to `'manager'`.
