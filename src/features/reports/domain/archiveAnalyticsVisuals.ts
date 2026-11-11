import type { ArchiveSeries, SurveyResponse, SurveyType } from '../../../types/survey';
import { buildAnalyticsSnapshot } from '../../analytics/domain/analyticsSnapshot';
import { formatNumber } from '../../analytics/domain/analytics';
import { analyticsBands, formatAnalyticsScore, getAnalyticsBand, getAnalyticsScore } from '../../analytics/domain/rankings';
import { getValueColorBand } from '../../analytics/domain/valueColorBand';
import type { AnalyticsSnapshot } from '../../analytics/domain/analyticsSnapshot';

const WIDTH = 1080;
const colors = { green: '#22c55e', yellow: '#facc15', orange: '#f97316', red: '#ef4444' };
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]!));
const text = (x: number, y: number, value: string, size = 20, fill = '#334155') => `<text x="${x}" y="${y}" font-size="${size}" fill="${fill}">${escape(value)}</text>`;
const panel = (x: number, y: number, width: number, height: number) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="12" fill="white" stroke="#e2e8f0"/>`;

export interface ArchiveAnalyticsVisual {
  title: string;
  svg: string;
  width: number;
  height: number;
  placement?: 'before-tables';
  description?: string;
  continuation?: boolean;
}

export interface ArchiveAnalyticsData { category: SurveyType; summary: AnalyticsSnapshot }

/** Derive display data without retaining respondent identities or raw comments. */
export function buildArchiveAnalyticsData(responses: SurveyResponse[], series: ArchiveSeries[] = []): ArchiveAnalyticsData[] {
  return (['Courier', 'Supplier', 'Subcontractor'] as SurveyType[]).flatMap(category => {
    const rows = responses.filter(row => row.surveyType === category);
    return rows.length ? [{ category, summary: buildAnalyticsSnapshot(rows, [category], [], series) }] : [];
  });
}

/** The caller supplies the exact exported archive cohort; no current-period or registry filter is applied. */
export function buildArchiveAnalyticsVisuals(analytics: ArchiveAnalyticsData[]): ArchiveAnalyticsVisual[] {
  const pages: ArchiveAnalyticsVisual[] = [];
  for (const { category, summary } of analytics) {
    const add = (title: string, body: string, height: number) => {
      const header = text(32, 44, `${category} Analytics`, 28, '#0063a9') + text(32, 76, 'Selected archived records · current rubric', 16, '#64748b');
      const page: ArchiveAnalyticsVisual = { title: `${category} ${title}`, width: WIDTH, height,
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}"><rect width="100%" height="100%" fill="#f8fafc"/><g font-family="Arial, sans-serif">${header}${body}${text(32, height - 18, 'Microgenesis Supplier Management System — Confidential', 14, '#64748b')}</g></svg>` };
      pages.push(page);
      return page;
    };
    let overview = '';
    const metrics = [
      ['Overall average score', summary.scoredSubmissionCount ? `${formatNumber(summary.averageScore)}/100` : 'No Score Yet'],
      ['Evaluations', String(summary.totalSubmissions)], ['Partners evaluated', String(summary.evaluatedPartnerCount)],
    ];
    metrics.forEach(([label, value], index) => {
      const x = 32 + index * 344;
      overview += panel(x, 106, 328, 116) + text(x + 20, 141, label, 18, '#64748b') + text(x + 20, 190, value, 32, '#0f172a');
    });
    overview += panel(32, 250, 650, 370) + text(54, 285, 'Rating trend', 23, '#0f172a')
      + text(54, 313, 'Average score and evaluation volume over time', 16, '#64748b');
    const trend = summary.monthly;
    const x0 = 88, y0 = 537, plotWidth = 520, plotHeight = 190;
    for (const tick of [0, 25, 50, 75, 100]) {
      const y = y0 - tick / 100 * plotHeight;
      overview += `<path d="M${x0} ${y}H${x0 + plotWidth}" stroke="#e2e8f0" stroke-dasharray="4 4"/>` + text(48, y + 5, String(tick), 14, '#64748b');
    }
    const maximumVolume = Math.max(1, ...trend.map(point => point.responses));
    const xAt = (index: number) => x0 + (trend.length === 1 ? plotWidth / 2 : index / Math.max(1, trend.length - 1) * plotWidth);
    for (const [key, color, maximum] of [['average', '#2187CD', 100], ['responses', '#10b981', maximumVolume]] as const) {
      if (key === 'average' && !summary.scoredSubmissionCount) continue;
      let points: string[] = [];
      const line = () => { if (points.length) overview += `<polyline fill="none" stroke="${color}" stroke-width="3" points="${points.join(' ')}"/>`; points = []; };
      trend.forEach((point, index) => {
        const value = point[key];
        if (value === null) { line(); return; }
        const y = y0 - Math.max(0, Math.min(maximum, value)) / maximum * plotHeight;
        points.push(`${xAt(index)},${y}`);
        overview += `<circle cx="${xAt(index)}" cy="${y}" r="4" fill="${color}"/>`;
      });
      line();
    }
    trend.forEach((point, index) => {
      if (index % Math.max(1, Math.ceil(trend.length / 5)) === 0) overview += text(xAt(index) - 24, 565, point.month, 13, '#64748b');
    });
    overview += text(88, 597, 'Average score (0–100)', 15, '#2187CD') + text(330, 597, `Evaluations (0–${maximumVolume})`, 15, '#059669');
    overview += panel(702, 250, 346, 370) + text(724, 285, 'Response volume', 23, '#0f172a')
      + text(724, 313, 'Counted evaluation forms', 16, '#64748b');
    const volume = summary.totalSubmissions;
    overview += `<rect x="817" y="${volume ? 367 : 537}" width="116" height="${volume ? 170 : 0}" rx="6" fill="${colors[getValueColorBand(volume)]}"/>`
      + text(837, 357, String(volume), 26, '#0f172a') + text(760, 570, category, 20);
    (['green', 'yellow', 'orange', 'red'] as const).forEach((color, index) => {
      const x = 723 + index * 78;
      overview += `<circle cx="${x}" cy="599" r="5" fill="${colors[color]}"/>` + text(x + 9, 604, ['90+', '80–89', '70–79', '<70'][index], 13, '#64748b');
    });
    if (!summary.scoredSubmissionCount) overview += text(54, 647, 'No scoreable evaluations in this archive.', 18, '#64748b');
    add('Overview', overview, 700);

    const sections = summary.analysis.find(item => item.type === category)?.peerAverages ?? [];
    if (sections.length) {
      let body = text(32, 126, 'Category performance', 24, '#0f172a')
        + text(32, 157, 'Average section scores across evaluated companies · normalized to 100', 17, '#64748b');
      sections.forEach((section, index) => {
        const y = 185 + index * 96;
        body += panel(32, y, 1016, 84) + text(52, y + 28, section.section, 21)
          + `<rect x="52" y="${y + 49}" width="850" height="10" rx="5" fill="#f1f5f9"/><rect x="52" y="${y + 49}" width="${Math.max(0, Math.min(100, section.average)) * 8.5}" height="10" rx="5" fill="#2563eb"/>`
          + text(930, y + 59, formatNumber(section.average), 22, '#0f172a');
      });
      add('Category performance', body, 245 + sections.length * 96);
    }

    const leaderboard = summary.companies;
    // Bound raster height for large archives; continuation images join the same Excel sheet.
    for (let offset = 0; offset < leaderboard.length; offset += 20) {
      const entries = leaderboard.slice(offset, offset + 20);
      const continuation = offset > 0;
      let body = continuation ? '' : text(32, 34, `${category} Company Leaderboard`, 22, '#0f172a');
      if (!continuation) analyticsBands[category].forEach((band, index) => { body += `<circle cx="${40 + index * 240}" cy="62" r="4" fill="${band.hex}"/>` + text(50 + index * 240, 67, band.label, 13, '#64748b'); });
      const headingY = continuation ? 20 : 100;
      const rowTop = headingY + 16;
      for (const x of [32, 550]) {
        body += text(x + 10, headingY, 'RANK', 11, '#64748b') + text(x + 77, headingY, 'COMPANY', 11, '#64748b')
          + text(x + 344, headingY, 'RANK SCORE', 11, '#64748b') + text(x + 444, headingY, 'FORMS', 11, '#64748b');
      }
      const split = Math.ceil(entries.length / 2);
      entries.forEach((entry, index) => {
        // Analytics fills the left column first, then the right column.
        const x = 32 + Math.floor(index / split) * 518;
        const y = rowTop + (index % split) * 66;
        const rank = offset + index + 1;
        const band = getAnalyticsBand(category, entry.rankScore);
        const nameClip = `company-name-${category}-${rank}`;
        const badgeSize = Math.min(16, Math.floor(52 / String(rank).length));
        // shortcut: abbreviate image labels; wrap them if visuals are exported without their full data tables.
        const name = entry.name.length > 26 ? `${entry.name.slice(0, 23)}…` : entry.name;
        body += `<g><rect x="${x + 1}" y="${y}" width="496" height="66" fill="${rank % 2 ? '#f8fafc' : '#ffffff'}"/><path d="M${x + 1} ${y + 66}h496" stroke="#f1f5f9"/>
          <rect x="${x + 10}" y="${y + 16}" width="36" height="28" rx="5" fill="#e2e8f0"/><text x="${x + 28}" y="${y + 36}" text-anchor="middle" font-size="${badgeSize}" font-weight="800" fill="#1e293b">${rank}</text>
          <circle cx="${x + 63}" cy="${y + 24}" r="4" fill="${band.hex}"/>
          <defs><clipPath id="${nameClip}"><rect x="${x + 77}" y="${y + 7}" width="262" height="26"/></clipPath></defs>
          <text x="${x + 77}" y="${y + 29}" font-size="18" font-weight="600" fill="#1e293b" clip-path="url(#${nameClip})">${escape(name)}</text>
          <text x="${x + 77}" y="${y + 49}" font-size="12" fill="#64748b">${category} · <tspan fill="${band.hex}">${escape(band.label)}</tspan></text>
          <text x="${x + 420}" y="${y + 37}" text-anchor="end" font-size="20" font-weight="700" fill="${band.hex}">${formatNumber(getAnalyticsScore(category, entry.rankScore))}</text>
          <path d="M${x + 431} ${y + 27}l5 5-5 5" fill="none" stroke="${band.hex}" stroke-width="2"/>
          <text x="${x + 482}" y="${y + 37}" text-anchor="end" font-size="15" fill="#64748b">${entry.count}</text></g>`;
      });
      const height = rowTop + split * 66 + 8;
      pages.push({ title: `${category} Leaderboard`, width: WIDTH, height, placement: 'before-tables', continuation,
        description: entries.map((entry, index) => `Rank ${offset + index + 1}: ${entry.name}, ${formatAnalyticsScore(category, entry.rankScore)}, ${getAnalyticsBand(category, entry.rankScore).label}, ${entry.count} forms.`).join(' '),
        svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}"><rect width="100%" height="100%" fill="white"/><g font-family="Arial, sans-serif">${body}</g></svg>` });
    }
    for (let offset = 0; offset < summary.questions.length; offset += 10) {
      const entries = summary.questions.slice(offset, offset + 10);
      let body = text(32, 126, `Question performance · ${offset + 1}–${offset + entries.length} of ${summary.questions.length}`, 24, '#0f172a');
      body += text(32, 147, 'Score (%): Green 90+ · Yellow 80–89 · Orange 70–79 · Red under 70', 14, '#64748b');
      entries.forEach((entry, index) => {
        const y = 153 + index * 90;
        const label = entry.question.length > 94 ? `${entry.question.slice(0, 91)}…` : entry.question;
        body += panel(32, y, 1016, 82) + text(48, y + 27, `${offset + index + 1}. ${label}`, 17)
          + `<rect x="48" y="${y + 49}" width="860" height="8" rx="4" fill="#f1f5f9"/><rect x="48" y="${y + 49}" width="${Math.max(0, Math.min(100, entry.average)) * 8.6}" height="8" rx="4" fill="${colors[getValueColorBand(entry.average)]}"/>`
          + text(930, y + 56, formatNumber(entry.average), 20, '#0f172a');
      });
      add(`Questions ${offset / 10 + 1}`, body, 210 + entries.length * 90);
    }
  }
  return [...pages.filter(page => page.placement === 'before-tables'), ...pages.filter(page => !page.placement)];
}
