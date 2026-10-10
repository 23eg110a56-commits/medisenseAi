import { describe, it, expect, beforeEach } from 'vitest';
import { AxiosError, AxiosHeaders } from 'axios';
import api from './api';

type Adapter = (config: any) => Promise<any>;

function useAdapter(adapter: Adapter) {
  const previous = api.defaults.adapter;
  api.defaults.adapter = adapter as any;
  return () => {
    api.defaults.adapter = previous as any;
  };
}

function axiosError(status: number, data: unknown = {}) {
  const config = { headers: new AxiosHeaders() } as any;
  return new AxiosError('Request failed', String(status), config, null, {
    status,
    data,
    statusText: '',
    headers: {},
    config,
  } as any);
}

describe('api request interceptor', () => {
  beforeEach(() => localStorage.clear());

  it('attaches the stored bearer token', async () => {
    localStorage.setItem('token', 'jwt-abc');
    let seen: any = null;
    const restore = useAdapter(async (config) => {
      seen = config;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    });

    await api.get('/reports/all');

    expect(seen.headers.Authorization).toBe('Bearer jwt-abc');
    restore();
  });

  it('sends no Authorization header when the user is signed out', async () => {
    let seen: any = null;
    const restore = useAdapter(async (config) => {
      seen = config;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    });

    await api.get('/reports/all');

    expect(seen.headers.Authorization).toBeUndefined();
    restore();
  });

  it('strips Content-Type application/json when sending FormData so multipart boundary is preserved', async () => {
    let seen: any = null;
    const restore = useAdapter(async (config) => {
      seen = config;
      return { data: {}, status: 200, statusText: 'OK', headers: {}, config };
    });

    const formData = new FormData();
    formData.append('sample', 'test');
    await api.post('/reports/upload', formData);

    expect(seen.headers['Content-Type']).not.toBe('application/json');
    restore();
  });
});

describe('api response interceptor', () => {
  beforeEach(() => {
    localStorage.clear();
    window.location.href = 'http://localhost:5173/dashboard';
    window.location.pathname = '/dashboard';
  });

  it('clears the session and redirects on 401 from a protected page', async () => {
    localStorage.setItem('token', 'jwt-abc');
    localStorage.setItem('user', '{"id":"1"}');
    const restore = useAdapter(async () => {
      throw axiosError(401, { detail: 'Token expired' });
    });

    await expect(api.get('/reports/all')).rejects.toThrow();

    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(window.location.href).toBe('/login?expired=true');
    restore();
  });

  it('does not bounce the user off the login page on a failed sign-in', async () => {
    window.location.pathname = '/login';
    window.location.href = 'http://localhost:5173/login';
    const restore = useAdapter(async () => {
      throw axiosError(401, { detail: 'Incorrect password' });
    });

    await expect(api.post('/auth/login', {})).rejects.toThrow();

    expect(window.location.href).toBe('http://localhost:5173/login');
    restore();
  });

  it('leaves the session alone for non-auth failures', async () => {
    localStorage.setItem('token', 'jwt-abc');
    const restore = useAdapter(async () => {
      throw axiosError(500, { detail: 'boom' });
    });

    await expect(api.get('/reports/all')).rejects.toThrow();

    expect(localStorage.getItem('token')).toBe('jwt-abc');
    restore();
  });

  it('passes the server error through so callers can show a real message', async () => {
    const restore = useAdapter(async () => {
      throw axiosError(409, { detail: 'This report has not been analysed yet.' });
    });

    const error = await api.post('/chat/send', {}).catch((e) => e);

    expect(error.response.status).toBe(409);
    expect(error.response.data.detail).toBe('This report has not been analysed yet.');
    restore();
  });
});

describe('api configuration', () => {
  it('points at the versioned API root', () => {
    expect(api.defaults.baseURL).toMatch(/\/api\/v1$/);
  });

  it('sends JSON by default', () => {
    expect((api.defaults.headers as any)['Content-Type']).toBe('application/json');
  });
});
