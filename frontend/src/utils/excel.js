// 진짜 엑셀(.xlsx) 내보내기 (SheetJS)
import * as XLSX from 'xlsx';

/**
 * @param {string} filename  확장자 없이 또는 .xlsx 포함
 * @param {string} sheetName 시트 이름
 * @param {string[]} headers 머리글
 * @param {Array<Array>} rows 데이터 행 (숫자는 숫자로, 문자열은 텍스트로 그대로 넣으면 됨)
 * @param {{ numberCols?: number[], widths?: number[] }} opts
 *   numberCols: 천단위 콤마 숫자서식을 적용할 열 인덱스
 */
export function downloadXLSX(filename, sheetName, headers, rows, opts = {}) {
  const aoa = [headers, ...rows];
  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // 열 너비: 헤더/내용 길이에 맞춰 자동
  ws['!cols'] = headers.map((h, i) => {
    if (opts.widths && opts.widths[i]) return { wch: opts.widths[i] };
    let max = String(h ?? '').length;
    rows.forEach((r) => { const len = String(r[i] ?? '').length; if (len > max) max = len; });
    return { wch: Math.min(40, Math.max(8, max + 2)) };
  });

  // 숫자 열에 천단위 콤마 서식
  if (opts.numberCols && opts.numberCols.length) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    for (let R = 1; R <= range.e.r; R++) {
      opts.numberCols.forEach((C) => {
        const ref = XLSX.utils.encode_cell({ r: R, c: C });
        const cell = ws[ref];
        if (cell && cell.t === 'n') cell.z = '#,##0';
      });
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName || 'Sheet1');
  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
