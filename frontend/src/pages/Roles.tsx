import { useEffect, useState, useCallback } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { Input } from '../components/ui/Input';
import { Textarea } from '../components/ui/Textarea';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/Toast';
import { Plus, Settings, Power, MessageSquare, Trash2, ShieldCheck, Target, AlertTriangle } from 'lucide-react';
import api from '../lib/api';

/* ─── shared select styling ─── */
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

const EDUCATION_OPTIONS = [
  { value: 'any', label: 'Any' },
  { value: 'high_school', label: 'High School' },
  { value: 'associate', label: 'Associate' },
  { value: 'bachelor', label: "Bachelor's" },
  { value: 'master', label: "Master's" },
  { value: 'phd', label: 'PhD' },
] as const;

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
  faqs?: { question: string; answer: string }[];
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

/* Flat form shape shared by create + edit (basic fields + screening_config fields) */
interface RoleForm {
  title: string;
  description: string;
  requirements: string;
  department: string;
  location: string;
  employment_type: string;
  min_experience_years: string;
  min_education: string;
  required_skills: string;
  custom_rules: string;
  auto_shortlist_enabled: boolean;
  shortlist_threshold: string;
  faqs: { question: string; answer: string }[];
}

const EMPTY_FORM: RoleForm = {
  title: '', description: '', requirements: '', department: '', location: '', employment_type: 'full_time',
  min_experience_years: '', min_education: 'any', required_skills: '', custom_rules: '',
  auto_shortlist_enabled: false, shortlist_threshold: '7', faqs: []
};

/* ─── constants ─── */
const CATEGORIES = ['general', 'technical', 'behavioral', 'mcp', 'llm', 'custom'] as const;
const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

const difficultyBadgeVariant: Record<string, 'success' | 'warning' | 'danger'> = {
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
};

/* Build the screening_config payload from the flat form */
function buildScreeningConfig(f: RoleForm): any {
  const rules: any = {};
  const exp = parseFloat(f.min_experience_years);
  if (!isNaN(exp) && exp > 0) rules.min_experience_years = exp;
  if (f.min_education && f.min_education !== 'any') rules.min_education = f.min_education;
  const skills = f.required_skills.split(',').map(s => s.trim()).filter(Boolean);
  if (skills.length) rules.required_skills = skills;
  if (f.custom_rules.trim()) rules.custom_rules = f.custom_rules.trim();

  const config: any = {
    eligibility_rules: rules,
    scoring: {
      auto_shortlist_enabled: f.auto_shortlist_enabled,
      shortlist_threshold: parseFloat(f.shortlist_threshold) || 7,
    },
  };
  return config;
}

/* Parse an existing role.screening_config back into the flat form */
function configToForm(sc: any): Partial<RoleForm> {
  const rules = sc?.eligibility_rules || {};
  const scoring = sc?.scoring || {};
  return {
    min_experience_years: rules.min_experience_years != null ? String(rules.min_experience_years) : '',
    min_education: rules.min_education || 'any',
    required_skills: Array.isArray(rules.required_skills) ? rules.required_skills.join(', ') : '',
    custom_rules: rules.custom_rules || '',
    auto_shortlist_enabled: scoring.auto_shortlist_enabled ?? false,
    shortlist_threshold: scoring.shortlist_threshold != null ? String(scoring.shortlist_threshold) : '7',
  };
}

