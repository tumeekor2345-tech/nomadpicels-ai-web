import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';
import { db } from '@/libs/DB';
import { creditBalanceSchema } from '@/models/Schema';

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [row] = await db.select().from(creditBalanceSchema).where(eq(creditBalanceSchema.ownerId, userId)).limit(1);

  return NextResponse.json({ balance: row?.balance ?? 0 });
}
