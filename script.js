// ============================================================
// eSewa ePay v2 – RC (Testing) Integration
// Docs: https://developer.esewa.com.np/pages/Epay
// ============================================================

const ESEWA = {
  // RC testing endpoint (POST form)
  formUrl: 'https://rc-epay.esewa.com.np/api/epay/main/v2/form',

  // Official test credentials
  productCode: 'EPAYTEST',
  secretKey:   '8gBm/:&EnhH.1/q',

  // Product details (mock)
  amount:                  '1000',   // Rs. 1,000
  taxAmount:               '0',
  productServiceCharge:    '0',
  productDeliveryCharge:   '0',
  totalAmount:             '1000',   // must equal amount + charges

  // Redirect URLs – using the current page with a status flag
  successUrl: location.href.split('?')[0] + '?payment=success',
  failureUrl:  location.href.split('?')[0] + '?payment=failed',
};

// ── Helpers ──────────────────────────────────────────────────

/** Generate a unique transaction UUID (date-time based) */
function generateUUID() {
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, '0');
  return [
    now.getFullYear().toString().slice(2),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    '-',
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
}

/**
 * Generate HMAC-SHA256 signature in Base64.
 * Signed fields: total_amount,transaction_uuid,product_code
 * Uses the Web Crypto API (available in all modern browsers).
 */
async function generateSignature(totalAmount, transactionUuid, productCode) {
  const message = `total_amount=${totalAmount},transaction_uuid=${transactionUuid},product_code=${productCode}`;
  const enc     = new TextEncoder();

  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(ESEWA.secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(message));

  // Convert ArrayBuffer → Base64
  return btoa(String.fromCharCode(...new Uint8Array(signature)));
}

// ── Checkout ──────────────────────────────────────────────────

async function submitEsewaPayment() {
  const btn = document.getElementById('checkoutBtn');
  btn.disabled = true;
  btn.textContent = 'Redirecting…';

  try {
    const transactionUuid = generateUUID();
    const signature = await generateSignature(
      ESEWA.totalAmount,
      transactionUuid,
      ESEWA.productCode,
    );

    // Build a hidden form and submit it (POST is required by eSewa v2)
    const form = document.createElement('form');
    form.method  = 'POST';
    form.action  = ESEWA.formUrl;
    form.target  = '_blank';   // open in new tab

    const fields = {
      amount:                   ESEWA.amount,
      tax_amount:               ESEWA.taxAmount,
      total_amount:             ESEWA.totalAmount,
      transaction_uuid:         transactionUuid,
      product_code:             ESEWA.productCode,
      product_service_charge:   ESEWA.productServiceCharge,
      product_delivery_charge:  ESEWA.productDeliveryCharge,
      success_url:              ESEWA.successUrl,
      failure_url:              ESEWA.failureUrl,
      signed_field_names:       'total_amount,transaction_uuid,product_code',
      signature:                signature,
    };

    Object.entries(fields).forEach(([name, value]) => {
      const input = document.createElement('input');
      input.type  = 'hidden';
      input.name  = name;
      input.value = value;
      form.appendChild(input);
    });

    document.body.appendChild(form);
    form.submit();
    document.body.removeChild(form);
  } catch (err) {
    console.error('eSewa payment error:', err);
    showToast('error', 'Error', 'Could not initiate payment. Please try again.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
           stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
      Pay with eSewa`;
  }
}

// ── Toast ─────────────────────────────────────────────────────

function showToast(type, title, message) {
  const toast = document.getElementById('toast');
  const icon  = document.getElementById('toastIcon');
  const msg   = document.getElementById('toastMsg');

  toast.className  = `toast ${type}`;
  icon.textContent = type === 'success' ? '✅' : '❌';
  msg.innerHTML    = `<strong>${title}</strong>${message}`;

  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 6000);
}

// ── Callback handler ──────────────────────────────────────────

function handleCallback() {
  const params  = new URLSearchParams(location.search);
  const payment = params.get('payment');

  // eSewa v2 sends a base64-encoded JSON in the 'data' param on success
  const data = params.get('data');

  if (payment === 'success' || data) {
    let detail = 'Your eSewa sandbox payment was completed.';
    if (data) {
      try {
        const decoded = JSON.parse(atob(data));
        detail = `Ref: ${decoded.transaction_code || '–'} · Status: ${decoded.status || 'COMPLETE'}`;
      } catch (_) { /* ignore decode errors */ }
    }
    showToast('success', 'Payment Successful!', detail);
    history.replaceState(null, '', location.pathname);

  } else if (payment === 'failed') {
    showToast('error', 'Payment Failed', 'The payment was cancelled or failed. Please try again.');
    history.replaceState(null, '', location.pathname);
  }
}

// ── Boot ──────────────────────────────────────────────────────

document.getElementById('checkoutBtn').addEventListener('click', submitEsewaPayment);
handleCallback();
