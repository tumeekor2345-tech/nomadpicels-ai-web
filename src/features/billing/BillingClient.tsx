'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/utils/Helpers';

type PackageId = 'starter' | 'active' | 'business';

type Package = {
  id: PackageId;
  nameMn: string;
  amountMnt: number;
  credits: number;
  descriptionMn: string;
};

const PACKAGES: Package[] = [
  { id: 'starter', nameMn: 'Стартер', amountMnt: 10_000, credits: 100, descriptionMn: 'Нэг удаагийн худалдан авалт — туршиж эхлэхэд тохиромжтой' },
  { id: 'active', nameMn: 'Идэвхтэй', amountMnt: 25_000, credits: 300, descriptionMn: 'Хамгийн түгээмэл сонголт' },
  { id: 'business', nameMn: 'Бизнес', amountMnt: 60_000, credits: 800, descriptionMn: 'Агентлаг, дэлгүүрт зориулсан — тэргүүлэх дараалал' },
];

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000; // QPay invoices typically expire well within this window

type CheckoutState = {
  orderId: number;
  qrImage?: string;
  qrText?: string;
  shortUrl?: string;
  amountMnt: number;
  credits: number;
} | null;

export const BillingClient = (props: {
  labels: {
    title: string;
    balanceLabel: string;
    buy: string;
    buying: string;
    scanInstruction: string;
    waiting: string;
    paid: string;
    failed: string;
    creditCostNote: string;
  };
}) => {
  const [balance, setBalance] = useState<number | null>(null);
  const [loadingPackage, setLoadingPackage] = useState<PackageId | null>(null);
  const [checkout, setCheckout] = useState<CheckoutState>(null);
  const [orderStatus, setOrderStatus] = useState<'PENDING' | 'PAID' | 'TIMED_OUT' | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshBalance = () => {
    fetch('/api/billing/balance')
      .then(res => res.json())
      .then(data => setBalance(typeof data.balance === 'number' ? data.balance : 0))
      .catch(() => {});
  };

  useEffect(() => {
    refreshBalance();
    return () => {
      if (pollTimer.current) {
        clearTimeout(pollTimer.current);
      }
    };
  }, []);

  const pollOrder = (orderId: number, startedAt: number) => {
    if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
      setOrderStatus('TIMED_OUT');
      return;
    }

    fetch(`/api/billing/orders/${orderId}`)
      .then(res => res.json())
      .then((data) => {
        if (data.status === 'PAID') {
          setOrderStatus('PAID');
          refreshBalance();
          return;
        }
        pollTimer.current = setTimeout(pollOrder, POLL_INTERVAL_MS, orderId, startedAt);
      })
      .catch(() => {
        pollTimer.current = setTimeout(pollOrder, POLL_INTERVAL_MS, orderId, startedAt);
      });
  };

  const handleBuy = async (pkg: Package) => {
    setErrorText(null);
    setCheckout(null);
    setOrderStatus(null);
    setLoadingPackage(pkg.id);

    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId: pkg.id }),
      });
      const data = await res.json();

      if (!res.ok) {
        setErrorText(data.error ?? props.labels.failed);
        return;
      }

      setCheckout({
        orderId: data.orderId,
        qrImage: data.qrImage,
        qrText: data.qrText,
        shortUrl: data.shortUrl,
        amountMnt: data.amountMnt,
        credits: data.credits,
      });
      setOrderStatus('PENDING');
      pollOrder(data.orderId, Date.now());
    } catch {
      setErrorText(props.labels.failed);
    } finally {
      setLoadingPackage(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-md bg-card p-5">
        <div className="text-sm text-muted-foreground">{props.labels.balanceLabel}</div>
        <div className="text-3xl font-semibold">{balance ?? '—'}</div>
        <div className="mt-1 text-xs text-muted-foreground">{props.labels.creditCostNote}</div>
      </div>

      <div className="
        grid grid-cols-1 gap-4
        sm:grid-cols-3
      "
      >
        {PACKAGES.map(pkg => (
          <div key={pkg.id} className="flex flex-col justify-between gap-4 rounded-md bg-card p-5">
            <div>
              <div className="text-lg font-semibold">{pkg.nameMn}</div>
              <div className="mt-1 text-2xl font-bold">
                {pkg.amountMnt.toLocaleString('mn-MN')}
                ₮
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                {pkg.credits}
                {' '}
                кредит
              </div>
              <div className="mt-2 text-xs text-muted-foreground">{pkg.descriptionMn}</div>
            </div>
            <Button
              type="button"
              disabled={loadingPackage === pkg.id}
              onClick={() => handleBuy(pkg)}
            >
              {loadingPackage === pkg.id ? props.labels.buying : props.labels.buy}
            </Button>
          </div>
        ))}
      </div>

      {errorText && (
        <div className="rounded-md bg-card p-4 text-sm font-medium text-destructive">{errorText}</div>
      )}

      {checkout && (
        <div className="flex flex-col items-center gap-4 rounded-md bg-card p-6">
          <div className="text-sm text-muted-foreground">
            {checkout.amountMnt.toLocaleString('mn-MN')}
            ₮ —
            {props.labels.scanInstruction}
          </div>

          {checkout.qrImage && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${checkout.qrImage}`}
              alt="QPay QR"
              className="size-64 rounded-md border border-border bg-white p-2"
            />
          )}

          {checkout.shortUrl && (
            <a href={checkout.shortUrl} target="_blank" rel="noreferrer" className="text-sm text-primary underline">
              QPay аппаар нээх
            </a>
          )}

          <div
            className={cn(
              'text-sm font-medium',
              orderStatus === 'PAID' && 'text-green-600',
              orderStatus === 'TIMED_OUT' && 'text-destructive',
            )}
          >
            {orderStatus === 'PAID' && props.labels.paid}
            {orderStatus === 'PENDING' && props.labels.waiting}
            {orderStatus === 'TIMED_OUT' && props.labels.failed}
          </div>
        </div>
      )}
    </div>
  );
};
