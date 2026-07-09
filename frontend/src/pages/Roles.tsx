import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Plus } from 'lucide-react';
import api from '../lib/api';

export function Roles() {
  const [roles, setRoles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRoles = async () => {
      try {
        const response = await api.get('/roles');
        setRoles(response.data || []);
      } catch (error) {
        console.error('Failed to load roles', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRoles();
  }, []);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.04em', marginBottom: '4px' }}>Roles</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage open job positions.</p>
        </div>
        <Button leftIcon={<Plus size={18} />}>
          Create Role
        </Button>
      </div>

      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
      ) : roles.length === 0 ? (
        <Card>
          <CardContent style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: '16px' }}>No roles found.</p>
            <Button variant="outline" leftIcon={<Plus size={16} />}>Create your first role</Button>
          </CardContent>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {roles.map(role => (
            <Card key={role.id} style={{ display: 'flex', flexDirection: 'column' }}>
              <CardHeader>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <CardTitle>{role.title}</CardTitle>
                  <Badge variant={role.is_active ? 'success' : 'default'}>
                    {role.is_active ? 'Active' : 'Draft'}
                  </Badge>
                </div>
                <CardDescription>{role.department || 'General'} • {role.location || 'Remote'}</CardDescription>
              </CardHeader>
              <CardContent style={{ flex: 1 }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                  {role.description || 'No description provided.'}
                </p>
              </CardContent>
              <div style={{ padding: '16px 24px', borderTop: '1px solid var(--glass-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Created {new Date(role.created_at).toLocaleDateString()}
                </span>
                <Button variant="ghost" size="sm" style={{ color: 'var(--accent-primary)' }}>Manage</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
