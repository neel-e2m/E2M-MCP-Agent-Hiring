import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Users, Briefcase, Inbox, Activity, FileText, Send, UserPlus, CheckCircle, XCircle, Clock } from 'lucide-react';
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

const activityIconMap: Record<string, { icon: typeof Activity; bg: string; color: string }> = {
  application: { icon: Send, bg: 'rgba(59, 130, 246, 0.12)', color: 'var(--info)' },
  candidate: { icon: UserPlus, bg: 'rgba(16, 185, 129, 0.12)', color: 'var(--success)' },
  approved: { icon: CheckCircle, bg: 'rgba(16, 185, 129, 0.12)', color: 'var(--success)' },
  rejected: { icon: XCircle, bg: 'rgba(239, 68, 68, 0.12)', color: 'var(--danger)' },
  review: { icon: Clock, bg: 'rgba(245, 158, 11, 0.12)', color: 'var(--warning)' },
};

const pipelineColors: Record<string, string> = {
  submitted: 'var(--info)',
  under_review: 'var(--warning)',
  shortlisted: 'var(--accent-primary)',
  approved: 'var(--success)',
  rejected: 'var(--danger)',
};

const pipelineLabels: Record<string, string> = {
  submitted: 'Submitted',
  under_review: 'Under Review',
  shortlisted: 'Shortlisted',
  approved: 'Approved',
  rejected: 'Rejected',
};

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
    { label: 'Total Candidates', value: stats?.total_candidates || 0, icon: Users, color: 'var(--info)' },
    { label: 'Active Roles', value: stats?.active_roles || 0, icon: Briefcase, color: 'var(--accent-primary)' },
    { label: 'Pending Reviews', value: stats?.pending_reviews || 0, icon: Inbox, color: 'var(--warning)' },
    { label: 'Applications', value: stats?.total_applications || 0, icon: FileText, color: 'var(--danger)' },
    { label: 'Avg Score', value: `${stats?.avg_screening_score || 0}/10`, icon: Activity, color: 'var(--success)' },
  ];

  // Pipeline max for proportional bar widths
  const pipelineEntries = pipeline
    ? Object.entries(pipeline) as [string, number][]
    : [];
  const pipelineMax = pipelineEntries.length > 0
    ? Math.max(...pipelineEntries.map(([, v]) => v), 1)
    : 1;

  // Scores max for proportional bar heights
  const scoreBuckets: [string, number][] = scores
    ? [['0-2', scores['0-2']], ['2-4', scores['2-4']], ['4-6', scores['4-6']], ['6-8', scores['6-8']], ['8-10', scores['8-10']]]
    : [];
  const scoresMax = scoreBuckets.length > 0
    ? Math.max(...scoreBuckets.map(([, v]) => v), 1)
    : 1;

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
            <CardContent className={styles.statContent}>
              <div>
                <p className={styles.statLabel}>{stat.label}</p>
                <h3 className={styles.statValue}>
                  {loading ? '...' : stat.value}
                </h3>
              </div>
              <div className={styles.statIcon} style={{ backgroundColor: `${stat.color}15`, color: stat.color }}>
                <stat.icon size={24} />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Main 2-column grid */}
      <div className={styles.mainGrid}>
        {/* Left column: Pipeline + Scores */}
        <div className={styles.leftColumn}>
          {/* Pipeline Overview */}
          <Card>
            <CardHeader>
              <CardTitle>Pipeline Overview</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className={styles.emptyState}><p>Loading...</p></div>
              ) : (
                <div className={styles.pipelineList}>
                  {pipelineEntries.map(([key, count]) => (
                    <div key={key} className={styles.pipelineItem}>
                      <span className={styles.pipelineLabel}>
                        {pipelineLabels[key] || key}
                      </span>
                      <div className={styles.pipelineBarTrack}>
                        <div
                          className={styles.pipelineBarFill}
                          style={{
                            width: `${(count / pipelineMax) * 100}%`,
                            backgroundColor: pipelineColors[key] || 'var(--accent-primary)',
                          }}
                        />
                      </div>
                      <span className={styles.pipelineCount}>{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Screening Scores */}
          <Card>
            <CardHeader>
              <CardTitle>Screening Scores</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className={styles.emptyState}><p>Loading...</p></div>
              ) : (
                <div className={styles.scoresChart}>
                  {scoreBuckets.map(([bucket, count]) => (
                    <div key={bucket} className={styles.scoreBar}>
                      <span className={styles.scoreBarValue}>{count}</span>
                      <div
                        className={styles.scoreBarFill}
                        style={{ height: `${(count / scoresMax) * 100}%` }}
                      />
                      <span className={styles.scoreBarLabel}>{bucket}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: Activity Feed */}
        <Card className={styles.activityCard}>
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className={styles.emptyState}><p>Loading...</p></div>
            ) : activities.length === 0 ? (
              <div className={styles.emptyState}>
                <Inbox size={48} className={styles.emptyIcon} />
                <p>No recent activity.</p>
                <span>When candidates apply via their AI agents, activity will appear here.</span>
              </div>
            ) : (
              <div className={styles.activityList}>
                {activities.map((item) => {
                  const iconConfig = activityIconMap[item.type] || activityIconMap.application || {
                    icon: Activity,
                    bg: 'rgba(99, 102, 241, 0.12)',
                    color: 'var(--accent-primary)',
                  };
                  const IconComp = iconConfig.icon;
                  return (
                    <div key={item.id} className={styles.activityItem}>
                      <div
                        className={styles.activityIcon}
                        style={{ backgroundColor: iconConfig.bg, color: iconConfig.color }}
                      >
                        <IconComp size={16} />
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
