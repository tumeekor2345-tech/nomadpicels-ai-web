import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { orderSchema } from '@/models/Schema';

/** Polled by the billing page while the user has the QR open, waiting for the QPay webhook to flip status to PAID. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const orderId = Number(id);

  if (!Number.isInteger(orderId)) {
    return NextResponse.json({ error: 'Invalid order id.' }, { status: 400 });
  }

  const [order] = await db.select().from(orderSchema).where(eq(orderSchema.id, orderId)).limit(1);

  if (!order || order.ownerId !== userId) {
    return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  }

  return NextResponse.json({
    id: order.id,
    status: order.status,
    amountMnt: order.amountMnt,
    credits: order.creditsGranted,
  });
}
