import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  CalculationRunRecord,
  ExportPurchaseRecord,
  GeneratedReportRecord,
  TransactionClassificationRecord,
  TransactionRecord,
  UserProfileRecord,
} from '@/types/tax';
import { getDb, writeAuditLog } from '@/lib/db';

export function generateExportPackageBuffer(params: {
  format: 'PDF' | 'CSV' | 'XLSX';
  profile: UserProfileRecord;
  report: GeneratedReportRecord;
  calculationRun: CalculationRunRecord;
  transactions: TransactionRecord[];
  classifications: TransactionClassificationRecord[];
}): { buffer: Buffer; mimeType: string; filename: string } {
  const { format, profile, report, calculationRun, transactions, classifications } = params;
  const clsByTxId = new Map<string, TransactionClassificationRecord>();
  classifications.forEach((c) => clsByTxId.set(c.transaction_id, c));

  const payload = report.report_payload;
  const conf = payload.tax_optimization_scenarios.confirmed;
  const base = payload.tax_optimization_scenarios.baseline;
  const pot = payload.tax_optimization_scenarios.potential;

  if (format === 'CSV') {
    const header = [
      'TransactionID',
      'Date',
      'Merchant',
      'Description_Masked',
      'Direction',
      'Amount_USD',
      'Review_Status',
      'Effective_Group',
      'Schedule_C_Category',
      'Evidence_Status',
      'Business_Use_Pct',
      'Meal_Limit_Pct',
      'Eligible_Deduction_USD',
      'Applied_Rule_Reference',
      'Source_Coordinate',
    ].join(',');

    const rows = transactions.map((tx) => {
      const cls = clsByTxId.get(tx.id);
      const busPct = cls ? cls.business_use_pct : 0;
      const mealPct = cls ? cls.meal_deduction_limit_pct : 100;
      const eligible =
        cls && cls.effective_group === 'Business expenses' && tx.review_status === 'ok'
          ? ((tx.amount * busPct * mealPct) / 10000).toFixed(2)
          : '0.00';

      return [
        tx.id,
        tx.transaction_date || 'NEEDS_REVIEW',
        `"${tx.merchant_name.replace(/"/g, '""')}"`,
        `"${tx.masked_description.replace(/"/g, '""')}"`,
        tx.direction,
        tx.amount.toFixed(2),
        tx.review_status,
        cls?.effective_group || 'Unclassified',
        cls?.schedule_c_category || 'none',
        cls?.evidence_classification || 'insufficient_data',
        busPct,
        mealPct,
        eligible,
        `"${(cls?.applied_rule_ref || '').replace(/"/g, '""')}"`,
        `"${tx.document_id}:${tx.source_line_ref}"`,
      ].join(',');
    });

    const csvContent = [header, ...rows].join('\n');
    return {
      buffer: Buffer.from(csvContent, 'utf8'),
      mimeType: 'text/csv',
      filename: `AI_Tax_${profile.tax_year}_Audit_Ready_Ledger_and_Schedule_C.csv`,
    };
  }

  if (format === 'XLSX') {
    const wb = XLSX.utils.book_new();

    const scenarioRows = [
      {
        Metric: 'W-2 Wages',
        Baseline_USD: base.w2_income,
        Confirmed_Optimized_USD: conf.w2_income,
        Potential_Unconfirmed_USD: pot.w2_income,
      },
      {
        Metric: '1099 & Schedule C Gross Receipts',
        Baseline_USD: base.form_1099_and_business_gross_income,
        Confirmed_Optimized_USD: conf.form_1099_and_business_gross_income,
        Potential_Unconfirmed_USD: pot.form_1099_and_business_gross_income,
      },
      {
        Metric: 'Total Schedule C Business Deductions',
        Baseline_USD: base.total_schedule_c_deductions,
        Confirmed_Optimized_USD: conf.total_schedule_c_deductions,
        Potential_Unconfirmed_USD: pot.total_schedule_c_deductions,
      },
      {
        Metric: 'Schedule C Net Profit',
        Baseline_USD: base.schedule_c_net_profit,
        Confirmed_Optimized_USD: conf.schedule_c_net_profit,
        Potential_Unconfirmed_USD: pot.schedule_c_net_profit,
      },
      {
        Metric: 'Schedule SE Self-Employment Tax',
        Baseline_USD: base.total_self_employment_tax,
        Confirmed_Optimized_USD: conf.total_self_employment_tax,
        Potential_Unconfirmed_USD: pot.total_self_employment_tax,
      },
      {
        Metric: 'Above-the-Line Adjustments (1/2 SE Tax, Health Ins, SEP-IRA)',
        Baseline_USD: base.total_above_the_line_adjustments,
        Confirmed_Optimized_USD: conf.total_above_the_line_adjustments,
        Potential_Unconfirmed_USD: pot.total_above_the_line_adjustments,
      },
      {
        Metric: 'Adjusted Gross Income (AGI)',
        Baseline_USD: base.adjusted_gross_income,
        Confirmed_Optimized_USD: conf.adjusted_gross_income,
        Potential_Unconfirmed_USD: pot.adjusted_gross_income,
      },
      {
        Metric: 'Standard Deduction',
        Baseline_USD: base.standard_or_itemized_deduction,
        Confirmed_Optimized_USD: conf.standard_or_itemized_deduction,
        Potential_Unconfirmed_USD: pot.standard_or_itemized_deduction,
      },
      {
        Metric: 'QBI Deduction (§199A 20%)',
        Baseline_USD: base.qbi_deduction,
        Confirmed_Optimized_USD: conf.qbi_deduction,
        Potential_Unconfirmed_USD: pot.qbi_deduction,
      },
      {
        Metric: 'Taxable Income',
        Baseline_USD: base.taxable_income,
        Confirmed_Optimized_USD: conf.taxable_income,
        Potential_Unconfirmed_USD: pot.taxable_income,
      },
      {
        Metric: 'Federal Income Tax After Credits',
        Baseline_USD: base.federal_income_tax_after_credits,
        Confirmed_Optimized_USD: conf.federal_income_tax_after_credits,
        Potential_Unconfirmed_USD: pot.federal_income_tax_after_credits,
      },
      {
        Metric: `Estimated State Income Tax (${profile.state_code})`,
        Baseline_USD: base.estimated_state_income_tax,
        Confirmed_Optimized_USD: conf.estimated_state_income_tax,
        Potential_Unconfirmed_USD: pot.estimated_state_income_tax,
      },
      {
        Metric: 'Total Estimated Tax Liability',
        Baseline_USD: base.total_estimated_tax_liability,
        Confirmed_Optimized_USD: conf.total_estimated_tax_liability,
        Potential_Unconfirmed_USD: pot.total_estimated_tax_liability,
      },
      {
        Metric: 'Real Tax Liability Savings vs. Baseline',
        Baseline_USD: 0,
        Confirmed_Optimized_USD: conf.savings_vs_baseline,
        Potential_Unconfirmed_USD: pot.savings_vs_baseline,
      },
    ];

    const wsScenarios = XLSX.utils.json_to_sheet(scenarioRows);
    XLSX.utils.book_append_sheet(wb, wsScenarios, 'Scenario_Comparison');

    const recRows = [
      ...payload.potential_tax_deductions,
      ...payload.tax_credits,
    ].map((r) => ({
      Title: r.title,
      Type: r.deduction_or_credit_type,
      Evidence_Status: r.status,
      Gross_Expenditure_USD: r.gross_amount,
      Eligible_Deduction_or_Credit_USD: r.eligible_deduction_or_credit_amount,
      Real_Tax_Savings_USD: r.estimated_real_tax_savings,
      IRS_Citation: r.irs_citation,
      Calculation: r.calculation_explanation,
    }));
    const wsRecs = XLSX.utils.json_to_sheet(recRows);
    XLSX.utils.book_append_sheet(wb, wsRecs, 'Optimization_Breakdown');

    const ledgerRows = transactions.map((tx) => {
      const cls = clsByTxId.get(tx.id);
      return {
        ID: tx.id,
        Date: tx.transaction_date || 'NEEDS_REVIEW',
        Merchant: tx.merchant_name,
        Amount_USD: tx.amount,
        Direction: tx.direction,
        Group: cls?.effective_group || '',
        Schedule_C_Category: cls?.schedule_c_category || 'none',
        Evidence: cls?.evidence_classification || '',
        Business_Use_Pct: cls?.business_use_pct ?? 0,
        Source_Ref: `${tx.document_id}:${tx.source_line_ref}`,
      };
    });
    const wsLedger = XLSX.utils.json_to_sheet(ledgerRows);
    XLSX.utils.book_append_sheet(wb, wsLedger, 'Transaction_Audit_Trail');

    const traceRows = calculationRun.formula_trace.map((f) => ({
      Step: f.step,
      Rule_Reference: f.rule_ref,
      Formula: f.formula,
      Inputs: JSON.stringify(f.inputs),
      Result_USD: f.result,
    }));
    const wsTrace = XLSX.utils.json_to_sheet(traceRows);
    XLSX.utils.book_append_sheet(wb, wsTrace, 'Deterministic_Formula_Log');

    const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return {
      buffer: xlsxBuffer,
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      filename: `AI_Tax_${profile.tax_year}_Complete_Tax_Package.xlsx`,
    };
  }

  // Default: PDF Export Package
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text(`AI Tax — ${profile.tax_year} Tax Optimization & Audit Workpaper Package`, 14, 18);
  doc.setFontSize(9);
  doc.text(
    `Generated: ${payload.header.generated_at} | Rule Engine: ${payload.header.rule_version_id} | Filing Status: ${profile.filing_status} (${profile.state_code})`,
    14,
    25
  );
  doc.text(
    `QA Verification Status: ${report.qa_status.toUpperCase()} | Confirmed Real Tax Savings: $${payload.estimated_tax_impact.confirmed_real_tax_savings.toLocaleString()}`,
    14,
    31
  );

  autoTable(doc, {
    startY: 36,
    head: [['Tax Scenario Comparison', 'Baseline ($)', 'Confirmed Optimized ($)', 'Potential Unconfirmed ($)']],
    body: [
      ['Total Gross Income (W-2 + 1099)', base.total_gross_income.toLocaleString(), conf.total_gross_income.toLocaleString(), pot.total_gross_income.toLocaleString()],
      ['Schedule C Deductions', base.total_schedule_c_deductions.toLocaleString(), conf.total_schedule_c_deductions.toLocaleString(), pot.total_schedule_c_deductions.toLocaleString()],
      ['Schedule C Net Profit', base.schedule_c_net_profit.toLocaleString(), conf.schedule_c_net_profit.toLocaleString(), pot.schedule_c_net_profit.toLocaleString()],
      ['Self-Employment Tax (Schedule SE)', base.total_self_employment_tax.toLocaleString(), conf.total_self_employment_tax.toLocaleString(), pot.total_self_employment_tax.toLocaleString()],
      ['Adjusted Gross Income (AGI)', base.adjusted_gross_income.toLocaleString(), conf.adjusted_gross_income.toLocaleString(), pot.adjusted_gross_income.toLocaleString()],
      ['QBI 20% Deduction (Form 8995)', base.qbi_deduction.toLocaleString(), conf.qbi_deduction.toLocaleString(), pot.qbi_deduction.toLocaleString()],
      ['Taxable Income', base.taxable_income.toLocaleString(), conf.taxable_income.toLocaleString(), pot.taxable_income.toLocaleString()],
      ['Total Estimated Tax Liability', base.total_estimated_tax_liability.toLocaleString(), conf.total_estimated_tax_liability.toLocaleString(), pot.total_estimated_tax_liability.toLocaleString()],
      ['Real Tax Liability Reduction vs Baseline', '0', conf.savings_vs_baseline.toLocaleString(), pot.savings_vs_baseline.toLocaleString()],
    ],
  });

  const allRecs = [...payload.potential_tax_deductions, ...payload.tax_credits];
  autoTable(doc, {
    startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8,
    head: [['Recommendation', 'Status', 'Eligible Deduction/Credit ($)', 'Real Tax Savings ($)', 'IRS Citation']],
    body: allRecs.slice(0, 14).map((r) => [
      r.title,
      r.status,
      r.eligible_deduction_or_credit_amount.toLocaleString(),
      r.estimated_real_tax_savings.toLocaleString(),
      r.irs_citation,
    ]),
  });

  const pdfArrayBuffer = doc.output('arraybuffer');
  return {
    buffer: Buffer.from(pdfArrayBuffer),
    mimeType: 'application/pdf',
    filename: `AI_Tax_${profile.tax_year}_Tax_Optimization_Report.pdf`,
  };
}
