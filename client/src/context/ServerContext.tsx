import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { CompanySettings } from '../types';

// Extend window for Electron API
declare global {
  interface Window {
    electronAPI?: {
      isElectron: boolean;
      getServerUrl: () => Promise<string>;
      saveServerUrl: (url: string) => Promise<boolean>;
      openExternal: (url: string) => Promise<void>;
      saveFileDialog: (defaultName: string) => Promise<string | null>;
      downloadFile: (url: string, filename: string) => Promise<{ success: boolean; filePath?: string; error?: string }>;
      printQuotationPdf: (pdfUrl: string) => Promise<boolean>;
    };
  }
}

export type ConnectionStatus = 'connected' | 'connecting' | 'disconnected';

interface ServerContextType {
  serverUrl: string;
  setServerUrl: (url: string) => Promise<void>;
  status: ConnectionStatus;
  latencyMs: number | null;
  lastSyncTime: Date | null;
  testConnection: (targetUrl?: string) => Promise<{ ok: boolean; message: string; latency: number }>;
  fetchApi: <T = any>(endpoint: string, options?: RequestInit & { timeoutMs?: number }) => Promise<T>;
  getPdfUrl: (quotationId: number, encrypted?: boolean) => string;
  getVersionPdfUrl: (quotationId: number, versionNumber: number, encrypted?: boolean) => string;
  getReceiptUrl: (paymentId: number) => string;
  subscribeToEvents: (callback: (event: any) => void) => () => void;
  openServerWizard: boolean;
  setOpenServerWizard: (open: boolean) => void;
  company: CompanySettings | null;
  reloadCompany: () => Promise<void>;
}

const ServerContext = createContext<ServerContextType | undefined>(undefined);

const getDefaultServerUrl = (): string => {
  const envUrl = (import.meta as any).env?.VITE_API_URL?.trim();
  if (envUrl) return envUrl;

  const isElectron = typeof window !== 'undefined' && Boolean((window as any).electronAPI);

  // If in Electron (Windows desktop client)
  if (isElectron) {
    const saved = localStorage.getItem('ama_server_url')?.trim();
    if (saved) return saved;
    return 'http://localhost:4000';
  }

  // 1. Prioritize user's saved server URL from previous configuration
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('ama_server_url')?.trim();
    // If user has old obsolete or vercel domain saved in localStorage as server target, purge it
    if (saved && (saved.includes('.vercel.app') || saved.includes('ama-quotation-api'))) {
      localStorage.removeItem('ama_server_url');
    } else if (saved) {
      return saved;
    }
  }

  // 2. In a browser environment (Chrome / Safari / Edge / Mobile Phone)
  if (typeof window !== 'undefined' && window.location) {
    const { protocol, hostname, port, origin } = window.location;

    // Detect if running on static frontend hosting (Vercel, Netlify, GitHub Pages, etc.)
    const isStaticHosting =
      hostname.endsWith('.vercel.app') ||
      hostname.endsWith('.netlify.app') ||
      hostname.endsWith('.github.io');

    if (isStaticHosting) {
      return 'https://business-management-software1.onrender.com';
    }

    // If served directly from Express Host Server (port 4000) or custom LAN web portal
    if (hostname && (port === '4000' || (!port && !isStaticHosting))) {
      return origin;
    }

    // If served via Vite dev server on port 5173 / 3000, backend is on port 4000
    if (port === '5173' || port === '3000' || port === '5174') {
      return `${protocol}//${hostname}:4000`;
    }

    if (hostname) {
      return origin;
    }
  }

  return 'http://localhost:4000';
};

