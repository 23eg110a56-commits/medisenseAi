"""Deterministic parsing of laboratory report text.

Every value, unit and reference range returned by this module is taken verbatim
from the document text. Nothing is inferred from remembered clinical standards:
when a row has no printed reference range, it is flagged for manual review
instead of being compared against a range this module happens to know.
"""

import re
from typing import Any, Dict, List, Optional, Tuple

# Longest alternatives first so that e.g. "pg/mL" is not cut down to "pg".
_UNIT_TOKENS = (
    r"mg/dL|mg/L|mg/dl|g/dL|g/L|ng/mL|ng/dL|pg/mL|µg/dL|ug/dL|mcg/dL|mcg/L|"
    r"IU/L|IU/mL|U/L|cells/mcL|cells/cumm|mil/mcL|million/mcL|millions/mcL|"
    r"10\^3/uL|10\^6/uL|10\*\*3/uL|/uL|/cumm|mmol/L|mEq/L|umol/L|µmol/L|"
    r"mm/Hg|mmHg|fL|pg|%|Ratio|copies/mL|mIU/L|uIU/mL|IU|mg|g|L"
)

# A test name never spans a colon or pipe; those appear in patient/demographic
# header lines ("Patient: X | Age: 35") which must not be read as results.
_NAME = r"[A-Za-z][A-Za-z0-9\s\(\)\/\-\.,&']{2,70}?"

_NUMBER = r"-?\d[\d,]*(?:\.\d+)?"

# "< 200", "> 40", "13.5 - 17.5", "4500-11000", "5.0 to 30.0", "<= 1.2"
_RANGE = (
    rf"(?:[<>]=?\s*{_NUMBER}"
    rf"|{_NUMBER}\s*(?:-|–|—|to)\s*{_NUMBER})"
)

_STATUS_WORDS = r"Low|High|Normal|Critical|Abnormal|Borderline|Negative|Positive"

# Parenthetical qualifiers labs print next to a range, e.g. "< 200.0 (Desirable)".
_QUALIFIER = r"\([A-Za-z][A-Za-z\s\-/]{0,30}\)"

# Qualifier and status flag may appear in either order after the reference range.
_ROW_RE = re.compile(
    rf"^(?P<name>{_NAME})\s+"
    rf"(?P<value>{_NUMBER})\s*"
    rf"(?P<unit>{_UNIT_TOKENS})?\s*"
    rf"(?P<range>{_RANGE})?\s*"
    rf"(?:{_QUALIFIER})?\s*"
    rf"(?P<flag>{_STATUS_WORDS})?\s*"
    rf"(?:{_QUALIFIER})?\s*$",
    re.IGNORECASE,
)

_QUALITATIVE_WORDS = (
    "negative", "positive", "trace", "reactive", "non-reactive", "nonreactive",
    "present", "absent", "detected", "not detected", "nil", "seen", "not seen",
)

_QUALITATIVE_RE = re.compile(
    rf"^(?P<name>{_NAME})\s+(?P<value>{'|'.join(_QUALITATIVE_WORDS)})\s*"
    rf"(?P<flag>{_STATUS_WORDS})?\s*$",
    re.IGNORECASE,
)

# Lines that are document furniture rather than results.
_SKIP_LINE_HINTS = (
    "test name", "biomarker", "observed value", "reference interval",
    "reference range", "status flag", "clinical notes", "patient:", "date:",
    "lab id", "report id", "page ", "collected", "sample id", "unit",
    "method", "impression", "comment", "remarks", "***",
)

