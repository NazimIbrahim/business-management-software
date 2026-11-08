import React, { useState, useEffect } from 'react';
import { ServerProvider, useServer } from './context/ServerContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { Sidebar, NavTab } from './components/Sidebar';
import { ServerSetupModal } from './components/ServerSetupModal';
import { QuotationTypeModal } from './components/QuotationTypeModal';

import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { QuotationList } from './pages/QuotationList';
import { QuotationDetail } from './pages/QuotationDetail';
import { QuotationEditor } from './pages/QuotationEditor';
import { SanitaryQuotationEditor } from './pages/SanitaryQuotationEditor';
import { CustomerManagement } from './pages/CustomerManagement';
import { ProductManagement } from './pages/ProductManagement';
import { SanitaryCatalogManagement } from './pages/SanitaryCatalogManagement';
import { PaymentManagement } from './pages/PaymentManagement';
import { TargetsManagement } from './pages/TargetsManagement';
import { ReportsPage } from './pages/ReportsPage';
import { SalespersonDashboard } from './pages/SalespersonDashboard';
import { CompanySettingsPage } from './pages/CompanySettingsPage';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { BackupRestorePage } from './pages/BackupRestorePage';
import { AdminPanelPage } from './pages/AdminPanelPage';
import { DispatchManagement } from './pages/DispatchManagement';

