import { z } from 'zod';
import { maps } from './model';
export const pageSchema = z.enum(['map', 'loot', 'notes', 'chat']);
const mapId = z
  .string()
  .max(100)
  .refine((id) => Object.hasOwn(maps, id))
  .nullable();
export const reportSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['issue', 'feature']),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(10).max(5000),
  contact: z.union([z.literal(''), z.email().max(254)]).default(''),
  page: z.enum(['map', 'loot', 'notes', 'chat', 'admin', 'privacy']),
  mapId,
});
export const reportStatus = z.enum([
  'new',
  'planned',
  'in-progress',
  'resolved',
  'closed',
]);
export const reportUpdateSchema = z.object({
  status: reportStatus,
  adminNotes: z.string().max(5000),
});
export const trafficSchema = z.object({
  id: z.uuid(),
  page: pageSchema,
  mapId,
  device: z.enum(['desktop', 'tablet', 'phone']),
  referrer: z.string().max(255).default(''),
});
export type SitePage = z.infer<typeof pageSchema>;
export type SiteReport = {
  id: string;
  kind: 'issue' | 'feature';
  title: string;
  body: string;
  contact: string;
  username: string | null;
  page: SitePage | 'admin' | 'privacy';
  mapId: string | null;
  status: z.infer<typeof reportStatus>;
  adminNotes: string;
  createdAt: number;
  updatedAt: number;
};
export type AdminOverview = {
  days: number;
  trackingSince: number;
  totals: {
    users: number;
    activeUsers: number;
    runs: number;
    annotations: number;
    openReports: number;
    pageViews: number;
    visits: number;
  };
  daily: { day: string; pageViews: number; visits: number }[];
  pages: { page: SitePage; mapId: string | null; views: number }[];
  referrers: { referrer: string; visits: number }[];
  devices: { device: string; visits: number }[];
};
export type AdminUser = {
  id: string;
  username: string;
  createdAt: string | number;
  lastSeen: number | null;
  runs: number;
};
export type ReportNotification = {
  id: string;
  kind: 'issue' | 'feature';
  title: string;
  status: z.infer<typeof reportStatus>;
};
