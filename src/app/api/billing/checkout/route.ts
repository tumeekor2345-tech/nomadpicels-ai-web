import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { Env } from '@/libs/Env';
import { getPackage } from '@/libs/Pricing';
import { createQPayInvoice } from '@/libs/QPay';
import { orderSchema } from '@/models/Schema';

/**
 * Starts a credit-package purchase: creates a QPay invoice and an order row
 * (status PENDING), returns the QR so the client can render it and start
 * polling GET /api/billing/orders/:id for the PAID flip (which happens via
 * the /api/webhooks/qpay callback, not by polling QPay directly).
 */
export async function POST(request: Request) {
  const { userId, orgId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const pkg = body?.packageId ? getPackage(body.packageId) : undefined;

  if (!pkg) {
    return NextResponse.json({ error: 'Invalid packageId.' }, { status: 400 });
  }

  const senderInvoiceNo = `NPX-${userId.slice(-8)}-${Date.now()}`;

  const [order] = await db.insert(orderSchema).values({
    ownerId: userId,
    orgId: orgId ?? null,
    packageId: pkg.id,
    amountMnt: pkg.amountMnt,
    creditsGranted: pkg.credits,
    senderInvoiceNo,
    status: 'PENDING',
  }).returning();

  if (!order) {
    return NextResponse.json({ error: 'Failed to create order.' }, { status: 500 });
  }

  const appUrl = Env.NEXT_PUBLIC_APP_URL ?? 'https://nomadpicels-ai-web.vercel.app';

  try {
    const invoice = await createQPayInvoice({
      senderInvoiceNo,
      invoiceDescription: `NomadPixels AI — ${pkg.nameMn} багц (${pkg.credits} кредит)`,
      amount: pkg.amountMnt,
      callbackUrl: `${appUrl}/api/webhooks/qpay?orderId=${order.id}`,
    });

    await db.update(orderSchema)
      .set({
        qpayInvoiceId: invoice.invoice_id,
        qrText: invoice.qr_text,
        qrImage: invoice.qr_image,
      })
      .where(eq(orderSchema.id, order.id));

    return NextResponse.json({
      orderId: order.id,
      qrText: invoice.qr_text,
      qrImage: invoice.qr_image,
      shortUrl: invoice.qPay_shortUrl,
      amountMnt: pkg.amountMnt,
      credits: pkg.credits,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    // Leave the order row as PENDING with no qpayInvoiceId — harmless orphan,
    // visible in the DB if you need to debug a QPay outage.
    return NextResponse.json({ error: `QPay invoice creation failed: ${message}` }, { status: 502 });
  }
}
