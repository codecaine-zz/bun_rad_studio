/**
 * Medicare Part D formulary builder (flagship sample).
 *
 * SYNTHETIC. Plan, contract, member and pharmacy identifiers, prices, rules and utilization are generated. The drug names are real
 * generic and brand names used only as a realistic catalog; tiers, coverage rules and costs are invented and do NOT describe any
 * real plan, formulary or CMS file. The table layouts follow the spirit of the CMS Part D formulary, plan information, beneficiary
 * cost and pharmacy network files so tooling can be tried against realistic shapes.
 */
import { dataset, query, table, view, type Row, type Scale } from "../model";
import { addDays, dayOf, dayStr } from "../gen";
import { CITIES } from "../words";

const ASOF = "2025-06-30";

// ---------------------------------------------------------------------------------------------- drug catalog
const CATEGORIES: Record<string, string> = {
  AN: "Analgesics", AX: "Antianxiety Agents", AC: "Anticonvulsants", AD: "Antidementia Agents", DP: "Antidepressants", AP: "Antipsychotics",
  BG: "Blood Glucose Regulators", CV: "Cardiovascular Agents", BM: "Blood Products and Modifiers", AB: "Antibacterials", AV: "Antivirals",
  AF: "Antifungals", NE: "Antineoplastics", RS: "Respiratory Tract/Pulmonary Agents", GI: "Gastrointestinal Agents", GU: "Genitourinary Agents",
  HO: "Hormonal Agents", IM: "Immunological Agents", MR: "Skeletal Muscle Relaxants", BN: "Metabolic Bone Disease Agents", GT: "Antigout Agents",
  PK: "Antiparkinson Agents", AM: "Antimigraine Agents", SL: "Sleep Disorder Agents", CN: "Central Nervous System Agents", DT: "Dermatological Agents",
  OP: "Ophthalmic Agents", EL: "Electrolytes/Minerals/Metals/Vitamins", DE: "Dependence Treatment Agents",
};

// generic | brand | category | class | form | strengths (/ separated, unit last) | DEA | flags (P=PA, S=step therapy, Q=quantity limit, B=Part B vs D, X=biologic, C=specialty) | tier hint
const DRUG_SRC = `
oxycodone hydrochloride|Roxicodone|AN|Opioid Analgesics, Short-Acting|tablet|5/10/15/30 mg|CII|PQ|2
hydrocodone bitartrate and acetaminophen|Norco|AN|Opioid Analgesics, Short-Acting|tablet|5-325/7.5-325/10-325 mg|CII|PQ|2
morphine sulfate extended-release|MS Contin|AN|Opioid Analgesics, Long-Acting|tablet|15/30/60/100 mg|CII|PQ|2
tramadol hydrochloride|Ultram|AN|Opioid Analgesics, Short-Acting|tablet|50 mg|CIV|Q|1
fentanyl transdermal|Duragesic|AN|Opioid Analgesics, Long-Acting|patch|12/25/50/75 mcg/hr|CII|PQ|3
ibuprofen|Motrin|AN|NSAIDs|tablet|400/600/800 mg||Q|1
meloxicam|Mobic|AN|NSAIDs|tablet|7.5/15 mg|||1
naproxen|Naprosyn|AN|NSAIDs|tablet|250/375/500 mg|||1
celecoxib|Celebrex|AN|NSAIDs|capsule|100/200 mg|||2
diclofenac sodium|Voltaren|AN|NSAIDs|tablet|50/75 mg|||2
alprazolam|Xanax|AX|Benzodiazepines|tablet|0.25/0.5/1/2 mg|CIV|Q|1
lorazepam|Ativan|AX|Benzodiazepines|tablet|0.5/1/2 mg|CIV|Q|1
buspirone hydrochloride|BuSpar|AX|Antianxiety Agents, Other|tablet|5/10/15 mg|||1
gabapentin|Neurontin|AC|Anticonvulsants, Other|capsule|100/300/400 mg||Q|1
lamotrigine|Lamictal|AC|Anticonvulsants, Other|tablet|25/100/150/200 mg|||1
levetiracetam|Keppra|AC|Anticonvulsants, Other|tablet|250/500/750 mg|||1
topiramate|Topamax|AC|Anticonvulsants, Other|tablet|25/50/100 mg|||1
carbamazepine|Tegretol|AC|Anticonvulsants, Other|tablet|200 mg|||2
lacosamide|Vimpat|AC|Anticonvulsants, Other|tablet|50/100/150/200 mg|CV|S|4
pregabalin|Lyrica|AC|Anticonvulsants, Other|capsule|25/50/75/150 mg|CV|Q|2
donepezil hydrochloride|Aricept|AD|Cholinesterase Inhibitors|tablet|5/10/23 mg|||1
memantine hydrochloride|Namenda|AD|NMDA Receptor Antagonists|tablet|5/10 mg|||1
sertraline hydrochloride|Zoloft|DP|SSRIs|tablet|25/50/100 mg|||1
escitalopram|Lexapro|DP|SSRIs|tablet|5/10/20 mg|||1
fluoxetine|Prozac|DP|SSRIs|capsule|10/20/40 mg|||1
citalopram|Celexa|DP|SSRIs|tablet|20/40 mg|||1
paroxetine|Paxil|DP|SSRIs|tablet|10/20/30/40 mg|||1
venlafaxine extended-release|Effexor XR|DP|SNRIs|capsule|37.5/75/150 mg|||1
duloxetine|Cymbalta|DP|SNRIs|capsule|20/30/60 mg|||2
bupropion extended-release|Wellbutrin XL|DP|Antidepressants, Other|tablet|150/300 mg|||2
trazodone hydrochloride|Desyrel|DP|Antidepressants, Other|tablet|50/100/150 mg|||1
mirtazapine|Remeron|DP|Antidepressants, Other|tablet|15/30/45 mg|||1
vortioxetine|Trintellix|DP|Antidepressants, Other|tablet|5/10/20 mg||S|4
quetiapine fumarate|Seroquel|AP|Antipsychotics, Atypical|tablet|25/50/100/200/300 mg|||1
aripiprazole|Abilify|AP|Antipsychotics, Atypical|tablet|2/5/10/15 mg|||2
risperidone|Risperdal|AP|Antipsychotics, Atypical|tablet|0.5/1/2 mg|||1
olanzapine|Zyprexa|AP|Antipsychotics, Atypical|tablet|5/10/15 mg|||1
lurasidone hydrochloride|Latuda|AP|Antipsychotics, Atypical|tablet|20/40/80 mg|||3
metformin hydrochloride|Glucophage|BG|Biguanides|tablet|500/850/1000 mg|||1
glipizide|Glucotrol|BG|Sulfonylureas|tablet|5/10 mg|||1
glimepiride|Amaryl|BG|Sulfonylureas|tablet|1/2/4 mg|||1
pioglitazone|Actos|BG|Thiazolidinediones|tablet|15/30/45 mg|||1
sitagliptin|Januvia|BG|DPP-4 Inhibitors|tablet|25/50/100 mg||Q|3
linagliptin|Tradjenta|BG|DPP-4 Inhibitors|tablet|5 mg|||3
empagliflozin|Jardiance|BG|SGLT2 Inhibitors|tablet|10/25 mg||S|3
dapagliflozin|Farxiga|BG|SGLT2 Inhibitors|tablet|5/10 mg||S|3
semaglutide|Ozempic|BG|GLP-1 Receptor Agonists|inj|0.25-0.5/1/2 mg/dose||PSQ|3
dulaglutide|Trulicity|BG|GLP-1 Receptor Agonists|inj|0.75/1.5/3/4.5 mg/0.5 mL||PSQ|3
insulin glargine|Lantus|BG|Insulins|inj|100 unit/mL||B|6
insulin lispro|Humalog|BG|Insulins|inj|100 unit/mL||B|6
insulin aspart|Novolog|BG|Insulins|inj|100 unit/mL||B|6
lisinopril|Zestril|CV|ACE Inhibitors|tablet|5/10/20/40 mg|||1
enalapril maleate|Vasotec|CV|ACE Inhibitors|tablet|2.5/5/10/20 mg|||1
losartan potassium|Cozaar|CV|Angiotensin II Receptor Antagonists|tablet|25/50/100 mg|||1
valsartan|Diovan|CV|Angiotensin II Receptor Antagonists|tablet|80/160/320 mg|||1
olmesartan medoxomil|Benicar|CV|Angiotensin II Receptor Antagonists|tablet|20/40 mg|||2
amlodipine besylate|Norvasc|CV|Calcium Channel Blockers|tablet|2.5/5/10 mg|||1
diltiazem hydrochloride|Cardizem CD|CV|Calcium Channel Blockers|capsule|120/180/240 mg|||2
metoprolol succinate|Toprol-XL|CV|Beta-Adrenergic Blocking Agents|tablet|25/50/100/200 mg|||1
metoprolol tartrate|Lopressor|CV|Beta-Adrenergic Blocking Agents|tablet|25/50 mg|||1
carvedilol|Coreg|CV|Beta-Adrenergic Blocking Agents|tablet|3.125/6.25/12.5/25 mg|||1
atenolol|Tenormin|CV|Beta-Adrenergic Blocking Agents|tablet|25/50/100 mg|||1
propranolol hydrochloride|Inderal|CV|Beta-Adrenergic Blocking Agents|tablet|10/20/40 mg|||1
hydrochlorothiazide|Microzide|CV|Diuretics, Thiazide|capsule|12.5 mg|||1
chlorthalidone|Thalitone|CV|Diuretics, Thiazide|tablet|25 mg|||1
furosemide|Lasix|CV|Diuretics, Loop|tablet|20/40/80 mg|||1
spironolactone|Aldactone|CV|Diuretics, Potassium-Sparing|tablet|25/50/100 mg|||1
atorvastatin calcium|Lipitor|CV|HMG CoA Reductase Inhibitors|tablet|10/20/40/80 mg|||1
rosuvastatin calcium|Crestor|CV|HMG CoA Reductase Inhibitors|tablet|5/10/20/40 mg|||1
simvastatin|Zocor|CV|HMG CoA Reductase Inhibitors|tablet|10/20/40 mg|||1
pravastatin sodium|Pravachol|CV|HMG CoA Reductase Inhibitors|tablet|20/40/80 mg|||1
ezetimibe|Zetia|CV|Cholesterol Absorption Inhibitors|tablet|10 mg|||2
fenofibrate|Tricor|CV|Fibric Acid Derivatives|tablet|48/145 mg|||2
clonidine hydrochloride|Catapres|CV|Alpha-Adrenergic Agonists|tablet|0.1/0.2/0.3 mg|||1
hydralazine hydrochloride|Apresoline|CV|Vasodilators|tablet|25/50 mg|||1
isosorbide mononitrate|Imdur|CV|Nitrates|tablet|30/60/120 mg|||1
amiodarone hydrochloride|Pacerone|CV|Antiarrhythmics|tablet|100/200/400 mg|||2
digoxin|Lanoxin|CV|Cardiac Glycosides|tablet|0.125/0.25 mg|||2
sacubitril and valsartan|Entresto|CV|Angiotensin Receptor-Neprilysin Inhibitors|tablet|24-26/49-51/97-103 mg||S|3
ranolazine|Ranexa|CV|Antianginal Agents|tablet|500/1000 mg|||3
warfarin sodium|Coumadin|BM|Anticoagulants|tablet|1/2/5/10 mg|||1
apixaban|Eliquis|BM|Anticoagulants|tablet|2.5/5 mg|||3
rivaroxaban|Xarelto|BM|Anticoagulants|tablet|10/15/20 mg|||3
dabigatran etexilate|Pradaxa|BM|Anticoagulants|capsule|75/150 mg|||3
clopidogrel|Plavix|BM|Platelet Aggregation Inhibitors|tablet|75 mg|||1
ticagrelor|Brilinta|BM|Platelet Aggregation Inhibitors|tablet|60/90 mg|||3
amoxicillin|Amoxil|AB|Penicillins|capsule|250/500 mg|||1
amoxicillin and clavulanate potassium|Augmentin|AB|Penicillins|tablet|500-125/875-125 mg|||1
azithromycin|Zithromax|AB|Macrolides|tablet|250/500 mg|||1
cephalexin|Keflex|AB|Cephalosporins|capsule|250/500 mg|||1
cefuroxime axetil|Ceftin|AB|Cephalosporins|tablet|250/500 mg|||2
ciprofloxacin|Cipro|AB|Quinolones|tablet|250/500/750 mg|||1
levofloxacin|Levaquin|AB|Quinolones|tablet|250/500/750 mg|||1
doxycycline hyclate|Vibramycin|AB|Tetracyclines|tablet|100 mg|||1
sulfamethoxazole and trimethoprim|Bactrim DS|AB|Sulfonamides|tablet|800-160 mg|||1
nitrofurantoin|Macrobid|AB|Antibacterials, Other|capsule|100 mg|||1
metronidazole|Flagyl|AB|Antibacterials, Other|tablet|250/500 mg|||1
clindamycin hydrochloride|Cleocin|AB|Antibacterials, Other|capsule|150/300 mg|||1
valacyclovir|Valtrex|AV|Antiherpetic Agents|tablet|500/1000 mg|||1
acyclovir|Zovirax|AV|Antiherpetic Agents|tablet|400/800 mg|||1
oseltamivir phosphate|Tamiflu|AV|Anti-influenza Agents|capsule|30/45/75 mg|||2
bictegravir, emtricitabine and tenofovir alafenamide|Biktarvy|AV|HIV Antivirals|tablet|50-200-25 mg||C|5
dolutegravir|Tivicay|AV|HIV Antivirals|tablet|50 mg||C|5
sofosbuvir and velpatasvir|Epclusa|AV|Hepatitis C Antivirals|tablet|400-100 mg||PC|5
fluconazole|Diflucan|AF|Antifungals|tablet|50/100/150/200 mg|||1
terbinafine|Lamisil|AF|Antifungals|tablet|250 mg|||1
anastrozole|Arimidex|NE|Aromatase Inhibitors|tablet|1 mg|||1
letrozole|Femara|NE|Aromatase Inhibitors|tablet|2.5 mg|||1
tamoxifen citrate|Nolvadex|NE|Estrogen Receptor Antagonists|tablet|10/20 mg|||1
abiraterone acetate|Zytiga|NE|Antiandrogens|tablet|250/500 mg||PC|5
imatinib mesylate|Gleevec|NE|Kinase Inhibitors|tablet|100/400 mg||C|5
lenalidomide|Revlimid|NE|Antineoplastics, Other|capsule|5/10/15/25 mg||PC|5
enzalutamide|Xtandi|NE|Antiandrogens|capsule|40 mg||PC|5
ibrutinib|Imbruvica|NE|Kinase Inhibitors|capsule|140 mg||PC|5
palbociclib|Ibrance|NE|Kinase Inhibitors|capsule|75/100/125 mg||PC|5
methotrexate|Trexall|NE|Antimetabolites|tablet|2.5 mg||B|2
albuterol sulfate|ProAir HFA|RS|Beta-Adrenergic Agonists|inhaler|90 mcg/actuation|||1
albuterol sulfate inhalation solution|AccuNeb|RS|Beta-Adrenergic Agonists|nebs|2.5 mg/3 mL||B|2
fluticasone propionate and salmeterol|Advair Diskus|RS|Inhaled Corticosteroid Combinations|inhaler|100-50/250-50/500-50 mcg|||3
budesonide and formoterol|Symbicort|RS|Inhaled Corticosteroid Combinations|inhaler|80-4.5/160-4.5 mcg||S|3
tiotropium bromide|Spiriva HandiHaler|RS|Anticholinergics|inhaler|18 mcg|||3
ipratropium bromide solution|Atrovent|RS|Anticholinergics|nebs|0.5 mg/2.5 mL||B|2
montelukast sodium|Singulair|RS|Leukotriene Modulators|tablet|10 mg|||1
fluticasone propionate nasal|Flonase|RS|Nasal Steroids|nasal|50 mcg/spray|||1
budesonide inhalation suspension|Pulmicort Respules|RS|Inhaled Corticosteroids|nebs|0.25/0.5 mg/2 mL||B|2
omeprazole|Prilosec|GI|Proton Pump Inhibitors|capsule|20/40 mg|||1
pantoprazole sodium|Protonix|GI|Proton Pump Inhibitors|tablet|20/40 mg|||1
esomeprazole magnesium|Nexium|GI|Proton Pump Inhibitors|capsule|20/40 mg|||2
famotidine|Pepcid|GI|Histamine-2 Receptor Antagonists|tablet|20/40 mg|||1
ondansetron|Zofran|GI|Antiemetics|tablet|4/8 mg||BQ|1
mesalamine|Lialda|GI|Bowel Disease Agents|tablet|1.2 g|||3
dicyclomine hydrochloride|Bentyl|GI|Antispasmodics, Gastrointestinal|tablet|20 mg|||1
tamsulosin hydrochloride|Flomax|GU|Benign Prostatic Hypertrophy Agents|capsule|0.4 mg|||1
finasteride|Proscar|GU|Benign Prostatic Hypertrophy Agents|tablet|5 mg|||1
oxybutynin chloride|Ditropan XL|GU|Antispasmodics, Urinary|tablet|5/10/15 mg|||1
solifenacin succinate|Vesicare|GU|Antispasmodics, Urinary|tablet|5/10 mg|||2
mirabegron|Myrbetriq|GU|Antispasmodics, Urinary|tablet|25/50 mg||S|3
levothyroxine sodium|Synthroid|HO|Thyroid Agents|tablet|25/50/75/88/100/112/125/137/150 mcg|||1
liothyronine sodium|Cytomel|HO|Thyroid Agents|tablet|5/25/50 mcg|||2
prednisone|Deltasone|HO|Glucocorticoids|tablet|5/10/20 mg|||1
methylprednisolone|Medrol|HO|Glucocorticoids|tablet|4 mg|||1
estradiol|Estrace|HO|Estrogens|tablet|0.5/1/2 mg|||2
medroxyprogesterone acetate|Provera|HO|Progestins|tablet|5/10 mg|||2
testosterone cypionate|Depo-Testosterone|HO|Androgens|im|200 mg/mL|CIII|PQ|2
adalimumab|Humira|IM|Immunological Agents, Other|inj|40 mg/0.4 mL||PXC|5
etanercept|Enbrel|IM|Immunological Agents, Other|inj|50 mg/mL||PXC|5
ustekinumab|Stelara|IM|Immunological Agents, Other|inj|45/90 mg/mL||PXC|5
secukinumab|Cosentyx|IM|Immunological Agents, Other|inj|150 mg/mL||PXC|5
apremilast|Otezla|IM|Immunological Agents, Other|tablet|30 mg||PC|5
tofacitinib|Xeljanz|IM|Immunological Agents, Other|tablet|5/10 mg||PSC|5
tacrolimus|Prograf|IM|Immunosuppressants|capsule|0.5/1/5 mg||B|2
mycophenolate mofetil|CellCept|IM|Immunosuppressants|tablet|250/500 mg||B|2
hydroxychloroquine sulfate|Plaquenil|IM|Immunological Agents, Other|tablet|200 mg|||1
leflunomide|Arava|IM|Immunological Agents, Other|tablet|10/20 mg|||2
cyclobenzaprine hydrochloride|Flexeril|MR|Skeletal Muscle Relaxants|tablet|5/10 mg|||1
methocarbamol|Robaxin|MR|Skeletal Muscle Relaxants|tablet|500/750 mg|||1
baclofen|Lioresal|MR|Skeletal Muscle Relaxants|tablet|10/20 mg|||1
tizanidine|Zanaflex|MR|Skeletal Muscle Relaxants|tablet|2/4 mg|||1
alendronate sodium|Fosamax|BN|Bisphosphonates|tablet|35/70 mg|||1
denosumab|Prolia|BN|Metabolic Bone Disease Agents, Other|inj|60 mg/mL||PXC|5
allopurinol|Zyloprim|GT|Antigout Agents|tablet|100/300 mg|||1
colchicine|Colcrys|GT|Antigout Agents|tablet|0.6 mg|||2
carbidopa and levodopa|Sinemet|PK|Antiparkinson Agents|tablet|10-100/25-100/25-250 mg|||1
ropinirole|Requip|PK|Antiparkinson Agents|tablet|0.25/0.5/1 mg|||1
pramipexole dihydrochloride|Mirapex|PK|Antiparkinson Agents|tablet|0.125/0.25/0.5 mg|||1
rasagiline|Azilect|PK|Antiparkinson Agents|tablet|0.5/1 mg|||2
sumatriptan|Imitrex|AM|Triptans|tablet|25/50/100 mg||Q|2
rizatriptan benzoate|Maxalt|AM|Triptans|tablet|5/10 mg||Q|2
zolpidem tartrate|Ambien|SL|Sleep Disorder Agents|tablet|5/10 mg|CIV|Q|1
eszopiclone|Lunesta|SL|Sleep Disorder Agents|tablet|1/2/3 mg|CIV|Q|2
methylphenidate extended-release|Concerta|CN|CNS Stimulants|tablet|18/27/36/54 mg|CII|Q|3
amphetamine mixed salts|Adderall|CN|CNS Stimulants|tablet|5/10/20/30 mg|CII|Q|2
dimethyl fumarate|Tecfidera|CN|Multiple Sclerosis Agents|capsule|120/240 mg||PC|5
riluzole|Rilutek|CN|Amyotrophic Lateral Sclerosis Agents|tablet|50 mg|||2
buprenorphine and naloxone|Suboxone|DE|Opioid Dependence Treatments|film|2-0.5/8-2 mg|CIII|Q|2
naltrexone hydrochloride|Revia|DE|Opioid Dependence Treatments|tablet|50 mg|||2
varenicline|Chantix|DE|Smoking Cessation Agents|tablet|0.5/1 mg|||2
clobetasol propionate|Temovate|DT|Dermatological Agents, Topical Steroids|topical|0.05 %|||1
mupirocin|Bactroban|DT|Dermatological Agents, Topical Anti-infectives|topical|2 %|||1
latanoprost|Xalatan|OP|Ophthalmic Prostaglandins|ophth|0.005 %|||1
timolol maleate|Timoptic|OP|Ophthalmic Beta-Blockers|ophth|0.25/0.5 %|||1
brimonidine tartrate|Alphagan P|OP|Ophthalmic Alpha-Agonists|ophth|0.1/0.15 %|||2
potassium chloride extended-release|K-Dur|EL|Electrolytes/Minerals/Metals/Vitamins|tablet|10/20 mEq|||1
cyanocobalamin|Vitamin B12|EL|Electrolytes/Minerals/Metals/Vitamins|im|1000 mcg/mL|||1
calcitriol|Rocaltrol|EL|Electrolytes/Minerals/Metals/Vitamins|capsule|0.25/0.5 mcg|||2
sildenafil citrate|Revatio|CV|Pulmonary Antihypertensives|tablet|20 mg||P|2
ambrisentan|Letairis|CV|Pulmonary Antihypertensives|tablet|5/10 mg||PC|5
`;

