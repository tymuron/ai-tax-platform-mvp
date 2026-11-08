'use client';

import React, { useEffect, useState, useCallback } from 'react';
import {
  ShieldCheck,
  FileText,
  Upload,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Calculator,
  Download,
  Lock,
  Star,
  Settings,
  RefreshCw,
  DollarSign,
  ArrowRight,
  Layers,
  Scale,
  Database,
  Eye,
  FileSpreadsheet,
  Sparkles,
  Building2,
} from 'lucide-react';
import {
  AIQuestionRecord,
  CalculationRunRecord,
  DocumentRecord,
  EvidenceClassification,
  ExportPurchaseRecord,
  FilingStatus,
  GeneratedReportRecord,
  RatingRecord,
  ScheduleCCategory,
  SubscriptionRecord,
  TaxRecommendationRecord,
  TaxYear,
  TransactionClassificationRecord,
  TransactionGroup,
  TransactionRecord,
  UserProfileRecord,
  UserRecord,
} from '@/types/tax';

interface WorkspacePayload {
  user: UserRecord;
  profile: UserProfileRecord;
  subscription: SubscriptionRecord | null;
  documents: DocumentRecord[];
  transactions: TransactionRecord[];
  classifications: TransactionClassificationRecord[];
  questions: AIQuestionRecord[];
  report: GeneratedReportRecord;
  calculationRun: CalculationRunRecord;
  exportPurchases: ExportPurchaseRecord[];
  ratings: RatingRecord[];
  serviceConfigStatus: {
    openaiConfigured: boolean;
    stripeConfigured: boolean;
    databaseEngine: string;
    privateVaultEncryption: string;
  };
}

interface AdminPayload {
  users: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
  subscriptions: Array<Record<string, unknown>>;
  exportPurchases: Array<Record<string, unknown>>;
  revenueSummary: {
    subscriptionMrrUsd: number;
    exportPackagesRevenueUsd: number;
    totalRevenueUsd: number;
  };
  taxRules: Array<Record<string, unknown>>;
  auditLogs: Array<Record<string, unknown>>;
  latestQaSummary: Record<string, unknown> | null;
}

const EVIDENCE_BADGES: Record<
  EvidenceClassification,
  { label: string; className: string }
> = {
  verified_by_document: {
    label: 'Verified by Document',
    className: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  },
  potentially_deductible_confirmation_required: {
    label: 'Potentially Deductible — Confirmation Required',
    className: 'bg-amber-50 text-amber-800 border-amber-200',
  },
  partially_deductible: {
    label: 'Partially Deductible',
    className: 'bg-sky-50 text-sky-800 border-sky-200',
  },
  non_deductible: {
    label: 'Non-Deductible',
    className: 'bg-slate-100 text-slate-700 border-slate-300',
  },
  additional_info_required: {
    label: 'Additional Info Required',
    className: 'bg-orange-50 text-orange-800 border-orange-200',
  },
  insufficient_data: {
    label: 'Insufficient Data (Needs Review)',
    className: 'bg-rose-50 text-rose-800 border-rose-200',
  },
};

const SCHEDULE_C_OPTIONS: Array<{ value: ScheduleCCategory; label: string }> = [
  { value: 'advertising_and_marketing', label: 'Advertising & Marketing' },
  { value: 'office_expenses', label: 'Office Expenses' },
  { value: 'software_and_subscriptions', label: 'Software & Subscriptions' },
  { value: 'professional_services', label: 'Professional & Legal Services' },
  { value: 'business_insurance', label: 'Business Insurance' },
  { value: 'bank_and_payment_processing_fees', label: 'Bank & Processing Fees' },
  { value: 'business_travel', label: 'Business Travel' },
  { value: 'business_mileage', label: 'Business Mileage' },
  { value: 'eligible_business_meals', label: 'Eligible Business Meals (50%)' },
  { value: 'equipment_and_supplies', label: 'Equipment & Supplies' },
  { value: 'rent', label: 'Rent & Lease' },
  { value: 'utilities', label: 'Utilities' },
  { value: 'telephone_and_internet', label: 'Telephone & Internet' },
  { value: 'education_and_training', label: 'Education & Training' },
  { value: 'vehicle_expenses', label: 'Vehicle Expenses' },
  { value: 'home_office', label: 'Home Office' },
  { value: 'depreciation_and_section_179', label: 'Depreciation & Section 179' },
  { value: 'other_eligible_business_expenses', label: 'Other Business Expenses' },
  { value: 'none', label: 'None / Non-Business' },
];

