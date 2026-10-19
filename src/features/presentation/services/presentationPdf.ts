import jsPDF from 'jspdf';
import { Slide, SLIDE_EYEBROWS } from '../domain/presentation';

const PAGE_W = 841.89;
const PAGE_H = 595.28;
const MARGIN = 48;
const CONTENT_W = PAGE_W - MARGIN * 2;
const BRAND = '#0063a9';
const INK = '#172033';

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const bigint = parseInt(clean, 16);
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
}

function setFill(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setFillColor(r, g, b);
}

function setText(doc: jsPDF, hex: string) {
  const [r, g, b] = hexToRgb(hex);
  doc.setTextColor(r, g, b);
}

function drawCoverBackground(doc: jsPDF) {
  setFill(doc, '#0063a9');
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
  setFill(doc, '#00335a');
  doc.circle(PAGE_W - 60, 40, 90, 'F');
}

function drawClosingBackground(doc: jsPDF) {
  setFill(doc, '#172033');
  doc.rect(0, 0, PAGE_W, PAGE_H, 'F');
}

function drawHeader(doc: jsPDF, eyebrow: string, title: string, subtitle?: string) {
  setText(doc, BRAND);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(eyebrow.toUpperCase(), MARGIN, 56);

  setText(doc, INK);
  doc.setFontSize(20);
  doc.text(title, MARGIN, 82);

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    setText(doc, '#64748b');
    doc.text(subtitle, MARGIN, 100);
  }

  setFill(doc, BRAND);
  doc.rect(MARGIN, 112, 60, 3, 'F');
}

function bar(doc: jsPDF, x: number, y: number, w: number, h: number, fraction: number, color: string) {
  setFill(doc, '#e2e8f0');
  doc.roundedRect(x, y, w, h, h / 2, h / 2, 'F');
  setFill(doc, color);
  doc.roundedRect(x, y, Math.max(2, w * Math.max(0, Math.min(1, fraction))), h, h / 2, h / 2, 'F');
}

export function exportSlidesAsPDF(slides: Slide[], deckTitle: string) {
  const doc = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'landscape' });

  let pdfMaxRating = 4;
  const questionsSlide = slides.find((s) => s.kind === 'questions') as any;
  if (questionsSlide && questionsSlide.maxRating) {
    pdfMaxRating = questionsSlide.maxRating;
  } else {
    const overviewSlide = slides.find((s) => s.kind === 'overview') as any;
    if (overviewSlide && overviewSlide.kpis) {
      const avgRatingKpi = overviewSlide.kpis.find((k: any) => k.label === 'Average Rating');
      if (avgRatingKpi && avgRatingKpi.value) {
        const match = avgRatingKpi.value.match(/\/ ([\d.]+)/);
        if (match) {
          pdfMaxRating = parseFloat(match[1]);
        }
      }
    }
  }

  slides.forEach((slide, index) => {
    if (index > 0) doc.addPage();
    renderSlide(doc, slide, pdfMaxRating);
  });

  const filename = `${deckTitle.replace(/[^a-z0-9]+/gi, '_').toLowerCase() || 'presentation'}_${new Date()
    .toISOString()
    .slice(0, 10)}.pdf`;
  doc.save(filename);
}

