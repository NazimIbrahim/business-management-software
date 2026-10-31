import React, { useState, useEffect } from 'react';
import {
  Printer,
  Download,
  ExternalLink,
  X,
  FileText,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';
import { useServer } from '../context/ServerContext';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  pdfUrl: string;
  title: string;
  fileName?: string;
  quotationId?: number;
  initialEncrypted?: boolean;
}

export const PdfPreviewModal: React.FC<Props> = ({
  isOpen,
  onClose,
  pdfUrl,
  title,
  fileName = 'document.pdf',
  quotationId,
  initialEncrypted = false,
}) => {
  const { getPdfUrl } = useServer();
  const [isEncrypted, setIsEncrypted] = useState(initialEncrypted);
  const [downloading, setDownloading] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    setIsEncrypted(initialEncrypted);
  }, [initialEncrypted, pdfUrl, isOpen]);

  if (!isOpen) return null;

  // Active URL and file name based on encrypted state
  const activePdfUrl = quotationId ? getPdfUrl(quotationId, isEncrypted) : pdfUrl;
  const activeFileName = quotationId
    ? (isEncrypted
        ? fileName.replace(/\.pdf$/i, '').replace(/_Encrypted$/i, '') + '_Encrypted.pdf'
        : fileName.replace(/_Encrypted\.pdf$/i, '.pdf'))
    : fileName;
  const activeTitle = quotationId && isEncrypted
    ? `${title.replace(/\s*\(Encrypted\)/i, '')} (Encrypted)`
    : title;

  const handleToggleEncrypted = (nextEncrypted: boolean) => {
    if (nextEncrypted === isEncrypted) return;
    setLoaded(false);
    setIsEncrypted(nextEncrypted);
  };

  const handlePrint = async () => {
    if (window.electronAPI) {
      await window.electronAPI.printQuotationPdf(activePdfUrl);
    } else {
      const iframe = document.getElementById('pdf-preview-frame') as HTMLIFrameElement;
      if (iframe && iframe.contentWindow) {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
      } else {
        window.open(activePdfUrl, '_blank');
      }
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      if (window.electronAPI) {
        const res = await window.electronAPI.downloadFile(activePdfUrl, activeFileName);
        if (res.success) {
          setDownloadSuccess(`Saved to ${res.filePath}`);
          setTimeout(() => setDownloadSuccess(null), 4000);
        } else if (res.error && res.error !== 'Canceled by user') {
          setError(res.error);
        }
      } else {
        // Web browser direct fetch & blob download
        const res = await fetch(activePdfUrl);
        if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
        const blob = await res.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = activeFileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        setDownloadSuccess('PDF downloaded successfully');
        setTimeout(() => setDownloadSuccess(null), 3000);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to download PDF');
    } finally {
      setDownloading(false);
    }
  };

  const handleOpenExternal = () => {
    if (window.electronAPI) {
      window.electronAPI.openExternal(activePdfUrl);
    } else {
      window.open(activePdfUrl, '_blank');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="bg-white rounded-lg border border-[#CBD5E1] shadow-2xl flex flex-col overflow-hidden w-[92vw] h-[92vh] max-w-6xl modal-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Bar */}
        <div className="px-5 py-3 border-b border-[#E0E1DD] bg-[#F8F9FA] flex items-center justify-between shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded bg-[#0D1B2A] text-[#E0E1DD] flex items-center justify-center font-bold text-xs shadow-sm">
              <FileText size={16} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-[#0D1B2A] tracking-tight leading-tight">
                {activeTitle}
              </h2>
              <p className="text-[11px] text-[#415A77] font-medium">
                Official PDF Preview & Print Engine
              </p>
            </div>
          </div>

          {/* Optional Mode Switcher (Standard vs Encrypted) */}
          {quotationId && (
            <div className="flex items-center bg-[#E0E1DD]/80 p-1 rounded-md border border-[#CBD5E1] text-xs">
              <button
                onClick={() => handleToggleEncrypted(false)}
                className={`px-3 py-1 rounded transition-all font-medium ${
                  !isEncrypted
                    ? 'bg-white text-[#0D1B2A] shadow-sm font-semibold'
                    : 'text-[#415A77] hover:text-[#0D1B2A]'
                }`}
              >
                Standard PDF
              </button>
              <button
                onClick={() => handleToggleEncrypted(true)}
                className={`px-3 py-1 rounded transition-all font-medium flex items-center space-x-1.5 ${
                  isEncrypted
                    ? 'bg-[#0D1B2A] text-amber-300 shadow-sm font-semibold'
                    : 'text-[#415A77] hover:text-[#0D1B2A]'
                }`}
                title="Export with brand removed and product name replaced with random code"
              >
                <ShieldAlert size={12} className={isEncrypted ? 'text-amber-400' : 'text-[#778DA9]'} />
                <span>Encrypted Export</span>
              </button>
            </div>
          )}

          <div className="flex items-center space-x-2">
            {downloadSuccess && (
              <div className="flex items-center space-x-1.5 text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded border border-emerald-200 text-xs font-semibold animate-save-success">
                <CheckCircle size={13} className="animate-icon-pop" />
                <span>{downloadSuccess}</span>
              </div>
            )}

            {error && (
              <div className="flex items-center space-x-1 text-rose-700 bg-rose-50 px-2.5 py-1 rounded border border-rose-200 text-xs font-medium">
                <AlertCircle size={13} />
                <span>{error}</span>
              </div>
            )}

            <button
              onClick={handlePrint}
              className="btn btn-secondary btn-sm"
              title="Print document directly"
            >
              <Printer size={13} />
              <span>Print</span>
            </button>

            <button
              onClick={handleDownload}
              disabled={downloading}
              className={`btn btn-primary btn-sm ${downloading ? 'btn-exporting' : ''}`}
              title="Save PDF file to disk"
            >
              <Download size={13} className={downloading ? 'animate-bounce' : ''} />
              <span>{downloading ? 'Exporting PDF...' : 'Download PDF'}</span>
            </button>

            <button
              onClick={handleOpenExternal}
              className="btn btn-secondary btn-sm p-1.5"
              title="Open in new window"
            >
              <ExternalLink size={14} />
            </button>

            <button
              onClick={onClose}
              className="p-1.5 rounded text-[#778DA9] hover:text-[#0D1B2A] hover:bg-[#E0E1DD]/40 transition-colors"
              title="Close (Esc)"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* PDF Embed Area */}
        <div className="flex-1 bg-[#F4F5F7] relative overflow-hidden flex items-center justify-center">
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#F8F9FA] z-10 animate-page-enter">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-[#1B263B] text-[#E0E1DD] flex items-center justify-center mx-auto mb-3 export-pulse-ring">
                  <RefreshCw size={20} className="animate-spin text-[#778DA9]" />
                </div>
                <p className="text-xs font-bold text-[#0D1B2A]">Generating Official PDF Document...</p>
                <p className="text-[11px] text-[#415A77] mt-0.5">High-Performance Formatting Engine</p>
              </div>
            </div>
          )}

          <iframe
            key={activePdfUrl}
            id="pdf-preview-frame"
            src={activePdfUrl}
            title={activeTitle}
            className="w-full h-full border-0"
            onLoad={() => setLoaded(true)}
          />
        </div>
      </div>
    </div>
  );
};
