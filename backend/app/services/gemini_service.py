"""LLM integration with an honest, grounded offline fallback.

When no LLM provider is configured (or a call fails), analysis falls back to
``report_parser``, which only reports values actually present in the document.
Nothing in this module invents measurements, reference ranges or diagnoses.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field

from app.config import settings
from app.services import report_parser

logger = logging.getLogger(__name__)

try:
    from google import genai
    from google.genai import types as genai_types
    HAS_GENAI = True
except ImportError:  # pragma: no cover - exercised when the optional dep is absent
    genai = None
    genai_types = None
    HAS_GENAI = False
    logger.info("google-genai not installed; LLM analysis unavailable.")

GEMINI_MODEL = settings.GEMINI_MODEL or "gemini-2.5-flash"


class Biomarker(BaseModel):
    name: str = Field(description="Name of the biomarker exactly as printed in the report")
    value: str = Field(description="Value exactly as printed in the report. Never estimate or invent one.")
    unit: str = Field(description="Unit exactly as printed in the report. Empty string if the report prints none.")
    reference_range: str = Field(description="Reference range exactly as printed in the report. 'Not printed in report' if absent.")
    status: str = Field(description="Normal, High, Low, Critical, or Review when the report gives no usable range")
    explanation: str = Field(description="Plain-language explanation of what the test measures. General education only.")


class HealthConcerns(BaseModel):
    summary: str = Field(description="Summary of the observed abnormal findings")
    potential_risks: List[str] = Field(description="Areas of concern to discuss with a clinician. Never a diagnosis.")


class Recommendations(BaseModel):
    lifestyle: List[str] = Field(description="General, non-prescriptive lifestyle guidance")
    diet: List[str] = Field(description="General, non-prescriptive dietary guidance")
    specialists: List[str] = Field(description="Types of clinician who could interpret these results")


class MedicalAnalysisJSON(BaseModel):
    report_type: str = Field(description="Type of report as indicated by its contents")
    summary: str = Field(description="Plain-language summary grounded strictly in the report text")
    biomarkers: List[Biomarker] = Field(description="Every result row printed in the report")
    health_concerns: HealthConcerns = Field(description="Observed concerns, not diagnoses")
    recommendations: Recommendations = Field(description="General educational next steps")
    health_score: Optional[int] = Field(description="0-100 heuristic based only on how many parsed results are within the printed ranges")


LLM_UNAVAILABLE_NOTICE = (
    "No AI model is configured on this server, so this analysis was produced by the "
    "built-in rule-based parser instead of a language model."
)


class GeminiClient:
    def __init__(self):
        self.api_key = (settings.GEMINI_API_KEY or "").strip()
        self.is_configured = False
        self.config_error: Optional[str] = None
        self._client = None

        if not HAS_GENAI:
            self.config_error = "The 'google-genai' package is not installed."
        elif not self.api_key:
            self.config_error = "GEMINI_API_KEY is not set."
        else:
            try:
                self._client = genai.Client(api_key=self.api_key)
                self.is_configured = True
                logger.info("Gemini client configured; LLM analysis enabled.")
            except Exception as exc:
                self.config_error = f"Failed to configure the Gemini client: {exc}"
                logger.error(self.config_error)

        if not self.is_configured:
            logger.warning(
                "LLM disabled (%s). Report analysis will use the grounded rule-based parser "
                "and the chatbot will return retrieved evidence only.",
                self.config_error,
            )

    def status(self) -> Dict[str, Any]:
        """Machine-readable availability, surfaced to the UI so degraded mode is never hidden."""
        return {
            "provider": "google-gemini" if HAS_GENAI else None,
            "model": GEMINI_MODEL if self.is_configured else None,
            "configured": self.is_configured,
            "reason": None if self.is_configured else self.config_error,
        }

    async def analyze_multimodal(self, prompt: str, image_bytes: bytes, mime_type: str = "image/png") -> str:
        if not self.is_configured:
            return ""
        try:
            response = await self._client.aio.models.generate_content(
                model=GEMINI_MODEL,
                contents=[
                    genai_types.Part.from_bytes(data=image_bytes, mime_type=mime_type),
                    prompt,
                ],
            )
            return response.text or ""
        except Exception as exc:
            logger.error("Gemini vision call failed: %s", exc)
            return ""

    async def analyze_medical_report(self, report_text: str, language: str = "en") -> Dict[str, Any]:
        if not self.is_configured:
            result = report_parser.analyze_text(report_text, language)
            result["llm_notice"] = LLM_UNAVAILABLE_NOTICE
            return result

        prompt = self._build_analysis_prompt(report_text, language)
        try:
            response = await self._client.aio.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=MedicalAnalysisJSON,
                    temperature=0.1,
                ),
            )
            parsed = json.loads(response.text)
            return self._normalise_llm_analysis(parsed, report_text)
        except Exception as exc:
            logger.error("LLM analysis failed (%s); using grounded rule-based parser.", exc)
            result = report_parser.analyze_text(report_text, language)
            result["llm_notice"] = (
                "The AI model could not be reached, so this analysis was produced by the "
                "built-in rule-based parser instead."
            )
            return result

    def _build_analysis_prompt(self, report_text: str, language: str) -> str:
        lang_name = {"hi": "Hindi", "te": "Telugu"}.get(language, "English")
        return f"""You are a careful clinical documentation assistant. Convert the extracted text of a