# Report-type keywords. This classifies the document; it asserts no medical fact.
_REPORT_TYPE_HINTS: List[Tuple[str, Tuple[str, ...]]] = [
    ("Complete Blood Count (CBC)", ("complete blood count", "cbc", "hemoglobin", "leukocyte", "platelet", "pcv", "mcv")),
    ("Lipid Profile", ("lipid profile", "cholesterol", "triglyceride", "ldl", "hdl")),
    ("Glucose / Diabetes Panel", ("hba1c", "glycated", "fasting blood sugar", "fasting glucose", "blood glucose")),
    ("Liver Function Test (LFT)", ("liver function", "sgpt", "sgot", "alt ", "ast ", "bilirubin", "albumin")),
    ("Kidney Function Test (KFT)", ("kidney function", "renal function", "creatinine", "urea", "bun", "egfr")),
    ("Thyroid Profile", ("thyroid", "tsh", "free t3", "free t4", "ft3", "ft4")),
    ("Vitamin Panel", ("vitamin d", "vitamin b12", "25-hydroxy")),
    ("Urinalysis", ("urinalysis", "urine routine", "urine r/m")),
]

# Plain-language educational descriptions. Keyed by substring of the test name as
# printed in the report. Used only to explain what a test is; never to supply a
# value or a range.
_EDUCATION: Dict[str, str] = {
    "hemoglobin": "Hemoglobin is the iron-containing protein in red blood cells that carries oxygen around the body.",
    "leukocyte": "The white blood cell (leukocyte) count measures the cells your immune system uses to fight infection.",
    "wbc": "The white blood cell count measures the cells your immune system uses to fight infection.",
    "red blood cell": "The red blood cell count measures how many oxygen-carrying cells are in your blood.",
    "rbc": "The red blood cell count measures how many oxygen-carrying cells are in your blood.",
    "packed cell volume": "Packed cell volume (hematocrit) is the share of your blood made up of red cells.",
    "pcv": "Packed cell volume (hematocrit) is the share of your blood made up of red cells.",
    "hematocrit": "Hematocrit is the share of your blood made up of red cells.",
    "corpuscular volume": "MCV describes the average size of your red blood cells.",
    "mcv": "MCV describes the average size of your red blood cells.",
    "corpuscular hb": "MCH describes the average amount of hemoglobin inside each red blood cell.",
    "mch": "MCH describes the average amount of hemoglobin inside each red blood cell.",
    "mchc": "MCHC describes how concentrated the hemoglobin is inside your red blood cells.",
    "platelet": "Platelets are the cell fragments that help your blood clot and stop bleeding.",
    "neutrophil": "Neutrophils are a type of white blood cell that responds first to bacterial infection.",
    "lymphocyte": "Lymphocytes are white blood cells central to immune defence and viral response.",
    "eosinophil": "Eosinophils are white blood cells often raised in allergy, asthma or parasitic infection.",
    "monocyte": "Monocytes are white blood cells that mature into macrophages to clear infection.",
    "basophil": "Basophils are white blood cells involved in allergic and inflammatory responses.",
    "total cholesterol": "Total cholesterol is the combined amount of cholesterol circulating in your blood.",
    "ldl": "LDL ('bad' cholesterol) carries cholesterol into artery walls; lower levels are generally preferred.",
    "hdl": "HDL ('good' cholesterol) carries cholesterol away from arteries back to the liver.",
    "triglyceride": "Triglycerides are the main form of fat stored in the body and used for energy.",
    "vldl": "VLDL carries triglycerides through the bloodstream.",
    "glucose": "Blood glucose is the sugar circulating in your blood, used as the body's main fuel.",
    "hba1c": "HbA1c reflects your average blood glucose over roughly the past three months.",
    "glycated": "HbA1c reflects your average blood glucose over roughly the past three months.",
    "insulin": "Insulin is the hormone that moves glucose from blood into cells.",
    "creatinine": "Creatinine is a muscle waste product cleared by the kidneys; it is used to gauge kidney filtration.",
    "urea": "Urea is a nitrogen waste product cleared by the kidneys.",
    "bun": "Blood urea nitrogen reflects how well the kidneys are clearing waste.",
    "uric acid": "Uric acid is a waste product; high levels are associated with gout.",
    "egfr": "eGFR estimates how much blood your kidneys filter each minute.",
    "bilirubin": "Bilirubin is a yellow pigment produced when red blood cells break down; the liver clears it.",
    "sgpt": "SGPT (ALT) is a liver enzyme that rises when liver cells are stressed or damaged.",
    "alt": "ALT (SGPT) is a liver enzyme that rises when liver cells are stressed or damaged.",
    "sgot": "SGOT (AST) is an enzyme found in the liver, heart and muscle.",
    "ast": "AST (SGOT) is an enzyme found in the liver, heart and muscle.",
    "alkaline phosphatase": "Alkaline phosphatase is an enzyme from the liver, bile ducts and bone.",
    "alp": "Alkaline phosphatase is an enzyme from the liver, bile ducts and bone.",
    "albumin": "Albumin is the main protein made by the liver; it keeps fluid inside blood vessels.",
    "total protein": "Total protein measures albumin and globulins together in the blood.",
    "gamma gt": "GGT is a liver and bile-duct enzyme, sensitive to alcohol and bile flow problems.",
    "ggt": "GGT is a liver and bile-duct enzyme, sensitive to alcohol and bile flow problems.",
    "tsh": "TSH is released by the pituitary gland to tell the thyroid how much hormone to make.",
    "thyroid": "Thyroid hormones (T3/T4) regulate the body's metabolic rate.",
    "vitamin d": "Vitamin D supports bone health and calcium absorption.",
    "vitamin b12": "Vitamin B12 is needed for red blood cell formation and nerve function.",
    "ferritin": "Ferritin reflects your body's stored iron.",
    "iron": "Serum iron measures the iron circulating in your blood.",
    "sodium": "Sodium is an electrolyte that regulates fluid balance and nerve function.",
    "potassium": "Potassium is an electrolyte essential for heart and muscle function.",
    "chloride": "Chloride is an electrolyte involved in fluid and acid-base balance.",
    "calcium": "Calcium is a mineral needed for bone strength, muscle and nerve function.",
    "magnesium": "Magnesium is a mineral involved in muscle, nerve and heart function.",
    "crp": "C-reactive protein rises with inflammation somewhere in the body.",
    "esr": "ESR is a non-specific marker of inflammation.",
    "psa": "PSA is a protein produced by prostate tissue.",
}

