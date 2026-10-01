# Pradeep Kirana security-fixed files

These files were hardened against the issues identified in the supplied project code.

## Files
- `AdminDashboard.tsx`: Firebase Google authentication + admin role check; no client-side PIN/session auth; transactional cancellation/stock restoration; validation and CSV escaping hardening.
- `checkout-route.js`: Firebase ID-token authentication, strict input validation, duplicate-item rejection, transactional stock/order creation, transactional Firestore rate limiting, active-order check inside the transaction, coupon validation, server-side totals, generic errors.
- `reviews-route.js`: Firebase ID-token authentication, integer ratings, product validation, one-review-per-user/product transaction, and safe update/delete handlers.
- `firestore.rules`: admin-only privileged writes; users cannot self-promote; order creation/review creation are server-only.

## Important integration notes
1. Replace the corresponding files in the project with these files.
2. The checkout route expects `@/lib/firebaseAdmin` to export `adminAuth` and `adminDb`.
3. The admin dashboard expects `@/lib/firebase` to export `auth`, `googleProvider`, and `db`.
4. The Google account used for the admin dashboard must already have `users/{uid}.role == "admin"`.
5. The customer review UI must call `/api/reviews` for create/update/delete rather than directly writing review documents, because direct customer review writes are intentionally disabled in the rules.
6. Deploy `firestore.rules` only after checking that the application's existing customer profile fields are compatible with the `users` rules.
7. Run the project's own `npm run lint` and `npm run build` after replacing the files.
