/**
 * Utility helpers to parse clinical biomarkers, calculate health metrics,
 * and provide grounded reference classifications.
 */

export interface Biomarker {
  name: string;
  value: string;
  unit: string;
  status: string;
}

export interface ReportItem {
  id: string;
  filename: string;
  created_at: string;
  health_score: number | null;
  biomarkers: Biomarker[];
}

export interface VitalLog {
  id: string;
  blood_sugar?: number | null;
  sugar_type?: string;
  hba1c?: number | null;
  hemoglobin?: number | null;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  weight?: number | null;
  heart_rate?: number | null;
  notes?: string | null;
  recorded_at: string;
}

/**
 * Extracts a numeric value for a biomarker given a list of name keywords.
 */
export const extractBiomarkerValue = (
  biomarkers: Biomarker[] | undefined,
  keywords: string[]
): number | null => {
  if (!biomarkers) return null;
  for (const bm of biomarkers) {
    const bmName = (bm.name || '').toLowerCase();
    if (keywords.some((kw) => bmName.includes(kw.toLowerCase()))) {
      const cleanVal = (bm.value || '').replace(/,/g, '');
      const match = cleanVal.match(/[\d.]+/);
      if (match) {
        const parsed = parseFloat(match[0]);
        if (!isNaN(parsed)) return parsed;
      }
    }
  }
  return null;
};

/**
 * Blood Sugar Classification (ADA Guidelines)
 * Fasting: <100 Normal, 100-125 Pre-diabetes, >=126 Diabetes
 * Post-meal: <140 Normal, 140-199 Pre-diabetes, >=200 Diabetes
 */
export const getGlucoseStatus = (val: number | null, type: string = 'fasting') => {
  if (val === null || val === undefined) return null;
  const isPostMeal = type === 'post_meal' || type === 'post_prandial' || type === 'ppbs';

  if (isPostMeal) {
    if (val < 140) {
      return {
        category: 'Normal Post-Meal',
        color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800',
        badge: 'Optimal',
        tip: 'Excellent glycemic control following meals.',
      };
    }
    if (val <= 199) {
      return {
        category: 'Impaired Glucose Tolerance',
        color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
        badge: 'Pre-diabetic Range',
        tip: 'Consider moderating high-glycemic carbohydrates and staying active.',
      };
    }
    return {
      category: 'Elevated Post-Meal Glucose',
      color: 'text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
      badge: 'High Alert',
      tip: 'Consult your clinician for comprehensive diabetic evaluation.',
    };
  }

  // Fasting glucose
  if (val < 70) {
    return {
      category: 'Hypoglycemia Alert',
      color: 'text-blue-600 bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800',
      badge: 'Low Sugar',
      tip: 'Blood glucose is below normal fasting baseline.',
    };
  }
  if (val <= 99) {
    return {
      category: 'Normal Fasting Glucose',
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800',
      badge: 'Normal (<100 mg/dL)',
      tip: 'Healthy fasting glucose control.',
    };
  }
  if (val <= 125) {
    return {
      category: 'Impaired Fasting Glucose',
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
      badge: 'Pre-diabetes (100–125)',
      tip: 'Lifestyle interventions and physical activity can help restore optimal insulin sensitivity.',
    };
  }
  return {
    category: 'Elevated Fasting Glucose',
    color: 'text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
    badge: 'High (≥126 mg/dL)',
    tip: 'Consistent fasting readings ≥126 mg/dL warrant clinical consultation.',
  };
};

/**
 * HbA1c Classification
 * <5.7% Normal, 5.7-6.4% Pre-diabetes, >=6.5% Diabetes
 */
export const getHba1cDetails = (val: number | null) => {
  if (val === null || val === undefined) return null;
  // Estimated average glucose formula: eAG = 28.7 * HbA1c - 46.7
  const eag = Math.round(28.7 * val - 46.7);

  if (val < 5.7) {
    return {
      category: 'Normal HbA1c',
      eag,
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800',
      badge: 'Normal (<5.7%)',
      description: `Reflects an estimated average glucose of ~${eag} mg/dL over the past 3 months.`,
    };
  }
  if (val <= 6.4) {
    return {
      category: 'Pre-diabetes Range',
      eag,
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
      badge: 'Pre-diabetes (5.7–6.4%)',
      description: `Reflects an estimated average glucose of ~${eag} mg/dL over the past 3 months.`,
    };
  }
  return {
    category: 'Elevated HbA1c',
    eag,
    color: 'text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
    badge: 'Diabetic Range (≥6.5%)',
    description: `Reflects an estimated average glucose of ~${eag} mg/dL over the past 3 months.`,
  };
};

/**
 * Hemoglobin Classification (WHO Guidelines)
 * Men: 13.5–17.5 g/dL Normal
 * Women: 12.0–15.5 g/dL Normal
 */
