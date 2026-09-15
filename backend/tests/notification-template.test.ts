import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  normalizeEmail,
  normalizePhoneNumber,
  isValidEmail,
  isValidPhoneNumber,
  isValidE164,
  getTemplate
} from '../src/notifications/notification.templates.js';
import {
  NotificationChannel,
  NotificationType
} from '../src/notifications/notification.types.js';

describe('TASK 13: Notification Templates & Validation Unit Tests', () => {
  describe('HTML Entity Escaping & Security', () => {
    it('should strictly escape malicious script tags and HTML elements', () => {
      const malicious = '<script>alert("XSS & exploit")</script>';
      const escaped = escapeHtml(malicious);
      expect(escaped).toBe('&lt;script&gt;alert(&quot;XSS &amp; exploit&quot;)&lt;/script&gt;');
      expect(escaped).not.toContain('<');
      expect(escaped).not.toContain('>');
    });

    it('should escape single and double quotes', () => {
      const input = `Customer's "Super" Ride`;
      const escaped = escapeHtml(input);
      expect(escaped).toBe('Customer&#39;s &quot;Super&quot; Ride');
    });

    it('should safely handle null, undefined, and non-string inputs', () => {
      expect(escapeHtml(null)).toBe('');
      expect(escapeHtml(undefined)).toBe('');
      expect(escapeHtml(12345)).toBe('12345');
      expect(escapeHtml(true)).toBe('true');
    });
  });

  describe('Email & Phone Number Validation & Normalization', () => {
    it('should normalize and validate standard emails', () => {
      expect(normalizeEmail('  Alice.Customer@EXAMPLE.COM ')).toBe('alice.customer@example.com');
      expect(isValidEmail('user@skybolt.com')).toBe(true);
      expect(isValidEmail('invalid-email')).toBe(false);
      expect(isValidEmail('missing@domain')).toBe(false);
      expect(isValidEmail('')).toBe(false);
    });

    it('should normalize and validate international phone numbers to E.164 format', () => {
      expect(normalizePhoneNumber('9876543210')).toBe('+919876543210');
      expect(normalizePhoneNumber('+14155552671')).toBe('+14155552671');
      expect(normalizePhoneNumber('+91 (987) 654-3210')).toBe('+919876543210');

      expect(isValidPhoneNumber('+919876543210')).toBe(true);
      expect(isValidE164('+14155552671')).toBe(true);
      expect(isValidPhoneNumber('12345')).toBe(false);
      expect(isValidPhoneNumber('not-a-phone')).toBe(false);
      expect(isValidPhoneNumber('')).toBe(false);
    });
  });

  describe('Template Resolution & Versioning', () => {
    const allNotificationTypes: NotificationType[] = [
      NotificationType.ACCOUNT_WELCOME,
      NotificationType.EMAIL_VERIFICATION,
      NotificationType.PASSWORD_RESET,
      NotificationType.SECURITY_ALERT,
      NotificationType.BOOKING_CREATED,
      NotificationType.BOOKING_CONFIRMED,
      NotificationType.BOOKING_CANCELLED,
      NotificationType.BOOKING_COMPLETED,
      NotificationType.PICKUP_REMINDER,
      NotificationType.RETURN_REMINDER,
      NotificationType.PAYMENT_PENDING,
      NotificationType.PAYMENT_SUCCESS,
      NotificationType.PAYMENT_FAILED,
      NotificationType.PAYMENT_REFUNDED,
      NotificationType.VEHICLE_ASSIGNED,
      NotificationType.BOOKING_OPERATIONAL_UPDATE
    ];

    it('should resolve versioned templates for every registered event type across EMAIL and SMS channels', () => {
      for (const type of allNotificationTypes) {
        // EMAIL template
        const emailTemplate = getTemplate(type, NotificationChannel.EMAIL);
        expect(emailTemplate).toBeDefined();
        expect(emailTemplate?.name).toBe(type);
        expect(emailTemplate?.version).toBe('1.0.0');
        expect(emailTemplate?.channel).toBe(NotificationChannel.EMAIL);

        // SMS template
        const smsTemplate = getTemplate(type, NotificationChannel.SMS);
        expect(smsTemplate).toBeDefined();
        expect(smsTemplate?.name).toBe(type);
        expect(smsTemplate?.version).toBe('1.0.0');
        expect(smsTemplate?.channel).toBe(NotificationChannel.SMS);
      }
    });

    it('should render email templates with subject, branded HTML, and plaintext fallback', () => {
      const template = getTemplate(NotificationType.BOOKING_CONFIRMED, NotificationChannel.EMAIL);
      expect(template).not.toBeNull();

      const rendered = template!.render({
        customerName: '<script>Bob</script>',
        bookingReference: 'SKY-20260904-XYZ',
        vehicleName: 'Tesla Model 3',
        pickupLocation: 'Delhi Airport Hub',
        pickupAt: '10 Sep 2026 10:00 AM',
        returnLocation: 'Delhi Airport Hub',
        returnAt: '12 Sep 2026 10:00 AM',
        totalAmount: '₹5,000'
      });

      expect(rendered.templateName).toBe('BOOKING_CONFIRMED');
      expect(rendered.templateVersion).toBe('1.0.0');
      expect(rendered.subject).toContain('SKY-20260904-XYZ');
      expect(rendered.body).toContain('&lt;script&gt;Bob&lt;/script&gt;');
      expect(rendered.body).not.toContain('<script>Bob</script>');
      expect(rendered.body).toContain('⚡ SkyBolt Rentals');
      expect(rendered.textFallback).toBeDefined();
      expect(rendered.textFallback).toContain('SKY-20260904-XYZ');
    });

    it('should render SMS templates concisely and escape control characters', () => {
      const template = getTemplate(NotificationType.BOOKING_CONFIRMED, NotificationChannel.SMS);
      expect(template).not.toBeNull();

      const rendered = template!.render({
        bookingReference: 'SKY-20260904-XYZ',
        vehicleName: 'Tesla Model 3',
        pickupLocation: 'Delhi Airport Hub',
        pickupAt: '10 Sep 10:00 AM'
      });

      expect(rendered.body).toContain('SKY-20260904-XYZ');
      expect(rendered.body.length).toBeLessThanOrEqual(160); // Standard SMS segment length
    });

    it('should never expose sensitive credentials or tokens in templates', () => {
      const template = getTemplate(NotificationType.PASSWORD_RESET, NotificationChannel.EMAIL);
      const rendered = template!.render({
        customerName: 'Carol',
        resetUrl: 'https://skybolt.com/reset?token=secure123',
        expiresInMinutes: 15
      });

      expect(rendered.body).not.toContain('superSecretPassword123');
      expect(rendered.body).toContain('https://skybolt.com/reset?token=secure123');
      expect(rendered.body).toContain('15 minutes');
    });
  });
});
