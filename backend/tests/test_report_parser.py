"""Tests for the grounded, rule-based report reader.

These assert the safety contract rather than implementation detail: nothing may
appear in the analysis that was not printed in the source document, and anything
ambiguous must be sent to manual review instead of being guessed.
"""

import pytest

from app.services.report_parser import (
    analyze_text,
    classify_value,
    detect_report_type,
    parse_biomarkers,
    parse_reference_range,
)


LIPID_REPORT = """ACME DIAGNOSTIC LABORATORY
Patient: Jane Doe | Age: 41 | Sex: F
Report ID: 88213

LIPID PROFILE
Test Name              Observed Value    Unit      Reference Interval    Status Flag
Total Cholesterol      248.0             mg/dL     < 200.0               High
HDL Cholesterol        34.5              mg/dL     > 40.0                Low
LDL Cholesterol        92.0              mg/dL     < 100.0               Normal
Triglycerides          118.0             mg/dL     < 150.0               Normal

Method: enzymatic colourimetric
*** End of report ***
"""


def _row(rows, name_fragment):
    matches = [r for r in rows if name_fragment.lower() in r["name"].lower()]
    assert matches, f"no row matching {name_fragment!r} in {[r['name'] for r in rows]}"
    return matches[0]


# --------------------------------------------------------------------------
# parse_reference_range
# --------------------------------------------------------------------------

def test_upper_bound_range():
    ref = parse_reference_range("< 200.0")
    assert ref == {"kind": "upper", "upper": 200.0, "raw": "< 200.0"}


def test_lower_bound_range():
    ref = parse_reference_range("> 40.0")
    assert ref == {"kind": "lower", "lower": 40.0, "raw": "> 40.0"}


def test_word_interval_range():
    assert parse_reference_range("5.0 to 30.0")["kind"] == "interval"


def test_empty_and_garbage_ranges_return_none():
    assert parse_reference_range("") is None
    assert parse_reference_range("   ") is None
    assert parse_reference_range("see notes") is None


def test_reversed_interval_is_rejected():
    """A range printed low-high reversed is not something to silently repair."""
    assert parse_reference_range("17.5 - 13.5") is None


# --------------------------------------------------------------------------
# classify_value
# --------------------------------------------------------------------------

@pytest.mark.parametrize(
    "value,ref,expected",
    [
        (250.0, {"kind": "upper", "upper": 200.0}, "High"),
        (199.0, {"kind": "upper", "upper": 200.0}, "Normal"),
        (200.0, {"kind": "upper", "upper": 200.0}, "Normal"),
        (30.0, {"kind": "lower", "lower": 40.0}, "Low"),
        (45.0, {"kind": "lower", "lower": 40.0}, "Normal"),
        (12.0, {"kind": "interval", "lower": 13.5, "upper": 17.5}, "Low"),
        (19.0, {"kind": "interval", "lower": 13.5, "upper": 17.5}, "High"),
        (15.0, {"kind": "interval", "lower": 13.5, "upper": 17.5}, "Normal"),
    ],
)
def test_classify_against_printed_range(value, ref, expected):
    assert classify_value(value, ref) == expected


def test_classify_without_range_goes_to_review():
    """The core anti-hallucination rule: no range, no verdict."""
    assert classify_value(250.0, None) == "Review"
    assert classify_value(None, {"kind": "upper", "upper": 200.0}) == "Review"


# --------------------------------------------------------------------------
# parse_biomarkers
# --------------------------------------------------------------------------

def test_reads_value_unit_and_printed_range_verbatim():
    rows, _ = parse_biomarkers(LIPID_REPORT)
    total = _row(rows, "Total Cholesterol")
    assert total["value"] == "248.0"
    assert total["unit"] == "mg/dL"
    assert total["reference_range"] == "< 200.0"
    assert total["status"] == "High"


def test_all_printed_rows_are_found():
    rows, _ = parse_biomarkers(LIPID_REPORT)
    names = {r["name"].lower() for r in rows}
    assert {"total cholesterol", "hdl cholesterol", "ldl cholesterol", "triglycerides"} <= names


def test_in_range_row_is_normal():
    rows, _ = parse_biomarkers(LIPID_REPORT)
    assert _row(rows, "LDL Cholesterol")["status"] == "Normal"


def test_demographic_header_is_not_read_as_a_result():
    rows, _ = parse_biomarkers(LIPID_REPORT)
    assert not [r for r in rows if "patient" in r["name"].lower()]


