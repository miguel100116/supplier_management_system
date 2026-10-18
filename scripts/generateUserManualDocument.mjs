import { readFileSync, writeFileSync } from 'node:fs';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  HeadingLevel,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';

const sourcePath = new URL('../docs/user-guides/Supplier_Management_System_User_Manual.md', import.meta.url);
const outputPath = new URL('../docs/user-guides/Supplier_Management_System_User_Manual.docx', import.meta.url);
const lines = readFileSync(sourcePath, 'utf8').replace(/\r\n/g, '\n').split('\n');

const colors = {
  blue: '0866B1',
  darkBlue: '064D85',
  ink: '172033',
  muted: '596579',
  paleBlue: 'EAF4FC',
  paleGold: 'FFF7DF',
  border: 'D8E1EA',
  white: 'FFFFFF',
};

function inlineRuns(value, options = {}) {
  const runs = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > cursor) runs.push(new TextRun({ text: value.slice(cursor, match.index), ...options }));
    const token = match[0];
    if (token.startsWith('**')) runs.push(new TextRun({ text: token.slice(2, -2), bold: true, ...options }));
    else runs.push(new TextRun({ text: token.slice(1, -1), font: 'Consolas', color: colors.darkBlue, ...options }));
    cursor = match.index + token.length;
  }
  if (cursor < value.length) runs.push(new TextRun({ text: value.slice(cursor), ...options }));
  return runs.length ? runs : [new TextRun({ text: value, ...options })];
}

function callout(text) {
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    margins: { top: 140, bottom: 140, left: 180, right: 180 },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            shading: { type: ShadingType.CLEAR, fill: colors.paleGold, color: 'auto' },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: 'E8C763' },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E8C763' },
              left: { style: BorderStyle.SINGLE, size: 16, color: 'D8A719' },
              right: { style: BorderStyle.SINGLE, size: 4, color: 'E8C763' },
            },
            children: [new Paragraph({ spacing: { before: 40, after: 40 }, children: inlineRuns(text, { color: colors.ink }) })],
          }),
        ],
      }),
    ],
  });
}

function markdownTable(rows) {
  const dataRows = rows.filter((_, index) => index !== 1).map((line) =>
    line.trim().replace(/^\||\|$/g, '').split('|').map((cell) => cell.trim()),
  );
  const columnCount = Math.max(...dataRows.map((row) => row.length));
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    columnWidths: Array.from({ length: columnCount }, () => Math.floor(9000 / columnCount)),
    rows: dataRows.map((row, rowIndex) => new TableRow({
      tableHeader: rowIndex === 0,
      children: Array.from({ length: columnCount }, (_, cellIndex) => new TableCell({
        width: { size: Math.floor(100 / columnCount), type: WidthType.PERCENTAGE },
        shading: rowIndex === 0 ? { type: ShadingType.CLEAR, fill: colors.blue, color: 'auto' } : undefined,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: colors.border },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: colors.border },
          left: { style: BorderStyle.SINGLE, size: 4, color: colors.border },
          right: { style: BorderStyle.SINGLE, size: 4, color: colors.border },
        },
        margins: { top: 100, bottom: 100, left: 120, right: 120 },
        children: [new Paragraph({
          children: inlineRuns(row[cellIndex] ?? '', {
            bold: rowIndex === 0,
            color: rowIndex === 0 ? colors.white : colors.ink,
            size: 19,
          }),
        })],
      })),
    })),
  });
}

