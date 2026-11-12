import React, { useState } from 'react';
import { useServer } from '../context/ServerContext';
import { Server, Wifi, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export const ServerSetupModal: React.FC<Props> = ({ isOpen, onClose }) => {
  const { serverUrl, setServerUrl, testConnection, status } = useServer();
  const [inputUrl, setInputUrl] = useState(serverUrl);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string; latency?: number } | null>(null);

  if (!isOpen) return null;

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await testConnection(inputUrl);
      setTestResult(res);
    } finally {
      setTesting(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await setServerUrl(inputUrl);
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg p-6 border border-gray-200">
        <div className="flex items-center space-x-3 mb-4">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Server size={24} />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">Server Connection Settings</h2>
            <p className="text-xs text-gray-500">Connect to Central LAN Host or Cloud Backend (Render / Neon)</p>
          </div>
        </div>

        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Server Address (LAN IP or Cloud URL)
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                className="input flex-1 font-mono text-xs"
                placeholder="http://192.168.1.100:4000 or https://your-app.onrender.com"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                required
              />
              <button
                type="button"
                className="btn btn-secondary flex items-center space-x-1"
                onClick={handleTest}
                disabled={testing}
              >
                {testing ? <RefreshCw size={14} className="animate-spin" /> : <Wifi size={14} />}
                <span>Test</span>
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Enter your local LAN Server IP (e.g. <code>http://192.168.1.10:4000</code>) or Cloud API URL (e.g. <code>https://business-management-software1.onrender.com</code>).
            </p>

            {/* Quick Presets */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className="text-[11px] text-gray-500 font-medium">Quick Presets:</span>
              <button
                type="button"
                onClick={() => {
                  setInputUrl('http://localhost:4000');
                  setTestResult(null);
                }}
                className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 transition-colors"
                title="Connect to local server on this machine"
              >
                localhost:4000
              </button>
              <button
                type="button"
                onClick={() => {
                  setInputUrl('https://business-management-software1.onrender.com');
                  setTestResult(null);
                }}
                className="px-2 py-0.5 rounded text-[11px] font-mono bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 transition-colors"
                title="Connect to Render cloud server"
              >
                Render Cloud
              </button>
              {typeof window !== 'undefined' && window.location?.origin && !window.location.origin.includes('localhost') && !window.location.origin.includes('vercel.app') && (
                <button
                  type="button"
                  onClick={() => {
                    setInputUrl(window.location.origin);
                    setTestResult(null);
                  }}
                  className="px-2 py-0.5 rounded text-[11px] font-mono bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 transition-colors"
                  title="Use the address of this web page"
                >
                  Current Host ({window.location.origin})
                </button>
              )}
            </div>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-md text-sm flex items-start space-x-2 ${
                testResult.ok ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'
              }`}
            >
              {testResult.ok ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertCircle size={18} className="mt-0.5 shrink-0" />}
              <div>
                <p className="font-semibold">{testResult.ok ? 'Connection Succeeded!' : 'Connection Failed'}</p>
                <p className="text-xs mt-0.5">{testResult.message}</p>
                {testResult.latency !== undefined && (
                  <p className="text-xs text-gray-500 mt-1">Network Latency: {testResult.latency} ms</p>
                )}
              </div>
            </div>
          )}

          <div className="bg-slate-50 p-3 rounded border text-xs text-slate-600 space-y-1.5">
            <div className="flex justify-between items-center">
              <span>Current Status:</span>
              <span className={`font-semibold capitalize px-2 py-0.5 rounded text-[11px] ${status === 'connected' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                {status}
              </span>
            </div>
            <div className="pt-1 border-t border-slate-200 text-[11px] text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700">LAN Troubleshooting Tips:</p>
              <p>• Ensure both Host and Client PCs are connected to the <strong>exact same Wi-Fi router</strong> or switch.</p>
              <p>• <strong>iPhone / Mobile Hotspot Warning:</strong> iPhone Personal Hotspots block device-to-device communication (AP Isolation). Please use an office/home Wi-Fi router or Android hotspot.</p>
              <p>• Check that the Host Server is running and Windows Firewall permits Port 4000.</p>
            </div>
          </div>

          <div className="flex justify-end space-x-2 pt-2 border-t">
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary">
              Save & Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
