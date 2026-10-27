'use strict';

const fs = require('node:fs');
const path = require('node:path');

function attachment(name, mimeType) {
  return { fileName: name, mimeType, contentBase64: fs.readFileSync(path.join(__dirname, 'fixtures', name)).toString('base64') };
}

module.exports = {
  csvEmail: { emailId: 'invoice-email-0001', reviewThreshold: 50000, attachment: attachment('sample-invoice.csv', 'text/csv') },
  pdfEmail: { emailId: 'invoice-email-0002', reviewThreshold: 50000, attachment: attachment('sample-invoice.pdf', 'application/pdf') },
  invalidEmail: { emailId: 'invoice-email-bad1', attachment: { fileName: 'broken.txt', mimeType: 'text/plain', contentBase64: Buffer.from('not an invoice').toString('base64') } },
};
