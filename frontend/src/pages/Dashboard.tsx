import { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/Card';
import { Users, Briefcase, Inbox, Activity } from 'lucide-react';
import api from '../lib/api';
import styles from './Dashboard.module.css';

interface DashboardStats {
  total_candidates: number;
  active_roles: number;
  pending_reviews: number;
  total_applications: number;
  avg_screening_score: number;
}

export function Dashboard() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await api.get('/analytics/overview');
        setStats(response.data);
      } catch (error) {
        console.error('Failed to load stats', error);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, []);

  const statCards = [
    { label: 'Total Candidates', value: stats?.total_candidates || 0, icon: Users, color: 'var(--info)' },
    { label: 'Active Roles', value: stats?.active_roles || 0, icon: Briefcase, color: 'var(--accent-primary)' },
    { label: 'Pending Reviews', value: stats?.pending_reviews || 0, icon: Inbox, color: 'var(--warning)' },
    { label: 'Avg Screening Score', value: `${stats?.avg_screening_score || 0}/10`, icon: Activity, color: 'var(--success)' },
  ];

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>Here's what's happening in your hiring pipeline today.</p>
        </div>
      </div>

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

      <div className={styles.mainGrid}>
        <Card className={styles.mainCard}>
          <CardHeader>
            <CardTitle>Recent Applications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={styles.emptyState}>
              <Inbox size={48} className={styles.emptyIcon} />
              <p>No recent applications.</p>
              <span>When candidates apply via their AI agents, they will appear here.</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