interface Ingredient { id: number; generic: string; brand: string; cat: string; cls: string; form: string; strengths: string[]; unit: string; dea: string | null; flags: string; hint: number }
const INGREDIENTS: Ingredient[] = DRUG_SRC.trim().split("\n").map((line, i) => {
  if (line.split("|").length !== 9) throw new Error(`Bad drug line: ${line}`);
  const [generic, brand, cat, cls, form, strengths, dea, flags, hint] = line.split("|") as [string, string, string, string, string, string, string, string, string];
  const m = strengths.match(/^(.*?)\s+(\S+(?:\/\S+)?)$/);
  const parts = (m ? m[1]! : strengths).split("/");
  return { id: i + 1, generic, brand, cat, cls, form, strengths: parts, unit: m ? m[2]! : "", dea: dea || null, flags: flags || "", hint: Number(hint) };
});
const CAT_KEYS = Object.keys(CATEGORIES);
const CLASSES = [...new Map(INGREDIENTS.map((x) => [`${x.cat}|${x.cls}`, { cat: x.cat, cls: x.cls }])).values()];
const FORMS: [string, string][] = [["tablet", "Tablet"], ["capsule", "Capsule"], ["inj", "Injection, solution / pen"], ["im", "Injection, intramuscular"], ["inhaler", "Inhalation aerosol / powder"], ["nebs", "Inhalation solution"], ["topical", "Topical cream / ointment"], ["ophth", "Ophthalmic solution"], ["patch", "Transdermal patch"], ["film", "Sublingual film"], ["nasal", "Nasal spray"]];
const ROUTES: [string, string][] = [["oral", "Oral"], ["subcutaneous", "Subcutaneous"], ["intramuscular", "Intramuscular"], ["inhalation", "Inhalation"], ["topical", "Topical"], ["ophthalmic", "Ophthalmic"], ["transdermal", "Transdermal"], ["sublingual", "Sublingual"], ["nasal", "Nasal"]];
const FORM_ROUTE: Record<string, string> = { tablet: "oral", capsule: "oral", inj: "subcutaneous", im: "intramuscular", inhaler: "inhalation", nebs: "inhalation", topical: "topical", ophth: "ophthalmic", patch: "transdermal", film: "sublingual", nasal: "nasal" };
const DEA_CODES = ["CII", "CIII", "CIV", "CV"];

interface Concept { id: number; ing: Ingredient; strength: string; rxcui: number }
const CONCEPTS: Concept[] = [];
for (const ing of INGREDIENTS) for (const s of ing.strengths) CONCEPTS.push({ id: CONCEPTS.length + 1, ing, strength: `${s} ${ing.unit}`.trim(), rxcui: 197000 + CONCEPTS.length * 37 + ing.id });
const D = CONCEPTS.length;

// ---------------------------------------------------------------------------------------------- scale configuration
interface Cfg { F: number; V: number; P: number; C: number; SP: number; N: number; PH: number; M: number; CL: number; EX: number; AU: number }
const CFG: Record<Scale, Cfg> = {
  small: { F: 3, V: 3, P: 12, C: 5, SP: 3, N: 3, PH: 60, M: 300, CL: 1500, EX: 80, AU: 150 },
  medium: { F: 5, V: 4, P: 40, C: 12, SP: 5, N: 4, PH: 300, M: 4000, CL: 20000, EX: 900, AU: 3000 },
  large: { F: 8, V: 5, P: 120, C: 24, SP: 8, N: 6, PH: 1200, M: 30000, CL: 220000, EX: 8000, AU: 20000 },
};
const FORM_YEARS = [2025, 2026, 2024, 2025, 2026, 2025, 2024, 2025];

