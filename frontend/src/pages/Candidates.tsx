import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Modal } from '../components/ui/Modal';
import { Tabs } from '../components/ui/Tabs';
import { Pagination } from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import {
  Search, User, ClipboardCheck, FileText, Clock,
  Mail, Phone, Briefcase, GraduationCap, Download,
  Filter, ExternalLink
} from 'lucide-react';
import api from '../lib/api';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Candidate {
  id: string;
  name: string;
  email: string;
  phone?: string;
  summary?: string;
  skills?: string[];
  experience?: {
    company?: string;
    title?: string;
    start_date?: string;
    end_date?: string;
    description?: string;
  }[];
  education?: {
    institution?: string;
    degree?: string;
    field?: string;
    year?: string | number;
  }[];
  profile_status: string;
  created_at: string;
  updated_at?: string;
}

interface CandidateFile {
  id: string;
  candidate_id: string;
  file_type: string;
  file_name: string;
  file_size: number;
  storage_path: string;
  url: string;
}

interface AuditEntry {
  id: string;
  type?: string;
  action?: string;
  details?: string;
  message?: string;
  timestamp?: string;
  created_at?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const PER_PAGE = 20;

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'draft', label: 'Draft' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'complete', label: 'Complete' },
];

const MODAL_TABS = [
  { id: 'profile', label: 'Profile', icon: <User size={16} /> },
  { id: 'screening', label: 'Screening', icon: <ClipboardCheck size={16} /> },
  { id: 'files', label: 'Files', icon: <FileText size={16} /> },
  { id: 'activity', label: 'Activity', icon: <Clock size={16} /> },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatusBadgeVariant(status: string): 'success' | 'warning' | 'info' | 'default' {
  switch (status) {
    case 'complete': return 'success';
    case 'in_progress': return 'warning';
    case 'draft': return 'info';
    default: return 'default';
  }
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatStatusText(status: string): string {
  if (status === 'in_progress') return 'In Progress';
  if (!status) return '';
  return status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
}

function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function scoreColor(score: number): { bg: string; text: string } {
  if (score >= 7) return { bg: 'var(--success-bg)', text: 'var(--success)' };
  if (score >= 5) return { bg: 'var(--warning-bg)', text: 'var(--warning)' };
  return { bg: 'var(--bg-tertiary)', text: 'var(--text-secondary)' };
}

// ─── Inline Style Definitions ─────────────────────────────────────────────────

const selectStyle: React.CSSProperties = {
  padding: '9px 14px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--glass-border)',
  backgroundColor: 'var(--bg-secondary)',
  color: 'var(--text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
  fontSize: '0.875rem',
  cursor: 'pointer',
  minWidth: '160px',
};

// ─── Candidate Detail Modal Sub-Components ────────────────────────────────────

function ProfileTab({ candidate }: { candidate: Candidate }) {
  const skills = candidate.skills ?? [];
  const experience = candidate.experience ?? [];
  const education = candidate.education ?? [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>


      {/* Summary */}
      {candidate.summary && (
        <section>
          <h4 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '10px' }}>Summary</h4>
          <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.925rem' }}>
            {candidate.summary}
          </p>
        </section>
      )}

      {/* Skills */}
      {skills.length > 0 && (
        <section>
          <h4 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '10px' }}>Skills</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
            {skills.map((skill, i) => (
              <Badge key={i} variant="info">{skill}</Badge>
            ))}
          </div>
        </section>
      )}

      {/* Experience */}
      {experience.length > 0 && (
        <section>
          <h4 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '12px' }}>Experience</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {experience.map((exp, i) => (
              <div key={i} style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--glass-border)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <Briefcase size={15} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{exp.title || 'Untitled Role'}</span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginLeft: '25px' }}>
                  {exp.company && <span>{exp.company}</span>}
                  {(exp.start_date || exp.end_date) && (
                    <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>
                      · {exp.start_date || '?'} — {exp.end_date || 'Present'}
                    </span>
                  )}
                </div>
                {exp.description && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginTop: '8px', marginLeft: '25px', lineHeight: 1.6 }}>
                    {exp.description}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Education */}
      {education.length > 0 && (
        <section>
          <h4 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '12px' }}>Education</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {education.map((edu, i) => (
              <div key={i} style={{
                padding: '14px 16px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--glass-border)',
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
              }}>
                <GraduationCap size={15} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {edu.degree}{edu.field ? ` in ${edu.field}` : ''}
                  </span>
                  <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
                    {edu.institution}{edu.year ? ` · ${edu.year}` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}



      {/* Empty state */}
      {!candidate.summary && skills.length === 0 && experience.length === 0 && education.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
          <User size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
          <p>No profile details available yet.</p>
        </div>
      )}
    </div>
  );
}