export const ServerProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [serverUrl, setServerUrlState] = useState<string>(() => getDefaultServerUrl());
  const [status, setStatus] = useState<ConnectionStatus>('connecting');
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [openServerWizard, setOpenServerWizard] = useState<boolean>(false);
  const [company, setCompany] = useState<CompanySettings | null>(() => {
    try {
      const cached = localStorage.getItem('ama_company_cache');
      return cached ? JSON.parse(cached) : null;
    } catch {
      return null;
    }
  });

  const wsRef = useRef<WebSocket | null>(null);
  const subscribersRef = useRef<Set<(event: any) => void>>(new Set());
  const reconnectTimeoutRef = useRef<any>(null);

  // Auto-normalize user input (supports LAN IP addresses and Cloud URLs like Render, Railway, etc.)
  const normalizeUrl = (input: string): string => {
    let clean = input.trim();
    if (!clean) return getDefaultServerUrl();

    const isExplicitHttps = clean.startsWith('https://');
    const withoutScheme = clean.replace(/^https?:\/\//, '');
    const hostPart = withoutScheme.split('/')[0];
    const isCloudDomain = /^[a-zA-Z0-9-]+\.(onrender\.com|vercel\.app|railway\.app|herokuapp\.com|cyclic\.app|fly\.dev|neon\.tech|[a-z]{2,})/i.test(
      hostPart.split(':')[0]
    );

    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      if (isCloudDomain) {
        clean = `https://${clean}`;
      } else {
        clean = `http://${clean}`;
      }
    }

    const currentUrlWithoutProto = clean.replace(/^https?:\/\//, '');
    const currentHost = currentUrlWithoutProto.split('/')[0];

    // Only append port 4000 if no port is specified and it's NOT an explicit https or cloud domain
    if (!currentHost.includes(':') && !isExplicitHttps && !isCloudDomain) {
      clean = clean.replace(currentHost, `${currentHost}:4000`);
    }

    return clean.replace(/\/$/, '');
  };

  // Load persisted server URL from Electron preload or auto-connect to localhost:4000
  useEffect(() => {
    if ((window as any).electronAPI) {
      // First, test if local host is running
      fetch('http://localhost:4000/api/health', { method: 'GET' })
        .then(async (res) => {
          if (res.ok) {
            // Local Host Server is running locally! Always prioritize local host on desktop!
            setServerUrlState('http://localhost:4000');
            localStorage.setItem('ama_server_url', 'http://localhost:4000');
            setStatus('connected');
            if (window.electronAPI) {
              await window.electronAPI.saveServerUrl('http://localhost:4000');
            }
          }
        })
        .catch(() => {
          // If localhost not running, read saved URL or fallback to cloud
          (window as any).electronAPI.getServerUrl().then((savedUrl: string) => {
            if (savedUrl && savedUrl !== serverUrl) {
              const normalized = normalizeUrl(savedUrl);
              setServerUrlState(normalized);
              localStorage.setItem('ama_server_url', normalized);
            }
          });
        });
    }
  }, []);

  const saveUrl = async (newUrl: string) => {
    const cleanUrl = normalizeUrl(newUrl);
    setServerUrlState(cleanUrl);
    localStorage.setItem('ama_server_url', cleanUrl);
    if (window.electronAPI) {
      await window.electronAPI.saveServerUrl(cleanUrl);
    }
    // Reconnect WebSocket to new server
    connectWebSocket(cleanUrl);
  };

  // Test connection to server
  const testConnection = async (targetUrl?: string): Promise<{ ok: boolean; message: string; latency: number }> => {
    const url = normalizeUrl(targetUrl || serverUrl);
    const start = performance.now();
    try {
      const response = await fetch(`${url}/api/health`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const latency = Math.round(performance.now() - start);

      if (response.ok) {
        const data = await response.json();
        return {
          ok: true,
          message: data.dbConnected
            ? `Connected (${data.server || 'Server OK'}, DB: Online)`
            : `Server Connected, but Database Degraded: ${data.dbError || 'PostgreSQL offline'}. Please check DATABASE_URL in Render.`,
          latency,
        };
      } else {
        return { ok: false, message: `Server returned HTTP ${response.status}`, latency };
      }
    } catch (err: any) {
      const latency = Math.round(performance.now() - start);
      return {
        ok: false,
        message: err.message === 'Failed to fetch' 
          ? `Cannot reach server at ${url}. Check LAN connection, firewall, or Host IP.`
          : (err.message || 'Connection failed'),
        latency,
      };
    }
  };

  // Reload company settings from server
  const reloadCompany = useCallback(async () => {
    try {
      const fullUrl = `${serverUrl}/api/company`;
      const token = localStorage.getItem('ama_token');
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch(fullUrl, { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.company) {
          setCompany(data.company);
          try {
            localStorage.setItem('ama_company_cache', JSON.stringify(data.company));
          } catch {}
        }
      }
    } catch {
      // background refresh error, ignore
    }
  }, [serverUrl]);

  // Verify HTTP API connectivity & perform intelligent auto-failover
  const verifyHttpConnectivity = useCallback(async (url: string) => {
    const isCloudUrl = url.includes('onrender.com');
    const healthTimeout = isCloudUrl ? 25000 : 8000;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), healthTimeout);
      const res = await fetch(`${url}/api/health`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data = await res.json();
        if (data.status === 'ok' || data.dbConnected) {
          setStatus('connected');
          setLastSyncTime(new Date());
          return true;
        }
      }
    } catch {
      // Primary URL failed; test alternative auto-failover target before declaring disconnected
      if (isCloudUrl) {
        // Probe local host server
        try {
          const lController = new AbortController();
          const lTimeout = setTimeout(() => lController.abort(), 3000);
          const lRes = await fetch('http://localhost:4000/api/health', { signal: lController.signal });
          clearTimeout(lTimeout);
          if (lRes.ok) {
            setServerUrlState('http://localhost:4000');
            localStorage.setItem('ama_server_url', 'http://localhost:4000');
            setStatus('connected');
            return true;
          }
        } catch {}
      } else if (url.includes('localhost') || url.includes('127.0.0.1') || url.includes('vercel.app')) {
        // Probe cloud server on Render
        try {
          const cController = new AbortController();
          const cTimeout = setTimeout(() => cController.abort(), 5000);
          const cRes = await fetch('https://business-management-software1.onrender.com/api/health', { signal: cController.signal });
          clearTimeout(cTimeout);
          if (cRes.ok) {
            setServerUrlState('https://business-management-software1.onrender.com');
            localStorage.setItem('ama_server_url', 'https://business-management-software1.onrender.com');
            setStatus('connected');
            return true;
          }
        } catch {}
      }
    }
    setStatus('disconnected');
    return false;
  }, []);

  // Connect WebSocket for LAN real-time notifications
  const connectWebSocket = useCallback((urlToUse: string) => {
    if (wsRef.current) {
      try {
        wsRef.current.close();
      } catch (e) {}
    }

    const wsUrl = urlToUse.replace(/^http/, 'ws') + '/ws';
    setStatus('connecting');

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          const pingStart = Date.now();
          ws.send(JSON.stringify({ type: 'PING' }));
          (ws as any)._lastPing = pingStart;
        }
      }, 15000);

      ws.onopen = () => {
        setStatus('connected');
        setLastSyncTime(new Date());
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'PONG') {
            if ((ws as any)._lastPing) {
              setLatencyMs(Date.now() - (ws as any)._lastPing);
            }
          } else {
            setLastSyncTime(new Date());
            if (data.type === 'SETTINGS_UPDATED') {
              const incomingComp = data.payload?.company || data.company;
              if (incomingComp) {
                setCompany(incomingComp);
                try {
                  localStorage.setItem('ama_company_cache', JSON.stringify(incomingComp));
                } catch {}
              } else {
                reloadCompany();
              }
            }
            // Broadcast to subscribers
            subscribersRef.current.forEach((cb) => cb(data));
          }
        } catch (e) {}
      };

      ws.onclose = () => {
        clearInterval(pingInterval);
        // Do NOT instantly flag disconnected: let HTTP check confirm real connectivity
        verifyHttpConnectivity(urlToUse);
        // Auto-reconnect after 4 seconds
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket(urlToUse);
        }, 4000);
      };

      ws.onerror = () => {
        // Do NOT instantly flag disconnected: let HTTP check confirm real connectivity
        verifyHttpConnectivity(urlToUse);
      };
    } catch (err) {
      verifyHttpConnectivity(urlToUse);
    }
  }, [verifyHttpConnectivity, reloadCompany]);

  useEffect(() => {
    connectWebSocket(serverUrl);
    verifyHttpConnectivity(serverUrl);

    // Recurring HTTP health heartbeat every 15 seconds
    const heartbeat = setInterval(() => {
      verifyHttpConnectivity(serverUrl);
    }, 15000);

    return () => {
      clearInterval(heartbeat);
      clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [serverUrl, connectWebSocket, verifyHttpConnectivity]);

  // Subscribe to real-time events
  const subscribeToEvents = useCallback((callback: (event: any) => void) => {
    subscribersRef.current.add(callback);
    return () => {
      subscribersRef.current.delete(callback);
    };
  }, []);

  // Central fetch wrapper with JWT token, timeout watchdog & error handling
  const fetchApi = useCallback(
    async <T = any>(endpoint: string, options: RequestInit & { timeoutMs?: number } = {}): Promise<T> => {
      const token = localStorage.getItem('ama_token');
      const headers = new Headers(options.headers || {});

      if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
        headers.set('Content-Type', 'application/json');
      }
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
      const fullUrl = `${serverUrl}${cleanEndpoint}`;

      const isCloud = serverUrl.includes('onrender.com');
      const defaultTimeout = isCloud ? 35000 : 15000;
      const timeoutMs = options.timeoutMs ?? defaultTimeout;

      const performFetch = async (currentTimeout: number): Promise<T> => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), currentTimeout);

        try {
          const response = await fetch(fullUrl, {
            ...options,
            headers,
            signal: options.signal || controller.signal,
          });

          if (!response.ok) {
            let errMsg = `Request failed: HTTP ${response.status}`;
            try {
              const errData = await response.json();
              if (errData.error) errMsg = errData.error;
            } catch (e) {}
            throw new Error(errMsg);
          }

          return (await response.json()) as T;
        } finally {
          clearTimeout(timeoutId);
        }
      };

      try {
        return await performFetch(timeoutMs);
      } catch (err: any) {
        const isNetworkErr =
          err.name === 'AbortError' ||
          (err.message && err.message.toLowerCase().includes('failed to fetch')) ||
          (err.message && err.message.toLowerCase().includes('network'));

        // If cloud cold-start caused timeout or network error, retry once with a warm-up grace period
        if (isCloud && isNetworkErr) {
          try {
            await new Promise((resolve) => setTimeout(resolve, 1500));
            return await performFetch(35000);
          } catch (retryErr: any) {
            if (retryErr.name === 'AbortError') {
              throw new Error(`Cloud server is starting up. Please try again in a few moments.`);
            }
            throw retryErr;
          }
        }

        if (err.name === 'AbortError') {
          throw new Error(`Request timed out after ${timeoutMs}ms: ${cleanEndpoint}`);
        }
        throw err;
      }
    },
    [serverUrl]
  );

  const getPdfUrl = useCallback(
    (quotationId: number, encrypted?: boolean) => {
      const token = localStorage.getItem('ama_token');
      const params = new URLSearchParams();
      if (token) params.set('token', token);
      if (encrypted) params.set('encrypted', 'true');
      const query = params.toString();
      return `${serverUrl}/api/quotations/${quotationId}/pdf${query ? `?${query}` : ''}`;
    },
    [serverUrl]
  );

  const getVersionPdfUrl = useCallback(
    (quotationId: number, versionNumber: number, encrypted?: boolean) => {
      const token = localStorage.getItem('ama_token');
      const params = new URLSearchParams();
      if (token) params.set('token', token);
      if (encrypted) params.set('encrypted', 'true');
      const query = params.toString();
      return `${serverUrl}/api/quotations/${quotationId}/versions/${versionNumber}/pdf${query ? `?${query}` : ''}`;
    },
    [serverUrl]
  );

  const getReceiptUrl = useCallback(
    (paymentId: number) => {
      const token = localStorage.getItem('ama_token');
      const query = token ? `?token=${encodeURIComponent(token)}` : '';
      return `${serverUrl}/api/payments/${paymentId}/receipt${query}`;
    },
    [serverUrl]
  );

  useEffect(() => {
    reloadCompany();
  }, [reloadCompany]);

  return (
    <ServerContext.Provider
      value={{
        serverUrl,
        setServerUrl: saveUrl,
        status,
        latencyMs,
        lastSyncTime,
        testConnection,
        fetchApi,
        getPdfUrl,
        getVersionPdfUrl,
        getReceiptUrl,
        subscribeToEvents,
        openServerWizard,
        setOpenServerWizard,
        company,
        reloadCompany,
      }}
    >
      {children}
    </ServerContext.Provider>
  );
};

export const useServer = () => {
  const context = useContext(ServerContext);
  if (!context) {
    throw new Error('useServer must be used within a ServerProvider');
  }
  return context;
};