laboratory report into structured JSON.

HARD RULES — violating these makes the output medically dangerous:
1. Report ONLY values, units and reference ranges that literally appear in the text below.
   Never supply a value, unit or range from memory. If a row has no printed reference range,
   set reference_range to "Not printed in report" and status to "Review".
2. Do not invent tests that are not in the text. Do not omit tests that are.
3. Derive status by comparing the printed value with the printed range:
   below range = "Low", above range = "High", inside range = "Normal",
   the laboratory's own printed flag overrides only if it escalates (e.g. "Critical").
4. Never diagnose, never name a disease as the cause, never recommend medicines or dose changes.
5. Explanations must be general education about what the test measures, clearly separate from
   the observed findings.
6. health_score is a heuristic: 100 * (results within printed range / total parsed results).
7. Write summary and explanations in {lang_name}, keeping standard test names
   (e.g. Hemoglobin, LDL) in English.

EXTRACTED REPORT TEXT:
---
{report_text}
---
"""

    def _normalise_llm_analysis(self, parsed: Dict[str, Any], report_text: str) -> Dict[str, Any]:
        """Drop any LLM row whose value does not appear in the source document."""
        normalised_source = " ".join((report_text or "").replace(",", " ").split()).lower()
        rows: List[Dict[str, Any]] = []
        dropped: List[str] = []

        for raw in parsed.get("biomarkers", []) or []:
            value = str(raw.get("value", "")).strip()
            digits = value.replace(",", "").replace(".", "")
            if digits and digits not in normalised_source.replace(".", ""):
                dropped.append(f"{raw.get('name', '?')}={value}")
                continue
            status = str(raw.get("status", "Review")).strip().title()
            if status not in ("Normal", "High", "Low", "Critical", "Review"):
                status = "Review"
            rows.append({
                "name": str(raw.get("name", "")).strip(),
                "value": value,
                "unit": str(raw.get("unit", "")).strip(),
                "reference_range": str(raw.get("reference_range", "")).strip() or "Not printed in report",
                "status": status,
                "explanation": str(raw.get("explanation", "")).strip(),
                "explanation_source": "llm",
                "notes": [],
            })

        warnings: List[str] = []
        if dropped:
            warnings.append(
                f"{len(dropped)} result(s) returned by the AI model were discarded because their "
                f"values do not appear in the uploaded document ({', '.join(dropped[:5])})."
            )
        abnormal = [r for r in rows if r["status"] in ("High", "Low", "Critical")]
        review = [r for r in rows if r["status"] == "Review"]
        if abnormal:
            warnings.append(
                f"{len(abnormal)} result(s) fall outside the reference range printed in the report. "
                "Discuss these with your healthcare provider."
            )
        if review:
            warnings.append(f"{len(review)} result(s) could not be categorised and need manual review.")

        concerns = parsed.get("health_concerns") or {}
        recommendations = parsed.get("recommendations") or {}
        return {
            "analysis_mode": "llm",
            "report_type": str(parsed.get("report_type", "")).strip() or report_parser.detect_report_type(report_text),
            "summary": str(parsed.get("summary", "")).strip(),
            "biomarkers": rows,
            "health_concerns": {
                "summary": concerns.get("summary", ""),
                "potential_risks": list(concerns.get("potential_risks") or []),
            },
            "recommendations": {
                "lifestyle": list(recommendations.get("lifestyle") or []),
                "diet": list(recommendations.get("diet") or []),
                "specialists": list(recommendations.get("specialists") or []),
                "guidance_type": "llm_generated_education",
            },
            "health_score": parsed.get("health_score"),
            "health_score_basis": (
                "Heuristic generated by the language model from the results it parsed. "
                "Not a clinical assessment."
            ),
            "warnings": warnings,
            "unparsed_lines": [],
            "requires_manual_review": bool(review) or not rows,
            "grounding": "Values were cross-checked against the uploaded document; unverifiable rows were discarded.",
        }

    async def chat_assistant(
        self,
        user_message: str,
        report_text: str,
        chat_history: List[Dict[str, str]],
        retrieved_context: str,
        language: str = "en",
    ) -> str:
        if not self.is_configured:
            return self._offline_grounded_chat(user_message, report_text, retrieved_context, language)

        lang_name = {"hi": "Hindi", "te": "Telugu"}.get(language, "English")
        history_formatted = "\n".join(
            f"{'User' if turn.get('role') == 'user' else 'Assistant'}: {turn.get('content', '')}"
            for turn in chat_history[-10:]
        )
        prompt = f"""You are MediSense AI, an educational assistant that helps a user understand their own
