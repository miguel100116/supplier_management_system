import * as XLSX from 'xlsx';

export interface ExportVisual {
  title: string;
  dataUrl: string;
  width: number;
  height: number;
  placement?: 'before-tables';
  description?: string;
  continuation?: boolean;
}

/** Add drawing parts using the ZIP writer already supplied by SheetJS. Raw worksheets stay intact. */
export function addWorkbookVisuals(bytes: ArrayBuffer, visuals: ExportVisual[], sheetNumbers: number[]): Uint8Array {
  if (sheetNumbers.length !== visuals.length
    || sheetNumbers.some(number => !Number.isInteger(number) || number < 1)) throw new Error('Invalid Analytics worksheet positions.');
  const zip = XLSX.CFB.read(new Uint8Array(bytes), { type: 'array' });
  const addXml = (path: string, value: string) => {
    XLSX.CFB.utils.cfb_del(zip, `/${path}`);
    XLSX.CFB.utils.cfb_add(zip, path, new TextEncoder().encode(value));
  };
  const readXml = (path: string): string => {
    const entry = XLSX.CFB.find(zip, path);
    if (!entry) throw new Error('Unable to attach archive Analytics to the workbook.');
    return new TextDecoder().decode(new Uint8Array(entry.content));
  };
  const relationships = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const office = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const drawingType = 'application/vnd.openxmlformats-officedocument.drawing+xml';
  let contentTypes = readXml('/[Content_Types].xml');
  const drawings = new Map<number, { anchors: string[]; relationships: string[]; height: number }>();
  const escapeXml = (value: string) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[character]!));
  if (!/Extension="png"/.test(contentTypes)) contentTypes = contentTypes.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>');
  visuals.forEach((visual, index) => {
    if (!Number.isFinite(visual.width) || !Number.isFinite(visual.height) || visual.width <= 0 || visual.height <= 0
      || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(visual.dataUrl)) throw new Error('Invalid archive Analytics image.');
    const number = index + 1;
    const sheet = sheetNumbers[index];
    const name = `archiveAnalytics${number}`;
    const binary = atob(visual.dataUrl.split(',')[1]);
    const imageBytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    if (imageBytes[0] !== 137 || imageBytes[1] !== 80 || imageBytes[2] !== 78 || imageBytes[3] !== 71) throw new Error('Invalid archive Analytics PNG.');
    const width = Math.round(visual.width * 9525), height = Math.round(visual.height * 9525);
    const drawing = drawings.get(sheet) ?? { anchors: [], relationships: [], height: 0 };
    const row = 2 + Math.floor(drawing.height / 20);
    const rowOffset = Math.round(drawing.height % 20 * 9525);
    drawing.anchors.push(`<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${row}</xdr:row><xdr:rowOff>${rowOffset}</xdr:rowOff></xdr:from><xdr:ext cx="${width}" cy="${height}"/><xdr:pic><xdr:nvPicPr><xdr:cNvPr id="${number}" name="Archive Analytics ${number}" descr="${escapeXml(visual.description ?? visual.title)}"/><xdr:cNvPicPr/></xdr:nvPicPr><xdr:blipFill><a:blip xmlns:r="${office}" r:embed="rIdImage${number}"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill><xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${width}" cy="${height}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor>`);
    drawing.relationships.push(`<Relationship Id="rIdImage${number}" Type="${office}/image" Target="../media/${name}.png"/>`);
    drawing.height += visual.height;
    drawings.set(sheet, drawing);
    XLSX.CFB.utils.cfb_add(zip, `xl/media/${name}.png`, imageBytes);
  });
  for (const [sheet, drawing] of drawings) {
    const name = `archiveAnalytics${sheet}`;
    addXml(`xl/worksheets/sheet${sheet}.xml`, readXml(`/xl/worksheets/sheet${sheet}.xml`).replace('</worksheet>', `<drawing xmlns:r="${office}" r:id="rIdAnalytics"/></worksheet>`));
    addXml(`xl/worksheets/_rels/sheet${sheet}.xml.rels`, `<Relationships xmlns="${relationships}"><Relationship Id="rIdAnalytics" Type="${office}/drawing" Target="../drawings/${name}.xml"/></Relationships>`);
    addXml(`xl/drawings/${name}.xml`, `<xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${drawing.anchors.join('')}</xdr:wsDr>`);
    addXml(`xl/drawings/_rels/${name}.xml.rels`, `<Relationships xmlns="${relationships}">${drawing.relationships.join('')}</Relationships>`);
    contentTypes = contentTypes.replace('</Types>', `<Override PartName="/xl/drawings/${name}.xml" ContentType="${drawingType}"/></Types>`);
  }
  addXml('[Content_Types].xml', contentTypes);
  return new Uint8Array(XLSX.CFB.write(zip, { type: 'array', fileType: 'zip', compression: true }));
}
