# AI Tax v2.0 — Environment & Secrets Configuration (`ENVIRONMENT.md`)

All secrets are read strictly on the server. Do not prefix sensitive keys with `NEXT_PUBLIC_`.

## Environment Variables (`.env.local`)

```bash
# 1. Database (Optional: defaults to persistent embedded PostgreSQL 16 in .data/pgdata)
DATABASE_URL="postgresql://user:password@localhost:5432/ai_tax"

# 2. Private Vault & Signed URL Secrets (Server-only)
VAULT_ENCRYPTION_KEY="replace-with-32-byte-high-entropy-secret"
FILE_SIGNING_SECRET="replace-with-hmac-sha256-signing-secret"

# 3. AI Provider Configuration (Server-only; falls back to Safe Deterministic Hybrid Mode if omitted)
OPENAI_API_KEY="sk-..."

# 4. Stripe Payments & Webhook Verification (Server-only)
STRIPE_SECRET_KEY="sk_live_or_test_..."
STRIPE_WEBHOOK_SECRET="whsec_..."
```

## Safe Development Mode Behavior
- When `OPENAI_API_KEY` or external `STRIPE_SECRET_KEY` are not set in the local environment, the top status bar transparently reports **`Safe Deterministic Hybrid Mode (PII Masked)`** and **`Embedded PostgreSQL 16`**, while all document parsing, OCR flagging, 4-group classification, AI interview questions, 3-scenario deterministic tax calculations, QA checks, and HMAC-signed webhook verifications remain 100% functional and testable.
