import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser } from '@/lib/security/vault-and-auth';
import {
  getFullWorkspaceState,
  recomputeTaxWorkspaceForUser,
} from '@/lib/services/workspace-service';
import { getDb, writeAuditLog } from '@/lib/db';
import { TaxYear } from '@/types/tax';

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const yearParam = req.nextUrl.searchParams.get('taxYear');
    const taxYear: TaxYear = yearParam === '2026' ? 2026 : 2025;
    const state = await getFullWorkspaceState(user.id, taxYear);
    return NextResponse.json({ ok: true, data: state });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Workspace fetch failed' },
      { status: 401 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    const body = await req.json();
    const db = await getDb();

    const taxYear: TaxYear = body.tax_year === 2026 ? 2026 : 2025;
    const now = new Date().toISOString();

    await db.query(
      `UPDATE user_profiles SET
        tax_year = COALESCE($2, tax_year),
        filing_status = COALESCE($3, filing_status),
        state_code = COALESCE($4, state_code),
        business_type = COALESCE($5, business_type),
        dependents_count = COALESCE($6, dependents_count),
        qualifying_children_under_17 = COALESCE($7, qualifying_children_under_17),
        child_care_expenses_paid = COALESCE($8, child_care_expenses_paid),
        education_expenses_paid = COALESCE($9, education_expenses_paid),
        home_total_sqft = COALESCE($10, home_total_sqft),
        home_office_sqft = COALESCE($11, home_office_sqft),
        home_office_exclusive_regular_use = COALESCE($12, home_office_exclusive_regular_use),
        home_annual_rent_or_mortgage_interest = COALESCE($13, home_annual_rent_or_mortgage_interest),
        home_annual_utilities_insurance = COALESCE($14, home_annual_utilities_insurance),
        vehicle_total_miles = COALESCE($15, vehicle_total_miles),
        vehicle_business_miles = COALESCE($16, vehicle_business_miles),
        vehicle_actual_expenses = COALESCE($17, vehicle_actual_expenses),
        self_employed_health_insurance_premiums = COALESCE($18, self_employed_health_insurance_premiums),
        sep_ira_solo_401k_contributions = COALESCE($19, sep_ira_solo_401k_contributions),
        estimated_tax_payments_made = COALESCE($20, estimated_tax_payments_made),
        has_unsupported_complex_entity = COALESCE($21, has_unsupported_complex_entity),
        unsupported_entity_notes = COALESCE($22, unsupported_entity_notes),
        updated_at = $23
      WHERE user_id = $1`,
      [
        user.id,
        body.tax_year ?? null,
        body.filing_status ?? null,
        body.state_code ?? null,
        body.business_type ?? null,
        body.dependents_count ?? null,
        body.qualifying_children_under_17 ?? null,
        body.child_care_expenses_paid ?? null,
        body.education_expenses_paid ?? null,
        body.home_total_sqft ?? null,
        body.home_office_sqft ?? null,
        body.home_office_exclusive_regular_use ?? null,
        body.home_annual_rent_or_mortgage_interest ?? null,
        body.home_annual_utilities_insurance ?? null,
        body.vehicle_total_miles ?? null,
        body.vehicle_business_miles ?? null,
        body.vehicle_actual_expenses ?? null,
        body.self_employed_health_insurance_premiums ?? null,
        body.sep_ira_solo_401k_contributions ?? null,
        body.estimated_tax_payments_made ?? null,
        body.has_unsupported_complex_entity ?? null,
        body.unsupported_entity_notes ?? null,
        now,
      ]
    );

    await writeAuditLog({
      userId: user.id,
      actorRole: 'user',
      action: 'TAX_PROFILE_UPDATED',
      entityType: 'user_profile',
      entityId: user.id,
      metadata: { taxYear, filing_status: body.filing_status, state_code: body.state_code },
    });

    await recomputeTaxWorkspaceForUser(user.id, taxYear);
    const updatedState = await getFullWorkspaceState(user.id, taxYear);

    return NextResponse.json({ ok: true, data: updatedState });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : 'Profile update failed' },
      { status: 400 }
    );
  }
}
