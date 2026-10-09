import React, { createContext, useContext, useEffect, useState } from 'react';
import api from '../services/api';

export interface SystemStatus {
  llm: {
    provider: string | null;
    model: string | null;
    configured: boolean;
    reason: string | null;
  };
  ocr: {
    pdf_text_layer: boolean;
    image_preprocessing: boolean;
    easyocr: boolean;
    tesseract: boolean;
    any_engine_available: boolean;
  };
  rag: {
    mode: string;
    chunks: number;
    embeddings_loaded: boolean;
  };
  storage: { mode: string };
  limits: { max_upload_size_mb: number; allowed_extensions: string[] };
  dev_otp_exposed: boolean;
}

interface SystemStatusContextValue {
  status: SystemStatus | null;
  loading: boolean;
  error: string | null;
  refresh: () => void;
}

const SystemStatusContext = createContext<SystemStatusContextValue>({
  status: null,
  loading: true,
  error: null,
  refresh: () => {},
});

export const SystemStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .get('/system/status')
      .then((res) => {
        if (!cancelled) {
          setStatus(res.data);
          setError(null);
        }
      })
      .catch(() => {
        if (!cancelled) setError('Could not reach the backend to check feature availability.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return (
    <SystemStatusContext.Provider
      value={{ status, loading, error, refresh: () => setNonce((n) => n + 1) }}
    >
      {children}
    </SystemStatusContext.Provider>
  );
};

export const useSystemStatus = () => useContext(SystemStatusContext);
