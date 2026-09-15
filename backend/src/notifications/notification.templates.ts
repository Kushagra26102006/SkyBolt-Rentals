import { NotificationChannel, NotificationType } from './notification.types.js';

/**
 * Strict HTML entity encoding to prevent template injection and cross-site scripting
 */
export function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Normalizes phone numbers to standard E.164 format
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  // If standard 10-digit Indian number, default to +91 country code
  if (cleaned.length === 10) return `+91${cleaned}`;
  return `+${cleaned}`;
}

/**
 * Validates normalized phone number syntax
 */
export function isValidPhoneNumber(phone: string): boolean {
  if (!phone) return false;
  return /^\+[1-9]\d{6,14}$/.test(phone);
}
export const isValidE164 = isValidPhoneNumber;

/**
 * Normalizes email address
 */
export function normalizeEmail(email: string): string {
  return (email || '').toLowerCase().trim();
}

/**
 * Validates email format
 */
export function isValidEmail(email: string): boolean {
  if (!email) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email.trim());
}

export interface RenderedNotificationContent {
  templateName: string;
  templateVersion: string;
  subject?: string;
  body: string; // HTML for email, text for SMS
  textFallback?: string; // Plaintext for email
}

export interface TemplateDefinition {
  name: string;
  version: string;
  channel: NotificationChannel;
  render: (context: Record<string, any>) => RenderedNotificationContent;
}

const TEMPLATE_VERSION = '1.0.0';

/**
 * Wraps HTML email content inside consistent, responsive SkyBolt branded boilerplate
 */