function fmtUsd(val: number | undefined | null): string {
  const num = Number(val ?? 0);
  return `$${num.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function AITaxPlatformApp() {
  const [activeTab, setActiveTab] = useState<
    'overview' | 'documents' | 'ledger' | 'interview' | 'scenarios' | 'report' | 'export' | 'admin'
  >('overview');
  const [taxYear, setTaxYear] = useState<TaxYear>(2025);
  const [workspace, setWorkspace] = useState<WorkspacePayload | null>(null);
  const [adminData, setAdminData] = useState<AdminPayload | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [busyMessage, setBusyMessage] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<{
    type: 'success' | 'warning' | 'error';
    text: string;
  } | null>(null);

  // Filter states for ledger
  const [groupFilter, setGroupFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Rating state
  const [selectedStars, setSelectedStars] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState<string>('');

  const loadWorkspace = useCallback(async (year: TaxYear) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/workspace?taxYear=${year}`);
      const json = await res.json();
      if (json.ok) {
        setWorkspace(json.data);
      } else {
        setAlertMessage({ type: 'error', text: json.error || 'Failed to load workspace' });
      }
    } catch {
      setAlertMessage({ type: 'error', text: 'Network error loading workspace' });
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAdmin = useCallback(async () => {
    try {
      const res = await fetch('/api/admin');
      const json = await res.json();
      if (json.ok) {
        setAdminData(json.data);
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    loadWorkspace(taxYear);
  }, [taxYear, loadWorkspace]);

  useEffect(() => {
    if (activeTab === 'admin') {
      loadAdmin();
    }
  }, [activeTab, loadAdmin]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusyMessage(`Encrypting & extracting "${file.name}"...`);
    setAlertMessage(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('taxYear', String(taxYear));
      const res = await fetch('/api/documents', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!json.ok) {
        setAlertMessage({ type: 'error', text: json.error });
      } else {
        setWorkspace(json.data);
        setAlertMessage({
          type: 'success',
          text: `Processed "${file.name}" (${json.transactionsInserted} transactions extracted). Deterministic tax scenarios recalculated.`,
        });
      }
    } catch {
      setAlertMessage({ type: 'error', text: 'Document upload failed' });
    } finally {
      setBusyMessage(null);
      e.target.value = '';
    }
  }

  async function handleQuickSampleUpload(sampleType: '1099_receipts' | 'ocr_scan_needs_review') {
    setBusyMessage('Ingesting sample tax document...');
    setAlertMessage(null);
    try {
      const samplePayload =
        sampleType === '1099_receipts'
          ? {
              filename: `2025_Equipment_and_Contractor_Invoices.csv`,
              mimeType: 'text/csv',
              taxYear,
              content: [
                'Date,Description,Amount,Direction,Currency',
                `${taxYear}-05-19,B&H Photo MacBook Pro M4 Max Workstation,3499.00,outflow,USD`,
                `${taxYear}-07-22,Upwork Specialist UI Contractor Invoice #882,2800.00,outflow,USD`,
                `${taxYear}-08-04,Coursera Machine Learning Engineering Specialization,490.00,outflow,USD`,
              ].join('\n'),
            }
          : {
              filename: `2025_Scanned_Receipt_Bundle_OCR.pdf`,
              mimeType: 'application/pdf',
              taxYear,
              content: [
                'OCR_SCAN Page 1 of 2',
                `${taxYear}-09-14 | Hilton Hotel Conference Lodging | $680.00 | outflow`,
                `????-??-?? | Blurry Thermal Receipt Unclear Date | $195.00 | outflow`,
              ].join('\n'),
            };

      const res = await fetch('/api/documents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(samplePayload),
      });
      const json = await res.json();
      if (!json.ok) {
        setAlertMessage({ type: 'error', text: json.error });
      } else {
        setWorkspace(json.data);
        setAlertMessage({
          type: 'success',
          text: `Ingested "${samplePayload.filename}" (${json.transactionsInserted} transactions).`,
        });
      }
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleAnswerQuestion(
    questionId: string,
    selectedOption: string,
    customBusinessPct?: number
  ) {
    setBusyMessage('Saving answer & running deterministic tax recalculation...');
    try {
      const res = await fetch('/api/interview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionId,
          selectedOption,
          customBusinessPct,
          taxYear,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setWorkspace(json.data);
        setAlertMessage({
          type: 'success',
          text: 'Interview answer saved. Affected transactions and tax scenarios updated.',
        });
      }
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleTransactionOverride(params: {
    transactionId: string;
    effectiveGroup: TransactionGroup;
    scheduleCCategory: ScheduleCCategory;
    evidenceClassification: EvidenceClassification;
    businessUsePct: number;
    confirmedDate?: string;
    confirmedAmount?: number;
  }) {
    setBusyMessage('Updating classification & recalculating tax scenarios...');
    try {
      const res = await fetch('/api/transactions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...params, taxYear }),
      });
      const json = await res.json();
      if (json.ok) {
        setWorkspace(json.data);
        setAlertMessage({
          type: 'success',
          text: 'Transaction classification updated and verified in audit trail.',
        });
      }
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleProfileUpdate(partial: Partial<UserProfileRecord>) {
    setBusyMessage('Updating taxpayer profile & recalculating scenarios...');
    try {
      const res = await fetch('/api/workspace', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...partial, tax_year: taxYear }),
      });
      const json = await res.json();
      if (json.ok) {
        setWorkspace(json.data);
        setAlertMessage({
          type: 'success',
          text: 'Taxpayer profile updated and scenarios recalculated.',
        });
      }
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleStripeAction(
    action: 'subscribe_pro' | 'downgrade_free_trial' | 'purchase_export_package',
    exportTier?: 'essential_50' | 'professional_100' | 'complete_audit_200'
  ) {
    setBusyMessage('Processing payment & verifying server Stripe webhook signature...');
    try {
      const res = await fetch('/api/stripe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, exportTier, taxYear }),
      });
      const json = await res.json();
      if (json.ok) {
        setWorkspace(json.data);
        setAlertMessage({
          type: 'success',
          text: `Stripe webhook verified on server! Entitlement granted: ${json.entitlementGranted}.`,
        });
      } else {
        setAlertMessage({ type: 'error', text: json.error });
      }
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleDownloadExport(format: 'PDF' | 'CSV' | 'XLSX') {
    setBusyMessage(`Generating signed download link for ${format} package...`);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, taxYear }),
      });
      const json = await res.json();
      if (!json.ok) {
        setAlertMessage({ type: 'error', text: json.error });
        return;
      }
      window.open(json.downloadUrl, '_blank');
      setAlertMessage({
        type: 'success',
        text: `Signed ${format} export link generated (expires in 15 minutes). Download started.`,
      });
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleSubmitRating() {
    setBusyMessage('Submitting rating...');
    try {
      const res = await fetch('/api/ratings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stars: selectedStars,
          comment: ratingComment,
          exportPurchaseId: workspace?.exportPurchases[0]?.id || null,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setWorkspace(json.data);
        setRatingComment('');
        setAlertMessage({
          type: 'success',
          text: 'Thank you for your feedback! (Ratings are optional and never restrict access to your tax documents.)',
        });
      }
    } finally {
      setBusyMessage(null);
    }
  }

  async function handleAdminAction(action: string, targetId: string) {
    setBusyMessage(`Running admin action: ${action}...`);
    try {
      const res = await fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, targetId, taxYear }),
      });
      const json = await res.json();
      if (json.ok) {
        setAdminData(json.data);
        await loadWorkspace(taxYear);
      }
    } finally {
      setBusyMessage(null);
    }
  }

  if (loading || !workspace) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-white p-6">
        <div className="flex items-center gap-3 mb-4">
          <RefreshCw className="w-7 h-7 text-sky-400 animate-spin" />
          <span className="text-xl font-semibold tracking-tight">
            Initializing AI Tax v2.0 Deterministic Engine...
          </span>
        </div>
        <p className="text-sm text-slate-400 max-w-md text-center">
          Loading PostgreSQL database, IRS {taxYear} rule versions, document vault, and QA verification gates.
        </p>
      </div>
    );
  }

  const {
    profile,
    subscription,
    documents,
    transactions,
    classifications,
    questions,
    report,
    calculationRun,
    exportPurchases,
    ratings,
    serviceConfigStatus,
  } = workspace;

  const clsByTxId = new Map<string, TransactionClassificationRecord>();
  classifications.forEach((c) => clsByTxId.set(c.transaction_id, c));

  const payload = report.report_payload;
  const baseScenario = payload.tax_optimization_scenarios.baseline;
  const confScenario = payload.tax_optimization_scenarios.confirmed;
  const potScenario = payload.tax_optimization_scenarios.potential;
  const pendingQuestionsCount = questions.filter((q) => q.status === 'pending').length;
  const hasPaidExport = exportPurchases.some(
    (p) => p.status === 'paid' && p.stripe_webhook_verified
  );

  const filteredTransactions = transactions.filter((tx) => {
    const cls = clsByTxId.get(tx.id);
    if (groupFilter !== 'ALL') {
      if (groupFilter === 'NEEDS_REVIEW' && tx.review_status !== 'needs_review') return false;
      if (
        groupFilter !== 'NEEDS_REVIEW' &&
        cls?.effective_group !== groupFilter
      ) {
        return false;
      }
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        tx.merchant_name.toLowerCase().includes(q) ||
        tx.masked_description.toLowerCase().includes(q) ||
        (cls?.schedule_c_category || '').toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      {/* Top Compliance & Engine Status Bar */}
      <div className="bg-slate-900 text-slate-200 text-xs border-b border-slate-800 px-4 py-2">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              Deterministic Engine: {payload.header.rule_version_id}
            </span>
            <span className="hidden md:inline text-slate-400">|</span>
            <span className="hidden md:inline text-slate-300">
              Vault: {serviceConfigStatus.privateVaultEncryption}
            </span>
            <span className="hidden lg:inline text-slate-400">|</span>
            <span className="hidden lg:inline text-slate-300">
              AI Mode:{' '}
              {serviceConfigStatus.openaiConfigured
                ? 'OpenAI API Live'
                : 'Safe Deterministic Hybrid Mode (PII Masked)'}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`px-2 py-0.5 rounded font-semibold ${
                subscription?.plan === 'pro_monthly' && subscription?.status === 'active'
                  ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              {subscription?.plan === 'pro_monthly'
                ? 'Pro Workspace ($10/mo Active)'
                : 'Free Trial (1 Statement Limit)'}
            </span>
            <span
              className={`px-2 py-0.5 rounded font-semibold ${
                report.qa_status === 'verified'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              }`}
            >
              QA Gate: {report.qa_status.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Main Header & Navigation */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-700 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              AT
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  AI Tax
                </h1>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-sky-100 text-sky-800">
                  v2.0 US Individual & Schedule C/SE
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Evidence-Backed Document Intelligence & Deterministic Tax Optimization
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
              <button
                onClick={() => setTaxYear(2025)}
                className={`px-3 py-1.5 rounded-md transition ${
                  taxYear === 2025
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tax Year 2025
              </button>
              <button
                onClick={() => setTaxYear(2026)}
                className={`px-3 py-1.5 rounded-md transition ${
                  taxYear === 2026
                    ? 'bg-white text-slate-900 shadow-sm font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tax Year 2026
              </button>
            </div>

            <div className="text-right hidden sm:block">
              <div className="text-xs font-semibold text-slate-800">
                {workspace.user.full_name}
              </div>
              <div className="text-[11px] text-slate-500">
                {profile.filing_status.replace(/_/g, ' ').toUpperCase()} • State: {profile.state_code}
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="max-w-7xl mx-auto px-4 flex overflow-x-auto border-t border-slate-100 gap-1">
          {[
            { id: 'overview', label: '1. Executive Dashboard', icon: Sparkles },
            { id: 'documents', label: `2. Document Vault (${documents.length})`, icon: FileText },
            { id: 'ledger', label: `3. Financial Ledger (${transactions.length})`, icon: Layers },
            {
              id: 'interview',
              label: `4. AI Tax Interview (${pendingQuestionsCount} Pending)`,
              icon: HelpCircle,
            },
            { id: 'scenarios', label: '5. 3-Scenario Tax Calculator', icon: Calculator },
            { id: 'report', label: '6. Optimization Report & QA', icon: Scale },
            { id: 'export', label: '7. Plans & Export Package', icon: Download },
            { id: 'admin', label: '8. Admin & Compliance', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition ${
                  active
                    ? 'border-sky-600 text-sky-700 bg-sky-50/60'
                    : 'border-transparent text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </header>

      {/* Global Status / Alert Banner */}
      <div className="max-w-7xl w-full mx-auto px-4 pt-4">
        {busyMessage && (
          <div className="mb-3 bg-sky-900 text-white px-4 py-2.5 rounded-lg flex items-center gap-2.5 text-xs font-medium shadow">
            <RefreshCw className="w-4 h-4 animate-spin text-sky-300" />
            <span>{busyMessage}</span>
          </div>
        )}

        {alertMessage && (
          <div
            className={`mb-3 px-4 py-3 rounded-lg border flex items-center justify-between text-xs font-medium ${
              alertMessage.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : alertMessage.type === 'warning'
                ? 'bg-amber-50 border-amber-200 text-amber-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {alertMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{alertMessage.text}</span>
            </div>
            <button
              onClick={() => setAlertMessage(null)}
              className="text-slate-500 hover:text-slate-800 ml-4 font-bold"
            >
              ✕
            </button>
          </div>
        )}

        {calculationRun.status === 'additional_review_required' && (
          <div className="mb-3 bg-amber-50 border border-amber-300 text-amber-950 px-4 py-3 rounded-lg flex items-start gap-3 text-xs">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold">Additional Tax Review Required</div>
              <p className="mt-0.5 text-amber-800">
                {calculationRun.additional_review_reasons.join(' ')}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <main className="max-w-7xl w-full mx-auto px-4 py-4 flex-1 space-y-6">
        {/* TAB 1: EXECUTIVE DASHBOARD */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Hero Value Banner */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-sky-950 rounded-2xl p-6 text-white shadow-md">
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-center">
                <div className="lg:col-span-2 space-y-2">
                  <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-sky-500/20 border border-sky-400/30 text-sky-300 text-xs font-semibold">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    IRS {taxYear} Deterministic Tax Engine ({payload.header.rule_version_id})
                  </div>
                  <h2 className="text-2xl font-bold tracking-tight">
                    Find Every Legal Tax-Saving Opportunity. Calculate Its Real Financial Impact.
                  </h2>
                  <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                    AI Tax separates <strong>gross expenses</strong> from{' '}
                    <strong>real tax liability reduction</strong>, excludes inter-account transfers
                    and credit card repayments from double-counting, and isolates unconfirmed
                    assumptions until you verify them.
                  </p>
                </div>
                <div className="bg-white/10 backdrop-blur rounded-xl p-4 border border-white/15 space-y-2">
                  <div className="text-xs text-sky-200 font-medium">
                    Confirmed Real Tax Liability Savings
                  </div>
                  <div className="text-3xl font-extrabold text-emerald-400">
                    {fmtUsd(payload.estimated_tax_impact.confirmed_real_tax_savings)}
                  </div>
                  <div className="text-[11px] text-slate-300">
                    Plus{' '}
                    <strong className="text-amber-300">
                      {fmtUsd(
                        payload.estimated_tax_impact
                          .additional_potential_tax_savings_requiring_confirmation
                      )}
                    </strong>{' '}
                    in additional potential tax savings awaiting your confirmation in the AI
                    Interview.
                  </div>
                </div>
              </div>
            </div>

            {/* 4 Key KPI Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-xs font-medium text-slate-500">
                  Baseline Estimated Tax
                </div>
                <div className="text-2xl font-bold text-slate-900 mt-1">
                  {fmtUsd(baseScenario.total_estimated_tax_liability)}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Effective Rate: {baseScenario.effective_tax_rate_pct}% on{' '}
                  {fmtUsd(baseScenario.total_gross_income)} gross
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border-2 border-emerald-500/70 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-emerald-800">
                    Confirmed Optimized Tax
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-bold">
                    VERIFIED
                  </span>
                </div>
                <div className="text-2xl font-bold text-emerald-700 mt-1">
                  {fmtUsd(confScenario.total_estimated_tax_liability)}
                </div>
                <div className="text-[11px] text-emerald-700 font-medium mt-1">
                  Saves {fmtUsd(confScenario.savings_vs_baseline)} vs. Baseline
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-amber-300 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-amber-900">
                    Potential Scenario Tax
                  </span>
                  <span className="text-[10px] px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">
                    NEEDS CONFIRMATION
                  </span>
                </div>
                <div className="text-2xl font-bold text-amber-700 mt-1">
                  {fmtUsd(potScenario.total_estimated_tax_liability)}
                </div>
                <div className="text-[11px] text-amber-800 mt-1">
                  Up to {fmtUsd(potScenario.savings_vs_baseline)} total savings if substantiated
                </div>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
                <div className="text-xs font-medium text-slate-500">
                  Excluded Transfers & Duplicates
                </div>
                <div className="text-2xl font-bold text-slate-800 mt-1">
                  {fmtUsd(
                    payload.financial_overview
                      .excluded_non_expense_transfers_and_repayments +
                      payload.financial_overview.excluded_duplicates
                  )}
                </div>
                <div className="text-[11px] text-slate-500 mt-1">
                  Protected from false income or double-expense counting
                </div>
              </div>
            </div>

            {/* Taxpayer Profile & Special Regimes Quick Configurator */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-sky-600" />
                      Taxpayer Profile & Special Optimization Parameters ({taxYear})
                    </h3>
                    <p className="text-xs text-slate-500">
                      Changing any parameter triggers an immediate deterministic recalculation across all 3 scenarios.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Filing Status
                    </label>
                    <select
                      value={profile.filing_status}
                      onChange={(e) =>
                        handleProfileUpdate({
                          filing_status: e.target.value as FilingStatus,
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2 bg-white text-slate-900"
                    >
                      <option value="single">Single</option>
                      <option value="married_filing_jointly">Married Filing Jointly</option>
                      <option value="married_filing_separately">Married Filing Separately</option>
                      <option value="head_of_household">Head of Household</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      US State
                    </label>
                    <select
                      value={profile.state_code}
                      onChange={(e) =>
                        handleProfileUpdate({ state_code: e.target.value })
                      }
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2 bg-white text-slate-900"
                    >
                      <option value="CA">California (CA - 6.5% eff)</option>
                      <option value="NY">New York (NY - 6.0% eff)</option>
                      <option value="TX">Texas (TX - 0% state tax)</option>
                      <option value="FL">Florida (FL - 0% state tax)</option>
                      <option value="WA">Washington (WA - 0% state tax)</option>
                      <option value="IL">Illinois (IL - 4.95%)</option>
                      <option value="MA">Massachusetts (MA - 5.0%)</option>
                      <option value="CO">Colorado (CO - 4.4%)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Qualifying Children (&lt;17)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      value={profile.qualifying_children_under_17}
                      onChange={(e) =>
                        handleProfileUpdate({
                          qualifying_children_under_17: Number(e.target.value),
                          dependents_count: Math.max(
                            Number(e.target.value),
                            profile.dependents_count
                          ),
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Dedicated Home Office (Sq Ft)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={profile.home_total_sqft}
                      value={profile.home_office_sqft}
                      onChange={(e) =>
                        handleProfileUpdate({
                          home_office_sqft: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Business Vehicle Miles ({taxYear === 2025 ? '70¢' : '71¢'}/mi)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={profile.vehicle_business_miles}
                      onChange={(e) =>
                        handleProfileUpdate({
                          vehicle_business_miles: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Self-Employed Health Ins ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={profile.self_employed_health_insurance_premiums}
                      onChange={(e) =>
                        handleProfileUpdate({
                          self_employed_health_insurance_premiums: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      SEP-IRA / Solo 401(k) ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={profile.sep_ira_solo_401k_contributions}
                      onChange={(e) =>
                        handleProfileUpdate({
                          sep_ira_solo_401k_contributions: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Child/Dependent Care Paid ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={profile.child_care_expenses_paid}
                      onChange={(e) =>
                        handleProfileUpdate({
                          child_care_expenses_paid: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Estimated Tax / Withholding ($)
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={profile.estimated_tax_payments_made}
                      onChange={(e) =>
                        handleProfileUpdate({
                          estimated_tax_payments_made: Number(e.target.value),
                        })
                      }
                      className="w-full rounded-lg border border-slate-300 px-2.5 py-2"
                    />
                  </div>
                </div>

                <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 text-xs">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={profile.has_unsupported_complex_entity}
                      onChange={(e) =>
                        handleProfileUpdate({
                          has_unsupported_complex_entity: e.target.checked,
                          unsupported_entity_notes: e.target.checked
                            ? 'Foreign Trust / K-1 Multi-State S-Corp flagged: Requires specialist CPA review outside automated Schedule C scope.'
                            : null,
                        })
                      }
                      className="rounded border-slate-300"
                    />
                    <span className="text-slate-700 font-medium">
                      Test Unsupported Complex Entity Guardrail (&quot;Additional tax review required&quot;)
                    </span>
                  </label>

                  <button
                    onClick={() => setActiveTab('scenarios')}
                    className="inline-flex items-center gap-1.5 text-sky-700 font-semibold hover:underline"
                  >
                    View Full 3-Scenario Breakdown
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Required Actions Panel */}
              <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col justify-between space-y-4">
                <div className="space-y-3">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center justify-between">
                    <span>Required Actions to Finalize</span>
                    <span className="px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800">
                      {payload.required_actions.length}
                    </span>
                  </h3>
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {payload.required_actions.slice(0, 5).map((act, i) => (
                      <div
                        key={i}
                        className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1"
                      >
                        <div className="font-semibold text-slate-800">{act.title}</div>
                        <p className="text-slate-600 line-clamp-2">{act.description}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                  <button
                    onClick={() => setActiveTab('interview')}
                    className="w-full py-2 px-3 rounded-lg bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs transition flex items-center justify-center gap-2"
                  >
                    <HelpCircle className="w-4 h-4" />
                    Answer {pendingQuestionsCount} AI Clarification Questions
                  </button>
                  <button
                    onClick={() => setActiveTab('report')}
                    className="w-full py-2 px-3 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition flex items-center justify-center gap-2"
                  >
                    <Scale className="w-4 h-4" />
                    Inspect Full Tax Optimization Report
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DOCUMENT INTELLIGENCE VAULT */}
        {activeTab === 'documents' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Document Intelligence Engine & Private Encrypted Vault
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Supports PDF, CSV, XLSX, JPG, PNG (W-2, 1099-NEC, 1099-K, 1099-MISC, 1098, 1095-A, Bank & Card Statements, Receipts, Contracts).
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-sm transition">
                    <Upload className="w-4 h-4" />
                    Upload Document (PDF/CSV/XLSX/JPG/PNG)
                    <input
                      type="file"
                      accept=".pdf,.csv,.xlsx,.xls,.jpg,.jpeg,.png"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                  <button
                    onClick={() => handleQuickSampleUpload('1099_receipts')}
                    className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700"
                  >
                    + Load Sample Equipment & Contractor CSV
                  </button>
                  <button
                    onClick={() => handleQuickSampleUpload('ocr_scan_needs_review')}
                    className="px-3 py-2 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-xs font-semibold text-amber-900"
                  >
                    + Test OCR Scan with Missing Page / Uncertain Row
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500 bg-slate-50">
                      <th className="py-2.5 px-3 font-semibold">Filename</th>
                      <th className="py-2.5 px-3 font-semibold">Type & Format</th>
                      <th className="py-2.5 px-3 font-semibold">Period Covered</th>
                      <th className="py-2.5 px-3 font-semibold">OCR / Confidence</th>
                      <th className="py-2.5 px-3 font-semibold">Status & Integrity Warnings</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-slate-50">
                        <td className="py-3 px-3 font-medium text-slate-900">
                          <div>{doc.filename}</div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            ID: {doc.id} • SHA256: {doc.checksum_sha256.slice(0, 12)}...
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-800 font-semibold uppercase">
                            {doc.document_type.replace(/_/g, ' ')}
                          </span>
                          <span className="ml-1.5 text-slate-500">({doc.format})</span>
                        </td>
                        <td className="py-3 px-3 text-slate-700">
                          {doc.period_start && doc.period_end
                            ? `${doc.period_start} → ${doc.period_end}`
                            : 'Annual / Single Date'}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-semibold text-slate-800">
                            {Math.round(Number(doc.extraction_confidence) * 100)}% Confidence
                          </div>
                          <div className="text-[10px] text-slate-500">
                            {doc.ocr_used ? 'OCR Pipeline Used' : 'Native Digital Parse'}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                              doc.status === 'processed'
                                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-amber-50 text-amber-800 border border-amber-200'
                            }`}
                          >
                            {doc.status === 'processed' ? 'Verified' : 'Needs Review'}
                          </span>
                          {doc.missing_pages_detected && (
                            <div className="text-[11px] text-rose-700 font-medium mt-1">
                              ⚠ Missing page sequence detected
                            </div>
                          )}
                          {doc.missing_periods_warning && (
                            <div className="text-[11px] text-amber-700 mt-1 max-w-md">
                              {doc.missing_periods_warning}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: FINANCIAL LEDGER & EVIDENCE CLASSIFICATION */}
        {activeTab === 'ledger' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Financial Analysis & Traceable Transaction Ledger
                  </h2>
                  <p className="text-xs text-slate-500">
                    Every transaction preserves its source coordinate, AI classification, user override, business-use %, and 6-tier evidence status.
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <input
                    type="text"
                    placeholder="Search merchant or category..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-1.5"
                  />
                  <select
                    value={groupFilter}
                    onChange={(e) => setGroupFilter(e.target.value)}
                    className="rounded-lg border border-slate-300 px-2.5 py-1.5 bg-white font-medium"
                  >
                    <option value="ALL">All Groups ({transactions.length})</option>
                    <option value="Income">Income</option>
                    <option value="Business expenses">Business Expenses</option>
                    <option value="Non-expense transactions">
                      Non-Expense (Transfers & CC Repayments)
                    </option>
                    <option value="Personal expenses">Personal Expenses</option>
                    <option value="NEEDS_REVIEW">Needs Review / Uncertain OCR</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-slate-600">
                      <th className="py-2.5 px-2.5 font-semibold">Date & Source</th>
                      <th className="py-2.5 px-2.5 font-semibold">Merchant & Description (Masked)</th>
                      <th className="py-2.5 px-2.5 font-semibold text-right">Amount</th>
                      <th className="py-2.5 px-2.5 font-semibold">Group</th>
                      <th className="py-2.5 px-2.5 font-semibold">Schedule C Category</th>
                      <th className="py-2.5 px-2.5 font-semibold">Business %</th>
                      <th className="py-2.5 px-2.5 font-semibold">Evidence Status & Rule</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredTransactions.map((tx) => {
                      const cls = clsByTxId.get(tx.id);
                      if (!cls) return null;
                      const badge = EVIDENCE_BADGES[cls.evidence_classification];

                      return (
                        <tr
                          key={tx.id}
                          className={`hover:bg-slate-50 ${
                            tx.is_duplicate ||
                            tx.review_status === 'transfer_excluded' ||
                            tx.review_status === 'cc_repayment_excluded'
                              ? 'bg-slate-50/70 opacity-75'
                              : ''
                          }`}
                        >
                          <td className="py-3 px-2.5 whitespace-nowrap">
                            {tx.transaction_date ? (
                              <div className="font-semibold text-slate-900">
                                {tx.transaction_date}
                              </div>
                            ) : (
                              <button
                                onClick={() =>
                                  handleTransactionOverride({
                                    transactionId: tx.id,
                                    effectiveGroup: 'Business expenses',
                                    scheduleCCategory: 'business_travel',
                                    evidenceClassification: 'verified_by_document',
                                    businessUsePct: 100,
                                    confirmedDate: `${taxYear}-09-15`,
                                    confirmedAmount: tx.amount,
                                  })
                                }
                                className="px-2 py-0.5 rounded bg-rose-100 text-rose-800 font-bold text-[10px] hover:bg-rose-200"
                              >
                                Needs Review — Click to Confirm Date
                              </button>
                            )}
                            <div className="text-[10px] text-slate-400 font-mono">
                              {tx.source_line_ref}
                            </div>
                          </td>

                          <td className="py-3 px-2.5 max-w-xs">
                            <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                              <span>{tx.merchant_name}</span>
                              {tx.is_recurring && (
                                <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 text-[10px] font-semibold">
                                  Recurring
                                </span>
                              )}
                              {tx.is_duplicate && (
                                <span className="px-1.5 py-0.2 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                                  Duplicate Excluded
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {tx.masked_description}
                            </div>
                          </td>

                          <td
                            className={`py-3 px-2.5 text-right font-bold whitespace-nowrap ${
                              tx.direction === 'inflow'
                                ? 'text-emerald-700'
                                : 'text-slate-900'
                            }`}
                          >
                            {tx.direction === 'inflow' ? '+' : '-'}
                            {fmtUsd(tx.amount)}
                          </td>

                          <td className="py-3 px-2.5">
                            <select
                              value={cls.effective_group}
                              disabled={tx.is_duplicate}
                              onChange={(e) => {
                                const newGroup = e.target.value as TransactionGroup;
                                handleTransactionOverride({
                                  transactionId: tx.id,
                                  effectiveGroup: newGroup,
                                  scheduleCCategory:
                                    newGroup === 'Business expenses'
                                      ? cls.schedule_c_category === 'none'
                                        ? 'office_expenses'
                                        : cls.schedule_c_category
                                      : 'none',
                                  evidenceClassification:
                                    newGroup === 'Business expenses'
                                      ? 'verified_by_document'
                                      : 'non_deductible',
                                  businessUsePct: newGroup === 'Business expenses' ? 100 : 0,
                                });
                              }}
                              className="rounded border border-slate-300 px-2 py-1 bg-white text-xs font-medium"
                            >
                              <option value="Income">Income</option>
                              <option value="Business expenses">Business expenses</option>
                              <option value="Non-expense transactions">
                                Non-expense transactions
                              </option>
                              <option value="Personal expenses">Personal expenses</option>
                            </select>
                          </td>

                          <td className="py-3 px-2.5">
                            <select
                              value={cls.schedule_c_category}
                              disabled={
                                tx.is_duplicate || cls.effective_group !== 'Business expenses'
                              }
                              onChange={(e) =>
                                handleTransactionOverride({
                                  transactionId: tx.id,
                                  effectiveGroup: cls.effective_group,
                                  scheduleCCategory: e.target.value as ScheduleCCategory,
                                  evidenceClassification: 'verified_by_document',
                                  businessUsePct: cls.business_use_pct || 100,
                                })
                              }
                              className="rounded border border-slate-300 px-2 py-1 bg-white text-xs max-w-[170px]"
                            >
                              {SCHEDULE_C_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                          </td>

                          <td className="py-3 px-2.5">
                            {cls.effective_group === 'Business expenses' ? (
                              <select
                                value={cls.business_use_pct}
                                onChange={(e) =>
                                  handleTransactionOverride({
                                    transactionId: tx.id,
                                    effectiveGroup: 'Business expenses',
                                    scheduleCCategory: cls.schedule_c_category,
                                    evidenceClassification:
                                      Number(e.target.value) === 100
                                        ? 'verified_by_document'
                                        : 'partially_deductible',
                                    businessUsePct: Number(e.target.value),
                                  })
                                }
                                className="rounded border border-slate-300 px-2 py-1 bg-white text-xs font-semibold"
                              >
                                <option value={100}>100%</option>
                                <option value={80}>80%</option>
                                <option value={60}>60%</option>
                                <option value={50}>50%</option>
                                <option value={25}>25%</option>
                              </select>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className="py-3 px-2.5">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${badge.className}`}
                              >
                                {badge.label}
                              </span>
                              {cls.is_user_overridden && (
                                <span className="text-[10px] font-bold text-sky-700">
                                  (User Confirmed)
                                </span>
                              )}
                            </div>
                            <div className="text-[10px] text-slate-500 mt-0.5">
                              {cls.applied_rule_ref}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: AI TAX INTERVIEW ENGINE */}
        {activeTab === 'interview' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  AI Tax Interview Engine — High-Precision Contextual Clarifications
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Principle: Better to ask one concise question than make an unverified tax assumption. Answering any question updates the underlying transactions and triggers a deterministic tax recalculation.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {questions.map((q) => (
                  <div
                    key={q.id}
                    className={`rounded-xl border p-4 flex flex-col justify-between space-y-3 ${
                      q.status === 'answered'
                        ? 'bg-emerald-50/40 border-emerald-200'
                        : 'bg-white border-slate-200 shadow-sm'
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-800 font-semibold uppercase text-[10px]">
                          {q.category.replace(/_/g, ' ')}
                        </span>
                        <span
                          className={`text-[11px] font-bold ${
                            q.status === 'answered'
                              ? 'text-emerald-700'
                              : q.status === 'skipped'
                              ? 'text-slate-500'
                              : 'text-amber-700'
                          }`}
                        >
                          {q.status.toUpperCase()}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 leading-snug">
                        {q.question_text}
                      </h3>
                      <p className="text-xs text-slate-600">{q.context_summary}</p>
                    </div>

                    <div className="pt-2 border-t border-slate-100 flex flex-wrap gap-2">
                      {q.options.map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() =>
                            handleAnswerQuestion(q.id, opt.value, opt.business_use_pct)
                          }
                          className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${
                            opt.value === '100_business'
                              ? 'bg-sky-600 text-white border-sky-600 hover:bg-sky-700'
                              : opt.value === 'partially_business'
                              ? 'bg-sky-50 text-sky-900 border-sky-200 hover:bg-sky-100'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: 3-SCENARIO DETERMINISTIC TAX CALCULATOR */}
        {activeTab === 'scenarios' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    3-Scenario Deterministic Tax Comparison ({payload.header.rule_version_id})
                  </h2>
                  <p className="text-xs text-slate-500">
                    Compares Baseline vs. Confirmed Optimizations vs. Potential Unconfirmed Opportunities. Unconfirmed deductions are strictly isolated in Scenario 3.
                  </p>
                </div>
                <span className="text-xs font-mono bg-slate-100 px-2.5 py-1 rounded text-slate-700">
                  Run ID: {calculationRun.id}
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b-2 border-slate-200 bg-slate-50">
                      <th className="py-3 px-3 font-bold text-slate-700">Tax Line Item</th>
                      <th className="py-3 px-3 font-bold text-slate-700 text-right">
                        1. Baseline Scenario
                      </th>
                      <th className="py-3 px-3 font-bold text-emerald-800 bg-emerald-50/60 text-right">
                        2. Confirmed Optimization (Verified)
                      </th>
                      <th className="py-3 px-3 font-bold text-amber-900 bg-amber-50/60 text-right">
                        3. Potential Scenario (Needs Confirmation)
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {[
                      {
                        label: 'Form W-2 Taxable Wages',
                        b: baseScenario.w2_income,
                        c: confScenario.w2_income,
                        p: potScenario.w2_income,
                      },
                      {
                        label: 'Form 1099-NEC / 1099-K & Schedule C Gross Receipts',
                        b: baseScenario.form_1099_and_business_gross_income,
                        c: confScenario.form_1099_and_business_gross_income,
                        p: potScenario.form_1099_and_business_gross_income,
                      },
                      {
                        label: 'Total Gross Income',
                        b: baseScenario.total_gross_income,
                        c: confScenario.total_gross_income,
                        p: potScenario.total_gross_income,
                        bold: true,
                      },
                      {
                        label: 'Schedule C Business Deductions (Operating + Home Office + Mileage + §179)',
                        b: baseScenario.total_schedule_c_deductions,
                        c: confScenario.total_schedule_c_deductions,
                        p: potScenario.total_schedule_c_deductions,
                      },
                      {
                        label: 'Schedule C Net Profit',
                        b: baseScenario.schedule_c_net_profit,
                        c: confScenario.schedule_c_net_profit,
                        p: potScenario.schedule_c_net_profit,
                        bold: true,
                      },
                      {
                        label: 'Self-Employment Tax (Schedule SE: OASDI 12.4% + Medicare 2.9%)',
                        b: baseScenario.total_self_employment_tax,
                        c: confScenario.total_self_employment_tax,
                        p: potScenario.total_self_employment_tax,
                      },
                      {
                        label: 'Above-the-Line Adjustments (50% SE Tax + SE Health Ins + SEP-IRA)',
                        b: baseScenario.total_above_the_line_adjustments,
                        c: confScenario.total_above_the_line_adjustments,
                        p: potScenario.total_above_the_line_adjustments,
                      },
                      {
                        label: 'Adjusted Gross Income (AGI)',
                        b: baseScenario.adjusted_gross_income,
                        c: confScenario.adjusted_gross_income,
                        p: potScenario.adjusted_gross_income,
                        bold: true,
                      },
                      {
                        label: 'Standard Deduction',
                        b: baseScenario.standard_or_itemized_deduction,
                        c: confScenario.standard_or_itemized_deduction,
                        p: potScenario.standard_or_itemized_deduction,
                      },
                      {
                        label: 'Qualified Business Income (QBI) 20% Deduction (IRC §199A)',
                        b: baseScenario.qbi_deduction,
                        c: confScenario.qbi_deduction,
                        p: potScenario.qbi_deduction,
                      },
                      {
                        label: 'Taxable Income',
                        b: baseScenario.taxable_income,
                        c: confScenario.taxable_income,
                        p: potScenario.taxable_income,
                        bold: true,
                      },
                      {
                        label: 'Regular Federal Income Tax (Before Credits)',
                        b: baseScenario.regular_federal_income_tax,
                        c: confScenario.regular_federal_income_tax,
                        p: potScenario.regular_federal_income_tax,
                      },
                      {
                        label: 'Federal Tax Credits (CTC, Child Care, Education, EITC)',
                        b: baseScenario.total_tax_credits,
                        c: confScenario.total_tax_credits,
                        p: potScenario.total_tax_credits,
                      },
                      {
                        label: 'Federal Income Tax After Credits',
                        b: baseScenario.federal_income_tax_after_credits,
                        c: confScenario.federal_income_tax_after_credits,
                        p: potScenario.federal_income_tax_after_credits,
                      },
                      {
                        label: `Estimated State Income Tax (${profile.state_code})`,
                        b: baseScenario.estimated_state_income_tax,
                        c: confScenario.estimated_state_income_tax,
                        p: potScenario.estimated_state_income_tax,
                      },
                      {
                        label: 'Total Estimated Tax Liability (Federal + SE Tax + State)',
                        b: baseScenario.total_estimated_tax_liability,
                        c: confScenario.total_estimated_tax_liability,
                        p: potScenario.total_estimated_tax_liability,
                        bold: true,
                      },
                      {
                        label: 'Real Tax Liability Savings vs. Baseline',
                        b: 0,
                        c: confScenario.savings_vs_baseline,
                        p: potScenario.savings_vs_baseline,
                        highlight: true,
                      },
                    ].map((row, idx) => (
                      <tr
                        key={idx}
                        className={
                          row.highlight
                            ? 'bg-emerald-50/90 font-extrabold text-emerald-950'
                            : row.bold
                            ? 'bg-slate-50 font-bold text-slate-900'
                            : ''
                        }
                      >
                        <td className="py-2.5 px-3">{row.label}</td>
                        <td className="py-2.5 px-3 text-right">{fmtUsd(row.b)}</td>
                        <td className="py-2.5 px-3 text-right bg-emerald-50/40 font-semibold">
                          {fmtUsd(row.c)}
                        </td>
                        <td className="py-2.5 px-3 text-right bg-amber-50/40">
                          {fmtUsd(row.p)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Deterministic Calculation Audit Trace Log */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Immutable Deterministic Calculation Trace Log
              </h3>
              <div className="space-y-2">
                {calculationRun.formula_trace.map((step, i) => (
                  <div
                    key={i}
                    className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs flex flex-wrap items-center justify-between gap-2"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{step.step}</div>
                      <div className="text-[11px] text-slate-500">
                        {step.rule_ref} • Formula: <code className="text-sky-800">{step.formula}</code>
                      </div>
                    </div>
                    <div className="font-mono font-bold text-sm text-slate-900">
                      {fmtUsd(step.result)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 6: STRUCTURED TAX OPTIMIZATION REPORT & QA ENGINE */}
        {activeTab === 'report' && (
          <div className="space-y-6">
            {/* QA Engine Verification Banner */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <ShieldCheck className="w-5 h-5 text-emerald-600" />
                    Quality Assurance Engine Gate & 8 Accuracy Metrics
                  </h2>
                  <p className="text-xs text-slate-500">
                    Every report is verified against arithmetic, duplicate, transfer/CC-repayment, and rule-version gates before display.
                  </p>
                </div>
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                  QA Gate: {payload.qa_summary.overall_status.toUpperCase()}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2 text-center">
                {Object.entries(payload.qa_summary.metrics).map(([k, val]) => (
                  <div
                    key={k}
                    className="p-2.5 rounded-lg bg-slate-50 border border-slate-200"
                  >
                    <div className="text-sm font-extrabold text-slate-900">{val}%</div>
                    <div className="text-[10px] text-slate-500 capitalize mt-0.5">
                      {k.replace(/_/g, ' ')}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {payload.qa_summary.checks.map((chk) => (
                  <div
                    key={chk.check_key}
                    className="p-2.5 rounded-lg border border-slate-200 flex items-start gap-2"
                  >
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold text-slate-900">{chk.label}</div>
                      <div className="text-[11px] text-slate-500">{chk.details}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Potential Tax Deductions & Special Regimes */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="text-base font-bold text-slate-900">
                Traceable Tax Deductions, Credits & Real Tax Savings Breakdown
              </h3>
              <p className="text-xs text-slate-600 bg-sky-50 border border-sky-200 p-3 rounded-lg">
                <strong>Crucial Distinction:</strong>{' '}
                {payload.estimated_tax_impact.important_distinction_note}
              </p>

              <div className="space-y-3">
                {[...payload.potential_tax_deductions, ...payload.tax_credits].map(
                  (rec: TaxRecommendationRecord) => {
                    const badge = EVIDENCE_BADGES[rec.status];
                    return (
                      <div
                        key={rec.id}
                        className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 transition space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-slate-900">
                              {rec.title}
                            </span>
                            <span
                              className={`px-2 py-0.5 rounded border text-[10px] font-semibold ${badge.className}`}
                            >
                              {badge.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-4 text-xs">
                            <div>
                              <span className="text-slate-500">Eligible {rec.deduction_or_credit_type}: </span>
                              <strong className="text-slate-900">
                                {fmtUsd(rec.eligible_deduction_or_credit_amount)}
                              </strong>
                            </div>
                            <div className="px-2.5 py-1 rounded bg-emerald-50 border border-emerald-200 text-emerald-900 font-bold">
                              Real Tax Savings: {fmtUsd(rec.estimated_real_tax_savings)}
                            </div>
                          </div>
                        </div>

                        <p className="text-xs text-slate-600">{rec.reasoning}</p>
                        <div className="text-[11px] text-slate-500 font-mono bg-slate-50 p-2 rounded">
                          Formula: {rec.calculation_explanation} | Citation: {rec.irs_citation}
                        </div>
                      </div>
                    );
                  }
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 7: MONETIZATION, SUBSCRIPTION & DOCUMENT EXPORT PACKAGES */}
        {activeTab === 'export' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Subscription Card ($10/mo vs Free Trial) */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-sky-700">
                    Workspace Entitlement
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                    Current: {subscription?.plan === 'pro_monthly' ? 'Pro $10/mo' : 'Free Trial'}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  AI Tax Pro Monthly Subscription — $10 / month
                </h3>
                <p className="text-xs text-slate-600">
                  Free Trial includes 1 bank statement and preliminary extraction. Pro Subscription unlocks unlimited multi-document ingestion (W-2, 1099, receipts), interactive AI Tax Interview, full 3-scenario comparison, and historical tax years.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    onClick={() => handleStripeAction('subscribe_pro')}
                    className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold transition"
                  >
                    Activate / Verify $10/mo Pro Subscription (Server Webhook)
                  </button>
                  <button
                    onClick={() => handleStripeAction('downgrade_free_trial')}
                    className="px-3 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition"
                  >
                    Switch to Free Trial (Test 1-Statement Gate)
                  </button>
                </div>
              </div>

              {/* Document Export Package Purchase ($50 / $100 / $200) */}
              <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">
                    Document Export Package Entitlement
                  </span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                      hasPaidExport
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {hasPaidExport ? 'Webhook Verified — Ready to Download' : 'Export Package Not Purchased'}
                  </span>
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Tax Preparation & Audit Workpaper Export Package
                </h3>
                <p className="text-xs text-slate-600">
                  Transparent one-time fee for the downloadable PDF, CSV, and multi-sheet XLSX Schedule C/SE workpaper package. Verified on the server via HMAC-signed Stripe webhook.
                </p>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  {[
                    {
                      tier: 'essential_50' as const,
                      price: '$50',
                      label: 'Essential Export',
                    },
                    {
                      tier: 'professional_100' as const,
                      price: '$100',
                      label: 'Pro Schedule C/SE',
                    },
                    {
                      tier: 'complete_audit_200' as const,
                      price: '$200',
                      label: 'Complete Audit Pack',
                    },
                  ].map((pkg) => (
                    <button
                      key={pkg.tier}
                      onClick={() =>
                        handleStripeAction('purchase_export_package', pkg.tier)
                      }
                      className="p-3 rounded-xl border border-slate-300 hover:border-sky-600 hover:bg-sky-50/50 text-center transition"
                    >
                      <div className="text-base font-extrabold text-slate-900">
                        {pkg.price}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-600">
                        {pkg.label}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Signed Export Download Buttons */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-sky-600" />
                Private Signed Export Package Downloads (HMAC-SHA256 Temporary Links)
              </h3>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleDownloadExport('PDF')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm"
                >
                  <Download className="w-4 h-4" />
                  Download PDF Tax Optimization Report
                </button>
                <button
                  onClick={() => handleDownloadExport('CSV')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold shadow-sm"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Download Audit-Ready Schedule C Ledger (CSV)
                </button>
                <button
                  onClick={() => handleDownloadExport('XLSX')}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold shadow-sm"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Download Multi-Sheet Workbook (XLSX)
                </button>
              </div>
            </div>

            {/* Optional Post-Download 1-5 Star Rating */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900">
                Optional Experience Rating (1–5 Stars)
              </h3>
              <p className="text-xs text-slate-500">
                Submitting a rating is completely optional and never restricts access to your tax reports or export packages.
              </p>
              <div className="flex items-center gap-2">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    onClick={() => setSelectedStars(star)}
                    className={`p-1.5 rounded ${
                      star <= selectedStars ? 'text-amber-500' : 'text-slate-300'
                    }`}
                  >
                    <Star className="w-5 h-5 fill-current" />
                  </button>
                ))}
                <input
                  type="text"
                  placeholder="Optional feedback comment..."
                  value={ratingComment}
                  onChange={(e) => setRatingComment(e.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs flex-1 max-w-md"
                />
                <button
                  onClick={handleSubmitRating}
                  className="px-4 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold"
                >
                  Submit Rating
                </button>
              </div>
              {ratings.length > 0 && (
                <div className="text-xs text-slate-500 pt-1">
                  Latest rating recorded: {ratings[0].stars}/5 stars{' '}
                  {ratings[0].comment ? `("${ratings[0].comment}")` : ''}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 8: ADMIN & COMPLIANCE CONSOLE */}
        {activeTab === 'admin' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-bold text-slate-900">
                    Staff Administration, AI Quality, Payments & Tax Rules Governance
                  </h2>
                  <p className="text-xs text-slate-500">
                    All administrative operations are recorded in the immutable audit_logs table. Raw document contents are protected by tenant isolation.
                  </p>
                </div>
                <button
                  onClick={loadAdmin}
                  className="px-3 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold flex items-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Refresh Admin Telemetry
                </button>
              </div>

              {adminData && (
                <div className="space-y-6">
                  {/* Revenue & Telemetry Cards */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-xs text-slate-500">Active Subscription MRR</div>
                      <div className="text-xl font-bold text-slate-900">
                        {fmtUsd(adminData.revenueSummary.subscriptionMrrUsd)}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-xs text-slate-500">Export Package Revenue</div>
                      <div className="text-xl font-bold text-slate-900">
                        {fmtUsd(adminData.revenueSummary.exportPackagesRevenueUsd)}
                      </div>
                    </div>
                    <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                      <div className="text-xs text-slate-500">Total Verified Platform Revenue</div>
                      <div className="text-xl font-bold text-emerald-700">
                        {fmtUsd(adminData.revenueSummary.totalRevenueUsd)}
                      </div>
                    </div>
                  </div>

                  {/* Users Table */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      1. Users & Entitlement Status
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50">
                            <th className="py-2 px-3">User</th>
                            <th className="py-2 px-3">Role</th>
                            <th className="py-2 px-3">Plan</th>
                            <th className="py-2 px-3">Account Status</th>
                            <th className="py-2 px-3">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {adminData.users.map((u, i) => (
                            <tr key={i}>
                              <td className="py-2 px-3 font-medium">
                                {String(u.full_name)} ({String(u.email)})
                              </td>
                              <td className="py-2 px-3">{String(u.role)}</td>
                              <td className="py-2 px-3">{String(u.plan || 'free_trial')}</td>
                              <td className="py-2 px-3">{String(u.status)}</td>
                              <td className="py-2 px-3">
                                <button
                                  onClick={() =>
                                    handleAdminAction('toggle_user_status', String(u.id))
                                  }
                                  className="px-2 py-1 rounded border border-slate-300 hover:bg-slate-100 text-[11px] font-semibold"
                                >
                                  Toggle Active/Block
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Versioned Tax Rules Governance */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      2. Versioned IRS Tax Rules Governance
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {adminData.taxRules.map((r, i) => (
                        <div
                          key={i}
                          className="p-3.5 rounded-lg border border-slate-200 text-xs flex items-center justify-between"
                        >
                          <div>
                            <div className="font-bold text-slate-900">
                              {String(r.version_id)} (Tax Year {String(r.tax_year)})
                            </div>
                            <div className="text-[11px] text-slate-500">
                              Last Verified: {String(r.last_verified_at)} • Status:{' '}
                              <strong className="text-emerald-700">{String(r.status)}</strong>
                            </div>
                          </div>
                          <button
                            onClick={() =>
                              handleAdminAction(
                                'verify_tax_rule_version',
                                String(r.version_id)
                              )
                            }
                            className="px-2.5 py-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold"
                          >
                            Re-Verify Rule Version
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Audit Logs */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                      3. Security & Compliance Audit Trail (PII Sanitized)
                    </h3>
                    <div className="max-h-56 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                      {adminData.auditLogs.map((log, i) => (
                        <div
                          key={i}
                          className="py-2 px-3 flex items-center justify-between"
                        >
                          <div>
                            <span className="font-mono font-semibold text-sky-800">
                              {String(log.action)}
                            </span>{' '}
                            <span className="text-slate-500">
                              on {String(log.entity_type)} ({String(log.entity_id || 'n/a')})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {String(log.created_at)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Regulatory & Legal Boundary Footer */}
      <footer className="bg-white border-t border-slate-200 mt-10 py-6 px-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="max-w-3xl space-y-1">
            <div className="font-bold text-slate-700">
              Regulatory Notice & Legal Boundaries (Section 15 Compliance)
            </div>
            <p>
              {payload.header.legal_disclaimer} All calculations use deterministic IRS rule sets ({payload.header.rule_version_id}) and distinguish between confirmed deductions and potential opportunities requiring user substantiation.
            </p>
          </div>
          <div className="text-right shrink-0">
            <div className="font-semibold text-slate-700">AI Tax Platform v2.0</div>
            <div>PostgreSQL 16 • AES-256-GCM Vault • Stripe Webhook Verified</div>
          </div>
        </div>
      </footer>
    </div>
  );
}
