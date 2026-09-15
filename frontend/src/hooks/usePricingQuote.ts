import { useState, useEffect, useRef } from 'react';
import { PricingQuoteDTO, PricingQuoteRequest } from '../types/pricing.types';
import { pricingService } from '../services/pricing.service';

export function usePricingQuote(request: PricingQuoteRequest | null, debounceMs = 300) {
  const [quote, setQuote] = useState<PricingQuoteDTO | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!request || !request.vehicleId || !request.pickupAt || !request.returnAt) {
      setQuote(null);
      setLoading(false);
      setError(null);
      return;
    }

    const p = new Date(request.pickupAt);
    const r = new Date(request.returnAt);
    if (isNaN(p.getTime()) || isNaN(r.getTime()) || p >= r) {
      setQuote(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }

    timerRef.current = setTimeout(async () => {
      try {
        const result = await pricingService.getQuote(request);
        setQuote(result);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to fetch price quote';
        setError(message);
        setQuote(null);
      } finally {
        setLoading(false);
      }
    }, debounceMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [
    request?.vehicleId,
    request?.pickupAt,
    request?.returnAt,
    request?.couponCode,
    debounceMs
  ]);

  return { quote, loading, error };
}

export default usePricingQuote;
