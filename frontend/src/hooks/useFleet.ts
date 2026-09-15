import { useState, useEffect, useCallback } from 'react';
import { fleetService } from '../services/fleet.service';
import { FleetListQuery, FleetStatus } from '../types/fleet.types';
import { VehicleDTO } from '../types/vehicle.types';

export function useFleet(initialQuery: FleetListQuery = {}) {
  const [vehicles, setVehicles] = useState<VehicleDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<FleetListQuery>(initialQuery);
  const [meta, setMeta] = useState({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const fetchFleet = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fleetService.getFleet(query);
      setVehicles(res.data);
      setMeta(res.meta);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load fleet inventory');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  const updateStatus = async (vehicleId: string, status: FleetStatus, reason?: string) => {
    try {
      await fleetService.updateStatus(vehicleId, status, reason);
      await fetchFleet();
    } catch (err) {
      throw err;
    }
  };

  const assignHub = async (vehicleId: string, hubId: string) => {
    try {
      await fleetService.assignHub(vehicleId, hubId);
      await fetchFleet();
    } catch (err) {
      throw err;
    }
  };

  const removeHub = async (vehicleId: string) => {
    try {
      await fleetService.removeHub(vehicleId);
      await fetchFleet();
    } catch (err) {
      throw err;
    }
  };

  return {
    vehicles,
    loading,
    error,
    meta,
    query,
    setQuery,
    refetch: fetchFleet,
    updateStatus,
    assignHub,
    removeHub
  };
}
