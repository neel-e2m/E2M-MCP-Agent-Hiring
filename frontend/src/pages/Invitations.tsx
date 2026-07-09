import { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/Table';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Copy, Plus, Send } from 'lucide-react';
import api from '../lib/api';

export function Invitations() {
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchInvites = async () => {
      try {
        const response = await api.get('/invites?include_expired=true');
        setInvites(response.data || []);
      } catch (error) {
        console.error('Failed to load invites', error);
      } finally {
        setLoading(false);
      }
    };
    fetchInvites();
  }, []);

  const handleCopy = (token: string) => {
    navigator.clipboard.writeText(token);
    // Could add a toast notification here
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.04em', marginBottom: '4px' }}>Invitations</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Generate and manage MCP access tokens for candidates.</p>
        </div>
        <Button leftIcon={<Plus size={18} />}>
          Generate Invite
        </Button>
      </div>

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
                  
                  return (
                    <TableRow key={invite.id}>
                      <TableCell style={{ fontWeight: 500 }}>{invite.roles?.title || 'Unknown Role'}</TableCell>
                      <TableCell style={{ color: 'var(--text-secondary)' }}>
                        {invite.use_count} / {invite.max_uses}
                      </TableCell>
                      <TableCell>
                        {isRevoked ? (
                          <Badge variant="danger">Revoked</Badge>
                        ) : isExpired ? (
                          <Badge variant="warning">Expired</Badge>
                        ) : invite.use_count >= invite.max_uses ? (
                          <Badge variant="default">Used</Badge>
                        ) : (
                          <Badge variant="success">Active</Badge>
                        )}
                      </TableCell>
                      <TableCell style={{ color: 'var(--text-secondary)' }}>
                        {new Date(invite.expires_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => handleCopy(invite.token)}
                            disabled={isRevoked || isExpired}
                            title="Copy link"
                          >
                            <Copy size={16} />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            disabled={isRevoked || isExpired}
                            title="Resend email"
                          >
                            <Send size={16} />
                          </Button>
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
    </div>
  );
}
