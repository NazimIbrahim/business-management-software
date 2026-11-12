import React, { useState, useEffect } from 'react';
import { ServerProvider, useServer } from './context/ServerContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/Header';
import { Sidebar, NavTab } from './components/Sidebar';
import { ServerSetupModal } from './components/ServerSetupModal';
import { QuotationTypeModal } from './components/QuotationTypeModal';
import { ModuleComingSoon } from './components/ModuleComingSoon';

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

  // Quick Action Triggers
  const [quickCustomerAdd, setQuickCustomerAdd] = useState<boolean>(false);
  const [quickPaymentAdd, setQuickPaymentAdd] = useState<boolean>(false);
  const [quickProductAdd, setQuickProductAdd] = useState<boolean>(false);
  const [quickActionModule, setQuickActionModule] = useState<string | null>(null);

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
    setQuickActionModule(null);
    setQuickCustomerAdd(false);
    setQuickPaymentAdd(false);
    setQuickProductAdd(false);

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

  // Quick Action [+] Handler
  const handleQuickAction = (tab: NavTab) => {
    setIsMobileMenuOpen(false);
    if (tab === 'quotations') {
      handleCreateQuotation();
    } else if (tab === 'customers') {
      setSelectedQuotationId(null);
      setIsEditingQuotation(false);
      setActiveTab('customers');
      setQuickCustomerAdd(true);
      setTimeout(() => setQuickCustomerAdd(false), 800);
    } else if (tab === 'payments') {
      setSelectedQuotationId(null);
      setIsEditingQuotation(false);
      setActiveTab('payments');
      setQuickPaymentAdd(true);
      setTimeout(() => setQuickPaymentAdd(false), 800);
    } else if (tab === 'products') {
      setSelectedQuotationId(null);
      setIsEditingQuotation(false);
      setActiveTab('products');
      setQuickProductAdd(true);
      setTimeout(() => setQuickProductAdd(false), 800);
    } else {
      setSelectedQuotationId(null);
      setIsEditingQuotation(false);
      setQuickActionModule(tab);
      setActiveTab(tab);
    }
  };

  const renderMainContent = () => {
    // Restrict dispatch team exclusively to dispatch views
    const isDispatch = user?.role === 'dispatch' || user?.role === 'dispatch_team';
    if (isDispatch) {
      if (activeTab === 'dispatch-processing') return <DispatchManagement initialView="processing" />;
      if (activeTab === 'dispatch-completed') return <DispatchManagement initialView="completed" />;
      if (activeTab === 'dispatch-damage-replacement') return <DispatchManagement initialView="damage-replacement" />;
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
      case 'dispatch-damage-replacement':
        return <DispatchManagement initialView="damage-replacement" />;
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
        return (
          <CustomerManagement
            onSelectQuotation={handleSelectQuotation}
            initialOpenAddModal={quickCustomerAdd}
          />
        );
      case 'products':
        return <ProductManagement initialOpenModal={quickProductAdd} />;
      case 'sanitary-catalog':
        return <SanitaryCatalogManagement />;
      case 'payments':
        return <PaymentManagement initialOpenModal={quickPaymentAdd} />;
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

      // New CRM Modules
      case 'crm-pipeline':
        return (
          <ModuleComingSoon
            title="Sales Pipeline"
            category="CRM"
            description="Visual drag-and-drop pipeline for inquiries, quotation stages, win/loss rates, and deal velocity."
            isQuickAction={quickActionModule === 'crm-pipeline'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'crm-projects':
        return (
          <ModuleComingSoon
            title="Projects & Sites"
            category="CRM"
            description="Multi-site commercial and architectural supply projects tracker with architect and builder mapping."
            isQuickAction={quickActionModule === 'crm-projects'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'crm-inquiries':
        return (
          <ModuleComingSoon
            title="Customer Inquiries"
            category="CRM"
            description="Inbound inquiry triage, showroom walk-ins, phone leads, and automated salesperson assignment."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );

      // New Items Modules
      case 'items-services':
        return (
          <ModuleComingSoon
            title="Services & Installation"
            category="Items"
            description="Tile cutting, polishing, beveling, transport, and site installation charges management."
            isQuickAction={quickActionModule === 'items-services'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'items-price-lists':
        return (
          <ModuleComingSoon
            title="Price Lists & Tiering"
            category="Items"
            description="Custom dealer, architect, and contractor pricing tiers with volume discount matrices."
            isQuickAction={quickActionModule === 'items-price-lists'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'items-kits':
        return (
          <ModuleComingSoon
            title="Kits & Assemblies"
            category="Items"
            description="Pre-bundled bathroom sets, adhesive + tile packages, and curated designer suites."
            isQuickAction={quickActionModule === 'items-kits'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'items-import-export':
        return (
          <ModuleComingSoon
            title="Catalog Import & Export"
            category="Items"
            description="Bulk Excel and CSV import/export for brand prices, coverage metrics, and sanitary master catalogs."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );

      // New Inventory Modules
      case 'inventory-manual-entry':
        return (
          <ModuleComingSoon
            title="Manual Stock Entry"
            category="Inventory"
            description="Godown physical count verification, quick item-level barcode entry, and batch logging."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'inventory-bulk-update':
        return (
          <ModuleComingSoon
            title="Bulk Stock Update"
            category="Inventory"
            description="Spreadsheet-style bulk adjustment of godown quantities, rack locations, and lot numbers."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'inventory-opening-stock':
        return (
          <ModuleComingSoon
            title="Opening Stock Register"
            category="Inventory"
            description="Financial year opening stock initialization, godown balance audit, and valuation logs."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'inventory-transfers':
        return (
          <ModuleComingSoon
            title="Stock Transfers"
            category="Inventory"
            description="Inter-warehouse and godown-to-showroom stock movement notes with transit tracking."
            isQuickAction={quickActionModule === 'inventory-transfers'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'inventory-adjustments':
        return (
          <ModuleComingSoon
            title="Stock Adjustments"
            category="Inventory"
            description="Stock write-offs, variance reconciliations, breakage adjustments, and auditor approvals."
            isQuickAction={quickActionModule === 'inventory-adjustments'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'inventory-assemble-kits':
        return (
          <ModuleComingSoon
            title="Assemble Kits"
            category="Inventory"
            description="Bundle components into packaged kits, deduct raw item inventory, and increment finished kits."
            isQuickAction={quickActionModule === 'inventory-assemble-kits'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'inventory-reserved':
        return (
          <ModuleComingSoon
            title="Reserved Stock"
            category="Inventory"
            description="Stock allocated to confirmed client quotations awaiting dispatch clearance or client site readiness."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'inventory-loading-alerts':
        return (
          <ModuleComingSoon
            title="Loading Alerts & Logistics"
            category="Inventory"
            description="Real-time alerts for overdue dispatches, vehicle bay occupancy, and gate-pass clearance."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );

      // New Sales Modules
      case 'sales-cart':
        return (
          <ModuleComingSoon
            title="Showroom Sales Cart"
            category="Sales"
            description="Fast retail point-of-sale cart for instant walk-in billing and cash counter slips."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'sales-orders':
        return (
          <ModuleComingSoon
            title="Sales Orders"
            category="Sales"
            description="Confirmed sales order booking from accepted quotations with advance payment hold."
            isQuickAction={quickActionModule === 'sales-orders'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'sales-proforma':
        return (
          <ModuleComingSoon
            title="Proforma Invoices"
            category="Sales"
            description="Formal proforma invoices for bank loans, LC verification, and advance payment requests."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'sales-delivery-orders':
        return (
          <ModuleComingSoon
            title="Delivery Orders"
            category="Sales"
            description="Formal godown delivery orders specifying loading sequence, transporter, and receiver sign-off."
            isQuickAction={quickActionModule === 'sales-delivery-orders'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'sales-invoices':
        return (
          <ModuleComingSoon
            title="Tax Invoices"
            category="Sales"
            description="GST-compliant final commercial tax invoices with QR code and automated tally sync."
            isQuickAction={quickActionModule === 'sales-invoices'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'sales-eway-bills':
        return (
          <ModuleComingSoon
            title="e-Way Bills"
            category="Sales"
            description="Automated GST portal e-Way Bill generation, Part-B transporter vehicle update, and validity tracking."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );

      // New Purchases Modules
      case 'purchases-landed-cost':
        return (
          <ModuleComingSoon
            title="Landed Cost Calculator"
            category="Purchases"
            description="Compute exact unit cost after adding factory freight, insurance, unloader labor, and GST input credit."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );

      // New Dealer Network Modules
      case 'dealers-list':
        return (
          <ModuleComingSoon
            title="Dealer Network"
            category="Dealer Network"
            description="Authorized dealer registry, credit limit monitoring, overdue aging, and sub-dealer mapping."
            isQuickAction={quickActionModule === 'dealers-list'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'dealers-find':
        return (
          <ModuleComingSoon
            title="Find New Dealers"
            category="Dealer Network"
            description="District and taluka territory mapping to identify prospective tile and sanitary retail partners."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'dealers-panel':
        return (
          <ModuleComingSoon
            title="Display Panel Management"
            category="Dealer Network"
            description="Showroom display stands, sliding tile panels, and sanitary display boards installed at dealer locations."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'dealers-expenses':
        return (
          <ModuleComingSoon
            title="Sample & Promo Expenses"
            category="Dealer Network"
            description="Free tile sample distribution, architect folders, and dealer promotional expense claims."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'dealers-whatsapp':
        return (
          <ModuleComingSoon
            title="WhatsApp Chatbot"
            category="Dealer Network"
            description="Automated WhatsApp messaging for price lists, dispatch dispatch status, and PDF payment receipts."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );

      // New Marketing & Documents Modules
      case 'marketing-documents':
        return (
          <ModuleComingSoon
            title="Documents & Media"
            category="Marketing & Documents"
            description="Brand brochures, high-resolution tile lookbooks, test certificates, and warranty cards."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'marketing-mail':
        return (
          <ModuleComingSoon
            title="Direct Mail & Dispatch"
            category="Marketing & Documents"
            description="Automated email statements, quotation follow-up sequences, and new arrival newsletters."
            isQuickAction={quickActionModule === 'marketing-mail'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );

      // New Accounting Modules
      case 'accounting-bank-cash':
        return (
          <ModuleComingSoon
            title="Bank & Cash Accounts"
            category="Accounting"
            description="Current account reconciliations, cash drawer deposits, and POS card terminal settlement records."
            isQuickAction={quickActionModule === 'accounting-bank-cash'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'accounting-tds':
        return (
          <ModuleComingSoon
            title="TDS Compliance & Ledger"
            category="Accounting"
            description="Section 194Q contractor and buyer TDS calculations, monthly summaries, and certificate tracking."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'accounting-cheques':
        return (
          <ModuleComingSoon
            title="Cheque Clearance Register"
            category="Accounting"
            description="Post-dated cheques (PDC) vault, bank deposit slips, bounce tracking, and clearance status."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );
      case 'accounting-recurring':
        return (
          <ModuleComingSoon
            title="Recurring Transactions"
            category="Accounting"
            description="Showroom rent, electricity, recurring maintenance, and automated expense schedules."
            isQuickAction={quickActionModule === 'accounting-recurring'}
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );

      // Help
      case 'help':
        return (
          <ModuleComingSoon
            title="Help & Documentation"
            category="Support & Training"
            description="Staff user guides, video walkthroughs, system shortcuts, and technical support desk."
            onBackToDashboard={() => setActiveTab('dashboard')}
            onNavigateToModule={handleNavTabChange}
          />
        );

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
          onQuickAction={handleQuickAction}
        />
        <main className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-transparent">
          <div
            key={activeTab + (selectedQuotationId ? `-${selectedQuotationId}` : '') + (isEditingQuotation ? '-edit' : '')}
            className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-transparent animate-page-enter"
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
