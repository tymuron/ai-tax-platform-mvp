import { parse as parseCsv } from 'csv-parse/sync';
import * as XLSX from 'xlsx';
import {
  DocumentFormat,
  DocumentRecord,
  DocumentType,
  ExtractionReviewStatus,
  TaxYear,
  TransactionRecord,
} from '@/types/tax';
import { computeSha256, maskSensitivePII } from '@/lib/security/crypto-and-masking';

export interface RawExtractedTransaction {
  transaction_date: string | null;
  amount: number;
  currency: string;
  direction: 'inflow' | 'outflow';
  merchant_name: string;
  raw_description: string;
  source_page: number | null;
  source_line_ref: string;
  extraction_confidence: number;
}

export interface DocumentProcessingOutput {
  document: DocumentRecord;
  transactions: TransactionRecord[];
  warnings: string[];
}

export function detectDocumentFormat(filename: string, mimeType: string): DocumentFormat {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv') || mimeType.includes('csv')) return 'CSV';
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls') || mimeType.includes('spreadsheet')) return 'XLSX';
  if (lower.endsWith('.pdf') || mimeType.includes('pdf')) return 'PDF';
  if (lower.endsWith('.png') || mimeType.includes('png')) return 'PNG';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg') || mimeType.includes('jpeg')) return 'JPG';
  return 'PDF';
}

export function detectDocumentType(filename: string, rawText: string): DocumentType {
  const combined = `${filename} ${rawText}`.toLowerCase();
  if (combined.includes('w-2') || combined.includes('wage and tax statement')) return 'w2';
  if (combined.includes('1099-nec') || combined.includes('nonemployee compensation')) return '1099_nec';
  if (combined.includes('1099-k') || combined.includes('payment card and third party')) return '1099_k';
  if (combined.includes('1099-misc')) return '1099_misc';
  if (combined.includes('1098') && combined.includes('mortgage')) return '1098';
  if (combined.includes('1095-a') || combined.includes('health insurance marketplace')) return '1095_a';
  if (combined.includes('credit card') || combined.includes('visa') || combined.includes('amex') || combined.includes('mastercard')) {
    return 'credit_card_statement';
  }
  if (combined.includes('invoice')) return 'invoice';
  if (combined.includes('receipt')) return 'receipt';
  if (combined.includes('agreement') || combined.includes('contract')) return 'contract';
  return 'bank_statement';
}

function normalizeDateString(raw: unknown): { date: string | null; valid: boolean } {
  if (!raw) return { date: null, valid: false };
  const str = String(raw).trim();
  if (!str || str.toLowerCase() === 'unknown' || str.includes('?')) {
    return { date: null, valid: false };
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return { date: str, valid: true };
  }
  // MM/DD/YYYY
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (mdy) {
    const mm = mdy[1].padStart(2, '0');
    const dd = mdy[2].padStart(2, '0');
    return { date: `${mdy[3]}-${mm}-${dd}`, valid: true };
  }
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    return { date: parsed.toISOString().slice(0, 10), valid: true };
  }
  return { date: null, valid: false };
}

