import { createEnv } from '@t3-oss/env-nextjs';
import * as z from 'zod';

// Extended from the original SaaS Boilerplate Env.ts.
// Added: RunPod (Flux + Wan 2.2 serverless GPU) and QPay (Mongolian payments).
// SocialPay / bank-card gateway vars are commented out until merchant
// agreements with Golomt Bank / Khan Bank are finalized (see roadmap Phase 2).
export const Env = createEnv({
  server: {
    CLERK_SECRET_KEY: z.string().min(1),
    DATABASE_URL: z.string().min(1),

    // --- RunPod (GPU inference: Flux image gen + Wan 2.2 video gen) ---
    // Optional for now: not set until Phase 2 (AI Pipeline). Left unset,
    // `npm run dev` still boots fine — only calling RunPod.ts functions
    // without these will throw a clear error (see requireRunPodEnv there).
    RUNPOD_API_KEY: z.string().min(1).optional(),
    RUNPOD_FLUX_ENDPOINT_ID: z.string().min(1).optional(),
    RUNPOD_WAN_ENDPOINT_ID: z.string().min(1).optional(),

    // --- QPay (Mongolian payment gateway, Merchant V2 API) ---
    // Optional for now: not set until Phase 3 (Payment). Same behavior as
    // RunPod above — safe to leave blank until you have merchant credentials.
    QPAY_BASE_URL: z
      .string()
      .url()
      .default('https://merchant-sandbox.qpay.mn'),
    QPAY_CLIENT_ID: z.string().min(1).optional(),
    QPAY_CLIENT_SECRET: z.string().min(1).optional(),
    QPAY_INVOICE_CODE: z.string().min(1).optional(),

    // --- SocialPay / Bank card gateway (Phase 2 — not required for MVP) ---
    // SOCIALPAY_MERCHANT_ID: z.string().optional(),
    // SOCIALPAY_API_KEY: z.string().optional(),
  },
  client: {
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().min(1),
    NEXT_PUBLIC_LOGGING_LEVEL: z.enum(['error', 'info', 'debug', 'warning', 'trace', 'fatal']).default('info'),
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN: z.string().optional(),
    NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST: z.string().optional(),
  },
  shared: {
    NODE_ENV: z.enum(['test', 'development', 'production']).optional(),
  },
  // You need to destructure all the keys manually
  runtimeEnv: {
    CLERK_SECRET_KEY: process.env.CLERK_SECRET_KEY,
    DATABASE_URL: process.env.DATABASE_URL,
    RUNPOD_API_KEY: process.env.RUNPOD_API_KEY,
    RUNPOD_FLUX_ENDPOINT_ID: process.env.RUNPOD_FLUX_ENDPOINT_ID,
    RUNPOD_WAN_ENDPOINT_ID: process.env.RUNPOD_WAN_ENDPOINT_ID,
    QPAY_BASE_URL: process.env.QPAY_BASE_URL,
    QPAY_CLIENT_ID: process.env.QPAY_CLIENT_ID,
    QPAY_CLIENT_SECRET: process.env.QPAY_CLIENT_SECRET,
    QPAY_INVOICE_CODE: process.env.QPAY_INVOICE_CODE,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
    NEXT_PUBLIC_LOGGING_LEVEL: process.env.NEXT_PUBLIC_LOGGING_LEVEL,
    NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN: process.env.NEXT_PUBLIC_BETTER_STACK_SOURCE_TOKEN,
    NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST: process.env.NEXT_PUBLIC_BETTER_STACK_INGESTING_HOST,
    NODE_ENV: process.env.NODE_ENV,
  },
});
