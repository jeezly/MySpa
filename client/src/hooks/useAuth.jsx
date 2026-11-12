import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
const AuthContext = createContext(null);
export const apiError = e => e?.message || 'Ocurrió un error inesperado';
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null), [ready, setReady] = useState(false);
  const csrf = useRef(null);
  const request = useCallback(async (path, { method = 'GET', body, headers = {}, ...options } = {}) => {
    const isForm = body instanceof FormData;
    const res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(!isForm && body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(!['GET', 'HEAD'].includes(method) && csrf.current ? { 'x-csrf-token': csrf.current } : {}),
        ...headers
      },
      ...(body !== undefined ? { body: isForm ? body : JSON.stringify(body) } : {}),
      ...options
    });
    let value;
    try {
      value = await res.json();
    } catch {
      throw new Error('No hubo respuesta válida del servidor. ¿Está encendida la API?');
    }
    if (!res.ok) throw new Error(value?.error || `Error HTTP ${res.status}`);
    return value.data;
  }, []);
  useEffect(() => {
    let mounted = true;
    request('/auth/me').then(data => {
      if (mounted) {
        setUser(data.user);
        csrf.current = data.csrfToken;
      }
    })
      .catch(() => {
        if (mounted) {
          setUser(null);
          csrf.current = null;
        }
      }).finally(() => mounted && setReady(true));
    return () => {
      mounted = false;
    };
  }, [request]);
  const login = useCallback(async (email, password) => {
    const data = await request('/auth/login', { method: 'POST', body: { email, password } });
    csrf.current = data.csrfToken;
    setUser(data.user);
    return data.user;
  }, [request]);
  const logout = useCallback(async () => {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      csrf.current = null;
      setUser(null);
    }
  }, [request]);
  const refresh = useCallback(async () => {
    const data = await request('/auth/me');
    setUser(data.user);
    csrf.current = data.csrfToken;
    return data.user;
  }, [request]);
  return <AuthContext.Provider value={{
    user,
    ready,
    request,
    login,
    logout,
    refresh
  }}>
    {children}
  </AuthContext.Provider>;
}
export const useAuth = () => useContext(AuthContext);
export function useDebounce(value, ms = 320) {
  const [result, setResult] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setResult(value), ms);
    return () => clearTimeout(t)
  }, [value, ms]);
  return result;
}
export function useRemote(load, deps = []) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [error, setError] = useState('');
  useEffect(() => {
    let alive = true;
    setLoading(true);
    load().then(x => {
      if (alive) {
        setData(x);
        setError('')
      }
    }).catch(e => {
      if (alive) setError(apiError(e))
    }).finally(() => alive && setLoading(false));
    return () => {
      alive = false
    }
  }, deps);
  return {
    data,
    loading,
    error,
    setData
  };
}
