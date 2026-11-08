# Security (`SECURITY.md`)

## Controls in place

1. **Authentication** — email + password accounts (`/api/auth/signup`, `/api/auth/login`). Passwords hashed with scrypt and a random per-user salt. Session = HMAC-signed, HttpOnly, SameSite=Lax, Secure (in production) cookie, 7 days. **Identity comes only from that cookie**; an `x-user-id` header or a plain cookie naming a user is ignored (`getAuthenticatedUser`).
2. **Admin** — every `/api/admin` call requires `role = 'admin'`. Admin accounts are created only from `ADMIN_EMAIL` + `ADMIN_PASSWORD` (≥12 chars) environment variables — never from source code.
3. **Demo** — "Try a demo" creates a private throw-away account (`users.is_demo`) with labelled sample data. Demo accounts cannot sign in by password.
4. **Tenant isolation** — every query is filtered by the authenticated `user_id`; ownership is re-checked before updates (transactions, questions, ratings). Database-level row-level security is **not** enabled yet (see Open items).
5. **Files** — content is sniffed against the extension (PDF/PNG/JPG/XLSX magic bytes, CSV must be text), max 4 MB, exact duplicate files rejected. Originals are encrypted with AES-256-GCM and stored in the `document_blobs` table; there are no public file URLs.
6. **Downloads** — exports are streamed only through a 15-minute HMAC-signed link bound to the user.
7. **Payments** — entitlements are created only from Stripe webhooks verified by the Stripe SDK (`constructEvent` with `STRIPE_WEBHOOK_SECRET`), idempotent by event id (`stripe_events`). The browser never grants anything.
8. **Secrets** — no constant fallbacks in code. With `DATABASE_URL` set, missing `SESSION_SECRET` / `FILE_SIGNING_SECRET` / `VAULT_ENCRYPTION_KEY` is a hard error. Without it (local dev / temporary demo storage), a random per-process secret is generated.
9. **Logs** — audit metadata strips raw descriptions and identifiers; server errors log only the error type.
10. **PII masking** — `maskSensitivePII` redacts SSN/EIN/card/account/email/phone; no external AI provider is called by this build.
11. **Rate limiting** — sign-up, login and demo creation are rate-limited per IP (in-memory, per instance).

## Open items (must be done before real customer data)

- Persistent PostgreSQL (`DATABASE_URL`) — without it, Vercel data lives in `/tmp` and disappears.
- Enable Postgres row-level security as a second line of defence (policies on `user_id` with a per-request `app.user_id` setting).
- A shared rate limiter / WAF rule (the in-memory one is per serverless instance).
- Password reset and email verification flows.
- Data retention and secure deletion procedure (account deletion endpoint).
- Malware scanning of uploads if files are ever served back to users.
