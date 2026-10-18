import { addDays, dayOf, dayStr } from "../gen";
import { dataset, query, table, view, type Scale } from "../model";

const ASOF = "2025-06-30";
const CFG: Record<Scale, { E: number; P: number }> = { small: { E: 100, P: 6 }, medium: { E: 800, P: 10 }, large: { E: 3000, P: 12 } };
const GRADES: [string, string, number, number][] = [["G1", "Associate", 38000, 55000], ["G2", "Specialist", 52000, 78000], ["G3", "Senior Specialist", 70000, 105000], ["G4", "Lead", 92000, 135000], ["G5", "Manager", 110000, 160000], ["G6", "Senior Manager", 135000, 195000], ["G7", "Director", 165000, 240000], ["G8", "Vice President", 210000, 340000]];
const DEPTS: [string, string | null][] = [["Executive", null], ["Engineering", "Executive"], ["Product", "Executive"], ["Sales", "Executive"], ["Marketing", "Executive"], ["Finance", "Executive"], ["People Operations", "Executive"], ["Customer Success", "Sales"], ["Platform", "Engineering"], ["Mobile", "Engineering"], ["Data", "Engineering"], ["Security", "Engineering"], ["Accounting", "Finance"], ["Recruiting", "People Operations"]];
const TITLES = ["Software Engineer", "Account Executive", "Product Manager", "Data Analyst", "Accountant", "Recruiter", "Support Specialist", "Designer", "Security Analyst", "Marketing Specialist", "Operations Analyst", "Sales Development Rep"];
const LOCS: [string, string, string][] = [["HQ", "Denver", "CO"], ["East", "Boston", "MA"], ["West", "Seattle", "WA"], ["South", "Austin", "TX"], ["Remote-US", "Remote", "US"], ["Midwest", "Chicago", "IL"]];
const p2 = (n: number) => String(n).padStart(2, "0");

interface Emp { dept: number; grade: number; salary: number; hired: string; term: string | null }
const cache = new Map<Scale, Emp[]>();
// Employee facts are needed by payslips: derive them from a tiny deterministic function so both tables agree.
function emp(scale: Scale, i: number): Emp {
  let list = cache.get(scale);
  if (!list) { list = []; cache.set(scale, list); }
  const hit = list[i - 1];
  if (hit) return hit;
  const h = (k: number) => { let x = Math.imul(i * 2654435761 + k * 40503, 1274126177); x ^= x >>> 15; return (x >>> 0) / 4294967296; };
  const grade = i === 1 ? 8 : Math.min(8, 1 + Math.floor(Math.pow(h(1), 1.9) * 7.6));
  const [, , lo, hi] = GRADES[grade - 1]!;
  const salary = Math.round((lo + (hi - lo) * h(2)) / 100) * 100;
  const hired = dayStr(dayOf("2012-01-01") + Math.floor(Math.pow(h(3), 0.7) * (dayOf("2025-04-01") - dayOf("2012-01-01"))));
  const term = h(4) < 0.12 ? dayStr(dayOf(hired) + 120 + Math.floor(h(5) * (dayOf(ASOF) - dayOf(hired) - 120 > 0 ? dayOf(ASOF) - dayOf(hired) - 120 : 1))) : null;
  const e = { dept: 2 + Math.floor(h(6) * (DEPTS.length - 1)), grade, salary, hired, term: term && term <= ASOF ? term : null };
  list[i - 1] = e;
  return e;
}
const taxRate = (salary: number) => (salary > 150000 ? 0.32 : salary > 90000 ? 0.26 : salary > 50000 ? 0.2 : 0.14);

