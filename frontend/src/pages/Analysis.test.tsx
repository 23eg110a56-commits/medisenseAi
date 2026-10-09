import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const apiMock = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
}));
vi.mock('../services/api', () => ({ default: apiMock }));

vi.mock('react-router-dom', async () => {
  const React2 = await import('react');
  return {
    useParams: () => ({ reportId: 'r1' }),
    useNavigate: () => vi.fn(),
    Link: ({ to, children }: { to: string; children: React.ReactNode }) =>
      React2.createElement('a', { href: to }, children),
  };
});

vi.mock('../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, language: 'en', setLanguage: vi.fn() }),
}));

vi.mock('../context/SystemStatusContext', () => ({
  useSystemStatus: () => ({
    status: {
      llm: { provider: 'google-gemini', model: null, configured: false, reason: 'GEMINI_API_KEY is not set.' },
      ocr: { any_engine_available: true },
      rag: { mode: 'semantic_embeddings' },
      limits: { max_upload_size_mb: 10, allowed_extensions: ['pdf'] },
    },
    loading: false,
    error: null,
    refresh: vi.fn(),
  }),
}));

import { Analysis } from './Analysis';

const EXTRACTED = 'LIPID PROFILE\nTotal Cholesterol 248.0 mg/dL < 200.0 High\n';

function awaitingReviewReport(overrides: Record<string, unknown> = {}) {
  return {
    id: 'r1',
    filename: 'lipid.pdf',
    report_type: '',
    summary: '',
    health_score: null,
    biomarkers: [],
    health_concerns: { summary: '', potential_risks: [] },
    recommendations: {},
    created_at: '2026-10-09T10:00:00Z',
    language: 'en',
    analysis_status: 'awaiting_review',
    extraction_engine: 'pdf_text_layer',
    page_count: 1,
    extracted_text: EXTRACTED,
    ...overrides,
  };
}

function analysedReport(overrides: Record<string, unknown> = {}) {
  return awaitingReviewReport({
    analysis_status: 'analyzed',
    analysis_mode: 'rule_based',
    report_type: 'Lipid Profile',
    summary: 'Of 2 result(s) read from this Lipid Profile, 1 falls outside the reference range.',
    health_score: 50,
    health_score_basis: 'Application heuristic: 1 of 2 parsed results fall within range.',
    llm_notice: 'No AI model is configured on this server.',
    grounding: 'All values are taken from the uploaded document.',
    warnings: ['1 result(s) fall outside the reference range printed in your report: Total Cholesterol (high).'],
    unparsed_lines: ['Erythrocyte Sed Rate 22 mm first hour Westergren'],
    biomarkers: [
      {
        name: 'Total Cholesterol',
        value: '248.0',
        unit: 'mg/dL',
        status: 'High',
        reference_range: '< 200.0',
        explanation: 'A waxy fat carried in the blood.',
        explanation_source: 'general_education',
        notes: [],
      },
      {
        name: 'Serum Ferritin',
        value: '412',
        unit: 'ng/mL',
        status: 'Review',
        reference_range: 'Not printed in report',
        explanation: 'Not in the knowledge base.',
        explanation_source: 'general_education',
        notes: ['No reference range was printed for this row.'],
      },
    ],
    ...overrides,
  });
}

function serverError(status: number, detail: unknown) {
  return { response: { status, data: { detail } } };
}

