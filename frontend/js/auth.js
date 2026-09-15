/* ==========================================================================
   SkyBolt Rentals - Production Authentication Client (TASK 05)
   Integrates with backend /api/v1/auth endpoints via secure HTTP-only cookies.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initRegisterForm();
  initLoginForm();
});

/**
 * Handle Registration Form Submission & Server-Side Integration
 */
function initRegisterForm() {
  const form = document.getElementById('register-form');
  if (!form) return;

  const errorEl = document.getElementById('reg-error-msg');

  function showFormError(msg) {
    if (errorEl) {
      errorEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span>${msg}</span>`;
      errorEl.style.display = 'flex';
      errorEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    if (typeof showToast === 'function') {
      showToast(msg, 'error');
    }
  }

  function clearFormError() {
    if (errorEl) {
      errorEl.style.display = 'none';
      errorEl.innerHTML = '';
    }
  }

  // Interactive Role Selector
  let selectedRole = 'CUSTOMER';
  const roleCardCustomer = document.getElementById('role-card-customer');
  const roleCardOwner = document.getElementById('role-card-owner');
  const ownerFieldsGroup = document.getElementById('group-owner-fields');
  const customerLicenseGroup = document.getElementById('group-customer-license');
  const submitBtnText = document.getElementById('submit-btn-text');

  function updateRoleUI(role) {
    selectedRole = role;
    if (role === 'OWNER') {
      if (roleCardOwner) {
        roleCardOwner.classList.add('active');
        roleCardOwner.style.border = '2px solid var(--primary)';
        roleCardOwner.style.background = 'var(--primary-light)';
        const check = roleCardOwner.querySelector('.role-check-icon');
        if (check) check.className = 'fa-solid fa-circle-check role-check-icon';
        const radio = roleCardOwner.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      }
      if (roleCardCustomer) {
        roleCardCustomer.classList.remove('active');
        roleCardCustomer.style.border = '1px solid var(--border)';
        roleCardCustomer.style.background = 'var(--surface)';
        const check = roleCardCustomer.querySelector('.role-check-icon');
        if (check) check.className = 'fa-regular fa-circle role-check-icon';
        const radio = roleCardCustomer.querySelector('input[type="radio"]');
        if (radio) radio.checked = false;
      }
      if (ownerFieldsGroup) ownerFieldsGroup.style.display = 'block';
      if (customerLicenseGroup) customerLicenseGroup.style.display = 'none';
      if (submitBtnText) submitBtnText.textContent = 'Create Owner Account';
    } else {
      if (roleCardCustomer) {
        roleCardCustomer.classList.add('active');
        roleCardCustomer.style.border = '2px solid var(--primary)';
        roleCardCustomer.style.background = 'var(--primary-light)';
        const check = roleCardCustomer.querySelector('.role-check-icon');
        if (check) check.className = 'fa-solid fa-circle-check role-check-icon';
        const radio = roleCardCustomer.querySelector('input[type="radio"]');
        if (radio) radio.checked = true;
      }
      if (roleCardOwner) {
        roleCardOwner.classList.remove('active');
        roleCardOwner.style.border = '1px solid var(--border)';
        roleCardOwner.style.background = 'var(--surface)';
        const check = roleCardOwner.querySelector('.role-check-icon');
        if (check) check.className = 'fa-regular fa-circle role-check-icon';
        const radio = roleCardOwner.querySelector('input[type="radio"]');
        if (radio) radio.checked = false;
      }
      if (ownerFieldsGroup) ownerFieldsGroup.style.display = 'none';
      if (customerLicenseGroup) customerLicenseGroup.style.display = 'block';
      if (submitBtnText) submitBtnText.textContent = 'Create Customer Account';
    }
  }

  if (roleCardCustomer) {
    roleCardCustomer.addEventListener('click', () => updateRoleUI('CUSTOMER'));
  }
  if (roleCardOwner) {
    roleCardOwner.addEventListener('click', () => updateRoleUI('OWNER'));
  }

  form.querySelectorAll('input').forEach(input => {
    input.addEventListener('input', clearFormError);
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFormError();

    const nameInput = document.getElementById('reg-name');
    const emailInput = document.getElementById('reg-email');
    const phoneInput = document.getElementById('reg-phone');
    const passInput = document.getElementById('reg-password');
    const confirmInput = document.getElementById('reg-confirm-password');
    const licenseInput = document.getElementById('reg-license');
    const cityInput = document.getElementById('reg-city');
    const addressInput = document.getElementById('reg-address');
    const idInput = document.getElementById('reg-id-number');
    const submitBtn = form.querySelector('button[type="submit"]');

    const name = nameInput ? nameInput.value.trim() : '';
    const email = emailInput ? emailInput.value.trim() : '';
    const phone = phoneInput ? phoneInput.value.trim() : '';
    const password = passInput ? passInput.value : '';
    const confirm = confirmInput ? confirmInput.value : '';
    const licenseNumber = licenseInput ? licenseInput.value.trim() : '';
    const city = cityInput ? cityInput.value.trim() : '';
    const address = addressInput ? addressInput.value.trim() : '';
    const idVerificationNumber = idInput ? idInput.value.trim() : '';

    // Client-side validation checks
    if (!name) {
      showFormError('Please enter your full legal name.');
      nameInput.focus();
      return;
    }

    if (!email) {
      showFormError('Please enter your email address.');
      emailInput.focus();
      return;
    }

    if (!phone) {
      showFormError('Please enter your contact phone number.');
      phoneInput.focus();
      return;
    }

    if (selectedRole === 'OWNER') {
      if (!city) {
        showFormError('Vehicle Owners must specify their primary operating city/hub.');
        if (cityInput) cityInput.focus();
        return;
      }
      if (!idVerificationNumber) {
        showFormError('Vehicle Owners must enter a valid Govt ID or PAN Number for verification.');
        if (idInput) idInput.focus();
        return;
      }
    }

    if (!password) {
      showFormError('Please enter a password.');
      passInput.focus();
      return;
    }

    if (password.length < 8) {
      showFormError('Password must be at least 8 characters long.');
      passInput.classList.add('is-invalid');
      passInput.focus();
      return;
    } else {
      passInput.classList.remove('is-invalid');
    }

    if (password !== confirm) {
      showFormError('Passwords do not match. Please verify both password fields.');
      confirmInput.classList.add('is-invalid');
      confirmInput.focus();
      return;
    } else {
      confirmInput.classList.remove('is-invalid');
    }

    // UI Loading state
    const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Create Account';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating Account...';
    }

    try {
      const payload = {
        name,
        email,
        phone,
        password,
        role: selectedRole,
        ...(selectedRole === 'CUSTOMER' && licenseNumber ? { licenseNumber } : {}),
        ...(selectedRole === 'OWNER' ? { city, address, idVerificationNumber } : {})
      };

      const response = await window.SkyBoltApi.post('/auth/register', {
        ...payload
      });

      if (response && response.success) {
        const successMsg = selectedRole === 'OWNER'
          ? 'Owner account registered successfully! Redirecting to sign in...'
          : 'Customer account created successfully! Redirecting to sign in...';

        if (typeof showToast === 'function') {
          showToast(successMsg, 'success');
        }
        if (errorEl) {
          errorEl.className = 'form-alert-error';
          errorEl.style.background = 'var(--success-light)';
          errorEl.style.borderColor = 'rgba(16, 185, 129, 0.3)';
          errorEl.style.color = 'var(--success-text)';
          errorEl.innerHTML = `<i class="fa-solid fa-circle-check"></i> <span>${successMsg}</span>`;
          errorEl.style.display = 'flex';
        }
        setTimeout(() => {
          window.location.href = '/login';
        }, 1200);
      } else {
        const errorMsg = (response && response.error && response.error.message)
          ? response.error.message
          : 'Registration failed. Please check your information and try again.';
        showFormError(errorMsg);
      }
    } catch (err) {
      showFormError('Network connection failed. Please ensure the backend server is running on port 5001.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalBtnText;
      }
    }
  });
}

/**
 * Handle Login Form Submission & Server-Side Authentication
 */
function initLoginForm() {
  const form = document.getElementById('login-form');
  const googleBtn = document.getElementById('btn-google-login');
  const forgotLink = document.getElementById('forgot-password-link');

  if (form) {
    const errorEl = document.getElementById('login-error-msg');

    function showLoginError(msg) {
      if (errorEl) {
        errorEl.className = 'form-alert-error';
        errorEl.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i> <span>${msg}</span>`;
        errorEl.style.display = 'flex';
      }
      if (typeof showToast === 'function') {
        showToast(msg, 'error');
      }
    }

    function clearLoginError() {
      if (errorEl) {
        errorEl.style.display = 'none';
        errorEl.innerHTML = '';
      }
    }

    form.querySelectorAll('input').forEach(input => {
      input.addEventListener('input', clearLoginError);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearLoginError();

      const emailInput = document.getElementById('login-email');
      const passInput = document.getElementById('login-password');
      const submitBtn = form.querySelector('button[type="submit"]');

      const email = emailInput ? emailInput.value.trim() : '';
      const password = passInput ? passInput.value : '';

      if (!email || !password) {
        showLoginError('Please enter your email and password.');
        return;
      }

      // UI Loading state
      const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Sign In';
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Signing In...';
      }

      try {
        const response = await window.SkyBoltApi.post('/auth/login', {
          email,
          password
        });

        if (response && response.success) {
          const user = response.data.user;
          sessionStorage.setItem('skybolt_user_profile', JSON.stringify(user));
          if (typeof showToast === 'function') {
            showToast(`Welcome back, ${user.name}!`, 'success');
          }

          setTimeout(() => {
            const privilegedRoles = ['ADMIN', 'STAFF', 'FLEET_MANAGER'];
            if (privilegedRoles.includes(user.role)) {
              window.location.href = '/admin';
            } else if (user.role === 'OWNER') {
              window.location.href = '/owner-dashboard';
            } else {
              window.location.href = '/dashboard';
            }
          }, 800);
        } else {
          const errorMsg = (response && response.error && response.error.message)
            ? response.error.message
            : 'Invalid credentials. Please check your email and password.';
          showLoginError(errorMsg);
        }
      } catch (err) {
        showLoginError('Unable to connect to authentication server. Please ensure the backend is running.');
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnText;
        }
      }
    });
  }

  // Quick Demo Auto-fill Helper
  const demoAdminBtn = document.getElementById('btn-demo-admin');
  const demoOwnerBtn = document.getElementById('btn-demo-owner');
  const demoCustomerBtn = document.getElementById('btn-demo-customer');

  if (demoAdminBtn) {
    demoAdminBtn.addEventListener('click', () => {
      const emailInput = document.getElementById('login-email');
      const passInput = document.getElementById('login-password');
      if (emailInput) emailInput.value = 'admin@skybolt.com';
      if (passInput) passInput.value = 'Admin@123456';
      if (typeof showToast === 'function') {
        showToast('Auto-filled Administrator credentials.', 'info');
      }
    });
  }

  if (demoOwnerBtn) {
    demoOwnerBtn.addEventListener('click', () => {
      const emailInput = document.getElementById('login-email');
      const passInput = document.getElementById('login-password');
      if (emailInput) emailInput.value = 'bob.owner@example.com';
      if (passInput) passInput.value = 'Password123!';
      if (typeof showToast === 'function') {
        showToast('Auto-filled Vehicle Owner credentials.', 'info');
      }
    });
  }

  if (demoCustomerBtn) {
    demoCustomerBtn.addEventListener('click', () => {
      const emailInput = document.getElementById('login-email');
      const passInput = document.getElementById('login-password');
      if (emailInput) emailInput.value = 'customer@skybolt.com';
      if (passInput) passInput.value = 'Customer@123';
      if (typeof showToast === 'function') {
        showToast('Auto-filled Customer credentials.', 'info');
      }
    });
  }

  // OAuth Google integration notice
  if (googleBtn) {
    googleBtn.addEventListener('click', () => {
      showToast('OAuth federated sign-in is scheduled for production phase deployment.', 'info');
    });
  }

  // Password reset request
  if (forgotLink) {
    forgotLink.addEventListener('click', async (e) => {
      e.preventDefault();
      const emailInput = document.getElementById('login-email');
      const email = emailInput ? emailInput.value.trim() : '';

      if (!email) {
        showToast('Please enter your email in the email field first.', 'warning');
        return;
      }

      try {
        const res = await window.SkyBoltApi.post('/auth/forgot-password', { email });
        if (res.success) {
          showToast(res.data.message || 'Password reset instructions dispatched.', 'info');
        } else {
          showToast(res.error ? res.error.message : 'Password reset failed.', 'error');
        }
      } catch {
        showToast('Unable to reach authentication server.', 'error');
      }
    });
  }
}