export const getHemoglobinStatus = (val: number | null, gender?: string | null) => {
  if (val === null || val === undefined) return null;
  const isMale = (gender || '').toLowerCase().startsWith('m');
  const normalMin = isMale ? 13.5 : 12.0;
  const normalMax = isMale ? 17.5 : 16.0;

  if (val >= normalMin && val <= normalMax) {
    return {
      category: 'Optimal Hemoglobin',
      badge: 'Normal Range',
      color: 'text-cyan-600 bg-cyan-50 dark:bg-cyan-950/20 border-cyan-200 dark:border-cyan-800',
      tip: 'Healthy oxygen carrying capacity in red blood cells.',
    };
  }
  if (val > normalMax) {
    return {
      category: 'Elevated Hemoglobin',
      badge: 'High (>17.5 g/dL)',
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
      tip: 'May reflect hemoconcentration, dehydration, or high-altitude adaptation.',
    };
  }
  if (val >= 10.0) {
    return {
      category: 'Mild Anemia',
      badge: 'Mild Low (10–12 g/dL)',
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
      tip: 'Mild reduction in hemoglobin. Ensure sufficient dietary iron, folate, and Vitamin B12.',
    };
  }
  if (val >= 7.0) {
    return {
      category: 'Moderate Anemia',
      badge: 'Moderate Low (7–10 g/dL)',
      color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-800',
      tip: 'Moderate anemia detected. Recommend comprehensive iron panel and clinician evaluation.',
    };
  }
  return {
    category: 'Severe Anemia Alert',
    badge: 'Critical Low (<7 g/dL)',
    color: 'text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
    tip: 'Critically low hemoglobin level requiring prompt medical attention.',
  };
};

/**
 * Lipid / Cardiovascular Risk Assessment
 */
export const getLipidStatus = (chol: number | null, ldl: number | null, hdl: number | null) => {
  if (chol === null && ldl === null && hdl === null) return null;
  const ratio = ldl && hdl && hdl > 0 ? (ldl / hdl).toFixed(1) : null;

  if (chol && chol > 240) {
    return {
      risk: 'High Cardiovascular Risk',
      badge: 'High Total Cholesterol',
      color: 'text-red-600 bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800',
      ratio,
    };
  }
  if (chol && chol >= 200) {
    return {
      risk: 'Borderline High Risk',
      badge: 'Borderline (200–239 mg/dL)',
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800',
      ratio,
    };
  }
  return {
    risk: 'Desirable Lipid Profile',
    badge: 'Optimal (<200 mg/dL)',
    color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800',
    ratio,
  };
};

/**
 * Blood Pressure AHA Category
 */
export const getBpStatus = (systolic: number | null, diastolic: number | null) => {
  if (!systolic || !diastolic) return null;
  if (systolic < 120 && diastolic < 80) {
    return {
      category: 'Normal BP',
      color: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20',
      badge: 'Optimal (<120/80)',
    };
  }
  if (systolic <= 129 && diastolic < 80) {
    return {
      category: 'Elevated BP',
      color: 'text-amber-600 bg-amber-50 dark:bg-amber-950/20',
      badge: 'Elevated (120–129)',
    };
  }
  if (systolic <= 139 || diastolic <= 89) {
    return {
      category: 'Stage 1 Hypertension',
      color: 'text-orange-600 bg-orange-50 dark:bg-orange-950/20',
      badge: 'Stage 1 (130–139/80–89)',
    };
  }
  return {
    category: 'Stage 2 Hypertension',
    color: 'text-red-600 bg-red-50 dark:bg-red-950/20',
    badge: 'Stage 2 (≥140/90)',
  };
};

/**
 * Text Report Parsing Engine
 * Extracts numeric biomarkers from free-form clinical notes, SMS lab alerts,
 * and text laboratory reports.
 */
export interface ExtractedClinicalData {
  biomarkers: Biomarker[];
  metrics: {
    fbs: number | null;
    ppbs: number | null;
    rbs: number | null;
    hba1c: number | null;
    hemoglobin: number | null;
    rbc: number | null;
    hematocrit: number | null;
    platelets: number | null;
    wbc: number | null;
    totalCholesterol: number | null;
    ldl: number | null;
    hdl: number | null;
    triglycerides: number | null;
    creatinine: number | null;
    bun: number | null;
    alt: number | null;
    ast: number | null;
    systolicBp: number | null;
    diastolicBp: number | null;
    heartRate: number | null;
    weight: number | null;
  };
}