/* ─── Toggle switch ─── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      style={{
        width: '44px', height: '26px', borderRadius: '999px', border: 'none', cursor: 'pointer',
        padding: '3px', display: 'flex', alignItems: 'center',
        justifyContent: checked ? 'flex-end' : 'flex-start',
        background: checked ? 'var(--accent-primary)' : 'var(--border)',
        transition: 'background 0.2s ease',
      }}
    >
      <span style={{ width: '20px', height: '20px', borderRadius: '50%', background: '#fff', boxShadow: 'var(--shadow-xs)' }} />
    </button>
  );
}

/* ─── component ─── */
export function Roles() {
  const { toast } = useToast();

  /* ── list state ── */
  const [roles, setRoles] = useState<Role[]>([]);
  const [loading, setLoading] = useState(true);

  /* ── create form state ── */
  const [showForm, setShowForm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [formData, setFormData] = useState<RoleForm>(EMPTY_FORM);
  const [createQuestions, setCreateQuestions] = useState<any[]>([]);
  const [newCreateQuestion, setNewCreateQuestion] = useState({ question: '', category: 'general', customCategory: '', difficulty: 'medium' });
  const [showCreateCustomRule, setShowCreateCustomRule] = useState(false);

  /* ── manage modal state ── */
  const [manageRole, setManageRole] = useState<Role | null>(null);
  const [editData, setEditData] = useState<RoleForm>(EMPTY_FORM);
  const [editLoading, setEditLoading] = useState(false);
  const [toggleLoading, setToggleLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showManageCustomRule, setShowManageCustomRule] = useState(false);

  /* ── questions state ── */
  const [questions, setQuestions] = useState<Question[]>([]);
  const [questionsLoading, setQuestionsLoading] = useState(false);
  const [newQuestion, setNewQuestion] = useState({ question: '', category: 'general', customCategory: '', difficulty: 'medium' });
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
        screening_config: buildScreeningConfig(formData),
        faqs: formData.faqs,
      };
      if (formData.requirements.trim()) {
        payload.requirements = formData.requirements.split(',').map((r: string) => r.trim()).filter(Boolean);
      }
      
      const roleResp = await api.post('/roles/', payload);
      const newRole = roleResp.data;

      // Create questions if any
      if (createQuestions.length > 0) {
        for (const q of createQuestions) {
          await api.post(`/roles/${newRole.id}/questions`, q);
        }
      }

      toast('Role created successfully', 'success');
      setShowForm(false);
      setFormData(EMPTY_FORM);
      setCreateQuestions([]);
      await fetchRoles();
    } catch {
      toast('Failed to create role', 'error');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleAddCreateQuestion = () => {
    if (!newCreateQuestion.question.trim()) return;
    const finalCategory = newCreateQuestion.category === 'custom' ? (newCreateQuestion.customCategory.trim() || 'custom') : newCreateQuestion.category;
    setCreateQuestions([...createQuestions, { ...newCreateQuestion, category: finalCategory, id: Date.now().toString() }]);
    setNewCreateQuestion({ question: '', category: 'general', customCategory: '', difficulty: 'medium' });
  };

  const handleRemoveCreateQuestion = (id: string) => {
    setCreateQuestions(createQuestions.filter(q => q.id !== id));
  };

  /* ── open manage ── */
  const openManage = (role: Role) => {
    setManageRole(role);
    setDeleteConfirm(false);
    setEditData({
      ...EMPTY_FORM,
      title: role.title,
      description: role.description || '',
      requirements: (role.requirements || []).join(', '),
      department: role.department || '',
      location: role.location || '',
      employment_type: role.employment_type || 'full_time',
      faqs: role.faqs || [],
      ...configToForm(role.screening_config),
    });
    const parsedConfig = configToForm(role.screening_config);
    setShowManageCustomRule(!!parsedConfig.custom_rules);
    setNewQuestion({ question: '', category: 'general', customCategory: '', difficulty: 'medium' });
    fetchQuestions(role.id);
  };

  const closeManage = () => {
    setManageRole(null);
    setQuestions([]);
    setDeleteConfirm(false);
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
        screening_config: buildScreeningConfig(editData),
        faqs: editData.faqs,
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
      await fetchQuestions(manageRole.id);
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

  /* ── delete role ── */
  const handleDelete = async () => {
    if (!manageRole) return;
    setDeleteLoading(true);
    try {
      await api.delete(`/roles/${manageRole.id}`);
      toast('Role deleted', 'success');
      setDeleteConfirm(false);
      closeManage();
      await fetchRoles();
    } catch (err: any) {
      const msg = err?.response?.data?.detail || 'Failed to delete role';
      toast(msg, 'error');
      setDeleteConfirm(false);
    } finally {
      setDeleteLoading(false);
    }
  };

  /* ── add question ── */
  const handleAddQuestion = async () => {
    if (!manageRole || !newQuestion.question.trim()) return;
    setAddQuestionLoading(true);
    try {
      const finalCategory = newQuestion.category === 'custom' ? (newQuestion.customCategory.trim() || 'custom') : newQuestion.category;
      await api.post(`/roles/${manageRole.id}/questions`, {
        question: newQuestion.question,
        category: finalCategory,
        difficulty: newQuestion.difficulty,
      });
      toast('Question added', 'success');
      setNewQuestion({ question: '', category: 'general', customCategory: '', difficulty: 'medium' });
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
                <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                  <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Employment Type</label>
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

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <ShieldCheck size={16} /> Eligibility Rules
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    Checked automatically after the candidate submits their resume. Candidates who fail cannot be screened.
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <Input
                      label="Min. experience (years)"
                      type="number" min="0" step="0.5"
                      value={formData.min_experience_years}
                      onChange={e => setFormData({ ...formData, min_experience_years: e.target.value })}
                      placeholder="e.g. 1"
                    />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                      <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Min. education</label>
                      <select value={formData.min_education} onChange={e => setFormData({ ...formData, min_education: e.target.value })} style={selectStyle}>
                        {EDUCATION_OPTIONS.map(o => <option key={o.value} value={o.value} style={optionStyle}>{o.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{ marginTop: '14px' }}>
                    <Input
                      label="Required skills (comma-separated)"
                      value={formData.required_skills}
                      onChange={e => setFormData({ ...formData, required_skills: e.target.value })}
                      placeholder="e.g. Python, LLMs, Prompt Engineering"
                    />
                  </div>
                  {(showCreateCustomRule || formData.custom_rules) ? (
                    <div style={{ marginTop: '14px' }}>
                      <Input
                        label="Custom eligibility rules"
                        value={formData.custom_rules}
                        onChange={e => setFormData({ ...formData, custom_rules: e.target.value })}
                        placeholder="e.g. Must be located in Ahmedabad"
                      />
                    </div>
                  ) : (
                    <Button variant="ghost" size="sm" type="button" onClick={() => setShowCreateCustomRule(true)} style={{ marginTop: '14px', color: 'var(--accent-primary)' }}>
                      + Custom rule
                    </Button>
                  )}
                </div>

                <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <MessageSquare size={16} /> Screening Questions
                  </div>
                  {createQuestions.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                      {createQuestions.map((q, idx) => (
                        <div key={q.id} style={{
                          display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px',
                          borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)',
                        }}>
                          <span style={{
                            flexShrink: 0, width: '24px', height: '24px', borderRadius: 'var(--radius-full)',
                            background: 'var(--accent-soft)', color: 'var(--accent-primary)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700,
                          }}>
                            {idx + 1}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem', marginBottom: '6px' }}>{q.question}</p>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <Badge variant={q.category === 'prompt' ? 'success' : 'info'}>{q.category}</Badge>
                              <Badge variant={difficultyBadgeVariant[q.difficulty] || 'default'}>{q.difficulty}</Badge>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveCreateQuestion(q.id)}
                            style={{
                              flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-muted)',
                              cursor: 'pointer', padding: '4px', borderRadius: 'var(--radius-md)', display: 'flex', transition: 'color 0.2s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{
                    padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)',
                    border: '1px dashed var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '12px',
                  }}>
                    <p style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Add New Question</p>
                    <Textarea
                      placeholder="Enter your screening question..."
                      value={newCreateQuestion.question}
                      onChange={e => setNewCreateQuestion({ ...newCreateQuestion, question: e.target.value })}
                      style={{ minHeight: '72px' }}
                    />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr auto', gap: '12px', alignItems: 'end' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Category</label>
                        <div style={{ display: 'flex', gap: '8px' }}>
                          <select value={newCreateQuestion.category} onChange={e => setNewCreateQuestion({ ...newCreateQuestion, category: e.target.value })} style={{...selectStyle, width: newCreateQuestion.category === 'custom' ? '110px' : '100%'}}>
                            {CATEGORIES.map(c => <option key={c} value={c} style={optionStyle}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                          </select>
                          {newCreateQuestion.category === 'custom' && (
                            <input
                              type="text"
                              placeholder="New Category..."
                              value={newCreateQuestion.customCategory}
                              onChange={e => setNewCreateQuestion({ ...newCreateQuestion, customCategory: e.target.value })}
                              style={{ ...selectStyle, flex: 1 }}
                            />
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Difficulty</label>
                        <select value={newCreateQuestion.difficulty} onChange={e => setNewCreateQuestion({ ...newCreateQuestion, difficulty: e.target.value })} style={selectStyle}>
                          {DIFFICULTIES.map(d => <option key={d} value={d} style={optionStyle}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                        </select>
                      </div>
                      <Button type="button" size="sm" leftIcon={<Plus size={14} />} onClick={handleAddCreateQuestion} disabled={!newCreateQuestion.question.trim()}>
                        Add
                      </Button>
                    </div>
                  </div>
                </div>

                <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Target size={16} /> Auto-Shortlisting
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                    <div>
                      <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>Auto shortlist / reject on score</p>
                      <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                        {formData.auto_shortlist_enabled
                          ? 'Applications at or above the threshold are shortlisted; below are rejected.'
                          : 'Off — all applications stay “submitted” for manual review.'}
                      </p>
                    </div>
                    <Toggle checked={formData.auto_shortlist_enabled} onChange={val => setFormData({ ...formData, auto_shortlist_enabled: val })} />
                  </div>
                  {formData.auto_shortlist_enabled && (
                    <div style={{ marginTop: '14px', maxWidth: '220px' }}>
                      <Input
                        label="Shortlist threshold (0–10)"
                        type="number" min="0" max="10" step="0.5"
                        value={formData.shortlist_threshold}
                        onChange={e => setFormData({ ...formData, shortlist_threshold: e.target.value })}
                      />
                    </div>
                  )}
                </div>

                {/* FAQ Section */}
                <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <MessageSquare size={16} /> Frequently Asked Questions (MCP Agent)
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    Define FAQs that the AI agent can use to answer candidate questions.
                  </p>
                  
                  {formData.faqs.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                      {formData.faqs.map((faq, idx) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', position: 'relative' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const newFaqs = [...formData.faqs];
                              newFaqs.splice(idx, 1);
                              setFormData({ ...formData, faqs: newFaqs });
                            }}
                            style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                          >
                            <Trash2 size={14} />
                          </button>
                          <Input
                            label={`Question ${idx + 1}`}
                            value={faq.question}
                            onChange={(e) => {
                              const newFaqs = [...formData.faqs];
                              newFaqs[idx].question = e.target.value;
                              setFormData({ ...formData, faqs: newFaqs });
                            }}
                            placeholder="e.g. What is the expected interview timeline?"
                          />
                          <Textarea
                            label={`Answer ${idx + 1}`}
                            value={faq.answer}
                            onChange={(e) => {
                              const newFaqs = [...formData.faqs];
                              newFaqs[idx].answer = e.target.value;
                              setFormData({ ...formData, faqs: newFaqs });
                            }}
                            placeholder="e.g. You can expect a response within 2 weeks."
                            style={{ minHeight: '60px' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    leftIcon={<Plus size={14} />}
                    onClick={() => setFormData({ ...formData, faqs: [...formData.faqs, { question: '', answer: '' }] })}
                  >
                    Add FAQ
                  </Button>
                </div>
              </div>

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
                  <Input label="Title" value={editData.title} onChange={e => setEditData({ ...editData, title: e.target.value })} />
                  <Input label="Department" value={editData.department} onChange={e => setEditData({ ...editData, department: e.target.value })} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <Input label="Location" value={editData.location} onChange={e => setEditData({ ...editData, location: e.target.value })} />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                    <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Employment Type</label>
                    <select value={editData.employment_type} onChange={e => setEditData({ ...editData, employment_type: e.target.value })} style={selectStyle}>
                      <option value="full_time" style={optionStyle}>Full Time</option>
                      <option value="part_time" style={optionStyle}>Part Time</option>
                      <option value="contract" style={optionStyle}>Contract</option>
                      <option value="intern" style={optionStyle}>Internship</option>
                    </select>
                  </div>
                </div>
                <Input label="Requirements (comma-separated)" value={editData.requirements} onChange={e => setEditData({ ...editData, requirements: e.target.value })} placeholder="e.g. Python, LLM experience" />
                <Textarea label="Description" value={editData.description} onChange={e => setEditData({ ...editData, description: e.target.value })} placeholder="Role description..." />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <ShieldCheck size={16} /> Eligibility Rules
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                      <Input
                        label="Min. experience (years)"
                        type="number" min="0" step="0.5"
                        value={editData.min_experience_years}
                        onChange={e => setEditData({ ...editData, min_experience_years: e.target.value })}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                        <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Min. education</label>
                        <select value={editData.min_education} onChange={e => setEditData({ ...editData, min_education: e.target.value })} style={selectStyle}>
                          {EDUCATION_OPTIONS.map(o => <option key={o.value} value={o.value} style={optionStyle}>{o.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div style={{ marginTop: '14px' }}>
                      <Input
                        label="Required skills (comma-separated)"
                        value={editData.required_skills}
                        onChange={e => setEditData({ ...editData, required_skills: e.target.value })}
                      />
                    </div>
                    {(showManageCustomRule || editData.custom_rules) ? (
                      <div style={{ marginTop: '14px' }}>
                        <Input
                          label="Custom eligibility rules"
                          value={editData.custom_rules}
                          onChange={e => setEditData({ ...editData, custom_rules: e.target.value })}
                          placeholder="e.g. Must be located in Ahmedabad"
                        />
                      </div>
                    ) : (
                      <Button variant="ghost" size="sm" type="button" onClick={() => setShowManageCustomRule(true)} style={{ marginTop: '14px', color: 'var(--accent-primary)' }}>
                        + Custom rule
                      </Button>
                    )}
                  </div>

                  <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                      <MessageSquare size={16} /> Screening Questions
                    </div>

                    {questionsLoading ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading questions...</p>
                    ) : questions.length === 0 ? (
                      <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem', marginBottom: '16px' }}>No screening questions yet. Add one below.</p>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
                        {questions.map((q, idx) => (
                          <div key={q.id} style={{
                            display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '12px 14px',
                            borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)',
                          }}>
                            <span style={{
                              flexShrink: 0, width: '24px', height: '24px', borderRadius: 'var(--radius-full)',
                              background: 'var(--accent-soft)', color: 'var(--accent-primary)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700,
                            }}>
                              {idx + 1}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ color: 'var(--text-primary)', fontSize: '0.875rem', marginBottom: '6px' }}>{q.question}</p>
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <Badge variant={q.category === 'prompt' ? 'success' : 'info'}>{q.category}</Badge>
                                <Badge variant={difficultyBadgeVariant[q.difficulty] || 'default'}>{q.difficulty}</Badge>
                              </div>
                            </div>
                            {q.category !== 'prompt' && (
                              <button
                                onClick={() => handleDeleteQuestion(q.id)}
                                style={{
                                  flexShrink: 0, background: 'none', border: 'none', color: 'var(--text-muted)',
                                  cursor: 'pointer', padding: '4px', borderRadius: 'var(--radius-md)', display: 'flex', transition: 'color 0.2s',
                                }}
                                onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
                                title="Delete question"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{
                      padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-secondary)',
                      border: '1px dashed var(--glass-border)', display: 'flex', flexDirection: 'column', gap: '12px',
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
                          <select value={newQuestion.category} onChange={e => setNewQuestion({ ...newQuestion, category: e.target.value })} style={selectStyle}>
                            {CATEGORIES.map(c => <option key={c} value={c} style={optionStyle}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                          </select>
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                          <label style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--text-secondary)' }}>Difficulty</label>
                          <select value={newQuestion.difficulty} onChange={e => setNewQuestion({ ...newQuestion, difficulty: e.target.value })} style={selectStyle}>
                            {DIFFICULTIES.map(d => <option key={d} value={d} style={optionStyle}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                          </select>
                        </div>
                        <Button size="sm" leftIcon={<Plus size={14} />} isLoading={addQuestionLoading} onClick={handleAddQuestion} disabled={!newQuestion.question.trim()}>
                          Add
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)' }}>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <Target size={16} /> Auto-Shortlisting
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px' }}>
                      <div>
                        <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>Auto shortlist / reject on score</p>
                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {editData.auto_shortlist_enabled
                            ? 'Applications at or above the threshold are shortlisted; below are rejected.'
                            : 'Off — all applications stay “submitted” for manual review.'}
                        </p>
                      </div>
                      <Toggle checked={editData.auto_shortlist_enabled} onChange={val => setEditData({ ...editData, auto_shortlist_enabled: val })} />
                    </div>
                    {editData.auto_shortlist_enabled && (
                      <div style={{ marginTop: '14px', maxWidth: '220px' }}>
                        <Input
                          label="Shortlist threshold (0–10)"
                          type="number" min="0" max="10" step="0.5"
                          value={editData.shortlist_threshold}
                          onChange={e => setEditData({ ...editData, shortlist_threshold: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* FAQ Section */}
                <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', background: 'var(--bg-tertiary)', border: '1px solid var(--glass-border)' }}>
                  <div style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <MessageSquare size={16} /> Frequently Asked Questions (MCP Agent)
                  </div>
                  <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                    Define FAQs that the AI agent can use to answer candidate questions.
                  </p>
                  
                  {editData.faqs.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
                      {editData.faqs.map((faq, idx) => (
                        <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '12px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--glass-border)', position: 'relative' }}>
                          <button
                            type="button"
                            onClick={() => {
                              const newFaqs = [...editData.faqs];
                              newFaqs.splice(idx, 1);
                              setEditData({ ...editData, faqs: newFaqs });
                            }}
                            style={{ position: 'absolute', top: '8px', right: '8px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                          >
                            <Trash2 size={14} />
                          </button>
                          <Input
                            label={`Question ${idx + 1}`}
                            value={faq.question}
                            onChange={(e) => {
                              const newFaqs = [...editData.faqs];
                              newFaqs[idx].question = e.target.value;
                              setEditData({ ...editData, faqs: newFaqs });
                            }}
                            placeholder="e.g. What is the expected interview timeline?"
                          />
                          <Textarea
                            label={`Answer ${idx + 1}`}
                            value={faq.answer}
                            onChange={(e) => {
                              const newFaqs = [...editData.faqs];
                              newFaqs[idx].answer = e.target.value;
                              setEditData({ ...editData, faqs: newFaqs });
                            }}
                            placeholder="e.g. You can expect a response within 2 weeks."
                            style={{ minHeight: '60px' }}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    leftIcon={<Plus size={14} />}
                    onClick={() => setEditData({ ...editData, faqs: [...editData.faqs, { question: '', answer: '' }] })}
                  >
                    Add FAQ
                  </Button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px' }}>
                  <Button isLoading={editLoading} onClick={handleEdit}>Save Changes</Button>
                </div>
              </div>
            </section>

            <div style={{ borderTop: '1px solid var(--glass-border)' }} />

            {/* ── Section: Toggle Active ── */}
            <section>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Power size={16} style={{ color: manageRole.is_active ? 'var(--success)' : 'var(--text-muted)' }} />
                  <div>
                    <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9375rem' }}>
                      Status: <Badge variant={manageRole.is_active ? 'success' : 'default'}>{manageRole.is_active ? 'Active' : 'Inactive'}</Badge>
                    </p>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '2px' }}>
                      {manageRole.is_active ? 'This role is currently accepting applications.' : 'This role is hidden from candidates.'}
                    </p>
                  </div>
                </div>
                <Button variant={manageRole.is_active ? 'danger' : 'primary'} size="sm" isLoading={toggleLoading} onClick={handleToggle}>
                  {manageRole.is_active ? 'Deactivate' : 'Activate'}
                </Button>
              </div>
            </section>

            <div style={{ borderTop: '1px solid var(--glass-border)' }} />

            {/* ── Section: Danger Zone ── */}

            <section>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--danger)', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <AlertTriangle size={16} /> Danger Zone
              </h3>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
                padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--danger-border)', background: 'var(--danger-bg)',
              }}>
                <div>
                  <p style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.9rem' }}>Delete this role</p>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8125rem', marginTop: '2px' }}>
                    Permanent. Only possible if the role has no applications — otherwise deactivate it.
                  </p>
                </div>
                <Button variant="danger" size="sm" leftIcon={<Trash2 size={14} />} onClick={() => setDeleteConfirm(true)}>
                  Delete Role
                </Button>
              </div>
            </section>
          </div>
        )}
      </Modal>

      {/* ── Delete confirmation ── */}
      <Modal isOpen={deleteConfirm} onClose={() => setDeleteConfirm(false)} title="Delete Role" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.5 }}>
            Permanently delete <strong style={{ color: 'var(--text-primary)' }}>{manageRole?.title}</strong> and its
            questions, invites and screenings? This cannot be undone. Roles with applications cannot be deleted.
          </p>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <Button variant="ghost" onClick={() => setDeleteConfirm(false)}>Cancel</Button>
            <Button variant="danger" isLoading={deleteLoading} onClick={handleDelete}>Delete</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