const content = [];
let index = lines.findIndex((line) => line.startsWith('# Part I'));
while (index < lines.length) {
  const raw = lines[index];
  const line = raw.trim();
  if (!line || line === '---') {
    index += 1;
    continue;
  }

  if (line.startsWith('|')) {
    const tableLines = [];
    while (index < lines.length && lines[index].trim().startsWith('|')) {
      tableLines.push(lines[index]);
      index += 1;
    }
    content.push(markdownTable(tableLines));
    content.push(new Paragraph({ spacing: { after: 120 } }));
    continue;
  }

  const heading = line.match(/^(#{1,3})\s+(.+)$/);
  if (heading) {
    const level = heading[1].length;
    if (line === '# Part II — Employee Manual') content.push(new Paragraph({ children: [new PageBreak()] }));
    content.push(new Paragraph({
      heading: level === 1 ? HeadingLevel.HEADING_1 : level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3,
      children: inlineRuns(heading[2]),
    }));
    index += 1;
    continue;
  }

  if (line.startsWith('> ')) {
    content.push(callout(line.slice(2)));
    content.push(new Paragraph({ spacing: { after: 120 } }));
    index += 1;
    continue;
  }

  const ordered = line.match(/^(\d+)\.\s+(.+)$/);
  if (ordered) {
    content.push(new Paragraph({
      numbering: { reference: 'manual-numbering', level: 0 },
      spacing: { after: 80 },
      children: inlineRuns(ordered[2]),
    }));
    index += 1;
    continue;
  }

  if (line.startsWith('- ')) {
    content.push(new Paragraph({
      bullet: { level: 0 },
      spacing: { after: 70 },
      children: inlineRuns(line.slice(2)),
    }));
    index += 1;
    continue;
  }

  content.push(new Paragraph({ spacing: { after: 120 }, children: inlineRuns(line) }));
  index += 1;
}

const cover = [
  new Paragraph({ spacing: { before: 1800, after: 180 }, alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'SUPPLIER MANAGEMENT SYSTEM', bold: true, color: colors.blue, size: 24, characterSpacing: 80 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 240 }, children: [new TextRun({ text: 'Admin and Employee', bold: true, color: colors.ink, size: 44 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 620 }, children: [new TextRun({ text: 'USER MANUAL', bold: true, color: colors.darkBlue, size: 54 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'Version 1.0', color: colors.muted, size: 22 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 120 }, children: [new TextRun({ text: 'Updated October 18, 2026', color: colors.muted, size: 22 })] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 900 }, children: [new TextRun({ text: 'A practical guide for administrators and employees', italics: true, color: colors.muted, size: 22 })] }),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Contents')] }),
  new TableOfContents('Table of Contents', { hyperlink: true, headingStyleRange: '1-3' }),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('How to use this manual')] }),
  new Paragraph({ spacing: { after: 160 }, children: [new TextRun('Follow the numbered steps for each task. Important warnings and good-practice reminders appear in highlighted boxes. Module names match the current application navigation.')] }),
  callout('Notifications and Settings are not displayed in the left sidebar. Use the header bell for Notifications and the account menu for Settings and Sign out.'),
];

const document = new Document({
  creator: 'Supplier Management System',
  title: 'Supplier Management System — Admin and Employee User Manual',
  description: 'User-friendly operating manual for system administrators and employees.',
  styles: {
    default: { document: { run: { font: 'Aptos', size: 21, color: colors.ink }, paragraph: { spacing: { line: 300 } } } },
    paragraphStyles: [
      { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal', run: { font: 'Aptos Display', size: 56, bold: true, color: colors.darkBlue } },
      { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Aptos Display', size: 34, bold: true, color: colors.darkBlue }, paragraph: { spacing: { before: 360, after: 180 }, keepNext: true, outlineLevel: 0 } },
      { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Aptos Display', size: 28, bold: true, color: colors.blue }, paragraph: { spacing: { before: 280, after: 140 }, keepNext: true, outlineLevel: 1 } },
      { id: 'Heading3', name: 'Heading 3', basedOn: 'Normal', next: 'Normal', quickFormat: true, run: { font: 'Aptos', size: 23, bold: true, color: colors.ink }, paragraph: { spacing: { before: 220, after: 100 }, keepNext: true, outlineLevel: 2 } },
    ],
  },
  numbering: {
    config: [{
      reference: 'manual-numbering',
      levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.START, style: { paragraph: { indent: { left: 540, hanging: 300 } } } }],
    }],
  },
  sections: [{
    properties: { page: { margin: { top: 900, right: 900, bottom: 900, left: 900 } } },
    headers: { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: 'Supplier Management System  |  User Manual', color: colors.muted, size: 17 })] })] }) },
    footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Page ', color: colors.muted, size: 17 }), new TextRun({ children: [PageNumber.CURRENT], color: colors.muted, size: 17 })] })] }) },
    children: [...cover, ...content],
  }],
});

writeFileSync(outputPath, await Packer.toBuffer(document));
console.log(`Created ${outputPath.pathname}`);
