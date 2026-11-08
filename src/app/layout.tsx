import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'AI Tax v2.0 — Intelligent US Document Analysis & Tax Optimization Platform',
  description:
    'Deterministic tax calculation engine, document OCR intelligence, evidence-backed Schedule C & SE optimization, and 3-scenario comparison for US individuals and sole proprietors.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        {children}
      </body>
    </html>
  );
}