function renderSlide(doc: jsPDF, slide: Slide, pdfMaxRating: number) {
  switch (slide.kind) {
    case 'title': {
      drawCoverBackground(doc);
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.text(`Generated ${slide.generatedDate}`, PAGE_W - MARGIN, 40, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text(slide.subtitle.toUpperCase(), MARGIN, PAGE_H / 2 - 30);
      doc.setFontSize(30);
      doc.text(slide.title, MARGIN, PAGE_H / 2 + 5, { maxWidth: PAGE_W - MARGIN * 2 });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(slide.meta.join('   ·   '), MARGIN, PAGE_H / 2 + 40);
      break;
    }
    case 'agenda': {
      drawHeader(doc, SLIDE_EYEBROWS.agenda, 'Contents');
      const top = 150;
      const bottom = PAGE_H - MARGIN;
      // Grows to fill the available height with a short agenda (e.g. only
      // 1-2 categories picked) instead of always stepping a fixed 42pt and
      // leaving the rest of the slide blank.
      const rowH = Math.min(64, (bottom - top) / slide.items.length);
      slide.items.forEach((item, i) => {
        const y = top + i * rowH;
        setFill(doc, BRAND);
        doc.circle(MARGIN + 8, y - 5, 9, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(String(i + 1), MARGIN + 8, y - 1.5, { align: 'center' });

        setText(doc, INK);
        doc.setFontSize(12);
        doc.text(item.label, MARGIN + 28, y - 2);
        setText(doc, '#64748b');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(item.description, MARGIN + 28, y + 13, { maxWidth: CONTENT_W - 28 });
      });
      break;
    }
    case 'overview': {
      drawHeader(doc, SLIDE_EYEBROWS.overview, 'Where things stand');
      let x = MARGIN;
      const kpiW = (PAGE_W - MARGIN * 2 - 30) / 4;
      slide.kpis.forEach((kpi) => {
        doc.setDrawColor(226, 232, 240);
        doc.roundedRect(x, 132, kpiW, 60, 6, 6, 'S');
        setText(doc, '#64748b');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.text(kpi.label.toUpperCase(), x + 10, 150, { maxWidth: kpiW - 20 });
        setText(doc, INK);
        doc.setFontSize(16);
        doc.text(kpi.value, x + 10, 175);
        x += kpiW + 10;
      });

      setText(doc, BRAND);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text('TOP PERFORMER OVERALL', MARGIN, 225);
      setText(doc, INK);
      doc.setFontSize(14);
      doc.text(`${slide.standout.name} — ${slide.standout.score}`, MARGIN, 245);

      let y = 280;
      slide.topPerformers.forEach((performer) => {
        setText(doc, '#64748b');
        doc.setFontSize(9);
        doc.setFont('helvetica', 'normal');
        doc.text(`Top ${performer.type}:`, MARGIN, y);
        setText(doc, INK);
        doc.setFont('helvetica', 'bold');
        doc.text(`${performer.name} (${performer.score})`, MARGIN + 100, y);
        y += 20;
      });
      break;
    }
    case 'comparison': {
      drawHeader(doc, SLIDE_EYEBROWS.comparison, 'Survey Type Comparison');
      const maxAvg = pdfMaxRating;
      const top = 150;
      const bottom = PAGE_H - MARGIN;
      // Rows share the whole remaining slide height (capped so 1-2 rows
      // don't stretch into oversized bars), instead of a fixed 44pt step
      // that leaves the bottom of the slide empty whenever there are fewer
      // than ~9 survey types.
      const rowH = Math.min(70, (bottom - top) / slide.data.length);
      slide.data.forEach((row, i) => {
        const y = top + i * rowH + rowH / 2;
        setText(doc, INK);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(row.surveyType, MARGIN, y - 6);
        setText(doc, '#64748b');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text(`${row.average.toFixed(2)} / ${pdfMaxRating.toFixed(2)}  ·  ${row.responses} responses`, MARGIN + 150, y - 6);
        bar(doc, MARGIN, y + 2, CONTENT_W, 12, row.average / maxAvg, BRAND);
      });
      break;
    }
    case 'sections': {
      drawHeader(doc, SLIDE_EYEBROWS.sections, 'Category Breakdown');
      const top = 150;
      const bottom = PAGE_H - MARGIN;
      const maxAvg = Math.max(4, ...slide.data.map((d) => d.average));
      // Row height fills whatever vertical space is actually available
      // instead of a fixed 34pt step, so a handful of categories don't
      // leave the bottom half of the slide empty.
      const rowH = Math.min(50, (bottom - top) / slide.data.length);
      slide.data.forEach((row, i) => {
        const y = top + i * rowH + rowH * 0.6;
        setText(doc, INK);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(row.category, MARGIN, y);
        setText(doc, '#64748b');
        doc.setFont('helvetica', 'normal');
        doc.text(row.average.toFixed(2), PAGE_W - MARGIN - 30, y);
        bar(doc, MARGIN, y + 6, CONTENT_W - 60, 8, row.average / maxAvg, i === 0 ? '#10b981' : '#2563eb');
      });
      break;
    }
    case 'leaderboard': {
      drawHeader(doc, SLIDE_EYEBROWS.leaderboard, 'Company Leaderboard');
      const colGap = 20;
      const colW = (CONTENT_W - colGap * (slide.groups.length - 1)) / slide.groups.length;
      const top = 165;
      const bottom = PAGE_H - MARGIN;
      const maxRows = Math.max(1, ...slide.groups.map((g) => g.rows.length));
      // One shared row height across every column, sized to the group with
      // the most rows, so all columns' lists fill the same vertical span
      // down to the bottom margin rather than stopping partway with a fixed
      // 18pt step (dead space below on any group with fewer companies).
      const rowH = Math.min(30, (bottom - top) / maxRows);
      let x = MARGIN;
      slide.groups.forEach((group) => {
        setText(doc, INK);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(group.surveyType, x, 145);
        group.rows.forEach((row, i) => {
          const y = top + i * rowH;
          setText(doc, '#64748b');
          doc.setFontSize(8.5);
          doc.setFont('helvetica', 'normal');
          doc.text(`${row.rank}. ${row.company}`, x, y, { maxWidth: colW - 30 });
          setText(doc, row.hex);
          doc.setFont('helvetica', 'bold');
          doc.text(row.score.toFixed(0), x + colW - 24, y);
        });
        x += colW + colGap;
      });
      break;
    }
    case 'trends': {
      drawHeader(doc, SLIDE_EYEBROWS.trends, 'Trends Over Time');
      const top = 160;
      const bottom = PAGE_H - MARGIN;
      const maxAvg = 4;
      const rowH = Math.min(36, (bottom - top) / slide.data.length);
      const barX = MARGIN + 220;
      slide.data.forEach((row, i) => {
        const y = top + i * rowH;
        setText(doc, INK);
        doc.setFontSize(9);
        doc.text(row.month, MARGIN, y);
        setText(doc, '#64748b');
        doc.text(`${row.average === null ? 'N/A avg' : `${row.average.toFixed(2)} avg`} · ${row.responses} resp.`, MARGIN + 90, y);
        if (row.average !== null) bar(doc, barX, y - 7, PAGE_W - MARGIN - barX, 8, row.average / maxAvg, '#10b981');
      });
      break;
    }
    case 'questions': {
      drawHeader(doc, SLIDE_EYEBROWS.questions, 'Top & Bottom Questions');
      const colW = (CONTENT_W - 30) / 2;
      const top = 165;
      const bottom = PAGE_H - MARGIN;
      [
        { label: 'Highest scoring', color: '#10b981', items: slide.top, x: MARGIN },
        { label: 'Lowest scoring', color: '#ef4444', items: slide.bottom, x: MARGIN + colW + 30 },
      ].forEach((col) => {
        setText(doc, col.color);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(col.label.toUpperCase(), col.x, 145);
        const rowH = col.items.length > 0 ? Math.min(46, (bottom - top) / col.items.length) : 0;
        col.items.forEach((q, i) => {
          const y = top + i * rowH;
          setText(doc, INK);
          doc.setFontSize(8);
          doc.setFont('helvetica', 'normal');
          doc.text(`${i + 1}. ${q.question}`, col.x, y, { maxWidth: colW - 10 });
          setText(doc, col.color);
          doc.setFont('helvetica', 'bold');
          doc.text(q.average.toFixed(2), col.x, y + 12);
        });
      });
      break;
    }
    case 'spotlight': {
      drawHeader(doc, SLIDE_EYEBROWS.spotlight, 'Company Spotlight');
      setText(doc, slide.hex);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(slide.band.toUpperCase(), MARGIN, 150);
      setText(doc, INK);
      doc.setFontSize(16);
      doc.text(slide.company, MARGIN, 172);
      setText(doc, '#64748b');
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(slide.surveyType, MARGIN, 188);
      setText(doc, slide.hex);
      doc.setFontSize(26);
      doc.setFont('helvetica', 'bold');
      doc.text(`${slide.score.toFixed(1)} / 100`, MARGIN, 225);

      const radarTop = 260;
      const radarBottom = slide.atRisk ? PAGE_H - MARGIN - 40 : PAGE_H - MARGIN;
      const rowH = slide.radar.length > 0 ? Math.min(32, (radarBottom - radarTop) / slide.radar.length) : 0;
      // Bar spans from just after the category label to just before the
      // right-aligned peer figure, instead of a fixed 300pt width that left
      // roughly a third of the slide's width empty on the right.
      const peerLabelW = 70;
      const barX = MARGIN + 150;
      const barW = PAGE_W - MARGIN - peerLabelW - barX;
      slide.radar.forEach((section, i) => {
        const y = radarTop + i * rowH;
        setText(doc, INK);
        doc.setFontSize(8.5);
        doc.setFont('helvetica', 'normal');
        doc.text(section.section, MARGIN, y, { maxWidth: 140 });
        bar(doc, barX, y - 8, barW, 8, section.value / 100, slide.hex);
        setText(doc, '#94a3b8');
        doc.text(`peer ${section.peer.toFixed(0)}`, PAGE_W - MARGIN, y, { align: 'right' });
      });
      const y = radarTop + slide.radar.length * rowH;

      if (slide.atRisk) {
        setText(doc, '#b45309');
        doc.setFontSize(8.5);
        doc.text(
          `Attention: ${slide.atRisk.company} is trailing its peer group at ${slide.atRisk.score.toFixed(1)} / 100.`,
          MARGIN,
          y + 12,
        );
      }
      break;
    }

    case 'distribution': {
      drawHeader(
        doc,
        SLIDE_EYEBROWS.distribution,
        'Partners Needing Attention',
        `Companies trailing their own peer group, and the specific category dragging each one down${slide.naPercentage > 0 ? ` (${slide.naPercentage.toFixed(1)}% of ratings marked N/A)` : ''}.`,
      );
      const top = 155;
      const bottom = PAGE_H - MARGIN;

      if (slide.atRisk.length === 0) {
        setText(doc, '#64748b');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text('No partner is meaningfully trailing its peer group in this window.', MARGIN, top + 10);
        break;
      }

      // Two-column card grid, cards growing to fill the available height.
      const cols = slide.atRisk.length <= 4 ? 2 : 3;
      const cardGap = 16;
      const cardW = (CONTENT_W - cardGap * (cols - 1)) / cols;
      const rows = Math.ceil(slide.atRisk.length / cols);
      const cardH = Math.min(90, (bottom - top - cardGap * (rows - 1)) / rows);

      slide.atRisk.forEach((c, i) => {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const x = MARGIN + col * (cardW + cardGap);
        const y = top + row * (cardH + cardGap);

        setFill(doc, '#fffbeb');
        doc.roundedRect(x, y, cardW, cardH, 8, 8, 'F');

        setText(doc, INK);
        doc.setFontSize(10.5);
        doc.setFont('helvetica', 'bold');
        doc.text(c.company, x + 14, y + 22, { maxWidth: cardW - 60 });

        setText(doc, '#94a3b8');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(`${c.surveyType} · ${c.band}`, x + 14, y + 36);

        setText(doc, c.hex);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(18);
        doc.text(c.score.toFixed(0), x + cardW - 14, y + 28, { align: 'right' });

        if (c.weakestSection) {
          setText(doc, '#b45309');
          doc.setFontSize(8);
          doc.setFont('helvetica', 'bold');
          doc.text(`Weakest: ${c.weakestSection} (${(c.weakestPercent ?? 0).toFixed(0)}%)`, x + 14, y + 54, {
            maxWidth: cardW - 28,
          });
          bar(doc, x + 14, y + 62, cardW - 28, 5, (c.weakestPercent ?? 0) / 100, '#f59e0b');
        }
      });
      break;
    }

    case 'closing': {
      drawClosingBackground(doc);
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.setFont('helvetica', 'bold');
      doc.text('Key Takeaways', MARGIN, 80);
      let y = 120;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      slide.takeaways.forEach((point) => {
        doc.setTextColor(147, 197, 253);
        doc.text('•', MARGIN, y);
        doc.setTextColor(226, 232, 240);
        doc.text(point, MARGIN + 16, y, { maxWidth: PAGE_W - MARGIN * 2 - 16 });
        y += 34;
      });
      break;
    }
    default:
      break;
  }
}
