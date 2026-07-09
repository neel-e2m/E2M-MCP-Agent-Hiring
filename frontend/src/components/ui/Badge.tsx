import React from 'react';
import styles from './Badge.module.css';
import { cn } from '../../lib/utils';

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info';
}

export function Badge({ className, variant = 'default', children, ...props }: BadgeProps) {
  return (
    <div className={cn(styles.badge, styles[variant], className)} {...props}>
      {children}
    </div>
  );
}
