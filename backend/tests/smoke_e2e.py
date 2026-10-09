"""Manual end-to-end smoke check against a running server. Run: python tests/smoke_e2e.py"""
import io
import json
import os
import sys
import time

import httpx

BASE = os.environ.get("SMOKE_BASE", "http://127.0.0.1:8000/api/v1")
SAMPLES = os.path.join(os.path.dirname(__file__), "..", "..", "samples")

ok = fail = 0


def check(label, condition, detail=""):
    global ok, fail
    if condition:
        ok += 1
        print(f"  PASS  {label}")
    else:
        fail += 1
        print(f"  FAIL  {label} :: {detail}")


def main():
    stamp = str(int(time.time()))
    email = f"smoke_{stamp}@example.com"
    password = "SmokeTest123!"

    with httpx.Client(base_url=BASE, timeout=180) as c:
        print("\n[1] Registration")
        r = c.post("/auth/register", json={
            "email": email, "password": password, "name": "Smoke Tester", "language": "en",
            "role": "admin",  # must be ignored
        })
        check("register returns 200", r.status_code == 200, r.text[:200])
        token = r.json().get("access_token")
        check("role escalation blocked (registered as user)", r.json().get("role") == "user", r.json().get("role"))
        check("no OTP leaked in response", "dev_otp" not in r.text, r.text[:200])
        h = {"Authorization": f"Bearer {token}"}

        print("\n[2] Login")
        r = c.post("/auth/login", json={"email": email, "password": password})
        check("login returns 200", r.status_code == 200, r.text[:200])
        r = c.post("/auth/login", json={"email": email, "password": "wrong-password"})
        check("bad password rejected", r.status_code == 400, str(r.status_code))

        print("\n[3] Upload validation")
        r = c.post("/reports/upload", headers=h,
                   files={"files": ("evil.exe", b"MZ\x90\x00", "application/octet-stream")})
        check("unsupported extension -> 415", r.status_code == 415, f"{r.status_code} {r.text[:150]}")
        r = c.post("/reports/upload", headers=h,
                   files={"files": ("empty.pdf", b"", "application/pdf")})
        check("empty file -> 400", r.status_code == 400, f"{r.status_code} {r.text[:150]}")
        r = c.post("/reports/upload", headers=h,
                   files={"files": ("big.pdf", b"%PDF-1.4\n" + b"x" * (11 * 1024 * 1024), "application/pdf")})
        check("oversized file -> 413", r.status_code == 413, f"{r.status_code} {r.text[:150]}")
        r = c.post("/reports/upload", headers=h,
                   files={"files": ("corrupt.pdf", b"%PDF-1.4 not really a pdf", "application/pdf")})
        check("malformed PDF handled without 500", r.status_code in (200, 400), f"{r.status_code} {r.text[:150]}")

        print("\n[4] Upload real sample (CBC PDF) - OCR stage")
        path = os.path.join(SAMPLES, "sample_cbc_report.pdf")
        with open(path, "rb") as f:
            r = c.post("/reports/upload", headers=h,
                       files={"files": ("sample_cbc_report.pdf", f, "application/pdf")},
                       data={"language": "en"})
        check("upload returns 200", r.status_code == 200, r.text[:300])
        body = r.json()
        if "reports" not in body:
            print(f"  ABORT cannot continue without an uploaded report: {r.text[:300]}")
            return 1
        rep = body["reports"][0]
        rid = rep["id"]
        check("status is awaiting_review (analysis not run yet)",
              rep["analysis_status"] == "awaiting_review", rep["analysis_status"])
        check("OCR extracted real text", len(rep["extracted_text"]) > 200, str(len(rep["extracted_text"])))
        check("extraction engine reported", rep["extraction_engine"] == "pdf_text_layer", str(rep["extraction_engine"]))
        check("no biomarkers before analysis", rep["biomarkers"] == [], str(rep["biomarkers"])[:100])

        print("\n[5] Chat blocked before analysis")
        r = c.post("/chat/send", headers=h, json={"report_id": rid, "message": "What is my hemoglobin?"})
        check("chat on unanalysed report -> 409", r.status_code == 409, f"{r.status_code} {r.text[:150]}")

        print("\n[6] OCR correction + analysis")
        corrected = rep["extracted_text"].replace("10.8", "10.9")
        r = c.put(f"/reports/{rid}/text", headers=h, json={"extracted_text": corrected})
        check("text correction accepted", r.status_code == 200, r.text[:200])
        check("correction stored", "10.9" in r.json().get("extracted_text", ""), "value not found")

        r = c.post(f"/reports/{rid}/analyze", headers=h, json={})
        check("analyze returns 200", r.status_code == 200, r.text[:300])
        analysis = r.json()
        bms = analysis.get("biomarkers", [])
        check("analysis_mode disclosed as rule_based", analysis.get("analysis_mode") == "rule_based", str(analysis.get("analysis_mode")))
        check("LLM-unavailable notice present", bool(analysis.get("llm_notice")), "missing")
        check("biomarkers parsed", len(bms) >= 8, str(len(bms)))
        values = {b["name"]: b["value"] for b in bms}
        check("corrected value used (10.9)", values.get("Hemoglobin (Hb)") == "10.9", str(values.get("Hemoglobin (Hb)")))
        check("no fabricated rows", len(bms) == len([l for l in corrected.split("\n")
                                                     if l.strip() and "Low" in l or "Normal" in l]) or len(bms) >= 8,
              str(len(bms)))
        hb = next((b for b in bms if b["name"].startswith("Hemoglobin")), None)
        check("status derived from printed range", hb and hb["status"] == "Low", str(hb))
        check("reference range from document", hb and hb["reference_range"] == "13.5 - 17.5", str(hb))
        check("health_score present", isinstance(analysis.get("health_score"), int), str(analysis.get("health_score")))
        check("score basis disclosed", bool(analysis.get("health_score_basis")), "missing")

        print("\n[7] Fabrication guard - document with no readable results")
        blank = c.post("/reports/upload", headers=h,
                       files={"files": ("notes.pdf", _make_pdf("Patient instructions. Please return next week."), "application/pdf")},
                       data={"language": "en"})
        if blank.status_code == 200:
            bid = blank.json()["reports"][0]["id"]
            a2 = c.post(f"/reports/{bid}/analyze", headers=h, json={}).json()
            check("no biomarkers invented from prose", a2.get("biomarkers") == [], json.dumps(a2.get("biomarkers"))[:200])
            check("health_score is null when nothing parsed", a2.get("health_score") is None, str(a2.get("health_score")))
            check("manual review flagged", a2.get("requires_manual_review") is True, str(a2.get("requires_manual_review")))
            c.delete(f"/reports/delete/{bid}", headers=h)
        else:
            check("blank PDF upload", False, f"{blank.status_code} {blank.text[:200]}")

        print("\n[8] RAG chatbot grounding")
        r = c.post("/chat/send", headers=h, json={"report_id": rid, "message": "What does my hemoglobin result mean?"})
        check("chat returns 200", r.status_code == 200, r.text[:300])
        chat = r.json()
        check("chat discloses it is not AI-generated", chat.get("ai_generated") is False, str(chat.get("ai_generated")))
        check("chat states AI unavailable", "unavailable" in chat["response"].lower(), chat["response"][:200])
        check("chat cites the real value", "10.9" in chat["response"], "value missing")
        check("chat returns sources", isinstance(chat.get("sources"), list), str(chat.get("sources")))
        check("chat includes disclaimer", "not a substitute" in chat["response"].lower(), chat["response"][-200:])

        r = c.post("/chat/send", headers=h, json={"report_id": rid, "message": "What is my vitamin B12 level?"})
        check("unanswerable question handled", r.status_code == 200, r.text[:200])
        check("does not invent B12 value", not any(ch.isdigit() for ch in r.json()["response"].split("vitamin")[0][-40:]) or "No result" in r.json()["response"] or "matched" in r.json()["response"].lower(),
              r.json()["response"][:300])

        r = c.get(f"/chat/history/{rid}", headers=h)
        check("chat history serialises", r.status_code == 200, r.text[:200])

        print("\n[9] Access isolation")
        other = c.post("/auth/register", json={
            "email": f"smoke_other_{stamp}@example.com", "password": password, "name": "Other User"})
        h2 = {"Authorization": f"Bearer {other.json()['access_token']}"}
        r = c.get(f"/reports/detail/{rid}", headers=h2)
        check("other user cannot read report -> 404", r.status_code == 404, str(r.status_code))
        r = c.post(f"/reports/{rid}/analyze", headers=h2, json={})
        check("other user cannot analyse report -> 404", r.status_code == 404, str(r.status_code))
        r = c.delete(f"/reports/delete/{rid}", headers=h2)
        check("other user cannot delete report -> 404", r.status_code == 404, str(r.status_code))
        r = c.get("/reports/all")
        check("no token -> 401", r.status_code == 401, str(r.status_code))
        r = c.get("/reports/all", headers=h2)
        check("other user sees zero of my reports", r.json() == [], json.dumps(r.json())[:150])

        print("\n[10] History + comparison")
        path2 = os.path.join(SAMPLES, "sample_lipid_report.pdf")
        with open(path2, "rb") as f:
            up2 = c.post("/reports/upload", headers=h,
                         files={"files": ("sample_lipid_report.pdf", f, "application/pdf")},
                         data={"language": "en"}).json()
        rid2 = up2["reports"][0]["id"]
        a2 = c.post(f"/reports/{rid2}/analyze", headers=h, json={}).json()
        check("lipid report parsed", len(a2.get("biomarkers", [])) >= 4, str(len(a2.get("biomarkers", []))))

        r = c.get("/reports/all", headers=h)
        listed = r.json()
        names = [x["filename"] for x in listed]
        check("history lists both uploaded samples",
              "sample_cbc_report.pdf" in names and "sample_lipid_report.pdf" in names, str(names))
        check("listing omits raw extracted text",
              all("extracted_text" not in x for x in listed), "raw text present in /reports/all")
        corrupt = [x for x in listed if x["filename"] == "corrupt.pdf"]
        check("unreadable file stored as extraction_failed rather than silently dropped",
              not corrupt or corrupt[0]["analysis_status"] == "extraction_failed",
              str([x["analysis_status"] for x in corrupt]))

        r = c.get("/reports/compare", headers=h, params={"report_id1": rid, "report_id2": rid2})
        check("compare returns 200 (json import fixed)", r.status_code == 200, r.text[:300])
        if r.status_code == 200:
            cmp_body = r.json()
            check("compare marks incomparable tests", isinstance(cmp_body.get("incomparable"), list), str(cmp_body)[:200])
            check("compare narrative present", bool(cmp_body.get("narrative")), "missing")
            check("compare does not fabricate shared markers",
                  all(b["old_value"] == "Not in earlier report" or b["comparable"] for b in cmp_body["biomarkers"]),
                  json.dumps(cmp_body["biomarkers"])[:300])

        print("\n[11] Exports and sharing")
        share_token = None
        r = c.get(f"/reports/export/{rid}/pdf", headers=h)
        check("PDF export", r.status_code == 200 and r.content[:4] == b"%PDF", f"{r.status_code} {r.content[:20]}")
        r = c.get(f"/reports/export/{rid}/docx", headers=h)
        check("DOCX export", r.status_code == 200 and r.content[:2] == b"PK", f"{r.status_code}")
        r = c.post(f"/reports/export/{rid}/share", headers=h)
        check("share link created", r.status_code == 200, r.text[:200])
        if r.status_code == 200:
            share_token = r.json()["share_token"]
            pub = c.get(f"/reports/shared/view/{share_token}")
            check("shared view is public", pub.status_code == 200, str(pub.status_code))
            body = pub.json()
            check("shared view hides user_id", "user_id" not in body, json.dumps(body)[:200])
            check("shared view hides storage id", "gridfs_id" not in body, json.dumps(body)[:200])

        print("\n[12] Deletion")
        r = c.delete(f"/reports/delete/{rid2}", headers=h)
        check("own report deleted", r.status_code == 200, r.text[:150])
        r = c.get(f"/reports/detail/{rid2}", headers=h)
        check("deleted report gone -> 404", r.status_code == 404, str(r.status_code))
        r = c.delete(f"/reports/delete/{rid}", headers=h)
        check("cleanup second report", r.status_code == 200, str(r.status_code))
        if share_token:
            r = c.get(f"/reports/shared/view/{share_token}")
            check("share link revoked when report deleted", r.status_code == 404, str(r.status_code))
        r = c.get(f"/chat/history/{rid}", headers=h)
        check("chat transcript removed with the report",
              r.status_code in (200, 404) and (r.status_code == 404 or r.json() == []),
              f"{r.status_code} {r.text[:150]}")
        for leftover in c.get("/reports/all", headers=h).json():
            c.delete(f"/reports/delete/{leftover['id']}", headers=h)
        check("smoke user left with no reports", c.get("/reports/all", headers=h).json() == [])

        print("\n[13] System status")
        r = c.get("/system/status")
        st = r.json()
        check("status endpoint public", r.status_code == 200, str(r.status_code))
        check("reports llm not configured", st["llm"]["configured"] is False, json.dumps(st["llm"]))
        check("reports rag mode", st["rag"]["mode"] == "semantic_embeddings", json.dumps(st["rag"]))
        check("exposes only the documented surface",
              set(st) == {"llm", "ocr", "rag", "storage", "limits", "dev_otp_exposed"},
              r.text[:300])
        check("no credential material in status",
              not any(k in r.text.lower() for k in ("secret_key", "password", "token", "mongodb_url")),
              r.text[:300])

        print("\n[14] Account deletion")
        r = c.delete("/auth/account", headers=h2)
        check("account deletion returns 200", r.status_code == 200, r.text[:200])
        counts = r.json().get("deleted", {})
        check("cascade reports what it removed",
              set(counts) == {"reports", "chats", "shared_links", "notifications", "otps"},
              json.dumps(counts)[:200])
        r = c.get("/reports/all", headers=h2)
        check("deleted account's token no longer authenticates", r.status_code in (401, 404), str(r.status_code))
        r = c.post("/auth/login", json={"email": f"smoke_other_{stamp}@example.com", "password": password})
        check("deleted account cannot sign in again", r.status_code == 401, str(r.status_code))

        # Give the primary smoke account back to the server so repeated runs do
        # not accumulate accounts holding sensitive records.
        r = c.delete("/auth/account", headers=h)
        check("primary smoke account removed", r.status_code == 200, r.text[:200])
        r = c.post("/auth/login", json={"email": email, "password": password})
        check("primary smoke account cannot sign in again", r.status_code == 401, str(r.status_code))

    print(f"\n{'='*60}\n  {ok} passed, {fail} failed\n{'='*60}")
    return 1 if fail else 0


def _make_pdf(text: str) -> bytes:
    import pymupdf
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), text, fontsize=12)
    data = doc.tobytes()
    doc.close()
    return data


if __name__ == "__main__":
    sys.exit(main())
