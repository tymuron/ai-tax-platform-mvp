import { NextRequest, NextResponse } from 'next/server';
import { errorResponse, getAuthenticatedUser } from '@/lib/security/vault-and-auth';
import {
  getFullWorkspaceState,
  ingestDocumentForUser,
} from '@/lib/services/workspace-service';
import { TaxYear } from '@/types/tax';

export const runtime = 'nodejs';
export const maxDuration = 60; // OCR can take a while

const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024; // Vercel request bodies are capped at 4.5 MB

/** Checks that the bytes match the extension (no executables or disguised files). */
function contentMatchesExtension(name: string, buf: Buffer): boolean {
  const lower = name.toLowerCase();
  const head = buf.subarray(0, 8);
  if (lower.endsWith('.pdf')) return head.subarray(0, 5).toString('latin1') === '%PDF-';
  if (lower.endsWith('.png')) return head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  if (lower.endsWith('.xlsx')) return head[0] === 0x50 && head[1] === 0x4b; // ZIP container
  if (lower.endsWith('.xls')) return head.subarray(0, 4).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0]));
  if (lower.endsWith('.csv')) return !buf.subarray(0, 4096).includes(0); // text only
  return false;
}
const ALLOWED_EXTENSIONS = ['.pdf', '.csv', '.xlsx', '.xls', '.jpg', '.jpeg', '.png'];

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const contentType = req.headers.get('content-type') || '';

    let filename = 'uploaded_statement.csv';
    let mimeType = 'text/csv';
    let taxYear: TaxYear = 2025;
    let buffer: Buffer;

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file') as File | null;
      const yearStr = String(formData.get('taxYear') || '2025');
      taxYear = yearStr === '2026' ? 2026 : 2025;

      if (!file) {
        return NextResponse.json({ ok: false, error: 'No file provided' }, { status: 400 });
      }
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { ok: false, error: 'File is larger than 4 MB. Split the statement or export it as CSV.' },
          { status: 400 }
        );
      }

      filename = file.name;
      mimeType = file.type || 'application/octet-stream';
      const lowerName = filename.toLowerCase();
      if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
        return NextResponse.json(
          { ok: false, error: 'Unsupported file format. Supported: PDF, CSV, XLSX, JPG, PNG.' },
          { status: 400 }
        );
      }

      const arrBuf = await file.arrayBuffer();
      buffer = Buffer.from(arrBuf);
    } else {
      // JSON upload: plain-text CSV only
      const body = await req.json();
      filename = String(body.filename || 'statement.csv');
      mimeType = 'text/csv';
      taxYear = body.taxYear === 2026 ? 2026 : 2025;
      if (!filename.toLowerCase().endsWith('.csv')) {
        return NextResponse.json({ ok: false, error: 'JSON uploads accept CSV text only' }, { status: 400 });
      }
      buffer = Buffer.from(String(body.content || ''), 'utf8');
      if (buffer.length > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({ ok: false, error: 'File is larger than 4 MB.' }, { status: 400 });
      }
    }

    if (buffer.length === 0 || !contentMatchesExtension(filename, buffer)) {
      return NextResponse.json(
        { ok: false, error: 'The file content does not match its type (or the file is empty). Supported: PDF, CSV, XLSX, JPG, PNG.' },
        { status: 400 }
      );
    }

    const result = await ingestDocumentForUser({
      userId: user.id,
      taxYear,
      filename,
      mimeType,
      buffer,
    });

    const updatedState = await getFullWorkspaceState(user.id, taxYear);

    return NextResponse.json({
      ok: true,
      document: result.document,
      transactionsInserted: result.transactionsInserted,
      warnings: result.warnings,
      data: updatedState,
    });
  } catch (err) {
    return errorResponse(err, (err instanceof Error && err.message.includes('FREE_TRIAL_LIMIT_REACHED')) ? 402 : 400);
  }
}