function ScreeningTab({ candidateId }: { candidateId: string }) {
  const { toast } = useToast();
  const [sessions, setSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/candidates/${candidateId}/screening`);
        if (!cancelled) setSessions(res.data || []);
      } catch {
        if (!cancelled) toast('Failed to load screening data', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [candidateId, toast]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Loading screening data…</div>;
  }

  if (sessions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
        <ClipboardCheck size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
        <p>No screening sessions found.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {sessions.map(session => {
        const answers = session.screening_answers ?? [];
        const sc = session.score != null ? scoreColor(session.score) : null;

        return (
          <div key={session.id} style={{
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--glass-border)',
            background: 'var(--bg-tertiary)',
            overflow: 'hidden',
          }}>
            {/* Session header */}
            <div
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '16px',
                background: 'none',
                border: 'none',
                color: 'var(--text-primary)',
                fontFamily: 'inherit',
                textAlign: 'left',
              }}
            >
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                <Badge variant={session.status === 'completed' ? 'success' : session.status === 'in_progress' ? 'warning' : 'default'}>
                  {session.status}
                </Badge>
                {sc && (
                  <div style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '34px',
                    height: '26px',
                    borderRadius: '6px',
                    background: sc.bg,
                    color: sc.text,
                    fontWeight: 600,
                    fontSize: '0.85rem',
                  }}>
                    {session.score}
                  </div>
                )}
                <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  {session.total_questions} question{session.total_questions !== 1 ? 's' : ''}
                </span>
              </div>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                {(session as any).started_at || session.created_at ? formatDate((session as any).started_at || session.created_at) : 'N/A'}
              </span>
            </div>

            {/* Answers (Always Expanded) */}
            {answers.length > 0 && (
              <div style={{
                borderTop: '1px solid var(--glass-border)',
                padding: '16px',
                display: 'flex',
                flexDirection: 'column',
                gap: '14px',
              }}>
                {answers
                  .sort((a: any, b: any) => a.question_number - b.question_number)
                  .map((ans: any, idx: number) => {
                    const asc = scoreColor(ans.score);
                    return (
                      <div key={idx} style={{
                        padding: '14px',
                        borderRadius: 'var(--radius-md)',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border-subtle)',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>
                            Q{ans.question_number}. {ans.question}
                          </span>
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            minWidth: '30px',
                            height: '24px',
                            borderRadius: '6px',
                            background: asc.bg,
                            color: asc.text,
                            fontWeight: 600,
                            fontSize: '0.8rem',
                            flexShrink: 0,
                            marginLeft: '12px',
                          }}>
                            {ans.score}/10
                          </div>
                        </div>
                        <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6, margin: '0 0 6px 0' }}>
                          <strong style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Answer:</strong> {ans.answer}
                        </p>
                        {ans.feedback && (
                          <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>
                            Feedback: {ans.feedback}
                          </p>
                        )}
                      </div>
                    );
                  })}
              </div>
            )}
            {answers.length === 0 && (
              <div style={{ borderTop: '1px solid var(--glass-border)', padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                No answers recorded for this session.
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FilesTab({ candidateId }: { candidateId: string }) {
  const { toast } = useToast();
  const [files, setFiles] = useState<CandidateFile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/candidates/${candidateId}/files`);
        if (!cancelled) setFiles(res.data || []);
      } catch {
        if (!cancelled) toast('Failed to load files', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [candidateId, toast]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Loading files…</div>;
  }

  if (files.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
        <FileText size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
        <p>No files uploaded.</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {files.map(file => {
        const isPdf = /\.pdf$/i.test(file.file_name || '') || file.file_type === 'resume';
        return (
          <div key={file.id} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '14px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--glass-border)',
              background: 'var(--bg-tertiary)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
                <FileText size={18} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 500, color: 'var(--text-primary)', fontSize: '0.925rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {file.file_name}
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', display: 'flex', gap: '8px' }}>
                    <span>{file.file_type}</span>
                    <span>·</span>
                    <span>{formatFileSize(file.file_size)}</span>
                  </div>
                </div>
              </div>
              {file.url && (
                <a
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '6px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid var(--glass-border)',
                    background: 'var(--border-subtle)',
                    color: 'var(--accent-primary)',
                    fontSize: '0.8rem',
                    fontWeight: 500,
                    textDecoration: 'none',
                    whiteSpace: 'nowrap',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <Download size={14} />
                  Open
                </a>
              )}
            </div>
            {isPdf && file.url && (
              <iframe
                title={file.file_name}
                src={file.url}
                style={{
                  width: '100%',
                  height: '520px',
                  border: '1px solid var(--glass-border)',
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--bg-secondary)',
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function ActivityTab({ candidateId }: { candidateId: string }) {
  const { toast } = useToast();
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const fetch = async () => {
      try {
        setLoading(true);
        const res = await api.get(`/candidates/${candidateId}/audit`);
        if (!cancelled) setEntries(res.data || []);
      } catch {
        if (!cancelled) toast('Failed to load activity', 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetch();
    return () => { cancelled = true; };
  }, [candidateId, toast]);

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>Loading activity…</div>;
  }

  if (entries.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
        <Clock size={32} style={{ marginBottom: '12px', opacity: 0.4 }} />
        <p>No activity recorded.</p>
      </div>
    );
  }

  // Sort newest first
  const sorted = [...entries].sort((a, b) => {
    const dateA = new Date(a.timestamp || a.created_at || 0).getTime();
    const dateB = new Date(b.timestamp || b.created_at || 0).getTime();
    return dateB - dateA;
  });

  return (
    <div style={{ position: 'relative', paddingLeft: '24px' }}>
      {/* Timeline line */}
      <div style={{
        position: 'absolute',
        left: '7px',
        top: '6px',
        bottom: '6px',
        width: '2px',
        background: 'var(--glass-border)',
        borderRadius: '1px',
      }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {sorted.map(entry => {
          const ts = entry.timestamp || entry.created_at;
          const actionLabel = entry.action || entry.type || (entry as any).tool_name || 'System Event';
          let detailText = entry.details || entry.message || '';
          
          if (!detailText && (entry as any).request_payload) {
            try {
              detailText = JSON.stringify((entry as any).request_payload).substring(0, 100) + '...';
            } catch {
              detailText = 'Payload provided';
            }
          }

          return (
            <div key={entry.id} style={{ position: 'relative' }}>
              {/* Timeline dot */}
              <div style={{
                position: 'absolute',
                left: '-20px',
                top: '6px',
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: 'var(--accent-primary)',
                border: '2px solid var(--bg-secondary)',
              }} />

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-primary)' }}>
                    {actionLabel}
                  </span>
                  {ts && (
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {formatDateTime(ts)}
                    </span>
                  )}
                </div>
                {detailText && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, margin: 0 }}>
                    {detailText}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Candidate Detail Modal ───────────────────────────────────────────────────

export function CandidateDetailModal({
  candidate,
  isOpen,
  onClose,
}: {
  candidate: Candidate | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'profile' | 'screening' | 'files' | 'activity'>('profile');

  // Reset to profile tab when opening a new candidate
  useEffect(() => {
    if (isOpen) setActiveTab('profile');
  }, [isOpen, candidate?.id]);

  if (!candidate) return null;

  const titleNode = (
    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
      <span>{candidate.name}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.9rem', fontWeight: 500, color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Mail size={15} style={{ color: 'var(--text-secondary)' }} />
          {candidate.email}
        </div>
        {candidate.phone && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Phone size={15} style={{ color: 'var(--text-secondary)' }} />
            {candidate.phone}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <Modal isOpen={!!candidate} onClose={onClose} title={titleNode} size="xl">
      <Tabs tabs={MODAL_TABS} activeTab={activeTab} onChange={(id) => setActiveTab(id as any)} />
      <div style={{ marginTop: '20px' }}>
        {activeTab === 'profile' && <ProfileTab candidate={candidate} />}
        {activeTab === 'screening' && <ScreeningTab candidateId={candidate.id} />}
        {activeTab === 'files' && <FilesTab candidateId={candidate.id} />}
        {activeTab === 'activity' && <ActivityTab candidateId={candidate.id} />}
      </div>
    </Modal>
  );
}

// ─── Main Candidates Page ─────────────────────────────────────────────────────

export function Candidates() {
  const { toast } = useToast();
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Fetch candidates list
  const fetchCandidates = useCallback(async (searchTerm: string, status: string, currentPage: number) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('page', String(currentPage));
      params.set('per_page', String(PER_PAGE));
      if (searchTerm) params.set('search', searchTerm);
      if (status) params.set('status', status);

      const res = await api.get(`/candidates/?${params.toString()}`);
      setCandidates(res.data.candidates || []);
      setTotal(res.data.total || 0);
    } catch {
      toast('Failed to load candidates', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  // Debounced search effect
  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCandidates(search, statusFilter, page);
    }, 300);
    return () => clearTimeout(timer);
  }, [search, statusFilter, page, fetchCandidates]);

  // Reset to page 1 on search or filter change
  const handleSearchChange = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    setPage(1);
  };

  // Open detail modal
  const openCandidateDetail = async (candidate: Candidate) => {
    try {
      // Fetch full candidate record for the modal
      const res = await api.get(`/candidates/${candidate.id}`);
      setSelectedCandidate(res.data);
    } catch {
      // Fallback to list data
      setSelectedCandidate(candidate);
    }
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setSelectedCandidate(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease-out' }}>
      {/* Page Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.04em', marginBottom: '4px' }}>Candidates</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Manage and view all applicant profiles.
            {!loading && <span style={{ color: 'var(--text-muted)', marginLeft: '8px' }}>({total} total)</span>}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Status filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={16} style={{ color: 'var(--text-muted)' }} />
            <select
              value={statusFilter}
              onChange={e => handleStatusChange(e.target.value)}
              style={selectStyle}
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} style={{ color: '#000' }}>{opt.label}</option>
              ))}
            </select>
          </div>
          {/* Search */}
          <div style={{ width: '260px' }}>
            <Input
              placeholder="Search candidates..."
              leftIcon={<Search size={18} />}
              value={search}
              onChange={e => handleSearchChange(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent style={{ padding: 0 }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: '20%' }}>Candidate</TableHead>
                <TableHead style={{ width: '24%' }}>Email</TableHead>
                <TableHead style={{ width: '14%' }}>Phone</TableHead>
                <TableHead style={{ width: '12%' }}>Status</TableHead>
                <TableHead style={{ width: '12%' }}>Registered</TableHead>
                <TableHead style={{ width: '14%', textAlign: 'right' }}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={5} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
                    Loading…
                  </TableCell>
                </TableRow>
              ) : candidates.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
                    No candidates found.
                  </TableCell>
                </TableRow>
              ) : (
                candidates.map(candidate => (
                  <TableRow
                    key={candidate.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => openCandidateDetail(candidate)}
                  >
                    <TableCell>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div style={{
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'var(--accent-soft)',
                          color: 'var(--accent-primary)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                          flexShrink: 0
                        }}>
                          {candidate.name.charAt(0).toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{candidate.name}</span>
                      </div>
                    </TableCell>
                    <TableCell style={{ color: 'var(--text-secondary)' }}>{candidate.email}</TableCell>
                    <TableCell style={{ color: 'var(--text-secondary)' }}>{candidate.phone || '-'}</TableCell>
                    <TableCell>
                      <Badge variant={getStatusBadgeVariant(candidate.profile_status)}>
                        {formatStatusText(candidate.profile_status)}
                      </Badge>
                    </TableCell>
                    <TableCell style={{ color: 'var(--text-secondary)' }}>
                      {formatDate(candidate.created_at)}
                    </TableCell>
                    <TableCell style={{ textAlign: 'right' }}>
                      <span
                        style={{
                          color: 'var(--accent-primary)',
                          fontSize: '0.875rem',
                          fontWeight: 600,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '6px',
                          background: 'var(--accent-soft)',
                          padding: '6px 12px',
                          borderRadius: 'var(--radius-md)',
                          transition: 'background-color 0.2s ease',
                        }}
                      >
                        View Profile
                        <ExternalLink size={14} />
                      </span>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Pagination */}
      {!loading && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* Candidate Detail Modal */}
      <CandidateDetailModal
        candidate={selectedCandidate}
        isOpen={modalOpen}
        onClose={closeModal}
      />
    </div>
  );
}
