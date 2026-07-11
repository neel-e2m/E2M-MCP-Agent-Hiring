import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { useToast } from '../components/ui/Toast';
import { Modal } from '../components/ui/Modal';
import { Copy, Plus, CheckCircle2, Ban, Link2, Shield, Zap, Trash2 } from 'lucide-react';
import api from '../lib/api';

interface InviteStats {
  total: number;
  active: number;
  used: number;
  revoked: number;
}

const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
  fontSize: '0.875rem',
};
const optionStyle: React.CSSProperties = { color: '#000' };

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
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const { toast } = useToast();
  const [formData, setFormData] = useState({
    role_id: '',
    unlimited: false,
    max_uses: 1,
    expires_hours: 48,
  });

  const resetForm = () => setFormData({ role_id: '', unlimited: false, max_uses: 1, expires_hours: 48 });

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
        max_uses: formData.unlimited ? -1 : Math.max(1, formData.max_uses),
        expires_hours: formData.expires_hours,
      };
      const response = await api.post('/invites/', payload);
      const token = response.data.token || response.data.raw_token;
      setGeneratedToken(token);
      toast('Invite token generated successfully!', 'success');
      await fetchInvites();
      setFormData(prev => ({ ...prev, unlimited: false, max_uses: 1, expires_hours: 48 }));
    } catch (error: any) {
      const msg = error?.response?.data?.detail || 'Failed to generate invite';
      toast(msg, 'error');
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
      toast(error?.response?.data?.detail || 'Failed to revoke invite', 'error');
    } finally {
      setRevokeLoading(false);
      setRevokeTarget(null);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/invites/${deleteTarget.id}`);
      toast('Invite deleted', 'success');
      await fetchInvites();
    } catch (error: any) {
      toast(error?.response?.data?.detail || 'Failed to delete invite', 'error');
    } finally {
      setDeleteLoading(false);
      setDeleteTarget(null);
    }
  };

  const statCards = [
    { label: 'Total', value: stats?.total ?? '—', icon: Link2 },
    { label: 'Active', value: stats?.active ?? '—', icon: Zap },
    { label: 'Used', value: stats?.used ?? '—', icon: Shield },
    { label: 'Revoked', value: stats?.revoked ?? '—', icon: Ban },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.04em', marginBottom: '4px' }}>Invitations</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Generate and manage MCP access tokens for candidates.</p>
        </div>
        <Button leftIcon={<Plus size={18} />} onClick={() => { setShowForm(!showForm); setGeneratedToken(null); if (showForm) resetForm(); }}>
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
                background: 'var(--accent-soft)', color: 'var(--text-primary)',
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
            <CardDescription>Create an access token for one role. The candidate uses it with their AI agent to apply.</CardDescription>
          </CardHeader>
          <CardContent>
            {generatedToken && (
              <div style={{ marginBottom: '24px', padding: '16px', borderRadius: '8px', backgroundColor: 'var(--success-bg)', border: '1px solid var(--success-border)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--success)', fontWeight: 600 }}>
                  <CheckCircle2 size={20} />
                  <span>Invite Token Generated — Copy it now!</span>
                </div>
                <p style={{ fontSize: '0.8rem', color: 'var(--warning)', fontWeight: 500 }}>
                  ⚠ This token will only be shown once. Copy it before closing this form.
                </p>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <code style={{ flex: 1, padding: '12px', borderRadius: '6px', backgroundColor: 'var(--surface-sunken)', color: 'var(--text-primary)', wordBreak: 'break-all', fontSize: '0.85rem' }}>
                    {generatedToken}
                  </code>
                  <Button variant="secondary" onClick={() => handleCopy(generatedToken)} leftIcon={<Copy size={16} />}>Copy</Button>
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>Share this token with the candidate. They will use it to connect their MCP client.</p>
              </div>
            )}
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Role</label>
                <select
                  required
                  value={formData.role_id}
                  onChange={e => setFormData({ ...formData, role_id: e.target.value })}
                  style={selectStyle}
                >
                  <option value="" disabled style={optionStyle}>-- Select a Role --</option>
                  {roles.filter(r => r.is_active).map(r => (
                    <option key={r.id} value={r.id} style={optionStyle}>{r.title}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: formData.unlimited ? '1fr 1fr' : '1fr 1fr 1fr', gap: '16px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Candidate limit</label>
                  <select
                    value={formData.unlimited ? 'unlimited' : 'limited'}
                    onChange={e => setFormData({ ...formData, unlimited: e.target.value === 'unlimited' })}
                    style={selectStyle}
                  >
                    <option value="limited" style={optionStyle}>Limited number</option>
                    <option value="unlimited" style={optionStyle}>Unlimited candidates</option>
                  </select>
                </div>
                {!formData.unlimited && (
                  <Input
                    label="Max candidates"
                    type="number"
                    min="1"
                    required
                    value={formData.max_uses}
                    onChange={e => setFormData({ ...formData, max_uses: parseInt(e.target.value) || 1 })}
                  />
                )}
                <Input
                  label="Expires in (hours)"
                  type="number"
                  min="1"
                  required
                  value={formData.expires_hours}
                  onChange={e => setFormData({ ...formData, expires_hours: parseInt(e.target.value) || 48 })}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <Button variant="ghost" type="button" onClick={() => { setShowForm(false); resetForm(); }}>Close</Button>
                <Button type="submit" isLoading={submitLoading} disabled={!formData.role_id}>Generate Invite</Button>
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
                <TableHead>Uses</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading...
                  </TableCell>
                </TableRow>
              ) : invites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No invitations found. Generate one to start inviting candidates.
                  </TableCell>
                </TableRow>
              ) : (
                invites.map(invite => {
                  const isExpired = new Date(invite.expires_at) < new Date();
                  const isRevoked = invite.is_revoked;
                  const isUnlimited = invite.max_uses < 0;
                  const isUsed = !isUnlimited && invite.use_count >= invite.max_uses;
                  const isActive = !isRevoked && !isExpired && !isUsed;

                  return (
                    <TableRow key={invite.id}>
                      <TableCell style={{ fontWeight: 500 }}>{invite.roles?.title || 'Unknown Role'}</TableCell>
                      <TableCell style={{ color: 'var(--text-secondary)' }}>
                        {invite.use_count} / {isUnlimited ? '∞' : invite.max_uses}
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
                        {isActive ? (
                          <Button variant="ghost" size="sm" leftIcon={<Ban size={15} />} onClick={() => setRevokeTarget(invite)}>
                            Revoke
                          </Button>
                        ) : (
                          <Button variant="ghost" size="sm" leftIcon={<Trash2 size={15} />} onClick={() => setDeleteTarget(invite)}>
                            Delete
                          </Button>
                        )}
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
      <Modal isOpen={!!revokeTarget} onClose={() => setRevokeTarget(null)} title="Revoke Invite" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Revoke the invite for <strong style={{ color: 'var(--text-primary)' }}>{revokeTarget?.roles?.title || 'this role'}</strong>?
            The token stops working immediately. You can delete it afterwards.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <Button variant="ghost" onClick={() => setRevokeTarget(null)}>Cancel</Button>
            <Button variant="danger" isLoading={revokeLoading} onClick={handleRevoke}>Revoke</Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete Invite" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Permanently delete this invite for <strong style={{ color: 'var(--text-primary)' }}>{deleteTarget?.roles?.title || 'this role'}</strong>?
            Only revoked, expired, or fully-used invites can be deleted.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
            <Button variant="danger" isLoading={deleteLoading} onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
