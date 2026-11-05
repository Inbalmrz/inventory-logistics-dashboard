// Minimal .xlsx writer with no dependencies: one right-to-left sheet in an uncompressed zip.
(function (App) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc32 = (bytes) => {
    let c = 0xffffffff;
    for (const b of bytes) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };

  function zip(files) {
    const enc = new TextEncoder();
    const chunks = [], central = [];
    let offset = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255];
    const u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const f of files) {
      const name = enc.encode(f.name);
      const body = enc.encode(f.text);
      const crc = crc32(body);
      const common = [...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21),
        ...u32(crc), ...u32(body.length), ...u32(body.length), ...u16(name.length), ...u16(0)];
      const local = new Uint8Array([...u32(0x04034b50), ...common, ...name]);
      chunks.push(local, body);
      central.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...common,
        ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(offset), ...name]));
      offset += local.length + body.length;
    }
    const centralSize = central.reduce((t, c) => t + c.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length),
      ...u32(centralSize), ...u32(offset), ...u16(0)]);
    return new Blob([...chunks, ...central, end], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
  }

  const xmlEsc = (v) =>
    String(v).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');

  const colName = (i) => {
    let s = '';
    for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
    return s;
  };

  function workbook(sheetName, headers, rows) {
    const cell = (v, c, r) => {
      const ref = colName(c) + r;
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"><v>${v}</v></c>`;
      if (v == null || v === '') return '';
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
    };
    const line = (vals, r) => `<row r="${r}">${vals.map((v, c) => cell(v, c, r)).join('')}</row>`;
    const sheetData = [line(headers, 1), ...rows.map((row, i) => line(row, i + 2))].join('');
    const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    const ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
    const safeName = xmlEsc(sheetName.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31));
    return zip([
      { name: '[Content_Types].xml', text: `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>` },
      { name: '_rels/.rels', text: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
      { name: 'xl/workbook.xml', text: `${head}<workbook xmlns="${ns}" xmlns:r="${rel}"><sheets><sheet name="${safeName}" sheetId="1" r:id="rId1"/></sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', text: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${rel}/worksheet" Target="worksheets/sheet1.xml"/></Relationships>` },
      { name: 'xl/worksheets/sheet1.xml', text: `${head}<worksheet xmlns="${ns}"><sheetViews><sheetView rightToLeft="1" workbookViewId="0"/></sheetViews><sheetData>${sheetData}</sheetData></worksheet>` },
    ]);
  }

  function download(fileName, sheetName, headers, rows) {
    const blob = workbook(sheetName, headers, rows);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName.endsWith('.xlsx') ? fileName : fileName + '.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  App.xlsx = { workbook, download };
})(window.App);
