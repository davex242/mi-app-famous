import React, { useState } from 'react';
import { 
  LayoutDashboard, 
  PlusCircle, 
  FileText, 
  Users, 
  LogOut,
  Database,
  Menu,
  X,
  Upload,
  DollarSign,
  History,
  ShieldCheck,
  AlertTriangle,

  BarChart3,
  UserCircle,
  Lock,
  UserX
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface SidebarProps {
  activeView: string;
  onViewChange: (view: string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export default function Sidebar({ activeView, onViewChange, isOpen, onToggle }: SidebarProps) {
  const { user, logout, canManageUsers, canEdit, isSuperAdmin, isSubAdmin } = useAuth();
  const [showBlockedMessage, setShowBlockedMessage] = useState<string | null>(null);

  // Define which menu items are available to non-admin users (edit and readonly)
  const limitedUserMenuIds = ['dashboard', 'recruiter-portal', 'add', 'reports'];
  
  // Define which menu items are blocked for readonly users (they can see but not access)
  const readonlyBlockedIds = ['add'];

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'analytics', label: 'Analytics', icon: BarChart3 },
    { id: 'recruiter-portal', label: isSuperAdmin ? 'Portal Reclutadores' : 'My Portal', icon: UserCircle },

    { id: 'add', label: 'Agregar Registro', icon: PlusCircle },

    { id: 'import', label: 'Import Data', icon: Upload },
    { id: 'commissions', label: 'Commissions', icon: DollarSign },
    { id: 'verification', label: 'Account Verification', icon: ShieldCheck },
    { id: 'escalation', label: 'Escalation', icon: AlertTriangle },
    { id: 'activity', label: 'Activity Logs', icon: History },
    { id: 'audit-trail', label: 'Audit Trail', icon: FileText },
    { id: 'reports', label: 'Reports', icon: FileText },

    { id: 'users', label: 'User Management', icon: Users },
    { id: 'deactivation-requests', label: 'Deactivation Requests', icon: UserX, superAdminOnly: true },
  ];




  // Filter menu items based on user role
  const filteredItems = menuItems.filter(item => {
    // Check for superAdminOnly items
    if ((item as any).superAdminOnly && user?.role !== 'superadmin') return false;
    
    // SuperAdmin and SubAdmin users can see all menu items
    if (user?.role === 'superadmin' || user?.role === 'subadmin') return true;
    
    // Edit and readonly users can only see limited menu items
    return limitedUserMenuIds.includes(item.id);
  });


  const isBlockedForReadonly = (itemId: string) => {
    return user?.role === 'readonly' && readonlyBlockedIds.includes(itemId);
  };

  const handleMenuClick = (itemId: string) => {
    if (isBlockedForReadonly(itemId)) {
      setShowBlockedMessage(itemId);
      setTimeout(() => setShowBlockedMessage(null), 2000);
      return;
    }
    onViewChange(itemId);
    if (window.innerWidth < 1024) onToggle();
  };

  const getRoleBadgeStyle = () => {
    switch (user?.role) {
      case 'superadmin':
        return 'bg-amber-500/20 text-amber-300';
      case 'subadmin':
        return 'bg-purple-500/20 text-purple-300';
      case 'edit':
        return 'bg-blue-500/20 text-blue-300';
      default:
        return 'bg-gray-500/20 text-gray-300';
    }
  };

  const getRoleLabel = () => {
    switch (user?.role) {
      case 'superadmin':
        return 'Super Admin';
      case 'subadmin':
        return 'Sub Admin';
      case 'edit':
        return 'Edit';
      case 'readonly':
        return 'Readonly';
      default:
        return user?.role || '';
    }
  };

  return (
    <>
      {/* Mobile menu button */}
      <button
        onClick={onToggle}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white rounded-lg shadow-md"
      >
        {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
      </button>

      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-40
        w-64 bg-slate-900 text-white
        transform transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        flex flex-col
      `}>
        {/* Logo */}
        <div className="p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-lg">Host Manager</h1>
              <p className="text-xs text-slate-400">Database System</p>
            </div>
          </div>
        </div>

        {/* User info */}
        {user && (
          <div className="px-6 py-4 border-b border-slate-700">
            <p className="text-sm font-medium">{user.name}</p>
            <p className="text-xs text-slate-400">{user.email}</p>
            <span className={`inline-block mt-2 px-2 py-0.5 text-xs rounded-full ${getRoleBadgeStyle()}`}>
              {getRoleLabel()}
            </span>
          </div>
        )}

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          {filteredItems.map(item => {
            const Icon = item.icon;
            const isActive = activeView === item.id;
            const isBlocked = isBlockedForReadonly(item.id);
            const showingBlockedMsg = showBlockedMessage === item.id;
            
            return (
              <div key={item.id} className="relative">
                <button
                  onClick={() => handleMenuClick(item.id)}
                  className={`
                    w-full flex items-center gap-3 px-4 py-3 rounded-lg
                    transition-all duration-200
                    ${isBlocked 
                      ? 'text-slate-500 cursor-not-allowed hover:bg-slate-800/50' 
                      : isActive 
                        ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }
                  `}
                >
                  <Icon className="w-5 h-5" />
                  <span className="font-medium flex-1 text-left">{item.label}</span>
                  {isBlocked && <Lock className="w-4 h-4 text-slate-500" />}
                </button>
                {showingBlockedMsg && (
                  <div className="absolute left-full ml-2 top-1/2 -translate-y-1/2 z-50 px-3 py-2 bg-red-500 text-white text-xs rounded-lg whitespace-nowrap shadow-lg">
                    Access restricted for readonly users
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-slate-700">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-lg text-slate-300 hover:bg-red-500/10 hover:text-red-400 transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="font-medium">Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
