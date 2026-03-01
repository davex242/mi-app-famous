import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, 
  CheckCircle, 
  Clock, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Plus,
  AlertCircle,
  DollarSign,
  TrendingUp,
  Award,
  Target,
  Activity,
  BarChart3,
  Eye
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Host, ActivityLog } from '@/types';
import { useAuth } from '@/context/AuthContext';
import DataTable from './DataTable';
import Modal from './ui/Modal';
import EntryForm from './EntryForm';
import ActivityLogger from '@/lib/activityLogger';

interface DashboardProps {
  onAddNew: () => void;
}

interface RecruiterPendingCommission {
  reclutador: string;
  count: number;
  amount: number;
}

interface RecruiterCommissionSettings {
  recruiter_name: string;
  base_commission: number;
  additional_percentage: number;
  max_commission: number;
}

// Commission configuration constants (matching CommissionManagement.tsx)
const DEFAULT_BASE_COMMISSION = 25.00;
const MAX_COMMISSION_LIMIT = 42.00;

// Calculate total commission per host based on settings
const calculateTotalCommission = (baseCommission: number, additionalPercentage: number): number => {
  const additional = baseCommission * (additionalPercentage / 100);
  return Math.min(baseCommission + additional, MAX_COMMISSION_LIMIT);
};

export default function Dashboard({ onAddNew }: DashboardProps) {
  const { user, canEdit, canManageUsers } = useAuth();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [viewMode, setViewMode] = useState<'view' | 'edit' | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Host | null>(null);
  const [recentActivity, setRecentActivity] = useState<ActivityLog[]>([]);
  const [recruiterSettings, setRecruiterSettings] = useState<Record<string, RecruiterCommissionSettings>>({});
  const [stats, setStats] = useState({
    total: 0,
    verified: 0,
    pending: 0,
    rejected: 0,
    escalated: 0,
    pendingOverdue: 0,
    verifiedPendingCommission: 0,
  });

  // Personal stats for non-admin users
  const [myStats, setMyStats] = useState({
    total: 0,
    verified: 0,
    pending: 0,
    rejected: 0,
    verificationRate: 0,
    pendingCommissions: 0,
    paidCommissions: 0,
    totalEarnings: 0,
    pendingEarnings: 0,
  });

  // Group pending commissions by recruiter
  const [recruiterPendingCommissions, setRecruiterPendingCommissions] = useState<RecruiterPendingCommission[]>([]);

  const isAdmin = canManageUsers;
  const recruiterName = user?.name || '';

  // Get commission amount for a specific recruiter
  const getRecruiterCommission = (recruiter: string): number => {
    const settings = recruiterSettings[recruiter];
    if (settings) {
      return calculateTotalCommission(settings.base_commission, settings.additional_percentage);
    }
    return DEFAULT_BASE_COMMISSION;
  };

  // Calculate days since registration
  const calculateDays = (regDate: string): number => {
    if (!regDate) return 0;
    const reg = new Date(regDate);
    const now = new Date();
    const diff = now.getTime() - reg.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const fetchRecruiterSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('recruiter_commission_settings')
        .select('*');
      if (error) throw error;
      
      const settingsMap: Record<string, RecruiterCommissionSettings> = {};
      (data || []).forEach((setting: any) => {
        settingsMap[setting.recruiter_name] = {
          recruiter_name: setting.recruiter_name,
          base_commission: parseFloat(setting.base_commission) || DEFAULT_BASE_COMMISSION,
          additional_percentage: parseFloat(setting.additional_percentage) || 0,
          max_commission: parseFloat(setting.max_commission) || MAX_COMMISSION_LIMIT
        };
      });
      setRecruiterSettings(settingsMap);
      return settingsMap;
    } catch (error) {
      console.error('Fetch recruiter settings error:', error);
      return {};
    }
  };

  const fetchHosts = async () => {
    setLoading(true);
    try {
      // Fetch recruiter settings first
      const settings = await fetchRecruiterSettings();

      const { data, error } = await supabase
        .from('hosts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHosts(data || []);

      // Calculate system-wide stats (for admin)
      const total = data?.length || 0;
      const verified = data?.filter(h => h.estado === 'Verified').length || 0;
      const pending = data?.filter(h => h.estado === 'Pending').length || 0;
      const rejected = data?.filter(h => h.estado === 'Rejected').length || 0;
      const escalated = data?.filter(h => h.escalado).length || 0;
      
      // Calculate pending accounts that are overdue (> 3 days)
      const pendingOverdue = data?.filter(h => {
        if (h.estado !== 'Pending') return false;
        const days = calculateDays(h.reg_date);
        return days > 3;
      }).length || 0;

      // Calculate verified accounts with pending commission (only those marked as real)
      const verifiedPendingCommissionHosts = data?.filter(h => 
        h.estado === 'Verified' && h.comision === 'Pending' && h.real === true
      ) || [];
      const verifiedPendingCommission = verifiedPendingCommissionHosts.length;

      // Group by recruiter (only real accounts) with proper commission amounts
      const recruiterMap = new Map<string, { count: number; amount: number }>();
      verifiedPendingCommissionHosts.forEach(h => {
        const recruiter = h.reclutador || 'Unknown';
        const commissionAmount = settings[recruiter] 
          ? calculateTotalCommission(settings[recruiter].base_commission, settings[recruiter].additional_percentage)
          : DEFAULT_BASE_COMMISSION;
        
        const current = recruiterMap.get(recruiter) || { count: 0, amount: 0 };
        recruiterMap.set(recruiter, { 
          count: current.count + 1, 
          amount: current.amount + commissionAmount 
        });
      });
      
      const recruiterList: RecruiterPendingCommission[] = Array.from(recruiterMap.entries())
        .map(([reclutador, data]) => ({ reclutador, count: data.count, amount: data.amount }))
        .sort((a, b) => b.count - a.count);
      
      setRecruiterPendingCommissions(recruiterList);
      setStats({ total, verified, pending, rejected, escalated, pendingOverdue, verifiedPendingCommission });


      // Calculate personal stats for non-admin users
      if (!isAdmin && recruiterName) {
        const myHosts = data?.filter(h => h.reclutador === recruiterName) || [];
        const myTotal = myHosts.length;
        const myVerified = myHosts.filter(h => h.estado === 'Verified').length;
        const myPending = myHosts.filter(h => h.estado === 'Pending').length;
        const myRejected = myHosts.filter(h => h.estado === 'Rejected').length;
        const myVerificationRate = myTotal > 0 ? Math.round((myVerified / myTotal) * 100) : 0;
        const myPendingCommissionsCount = myHosts.filter(h => h.estado === 'Verified' && h.comision === 'Pending' && h.real === true).length;
        const myPaidCommissionsCount = myHosts.filter(h => h.comision === 'Paid' && h.real === true).length;
        
        // Get commission rate for this recruiter
        const myCommissionRate = settings[recruiterName] 
          ? calculateTotalCommission(settings[recruiterName].base_commission, settings[recruiterName].additional_percentage)
          : DEFAULT_BASE_COMMISSION;
        
        const myTotalEarnings = myPaidCommissionsCount * myCommissionRate;
        const myPendingEarnings = myPendingCommissionsCount * myCommissionRate;

        setMyStats({
          total: myTotal,
          verified: myVerified,
          pending: myPending,
          rejected: myRejected,
          verificationRate: myVerificationRate,
          pendingCommissions: myPendingCommissionsCount,
          paidCommissions: myPaidCommissionsCount,
          totalEarnings: myTotalEarnings,
          pendingEarnings: myPendingEarnings,
        });
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };


  const fetchRecentActivity = async () => {
    if (!isAdmin) return;
    try {
      const { data, error } = await supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);

      if (error) throw error;
      setRecentActivity(data || []);
    } catch (error) {
      console.error('Activity fetch error:', error);
    }
  };

  useEffect(() => {
    fetchHosts();
    if (isAdmin) {
      fetchRecentActivity();
    }
  }, [isAdmin]);

  const handleView = (host: Host) => {
    setSelectedHost(host);
    setViewMode('view');
  };

  const handleEdit = (host: Host) => {
    setSelectedHost(host);
    setViewMode('edit');
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const { error } = await supabase
        .from('hosts')
        .delete()
        .eq('id', deleteConfirm.id);
      if (error) throw error;
      
      // Log the deletion to audit trail
      await ActivityLogger.deleteHost(user, deleteConfirm.host_name, deleteConfirm.id, deleteConfirm as Record<string, any>);
      
      setDeleteConfirm(null);
      fetchHosts();
      if (isAdmin) fetchRecentActivity();
    } catch (error) {
      console.error('Delete error:', error);
      alert('Failed to delete entry');
    }
  };


  const handleSave = () => {
    setSelectedHost(null);
    setViewMode(null);
    fetchHosts();
  };

  // Get list of overdue pending hosts for the alert
  const overdueHosts = hosts.filter(h => {
    if (h.estado !== 'Pending') return false;
    const days = calculateDays(h.reg_date);
    return days > 3;
  });

  // Filter hosts for non-admin users to show only their entries
  const displayedHosts = useMemo(() => {
    if (isAdmin) return hosts;
    return hosts.filter(h => h.reclutador === recruiterName);
  }, [hosts, isAdmin, recruiterName]);

  // My recent entries for non-admin users
  const myRecentEntries = useMemo(() => {
    return displayedHosts.slice(0, 5);
  }, [displayedHosts]);

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'login': return <Activity className="w-4 h-4 text-green-500" />;
      case 'logout': return <Activity className="w-4 h-4 text-gray-500" />;
      case 'create': return <Plus className="w-4 h-4 text-blue-500" />;
      case 'update': return <RefreshCw className="w-4 h-4 text-amber-500" />;
      case 'delete': return <XCircle className="w-4 h-4 text-red-500" />;
      default: return <Activity className="w-4 h-4 text-gray-500" />;
    }
  };

  // Admin Dashboard View
  if (isAdmin) {
    const statCards = [
      { label: 'Total Hosts', value: stats.total, icon: Users, color: 'bg-blue-500', lightColor: 'bg-blue-50', textColor: 'text-blue-500' },
      { label: 'Verified', value: stats.verified, icon: CheckCircle, color: 'bg-green-500', lightColor: 'bg-green-50', textColor: 'text-green-500' },
      { label: 'Pending', value: stats.pending, icon: Clock, color: 'bg-yellow-500', lightColor: 'bg-yellow-50', textColor: 'text-yellow-500' },
      { label: 'Rejected', value: stats.rejected, icon: XCircle, color: 'bg-red-500', lightColor: 'bg-red-50', textColor: 'text-red-500' },
      { label: 'Escalated', value: stats.escalated, icon: AlertTriangle, color: 'bg-amber-500', lightColor: 'bg-amber-50', textColor: 'text-amber-500' },
      { label: 'Pending > 3 Days', value: stats.pendingOverdue, icon: AlertCircle, color: 'bg-red-600', lightColor: 'bg-red-100', textColor: 'text-red-600', isAlert: true },
      { label: 'Verified + Pending Commission', value: stats.verifiedPendingCommission, icon: DollarSign, color: 'bg-emerald-500', lightColor: 'bg-emerald-50', textColor: 'text-emerald-500', isCommission: true },
    ];

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Admin Dashboard</h1>
            <p className="text-gray-500 mt-1">System-wide statistics and management</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => { fetchHosts(); fetchRecentActivity(); }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {canEdit && (
              <button
                onClick={onAddNew}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Agregar Registro

              </button>
            )}
          </div>
        </div>

        {/* Alert Banner for Overdue Pending Accounts */}
        {stats.pendingOverdue > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <AlertCircle className="w-5 h-5 text-red-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-red-800">Attention Required: Overdue Pending Accounts</h3>
                <p className="text-red-700 text-sm mt-1">
                  There are <strong>{stats.pendingOverdue}</strong> account(s) that have been pending for more than 3 days and require immediate attention.
                </p>
                {overdueHosts.length > 0 && overdueHosts.length <= 5 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {overdueHosts.map(host => (
                      <button
                        key={host.id}
                        onClick={() => handleEdit(host)}
                        className="px-3 py-1.5 bg-red-100 hover:bg-red-200 text-red-800 text-sm rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <span className="font-medium">{host.host_name}</span>
                        <span className="text-red-600">({calculateDays(host.reg_date)} days)</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Alert Banner for Verified Accounts with Pending Commission */}
        {stats.verifiedPendingCommission > 0 && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg">
                <DollarSign className="w-5 h-5 text-emerald-600" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-emerald-800">Pending Commissions: Verified Accounts</h3>
                <p className="text-emerald-700 text-sm mt-1">
                  There are <strong>{stats.verifiedPendingCommission}</strong> verified account(s) with pending commission payments.
                </p>
                {recruiterPendingCommissions.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-medium text-emerald-600 mb-2">By Recruiter:</p>
                    <div className="flex flex-wrap gap-2">
                      {recruiterPendingCommissions.slice(0, 8).map(({ reclutador, count }) => (
                        <div
                          key={reclutador}
                          className="px-3 py-1.5 bg-emerald-100 text-emerald-800 text-sm rounded-lg flex items-center gap-1.5"
                        >
                          <span className="font-medium">{reclutador}</span>
                          <span className="bg-emerald-200 px-1.5 py-0.5 rounded text-xs font-bold">{count}</span>
                        </div>
                      ))}
                      {recruiterPendingCommissions.length > 8 && (
                        <span className="px-3 py-1.5 text-emerald-600 text-sm">
                          +{recruiterPendingCommissions.length - 8} more
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <div 
                key={stat.label} 
                className={`bg-white rounded-xl p-4 shadow-sm border ${
                  stat.isAlert && stat.value > 0 
                    ? 'border-red-300 ring-2 ring-red-100' 
                    : stat.isCommission && stat.value > 0
                    ? 'border-emerald-300 ring-2 ring-emerald-100'
                    : 'border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${stat.lightColor}`}>
                    <Icon className={`w-5 h-5 ${stat.textColor}`} />
                  </div>
                  <div>
                    <p className={`text-2xl font-bold ${
                      stat.isAlert && stat.value > 0 
                        ? 'text-red-600' 
                        : stat.isCommission && stat.value > 0
                        ? 'text-emerald-600'
                        : 'text-gray-900'
                    }`}>
                      {stat.value}
                    </p>
                    <p className={`text-xs ${
                      stat.isAlert && stat.value > 0 
                        ? 'text-red-600 font-medium' 
                        : stat.isCommission && stat.value > 0
                        ? 'text-emerald-600 font-medium'
                        : 'text-gray-500'
                    }`}>
                      {stat.label}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent Activity Panel (Admin Only) */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <DataTable
              data={hosts}
              onView={handleView}
              onEdit={handleEdit}
              onDelete={(host) => setDeleteConfirm(host)}
              loading={loading}
              onRefresh={fetchHosts}
            />
          </div>
          
          <div className="bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-blue-500" />
                <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
              </div>
            </div>
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {recentActivity.length === 0 ? (
                <div className="p-4 text-center text-gray-500">No recent activity</div>
              ) : (
                recentActivity.map((activity) => (
                  <div key={activity.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">{getActionIcon(activity.action_type)}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">
                          {activity.action_description}
                        </p>
                        <p className="text-xs text-gray-500">
                          {activity.user_name} • {new Date(activity.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* View/Edit Modal */}
        <Modal
          isOpen={viewMode !== null}
          onClose={() => { setSelectedHost(null); setViewMode(null); }}
          title={viewMode === 'view' ? 'View Host Details' : 'Edit Host'}
          size="full"
        >
          <EntryForm
            entry={selectedHost}
            onSave={handleSave}
            onCancel={() => { setSelectedHost(null); setViewMode(null); }}
            disabled={viewMode === 'view'}
            isNewEntry={false}
          />
        </Modal>

        {/* Delete Confirmation Modal */}
        <Modal
          isOpen={deleteConfirm !== null}
          onClose={() => setDeleteConfirm(null)}
          title="Confirm Delete"
          size="sm"
        >
          <div className="text-center">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <strong>{deleteConfirm?.host_name}</strong>? This action cannot be undone.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
              >
                Delete
              </button>
            </div>
          </div>
        </Modal>
      </div>
    );
  }

  // Non-Admin (Edit/Readonly) Dashboard View
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Dashboard</h1>
          <p className="text-gray-500 mt-1">Welcome back, {recruiterName}</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchHosts}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
          {canEdit && (
            <button
              onClick={onAddNew}
              className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Agregar Registro

            </button>
          )}
        </div>
      </div>

      {/* Personal Performance Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-lg">
              <Users className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">My Hosts</p>
              <p className="text-2xl font-bold text-gray-900">{myStats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Verified</p>
              <p className="text-2xl font-bold text-green-600">{myStats.verified}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-50 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold text-yellow-600">{myStats.pending}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 rounded-lg">
              <TrendingUp className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Success Rate</p>
              <p className="text-2xl font-bold text-purple-600">{myStats.verificationRate}%</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 rounded-lg">
              <DollarSign className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Earnings</p>
              <p className="text-2xl font-bold text-emerald-600">${myStats.totalEarnings.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Earnings Summary Card */}
      <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-xl font-bold">Performance Summary</h3>
            <p className="text-blue-100 mt-1">Keep up the great work!</p>
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold">{myStats.total}</p>
              <p className="text-blue-100 text-sm">Total Hosts</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">{myStats.verificationRate}%</p>
              <p className="text-blue-100 text-sm">Success Rate</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">${myStats.totalEarnings.toFixed(0)}</p>
              <p className="text-blue-100 text-sm">Total Earned</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">${myStats.pendingEarnings.toFixed(0)}</p>
              <p className="text-blue-100 text-sm">Pending Pay</p>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Entries */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900">My Recent Entries</h3>
          </div>
          <span className="text-sm text-gray-500">{displayedHosts.length} total entries</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Host Name</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Host ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Reg Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Commission</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center">
                    <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : myRecentEntries.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                    No entries found. Start by adding a new host!
                  </td>
                </tr>
              ) : (
                myRecentEntries.map((host) => (
                  <tr key={host.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">{host.host_name}</span>
                        {host.real && (
                          <CheckCircle className="w-4 h-4 text-green-500" title="Verified Real" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600 font-mono text-sm">{host.host_id}</td>
                    <td className="px-4 py-3 text-gray-600">{host.reg_date || '-'}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                        host.estado === 'Verified' ? 'bg-green-100 text-green-700' :
                        host.estado === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {host.estado}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {host.estado === 'Verified' && host.real && (
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                          host.comision === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {host.comision === 'Paid' ? `Paid ($${getRecruiterCommission(recruiterName).toFixed(2)})` : 'Pending'}
                        </span>
                      )}
                    </td>

                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleView(host)}
                        className="p-2 hover:bg-gray-100 rounded-lg"
                        title="View Details"
                      >
                        <Eye className="w-4 h-4 text-gray-600" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Modal */}
      <Modal
        isOpen={viewMode !== null}
        onClose={() => { setSelectedHost(null); setViewMode(null); }}
        title="Host Details"
        size="full"
      >
        <EntryForm
          entry={selectedHost}
          onSave={handleSave}
          onCancel={() => { setSelectedHost(null); setViewMode(null); }}
          disabled={true}
          isNewEntry={false}
        />
      </Modal>
    </div>
  );
}
