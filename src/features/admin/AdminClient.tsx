'use client';

import type { AdminRange } from '@/app/api/admin/stats/route';
import { useEffect, useState } from 'react';

type AdminLabels = {
  rangeDay: string;
  rangeWeek: string;
  rangeMonth: string;
  range3Months: string;
  newUsers: string;
  totalUsers: string;
  revenue: string;
  creditsSold: string;
  paidOrders: string;
  totalGenerations: string;
  generationsByKind: string;
  kindFlux: string;
  kindWan: string;
  kindPhotoRestore: string;
  kindFaceSwap: string;
  recentOrders: string;
  recentOrdersEmpty: string;
  loading: string;
  failed: string;
};

type StatsResponse = {
  range: AdminRange;
  newUsers: number;
  totalUsers: number;
  revenueMnt: number;
  creditsSold: number;
  paidOrders: number;
  totalGenerations: number;
  generationsByKind: Record<string, number>;
  recentOrders: {
    id: number;
    packageId: string;
    amountMnt: number;
    creditsGranted: number;
    createdAt: string;
  }[];
};

const RANGES: AdminRange[] = ['1d', '7d', '1m', '3m'];

const KIND_LABEL_KEY: Record<string, keyof AdminLabels> = {
  flux: 'kindFlux',
  wan: 'kindWan',
  photo_restore: 'kindPhotoRestore',
  face_swap: 'kindFaceSwap',
};

function MetricCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-card p-4">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-2xl font-semibold">{props.value}</div>
    </div>
  );
}

export const AdminClient = (props: { labels: AdminLabels }) => {
  const { labels } = props;
  const [range, setRange] = useState<AdminRange>('7d');
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setStats(null);
    setFailed(false);

    fetch(`/api/admin/stats?range=${range}`)
      .then((res) => {
        if (!res.ok) {
          throw new Error('failed');
        }
        return res.json();
      })
      .then(data => setStats(data))
      .catch(() => setFailed(true));
  }, [range]);

  const rangeButtonLabel: Record<AdminRange, string> = {
    '1d': labels.rangeDay,
    '7d': labels.rangeWeek,
    '1m': labels.rangeMonth,
    '3m': labels.range3Months,
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex gap-2">
        {RANGES.map(r => (
          <button
            key={r}
            type="button"
            onClick={() => setRange(r)}
            className={`
              rounded-md px-4 py-2 text-sm font-medium
              ${
          range === r
            ? 'bg-primary text-primary-foreground'
            : 'bg-card text-muted-foreground'
          }
            `}
          >
            {rangeButtonLabel[r]}
          </button>
        ))}
      </div>

      {failed && (
        <div className="
          rounded-md bg-card p-4 text-sm font-medium text-destructive
        "
        >
          {labels.failed}
        </div>
      )}

      {!stats && !failed && (
        <div className="text-sm text-muted-foreground">{labels.loading}</div>
      )}

      {stats && (
        <>
          <div className="
            grid grid-cols-2 gap-3
            sm:grid-cols-3
            lg:grid-cols-5
          "
          >
            <MetricCard label={labels.newUsers} value={stats.newUsers.toLocaleString('mn-MN')} />
            <MetricCard label={labels.totalUsers} value={stats.totalUsers.toLocaleString('mn-MN')} />
            <MetricCard label={labels.revenue} value={`${stats.revenueMnt.toLocaleString('mn-MN')}₮`} />
            <MetricCard label={labels.creditsSold} value={stats.creditsSold.toLocaleString('mn-MN')} />
            <MetricCard label={labels.paidOrders} value={stats.paidOrders.toLocaleString('mn-MN')} />
          </div>

          <div className="rounded-md bg-card p-5">
            <div className="mb-3 text-sm font-medium text-muted-foreground">
              {labels.generationsByKind}
              {' '}
              (
              {stats.totalGenerations.toLocaleString('mn-MN')}
              )
            </div>
            <div className="
              grid grid-cols-2 gap-3
              sm:grid-cols-4
            "
            >
              {Object.entries(KIND_LABEL_KEY).map(([kind, labelKey]) => (
                <div key={kind}>
                  <div className="text-xs text-muted-foreground">{labels[labelKey]}</div>
                  <div className="text-lg font-semibold">
                    {(stats.generationsByKind[kind] ?? 0).toLocaleString('mn-MN')}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-md bg-card p-5">
            <div className="mb-3 text-sm font-medium text-muted-foreground">{labels.recentOrders}</div>
            {stats.recentOrders.length === 0
              ? (
                  <div className="text-sm text-muted-foreground">{labels.recentOrdersEmpty}</div>
                )
              : (
                  <div className="flex flex-col gap-2">
                    {stats.recentOrders.map(order => (
                      <div
                        key={order.id}
                        className="
                          flex items-center justify-between border-b
                          border-border pb-2 text-sm
                          last:border-0
                        "
                      >
                        <span>{order.packageId}</span>
                        <span className="text-muted-foreground">
                          {order.creditsGranted}
                          {' '}
                          кредит
                        </span>
                        <span className="font-medium">
                          {order.amountMnt.toLocaleString('mn-MN')}
                          ₮
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(order.createdAt).toLocaleString('mn-MN')}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
          </div>
        </>
      )}
    </div>
  );
};