_NO_EXPLANATION = (
    "No plain-language description for this test is available in the offline "
    "knowledge base. Ask the laboratory or your healthcare provider what it measures."
)


def _to_float(raw: str) -> Optional[float]:
    try:
        return float(raw.replace(",", "").strip())
    except (ValueError, AttributeError):
        return None


# Matched against the whole range string so that "150000-400000" cannot be read
# as a positive bound followed by a negative one.
_INTERVAL_RE = re.compile(
    rf"(?P<low>{_NUMBER})\s*(?:-|–|—|to)\s*(?P<high>{_NUMBER})",
    re.IGNORECASE,
)


def parse_reference_range(text: str) -> Optional[Dict[str, Any]]:
    """Parse a reference range exactly as printed in the report."""
    if not text:
        return None
    cleaned = text.strip()
    if not cleaned:
        return None

    normalised = cleaned.replace(",", "")

    if cleaned.lstrip().startswith("<"):
        bound = re.search(_NUMBER, normalised.lstrip("<=").strip())
        upper = _to_float(bound.group(0)) if bound else None
        return {"kind": "upper", "upper": upper, "raw": cleaned} if upper is not None else None

    if cleaned.lstrip().startswith(">"):
        bound = re.search(_NUMBER, normalised.lstrip(">=").strip())
        lower = _to_float(bound.group(0)) if bound else None
        return {"kind": "lower", "lower": lower, "raw": cleaned} if lower is not None else None

    interval = _INTERVAL_RE.search(normalised)
    if interval:
        low = _to_float(interval.group("low"))
        high = _to_float(interval.group("high"))
        if low is not None and high is not None and low <= high:
            return {"kind": "interval", "lower": low, "upper": high, "raw": cleaned}
    return None


