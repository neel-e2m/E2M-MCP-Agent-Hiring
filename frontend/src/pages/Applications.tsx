import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Textarea } from '../components/ui/Textarea';
import { Pagination } from '../components/ui/Pagination';
import { useToast } from '../components/ui/Toast';
import { Filter, Sparkles, User, Briefcase, Calendar, Mail, Phone, ExternalLink } from 'lucide-react';
import api from '../lib/api';

/* ─── shared select styling ─── */
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
const optionStyle: React.CSSProperties = { color: '#000' };

/* ─── constants ─── */
const PER_PAGE = 20;
const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'under_review', label: 'Under Review' },
  { value: 'shortlisted', label: 'Shortlisted' },
  { value: 'interviewing', label: 'Interviewing' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

function getStatusBadge(status: string) {
  switch(status) {
    case 'submitted': return <Badge variant="info">Submitted</Badge>;
    case 'under_review': return <Badge variant="warning">Under Review</Badge>;
    case 'shortlisted': return <Badge variant="success">Shortlisted</Badge>;
    case 'interviewing': return <Badge variant="info" style={{ background: '#8b5cf6', color: '#fff' }}>Interviewing</Badge>;
    case 'approved': return <Badge variant="success">Approved</Badge>;
    case 'rejected': return <Badge variant="danger">Rejected</Badge>;
    default: return <Badge>{status}</Badge>;
  }
}

function scoreColor(score: number): { bg: string; text: string } {
  if (score >= 7) return { bg: 'var(--success-bg)', text: 'var(--success)' };
  if (score >= 5) return { bg: 'var(--warning-bg)', text: 'var(--warning)' };
  return { bg: 'var(--danger-bg)', text: 'var(--danger)' };
}

/* ─── main component ─── */
export function Applications() {
  const { toast } = useToast();
  const [applications, setApplications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  /* ── filters & pagination ── */
  const [roles, setRoles] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  /* ── modal state ── */
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [appDetail, setAppDetail] = useState<any | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewForm, setReviewForm] = useState({ status: '', notes: '' });
  const [reviewLoading, setReviewLoading] = useState(false);
  const [aiRecLoading, setAiRecLoading] = useState(false);
  const [aiRecommendation, setAiRecommendation] = useState<string | null>(null);
  const [promptAnswer, setPromptAnswer] = useState<any | null>(null);
  const [candidateFiles, setCandidateFiles] = useState<any[]>([]);
  const [showAllSkills, setShowAllSkills] = useState(false);

  /* ── scheduling state ── */
  const [isScheduleOpen, setIsScheduleOpen] = useState(false);
  const [interviewers, setInterviewers] = useState<any[]>([]);
  const [scheduleForm, setScheduleForm] = useState({ interviewer_id: '', date: '', time: '10:00' });
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState<{subject: string, body: string} | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  /* ── fetch lists ── */
  const fetchRoles = useCallback(async () => {
    try {
      const res = await api.get('/roles/');
      setRoles(res.data || []);
    } catch {
      toast('Failed to load roles', 'error');
    }
  }, [toast]);

  const fetchInterviewers = useCallback(async () => {
    try {
      const res = await api.get('/interviewers/');
      setInterviewers(res.data || []);
    } catch {
      // it's fine if this fails or is empty initially
    }
  }, []);

  const fetchApplications = useCallback(async (p: number, st: string, r: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(p));
      params.set('per_page', String(PER_PAGE));
      if (st) params.set('status', st);
      if (r) params.set('role_id', r);
      
      const res = await api.get(`/applications/?${params.toString()}`);
      setApplications(res.data.applications || []);
      setTotal(res.data.total || 0);
    } catch {
      toast('Failed to load applications', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchRoles(); fetchInterviewers(); }, [fetchRoles, fetchInterviewers]);
  useEffect(() => { fetchApplications(page, statusFilter, roleFilter); }, [page, statusFilter, roleFilter, fetchApplications]);

  const handleFilterChange = (type: 'status' | 'role', val: string) => {
    if (type === 'status') setStatusFilter(val);
    if (type === 'role') setRoleFilter(val);
    setPage(1);
  };

  /* ── detail modal ── */
  const openDetail = async (appId: string) => {
    setSelectedAppId(appId);
    setAppDetail(null);
    setAiRecommendation(null);
    setPromptAnswer(null);
    setCandidateFiles([]);
    setShowAllSkills(false);
    setIsScheduleOpen(false);
    setGeneratedEmail(null);
    setDetailLoading(true);
    try {
      const res = await api.get(`/applications/${appId}`);
      setAppDetail(res.data);
      setReviewForm({
        status: res.data.status,
        notes: res.data.reviewer_notes || ''
      });
      // Surface the candidate's prompt submission for this role from their screening.
      try {
        const scr = await api.get(`/candidates/${res.data.candidate_id}/screening`);
        const session = (scr.data || []).find((s: any) => s.role_id === res.data.role_id);
        const answers = session?.screening_answers || [];
        const prompt =
          answers.find((a: any) => a.evaluation_metadata?.category === 'prompt' && a.answer) ||
          answers.find((a: any) => a.answer) || null;
        setPromptAnswer(prompt);
      } catch { /* screening data is optional */ }
      
      // Surface candidate files (resume)
      try {
        const filesRes = await api.get(`/candidates/${res.data.candidate_id}/files`);
        setCandidateFiles(filesRes.data || []);
      } catch { /* files data is optional */ }
    } catch {
      toast('Failed to load application details', 'error');
      setSelectedAppId(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const closeDetail = () => {
    setSelectedAppId(null);
    setAppDetail(null);
    setPromptAnswer(null);
    setIsScheduleOpen(false);
    setGeneratedEmail(null);
  };

  /* ── actions ── */
  const submitReview = async () => {
    if (!selectedAppId) return;
    setReviewLoading(true);
    try {
      const payload: any = { status: reviewForm.status };
      if (reviewForm.notes.trim()) payload.notes = reviewForm.notes;
      const res = await api.post(`/applications/${selectedAppId}/review`, payload);
      setAppDetail(res.data);
      toast('Review submitted successfully', 'success');
      fetchApplications(page, statusFilter, roleFilter);
    } catch {
      toast('Failed to submit review', 'error');
    } finally {
      setReviewLoading(false);
    }
  };

  const generateRec = async () => {
    if (!selectedAppId) return;
    setAiRecLoading(true);
    try {
      const res = await api.post(`/applications/${selectedAppId}/recommendation`);
      setAiRecommendation(res.data.recommendation);
      toast('AI recommendation generated', 'success');
    } catch {
      toast('Failed to generate AI recommendation', 'error');
    } finally {
      setAiRecLoading(false);
    }
  };

  const handleScheduleInterview = async () => {
    if (!scheduleForm.interviewer_id || !scheduleForm.date || !scheduleForm.time) {
      toast('Please fill in all required scheduling fields', 'warning');
      return;
    }
    
    setScheduleLoading(true);
    try {
      // Create ISO string
      const dtStr = `${scheduleForm.date}T${scheduleForm.time}:00Z`;
      
      const res = await api.post('/interviews/', {
        application_id: selectedAppId,
        interviewer_id: scheduleForm.interviewer_id,
        scheduled_at: dtStr,
        notes: scheduleForm.notes
      });
      
      // Get the email template
      const emailRes = await api.get(`/interviews/${res.data.id}/email_template`);
      setGeneratedEmail(emailRes.data);
      
      toast('Interview scheduled successfully!', 'success');
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to schedule interview', 'error');
    } finally {
      setScheduleLoading(false);
    }
  };

  const renderWithBold = (text: string) => {
    if (!text) return null;
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, index) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={index} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  /* ═════════════════════════════════ RENDER ═════════════════════════════════ */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease-out' }}>
      
      {/* ── Header & Filters ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.04em', marginBottom: '4px' }}>Applications</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Review candidate applications and AI recommendations.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={16} style={{ color: 'var(--text-muted)' }} />
            <select
              value={statusFilter}
              onChange={e => handleFilterChange('status', e.target.value)}
              style={selectStyle}
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value} style={optionStyle}>{opt.label}</option>
              ))}
            </select>
          </div>
          <select
            value={roleFilter}
            onChange={e => handleFilterChange('role', e.target.value)}
            style={selectStyle}
          >
            <option value="" style={optionStyle}>All Roles</option>
            {roles.map(r => (
              <option key={r.id} value={r.id} style={optionStyle}>{r.title}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Table ── */}
      <Card>
        <CardContent style={{ padding: 0 }}>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead style={{ width: '25%' }}>Candidate</TableHead>
                <TableHead style={{ width: '20%' }}>Role</TableHead>
                <TableHead style={{ width: '20%', textAlign: 'center' }}>AI Score</TableHead>
                <TableHead style={{ width: '15%' }}>Status</TableHead>
                <TableHead style={{ width: '15%' }}>Date</TableHead>
                <TableHead style={{ width: '8%', textAlign: 'right' }}></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
                    Loading...
                  </TableCell>
                </TableRow>
              ) : applications.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '40px 0' }}>
                    No applications found.
                  </TableCell>
                </TableRow>
              ) : (
                applications.map(app => {
                  const sc = app.overall_score != null ? scoreColor(app.overall_score) : null;
                  return (
                    <TableRow key={app.id} style={{ cursor: 'pointer' }} onClick={() => openDetail(app.id)}>
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
                            {app.candidates?.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{app.candidates?.name}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>{app.candidates?.email}</div>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell style={{ color: 'var(--text-secondary)' }}>{app.roles?.title}</TableCell>
                      <TableCell style={{ textAlign: 'center' }}>
                        {sc ? (
                          <div style={{ 
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: '32px', height: '32px', borderRadius: '8px',
                            background: sc.bg, color: sc.text, fontWeight: 600
                          }}>
                            {app.overall_score}
                          </div>
                        ) : <span style={{ color: 'var(--text-muted)' }}>-</span>}
                      </TableCell>
                      <TableCell>{getStatusBadge(app.status)}</TableCell>
                      <TableCell style={{ color: 'var(--text-secondary)' }}>
                        {new Date(app.submitted_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell style={{ textAlign: 'right' }}>
                        <span style={{
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
                        }}>
                          Review <ExternalLink size={14} />
                        </span>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      
      {/* ── Pagination ── */}
      {!loading && totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}

      {/* ═══════════════════════ DETAIL MODAL ═══════════════════════ */}
      <Modal 
        isOpen={!!selectedAppId} 
        onClose={closeDetail} 
        title="Application Review" 
        size="xl"
        headerRight={appDetail ? getStatusBadge(appDetail.status) : undefined}
      >
        {detailLoading ? (
          <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>Loading application details...</div>
        ) : appDetail && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
            
            {/* Header Info */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <User size={24} style={{ color: 'var(--accent-primary)' }} />
                  <div>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>{appDetail.candidates?.name}</h2>
                    <span style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>{appDetail.roles?.title}</span>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '16px', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={14} /> {appDetail.candidates?.email}</span>
                  {appDetail.candidates?.phone && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Phone size={14} /> {appDetail.candidates?.phone}</span>
                  )}
                  {appDetail.candidates?.location && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'inherit' }}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                      {appDetail.candidates?.location}
                    </span>
                  )}
                  <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Calendar size={14} /> Applied {new Date(appDetail.submitted_at).toLocaleDateString()}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                {appDetail.overall_score != null && (
                  <div>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>AI Score</span>
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: scoreColor(appDetail.overall_score).bg,
                      color: scoreColor(appDetail.overall_score).text,
                      fontSize: '1.5rem', fontWeight: 700,
                      width: '48px', height: '48px', borderRadius: '12px',
                      marginTop: '4px', marginLeft: 'auto'
                    }}>
                      {appDetail.overall_score}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div style={{ borderTop: '1px solid var(--glass-border)' }} />

            {/* Profile Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '24px' }}>
              <div>
                <h4 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Candidate Summary
                </h4>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.925rem', marginBottom: '24px' }}>
                  {appDetail.candidates?.summary || 'No summary provided.'}
                </p>

                <h4 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Skills
                </h4>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {appDetail.candidates?.skills?.length ? (
                    <>
                      {appDetail.candidates.skills.slice(0, showAllSkills ? undefined : 8).map((skill: string, i: number) => (
                        <Badge key={i} variant="info">{skill}</Badge>
                      ))}
                      {appDetail.candidates.skills.length > 8 && (
                        <button 
                          onClick={() => setShowAllSkills(!showAllSkills)}
                          style={{ 
                            background: 'var(--accent-soft)', border: 'none', padding: '0 10px', 
                            borderRadius: 'var(--radius-sm)',
                            fontSize: '0.75rem', fontWeight: 600, color: 'var(--accent-primary)',
                            cursor: 'pointer', transition: 'background-color 0.2s'
                          }}
                        >
                          {showAllSkills ? 'Show Less' : `+ ${appDetail.candidates.skills.length - 8} More`}
                        </button>
                      )}
                    </>
                  ) : (
                    <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>No skills listed.</span>
                  )}
                </div>
              </div>

              {/* Review Panel */}
              <div style={{
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--glass-border)',
                borderRadius: 'var(--radius-md)',
                padding: '20px',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px'
              }}>
                <h4 style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Briefcase size={16} /> Hiring Decision
                </h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Status</label>
                  <select
                    value={reviewForm.status}
                    onChange={e => setReviewForm({ ...reviewForm, status: e.target.value })}
                    style={selectStyle}
                  >
                    <option value="under_review" style={optionStyle}>Under Review</option>
                    <option value="shortlisted" style={optionStyle}>Shortlist</option>
                    <option value="interviewing" style={optionStyle}>Interviewing</option>
                    <option value="approved" style={optionStyle}>Approve</option>
                    <option value="rejected" style={optionStyle}>Reject</option>
                  </select>
                </div>

                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <Textarea
                    label="Reviewer Notes"
                    placeholder="Private notes about this candidate..."
                    value={reviewForm.notes}
                    onChange={e => setReviewForm({ ...reviewForm, notes: e.target.value })}
                    style={{ flex: 1, minHeight: '130px', resize: 'none' }}
                  />
                </div>

                <Button isLoading={reviewLoading} onClick={submitReview} style={{ width: '100%' }}>
                  Save Review
                </Button>

                {appDetail.status === 'shortlisted' && (
                  <Button variant="outline" onClick={() => setIsScheduleOpen(true)} style={{ width: '100%', marginTop: '8px', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center' }}>
                    <Calendar size={16} /> Schedule Interview
                  </Button>
                )}
              </div>
            </div>

            {/* Schedule Interview Sub-Modal */}
            {isScheduleOpen && (
              <Modal isOpen={isScheduleOpen} onClose={() => setIsScheduleOpen(false)} title="Schedule Interview" size="md">
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {!generatedEmail ? (
                    <>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Interviewer</label>
                        <select
                          value={scheduleForm.interviewer_id}
                          onChange={e => setScheduleForm({ ...scheduleForm, interviewer_id: e.target.value })}
                          style={selectStyle}
                        >
                          <option value="" style={optionStyle}>Select an Interviewer...</option>
                          {interviewers.map(iv => (
                            <option key={iv.id} value={iv.id} style={optionStyle}>{iv.full_name}</option>
                          ))}
                        </select>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Date</label>
                          <input type="date" style={selectStyle} value={scheduleForm.date} onChange={e => setScheduleForm({...scheduleForm, date: e.target.value})} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Time (10am-6pm)</label>
                          <input type="time" style={selectStyle} value={scheduleForm.time} onChange={e => setScheduleForm({...scheduleForm, time: e.target.value})} />
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <Textarea
                          label="Notes"
                          placeholder="Internal notes..."
                          value={scheduleForm.notes}
                          onChange={e => setScheduleForm({ ...scheduleForm, notes: e.target.value })}
                          style={{ resize: 'none' }}
                        />
                      </div>

                      <Button isLoading={scheduleLoading} onClick={handleScheduleInterview} style={{ width: '100%', marginTop: '10px' }}>
                        Confirm & Generate Invite
                      </Button>
                    </>
                  ) : (
                    <div>
                      <div style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '12px', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <Sparkles size={16} /> Interview scheduled successfully!
                      </div>
                      <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '8px' }}>Email Template generated</h4>
                      <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '12px' }}>Copy and paste this to send to the candidate:</p>
                      
                      <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', padding: '16px', fontSize: '0.875rem' }}>
                        <div style={{ marginBottom: '12px', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '12px' }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-secondary)' }}>Subject:</span> {generatedEmail.subject}
                        </div>
                        <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
                          {generatedEmail.body}
                        </div>
                      </div>

                      <Button onClick={() => setIsScheduleOpen(false)} style={{ width: '100%', marginTop: '20px' }}>
                        Done
                      </Button>
                    </div>
                  )}
                </div>
              </Modal>
            )}

            {/* Candidate Files (Full Width) */}
            {candidateFiles.length > 0 && (
              <div>
                <h4 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '12px' }}>
                  Candidate Files
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {candidateFiles.map(file => (
                    <div key={file.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)',
                      background: 'var(--bg-tertiary)'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <span style={{ fontWeight: 500, fontSize: '0.9rem', color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.file_name}
                        </span>
                        <Badge variant="info">{file.file_type}</Badge>
                      </div>
                      {file.url && (
                        <a href={file.url} target="_blank" rel="noopener noreferrer" style={{
                          display: 'inline-flex', alignItems: 'center', gap: '4px',
                          padding: '4px 10px', borderRadius: 'var(--radius-md)', background: 'var(--border-subtle)',
                          color: 'var(--accent-primary)', fontSize: '0.8rem', fontWeight: 500, textDecoration: 'none'
                        }}>
                          <ExternalLink size={14} /> Open
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Auto-status + Eligibility */}
            {(appDetail.metadata?.auto_status_reason || (appDetail.metadata?.eligibility?.checks?.length ?? 0) > 0) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {appDetail.metadata?.auto_status_reason && (
                  <div style={{
                    fontSize: '0.85rem', color: 'var(--text-secondary)', background: 'var(--bg-tertiary)',
                    border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', padding: '10px 14px',
                  }}>
                    {appDetail.metadata.auto_status_reason}
                  </div>
                )}
                {(appDetail.metadata?.eligibility?.checks?.length ?? 0) > 0 && (
                  <div>
                    <h4 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: '10px' }}>Eligibility</h4>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                      {appDetail.metadata.eligibility.checks.map((c: any, i: number) => (
                        <Badge key={i} variant={c.passed ? 'success' : 'danger'}>
                          {String(c.rule).replace(/_/g, ' ')}: {String(c.actual)}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Prompt Submission */}
            {promptAnswer && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                  <h4 style={{ fontSize: '0.8rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)' }}>Screening Prompt Submission</h4>
                  {promptAnswer.evaluation_metadata?.ai_flag && (
                    <Badge variant="warning">Possibly AI-generated</Badge>
                  )}
                  {promptAnswer.score != null && (
                    <span style={{
                      marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      padding: '3px 10px', borderRadius: '8px', fontWeight: 600, fontSize: '0.8rem',
                      background: scoreColor(promptAnswer.score).bg, color: scoreColor(promptAnswer.score).text,
                    }}>
                      {promptAnswer.score}/10
                    </span>
                  )}
                </div>
                {promptAnswer.question && (
                  <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.5 }}>{promptAnswer.question}</p>
                )}
                <div style={{
                  background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)',
                  padding: '14px', fontSize: '0.875rem', color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.6,
                }}>
                  {promptAnswer.answer}
                </div>
                {promptAnswer.ai_feedback && (
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '8px', fontStyle: 'italic', lineHeight: 1.5 }}>
                    Evaluation: {promptAnswer.ai_feedback}
                  </p>
                )}
              </div>
            )}

            {/* AI Recommendation */}
            <div style={{
              background: 'var(--accent-soft)',
              border: '1px solid var(--glass-border)',
              borderRadius: 'var(--radius-lg)',
              padding: '24px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: aiRecommendation ? '16px' : '0' }}>
                <h4 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
                  <Sparkles size={18} /> AI Hiring Recommendation
                </h4>
                {!aiRecommendation && (
                  <Button variant="outline" size="sm" onClick={generateRec} isLoading={aiRecLoading}>
                    Generate Insight
                  </Button>
                )}
              </div>
              {aiRecommendation && (
                <p style={{ color: 'var(--text-primary)', fontSize: '0.925rem', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                  {renderWithBold(aiRecommendation)}
                </p>
              )}
            </div>

          </div>
        )}
      </Modal>
    </div>
  );
}