export const parseBiomarkersFromText = (rawText: string): ExtractedClinicalData => {
  const text = rawText || '';
  const lines = text.split(/\r?\n/);
  const biomarkers: Biomarker[] = [];

  const metrics: ExtractedClinicalData['metrics'] = {
    fbs: null,
    ppbs: null,
    rbs: null,
    hba1c: null,
    hemoglobin: null,
    rbc: null,
    hematocrit: null,
    platelets: null,
    wbc: null,
    totalCholesterol: null,
    ldl: null,
    hdl: null,
    triglycerides: null,
    creatinine: null,
    bun: null,
    alt: null,
    ast: null,
    systolicBp: null,
    diastolicBp: null,
    heartRate: null,
    weight: null,
  };

  const extractFirstNumber = (str: string): number | null => {
    const m = str.match(/[\d]+(?:[.,]\d+)?/);
    if (!m) return null;
    const n = parseFloat(m[0].replace(/,/g, ''));
    return isNaN(n) ? null : n;
  };

  // Helper patterns
  const patterns: Array<{
    keys: string[];
    assign: (val: number, line: string) => void;
    unitDefault: string;
    label: string;
    refRangeDefault?: string;
  }> = [
    {
      keys: ['fasting blood sugar', 'fasting glucose', 'fbs'],
      assign: (val) => { metrics.fbs = val; },
      unitDefault: 'mg/dL',
      label: 'Fasting Blood Sugar (FBS)',
      refRangeDefault: '70 - 100 mg/dL',
    },
    {
      keys: ['post prandial', 'post-prandial', 'ppbs', 'post meal glucose', 'post-meal sugar'],
      assign: (val) => { metrics.ppbs = val; },
      unitDefault: 'mg/dL',
      label: 'Post-Prandial Glucose (PPBS)',
      refRangeDefault: '< 140 mg/dL',
    },
    {
      keys: ['random blood sugar', 'rbs', 'blood glucose', 'glucose'],
      assign: (val) => { if (!metrics.fbs && !metrics.ppbs) metrics.rbs = val; },
      unitDefault: 'mg/dL',
      label: 'Blood Glucose',
      refRangeDefault: '70 - 140 mg/dL',
    },
    {
      keys: ['hba1c', 'glycated hemoglobin', 'glycohemoglobin', 'a1c'],
      assign: (val) => { metrics.hba1c = val; },
      unitDefault: '%',
      label: 'HbA1c (Glycated Hemoglobin)',
      refRangeDefault: '< 5.7 %',
    },
    {
      keys: ['total hemoglobin', 'hemoglobin', 'haemoglobin', 'hb', 'hgb'],
      assign: (val) => { metrics.hemoglobin = val; },
      unitDefault: 'g/dL',
      label: 'Hemoglobin (Hb)',
      refRangeDefault: '13.0 - 17.5 g/dL',
    },
    {
      keys: ['rbc count', 'red blood cell', 'rbc', 'erythrocyte'],
      assign: (val) => { metrics.rbc = val; },
      unitDefault: 'million/mcL',
      label: 'RBC Count',
      refRangeDefault: '4.5 - 5.5 million/mcL',
    },
    {
      keys: ['hematocrit', 'pcv', 'packed cell volume', 'hct'],
      assign: (val) => { metrics.hematocrit = val; },
      unitDefault: '%',
      label: 'Hematocrit (PCV)',
      refRangeDefault: '40 - 50 %',
    },
    {
      keys: ['platelet count', 'platelets', 'plt'],
      assign: (val) => { metrics.platelets = val; },
      unitDefault: '/mcL',
      label: 'Platelet Count',
      refRangeDefault: '150,000 - 450,000 /mcL',
    },
    {
      keys: ['total leukocyte', 'total leucocyte', 'wbc count', 'wbc', 'tlc', 'white blood cell'],
      assign: (val) => { metrics.wbc = val; },
      unitDefault: '/mcL',
      label: 'WBC (Total Leukocyte Count)',
      refRangeDefault: '4,000 - 11,000 /mcL',
    },
    {
      keys: ['total cholesterol', 'cholesterol total', 'cholesterol'],
      assign: (val) => { metrics.totalCholesterol = val; },
      unitDefault: 'mg/dL',
      label: 'Total Cholesterol',
      refRangeDefault: '< 200 mg/dL',
    },
    {
      keys: ['ldl cholesterol', 'ldl-c', 'ldl'],
      assign: (val) => { metrics.ldl = val; },
      unitDefault: 'mg/dL',
      label: 'LDL Cholesterol',
      refRangeDefault: '< 100 mg/dL',
    },
    {
      keys: ['hdl cholesterol', 'hdl-c', 'hdl'],
      assign: (val) => { metrics.hdl = val; },
      unitDefault: 'mg/dL',
      label: 'HDL Cholesterol',
      refRangeDefault: '> 40 mg/dL',
    },
    {
      keys: ['triglycerides', 'triglyceride', 'tg'],
      assign: (val) => { metrics.triglycerides = val; },
      unitDefault: 'mg/dL',
      label: 'Triglycerides',
      refRangeDefault: '< 150 mg/dL',
    },
    {
      keys: ['serum creatinine', 'creatinine'],
      assign: (val) => { metrics.creatinine = val; },
      unitDefault: 'mg/dL',
      label: 'Serum Creatinine',
      refRangeDefault: '0.7 - 1.3 mg/dL',
    },
    {
      keys: ['blood urea nitrogen', 'urea', 'bun'],
      assign: (val) => { metrics.bun = val; },
      unitDefault: 'mg/dL',
      label: 'Blood Urea Nitrogen (BUN)',
      refRangeDefault: '7 - 20 mg/dL',
    },
    {
      keys: ['sgpt', 'alt', 'alanine aminotransferase'],
      assign: (val) => { metrics.alt = val; },
      unitDefault: 'U/L',
      label: 'SGPT / ALT',
      refRangeDefault: '7 - 56 U/L',
    },
    {
      keys: ['sgot', 'ast', 'aspartate aminotransferase'],
      assign: (val) => { metrics.ast = val; },
      unitDefault: 'U/L',
      label: 'SGOT / AST',
      refRangeDefault: '10 - 40 U/L',
    },
  ];

  // 1. Check for Blood Pressure "120/80" or "BP: 120/80"
  const bpMatch = text.match(/(?:bp|blood\s*pressure)?[:\s]*(\d{2,3})\s*\/\s*(\d{2,3})/i);
  if (bpMatch) {
    const sys = parseInt(bpMatch[1], 10);
    const dia = parseInt(bpMatch[2], 10);
    if (!isNaN(sys) && !isNaN(dia) && sys > 60 && sys < 260 && dia > 40 && dia < 160) {
      metrics.systolicBp = sys;
      metrics.diastolicBp = dia;
      biomarkers.push({
        name: 'Blood Pressure',
        value: `${sys}/${dia}`,
        unit: 'mmHg',
        status: sys < 120 && dia < 80 ? 'Normal' : sys < 130 ? 'Elevated' : 'High',
      });
    }
  }

  // 2. Check for Heart Rate / Pulse
  const hrMatch = text.match(/(?:heart\s*rate|pulse|pulse\s*rate|hr)[:\s]*(\d{2,3})/i);
  if (hrMatch) {
    const hr = parseInt(hrMatch[1], 10);
    if (!isNaN(hr) && hr > 40 && hr < 220) {
      metrics.heartRate = hr;
      biomarkers.push({
        name: 'Heart Rate',
        value: `${hr}`,
        unit: 'bpm',
        status: hr >= 60 && hr <= 100 ? 'Normal' : hr < 60 ? 'Low' : 'High',
      });
    }
  }

  // 3. Scan line by line for structured or colon-delimited tests
  for (const line of lines) {
    const lower = line.toLowerCase();
    if (lower.length < 3) continue;

    for (const pat of patterns) {
      const matchedKey = pat.keys.find((k) => lower.includes(k));
      if (matchedKey) {
        // Look after the key name for numeric values
        const sub = line.slice(lower.indexOf(matchedKey) + matchedKey.length);
        const val = extractFirstNumber(sub);
        if (val !== null && val > 0) {
          pat.assign(val, line);

          // Infer status
          let status = 'Normal';
          if (lower.includes('high') || lower.includes('elevated') || lower.includes('critical')) {
            status = 'High';
          } else if (lower.includes('low') || lower.includes('mild anemia')) {
            status = 'Low';
          }

          if (!biomarkers.some((b) => b.name === pat.label)) {
            biomarkers.push({
              name: pat.label,
              value: `${val}`,
              unit: pat.unitDefault,
              status,
            });
          }
          break;
        }
      }
    }
  }

  return { biomarkers, metrics };
};

