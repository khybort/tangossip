/** Lower bound of the Wilson score interval at 95%: few votes cannot outrank many. */
export function wilsonLower(up: number, down: number, z = 1.96): number {
  const n = up + down;
  if (n === 0) return 0;
  const p = up / n;
  return (p + (z * z) / (2 * n) - z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n)) / (1 + (z * z) / n);
}

export interface ReportStat {
  author_id: string;
  up: number;
  down: number;
  corroborations: number;
}

/** Independent authors dominate; votes refine. A single report with many upvotes stays below two independent reports. */
export function personRank(reports: ReportStat[]): number {
  if (!reports.length) return 0;
  const authors = new Set(reports.map((r) => r.author_id)).size;
  const credibility = reports.reduce((sum, r) => sum + wilsonLower(r.up, r.down), 0) / reports.length;
  const corroborations = reports.reduce((sum, r) => sum + r.corroborations, 0);
  return authors * 10 + credibility * 5 + Math.log1p(corroborations) * 2;
}