describe('Analysis page — OCR review and correction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('asks for confirmation before anything is analysed', async () => {
    apiMock.get.mockResolvedValue({ data: awaitingReviewReport() });
    render(<Analysis />);

    expect(await screen.findByText(/Text extracted — confirm it before analysing/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing is analysed until you confirm/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm & analyse/i })).toBeEnabled();
  });

  it('disables analysis when no text could be extracted at all', async () => {
    apiMock.get.mockResolvedValue({
      data: awaitingReviewReport({ extracted_text: '', extraction_engine: null }),
    });
    render(<Analysis />);

    expect(await screen.findByText(/No text could be extracted/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Confirm & analyse/i })).toBeDisabled();
  });

  it('prefills the editor with the extracted text', async () => {
    apiMock.get.mockResolvedValue({ data: awaitingReviewReport() });
    render(<Analysis />);

    fireEvent.click(await screen.findByRole('button', { name: /Review & correct text/i }));

    const editor = await screen.findByRole('textbox');
    expect((editor as HTMLTextAreaElement).value).toBe(EXTRACTED);
    expect(screen.getByText(/OCR misreads digits, decimal points and minus signs/)).toBeInTheDocument();
  });

  it('offers manual entry when the file yielded no text', async () => {
    apiMock.get.mockResolvedValue({ data: awaitingReviewReport({ extracted_text: '' }) });
    render(<Analysis />);

    expect(await screen.findByRole('button', { name: /Enter text manually/i })).toBeInTheDocument();
  });

  it('saves corrections without triggering analysis', async () => {
    apiMock.get.mockResolvedValue({ data: awaitingReviewReport() });
    apiMock.put.mockResolvedValue({
      data: awaitingReviewReport({ text_corrected_by_user: true }),
    });
    render(<Analysis />);

    fireEvent.click(await screen.findByRole('button', { name: /Review & correct text/i }));
    const editor = await screen.findByRole('textbox');
    fireEvent.change(editor, { target: { value: 'Total Cholesterol 246.0 mg/dL < 200.0 High' } });
    fireEvent.click(screen.getByRole('button', { name: /Save text only/i }));

    await waitFor(() => expect(apiMock.put).toHaveBeenCalledTimes(1));
    expect(apiMock.put).toHaveBeenCalledWith('/reports/r1/text', {
      extracted_text: 'Total Cholesterol 246.0 mg/dL < 200.0 High',
    });
    expect(apiMock.post).not.toHaveBeenCalled();
    expect(await screen.findByText('Corrections saved.')).toBeInTheDocument();
    expect(await screen.findByText(/corrected by you/i)).toBeInTheDocument();
  });

  it('saves and analyses in one step, sending the corrected text to the analyser', async () => {
    apiMock.get.mockResolvedValue({ data: awaitingReviewReport() });
    apiMock.put.mockResolvedValue({ data: awaitingReviewReport({ text_corrected_by_user: true }) });
    apiMock.post.mockResolvedValue({ data: analysedReport() });
    render(<Analysis />);

    fireEvent.click(await screen.findByRole('button', { name: /Review & correct text/i }));
    fireEvent.change(await screen.findByRole('textbox'), {
      target: { value: 'Total Cholesterol 246.0 mg/dL < 200.0 High' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save & analyse/i }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.put).toHaveBeenCalledWith('/reports/r1/text', {
      extracted_text: 'Total Cholesterol 246.0 mg/dL < 200.0 High',
    });
    expect(apiMock.post).toHaveBeenCalledWith('/reports/r1/analyze', {
      extracted_text: 'Total Cholesterol 246.0 mg/dL < 200.0 High',
    });
  });

  it('analyses the stored text unchanged when the user did not edit it', async () => {
    apiMock.get.mockResolvedValue({ data: awaitingReviewReport() });
    apiMock.post.mockResolvedValue({ data: analysedReport() });
    render(<Analysis />);

    fireEvent.click(await screen.findByRole('button', { name: /Confirm & analyse/i }));

    await waitFor(() => expect(apiMock.post).toHaveBeenCalledTimes(1));
    expect(apiMock.post).toHaveBeenCalledWith('/reports/r1/analyze', {});
    expect(apiMock.put).not.toHaveBeenCalled();
  });

  it('blocks saving an empty document and explains why', async () => {
    apiMock.get.mockResolvedValue({ data: awaitingReviewReport() });
    render(<Analysis />);

    fireEvent.click(await screen.findByRole('button', { name: /Review & correct text/i }));
    const editor = await screen.findByRole('textbox');
    fireEvent.change(editor, { target: { value: '   ' } });

    expect(screen.getByRole('button', { name: /Save text only/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Save & analyse/i })).toBeDisabled();
  });

  it('surfaces the real server message when saving corrections fails', async () => {
    apiMock.get.mockResolvedValue({ data: awaitingReviewReport() });
    apiMock.put.mockRejectedValue(serverError(404, 'Report not found'));
    render(<Analysis />);

    fireEvent.click(await screen.findByRole('button', { name: /Review & correct text/i }));
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Hemoglobin 13.8 g/dL' } });
    fireEvent.click(screen.getByRole('button', { name: /Save text only/i }));

    expect(await screen.findByText('Report not found')).toBeInTheDocument();
  });

  it('surfaces the real server message when analysis fails', async () => {
    apiMock.get.mockResolvedValue({ data: awaitingReviewReport() });
    apiMock.post.mockRejectedValue(serverError(500, 'Database not connected'));
    render(<Analysis />);

    fireEvent.click(await screen.findByRole('button', { name: /Confirm & analyse/i }));

    expect(await screen.findByText('Database not connected')).toBeInTheDocument();
  });

  it('falls back to a generic message when the server sends nothing usable', async () => {
    apiMock.get.mockResolvedValue({ data: awaitingReviewReport() });
    apiMock.post.mockRejectedValue(new Error('Network Error'));
    render(<Analysis />);

    fireEvent.click(await screen.findByRole('button', { name: /Confirm & analyse/i }));

    expect(await screen.findByText(/Analysis failed\. Please try again\./)).toBeInTheDocument();
  });
});

