// Central runtime config. Every env var the backend reads lives here.
const crypto = require('crypto');

const DRY_RUN = process.env.EMAIL_DRY_RUN !== 'false'; // safe by default

let appSecret = process.env.APP_SECRET;
if (!appSecret) {
  // Unsubscribe and click links are signed with APP_SECRET, so it must never change once mail has gone out.
  // Without it we use a throwaway secret, which is only acceptable while nothing real is sent.
  appSecret = crypto.randomBytes(32).toString('hex');
  console.warn('[exo-mail] APP_SECRET is not set; using a temporary secret. Real sends are blocked until it is set.');
}

const rate = Number(process.env.SEND_RATE_PER_SEC);

module.exports = {
  port: process.env.PORT || 3001,
  baseUrl: (process.env.BASE_URL || `http://localhost:${process.env.PORT || 3001}`).replace(/\/$/, ''),
  frontendUrls: (process.env.FRONTEND_URL || 'http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean),
  dryRun: DRY_RUN,
  provider: (process.env.EMAIL_PROVIDER || 'ses').toLowerCase(),
  awsRegion: process.env.AWS_REGION || 'ap-southeast-2',
  sesConfigurationSet: process.env.SES_CONFIGURATION_SET || '',
  snsTopicArn: process.env.SNS_TOPIC_ARN || '',
  resendApiKey: process.env.RESEND_API_KEY || '',
  sendRatePerSec: Number.isFinite(rate) && rate > 0 ? rate : 1,
  appSecret,
  appSecretIsSet: !!process.env.APP_SECRET,
  defaultBusinessAddress: process.env.DEFAULT_BUSINESS_ADDRESS || '',
  // Companies allowed to send through this server's own SES account (ours). Empty = no restriction.
  houseOrgIds: (process.env.HOUSE_ORG_IDS || '').split(',').map(s => s.trim()).filter(Boolean),
  // Sender for self-service sign-up confirmations; sign-up is off until it's set.
  signupFromEmail: process.env.SIGNUP_FROM_EMAIL || '',
};
