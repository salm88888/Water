/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * Miyahna - Smart Water Delivery Management System (Marib, Yemen)
 * Root Application Component with Startup Dual-Role Portal & Passcode Security
 */

import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { RoleSelectionPortal } from './components/auth/RoleSelectionPortal';
import { ManagerPinModal } from './components/auth/ManagerPinModal';
import { ChangePinModal } from './components/auth/ChangePinModal';
import { ManagerHeader } from './components/manager/ManagerHeader';
import { ManagerSidebar } from './components/manager/ManagerSidebar';
import { DashboardOverview } from './components/manager/DashboardOverview';
import { CustomerManagement } from './components/manager/CustomerManagement';
import { OrderManagement } from './components/manager/OrderManagement';
import { ClusteringEngineView } from './components/manager/ClusteringEngineView';
import { TripsManagement } from './components/manager/TripsManagement';
import { SmsGatewayMonitor } from './components/manager/SmsGatewayMonitor';
import { InvoicingAndCash } from './components/manager/InvoicingAndCash';
import { DriverReconciliationView } from './components/manager/DriverReconciliationView';
import { ExpensesAndFuel } from './components/manager/ExpensesAndFuel';
import { ProfitabilityAnalytics } from './components/manager/ProfitabilityAnalytics';
import { ReportsCenter } from './components/manager/ReportsCenter';
import { DriverAndTruckView } from './components/manager/DriverAndTruckView';
import { SystemSettingsView } from './components/manager/SystemSettingsView';
import { DocumentationGuides } from './components/manager/DocumentationGuides';
import { DriverApp } from './components/driver/DriverApp';
import { DeviceSimulator } from './components/simulator/DeviceSimulator';
import { NewOrderModal } from './components/modals/NewOrderModal';
import { MaribMap } from './components/common/MaribMap';

function MainAppContent() {
  const {
    savedRole,
    selectRole,
    viewMode,
    managerTab,
    settings,
    truck,
    trips,
    gpsEvents,
    customers,
  } = useApp();

  const [isManagerPinModalOpen, setIsManagerPinModalOpen] = useState(false);
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);

  // 1. Initial Screen: Show the Two Big Buttons (Manager & Driver) if no role is selected
  if (!savedRole) {
    return (
      <>
        <RoleSelectionPortal
          onSelectManager={() => setIsManagerPinModalOpen(true)}
          onSelectDriver={() => selectRole('driver')}
        />
        <ManagerPinModal
          isOpen={isManagerPinModalOpen}
          onClose={() => setIsManagerPinModalOpen(false)}
          onSuccess={() => {
            selectRole('manager');
            setIsManagerPinModalOpen(false);
          }}
        />
      </>
    );
  }

  // 2. Driver Mode (Tactile Android Mobile App)
  if (savedRole === 'driver' || viewMode === 'driver') {
    return <DriverApp />;
  }

  // 3. Hardware Simulator Mode (when manager toggles simulator tab)
  if (viewMode === 'simulator') {
    return (
      <div className="min-h-screen bg-slate-100 p-3 sm:p-6">
        <DeviceSimulator />
      </div>
    );
  }

  // 4. Manager Mode (Responsive for Phone, Tablet & Laptop)
  const activeTrip = trips.find((t) => t.status === 'in_progress');

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <ManagerHeader onOpenNewOrderModal={() => setIsNewOrderModalOpen(true)} />

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
        <ManagerSidebar />

        <main className="flex-1 p-3 sm:p-5 md:p-6 overflow-y-auto max-w-7xl mx-auto w-full">
          {managerTab === 'overview' && <DashboardOverview />}
          {managerTab === 'customers' && <CustomerManagement />}
          {managerTab === 'orders' && (
            <OrderManagement onOpenNewOrderModal={() => setIsNewOrderModalOpen(true)} />
          )}
          {managerTab === 'clustering' && <ClusteringEngineView />}
          {managerTab === 'trips' && <TripsManagement />}
          {managerTab === 'map' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-slate-900">
                    خريطة التوزيع المباشر والتتبع في مأرب
                  </h2>
                  <p className="text-xs text-slate-500">
                    مواقع العملاء، مصنع المياه المركزي، مسار الوايت الحالي وأثر نقاط GPS المرسلة عبر SMS
                  </p>
                </div>
              </div>
              <div className="h-[400px] sm:h-[520px] md:h-[620px]">
                <MaribMap
                  settings={settings}
                  truck={truck}
                  customerStops={activeTrip ? activeTrip.customerStops : []}
                  allCustomers={customers}
                  gpsEvents={gpsEvents}
                  height="100%"
                />
              </div>
            </div>
          )}
          {managerTab === 'sms_gateway' && <SmsGatewayMonitor />}
          {managerTab === 'invoices' && <InvoicingAndCash />}
          {managerTab === 'reconciliation' && <DriverReconciliationView />}
          {managerTab === 'expenses' && <ExpensesAndFuel />}
          {managerTab === 'profitability' && <ProfitabilityAnalytics />}
          {managerTab === 'reports' && <ReportsCenter />}
          {managerTab === 'driver_mgmt' && <DriverAndTruckView />}
          {managerTab === 'settings' && <SystemSettingsView />}
          {managerTab === 'manual' && <DocumentationGuides />}
        </main>
      </div>

      {/* Global Modals */}
      <NewOrderModal
        isOpen={isNewOrderModalOpen}
        onClose={() => setIsNewOrderModalOpen(false)}
      />

      <ChangePinModal />
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <MainAppContent />
    </AppProvider>
  );
}
