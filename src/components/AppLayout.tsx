import React, { useState } from 'react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
import AddEntry from './AddEntry';
import Reports from './Reports';
import UserManagement from './UserManagement';
import LoginModal from './LoginModal';
import ImportData from './ImportData';

import CommissionManagement from './CommissionManagement';
import ActivityLogs from './ActivityLogs';
import AccountVerification from './AccountVerification';
import EscalationModule from './EscalationModule';
import AnalyticsDashboard from './AnalyticsDashboard';
import RecruiterPortal from './RecruiterPortal';
import AuditTrail from './AuditTrail';
import DeactivationRequests from './DeactivationRequests';

function AppContent() {
  const { user, loading } = useAuth();
  const [activeView, setActiveView] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginModal />;
  }

  const handleAddNew = () => {
    setActiveView('add');
  };

  const handleSave = () => {
    setActiveView('dashboard');
  };

  const renderContent = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard onAddNew={handleAddNew} />;
      case 'add':
        return <AddEntry onBack={() => setActiveView('dashboard')} onSave={handleSave} />;
      case 'reports':
        return <Reports />;
      case 'users':
        return <UserManagement />;
      case 'import':
        return <ImportData onBack={() => setActiveView('dashboard')} onComplete={() => setActiveView('dashboard')} />;

      case 'commissions':
        return <CommissionManagement onBack={() => setActiveView('dashboard')} />;
      case 'activity':
        return <ActivityLogs />;
      case 'verification':
        return <AccountVerification />;
      case 'escalation':
        return <EscalationModule />;
      case 'analytics':
        return <AnalyticsDashboard onBack={() => setActiveView('dashboard')} />;
      case 'recruiter-portal':
        return <RecruiterPortal onBack={() => setActiveView('dashboard')} />;
      case 'audit-trail':
        return <AuditTrail />;
      case 'deactivation-requests':
        return <DeactivationRequests />;
      default:
        return <Dashboard onAddNew={handleAddNew} />;
    }
  };


  return (
    <div className="min-h-screen bg-gray-100 flex">
      <Sidebar
        activeView={activeView}
        onViewChange={setActiveView}
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
      />
      
      <main className="flex-1 lg:ml-0 p-4 lg:p-8 overflow-auto">
        <div className="max-w-7xl mx-auto">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}

export default function AppLayout() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