function hh(a: number, b: number, c: number): number {
  let x = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(c, 2147483629)) | 0;
  x = Math.imul(x ^ (x >>> 13), 1274126177);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

const UM_RULES: { code: string; type: string; name: string; criteria: string }[] = [
  { code: "PA-GENERAL", type: "PA", name: "Prior authorization - general", criteria: "Prescriber submits diagnosis and prior therapies; approved for 12 months when the indication is medically accepted." },
  { code: "PA-SPECIALTY", type: "PA", name: "Prior authorization - specialty", criteria: "Confirmed diagnosis by a specialist, baseline labs on file, and no concurrent therapy with a duplicate mechanism." },
  { code: "PA-OPIOID", type: "PA", name: "Prior authorization - opioids", criteria: "Opioid-naive members require documented trial of a non-opioid; cumulative morphine milligram equivalents reviewed." },
  { code: "PA-GLP1", type: "PA", name: "Prior authorization - GLP-1 agonists", criteria: "Type 2 diabetes diagnosis with A1c recorded in the last 90 days; not approved for weight management alone." },
  { code: "ST-GROUP", type: "ST", name: "Step therapy", criteria: "Member must have tried the step 1 drug(s) of the assigned step-therapy group before this drug is covered." },
  { code: "QL-STANDARD", type: "QL", name: "Quantity limit - standard", criteria: "Maximum quantity per days supply as listed on the drug; larger quantities need an exception." },
  { code: "QL-OPIOID-MME", type: "QL", name: "Quantity limit - opioid MME", criteria: "Daily dose limited to 90 morphine milligram equivalents; first fill limited to 7 days." },
  { code: "AGE-ADULT", type: "AGE", name: "Age limit - adults", criteria: "Covered for members 18 years and older." },
  { code: "GENDER-F", type: "GENDER", name: "Gender limit - female", criteria: "Covered for female members." },
  { code: "BVD-GENERAL", type: "BVD", name: "Part B versus Part D determination", criteria: "Coverage depends on setting and use; the pharmacy submits a B-vs-D determination before Part D payment." },
  { code: "BVD-IMMUNOSUPPRESSANT", type: "BVD", name: "B vs D - immunosuppressants", criteria: "Part B when the member had a Medicare-covered transplant; otherwise Part D." },
  { code: "HRM-ELDERLY", type: "AGE", name: "High-risk medication in the elderly", criteria: "Soft edit: pharmacist reviews use in members 65 and older." },
];
const UM_ID = new Map(UM_RULES.map((r, i) => [r.code, i + 1]));
const UM_TYPES = [["PA", "Prior authorization"], ["ST", "Step therapy"], ["QL", "Quantity limit"], ["AGE", "Age restriction"], ["GENDER", "Gender restriction"], ["BVD", "Part B vs D determination"]] as const;

const STEP_GROUPS: { name: string; cat: string; desc: string }[] = [
  { name: "Type 2 diabetes - first line", cat: "BG", desc: "Metformin first, then sulfonylurea or DPP-4, before SGLT2 / GLP-1 agents." },
  { name: "Depression - generic first", cat: "DP", desc: "Two generic antidepressants before newer branded agents." },
  { name: "Hypertension and heart failure", cat: "CV", desc: "ACE inhibitor or ARB before combination neprilysin inhibitors." },
  { name: "Epilepsy - add-on therapy", cat: "AC", desc: "Established anticonvulsants before newer add-on agents." },
  { name: "COPD and asthma controllers", cat: "RS", desc: "Single-agent controller before combination inhalers." },
  { name: "Overactive bladder", cat: "GU", desc: "Oxybutynin before newer antimuscarinics and beta-3 agonists." },
  { name: "Psoriasis and arthritis biologics", cat: "IM", desc: "Conventional DMARD trial before targeted agents." },
  { name: "Anticoagulation", cat: "BM", desc: "Warfarin or preferred DOAC before other agents." },
  { name: "Migraine", cat: "AM", desc: "Generic triptan before alternatives." },
  { name: "Gastro-intestinal", cat: "GI", desc: "H2 blocker or generic PPI first." },
  { name: "HIV and hepatitis antivirals", cat: "AV", desc: "Genotype-guided regimen; resistance test on file." },
  { name: "Generic first (default)", cat: "", desc: "Default step group: a generic in the same class must have been tried." },
];

// ---------------------------------------------------------------------------------------------- formulary plan (deterministic structure)
interface FD { id: number; version: number; f: number; j: number; drug: number; tier: number; pa: boolean; st: boolean; ql: boolean; qlAmt: number; qlDays: number; isNew: boolean; um: number[]; sg: number | null }
interface VersionRow { id: number; f: number; j: number; status: string; effective: string; year: number }
interface Change { version: number; drug: number; type: string; oldV: string | null; newV: string | null }
interface Plan {
  cfg: Cfg; versions: VersionRow[]; fds: FD[]; start: Map<number, number>; len: Map<number, number>; changes: Change[];
  planYear: number[]; planForm: number[]; publishedOf: Map<number, number>;
}
const planCache = new Map<Scale, Plan>();

function statusFor(year: number, j: number, V: number): string {
  if (year === 2024) return j < V ? "retired" : "published";
  if (year === 2025) return j < V - 1 ? "retired" : j === V - 1 ? "published" : "in_review";
  return ["approved", "in_review", "draft", "draft", "draft"][j - 1] ?? "draft";
}

function hintTier(ing: Ingredient, f: number, d: number): number {
  let t = ing.hint;
  if (t >= 2 && t <= 4 && hh(f, d, 3) < 0.14) t += hh(f, d, 4) < 0.5 ? -1 : 1;
  return Math.max(1, Math.min(t === 6 ? 6 : 5, t));
}

function buildPlan(scale: Scale): Plan {
  const hit = planCache.get(scale);
  if (hit) return hit;
  const cfg = CFG[scale];
  const versions: VersionRow[] = [];
  const fds: FD[] = [];
  const start = new Map<number, number>();
  const len = new Map<number, number>();
  const changes: Change[] = [];
  const planYear: number[] = [];
  const planForm: number[] = [];
  const publishedOf = new Map<number, number>();
  const catGroup = new Map<string, number>();
  STEP_GROUPS.forEach((g, i) => { if (g.cat) catGroup.set(g.cat, i + 1); });
  for (let f = 1; f <= cfg.F; f++) {
    const year = FORM_YEARS[f - 1]!;
    const coverage = 0.82 + 0.12 * hh(f, 0, 1);
    let prev = new Map<number, FD>();
    for (let j = 1; j <= cfg.V; j++) {
      const vid = (f - 1) * cfg.V + j;
      const status = statusFor(year, j, cfg.V);
      versions.push({ id: vid, f, j, status, year, effective: addDays(`${year}-01-01`, (j - 1) * 75) });
      if (status === "published") publishedOf.set(f, vid);
      start.set(vid, fds.length);
      const cur = new Map<number, FD>();
      for (const c of CONCEPTS) {
        const d = c.id;
        if (hh(f, d, 2) >= coverage) continue;
        const addedIn = hh(f, d, 5) < 0.86 ? 1 : 2 + Math.floor(hh(f, d, 6) * (cfg.V - 1));
        const removedIn = hh(f, d, 7) < 0.04 ? 2 + Math.floor(hh(f, d, 9) * (cfg.V - 1)) : cfg.V + 1;
        if (j < addedIn || j >= removedIn) continue;
        const ing = c.ing;
        let tier = hintTier(ing, f, d);
        if (ing.hint !== 6 && ing.hint > 1 && hh(f, d, 10) < 0.07 && j >= 2 + Math.floor(hh(f, d, 11) * (cfg.V - 1))) tier = Math.max(1, Math.min(5, tier + (hh(f, d, 12) < 0.5 ? 1 : -1)));
        const fl = ing.flags;
        let pa = fl.includes("P") ? hh(f, d, 13) < 0.88 : hh(f, d, 13) < 0.015;
        if (!pa && hh(f, d, 14) < 0.04 && j >= 2) pa = true;
        const st = fl.includes("S") ? hh(f, d, 15) < 0.85 : hh(f, d, 15) < 0.01;
        const ql = fl.includes("Q") ? hh(f, d, 16) < 0.92 : hh(f, d, 16) < 0.03;
        const opioid = ing.cls.startsWith("Opioid Analgesics");
        const qlDays = ing.hint >= 5 ? 30 : (hh(f, d, 17) < 0.6 ? 30 : 90);
        const qlAmt = opioid ? 120 : ing.form === "inj" ? 4 : ing.form === "inhaler" ? 2 : 30 * (qlDays / 30) * (1 + Math.floor(hh(f, d, 18) * 2));
        const fd: FD = {
          id: fds.length + 1, version: vid, f, j, drug: d, tier, pa, st, ql, qlAmt, qlDays, isNew: j > 1 && !prev.has(d), um: [], sg: null,
        };
        if (pa) fd.um.push(UM_ID.get(opioid ? "PA-OPIOID" : ing.cat === "NE" || ing.hint === 5 ? "PA-SPECIALTY" : ing.cls === "GLP-1 Receptor Agonists" ? "PA-GLP1" : "PA-GENERAL")!);
        if (st) { fd.um.push(UM_ID.get("ST-GROUP")!); fd.sg = catGroup.get(ing.cat) ?? STEP_GROUPS.length; }
        if (ql) fd.um.push(UM_ID.get(opioid ? "QL-OPIOID-MME" : "QL-STANDARD")!);
        if (ing.flags.includes("B")) fd.um.push(UM_ID.get(ing.cls === "Immunosuppressants" ? "BVD-IMMUNOSUPPRESSANT" : "BVD-GENERAL")!);
        if (ing.cls === "CNS Stimulants") fd.um.push(UM_ID.get("AGE-ADULT")!);
        if (ing.cls === "Estrogens" || ing.cls === "Progestins") fd.um.push(UM_ID.get("GENDER-F")!);
        if (ing.cls === "Benzodiazepines" || ing.generic === "zolpidem tartrate") fd.um.push(UM_ID.get("HRM-ELDERLY")!);
        fds.push(fd);
        cur.set(d, fd);
      }
      len.set(vid, fds.length - start.get(vid)!);
      if (j > 1) {
        for (const [d, fd] of cur) {
          const p = prev.get(d);
          if (!p) changes.push({ version: vid, drug: d, type: "ADD", oldV: null, newV: `Tier ${fd.tier}` });
          else {
            if (p.tier !== fd.tier) changes.push({ version: vid, drug: d, type: "TIER_CHANGE", oldV: `Tier ${p.tier}`, newV: `Tier ${fd.tier}` });
            if (!p.pa && fd.pa) changes.push({ version: vid, drug: d, type: "UM_ADDED", oldV: null, newV: "PA" });
            if (p.pa && !fd.pa) changes.push({ version: vid, drug: d, type: "UM_REMOVED", oldV: "PA", newV: null });
          }
        }
        for (const [d, p] of prev) if (!cur.has(d)) changes.push({ version: vid, drug: d, type: "REMOVE", oldV: `Tier ${p.tier}`, newV: null });
      }
      prev = cur;
    }
  }
  for (let p = 1; p <= cfg.P; p++) {
    const f = ((p - 1) % cfg.F) + 1;
    planForm.push(f);
    planYear.push(FORM_YEARS[f - 1]!);
  }
  const plan = { cfg, versions, fds, start, len, changes, planYear, planForm, publishedOf };
  planCache.set(scale, plan);
  return plan;
}

const reviewCount = (s: string) => (s === "draft" ? 0 : s === "in_review" ? 2 : s === "approved" ? 3 : 4);

interface CostRow { plan: number; phase: number; tier: number; channel: number; days: number }
const costCache = new Map<Scale, CostRow[]>();
function costPlan(scale: Scale): CostRow[] {
  let rows = costCache.get(scale);
  if (rows) return rows;
  rows = [];
  const pl = buildPlan(scale);
  for (let p = 1; p <= pl.cfg.P; p++) {
    const phases = pl.planYear[p - 1]! >= 2025 ? [1, 2, 4] : [1, 2, 3, 4];
    for (const ph of phases) for (let ch = 1; ch <= 4; ch++) for (let tier = 1; tier <= 6; tier++) for (const days of [30, 90]) {
      if (days === 90 && tier > 4) continue;
      rows.push({ plan: p, phase: ph, tier, channel: ch, days });
    }
  }
  costCache.set(scale, rows);
  return rows;
}

const sc = (s: Scale) => buildPlan(s);
const scaleOf = (n: (t: string) => number): Scale => (n("plan") === CFG.small.P ? "small" : n("plan") === CFG.medium.P ? "medium" : "large");
const by = <T>(arr: [T, T, T]) => arr;

