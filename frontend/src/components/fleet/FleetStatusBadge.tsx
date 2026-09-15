import React from 'react';
import { FleetStatus } from '../../types/fleet.types';

interface FleetStatusBadgeProps {
  status: FleetStatus;
  size?: 'sm' | 'md' | 'lg';
}

const statusConfig: Record<
  FleetStatus,
  { label: string; bg: string; text: string; border: string; icon: string }
> = {
  AVAILABLE: {
    label: 'Available',
    bg: '#ecfdf5',
    text: '#059669',
    border: '#a7f3d0',
    icon: '●'
  },
  RESERVED: {
    label: 'Reserved',
    bg: '#eff6ff',
    text: '#2563eb',
    border: '#bfdbfe',
    icon: '◷'
  },
  ACTIVE_RENTAL: {
    label: 'Active Rental',
    bg: '#f5f3ff',
    text: '#7c3aed',
    border: '#ddd6fe',
    icon: '▶'
  },
  MAINTENANCE: {
    label: 'Maintenance',
    bg: '#fff7ed',
    text: '#ea580c',
    border: '#fed7aa',
    icon: '⚙'
  },
  INSPECTION: {
    label: 'Inspection',
    bg: '#fefce8',
    text: '#ca8a04',
    border: '#fef08a',
    icon: '✓'
  },
  TRANSFER_PENDING: {
    label: 'In Transit',
    bg: '#ecfeff',
    text: '#0891b2',
    border: '#a5f3fc',
    icon: '⇄'
  },
  UNAVAILABLE: {
    label: 'Unavailable',
    bg: '#f3f4f6',
    text: '#4b5563',
    border: '#e5e7eb',
    icon: '■'
  },
  RETIRED: {
    label: 'Retired',
    bg: '#fef2f2',
    text: '#dc2626',
    border: '#fecaca',
    icon: '✕'
  }
};

export const FleetStatusBadge: React.FC<FleetStatusBadgeProps> = ({ status, size = 'md' }) => {
  const cfg = statusConfig[status] || statusConfig.UNAVAILABLE;

  const sizeStyles = {
    sm: { padding: '2px 8px', fontSize: '0.75rem' },
    md: { padding: '4px 12px', fontSize: '0.85rem' },
    lg: { padding: '6px 16px', fontSize: '0.95rem' }
  }[size];

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        fontWeight: 600,
        borderRadius: '9999px',
        backgroundColor: cfg.bg,
        color: cfg.text,
        border: `1px solid ${cfg.border}`,
        lineHeight: 1.2,
        ...sizeStyles
      }}
    >
      <span style={{ fontSize: '0.9em' }}>{cfg.icon}</span>
      {cfg.label}
    </span>
  );
};

export default FleetStatusBadge;
