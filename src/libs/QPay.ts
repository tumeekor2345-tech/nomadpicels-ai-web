import { Env } from '@/libs/Env';

/**
 * QPay Merchant V2 client (Mongolian payment gateway).
 *
 * Docs: https://developer.qpay.mn/mn/docs/merchant?version=2.0.0
 * Sandbox: https://merchant-sandbox.qpay.mn
 * Production: https://merchant.qpay.mn
 *
 * Auth flow:
 *   1. POST /v2/auth/token  with `Authorization: Basic base64(client_id:client_secret)`
 *   2. Use the returned access_token as `Authorization: Bearer {access_token}`
 *      on every other endpoint. Refresh with POST /v2/auth/refresh instead of
 *      re-requesting a fresh token repeatedly.
 *
 * IMPORTANT: The exact invoice payload fields (bank codes, tax/classification
 * codes, receiver/branch/employee/terminal metadata) depend on your merchant
 * account setup. Verify field names against the Postman collection in your
 * QPay merchant dashboard before going to production — the shape below
 * covers the common fields used by most integrations.
 */

type QPayTokenResponse = {
  token_type: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
};

export type QPayInvoiceRequest = {
  /** Must be unique per invoice — QPay rejects duplicates. */
  senderInvoiceNo: string;
  invoiceReceiverCode?: string;
  invoiceDescription: string;
  /** Amount in MNT (whole tögrög, no decimals). */
  amount: number;
  /** Where QPay POSTs the payment notification. */
  callbackUrl: string;
};

export type QPayInvoiceResponse = {
  invoice_id: string;
  qr_text: string;
  qr_image: string;
  qPay_shortUrl?: string;
  urls?: Array<{ name: string; description: string; logo: string; link: string }>;
};

export type QPayPaymentCheckResponse = {
  count: number;
  paid_amount: number;
  rows: Array<{
    payment_id: string;
    payment_status: 'NEW' | 'FAILED' | 'PAID' | 'REFUNDED';
    payment_amount: string;
    trx_fee?: string;
  }>;
};

// In-memory token cache. In a serverless/multi-instance deployment, move
// this to Redis/DB so instances share the same token instead of each
// fetching its own (QPay rate-limits token requests).
let cachedToken: { accessToken: string; refreshToken: string; expiresAt: number } | null = null;

/**
 * QPAY_* vars are optional in Env.ts until Phase 3, so `npm run dev` boots
 * without them. This guard only fires if these functions are actually
 * called (e.g. from checkout) before the merchant keys are set.
 */
function requireQPayEnv() {
  if (!Env.QPAY_CLIENT_ID || !Env.QPAY_CLIENT_SECRET || !Env.QPAY_INVOICE_CODE) {
    throw new Error(
      'QPAY_CLIENT_ID / QPAY_CLIENT_SECRET / QPAY_INVOICE_CODE are not set. '
      + 'Add them to .env.local once your QPay merchant application is approved — see .env.local.example.',
    );
  }
}

async function fetchNewToken(): Promise<QPayTokenResponse> {
  requireQPayEnv();
  const basicAuth = Buffer.from(`${Env.QPAY_CLIENT_ID}:${Env.QPAY_CLIENT_SECRET}`).toString('base64');

  const res = await fetch(`${Env.QPAY_BASE_URL}/v2/auth/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${basicAuth}` },
  });

  if (!res.ok) {
    throw new Error(`QPay auth/token failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<QPayTokenResponse>;
}

async function getAccessToken(): Promise<string> {
  const now = Date.now();

  // Reuse a cached token until ~1 minute before it actually expires.
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.accessToken;
  }

  const token = await fetchNewToken();
  cachedToken = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token,
    expiresAt: now + token.expires_in * 1000,
  };

  return cachedToken.accessToken;
}

async function authedFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const accessToken = await getAccessToken();

  return fetch(`${Env.QPAY_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      ...init.headers,
    },
  });
}

/** Creates a QPay invoice and returns the QR / deeplink payment options. */
export async function createQPayInvoice(req: QPayInvoiceRequest): Promise<QPayInvoiceResponse> {
  const res = await authedFetch('/v2/invoice', {
    method: 'POST',
    body: JSON.stringify({
      invoice_code: Env.QPAY_INVOICE_CODE,
      sender_invoice_no: req.senderInvoiceNo,
      invoice_receiver_code: req.invoiceReceiverCode ?? 'terminal',
      invoice_description: req.invoiceDescription,
      amount: req.amount,
      callback_url: req.callbackUrl,
    }),
  });

  if (!res.ok) {
    throw new Error(`QPay invoice create failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<QPayInvoiceResponse>;
}

/** Cancels an invoice (e.g. cart abandoned before payment). */
export async function cancelQPayInvoice(invoiceId: string): Promise<void> {
  const res = await authedFetch(`/v2/invoice/${invoiceId}`, { method: 'DELETE' });

  if (!res.ok) {
    throw new Error(`QPay invoice cancel failed: ${res.status} ${await res.text()}`);
  }
}

/**
 * Confirms payment after receiving the QPay callback. Call this from your
 * `callback_url` route handler — do NOT poll this on a cron job; QPay POSTs
 * to your callback URL the moment the invoice is paid, cancelled, or expired.
 */
export async function confirmQPayPayment(invoiceId: string): Promise<QPayPaymentCheckResponse> {
  const res = await authedFetch('/v2/payment/check', {
    method: 'POST',
    body: JSON.stringify({
      object_type: 'INVOICE',
      object_id: invoiceId,
    }),
  });

  if (!res.ok) {
    throw new Error(`QPay payment check failed: ${res.status} ${await res.text()}`);
  }

  return res.json() as Promise<QPayPaymentCheckResponse>;
}
