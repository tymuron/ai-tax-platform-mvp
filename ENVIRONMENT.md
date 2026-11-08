# Environment (`ENVIRONMENT.md`)

All values are server-only. Never prefix them with `NEXT_PUBLIC_`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | **Yes for real use** | PostgreSQL connection string (Supabase, Neon, etc.). Without it the app uses embedded PGlite: a local file in dev, `/tmp` on Vercel (temporary — the UI shows a warning banner). |
| `DATABASE_SSL` | No | Set to `disable` for a local Postgres without TLS. |
| `SESSION_SECRET` | Yes with `DATABASE_URL` | ≥32 random characters; signs session cookies. |
| `FILE_SIGNING_SECRET` | Yes with `DATABASE_URL` | ≥32 random characters; signs download links. |
| `VAULT_ENCRYPTION_KEY` | Yes with `DATABASE_URL` | ≥32 random characters; encrypts uploaded files. **Losing it makes stored files unreadable.** |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | To use the admin console | Creates/updates the admin account at start-up. Password ≥12 characters. |
| `STRIPE_SECRET_KEY` | For payments | `sk_test_…` or `sk_live_…`. |
| `STRIPE_WEBHOOK_SECRET` | For payments | `whsec_…` of the webhook endpoint `https://<domain>/api/stripe` with events `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`, `charge.refunded`. |
| `STRIPE_PRICE_PRO_MONTHLY` | No | Use an existing $10/month Price; otherwise the price is created inline. |

Generate secrets with:

```bash
openssl rand -hex 32
```

## Behaviour when something is not configured

- **Stripe missing** → payment buttons return "Payments not configured"; nothing is unlocked.
- **`DATABASE_URL` missing on Vercel** → works as a preview only; data and sessions disappear when the instance restarts.
- **OCR** uses `tesseract.js` (downloads its English model at first use). Scanned PDFs are not read; users are asked for CSV/XLSX or photos.
- **No external AI model** is called by this build; classification is rule-based and asks the user whenever it is unsure.
