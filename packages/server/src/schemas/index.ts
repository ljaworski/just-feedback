import { z } from 'zod';

const name100 = z.string().trim().min(1).max(100);

export const feedbackBodySchema = z.object({
  content: z.string().trim().min(1).max(5000),
  metadata: z
    .object({
      appVersion: z.string(),
      platform: z.string(),
      osVersion: z.string(),
      deviceModel: z.string(),
      userRef: z.string(),
    })
    .partial()
    .optional(),
});

/** Metadata length limits; over-limit values are truncated, not rejected. */
const META_LIMITS = {
  appVersion: 50,
  platform: 20,
  osVersion: 50,
  deviceModel: 100,
  userRef: 200,
} as const;

export function truncateMeta(
  meta: Record<string, string | undefined> | undefined,
): Record<keyof typeof META_LIMITS, string | null> {
  const out: Record<string, string | null> = {
    appVersion: null,
    platform: null,
    osVersion: null,
    deviceModel: null,
    userRef: null,
  };
  if (!meta) return out as any;
  for (const k of Object.keys(META_LIMITS) as (keyof typeof META_LIMITS)[]) {
    const v = meta[k];
    if (typeof v === 'string' && v.length > 0) out[k] = v.slice(0, META_LIMITS[k]);
  }
  return out as any;
}

export const setupBodySchema = z.object({
  password: z.string().min(8).optional(),
  project: z
    .object({ name: name100, keyLabel: name100 })
    .nullable()
    .optional(),
});

export const loginBodySchema = z.object({ password: z.string().min(1) });
export const projectBodySchema = z.object({ name: name100 });
export const feedbackPatchSchema = z.object({ status: z.enum(['read', 'archived']) });
export const keyBodySchema = z.object({ label: name100 });

export type FeedbackBody = z.infer<typeof feedbackBodySchema>;
export type SetupBody = z.infer<typeof setupBodySchema>;
