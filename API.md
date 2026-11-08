# AI Tax v2.0 — API Reference & Contracts (`API.md`)

All endpoints enforce server-side authentication (`getAuthenticatedUser`) and tenant isolation by `user_id`.

## 1. `GET /api/workspace?taxYear=2025|2026`
Returns the complete authenticated user workspace state:
- `user`, `profile`, `subscription`
- `documents`, `transactions`, `classifications`
- `questions`, `report`, `calculationRun`
- `exportPurchases`, `ratings`, `serviceConfigStatus`

## 2. `PATCH /api/workspace`
Updates `user_profiles` (filing status, state, dependents, home office sq ft, business mileage, self-employed health insurance, SEP-IRA, estimated tax payments) and triggers a full deterministic recalculation (`recomputeTaxWorkspaceForUser`).

## 3. `POST /api/documents`
Accepts `multipart/form-data` (`file`, `taxYear`) or JSON document payload.
- Enforces the **Free Trial 1-Document Gate** (`402 Payment Required` if on `free_trial` and `>= 1` document already uploaded).
- Validates file extension (`PDF`, `CSV`, `XLSX`, `JPG`, `PNG`) and size (`<= 15MB`).
- Encrypts the file into `.data/private_vault` using `AES-256-GCM`, extracts and reconciles transactions, and recomputes all tax scenarios.

## 4. `PATCH /api/transactions`
Allows the user to override a transaction's `effectiveGroup`, `scheduleCCategory`, `evidenceClassification`, `businessUsePct`, or confirm an uncertain OCR date/amount. Records `is_user_overridden = TRUE`, writes an audit log entry, and recomputes the tax report.

## 5. `POST /api/interview`
Records a user's answer (`100_business`, `partially_business`, `personal_use`, `not_sure`) to an `ai_question`, updates all linked transactions or profile fields, and triggers a full deterministic recalculation.

## 6. `POST /api/stripe`
Handles both:
1. Raw Stripe webhooks signed with `Stripe-Signature` (`t=...,v1=...`) verified via HMAC-SHA256 (`verifyStripeWebhookSignature`).
2. Server-verified subscription (`$10/mo`) and export package (`$50 / $100 / $200`) entitlement activation.

## 7. `POST /api/export` & `GET /api/export?token=...`
- `POST /api/export`: Verifies that the user has a webhook-verified `export_purchases` entitlement, then issues a 15-minute HMAC-SHA256 signed download URL.
- `GET /api/export`: Verifies the signed token and streams the generated `PDF`, `CSV`, or `XLSX` tax workpaper package.

## 8. `POST /api/ratings`
Records an optional 1–5 star rating after download without affecting document access.

## 9. `GET /api/admin` & `POST /api/admin`
Provides staff telemetry across Users, Documents, Subscriptions/Exports revenue, AI/QA accuracy metrics, Versioned Tax Rules approval, and PII-sanitized Audit Logs.