function wrapEmailHtml(title: string, contentHtml: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.6; }
    .wrapper { width: 100%; max-width: 600px; margin: 24px auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #1e3a8a, #2563eb); padding: 28px 24px; text-align: center; }
    .logo-text { color: #ffffff; font-size: 24px; font-weight: 800; letter-spacing: -0.5px; margin: 0; }
    .body { padding: 32px 24px; }
    .footer { background-color: #f1f5f9; padding: 20px 24px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0; }
    .card { background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .badge { display: inline-block; padding: 4px 10px; font-size: 12px; font-weight: 700; border-radius: 9999px; background-color: #dbeafe; color: #1d4ed8; text-transform: uppercase; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff; text-decoration: none; padding: 12px 24px; font-weight: 600; border-radius: 8px; margin: 16px 0; }
    .row { display: flex; justify-content: space-between; margin: 8px 0; font-size: 14px; }
    .muted { color: #64748b; }
  </style>
</head>
<body>
  <div class="wrapper">
    <div class="header">
      <h1 class="logo-text">⚡ SkyBolt Rentals</h1>
    </div>
    <div class="body">
      ${contentHtml}
    </div>
    <div class="footer">
      <p style="margin: 0 0 8px 0;">SkyBolt Rentals Platform • Move freely. Rent smarter.</p>
      <p style="margin: 0;">Automated transactional notice. Replies to this email are not monitored.</p>
    </div>
  </div>
</body>
</html>`;
}

/**
 * Centralized Template Registry
 */
export const templateRegistry: Record<string, TemplateDefinition> = {
  // ---------------------------------------------------------------------------
  // 1. ACCOUNT_WELCOME
  // ---------------------------------------------------------------------------
  'ACCOUNT_WELCOME:EMAIL': {
    name: 'ACCOUNT_WELCOME',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.customerName || ctx.name || 'Valued Customer');
      const email = escapeHtml(ctx.email || '');
      const subject = 'Welcome to SkyBolt Rentals!';
      const html = wrapEmailHtml(subject, `
        <h2>Welcome to SkyBolt Rentals, ${name}!</h2>
        <p>Your account has been created successfully with email <strong>${email}</strong>.</p>
        <p>You can now browse our verified fleet, make reservations across our city logistics hubs, and manage your trips from your dashboard.</p>
        <div class="card">
          <h4 style="margin: 0 0 8px 0;">Getting Started</h4>
          <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #475569;">
            <li>Browse verified cars, bikes, and premium e-scooters.</li>
            <li>Select your pickup hub and dates with live inventory lock.</li>
            <li>Experience 100% transparent pricing with zero surprise charges.</li>
          </ul>
        </div>
      `);
      const text = `Welcome to SkyBolt Rentals, ${name}!\n\nYour account has been created with email ${email}.\nYou can now browse our fleet and manage your rentals at SkyBolt.`;
      return { templateName: 'ACCOUNT_WELCOME', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'ACCOUNT_WELCOME:SMS': {
    name: 'ACCOUNT_WELCOME',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const name = (ctx.customerName || ctx.name || 'Customer').substring(0, 20);
      return {
        templateName: 'ACCOUNT_WELCOME',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt: Welcome ${name}! Your account is active. Browse verified rides anytime at SkyBolt Rentals.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 2. EMAIL_VERIFICATION
  // ---------------------------------------------------------------------------
  'EMAIL_VERIFICATION:EMAIL': {
    name: 'EMAIL_VERIFICATION',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.name || 'Customer');
      const verifyUrl = escapeHtml(ctx.verifyUrl || '#');
      const subject = 'Verify your SkyBolt Rentals email address';
      const html = wrapEmailHtml(subject, `
        <h2>Verify Your Email Address</h2>
        <p>Hello ${name},</p>
        <p>Please confirm your email address by clicking the verification button below:</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${verifyUrl}" class="btn" style="color: #ffffff;">Verify My Email</a>
        </div>
        <p class="muted" style="font-size: 13px;">This verification link will expire in 24 hours. If you did not sign up for SkyBolt Rentals, you can safely ignore this email.</p>
      `);
      const text = `Hello ${name},\nPlease verify your email by visiting: ${ctx.verifyUrl || ''}\nThis link expires in 24 hours.`;
      return { templateName: 'EMAIL_VERIFICATION', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'EMAIL_VERIFICATION:SMS': {
    name: 'EMAIL_VERIFICATION',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (_ctx) => {
      return {
        templateName: 'EMAIL_VERIFICATION',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt: Please check your inbox to verify your email address. Link expires in 24 hours.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 3. PASSWORD_RESET
  // ---------------------------------------------------------------------------
  'PASSWORD_RESET:EMAIL': {
    name: 'PASSWORD_RESET',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.name || 'Customer');
      const resetUrl = escapeHtml(ctx.resetUrl || '#');
      const subject = 'Password Reset Request — SkyBolt Rentals';
      const html = wrapEmailHtml(subject, `
        <h2>Password Reset Request</h2>
        <p>Hello ${name},</p>
        <p>We received a request to reset the password for your SkyBolt account. Click the button below to choose a new password:</p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${resetUrl}" class="btn" style="color: #ffffff;">Reset Password</a>
        </div>
        <p class="muted" style="font-size: 13px;">For your security, this single-use link will expire in 15 minutes. If you did not request a password reset, please contact support immediately.</p>
      `);
      const text = `Hello ${name},\nReset your password here: ${ctx.resetUrl || ''}\nThis single-use link expires in 15 minutes.`;
      return { templateName: 'PASSWORD_RESET', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'PASSWORD_RESET:SMS': {
    name: 'PASSWORD_RESET',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: () => {
      return {
        templateName: 'PASSWORD_RESET',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt Security: A password reset request was initiated for your account. If this was not you, contact support immediately.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 4. SECURITY_ALERT
  // ---------------------------------------------------------------------------
  'SECURITY_ALERT:EMAIL': {
    name: 'SECURITY_ALERT',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.name || 'Customer');
      const action = escapeHtml(ctx.action || 'Account Security Update');
      const time = escapeHtml(ctx.timestamp || new Date().toUTCString());
      const subject = `Security Alert: ${action}`;
      const html = wrapEmailHtml(subject, `
        <h2>Security Notice</h2>
        <p>Hello ${name},</p>
        <p>A security event was recorded on your SkyBolt account:</p>
        <div class="card">
          <div class="row"><span>Event:</span><strong>${action}</strong></div>
          <div class="row"><span>Time:</span><span>${time}</span></div>
        </div>
        <p class="muted" style="font-size: 13px;">If you authorized this change, no further action is required. If you did not authorize this, please reset your password immediately.</p>
      `);
      const text = `Security Notice for ${name}:\nEvent: ${ctx.action}\nTime: ${ctx.timestamp}\nIf unauthorized, reset your password immediately.`;
      return { templateName: 'SECURITY_ALERT', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'SECURITY_ALERT:SMS': {
    name: 'SECURITY_ALERT',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const action = (ctx.action || 'Password updated').substring(0, 30);
      return {
        templateName: 'SECURITY_ALERT',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt Security Alert: ${action} on your account. If this was not you, reset your password immediately.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 5. BOOKING_CREATED
  // ---------------------------------------------------------------------------
  'BOOKING_CREATED:EMAIL': {
    name: 'BOOKING_CREATED',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.customerName || 'Customer');
      const ref = escapeHtml(ctx.bookingReference || '');
      const vehicle = escapeHtml(ctx.vehicleName || 'Reserved Vehicle');
      const pickup = escapeHtml(ctx.pickupAt ? new Date(ctx.pickupAt).toLocaleString() : '');
      const returnAt = escapeHtml(ctx.returnAt ? new Date(ctx.returnAt).toLocaleString() : '');
      const hub = escapeHtml(ctx.hubName || ctx.pickupLocation || 'Central Hub');
      const total = escapeHtml(String(ctx.totalAmount || ctx.total || 0));
      const subject = `Reservation Hold Placed: ${ref}`;
      const html = wrapEmailHtml(subject, `
        <h2>Reservation Hold Placed</h2>
        <p>Hello ${name},</p>
        <p>Your vehicle reservation hold has been created. Complete payment to confirm your booking.</p>
        <div class="card">
          <div class="row"><span>Reference:</span><strong>${ref}</strong></div>
          <div class="row"><span>Vehicle:</span><strong>${vehicle}</strong></div>
          <div class="row"><span>Pickup Hub:</span><span>${hub}</span></div>
          <div class="row"><span>Pickup Date:</span><span>${pickup}</span></div>
          <div class="row"><span>Return Date:</span><span>${returnAt}</span></div>
          <div class="row" style="border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 8px;">
            <span>Total Estimated:</span><strong>₹${total}</strong>
          </div>
        </div>
      `);
      const text = `Reservation hold placed: ${ref}\nVehicle: ${ctx.vehicleName}\nPickup: ${hub} at ${pickup}\nTotal: ₹${total}`;
      return { templateName: 'BOOKING_CREATED', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'BOOKING_CREATED:SMS': {
    name: 'BOOKING_CREATED',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const ref = (ctx.bookingReference || '').substring(0, 16);
      const vehicle = (ctx.vehicleName || 'Vehicle').substring(0, 20);
      return {
        templateName: 'BOOKING_CREATED',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt: Reservation hold ${ref} created for ${vehicle}. Complete payment in dashboard to confirm.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 6. BOOKING_CONFIRMED
  // ---------------------------------------------------------------------------
  'BOOKING_CONFIRMED:EMAIL': {
    name: 'BOOKING_CONFIRMED',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.customerName || 'Customer');
      const ref = escapeHtml(ctx.bookingReference || '');
      const vehicle = escapeHtml(ctx.vehicleName || 'Vehicle');
      const pickup = escapeHtml(ctx.pickupAt ? new Date(ctx.pickupAt).toLocaleString() : '');
      const returnAt = escapeHtml(ctx.returnAt ? new Date(ctx.returnAt).toLocaleString() : '');
      const hub = escapeHtml(ctx.hubName || ctx.pickupLocation || 'Hub');
      const total = escapeHtml(String(ctx.totalAmount || ctx.total || 0));
      const subject = `Booking Confirmed: ${ref} — ${vehicle}`;
      const html = wrapEmailHtml(subject, `
        <h2><span class="badge" style="background-color: #dcfce7; color: #15803d;">Confirmed</span> Booking Confirmation</h2>
        <p>Hello ${name},</p>
        <p>Your booking is officially confirmed and your vehicle is locked in our inventory.</p>
        <div class="card">
          <div class="row"><span>Booking Reference:</span><strong style="color: #2563eb;">${ref}</strong></div>
          <div class="row"><span>Vehicle:</span><strong>${vehicle}</strong></div>
          <div class="row"><span>Pickup Hub:</span><span>${hub}</span></div>
          <div class="row"><span>Pickup Time:</span><span>${pickup}</span></div>
          <div class="row"><span>Return Time:</span><span>${returnAt}</span></div>
          <div class="row" style="border-top: 1px solid #e2e8f0; padding-top: 8px; margin-top: 8px;">
            <span>Total Paid:</span><strong style="color: #059669;">₹${total}</strong>
          </div>
        </div>
        <p>Please present your driving license and booking reference at the pickup counter.</p>
      `);
      const text = `Booking Confirmed: ${ref}\nVehicle: ${ctx.vehicleName}\nPickup: ${hub} on ${pickup}\nReturn: ${returnAt}\nTotal Paid: ₹${total}`;
      return { templateName: 'BOOKING_CONFIRMED', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'BOOKING_CONFIRMED:SMS': {
    name: 'BOOKING_CONFIRMED',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const ref = (ctx.bookingReference || '').substring(0, 16);
      const vehicle = (ctx.vehicleName || 'Vehicle').substring(0, 20);
      const hub = (ctx.hubName || 'Hub').substring(0, 15);
      return {
        templateName: 'BOOKING_CONFIRMED',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt: Booking ${ref} confirmed for ${vehicle}! Pickup at ${hub}. Have your driving license ready.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 7. BOOKING_CANCELLED
  // ---------------------------------------------------------------------------
  'BOOKING_CANCELLED:EMAIL': {
    name: 'BOOKING_CANCELLED',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.customerName || 'Customer');
      const ref = escapeHtml(ctx.bookingReference || '');
      const reason = escapeHtml(ctx.reason || 'Customer request');
      const subject = `Booking Cancelled: ${ref}`;
      const html = wrapEmailHtml(subject, `
        <h2>Booking Cancelled</h2>
        <p>Hello ${name},</p>
        <p>Your booking with reference <strong>${ref}</strong> has been cancelled.</p>
        <div class="card">
          <div class="row"><span>Reference:</span><strong>${ref}</strong></div>
          <div class="row"><span>Reason:</span><span>${reason}</span></div>
          <div class="row"><span>Status:</span><span style="color: #dc2626; font-weight: 700;">CANCELLED</span></div>
        </div>
        <p>If applicable, any refundable balance will be credited to your original payment method within 5-7 business days.</p>
      `);
      const text = `Booking Cancelled: ${ref}\nReason: ${ctx.reason || 'Customer request'}\nRefunds (if applicable) will be processed in 5-7 days.`;
      return { templateName: 'BOOKING_CANCELLED', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'BOOKING_CANCELLED:SMS': {
    name: 'BOOKING_CANCELLED',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const ref = (ctx.bookingReference || '').substring(0, 16);
      return {
        templateName: 'BOOKING_CANCELLED',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt: Booking ${ref} has been cancelled. Any eligible refund will be credited to original payment source.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 8. BOOKING_COMPLETED
  // ---------------------------------------------------------------------------
  'BOOKING_COMPLETED:EMAIL': {
    name: 'BOOKING_COMPLETED',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.customerName || 'Customer');
      const ref = escapeHtml(ctx.bookingReference || '');
      const vehicle = escapeHtml(ctx.vehicleName || 'Vehicle');
      const subject = `Trip Completed: ${ref} — Thank you for riding with SkyBolt!`;
      const html = wrapEmailHtml(subject, `
        <h2>Trip Completed</h2>
        <p>Hello ${name},</p>
        <p>Your rental of <strong>${vehicle}</strong> has been successfully returned and marked as completed.</p>
        <div class="card">
          <div class="row"><span>Booking Reference:</span><strong>${ref}</strong></div>
          <div class="row"><span>Return Inspection:</span><span style="color: #16a34a; font-weight: 700;">PASSED</span></div>
          <div class="row"><span>Security Deposit:</span><span>Refund release initiated</span></div>
        </div>
        <p>We hope you had a smooth ride! We look forward to seeing you again soon.</p>
      `);
      const text = `Trip Completed: ${ref} (${ctx.vehicleName}). Return inspection passed. Security deposit release initiated. Thank you for riding with SkyBolt!`;
      return { templateName: 'BOOKING_COMPLETED', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'BOOKING_COMPLETED:SMS': {
    name: 'BOOKING_COMPLETED',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const ref = (ctx.bookingReference || '').substring(0, 16);
      return {
        templateName: 'BOOKING_COMPLETED',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt: Trip ${ref} completed! Return verified. Security deposit release initiated. Thank you!`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 9. PAYMENT_PENDING
  // ---------------------------------------------------------------------------
  'PAYMENT_PENDING:EMAIL': {
    name: 'PAYMENT_PENDING',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const ref = escapeHtml(ctx.bookingReference || '');
      const amount = escapeHtml(String(ctx.amount || 0));
      const subject = `Payment Pending: ${ref}`;
      const html = wrapEmailHtml(subject, `
        <h2>Payment Pending</h2>
        <p>Your payment of <strong>₹${amount}</strong> for reservation <strong>${ref}</strong> is pending confirmation.</p>
        <p>If your bank transaction succeeded, your booking will be confirmed automatically within minutes.</p>
      `);
      const text = `Payment pending: ₹${ctx.amount} for booking ${ref}. Confirmation will follow shortly.`;
      return { templateName: 'PAYMENT_PENDING', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'PAYMENT_PENDING:SMS': {
    name: 'PAYMENT_PENDING',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const ref = (ctx.bookingReference || '').substring(0, 16);
      const amount = ctx.amount || 0;
      return {
        templateName: 'PAYMENT_PENDING',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt: Payment of ₹${amount} for booking ${ref} is pending confirmation. Details in your dashboard.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 10. PAYMENT_SUCCESS
  // ---------------------------------------------------------------------------
  'PAYMENT_SUCCESS:EMAIL': {
    name: 'PAYMENT_SUCCESS',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.customerName || 'Customer');
      const ref = escapeHtml(ctx.paymentReference || ctx.bookingReference || '');
      const amount = escapeHtml(String(ctx.amount || 0));
      const method = escapeHtml(ctx.method || 'Online');
      const subject = `Payment Receipt: ₹${amount} — ${ref}`;
      const html = wrapEmailHtml(subject, `
        <h2>Payment Receipt</h2>
        <p>Hello ${name},</p>
        <p>We received your payment of <strong>₹${amount}</strong>. Your transaction has been verified successfully.</p>
        <div class="card">
          <div class="row"><span>Payment Ref:</span><strong>${ref}</strong></div>
          <div class="row"><span>Amount Paid:</span><strong>₹${amount}</strong></div>
          <div class="row"><span>Payment Mode:</span><span>${method}</span></div>
          <div class="row"><span>Status:</span><span style="color: #16a34a; font-weight: 700;">CAPTURED</span></div>
        </div>
      `);
      const text = `Payment Receipt: ₹${amount} received for ref ${ref}. Method: ${method}. Thank you!`;
      return { templateName: 'PAYMENT_SUCCESS', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'PAYMENT_SUCCESS:SMS': {
    name: 'PAYMENT_SUCCESS',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const ref = (ctx.paymentReference || ctx.bookingReference || '').substring(0, 16);
      const amount = ctx.amount || 0;
      return {
        templateName: 'PAYMENT_SUCCESS',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt: Payment of ₹${amount} for ${ref} was successful! View tax invoice in your dashboard.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 11. PAYMENT_FAILED
  // ---------------------------------------------------------------------------
  'PAYMENT_FAILED:EMAIL': {
    name: 'PAYMENT_FAILED',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.customerName || 'Customer');
      const ref = escapeHtml(ctx.bookingReference || '');
      const reason = escapeHtml(ctx.failureReason || 'Bank or gateway declined');
      const subject = `Payment Unsuccessful: ${ref}`;
      const html = wrapEmailHtml(subject, `
        <h2>Payment Unsuccessful</h2>
        <p>Hello ${name},</p>
        <p>Your payment attempt for booking <strong>${ref}</strong> was not completed.</p>
        <div class="card">
          <div class="row"><span>Booking Ref:</span><strong>${ref}</strong></div>
          <div class="row"><span>Failure Reason:</span><span>${reason}</span></div>
        </div>
        <p>You can retry payment from your SkyBolt dashboard anytime within your reservation window.</p>
      `);
      const text = `Payment unsuccessful for booking ${ref}. Reason: ${ctx.failureReason || 'Declined'}. You can retry in dashboard.`;
      return { templateName: 'PAYMENT_FAILED', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'PAYMENT_FAILED:SMS': {
    name: 'PAYMENT_FAILED',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const ref = (ctx.bookingReference || ctx.paymentReference || '').substring(0, 16);
      return {
        templateName: 'PAYMENT_FAILED',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt: Payment attempt for booking ${ref} was unsuccessful. You can retry anytime from your dashboard.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 12. PAYMENT_REFUNDED
  // ---------------------------------------------------------------------------
  'PAYMENT_REFUNDED:EMAIL': {
    name: 'PAYMENT_REFUNDED',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.customerName || 'Customer');
      const ref = escapeHtml(ctx.paymentReference || ctx.bookingReference || '');
      const amount = escapeHtml(String(ctx.amount || 0));
      const subject = `Refund Processed: ₹${amount} — ${ref}`;
      const html = wrapEmailHtml(subject, `
        <h2>Refund Processed</h2>
        <p>Hello ${name},</p>
        <p>A refund of <strong>₹${amount}</strong> for reference <strong>${ref}</strong> has been issued.</p>
        <div class="card">
          <div class="row"><span>Refund Amount:</span><strong>₹${amount}</strong></div>
          <div class="row"><span>Reference:</span><span>${ref}</span></div>
          <div class="row"><span>Timeline:</span><span>5-7 business days</span></div>
        </div>
      `);
      const text = `Refund Processed: ₹${amount} for ref ${ref}. It will reflect in your account within 5-7 business days.`;
      return { templateName: 'PAYMENT_REFUNDED', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'PAYMENT_REFUNDED:SMS': {
    name: 'PAYMENT_REFUNDED',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const ref = (ctx.paymentReference || ctx.bookingReference || '').substring(0, 16);
      const amount = ctx.amount || 0;
      return {
        templateName: 'PAYMENT_REFUNDED',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt: Refund of ₹${amount} for ${ref} has been issued. Credits will reflect in 5-7 business days.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 13. PICKUP_REMINDER
  // ---------------------------------------------------------------------------
  'PICKUP_REMINDER:EMAIL': {
    name: 'PICKUP_REMINDER',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.customerName || 'Customer');
      const ref = escapeHtml(ctx.bookingReference || '');
      const vehicle = escapeHtml(ctx.vehicleName || 'Vehicle');
      const pickupTime = escapeHtml(ctx.pickupAt ? new Date(ctx.pickupAt).toLocaleString() : '');
      const hub = escapeHtml(ctx.hubName || ctx.pickupLocation || 'Hub');
      const subject = `Pickup Reminder: ${vehicle} on ${pickupTime}`;
      const html = wrapEmailHtml(subject, `
        <h2>Upcoming Pickup Reminder</h2>
        <p>Hello ${name},</p>
        <p>Your reservation <strong>${ref}</strong> is scheduled for pickup soon:</p>
        <div class="card">
          <div class="row"><span>Vehicle:</span><strong>${vehicle}</strong></div>
          <div class="row"><span>Pickup Hub:</span><strong>${hub}</strong></div>
          <div class="row"><span>Scheduled Time:</span><span>${pickupTime}</span></div>
        </div>
        <p>Please remember to bring your physical driving license and government ID.</p>
      `);
      const text = `Pickup Reminder for booking ${ref}: ${vehicle} at ${hub} on ${pickupTime}. Remember to bring your license.`;
      return { templateName: 'PICKUP_REMINDER', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'PICKUP_REMINDER:SMS': {
    name: 'PICKUP_REMINDER',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const ref = (ctx.bookingReference || '').substring(0, 16);
      const hub = (ctx.hubName || 'Hub').substring(0, 15);
      return {
        templateName: 'PICKUP_REMINDER',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt: Reminder! Your ride ${ref} is scheduled for pickup at ${hub}. Please bring your driving license.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 14. RETURN_REMINDER
  // ---------------------------------------------------------------------------
  'RETURN_REMINDER:EMAIL': {
    name: 'RETURN_REMINDER',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.customerName || 'Customer');
      const ref = escapeHtml(ctx.bookingReference || '');
      const vehicle = escapeHtml(ctx.vehicleName || 'Vehicle');
      const returnTime = escapeHtml(ctx.returnAt ? new Date(ctx.returnAt).toLocaleString() : '');
      const hub = escapeHtml(ctx.hubName || ctx.returnLocation || 'Hub');
      const subject = `Return Reminder: ${vehicle} due at ${returnTime}`;
      const html = wrapEmailHtml(subject, `
        <h2>Return Reminder</h2>
        <p>Hello ${name},</p>
        <p>Your vehicle <strong>${vehicle}</strong> (Booking ${ref}) is due for return at <strong>${hub}</strong> by <strong>${returnTime}</strong>.</p>
        <p>Please return with a similar fuel/battery level to avoid adjustment fees.</p>
      `);
      const text = `Return Reminder: ${vehicle} (${ref}) due at ${hub} by ${returnTime}.`;
      return { templateName: 'RETURN_REMINDER', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'RETURN_REMINDER:SMS': {
    name: 'RETURN_REMINDER',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const ref = (ctx.bookingReference || '').substring(0, 16);
      const hub = (ctx.hubName || 'Hub').substring(0, 15);
      return {
        templateName: 'RETURN_REMINDER',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt: Reminder! Your rental ${ref} is due for return at ${hub}. Need an extension? Check your dashboard.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 15. VEHICLE_ASSIGNED
  // ---------------------------------------------------------------------------
  'VEHICLE_ASSIGNED:EMAIL': {
    name: 'VEHICLE_ASSIGNED',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.customerName || 'Customer');
      const ref = escapeHtml(ctx.bookingReference || '');
      const vehicle = escapeHtml(ctx.vehicleName || 'Assigned Vehicle');
      const reg = escapeHtml(ctx.registrationNumber || 'Assigned');
      const subject = `Vehicle Prepared: ${vehicle} (${reg})`;
      const html = wrapEmailHtml(subject, `
        <h2>Your Vehicle is Ready!</h2>
        <p>Hello ${name},</p>
        <p>Your assigned vehicle for booking <strong>${ref}</strong> has passed pre-rental inspection and is staged for you.</p>
        <div class="card">
          <div class="row"><span>Vehicle:</span><strong>${vehicle}</strong></div>
          <div class="row"><span>Registration Number:</span><strong>${reg}</strong></div>
          <div class="row"><span>Readiness:</span><span style="color: #16a34a; font-weight: 700;">INSPECTED & CLEANED</span></div>
        </div>
      `);
      const text = `Vehicle Prepared for booking ${ref}: ${vehicle} (${reg}) is inspected and ready at the hub.`;
      return { templateName: 'VEHICLE_ASSIGNED', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'VEHICLE_ASSIGNED:SMS': {
    name: 'VEHICLE_ASSIGNED',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const ref = (ctx.bookingReference || '').substring(0, 16);
      const vehicle = (ctx.vehicleName || 'Vehicle').substring(0, 20);
      return {
        templateName: 'VEHICLE_ASSIGNED',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt: Your ride ${vehicle} for booking ${ref} is inspected and staged for your pickup.`
      };
    }
  },

  // ---------------------------------------------------------------------------
  // 16. BOOKING_OPERATIONAL_UPDATE
  // ---------------------------------------------------------------------------
  'BOOKING_OPERATIONAL_UPDATE:EMAIL': {
    name: 'BOOKING_OPERATIONAL_UPDATE',
    version: TEMPLATE_VERSION,
    channel: 'EMAIL',
    render: (ctx) => {
      const name = escapeHtml(ctx.customerName || 'Customer');
      const ref = escapeHtml(ctx.bookingReference || '');
      const update = escapeHtml(ctx.message || 'Operational schedule update');
      const subject = `Operational Notice for Booking ${ref}`;
      const html = wrapEmailHtml(subject, `
        <h2>Operational Booking Update</h2>
        <p>Hello ${name},</p>
        <p>An update has been made to your reservation <strong>${ref}</strong>:</p>
        <div class="card">
          <p style="margin: 0; font-size: 14px; color: #334155;">${update}</p>
        </div>
        <p>Our support team is available 24/7 if you need any assistance.</p>
      `);
      const text = `Notice for booking ${ref}:\n${ctx.message || 'Operational schedule update'}\nContact support for assistance.`;
      return { templateName: 'BOOKING_OPERATIONAL_UPDATE', templateVersion: TEMPLATE_VERSION, subject, body: html, textFallback: text };
    }
  },
  'BOOKING_OPERATIONAL_UPDATE:SMS': {
    name: 'BOOKING_OPERATIONAL_UPDATE',
    version: TEMPLATE_VERSION,
    channel: 'SMS',
    render: (ctx) => {
      const ref = (ctx.bookingReference || '').substring(0, 16);
      const msg = (ctx.message || 'Schedule updated').substring(0, 80);
      return {
        templateName: 'BOOKING_OPERATIONAL_UPDATE',
        templateVersion: TEMPLATE_VERSION,
        body: `SkyBolt Notice (${ref}): ${msg}. View details in your dashboard.`
      };
    }
  }
};

/**
 * Resolves a template definition by NotificationType and NotificationChannel
 */
export function getTemplate(type: NotificationType, channel: NotificationChannel): TemplateDefinition | null {
  const key = `${type}:${channel}`;
  return templateRegistry[key] || null;
}
