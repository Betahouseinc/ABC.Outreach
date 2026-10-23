import { useState, useEffect } from 'react';
import { api } from '../api';
import { useConfirm } from '../ui';

const REGIONS = [
  ['us-east-1', 'US East (N. Virginia)'], ['us-east-2', 'US East (Ohio)'], ['us-west-2', 'US West (Oregon)'],
  ['ca-central-1', 'Canada (Central)'], ['eu-west-1', 'Europe (Ireland)'], ['eu-west-2', 'Europe (London)'],
  ['eu-central-1', 'Europe (Frankfurt)'], ['eu-north-1', 'Europe (Stockholm)'], ['ap-south-1', 'Asia Pacific (Mumbai)'],
  ['ap-southeast-1', 'Asia Pacific (Singapore)'], ['ap-southeast-2', 'Asia Pacific (Sydney)'], ['ap-northeast-1', 'Asia Pacific (Tokyo)'],
  ['sa-east-1', 'South America (São Paulo)'],
];

const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

// Customer companies connect their own Amazon SES account through a role eXomail can assume.
export default function AwsConnection({ admin, onChange }) {
  const [dialog, confirm] = useConfirm();
  const [a, setA] = useState(null);
  const [region, setRegion] = useState('ap-south-1');
  const [roleArn, setRoleArn] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const show = d => { setA(d); if (d.region) setRegion(d.region); if (d.role_arn) setRoleArn(d.role_arn); };
  useEffect(() => { api('/api/settings/aws').then(r => r.json()).then(d => d.error ? setError(d.error) : show(d)); }, []);

  const connect = async (e) => {
    e?.preventDefault();
    setError(''); setBusy(true);
    const r = await api('/api/settings/aws', json('POST', { role_arn: roleArn, region }));
    const d = await r.json();
    setBusy(false);
    if (!r.ok) { setError(d.error || 'Could not connect'); return; }
    show(d); onChange?.();
  };

  const disconnect = async () => {
    const ok = await confirm({ title: 'Disconnect your SES account?', body: "eXomail stops sending for your company until you connect again. To remove eXomail's access completely, also delete the eXomail-SES stack in AWS CloudFormation.", confirmLabel: 'Disconnect', danger: true });
    if (!ok) return;
    const r = await api('/api/settings/aws', { method: 'DELETE' });
    const d = await r.json();
    if (r.ok) { show(d); setRoleArn(''); onChange?.(); } else setError(d.error);
  };

  if (!a) return null;
  const connected = a.status === 'connected';
  const launchUrl = a.template_url && `https://console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/create/review?templateURL=${encodeURIComponent(a.template_url)}&stackName=${a.stack_name}&param_ExternalId=${a.external_id}`;

  return (
    <div className="card" style={{ marginBottom: 20 }}>
      {dialog}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <h3 style={{ fontSize: 15 }}>Amazon SES account</h3>
        <span className={`badge ${connected ? 'badge-sent' : a.status === 'error' ? 'badge-failed' : 'badge-draft'}`}>{connected ? 'connected' : a.status === 'error' ? 'needs attention' : 'not connected'}</span>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text2)', marginBottom: 16 }}>
        Your emails go out through your own AWS account: your sending reputation, limits and AWS bill stay with you.
        eXomail gets a role that can only send email and read your SES status. You can remove it any time.
      </p>
      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      {!error && a.last_error && <div className="alert alert-danger">{a.last_error}</div>}

      {connected ? (
        <>
          <div className="table-wrap" style={{ marginBottom: 14 }}>
            <table><tbody>
              <tr><td style={{ width: 180, color: 'var(--text2)' }}>Region</td><td>{a.region}</td></tr>
              <tr><td style={{ color: 'var(--text2)' }}>Role</td><td style={{ fontSize: 12, wordBreak: 'break-all' }}>{a.role_arn}</td></tr>
              <tr><td style={{ color: 'var(--text2)' }}>Production access</td><td>{a.production_access ? 'Yes' : 'No: sandbox (can only send to verified addresses)'}</td></tr>
              <tr><td style={{ color: 'var(--text2)' }}>Sending limits</td><td>{a.max_24h_send != null ? `${a.max_24h_send.toLocaleString()} emails a day · ${a.max_send_rate} per second` : '—'}</td></tr>
            </tbody></table>
          </div>
          {!a.production_access && <p className="form-hint" style={{ marginBottom: 14 }}>Request production access in the SES console (Account dashboard → Request production access), then click Check again.</p>}
          {admin && (
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn btn-secondary" onClick={connect} disabled={busy}>{busy ? 'Checking…' : 'Check again'}</button>
              <button className="btn btn-secondary" style={{ color: 'var(--danger)' }} onClick={disconnect}>Disconnect</button>
            </div>
          )}
        </>
      ) : !admin ? (
        <p style={{ fontSize: 13, color: 'var(--text3)' }}>An admin of your company needs to connect your SES account.</p>
      ) : (
        <form onSubmit={connect}>
          <div className="form-group">
            <label htmlFor="aws-region">1. Your SES region</label>
            <select id="aws-region" value={region} onChange={e => setRegion(e.target.value)} style={{ maxWidth: 360 }}>
              {REGIONS.map(([v, l]) => <option key={v} value={v}>{l} · {v}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>2. Give eXomail access in your AWS account</label>
            {launchUrl ? (
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>
                <a className="btn btn-primary btn-sm" href={launchUrl} target="_blank" rel="noopener noreferrer">Launch stack in AWS</a>
                <span style={{ marginLeft: 10 }}>Sign in to AWS, tick the IAM acknowledgement, and click Create stack. It takes about a minute.</span>
              </p>
            ) : (
              <p style={{ fontSize: 13, color: 'var(--text2)' }}>
                Download the <a href="/exomail-ses-setup.yaml" download>eXomail setup template</a>, then in AWS CloudFormation choose Create stack → Upload a template file.
              </p>
            )}
            <p className="form-hint">External ID: <span className="tag" style={{ userSelect: 'all' }}>{a.external_id}</span> {launchUrl ? '(filled in for you)' : '(paste it when CloudFormation asks)'}</p>
          </div>
          <div className="form-group">
            <label htmlFor="aws-role">3. Paste the RoleArn from the stack's Outputs tab</label>
            <input id="aws-role" value={roleArn} onChange={e => setRoleArn(e.target.value)} placeholder="arn:aws:iam::123456789012:role/eXomailSendingRole" />
          </div>
          <button className="btn btn-primary" disabled={busy || !roleArn.trim()}>{busy ? 'Connecting…' : 'Connect'}</button>
        </form>
      )}
    </div>
  );
}
