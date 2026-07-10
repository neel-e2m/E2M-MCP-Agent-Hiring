import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { Plus, Settings, Power, MessageSquare, Trash2 } from 'lucide-react';
import api from '../lib/api';

/* ─── shared select styling ─── */
const selectStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid var(--glass-border)',
  backgroundColor: 'rgba(255, 255, 255, 0.05)',
  color: 'var(--text-primary)',
  outline: 'none',
  fontFamily: 'inherit',
  fontSize: '0.875rem',
};

const optionStyle: React.CSSProperties = { color: '#000' };

/* ─── types ─── */
interface Role {
  id: string;
  title: string;
  description: string;
  requirements: string[] | null;
  screening_config: any;
  department: string;
  location: string;
  employment_type: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface Question {
  id: string;
  role_id: string;
  question: string;
  category: string;
  difficulty: string;
  order_index: number;
  is_active: boolean;
}

/* ─── constants ─── */
const CATEGORIES = ['general', 'technical', 'behavioral', 'mcp', 'llm'] as const;
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

const difficultyBadgeVariant: Record<string, 'success' | 'warning' | 'danger'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
};

/* ─── component ─── */
export function Roles() {
  const { toast } = useToast();

  /* ── list state ── */
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── create form state ── */
  const [showForm, setShowForm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    requirements: '',
    department: '',
    location: '',
    employment_type: 'full_time',
  });

  /* ── manage modal state ── */
  const [manageRole, setManageRole] = useState<Role | null>(null);
  const [editData, setEditData] = useState({
    title: '',
    description: '',
    requirements: '',
    department: '',
    location: '',
    employment_type: 'full_time',
  });
  const [editLoading, setEditLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);

  /* ── questions state ── */
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ question: '', category: 'general', difficulty: 'medium' });
  const [addQuestionLoading, setAddQuestionLoading] = useState(false);

  /* ═════════════════════════════════ API ═════════════════════════════════ */

  const fetchRoles = useCallback(async () => {
    try {
      const response = await api.get('/roles/', { params: { include_inactive: true } });
      setRoles(response.data || []);
    } catch {
      toast('Failed to load roles', 'error');
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchQuestions = useCallback(async (roleId: string) => {
    setQuestionsLoading(true);
    try {
      const response = await api.get(`/roles/${roleId}/questions`, { params: { active_only: true } });
      setQuestions(response.data || []);
    } catch {
      toast('Failed to load questions', 'error');
    } finally {
      setQuestionsLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchRoles(); }, [fetchRoles]);

  /* ── create ── */
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    try {
      const payload: any = {
        title: formData.title,
        description: formData.description || undefined,
        department: formData.department || undefined,
        location: formData.location || undefined,
        employment_type: formData.employment_type,
      };
      if (formData.requirements.trim()) {
        payload.requirements = formData.requirements.split(',').map((r: string) => r.trim()).filter(Boolean);
      }
      await api.post('/roles/', payload);
      toast('Role created successfully', 'success');
      setShowForm(false);
      setFormData({ title: '', description: '', requirements: '', department: '', location: '', employment_type: 'full_time' });
      await fetchRoles();
    } catch {
      toast('Failed to create role', 'error');
    } finally {
      setSubmitLoading(false);
    }
  };

  /* ── open manage ── */
  const openManage = (role: Role) => {
    setManageRole(role);
    setEditData({
      title: role.title,
      description: role.description || '',
      requirements: (role.requirements || []).join(', '),
      department: role.department || '',
      location: role.location || '',
      employment_type: role.employment_type || 'full_time',
    });
    setNewQuestion({ question: '', category: 'general', difficulty: 'medium' });
    fetchQuestions(role.id);
  };

  const closeManage = () => {
    setManageRole(null);
    setQuestions([]);
  };

  /* ── edit role ── */
  const handleEdit = async () => {
    if (!manageRole) return;
    setEditLoading(true);
    try {
      const payload: any = {
        title: editData.title,
        description: editData.description || undefined,
        department: editData.department || undefined,
        location: editData.location || undefined,
        employment_type: editData.employment_type,
      };
      if (editData.requirements.trim()) {
        payload.requirements = editData.requirements.split(',').map((r: string) => r.trim()).filter(Boolean);
      } else {
        payload.requirements = [];
      }
      const resp = await api.patch(`/roles/${manageRole.id}`, payload);
      setManageRole(resp.data);
      toast('Role updated successfully', 'success');
      await fetchRoles();
    } catch {
      toast('Failed to update role', 'error');
    } finally {
      setEditLoading(false);
    }
  };

  /* ── toggle active ── */
  const handleToggle = async () => {
    if (!manageRole) return;
    setToggleLoading(true);
    try {
      const resp = await api.post(`/roles/${manageRole.id}/toggle`);
      setManageRole(resp.data);
      toast(resp.data.is_active ? 'Role activated' : 'Role deactivated', 'success');
      await fetchRoles();
    } catch {
      toast('Failed to toggle role status', 'error');
    } finally {
      setToggleLoading(false);
    }
  };

  /* ── add question ── */
  const handleAddQuestion = async () => {
    if (!manageRole || !newQuestion.question.trim()) return;
    setAddQuestionLoading(true);
    try {
      await api.post(`/roles/${manageRole.id}/questions`, {
        question: newQuestion.question,
        category: newQuestion.category,
        difficulty: newQuestion.difficulty,
      });
      toast('Question added', 'success');
      setNewQuestion({ question: '', category: 'general', difficulty: 'medium' });
      await fetchQuestions(manageRole.id);
    } catch {
      toast('Failed to add question', 'error');
    } finally {
      setAddQuestionLoading(false);
    }
  };

  /* ── delete question ── */
  const handleDeleteQuestion = async (questionId: string) => {
    if (!manageRole) return;
    try {
      await api.delete(`/roles/questions/${questionId}`);
      toast('Question deleted', 'success');
      await fetchQuestions(manageRole.id);
    } catch {
      toast('Failed to delete question', 'error');
    }
  };

  /* ═════════════════════════════════ RENDER ═════════════════════════════════ */

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', animation: 'fadeIn 0.4s ease-out' }}>
      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '2rem', fontWeight: 700, letterSpacing: '-0.04em', marginBottom: '4px' }}>Roles</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Manage open job positions.</p>
        </div>
        <Button leftIcon={<Plus size={18} />} onClick={() => setShowForm(!showForm)}>
          {showForm ? 'Cancel' : 'Create Role'}
        </Button>
      </div>

      {/* ── Create Form ── */}
      {showForm && (
        <Card style={{ border: '1px solid var(--accent-primary)' }}>
          <CardHeader>
            <CardTitle>Create New Role</CardTitle>
            <CardDescription>Define a new position for the MCP agent to hire for.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Input
                  label="Role Title"
                  required
                  value={formData.title}
                  onChange={e => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g. Senior AI Engineer"
                />
                <Input
                  label="Department"
                  value={formData.department}
                  onChange={e => setFormData({ ...formData, department: e.target.value })}
                  placeholder="e.g. Engineering"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <Input
                  label="Location"
                  value={formData.location}
                  onChange={e => setFormData({ ...formData, location: e.target.value })}
                  placeholder="e.g. Remote, San Francisco"
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Employment Type</label>
                  <select
                    value={formData.employment_type}
                    onChange={e => setFormData({ ...formData, employment_type: e.target.value })}
                    style={selectStyle}
                  >
                    <option value="full_time" style={optionStyle}>Full Time</option>
                    <option value="part_time" style={optionStyle}>Part Time</option>
                    <option value="contract" style={optionStyle}>Contract</option>
                    <option value="intern" style={optionStyle}>Internship</option>
                  </select>
                </div>
              </div>
              <Input
                label="Requirements (comma-separated)"
                value={formData.requirements}
                onChange={e => setFormData({ ...formData, requirements: e.target.value })}
                placeholder="e.g. Python, LLM experience, 3+ years"
              />
              <Textarea
                label="Description"
                required
                value={formData.description}
                onChange={e => setFormData({ ...formData, description: e.target.value })}
                placeholder="Role description..."
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '8px' }}>
                <Button variant="ghost" type="button" onClick={() => setShowForm(false)}>Cancel</Button>
                <Button type="submit" isLoading={submitLoading}>Create Role</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* ── Role Cards ── */}
      {loading ? (
        <div style={{ color: 'var(--text-muted)' }}>Loading...</div>
      ) : roles.length === 0 ? (
        <Card>
          <CardContent style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '200px', color: 'var(--text-secondary)' }}>
            <p style={{ marginBottom: '16px' }}>No roles found.</p>
            <Button variant="outline" leftIcon={<Plus size={16} />} onClick={() => setShowForm(true)}>Create your first role</Button>
          </CardContent>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '24px' }}>
          {roles.map(role => (
            <Card key={role.id} style={{ display: 'flex', flexDirection: 'column', opacity: role.is_active ? 1 : 0.7 }}>
              <CardHeader>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <CardTitle>{role.title}</CardTitle>
                  <Badge variant={role.is_active ? 'success' : 'default'}>
                    {role.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </div>
                <CardDescription>{role.department || 'General'} • {role.location || 'Remote'}</CardDescription>
              </CardHeader>
              <CardContent style={{ flex: 1 }}>
                <p style={{
                  color: 'var(--text-secondary)',
                  fontSize: '0.875rem',
                  display: '-webkit-box',
                  WebkitLineClamp: 3,
                  WebkitBoxOrient: 'vertical',
                  overflow: 'hidden',
                  marginBottom: role.requirements?.length ? '12px' : '0',
                }}>
                  {role.description || 'No description provided.'}
                </p>
                {role.requirements && role.requirements.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {role.requirements.slice(0, 4).map((req, i) => (
                      <Badge key={i} variant="info">{req}</Badge>
                    ))}
                    {role.requirements.length > 4 && (
                      <Badge variant="default">+{role.requirements.length - 4}</Badge>
                    )}
                  </div>
                )}
              </CardContent>
              <div style={{
                padding: '16px 24px',
                borderTop: '1px solid var(--glass-border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  Created {new Date(role.created_at).toLocaleDateString()}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<Settings size={14} />}
                  style={{ color: 'var(--accent-primary)' }}
                  onClick={() => openManage(role)}
                >
                  Manage
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* ═══════════════════════ MANAGE MODAL ═══════════════════════ */}
      <Modal isOpen={!!manageRole} onClose={closeManage} title={`Manage: ${manageRole?.title || ''}`} size="xl">
        {manageRole && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>

            {/* ── Section 1: Edit Role ── */}
            <section>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Settings size={16} /> Edit Role Details
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <Input
                    label="Title"
                    value={editData.title}
                    onChange={e => setEditData({ ...editData, title: e.target.value })}
                  />
                  <Input
                    label="Department"
                    value={editData.department}
                    onChange={e => setEditData({ ...editData, department: e.target.value })}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <Input
                    label="Location"
                    value={editData.location}
                    onChange={e => setEditData({ ...editData, location: e.target.value })}
                  />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Employment Type</label>
                    <select
                      value={editData.employment_type}
                      onChange={e => setEditData({ ...editData, employment_type: e.target.value })}
                      style={selectStyle}
                    >
                      <option value="full_time" style={optionStyle}>Full Time</option>
                      <option value="part_time" style={optionStyle}>Part Time</option>
                      <option value="contract" style={optionStyle}>Contract</option>
                      <option value="intern" style={optionStyle}>Internship</option>
                    </select>
                  </div>
                </div>
                <Input
                  label="Requirements (comma-separated)"
                  value={editData.requirements}
                  onChange={e => setEditData({ ...editData, requirements: e.target.value })}
                  placeholder="e.g. Python, LLM experience"
                />
                <Textarea
                  label="Description"
                  value={editData.description}
                  onChange={e => setEditData({ ...editData, description: e.target.value })}
                  placeholder="Role description..."
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
                  <Button isLoading={editLoading} onClick={handleEdit}>Save Changes</Button>
                </div>
              </div>
            </section>

            {/* ── Divider ── */}
            <div style={{ borderTop: '1px solid var(--glass-border)' }} />

            {/* ── Section 2: Toggle Active ── */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Power size={16} style={{ color: manageRole.is_active ? '#34d399' : 'var(--text-muted)' }} />
                  <div>
                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                      Status: <Badge variant={manageRole.is_active ? 'success' : 'default'}>{manageRole.is_active ? 'Active' : 'Inactive'}</Badge>
                    </p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '2px' }}>
                      {manageRole.is_active ? 'This role is currently accepting applications.' : 'This role is hidden from candidates.'}
                    </p>
                  </div>
                </div>
                <Button
                  variant={manageRole.is_active ? 'danger' : 'primary'}
                  size="sm"
                  isLoading={toggleLoading}
                  onClick={handleToggle}
                >
                  {manageRole.is_active ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </section>

            {/* ── Divider ── */}
            <div style={{ borderTop: '1px solid var(--glass-border)' }} />

            {/* ── Section 3: Screening Questions ── */}
            <section>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MessageSquare size={16} /> Screening Questions
              </h3>

              {/* Question List */}
              {questionsLoading ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading questions...</p>
              ) : questions.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '16px' }}>No screening questions yet. Add one below.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                  {questions.map((q, idx) => (
                    <div
                      key={q.id}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '12px',
                        padding: '12px 14px',
                        borderRadius: 'var(--radius-md)',
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid var(--glass-border)',
                      }}
                    >
                      <span style={{
                        flexShrink: 0,
                        width: '24px',
                        height: '24px',
                        borderRadius: 'var(--radius-full)',
                        background: 'rgba(99, 102, 241, 0.15)',
                        color: 'var(--accent-primary)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '0.75rem',
                        fontWeight: 700,
                      }}>
                        {idx + 1}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem', marginBottom: '6px' }}>{q.question}</p>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <Badge variant="info">{q.category}</Badge>
                          <Badge variant={difficultyBadgeVariant[q.difficulty] || 'default'}>{q.difficulty}</Badge>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteQuestion(q.id)}
                        style={{
                          flexShrink: 0,
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          padding: '4px',
                          borderRadius: 'var(--radius-md)',
                          display: 'flex',
                          transition: 'color 0.2s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#f87171')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                        title="Delete question"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Add Question Form */}
              <div style={{
                padding: '16px',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px dashed var(--glass-border)',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
              }}>
                <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Add New Question</p>
                <Textarea
                  placeholder="Enter your screening question..."
                  value={newQuestion.question}
                  onChange={e => setNewQuestion({ ...newQuestion, question: e.target.value })}
                  style={{ minHeight: '72px' }}
                />
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Category</label>
                    <select
                      value={newQuestion.category}
                      onChange={e => setNewQuestion({ ...newQuestion, category: e.target.value })}
                      style={selectStyle}
                    >
                      {CATEGORIES.map(c => (
                        <option key={c} value={c} style={optionStyle}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Difficulty</label>
                    <select
                      value={newQuestion.difficulty}
                      onChange={e => setNewQuestion({ ...newQuestion, difficulty: e.target.value })}
                      style={selectStyle}
                    >
                      {DIFFICULTIES.map(d => (
                        <option key={d} value={d} style={optionStyle}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>
                      ))}
                    </select>
                  </div>
                  <Button
                    size="sm"
                    leftIcon={<Plus size={14} />}
                    isLoading={addQuestionLoading}
                    onClick={handleAddQuestion}
                    disabled={!newQuestion.question.trim()}
                  >
                    Add
                  </Button>
                </div>
              </div>
            </section>
          </div>
        )}
      </Modal>
    </div>
  );
}
