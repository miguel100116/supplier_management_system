import PptxGenJS from 'pptxgenjs';
import { Slide, SLIDE_EYEBROWS } from '../domain/presentation';

// 16:9 widescreen, matching the on-screen deck's 1280x720 design canvas
// (SlideDeck.tsx) so the two stay visually consistent.
const SLIDE_W = 10;
const SLIDE_H = 5.625;
const MARGIN = 0.4;
const CONTENT_W = SLIDE_W - MARGIN * 2;
const CONTENT_BOTTOM = SLIDE_H - 0.3;

const BRAND = '0063A9';
const INK = '172033';
const MUTED = '64748B';
const BORDER = 'E2E8F0';
const SURFACE = 'F8FAFC';
const FONT = 'Arial';

const surveyTypeHex: Record<string, string> = {
  Courier: '2563EB',
  Supplier: '10B981',
  Subcontractor: 'F97316',
};

/**
 * Draws the shared eyebrow/title/subtitle header used by every content
 * slide, and returns the y-coordinate where the slide's own content should
 * start - every slide below then stretches its content to CONTENT_BOTTOM,
 * so charts/lists always claim the full remaining height instead of
 * sitting in a fixed, potentially too-small (or too-empty) box.
 */
function addHeader(slide: PptxGenJS.Slide, eyebrow: string, title: string, subtitle?: string): number {
  slide.addText(eyebrow.toUpperCase(), {
    x: MARGIN, y: 0.22, w: CONTENT_W, h: 0.22,
    fontSize: 9, bold: true, color: BRAND, fontFace: FONT, charSpacing: 2,
  });
  slide.addText(title, {
    x: MARGIN, y: 0.42, w: CONTENT_W, h: 0.42,
    fontSize: 20, bold: true, color: INK, fontFace: FONT,
  });
  let y = 0.86;
  if (subtitle) {
    slide.addText(subtitle, {
      x: MARGIN, y, w: CONTENT_W, h: 0.24,
      fontSize: 10.5, color: MUTED, fontFace: FONT,
    });
    y += 0.26;
  }
  slide.addShape('rect', { x: MARGIN, y: y + 0.04, w: 0.5, h: 0.035, fill: { color: BRAND }, line: { type: 'none' } });
  return y + 0.2;
}

export function exportSlidesAsPPTX(slides: Slide[], deckTitle: string) {
  const pres = new PptxGenJS();
  pres.defineLayout({ name: 'DECK_16x9', width: SLIDE_W, height: SLIDE_H });
  pres.layout = 'DECK_16x9';
  pres.title = deckTitle;

  let pdfMaxRating = 4;
  const questionsSlide = slides.find((s) => s.kind === 'questions') as Extract<Slide, { kind: 'questions' }> | undefined;
  if (questionsSlide?.maxRating) {
    pdfMaxRating = questionsSlide.maxRating;
  } else {
    const overviewSlide = slides.find((s) => s.kind === 'overview') as Extract<Slide, { kind: 'overview' }> | undefined;
    const avgRatingKpi = overviewSlide?.kpis.find((k) => k.label === 'Average Rating');
    const match = avgRatingKpi?.value.match(/\/ ([\d.]+)/);
    if (match) pdfMaxRating = parseFloat(match[1]);
  }

  slides.forEach((slide) => renderSlide(pres, slide, pdfMaxRating));

  const filename = `${deckTitle.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'presentation'}_${new Date()
    .toISOString()
    .slice(0, 10)}.pptx`;
  pres.writeFile({ fileName: filename });
}

