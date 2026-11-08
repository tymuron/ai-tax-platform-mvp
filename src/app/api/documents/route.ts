import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/security/vault-and-auth';
import {
  getFullWorkspaceState,
  ingestDocumentForUser,
} from '@/lib/services/workspace-service';
import { TaxYear } from '@/types/tax';

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15MB
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
          { ok: false, error: 'File exceeds 15MB security upload limit' },
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
      const body = await req.json();
      filename = body.filename || 'statement.csv';
      mimeType = body.mimeType || 'text/csv';
      taxYear = body.taxYear === 2026 ? 2026 : 2025;
      buffer = Buffer.from(body.content || '', 'utf8');
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
    const message = err instanceof Error ? err.message : 'Document ingestion failed';
    const status = message.includes('FREE_TRIAL_LIMIT_REACHED') ? 402 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
