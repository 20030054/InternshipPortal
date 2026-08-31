import ExcelJS from "exceljs";
import type { HodDashboard } from "@/server/dashboards/hod-view";

/**
 * `exceljs` — MASTER_PROMPT.md §6.1 doesn't name an XLSX library (only
 * `@react-pdf/renderer` for PDF). See docs/modules/M13.md "Scope
 * decisions" for why this one, not the more commonly reached-for
 * `xlsx`/SheetJS package.
 */
export async function buildHodDepartmentWorkbook(dashboard: HodDashboard): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SCIT Internship Portal";
  workbook.created = new Date();

  const counts = workbook.addWorksheet("Counts by state");
  counts.columns = [
    { header: "State", key: "state", width: 24 },
    { header: "Count", key: "count", width: 10 },
  ];
  for (const row of dashboard.countsByState) counts.addRow({ state: row.state, count: row.count });

  const overdue = workbook.addWorksheet("Overdue eligibility");
  overdue.columns = [
    { header: "Student", key: "studentName", width: 28 },
    { header: "Email", key: "studentEmail", width: 32 },
    { header: "Semesters completed", key: "semestersCompleted", width: 20 },
  ];
  for (const row of dashboard.overdueEligibility) overdue.addRow(row);

  const verifications = workbook.addWorksheet("Pending verifications");
  verifications.columns = [
    { header: "Student", key: "studentName", width: 28 },
    { header: "Company", key: "companyName", width: 28 },
  ];
  for (const row of dashboard.pendingVerifications) {
    verifications.addRow({ studentName: row.studentName, companyName: row.companyName ?? "" });
  }

  const deadlineMissed = workbook.addWorksheet("Deadline missed");
  deadlineMissed.columns = [{ header: "Student", key: "studentName", width: 28 }];
  for (const row of dashboard.deadlineMissed) deadlineMissed.addRow({ studentName: row.studentName });

  const waivers = workbook.addWorksheet("Waivers");
  waivers.columns = [
    { header: "Student", key: "studentName", width: 28 },
    { header: "Outcome", key: "outcome", width: 14 },
    { header: "Requested", key: "createdAt", width: 16 },
  ];
  for (const row of dashboard.waivers) {
    waivers.addRow({ studentName: row.studentName, outcome: row.outcome, createdAt: row.createdAt });
  }

  const restarts = workbook.addWorksheet("Restarts");
  restarts.columns = [
    { header: "Student", key: "studentName", width: 28 },
    { header: "Outcome", key: "outcome", width: 14 },
    { header: "Requested", key: "createdAt", width: 16 },
  ];
  for (const row of dashboard.restarts) {
    restarts.addRow({ studentName: row.studentName, outcome: row.outcome, createdAt: row.createdAt });
  }

  for (const sheet of workbook.worksheets) {
    sheet.getRow(1).font = { bold: true };
  }

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