function renderSlide(pres: PptxGenJS, slide: Slide, pdfMaxRating: number) {
  const pptxSlide = pres.addSlide();

  switch (slide.kind) {
    case 'title': {
      pptxSlide.background = { color: BRAND };
      pptxSlide.addShape('ellipse', {
        x: SLIDE_W - 2.6, y: -1.3, w: 3.2, h: 3.2,
        fill: { color: '00335A' }, line: { type: 'none' },
      });
      pptxSlide.addText(`Generated ${slide.generatedDate}`, {
        x: SLIDE_W - 4.4, y: 0.3, w: 4, h: 0.25, align: 'right',
        fontSize: 9, color: 'DBEAFE', fontFace: FONT,
      });
      pptxSlide.addText(slide.subtitle.toUpperCase(), {
        x: MARGIN, y: SLIDE_H / 2 - 0.75, w: CONTENT_W, h: 0.3,
        fontSize: 12, bold: true, color: '7DD3FC', fontFace: FONT, charSpacing: 3,
      });
      pptxSlide.addText(slide.title, {
        x: MARGIN, y: SLIDE_H / 2 - 0.42, w: CONTENT_W, h: 0.9,
        fontSize: 30, bold: true, color: 'FFFFFF', fontFace: FONT,
      });
      pptxSlide.addText(slide.meta.join('     •     '), {
        x: MARGIN, y: SLIDE_H / 2 + 0.55, w: CONTENT_W, h: 0.3,
        fontSize: 11, color: 'DBEAFE', fontFace: FONT,
      });
      break;
    }

    case 'agenda': {
      addHeader(pptxSlide, SLIDE_EYEBROWS.agenda, 'Contents');
      const rowH = Math.min(0.62, (CONTENT_BOTTOM - 1.15) / slide.items.length);
      let y = 1.15;
      slide.items.forEach((item, i) => {
        pptxSlide.addShape('ellipse', { x: MARGIN, y: y + (rowH - 0.34) / 2, w: 0.34, h: 0.34, fill: { color: BRAND }, line: { type: 'none' } });
        pptxSlide.addText(String(i + 1), {
          x: MARGIN, y: y + (rowH - 0.34) / 2, w: 0.34, h: 0.34, align: 'center', valign: 'middle',
          fontSize: 11, bold: true, color: 'FFFFFF', fontFace: FONT,
        });
        pptxSlide.addText(
          [
            { text: item.label, options: { fontSize: 12.5, bold: true, color: INK, breakLine: true } },
            { text: item.description, options: { fontSize: 9.5, color: MUTED } },
          ],
          { x: MARGIN + 0.5, y, w: CONTENT_W - 0.5, h: rowH, valign: 'middle', fontFace: FONT },
        );
        y += rowH;
      });
      break;
    }

    case 'overview': {
      const contentTop = addHeader(pptxSlide, SLIDE_EYEBROWS.overview, 'Where things stand');
      const kpiGap = 0.12;
      const kpiW = (CONTENT_W - kpiGap * (slide.kpis.length - 1)) / slide.kpis.length;
      const kpiH = 0.72;
      slide.kpis.forEach((kpi, i) => {
        const x = MARGIN + i * (kpiW + kpiGap);
        pptxSlide.addShape('roundRect', {
          x, y: contentTop, w: kpiW, h: kpiH, rectRadius: 0.06,
          fill: { color: 'FFFFFF' }, line: { color: BORDER, width: 1 },
        });
        pptxSlide.addText(kpi.label.toUpperCase(), {
          x: x + 0.12, y: contentTop + 0.08, w: kpiW - 0.24, h: 0.24,
          fontSize: 7.5, bold: true, color: MUTED, fontFace: FONT,
        });
        pptxSlide.addText(kpi.value, {
          x: x + 0.12, y: contentTop + 0.32, w: kpiW - 0.24, h: 0.36,
          fontSize: 16, bold: true, color: INK, fontFace: FONT,
        });
      });

      const bannerTop = contentTop + kpiH + 0.18;
      const bannerH = 0.85;
      pptxSlide.addShape('roundRect', {
        x: MARGIN, y: bannerTop, w: CONTENT_W, h: bannerH, rectRadius: 0.06,
        fill: { color: 'FFFFFF' }, line: { color: BRAND, width: 1.5 },
      });
      pptxSlide.addText('TOP PERFORMER OVERALL', {
        x: MARGIN + 0.2, y: bannerTop + 0.12, w: CONTENT_W - 0.4, h: 0.22,
        fontSize: 9, bold: true, color: BRAND, fontFace: FONT,
      });
      pptxSlide.addText(`${slide.standout.name}  —  ${slide.standout.score}`, {
        x: MARGIN + 0.2, y: bannerTop + 0.36, w: CONTENT_W - 0.4, h: 0.4,
        fontSize: 15, bold: true, color: INK, fontFace: FONT,
      });

      // Remaining vertical space always goes to the top-performers row, so
      // there's no leftover empty band regardless of screen/print size.
      const listTop = bannerTop + bannerH + 0.16;
      const listH = CONTENT_BOTTOM - listTop;
      if (listH > 0.3 && slide.topPerformers.length > 0) {
        const colGap = 0.14;
        const colW = (CONTENT_W - colGap * (slide.topPerformers.length - 1)) / slide.topPerformers.length;
        slide.topPerformers.forEach((performer, i) => {
          const x = MARGIN + i * (colW + colGap);
          pptxSlide.addShape('roundRect', {
            x, y: listTop, w: colW, h: listH, rectRadius: 0.06,
            fill: { color: SURFACE }, line: { color: BORDER, width: 1 },
          });
          pptxSlide.addText(`TOP ${performer.type.toUpperCase()}`, {
            x: x + 0.12, y: listTop + 0.1, w: colW - 0.24, h: 0.2,
            fontSize: 7.5, bold: true, color: MUTED, fontFace: FONT,
          });
          pptxSlide.addText(performer.name, {
            x: x + 0.12, y: listTop + 0.32, w: colW - 0.24, h: listH - 0.62,
            fontSize: 11, bold: true, color: INK, fontFace: FONT, valign: 'top',
          });
          pptxSlide.addText(performer.score, {
            x: x + 0.12, y: listTop + listH - 0.3, w: colW - 0.24, h: 0.24,
            fontSize: 11, bold: true, color: BRAND, fontFace: FONT,
          });
        });
      }
      break;
    }

    case 'comparison': {
      const contentTop = addHeader(pptxSlide, SLIDE_EYEBROWS.comparison, 'Survey Type Comparison');
      const chartH = CONTENT_BOTTOM - contentTop;
      pptxSlide.addChart(
        pres.ChartType.bar,
        [
          {
            name: 'Average rating',
            labels: slide.data.map((d) => d.surveyType),
            values: slide.data.map((d) => Number(d.average.toFixed(2))),
          },
        ],
        {
          x: MARGIN, y: contentTop, w: CONTENT_W, h: chartH,
          barDir: 'bar',
          chartColors: slide.data.map((d) => surveyTypeHex[d.surveyType] ?? BRAND),
          valAxisMinVal: 0,
          valAxisMaxVal: pdfMaxRating,
          showValue: true,
          dataLabelPosition: 'outEnd',
          dataLabelFontSize: 10,
          dataLabelColor: INK,
          catAxisLabelFontSize: 11,
          catAxisLabelColor: INK,
          valAxisLabelFontSize: 9,
          valAxisLabelColor: MUTED,
          showLegend: false,
          barGapWidthPct: 40,
          valGridLine: { color: BORDER },
        },
      );
      break;
    }

    case 'sections': {
      const contentTop = addHeader(pptxSlide, SLIDE_EYEBROWS.sections, 'Category Breakdown');
      const chartH = CONTENT_BOTTOM - contentTop;
      const sorted = slide.data;
      const maxAvg = Math.max(4, ...sorted.map((d) => d.average));
      pptxSlide.addChart(
        pres.ChartType.bar,
        [
          {
            name: 'Average rating',
            labels: sorted.map((d) => d.category),
            values: sorted.map((d) => Number(d.average.toFixed(2))),
          },
        ],
        {
          x: MARGIN, y: contentTop, w: CONTENT_W, h: chartH,
          barDir: 'bar',
          chartColors: sorted.map((d, i) => (i === 0 ? '10B981' : i === sorted.length - 1 ? 'EF4444' : BRAND)),
          valAxisMinVal: 0,
          valAxisMaxVal: Number(maxAvg.toFixed(2)),
          showValue: true,
          dataLabelPosition: 'outEnd',
          dataLabelFontSize: 9,
          dataLabelColor: INK,
          catAxisLabelFontSize: 9.5,
          catAxisLabelColor: INK,
          valAxisLabelFontSize: 8.5,
          valAxisLabelColor: MUTED,
          showLegend: false,
          barGapWidthPct: 30,
          valGridLine: { color: BORDER },
        },
      );
      break;
    }

    case 'leaderboard': {
      const contentTop = addHeader(pptxSlide, SLIDE_EYEBROWS.leaderboard, 'Company Leaderboard');
      const groups = slide.groups;
      const colGap = 0.2;
      const colW = (CONTENT_W - colGap * (groups.length - 1)) / groups.length;
      const colH = CONTENT_BOTTOM - contentTop;
      groups.forEach((group, gi) => {
        const x = MARGIN + gi * (colW + colGap);
        pptxSlide.addShape('roundRect', {
          x, y: contentTop, w: colW, h: colH, rectRadius: 0.06,
          fill: { color: SURFACE }, line: { color: BORDER, width: 1 },
        });
        pptxSlide.addText(group.surveyType.toUpperCase(), {
          x: x + 0.12, y: contentTop + 0.1, w: colW - 0.24, h: 0.26,
          fontSize: 11, bold: true, color: surveyTypeHex[group.surveyType] ?? BRAND, fontFace: FONT,
        });
        const rows = group.rows;
        const rowTop = contentTop + 0.42;
        const rowH = rows.length > 0 ? Math.min(0.42, (colH - 0.52) / rows.length) : 0;
        if (rows.length === 0) {
          pptxSlide.addText('No data for this window.', {
            x: x + 0.12, y: rowTop, w: colW - 0.24, h: 0.3, fontSize: 9, italic: true, color: MUTED, fontFace: FONT,
          });
        } else {
          rows.forEach((row, ri) => {
            const y = rowTop + ri * rowH;
            pptxSlide.addText(`${row.rank}.`, {
              x: x + 0.12, y, w: 0.3, h: rowH, fontSize: 9.5, bold: true, color: MUTED, fontFace: FONT, valign: 'middle',
            });
            pptxSlide.addText(row.company, {
              x: x + 0.42, y, w: colW - 1.1, h: rowH, fontSize: 9.5, color: INK, fontFace: FONT, valign: 'middle',
            });
            pptxSlide.addText(row.score.toFixed(0), {
              x: x + colW - 0.6, y, w: 0.5, h: rowH, align: 'right', fontSize: 10, bold: true, color: row.hex.replace('#', ''), fontFace: FONT, valign: 'middle',
            });
          });
        }
      });
      break;
    }

    case 'trends': {
      const contentTop = addHeader(pptxSlide, SLIDE_EYEBROWS.trends, 'Trends Over Time');
      const chartH = CONTENT_BOTTOM - contentTop;
      pptxSlide.addChart(
        pres.ChartType.line,
        [
          {
            name: 'Average rating',
            labels: slide.data.filter((d) => d.average !== null).map((d) => d.month),
            values: slide.data.filter((d) => d.average !== null).map((d) => Number(d.average!.toFixed(2))),
          },
        ],
        {
          x: MARGIN, y: contentTop, w: CONTENT_W, h: chartH,
          valAxisMinVal: 0,
          lineDataSymbol: 'circle',
          lineDataSymbolSize: 5,
          lineSize: 2.5,
          chartColors: ['2563EB'],
          catAxisLabelFontSize: 9.5,
          catAxisLabelColor: INK,
          valAxisLabelFontSize: 8.5,
          valAxisLabelColor: MUTED,
          showLegend: false,
          valGridLine: { color: BORDER },
          showValue: true,
          dataLabelFontSize: 8.5,
          dataLabelColor: MUTED,
          dataLabelPosition: 't',
        },
      );
      break;
    }

    case 'questions': {
      const contentTop = addHeader(pptxSlide, SLIDE_EYEBROWS.questions, 'Top & Bottom Questions');
      const colGap = 0.3;
      const colW = (CONTENT_W - colGap) / 2;
      const colH = CONTENT_BOTTOM - contentTop;
      const columns: { label: string; color: string; items: { question: string; average: number }[]; x: number }[] = [
        { label: 'Highest scoring', color: '10B981', items: slide.top, x: MARGIN },
        { label: 'Lowest scoring', color: 'EF4444', items: slide.bottom, x: MARGIN + colW + colGap },
      ];
      columns.forEach((col) => {
        pptxSlide.addText(col.label.toUpperCase(), {
          x: col.x, y: contentTop, w: colW, h: 0.24, fontSize: 10, bold: true, color: col.color, fontFace: FONT,
        });
        const rowTop = contentTop + 0.32;
        const rowH = col.items.length > 0 ? Math.min(0.68, (colH - 0.32) / col.items.length) : 0;
        col.items.forEach((q, i) => {
          const y = rowTop + i * rowH;
          pptxSlide.addShape('roundRect', {
            x: col.x, y: y + 0.03, w: colW, h: rowH - 0.06, rectRadius: 0.05,
            fill: { color: col.color, transparency: 85 }, line: { type: 'none' },
          });
          pptxSlide.addText(
            [
              { text: `${i + 1}. `, options: { bold: true, color: col.color } },
              { text: q.question, options: { color: INK } },
            ],
            {
              x: col.x + 0.12, y: y + 0.06, w: colW - 0.24, h: rowH - 0.34,
              fontSize: 8.5, fontFace: FONT, valign: 'top',
            },
          );
          pptxSlide.addText(q.average.toFixed(2), {
            x: col.x + 0.12, y: y + rowH - 0.26, w: colW - 0.24, h: 0.2,
            fontSize: 9, bold: true, color: col.color, fontFace: FONT,
          });
        });
      });
      break;
    }

    case 'spotlight': {
      const contentTop = addHeader(pptxSlide, SLIDE_EYEBROWS.spotlight, 'Company Spotlight');
      const leftW = 3.4;
      const rightX = MARGIN + leftW + 0.3;
      const rightW = CONTENT_W - leftW - 0.3;
      const panelH = CONTENT_BOTTOM - contentTop;

      pptxSlide.addShape('roundRect', {
        x: MARGIN, y: contentTop, w: leftW, h: panelH, rectRadius: 0.08,
        fill: { color: 'FFFFFF' }, line: { color: BORDER, width: 1.5 },
      });
      const hex = slide.hex.replace('#', '');
      pptxSlide.addText(slide.band.toUpperCase(), {
        x: MARGIN + 0.22, y: contentTop + 0.22, w: leftW - 0.44, h: 0.24,
        fontSize: 9, bold: true, color: hex, fontFace: FONT,
      });
      pptxSlide.addText(slide.company, {
        x: MARGIN + 0.22, y: contentTop + 0.5, w: leftW - 0.44, h: 0.5,
        fontSize: 16, bold: true, color: INK, fontFace: FONT,
      });
      pptxSlide.addText(slide.surveyType, {
        x: MARGIN + 0.22, y: contentTop + 0.95, w: leftW - 0.44, h: 0.24,
        fontSize: 10, color: MUTED, fontFace: FONT,
      });
      pptxSlide.addText(
        [
          { text: `${slide.score.toFixed(1)} `, options: { fontSize: 30, bold: true, color: hex } },
          { text: '/ 100', options: { fontSize: 13, color: MUTED } },
        ],
        { x: MARGIN + 0.22, y: contentTop + 1.3, w: leftW - 0.44, h: 0.55, fontFace: FONT },
      );
      if (slide.atRisk) {
        const riskY = contentTop + panelH - 1.05;
        pptxSlide.addShape('roundRect', {
          x: MARGIN + 0.22, y: riskY, w: leftW - 0.44, h: 0.95, rectRadius: 0.06,
          fill: { color: 'FFFBEB' }, line: { type: 'none' },
        });
        pptxSlide.addText(
          [
            { text: `${slide.atRisk.company} `, options: { bold: true, color: 'B45309' } },
            {
              text: `is trailing its peer group at ${slide.atRisk.score.toFixed(1)} / 100 and may need attention.`,
              options: { color: 'B45309' },
            },
          ],
          { x: MARGIN + 0.34, y: riskY + 0.1, w: leftW - 0.68, h: 0.75, fontSize: 9, fontFace: FONT, valign: 'top' },
        );
      }

      pptxSlide.addShape('roundRect', {
        x: rightX, y: contentTop, w: rightW, h: panelH, rectRadius: 0.06,
        fill: { color: 'FFFFFF' }, line: { color: BORDER, width: 1 },
      });
      pptxSlide.addChart(
        pres.ChartType.radar,
        [
          {
            name: slide.company,
            labels: slide.radar.map((r) => r.section),
            values: slide.radar.map((r) => Number(r.value.toFixed(1))),
          },
          {
            name: 'Peer average',
            labels: slide.radar.map((r) => r.section),
            values: slide.radar.map((r) => Number(r.peer.toFixed(1))),
          },
        ],
        {
          x: rightX + 0.15, y: contentTop + 0.15, w: rightW - 0.3, h: panelH - 0.3,
          chartColors: [hex, '94A3B8'],
          valAxisMinVal: 0,
          valAxisMaxVal: 100,
          catAxisLabelFontSize: 8,
          catAxisLabelColor: INK,
          showLegend: true,
          legendFontSize: 9,
          legendPos: 'b',
          radarStyle: 'filled',
        },
      );
      break;
    }

    case 'distribution': {
      const contentTop = addHeader(
        pptxSlide,
        SLIDE_EYEBROWS.distribution,
        'Partners Needing Attention',
        `Companies trailing their own peer group, and the specific category dragging each one down${slide.naPercentage > 0 ? ` (${slide.naPercentage.toFixed(1)}% of ratings marked N/A)` : ''}.`,
      );
      const colH = CONTENT_BOTTOM - contentTop;

      if (slide.atRisk.length === 0) {
        pptxSlide.addText('No partner is meaningfully trailing its peer group in this window.', {
          x: MARGIN, y: contentTop, w: CONTENT_W, h: 0.6, fontSize: 11, italic: true, color: MUTED, fontFace: FONT,
        });
        break;
      }

      const cols = slide.atRisk.length <= 4 ? 2 : 3;
      const cardGap = 0.2;
      const cardW = (CONTENT_W - cardGap * (cols - 1)) / cols;
      const rows = Math.ceil(slide.atRisk.length / cols);
      const cardH = Math.min(1.15, (colH - cardGap * (rows - 1)) / rows);

      slide.atRisk.forEach((c, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = MARGIN + col * (cardW + cardGap);
        const y = contentTop + row * (cardH + cardGap);

        pptxSlide.addShape('roundRect', {
          x, y, w: cardW, h: cardH, rectRadius: 0.06,
          fill: { color: 'FFFBEB' }, line: { color: 'FDE68A', width: 1 },
        });
        pptxSlide.addText(c.company, {
          x: x + 0.14, y: y + 0.08, w: cardW - 0.9, h: 0.26, fontSize: 11, bold: true, color: INK, fontFace: FONT,
        });
        pptxSlide.addText(`${c.surveyType} · ${c.band}`, {
          x: x + 0.14, y: y + 0.32, w: cardW - 0.9, h: 0.2, fontSize: 8, color: MUTED, fontFace: FONT,
        });
        pptxSlide.addText(c.score.toFixed(0), {
          x: x + cardW - 0.8, y: y + 0.06, w: 0.68, h: 0.36, align: 'right', valign: 'top',
          fontSize: 16, bold: true, color: c.hex.replace('#', ''), fontFace: FONT,
        });
        if (c.weakestSection) {
          pptxSlide.addText(`Weakest: ${c.weakestSection} (${(c.weakestPercent ?? 0).toFixed(0)}%)`, {
            x: x + 0.14, y: y + cardH - 0.36, w: cardW - 0.28, h: 0.18, fontSize: 8, bold: true, color: 'B45309', fontFace: FONT,
          });
          pptxSlide.addShape('roundRect', {
            x: x + 0.14, y: y + cardH - 0.16, w: cardW - 0.28, h: 0.06, rectRadius: 0.03,
            fill: { color: 'FDE68A' }, line: { type: 'none' },
          });
          pptxSlide.addShape('roundRect', {
            x: x + 0.14, y: y + cardH - 0.16, w: Math.max(0.05, (cardW - 0.28) * ((c.weakestPercent ?? 0) / 100)), h: 0.06, rectRadius: 0.03,
            fill: { color: 'F59E0B' }, line: { type: 'none' },
          });
        }
      });
      break;
    }

    case 'closing': {
      pptxSlide.background = { color: '172033' };
      pptxSlide.addText('Key Takeaways', {
        x: MARGIN, y: 0.5, w: CONTENT_W, h: 0.5, fontSize: 24, bold: true, color: 'FFFFFF', fontFace: FONT,
      });
      const listTop = 1.25;
      const listH = CONTENT_BOTTOM - listTop;
      const rowGap = 0.14;
      const rowH = Math.min(0.75, (listH - rowGap * (slide.takeaways.length - 1)) / slide.takeaways.length);
      slide.takeaways.forEach((point, i) => {
        const y = listTop + i * (rowH + rowGap);
        pptxSlide.addShape('roundRect', {
          x: MARGIN, y, w: CONTENT_W, h: rowH, rectRadius: 0.06,
          fill: { color: 'FFFFFF', transparency: 92 }, line: { color: 'FFFFFF', width: 0.75, transparency: 75 },
        });
        pptxSlide.addShape('ellipse', {
          x: MARGIN + 0.22, y: y + rowH / 2 - 0.04, w: 0.08, h: 0.08, fill: { color: '7DD3FC' }, line: { type: 'none' },
        });
        pptxSlide.addText(point, {
          x: MARGIN + 0.42, y, w: CONTENT_W - 0.6, h: rowH, valign: 'middle',
          fontSize: 11, color: 'E2E8F0', fontFace: FONT,
        });
      });
      pptxSlide.addText('THANK YOU', {
        x: MARGIN, y: SLIDE_H - 0.5, w: CONTENT_W, h: 0.3, align: 'center',
        fontSize: 10, bold: true, color: '7DD3FC', fontFace: FONT, charSpacing: 3,
      });
      break;
    }

    default:
      break;
  }
}
