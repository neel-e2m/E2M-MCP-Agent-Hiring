import { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import api from '../lib/api';

export function Applications() {
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchApps = async () => {
      try {
        const response = await api.get('/applications');
        setApplications(response.data.applications || []);
      } catch (error) {
        console.error('Failed to load applications', error);
      } finally {
        setLoading(false);
      }
    };
    fetchApps();
  }, []);

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'submitted': return <Badge variant="info">Submitted</Badge>;
      case 'under_review': return <Badge variant="warning">Under Review</Badge>;
      case 'shortlisted': return <Badge variant="success">Shortlisted</Badge>;
      case 'approved': return <Badge variant="success">Approved</Badge>;
      case 'rejected': return <Badge variant="danger">Rejected</Badge>;
      default: return <Badge>{status}</Badge>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease-out' }}>
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.04em', marginBottom: '4px' }}>Applications</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Review candidate applications and AI recommendations.</p>
      </div>

      <Card>
        <CardContent style={{ padding: 0 }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>AI Score</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading...
                  </TableCell>
                </TableRow>
              ) : applications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No applications found.
                  </TableCell>
                </TableRow>
              ) : (
                applications.map(app => (
                  <TableRow key={app.id} style={{ cursor: 'pointer' }}>
                    <TableCell>
                      <div style={{ fontWeight: 500 }}>{app.candidates?.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{app.candidates?.email}</div>
                    </TableCell>
                    <TableCell style={{ color: 'var(--text-secondary)' }}>{app.roles?.title}</TableCell>
                    <TableCell>
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'center',
                        width: '32px', 
                        height: '32px', 
                        borderRadius: '8px',
                        background: app.overall_score >= 7 ? 'rgba(16, 185, 129, 0.15)' : 
                                    app.overall_score >= 5 ? 'rgba(245, 158, 11, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                        color: app.overall_score >= 7 ? '#34d399' : 
                               app.overall_score >= 5 ? '#fbbf24' : '#f87171',
                        fontWeight: 600
                      }}>
                        {app.overall_score || '-'}
                      </div>
                    </TableCell>
                    <TableCell>{getStatusBadge(app.status)}</TableCell>
                    <TableCell style={{ color: 'var(--text-secondary)' }}>
                      {new Date(app.submitted_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <span style={{ color: 'var(--accent-primary)', fontSize: '0.875rem', fontWeight: 500 }}>Review</span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
