import type { ExtractedReport } from './parseReport';

/**
 * Hands a freshly read report from the import screen to the results form,
 * which fills its rows from it once (nothing is saved until the user checks
 * the values and taps Save).
 */
const pending = new Map<string, ExtractedReport>();

export function setPendingImport(recordId: string, report: ExtractedReport) {
  pending.set(recordId, report);
}

export function takePendingImport(recordId: string) {
  const report = pending.get(recordId) ?? null;
  pending.delete(recordId);
  return report;
}

/** A short record title from the report's sections, e.g. "Lipid Profile, Thyroid Profile". */
export function titleFor(report: ExtractedReport) {
  const sections = [...new Set(report.rows.map((r) => r.section).filter((s): s is string => !!s))];
  const title = sections.slice(0, 3).join(', ');
  if (title && title.length <= 60) return title;
  if (sections.length) return `${sections[0]}${sections.length > 1 ? ` + ${sections.length - 1} more` : ''}`.slice(0, 60);
  return report.labName ? `${report.labName} report` : 'Lab report';
}