export default dataset({
  id: "hr_payroll",
  title: "HR and Payroll",
  tagline: "Org chart, compensation, payslips, benefits, leave, reviews and training.",
  description:
    "A people-operations system: a department tree and eight job grades, employees with a manager hierarchy (recursive org-chart queries), salary history, pay periods and payslips whose net pay is " +
    "computed from gross, tax and deductions, benefit enrolments, leave balances and requests, performance reviews, training completions and recruiting (requisitions and candidates). " +
    "All people and salaries are synthetic.",
  tags: ["HR", "Payroll", "Operations"],
  asOf: ASOF,
  highlights: ["manager hierarchy (recursive CTE)", "net pay generated column", "compa-ratio", "attrition", "span of control"],
  tables: [
    table("department", "Department tree.", ["id id", "parent_id int fk:department null", "name str(60) uq", "cost_center str(8) uq"], { rows: DEPTS.map(([name, parent], i) => ({ parent_id: parent ? DEPTS.findIndex((d) => d[0] === parent) + 1 : null, name, cost_center: `CC${String(100 + i * 10)}` })) }),
    table("job_grade", "Salary bands.", ["id id", "code char(2) uq", "name str(40)", "min_salary dec(10,2)", "max_salary dec(10,2)"], { rows: GRADES.map(([code, name, min_salary, max_salary]) => ({ code, name, min_salary, max_salary })), ck: ["max_salary > min_salary"] }),
    table("location", "Offices.", ["id id", "code str(12) uq", "city str(40)", "state char(2)"], { rows: LOCS.map(([code, city, state]) => ({ code, city, state })) }),
    table("employee", "Employees. manager_id points at a lower employee id (the reporting line); terminated_on marks leavers.", [
      "id id", "employee_no str(10) uq", "first_name str(40)", "last_name str(40)", "email str(120) uq", "manager_id int fk:employee null", "department_id int fk:department", "job_grade_id int fk:job_grade", "location_id int fk:location", "job_title str(60)",
      "hired_on date", "terminated_on date null", "employment_type enum(full_time,part_time,contractor)", "gender enum(F,M,X)", "birth_date date", "base_salary dec(10,2)", "created_at ts def:now", "updated_at ts upd",
    ], {
      n: [CFG.small.E, CFG.medium.E, CFG.large.E], ix: ["manager_id", "department_id,job_grade_id", "terminated_on"], ck: ["terminated_on IS NULL OR terminated_on >= hired_on"],
      gen: (g, i) => { const e = emp(g.scale, i); const f = g.first(), l = g.last(); return { employee_no: `E${String(i).padStart(7, "0")}`, first_name: f, last_name: l, email: `${f}.${l}${i}@company.example`.toLowerCase(), manager_id: i === 1 ? null : Math.max(1, Math.floor((i - 1) / 5)), department_id: i === 1 ? 1 : e.dept, job_grade_id: e.grade, location_id: g.w([[1, 28], [2, 14], [3, 16], [4, 12], [5, 22], [6, 8]] as const), job_title: e.grade >= 5 ? `${["Engineering", "Sales", "Finance", "Operations"][i % 4]} ${GRADES[e.grade - 1]![1]}` : g.pick(TITLES), hired_on: e.hired, terminated_on: e.term, employment_type: g.w([["full_time", 90], ["part_time", 6], ["contractor", 4]] as const), gender: g.w([["F", 47], ["M", 51], ["X", 2]] as const), birth_date: dayStr(dayOf(e.hired) - g.int(22, 55) * 365), base_salary: e.salary, created_at: g.ts(e.hired) }; },
    }),
    table("compensation_history", "Salary changes over time.", ["id id", "employee_id int fk:employee cascade", "effective_date date", "base_salary dec(10,2)", "reason enum(hire,merit,promotion,market_adjustment)"], {
      n: (n) => n("employee") * 2, uq: [["employee_id", "effective_date"]],
      gen: (g, i) => { const id = Math.ceil(i / 2); const e = emp(g.scale, id); return i % 2 ? { employee_id: id, effective_date: e.hired, base_salary: g.round(e.salary * g.float(0.82, 0.95), 0), reason: "hire" } : { employee_id: id, effective_date: addDays(e.hired, g.int(200, 1500) > dayOf(ASOF) - dayOf(e.hired) ? 1 : g.int(200, 1500)), base_salary: e.salary, reason: g.w([["merit", 60], ["promotion", 25], ["market_adjustment", 15]] as const) }; },
    }),
    table("pay_period", "Biweekly pay periods.", ["id id", "period_start date uq", "period_end date", "pay_date date"], {
      n: [CFG.small.P, CFG.medium.P, CFG.large.P], gen: (g, i) => { const n = (g.scale === "small" ? CFG.small.P : g.scale === "medium" ? CFG.medium.P : CFG.large.P); const start = addDays("2025-06-14", -14 * (n - i + 1)); return { period_start: start, period_end: addDays(start, 13), pay_date: addDays(start, 18) }; },
    }),
    table("payslip", "One payslip per employee and period; net_pay is computed.", ["id id", "employee_id int fk:employee", "pay_period_id int fk:pay_period", "gross_pay dec(10,2)", "tax_withheld dec(10,2)", "deductions dec(10,2)", "net_pay dec(10,2) = gross_pay - tax_withheld - deductions", "status enum(paid,void)"], {
      n: (n) => n("employee") * n("pay_period"), uq: [["employee_id", "pay_period_id"]], ix: ["pay_period_id"],
      gen: (g, i) => { const P = g.count("pay_period"); const e = Math.floor((i - 1) / P) + 1; const p = ((i - 1) % P) + 1; const em = emp(g.scale, e); const gross = g.round(em.salary / 26); const tax = g.round(gross * taxRate(em.salary)); const ded = g.round(gross * 0.06 + 40); return { employee_id: e, pay_period_id: p, gross_pay: gross, tax_withheld: tax, deductions: ded, status: "paid" }; },
    }),
    table("payslip_line", "Earning, tax and deduction lines of a payslip.", ["id id", "payslip_id int fk:payslip cascade", "line_type enum(earning,tax,deduction)", "code str(16)", "amount dec(10,2)"], {
      n: (n) => n("payslip") * 3, ix: ["payslip_id"],
      gen: (g, i) => { const ps = g.rows("payslip")[Math.ceil(i / 3) - 1]!; const k = (i - 1) % 3; return k === 0 ? { payslip_id: ps.id, line_type: "earning", code: "BASE", amount: ps.gross_pay } : k === 1 ? { payslip_id: ps.id, line_type: "tax", code: "FIT", amount: ps.tax_withheld } : { payslip_id: ps.id, line_type: "deduction", code: "BENEFITS", amount: ps.deductions }; },
    }),
    table("benefit_plan", "Benefit offerings.", ["id id", "code str(12) uq", "name str(60)", "benefit_type enum(medical,dental,vision,retirement,hsa)", "employee_cost dec(8,2)"], {
      rows: [["MED-PPO", "Medical PPO", "medical", 120], ["MED-HDHP", "Medical HDHP", "medical", 60], ["DENTAL", "Dental", "dental", 18], ["VISION", "Vision", "vision", 7], ["401K", "401(k) with match", "retirement", 0], ["HSA", "Health savings account", "hsa", 0]].map(([code, name, benefit_type, employee_cost]) => ({ code, name, benefit_type, employee_cost })),
    }),
    table("benefit_enrollment", "Which employee is enrolled in which benefit.", ["id id", "employee_id int fk:employee cascade", "benefit_plan_id int fk:benefit_plan", "enrolled_on date", "coverage enum(employee,employee_spouse,family)"], {
      n: (n) => n("employee") * 3, uq: [["employee_id", "benefit_plan_id"]], gen: (g, i) => ({ employee_id: Math.ceil(i / 3), benefit_plan_id: [g.pick([1, 2]), 3 + ((i + Math.ceil(i / 3)) % 2), 5][(i - 1) % 3]!, enrolled_on: g.date("2023-01-01", "2025-01-01"), coverage: g.w([["employee", 50], ["employee_spouse", 20], ["family", 30]] as const) }),
    }),
    table("leave_type", "Types of leave.", ["id id", "code str(12) uq", "name str(40)", "annual_days dec(5,1)"], { rows: [["VACATION", "Vacation", 20], ["SICK", "Sick leave", 10], ["PARENTAL", "Parental leave", 60], ["BEREAVE", "Bereavement", 5], ["UNPAID", "Unpaid leave", 0]].map(([code, name, annual_days]) => ({ code, name, annual_days })) }),
    table("leave_request", "Time-off requests.", ["id id", "employee_id int fk:employee", "leave_type_id int fk:leave_type", "start_date date", "end_date date", "days dec(4,1)", "status enum(pending,approved,rejected,cancelled)", "approver_id int fk:employee null"], {
      n: [200, 2400, 9000], ix: ["employee_id,start_date"], ck: ["end_date >= start_date"],
      gen: (g, i) => { const type = g.w([[1, 62], [2, 28], [3, 3], [4, 3], [5, 4]] as const); const days = type === 3 ? g.int(20, 60) : Math.max(1, Math.round(g.logNormal(type === 1 ? 4 : 2, 0.6))); const start = g.date("2024-07-01", "2025-09-30"); const emp1 = g.fkSkew(g.count("employee"), 1); return { employee_id: emp1, leave_type_id: type, start_date: start, end_date: addDays(start, Math.round(days * 1.2)), days, status: start > ASOF ? g.w([["pending", 40], ["approved", 60]] as const) : g.w([["approved", 90], ["rejected", 6], ["cancelled", 4]] as const), approver_id: Math.max(1, Math.floor((emp1 - 1) / 5)) }; },
    }),
    table("performance_review", "Annual reviews.", ["id id", "employee_id int fk:employee cascade", "review_year smallint", "reviewer_id int fk:employee", "rating smallint", "comments text"], {
      n: (n) => n("employee") * 2, uq: [["employee_id", "review_year"]], ck: ["rating BETWEEN 1 AND 5"],
      gen: (g, i) => { const id = Math.ceil(i / 2); return { employee_id: id, review_year: i % 2 ? 2023 : 2024, reviewer_id: Math.max(1, Math.floor((id - 1) / 5)), rating: g.w([[1, 3], [2, 10], [3, 45], [4, 31], [5, 11]] as const), comments: g.sentence(12) }; },
    }),
    table("training_course", "Training catalog.", ["id id", "title str(80)", "hours dec(4,1)", "is_mandatory bool"], { rows: ["Security awareness", "Code of conduct", "Harassment prevention", "Data privacy", "Leadership essentials", "SQL for analysts", "Presentation skills", "Project management", "First aid", "Accessibility basics"].map((title, i) => ({ title, hours: [1, 1, 2, 1.5, 12, 8, 4, 16, 6, 3][i], is_mandatory: i < 4 })) }),
    table("training_completion", "Completed trainings.", ["id id", "employee_id int fk:employee cascade", "course_id int fk:training_course", "completed_on date", "score smallint null"], {
      n: (n) => n("employee") * 3, uq: [["employee_id", "course_id"]], gen: (g, i) => ({ employee_id: Math.ceil(i / 3), course_id: ((i - 1) % 3) * 3 + 1 + (Math.ceil(i / 3) % 3), completed_on: g.date("2023-01-01", ASOF), score: g.bool(0.7) ? g.int(65, 100) : null }),
    }),
    table("job_requisition", "Open and filled positions.", ["id id", "department_id int fk:department", "job_title str(60)", "job_grade_id int fk:job_grade", "status enum(open,filled,cancelled)", "opened_on date", "closed_on date null"], {
      n: [15, 80, 300], gen: (g) => { const open = g.bool(0.35); const o = g.date("2024-09-01", ASOF); return { department_id: g.int(2, DEPTS.length), job_title: g.pick(TITLES), job_grade_id: g.int(1, 6), status: open ? "open" : g.w([["filled", 85], ["cancelled", 15]] as const), opened_on: o, closed_on: open ? null : addDays(o, g.int(20, 90) > dayOf(ASOF) - dayOf(o) ? 1 : g.int(20, 90)) }; },
    }),
    table("candidate", "Applicants for requisitions.", ["id id", "requisition_id int fk:job_requisition cascade", "first_name str(40)", "last_name str(40)", "source enum(referral,job_board,agency,career_site)", "stage enum(applied,screen,interview,offer,hired,rejected)", "applied_on date"], {
      n: [60, 800, 3500], gen: (g, i) => ({ requisition_id: g.spread(g.count("job_requisition"), i, 1.4), first_name: g.first(), last_name: g.last(), source: g.w([["career_site", 35], ["job_board", 35], ["referral", 20], ["agency", 10]] as const), stage: g.w([["applied", 25], ["screen", 20], ["interview", 18], ["offer", 6], ["hired", 6], ["rejected", 25]] as const), applied_on: g.date("2024-09-01", ASOF) }),
    }),
  ],
  views: [
    view("v_org_chart", "Reporting tree with depth and management path (recursive).", (d) => `
WITH RECURSIVE chain (id, manager_id, depth, path) AS (
  SELECT id, manager_id, 0, ${d.dialect === "mysql" ? "CAST(id AS CHAR(255))" : d.cast("id", "text")} FROM employee WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.manager_id, c.depth + 1, ${d.concat("c.path", "'>'", d.cast("e.id", "text"))} FROM employee e JOIN chain c ON e.manager_id = c.id
)
SELECT c.id AS employee_id, c.manager_id, c.depth, c.path, e.job_title FROM chain c JOIN employee e ON e.id = c.id`),
    view("v_headcount_by_dept", "Active headcount and payroll cost per department.", () => `
SELECT d.name AS department, COUNT(*) AS headcount, SUM(e.base_salary) AS annual_base_cost, MIN(e.hired_on) AS earliest_hire
FROM employee e JOIN department d ON d.id = e.department_id WHERE e.terminated_on IS NULL GROUP BY d.name`),
    view("v_payroll_by_period", "Gross, tax, deductions and net per pay period.", () => `
SELECT pp.period_start, pp.pay_date, COUNT(*) AS payslips, SUM(ps.gross_pay) AS gross, SUM(ps.tax_withheld) AS tax, SUM(ps.deductions) AS deductions, SUM(ps.net_pay) AS net
FROM payslip ps JOIN pay_period pp ON pp.id = ps.pay_period_id GROUP BY pp.period_start, pp.pay_date`),
    view("v_compa_ratio", "Salary relative to the midpoint of the employee's band.", (d) => `
SELECT e.id AS employee_id, e.job_title, jg.code AS grade, e.base_salary, ${d.round("e.base_salary / ((jg.min_salary + jg.max_salary) / 2.0)", 2)} AS compa_ratio
FROM employee e JOIN job_grade jg ON jg.id = e.job_grade_id WHERE e.terminated_on IS NULL`),
    view("v_leave_balance", "Approved leave days taken in 2025 against the annual allowance.", () => `
SELECT e.id AS employee_id, lt.name AS leave_type, lt.annual_days, COALESCE(SUM(lr.days), 0) AS days_taken, lt.annual_days - COALESCE(SUM(lr.days), 0) AS days_left
FROM employee e CROSS JOIN leave_type lt
LEFT JOIN leave_request lr ON lr.employee_id = e.id AND lr.leave_type_id = lt.id AND lr.status = 'approved' AND lr.start_date >= '2025-01-01'
WHERE e.terminated_on IS NULL GROUP BY e.id, lt.name, lt.annual_days`),
    view("v_attrition_by_month", "Terminations per month.", (d) => `
SELECT ${d.ym("terminated_on")} AS month, COUNT(*) AS leavers FROM employee WHERE terminated_on IS NOT NULL GROUP BY ${d.ym("terminated_on")}`),
  ],
  queries: [
    query("span_of_control", "Span of control", "Managers ranked by direct reports and total organization size (recursive CTE).", () => `
-- How big is each manager's organization?
WITH RECURSIVE org (root_id, id) AS (
  SELECT id, id FROM employee
  UNION ALL
  SELECT o.root_id, e.id FROM employee e JOIN org o ON e.manager_id = o.id
)
SELECT m.employee_no, m.job_title,
       (SELECT COUNT(*) FROM employee r WHERE r.manager_id = m.id) AS direct_reports,
       COUNT(o.id) - 1 AS total_org
FROM employee m JOIN org o ON o.root_id = m.id
GROUP BY m.id, m.employee_no, m.job_title
HAVING COUNT(o.id) > 1 ORDER BY total_org DESC, m.employee_no LIMIT 15`),
    query("salary_bands", "Salary distribution by grade", "Quartile bounds of base salary inside each job grade (NTILE).", () => `
-- Pay spread per grade
SELECT grade, quartile, COUNT(*) AS employees, MIN(base_salary) AS min_salary, MAX(base_salary) AS max_salary
FROM (SELECT jg.code AS grade, e.base_salary, NTILE(4) OVER (PARTITION BY jg.code ORDER BY e.base_salary) AS quartile
      FROM employee e JOIN job_grade jg ON jg.id = e.job_grade_id WHERE e.terminated_on IS NULL) t
GROUP BY grade, quartile ORDER BY grade, quartile`),
    query("pay_gap", "Pay by gender within grade", "Average base salary by gender in each grade (a pay-equity screen).", (d) => `
-- Pay-equity screen: grade-for-grade averages
SELECT jg.code AS grade, e.gender, COUNT(*) AS employees, ${d.round("AVG(e.base_salary)")} AS avg_salary
FROM employee e JOIN job_grade jg ON jg.id = e.job_grade_id WHERE e.terminated_on IS NULL AND e.gender IN ('F', 'M')
GROUP BY jg.code, e.gender ORDER BY jg.code, e.gender`),
    query("attrition", "Attrition by tenure", "Leavers by tenure band at termination.", (d) => `
-- When do people leave?
SELECT CASE WHEN ${d.diffDays("terminated_on", "hired_on")} < 365 THEN '< 1 year' WHEN ${d.diffDays("terminated_on", "hired_on")} < 1095 THEN '1-3 years' WHEN ${d.diffDays("terminated_on", "hired_on")} < 1825 THEN '3-5 years' ELSE '5+ years' END AS tenure_band,
       COUNT(*) AS leavers
FROM employee WHERE terminated_on IS NOT NULL
GROUP BY CASE WHEN ${d.diffDays("terminated_on", "hired_on")} < 365 THEN '< 1 year' WHEN ${d.diffDays("terminated_on", "hired_on")} < 1095 THEN '1-3 years' WHEN ${d.diffDays("terminated_on", "hired_on")} < 1825 THEN '3-5 years' ELSE '5+ years' END ORDER BY leavers DESC`),
    query("payroll_variance", "Payroll variance by period", "Net pay per period with the change from the previous period (LAG).", (d) => `
-- Payroll run-to-run variance
SELECT period_start, ${d.round("net")} AS net, ${d.round("net - LAG(net) OVER (ORDER BY period_start)")} AS change_vs_prior
FROM v_payroll_by_period ORDER BY period_start`),
    query("review_vs_pay", "Review rating vs compa-ratio", "Does performance drive pay position? Average compa-ratio by rating.", (d) => `
-- Pay for performance check
SELECT pr.rating, COUNT(*) AS reviews, ${d.round("AVG(cr.compa_ratio)", 2)} AS avg_compa_ratio
FROM performance_review pr JOIN v_compa_ratio cr ON cr.employee_id = pr.employee_id WHERE pr.review_year = 2024 GROUP BY pr.rating ORDER BY pr.rating`),
    query("mandatory_training", "Mandatory training gaps", "Active employees who have not completed each mandatory course (anti-join).", () => `
-- Compliance gaps
SELECT tc.title, COUNT(*) AS employees_missing
FROM employee e CROSS JOIN training_course tc
WHERE e.terminated_on IS NULL AND tc.is_mandatory
  AND NOT EXISTS (SELECT 1 FROM training_completion t WHERE t.employee_id = e.id AND t.course_id = tc.id)
GROUP BY tc.title ORDER BY employees_missing DESC`),
    query("hiring_funnel", "Hiring funnel by source", "Candidates by source and stage with the hire rate.", (d) => `
-- Which recruiting channel works?
SELECT source, COUNT(*) AS candidates, SUM(CASE WHEN stage = 'hired' THEN 1 ELSE 0 END) AS hired, ${d.round("100.0 * SUM(CASE WHEN stage = 'hired' THEN 1 ELSE 0 END) / COUNT(*)", 1)} AS hire_pct
FROM candidate GROUP BY source ORDER BY hire_pct DESC`),
  ],
});
