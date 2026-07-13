import React, { useEffect, useState, useCallback } from 'react';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { useToast } from '../components/ui/Toast';
import { Mail, Phone } from 'lucide-react';
import api from '../lib/api';
import { CandidateDetailModal } from './Candidates';
import type { Candidate } from './Candidates';

interface Role {
  id: string;
  title: string;
}

export function CandidateKanban() {
  const [roles, setRoles] = useState<Role[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>('');
  
  const [draftCandidates, setDraftCandidates] = useState<Candidate[]>([]);
  const [inProgressCandidates, setInProgressCandidates] = useState<Candidate[]>([]);
  const [completeCandidates, setCompleteCandidates] = useState<Candidate[]>([]);
  
  const [draftPage, setDraftPage] = useState(1);
  const [inProgressPage, setInProgressPage] = useState(1);
  const [completePage, setCompletePage] = useState(1);
  
  const [hasMoreDraft, setHasMoreDraft] = useState(false);
  const [hasMoreInProgress, setHasMoreInProgress] = useState(false);
  const [hasMoreComplete, setHasMoreComplete] = useState(false);

  const [loading, setLoading] = useState(false);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    api.get('/roles/')
       .then(res => {
           setRoles(res.data);
           if (res.data.length > 0) {
               setSelectedRole(res.data[0].id);
           }
       })
       .catch(err => {
           console.error(err);
           toast('Failed to load roles', 'error');
       });
  }, [toast]);

  const fetchColumn = useCallback(async (roleId: string, status: string, page: number, append: boolean) => {
    try {
      const res = await api.get(`/roles/${roleId}/candidates`, {
        params: { page, per_page: 10, status }
      });
      const data = res.data.candidates;
      const total = res.data.total;
      
      const hasMore = (page * 10) < total;

      if (status === 'draft') {
        setDraftCandidates(prev => append ? [...prev, ...data] : data);
        setHasMoreDraft(hasMore);
      } else if (status === 'in_progress') {
        setInProgressCandidates(prev => append ? [...prev, ...data] : data);
        setHasMoreInProgress(hasMore);
      } else if (status === 'complete') {
        setCompleteCandidates(prev => append ? [...prev, ...data] : data);
        setHasMoreComplete(hasMore);
      }
    } catch (err) {
      console.error(err);
      toast(`Failed to load ${status} candidates`, 'error');
    }
  }, [toast]);

  useEffect(() => {
    if (!selectedRole) return;
    setLoading(true);
    setDraftPage(1);
    setInProgressPage(1);
    setCompletePage(1);
    
    Promise.all([
      fetchColumn(selectedRole, 'draft', 1, false),
      fetchColumn(selectedRole, 'in_progress', 1, false),
      fetchColumn(selectedRole, 'complete', 1, false)
    ]).finally(() => setLoading(false));
  }, [selectedRole, fetchColumn]);

  const loadMore = (status: string) => {
    if (!selectedRole) return;
    if (status === 'draft') {
      const nextPage = draftPage + 1;
      setDraftPage(nextPage);
      fetchColumn(selectedRole, 'draft', nextPage, true);
    } else if (status === 'in_progress') {
      const nextPage = inProgressPage + 1;
      setInProgressPage(nextPage);
      fetchColumn(selectedRole, 'in_progress', nextPage, true);
    } else if (status === 'complete') {
      const nextPage = completePage + 1;
      setCompletePage(nextPage);
      fetchColumn(selectedRole, 'complete', nextPage, true);
    }
  };

  const selectStyle: React.CSSProperties = {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    color: 'var(--text)',
    fontSize: '14px',
    outline: 'none',
    minWidth: '250px',
  };

  const CandidateCard = ({ candidate }: { candidate: Candidate }) => (
    <div 
      onClick={() => setSelectedCandidate(candidate)}
      style={{ 
        marginBottom: '12px', 
        padding: '16px', 
        cursor: 'pointer',
        background: 'var(--surface)',
        borderRadius: '8px',
        border: '1px solid var(--border)',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        transition: 'all 0.2s ease',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)';
        e.currentTarget.style.borderColor = 'var(--primary)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'none';
        e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)';
        e.currentTarget.style.borderColor = 'var(--border)';
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>{candidate.name}</h4>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
          <Mail size={14} style={{ color: 'var(--text-muted)' }} /> 
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{candidate.email}</span>
        </div>
        {candidate.phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--text-secondary)' }}>
            <Phone size={14} style={{ color: 'var(--text-muted)' }} /> 
            <span>{candidate.phone}</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
        <div>
          <h1 style={{ margin: '0 0 8px 0', fontSize: '28px', fontWeight: 700, color: 'var(--text)' }}>Candidate Kanban</h1>
          <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '15px' }}>Track candidate progress across stages for a specific role.</p>
        </div>
        <div>
          <label style={{ marginRight: '12px', fontWeight: 500, color: 'var(--text-secondary)', fontSize: '14px' }}>Role Filter</label>
          <select 
            value={selectedRole} 
            onChange={e => setSelectedRole(e.target.value)}
            style={selectStyle}
          >
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.title}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>Loading board...</div>}

      {!loading && (
        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: '20px' }}>
          
          {/* DRAFT COLUMN */}
          <div style={{ flex: 1, minWidth: '320px', background: 'var(--bg-secondary)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--info)' }} />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Draft</h3>
              </div>
              <Badge variant="info">{draftCandidates.length}</Badge>
            </div>
            <div>
              {draftCandidates.length === 0 ? <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', padding: '16px 0' }}>No candidates</p> : 
                draftCandidates.map(c => <CandidateCard key={c.id} candidate={c} />)
              }
            </div>
            {hasMoreDraft && (
              <Button variant="outline" onClick={() => loadMore('draft')} style={{ width: '100%', marginTop: '8px' }}>
                Load More
              </Button>
            )}
          </div>

          {/* IN PROGRESS COLUMN */}
          <div style={{ flex: 1, minWidth: '320px', background: 'var(--bg-secondary)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--warning)' }} />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>In Progress</h3>
              </div>
              <Badge variant="warning">{inProgressCandidates.length}</Badge>
            </div>
            <div>
              {inProgressCandidates.length === 0 ? <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', padding: '16px 0' }}>No candidates</p> : 
                inProgressCandidates.map(c => <CandidateCard key={c.id} candidate={c} />)
              }
            </div>
            {hasMoreInProgress && (
              <Button variant="outline" onClick={() => loadMore('in_progress')} style={{ width: '100%', marginTop: '8px' }}>
                Load More
              </Button>
            )}
          </div>

          {/* COMPLETE COLUMN */}
          <div style={{ flex: 1, minWidth: '320px', background: 'var(--bg-secondary)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px', border: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)' }} />
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>Complete</h3>
              </div>
              <Badge variant="success">{completeCandidates.length}</Badge>
            </div>
            <div>
              {completeCandidates.length === 0 ? <p style={{ color: 'var(--text-secondary)', fontSize: '14px', textAlign: 'center', padding: '16px 0' }}>No candidates</p> : 
                completeCandidates.map(c => <CandidateCard key={c.id} candidate={c} />)
              }
            </div>
            {hasMoreComplete && (
              <Button variant="outline" onClick={() => loadMore('complete')} style={{ width: '100%', marginTop: '8px' }}>
                Load More
              </Button>
            )}
          </div>

        </div>
      )}

      {selectedCandidate && (
        <CandidateDetailModal
          candidate={selectedCandidate}
          isOpen={!!selectedCandidate}
          onClose={() => setSelectedCandidate(null)}
        />
      )}
    </div>
  );
}
