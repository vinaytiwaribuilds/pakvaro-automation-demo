'use strict';

const fs = require('node:fs');
const path = require('node:path');

const stream = 'BT\n/F1 12 Tf\n72 740 Td\n(SYNTHETIC FIXTURE - NOT A REAL INVOICE) Tj\n0 -18 Td\n(Invoice Number: INV-PDF-2002) Tj\n0 -18 Td\n(Invoice Date: 2026-10-20) Tj\n0 -18 Td\n(Amount: 99000.50) Tj\n0 -18 Td\n(Vendor: Cedar Components) Tj\nET\n';
const objects = [
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
  `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
];
let pdf = '%PDF-1.4\n';
const offsets = [0];
objects.forEach((object, index) => {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
});
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
fs.writeFileSync(path.join(__dirname, 'sample-invoice.pdf'), pdf, 'latin1');