def test_missing_reference_range_is_flagged_not_invented():
    text = "Serum Ferritin    412    ng/mL\nSerum Sodium      140    mmol/L    135 - 145    Normal\n"
    rows, _ = parse_biomarkers(text)
    ferritin = _row(rows, "Serum Ferritin")
    assert ferritin["status"] == "Review"
    assert ferritin["reference_range"] == "Not printed in report"
    assert any("No reference range" in n for n in ferritin["notes"])
    # The reader must not supply a range it happens to remember for ferritin.
    assert not any(ch.isdigit() for ch in ferritin["reference_range"])


def test_laboratory_status_column_is_honoured_when_no_range_printed():
    text = "Serum Ferritin    412    ng/mL    High\n"
    rows, _ = parse_biomarkers(text)
    ferritin = _row(rows, "Ferritin")
    assert ferritin["status"] == "High"
    assert any("status column printed in the report" in n for n in ferritin["notes"])


def test_flag_disagreeing_with_the_printed_range_goes_to_review():
    """An OCR-mangled digit would show up as a contradiction; do not pick a side."""
    text = "Hemoglobin    13.8    g/dL    13.5 - 17.5    Low\n"
    rows, _ = parse_biomarkers(text)
    hgb = _row(rows, "Hemoglobin")
    assert hgb["status"] == "Review"
    assert any("possibly an OCR error" in n for n in hgb["notes"])


def test_laboratory_critical_flag_is_preserved():
    text = "Platelet Count    18000    /uL    150000-400000    Critical\n"
    rows, _ = parse_biomarkers(text)
    platelets = _row(rows, "Platelet")
    assert platelets["status"] == "Critical"


def test_qualitative_result_is_not_turned_into_a_number():
    text = "HBsAg    Negative\nHCV Antibody    Reactive    Positive\n"
    rows, _ = parse_biomarkers(text)

    hbsag = _row(rows, "HBsAg")
    assert hbsag["value"] == "Negative"
    # No numeric range and no laboratory flag, so no verdict is invented for it.
    assert hbsag["status"] == "Review"
    assert any("Qualitative result" in n for n in hbsag["notes"])

    hcv = _row(rows, "HCV Antibody")
    assert hcv["value"] == "Reactive"
    # The laboratory's own printed flag is carried through unchanged.
    assert hcv["status"] == "Positive"


def test_interval_range_without_spaces_is_not_read_as_negative():
    """Regression: "150000-400000" used to yield bounds 150000 and -400000."""
    rows, _ = parse_biomarkers("Platelet Count    95000    /uL    150000-400000\n")
    platelets = _row(rows, "Platelet")
    assert platelets["reference_range"] == "150000-400000"
    assert platelets["status"] == "Low"


def test_comma_grouped_interval_range_is_readable():
    ref = parse_reference_range("4,500-11,000")
    assert ref["kind"] == "interval"
    assert (ref["lower"], ref["upper"]) == (4500.0, 11000.0)
    rows, _ = parse_biomarkers("Total Leukocyte Count    12500    /uL    4,500-11,000    High\n")
    assert _row(rows, "Leukocyte")["status"] == "High"


def test_columnar_text_one_cell_per_line_is_rejoined():
    """Copy/pasted text and pymupdf output put each column on its own line."""
    text = "Hemoglobin\n13.8\ng/dL\n13.5 - 17.5\nNormal\n"
    rows, _ = parse_biomarkers(text)
    assert len(rows) == 1
    hgb = rows[0]
    assert (hgb["name"], hgb["value"], hgb["unit"]) == ("Hemoglobin", "13.8", "g/dL")
    assert hgb["reference_range"] == "13.5 - 17.5"
    assert hgb["status"] == "Normal"


def test_bare_number_without_evidence_is_not_promoted_to_a_result():
    text = "Page\n2\n"
    rows, unreviewed = parse_biomarkers(text)
    assert rows == []
    assert unreviewed == []


def test_unreadable_lines_are_returned_for_review():
    text = "Hemoglobin    13.8    g/dL    13.5 - 17.5    Normal\nErythrocyte Sed Rate 22 mm first hour Westergren\n"
    rows, unreviewed = parse_biomarkers(text)
    assert len(rows) == 1
    assert any("Erythrocyte" in line for line in unreviewed)


def test_duplicate_rows_are_collapsed():
    text = "Hemoglobin    13.8    g/dL    13.5 - 17.5    Normal\n" * 3
    rows, _ = parse_biomarkers(text)
    assert len(rows) == 1