def classify_value(value: Optional[float], ref: Optional[Dict[str, Any]]) -> str:
    """Return Normal / High / Low, or Review when the report gives no usable range."""
    if value is None or ref is None:
        return "Review"
    if ref["kind"] == "upper":
        return "High" if value > ref["upper"] else "Normal"
    if ref["kind"] == "lower":
        return "Low" if value < ref["lower"] else "Normal"
    if value < ref["lower"]:
        return "Low"
    if value > ref["upper"]:
        return "High"
    return "Normal"


def _is_furniture(line: str) -> bool:
    low = line.lower()
    return any(hint in low for hint in _SKIP_LINE_HINTS)


def _explain(name: str) -> str:
    low = name.lower()
    for key, text in _EDUCATION.items():
        if key in low:
            return text
    return _NO_EXPLANATION


def detect_report_type(text: str) -> str:
    low = (text or "").lower()
    for label, hints in _REPORT_TYPE_HINTS:
        if any(h in low for h in hints):
            return label
    return "Unclassified laboratory report"


# Many layouts — and most copy/pasted text — put every column of a result on its
# own line. Re-join those into a single row so the row matcher can read them.
_BARE_VALUE_RE = re.compile(rf"^\s*(?P<value>{_NUMBER})\s*$")
_BARE_UNIT_RE = re.compile(rf"^\s*(?P<unit>{_UNIT_TOKENS})\s*$", re.IGNORECASE)
_BARE_RANGE_RE = re.compile(
    rf"^\s*(?P<range>{_RANGE})\s*(?:{_QUALIFIER})?\s*$", re.IGNORECASE
)
_BARE_FLAG_RE = re.compile(
    rf"^\s*(?P<flag>{_STATUS_WORDS})\s*(?:{_QUALIFIER})?\s*$", re.IGNORECASE
)
_NAME_ONLY_RE = re.compile(rf"^\s*(?P<name>{_NAME})\s*$")


def _is_name_only(line: str) -> bool:
    """True for a line that carries no measurement, so it can start a row."""
    return bool(_NAME_ONLY_RE.match(line)) and not re.search(r"\d", line)


def _reflow_columnar(lines: List[str]) -> List[str]:
    """Join split-column result lines back into one line per result.

    A merge only happens when the number is followed by a unit, a reference range
    or a status flag. A bare number on its own is left untouched rather than
    turned into a result.
    """
    out: List[str] = []
    i = 0
    while i < len(lines):
        stripped = lines[i].strip()
        value_match = _BARE_VALUE_RE.match(stripped)
        if not value_match or not out or not _is_name_only(out[-1].strip()) \
                or _is_furniture(out[-1].strip()):
            out.append(lines[i])
            i += 1
            continue

        parts = [out[-1].strip(), value_match.group("value")]
        j = i + 1
        has_evidence = False
        while j < len(lines) and len(parts) < 6:
            candidate = lines[j].strip()
            j += 1
            if not candidate:
                continue
            if not any(rx.match(candidate) for rx in (_BARE_UNIT_RE, _BARE_RANGE_RE, _BARE_FLAG_RE)):
                j -= 1
                break
            parts.append(candidate)
            has_evidence = True

        if not has_evidence:
            out.append(lines[i])
            i += 1
            continue

        out.pop()
        out.append(" ".join(parts))
        i = j
    return out


