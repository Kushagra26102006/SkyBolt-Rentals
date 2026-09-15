import { PaymentModel } from '../models/payment.model.js';
import { BookingModel } from '../models/booking.model.js';

export interface ReconciliationDiscrepancy {
  type:
    | 'CAPTURED_PAYMENT_UNCONFIRMED_BOOKING'
    | 'CONFIRMED_BOOKING_UNPAID'
    | 'AMOUNT_MISMATCH'
    | 'CURRENCY_MISMATCH'
    | 'STALE_ORDER_CREATED';
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  paymentId?: string;
  paymentReference?: string;
  bookingId?: string;
  bookingReference?: string;
  details: string;
}

/**
 * Payment Reconciliation Service
 * Architectural foundation for identifying discrepancies between provider states,
 * local payment records, and booking confirmation states.
 */
export class PaymentReconciliationService {
  /**
   * Scans database for consistency violations
   */
  public async detectDiscrepancies(): Promise<ReconciliationDiscrepancy[]> {
    const discrepancies: ReconciliationDiscrepancy[] = [];

    // 1. Captured payments where associated booking is NOT confirmed
    const capturedPayments = await PaymentModel.find({ status: 'CAPTURED' }).exec();
    for (const payment of capturedPayments) {
      const booking = await BookingModel.findById(payment.bookingId).exec();
      if (!booking) {
        discrepancies.push({
          type: 'CAPTURED_PAYMENT_UNCONFIRMED_BOOKING',
          severity: 'HIGH',
          paymentId: payment._id.toString(),
          paymentReference: payment.paymentReference,
          details: `Payment is CAPTURED but associated booking ${payment.bookingId} is missing.`
        });
      } else if (booking.status !== 'CONFIRMED' && booking.status !== 'ACTIVE' && booking.status !== 'COMPLETED') {
        discrepancies.push({
          type: 'CAPTURED_PAYMENT_UNCONFIRMED_BOOKING',
          severity: 'HIGH',
          paymentId: payment._id.toString(),
          paymentReference: payment.paymentReference,
          bookingId: booking._id.toString(),
          bookingReference: booking.bookingReference,
          details: `Payment is CAPTURED but booking status is "${booking.status}" (expected CONFIRMED).`
        });
      }

      // Check amount alignment
      if (booking) {
        const expectedPaise = Math.round(booking.pricingSnapshot.total * 100);
        if (payment.amountPaise !== expectedPaise) {
          discrepancies.push({
            type: 'AMOUNT_MISMATCH',
            severity: 'HIGH',
            paymentId: payment._id.toString(),
            paymentReference: payment.paymentReference,
            bookingId: booking._id.toString(),
            bookingReference: booking.bookingReference,
            details: `Payment amount (${payment.amountPaise} paise) does not equal booking total (${expectedPaise} paise).`
          });
        }
      }
    }

    // 2. Confirmed bookings where payment status is UNPAID or FAILED
    const confirmedBookings = await BookingModel.find({
      status: 'CONFIRMED',
      paymentStatus: { $in: ['UNPAID', 'FAILED'] }
    }).exec();

    for (const booking of confirmedBookings) {
      discrepancies.push({
        type: 'CONFIRMED_BOOKING_UNPAID',
        severity: 'HIGH',
        bookingId: booking._id.toString(),
        bookingReference: booking.bookingReference,
        details: `Booking is CONFIRMED but paymentStatus is "${booking.paymentStatus}".`
      });
    }

    return discrepancies;
  }
}

export const paymentReconciliationService = new PaymentReconciliationService();
export default paymentReconciliationService;
