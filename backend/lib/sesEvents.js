// Applies one SES event (delivered via SNS) to recipients, events and the suppression list.
// https://docs.aws.amazon.com/ses/latest/dg/event-publishing-retrieving-sns-contents.html

// orgIds: the companies this event's SNS topic may affect (['*'] = any). A customer controls their own
// topic and could publish anything to it, so an event only ever touches messages of its own company.
async function handleSesEvent(store, event, { orgIds = ['*'] } = {}) {
  const type = event && (event.eventType || event.notificationType);
  const messageId = event && event.mail && event.mail.messageId;
  if (!type || !messageId) return { ignored: 'not an SES event' };

  const link = await store.findSendEvent(messageId);
  if (!link) return { ignored: `unknown message ${messageId}` };
  if (!orgIds.includes('*') && !orgIds.includes(link.org_id)) return { ignored: `message ${messageId} belongs to another company` };
  const base = { org_id: link.org_id, campaign_id: link.campaign_id, recipient_id: link.recipient_id, message_id: messageId };
  const isRecipient = email => link.recipient_id && email && email.toLowerCase() === (link.email || '').toLowerCase();
  const actions = [];

  if (type === 'Bounce') {
    const b = event.bounce || {};
    const permanent = b.bounceType === 'Permanent';
    for (const r of b.bouncedRecipients || []) {
      const email = (r.emailAddress || '').toLowerCase();
      await store.insertEvent({ ...base, email, type: 'bounce', detail: { bounceType: b.bounceType, bounceSubType: b.bounceSubType, diagnosticCode: r.diagnosticCode || null } });
      if (permanent) {
        await store.addSuppression(link.org_id, email, 'bounce', `${b.bounceType}/${b.bounceSubType}`);
        actions.push(`suppressed ${email}`);
      }
      if (isRecipient(email)) {
        await store.updateRecipient(link.recipient_id, permanent
          ? { status: 'bounced', error_msg: `Bounce: ${b.bounceSubType || b.bounceType}` }
          : { error_msg: `Soft bounce: ${b.bounceSubType || b.bounceType}` });
      }
    }
  } else if (type === 'Complaint') {
    const c = event.complaint || {};
    for (const r of c.complainedRecipients || []) {
      const email = (r.emailAddress || '').toLowerCase();
      await store.insertEvent({ ...base, email, type: 'complaint', detail: { feedbackType: c.complaintFeedbackType || null } });
      await store.addSuppression(link.org_id, email, 'complaint', c.complaintFeedbackType || null);
      actions.push(`suppressed ${email}`);
      if (isRecipient(email)) await store.updateRecipient(link.recipient_id, { status: 'complained' });
    }
  } else if (type === 'Delivery') {
    await store.insertEvent({ ...base, email: link.email, type: 'delivery', detail: { smtpResponse: (event.delivery || {}).smtpResponse || null } });
    if (link.recipient_id) await store.updateRecipientIf(link.recipient_id, ['sent'], { status: 'delivered' });
  } else if (type === 'Reject' || type === 'Rendering Failure') {
    const reason = type === 'Reject' ? (event.reject || {}).reason : (event.failure || {}).errorMessage;
    await store.insertEvent({ ...base, email: link.email, type: type === 'Reject' ? 'reject' : 'rendering_failure', detail: { reason: reason || null } });
    if (link.recipient_id) await store.updateRecipient(link.recipient_id, { status: 'failed', error_msg: `${type}: ${reason || 'unknown'}` });
  } else {
    return { ignored: `event type ${type}` };
  }
  return { type, actions };
}

module.exports = { handleSesEvent };
