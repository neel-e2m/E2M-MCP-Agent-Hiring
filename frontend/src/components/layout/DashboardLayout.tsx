import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Kanban,
  Briefcase, 
  Inbox, 
  Link as LinkIcon, 
  LogOut,
  Calendar
} from 'lucide-react';
import styles from './DashboardLayout.module.css';
import { useAuthStore } from '../../store/authStore';
import logo from '../../assets/E2M_Logo.png';

const navItems = [
  { label: 'Overview', icon: LayoutDashboard, path: '/' },
  { label: 'Candidates', icon: Users, path: '/candidates' },
  { label: 'Kanban View', icon: Kanban, path: '/candidates/kanban' },
  { label: 'Roles', icon: Briefcase, path: '/roles' },
  { label: 'Applications', icon: Inbox, path: '/applications' },
  { label: 'Invitations', icon: LinkIcon, path: '/invitations' },
  { label: 'Interviews', icon: Calendar, path: '/interviews' },
];

export function DashboardLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { user, logout } = useAuthStore();

  return (
    <div className={styles.layout}>
      {/* Sidebar */}
      <aside className={styles.sidebar}>
        <div className={styles.brand}>
          <img src={logo} alt="E2M" className={styles.logo} />
          <h2>E2M Hiring Agent</h2>
        </div>
        
        <nav className={styles.nav}>
          <div className={styles.navSection}>
            <span className={styles.navLabel}>Menu</span>
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`${styles.navItem} ${isActive ? styles.active : ''}`}
                >
                  <item.icon size={18} />
                  <span>{item.label}</span>
                  {isActive && <div className={styles.activeIndicator} />}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className={styles.userSection}>
          <div className={styles.userInfo}>
            <div className={styles.avatar}>{user?.name?.charAt(0) || 'U'}</div>
            <div className={styles.userDetails}>
              <span className={styles.userName}>{user?.name || 'User'}</span>
              <span className={styles.userRole}>{user?.role || 'Admin'}</span>
            </div>
          </div>
          <button className={styles.logoutBtn} onClick={logout} title="Log out">
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className={styles.main}>
        <header className={styles.header}>
          <div className={styles.headerContent}>
            {/* Contextual header content could go here */}
            <div className={styles.breadcrumbs}>
              {location.pathname === '/' ? 'Overview' : location.pathname.split('/')[1].charAt(0).toUpperCase() + location.pathname.split('/')[1].slice(1)}
            </div>
          </div>
        </header>
        <div className={styles.content}>
          {children}
        </div>
      </main>
    </div>
  );
}
