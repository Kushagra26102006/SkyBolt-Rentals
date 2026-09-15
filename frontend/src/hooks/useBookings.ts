import { useState, useEffect, useCallback } from 'react';
import { BookingDTO, BookingListQuery, CancellationReason } from '../types/booking.types';
import { bookingService } from '../services/booking.service';

export function useBookings(initialQuery?: BookingListQuery) {
  const [bookings, setBookings] = useState<BookingDTO[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }>({ page: 1, limit: 20, total: 0, totalPages: 1 });

  const fetchBookings = useCallback(
    async (query?: BookingListQuery) => {
      setLoading(true);
      setError(null);
      try {
        const response = await bookingService.getMyBookings(query || initialQuery);
        setBookings(response.data);
        setMeta(response.meta);
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to load bookings';
        setError(message);
      } finally {
        setLoading(false);
      }
    },
    [initialQuery]
  );

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const cancelBooking = async (
    bookingId: string,
    reason: CancellationReason = 'CUSTOMER_REQUEST',
    notes?: string
  ): Promise<boolean> => {
    try {
      const updated = await bookingService.cancelBooking(bookingId, { reason, notes });
      setBookings((prev) =>
        prev.map((b) => (b.id === bookingId ? updated : b))
      );
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Cancellation failed';
      setError(message);
      return false;
    }
  };

  return {
    bookings,
    loading,
    error,
    meta,
    refetch: fetchBookings,
    cancelBooking
  };
}

export default useBookings;
