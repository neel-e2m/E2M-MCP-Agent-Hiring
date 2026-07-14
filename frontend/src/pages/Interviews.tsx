import { useEffect, useState } from 'react';
import { Card, CardContent } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Modal } from '../components/ui/Modal';
import { Input } from '../components/ui/Input';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { useToast } from '../components/ui/Toast';
import { Calendar, Users, Video, Clock, ChevronLeft, ChevronRight, Trash2, Mail, UserPlus } from 'lucide-react';
import api from '../lib/api';

// --- Types ---
interface Interviewer {
  id: string;
  name: string;
  email: string;
  department?: string;
}

interface Interview {
  id: string;
  application_id: string;
  interviewer_id: string;
  status: string;
  scheduled_at: string;
  meeting_link: string | null;
  notes: string | null;
  applications?: {
    candidate_id: string;
    role_id: string;
    candidates?: { name: string; email: string };
    roles?: { title: string };
  };
  interviewers?: { name: string };
}

// --- Components ---
export function Interviews() {
  const { toast } = useToast();
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [interviewers, setInterviewers] = useState<Interviewer[]>([]);
  const [loading, setLoading] = useState(true);

  // Calendar State
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  
  // Modals
  const [isInterviewerModalOpen, setInterviewerModalOpen] = useState(false);
  const [newInterviewerName, setNewInterviewerName] = useState('');
  const [newInterviewerEmail, setNewInterviewerEmail] = useState('');
  const [addingInterviewer, setAddingInterviewer] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [intRes, ivRes] = await Promise.all([
        api.get('/interviews/'),
        api.get('/interviewers/')
      ]);
      setInterviews(intRes.data || []);
      setInterviewers(ivRes.data || []);
    } catch {
      toast('Failed to load interview data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleAddInterviewer = async () => {
    if (!newInterviewerName || !newInterviewerEmail) {
      toast('Please fill in both name and email', 'warning');
      return;
    }
    setAddingInterviewer(true);
    try {
      await api.post('/interviewers/', {
        name: newInterviewerName,
        email: newInterviewerEmail
      });
      toast('Interviewer added successfully', 'success');
      setNewInterviewerName('');
      setNewInterviewerEmail('');
      fetchData();
    } catch (err: any) {
      toast(err.response?.data?.detail || 'Failed to add interviewer', 'error');
    } finally {
      setAddingInterviewer(false);
    }
  };

  const handleDeleteInterviewer = async (id: string) => {
    if (!window.confirm('Are you sure you want to remove this interviewer?')) return;
    try {
      await api.delete(`/interviewers/${id}`);
      toast('Interviewer removed', 'success');
      fetchData();
    } catch {
      toast('Failed to remove interviewer', 'error');
    }
  };

  // --- Calendar Logic ---
  const generateDays = () => {
    const days = [];
    // Start from 2 days ago, show next 12 days
    const start = new Date(selectedDate);
    start.setDate(selectedDate.getDate() - 2);
    
    for (let i = 0; i < 14; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      days.push(d);
    }
    return days;
  };

  const daysToShow = generateDays();

  // Filter interviews for the selected date
  const selectedDateStr = selectedDate.toDateString();
  const todaysInterviews = interviews.filter(inv => 
    new Date(inv.scheduled_at).toDateString() === selectedDateStr
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease-out' }}>
      
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.04em', marginBottom: '4px' }}>Interviews</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage interviewers and view your scheduled interview calendar.</p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Button variant="outline" leftIcon={<Users size={16} />} onClick={() => setInterviewerModalOpen(true)}>
            Manage Interviewers
          </Button>
        </div>
      </div>

      {/* Calendar Strip */}
      <Card>
        <CardContent style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Calendar</h3>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button 
                onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() - 7); setSelectedDate(d); }}
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--text-primary)' }}
              >
                <ChevronLeft size={16} />
              </button>
              <button 
                onClick={() => setSelectedDate(new Date())}
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px 16px', cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}
              >
                Today
              </button>
              <button 
                onClick={() => { const d = new Date(selectedDate); d.setDate(d.getDate() + 7); setSelectedDate(d); }}
                style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)', borderRadius: '8px', padding: '8px', cursor: 'pointer', color: 'var(--text-primary)' }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '12px', overflowX: 'auto', paddingBottom: '8px', scrollbarWidth: 'none' }}>
            {daysToShow.map((date, idx) => {
              const isSelected = date.toDateString() === selectedDate.toDateString();
              const hasInterviews = interviews.some(i => new Date(i.scheduled_at).toDateString() === date.toDateString());
              const isWeekend = date.getDay() === 0 || date.getDay() === 6;

              return (
                <div 
                  key={idx}
                  onClick={() => setSelectedDate(date)}
                  style={{
                    minWidth: '80px',
                    padding: '12px',
                    borderRadius: 'var(--radius-md)',
                    border: isSelected ? '2px solid var(--accent-primary)' : '1px solid var(--glass-border)',
                    background: isSelected ? 'var(--accent-soft)' : (isWeekend ? 'transparent' : 'var(--bg-tertiary)'),
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s ease',
                    opacity: isWeekend ? 0.6 : 1
                  }}
                >
                  <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', fontWeight: 600, color: isSelected ? 'var(--accent-primary)' : 'var(--text-muted)' }}>
                    {date.toLocaleDateString('en-US', { weekday: 'short' })}
                  </span>
                  <span style={{ fontSize: '1.5rem', fontWeight: 700, color: isSelected ? 'var(--accent-primary)' : 'var(--text-primary)' }}>
                    {date.getDate()}
                  </span>
                  {hasInterviews && (
                    <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-primary)', marginTop: '4px' }} />
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Day Agenda */}
      <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginTop: '8px' }}>
        Agenda for {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </h3>

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)' }}>Loading agenda...</div>
      ) : todaysInterviews.length === 0 ? (
        <Card>
          <CardContent style={{ padding: '60px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Calendar size={48} style={{ opacity: 0.2, margin: '0 auto 16px' }} />
            <p>No interviews scheduled for this date.</p>
          </CardContent>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '20px' }}>
          {todaysInterviews.map(inv => {
            const timeStr = new Date(inv.scheduled_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            return (
              <Card key={inv.id}>
                <CardContent style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-primary)', fontWeight: 600 }}>
                      <Clock size={18} />
                      {timeStr}
                    </div>
                    <Badge variant={inv.status === 'completed' ? 'success' : inv.status === 'cancelled' ? 'default' : 'warning'}>
                      {inv.status}
                    </Badge>
                  </div>

                  <div>
                    <h4 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '4px' }}>
                      {inv.applications?.candidates?.name}
                    </h4>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                      {inv.applications?.roles?.title}
                    </p>
                  </div>

                  <div style={{ borderTop: '1px solid var(--glass-border)' }} />

                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                      <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Users size={14} style={{ color: 'var(--text-muted)' }} />
                        {inv.interviewers?.name || 'Our Team'}
                      </p>
                    </div>
                    {inv.meeting_link && (
                      <a href={inv.meeting_link} target="_blank" rel="noreferrer" style={{ 
                        display: 'inline-flex', alignItems: 'center', gap: '6px', 
                        fontSize: '0.875rem', fontWeight: 600, color: 'var(--accent-primary)', textDecoration: 'none',
                        background: 'var(--accent-soft)', padding: '6px 12px', borderRadius: 'var(--radius-full)'
                      }}>
                        <Video size={14} /> Join
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Manage Interviewers Modal */}
      <Modal isOpen={isInterviewerModalOpen} onClose={() => setInterviewerModalOpen(false)} title="Manage Interviewers" size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)' }}>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <UserPlus size={16} /> Add New Interviewer
            </h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
              <Input label="Full Name" placeholder="e.g. Jane Doe" value={newInterviewerName} onChange={e => setNewInterviewerName(e.target.value)} />
              <Input label="Email Address" type="email" placeholder="jane@company.com" value={newInterviewerEmail} onChange={e => setNewInterviewerEmail(e.target.value)} />
              <Button onClick={handleAddInterviewer} isLoading={addingInterviewer}>Add</Button>
            </div>
          </div>

          <div>
            <h4 style={{ fontSize: '0.9rem', fontWeight: 600, marginBottom: '12px' }}>Current Interviewers</h4>
            <div style={{ border: '1px solid var(--glass-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Department</TableHead>
                    <TableHead style={{ width: '80px' }}></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {interviewers.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '20px' }}>No interviewers configured yet.</TableCell>
                    </TableRow>
                  ) : (
                    interviewers.map(iv => (
                      <TableRow key={iv.id}>
                        <TableCell style={{ fontWeight: 500 }}>{iv.name}</TableCell>
                        <TableCell style={{ color: 'var(--text-secondary)' }}><span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Mail size={12} /> {iv.email}</span></TableCell>
                        <TableCell>{iv.department || '-'}</TableCell>
                        <TableCell>
                          <button onClick={() => handleDeleteInterviewer(iv.id)} style={{ background: 'none', border: 'none', color: 'var(--danger)', cursor: 'pointer', padding: '4px' }}>
                            <Trash2 size={16} />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </div>

        </div>
      </Modal>

    </div>
  );
}
