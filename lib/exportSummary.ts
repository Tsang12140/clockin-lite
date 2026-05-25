import 'server-only';

import { db } from '@/db';
import { employees, attendanceRecords, positions } from '@/db';
import { eq, sql } from 'drizzle-orm';
import { isDemoModeEnabled } from '@/lib/demoMode';
import { getMonthlySalary, getAttendanceForRange } from '@/lib/queries';
import { monthRange } from '@/lib/utils';
import { getVirtualAllEmployees, isVirtualDbEnabled, virtualSummaryMonths } from '@/lib/virtualDb';

const TZ = 'Asia/Shanghai';

export function summaryFilename(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `clockin-summary-${v.year}${v.month}${v.day}-${v.hour}${v.minute}${v.second}.xlsx`;
}

// ===== Style indices (identical to salary route) =====
const STYLE = {
  center:  0,
  header:  1,
  name:    2,
  worked:  3,
  special: 4,
  absent:  5,
  missing: 6,
  total:   7,
  rate:    8,
  money:   9,
} as const;

const STATUS_LABEL: Record<string, string> = {
  leave: '假', holiday: '休', sick: '病', absent: '旷',
};

type CellKind = 'worked' | 'special' | 'absent' | 'missing';

// ===== XML helpers (identical to salary route) =====

function xe(val: unknown): string {
  return String(val ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

function colName(n: number): string {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - m) / 26); }
  return s;
}

function cellRef(col: number, row: number) { return `${colName(col)}${row}`; }

function stringCell(col: number, row: number, val: unknown, style: number = STYLE.center) {
  return `<c r="${cellRef(col, row)}" s="${style}" t="inlineStr"><is><t>${xe(val)}</t></is></c>`;
}

function numberCell(col: number, row: number, val: number, style: number = STYLE.center) {
  return `<c r="${cellRef(col, row)}" s="${style}"><v>${Number.isFinite(val) ? val : 0}</v></c>`;
}

function blankCell(col: number, row: number, style: number = STYLE.center) {
  return `<c r="${cellRef(col, row)}" s="${style}"/>`;
}

// ===== ZIP builder (identical to salary route) =====

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let c = index;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer: Buffer) {
  let crc = 0xFFFFFFFF;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

function dosTime(date = new Date()) {
  return ((date.getHours() & 0x1F) << 11) | ((date.getMinutes() & 0x3F) << 5) | Math.floor(date.getSeconds() / 2);
}

function dosDate(date = new Date()) {
  return (((date.getFullYear() - 1980) & 0x7F) << 9) | (((date.getMonth() + 1) & 0xF) << 5) | (date.getDate() & 0x1F);
}

type XlsxFile = { name: string; content: string | Buffer };

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
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8); local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28); name.copy(local, 30);
    locals.push(local, data);

    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14); central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32); central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42); name.copy(central, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((sum, item) => sum + item.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralSize, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, ...centrals, end]);
}

// ===== OOXML structure =====