laboratory report. You are not a doctor.

HARD RULES:
1. Answer ONLY from the report text and retrieved guidelines below. If they do not contain the
   answer, say plainly that you do not have enough information — never fill the gap from memory.
2. Quote the actual value, unit and printed reference range when discussing a result.
3. Never diagnose, never recommend medicines or dose changes, never claim a treatment works.
4. Separate what the report shows from general educational information.
5. If a result is far outside its printed range or marked critical, advise prompt professional care.
6. Answer in {lang_name}, keeping standard test names in English.
7. End with: "This information is educational and is not a substitute for professional medical advice."

REPORT TEXT:
---
{report_text}
---

RETRIEVED GUIDELINES:
---
{retrieved_context or "(none retrieved)"}
---

CONVERSATION SO FAR:
{history_formatted or "(start of conversation)"}

User: {user_message}
Assistant:"""

        try:
            response = await self._client.aio.models.generate_content(
                model=GEMINI_MODEL,
                contents=prompt,
                config=genai_types.GenerateContentConfig(temperature=0.2),
            )
            return response.text
        except Exception as exc:
            logger.error("LLM chat call failed (%s); returning retrieved evidence only.", exc)
            return self._offline_grounded_chat(
                user_message, report_text, retrieved_context, language,
                notice="The AI model could not be reached, so no generated answer is available.",
            )

    def _offline_grounded_chat(
        self,
        user_message: str,
        report_text: str,
        retrieved_context: str,
        language: str = "en",
        notice: Optional[str] = None,
    ) -> str:
        """Return retrieved evidence only. Never a generated clinical answer."""
        rows, _ = report_parser.parse_biomarkers(report_text or "")
        question_words = {
            w.strip("?.!,()[]{}\"'")
            for w in (user_message or "").lower().split()
            if len(w.strip("?.!,()[]{}\"'")) > 3
        }

        matched = [
            row for row in rows
            if any(word in row["name"].lower() for word in question_words)
            or any(word in row["explanation"].lower() for word in question_words)
        ]

        parts: List[str] = []
        parts.append(f"**AI answers are unavailable.** {notice or LLM_UNAVAILABLE_NOTICE}")
        parts.append(
            "I cannot generate an explanation or interpret your results without a language model. "
            "What follows is evidence retrieved directly from your report and the bundled medical "
            "reference documents — not an AI-generated answer."
        )

        if matched:
            parts.append("### Results in your report matching your question")
            for row in matched[:6]:
                unit = f" {row['unit']}" if row["unit"] else ""
                parts.append(
                    f"- **{row['name']}**: {row['value']}{unit} — status **{row['status']}**, "
                    f"printed reference range: {row['reference_range']}\n  - {row['explanation']}"
                )
        elif rows:
            parts.append(
                "No result in this report matched the terms in your question. "
                f"The report contains {len(rows)} parsed result(s); try naming a specific test."
            )
        else:
            parts.append(
                "No structured results were found in this report's extracted text, so there is "
                "nothing to retrieve. Correct the extracted text and re-run the analysis."
            )

        if retrieved_context and retrieved_context.strip():
            parts.append("### Retrieved reference material")
            for chunk in retrieved_context.strip().split("\n\n")[:3]:
                snippet = " ".join(chunk.split())[:500]
                if snippet:
                    parts.append(f"> {snippet}")
        else:
            parts.append(
                "No relevant passage was retrieved from the bundled medical reference documents "
                "for this question, so I have no general information to add."
            )

        parts.append(
            "---\n*This information is educational and is not a substitute for professional "
            "medical advice. Please consult a qualified healthcare provider.*"
        )
        return "\n\n".join(parts)


gemini_client = GeminiClient()
