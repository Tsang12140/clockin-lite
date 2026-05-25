import { NextRequest, NextResponse } from 'next/server';
import { getAttendanceForRange, getMonthlySalary } from '@/lib/queries';
import { monthRange } from '@/lib/utils';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

type XlsxFile = { name: string; content: string | Buffer };
type CellKind = 'worked' | 'special' | 'absent' | 'missing';

const STATUS_LABEL: Record<string, string> = {
  leave: '假',
  holiday: '休',
  sick: '病',
  absent: '旷',
};

const STYLE = {
  header: 1,
  name: 2,
  worked: 3,
  special: 4,
  absent: 5,
  missing: 6,
  total: 7,
  rate: 8,
  money: 9,
};

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function xml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function colName(index: number) {
  let name = '';
  let n = index;
  while (n > 0) {
    const mod = (n - 1) % 26;
    name = String.fromCharCode(65 + mod) + name;
    n = Math.floor((n - mod) / 26);
  }
  return name;
}

function cellRef(col: number, row: number) {
  return `${colName(col)}${row}`;
}

function stringCell(col: number, row: number, value: unknown, style = 0) {
  return `<c r="${cellRef(col, row)}" s="${style}" t="inlineStr"><is><t>${xml(value)}</t></is></c>`;
}

function numberCell(col: number, row: number, value: number, style = 0) {
  return `<c r="${cellRef(col, row)}" s="${style}"><v>${Number.isFinite(value) ? value : 0}</v></c>`;
}

function blankCell(col: number, row: number, style = 0) {
  return `<c r="${cellRef(col, row)}" s="${style}"/>`;
}

function crc32(buffer: Buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosTime(date = new Date()) {
  return ((date.getHours() & 0x1F) << 11)
    | ((date.getMinutes() & 0x3F) << 5)
    | Math.floor(date.getSeconds() / 2);
}

function dosDate(date = new Date()) {
  return (((date.getFullYear() - 1980) & 0x7F) << 9)
    | (((date.getMonth() + 1) & 0xF) << 5)
    | (date.getDate() & 0x1F);
}

function createZip(files: XlsxFile[]) {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  const time = dosTime();
  const date = dosDate();

  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const data = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, 'utf8');
    const crc = crc32(data);

    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    name.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, ...centrals, end]);
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

function rootRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(sheetName: string) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${xml(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;
}

function workbookRelsXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <numFmts count="1"><numFmt numFmtId="164" formatCode="0.00"/></numFmts>
  <fonts count="8">
    <font><sz val="11"/><name val="Microsoft YaHei"/><color rgb="FF10233F"/></font>
    <font><b/><sz val="11"/><name val="Microsoft YaHei"/><color rgb="FF26364A"/></font>
    <font><b/><sz val="11"/><name val="Microsoft YaHei"/><color rgb="FF10233F"/></font>
    <font><b/><sz val="11"/><name val="Microsoft YaHei"/><color rgb="FF3370FF"/></font>
    <font><b/><sz val="11"/><name val="Microsoft YaHei"/><color rgb="FFF08A00"/></font>
    <font><b/><sz val="11"/><name val="Microsoft YaHei"/><color rgb="FFDC2626"/></font>
    <font><b/><sz val="11"/><name val="Microsoft YaHei"/><color rgb="FF1A3A8F"/></font>
    <font><sz val="11"/><name val="Microsoft YaHei"/><color rgb="FF9CA3AF"/></font>
  </fonts>
  <fills count="8">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F6FB"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEBF0FF"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFFF8E1"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FFEAF1FF"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border>
      <left style="thin"><color rgb="FFBFCBE0"/></left>
      <right style="thin"><color rgb="FFBFCBE0"/></right>
      <top style="thin"><color rgb="FFBFCBE0"/></top>
      <bottom style="thin"><color rgb="FFBFCBE0"/></bottom>
      <diagonal/>
    </border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="10">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="2" fillId="0" borderId="1" xfId="0" applyBorder="1"><alignment horizontal="left" vertical="center"/></xf>
    <xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="5" fillId="5" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="7" fillId="6" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="0" fontId="6" fillId="7" borderId="1" xfId="0" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
    <xf numFmtId="164" fontId="6" fillId="7" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1"><alignment horizontal="center" vertical="center"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function worksheetXml(params: {
  year: number;
  month: number;
  lastDay: number;
  rows: Array<{
    emp: { name: string; totalHours: number; totalWage: number; currentHourlyRate: string | null };
    cells: Array<{ value: string | number | null; kind: CellKind }>;
  }>;
  totalHours: number;
  totalWage: number;
}) {
  const lastCol = 1 + params.lastDay + 3;
  const lastRow = params.rows.length + 3;
  const title = `${params.year}年${params.month}月工资表`;
  const headers = ['姓名', ...Array.from({ length: params.lastDay }, (_, index) => String(index + 1)), '总工时', '时薪', '总工资'];
  const colXml = [
    '<col min="1" max="1" width="10" customWidth="1"/>',
    `<col min="2" max="${params.lastDay + 1}" width="4.2" customWidth="1"/>`,
    `<col min="${params.lastDay + 2}" max="${params.lastDay + 2}" width="8.5" customWidth="1"/>`,
    `<col min="${params.lastDay + 3}" max="${params.lastDay + 3}" width="7.5" customWidth="1"/>`,
    `<col min="${params.lastDay + 4}" max="${params.lastDay + 4}" width="10.5" customWidth="1"/>`,
  ].join('');

  const rowXml: string[] = [];
  rowXml.push(`<row r="1" ht="24" customHeight="1">${Array.from({ length: lastCol }, (_, i) => stringCell(i + 1, 1, i === 0 ? title : '', STYLE.header)).join('')}</row>`);
  rowXml.push(`<row r="2">${headers.map((header, index) => stringCell(index + 1, 2, header, STYLE.header)).join('')}</row>`);

  params.rows.forEach(({ emp, cells }, rowIndex) => {
    const row = rowIndex + 3;
    const dayCells = cells.map((cell, index) => {
      const col = index + 2;
      if (cell.kind === 'missing') return blankCell(col, row, STYLE.missing);
      if (cell.kind === 'worked') return numberCell(col, row, Number(cell.value ?? 0), STYLE.worked);
      if (cell.kind === 'absent') return stringCell(col, row, cell.value, STYLE.absent);
      return stringCell(col, row, cell.value, STYLE.special);
    });
    rowXml.push(`<row r="${row}">${[
      stringCell(1, row, emp.name, STYLE.name),
      ...dayCells,
      numberCell(params.lastDay + 2, row, emp.totalHours, STYLE.total),
      numberCell(params.lastDay + 3, row, Number(emp.currentHourlyRate ?? 0), STYLE.rate),
      numberCell(params.lastDay + 4, row, emp.totalWage, STYLE.money),
    ].join('')}</row>`);
  });

  rowXml.push(`<row r="${lastRow}">${[
    stringCell(1, lastRow, '合计', STYLE.total),
    ...Array.from({ length: params.lastDay }, (_, index) => blankCell(index + 2, lastRow, 0)),
    numberCell(params.lastDay + 2, lastRow, params.totalHours, STYLE.total),
    blankCell(params.lastDay + 3, lastRow, 0),
    numberCell(params.lastDay + 4, lastRow, params.totalWage, STYLE.money),
  ].join('')}</row>`);

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${cellRef(lastCol, lastRow)}"/>
  <sheetViews>
    <sheetView workbookViewId="0" zoomScale="140" zoomScaleNormal="140">
      <pane xSplit="1" ySplit="2" topLeftCell="B3" activePane="bottomRight" state="frozen"/>
      <selection pane="bottomRight" activeCell="B3" sqref="B3"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${colXml}</cols>
  <sheetData>${rowXml.join('')}</sheetData>
</worksheet>`;
}

function createWorkbook(params: Parameters<typeof worksheetXml>[0]) {
  const sheetName = `${params.year}年${params.month}月`;
  return createZip([
    { name: '[Content_Types].xml', content: contentTypesXml() },
    { name: '_rels/.rels', content: rootRelsXml() },
    { name: 'xl/workbook.xml', content: workbookXml(sheetName) },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml() },
    { name: 'xl/styles.xml', content: stylesXml() },
    { name: 'xl/worksheets/sheet1.xml', content: worksheetXml(params) },
  ]);
}

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session.isLoggedIn) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const year = parseInt(searchParams.get('year') ?? String(new Date().getFullYear()));
  const month = parseInt(searchParams.get('month') ?? String(new Date().getMonth() + 1));

  const { start, end } = monthRange(year, month);
  const lastDay = new Date(year, month, 0).getDate();
  const [salaryData, allRecs] = await Promise.all([
    getMonthlySalary(year, month),
    getAttendanceForRange(start, end),
  ]);

  const activeEmps = salaryData.filter(e => e.status === 'active');
  type DayInfo = { hours: number | null; status: string | null; statusLabel: string | null };
  const recsByEmp: Record<number, Record<number, DayInfo>> = {};
  for (const r of allRecs) {
    if (!r.employeeId || !r.workDate) continue;
    const day = parseInt(r.workDate.slice(8, 10));
    (recsByEmp[r.employeeId] ??= {})[day] = {
      hours: r.hours ? parseFloat(String(r.hours)) : null,
      status: r.status,
      statusLabel: r.statusLabel,
    };
  }

  const dayHeaders = Array.from({ length: lastDay }, (_, index) => index + 1);
  const rows = activeEmps.map(emp => {
    const dayMap = recsByEmp[emp.id] ?? {};
    const cells = dayHeaders.map(day => {
      const info = dayMap[day];
      if (!info) return { value: null, kind: 'missing' as const };
      if (info.status === 'worked') return { value: info.hours ?? 0, kind: 'worked' as const };
      if (info.status === 'absent') return { value: '旷', kind: 'absent' as const };
      if (info.status === 'custom') return { value: info.statusLabel ?? '特', kind: 'special' as const };
      return { value: STATUS_LABEL[info.status ?? ''] ?? '', kind: 'special' as const };
    });
    return { emp, cells };
  });

  const totalHours = activeEmps.reduce((sum, employee) => sum + employee.totalHours, 0);
  const totalWage = activeEmps.reduce((sum, employee) => sum + employee.totalWage, 0);
  const workbook = createWorkbook({ year, month, lastDay, rows, totalHours, totalWage });
  const filename = encodeURIComponent(`${year}年${month}月工资表.xlsx`);

  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
    },
  });
}