function contentTypesXml(sheetCount: number): string {
  const overrides = Array.from({ length: sheetCount }, (_, i) =>
    `  <Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${overrides}
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;
}

function rootRelsXml(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;
}

function workbookXml(sheets: { name: string }[]): string {
  const sheetXml = sheets.map((s, i) =>
    `    <sheet name="${xe(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
${sheetXml}
  </sheets>
</workbook>`;
}

function workbookRelsXml(sheetCount: number): string {
  const rels = Array.from({ length: sheetCount }, (_, i) =>
    `  <Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join('\n');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${rels}
  <Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;
}

function stylesXml(): string {
  // Identical to salary route.
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

// ===== Sheet 1: 员工信息 =====

const GENDER_MAP: Record<string, string> = { male: '男', female: '女' };

type EmpRow = {
  id: number; name: string; gender: string | null; phone: string | null;
  status: string | null; currentHourlyRate: string | null; positionName: string | null;
  hireDate: string | null; leaveDate: string | null; notes: string | null;
};

function empSheetXml(emps: EmpRow[]): string {
  const title = '员工信息';
  const headers = ['编号', '姓名', '性别', '状态', '岗位', '入职日期', '离职日期', '时薪', '联系电话', '备注'];
  const colWidths = [6, 10, 5, 8, 10, 12, 12, 8, 14, 18];
  const lastCol = headers.length;
  const lastRow = emps.length + 2;

  const colXml = colWidths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');

  const rowXml: string[] = [];
  // Title row: write ALL cells across the rectangle (matrix fill)
  rowXml.push(`<row r="1" ht="24" customHeight="1">${Array.from({ length: lastCol }, (_, i) => stringCell(i + 1, 1, i === 0 ? title : '', STYLE.header)).join('')}</row>`);
  rowXml.push(`<row r="2">${headers.map((h, i) => stringCell(i + 1, 2, h, STYLE.header)).join('')}</row>`);

  emps.forEach((emp, ri) => {
    const row = ri + 3;
    const rate = parseFloat(emp.currentHourlyRate ?? '0');
    const statusStyle = emp.status === 'active' ? STYLE.total : STYLE.missing;
    const statusLabel = emp.status === 'active' ? '在职' : emp.status === 'inactive' ? '离职' : (emp.status ?? '');
    rowXml.push(`<row r="${row}">${[
      stringCell(1, row, emp.id, STYLE.center),
      stringCell(2, row, emp.name, STYLE.name),
      stringCell(3, row, GENDER_MAP[emp.gender ?? ''] ?? '', STYLE.center),
      stringCell(4, row, statusLabel, statusStyle),
      stringCell(5, row, emp.positionName ?? '', STYLE.center),
      stringCell(6, row, emp.hireDate ?? '', STYLE.center),
      stringCell(7, row, emp.leaveDate ?? '', STYLE.center),
      numberCell(8, row, isNaN(rate) ? 0 : rate, STYLE.rate),
      stringCell(9, row, emp.phone ?? '', STYLE.name),
      stringCell(10, row, emp.notes ?? '', STYLE.name),
    ].join('')}</row>`);
  });

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <dimension ref="A1:${cellRef(lastCol, lastRow)}"/>
  <sheetViews>
    <sheetView workbookViewId="0" zoomScale="140" zoomScaleNormal="140">
      <pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/>
      <selection pane="bottomLeft" activeCell="A3" sqref="A3"/>
    </sheetView>
  </sheetViews>
  <sheetFormatPr defaultRowHeight="18"/>
  <cols>${colXml}</cols>
  <sheetData>${rowXml.join('')}</sheetData>
</worksheet>`;
}

// ===== Sheet N: 月度工资（工资表格式） =====

function monthSheetXml(params: {
  year: number;
  month: number;
  lastDay: number;
  rows: Array<{
    emp: { name: string; totalHours: number; totalWage: number; currentHourlyRate: string | null };
    cells: Array<{ value: string | number | null; kind: CellKind }>;
  }>;
  totalHours: number;
  totalWage: number;
}): string {
  const lastCol = 1 + params.lastDay + 3;
  const lastRow = params.rows.length + 3;
  const title = `${params.year}年${params.month}月工资表`;
  const headers = ['姓名', ...Array.from({ length: params.lastDay }, (_, i) => String(i + 1)), '总工时', '时薪', '总工资'];

  const colXml = [
    '<col min="1" max="1" width="10" customWidth="1"/>',
    `<col min="2" max="${params.lastDay + 1}" width="4.2" customWidth="1"/>`,
    `<col min="${params.lastDay + 2}" max="${params.lastDay + 2}" width="8.5" customWidth="1"/>`,
    `<col min="${params.lastDay + 3}" max="${params.lastDay + 3}" width="7.5" customWidth="1"/>`,
    `<col min="${params.lastDay + 4}" max="${params.lastDay + 4}" width="10.5" customWidth="1"/>`,
  ].join('');

  const rowXml: string[] = [];
  // Title row: write ALL cells across the rectangle (matrix fill)
  rowXml.push(`<row r="1" ht="24" customHeight="1">${Array.from({ length: lastCol }, (_, i) => stringCell(i + 1, 1, i === 0 ? title : '', STYLE.header)).join('')}</row>`);
  rowXml.push(`<row r="2">${headers.map((h, i) => stringCell(i + 1, 2, h, STYLE.header)).join('')}</row>`);

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

  // Totals row: write ALL cells across the rectangle (matrix fill)
  rowXml.push(`<row r="${lastRow}">${[
    stringCell(1, lastRow, '合计', STYLE.total),
    ...Array.from({ length: params.lastDay }, (_, i) => blankCell(i + 2, lastRow, STYLE.center)),
    numberCell(params.lastDay + 2, lastRow, params.totalHours, STYLE.total),
    blankCell(params.lastDay + 3, lastRow, STYLE.center),
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

// ===== Public API =====

export type SummaryExcelResult = {
  filename: string;
  data: Buffer;
};

export async function generateSummaryExcel(): Promise<SummaryExcelResult> {
  if (isVirtualDbEnabled()) {
    const empRows = getVirtualAllEmployees();
    const months = virtualSummaryMonths();
    const monthlySheets = await Promise.all(
      months.map(async ({ year, month }) => {
        const lastDay = new Date(year, month, 0).getDate();
        const { start, end } = monthRange(year, month);
        const [salaryData, recs] = await Promise.all([
          getMonthlySalary(year, month),
          getAttendanceForRange(start, end),
        ]);

        type DayInfo = { hours: number | null; status: string | null; statusLabel: string | null };
        const recsByEmp: Record<number, Record<number, DayInfo>> = {};
        for (const r of recs) {
          if (!r.employeeId || !r.workDate) continue;
          const day = parseInt(r.workDate.slice(8, 10));
          (recsByEmp[r.employeeId] ??= {})[day] = {
            hours: r.hours ? parseFloat(String(r.hours)) : null,
            status: r.status,
            statusLabel: r.statusLabel,
          };
        }

        const rows = salaryData.map(emp => {
          const dayMap = recsByEmp[emp.id] ?? {};
          const cells = Array.from({ length: lastDay }, (_, i) => {
            const info = dayMap[i + 1];
            if (!info) return { value: null as null, kind: 'missing' as CellKind };
            if (info.status === 'worked') return { value: info.hours ?? 0, kind: 'worked' as CellKind };
            if (info.status === 'absent') return { value: '旷' as string, kind: 'absent' as CellKind };
            if (info.status === 'custom') return { value: info.statusLabel ?? '特' as string, kind: 'special' as CellKind };
            return { value: STATUS_LABEL[info.status ?? ''] ?? '' as string, kind: 'special' as CellKind };
          });
          return { emp, cells };
        });

        const totalHours = salaryData.reduce((sum, employee) => sum + employee.totalHours, 0);
        const totalWage = salaryData.reduce((sum, employee) => sum + employee.totalWage, 0);
        return {
          name: `${year}年${month}月`,
          xml: monthSheetXml({ year, month, lastDay, rows, totalHours, totalWage }),
        };
      }),
    );

    const sheetCount = 1 + monthlySheets.length;
    const sheets = [{ name: '员工信息' }, ...monthlySheets.map(sheet => ({ name: sheet.name }))];
    const data = createZip([
      { name: '[Content_Types].xml',        content: contentTypesXml(sheetCount) },
      { name: '_rels/.rels',                content: rootRelsXml() },
      { name: 'xl/workbook.xml',            content: workbookXml(sheets) },
      { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml(sheetCount) },
      { name: 'xl/styles.xml',              content: stylesXml() },
      { name: 'xl/worksheets/sheet1.xml',   content: empSheetXml(empRows) },
      ...monthlySheets.map((sheet, index) => ({
        name: `xl/worksheets/sheet${index + 2}.xml`,
        content: sheet.xml,
      })),
    ]);
    return { filename: summaryFilename(), data };
  }

  const demoMode = await isDemoModeEnabled();

  // Fetch employee info and distinct months with records in parallel
  const [empRows, monthResult] = await Promise.all([
    db.select({
      id:               employees.id,
      name:             employees.name,
      gender:           employees.gender,
      phone:            employees.phone,
      status:           employees.status,
      currentHourlyRate: employees.currentHourlyRate,
      positionName:     positions.name,
      hireDate:         employees.hireDate,
      leaveDate:        employees.leaveDate,
      notes:            employees.notes,
    })
      .from(employees)
      .leftJoin(positions, eq(employees.positionId, positions.id))
      .where(eq(employees.isDemo, demoMode))
      .orderBy(employees.status, employees.id),

    db.execute(sql`
      SELECT DISTINCT
        EXTRACT(YEAR  FROM work_date::date)::integer AS year,
        EXTRACT(MONTH FROM work_date::date)::integer AS month
      FROM clockin.attendance_records
      WHERE is_demo = ${demoMode}
      ORDER BY year, month
    `) as unknown as { rows?: Array<{ year: number; month: number }> },
  ]);

  const months = monthResult.rows ?? [];

  // Generate each monthly sheet in parallel
  const monthlySheets = await Promise.all(
    months.map(async ({ year, month }) => {
      const lastDay = new Date(year, month, 0).getDate();
      const { start, end } = monthRange(year, month);

      const [salaryData, recs] = await Promise.all([
        getMonthlySalary(year, month),
        getAttendanceForRange(start, end),
      ]);

      // Group attendance by employee → day
      type DayInfo = { hours: number | null; status: string | null; statusLabel: string | null };
      const recsByEmp: Record<number, Record<number, DayInfo>> = {};
      for (const r of recs) {
        if (!r.employeeId || !r.workDate) continue;
        const day = parseInt(r.workDate.slice(8, 10));
        (recsByEmp[r.employeeId] ??= {})[day] = {
          hours: r.hours ? parseFloat(String(r.hours)) : null,
          status: r.status,
          statusLabel: r.statusLabel,
        };
      }

      const rows = salaryData.map(emp => {
        const dayMap = recsByEmp[emp.id] ?? {};
        const cells = Array.from({ length: lastDay }, (_, i) => {
          const info = dayMap[i + 1];
          if (!info) return { value: null as null,        kind: 'missing'  as CellKind };
          if (info.status === 'worked') return { value: info.hours ?? 0,                   kind: 'worked'   as CellKind };
          if (info.status === 'absent') return { value: '旷' as string,                    kind: 'absent'   as CellKind };
          if (info.status === 'custom') return { value: info.statusLabel ?? '特' as string, kind: 'special'  as CellKind };
          return { value: STATUS_LABEL[info.status ?? ''] ?? '' as string,                 kind: 'special'  as CellKind };
        });
        return { emp, cells };
      });

      const totalHours = salaryData.reduce((s, e) => s + e.totalHours, 0);
      const totalWage  = salaryData.reduce((s, e) => s + e.totalWage,  0);

      return {
        name: `${year}年${month}月`,
        xml: monthSheetXml({ year, month, lastDay, rows, totalHours, totalWage }),
      };
    })
  );

  const sheetCount = 1 + monthlySheets.length;
  const sheets = [{ name: '员工信息' }, ...monthlySheets.map(s => ({ name: s.name }))];

  const data = createZip([
    { name: '[Content_Types].xml',        content: contentTypesXml(sheetCount) },
    { name: '_rels/.rels',                content: rootRelsXml() },
    { name: 'xl/workbook.xml',            content: workbookXml(sheets) },
    { name: 'xl/_rels/workbook.xml.rels', content: workbookRelsXml(sheetCount) },
    { name: 'xl/styles.xml',              content: stylesXml() },
    { name: 'xl/worksheets/sheet1.xml',   content: empSheetXml(empRows) },
    ...monthlySheets.map((s, i) => ({
      name: `xl/worksheets/sheet${i + 2}.xml`,
      content: s.xml,
    })),
  ]);

  return { filename: summaryFilename(), data };
}
