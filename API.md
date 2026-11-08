# AI Tax v2.0 — API Reference & Contracts (`API.md`)

All endpoints except `/api/auth/*` and the Stripe webhook require the signed session cookie; `401` without it, `403` for a blocked account or a non-admin on `/api/admin`.

## 0. Auth
- `POST /api/auth/signup` `{ email, password (≥10), fullName }` → sets the session cookie.
- `POST /api/auth/login` `{ email, password }` → sets the session cookie (rate-limited).
- `POST /api/auth/logout` → clears it.
- `POST /api/auth/demo` → creates a private demo account with labelled sample data.
- `GET /api/auth/session` → `{ user | null }`.

## 1. `GET /api/workspace?taxYear=2025|2026`
Returns the complete authenticated user workspace state:
- `user`, `profile`, `subscription`
- `documents`, `transactions`, `classifications`
- `questions`, `report`, `calculationRun`
- `exportPurchases`, `ratings`, `serviceConfigStatus`

## 2. `PATCH /api/workspace`
Updates `user_profiles` (filing status, state, dependents, home office sq ft, business mileage, self-employed health insurance, SEP-IRA, estimated tax payments) and triggers a full deterministic recalculation (`recomputeTaxWorkspaceForUser`).

## 3. `POST /api/documents`
`multipart/form-data` (`file`, `taxYear`) or JSON `{ filename: '*.csv', content, taxYear }`.
- Free trial: one document (`402`). Exact duplicate files are rejected.
- Max 4 MB; content must match the extension (PDF/CSV/XLSX/XLS/JPG/PNG).
- Text PDFs are parsed; images go through OCR; files that cannot be read are stored with `status = needs_review` and contribute nothing.

## 4. `PATCH /api/transactions`
Allows the user to override a transaction's `effectiveGroup`, `scheduleCCategory`, `evidenceClassification`, `businessUsePct`, or confirm an uncertain OCR date/amount. Records `is_user_overridden = TRUE`, writes an audit log entry, and recomputes the tax report.

## 5. `POST /api/interview`
Records a user's answer (`100_business`, `partially_business`, `personal_use`, `not_sure`) to an `ai_question`, updates all linked transactions or profile fields, and triggers a full deterministic recalculation.

## 6. `POST /api/stripe`
1. **Webhook** (has `Stripe-Signature`): verified with the Stripe SDK; handles `checkout.session.completed`, `customer.subscription.updated|deleted`, `charge.refunded`. Idempotent by event id.
2. **Signed-in user**: `{ action: 'subscribe_pro' | 'purchase_export_package' | 'cancel_subscription', exportTier?, taxYear }` → `{ checkoutUrl }` (Stripe Checkout). `503 PAYMENTS_NOT_CONFIGURED` when Stripe keys are missing.

## 7. `POST /api/export` & `GET /api/export?token=...`
- `POST /api/export`: Verifies that the user has a webhook-verified `export_purchases` entitlement, then issues a 15-minute HMAC-SHA256 signed download URL.
- `GET /api/export`: Verifies the signed token and streams the generated `PDF`, `CSV`, or `XLSX` tax workpaper package.

## 8. `POST /api/ratings`
Records an optional 1–5 star rating after download without affecting document access.

## 9. `GET /api/admin` & `POST /api/admin`
Admin role only. Users (block/unblock), documents (re-run analysis for the owner), payments (refund = real Stripe refund), rule versions, audit log.
