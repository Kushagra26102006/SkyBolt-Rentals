import React, { useState } from 'react';
import { useFleet } from '../../hooks/useFleet';
import { useHubs } from '../../hooks/useHubs';
import FleetStatusBadge from './FleetStatusBadge';
import { HubAssignModal, TransferModal } from './FleetOperationsModals';
import { FleetStatus } from '../../types/fleet.types';
import { VehicleDTO } from '../../types/vehicle.types';

export const FleetList: React.FC = () => {
  const { vehicles, loading, error, query, setQuery, refetch, updateStatus, assignHub } = useFleet();
  const { hubs } = useHubs();

  const [selectedVehicleForHub, setSelectedVehicleForHub] = useState<VehicleDTO | null>(null);
  const [selectedVehicleForTransfer, setSelectedVehicleForTransfer] = useState<VehicleDTO | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const handleStatusChange = async (vehicle: VehicleDTO, newStatus: FleetStatus) => {
    setActionError(null);
    try {
      await updateStatus(vehicle.id, newStatus, 'Status changed from operational dashboard');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Status update failed');
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, color: '#111827' }}>
            Fleet Management & Hub Logistics
          </h1>
          <p style={{ color: '#6b7280', margin: '4px 0 0 0', fontSize: '0.95rem' }}>
            Authoritative operational control over physical fleet vehicles, logistics hubs, and readiness.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          style={{
            padding: '8px 16px',
            backgroundColor: '#ffffff',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            fontWeight: 500,
            cursor: 'pointer'
          }}
        >
          ↻ Refresh Fleet
        </button>
      </div>

      {actionError && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: '#fef2f2',
            color: '#dc2626',
            borderRadius: '8px',
            border: '1px solid #fecaca',
            marginBottom: '16px',
            fontSize: '0.9rem'
          }}
        >
          {actionError}
        </div>
      )}

      {/* Filter Bar */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          backgroundColor: '#f9fafb',
          padding: '16px',
          borderRadius: '10px',
          border: '1px solid #e5e7eb',
          marginBottom: '20px',
          flexWrap: 'wrap'
        }}
      >
        <input
          type="text"
          placeholder="Search by brand, model, code..."
          value={query.search || ''}
          onChange={(e) => setQuery({ ...query, search: e.target.value, page: 1 })}
          style={{
            padding: '8px 14px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            minWidth: '240px',
            fontSize: '0.9rem'
          }}
        />

        <select
          value={query.fleetStatus || ''}
          onChange={(e) =>
            setQuery({ ...query, fleetStatus: (e.target.value as FleetStatus) || undefined, page: 1 })
          }
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '0.9rem'
          }}
        >
          <option value="">All Fleet States</option>
          <option value="AVAILABLE">Available</option>
          <option value="RESERVED">Reserved</option>
          <option value="ACTIVE_RENTAL">Active Rental</option>
          <option value="MAINTENANCE">Maintenance</option>
          <option value="INSPECTION">Inspection</option>
          <option value="TRANSFER_PENDING">In Transit</option>
          <option value="UNAVAILABLE">Unavailable</option>
          <option value="RETIRED">Retired</option>
        </select>

        <select
          value={query.hubId || ''}
          onChange={(e) => setQuery({ ...query, hubId: e.target.value || undefined, page: 1 })}
          style={{
            padding: '8px 12px',
            borderRadius: '6px',
            border: '1px solid #d1d5db',
            fontSize: '0.9rem'
          }}
        >
          <option value="">All Logistics Hubs</option>
          {hubs.map((h) => (
            <option key={h.id} value={h.id}>
              {h.name} ({h.code})
            </option>
          ))}
        </select>
      </div>

      {/* Table Container */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', color: '#6b7280' }}>
          Loading fleet inventory...
        </div>
      ) : error ? (
        <div style={{ padding: '24px', backgroundColor: '#fef2f2', color: '#dc2626', borderRadius: '8px' }}>
          {error}
        </div>
      ) : vehicles.length === 0 ? (
        <div
          style={{
            padding: '48px',
            textAlign: 'center',
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e5e7eb'
          }}
        >
          <p style={{ margin: 0, color: '#6b7280', fontSize: '1rem' }}>
            No vehicles match the selected fleet filters.
          </p>
        </div>
      ) : (
        <div
          style={{
            backgroundColor: '#ffffff',
            borderRadius: '10px',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
            boxShadow: '0 1px 3px rgba(0,0,0,0.05)'
          }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ backgroundColor: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                <th style={thStyle}>Vehicle</th>
                <th style={thStyle}>Category</th>
                <th style={thStyle}>Current Hub</th>
                <th style={thStyle}>Fleet Status</th>
                <th style={thStyle}>Pricing</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((v) => (
                <tr key={v.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={tdStyle}>
                    <div style={{ fontWeight: 600, color: '#111827' }}>{v.name}</div>
                    <div style={{ fontSize: '0.8rem', color: '#6b7280', fontFamily: 'monospace' }}>
                      {v.vehicleCode}
                    </div>
                  </td>
                  <td style={tdStyle}>
                    <span
                      style={{
                        padding: '2px 8px',
                        backgroundColor: '#f3f4f6',
                        borderRadius: '4px',
                        fontSize: '0.75rem',
                        fontWeight: 600
                      }}
                    >
                      {v.category}
                    </span>
                  </td>
                  <td style={tdStyle}>
                    {v.location?.name || 'Unassigned'}
                    {v.location?.city ? (
                      <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}> ({v.location.city})</span>
                    ) : null}
                  </td>
                  <td style={tdStyle}>
                    <FleetStatusBadge status={(v.fleetStatus || 'AVAILABLE') as FleetStatus} />
                  </td>
                  <td style={tdStyle}>
                    ₹{v.rental?.baseRate || 0}
                    <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>/day</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', gap: '8px', flexWrap: 'wrap' }}>
                      <button
                        onClick={() => setSelectedVehicleForHub(v)}
                        style={actionBtnStyle}
                        title="Assign Hub"
                      >
                        Hub
                      </button>
                      <button
                        onClick={() => setSelectedVehicleForTransfer(v)}
                        style={actionBtnStyle}
                        title="Transfer Vehicle"
                        disabled={v.fleetStatus === 'ACTIVE_RENTAL' || v.fleetStatus === 'RETIRED'}
                      >
                        Transfer
                      </button>
                      {v.fleetStatus === 'AVAILABLE' ? (
                        <button
                          onClick={() => handleStatusChange(v, 'MAINTENANCE')}
                          style={{ ...actionBtnStyle, color: '#ea580c' }}
                        >
                          Service
                        </button>
                      ) : v.fleetStatus === 'INSPECTION' ? (
                        <button
                          onClick={() => handleStatusChange(v, 'AVAILABLE')}
                          style={{ ...actionBtnStyle, color: '#059669' }}
                        >
                          Pass
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Assignment Modal */}
      {selectedVehicleForHub && (
        <HubAssignModal
          vehicle={selectedVehicleForHub}
          hubs={hubs}
          isOpen={Boolean(selectedVehicleForHub)}
          onClose={() => setSelectedVehicleForHub(null)}
          onSubmit={async (hubId) => {
            await assignHub(selectedVehicleForHub.id, hubId);
          }}
        />
      )}

      {/* Transfer Modal */}
      {selectedVehicleForTransfer && (
        <TransferModal
          vehicle={selectedVehicleForTransfer}
          hubs={hubs}
          isOpen={Boolean(selectedVehicleForTransfer)}
          onClose={() => setSelectedVehicleForTransfer(null)}
          onSubmit={async (toHubId, reason, notes) => {
            // Initiate transfer and refresh
            const { fleetService } = await import('../../services/fleet.service');
            await fleetService.initiateTransfer({
              vehicleId: selectedVehicleForTransfer.id,
              toHubId,
              reason,
              notes
            });
            await refetch();
          }}
        />
      )}
    </div>
  );
};

const thStyle: React.CSSProperties = {
  padding: '12px 16px',
  fontSize: '0.8rem',
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: '#6b7280'
};

const tdStyle: React.CSSProperties = {
  padding: '14px 16px',
  fontSize: '0.9rem',
  verticalAlign: 'middle'
};

const actionBtnStyle: React.CSSProperties = {
  padding: '4px 10px',
  borderRadius: '6px',
  border: '1px solid #d1d5db',
  backgroundColor: '#ffffff',
  color: '#374151',
  fontSize: '0.8rem',
  fontWeight: 600,
  cursor: 'pointer'
};

export default FleetList;