def test_empty_and_none_input_are_safe():
    assert parse_biomarkers("") == ([], [])
    assert parse_biomarkers(None) == ([], [])


def test_no_output_value_is_absent_from_the_source():
    """Property check across a messy document: every reported figure was printed."""
    rows, _ = parse_biomarkers(LIPID_REPORT)
    assert rows
    for row in rows:
        assert row["value"] in LIPID_REPORT
        if row["reference_range"] != "Not printed in report":
            for token in row["reference_range"].replace("-", " ").split():
                assert token in LIPID_REPORT


# --------------------------------------------------------------------------
# detect_report_type
# --------------------------------------------------------------------------

def test_report_type_from_keywords():
    assert detect_report_type(LIPID_REPORT) == "Lipid Profile"
    assert detect_report_type("Hemoglobin 13.8 g/dL") == "Complete Blood Count (CBC)"


def test_unknown_document_is_not_forced_into_a_category():
    assert detect_report_type("invoice for parking 42") == "Unclassified laboratory report"


# --------------------------------------------------------------------------
# analyze_text
# --------------------------------------------------------------------------

def test_analysis_of_clean_report():
    result = analyze_text(LIPID_REPORT)
    assert result["analysis_mode"] == "rule_based"
    assert result["report_type"] == "Lipid Profile"
    assert len(result["biomarkers"]) == 4
    # 2 of 4 within range
    assert result["health_score"] == 50
    assert "not a clinical assessment" in result["health_score_basis"]
    assert any("outside the reference range" in w for w in result["warnings"])
    assert result["requires_manual_review"] is False


def test_score_is_none_when_nothing_could_be_read():
    result = analyze_text("A page with no results, just prose about the weather.")
    assert result["health_score"] is None
    assert "No score calculated" in result["health_score_basis"]
    assert result["requires_manual_review"] is True
    assert "No values have been assumed" in result["summary"]


def test_unreadable_document_produces_no_biomarkers_and_no_diagnosis():
    result = analyze_text("###???!!!")
    assert result["biomarkers"] == []
    assert result["health_concerns"]["potential_risks"] == [
        "No results could be read from this document, so nothing can be said about risk either way."
    ]


def test_far_out_of_range_value_raises_urgency_warning():
    text = "Hemoglobin    4.1    g/dL    13.5 - 17.5    Low\n"
    result = analyze_text(text)
    assert result["warnings"]
    assert any("Seek prompt evaluation" in w for w in result["warnings"])


def test_slightly_out_of_range_value_is_not_escalated_to_urgent():
    text = "Total Cholesterol    205.0    mg/dL    < 200.0    High\n"
    result = analyze_text(text)
    assert not any("Seek prompt evaluation" in w for w in result["warnings"])
    assert any("Discuss these with your healthcare provider" in w for w in result["warnings"])


def test_concerns_are_worded_as_findings_not_diagnoses():
    result = analyze_text(LIPID_REPORT)
    risks = result["health_concerns"]["potential_risks"]
    assert risks
    for risk in risks:
        assert "not a diagnosis" in risk


def test_guidance_never_prescribes_medicine_or_doses():
    result = analyze_text(LIPID_REPORT)
    rec = result["recommendations"]
    assert rec["guidance_type"] == "general_education"
    prescriptive = (
        "take ", "start taking", "stop taking", "tablet", "capsule", "syrup",
        "mg daily", "mg/day", "iu daily", "increase your dose", "reduce your dose",
        "you should be on", "we recommend starting",
    )
    for item in rec["lifestyle"] + rec["diet"] + rec["specialists"]:
        lowered = item.lower()
        assert not any(p in lowered for p in prescriptive), item
    # The diet guidance states its own limitation rather than issuing a plan.
    assert any("does not prescribe" in d.lower() for d in rec["diet"])
    assert any("healthcare provider" in s.lower() or "physician" in s.lower()
               for s in rec["specialists"])


def test_normal_report_does_not_invent_concerns():
    text = "LDL Cholesterol    92.0    mg/dL    < 100.0    Normal\n"
    result = analyze_text(text)
    assert result["health_score"] == 100
    assert result["health_concerns"]["potential_risks"] == []
    assert "No result in this report fell outside" in result["health_concerns"]["summary"]


def test_grounding_statement_is_always_present():
    assert "uploaded document" in analyze_text(LIPID_REPORT)["grounding"]


def test_analysis_of_none_input_is_safe():
    result = analyze_text(None)
    assert result["biomarkers"] == []
    assert result["health_score"] is None
