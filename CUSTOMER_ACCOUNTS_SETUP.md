# Customer accounts and email receipts

Customer sign-in uses Supabase Auth. The Orders Worker verifies Supabase access tokens before linking an order to an account. Receipt email is sent by the existing Cloudflare Worker through Resend after the order is saved.

## Supabase Auth

1. Create a Supabase project. Enable email/password sign-up and email confirmation.
2. Add these redirect URLs in Supabase Auth:
   - `https://ahmed-b-alsharif.github.io/test-dew/account.html`
   - `https://ahmed-b-alsharif.github.io/test-dew/account.html?mode=reset`
3. Set `supabaseUrl` and the project publishable/anon key in `auth-config.js`. That browser key is public by design. Never use a service-role key in the site.
4. Add Worker secrets `SUPABASE_URL` and `SUPABASE_ANON_KEY` with the same project values.

## Email

1. Verify an email-sending domain with Resend and publish its SPF/DKIM DNS records.
2. Set Worker secret `RESEND_API_KEY` and Worker variable `RESEND_FROM`, for example `Dew Skincare <orders@your-verified-domain>`.
3. Configure Supabase Auth custom SMTP to use the verified Resend sender for confirmation and password-reset emails.
4. Deploy the Worker after adding the variables and secrets.

Order receipt email is sent after an order is persisted. If email delivery fails, the order remains saved and the page reports that the receipt could not be emailed. Receipts use an order-specific idempotency key to prevent duplicate messages on retries.

## Customer order history

New orders placed while signed in are linked to the verified Supabase user ID. The customer account API returns only orders linked to that ID and shows order, payment, and fulfillment status. Guest checkout remains available. Earlier orders do not have email/account IDs and will not be exposed or automatically attached to an account.
