import { useState, useEffect, useCallback } from 'react';
import { adminService } from '../services/admin.service';
import { OverviewMetrics, OperationalAlert } from '../types/admin.types';

export function useAdminDashboard() {
  const [metrics, setMetrics] = useState<OverviewMetrics | null>(null);
  const [alerts, setAlerts] = useState<OperationalAlert[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await adminService.getOverview();
      setMetrics(data);
      setAlerts(data.alerts || []);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch admin overview');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  return {
    metrics,
    alerts,
    isLoading,
    error,
    refreshOverview: fetchOverview
  };
}