const SPONSORS = ["Northstar Health Partners", "Cedar Valley Care", "Meridian Senior Health", "Atlas Mutual Rx", "Blue Harbor Medicare", "Summit Pharmacy Benefit", "Evergreen Health Plans", "Pioneer Rx Alliance"];
const REGIONS = ["New England", "NY and NJ", "Mid-Atlantic", "Southeast Atlantic", "Florida", "Ohio Valley", "Great Lakes", "Deep South", "Texas and Oklahoma", "Mountain and Plains"];
const COPAY: Record<number, [number[], number]> = { 1: [[0, 0, 1, 2], 0], 2: [[5, 8, 10, 12], 0], 3: [[35, 40, 42, 47], 0], 4: [[90, 95, 100, 100], 0], 5: [[0, 0, 0, 0], 0.25], 6: [[0, 5, 10, 11], 0] };

export default dataset({
  id: "medicare_formulary",
  title: "Medicare Part D Formulary Builder",
  tagline: "Formulary versions, tiers, utilization management, cost sharing, pharmacy networks and CMS-style export staging.",
  description:
    "A formulary-management system for a Medicare Part D sponsor: plan years and contracts, plans (H0000-001 style ids), formularies with a draft / in review / approved / published workflow, " +
    "a drug catalog of about 450 clinical drug concepts (generic and brand names, RxNorm-style RXCUI ids, NDC-style product codes, USP-style categories and classes, DEA schedules), " +
    "six tiers with cost sharing by benefit phase, pharmacy channel and days supply (legacy coverage-gap model for 2024 and the current out-of-pocket-cap model for 2025+), " +
    "prior authorization, step-therapy groups, quantity and age/gender limits, B-vs-D rules, pharmacy networks, claims, exceptions and appeals, a change log and audit trail, and staging tables in the spirit of the CMS formulary, plan information and beneficiary cost file layouts. " +
    "SYNTHETIC DATA: real drug names are used only as a catalog; plan, contract, member and pharmacy ids, prices, rules and utilization are generated and are not CMS data.",
  tags: ["Healthcare", "Pharmacy", "Medicare", "Flagship"],
  asOf: ASOF,
  highlights: ["version workflow + status triggers", "immutable published versions", "tier-change report (LAG)", "step-therapy chains", "CMS-style staging tables", "materialized view (PostgreSQL)"],
  tables: [
    table("plan_year", "Benefit years and their cost-sharing model (legacy coverage gap through 2024, out-of-pocket cap from 2025). Illustrative values.", [
      "id id", "plan_year smallint uq", "benefit_model enum(legacy_gap,oop_cap) # legacy_gap has an initial-coverage limit and coverage gap; oop_cap has a hard annual out-of-pocket cap",
      "standard_deductible dec(8,2)", "initial_coverage_limit dec(10,2) null", "oop_threshold dec(10,2)", "insulin_copay_cap dec(6,2)", "starts_on date", "ends_on date",
    ], { rows: [
      { plan_year: 2023, benefit_model: "legacy_gap", standard_deductible: 505, initial_coverage_limit: 4660, oop_threshold: 7400, insulin_copay_cap: 35, starts_on: "2023-01-01", ends_on: "2023-12-31" },
      { plan_year: 2024, benefit_model: "legacy_gap", standard_deductible: 545, initial_coverage_limit: 5030, oop_threshold: 8000, insulin_copay_cap: 35, starts_on: "2024-01-01", ends_on: "2024-12-31" },
      { plan_year: 2025, benefit_model: "oop_cap", standard_deductible: 590, initial_coverage_limit: null, oop_threshold: 2000, insulin_copay_cap: 35, starts_on: "2025-01-01", ends_on: "2025-12-31" },
      { plan_year: 2026, benefit_model: "oop_cap", standard_deductible: 615, initial_coverage_limit: null, oop_threshold: 2100, insulin_copay_cap: 35, starts_on: "2026-01-01", ends_on: "2026-12-31" },
    ] }),
    table("therapeutic_category", "USP-style therapeutic categories.", ["id id", "code char(2) uq", "name str(80) uq"], {
      rows: CAT_KEYS.map((k) => ({ code: k, name: CATEGORIES[k]! })),
    }),
    table("therapeutic_class", "Pharmacologic classes within a category.", [
      "id id", "category_id int fk:therapeutic_category", "name str(100)",
    ], { uq: [["category_id", "name"]], rows: CLASSES.map((c) => ({ category_id: CAT_KEYS.indexOf(c.cat) + 1, name: c.cls })) }),
    table("dosage_form", "Dosage forms.", ["id id", "code str(12) uq", "name str(40)"], { rows: FORMS.map(([code, name]) => ({ code, name })) }),
    table("drug_route", "Routes of administration.", ["id id", "code str(16) uq", "name str(30)"], { rows: ROUTES.map(([code, name]) => ({ code, name })) }),
    table("tier", "Tier definitions shared by all formularies (CMS tier levels 1-6).", [
      "id id", "tier_level smallint uq", "name str(40)", "short_label str(8)", "is_specialty bool", "description text",
    ], { rows: [
      { tier_level: 1, name: "Preferred Generic", short_label: "T1", is_specialty: false, description: "Lowest-cost generics." },
      { tier_level: 2, name: "Generic", short_label: "T2", is_specialty: false, description: "Other generic drugs." },
      { tier_level: 3, name: "Preferred Brand", short_label: "T3", is_specialty: false, description: "Brand drugs the plan prefers." },
      { tier_level: 4, name: "Non-Preferred Drug", short_label: "T4", is_specialty: false, description: "Higher-cost generics and brands." },
      { tier_level: 5, name: "Specialty Tier", short_label: "T5", is_specialty: true, description: "High-cost drugs (above the specialty cost threshold)." },
      { tier_level: 6, name: "Select Care Drugs", short_label: "T6", is_specialty: false, description: "Select insulins and other drugs with capped member cost." },
    ] }),
    table("benefit_phase", "Benefit phases of the Part D benefit.", ["id id", "code str(16) uq", "name str(40)", "applies_from_year smallint", "applies_to_year smallint null"], { rows: [
      { code: "DEDUCTIBLE", name: "Deductible", applies_from_year: 2006, applies_to_year: null },
      { code: "INITIAL", name: "Initial coverage", applies_from_year: 2006, applies_to_year: null },
      { code: "GAP", name: "Coverage gap", applies_from_year: 2006, applies_to_year: 2024 },
      { code: "CATASTROPHIC", name: "Catastrophic / after out-of-pocket cap", applies_from_year: 2006, applies_to_year: null },
    ] }),
    table("pharmacy_channel", "Pharmacy channels used for cost sharing and networks.", ["id id", "code str(16) uq", "name str(40)", "is_preferred bool", "is_mail_order bool", "has_cost_share bool"], { rows: [
      { code: "PREF_RETAIL", name: "Preferred retail", is_preferred: true, is_mail_order: false, has_cost_share: true },
      { code: "STD_RETAIL", name: "Standard retail", is_preferred: false, is_mail_order: false, has_cost_share: true },
      { code: "PREF_MAIL", name: "Preferred mail order", is_preferred: true, is_mail_order: true, has_cost_share: true },
      { code: "STD_MAIL", name: "Standard mail order", is_preferred: false, is_mail_order: true, has_cost_share: true },
      { code: "SPECIALTY", name: "Specialty pharmacy", is_preferred: false, is_mail_order: true, has_cost_share: false },
      { code: "LTC", name: "Long-term care pharmacy", is_preferred: false, is_mail_order: false, has_cost_share: false },
    ] }),
    table("um_rule_type", "Kinds of utilization-management rules.", ["id id", "code str(8) uq", "name str(40)"], { rows: UM_TYPES.map(([code, name]) => ({ code, name })) }),
    table("pdp_region", "Service-area regions (synthetic grouping of states).", ["id id", "region_code char(2) uq", "name str(60)", "states str(60)"], {
      rows: REGIONS.map((name, i) => ({ region_code: String(i + 1).padStart(2, "0"), name: `Region ${String(i + 1).padStart(2, "0")} - ${name}`, states: CITIES.filter((_, k) => k % 10 === i).map((c) => c[1]).filter((v, k, a) => a.indexOf(v) === k).slice(0, 6).join(", ") })),
    }),
    table("app_user", "Staff who build, review and approve formularies.", [
      "id id", "username str(40) uq", "full_name str(80)", "email str(120) uq", "role enum(pharmacist,clinical_reviewer,pt_committee,formulary_analyst,compliance,admin)", "is_active bool def:true", "created_at ts def:now",
    ], { n: 24, gen: (g, i) => { const f = g.first(), l = g.last(); return { username: `${f}.${l}${i}`.toLowerCase(), full_name: `${f} ${l}`, email: `${f}.${l}${i}@formulary.example`.toLowerCase(), role: i === 1 ? "admin" : g.w([["pharmacist", 5], ["clinical_reviewer", 4], ["pt_committee", 4], ["formulary_analyst", 6], ["compliance", 3]] as const), is_active: g.bool(0.92), created_at: g.ts(g.date("2020-01-01", "2024-06-01")) }; } }),
    table("sponsor", "Part D plan sponsors (parent organizations).", ["id id", "name str(80) uq", "sponsor_code char(4) uq", "headquarters_state char(2)", "created_at ts def:now"], {
      n: by([3, 5, 8]), gen: (g, i) => ({ name: SPONSORS[i - 1]!, sponsor_code: `SP${String(i).padStart(2, "0")}`, headquarters_state: g.pick(CITIES)[1], created_at: g.ts("2015-01-01") }),
    }),
    table("contract", "CMS-style contracts (H = MA-PD, S = stand-alone PDP); ids are fictional.", [
      "id id", "contract_number char(5) uq # Fictional H0000 / S0000 style id", "sponsor_id int fk:sponsor", "contract_type enum(MAPD,PDP)", "contract_name str(100)", "effective_date date", "status enum(active,pending,terminated)",
    ], { n: by([5, 12, 24]), gen: (g, i) => { const pdp = i % 3 === 0; const sp = ((i - 1) % g.count("sponsor")) + 1; return { contract_number: `${pdp ? "S" : "H"}${String(1000 + i * 37).padStart(4, "0")}`, sponsor_id: sp, contract_type: pdp ? "PDP" : "MAPD", contract_name: `${g.pick(["Northern", "Coastal", "Heartland", "Valley", "Summit", "Lakeside"])} ${pdp ? "Rx Saver" : "Medicare Advantage"} ${i}`, effective_date: g.date("2018-01-01", "2024-01-01"), status: "active" }; } }),
    table("pharmacy_network", "Pharmacy networks offered by sponsors.", ["id id", "name str(60) uq", "network_type enum(preferred,standard,mail,specialty)", "created_at ts def:now"], {
      n: by([3, 4, 6]), gen: (g, i) => ({ name: `${g.pick(["Prime", "Select", "Value", "Advantage", "Choice", "Core"])} Network ${i}`, network_type: g.pick(["preferred", "standard", "preferred", "mail"]), created_at: g.ts("2019-01-01") }),
    }),
    table("formulary", "A formulary (drug list) for a benefit year. formulary_code mimics the 8-digit CMS formulary id.", [
      "id id", "formulary_code char(8) uq", "name str(80)", "plan_year_id int fk:plan_year", "sponsor_id int fk:sponsor", "formulary_type enum(closed,incentive,open)", "created_by int fk:app_user", "created_at ts def:now", "updated_at ts upd",
    ], { n: by([3, 5, 8]), gen: (g, i) => ({ formulary_code: String(24000000 + i * 113), name: `${g.pick(["Essential", "Enhanced", "Value", "Premier", "Select", "Standard"])} Formulary ${FORM_YEARS[i - 1]}`, plan_year_id: FORM_YEARS[i - 1]! - 2022, sponsor_id: ((i - 1) % g.count("sponsor")) + 1, formulary_type: g.pick(["closed", "incentive"]), created_by: g.int(1, 24), created_at: g.ts(`${FORM_YEARS[i - 1]! - 1}-03-01`) }) }),
    table("formulary_tier", "Tier labels and thresholds per formulary.", ["id id", "formulary_id int fk:formulary cascade", "tier_id int fk:tier", "label str(60)", "specialty_cost_threshold dec(8,2) null"], {
      n: (n) => n("formulary") * 6, uq: [["formulary_id", "tier_id"]],
      gen: (g, i) => ({ formulary_id: Math.ceil(i / 6), tier_id: ((i - 1) % 6) + 1, label: ["Preferred Generic", "Generic", "Preferred Brand", "Non-Preferred Drug", "Specialty Tier", "Select Care Drugs"][(i - 1) % 6]!, specialty_cost_threshold: (i - 1) % 6 === 4 ? 950 : null }),
    }),
    table("formulary_version", "Versions of a formulary with the draft -> in review -> approved -> published workflow.", [
      "id id", "formulary_id int fk:formulary", "version_no smallint", "status enum(draft,in_review,approved,published,retired)", "effective_date date", "submitted_at ts null", "approved_at ts null", "approved_by int fk:app_user null", "published_at ts null", "cms_submission_ref str(24) null", "notes text null", "created_at ts def:now", "updated_at ts upd",
    ], {
      n: (n, s) => sc(s).versions.length, uq: [["formulary_id", "version_no"]], ix: ["status,effective_date"], ck: ["version_no >= 1"],
      gen: (g, i) => { const v = sc(g.scale).versions[i - 1]!; const sub = v.status !== "draft"; const appr = ["approved", "published", "retired"].includes(v.status); return { formulary_id: v.f, version_no: v.j, status: v.status, effective_date: v.effective, submitted_at: sub ? g.ts(addDays(v.effective, -g.int(25, 45))) : null, approved_at: appr ? g.ts(addDays(v.effective, -g.int(5, 20))) : null, approved_by: appr ? g.int(1, 24) : null, published_at: v.status === "published" || v.status === "retired" ? g.ts(addDays(v.effective, -g.int(1, 4))) : null, cms_submission_ref: sub ? `FRF-${v.year}-${String(v.id).padStart(5, "0")}` : null, notes: v.j === 1 ? "Initial annual formulary build." : g.pick(["Quarterly maintenance update.", "Mid-year formulary change: additions and tier moves.", "Safety-driven removals and UM clean-up.", "Supplemental update for new generics."]), created_at: g.ts(addDays(v.effective, -60)) }; },
    }),
    table("ingredient", "Active ingredients (generic entity) with their USP-style class.", [
      "id id", "generic_name str(120) uq", "brand_name str(60) null", "therapeutic_class_id int fk:therapeutic_class", "dea_schedule enum(CII,CIII,CIV,CV) null", "is_biologic bool", "is_specialty bool", "part_b_candidate bool # Coverage may fall under Part B instead of Part D", "default_tier_hint smallint",
    ], {
      rows: INGREDIENTS.map((x) => ({ generic_name: x.generic, brand_name: x.brand, therapeutic_class_id: CLASSES.findIndex((c) => c.cat === x.cat && c.cls === x.cls) + 1, dea_schedule: x.dea, is_biologic: x.flags.includes("X"), is_specialty: x.flags.includes("C"), part_b_candidate: x.flags.includes("B"), default_tier_hint: x.hint })),
    }),
    table("drug", "Clinical drug concepts (ingredient + strength + dose form), keyed by an RxNorm-style RXCUI.", [
      "id id", "rxcui int uq # RxNorm-style concept id (synthetic)", "ingredient_id int fk:ingredient", "display_name str(200)", "strength str(60)", "dosage_form_id int fk:dosage_form", "route_id int fk:drug_route", "is_brand bool", "brand_name str(60) null", "is_active bool def:true",
    ], {
      rows: CONCEPTS.map((c) => ({ rxcui: c.rxcui, ingredient_id: c.ing.id, display_name: `${c.ing.generic} ${c.strength} ${c.ing.form}`, strength: c.strength, dosage_form_id: FORMS.findIndex((f) => f[0] === c.ing.form) + 1, route_id: ROUTES.findIndex((r) => r[0] === FORM_ROUTE[c.ing.form]) + 1, is_brand: c.ing.hint >= 3, brand_name: c.ing.hint >= 3 ? c.ing.brand : null, is_active: true })),
      ix: ["ingredient_id"],
    }),
    table("drug_product", "Packaged products identified by an NDC-style code (labeler-product-package).", [
      "id id", "drug_id int fk:drug", "ndc_code str(13) uq # NDC-style 5-4-2 code (synthetic)", "labeler_name str(80)", "package_size smallint", "package_unit str(16)", "unit_cost dec(10,4) # Synthetic cost per unit", "is_repackaged bool def:false", "marketing_status enum(active,discontinued)",
    ], {
      n: () => D * 2,
      gen: (g, i) => { const c = CONCEPTS[Math.ceil(i / 2) - 1]!; const base = [0.08, 0.35, 6, 14, 90, 4][c.ing.hint - 1]! * (1 + c.id % 5 * 0.15); return { drug_id: c.id, ndc_code: g.ndc(10000 + c.ing.id * 7 + (i % 2), c.id, (i % 2) + 1), labeler_name: g.pick(["Granite Pharma", "Lumen Labs", "Orchid Therapeutics", "Harbor Generics", "Beacon Rx", "Ridge Biologics", "Summit Labs"]), package_size: c.ing.hint === 5 ? 28 : g.pick([30, 60, 90, 100]), package_unit: c.ing.form === "inj" ? "pen" : c.ing.form === "inhaler" ? "inhaler" : c.ing.form, unit_cost: g.round(base * g.float(0.8, 1.25), 4), is_repackaged: i % 2 === 0 && g.bool(0.3), marketing_status: g.bool(0.97) ? "active" : "discontinued" }; },
    }),
    table("pharmacy", "Pharmacies with NPI-style (Luhn-checked) ids.", [
      "id id", "npi char(10) uq # NPI-style id with a valid Luhn check digit", "name str(100)", "chain str(40) null", "pharmacy_type enum(retail,mail_order,specialty,long_term_care,home_infusion)", "address str(120)", "city str(60)", "state char(2)", "zip char(5)", "phone str(16)", "is_24_hour bool", "status enum(active,suspended,closed)", "created_at ts def:now",
    ], { n: by([60, 300, 1200]), ix: ["state,pharmacy_type"], gen: (g, i) => { const p = g.place(); const type = g.w([["retail", 78], ["mail_order", 4], ["specialty", 8], ["long_term_care", 6], ["home_infusion", 4]] as const); return { npi: g.npi(), name: `${g.pick(["Corner", "Main Street", "Wellness", "Family", "Community", "Valley", "Harbor", "Prime"])} ${type === "retail" ? "Pharmacy" : type === "mail_order" ? "Mail Rx" : type === "specialty" ? "Specialty Rx" : type === "long_term_care" ? "LTC Pharmacy" : "Infusion Pharmacy"} #${i}`, chain: type === "retail" && g.bool(0.55) ? g.pick(["Rx Depot", "CareMart", "Greenleaf Drug", "HealthPoint"]) : null, pharmacy_type: type, address: g.street(), city: p.city, state: p.state, zip: p.zip, phone: g.phone(), is_24_hour: g.bool(0.08), status: g.w([["active", 96], ["suspended", 2], ["closed", 2]] as const), created_at: g.ts(g.date("2012-01-01", "2024-01-01")) }; } }),
    table("pharmacy_network_member", "Which pharmacies belong to which network, preferred or standard.", [
      "id id", "pharmacy_network_id int fk:pharmacy_network", "pharmacy_id int fk:pharmacy cascade", "network_tier enum(preferred,standard)", "effective_date date", "term_date date null",
    ], { n: (n) => n("pharmacy") * 2, uq: [["pharmacy_network_id", "pharmacy_id"]], gen: (g, i) => { const p = Math.ceil(i / 2); const N = g.count("pharmacy_network"); return { pharmacy_network_id: i % 2 === 1 ? ((p - 1) % N) + 1 : (p % N) + 1, pharmacy_id: p, network_tier: g.bool(0.35) ? "preferred" : "standard", effective_date: g.date("2022-01-01", "2024-12-31"), term_date: g.bool(0.04) ? g.date("2025-01-01", "2025-06-01") : null }; } }),
    table("plan", "Benefit packages; plan_key is contract-plan-segment (H0000-001 style) for one benefit year.", [
      "id id", "contract_id int fk:contract", "plan_number char(3)", "segment_id char(3)", "plan_year_id int fk:plan_year", "plan_key str(14) uq", "plan_name str(100)", "plan_type enum(MAPD,PDP)", "formulary_id int fk:formulary", "network_id int fk:pharmacy_network", "region_id int fk:pdp_region",
      "monthly_premium dec(7,2)", "annual_deductible dec(7,2)", "deductible_tiers str(20) # Tiers the deductible applies to", "star_rating dec(2,1) null", "enrollment int", "status enum(active,pending,terminated)", "created_at ts def:now", "updated_at ts upd",
    ], {
      n: (n, s) => CFG[s].P, uq: [["contract_id", "plan_number", "segment_id", "plan_year_id"]], ix: ["formulary_id", "plan_year_id"], ck: ["monthly_premium >= 0"],
      gen: (g, i) => { const pl = sc(g.scale); const C = pl.cfg.C; const c = ((i - 1) % C) + 1; const k = Math.floor((i - 1) / C) + 1; const ct = g.rows("contract")[c - 1]!; const year = pl.planYear[i - 1]!; const ded = year >= 2025 ? g.pick([0, 0, 250, 505, 590]) : g.pick([0, 0, 250, 505, 545]); return { contract_id: c, plan_number: String(k).padStart(3, "0"), segment_id: "000", plan_year_id: year - 2022, plan_key: `${ct.contract_number}-${String(k).padStart(3, "0")}-${year}`, plan_name: `${String(ct.contract_name).split(" ").slice(0, 1)} ${ct.contract_type === "PDP" ? "Rx" : "MedAdvantage"} ${g.pick(["Basic", "Plus", "Premier", "Saver", "Choice"])}`, plan_type: ct.contract_type, formulary_id: pl.planForm[i - 1], network_id: ((i - 1) % g.count("pharmacy_network")) + 1, region_id: ((i - 1) % 10) + 1, monthly_premium: g.pick([0, 0, 12.4, 28.9, 35.7, 49.1, 71.6]), annual_deductible: ded, deductible_tiers: ded ? g.pick(["3-5", "1-5", "3-4"]) : "none", star_rating: g.bool(0.9) ? g.pick([3, 3.5, 4, 4, 4.5, 5]) : null, enrollment: Math.round(g.logNormal(4500, 1)), status: year > 2025 ? "pending" : "active", created_at: g.ts(`${year - 1}-06-01`) }; },
    }),
    table("um_rule", "Library of utilization-management rules referenced by formulary drugs.", [
      "id id", "code str(30) uq", "rule_type_id int fk:um_rule_type", "name str(100)", "criteria text", "status enum(active,retired)", "owner_id int fk:app_user", "effective_from date",
    ], { rows: UM_RULES.map((r, i) => ({ code: r.code, rule_type_id: UM_TYPES.findIndex((t) => t[0] === r.type) + 1, name: r.name, criteria: r.criteria, status: "active", owner_id: (i % 6) + 1, effective_from: "2024-01-01" })) }),
    table("step_therapy_group", "Step-therapy groups: an ordered series of drugs to try before a restricted drug.", ["id id", "name str(80) uq", "category_id int fk:therapeutic_category null", "description text"], {
      rows: STEP_GROUPS.map((x) => ({ name: x.name, category_id: x.cat ? CAT_KEYS.indexOf(x.cat) + 1 : null, description: x.desc })),
    }),
    table("step_therapy_step", "The steps of a group; a drug can satisfy a step.", ["id id", "step_group_id int fk:step_therapy_group cascade", "step_no smallint", "drug_id int fk:drug", "requirement str(120)"], {
      uq: [["step_group_id", "step_no", "drug_id"]], n: () => STEP_GROUPS.length * 3,
      gen: (g, i) => { const gi = Math.ceil(i / 3) - 1; const cat = STEP_GROUPS[gi]!.cat; const pool = CONCEPTS.filter((c) => (cat ? c.ing.cat === cat : true) && c.ing.hint <= 2); const step = ((i - 1) % 3) + 1; const c = pool[(i * 7) % pool.length]!; return { step_group_id: gi + 1, step_no: step, drug_id: c.id, requirement: step === 1 ? "Trial of at least 30 days" : step === 2 ? "Inadequate response or intolerance documented" : "Contraindication or failure of steps 1-2" }; },
    }),
    table("formulary_drug", "A drug on a formulary version with its tier and UM flags (the basic drugs formulary file).", [
      "id id", "formulary_version_id int fk:formulary_version cascade", "drug_id int fk:drug", "tier_id int fk:tier", "prior_authorization bool", "step_therapy bool", "quantity_limit bool", "is_new_in_version bool", "created_at ts def:now",
    ], { n: (n, s) => sc(s).fds.length, uq: [["formulary_version_id", "drug_id"]], ix: ["drug_id", "formulary_version_id,tier_id"], gen: (g, i) => { const x = sc(g.scale).fds[i - 1]!; return { formulary_version_id: x.version, drug_id: x.drug, tier_id: x.tier, prior_authorization: x.pa, step_therapy: x.st, quantity_limit: x.ql, is_new_in_version: x.isNew, created_at: `${ASOF} 00:00:00` }; } }),
    table("formulary_drug_um", "Which UM rules apply to a formulary drug (and the step group for step therapy).", [
      "id id", "formulary_drug_id int fk:formulary_drug cascade", "um_rule_id int fk:um_rule", "step_group_id int fk:step_therapy_group null",
    ], { n: (n, s) => sc(s).fds.reduce((a, x) => a + x.um.length, 0), uq: [["formulary_drug_id", "um_rule_id"]], uses: ["step_therapy_group"], all: (g) => sc(g.scale).fds.flatMap((x) => x.um.map((r) => ({ formulary_drug_id: x.id, um_rule_id: r, step_group_id: r === UM_ID.get("ST-GROUP") ? x.sg : null }))) }),
    table("quantity_limit", "Quantity limits: amount per days supply.", ["id id", "formulary_drug_id int fk:formulary_drug cascade", "quantity dec(8,2)", "days_supply smallint", "unit str(12)"], {
      uq: [["formulary_drug_id"]], ck: ["quantity > 0"], n: (n, s) => sc(s).fds.filter((x) => x.ql).length, all: (g) => sc(g.scale).fds.filter((x) => x.ql).map((x) => ({ formulary_drug_id: x.id, quantity: x.qlAmt, days_supply: x.qlDays, unit: CONCEPTS[x.drug - 1]!.ing.form === "inj" ? "mL" : "units" })),
    }),
    table("age_gender_limit", "Age and gender restrictions on a formulary drug.", ["id id", "formulary_drug_id int fk:formulary_drug cascade", "min_age smallint null", "max_age smallint null", "gender enum(F,M) null"], {
      n: (n, s) => sc(s).fds.filter((x) => x.um.some((u) => u === UM_ID.get("AGE-ADULT") || u === UM_ID.get("GENDER-F"))).length,
      all: (g) => sc(g.scale).fds.filter((x) => x.um.some((u) => u === UM_ID.get("AGE-ADULT") || u === UM_ID.get("GENDER-F"))).map((x) => ({ formulary_drug_id: x.id, min_age: x.um.includes(UM_ID.get("AGE-ADULT")!) ? 18 : null, max_age: null, gender: x.um.includes(UM_ID.get("GENDER-F")!) ? "F" : null })),
    }),
    table("cost_share", "Member cost sharing by plan, benefit phase, tier, pharmacy channel and days supply.", [
      "id id", "plan_id int fk:plan cascade", "benefit_phase_id int fk:benefit_phase", "tier_id int fk:tier", "pharmacy_channel_id int fk:pharmacy_channel", "days_supply smallint", "cost_type enum(copay,coinsurance,full_cost,none)", "copay_amount dec(8,2) null", "coinsurance_pct dec(5,2) null",
    ], {
      n: (n, s) => costPlan(s).length, uq: [["plan_id", "benefit_phase_id", "tier_id", "pharmacy_channel_id", "days_supply"]], ck: ["coinsurance_pct IS NULL OR (coinsurance_pct >= 0 AND coinsurance_pct <= 100)"],
      all: (g) => costPlan(g.scale).map((r) => { const [cp, coins] = COPAY[r.tier]!; const mult = r.days === 90 ? 2.5 : 1; let type = "copay", amt: number | null = cp[r.channel - 1]! * mult, pct: number | null = null; if (r.phase === 1 && r.tier >= 3 && r.tier <= 5) { type = "full_cost"; amt = null; } else if (r.phase === 4) { type = "none"; amt = null; } else if (r.phase === 3 || coins) { type = "coinsurance"; amt = null; pct = r.phase === 3 ? 25 : r.channel > 2 ? 25 : 28; } return { plan_id: r.plan, benefit_phase_id: r.phase, tier_id: r.tier, pharmacy_channel_id: r.channel, days_supply: r.days, cost_type: type, copay_amount: amt, coinsurance_pct: pct }; }),
    }),
    table("version_review", "Review steps a formulary version passes before publication.", ["id id", "formulary_version_id int fk:formulary_version cascade", "step enum(clinical_review,pt_committee,compliance,cms_submission)", "reviewer_id int fk:app_user", "decision enum(approved,changes_requested)", "comment text null", "reviewed_at ts"], {
      n: (n, s) => sc(s).versions.reduce((a, v) => a + reviewCount(v.status), 0),
      all: (g) => sc(g.scale).versions.flatMap((v) => (["clinical_review", "pt_committee", "compliance", "cms_submission"] as const).slice(0, reviewCount(v.status)).map((step, k) => ({ formulary_version_id: v.id, step, reviewer_id: g.int(1, 24), decision: g.bool(0.9) ? "approved" : "changes_requested", comment: g.bool(0.4) ? g.sentence(9) : null, reviewed_at: g.ts(addDays(v.effective, -35 + k * 7)) }))),
    }),
    table("formulary_change_log", "What changed between consecutive versions of a formulary (CMS change-file spirit).", [
      "id id", "formulary_version_id int fk:formulary_version cascade", "drug_id int fk:drug", "change_type enum(ADD,REMOVE,TIER_CHANGE,UM_ADDED,UM_REMOVED)", "old_value str(40) null", "new_value str(40) null", "reason str(120)", "changed_by int fk:app_user", "changed_at ts", "cms_notice_required bool",
    ], {
      n: (n, s) => sc(s).changes.length, ix: ["formulary_version_id,change_type"],
      all: (g) => sc(g.scale).changes.map((c) => ({ formulary_version_id: c.version, drug_id: c.drug, change_type: c.type, old_value: c.oldV, new_value: c.newV, reason: c.type === "REMOVE" ? g.pick(["Safety communication", "Market withdrawal", "Generic available"]) : c.type === "ADD" ? g.pick(["New generic launch", "P&T committee request", "Cost-effective alternative"]) : g.pick(["Rebate contract change", "Net cost reassessment", "Clinical guideline update"]), changed_by: g.int(1, 24), changed_at: g.ts(addDays(sc(g.scale).versions[c.version - 1]!.effective, -g.int(6, 40))), cms_notice_required: c.type === "REMOVE" || c.type === "TIER_CHANGE" })),
    }),
    table("member", "Synthetic beneficiaries (no real people). Only plans of 2025 or earlier have members.", [
      "id id", "member_ref str(12) uq", "first_name str(40)", "last_name str(40)", "birth_date date", "gender enum(F,M)", "state char(2)", "zip char(5)", "plan_id int fk:plan", "enrolled_on date", "disenrolled_on date null", "lis_level enum(none,partial,full)", "created_at ts def:now",
    ], {
      n: (n, s) => CFG[s].M, ix: ["plan_id", "state"],
      gen: (g, i) => { const pl = sc(g.scale); const live: number[] = g.memo("live", () => pl.planYear.map((y, k) => (y <= 2025 ? k + 1 : 0)).filter(Boolean)); const planId = live[g.skew(live.length, 1.3)]!; const year = pl.planYear[planId - 1]!; const p = g.place(); const age = g.bool(0.06) ? g.int(30, 64) : Math.round(g.clamp(g.normal(74, 7.5), 65, 99)); const enrolled = g.date(`${year}-01-01`, year === 2025 ? ASOF : `${year}-06-30`); return { member_ref: `MBR${String(i).padStart(7, "0")}`, first_name: g.first(), last_name: g.last(), birth_date: dayStr(dayOf(ASOF) - age * 365 - g.int(0, 364)), gender: g.bool(0.56) ? "F" : "M", state: p.state, zip: p.zip, plan_id: planId, enrolled_on: enrolled, disenrolled_on: g.bool(0.05) ? g.date(enrolled, year === 2025 ? ASOF : `${year}-12-31`) : null, lis_level: g.w([["none", 70], ["partial", 8], ["full", 22]] as const), created_at: g.ts(enrolled) }; },
    }),
    table("rx_claim", "Prescription claims adjudicated against the plan formulary (synthetic utilization).", [
      "id id", "claim_ref str(16) uq", "member_id int fk:member", "plan_id int fk:plan", "drug_id int fk:drug", "drug_product_id int fk:drug_product", "pharmacy_id int fk:pharmacy", "fill_date date", "days_supply smallint", "quantity dec(10,2)", "tier_id int fk:tier", "benefit_phase_id int fk:benefit_phase",
      "ingredient_cost dec(10,2)", "dispensing_fee dec(6,2)", "member_paid dec(10,2)", "plan_paid dec(10,2)", "status enum(paid,rejected,reversed)", "reject_code str(4) null", "pa_applied bool", "created_at ts def:now",
    ], {
      n: (n, s) => CFG[s].CL, ix: ["fill_date", "member_id,fill_date", "drug_id,fill_date", "plan_id,status"], ck: ["days_supply > 0"], uses: ["formulary_drug"],
      gen: (g, i) => {
        const pl = sc(g.scale);
        const m = g.rows("member")[g.fkSkew(g.count("member"), 1.3) - 1]!;
        const planId = Number(m.plan_id);
        const f = pl.planForm[planId - 1]!;
        const vid = pl.publishedOf.get(f)!;
        const s0 = pl.start.get(vid)!, n0 = pl.len.get(vid)!;
        const x = pl.fds[s0 + (g.skew(n0, 1.7) * 37) % n0]!;
        const c = CONCEPTS[x.drug - 1]!;
        const year = pl.planYear[planId - 1]!;
        const fill = g.seasonal(String(m.enrolled_on), year === 2025 ? ASOF : `${year}-12-31`, [1.3, 1.1, 1, 1, 1, 1, 0.95, 1, 1, 1, 1.05, 1.1]);
        const days = c.ing.hint === 6 ? 30 : g.w([[30, 70], [90, 25], [60, 5]] as const);
        const unitCost = 0.1 * 10 ** (Math.log10(Math.max(1, [1, 4, 90, 140, 700, 40][x.tier - 1]!)));
        const ing = g.round(unitCost * days * g.float(0.8, 1.2) * (x.tier >= 5 ? 1 : 1) + (x.tier <= 2 ? 3 : 0));
        let reject: string | null = null;
        if (x.pa && g.bool(0.18)) reject = "75";
        else if (x.ql && g.bool(0.05)) reject = "76";
        else if (g.bool(0.015)) reject = g.pick(["70", "79", "88"]);
        const phase = g.w([[2, 84], [1, year === 2025 && fill < "2025-04-01" ? 30 : 8], [4, 3], [3, year <= 2024 ? 5 : 0]] as const);
        const paidClaim = !reject;
        const copay = [1, 8, 40, 95, 0, 5][x.tier - 1]!;
        const member = !paidClaim ? 0 : phase === 4 ? 0 : phase === 1 && x.tier >= 3 ? g.round(Math.min(ing, 590 - g.int(0, 400))) : x.tier === 5 ? g.round(Math.min(ing * 0.25, 250)) : x.tier === 6 ? 35 : Math.min(ing, copay * (days === 90 ? 2.5 : 1));
        return {
          claim_ref: `CLM${String(i).padStart(10, "0")}`, member_id: m.id, plan_id: planId, drug_id: x.drug, drug_product_id: (x.drug - 1) * 2 + 1 + (g.bool(0.7) ? 0 : 1), pharmacy_id: g.fkSkew(g.count("pharmacy"), 1.4), fill_date: fill, days_supply: days, quantity: days * (c.ing.form === "inj" ? 0.15 : 1), tier_id: x.tier, benefit_phase_id: phase,
          ingredient_cost: paidClaim ? ing : 0, dispensing_fee: paidClaim ? g.pick([0, 1.5, 2, 2.5]) : 0, member_paid: member, plan_paid: paidClaim ? g.round(Math.max(0, ing - member)) : 0, status: reject ? "rejected" : g.bool(0.02) ? "reversed" : "paid", reject_code: reject, pa_applied: x.pa && !reject, created_at: g.ts(fill),
        };
      },
    }),
    table("exception_request", "Coverage determinations: formulary, tiering and UM exceptions (72 h standard, 24 h expedited).", [
      "id id", "request_ref str(14) uq", "member_id int fk:member", "plan_id int fk:plan", "drug_id int fk:drug", "request_type enum(formulary_exception,tiering_exception,um_exception,quantity_limit_exception)", "urgency enum(standard,expedited)", "received_at ts", "decision_due_at ts", "status enum(pending,approved,denied,withdrawn)", "decided_at ts null", "decision_reason str(120) null", "prescriber_npi char(10)", "supporting_statement bool",
    ], {
      n: (n, s) => CFG[s].EX, ix: ["status,received_at", "member_id"],
      gen: (g, i) => { const m = g.rows("member")[g.fkSkew(g.count("member"), 1.2) - 1]!; const exp = g.bool(0.18); const recv = g.ts(g.date(String(m.enrolled_on), ASOF)); const hours = exp ? 24 : 72; const status = recv.slice(0, 10) > addDays(ASOF, -3) ? "pending" : g.w([["approved", 62], ["denied", 30], ["withdrawn", 8]] as const); const lateH = g.bool(0.05) ? g.int(2, 30) : -g.int(1, hours - 1); const decided = status === "pending" ? null : dayStr(dayOf(recv.slice(0, 10)) + Math.max(0, Math.round((hours + lateH) / 24))); return { request_ref: `EXC${String(i).padStart(9, "0")}`, member_id: m.id, plan_id: m.plan_id, drug_id: g.fkSkew(D, 1.2), request_type: g.w([["formulary_exception", 30], ["tiering_exception", 22], ["um_exception", 36], ["quantity_limit_exception", 12]] as const), urgency: exp ? "expedited" : "standard", received_at: recv, decision_due_at: addDays(recv.slice(0, 10), Math.ceil(hours / 24)) + recv.slice(10), status, decided_at: decided ? `${decided}${recv.slice(10)}` : null, decision_reason: status === "denied" ? g.pick(["Criteria not met", "Formulary alternative available", "Insufficient documentation"]) : status === "approved" ? g.pick(["Medically necessary", "Alternatives ineffective", "Safety concern with alternatives"]) : null, prescriber_npi: g.npi(), supporting_statement: g.bool(0.8) }; },
    }),
    table("appeal", "Redeterminations and further appeals of denied exceptions.", ["id id", "exception_request_id int fk:exception_request cascade", "appeal_level smallint", "filed_at ts", "outcome enum(upheld,overturned,partially_overturned,pending)", "decided_at ts null"], {
      n: (n) => Math.floor(n("exception_request") * 0.22), uq: [["exception_request_id", "appeal_level"]], ck: ["appeal_level BETWEEN 1 AND 4"],
      gen: (g, i) => { const e = g.rows("exception_request")[(i * 4) % g.count("exception_request")]!; const filed = addDays(String(e.received_at).slice(0, 10), g.int(5, 40)); const pend = filed > ASOF; return { exception_request_id: e.id, appeal_level: 1, filed_at: g.ts(pend ? ASOF : filed), outcome: pend ? "pending" : g.w([["upheld", 55], ["overturned", 35], ["partially_overturned", 10]] as const), decided_at: pend ? null : g.ts(g.minDate(ASOF, addDays(filed, g.int(7, 30)))) }; },
    }),
    table("audit_event", "Audit trail of who did what (also written by triggers on version status changes).", ["id id", "occurred_at ts", "actor_id int fk:app_user", "entity_type str(30)", "entity_id int", "action enum(create,update,status_change,publish,export,login)", "details json null"], {
      n: (n, s) => CFG[s].AU, ix: ["entity_type,entity_id", "occurred_at"],
      gen: (g) => { const t = g.w([["formulary_version", 40], ["formulary_drug", 30], ["um_rule", 10], ["plan", 10], ["export_batch", 10]] as const); const action = g.w([["update", 45], ["create", 20], ["status_change", 15], ["publish", 5], ["export", 8], ["login", 7]] as const); return { occurred_at: g.ts(g.date("2024-06-01", ASOF)), actor_id: g.int(1, 24), entity_type: t, entity_id: g.int(1, 50), action, details: action === "status_change" ? { from: "draft", to: "in_review" } : { source: g.pick(["ui", "import", "api"]) } }; },
    }),
    table("stg_formulary_file", "Staging table in the layout of the CMS basic drugs formulary file, loaded from published versions.", [
      "id id", "formulary_id char(8)", "formulary_version smallint", "contract_year smallint", "rxcui int", "tier_level_value smallint", "quantity_limit_yn char(1)", "quantity_limit_amount dec(8,2) null", "quantity_limit_days smallint null", "prior_authorization_yn char(1)", "step_therapy_yn char(1)", "export_batch str(20)",
    ], {
      n: (n, s) => sc(s).fds.filter((x) => sc(s).versions[x.version - 1]!.status === "published").length, uses: ["formulary_version"],
      all: (g) => sc(g.scale).fds.filter((x) => sc(g.scale).versions[x.version - 1]!.status === "published").map((x) => ({ formulary_id: String(24000000 + x.f * 113), formulary_version: x.j, contract_year: sc(g.scale).versions[x.version - 1]!.year, rxcui: CONCEPTS[x.drug - 1]!.rxcui, tier_level_value: x.tier, quantity_limit_yn: x.ql ? "Y" : "N", quantity_limit_amount: x.ql ? x.qlAmt : null, quantity_limit_days: x.ql ? x.qlDays : null, prior_authorization_yn: x.pa ? "Y" : "N", step_therapy_yn: x.st ? "Y" : "N", export_batch: `EXP-2025-06-${String(x.f).padStart(2, "0")}` })),
    }),
    table("stg_plan_info_file", "Staging table in the layout of the CMS plan information file.", [
      "id id", "contract_id str(5)", "plan_id char(3)", "segment_id char(3)", "contract_name str(100)", "plan_name str(100)", "formulary_id char(8)", "premium dec(7,2)", "deductible dec(7,2)", "ma_region_code char(2)", "pdp_region_code char(2)", "special_needs_plan bool", "export_batch str(20)",
    ], { n: (n) => n("plan"), gen: (g, i) => { const p = g.rows("plan")[i - 1]!; const c = g.rows("contract")[Number(p.contract_id) - 1]!; const f = g.rows("formulary")[Number(p.formulary_id) - 1]!; return { contract_id: c.contract_number, plan_id: p.plan_number, segment_id: p.segment_id, contract_name: c.contract_name, plan_name: p.plan_name, formulary_id: f.formulary_code, premium: p.monthly_premium, deductible: p.annual_deductible, ma_region_code: c.contract_type === "MAPD" ? String(p.region_id).padStart(2, "0") : "00", pdp_region_code: c.contract_type === "PDP" ? String(p.region_id).padStart(2, "0") : "00", special_needs_plan: g.bool(0.07), export_batch: "EXP-2025-06-PLAN" }; } }),
    table("stg_beneficiary_cost_file", "Staging table in the layout of the CMS beneficiary cost file (preferred retail, standard retail, mail order).", [
      "id id", "contract_id str(5)", "plan_id char(3)", "segment_id char(3)", "coverage_level smallint # 0 deductible, 1 initial, 3 catastrophic", "tier smallint", "days_supply smallint", "cost_type_pref smallint", "cost_amt_pref dec(8,2) null", "cost_type_nonpref smallint", "cost_amt_nonpref dec(8,2) null", "cost_type_mail smallint", "cost_amt_mail dec(8,2) null",
    ], {
      n: (n, s) => costPlan(s).filter((r) => r.channel === 1).length, uses: ["cost_share", "contract"],
      all: (g) => { const cs = g.rows("cost_share"); const idx = new Map<string, Row>(); for (const r of cs) idx.set(`${r.plan_id}|${r.benefit_phase_id}|${r.tier_id}|${r.pharmacy_channel_id}|${r.days_supply}`, r); const T = (r: Row | undefined) => (!r ? 0 : r.cost_type === "copay" ? 1 : r.cost_type === "coinsurance" ? 2 : 0); const A = (r: Row | undefined) => (!r ? null : r.cost_type === "copay" ? Number(r.copay_amount) : r.cost_type === "coinsurance" ? Number(r.coinsurance_pct) : null); return costPlan(g.scale).filter((r) => r.channel === 1).map((r) => { const plan = g.rows("plan")[r.plan - 1]!; const c = g.rows("contract")[Number(plan.contract_id) - 1]!; const k = (ch: number) => idx.get(`${r.plan}|${r.phase}|${r.tier}|${ch}|${r.days}`); return { contract_id: c.contract_number, plan_id: plan.plan_number, segment_id: plan.segment_id, coverage_level: r.phase === 1 ? 0 : r.phase === 2 ? 1 : r.phase === 3 ? 2 : 3, tier: r.tier, days_supply: r.days, cost_type_pref: T(k(1)), cost_amt_pref: A(k(1)), cost_type_nonpref: T(k(2)), cost_amt_nonpref: A(k(2)), cost_type_mail: T(k(3)), cost_amt_mail: A(k(3)) }; }); },
    }),
  ],
  views: [
    view("v_current_formulary", "Drugs on each formulary's current published version, with tier and UM flags.", () => `
SELECT f.formulary_code, f.name AS formulary_name, fv.version_no, fd.drug_id, d.rxcui, d.display_name, i.generic_name, t.tier_level, t.name AS tier_name,
       fd.prior_authorization AS pa, fd.step_therapy AS st, fd.quantity_limit AS ql, c.name AS therapeutic_category
FROM formulary f
JOIN formulary_version fv ON fv.formulary_id = f.id AND fv.status = 'published'
JOIN formulary_drug fd ON fd.formulary_version_id = fv.id
JOIN drug d ON d.id = fd.drug_id
JOIN ingredient i ON i.id = d.ingredient_id
JOIN therapeutic_class tc ON tc.id = i.therapeutic_class_id
JOIN therapeutic_category c ON c.id = tc.category_id
JOIN tier t ON t.id = fd.tier_id`),
    view("v_formulary_by_tier", "Drug counts and UM share per formulary version and tier.", () => `
SELECT f.formulary_code, fv.version_no, fv.status, t.tier_level, t.name AS tier_name, COUNT(*) AS drugs,
       SUM(CASE WHEN fd.prior_authorization THEN 1 ELSE 0 END) AS with_pa, SUM(CASE WHEN fd.step_therapy THEN 1 ELSE 0 END) AS with_st, SUM(CASE WHEN fd.quantity_limit THEN 1 ELSE 0 END) AS with_ql
FROM formulary_drug fd
JOIN formulary_version fv ON fv.id = fd.formulary_version_id
JOIN formulary f ON f.id = fv.formulary_id
JOIN tier t ON t.id = fd.tier_id
GROUP BY f.formulary_code, fv.version_no, fv.status, t.tier_level, t.name`),
    view("v_drugs_um_flags", "Every UM rule applied to each formulary drug (PA, ST, QL, age, gender, B vs D).", () => `
SELECT fv.formulary_id, fv.version_no, fd.drug_id, d.display_name, ur.code AS rule_code, urt.code AS rule_type, sg.name AS step_group
FROM formulary_drug_um um
JOIN formulary_drug fd ON fd.id = um.formulary_drug_id
JOIN formulary_version fv ON fv.id = fd.formulary_version_id
JOIN drug d ON d.id = fd.drug_id
JOIN um_rule ur ON ur.id = um.um_rule_id
JOIN um_rule_type urt ON urt.id = ur.rule_type_id
LEFT JOIN step_therapy_group sg ON sg.id = um.step_group_id`),
    view("v_tier_change_report", "Tier moves between a version and its predecessor (LAG over versions).", () => `
SELECT formulary_id, version_no, previous_version_no, drug_id, display_name, previous_tier, tier_level
FROM (
  SELECT fv.formulary_id, fv.version_no, d.display_name, fd.drug_id, t.tier_level,
         LAG(t.tier_level) OVER (PARTITION BY fv.formulary_id, fd.drug_id ORDER BY fv.version_no) AS previous_tier,
         LAG(fv.version_no) OVER (PARTITION BY fv.formulary_id, fd.drug_id ORDER BY fv.version_no) AS previous_version_no
  FROM formulary_drug fd
  JOIN formulary_version fv ON fv.id = fd.formulary_version_id
  JOIN tier t ON t.id = fd.tier_id
  JOIN drug d ON d.id = fd.drug_id
) x
WHERE previous_tier IS NOT NULL AND previous_tier <> tier_level`),
    view("v_plan_coverage_summary", "Per plan: formulary, premium and deductible, drug counts and UM prevalence of the current version.", (d) => `
SELECT p.plan_key, p.plan_name, p.plan_type, py.plan_year, f.formulary_code, p.monthly_premium, p.annual_deductible,
       COUNT(fd.id) AS covered_drugs,
       ${d.round("100.0 * SUM(CASE WHEN fd.prior_authorization THEN 1 ELSE 0 END) / NULLIF(COUNT(fd.id), 0)", 1)} AS pct_pa,
       ${d.round("100.0 * SUM(CASE WHEN fd.step_therapy THEN 1 ELSE 0 END) / NULLIF(COUNT(fd.id), 0)", 1)} AS pct_st,
       ${d.round("100.0 * SUM(CASE WHEN fd.quantity_limit THEN 1 ELSE 0 END) / NULLIF(COUNT(fd.id), 0)", 1)} AS pct_ql
FROM plan p
JOIN plan_year py ON py.id = p.plan_year_id
JOIN formulary f ON f.id = p.formulary_id
LEFT JOIN formulary_version fv ON fv.formulary_id = f.id AND fv.status = 'published'
LEFT JOIN formulary_drug fd ON fd.formulary_version_id = fv.id
GROUP BY p.plan_key, p.plan_name, p.plan_type, py.plan_year, f.formulary_code, p.monthly_premium, p.annual_deductible`),
    view("v_cost_share_matrix", "Initial-coverage copay / coinsurance by plan and tier for 30-day preferred retail.", () => `
SELECT p.plan_key, t.tier_level, t.name AS tier_name, cs.cost_type, cs.copay_amount, cs.coinsurance_pct
FROM cost_share cs
JOIN plan p ON p.id = cs.plan_id
JOIN tier t ON t.id = cs.tier_id
JOIN benefit_phase bp ON bp.id = cs.benefit_phase_id AND bp.code = 'INITIAL'
JOIN pharmacy_channel pc ON pc.id = cs.pharmacy_channel_id AND pc.code = 'PREF_RETAIL'
WHERE cs.days_supply = 30`),
    view("v_pending_formulary_work", "Versions that are not published yet, with review progress and drug counts.", () => `
SELECT f.formulary_code, f.name, fv.version_no, fv.status, fv.effective_date,
       (SELECT COUNT(*) FROM version_review vr WHERE vr.formulary_version_id = fv.id) AS review_steps_done,
       (SELECT COUNT(*) FROM formulary_drug fd WHERE fd.formulary_version_id = fv.id) AS drugs
FROM formulary_version fv JOIN formulary f ON f.id = fv.formulary_id
WHERE fv.status IN ('draft', 'in_review', 'approved')`),
    view("v_exception_turnaround", "Exception requests with hours to decision and SLA flag.", (d) => `
SELECT e.request_ref, e.request_type, e.urgency, e.status, e.received_at, e.decided_at,
       CASE WHEN e.decided_at IS NULL THEN NULL ELSE ${d.diffDays("e.decided_at", "e.received_at")} * 24 END AS approx_hours,
       CASE WHEN e.decided_at IS NOT NULL AND e.decided_at > e.decision_due_at THEN 1 ELSE 0 END AS missed_sla
FROM exception_request e`),
    view("mv_claims_by_plan_month", "Claim volume, rejections and spend per plan and month (materialized on PostgreSQL).", (d) => `
SELECT plan_id, ${d.ym("fill_date")} AS month, COUNT(*) AS claims,
       SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected, SUM(member_paid) AS member_paid, SUM(plan_paid) AS plan_paid
FROM rx_claim GROUP BY plan_id, ${d.ym("fill_date")}`, true),
  ],
  queries: [
    query("tier_mix", "Tier mix of the current formularies", "How many drugs sit in each tier on every published formulary, and what share needs PA.", (d) => `
-- Tier mix per published formulary, with PA share per tier
SELECT formulary_code, tier_level, tier_name, drugs, with_pa,
       ${d.round("100.0 * with_pa / drugs", 1)} AS pa_pct,
       ${d.round("100.0 * drugs / SUM(drugs) OVER (PARTITION BY formulary_code)", 1)} AS pct_of_formulary
FROM v_formulary_by_tier
WHERE status = 'published'
ORDER BY formulary_code, tier_level`),
    query("tier_changes", "Biggest tier moves between versions", "The drugs that moved most between consecutive versions, from the tier-change view.", () => `
-- Which drugs changed tier (and which way) between versions?
SELECT t.formulary_id, t.version_no, t.display_name, t.previous_tier, t.tier_level,
       t.tier_level - t.previous_tier AS delta,
       CASE WHEN t.tier_level > t.previous_tier THEN 'moved up (costlier)' ELSE 'moved down (cheaper)' END AS direction
FROM v_tier_change_report t
ORDER BY ABS(t.tier_level - t.previous_tier) DESC, t.formulary_id, t.version_no, t.display_name
LIMIT 25`),
    query("step_chains", "Step-therapy chains", "Restricted drugs on the current formulary with the group's step 1 / 2 / 3 drugs.", (d) => `
-- Which drugs must be tried first? Joins formulary, UM link, step group and its steps
SELECT cf.formulary_code, cf.display_name AS restricted_drug, sg.name AS step_group,
       ${d.strAgg("step_text", " > ")} AS required_steps
FROM v_current_formulary cf
JOIN formulary_drug fd ON fd.drug_id = cf.drug_id
JOIN formulary_version fv ON fv.id = fd.formulary_version_id AND fv.status = 'published'
JOIN formulary f ON f.id = fv.formulary_id AND f.formulary_code = cf.formulary_code
JOIN formulary_drug_um um ON um.formulary_drug_id = fd.id AND um.step_group_id IS NOT NULL
JOIN step_therapy_group sg ON sg.id = um.step_group_id
JOIN (SELECT s.step_group_id, s.step_no, ${d.concat("'step '", d.cast("s.step_no", "text"), "': '", "dd.display_name")} AS step_text FROM step_therapy_step s JOIN drug dd ON dd.id = s.drug_id) st ON st.step_group_id = sg.id
GROUP BY cf.formulary_code, cf.display_name, sg.name
ORDER BY cf.formulary_code, cf.display_name
LIMIT 30`),
    query("formulary_overlap", "Overlap between two formularies", "Drugs covered by both formularies but on different tiers (self join of the current view).", () => `
-- Same drug, different tier across published formularies
SELECT a.display_name, a.formulary_code AS formulary_a, a.tier_level AS tier_a, b.formulary_code AS formulary_b, b.tier_level AS tier_b
FROM v_current_formulary a
JOIN v_current_formulary b ON b.drug_id = a.drug_id AND b.formulary_code > a.formulary_code
WHERE a.tier_level <> b.tier_level
ORDER BY a.display_name, a.formulary_code
LIMIT 30`),
    query("mail_vs_retail", "90-day mail vs 30-day retail", "Cost of a month of therapy by tier: preferred retail 30 days against preferred mail order 90 days, per plan (CTE + join).", (d) => `
-- Is mail order cheaper per month? Compare copays per 30 days of supply
WITH retail AS (
  SELECT plan_id, tier_id, copay_amount AS copay_30 FROM cost_share
  WHERE benefit_phase_id = 2 AND pharmacy_channel_id = 1 AND days_supply = 30 AND cost_type = 'copay'
), mail AS (
  SELECT plan_id, tier_id, copay_amount AS copay_90 FROM cost_share
  WHERE benefit_phase_id = 2 AND pharmacy_channel_id = 3 AND days_supply = 90 AND cost_type = 'copay'
)
SELECT p.plan_key, t.tier_level, r.copay_30, ${d.round("m.copay_90 / 3.0")} AS mail_per_30_days,
       ${d.round("r.copay_30 - m.copay_90 / 3.0")} AS monthly_saving
FROM retail r JOIN mail m ON m.plan_id = r.plan_id AND m.tier_id = r.tier_id
JOIN plan p ON p.id = r.plan_id JOIN tier t ON t.id = r.tier_id
WHERE r.copay_30 > 0
ORDER BY monthly_saving DESC, p.plan_key, t.tier_level
LIMIT 25`),
    query("exception_outcomes", "Exception approval rates", "Approval and SLA performance by request type and urgency (CASE aggregation).", (d) => `
-- Coverage determinations: how often approved, and how often late?
SELECT request_type, urgency, COUNT(*) AS requests,
       ${d.round("100.0 * SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) / NULLIF(SUM(CASE WHEN status IN ('approved','denied') THEN 1 ELSE 0 END), 0)", 1)} AS approval_pct,
       SUM(missed_sla) AS missed_sla
FROM v_exception_turnaround
GROUP BY request_type, urgency
ORDER BY requests DESC`),
    query("reject_reasons", "Claim rejects by reason and month", "Reject codes (75 PA required, 76 plan limit, 70 not covered, ...) by month with a running reject rate.", (d) => `
-- Why are claims rejected? Reject-code mix by month
WITH m AS (
  SELECT ${d.ym("fill_date")} AS month, COUNT(*) AS claims,
         SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected,
         SUM(CASE WHEN reject_code = '75' THEN 1 ELSE 0 END) AS pa_required,
         SUM(CASE WHEN reject_code = '76' THEN 1 ELSE 0 END) AS plan_limit
  FROM rx_claim GROUP BY ${d.ym("fill_date")}
)
SELECT month, claims, rejected, pa_required, plan_limit,
       ${d.round("100.0 * rejected / claims", 2)} AS reject_pct,
       ${d.round("100.0 * SUM(rejected) OVER (ORDER BY month) / SUM(claims) OVER (ORDER BY month)", 2)} AS cumulative_reject_pct
FROM m ORDER BY month`),
    query("specialty_spend", "Specialty drug spend ranking", "Plan spend on specialty-tier drugs with running share, ranked (window functions over joins of 6 tables).", (d) => `
-- Where does the money go? Specialty (tier 5) spend by drug
SELECT i.generic_name, tc.name AS therapeutic_class, COUNT(*) AS claims, ${d.round("SUM(c.plan_paid)")} AS plan_paid,
       ${d.round("100.0 * SUM(c.plan_paid) / SUM(SUM(c.plan_paid)) OVER ()", 1)} AS pct_of_specialty,
       RANK() OVER (ORDER BY SUM(c.plan_paid) DESC) AS spend_rank
FROM rx_claim c
JOIN drug d ON d.id = c.drug_id
JOIN ingredient i ON i.id = d.ingredient_id
JOIN therapeutic_class tc ON tc.id = i.therapeutic_class_id
JOIN tier t ON t.id = c.tier_id AND t.tier_level = 5
WHERE c.status = 'paid'
GROUP BY i.generic_name, tc.name
ORDER BY plan_paid DESC LIMIT 15`),
    query("new_additions", "Drugs added between versions", "Anti-join of consecutive versions: drugs present in the newest version but not the one before.", () => `
-- What was added in the latest version of each formulary? (NOT EXISTS anti-join)
SELECT f.formulary_code, fv.version_no, d.display_name, t.name AS tier
FROM formulary_drug fd
JOIN formulary_version fv ON fv.id = fd.formulary_version_id
JOIN formulary f ON f.id = fv.formulary_id
JOIN drug d ON d.id = fd.drug_id
JOIN tier t ON t.id = fd.tier_id
WHERE fv.version_no > 1
  AND NOT EXISTS (
    SELECT 1 FROM formulary_drug p JOIN formulary_version pv ON pv.id = p.formulary_version_id
    WHERE pv.formulary_id = fv.formulary_id AND pv.version_no = fv.version_no - 1 AND p.drug_id = fd.drug_id)
ORDER BY f.formulary_code, fv.version_no, d.display_name
LIMIT 30`),
    query("pharmacy_access", "Preferred pharmacy access by state", "Preferred versus standard network membership per state.", (d) => `
-- Network adequacy snapshot: pharmacies per state and share in preferred tier
SELECT ph.state, COUNT(DISTINCT ph.id) AS pharmacies,
       SUM(CASE WHEN m.network_tier = 'preferred' THEN 1 ELSE 0 END) AS preferred_memberships,
       ${d.round("100.0 * SUM(CASE WHEN m.network_tier = 'preferred' THEN 1 ELSE 0 END) / COUNT(*)", 1)} AS preferred_pct
FROM pharmacy ph JOIN pharmacy_network_member m ON m.pharmacy_id = ph.id
WHERE ph.status = 'active'
GROUP BY ph.state
HAVING COUNT(DISTINCT ph.id) >= 2
ORDER BY pharmacies DESC, ph.state LIMIT 20`),
    query("bvd_candidates", "Part B vs D candidates", "Drugs that need a B-vs-D determination, with how often they were claimed.", () => `
-- Drugs subject to a Part B vs Part D determination and their utilization
SELECT i.generic_name, tc.name AS therapeutic_class, COUNT(c.id) AS claims,
       SUM(CASE WHEN c.status = 'paid' THEN 1 ELSE 0 END) AS paid_claims
FROM ingredient i
JOIN therapeutic_class tc ON tc.id = i.therapeutic_class_id
JOIN drug d ON d.ingredient_id = i.id
LEFT JOIN rx_claim c ON c.drug_id = d.id
WHERE i.part_b_candidate
GROUP BY i.generic_name, tc.name
ORDER BY claims DESC, i.generic_name`),
  ],
  triggers: {
    sqlite: [
      `CREATE TRIGGER trg_fv_status_audit AFTER UPDATE OF status ON formulary_version FOR EACH ROW WHEN OLD.status <> NEW.status BEGIN INSERT INTO audit_event (occurred_at, actor_id, entity_type, entity_id, action, details) VALUES (CURRENT_TIMESTAMP, 1, 'formulary_version', NEW.id, 'status_change', json_object('from', OLD.status, 'to', NEW.status)); END`,
      `CREATE TRIGGER trg_fd_locked BEFORE UPDATE ON formulary_drug FOR EACH ROW WHEN (SELECT status FROM formulary_version WHERE id = OLD.formulary_version_id) IN ('published', 'retired') BEGIN SELECT RAISE(ABORT, 'published formulary versions are immutable'); END`,
    ],
    mysql: [
      "CREATE TRIGGER trg_fv_status_audit AFTER UPDATE ON formulary_version FOR EACH ROW BEGIN IF OLD.status <> NEW.status THEN INSERT INTO audit_event (occurred_at, actor_id, entity_type, entity_id, action, details) VALUES (NOW(), 1, 'formulary_version', NEW.id, 'status_change', JSON_OBJECT('from', OLD.status, 'to', NEW.status)); END IF; END",
      "CREATE TRIGGER trg_fd_locked BEFORE UPDATE ON formulary_drug FOR EACH ROW BEGIN IF (SELECT status FROM formulary_version WHERE id = OLD.formulary_version_id) IN ('published', 'retired') THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'published formulary versions are immutable'; END IF; END",
    ],
    postgres: [
      "CREATE FUNCTION fv_status_audit() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN IF OLD.status <> NEW.status THEN INSERT INTO audit_event (occurred_at, actor_id, entity_type, entity_id, action, details) VALUES (CURRENT_TIMESTAMP, 1, 'formulary_version', NEW.id, 'status_change', jsonb_build_object('from', OLD.status, 'to', NEW.status)); END IF; RETURN NEW; END $fn$",
      "CREATE TRIGGER trg_fv_status_audit AFTER UPDATE ON formulary_version FOR EACH ROW EXECUTE FUNCTION fv_status_audit()",
      "CREATE FUNCTION fd_locked() RETURNS trigger LANGUAGE plpgsql AS $fn$ BEGIN IF (SELECT status FROM formulary_version WHERE id = OLD.formulary_version_id) IN ('published', 'retired') THEN RAISE EXCEPTION 'published formulary versions are immutable'; END IF; RETURN NEW; END $fn$",
      "CREATE TRIGGER trg_fd_locked BEFORE UPDATE ON formulary_drug FOR EACH ROW EXECUTE FUNCTION fd_locked()",
    ],
    postgresFunctions: ["fv_status_audit()", "fd_locked()"],
  },
});
