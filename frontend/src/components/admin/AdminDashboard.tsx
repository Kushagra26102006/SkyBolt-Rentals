import React, { useState } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useAdminDashboard } from '../../hooks/useAdminDashboard';

export const AdminDashboard: React.FC = () => {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { metrics, alerts, isLoading, error, refreshOverview } = useAdminDashboard();
  const [activeTab, setActiveTab] = useState<string>('overview');

  if (authLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <p>Loading session credentials...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2>Authentication Required</h2>
        <p>Please sign in with authorized operational staff or administrator credentials.</p>
        <a href="login.html" className="btn btn-primary">Go to Login</a>
      </div>
    );
  }

  if (user.role === 'CUSTOMER') {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <h2 style={{ color: '#dc2626' }}>Access Denied (403 Forbidden)</h2>
        <p>Customer accounts are not authorized to access internal fleet operational dashboards.</p>
        <a href="dashboard.html" className="btn btn-outline">Return to Customer Portal</a>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      {/* Sidebar */}
      <aside style={{ width: 260, background: '#ffffff', borderRight: '1px solid #e2e8f0', padding: 20 }}>
        <div style={{ marginBottom: 24, fontWeight: 800, fontSize: '1.2rem', color: '#0f172a' }}>
          SkyBolt<span style={{ color: '#2563eb' }}>Admin</span>
          <div style={{ fontSize: '0.7rem', color: '#64748b', fontWeight: 600 }}>Command Center</div>
        </div>

        <nav style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {['overview', 'bookings', 'fleet', 'hubs', 'maintenance', 'inspections', 'transfers', 'payments', 'users', 'audit'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '10px 14px',
                borderRadius: 8,
                border: 'none',
                background: activeTab === tab ? '#eff6ff' : 'transparent',
                color: activeTab === tab ? '#2563eb' : '#475569',
                fontWeight: activeTab === tab ? 700 : 500,
                cursor: 'pointer',
                textAlign: 'left',
                textTransform: 'capitalize'
              }}
            >
              {tab}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content */}
      <main style={{ flex: 1, padding: 32, overflowY: 'auto' }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.75rem', color: '#0f172a' }}>Operational Control Center</h1>
            <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: '0.875rem' }}>Authoritative real-time fleet telemetry and logistical health.</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ padding: '4px 10px', background: '#e2e8f0', borderRadius: 9999, fontSize: '0.75rem', fontWeight: 700 }}>
              {user.role}
            </span>
            <button onClick={refreshOverview} className="btn btn-outline btn-sm">
              Refresh Telemetry
            </button>
          </div>
        </header>

        {isLoading && <p>Loading authoritative operational data...</p>}
        {error && <div style={{ padding: 16, background: '#fee2e2', color: '#991b1b', borderRadius: 8 }}>{error}</div>}

        {metrics && (
          <div>
            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
              <div style={{ background: '#ffffff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>{metrics.vehicles.available}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>AVAILABLE FLEET</div>
              </div>
              <div style={{ background: '#ffffff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>{metrics.vehicles.activeRental}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>ACTIVE RENTALS</div>
              </div>
              <div style={{ background: '#ffffff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>{metrics.vehicles.maintenance}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>IN MAINTENANCE</div>
              </div>
              <div style={{ background: '#ffffff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>{metrics.vehicles.inspection}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>UNDER INSPECTION</div>
              </div>
              <div style={{ background: '#ffffff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>₹{metrics.payments.totalRevenueInr.toLocaleString('en-IN')}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>CAPTURED REVENUE</div>
              </div>
              <div style={{ background: '#ffffff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0f172a' }}>{metrics.hubs.occupancyPercent}%</div>
                <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 600 }}>HUB OCCUPANCY</div>
              </div>
            </div>

            {/* Operational Health Alerts */}
            <div style={{ background: '#ffffff', padding: 24, borderRadius: 12, border: '1px solid #e2e8f0', marginBottom: 24 }}>
              <h3 style={{ margin: '0 0 16px', fontSize: '1.15rem' }}>Authoritative Operational Health</h3>
              {alerts.length === 0 ? (
                <p style={{ color: '#059669', margin: 0 }}>All physical vehicles, hubs, and workflows operating normally.</p>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
                  {alerts.map((a) => (
                    <div
                      key={a.id}
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        background: a.severity === 'CRITICAL' ? '#fef2f2' : a.severity === 'HIGH' ? '#fff7ed' : '#fefce8',
                        border: `1px solid ${a.severity === 'CRITICAL' ? '#fecaca' : a.severity === 'HIGH' ? '#fed7aa' : '#fef08a'}`
                      }}
                    >
                      <strong style={{ fontSize: '0.85rem' }}>{a.title}</strong>
                      <div style={{ fontSize: '0.75rem', marginTop: 4 }}>{a.message}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default AdminDashboard;
