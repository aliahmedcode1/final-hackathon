// Payroll math per PRD §5: Gross = 1.5 × Basic; deductions on daily rate for
// absent + unpaid days; progressive annualized tax; Net = Gross − deductions − tax.

const round2 = (x) => Math.round(x * 100) / 100;

// Annual tax (PKR) on annualized taxable income.
export function annualTax(annual) {
  if (annual <= 600000) return 0;
  if (annual <= 1200000) return 0.05 * (annual - 600000);
  if (annual <= 2400000) return 30000 + 0.15 * (annual - 1200000);
  if (annual <= 3600000) return 210000 + 0.25 * (annual - 2400000);
  return 510000 + 0.35 * (annual - 3600000);
}

export function monthlyTaxOn(taxableMonthly) {
  return round2(annualTax(taxableMonthly * 12) / 12);
}

export function computePayslip({ basic, workingDays, absentDays, unpaidDays }) {
  const gross = round2(basic * 1.5);
  const dailyRate = workingDays > 0 ? round2(gross / workingDays) : 0;
  const deductions = round2((absentDays + unpaidDays) * dailyRate);
  const taxable = Math.max(0, gross - deductions);
  const tax = monthlyTaxOn(taxable);
  const net = Math.max(0, round2(gross - deductions - tax));
  return {
    basic: round2(basic),
    gross,
    daily_rate: dailyRate,
    absent_days: absentDays,
    unpaid_days: unpaidDays,
    deductions,
    tax,
    net,
    working_days: workingDays,
  };
}
