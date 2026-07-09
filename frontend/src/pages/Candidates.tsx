import { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Search } from 'lucide-react';
import api from '../lib/api';

export function Candidates() {
  const [candidates, setCandidates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    const fetchCandidates = async () => {
      try {
        const response = await api.get(`/candidates?search=${search}`);
        setCandidates(response.data.candidates || []);
      } catch (error) {
        console.error('Failed to load candidates', error);
      } finally {
        setLoading(false);
      }
    };
    
    // Simple debounce
    const timer = setTimeout(() => {
      fetchCandidates();
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease-out' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.04em', marginBottom: '4px' }}>Candidates</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage and view all applicant profiles.</p>
        </div>
        <div style={{ width: '300px' }}>
          <Input 
            placeholder="Search candidates..." 
            leftIcon={<Search size={18} />} 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      <Card>
        <CardContent style={{ padding: 0 }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Applied Date</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    Loading...
                  </TableCell>
                </TableRow>
              ) : candidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                    No candidates found.
                  </TableCell>
                </TableRow>
              ) : (
                candidates.map(candidate => (
                  <TableRow key={candidate.id} style={{ cursor: 'pointer' }}>
                    <TableCell style={{ fontWeight: 500 }}>{candidate.name}</TableCell>
                    <TableCell style={{ color: 'var(--text-secondary)' }}>{candidate.email}</TableCell>
                    <TableCell>
                      <Badge variant={candidate.profile_status === 'complete' ? 'success' : 'warning'}>
                        {candidate.profile_status}
                      </Badge>
                    </TableCell>
                    <TableCell style={{ color: 'var(--text-secondary)' }}>
                      {new Date(candidate.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <span style={{ color: 'var(--accent-primary)', fontSize: '0.875rem', fontWeight: 500 }}>View Profile</span>
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