const AppContent: React.FC = () => {
  const { user, isLoading } = useAuth();
  const { openServerWizard, setOpenServerWizard, fetchApi } = useServer();

  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [selectedQuotationId, setSelectedQuotationId] = useState<number | null>(null);
  const [isEditingQuotation, setIsEditingQuotation] = useState<boolean>(false);
  const [quotationType, setQuotationType] = useState<'tiles' | 'sanitary'>('tiles');
  const [showTypeModal, setShowTypeModal] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const [loadingSlow, setLoadingSlow] = useState<boolean>(false);

  useEffect(() => {
    if (!isLoading) {
      setLoadingSlow(false);
      return;
    }
    const timer = setTimeout(() => {
      setLoadingSlow(true);
    }, 1200);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Redirect upon login: dispatch team goes directly to Local Purchase, others to dashboard
  useEffect(() => {
    if (user) {
      if (user.role === 'dispatch' || user.role === 'dispatch_team') {
        setActiveTab('dispatch-local');
      } else {
        setActiveTab('dashboard');
      }
      setSelectedQuotationId(null);
      setIsEditingQuotation(false);
    }
  }, [user?.id, user?.role]);

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-slate-900 text-slate-100 p-6 select-none relative overflow-hidden">
        {/* Background ambient glow matching app brand */}
        <div className="absolute w-96 h-96 rounded-full bg-blue-600/10 blur-3xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col items-center text-center max-w-sm">
          <div className="w-14 h-14 relative flex items-center justify-center mb-4">
            <div className="w-14 h-14 rounded-full border-4 border-slate-700 border-t-blue-500 animate-spin"></div>
            <span className="absolute text-xs font-black tracking-wider text-blue-400">AMA</span>
          </div>

          <h2 className="text-base font-bold text-white tracking-wide">AMA CERAMICS PVT LTD</h2>
          <p className="text-xs text-slate-400 mt-1">Commercial Quotation & Dispatch Management</p>
          <div className="mt-3 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-[11px] text-slate-300">
            Initializing system & session...
          </div>

          {loadingSlow && (
            <div className="mt-6 flex flex-col gap-2.5 w-full animate-fade-in">
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem('ama_token');
                  } catch {}
                  window.location.reload();
                }}
                className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-xs font-semibold rounded-lg shadow-lg shadow-blue-600/20 transition-all cursor-pointer"
              >
                Go to Sign In Screen
              </button>
              <button
                type="button"
                onClick={() => setOpenServerWizard(true)}
                className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-lg border border-slate-700 transition cursor-pointer"
              >
                Configure Host Server
              </button>
            </div>
          )}
        </div>

        <ServerSetupModal isOpen={openServerWizard} onClose={() => setOpenServerWizard(false)} />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <Login onOpenServerSettings={() => setOpenServerWizard(true)} />
        <ServerSetupModal isOpen={openServerWizard} onClose={() => setOpenServerWizard(false)} />
      </>
    );
  }

  const handleSelectQuotation = (id: number) => {
    setSelectedQuotationId(id);
    setIsEditingQuotation(false);
    setActiveTab('quotations');
  };

  const handleEditQuotation = async (id: number, type?: 'tiles' | 'sanitary') => {
    setSelectedQuotationId(id);
    setIsEditingQuotation(true);
    if (type) {
      setQuotationType(type);
      setActiveTab(type === 'sanitary' ? 'quotation-create-sanitary' : 'quotation-create-tiles');
    } else {
      try {
        const res = await fetchApi(`/api/quotations/${id}`);
        const foundType = res?.quotation?.quotation_type === 'sanitary' ? 'sanitary' : 'tiles';
        setQuotationType(foundType);
        setActiveTab(foundType === 'sanitary' ? 'quotation-create-sanitary' : 'quotation-create-tiles');
      } catch {
        setQuotationType('tiles');
        setActiveTab('quotation-create-tiles');
      }
    }
  };

  const handleCreateQuotation = (type?: 'tiles' | 'sanitary') => {
    if (!type) {
      setShowTypeModal(true);
      return;
    }
    setSelectedQuotationId(null);
    setQuotationType(type);
    setIsEditingQuotation(true);
    setActiveTab(type === 'sanitary' ? 'quotation-create-sanitary' : 'quotation-create-tiles');
    setShowTypeModal(false);
  };

  const handleBackToList = () => {
    setSelectedQuotationId(null);
    setIsEditingQuotation(false);
    setActiveTab('quotations');
  };

  const handleNavTabChange = (tab: NavTab) => {
    setIsMobileMenuOpen(false);
    if (tab === 'quotation-create-tiles') {
      setSelectedQuotationId(null);
      setQuotationType('tiles');
      setIsEditingQuotation(true);
      setActiveTab('quotation-create-tiles');
    } else if (tab === 'quotation-create-sanitary') {
      setSelectedQuotationId(null);
      setQuotationType('sanitary');
      setIsEditingQuotation(true);
      setActiveTab('quotation-create-sanitary');
    } else {
      setIsEditingQuotation(false);
      if (tab !== 'quotations') {
        setSelectedQuotationId(null);
      }
      setActiveTab(tab);
    }
  };

  const renderMainContent = () => {
    // Restrict dispatch team exclusively to dispatch views
    const isDispatch = user?.role === 'dispatch' || user?.role === 'dispatch_team';
    if (isDispatch) {
      if (activeTab === 'dispatch-processing') return <DispatchManagement initialView="processing" />;
      if (activeTab === 'dispatch-completed') return <DispatchManagement initialView="completed" />;
      if (activeTab === 'dispatch-schedule') return <DispatchManagement initialView="schedule" />;
      if (activeTab === 'dispatch-local-tracker' || activeTab === 'dispatch-local') return <DispatchManagement initialView="local-tracker" />;
      if (activeTab === 'dispatch-factory-tracker' || activeTab === 'dispatch-factory') return <DispatchManagement initialView="factory-tracker" />;
      if (activeTab === 'dispatch-payment-tracking') return <DispatchManagement initialView="payment-tracking" />;
      if (activeTab === 'dispatch-local-history') return <DispatchManagement initialView="local-history" />;
      if (activeTab === 'dispatch-factory-history') return <DispatchManagement initialView="factory-history" />;
      if (activeTab === 'dispatch-reports') return <DispatchManagement initialView="reports" />;
      return <DispatchManagement initialView="all-closed" />;
    }

    // If a quotation is being edited or created
    const isSanitary =
      activeTab === 'quotation-create-sanitary' ||
      (isEditingQuotation && quotationType === 'sanitary');

    const isTileCreate =
      activeTab === 'quotation-create-tiles' ||
      activeTab === 'quotation-create' ||
      (isEditingQuotation && quotationType === 'tiles');

    if (isSanitary) {
      return (
        <SanitaryQuotationEditor
          quotationId={selectedQuotationId}
          onBack={handleBackToList}
          onSaved={(newId) => {
            setSelectedQuotationId(newId);
            setIsEditingQuotation(false);
            setActiveTab('quotations');
          }}
        />
      );
    }

    if (isTileCreate || isEditingQuotation) {
      return (
        <QuotationEditor
          quotationId={selectedQuotationId}
          onBack={handleBackToList}
          onSaved={(newId) => {
            setSelectedQuotationId(newId);
            setIsEditingQuotation(false);
            setActiveTab('quotations');
          }}
        />
      );
    }

    // If viewing single quotation detail
    if (selectedQuotationId && activeTab === 'quotations') {
      return (
        <QuotationDetail
          quotationId={selectedQuotationId}
          onBack={() => setSelectedQuotationId(null)}
          onEdit={(id, type) => handleEditQuotation(id, type)}
          onRecordPayment={() => {
            setActiveTab('payments');
          }}
        />
      );
    }

    // Standard tab rendering
    switch (activeTab) {
      case 'dashboard':
        return (
          <Dashboard
            onSelectQuotation={handleSelectQuotation}
            onCreateQuotation={() => handleCreateQuotation()}
          />
        );
      case 'quotations':
        return (
          <QuotationList
            onSelectQuotation={handleSelectQuotation}
            onEditQuotation={(id, type) => handleEditQuotation(id, type)}
            onCreateQuotation={(type) => handleCreateQuotation(type)}
          />
        );
      case 'dispatch':
      case 'dispatch-all-closed':
        return <DispatchManagement initialView="all-closed" />;
      case 'dispatch-processing':
        return <DispatchManagement initialView="processing" />;
      case 'dispatch-completed':
        return <DispatchManagement initialView="completed" />;
      case 'dispatch-schedule':
        return <DispatchManagement initialView="schedule" />;
      case 'dispatch-local-tracker':
      case 'dispatch-local':
        return <DispatchManagement initialView="local-tracker" />;
      case 'dispatch-factory-tracker':
      case 'dispatch-factory':
        return <DispatchManagement initialView="factory-tracker" />;
      case 'dispatch-payment-tracking':
        return <DispatchManagement initialView="payment-tracking" />;
      case 'dispatch-local-history':
        return <DispatchManagement initialView="local-history" />;
      case 'dispatch-factory-history':
        return <DispatchManagement initialView="factory-history" />;
      case 'dispatch-reports':
        return <DispatchManagement initialView="reports" />;
      case 'salespersons':
        return (
          <SalespersonDashboard
            onSelectQuotation={handleSelectQuotation}
            onEditQuotation={(id, type) => handleEditQuotation(id, type)}
            onCreateQuotation={() => handleCreateQuotation()}
          />
        );
      case 'customers':
        return <CustomerManagement onSelectQuotation={handleSelectQuotation} />;
      case 'products':
        return <ProductManagement />;
      case 'sanitary-catalog':
        return <SanitaryCatalogManagement />;
      case 'payments':
        return <PaymentManagement />;
      case 'targets':
        return <TargetsManagement />;
      case 'reports':
        return <ReportsPage onSelectQuotation={handleSelectQuotation} />;
      case 'admin-panel':
        return <AdminPanelPage />;
      case 'company':
        return <CompanySettingsPage />;
      case 'audit':
        return <AuditLogsPage />;
      case 'backup':
        return <BackupRestorePage />;
      default:
        return (
          <Dashboard
            onSelectQuotation={handleSelectQuotation}
            onCreateQuotation={() => handleCreateQuotation()}
          />
        );
    }
  };

  return (
    <div className="h-screen flex flex-col app-liquid-bg overflow-hidden select-none">
      <Header
        onOpenServerSettings={() => setOpenServerWizard(true)}
        onToggleSidebar={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
        isSidebarOpen={isMobileMenuOpen}
      />

      <div className="flex-1 flex overflow-hidden relative">
        <Sidebar
          activeTab={activeTab}
          setActiveTab={handleNavTabChange}
          isOpen={isMobileMenuOpen}
          onClose={() => setIsMobileMenuOpen(false)}
        />
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-transparent">
          <div
            key={activeTab + (selectedQuotationId ? `-${selectedQuotationId}` : '') + (isEditingQuotation ? '-edit' : '')}
            className="flex-1 flex flex-col min-w-0 overflow-y-auto overflow-x-hidden bg-transparent animate-page-enter"
          >
            {renderMainContent()}
          </div>
        </main>
      </div>

      <ServerSetupModal isOpen={openServerWizard} onClose={() => setOpenServerWizard(false)} />
      <QuotationTypeModal
        isOpen={showTypeModal}
        onClose={() => setShowTypeModal(false)}
        onSelectType={(t) => handleCreateQuotation(t)}
      />
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <ServerProvider>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </ServerProvider>
  );
};
