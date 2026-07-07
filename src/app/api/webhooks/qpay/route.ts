import { eq, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { confirmQPayPayment } from '@/libs/QPay';
import { creditBalanceSchema, orderSchema } from '@/models/Schema';

/**
 * QPay POSTs here the moment an invoice is paid/cancelled/expired (the
 * `callback_url` we pass to createQPayInvoice includes ?orderId=... so we
 * don't have to guess which order this is about).
 *
 * SECURITY: we never trust the callback body itself as proof of payment —
 * anyone could POST here. Instead we look up the order, then call QPay's
 * own /v2/payment/check endpoint (confirmQPayPayment) server-to-server to
 * verify the invoice is actually PAID before crediting anything. This route
 * is also idempotent: if the order is already PAID, repeat callbacks are a
 * no-op instead of double-crediting.
 */
async function handleCallback(request: Request) {
  const { searchParams } = new URL(request.url);
  const orderIdParam = searchParams.get('orderId');
  const orderId = orderIdParam ? Number(orderIdParam) : Number.NaN;

  if (!Number.isInteger(orderId)) {
    return NextResponse.json({ error: 'Missing or invalid orderId.' }, { status: 400 });
  }

  const [order] = await db.select().from(orderSchema).where(eq(orderSchema.id, orderId)).limit(1);

  if (!order) {
    return NextResponse.json({ error: 'Order not found.' }, { status: 404 });
  }

  // Already processed — QPay may retry callbacks, this must stay a no-op.
  if (order.status === 'PAID') {
    return NextResponse.json({ ok: true, status: 'PAID', alreadyProcessed: true });
  }

  if (!order.qpayInvoiceId) {
    return NextResponse.json({ error: 'Order has no QPay invoice id yet.' }, { status: 409 });
  }

  try {
    const check = await confirmQPayPayment(order.qpayInvoiceId);
    const isPaid = check.rows.some(r => r.payment_status === 'PAID')
      && check.paid_amount >= order.amountMnt;

    if (!isPaid) {
      // Not actually paid yet (e.g. QPay pinged us about a CANCELLED/expired
      // invoice) — leave the order PENDING, don't credit anything.
      return NextResponse.json({ ok: true, status: 'NOT_PAID' });
    }

    // Flip to PAID and credit the account in one go. The WHERE clause on
    // status='PENDING' is a belt-and-suspenders guard against a race where
    // two callbacks land at nearly the same time.
    const updated = await db.update(orderSchema)
      .set({ status: 'PAID' })
      .where(eq(orderSchema.id, order.id))
      .returning({ id: orderSchema.id });

    if (updated.length === 0) {
      return NextResponse.json({ ok: true, status: 'PAID', alreadyProcessed: true });
    }

    await db.insert(creditBalanceSchema)
      .values({ ownerId: order.ownerId, balance: order.creditsGranted })
      .onConflictDoUpdate({
        target: creditBalanceSchema.ownerId,
        set: { balance: sql`${creditBalanceSchema.balance} + ${order.creditsGranted}` },
      });

    return NextResponse.json({ ok: true, status: 'PAID' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ error: `QPay payment check failed: ${message}` }, { status: 502 });
  }
}

// QPay's docs show callbacks as GET in some flows and POST in others
// depending on integration type — handle both the same way.
export async function POST(request: Request) {
  return handleCallback(request);
}

export async function GET(request: Request) {
  return handleCallback(request);
}
