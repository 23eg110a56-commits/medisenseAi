# MediSense AI - Production-Ready Medical Report Analyzer

[![FastAPI](https://img.shields.io/badge/Backend-FastAPI-009688.svg?style=flat&logo=fastapi)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/Frontend-React_18_TypeScript-61DAFB.svg?style=flat&logo=react)](https://reactjs.org)
[![Gemini](https://img.shields.io/badge/AI-Google_Gemini_2.5_Flash-4285F4.svg?style=flat&logo=google)](https://deepmind.google/technologies/gemini/)
[![RAG](https://img.shields.io/badge/RAG-FAISS_%2B_SentenceTransformers-orange.svg?style=flat)](https://github.com/facebookresearch/faiss)
[![Theme](https://img.shields.io/badge/Theme-Deep_Teal_%26_Mint-0f766e.svg?style=flat)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

> **⚠️ MEDICAL DISCLAIMER:**  
> **MediSense AI is for educational and informational purposes only.** It does not provide clinical diagnoses and is not a substitute for professional medical advice, evaluation, diagnosis, or treatment. Always consult a qualified healthcare provider regarding any health condition or diagnostic test.

---

## 🔬 System Overview

**MediSense AI** is a production-grade healthcare AI web application that enables patients and clinicians to understand complex medical reports (complete blood counts, lipid profiles, diabetes metabolic panels, liver & kidney function tests, thyroid screenings) through plain-language explanations, biomarker trend charts, multi-report comparisons, and context-aware conversational AI.

### Core Capabilities:
1. **Intelligent Multi-Stage OCR**: Robust extraction from digital PDFs, scanned documents, and images using `PyMuPDF` (`fitz`), `pdfplumber`, `OpenCV` image denoising/preprocessing, with automatic fallback to **Gemini 2.5 Flash Vision OCR**.
2. **Knowledge-Grounded RAG Pipeline**: Official reference guides from **WHO**, **NIH**, and **CDC** are embedded with `sentence-transformers (all-MiniLM-L6-v2)` and indexed into **FAISS** on startup (55 clinical guideline chunks).
3. **Structured Biomarker Extraction**: Parses real biomarkers, observed values, standard units, biological reference intervals, and status flags (Normal, High, Low, Critical).
4. **Resilient Dual-Mode Engine**: Operates seamlessly with MongoDB Atlas OR out-of-the-box with the embedded persistent storage engine (JSON database and GridFS file store), requiring zero external databases or Docker setup.
5. **Interactive Health Dashboard**: Chronological health score tracking, biomarker trends (Cholesterol, Blood Glucose, Hemoglobin, Triglycerides), and empty-state guidance for newly registered users.
6. **Timeline Comparison Engine**: Compare reports side-by-side with numerical delta math, percentage changes, visual direction indicators, and clinical narrative summaries.
7. **Conversational Clinical Assistant**: Chatbot equipped with conversation memory, grounded directly on the active report and retrieved RAG reference documents to eliminate hallucinations.
8. **Multi-Language Support**: Complete translations for **English**, **Hindi (हिन्दी)**, and **Telugu (తెలుగు)** with preservation of standard clinical terminology.
9. **Export & Sharing Suite**: One-click authenticated PDF downloads, Word `.docx` documents, printing stylesheets, and secure time-limited 24-hour public sharing links.
10. **Role-Based Access Control**: Strict multi-user data isolation and an administrative console for platform health monitoring.

---

## 🏗️ Architecture & Technology Stack

```
               ┌────────────────────────────────────────────────────────┐
               │           React 18 + Vite + TypeScript Frontend        │
               │      (Deep Teal Theme, Recharts, Lucide, Tailwind)     │
               └───────────────────────────┬────────────────────────────┘
                                           │ REST API (JWT Authenticated)
                                           ▼
               ┌────────────────────────────────────────────────────────┐
               │                  FastAPI Python Backend                │
               │    (Pydantic v2, PyMuPDF, OpenCV, ReportLab, docx)     │
               └───────────┬───────────────────────────────┬────────────┘
                           │                               │
            ┌──────────────▼──────────────┐  ┌─────────────▼────────────┐
            │       AI & RAG Engine       │  │      Database Storage    │
            │  - Gemini 2.5 Flash         │  │  - MongoDB Atlas OR      │
            │  - FAISS Vector DB (55 ch.) │  │  - Embedded Persistent   │
            │  - Sentence-Transformers    │  │    Local Engine + GridFS │
            │  - /knowledge_base Guides   │  │  - Encrypted Credentials │
            └─────────────────────────────┘  └──────────────────────────┘
```

---

## 🚀 Running the Application

Both servers run concurrently:

### 1. Start Backend (Port 8000)
```powershell
cd backend
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
- **Backend API & Swagger Docs**: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)

### 2. Start Frontend (Port 5173)
```powershell
cd frontend
npm run dev
```
- **Web Application URL**: [http://localhost:5173/](http://localhost:5173/)

---

## 🔑 User Accounts & Testing

You can register any new account on the registration page, or sign in using pre-configured accounts:

| Role | Email | Password |
|---|---|---|
| **Standard User** | `user@medisense.ai` | `password123` |
| **System Administrator** | `admin@medisense.ai` | `AdminPassword123!` |

### Sample Reports for Testing:
Test reports are located in the `samples/` directory:
- `samples/sample_cbc_report.pdf` — Complete Blood Count (CBC) with 10 biomarkers
- `samples/sample_lipid_report.pdf` — Comprehensive Lipid Profile Panel with 6 biomarkers

---

## 🧪 Automated Test Suite

Run backend pytest tests:
```powershell
cd backend
python -m pytest tests/ -v
```
All tests pass cleanly (`3 passed in tests/test_api.py`).

---

## 📄 License
MIT License. Created for educational and clinical analysis demonstration purposes.
