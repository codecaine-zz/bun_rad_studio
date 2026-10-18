import { addDays, dayOf, dayStr } from "../gen";
import { dataset, query, table, view } from "../model";

const ASOF = "2025-06-30";
const START = "2023-01-01";
const dOf = (v: unknown) => String(v).slice(0, 10);

const DEPTS: [string, string, number][] = [
  ["ED", "Emergency Department", 1], ["CARD", "Cardiology", 3], ["ONC", "Oncology", 4], ["PEDS", "Pediatrics", 2], ["ORTH", "Orthopedics", 5], ["NEUR", "Neurology", 4],
  ["ICU", "Intensive Care", 3], ["RAD", "Radiology", 1], ["SURG", "General Surgery", 5], ["OBGY", "Obstetrics and Gynecology", 2], ["PSY", "Psychiatry", 6], ["IM", "Internal Medicine", 3],
];
// ICD-10-CM style: code, description, chapter, weight
const DX: [string, string, string, number][] = [
  ["I10", "Essential (primary) hypertension", "Circulatory", 14], ["E11.9", "Type 2 diabetes mellitus without complications", "Endocrine", 11], ["J45.909", "Unspecified asthma, uncomplicated", "Respiratory", 6],
  ["J44.9", "Chronic obstructive pulmonary disease, unspecified", "Respiratory", 5], ["I25.10", "Atherosclerotic heart disease of native coronary artery", "Circulatory", 6], ["N18.3", "Chronic kidney disease, stage 3", "Genitourinary", 4],
  ["E78.5", "Hyperlipidemia, unspecified", "Endocrine", 10], ["K21.9", "Gastro-esophageal reflux disease", "Digestive", 7], ["M54.5", "Low back pain", "Musculoskeletal", 7], ["F32.9", "Major depressive disorder, single episode", "Mental", 6],
  ["F41.9", "Anxiety disorder, unspecified", "Mental", 6], ["J18.9", "Pneumonia, unspecified organism", "Respiratory", 3], ["N39.0", "Urinary tract infection, site not specified", "Genitourinary", 4], ["R07.9", "Chest pain, unspecified", "Symptoms", 5],
  ["R10.9", "Unspecified abdominal pain", "Symptoms", 4], ["S72.009A", "Fracture of unspecified part of neck of femur", "Injury", 1], ["A41.9", "Sepsis, unspecified organism", "Infectious", 2], ["I50.9", "Heart failure, unspecified", "Circulatory", 4],
  ["I48.91", "Unspecified atrial fibrillation", "Circulatory", 3], ["G43.909", "Migraine, unspecified", "Nervous", 3], ["E66.9", "Obesity, unspecified", "Endocrine", 6], ["Z00.00", "Encounter for general adult medical examination", "Factors", 6],
  ["J06.9", "Acute upper respiratory infection, unspecified", "Respiratory", 6], ["K35.80", "Unspecified acute appendicitis", "Digestive", 1], ["O80", "Encounter for full-term uncomplicated delivery", "Pregnancy", 2], ["N20.0", "Calculus of kidney", "Genitourinary", 2],
  ["L03.90", "Cellulitis, unspecified", "Skin", 2], ["R51.9", "Headache, unspecified", "Symptoms", 4], ["M17.9", "Osteoarthritis of knee, unspecified", "Musculoskeletal", 4], ["C50.919", "Malignant neoplasm of unspecified site of breast", "Neoplasms", 1],
  ["C61", "Malignant neoplasm of prostate", "Neoplasms", 1], ["I63.9", "Cerebral infarction, unspecified", "Circulatory", 1], ["D64.9", "Anemia, unspecified", "Blood", 3], ["E03.9", "Hypothyroidism, unspecified", "Endocrine", 4],
  ["G47.33", "Obstructive sleep apnea", "Nervous", 3], ["F10.20", "Alcohol dependence, uncomplicated", "Mental", 1], ["R55", "Syncope and collapse", "Symptoms", 2], ["J20.9", "Acute bronchitis, unspecified", "Respiratory", 3],
  ["K52.9", "Noninfective gastroenteritis and colitis, unspecified", "Digestive", 3], ["H66.90", "Otitis media, unspecified", "Ear", 2], ["Z23", "Encounter for immunization", "Factors", 4], ["S06.0X0A", "Concussion without loss of consciousness", "Injury", 1],
];
const PX: [string, string, number][] = [
  ["99202", "Office visit, new patient, low complexity", 95], ["99213", "Office visit, established patient, moderate", 125], ["99283", "Emergency department visit, moderate severity", 310], ["99223", "Initial hospital care, high complexity", 410],
  ["93000", "Electrocardiogram, routine, with interpretation", 70], ["71046", "Chest X-ray, 2 views", 120], ["70450", "CT head without contrast", 640], ["74177", "CT abdomen and pelvis with contrast", 1150],
  ["80053", "Comprehensive metabolic panel", 45], ["85025", "Complete blood count with differential", 32], ["36415", "Venipuncture", 12], ["81003", "Urinalysis, automated", 15],
  ["90471", "Immunization administration", 28], ["45378", "Diagnostic colonoscopy", 1350], ["43239", "Upper GI endoscopy with biopsy", 1180], ["27447", "Total knee replacement", 14500],
  ["47562", "Laparoscopic cholecystectomy", 6800], ["59400", "Vaginal delivery, routine care", 5200], ["93306", "Echocardiogram with Doppler", 520], ["97110", "Therapeutic exercise, 15 minutes", 65],
  ["96372", "Therapeutic injection", 40], ["12001", "Simple wound repair, up to 2.5 cm", 160], ["20610", "Joint injection, major joint", 210], ["76805", "Obstetric ultrasound", 230],
];
const LABS: [string, string, string, number, number][] = [
  ["2345-7", "Glucose, serum", "mg/dL", 70, 99], ["718-7", "Hemoglobin", "g/dL", 12, 17], ["6690-2", "White blood cell count", "10*3/uL", 4, 11], ["2160-0", "Creatinine", "mg/dL", 0.6, 1.3],
  ["2951-2", "Sodium", "mmol/L", 135, 145], ["2823-3", "Potassium", "mmol/L", 3.5, 5.1], ["1742-6", "ALT", "U/L", 7, 55], ["4548-4", "Hemoglobin A1c", "%", 4, 5.6],
  ["2093-3", "Total cholesterol", "mg/dL", 125, 200], ["13457-7", "LDL cholesterol", "mg/dL", 50, 100], ["2571-8", "Triglycerides", "mg/dL", 40, 150], ["3016-3", "TSH", "mIU/L", 0.4, 4],
  ["1920-8", "AST", "U/L", 8, 48], ["777-3", "Platelet count", "10*3/uL", 150, 400], ["33914-3", "eGFR", "mL/min", 60, 120], ["2085-9", "HDL cholesterol", "mg/dL", 40, 90],
  ["1975-2", "Total bilirubin", "mg/dL", 0.1, 1.2], ["6598-7", "Troponin T", "ng/L", 0, 14], ["2160-1", "BUN", "mg/dL", 7, 20], ["2028-9", "Carbon dioxide", "mmol/L", 22, 29],
];
const MEDS: [string, string, string, string][] = [
  ["Lisinopril", "10 mg tablet", "oral", "ACE inhibitor"], ["Metformin", "500 mg tablet", "oral", "Biguanide"], ["Atorvastatin", "20 mg tablet", "oral", "Statin"], ["Amlodipine", "5 mg tablet", "oral", "Calcium channel blocker"],
  ["Metoprolol", "50 mg tablet", "oral", "Beta blocker"], ["Albuterol", "90 mcg inhaler", "inhaled", "Bronchodilator"], ["Omeprazole", "20 mg capsule", "oral", "Proton pump inhibitor"], ["Sertraline", "50 mg tablet", "oral", "SSRI"],
  ["Levothyroxine", "75 mcg tablet", "oral", "Thyroid hormone"], ["Warfarin", "5 mg tablet", "oral", "Anticoagulant"], ["Apixaban", "5 mg tablet", "oral", "Anticoagulant"], ["Furosemide", "40 mg tablet", "oral", "Loop diuretic"],
  ["Gabapentin", "300 mg capsule", "oral", "Anticonvulsant"], ["Ibuprofen", "400 mg tablet", "oral", "NSAID"], ["Acetaminophen", "500 mg tablet", "oral", "Analgesic"], ["Amoxicillin", "500 mg capsule", "oral", "Penicillin antibiotic"],
  ["Azithromycin", "250 mg tablet", "oral", "Macrolide antibiotic"], ["Ceftriaxone", "1 g injection", "IV", "Cephalosporin antibiotic"], ["Vancomycin", "1 g injection", "IV", "Glycopeptide antibiotic"], ["Morphine", "4 mg injection", "IV", "Opioid"],
  ["Oxycodone", "5 mg tablet", "oral", "Opioid"], ["Ondansetron", "4 mg tablet", "oral", "Antiemetic"], ["Prednisone", "20 mg tablet", "oral", "Corticosteroid"], ["Insulin glargine", "100 unit/mL pen", "subcutaneous", "Insulin"],
  ["Heparin", "5000 unit injection", "subcutaneous", "Anticoagulant"], ["Lorazepam", "1 mg tablet", "oral", "Benzodiazepine"], ["Penicillin V", "250 mg tablet", "oral", "Penicillin antibiotic"], ["Sulfamethoxazole-trimethoprim", "800-160 mg tablet", "oral", "Sulfonamide antibiotic"],
  ["Hydrochlorothiazide", "25 mg tablet", "oral", "Thiazide diuretic"], ["Clopidogrel", "75 mg tablet", "oral", "Antiplatelet"],
];
const ALLERGENS = ["Penicillin", "Sulfamethoxazole-trimethoprim", "Latex", "Peanuts", "Shellfish", "Aspirin", "Ibuprofen", "Morphine", "Contrast dye", "Eggs", "Codeine", "Pollen"];
const PAYERS = ["Northstar Health", "Cedar Mutual", "Blue Harbor Plan", "Summit Medicare", "Atlas Medicaid Managed Care", "Meridian Commercial", "Evergreen PPO", "Self-pay"];