def parse_biomarkers(text: str) -> Tuple[List[Dict[str, Any]], List[str]]:
    """Extract result rows from report text.

    Returns (rows, unreviewed_lines). ``unreviewed_lines`` holds lines that look
    like results (they contain a number) but could not be parsed with enough
    confidence to report, so the user can check them against the original.
    """
    rows: List[Dict[str, Any]] = []
    unreviewed: List[str] = []
    seen: set = set()

    for raw_line in _reflow_columnar((text or "").split("\n")):
        line = raw_line.strip()
        if not line or _is_furniture(line):
            continue

        match = _ROW_RE.match(line) or _QUALITATIVE_RE.match(line)
        if not match:
            if re.search(r"\d", line) and len(line.split()) >= 3:
                unreviewed.append(line)
            continue

        name = re.sub(r"\s+", " ", match.group("name")).strip(" -:|,")
        value = match.group("value").strip()
        unit = (match.groupdict().get("unit") or "").strip()
        range_raw = (match.groupdict().get("range") or "").strip()
        printed_flag = (match.groupdict().get("flag") or "").strip().title()

        if len(name) < 3 or not name[0].isalpha():
            continue

        key = (name.lower(), value)
        if key in seen:
            continue
        seen.add(key)

        numeric = _to_float(value)
        ref = parse_reference_range(range_raw)
        is_qualitative = numeric is None

        notes: List[str] = []
        if is_qualitative:
            status = "Review"
            notes.append(
                "Qualitative result. The report does not provide a numeric range, "
                "so it cannot be categorised automatically."
            )
            if printed_flag in ("Normal", "High", "Low", "Critical", "Negative", "Positive"):
                notes.append(f"The report itself marks this result as '{printed_flag}'.")
                status = printed_flag
        else:
            computed = classify_value(numeric, ref)
            if ref is None:
                status = "Review"
                notes.append(
                    "No reference range was printed for this row, so the value was "
                    "not categorised. Compare it with the range on your report."
                )
                if printed_flag in ("Normal", "High", "Low", "Critical"):
                    status = printed_flag
                    notes.append(f"Categorisation taken from the status column printed in the report ('{printed_flag}').")
            else:
                status = computed
                if printed_flag and printed_flag != computed:
                    if printed_flag == "Critical" and computed in ("High", "Low"):
                        status = "Critical"
                        notes.append(
                            "The laboratory marked this result critical; the value is "
                            f"{computed.lower()} relative to the printed range {range_raw}."
                        )
                    elif printed_flag in ("Normal", "High", "Low", "Critical"):
                        status = "Review"
                        notes.append(
                            f"The report prints '{printed_flag}' but the value {value} falls "
                            f"{computed.lower()} relative to the printed range {range_raw}. "
                            "This needs manual review, possibly an OCR error."
                        )
                    else:
                        notes.append(f"The report additionally marks this result '{printed_flag}'.")

        rows.append({
            "name": name,
            "value": value,
            "unit": unit,
            "reference_range": range_raw or "Not printed in report",
            "status": status,
            "explanation": _explain(name),
            "explanation_source": "general_education",
            "notes": notes,
        })

    return rows, unreviewed


def _severity(row: Dict[str, Any]) -> bool:
    """Conservative urgency flag, derived only from data printed in the report."""
    if row["status"] == "Critical":
        return True
    numeric = _to_float(row["value"])
    ref = parse_reference_range(row["reference_range"])
    if numeric is None or ref is None or ref["kind"] != "interval":
        return False
    span_low, span_high = ref["lower"], ref["upper"]
    if span_low > 0 and numeric < span_low * 0.5:
        return True
    if span_high > 0 and numeric > span_high * 2:
        return True
    return False