/**
 * Multi-Method Clinical Operations & Executive Analysis Suite
 */
export interface ClinicalExecutiveSummary {
  status: 'Optimal' | 'Mild Attention' | 'Clinical Alert';
  badge: string;
  briefSummary: string;
  highlights: string[];
  attentionItems: string[];
  primaryAction: string;
}

export interface OrganSystemItem {
  system: string;
  badge: string;
  statusColor: string;
  finding: string;
  keyValues: string;
}

export interface ClinicalOperationsResult {
  executiveSummary: ClinicalExecutiveSummary;
  organSystems: OrganSystemItem[];
  calculations: {
    aip: number | null; // Atherogenic Index of Plasma
    aipCategory: string | null;
    cholHdlRatio: number | null;
    ldlHdlRatio: number | null;
    nonHdl: number | null;
    eag: number | null;
    eGfr: number | null;
    eGfrStage: string | null;
    map: number | null; // Mean Arterial Pressure
    pulsePressure: number | null;
    deRitisRatio: number | null;
    healthScore: number;
  };
  doctorQuestions: string[];
  lifestylePlan: {
    diet: string[];
    lifestyle: string[];
    followUp: string;
  };
}

export const computeComprehensiveClinicalOperations = (
  extracted: ExtractedClinicalData,
  patientAge: number = 40
): ClinicalOperationsResult => {
  const m = extracted.metrics;
  const highlights: string[] = [];
  const attentionItems: string[] = [];
  const organSystems: OrganSystemItem[] = [];

  let healthScore = 95;

  // 1. GLYCEMIC OPERATIONS
  let glycemicFinding = 'Normal glycemic profile.';
  let glycemicColor = 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20';
  let glycemicBadge = 'Optimal';
  const eag = m.hba1c ? Math.round(28.7 * m.hba1c - 46.7) : null;

  if (m.hba1c || m.fbs || m.ppbs) {
    const isHighSugar = (m.fbs && m.fbs >= 126) || (m.hba1c && m.hba1c >= 6.5) || (m.ppbs && m.ppbs >= 200);
    const isPreSugar = (m.fbs && m.fbs >= 100) || (m.hba1c && m.hba1c >= 5.7) || (m.ppbs && m.ppbs >= 140);

    if (isHighSugar) {
      glycemicFinding = `Elevated glycemic levels noted (FBS: ${m.fbs || '--'} mg/dL, HbA1c: ${m.hba1c || '--'}%). Suggests diabetic glycemic alert.`;
      glycemicColor = 'text-red-600 bg-red-50 dark:bg-red-950/20';
      glycemicBadge = 'Diabetic Range';
      attentionItems.push(`Blood Sugar/HbA1c elevated (Fasting ${m.fbs || '--'} mg/dL, HbA1c ${m.hba1c || '--'}%)`);
      healthScore -= 20;
    } else if (isPreSugar) {
      glycemicFinding = `Impaired fasting glucose or pre-diabetic HbA1c range (${m.hba1c ? `HbA1c ${m.hba1c}%` : ''} ${m.fbs ? `FBS ${m.fbs} mg/dL` : ''}).`;
      glycemicColor = 'text-amber-600 bg-amber-50 dark:bg-amber-950/20';
      glycemicBadge = 'Pre-Diabetes Range';
      attentionItems.push(`Borderline glucose control (HbA1c: ${m.hba1c || '--'}%, FBS: ${m.fbs || '--'} mg/dL)`);
      healthScore -= 10;
    } else {
      highlights.push(`Fasting Glucose (${m.fbs || 'Normal'} mg/dL) & HbA1c (${m.hba1c || 'Normal'}%) are within optimal targets.`);
    }

    organSystems.push({
      system: '🩸 Glycemic & Metabolic',
      badge: glycemicBadge,
      statusColor: glycemicColor,
      finding: glycemicFinding,
      keyValues: `FBS: ${m.fbs ?? '--'} mg/dL • HbA1c: ${m.hba1c ?? '--'}% • eAG: ${eag ? `${eag} mg/dL` : '--'}`,
    });
  }

  // 2. HEMATOLOGY & ANEMIA OPERATIONS
  if (m.hemoglobin || m.rbc || m.hematocrit) {
    let hbBadge = 'Optimal';
    let hbColor = 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20';
    let hbFinding = 'Healthy oxygenation and red blood cell counts.';

    if (m.hemoglobin) {
      if (m.hemoglobin < 10.0) {
        hbBadge = 'Moderate Anemia';
        hbColor = 'text-red-600 bg-red-50 dark:bg-red-950/20';
        hbFinding = `Significant drop in hemoglobin (${m.hemoglobin} g/dL). Potential oxygen-carrying capacity impairment.`;
        attentionItems.push(`Hemoglobin is low (${m.hemoglobin} g/dL) - Anemia alert`);
        healthScore -= 18;
      } else if (m.hemoglobin < 12.0) {
        hbBadge = 'Mild Anemia';
        hbColor = 'text-amber-600 bg-amber-50 dark:bg-amber-950/20';
        hbFinding = `Mild anemia observed (${m.hemoglobin} g/dL). Recommend iron and folate evaluation.`;
        attentionItems.push(`Mild anemia detected (Hb: ${m.hemoglobin} g/dL)`);
        healthScore -= 8;
      } else {
        highlights.push(`Hemoglobin (${m.hemoglobin} g/dL) confirms strong oxygenation and healthy red cells.`);
      }
    }

    organSystems.push({
      system: '🧪 Hematology & Oxygenation',
      badge: hbBadge,
      statusColor: hbColor,
      finding: hbFinding,
      keyValues: `Hb: ${m.hemoglobin ?? '--'} g/dL • RBC: ${m.rbc ?? '--'} M/mcL • HCT: ${m.hematocrit ?? '--'}%`,
    });
  }

  // 3. CARDIOVASCULAR & LIPID CALCULATIONS
  let aip: number | null = null;
  let aipCategory: string | null = null;
  const cholHdlRatio = m.totalCholesterol && m.hdl && m.hdl > 0 ? parseFloat((m.totalCholesterol / m.hdl).toFixed(2)) : null;
  const ldlHdlRatio = m.ldl && m.hdl && m.hdl > 0 ? parseFloat((m.ldl / m.hdl).toFixed(2)) : null;
  const nonHdl = m.totalCholesterol && m.hdl ? m.totalCholesterol - m.hdl : null;

  if (m.triglycerides && m.hdl && m.hdl > 0 && m.triglycerides > 0) {
    // Atherogenic Index of Plasma = log10(TG / HDL)
    aip = parseFloat(Math.log10(m.triglycerides / m.hdl).toFixed(2));
    if (aip < 0.11) aipCategory = 'Low Cardiovascular Risk';
    else if (aip <= 0.21) aipCategory = 'Intermediate Risk';
    else aipCategory = 'High Cardiovascular Atherogenic Risk';
  }

  if (m.totalCholesterol || m.ldl || m.triglycerides) {
    let lipidBadge = 'Optimal';
    let lipidColor = 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20';
    let lipidFinding = 'Cardiovascular lipid markers and atherogenic ratios are well controlled.';

    if ((m.totalCholesterol && m.totalCholesterol >= 240) || (m.ldl && m.ldl >= 160) || (m.triglycerides && m.triglycerides >= 200)) {
      lipidBadge = 'High Lipid Alert';
      lipidColor = 'text-red-600 bg-red-50 dark:bg-red-950/20';
      lipidFinding = 'Elevated lipid fractions noted. Atherogenic plaque accumulation risk warrants intervention.';
      attentionItems.push(`Lipid panel elevated (Total Chol: ${m.totalCholesterol || '--'} mg/dL, Triglycerides: ${m.triglycerides || '--'} mg/dL)`);
      healthScore -= 16;
    } else if ((m.totalCholesterol && m.totalCholesterol >= 200) || (m.ldl && m.ldl >= 100) || (m.triglycerides && m.triglycerides >= 150)) {
      lipidBadge = 'Borderline';
      lipidColor = 'text-amber-600 bg-amber-50 dark:bg-amber-950/20';
      lipidFinding = 'Borderline lipid numbers. Early dietary and exercise adjustments will prevent escalation.';
      attentionItems.push(`Borderline lipids (Total Chol: ${m.totalCholesterol || '--'} mg/dL, LDL: ${m.ldl || '--'} mg/dL)`);
      healthScore -= 8;
    } else {
      highlights.push(`Cardio Lipid Profile is desirable (Chol: ${m.totalCholesterol || 'Normal'} mg/dL, HDL: ${m.hdl || 'Good'} mg/dL).`);
    }

    organSystems.push({
      system: '🫀 Cardio-Lipid Profile',
      badge: lipidBadge,
      statusColor: lipidColor,
      finding: lipidFinding,
      keyValues: `Chol: ${m.totalCholesterol ?? '--'} • LDL: ${m.ldl ?? '--'} • HDL: ${m.hdl ?? '--'} • TG: ${m.triglycerides ?? '--'} mg/dL`,
    });
  }

  // 4. RENAL & HEPATIC OPERATIONS
  let eGfr: number | null = null;
  let eGfrStage: string | null = null;
  if (m.creatinine && m.creatinine > 0) {
    // Estimated eGFR approximation for screening (CKD staging baseline)
    const baselineGfr = 140 - patientAge;
    eGfr = Math.round(Math.max(15, Math.min(130, (baselineGfr * 0.9) / m.creatinine)));
    if (eGfr >= 90) eGfrStage = 'Stage 1: Normal GFR (≥90 mL/min)';
    else if (eGfr >= 60) eGfrStage = 'Stage 2: Mildly Decreased (60-89 mL/min)';
    else if (eGfr >= 30) eGfrStage = 'Stage 3: Moderate CKD (30-59 mL/min)';
    else eGfrStage = 'Stage 4/5: Severely Decreased (<30 mL/min)';
  }

  const deRitisRatio = m.ast && m.alt && m.alt > 0 ? parseFloat((m.ast / m.alt).toFixed(2)) : null;

  if (m.creatinine || m.alt || m.ast) {
    let renalBadge = 'Optimal';
    let renalColor = 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20';
    let renalFinding = 'Kidney filtration and liver metabolic enzymes are normal.';

    if (m.creatinine && m.creatinine > 1.4) {
      renalBadge = 'Elevated Creatinine';
      renalColor = 'text-red-600 bg-red-50 dark:bg-red-950/20';
      renalFinding = `Serum creatinine elevated (${m.creatinine} mg/dL). Potential reduction in glomerular filtration.`;
      attentionItems.push(`Creatinine elevated (${m.creatinine} mg/dL) - Renal screen recommended`);
      healthScore -= 15;
    } else if (m.alt && m.alt > 56) {
      renalBadge = 'Elevated ALT';
      renalColor = 'text-amber-600 bg-amber-50 dark:bg-amber-950/20';
      renalFinding = `Liver transaminase ALT elevated (${m.alt} U/L). Check for hepatic stress or metabolic burden.`;
      attentionItems.push(`Liver enzyme ALT elevated (${m.alt} U/L)`);
      healthScore -= 8;
    } else {
      highlights.push(`Renal filtration (Creatinine: ${m.creatinine || 'Optimal'} mg/dL) & Liver enzymes are healthy.`);
    }

    organSystems.push({
      system: '🔬 Renal & Liver Function',
      badge: renalBadge,
      statusColor: renalColor,
      finding: renalFinding,
      keyValues: `Creatinine: ${m.creatinine ?? '--'} mg/dL • eGFR: ${eGfr ? `~${eGfr} mL/min` : '--'} • ALT: ${m.alt ?? '--'} U/L`,
    });
  }

  // 5. HEMODYNAMICS (BP & VITALS)
  let map: number | null = null;
  let pulsePressure: number | null = null;
  if (m.systolicBp && m.diastolicBp) {
    map = Math.round((m.systolicBp + 2 * m.diastolicBp) / 3);
    pulsePressure = m.systolicBp - m.diastolicBp;

    let bpBadge = 'Optimal';
    let bpColor = 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20';
    let bpFinding = 'Blood pressure is within standard normal parameters.';

    if (m.systolicBp >= 140 || m.diastolicBp >= 90) {
      bpBadge = 'Stage 2 HTN';
      bpColor = 'text-red-600 bg-red-50 dark:bg-red-950/20';
      bpFinding = `High blood pressure reading (${m.systolicBp}/${m.diastolicBp} mmHg). Clinical consultation advised.`;
      attentionItems.push(`Hypertension alert (${m.systolicBp}/${m.diastolicBp} mmHg)`);
      healthScore -= 12;
    } else if (m.systolicBp >= 130 || m.diastolicBp >= 80) {
      bpBadge = 'Stage 1 HTN';
      bpColor = 'text-amber-600 bg-amber-50 dark:bg-amber-950/20';
      bpFinding = `Blood pressure is mildly elevated (${m.systolicBp}/${m.diastolicBp} mmHg).`;
      attentionItems.push(`Blood pressure mildly high (${m.systolicBp}/${m.diastolicBp} mmHg)`);
      healthScore -= 6;
    } else {
      highlights.push(`Blood pressure (${m.systolicBp}/${m.diastolicBp} mmHg) is in the optimal AHA range.`);
    }

    organSystems.push({
      system: '⚡ Hemodynamics & Vitals',
      badge: bpBadge,
      statusColor: bpColor,
      finding: bpFinding,
      keyValues: `BP: ${m.systolicBp}/${m.diastolicBp} mmHg • MAP: ${map} mmHg • Pulse: ${m.heartRate ?? '--'} bpm`,
    });
  }

  healthScore = Math.max(35, Math.min(100, healthScore));

  // Determine overall status
  let overallStatus: 'Optimal' | 'Mild Attention' | 'Clinical Alert' = 'Optimal';
  let overallBadge = 'Overall Healthy';
  if (attentionItems.length >= 2 || healthScore < 70) {
    overallStatus = 'Clinical Alert';
    overallBadge = 'Clinical Follow-up Recommended';
  } else if (attentionItems.length === 1 || healthScore < 85) {
    overallStatus = 'Mild Attention';
    overallBadge = 'Mild Monitoring Advised';
  }

  // Clear & Brief Executive Summary Generation
  let briefSummary = '';
  if (overallStatus === 'Optimal') {
    briefSummary = `Your clinical text report shows excellent physiological metrics across evaluated systems. Key parameters including ${highlights.slice(0, 2).join(' and ') || 'blood sugar, hemoglobin, and lipids'} are within optimal laboratory targets. Maintain your current active lifestyle and balanced nutrition.`;
  } else if (overallStatus === 'Mild Attention') {
    briefSummary = `Your report is generally stable with 1 area of mild variation: ${attentionItems[0]}. Other key organ markers remain well within healthy ranges. Targeted lifestyle habits and repeat routine testing in 3 months are recommended.`;
  } else {
    briefSummary = `Your clinical report highlights areas requiring medical attention: ${attentionItems.slice(0, 2).join(', ')}. While these findings indicate physiological stress, prompt follow-up with your physician and guided intervention can effectively normalize these parameters.`;
  }

  const primaryAction =
    overallStatus === 'Optimal'
      ? 'Continue current balanced routine; schedule routine annual wellness check.'
      : overallStatus === 'Mild Attention'
      ? 'Adopt nutritional modifications and repeat specific biomarker panel in 8–12 weeks.'
      : 'Share these results with your healthcare provider for clinical diagnosis and customized care.';

  // Targeted Doctor Questions
  const doctorQuestions: string[] = [];
  if (m.hba1c && m.hba1c >= 5.7) {
    doctorQuestions.push(`"My HbA1c is ${m.hba1c}%. Do you recommend an oral glucose tolerance test or early dietary intervention?"`);
  }
  if (m.hemoglobin && m.hemoglobin < 12.0) {
    doctorQuestions.push(`"My hemoglobin is ${m.hemoglobin} g/dL. Would you recommend checking serum ferritin, iron saturation, or Vitamin B12?"`);
  }
  if (m.ldl && m.ldl > 130) {
    doctorQuestions.push(`"My LDL cholesterol is ${m.ldl} mg/dL. What target level should we aim for based on my overall cardiovascular risk profile?"`);
  }
  if (m.creatinine && m.creatinine > 1.2) {
    doctorQuestions.push(`"My serum creatinine is ${m.creatinine} mg/dL. Should we do a spot urine albumin-to-creatinine ratio (uACR) test?"`);
  }
  if (doctorQuestions.length === 0) {
    doctorQuestions.push('"Are all my vital signs and lab biomarkers optimal for my age category?"');
    doctorQuestions.push('"What preventative screenings or lifestyle adjustments do you recommend for the coming year?"');
  }

  // Tailored Lifestyle Plan
  const diet: string[] = [];
  const lifestyle: string[] = [];

  if (m.fbs && m.fbs >= 100) {
    diet.push('Incorporate low-glycemic foods, leafy greens, legumes, and lean proteins; minimize refined sugars and sweet beverages.');
    lifestyle.push('Perform 30 minutes of moderate aerobic exercise (brisk walking, cycling) at least 5 days a week to improve insulin sensitivity.');
  }
  if (m.hemoglobin && m.hemoglobin < 12.0) {
    diet.push('Increase dietary iron (spinach, lentils, beets, pomegranate) paired with Vitamin C (citrus, tomatoes) for optimal absorption.');
  }
  if (m.totalCholesterol && m.totalCholesterol >= 200) {
    diet.push('Replace saturated fats with heart-healthy monounsaturated fats (extra virgin olive oil, nuts, seeds, avocado).');
    lifestyle.push('Maintain consistent cardiovascular exercise to help boost protective HDL fractions.');
  }
  if (diet.length === 0) {
    diet.push('Maintain an anti-inflammatory Mediterranean-style diet rich in whole grains, fresh vegetables, berries, and omega-3 fatty acids.');
    lifestyle.push('Aim for 7–8 hours of restorative sleep nightly and stay well-hydrated with 2–3 liters of water daily.');
  }

  return {
    executiveSummary: {
      status: overallStatus,
      badge: overallBadge,
      briefSummary,
      highlights,
      attentionItems,
      primaryAction,
    },
    organSystems,
    calculations: {
      aip,
      aipCategory,
      cholHdlRatio,
      ldlHdlRatio,
      nonHdl,
      eag,
      eGfr,
      eGfrStage,
      map,
      pulsePressure,
      deRitisRatio,
      healthScore,
    },
    doctorQuestions,
    lifestylePlan: {
      diet,
      lifestyle,
      followUp: overallStatus === 'Optimal' ? '12 Months' : overallStatus === 'Mild Attention' ? '3 Months' : '2-4 Weeks',
    },
  };
};

