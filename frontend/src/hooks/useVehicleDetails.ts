import { useState, useEffect, useCallback } from 'react';
import { VehicleDTO } from '../types/vehicle.types';
import vehicleService from '../services/vehicle.service';

export function useVehicleDetails(vehicleIdOrCode: string | null | undefined) {
  const [vehicle, setVehicle] = useState<VehicleDTO | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    if (!vehicleIdOrCode) {
      setVehicle(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const data = await vehicleService.getVehicleById(vehicleIdOrCode);
      setVehicle(data);
    } catch (err: any) {
      setError(err.message || 'Vehicle not found');
      setVehicle(null);
    } finally {
      setIsLoading(false);
    }
  }, [vehicleIdOrCode]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  return {
    vehicle,
    isLoading,
    error,
    refetch: fetchDetails
  };
}
