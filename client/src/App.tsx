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

  // Always redirect to dashboard upon login
  useEffect(() => {
    if (user) {
      setActiveTab('dashboard');
      setSelectedQuotationId(null);
      setIsEditingQuotation(false);
    }
  }, [user?.id]);

  if (isLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100">
        <div className="text-center">
          <div className="w-9 h-9 border-3 border-slate-900 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs font-semibold text-slate-700">Loading Quotation System...</p>
        </div>
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
        return <DispatchManagement />;
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