function normalizeMerchantName(description: string): string {
  const cleaned = description
    .replace(/\b(?:POS|DEBIT|ACH|PURCHASE|CARD|CHECKCARD|AUTOPAY|RECURRING|PAYMENT|ONLINE)\b/gi, '')
    .replace(/[#*]\d+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return description.trim() || 'Unknown Merchant';
  return cleaned.slice(0, 64);
}

/**
 * Extracts raw rows from CSV, XLSX, PDF text, or OCR text.
 * Never fabricates missing dates or amounts: uncertain values get low confidence -> Needs Review.
 */
export async function extractTransactionsFromContent(params: {
  filename: string;
  format: DocumentFormat;
  buffer: Buffer;
  taxYear: TaxYear;
}): Promise<{
  documentType: DocumentType;
  ocrUsed: boolean;
  rawText: string;
  extractedRows: RawExtractedTransaction[];
  missingPagesDetected: boolean;
  extractedMetadata: Record<string, unknown>;
}> {
  const { filename, format, buffer, taxYear } = params;
  let rawText = '';
  let ocrUsed = false;
  let missingPagesDetected = false;
  const extractedRows: RawExtractedTransaction[] = [];
  const extractedMetadata: Record<string, unknown> = {};

  if (format === 'CSV') {
    rawText = buffer.toString('utf8');
    const records = parseCsv(rawText, {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
      trim: true,
    }) as Array<Record<string, string>>;

    records.forEach((row, idx) => {
      const dateRaw =
        row.Date || row.date || row.TransactionDate || row.transaction_date || row['Posting Date'] || '';
      const descRaw =
        row.Description || row.description || row.Merchant || row.merchant || row.Memo || row.Payee || '';
      const amountRaw =
        row.Amount || row.amount || row.Total || row.Debit || row.Credit || '';
      const directionHint = (row.Type || row.Direction || row.direction || '').toLowerCase();

      const { date, valid: dateValid } = normalizeDateString(dateRaw);
      const cleanedAmtStr = String(amountRaw).replace(/[$,\s]/g, '');
      const parsedNum = Number(cleanedAmtStr);
      const amountValid = cleanedAmtStr !== '' && !isNaN(parsedNum);
      const absAmount = amountValid ? Math.round(Math.abs(parsedNum) * 100) / 100 : 0;

      let direction: 'inflow' | 'outflow' = 'outflow';
      if (
        directionHint === 'inflow' ||
        directionHint === 'credit' ||
        directionHint === 'deposit' ||
        directionHint === 'income' ||
        (parsedNum > 0 && /deposit|payroll|1099|client|stripe payout|ach credit|w-2|refund/i.test(descRaw))
      ) {
        direction = 'inflow';
      } else if (parsedNum < 0) {
        direction = 'outflow';
      } else if (row.Credit && Number(String(row.Credit).replace(/[$,]/g, '')) > 0) {
        direction = 'inflow';
      }

      const confidence = dateValid && amountValid && descRaw.length >= 2 ? 0.98 : 0.55;

      extractedRows.push({
        transaction_date: date,
        amount: absAmount,
        currency: row.Currency || 'USD',
        direction,
        merchant_name: normalizeMerchantName(descRaw),
        raw_description: descRaw || 'Unlabeled CSV Row',
        source_page: 1,
        source_line_ref: `CSV:Row-${idx + 2}`,
        extraction_confidence: confidence,
      });
    });
  } else if (format === 'XLSX') {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
    rawText = JSON.stringify(rows);

    rows.forEach((row, idx) => {
      const dateRaw = row.Date || row.date || row.TransactionDate || '';
      const descRaw = String(row.Description || row.description || row.Merchant || '');
      const amountRaw = row.Amount ?? row.amount ?? '';
      const { date, valid: dateValid } = normalizeDateString(dateRaw);
      const parsedNum = Number(String(amountRaw).replace(/[$,\s]/g, ''));
      const amountValid = String(amountRaw).trim() !== '' && !isNaN(parsedNum);
      const absAmount = amountValid ? Math.round(Math.abs(parsedNum) * 100) / 100 : 0;

      const direction: 'inflow' | 'outflow' =
        /deposit|payroll|client|payout|income|1099|refund/i.test(descRaw) ||
        String(row.Direction || '').toLowerCase() === 'inflow'
          ? 'inflow'
          : 'outflow';

      extractedRows.push({
        transaction_date: date,
        amount: absAmount,
        currency: 'USD',
        direction,
        merchant_name: normalizeMerchantName(descRaw),
        raw_description: descRaw || 'Unlabeled XLSX Row',
        source_page: 1,
        source_line_ref: `XLSX:${firstSheetName}:Row-${idx + 2}`,
        extraction_confidence: dateValid && amountValid ? 0.97 : 0.5,
      });
    });
  } else {
    // PDF, JPG, PNG (Text or OCR extraction)
    rawText = buffer.toString('utf8');
    if (format === 'JPG' || format === 'PNG' || rawText.includes('OCR_SCAN')) {
      ocrUsed = true;
    }

    // Check for missing page markers (e.g., "Page 1 of 3" without "Page 2 of 3")
    const pageMatches = [...rawText.matchAll(/Page\s+(\d+)\s+of\s+(\d+)/gi)];
    if (pageMatches.length > 0) {
      const totalExpected = Number(pageMatches[0][2]);
      const foundPages = new Set(pageMatches.map((m) => Number(m[1])));
      if (totalExpected > foundPages.size) {
        missingPagesDetected = true;
      }
    }

    // Check structured tax forms (W-2, 1099-NEC, 1099-K, 1098, 1095-A) or line-by-line statement entries
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    lines.forEach((line, idx) => {
      // Match structured line format: YYYY-MM-DD | Description | $Amount | [inflow/outflow]
      const txMatch = line.match(
        /^(\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}\/\d{4}|\?\?\?\?-\?\?-\?\?)\s*[|,\t-]\s*(.+?)\s*[|,\t]\s*([+-]?\$?\d[\d,]*\.?\d*|\?\?\?)(?:\s*[|,\t]\s*(inflow|outflow))?$/i
      );
      if (txMatch) {
        const { date, valid: dateValid } = normalizeDateString(txMatch[1]);
        const desc = txMatch[2].trim();
        const amtStr = txMatch[3].replace(/[$,]/g, '');
        const parsedAmt = Number(amtStr);
        const amtValid = !isNaN(parsedAmt) && !txMatch[3].includes('?');
        const explicitDir = txMatch[4]?.toLowerCase();
        const direction: 'inflow' | 'outflow' =
          explicitDir === 'inflow' ||
          /w-2|1099|client|deposit|payout|refund|stripe transfer in/i.test(desc)
            ? 'inflow'
            : 'outflow';

        extractedRows.push({
          transaction_date: date,
          amount: amtValid ? Math.abs(parsedAmt) : 0,
          currency: 'USD',
          direction,
          merchant_name: normalizeMerchantName(desc),
          raw_description: desc,
          source_page: 1,
          source_line_ref: `${format}:Line-${idx + 1}`,
          extraction_confidence: dateValid && amtValid ? (ocrUsed ? 0.89 : 0.96) : 0.45,
        });
      }
    });

    // Also parse W-2 / 1099 box metadata if present
    const w2WagesMatch = rawText.match(/Box\s*1\s*\(?Wages.*?\)?\s*[:=]\s*\$?([\d,]+\.?\d*)/i);
    const w2FedTaxMatch = rawText.match(/Box\s*2\s*\(?Federal\s+income\s+tax\s+withheld\)?\s*[:=]\s*\$?([\d,]+\.?\d*)/i);
    if (w2WagesMatch) {
      const wages = Number(w2WagesMatch[1].replace(/,/g, ''));
      const fedWithheld = w2FedTaxMatch ? Number(w2FedTaxMatch[1].replace(/,/g, '')) : 0;
      extractedMetadata.w2_box1_wages = wages;
      extractedMetadata.w2_box2_withheld = fedWithheld;
      if (extractedRows.length === 0 && wages > 0) {
        extractedRows.push({
          transaction_date: `${taxYear}-12-31`,
          amount: wages,
          currency: 'USD',
          direction: 'inflow',
          merchant_name: 'Form W-2 Employer Wages',
          raw_description: `Form W-2 Box 1 Taxable Wages (Withholding: $${fedWithheld})`,
          source_page: 1,
          source_line_ref: 'W2:Box-1',
          extraction_confidence: 0.99,
        });
      }
    }

    const necMatch = rawText.match(/1099-NEC.*?(?:Box\s*1|Nonemployee\s+compensation)\s*[:=]\s*\$?([\d,]+\.?\d*)/i);
    if (necMatch) {
      const necAmount = Number(necMatch[1].replace(/,/g, ''));
      extractedMetadata.form_1099_nec_box1 = necAmount;
      if (extractedRows.length === 0 && necAmount > 0) {
        extractedRows.push({
          transaction_date: `${taxYear}-12-31`,
          amount: necAmount,
          currency: 'USD',
          direction: 'inflow',
          merchant_name: 'Form 1099-NEC Client Compensation',
          raw_description: `Form 1099-NEC Box 1 Nonemployee Compensation`,
          source_page: 1,
          source_line_ref: '1099-NEC:Box-1',
          extraction_confidence: 0.99,
        });
      }
    }
  }

  const documentType = detectDocumentType(filename, rawText);
  return {
    documentType,
    ocrUsed,
    rawText,
    extractedRows,
    missingPagesDetected,
    extractedMetadata,
  };
}

/**
 * Normalizes transactions, detects duplicates across statements, detects self-transfers and
 * credit card repayments, identifies recurring payments, and checks for missing statement months.
 */
export function reconcileAndNormalizeTransactions(params: {
  userId: string;
  documentId: string;
  filename: string;
  mimeType: string;
  format: DocumentFormat;
  documentType: DocumentType;
  fileSizeBytes: number;
  storagePath: string;
  buffer: Buffer;
  taxYear: TaxYear;
  ocrUsed: boolean;
  missingPagesDetected: boolean;
  extractedMetadata: Record<string, unknown>;
  extractedRows: RawExtractedTransaction[];
  existingTransactions: TransactionRecord[];
}): DocumentProcessingOutput {
  const {
    userId,
    documentId,
    filename,
    mimeType,
    format,
    documentType,
    fileSizeBytes,
    storagePath,
    buffer,
    taxYear,
    ocrUsed,
    missingPagesDetected,
    extractedMetadata,
    extractedRows,
    existingTransactions,
  } = params;

  const now = new Date().toISOString();
  const warnings: string[] = [];

  if (missingPagesDetected) {
    warnings.push(
      `Document "${filename}" is missing one or more pages (page sequence gap detected). Marked as Needs Review.`
    );
  }

  // Track merchant counts for recurring detection
  const merchantFrequency = new Map<string, number>();
  for (const tx of [...existingTransactions, ...extractedRows]) {
    const key = tx.merchant_name.toLowerCase().trim();
    merchantFrequency.set(key, (merchantFrequency.get(key) || 0) + 1);
  }

  const seenFingerprints = new Map<string, string>();
  for (const existing of existingTransactions) {
    if (!existing.is_duplicate && existing.transaction_date) {
      const fp = `${existing.transaction_date}|${existing.amount.toFixed(2)}|${existing.merchant_name.toLowerCase()}|${existing.direction}`;
      seenFingerprints.set(fp, existing.id);
    }
  }

  const transactions: TransactionRecord[] = [];
  const datesFound: string[] = [];

  extractedRows.forEach((raw, idx) => {
    const txId = `tx_${documentId}_${idx + 1}`;
    if (raw.transaction_date) {
      datesFound.push(raw.transaction_date);
    }

    const fp = raw.transaction_date
      ? `${raw.transaction_date}|${raw.amount.toFixed(2)}|${raw.merchant_name.toLowerCase()}|${raw.direction}`
      : '';
    const duplicateOfId = fp && seenFingerprints.has(fp) ? seenFingerprints.get(fp)! : null;
    if (fp && !duplicateOfId) {
      seenFingerprints.set(fp, txId);
    }

    const isDuplicate = Boolean(duplicateOfId);
    const descLower = raw.raw_description.toLowerCase();

    const isSelfTransfer =
      /transfer to checking|transfer from savings|internal transfer|transfer between accounts|zelle to self|ach transfer to own/i.test(
        descLower
      );
    const isCreditCardRepayment =
      documentType === 'bank_statement' &&
      /chase credit crd epay|amex epayment|credit card payment|capital one crd pmt|citi card online payment|autopay credit card/i.test(
        descLower
      );

    let reviewStatus: ExtractionReviewStatus = 'ok';
    if (raw.extraction_confidence < 0.75 || !raw.transaction_date || raw.amount <= 0) {
      reviewStatus = 'needs_review';
    } else if (isDuplicate) {
      reviewStatus = 'duplicate_excluded';
    } else if (isSelfTransfer) {
      reviewStatus = 'transfer_excluded';
    } else if (isCreditCardRepayment) {
      reviewStatus = 'cc_repayment_excluded';
    }

    const merchantKey = raw.merchant_name.toLowerCase().trim();
    const isRecurring = (merchantFrequency.get(merchantKey) || 0) >= 2;

    transactions.push({
      id: txId,
      user_id: userId,
      document_id: documentId,
      tax_year: taxYear,
      transaction_date: raw.transaction_date,
      amount: raw.amount,
      currency: raw.currency,
      direction: raw.direction,
      merchant_name: raw.merchant_name,
      raw_description: raw.raw_description,
      masked_description: maskSensitivePII(raw.raw_description),
      source_page: raw.source_page,
      source_line_ref: raw.source_line_ref,
      review_status: reviewStatus,
      is_duplicate: isDuplicate,
      duplicate_of_transaction_id: duplicateOfId,
      is_recurring: isRecurring,
      recurring_group_key: isRecurring ? merchantKey : null,
      extraction_confidence: raw.extraction_confidence,
      created_at: now,
    });
  });

  // Sort dates and detect missing statement months across the tax year
  datesFound.sort();
  const periodStart = datesFound.length > 0 ? datesFound[0] : null;
  const periodEnd = datesFound.length > 0 ? datesFound[datesFound.length - 1] : null;

  const allUserDates = [
    ...existingTransactions.map((t) => t.transaction_date).filter(Boolean),
    ...datesFound,
  ] as string[];
  const coveredMonths = new Set(
    allUserDates
      .filter((d) => d.startsWith(String(taxYear)))
      .map((d) => Number(d.slice(5, 7)))
  );

  let missingPeriodsWarning: string | null = null;
  if (
    (documentType === 'bank_statement' || documentType === 'credit_card_statement') &&
    coveredMonths.size > 0 &&
    coveredMonths.size < 12
  ) {
    const missingMonths: string[] = [];
    const monthNames = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    for (let m = 1; m <= 12; m++) {
      if (!coveredMonths.has(m)) {
        missingMonths.push(monthNames[m - 1]);
      }
    }
    missingPeriodsWarning = `Incomplete annual coverage for ${taxYear}: Missing statements for ${missingMonths.join(', ')}. Annual tax projection may be incomplete.`;
    warnings.push(missingPeriodsWarning);
  }

  const avgConfidence =
    transactions.length > 0
      ? Number(
          (
            transactions.reduce((acc, t) => acc + t.extraction_confidence, 0) /
            transactions.length
          ).toFixed(2)
        )
      : 0.5;

  const hasNeedsReviewTx = transactions.some((t) => t.review_status === 'needs_review');
  const status =
    missingPagesDetected || hasNeedsReviewTx ? 'needs_review' : 'processed';

  const document: DocumentRecord = {
    id: documentId,
    user_id: userId,
    tax_year: taxYear,
    filename,
    mime_type: mimeType,
    format,
    document_type: documentType,
    file_size_bytes: fileSizeBytes,
    storage_path: storagePath,
    checksum_sha256: computeSha256(buffer),
    status,
    ocr_used: ocrUsed,
    extraction_confidence: avgConfidence,
    period_start: periodStart,
    period_end: periodEnd,
    missing_pages_detected: missingPagesDetected,
    missing_periods_warning: missingPeriodsWarning,
    extracted_metadata: extractedMetadata,
    error_message: null,
    created_at: now,
  };

  return {
    document,
    transactions,
    warnings,
  };
}
