# eXoMail v1.1 — production setup

eXoMail sends campaigns through **Amazon SES** (region `ap-southeast-2`, Sydney) from `exommerce.online`,
with bounce/complaint handling over SNS, a suppression list, one-click unsubscribe and a business-address footer.

| Part | Where |
|---|---|
| Backend (Node/Express) | `backend/` → AWS Lightsail `exomail-api`, `https://exomail.exommerce.online` (one instance only) |
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

## 3. Backend server (AWS Lightsail)

One Lightsail instance `exomail-api` (Ubuntu 24.04, `nano_3_2`, ap-southeast-2a) with static IP `exomail-ip`,
ports 22/80/443 open, and DNS `A exomail.exommerce.online → <static IP>`. Node runs the app as the systemd service
`exomail`; Caddy terminates HTTPS (automatic Let's Encrypt) and proxies to 127.0.0.1:3001.

```bash
aws lightsail create-instances --instance-names exomail-api --availability-zone ap-southeast-2a \
  --blueprint-id ubuntu_24_04 --bundle-id nano_3_2 --key-pair-name exomail-key \
  --user-data file://deploy/lightsail-user-data.sh
aws lightsail allocate-static-ip --static-ip-name exomail-ip
aws lightsail attach-static-ip --static-ip-name exomail-ip --instance-name exomail-api
aws lightsail put-instance-public-ports --instance-name exomail-api \
  --port-infos fromPort=22,toPort=22,protocol=tcp fromPort=80,toPort=80,protocol=tcp fromPort=443,toPort=443,protocol=tcp
```

`deploy/lightsail-user-data.sh` installs Node (checksum-verified), Caddy, swap, unattended upgrades, the service and
`/usr/local/bin/exomail-redeploy`. If it didn't run at boot, pipe it to `sudo sh -s` over SSH.

Settings live in `/opt/exomail/.env` (owner `exomail`, mode 600): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`APP_SECRET` (set once, never change — it signs unsubscribe links), `BASE_URL=https://exomail.exommerce.online`,
`FRONTEND_URL` (Vercel URL(s), comma-separated, no trailing slash), `ADMIN_EMAILS`, `EMAIL_PROVIDER=ses`,
`AWS_REGION=ap-southeast-2`, `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (IAM user `exomail-sender`),
`SES_CONFIGURATION_SET=exomail-default`, `SNS_TOPIC_ARN`, `DEFAULT_BUSINESS_ADDRESS`,
`EMAIL_DRY_RUN=true` (until testing is done), `SEND_RATE_PER_SEC=1` (sandbox; raise to ≤ SES max send rate after approval).
After editing it: `sudo systemctl restart exomail`.

```bash
ssh -i ~/.ssh/exomail_lightsail ubuntu@exomail.exommerce.online
sudo exomail-redeploy                    # pull production-ready (or: sudo exomail-redeploy main), npm ci, restart
journalctl -u exomail -f                 # logs
curl https://exomail.exommerce.online/health
aws sns subscribe --topic-arn "$TOPIC" --protocol https --notification-endpoint https://exomail.exommerce.online/webhooks/ses
aws sns list-subscriptions-by-topic --topic-arn "$TOPIC"   # must not say PendingConfirmation
```

Run one instance only (the send loop runs in-process).

The backend confirms the SNS subscription itself and only accepts signed messages from `SNS_TOPIC_ARN`.

## 4. Frontend (Vercel)

Env: `VITE_API_URL=https://exomail.exommerce.online`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

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
