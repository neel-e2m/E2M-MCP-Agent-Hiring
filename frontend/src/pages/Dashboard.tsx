import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import {
  Users, Briefcase, Inbox, Activity, FileText, Send, UserPlus,
  CheckCircle, XCircle, Clock, TrendingUp,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LabelList, Cell,
} from 'recharts';
import api from '../lib/api';
import styles from './Dashboard.module.css';

interface DashboardStats {
  total_candidates: number;
  active_roles: number;
  pending_reviews: number;
  total_applications: number;
  avg_screening_score: number;
}

interface PipelineData {
  submitted: number;
  under_review: number;
  shortlisted: number;
  approved: number;
  rejected: number;
}

interface ActivityItem {
  id: string;
  type: string;
  message: string;
  timestamp: string;
}

interface ScreeningScores {
  '0-2': number;
  '2-4': number;
  '4-6': number;
  '6-8': number;
  '8-10': number;
}

function timeAgo(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}

const activityIconMap: Record<string, typeof Activity> = {
  application: Send,
  candidate: UserPlus,
  approved: CheckCircle,
  rejected: XCircle,
  review: Clock,
};

const pipelineLabels: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  shortlisted: 'Shortlisted',
  approved: 'Approved',
  rejected: 'Rejected',
};

/* ── Minimal light tooltip ── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className={styles.tooltip}>
      <span className={styles.tooltipLabel}>{label}</span>
      <span className={styles.tooltipValue}>
        {payload[0].value}{payload[0].payload?.suffix || ''}
      </span>
    </div>
  );
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [pipeline, setPipeline] = useState<PipelineData | null>(null);
  const [activities, setActivities] = useState<ActivityItem[]>([]);
  const [scores, setScores] = useState<ScreeningScores | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [overviewRes, pipelineRes, activityRes, scoresRes] = await Promise.all([
          api.get('/analytics/overview'),
          api.get('/analytics/pipeline'),
          api.get('/analytics/activity'),
          api.get('/analytics/screening-scores'),
        ]);
        setStats(overviewRes.data);
        setPipeline(pipelineRes.data);
        setActivities(activityRes.data || []);
        setScores(scoresRes.data);
      } catch (error) {
        console.error('Failed to load dashboard data', error);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  const statCards = [
    { label: 'Total Candidates', value: stats?.total_candidates ?? 0, icon: Users },
    { label: 'Active Roles', value: stats?.active_roles ?? 0, icon: Briefcase },
    { label: 'Pending Reviews', value: stats?.pending_reviews ?? 0, icon: Inbox },
    { label: 'Applications', value: stats?.total_applications ?? 0, icon: FileText },
    { label: 'Avg Score', value: `${stats?.avg_screening_score ?? 0}`, suffix: '/10', icon: TrendingUp },
  ];

  const pipelineData = pipeline
    ? (Object.entries(pipeline) as [string, number][]).map(([key, value]) => ({
        name: pipelineLabels[key] || key,
        value,
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
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>Here's what's happening in your hiring pipeline today.</p>
        </div>
      </div>

      {/* Stat Cards */}
      <div className={styles.statsGrid}>
        {statCards.map((stat, i) => (
          <Card key={i} className={styles.statCard}>
            <div className={styles.statContent}>
              <div className={styles.statIcon}>
                <stat.icon size={19} />
              </div>
              <p className={styles.statLabel}>{stat.label}</p>
              <h3 className={styles.statValue}>
                {loading ? <span className={styles.skeleton} /> : (
                  <>{stat.value}<span className={styles.statSuffix}>{stat.suffix || ''}</span></>
                )}
              </h3>
            </div>
          </Card>
        ))}
      </div>

      {/* Main grid */}
      <div className={styles.mainGrid}>
        <div className={styles.leftColumn}>
          {/* Pipeline */}
          <Card>
            <CardHeader>
              <CardTitle>Applications Pipeline</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className={styles.chartEmpty}>Loading…</div>
              ) : pipelineData.every(d => d.value === 0) ? (
                <div className={styles.chartEmpty}>No application data yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={230}>
                  <BarChart data={pipelineData} layout="vertical" margin={{ top: 4, right: 28, bottom: 0, left: 8 }} barCategoryGap={16}>
                    <CartesianGrid horizontal={false} stroke="var(--border-subtle)" />
                    <XAxis type="number" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 12.5 }} axisLine={false} tickLine={false} width={92} />
                    <Tooltip cursor={{ fill: 'var(--surface-hover)' }} content={<ChartTooltip />} />
                    <Bar dataKey="value" fill="var(--accent-primary)" radius={[0, 6, 6, 0]} barSize={28}>
                      <LabelList dataKey="value" position="right" fill="var(--text-primary)" fontSize={12} fontWeight={600} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Scores */}
          <Card>
            <CardHeader>
              <CardTitle>Screening Score Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className={styles.chartEmpty}>Loading…</div>
              ) : scoreData.every(d => d.count === 0) ? (
                <div className={styles.chartEmpty}>No screening scores yet.</div>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={scoreData} margin={{ top: 16, right: 8, bottom: 0, left: -18 }} barCategoryGap={16}>
                    <CartesianGrid vertical={false} stroke="var(--border-subtle)" />
                    <XAxis dataKey="bucket" tick={{ fill: 'var(--text-secondary)', fontSize: 12 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip cursor={{ fill: 'var(--surface-hover)' }} content={<ChartTooltip />} />
                    <Bar dataKey="count" fill="var(--accent-primary)" radius={[6, 6, 0, 0]} maxBarSize={56}>
                      {scoreData.map((_, i) => <Cell key={i} fill="var(--accent-primary)" />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Activity */}
        <Card className={styles.activityCard}>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className={styles.chartEmpty}>Loading…</div>
            ) : activities.length === 0 ? (
              <div className={styles.emptyState}>
                <Inbox size={40} className={styles.emptyIcon} />
                <p>No recent activity.</p>
                <span>When candidates apply via their AI agents, activity will appear here.</span>
              </div>
            ) : (
              <div className={styles.activityList}>
                {activities.slice(0, 8).map((item) => {
                  const IconComp = activityIconMap[item.type] || Activity;
                  return (
                    <div key={item.id} className={styles.activityItem}>
                      <div className={styles.activityIcon}>
                        <IconComp size={16} strokeWidth={2.2} />
                      </div>
                      <div className={styles.activityContent}>
                        <p className={styles.activityMessage}>{item.message}</p>
                        <p className={styles.activityTime}>{timeAgo(item.timestamp)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
