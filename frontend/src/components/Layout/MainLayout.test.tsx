import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { SystemStatus } from '../../context/SystemStatusContext';

vi.mock('./Header', () => ({ Header: () => <div data-testid="header" /> }));
vi.mock('./Sidebar', () => ({ Sidebar: () => <div data-testid="sidebar" /> }));
vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({
    t: (key: string) =>
      key === 'disclaimerTitle' ? 'Medical Disclaimer' : 'Not a substitute for professional medical advice.',
    language: 'en',
    setLanguage: vi.fn(),
  }),
}));

const useSystemStatusMock = vi.fn();
vi.mock('../../context/SystemStatusContext', () => ({
  useSystemStatus: () => useSystemStatusMock(),
}));

import { MainLayout } from './MainLayout';

function statusWith(overrides: Partial<SystemStatus> = {}): SystemStatus {
  return {
    llm: { provider: 'google-gemini', model: 'gemini-2.5-flash', configured: true, reason: null },
    ocr: {
      pdf_text_layer: true,
      image_preprocessing: true,
      easyocr: true,
      tesseract: true,
      any_engine_available: true,
    },
    rag: { mode: 'semantic_embeddings', chunks: 55, embeddings_loaded: true },
    storage: { mode: 'mongodb' },
    limits: { max_upload_size_mb: 10, allowed_extensions: ['pdf', 'png', 'jpg', 'jpeg'] },
    dev_otp_exposed: false,
    ...overrides,
  };
}

describe('MainLayout capability disclosure', () => {
  beforeEach(() => useSystemStatusMock.mockReset());

  it('shows no warning when every capability is available', () => {
    useSystemStatusMock.mockReturnValue({ status: statusWith(), loading: false, error: null });
    render(<MainLayout><div>page body</div></MainLayout>);

    expect(screen.queryByText(/AI model not configured/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No OCR engine available/i)).not.toBeInTheDocument();
    expect(screen.getByText('page body')).toBeInTheDocument();
  });

  it('discloses the missing API key and names the fallback instead of implying AI output', () => {
    useSystemStatusMock.mockReturnValue({
      status: statusWith({
        llm: { provider: 'google-gemini', model: null, configured: false, reason: 'GEMINI_API_KEY is not set.' },
      }),
      loading: false,
      error: null,
    });
    render(<MainLayout><div>page body</div></MainLayout>);

    expect(screen.getByText(/AI model not configured/i)).toBeInTheDocument();
    expect(screen.getByText(/GEMINI_API_KEY is not set/i)).toBeInTheDocument();
    expect(screen.getByText(/rule-based parser/i)).toBeInTheDocument();
  });

  it('warns about missing OCR without claiming digital PDFs are broken', () => {
    useSystemStatusMock.mockReturnValue({
      status: statusWith({
        ocr: {
          pdf_text_layer: true,
          image_preprocessing: true,
          easyocr: false,
          tesseract: false,
          any_engine_available: false,
        },
      }),
      loading: false,
      error: null,
    });
    render(<MainLayout><div>page body</div></MainLayout>);

    expect(screen.getByText(/No OCR engine available/i)).toBeInTheDocument();
    expect(screen.getByText(/Digital PDFs with a selectable text layer still work/i)).toBeInTheDocument();
  });

  it('does not warn before the status request has resolved', () => {
    useSystemStatusMock.mockReturnValue({ status: null, loading: true, error: null });
    render(<MainLayout><div>page body</div></MainLayout>);

    expect(screen.queryByText(/AI model not configured/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No OCR engine available/i)).not.toBeInTheDocument();
  });

  it('always renders the medical disclaimer', () => {
    useSystemStatusMock.mockReturnValue({ status: statusWith(), loading: false, error: null });
    render(<MainLayout><div>page body</div></MainLayout>);

    expect(screen.getByText('Medical Disclaimer')).toBeInTheDocument();
    expect(
      screen.getByText('Not a substitute for professional medical advice.'),
    ).toBeInTheDocument();
  });

  it('renders the shell around the page content', () => {
    useSystemStatusMock.mockReturnValue({ status: statusWith(), loading: false, error: null });
    render(<MainLayout><div>page body</div></MainLayout>);

    expect(screen.getByTestId('header')).toBeInTheDocument();
    expect(screen.getByTestId('sidebar')).toBeInTheDocument();
  });
});
