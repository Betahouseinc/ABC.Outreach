# eXoMail v1.1 — production setup

eXoMail sends campaigns through **Amazon SES** (region `ap-southeast-2`, Sydney) from `exommerce.online`,
with bounce/complaint handling over SNS, a suppression list, one-click unsubscribe and a business-address footer.

| Part | Where |
|---|---|
| Backend (Node/Express) | `backend/` → Railway service (Dockerfile), **one** replica only |
| Frontend (Vite/React) | `frontend/` → Vercel (`exommerce-outreach`) |
| Database | Supabase project Exommerce.online (`uwisuxbmckvcriutxerv`) |
| Email | Amazon SES, account in `ap-southeast-2`, configuration set `exomail-default` |

## 1. Database

Run `supabase/migrations/005_production_ready.sql` in Supabase → SQL Editor. It is idempotent.
Then check RLS (every row must be `true`):

```sql
SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public'
  AND tablename IN ('organizations','profiles','campaigns','recipients','templates','suppressions','events','sender_domains')
  ORDER BY tablename;
```

## 2. Amazon SES (AWS CLI, profile `exomail`)

```bash
export AWS_PROFILE=exomail AWS_REGION=ap-southeast-2
aws sesv2 create-email-identity --email-identity exommerce.online --dkim-signing-attributes NextSigningKeyLength=RSA_2048_BIT
aws sesv2 put-email-identity-mail-from-attributes --email-identity exommerce.online \
  --mail-from-domain bounce.exommerce.online --behavior-on-mx-failure USE_DEFAULT_VALUE
```

DNS at Namecheap (never change the root MX, SPF or DMARC):

| Type | Host | Value |
|---|---|---|
| CNAME ×3 | `<token>._domainkey` | `<token>.dkim.amazonses.com` (tokens: `aws sesv2 get-email-identity --email-identity exommerce.online`) |
| MX | `bounce` | `feedback-smtp.ap-southeast-2.amazonses.com` (priority 10) |
| TXT | `bounce` | `v=spf1 include:amazonses.com ~all` |

Events → SNS → backend:

```bash
TOPIC=$(aws sns create-topic --name exomail-ses-events --query TopicArn --output text)
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws sns set-topic-attributes --topic-arn "$TOPIC" --attribute-name Policy --attribute-value "{
  \"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"ses.amazonaws.com\"},
  \"Action\":\"sns:Publish\",\"Resource\":\"$TOPIC\",\"Condition\":{\"StringEquals\":{\"AWS:SourceAccount\":\"$ACCOUNT\"}}}]}"
aws sesv2 create-configuration-set --configuration-set-name exomail-default
aws sesv2 create-configuration-set-event-destination --configuration-set-name exomail-default \
  --event-destination-name to-sns --event-destination "{\"Enabled\":true,
  \"MatchingEventTypes\":[\"BOUNCE\",\"COMPLAINT\",\"DELIVERY\",\"REJECT\",\"RENDERING_FAILURE\"],
  \"SnsDestination\":{\"TopicArn\":\"$TOPIC\"}}"
```

IAM user for the backend — send-only:

```json
{ "Version": "2012-10-17", "Statement": [{ "Effect": "Allow",
  "Action": ["ses:SendEmail", "ses:SendRawEmail", "ses:GetEmailIdentity"], "Resource": "*" }] }
```

### Production access request (use case)

Submit with `aws sesv2 put-account-details --production-access-enabled --mail-type MARKETING --website-url https://exommerce.online --contact-language EN --additional-contact-email-addresses hello@exommerce.online --use-case-description "<paragraph>"`.

> **Check the second sentence before submitting** — it must describe how your list is really collected.

> eXommerce (exommerce.online) uses SES to send occasional marketing and announcement emails (newsletters, service updates, event invitations) from addresses on exommerce.online, through our own campaign tool, eXoMail. Recipients are people who have given us their email address and agreed to hear from us, for example through our website contact form, consultations or events; we do not buy, rent or scrape lists. Every email includes our postal address and a one-click unsubscribe link (List-Unsubscribe and List-Unsubscribe-Post headers); unsubscribes are honoured immediately. SES bounce and complaint notifications are delivered to our application through SNS: hard bounces and complaints are added automatically to a suppression list that is checked before every send, and suppressed addresses are never mailed again. Sending is rate-limited, and new campaigns are test-sent to internal addresses before going out. We expect to start at a few hundred emails per month and grow gradually.

## 3. Backend variables (Railway)

Required: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `APP_SECRET` (set once, never change — it signs unsubscribe links),
`FRONTEND_URL` (Vercel URL(s), comma-separated, no trailing slash), `BASE_URL` (the Railway service URL),
`ADMIN_EMAILS`, `EMAIL_PROVIDER=ses`, `AWS_REGION=ap-southeast-2`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`,
`SES_CONFIGURATION_SET=exomail-default`, `SNS_TOPIC_ARN`, `DEFAULT_BUSINESS_ADDRESS`,
`EMAIL_DRY_RUN=true` (until testing is done), `SEND_RATE_PER_SEC=1` (sandbox; raise to ≤ SES max send rate after approval).

```bash
cd backend && railway up --detach        # Railway builds the Dockerfile and sets PORT
railway domain                           # public URL → use it as BASE_URL
curl https://<railway-domain>/health
aws sns subscribe --topic-arn "$TOPIC" --protocol https --notification-endpoint https://<railway-domain>/webhooks/ses
aws sns list-subscriptions-by-topic --topic-arn "$TOPIC"   # must not say PendingConfirmation
```

Keep the service at one replica (the send loop runs in-process), and on a paid plan: the trial's credit runs out
after 30 days and a stopped backend breaks unsubscribe links and bounce handling.

The backend confirms the SNS subscription itself and only accepts signed messages from `SNS_TOPIC_ARN`.

## 4. Frontend (Vercel)

Env: `VITE_API_URL=https://<railway-domain>`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

## 5. Smoke test

1. Settings → business address. Sending domains → add `exommerce.online` → Verify (needs SES DKIM + MAIL FROM = SUCCESS).
2. New campaign from `news@exommerce.online`; upload a CSV of verified inboxes; **Test run** (works in dry run).
3. Set `EMAIL_DRY_RUN=false`. **Send test** to the verified inboxes: check inbox vs spam, merge tags, unsubscribe.
4. Send test to `bounce@simulator.amazonses.com` → it appears in Settings → Suppression list (proves the webhook).

## How sending works

* **Send** refuses while `EMAIL_DRY_RUN` is on, and when: no business address, From domain not verified, merge tags with no value, or `APP_SECRET` unset.
* Recipients are processed in id order at `SEND_RATE_PER_SEC`; suppressed addresses are skipped. Throttling is retried;
  quota / credential / paused-account errors **pause** the campaign (Resume sends only what's left).
* Merge tags: `{{name}}`, `{{first_name}}`, `{{email}}`, `{{unsubscribe_url}}`, `{{year}}`, `{{company_name}}`, `{{business_address}}`, plus any CSV column.
* Public routes: `/track/*` (open pixel, signed click redirects), `/u/:token` (unsubscribe), `/webhooks/ses` (SNS).
* Tests: `cd backend && npm test`.
