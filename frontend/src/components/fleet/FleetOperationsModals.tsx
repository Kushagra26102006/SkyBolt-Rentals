import React, { useState } from 'react';
import { HubDTO } from '../../types/fleet.types';
import { VehicleDTO } from '../../types/vehicle.types';

interface HubAssignModalProps {
  vehicle: VehicleDTO;
  hubs: HubDTO[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (hubId: string) => Promise<void>;
}

export const HubAssignModal: React.FC<HubAssignModalProps> = ({
  vehicle,
  hubs,
  isOpen,
  onClose,
  onSubmit
}) => {
  const [selectedHub, setSelectedHub] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedHub) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(selectedHub);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Hub assignment failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={backdropStyle}>
      <div style={modalStyle}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>Assign Vehicle to Hub</h3>
        <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '16px' }}>
          Assign <strong>{vehicle.name}</strong> ({vehicle.vehicleCode}) to an operational hub.
        </p>

        {error && <div style={errorStyle}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Target Logistics Hub</label>
            <select
              style={inputStyle}
              value={selectedHub}
              onChange={(e) => setSelectedHub(e.target.value)}
              required
            >
              <option value="">Select an operational hub...</option>
              {hubs.map((h) => (
                <option
                  key={h.id}
                  value={h.id}
                  disabled={h.operationalStatus !== 'ACTIVE' || h.availableCapacity <= 0}
                >
                  {h.name} ({h.code}) — {h.availableCapacity} / {h.capacity} spots left{' '}
                  {h.operationalStatus !== 'ACTIVE' ? `[${h.operationalStatus}]` : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={buttonRowStyle}>
            <button type="button" onClick={onClose} style={cancelBtnStyle} disabled={loading}>
              Cancel
            </button>
            <button
              type="submit"
              style={submitBtnStyle}
              disabled={loading || !selectedHub}
            >
              {loading ? 'Assigning...' : 'Confirm Assignment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface TransferModalProps {
  vehicle: VehicleDTO;
  hubs: HubDTO[];
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (toHubId: string, reason?: string, notes?: string) => Promise<void>;
}

export const TransferModal: React.FC<TransferModalProps> = ({
  vehicle,
  hubs,
  isOpen,
  onClose,
  onSubmit
}) => {
  const [toHubId, setToHubId] = useState<string>('');
  const [reason, setReason] = useState<string>('Inventory rebalance');
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!toHubId) return;
    setLoading(true);
    setError(null);
    try {
      await onSubmit(toHubId, reason, notes);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Transfer initiation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={backdropStyle}>
      <div style={modalStyle}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '1.25rem' }}>Initiate Vehicle Transfer</h3>
        <p style={{ color: '#6b7280', fontSize: '0.9rem', marginBottom: '16px' }}>
          Move <strong>{vehicle.name}</strong> ({vehicle.vehicleCode}) between logistics hubs.
        </p>

        {error && <div style={errorStyle}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Destination Hub</label>
            <select
              style={inputStyle}
              value={toHubId}
              onChange={(e) => setToHubId(e.target.value)}
              required
            >
              <option value="">Select destination hub...</option>
              {hubs
                .filter((h) => h.id !== vehicle.currentHubId)
                .map((h) => (
                  <option
                    key={h.id}
                    value={h.id}
                    disabled={h.operationalStatus !== 'ACTIVE' || h.availableCapacity <= 0}
                  >
                    {h.name} ({h.code}) — {h.availableCapacity} / {h.capacity} available
                  </option>
                ))}
            </select>
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={labelStyle}>Transfer Reason</label>
            <input
              type="text"
              style={inputStyle}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Seasonal demand rebalance"
            />
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label style={labelStyle}>Operational Notes</label>
            <textarea
              style={{ ...inputStyle, minHeight: '60px' }}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Driver details or transport truck notes..."
            />
          </div>

          <div style={buttonRowStyle}>
            <button type="button" onClick={onClose} style={cancelBtnStyle} disabled={loading}>
              Cancel
            </button>
            <button type="submit" style={submitBtnStyle} disabled={loading || !toHubId}>
              {loading ? 'Dispatching...' : 'Dispatch Transfer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Reusable Styles
const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0,0,0,0.5)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000
};

const modalStyle: React.CSSProperties = {
  backgroundColor: '#ffffff',
  borderRadius: '12px',
  padding: '24px',
  maxWidth: '480px',
  width: '90%',
  boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.875rem',
  fontWeight: 600,
  color: '#374151',
  marginBottom: '6px'
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid #d1d5db',
  fontSize: '0.95rem',
  boxSizing: 'border-box'
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '12px',
  marginTop: '20px'
};

const cancelBtnStyle: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: '8px',
  border: '1px solid #d1d5db',
  backgroundColor: '#ffffff',
  color: '#374151',
  fontWeight: 500,
  cursor: 'pointer'
};

const submitBtnStyle: React.CSSProperties = {
  padding: '10px 18px',
  borderRadius: '8px',
  border: 'none',
  backgroundColor: '#2563eb',
  color: '#ffffff',
  fontWeight: 600,
  cursor: 'pointer'
};

const errorStyle: React.CSSProperties = {
  padding: '10px',
  borderRadius: '8px',
  backgroundColor: '#fef2f2',
  color: '#dc2626',
  fontSize: '0.875rem',
  marginBottom: '14px',
  border: '1px solid #fecaca'
};