/**
 * Pre-made Sample Medical Text Reports for instantaneous demo and testing
 */
export const SAMPLE_TEXT_REPORTS = [
  {
    id: 'sample_comprehensive',
    title: 'Comprehensive Metabolic, Glycemic & Lipid Panel',
    snippet: 'Full panel: Glucose 98, HbA1c 5.4%, Hemoglobin 14.8, Lipids, Creatinine, BP 118/78',
    text: `METABOLIC & LIPID HEALTH REPORT
Date: October 10, 2026
Patient: Alex Johnson | Age: 42 | Gender: Male

GLYCEMIC PROFILE:
Fasting Blood Sugar (FBS): 98 mg/dL (Reference: 70 - 100 mg/dL) [Normal]
Post Prandial Glucose (PPBS): 128 mg/dL (Reference: < 140 mg/dL) [Normal]
HbA1c (Glycated Hemoglobin): 5.4 % (Reference: < 5.7 %) [Optimal]

COMPLETE BLOOD COUNT (CBC):
Hemoglobin (Hb): 14.8 g/dL (Reference: 13.5 - 17.5 g/dL) [Normal]
RBC Count: 4.9 million/mcL (Reference: 4.5 - 5.5 million/mcL) [Normal]
Hematocrit (PCV): 44.2 % (Reference: 40 - 50 %) [Normal]
Platelet Count: 245,000 /mcL (Reference: 150,000 - 450,000) [Normal]
WBC Total: 6,800 /mcL (Reference: 4,000 - 11,000) [Normal]

LIPID PANEL:
Total Cholesterol: 195 mg/dL (Reference: < 200 mg/dL) [Optimal]
LDL Cholesterol: 110 mg/dL (Reference: < 100 mg/dL) [Borderline]
HDL Cholesterol: 52 mg/dL (Reference: > 40 mg/dL) [Optimal]
Triglycerides: 142 mg/dL (Reference: < 150 mg/dL) [Normal]

RENAL & HEPATIC MARKERS:
Serum Creatinine: 0.95 mg/dL (Reference: 0.7 - 1.3 mg/dL) [Normal]
Blood Urea Nitrogen (BUN): 14 mg/dL (Reference: 7 - 20 mg/dL) [Normal]
SGPT / ALT: 28 U/L (Reference: 7 - 56 U/L) [Normal]
SGOT / AST: 24 U/L (Reference: 10 - 40 U/L) [Normal]

VITALS & HEMODYNAMICS:
Blood Pressure: 118/78 mmHg [Optimal]
Heart Rate: 72 bpm [Normal]`,
  },
  {
    id: 'sample_diabetes',
    title: 'Pre-Diabetes & Glycemic Evaluation',
    snippet: 'Elevated glucose: Fasting 118, Post-meal 165, HbA1c 6.2%, BP 134/86',
    text: `ENDOCRINOLOGY EVALUATION REPORT
Date: October 10, 2026
Patient: Samantha Reed | Age: 51 | Gender: Female

GLYCEMIC METRICS:
Fasting Blood Sugar: 118 mg/dL (Reference: 70 - 100 mg/dL) [High - Impaired Fasting Glucose]
Post Prandial Blood Glucose: 165 mg/dL (Reference: < 140 mg/dL) [High - Impaired Glucose Tolerance]
HbA1c: 6.2 % (Reference: < 5.7 %) [High - Pre-diabetes Range]

HEMATOLOGY & VITALS:
Hemoglobin: 13.2 g/dL (Reference: 12.0 - 15.5 g/dL) [Normal]
Blood Pressure: 134/86 mmHg [Stage 1 Hypertension]
Pulse Rate: 78 bpm [Normal]
Total Cholesterol: 218 mg/dL (Reference: < 200 mg/dL) [Borderline High]
Triglycerides: 185 mg/dL (Reference: < 150 mg/dL) [High]
Serum Creatinine: 0.88 mg/dL (Reference: 0.6 - 1.1 mg/dL) [Normal]`,
  },
  {
    id: 'sample_anemia',
    title: 'CBC Hematology & Anemia Screen',
    snippet: 'Mild anemia: Hemoglobin 10.4, RBC 3.6, Hematocrit 31.8%, BP 110/72',
    text: `HEMATOLOGY LAB REPORT - ANEMIA PROFILE
Date: October 10, 2026
Patient: Priya Sharma | Age: 29 | Gender: Female

CBC PARAMETERS:
Hemoglobin (Hb): 10.4 g/dL (Reference: 12.0 - 15.5 g/dL) [Low - Mild Anemia]
RBC Count: 3.6 million/mcL (Reference: 4.0 - 5.2 million/mcL) [Low]
Hematocrit (PCV): 31.8 % (Reference: 36 - 46 %) [Low]
Platelet Count: 280,000 /mcL (Reference: 150,000 - 450,000) [Normal]
WBC Count: 5,400 /mcL (Reference: 4,000 - 11,000) [Normal]

GLUCOSE & METABOLIC:
Fasting Glucose: 88 mg/dL (Reference: 70 - 100 mg/dL) [Normal]
Total Cholesterol: 168 mg/dL (Reference: < 200 mg/dL) [Optimal]
Serum Creatinine: 0.72 mg/dL (Reference: 0.6 - 1.1 mg/dL) [Normal]
Blood Pressure: 110/72 mmHg [Optimal]`,
  },
];

