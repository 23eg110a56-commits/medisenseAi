import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

afterEach(() => {
  cleanup();
  localStorage.clear();
});

// jsdom does not implement navigation or the clipboard API.
Object.defineProperty(window, 'location', {
  configurable: true,
  writable: true,
  value: { ...window.location, href: window.location.href, pathname: '/', origin: 'http://localhost:5173' },
});

Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  writable: true,
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
});

window.URL.createObjectURL = vi.fn(() => 'blob:mock');
window.URL.revokeObjectURL = vi.fn();

window.matchMedia = window.matchMedia || vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));
