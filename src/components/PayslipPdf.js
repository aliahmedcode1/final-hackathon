'use client';

import { btnGhost } from './ui';

// Client-side payslip PDF via jsPDF (PRD 17).
export default function PayslipPdf({ slip, run, company }) {
  const download = async () => {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const W = doc.internal.pageSize.getWidth();
    const fmt = (n) => `PKR ${Number(n ?? 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.text(company || 'HCM Lite', W / 2, 60, { align: 'center' });
    doc.setFontSize(12);
    doc.setFont('helvetica', 'normal');
    doc.text(`Payslip — ${run?.period || ''}`, W / 2, 80, { align: 'center' });

    doc.setDrawColor(200);
    doc.line(60, 100, W - 60, 100);

    let y = 130;
    const line = (label, value, bold = false) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setFontSize(11);
      doc.text(label, 80, y);
      doc.text(String(value), W - 80, y, { align: 'right' });
      y += 22;
    };

    line('Gross salary (1.5 × basic)', fmt(slip.gross));
    line('Basic component', fmt(slip.basic));
    line('Working days', slip.working_days);
    line('Absent days', slip.absent_days);
    line('Unpaid leave days', slip.unpaid_days);
    line('Deductions (daily-rate)', `- ${fmt(slip.deductions)}`);
    line('Income tax (withheld)', `- ${fmt(slip.tax)}`);
    doc.line(60, y, W - 60, y);
    y += 26;
    line('NET PAY', fmt(slip.net), true);

    y += 40;
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text('This is a system-generated payslip from HCM Lite.', W / 2, y, { align: 'center' });

    doc.save(`payslip-${(run?.period || 'run').replace(/\s/g, '-')}.pdf`);
  };

  return (
    <button className="text-xs text-indigo-400 hover:underline" onClick={download}>⬇ PDF</button>
  );
}