describe('Analysis page — honest rendering of results', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMock.get.mockResolvedValue({ data: analysedReport() });
  });

  it('labels the analysis as rule-based and shows why', async () => {
    render(<Analysis />);

    expect(await screen.findByText('Rule-based analysis')).toBeInTheDocument();
    expect(screen.getByText('No AI model is configured on this server.')).toBeInTheDocument();
    expect(screen.getByText(/How this analysis was produced/)).toBeInTheDocument();
  });

  it('shows out-of-range warnings prominently', async () => {
    render(<Analysis />);

    expect(await screen.findByText(/Flags you should not ignore/)).toBeInTheDocument();
    expect(
      screen.getByText(/1 result\(s\) fall outside the reference range printed in your report/),
    ).toBeInTheDocument();
  });

  it('prints each value with the range the report actually carried', async () => {
    render(<Analysis />);

    expect(await screen.findByText('Total Cholesterol')).toBeInTheDocument();
    expect(screen.getByText(/248\.0/)).toBeInTheDocument();
    expect(screen.getByText(/< 200\.0/)).toBeInTheDocument();
    // The sentinel the parser emits for a row with no printed range is shown verbatim.
    expect(screen.getByText(/Not printed in report/)).toBeInTheDocument();
    expect(screen.getByText('Serum Ferritin')).toBeInTheDocument();
  });

  it('marks general education as general education, not as a finding', async () => {
    render(<Analysis />);

    const labels = await screen.findAllByText(/general information, not a finding/);
    expect(labels.length).toBe(2);
  });

  it('lists lines that were skipped rather than guessing at them', async () => {
    render(<Analysis />);

    expect(await screen.findByText(/These lines were skipped rather than guessed/)).toBeInTheDocument();
    expect(
      screen.getByText('Erythrocyte Sed Rate 22 mm first hour Westergren'),
    ).toBeInTheDocument();
  });

  it('shows a null health score as unknown with its basis, not as zero', async () => {
    apiMock.get.mockResolvedValue({
      data: analysedReport({
        health_score: null,
        health_score_basis: 'No score calculated: no structured results could be read.',
        biomarkers: [],
      }),
    });
    render(<Analysis />);

    expect(await screen.findByText(/No score calculated/)).toBeInTheDocument();
  });
});

describe('Analysis page — error states', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows the server detail when the report cannot be loaded', async () => {
    apiMock.get.mockRejectedValue(serverError(404, 'Report not found'));
    render(<Analysis />);

    expect(await screen.findByText('Report not found')).toBeInTheDocument();
  });

  it('shows a fallback message when loading fails without a detail', async () => {
    apiMock.get.mockRejectedValue(new Error('Network Error'));
    render(<Analysis />);

    expect(await screen.findByText(/Failed to load this report/)).toBeInTheDocument();
  });
});
