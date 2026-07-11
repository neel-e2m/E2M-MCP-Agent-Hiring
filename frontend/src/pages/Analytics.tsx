import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList,
} from 'recharts';
import { FileText, CheckCircle2, Star, Timer } from 'lucide-react';
import api from '../lib/api';

interface Overview {
  total_candidates: number;
  active_roles: number;
  pending_reviews: number;
  total_applications: number;
  avg_screening_score: number;
}
interface Pipeline {
  submitted: number;
  under_review: number;
  shortlisted: number;
  approved: number;
  rejected: number;
}
interface Scores {
  '0-2': number; '2-4': number; '4-6': number; '6-8': number; '8-10': number;
}

const pipelineLabels: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  shortlisted: 'Shortlisted',
  approved: 'Approved',
  rejected: 'Rejected',
};

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{
      background: 'var(--bg-secondary)', border: '1px solid var(--glass-border)',
      borderRadius: 10, boxShadow: 'var(--shadow-md)', padding: '8px 12px',
      display: 'flex', flexDirection: 'column', gap: 2,
    }}>
      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{label}</span>
      <span style={{ fontSize: '0.95rem', fontWeight: 700, letterSpacing: '-0.02em' }}>
        {payload[0].value}{payload[0].payload?.suffix || ''}
      </span>
    </div>
  );
}

export function Analytics() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [scores, setScores] = useState<Scores | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [o, p, s] = await Promise.all([
          api.get('/analytics/overview'),
          api.get('/analytics/pipeline'),
          api.get('/analytics/screening-scores'),
        ]);
        setOverview(o.data);
        setPipeline(p.data);
        setScores(s.data);
      } catch (e) {
        console.error('Failed to load analytics', e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const totalApps = overview?.total_applications ?? 0;
  const approved = pipeline?.approved ?? 0;
  const decided = (pipeline?.approved ?? 0) + (pipeline?.rejected ?? 0);
  const approvalRate = decided > 0 ? Math.round((approved / decided) * 100) : 0;

  const kpis = [
    { label: 'Total Applications', value: `${totalApps}`, icon: FileText },
    { label: 'Approval Rate', value: `${approvalRate}`, suffix: '%', icon: CheckCircle2 },
    { label: 'Avg Screening Score', value: `${overview?.avg_screening_score ?? 0}`, suffix: '/10', icon: Star },
    { label: 'Pending Reviews', value: `${overview?.pending_reviews ?? 0}`, icon: Timer },
  ];

  const pipelineData = pipeline
    ? (Object.entries(pipeline) as [string, number][]).map(([key, value]) => ({
        name: pipelineLabels[key] || key, value,
      }))
    : [];

  const scoreData = scores
    ? [
        { bucket: '0–2', count: scores['0-2'] },
        { bucket: '2–4', count: scores['2-4'] },
        { bucket: '4–6', count: scores['4-6'] },
        { bucket: '6–8', count: scores['6-8'] },
        { bucket: '8–10', count: scores['8-10'] },
      ]
    : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '28px', animation: 'fadeIn 0.4s ease-out' }}>
      <div>
        <h1 style={{ fontSize: '1.9rem', fontWeight: 700, letterSpacing: '-0.04em', marginBottom: '4px' }}>Analytics</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Pipeline performance and screening insights across all roles.</p>
      </div>

      {/* KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
        {kpis.map((k, i) => (
          <Card key={i}>
            <CardContent style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, display: 'flex',
                alignItems: 'center', justifyContent: 'center',
                background: 'var(--accent-soft)', color: 'var(--text-primary)',
              }}>
                <k.icon size={19} />
              </div>
              <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{k.label}</p>
              <h3 style={{ fontSize: '1.9rem', fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, display: 'flex', alignItems: 'baseline' }}>
                {loading ? '—' : k.value}
                {!loading && k.suffix && (
                  <span style={{ fontSize: '1rem', fontWeight: 600, color: 'var(--text-muted)', marginLeft: 2 }}>{k.suffix}</span>
                )}
              </h3>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: '20px' }}>
        <Card>
          <CardHeader><CardTitle>Applications Pipeline</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={pipelineData} layout="vertical" margin={{ top: 4, right: 28, bottom: 0, left: 8 }} barCategoryGap={14}>
                  <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
                  <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12.5 }} axisLine={false} tickLine={false} width={96} />
                  <Tooltip cursor={{ fill: 'var(--surface-hover)' }} content={<ChartTooltip />} />
                  <Bar dataKey="value" fill="var(--accent-primary)" radius={[0, 6, 6, 0]} barSize={22}>
                    <LabelList dataKey="value" position="right" fill="var(--text-primary)" fontSize={12} fontWeight={600} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Screening Score Distribution</CardTitle></CardHeader>
          <CardContent>
            {loading ? (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={scoreData} margin={{ top: 16, right: 8, bottom: 0, left: -18 }} barCategoryGap={18}>
                  <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                  <XAxis dataKey="bucket" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ fill: 'var(--surface-hover)' }} content={<ChartTooltip />} />
                  <Bar dataKey="count" fill="var(--accent-primary)" radius={[6, 6, 0, 0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
