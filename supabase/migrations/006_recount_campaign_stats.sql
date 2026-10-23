-- 006: recompute campaign counters from recipient statuses.
-- Campaigns sent before v1.1 kept sent_count values that the old send loop inflated
-- (recipients it skipped were still counted). Idempotent: safe to re-run at any time.
UPDATE campaigns c SET
  sent_count = s.sent,
  failed_count = s.failed
FROM (
  SELECT campaign_id,
    count(*) FILTER (WHERE status IN ('sent', 'delivered', 'bounced', 'complained')) AS sent,
    count(*) FILTER (WHERE status = 'failed') AS failed
  FROM recipients
  GROUP BY campaign_id
) s
WHERE s.campaign_id = c.id
  AND (c.sent_count IS DISTINCT FROM s.sent OR c.failed_count IS DISTINCT FROM s.failed);