def analyze_text(text: str, language: str = "en") -> Dict[str, Any]:
    """Build a grounded analysis of extracted report text.

    The output never contains a measurement, unit or reference range that was not
    found in ``text``. Rows that cannot be interpreted are marked for review.
    """
    rows, unreviewed = parse_biomarkers(text or "")
    report_type = detect_report_type(text or "")

    abnormal = [r for r in rows if r["status"] in ("High", "Low", "Critical")]
    review = [r for r in rows if r["status"] == "Review"]
    urgent = [r for r in rows if _severity(r)]

    total = len(rows)
    if total == 0:
        health_score = None
        score_basis = (
            "No score calculated: no structured laboratory results could be read "
            "from the extracted text."
        )
    else:
        normal = len([r for r in rows if r["status"] == "Normal"])
        health_score = round(100 * normal / total)
        score_basis = (
            f"Application heuristic: {normal} of {total} parsed results fall within "
            "the reference ranges printed in this report. This is not a clinical "
            "assessment of your health."
        )

    warnings: List[str] = []
    if urgent:
        names = ", ".join(f"{r['name']} ({r['value']} {r['unit']})".strip() for r in urgent[:4])
        warnings.append(
            f"These results are far outside the reference range printed in your report, "
            f"or are marked critical by the laboratory: {names}. Seek prompt evaluation "
            "by a qualified healthcare professional."
        )
    elif abnormal:
        names = ", ".join(f"{r['name']} ({r['status'].lower()})" for r in abnormal[:4])
        warnings.append(
            f"{len(abnormal)} result(s) fall outside the reference range printed in your "
            f"report: {names}. Discuss these with your healthcare provider."
        )
    if review:
        warnings.append(
            f"{len(review)} result(s) could not be categorised automatically and need "
            "manual review against the original document."
        )
    if unreviewed:
        warnings.append(
            f"{len(unreviewed)} line(s) in the extracted text could not be parsed as "
            "results. Review the extracted text and correct any OCR errors."
        )

    if total == 0:
        summary = (
            f"This document was classified as a {report_type.lower()}, but no structured "
            "laboratory results (test name, value, unit, reference range) could be read "
            "from the extracted text. No values have been assumed. Review the extracted "
            "text and correct any OCR errors, then re-run the analysis, or have the "
            "report interpreted by a healthcare professional."
        )
    elif abnormal:
        names = ", ".join(f"{r['name']} {r['value']} {r['unit']}".strip() for r in abnormal[:5])
        summary = (
            f"Of {total} result(s) read from this {report_type}, {len(abnormal)} fall outside "
            f"the reference ranges printed in the report: {names}. "
            f"{len([r for r in rows if r['status'] == 'Normal'])} result(s) are within range."
        )
        if review:
            summary += f" A further {len(review)} could not be categorised automatically."
    else:
        summary = (
            f"All {total} result(s) read from this {report_type} fall within the reference "
            "ranges printed in the report."
        )
        if review:
            summary += f" {len(review)} row(s) lacked a printed range and need manual review."

    concerns = {
        "summary": (
            f"{len(abnormal)} result(s) outside the printed reference range; "
            f"{len(review)} requiring manual review."
            if (abnormal or review)
            else "No result in this report fell outside the reference range printed on it."
        ),
        "potential_risks": [
            f"{r['name']} is {r['status'].lower()} relative to the range printed in your report "
            f"({r['reference_range']}). This is an observed finding, not a diagnosis; the cause "
            "can only be determined by a clinician with your full history."
            for r in (abnormal[:6] if abnormal else [])
        ],
    }
    if not concerns["potential_risks"] and total == 0:
        concerns["potential_risks"] = [
            "No results could be read from this document, so nothing can be said about risk either way."
        ]

    recommendations = {
        "lifestyle": [],
        "diet": [],
        "specialists": [],
        "guidance_type": "general_education",
    }
    if abnormal:
        recommendations["lifestyle"] = [
            "Bring this report to your next appointment and ask which results matter for you.",
            "Keep a dated record of results so trends can be compared over time.",
        ]
        recommendations["diet"] = [
            "General healthy-eating guidance applies, but this app does not prescribe a diet "
            "based on these results. Ask your clinician or a registered dietitian.",
        ]
        recommendations["specialists"] = [
            "A primary care physician can interpret these results in context and refer you if needed.",
        ]
    elif total:
        recommendations["lifestyle"] = [
            "All parsed results are within the ranges printed on this report. Continue routine "
            "screening as advised by your healthcare provider.",
        ]
    else:
        recommendations["lifestyle"] = [
            "Re-run the analysis after correcting the extracted text, or have the report read "
            "by a healthcare professional.",
        ]

    return {
        "analysis_mode": "rule_based",
        "report_type": report_type,
        "summary": summary,
        "biomarkers": rows,
        "health_concerns": concerns,
        "recommendations": recommendations,
        "health_score": health_score,
        "health_score_basis": score_basis,
        "warnings": warnings,
        "unparsed_lines": unreviewed,
        "requires_manual_review": total == 0 or bool(review) or bool(unreviewed),
        "grounding": "All values, units and reference ranges are taken from the uploaded document.",
    }
