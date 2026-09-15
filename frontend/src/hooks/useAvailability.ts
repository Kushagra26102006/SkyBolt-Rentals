import { useState, useEffect, useCallback, useRef } from 'react';
import { AvailabilityResult } from '../types/availability.types';
import availabilityService from '../services/availability.service';

export function useAvailability(
  vehicleId: string | null | undefined,
  pickupAt: string | null | undefined,
  returnAt: string | null | undefined,
  debounceMs = 400
) {
  const [result, setResult] = useState<AvailabilityResult | null>(null);
  const [isChecking, setIsChecking] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const check = useCallback(async () => {
    if (!vehicleId || !pickupAt || !returnAt) {
      setResult(null);
      setIsChecking(false);
      setError(null);
      return;
    }

    const pickupDate = new Date(pickupAt);
    const returnDate = new Date(returnAt);

    if (isNaN(pickupDate.getTime()) || isNaN(returnDate.getTime()) || pickupDate >= returnDate) {
      setResult(null);
      setIsChecking(false);
      return;
    }

    setIsChecking(true);
    setError(null);

    try {
      const data = await availabilityService.checkAvailability(vehicleId, {
        pickupAt,
        returnAt
      });
      setResult(data);
    } catch (err: any) {
      setError(err.message || 'Failed to check availability');
      setResult(null);
    } finally {
      setIsChecking(false);
    }
  }, [vehicleId, pickupAt, returnAt]);

  useEffect(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      check();
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [check, debounceMs]);

  return {
    isAvailable: result?.available ?? null,
    reason: result?.reason ?? null,
    isChecking,
    error,
    refetch: check
  };
}
