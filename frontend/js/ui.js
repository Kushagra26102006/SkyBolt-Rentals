/* ==========================================================================
   SkyBolt Rentals - UI, Scroll Effects & IntersectionObserver Animations
   ========================================================================== */

/**
 * Strict HTML Entity Encoding for XSS Prevention
 */
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
window.escapeHtml = escapeHtml;

/**
 * Strict URL Sanitization to Prevent Attribute Breakout and XSS (javascript:, data:, vbscript:)
 */
function sanitizeUrl(url, fallback = 'assets/images/car-tour.webp') {
  if (!url || typeof url !== 'string') return fallback;
  const trimmed = url.trim();
  // Safe relative paths: assets/..., /..., ./...
  if (/^(\/|\.\/|assets\/)/i.test(trimmed)) {
    return escapeHtml(trimmed);
  }
  // Safe absolute protocols: https:// or http://
  if (/^https?:\/\/[a-zA-Z0-9\-._~:/?#[\]@!$&'()*+,;=]+$/i.test(trimmed)) {
    return escapeHtml(trimmed);
  }
  return fallback;
}
window.sanitizeUrl = sanitizeUrl;

/**
 * Standardized Rental UTC Timestamp Generator
 * Converts customer-selected YYYY-MM-DD into consistent ISO-8601 UTC timestamp (default: 10:00:00 UTC)
 * Prevents local client timezone offsets from shifting dates across midnight.
 */
function toRentalUtcTimestamp(dateInputVal, timePart = '10:00:00') {
  if (!dateInputVal || typeof dateInputVal !== 'string') return '';
  const trimmed = dateInputVal.trim();
  if (trimmed.includes('T')) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!match) {
    const d = new Date(trimmed);
    return isNaN(d.getTime()) ? '' : d.toISOString();
  }
  const [, y, m, d] = match;
  let candidate = new Date(`${y}-${m}-${d}T${timePart}.000Z`);
  const now = new Date();

  // If candidate is today/past and within 15 mins of now or earlier, schedule 30 mins in future
  const candidateDay = `${y}-${m}-${d}`;
  const nowYear = now.getUTCFullYear();
  const nowMonth = String(now.getUTCMonth() + 1).padStart(2, '0');
  const nowDate = String(now.getUTCDate()).padStart(2, '0');
  const nowDayStr = `${nowYear}-${nowMonth}-${nowDate}`;

  if (candidateDay <= nowDayStr && candidate.getTime() <= now.getTime() + 15 * 60 * 1000) {
    candidate = new Date(now.getTime() + 30 * 60 * 1000);
  }
  return candidate.toISOString();
}
window.toRentalUtcTimestamp = toRentalUtcTimestamp;

document.addEventListener('DOMContentLoaded', () => {
  initHeaderScroll();
  initSmoothScroll();
  initScrollRevealObserver();
});

/**
 * Add shadow and backdrop to site header when scrolled
 */
function initHeaderScroll() {
  const header = document.querySelector('.site-header');
  if (!header) return;

  window.addEventListener('scroll', () => {
    if (window.scrollY > 20) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  });
}

/**
 * Smooth Scrolling for Anchor Links
 */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const targetId = this.getAttribute('href');
      if (targetId === '#') return;

      const targetElement = document.querySelector(targetId);
      if (targetElement) {
        e.preventDefault();
        const headerOffset = 80;
        const elementPosition = targetElement.getBoundingClientRect().top;
        const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

        window.scrollTo({
          top: offsetPosition,
          behavior: 'smooth'
        });
      }
    });
  });
}

/**
 * IntersectionObserver Scroll Reveal Animations
 */
function initScrollRevealObserver() {
  // Check if reduced motion is preferred
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  const revealElements = document.querySelectorAll('.reveal, .vehicle-card, .feature-card, .coupon-card, .testimonial-card');
  if (!revealElements.length || !('IntersectionObserver' in window)) return;

  const observerOptions = {
    root: null,
    rootMargin: '0px 0px -50px 0px',
    threshold: 0.1
  };

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('reveal', 'active');
        obs.unobserve(entry.target);
      }
    });
  }, observerOptions);

  revealElements.forEach(el => {
    el.classList.add('reveal');
    observer.observe(el);
  });
}