const p2 = (n: number) => String(n).padStart(2, "0");
function dischargeAt(g: { int(a: number, b: number): number }, admitted: string, day: string, los: number): string {
  const ah = Number(admitted.slice(11, 13));
  if (los === 0 && ah >= 23) return `${day} 23:59:59`;
  const h = los === 0 ? Math.min(23, ah + 1 + g.int(0, 2)) : g.int(9, 15);
  return `${day} ${p2(h)}:${p2(g.int(0, 59))}:${p2(g.int(0, 59))}`;
}

const patN: [number, number, number] = [150, 2000, 14000];
const encN: [number, number, number] = [500, 5000, 28000];

export default dataset({
  id: "hospital_ehr",
  title: "Hospital EHR",
  tagline: "Patients, encounters, diagnoses, procedures, orders, labs, medications, beds and scheduling.",
  description:
    "A community-hospital electronic health record: synthetic patients and insurance, outpatient / emergency / inpatient encounters, ICD-10-style diagnoses and CPT-style procedures (own descriptions), " +
    "vitals, lab orders and results with reference ranges, medication orders, allergies, bed assignments, appointments with no-shows, clinical notes and an access audit log. " +
    "Views give patient summaries, length of stay, abnormal labs, bed occupancy and readmissions. Everything is synthetic: no real patients or PHI.",
  tags: ["Healthcare", "Clinical", "Operations"],
  asOf: ASOF,
  highlights: ["ICD-10 / CPT-style codes", "30-day readmission (window LAG)", "lab reference ranges", "bed occupancy", "audit log"],
  tables: [
    table("department", "Clinical departments.", ["id id", "code str(8) uq", "name str(60)", "floor smallint"], { rows: DEPTS.map(([code, name, floor]) => ({ code, name, floor })) }),
    table("payer", "Insurance payers.", ["id id", "name str(60) uq", "payer_type enum(commercial,medicare,medicaid,self_pay)"], {
      rows: PAYERS.map((name) => ({ name, payer_type: name.includes("Medicare") ? "medicare" : name.includes("Medicaid") ? "medicaid" : name === "Self-pay" ? "self_pay" : "commercial" })),
    }),
    table("diagnosis_code", "ICD-10-CM style diagnosis subset.", ["id id", "code str(10) uq", "description str(160)", "chapter str(30)"], { rows: DX.map(([code, description, chapter]) => ({ code, description, chapter })) }),
    table("procedure_code", "CPT-style procedure subset with plain-language descriptions and a base charge.", ["id id", "code str(8) uq", "description str(120)", "base_charge dec(10,2)"], { rows: PX.map(([code, description, base_charge]) => ({ code, description, base_charge })) }),
    table("lab_test", "LOINC-style laboratory catalog with adult reference ranges.", ["id id", "loinc_code str(10) uq", "name str(60)", "unit str(12)", "ref_low dec(8,2)", "ref_high dec(8,2)"], {
      rows: LABS.map(([loinc_code, name, unit, ref_low, ref_high]) => ({ loinc_code, name, unit, ref_low, ref_high })),
    }),
    table("medication", "Medication formulary used for orders.", ["id id", "name str(60) uq", "strength_form str(40)", "route str(16)", "drug_class str(40)"], { rows: MEDS.map(([name, strength_form, route, drug_class]) => ({ name, strength_form, route, drug_class })) }),
    table("bed", "Inpatient beds.", ["id id", "department_id int fk:department", "room str(8)", "bed_label char(1)", "status enum(available,occupied,cleaning,out_of_service)"], {
      n: [48, 120, 300], uq: [["department_id", "room", "bed_label"]],
      gen: (g, i) => ({ department_id: ([2, 3, 4, 5, 6, 7, 9, 10, 11, 12][(i - 1) % 10]) as number, room: `${Math.ceil(i / 2) + 100}`, bed_label: i % 2 ? "A" : "B", status: g.w([["available", 40], ["occupied", 50], ["cleaning", 7], ["out_of_service", 3]] as const) }),
    }),
    table("provider", "Clinicians with NPI-style ids.", ["id id", "npi char(10) uq", "first_name str(40)", "last_name str(40)", "specialty str(40)", "department_id int fk:department", "license_no str(16)", "hired_on date", "is_active bool def:true"], {
      n: [24, 80, 250],
      gen: (g, i) => { const dep = ((i - 1) % 12) + 1; return { npi: g.npi(), first_name: g.first(), last_name: g.last(), specialty: DEPTS[dep - 1]![1], department_id: dep, license_no: `LIC-${g.digits(7)}`, hired_on: g.date("2005-01-01", "2024-06-01"), is_active: g.bool(0.94) }; },
    }),
    table("patient", "Synthetic patients (no real people). MRN is a medical record number.", [
      "id id", "mrn str(12) uq", "first_name str(40)", "last_name str(40)", "birth_date date", "sex enum(F,M,X)", "blood_type enum(A+,A-,B+,B-,AB+,AB-,O+,O-) null", "address str(120)", "city str(60)", "state char(2)", "zip char(5)", "phone str(16)", "preferred_language str(20)", "deceased_on date null", "created_at ts def:now", "updated_at ts upd",
    ], {
      n: patN, ix: ["last_name,first_name", "birth_date"],
      gen: (g, i) => { const p = g.place(); const age = Math.round(g.clamp(g.normal(48, 22), 0, 98)); const dec = g.bool(0.015); return { mrn: `MRN${String(i).padStart(8, "0")}`, first_name: g.first(), last_name: g.last(), birth_date: dayStr(dayOf(ASOF) - age * 365 - g.int(0, 364)), sex: g.w([["F", 52], ["M", 47], ["X", 1]] as const), blood_type: g.bool(0.85) ? g.w([["O+", 37], ["A+", 33], ["B+", 9], ["O-", 7], ["A-", 6], ["AB+", 4], ["B-", 2], ["AB-", 1]] as const) : null, address: g.street(), city: p.city, state: p.state, zip: p.zip, phone: g.phone(), preferred_language: g.w([["English", 82], ["Spanish", 12], ["Mandarin", 2], ["Vietnamese", 2], ["Other", 2]] as const), deceased_on: dec ? g.date("2023-06-01", ASOF) : null, created_at: g.ts(START) }; },
    }),
    table("patient_insurance", "Coverage a patient holds; one row can be primary.", ["id id", "patient_id int fk:patient cascade", "payer_id int fk:payer", "member_id str(16)", "is_primary bool", "effective_from date", "effective_to date null"], {
      n: [165, 2200, 15500], ix: ["patient_id,is_primary"],
      gen: (g, i) => { const first = i <= g.count("patient"); const age = 2025 - Number(dOf(g.rows("patient")[g.spread(g.count("patient"), i) - 1]!.birth_date).slice(0, 4)); return { patient_id: g.spread(g.count("patient"), i), payer_id: age >= 65 ? 4 : first ? g.w([[1, 22], [2, 16], [3, 14], [5, 14], [6, 18], [7, 10], [8, 6]] as const) : g.pick([1, 2, 3, 6]), member_id: g.hex(10).toUpperCase(), is_primary: first, effective_from: g.date("2019-01-01", "2024-12-31"), effective_to: g.bool(0.08) ? g.date("2025-01-01", ASOF) : null }; },
    }),
    table("encounter", "A visit: outpatient, emergency, inpatient, observation or telehealth.", [
      "id id", "patient_id int fk:patient", "provider_id int fk:provider", "department_id int fk:department", "encounter_type enum(outpatient,emergency,inpatient,observation,telehealth)", "admitted_at ts", "discharged_at ts null", "status enum(open,discharged,cancelled)", "chief_complaint str(120)", "disposition enum(home,admitted,transfer,left_ama,expired,home_health) null", "created_at ts def:now",
    ], {
      n: encN, ix: ["patient_id,admitted_at", "admitted_at", "department_id,encounter_type"], ck: ["discharged_at IS NULL OR discharged_at >= admitted_at"],
      gen: (g, i) => {
        const type = g.w([["outpatient", 48], ["emergency", 24], ["inpatient", 12], ["telehealth", 10], ["observation", 6]] as const);
        const day = g.seasonal(START, ASOF, [1.4, 1.3, 1.1, 1, 0.95, 0.9, 0.85, 0.85, 0.95, 1, 1.1, 1.3], [0.7, 1.2, 1.2, 1.15, 1.1, 1, 0.8]);
        const admitted = type === "emergency" ? g.ts(day, 0, 23) : g.ts(day, 7, 17);
        const los = type === "inpatient" ? Math.max(1, Math.round(g.logNormal(3.6, 0.65))) : type === "observation" ? 1 : 0;
        const dischargeDay = dayStr(dayOf(day) + los);
        const open = dischargeDay >= ASOF && (type === "inpatient" || type === "observation") && g.bool(0.7);
        const dep = type === "emergency" ? 1 : type === "inpatient" ? g.pick([2, 3, 5, 6, 7, 9, 10, 12]) : g.w([[12, 30], [2, 12], [4, 12], [5, 10], [6, 8], [11, 8], [3, 6], [10, 6], [9, 8]] as const);
        const pr = g.rows("provider").filter((p) => p.department_id === dep);
        const prov = pr.length ? g.pick(pr) : g.pick(g.rows("provider"));
        return {
          patient_id: g.fkSkew(g.count("patient"), 1.7), provider_id: prov.id, department_id: dep, encounter_type: type, admitted_at: admitted,
          discharged_at: open || dayOf(day) > dayOf(ASOF) ? null : dischargeAt(g, admitted, dischargeDay, los),
          status: open ? "open" : g.bool(0.015) ? "cancelled" : "discharged",
          chief_complaint: g.pick(["Chest pain", "Shortness of breath", "Abdominal pain", "Follow-up visit", "Fever and cough", "Back pain", "Dizziness", "Routine physical", "Medication refill", "Injury", "Headache", "Diabetes management", "Blood pressure check"]),
          disposition: open ? null : type === "inpatient" ? g.w([["home", 70], ["transfer", 10], ["home_health", 14], ["expired", 2], ["left_ama", 4]] as const) : type === "emergency" ? g.w([["home", 66], ["admitted", 24], ["transfer", 5], ["left_ama", 5]] as const) : "home",
          created_at: admitted,
        };
      },
    }),
    table("encounter_diagnosis", "Diagnoses coded for an encounter; rank 1 is primary.", ["id id", "encounter_id int fk:encounter cascade", "diagnosis_code_id int fk:diagnosis_code", "dx_rank smallint", "is_chronic bool"], {
      n: [800, 8000, 45000], uq: [["encounter_id", "diagnosis_code_id"]], ck: ["dx_rank BETWEEN 1 AND 12"],
      gen: (g, i) => {
        const enc = g.spread(g.count("encounter"), i, 1.1);
        const cnt = g.memo("c", () => new Map<number, number>());
        const k = (cnt.get(enc) ?? 0) + 1; cnt.set(enc, k);
        const used = g.memo("u", () => new Map<number, Set<number>>());
        const set = used.get(enc) ?? used.set(enc, new Set()).get(enc)!;
        let dx = g.w(DX.map((d, idx) => [idx + 1, d[3]] as const));
        for (let t = 0; t < 40 && set.has(dx); t++) dx = ((dx + t * 7) % DX.length) + 1;
        set.add(dx);
        return { encounter_id: enc, diagnosis_code_id: dx, dx_rank: Math.min(k, 12), is_chronic: ["I10", "E11.9", "J44.9", "I25.10", "N18.3", "E78.5", "I50.9", "E03.9", "G47.33"].includes(DX[dx - 1]![0]) };
      },
    }),
    table("encounter_procedure", "Procedures performed during an encounter and what was charged.", ["id id", "encounter_id int fk:encounter cascade", "procedure_code_id int fk:procedure_code", "performed_by int fk:provider", "performed_at ts", "charge dec(10,2)", "units smallint def:1"], {
      n: [400, 3500, 20000], ix: ["performed_at"],
      gen: (g, i) => { const enc = g.rows("encounter")[g.spread(g.count("encounter"), i, 1.2) - 1]!; const px = g.w(PX.map((p, idx) => [idx + 1, p[2] < 300 ? 8 : p[2] < 1000 ? 3 : 1] as const)); return { encounter_id: enc.id, procedure_code_id: px, performed_by: enc.provider_id, performed_at: g.ts(dOf(enc.admitted_at)), charge: g.round(PX[px - 1]![2] * g.float(0.9, 1.4)), units: 1 }; },
    }),
    table("vital_sign", "Vital signs recorded during encounters.", ["id id", "encounter_id int fk:encounter cascade", "recorded_at ts", "heart_rate smallint", "bp_systolic smallint", "bp_diastolic smallint", "resp_rate smallint", "temp_c dec(4,1)", "spo2 smallint", "weight_kg dec(5,1) null"], {
      n: [600, 5500, 30000], ix: ["encounter_id,recorded_at"], ck: ["spo2 BETWEEN 50 AND 100"],
      gen: (g, i) => { const enc = g.rows("encounter")[g.spread(g.count("encounter"), i, 1.1) - 1]!; const sick = enc.encounter_type === "emergency" || enc.encounter_type === "inpatient"; return { encounter_id: enc.id, recorded_at: g.ts(dOf(enc.admitted_at)), heart_rate: Math.round(g.clamp(g.normal(sick ? 92 : 76, 14), 40, 170)), bp_systolic: Math.round(g.clamp(g.normal(sick ? 138 : 126, 18), 80, 230)), bp_diastolic: Math.round(g.clamp(g.normal(sick ? 84 : 78, 11), 45, 130)), resp_rate: Math.round(g.clamp(g.normal(sick ? 20 : 16, 3), 8, 40)), temp_c: g.round(g.clamp(g.normal(sick ? 37.6 : 36.8, 0.6), 35, 41), 1), spo2: Math.round(g.clamp(g.normal(sick ? 94.5 : 97.5, 2.2), 70, 100)), weight_kg: g.bool(0.5) ? g.round(g.clamp(g.normal(80, 18), 3, 200), 1) : null }; },
    }),
    table("lab_order", "A laboratory order placed during an encounter.", ["id id", "encounter_id int fk:encounter cascade", "ordered_by int fk:provider", "ordered_at ts", "priority enum(routine,urgent,stat)", "status enum(ordered,collected,resulted,cancelled)"], {
      n: [300, 3000, 16000], ix: ["encounter_id", "ordered_at"],
      gen: (g, i) => { const enc = g.rows("encounter")[g.spread(g.count("encounter"), i, 1.3) - 1]!; const status = dOf(enc.admitted_at) > addDays(ASOF, -1) ? "collected" : g.w([["resulted", 96], ["cancelled", 4]] as const); return { encounter_id: enc.id, ordered_by: enc.provider_id, ordered_at: g.ts(dOf(enc.admitted_at)), priority: enc.encounter_type === "emergency" ? g.w([["stat", 50], ["urgent", 35], ["routine", 15]] as const) : "routine", status }; },
    }),
    table("lab_result", "Individual test results with abnormal flags.", ["id id", "lab_order_id int fk:lab_order cascade", "lab_test_id int fk:lab_test", "result_value dec(10,2)", "flag enum(normal,low,high,critical)", "resulted_at ts"], {
      n: [1000, 10000, 55000], uq: [["lab_order_id", "lab_test_id"]], ix: ["lab_test_id,flag"],
      gen: (g, i) => {
        const orders = g.count("lab_order");
        const oid = ((i - 1) % orders) + 1;
        const tid = ((Math.floor((i - 1) / orders) * 7 + oid * 3) % LABS.length) + 1;
        const [, , , lo, hi] = LABS[tid - 1]!;
        const mid = (lo + hi) / 2, sd = (hi - lo) / 3.2;
        const v = g.round(Math.max(0, g.normal(mid, sd * g.pick([1, 1, 1, 1.6]))));
        const flag = v < lo * 0.6 || v > hi * 1.8 ? "critical" : v < lo ? "low" : v > hi ? "high" : "normal";
        return { lab_order_id: oid, lab_test_id: tid, result_value: v, flag, resulted_at: g.ts(dOf(g.rows("lab_order")[oid - 1]!.ordered_at)) };
      },
    }),
    table("medication_order", "Medication orders written for an encounter.", ["id id", "encounter_id int fk:encounter cascade", "medication_id int fk:medication", "prescriber_id int fk:provider", "dose str(30)", "frequency enum(once,daily,bid,tid,qid,prn,weekly)", "start_date date", "end_date date null", "status enum(active,completed,discontinued)"], {
      n: [600, 6000, 32000], ix: ["encounter_id", "medication_id,status"],
      gen: (g, i) => { const enc = g.rows("encounter")[g.spread(g.count("encounter"), i, 1.2) - 1]!; const med = g.fkSkew(MEDS.length, 1.5); const start = dOf(enc.admitted_at); const chronic = g.bool(0.45); return { encounter_id: enc.id, medication_id: med, prescriber_id: enc.provider_id, dose: MEDS[med - 1]![1].split(" ").slice(0, 2).join(" "), frequency: g.w([["daily", 46], ["bid", 20], ["tid", 8], ["prn", 12], ["once", 8], ["weekly", 3], ["qid", 3]] as const), start_date: start, end_date: chronic ? null : addDays(start, g.int(3, 30)), status: chronic ? (start > addDays(ASOF, -400) ? "active" : "discontinued") : g.w([["completed", 70], ["discontinued", 30]] as const) }; },
    }),
    table("allergy", "Recorded patient allergies.", ["id id", "patient_id int fk:patient cascade", "allergen str(60)", "reaction str(40)", "severity enum(mild,moderate,severe)", "recorded_on date"], {
      n: [150, 1500, 9000], ix: ["patient_id"],
      gen: (g, i) => ({ patient_id: g.fkSkew(g.count("patient"), 1.5), allergen: g.pickSkew(ALLERGENS, 1.8), reaction: g.pick(["Rash", "Hives", "Anaphylaxis", "Nausea", "Swelling", "Wheezing"]), severity: g.w([["mild", 45], ["moderate", 40], ["severe", 15]] as const), recorded_on: g.date("2018-01-01", ASOF) }),
    }),
    table("bed_assignment", "Which bed an inpatient occupied and when.", ["id id", "encounter_id int fk:encounter", "bed_id int fk:bed", "assigned_at ts", "released_at ts null"], {
      n: [100, 800, 3500], ix: ["bed_id,assigned_at"],
      gen: (g, i) => { const enc = g.rows("encounter").filter((e) => e.encounter_type === "inpatient"); const e = enc[(i - 1) % enc.length]!; return { encounter_id: e.id, bed_id: g.fkSkew(g.count("bed"), 1.2), assigned_at: e.admitted_at, released_at: e.discharged_at }; },
    }),
    table("appointment", "Scheduled visits, including no-shows.", ["id id", "patient_id int fk:patient", "provider_id int fk:provider", "scheduled_at ts", "duration_min smallint", "status enum(scheduled,completed,no_show,cancelled)", "reason str(80)", "created_at ts def:now"], {
      n: [300, 3000, 16000], ix: ["scheduled_at", "provider_id,scheduled_at"],
      gen: (g) => { const day = g.seasonal("2024-07-01", "2025-09-30", [1, 1, 1, 1, 1, 1, 0.9, 0.9, 1, 1, 1, 0.9], [0, 1.3, 1.3, 1.2, 1.2, 1, 0]); const past = day <= ASOF; return { patient_id: g.fkSkew(g.count("patient"), 1.4), provider_id: g.fkSkew(g.count("provider"), 1.3), scheduled_at: g.ts(day, 8, 16), duration_min: g.pick([15, 20, 30, 30, 45, 60]), status: past ? g.w([["completed", 80], ["no_show", 11], ["cancelled", 9]] as const) : "scheduled", reason: g.pick(["Annual physical", "Follow-up", "New problem", "Lab review", "Pre-operative", "Telehealth check-in", "Vaccination"]), created_at: g.ts(addDays(day, -g.int(3, 40))) }; },
    }),
    table("clinical_note", "Signed clinical notes.", ["id id", "encounter_id int fk:encounter cascade", "author_id int fk:provider", "note_type enum(progress,discharge_summary,consult,procedure,nursing)", "body text", "signed_at ts null"], {
      n: [350, 3500, 18000],
      gen: (g, i) => { const enc = g.rows("encounter")[g.spread(g.count("encounter"), i, 1.2) - 1]!; return { encounter_id: enc.id, author_id: enc.provider_id, note_type: g.w([["progress", 50], ["nursing", 20], ["consult", 10], ["procedure", 8], ["discharge_summary", 12]] as const), body: `${g.sentence(10)} ${g.sentence(12)} Plan: ${g.words(5)}.`, signed_at: g.bool(0.93) ? g.ts(dOf(enc.admitted_at)) : null }; },
    }),
    table("access_audit", "Who opened which chart (record-access audit log).", ["id id", "provider_id int fk:provider", "patient_id int fk:patient", "action enum(view,edit,print,export)", "accessed_at ts", "workstation str(20)"], {
      n: [250, 2500, 14000], ix: ["patient_id,accessed_at"],
      gen: (g) => ({ provider_id: g.fkSkew(g.count("provider"), 1.3), patient_id: g.fkSkew(g.count("patient"), 1.5), action: g.w([["view", 80], ["edit", 14], ["print", 4], ["export", 2]] as const), accessed_at: g.tsBetween(START, ASOF), workstation: `WS-${g.int(1, 90)}` }),
    }),
  ],
  views: [
    view("v_patient_summary", "Patient demographics with active medications, allergies and last encounter.", (d) => `
SELECT p.id AS patient_id, p.mrn, ${d.concat("p.last_name", "', '", "p.first_name")} AS patient_name, p.sex,
       ${d.diffDays(d.asOf, "p.birth_date")} / 365 AS age_years,
       (SELECT COUNT(*) FROM allergy a WHERE a.patient_id = p.id) AS allergies,
       (SELECT COUNT(DISTINCT mo.medication_id) FROM medication_order mo JOIN encounter e ON e.id = mo.encounter_id WHERE e.patient_id = p.id AND mo.status = 'active') AS active_medications,
       (SELECT MAX(e.admitted_at) FROM encounter e WHERE e.patient_id = p.id) AS last_encounter_at
FROM patient p WHERE p.deceased_on IS NULL`),
    view("v_encounter_los", "Length of stay in days for discharged encounters.", (d) => `
SELECT e.id AS encounter_id, e.patient_id, dp.name AS department, e.encounter_type, e.admitted_at, e.discharged_at,
       ${d.diffDays("e.discharged_at", "e.admitted_at")} AS los_days
FROM encounter e JOIN department dp ON dp.id = e.department_id
WHERE e.discharged_at IS NOT NULL AND e.status = 'discharged'`),
    view("v_abnormal_labs", "High, low and critical results with test and patient.", () => `
SELECT lr.id AS result_id, p.mrn, lt.name AS test, lr.result_value, lt.unit, lr.flag, lr.resulted_at
FROM lab_result lr
JOIN lab_test lt ON lt.id = lr.lab_test_id
JOIN lab_order lo ON lo.id = lr.lab_order_id
JOIN encounter e ON e.id = lo.encounter_id
JOIN patient p ON p.id = e.patient_id
WHERE lr.flag <> 'normal'`),
    view("v_bed_occupancy", "Beds by department and status.", () => `
SELECT dp.name AS department, COUNT(*) AS beds,
       SUM(CASE WHEN b.status = 'occupied' THEN 1 ELSE 0 END) AS occupied,
       SUM(CASE WHEN b.status = 'available' THEN 1 ELSE 0 END) AS available
FROM bed b JOIN department dp ON dp.id = b.department_id GROUP BY dp.name`),
    view("v_readmissions", "Inpatient stays followed by another admission within 30 days of discharge.", (d) => `
SELECT patient_id, encounter_id, admitted_at, discharged_at, next_admitted_at, ${d.diffDays("next_admitted_at", "discharged_at")} AS days_to_readmit
FROM (
  SELECT e.patient_id, e.id AS encounter_id, e.admitted_at, e.discharged_at,
         LEAD(e.admitted_at) OVER (PARTITION BY e.patient_id ORDER BY e.admitted_at) AS next_admitted_at
  FROM encounter e WHERE e.encounter_type = 'inpatient' AND e.status = 'discharged'
) s
WHERE next_admitted_at IS NOT NULL AND ${d.diffDays("next_admitted_at", "discharged_at")} BETWEEN 0 AND 30`),
    view("v_provider_workload", "Encounters, procedures and charges per provider.", () => `
SELECT pr.id AS provider_id, pr.last_name, pr.specialty,
       COUNT(DISTINCT e.id) AS encounters, COUNT(ep.id) AS procedures, COALESCE(SUM(ep.charge), 0) AS charges
FROM provider pr LEFT JOIN encounter e ON e.provider_id = pr.id LEFT JOIN encounter_procedure ep ON ep.encounter_id = e.id
GROUP BY pr.id, pr.last_name, pr.specialty`),
    view("v_no_show_rate", "Appointment outcomes by month.", (d) => `
SELECT ${d.ym("scheduled_at")} AS month, COUNT(*) AS appointments,
       SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) AS no_shows,
       ${d.round("100.0 * SUM(CASE WHEN status = 'no_show' THEN 1 ELSE 0 END) / COUNT(*)", 1)} AS no_show_pct
FROM appointment WHERE status IN ('completed', 'no_show') GROUP BY ${d.ym("scheduled_at")}`),
  ],
  queries: [
    query("top_dx_by_dept", "Top diagnoses per department", "Most frequent primary diagnoses in each department (ROW_NUMBER over a 4-table join).", () => `
-- Top 3 primary diagnoses per department
SELECT department, code, description, cases FROM (
  SELECT dp.name AS department, dc.code, dc.description, COUNT(*) AS cases,
         ROW_NUMBER() OVER (PARTITION BY dp.name ORDER BY COUNT(*) DESC, dc.code) AS rn
  FROM encounter_diagnosis ed
  JOIN encounter e ON e.id = ed.encounter_id
  JOIN department dp ON dp.id = e.department_id
  JOIN diagnosis_code dc ON dc.id = ed.diagnosis_code_id
  WHERE ed.dx_rank = 1
  GROUP BY dp.name, dc.code, dc.description
) t WHERE rn <= 3 ORDER BY department, rn`),
    query("readmission_rate", "30-day readmission rate", "Share of discharged inpatient stays readmitted within 30 days, by department.", (d) => `
-- Readmissions within 30 days of discharge
SELECT dp.name AS department, COUNT(*) AS discharges, COUNT(r.encounter_id) AS readmitted,
       ${d.round("100.0 * COUNT(r.encounter_id) / COUNT(*)", 1)} AS readmit_pct
FROM encounter e
JOIN department dp ON dp.id = e.department_id
LEFT JOIN v_readmissions r ON r.encounter_id = e.id
WHERE e.encounter_type = 'inpatient' AND e.status = 'discharged'
GROUP BY dp.name ORDER BY readmit_pct DESC`),
    query("los_quartiles", "Length of stay quartiles", "Length-of-stay spread per department using NTILE.", () => `
-- Typical vs long stays: quartile boundaries per department
SELECT department, quartile, COUNT(*) AS stays, MIN(los_days) AS min_days, MAX(los_days) AS max_days
FROM (
  SELECT department, los_days, NTILE(4) OVER (PARTITION BY department ORDER BY los_days) AS quartile
  FROM v_encounter_los WHERE encounter_type = 'inpatient'
) t GROUP BY department, quartile ORDER BY department, quartile`),
    query("critical_labs", "Patients with critical results", "Latest critical results per patient, with the patient's age.", (d) => `
-- Critical lab values that need follow-up
SELECT a.mrn, a.test, a.result_value, a.unit, a.resulted_at,
       ROW_NUMBER() OVER (PARTITION BY a.mrn ORDER BY a.resulted_at DESC) AS recency
FROM v_abnormal_labs a WHERE a.flag = 'critical'
ORDER BY a.resulted_at DESC LIMIT 20`),
    query("allergy_conflicts", "Medication / allergy conflicts", "Active medication orders for drugs the patient is recorded as allergic to.", () => `
-- Safety check: ordered medication matches a recorded allergen
SELECT p.mrn, al.allergen, al.severity, m.name AS ordered_medication, mo.status, e.admitted_at
FROM medication_order mo
JOIN medication m ON m.id = mo.medication_id
JOIN encounter e ON e.id = mo.encounter_id
JOIN patient p ON p.id = e.patient_id
JOIN allergy al ON al.patient_id = p.id AND al.allergen = m.name
ORDER BY al.severity DESC, e.admitted_at DESC LIMIT 25`),
    query("ed_arrivals_by_hour", "ED arrivals by hour and weekday", "When the emergency department is busiest.", (d) => `
-- ED arrivals heat map: weekday x hour
SELECT ${d.dow("admitted_at")} AS weekday, ${d.hour("admitted_at")} AS hour, COUNT(*) AS arrivals
FROM encounter WHERE encounter_type = 'emergency'
GROUP BY ${d.dow("admitted_at")}, ${d.hour("admitted_at")}
ORDER BY arrivals DESC LIMIT 20`),
    query("comorbidity_pairs", "Common comorbidity pairs", "Diagnosis pairs that most often occur in the same encounter (self join).", () => `
-- Which diagnoses travel together?
SELECT a.code AS dx_a, b.code AS dx_b, COUNT(*) AS encounters
FROM encounter_diagnosis x
JOIN encounter_diagnosis y ON y.encounter_id = x.encounter_id AND y.diagnosis_code_id > x.diagnosis_code_id
JOIN diagnosis_code a ON a.id = x.diagnosis_code_id
JOIN diagnosis_code b ON b.id = y.diagnosis_code_id
GROUP BY a.code, b.code ORDER BY encounters DESC, a.code, b.code LIMIT 15`),
    query("polypharmacy", "Polypharmacy patients", "Patients on five or more distinct active medications (CTE).", () => `
-- Patients on 5+ active medications
WITH active AS (
  SELECT e.patient_id, COUNT(DISTINCT mo.medication_id) AS meds
  FROM medication_order mo JOIN encounter e ON e.id = mo.encounter_id
  WHERE mo.status = 'active' GROUP BY e.patient_id
)
SELECT p.mrn, p.sex, a.meds FROM active a JOIN patient p ON p.id = a.patient_id
WHERE a.meds >= 5 ORDER BY a.meds DESC, p.mrn LIMIT 20`),
    query("no_show_trend", "No-show trend", "Monthly no-show rate with the change from the previous month (LAG).", (d) => `
-- Is the no-show rate improving?
SELECT month, no_show_pct, ${d.round("no_show_pct - LAG(no_show_pct) OVER (ORDER BY month)", 1)} AS change_vs_prior
FROM v_no_show_rate ORDER BY month`),
  ],
});
