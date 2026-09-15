/* ==========================================================================
   SkyBolt Rentals - Toast Notification Engine
   ========================================================================== */

function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  let iconClass = 'fa-solid fa-info-circle text-primary';
  if (type === 'success') iconClass = 'fa-solid fa-circle-check text-success';
  if (type === 'error') iconClass = 'fa-solid fa-circle-xmark text-danger';
  if (type === 'warning') iconClass = 'fa-solid fa-triangle-exclamation';

  toast.innerHTML = `
    <i class="${iconClass}"></i>
    <div style="flex: 1;">${message}</div>
  `;

  container.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    toast.classList.add('active');
  });

  // Auto remove after 3.5 seconds
  setTimeout(() => {
    toast.classList.remove('active');
    toast.addEventListener('transitionend', () => {
      toast.remove();
    });
  }, 3500);
}
