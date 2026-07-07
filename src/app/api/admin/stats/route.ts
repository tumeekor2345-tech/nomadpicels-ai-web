import { auth, clerkClient } from '@clerk/nextjs/server';
import { and, desc, eq, gte, sql } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { isAdminUser } from '@/libs/Admin';
import { db } from '@/libs/DB';
import { generationSchema, orderSchema } from '@/models/Schema';

export type AdminRange = '1d' | '7d' | '1m' | '3m';

const RANGE_TO_MS: Record<AdminRange, number> = {
  '1d': 1 * 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '1m': 30 * 24 * 60 * 60 * 1000,
  '3m': 90 * 24 * 60 * 60 * 1000,
};

function isAdminRange(value: string | null): value is AdminRange {
  return value === '1d' || value === '7d' || value === '1m' || value === '3m';
}

export async function GET(request: Request) {
  const { userId } = await auth();

  if (!(await isAdminUser(userId))) {
    // 404 rather than 403 — don't reveal this route exists to non-admins.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const rangeParam = searchParams.get('range');
  const range: AdminRange = isAdminRange(rangeParam) ? rangeParam : '7d';
  const since = new Date(Date.now() - RANGE_TO_MS[range]);

  const [generationRows, orderAgg, recentOrders, userList] = await Promise.all([
    db
      .select({
        kind: generationSchema.kind,
        count: sql<number>`count(*)`.mapWith(Number),
      })
      .from(generationSchema)
      .where(gte(generationSchema.createdAt, since))
      .groupBy(generationSchema.kind),

    db
      .select({
        revenueMnt: sql<number>`coalesce(sum(${orderSchema.amountMnt}), 0)`.mapWith(Number),
        creditsSold: sql<number>`coalesce(sum(${orderSchema.creditsGranted}), 0)`.mapWith(Number),
        paidOrders: sql<number>`count(*)`.mapWith(Number),
      })
      .from(orderSchema)
      .where(and(eq(orderSchema.status, 'PAID'), gte(orderSchema.createdAt, since))),

    db
      .select({
        id: orderSchema.id,
        packageId: orderSchema.packageId,
        amountMnt: orderSchema.amountMnt,
        creditsGranted: orderSchema.creditsGranted,
        createdAt: orderSchema.createdAt,
      })
      .from(orderSchema)
      .where(eq(orderSchema.status, 'PAID'))
      .orderBy(desc(orderSchema.createdAt))
      .limit(10),

    (async () => {
      const client = await clerkClient();
      // 500 is generous headroom for an early-stage product; revisit with
      // proper pagination/cursor if the user base grows well past this.
      const result = await client.users.getUserList({ limit: 500, orderBy: '-created_at' });
      return result;
    })(),
  ]);

  const newUsers = userList.data.filter(user => user.createdAt >= since.getTime()).length;

  const generationsByKind = generationRows.reduce<Record<string, number>>((acc, row) => {
    acc[row.kind] = row.count;
    return acc;
  }, {});
  const totalGenerations = generationRows.reduce((sum, row) => sum + row.count, 0);

  return NextResponse.json({
    range,
    since: since.toISOString(),
    newUsers,
    totalUsers: userList.totalCount,
    revenueMnt: orderAgg[0]?.revenueMnt ?? 0,
    creditsSold: orderAgg[0]?.creditsSold ?? 0,
    paidOrders: orderAgg[0]?.paidOrders ?? 0,
    totalGenerations,
    generationsByKind,
    recentOrders: recentOrders.map(order => ({
      id: order.id,
      packageId: order.packageId,
      amountMnt: order.amountMnt,
      creditsGranted: order.creditsGranted,
      createdAt: order.createdAt.toISOString(),
    })),
  });
}
