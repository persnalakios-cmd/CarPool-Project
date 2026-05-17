# Security Specification for CarPool

## Data Invariants
1. A DriverPost must have a driverId matching the authenticated user.
2. A PassengerRequest must have a passengerId matching the authenticated user.
3. A TrackingSession can only be read/updated by the driverId or passengerId involved in the session.
4. Status transitions must be logical (e.g., from Active to Matched).
5. Identity fields (uid, driverId, passengerId) are immutable.

## The "Dirty Dozen" Payloads (Denial Expected)
1. **Identity Spoofing**: Creating a User profile with a `uid` that doesn't match `request.auth.uid`.
2. **Unauthorized Metadata Update**: Attempting to update `createdAt` on a user profile.
3. **Shadow Field Injection**: Adding an `isAdmin: true` field to a User profile.
4. **Invalid Location**: Posting a ride with `lat: 1000` (out of range).
5. **Orphaned Post**: Creating a DriverPost with a `driverId` that doesn't exist in `users`.
6. **Cross-User Update**: User B trying to update User A's `DriverPost`.
7. **Privilege Escalation**: Passenger trying to update `currentDriverLocation` in a `TrackingSession`.
8. **Invalid Status**: Setting `status` to 'Deleted' (not in enum).
9. **Timestamp Spoofing**: Providing a client-side `createdAt` instead of `request.time`.
10. **Resource Poisoning**: Use a 1MB string for a location `address`.
11. **Session Hijacking**: User C trying to read a `TrackingSession` between User A and User B.
12. **Expired Access**: Updating a `Matched` ride back to `Active`.

## Test Runner (Draft)
A separate `firestore.rules.test.ts` would be used to verify these.
In this environment, I will focus on getting the rules right and verified via ESLint.
