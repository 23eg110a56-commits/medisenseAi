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
