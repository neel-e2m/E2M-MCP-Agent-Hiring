import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { Copy, Plus, CheckCircle2, Ban, Link2, Shield, Zap, Key } from 'lucide-react';
import api from '../lib/api';

interface InviteStats {
  total: number;
  active: number;
  used: number;
  revoked: number;
}

export function Invitations() {
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [roles, setRoles] = useState<any[]>([]);
  const [generatedToken, setGeneratedToken] = useState<string | null>(null);
  const [stats, setStats] = useState<InviteStats | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<any | null>(null);
  const [revokeLoading, setRevokeLoading] = useState(false);
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    role_id: '',
    candidate_email: '',
    candidate_name: '',
    max_uses: 1,
    expires_hours: 48,
  });

  const fetchInvites = async () => {
    try {
      const [invitesRes, statsRes] = await Promise.all([
        api.get('/invites/?include_expired=true'),
        api.get('/invites/stats'),
      ]);
      setInvites(invitesRes.data || []);
      setStats(statsRes.data);
    } catch (error) {
      console.error('Failed to load invites', error);
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [invitesRes, rolesRes, statsRes] = await Promise.all([
          api.get('/invites/?include_expired=true'),
          api.get('/roles/'),
          api.get('/invites/stats'),
        ]);
        setInvites(invitesRes.data || []);
        setRoles(rolesRes.data || []);
        setStats(statsRes.data);
      } catch (error) {
        console.error('Failed to load data', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setGeneratedToken(null);
    try {
      const payload: any = {
        role_id: formData.role_id,
        max_uses: formData.max_uses,
        expires_hours: formData.expires_hours,
      };
      if (formData.candidate_email) payload.candidate_email = formData.candidate_email;
      if (formData.candidate_name) payload.candidate_name = formData.candidate_name;

      const response = await api.post('/invites/', payload);
      const token = response.data.token || response.data.raw_token;
      setGeneratedToken(token);
      toast('Invite token generated successfully!', 'success');
      await fetchInvites();
      setFormData(prev => ({ ...prev, candidate_email: '', candidate_name: '', max_uses: 1, expires_hours: 48 }));
    } catch (error: any) {
      const msg = error?.response?.data?.detail || 'Failed to generate invite';
      toast(msg, 'error');
      console.error('Failed to generate invite', error);
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast('Token copied to clipboard', 'success');
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setRevokeLoading(true);
    try {
      await api.post(`/invites/${revokeTarget.id}/revoke`);
      toast('Invite revoked successfully', 'success');
      await fetchInvites();
    } catch (error: any) {
      const msg = error?.response?.data?.detail || 'Failed to revoke invite';
      toast(msg, 'error');
    } finally {
      setRevokeLoading(false);
      setRevokeTarget(null);
    }
  };

  const statCards = [
    { label: 'Total', value: stats?.total ?? '—', icon: Link2, color: 'var(--info)' },
    { label: 'Active', value: stats?.active ?? '—', icon: Zap, color: 'var(--success)' },
    { label: 'Used', value: stats?.used ?? '—', icon: Shield, color: 'var(--warning)' },
    { label: 'Revoked', value: stats?.revoked ?? '—', icon: Ban, color: 'var(--danger)' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.04em', marginBottom: '4px' }}>Invitations</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Generate and manage MCP access tokens for candidates.</p>
        </div>
        <Button leftIcon={<Plus size={18} />} onClick={() => { setShowForm(!showForm); setGeneratedToken(null); }}>
          {showForm ? 'Cancel' : 'Generate Invite'}
        </Button>
      </div>

      {/* Stats Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {statCards.map((stat, i) => (
          <Card key={i}>
            <CardContent style={{ padding: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 500, marginBottom: '4px' }}>{stat.label}</p>
                <h3 style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {loading ? '...' : stat.value}
                </h3>
              </div>
              <div style={{
                width: 40, height: 40, borderRadius: 10,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: `${stat.color}15`, color: stat.color,
              }}>
                <stat.icon size={20} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {showForm && (
        <Card style={{ border: '1px solid var(--accent-primary)' }}>
          <CardHeader>
            <CardTitle>Generate New Invite</CardTitle>
            <CardDescription>Create an access token for a candidate to apply for a role.</CardDescription>
          </CardHeader>
          <CardContent>
            {generatedToken && (
              <div style={{ marginBottom: '24px', padding: '16px', borderRadius: '8px', backgroundColor: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'rgb(34, 197, 94)', fontWeight: 600 }}>
                  <CheckCircle2 size={20} />
                  <span>Invite Token Generated — Copy it now!</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 500 }}>
                  ⚠ This token will only be shown once. Copy it before closing this form.
                </p>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <code style={{ flex: 1, padding: '12px', borderRadius: '6px', backgroundColor: 'rgba(0,0,0,0.2)', color: 'var(--text-primary)', wordBreak: 'break-all', fontSize: '0.85rem' }}>
                    {generatedToken}
                  </code>
                  <Button variant="secondary" onClick={() => handleCopy(generatedToken)} leftIcon={<Copy size={16} />}>Copy</Button>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Share this token with the candidate. They will use it to connect their MCP client.</p>
              </div>
            )}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>Select Role</label>
                  <select
                    required
                    value={formData.role_id}
                    onChange={e => setFormData({ ...formData, role_id: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: '1px solid var(--glass-border)',
                      backgroundColor: 'rgba(255, 255, 255, 0.05)',
                      color: 'var(--text-primary)',
                      outline: 'none',
                      fontFamily: 'inherit'
                    }}
                  >
                    <option value="" disabled style={{ color: '#000' }}>-- Select a Role --</option>
                    {roles.filter(r => r.is_active).map(r => (
                      <option key={r.id} value={r.id} style={{ color: '#000' }}>{r.title}</option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Candidate Email (Optional)"
                  type="email"
                  value={formData.candidate_email}
                  onChange={e => setFormData({ ...formData, candidate_email: e.target.value })}
                  placeholder="name@example.com"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <Input
                  label="Candidate Name (Optional)"
                  type="text"
                  value={formData.candidate_name}
                  onChange={e => setFormData({ ...formData, candidate_name: e.target.value })}
                  placeholder="John Doe"
                />
                <Input
                  label="Max Uses"
                  type="number"
                  min="1"
                  required
                  value={formData.max_uses}
                  onChange={e => setFormData({ ...formData, max_uses: parseInt(e.target.value) || 1 })}
                />
                <Input
                  label="Expires In (Hours)"
                  type="number"
                  min="1"
                  required
                  value={formData.expires_hours}
                  onChange={e => setFormData({ ...formData, expires_hours: parseInt(e.target.value) || 48 })}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>Close</Button>
                <Button type="submit" isLoading={submitLoading}>{submitLoading ? 'Generating...' : 'Generate Invite'}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent style={{ padding: 0 }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Role</TableHead>
                <TableHead>Candidate</TableHead>
                <TableHead>Uses</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading...
                  </TableCell>
                </TableRow>
              ) : invites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No invitations found. Generate one to start inviting candidates.
                  </TableCell>
                </TableRow>
              ) : (
                invites.map(invite => {
                  const isExpired = new Date(invite.expires_at) < new Date();
                  const isRevoked = invite.is_revoked;
                  const isUsed = invite.use_count >= invite.max_uses;
                  const isActive = !isRevoked && !isExpired && !isUsed;

                  return (
                    <TableRow key={invite.id}>
                      <TableCell style={{ fontWeight: 500 }}>{invite.roles?.title || 'Unknown Role'}</TableCell>
                      <TableCell style={{ color: 'var(--text-secondary)' }}>
                        {invite.candidate_name || invite.candidate_email || '—'}
                      </TableCell>
                      <TableCell style={{ color: 'var(--text-secondary)' }}>
                        {invite.use_count} / {invite.max_uses}
                      </TableCell>
                      <TableCell>
                        {isRevoked ? (
                          <Badge variant="danger">Revoked</Badge>
                        ) : isExpired ? (
                          <Badge variant="warning">Expired</Badge>
                        ) : isUsed ? (
                          <Badge variant="default">Used</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell style={{ color: 'var(--text-secondary)' }}>
                        {new Date(invite.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          {isActive ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setRevokeTarget(invite)}
                              title="Revoke invite"
                            >
                              <Ban size={16} />
                            </Button>
                          ) : (
                            <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                              <Key size={12} />
                              Token shown at creation
                            </span>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Revoke Confirmation Modal */}
      <Modal
        isOpen={!!revokeTarget}
        onClose={() => setRevokeTarget(null)}
        title="Revoke Invite"
        size="sm"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Are you sure you want to revoke the invite for <strong style={{ color: 'var(--text-primary)' }}>{revokeTarget?.roles?.title || 'this role'}</strong>?
            {revokeTarget?.candidate_email && (
              <> (sent to <strong style={{ color: 'var(--text-primary)' }}>{revokeTarget.candidate_email}</strong>)</>
            )}
            <br />This action cannot be undone.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="danger" isLoading={revokeLoading} onClick={handleRevoke}>Revoke</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
