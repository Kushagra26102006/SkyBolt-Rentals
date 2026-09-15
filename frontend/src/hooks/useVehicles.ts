import { useState, useEffect, useCallback } from 'react';
import { VehicleDTO, VehicleQueryFilters, PaginatedVehiclesResult } from '../types/vehicle.types';
import vehicleService from '../services/vehicle.service';

export function useVehicles(initialFilters: VehicleQueryFilters = {}) {
  const [vehicles, setVehicles] = useState<VehicleDTO[]>([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 12,
    total: 0,
    totalPages: 0
  });
  const [filters, setFilters] = useState<VehicleQueryFilters>(initialFilters);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchVehicles = useCallback(async (activeFilters: VehicleQueryFilters = filters) => {
    setIsLoading(true);
    setError(null);
    try {
      const data: PaginatedVehiclesResult = await vehicleService.getVehicles(activeFilters);
      setVehicles(data.items);
      setPagination(data.pagination);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch vehicles');
      setVehicles([]);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchVehicles(filters);
  }, [filters, fetchVehicles]);

  const updateFilters = (newFilters: Partial<VehicleQueryFilters>) => {
    setFilters(prev => ({ ...prev, ...newFilters, page: newFilters.page ?? 1 }));
  };

  const resetFilters = () => {
    setFilters({ page: 1, limit: 12 });
  };

  return {
    vehicles,
    pagination,
    filters,
    isLoading,
    error,
    refetch: fetchVehicles,
    updateFilters,
    resetFilters
  };
}
