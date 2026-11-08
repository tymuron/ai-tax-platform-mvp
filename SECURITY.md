# AI Tax v2.0 — Security & Privacy Architecture (`SECURITY.md`)

## 1. Threat Model & Defense-in-Depth Controls
1. **Encryption at Rest (Private File Vault)**:
   - Uploaded documents are never stored in `public/` and have no public URLs.
   - `saveEncryptedFileToVault` (`src/lib/security/vault-and-auth.ts`) encrypts every uploaded file buffer with `AES-256-GCM` (12-byte random IV + 16-byte authentication tag) inside `.data/private_vault/<user_id>/`.
2. **Temporary HMAC-SHA256 Signed Download Links**:
   - Exporting a tax package requires calling `POST /api/export`, which verifies server-side payment entitlement and issues a short-lived (15-minute) `HMAC-SHA256` token bound to `userId`, `resourceId`, `format`, and `expiresAt`.
   - `verifySignedDownloadToken` uses `crypto.timingSafeEqual` and rejects expired tokens or cross-user access attempts (`403 Forbidden`).
3. **PII & Sensitive Identifier Masking (`maskSensitivePII`)**:
   - Before any transaction description is stored for AI display or sent to an external AI provider, `maskSensitivePII` (`src/lib/security/crypto-and-masking.ts`) redacts US SSNs (`[REDACTED-SSN]`), EINs (`[REDACTED-EIN]`), 12–19 digit card/account numbers (`[REDACTED-ACCOUNT]`), routing/account tags (`[REDACTED-BANK-ID]`), emails, and phone numbers.
4. **Tenant Isolation & Server-Side Authorization**:
   - Every database table and API query enforces `WHERE user_id = $authenticatedUserId`.
   - Cross-tenant mutations in `/api/transactions`, `/api/interview`, and `/api/export` are blocked with `403`.
5. **Sanitized Audit Logging**:
   - `writeAuditLog` (`src/lib/db/index.ts`) strips `raw_description`, `account_number`, and `ssn` fields before writing to `audit_logs`.
6. **Server-Verified Stripe Webhooks**:
   - Entitlements (`subscriptions` and `export_purchases`) require HMAC-SHA256 signature verification (`verifyStripeWebhookSignature`) with a 5-minute replay-protection window; client-side state is never trusted.
