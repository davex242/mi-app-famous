import React, { useState, useEffect, useMemo } from 'react';
import {
  Users,
  DollarSign,
  TrendingUp,
  CheckCircle,
  Clock,
  XCircle,
  RefreshCw,
  Plus,
  Trophy,
  Medal,
  Award,
  Star,
  Eye,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  ArrowLeft,
  Lock,
  UserCircle,
  ChevronRight
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Host } from '@/types';
import { useAuth } from '@/context/AuthContext';
import Modal from './ui/Modal';
import EntryForm from './EntryForm';

interface RecruiterPortalProps {
  onBack: () => void;
}

interface LeaderboardEntry {
  name: string;
  verified: number;
  total: number;
  rate: number;
  earnings: number;
}

interface RecruiterCommissionSettings {
  recruiter_name: string;
  base_commission: number;
  additional_percentage: number;
  max_commission: number;
}

interface RecruiterSummary {
  name: string;
  total: number;
  verified: number;
  pending: number;
  rejected: number;
  rate: number;
  earnings: number;
  pendingPay: number;
}

// Commission configuration constants (matching CommissionManagement.tsx)
const DEFAULT_BASE_COMMISSION = 25.00;
const MAX_COMMISSION_LIMIT = 42.00;

// Calculate total commission per host based on settings
const calculateTotalCommission = (baseCommission: number, additionalPercentage: number): number => {
  const additional = baseCommission * (additionalPercentage / 100);
  return Math.min(baseCommission + additional, MAX_COMMISSION_LIMIT);
};

export default function RecruiterPortal({ onBack }: RecruiterPortalProps) {
  const { user, isSuperAdmin } = useAuth();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [allHosts, setAllHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);
  const [viewMode, setViewMode] = useState<'view' | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortField, setSortField] = useState<'host_name' | 'reg_date' | 'estado'>('reg_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showBlockedMessage, setShowBlockedMessage] = useState(false);
  const [recruiterSettings, setRecruiterSettings] = useState<Record<string, RecruiterCommissionSettings>>({});

  // SuperAdmin recruiter selection
  const [selectedRecruiterForView, setSelectedRecruiterForView] = useState<string | null>(null);
  const [recruiterSearchQuery, setRecruiterSearchQuery] = useState('');
  const [recruiterSortField, setRecruiterSortField] = useState<'name' | 'total' | 'verified' | 'rate' | 'earnings'>('total');
  const [recruiterSortDir, setRecruiterSortDir] = useState<'asc' | 'desc'>('desc');

  // The active recruiter name: for superadmin it's the selected one, for others it's their own name
  const activeRecruiterName = isSuperAdmin ? (selectedRecruiterForView || '') : (user?.name || '');
  const isReadonly = user?.role === 'readonly';

  // Get commission amount for a specific recruiter
  const getRecruiterCommission = (recruiter: string): number => {
    const settings = recruiterSettings[recruiter];
    if (settings) {
      return calculateTotalCommission(settings.base_commission, settings.additional_percentage);
    }
    return DEFAULT_BASE_COMMISSION;
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

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch recruiter settings first
      await fetchRecruiterSettings();

      if (isSuperAdmin) {
        // SuperAdmin: always fetch all hosts (for recruiter list and for viewing selected recruiter)
        const { data: all, error: allError } = await supabase
          .from('hosts')
          .select('*');

        if (allError) throw allError;
        setAllHosts(all || []);

        // If a recruiter is selected, filter their hosts
        if (selectedRecruiterForView) {
          const recruiterHosts = (all || []).filter(h => h.reclutador === selectedRecruiterForView);
          setHosts(recruiterHosts);
        } else {
          setHosts([]);
        }
      } else {
        // Non-superadmin: fetch own hosts
        const recruiterName = user?.name || '';
        const { data: myHosts, error: myError } = await supabase
          .from('hosts')
          .select('*')
          .eq('reclutador', recruiterName)
          .order('created_at', { ascending: false });

        if (myError) throw myError;
        setHosts(myHosts || []);

        // Fetch all hosts for leaderboard
        const { data: all, error: allError } = await supabase
          .from('hosts')
          .select('*');

        if (allError) throw allError;
        setAllHosts(all || []);
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedRecruiterForView]);

  // Build recruiter summaries for the superadmin selector
  const recruiterSummaries = useMemo((): RecruiterSummary[] => {
    const statsMap: Record<string, { total: number; verified: number; pending: number; rejected: number; paidCount: number; pendingPayCount: number }> = {};

    allHosts.forEach(host => {
      const recruiter = host.reclutador || 'Unknown';
      if (!statsMap[recruiter]) {
        statsMap[recruiter] = { total: 0, verified: 0, pending: 0, rejected: 0, paidCount: 0, pendingPayCount: 0 };
      }
      statsMap[recruiter].total++;
      if (host.estado === 'Verified') {
        statsMap[recruiter].verified++;
        if (host.real === true) {
          if (host.comision === 'Paid') {
            statsMap[recruiter].paidCount++;
          } else if (host.comision === 'Pending') {
            statsMap[recruiter].pendingPayCount++;
          }
        }
      }
      if (host.estado === 'Pending') statsMap[recruiter].pending++;
      if (host.estado === 'Rejected') statsMap[recruiter].rejected++;
    });

    return Object.entries(statsMap).map(([name, stats]) => {
      const commissionRate = getRecruiterCommission(name);
      return {
        name,
        total: stats.total,
        verified: stats.verified,
        pending: stats.pending,
        rejected: stats.rejected,
        rate: stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0,
        earnings: stats.paidCount * commissionRate,
        pendingPay: stats.pendingPayCount * commissionRate
      };
    });
  }, [allHosts, recruiterSettings]);

  // Filtered and sorted recruiter list for superadmin
  const filteredRecruiters = useMemo(() => {
    let list = [...recruiterSummaries];

    if (recruiterSearchQuery) {
      const q = recruiterSearchQuery.toLowerCase();
      list = list.filter(r => r.name.toLowerCase().includes(q));
    }

    list.sort((a, b) => {
      const aVal = a[recruiterSortField];
      const bVal = b[recruiterSortField];
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return recruiterSortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return recruiterSortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });

    return list;
  }, [recruiterSummaries, recruiterSearchQuery, recruiterSortField, recruiterSortDir]);

  // Calculate recruiter's stats with proper commission amounts
  const myStats = useMemo(() => {
    const total = hosts.length;
    const verified = hosts.filter(h => h.estado === 'Verified').length;
    const pending = hosts.filter(h => h.estado === 'Pending').length;
    const rejected = hosts.filter(h => h.estado === 'Rejected').length;
    const verificationRate = total > 0 ? Math.round((verified / total) * 100) : 0;
    const pendingCommissionsCount = hosts.filter(h => h.estado === 'Verified' && h.real === true && h.comision === 'Pending').length;
    const paidCommissionsCount = hosts.filter(h => h.comision === 'Paid' && h.real === true).length;
    
    const myCommissionRate = getRecruiterCommission(activeRecruiterName);
    
    const totalEarnings = paidCommissionsCount * myCommissionRate;
    const pendingEarnings = pendingCommissionsCount * myCommissionRate;

    return {
      total,
      verified,
      pending,
      rejected,
      verificationRate,
      pendingCommissions: pendingCommissionsCount,
      paidCommissions: paidCommissionsCount,
      totalEarnings,
      pendingEarnings,
      commissionRate: myCommissionRate
    };
  }, [hosts, recruiterSettings, activeRecruiterName]);


  // Calculate leaderboard with proper commission amounts
  const leaderboard = useMemo((): LeaderboardEntry[] => {
    const recruiterStats: Record<string, { verified: number; total: number; earnings: number }> = {};

    allHosts.forEach(host => {
      const recruiter = host.reclutador || 'Unknown';
      if (!recruiterStats[recruiter]) {
        recruiterStats[recruiter] = { verified: 0, total: 0, earnings: 0 };
      }
      recruiterStats[recruiter].total++;
      if (host.estado === 'Verified') {
        recruiterStats[recruiter].verified++;
        if (host.comision === 'Paid' && host.real === true) {
          recruiterStats[recruiter].earnings += getRecruiterCommission(recruiter);
        }
      }
    });

    return Object.entries(recruiterStats)
      .map(([name, stats]) => ({
        name,
        verified: stats.verified,
        total: stats.total,
        rate: stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0,
        earnings: stats.earnings
      }))
      .sort((a, b) => b.verified - a.verified)
      .slice(0, 10);
  }, [allHosts, recruiterSettings]);

  // Rank for the active recruiter
  const activeRank = useMemo(() => {
    const index = leaderboard.findIndex(l => l.name === activeRecruiterName);
    return index >= 0 ? index + 1 : null;
  }, [leaderboard, activeRecruiterName]);

  // Filtered and sorted hosts
  const filteredHosts = useMemo(() => {
    let filtered = [...hosts];

    if (statusFilter !== 'all') {
      filtered = filtered.filter(h => h.estado === statusFilter);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(h =>
        h.host_name?.toLowerCase().includes(query) ||
        h.host_id?.toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => {
      let aVal = a[sortField] || '';
      let bVal = b[sortField] || '';
      return sortDirection === 'asc' ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });

    return filtered;
  }, [hosts, statusFilter, searchQuery, sortField, sortDirection]);

  const handleSort = (field: 'host_name' | 'reg_date' | 'estado') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleRecruiterSort = (field: 'name' | 'total' | 'verified' | 'rate' | 'earnings') => {
    if (recruiterSortField === field) {
      setRecruiterSortDir(recruiterSortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setRecruiterSortField(field);
      setRecruiterSortDir('desc');
    }
  };

  const handleSave = () => {
    setShowAddModal(false);
    fetchData();
  };

  const handleRegisterHostClick = () => {
    if (isReadonly) {
      setShowBlockedMessage(true);
      setTimeout(() => setShowBlockedMessage(false), 2000);
      return;
    }
    setShowAddModal(true);
  };

  const handleSelectRecruiter = (name: string) => {
    setSelectedRecruiterForView(name);
    // Reset filters when switching recruiter
    setSearchQuery('');
    setStatusFilter('all');
    setSortField('reg_date');
    setSortDirection('desc');
  };

  const handleBackToRecruiterList = () => {
    setSelectedRecruiterForView(null);
    setHosts([]);
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1: return <Trophy className="w-5 h-5 text-yellow-500" />;
      case 2: return <Medal className="w-5 h-5 text-gray-400" />;
      case 3: return <Award className="w-5 h-5 text-amber-600" />;
      default: return <span className="w-5 h-5 flex items-center justify-center text-gray-500 font-bold">{rank}</span>;
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  const RecruiterSortIcon = ({ field }: { field: string }) => {
    if (recruiterSortField !== field) return null;
    return recruiterSortDir === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  // =============================================
  // SUPERADMIN: Recruiter Selector View
  // =============================================
  if (isSuperAdmin && !selectedRecruiterForView) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Portal de Reclutadores</h1>
              <p className="text-gray-500 mt-1">Selecciona un reclutador para ver su panel</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-50 rounded-lg">
                <Users className="w-6 h-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Reclutadores</p>
                <p className="text-2xl font-bold text-gray-900">{recruiterSummaries.length}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-green-50 rounded-lg">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Verificados</p>
                <p className="text-2xl font-bold text-green-600">{recruiterSummaries.reduce((acc, r) => acc + r.verified, 0)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-amber-50 rounded-lg">
                <Clock className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Pendientes</p>
                <p className="text-2xl font-bold text-amber-600">{recruiterSummaries.reduce((acc, r) => acc + r.pending, 0)}</p>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-emerald-50 rounded-lg">
                <DollarSign className="w-6 h-6 text-emerald-500" />
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Pagado</p>
                <p className="text-2xl font-bold text-emerald-600">${recruiterSummaries.reduce((acc, r) => acc + r.earnings, 0).toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recruiter List */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Seleccionar Reclutador</h3>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar reclutador por nombre..."
                value={recruiterSearchQuery}
                onChange={(e) => setRecruiterSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
              <p className="text-gray-500 mt-2">Cargando reclutadores...</p>
            </div>
          ) : filteredRecruiters.length === 0 ? (
            <div className="p-12 text-center text-gray-500">
              <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p>No se encontraron reclutadores</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleRecruiterSort('name')}
                    >
                      <div className="flex items-center gap-1">Reclutador <RecruiterSortIcon field="name" /></div>
                    </th>
                    <th
                      className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleRecruiterSort('total')}
                    >
                      <div className="flex items-center justify-center gap-1">Total <RecruiterSortIcon field="total" /></div>
                    </th>
                    <th
                      className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleRecruiterSort('verified')}
                    >
                      <div className="flex items-center justify-center gap-1">Verificados <RecruiterSortIcon field="verified" /></div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                      Pendientes
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                      Rechazados
                    </th>
                    <th
                      className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleRecruiterSort('rate')}
                    >
                      <div className="flex items-center justify-center gap-1">Tasa <RecruiterSortIcon field="rate" /></div>
                    </th>
                    <th
                      className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase cursor-pointer hover:bg-gray-100"
                      onClick={() => handleRecruiterSort('earnings')}
                    >
                      <div className="flex items-center justify-center gap-1">Ganado <RecruiterSortIcon field="earnings" /></div>
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                      Por Pagar
                    </th>
                    <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase">
                      Acción
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {filteredRecruiters.map((recruiter) => (
                    <tr
                      key={recruiter.name}
                      className="hover:bg-blue-50 cursor-pointer transition-colors"
                      onClick={() => handleSelectRecruiter(recruiter.name)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-bold text-sm">
                            {recruiter.name.charAt(0).toUpperCase()}
                          </div>
                          <span className="font-medium text-gray-900">{recruiter.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold text-gray-700">{recruiter.total}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">{recruiter.verified}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-700">{recruiter.pending}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">{recruiter.rejected}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-medium text-purple-600">{recruiter.rate}%</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold text-emerald-600">${recruiter.earnings.toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="font-semibold text-amber-600">${recruiter.pendingPay.toFixed(2)}</span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleSelectRecruiter(recruiter.name); }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-500 text-white text-xs font-medium rounded-lg hover:bg-blue-600 transition-colors"
                        >
                          Ver Panel
                          <ChevronRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =============================================
  // RECRUITER DASHBOARD VIEW
  // (For regular users: their own data)
  // (For superadmin: selected recruiter's data)
  // =============================================
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={isSuperAdmin ? handleBackToRecruiterList : onBack}
            className="p-2 hover:bg-gray-100 rounded-lg"
            title={isSuperAdmin ? 'Volver a lista de reclutadores' : 'Back'}
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            {isSuperAdmin ? (
              <>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900">Panel de {activeRecruiterName}</h1>
                  <span className="px-2 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 rounded-full">Vista Admin</span>
                </div>
                <p className="text-gray-500 mt-1">Visualizando el portal del reclutador seleccionado</p>
              </>
            ) : (
              <>
                <h1 className="text-2xl font-bold text-gray-900">Recruiter Portal</h1>
                <p className="text-gray-500 mt-1">Welcome back, {activeRecruiterName}</p>
              </>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isSuperAdmin && (
            <button
              onClick={handleBackToRecruiterList}
              className="px-4 py-2 border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-50 flex items-center gap-2"
            >
              <Users className="w-4 h-4" />
              Cambiar Reclutador
            </button>
          )}
          <button
            onClick={fetchData}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {isSuperAdmin ? 'Actualizar' : 'Refresh'}
          </button>
          {/* Only show Register Host for non-superadmin users */}
          {!isSuperAdmin && (
            <div className="relative">
              <button
                onClick={handleRegisterHostClick}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 ${
                  isReadonly 
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed' 
                    : 'bg-blue-500 text-white hover:bg-blue-600'
                }`}
              >
                {isReadonly ? <Lock className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                Register Host
              </button>
              {showBlockedMessage && (
                <div className="absolute right-0 top-full mt-2 z-50 px-3 py-2 bg-red-500 text-white text-xs rounded-lg whitespace-nowrap shadow-lg">
                  Access restricted for readonly users
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-lg">
              <Users className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{isSuperAdmin ? 'Emisores' : 'My Hosts'}</p>
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
              <p className="text-sm text-gray-500">{isSuperAdmin ? 'Verificados' : 'Verified'}</p>
              <p className="text-2xl font-bold text-green-600">{myStats.verified}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 rounded-lg">
              <TrendingUp className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{isSuperAdmin ? 'Tasa de Éxito' : 'Success Rate'}</p>
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
              <p className="text-sm text-gray-500">{isSuperAdmin ? 'Total Ganado' : 'Total Earnings'}</p>
              <p className="text-2xl font-bold text-emerald-600">${myStats.totalEarnings.toFixed(2)}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 rounded-lg">
              <Clock className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">{isSuperAdmin ? 'Pago Pendiente' : 'Pending Pay'}</p>
              <p className="text-2xl font-bold text-amber-600">${myStats.pendingEarnings.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Hosts Table */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              {isSuperAdmin ? `Emisores de ${activeRecruiterName}` : 'My Registered Hosts'}
            </h3>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={isSuperAdmin ? "Buscar emisores..." : "Search hosts..."}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
              >
                <option value="all">{isSuperAdmin ? 'Todos los Estados' : 'All Status'}</option>
                <option value="Verified">{isSuperAdmin ? 'Verificado' : 'Verified'}</option>
                <option value="Pending">{isSuperAdmin ? 'Pendiente' : 'Pending'}</option>
                <option value="Rejected">{isSuperAdmin ? 'Rechazado' : 'Rejected'}</option>
              </select>
            </div>
          </div>
          <div className="overflow-x-auto max-h-96">
            <table className="w-full">
              <thead className="bg-gray-50 sticky top-0">
                <tr>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer"
                    onClick={() => handleSort('host_name')}
                  >
                    <div className="flex items-center gap-1">{isSuperAdmin ? 'Nombre' : 'Host Name'} <SortIcon field="host_name" /></div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">{isSuperAdmin ? 'ID Emisor' : 'Host ID'}</th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer"
                    onClick={() => handleSort('reg_date')}
                  >
                    <div className="flex items-center gap-1">{isSuperAdmin ? 'Fecha Reg.' : 'Reg Date'} <SortIcon field="reg_date" /></div>
                  </th>
                  <th
                    className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer"
                    onClick={() => handleSort('estado')}
                  >
                    <div className="flex items-center gap-1">{isSuperAdmin ? 'Estado' : 'Status'} <SortIcon field="estado" /></div>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">{isSuperAdmin ? 'Comisión' : 'Commission'}</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">{isSuperAdmin ? 'Acciones' : 'Actions'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center">
                      <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
                    </td>
                  </tr>
                ) : filteredHosts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                      {isSuperAdmin ? 'No se encontraron emisores' : 'No hosts found'}
                    </td>
                  </tr>
                ) : (
                  filteredHosts.map((host) => (
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
                            {host.comision === 'Paid' ? `Paid ($${myStats.commissionRate.toFixed(2)})` : 'Pending'}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => { setSelectedHost(host); setViewMode('view'); }}
                          className="p-2 hover:bg-gray-100 rounded-lg"
                          title={isSuperAdmin ? 'Ver Detalles' : 'View Details'}
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

        {/* Leaderboard */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200">
          <div className="p-4 border-b border-gray-200">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-yellow-500" />
              <h3 className="text-lg font-semibold text-gray-900">{isSuperAdmin ? 'Top Reclutadores' : 'Top Recruiters'}</h3>
            </div>
            {activeRank && (
              <p className="text-sm text-gray-500 mt-1">
                {isSuperAdmin ? `Posición de ${activeRecruiterName}: #${activeRank}` : `Your rank: #${activeRank}`}
              </p>
            )}
          </div>
          <div className="divide-y divide-gray-100">
            {leaderboard.map((entry, index) => (
              <div
                key={entry.name}
                className={`p-4 flex items-center gap-3 ${
                  entry.name === activeRecruiterName ? 'bg-blue-50' : ''
                } ${isSuperAdmin ? 'cursor-pointer hover:bg-blue-50/70' : ''}`}
                onClick={() => {
                  if (isSuperAdmin) {
                    handleSelectRecruiter(entry.name);
                  }
                }}
              >
                <div className="w-8 flex justify-center">
                  {getRankIcon(index + 1)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium truncate ${
                    entry.name === activeRecruiterName ? 'text-blue-700' : 'text-gray-900'
                  }`}>
                    {entry.name}
                    {entry.name === activeRecruiterName && !isSuperAdmin && (
                      <span className="ml-2 text-xs text-blue-500">(You)</span>
                    )}
                    {entry.name === activeRecruiterName && isSuperAdmin && (
                      <span className="ml-2 text-xs text-blue-500">(Seleccionado)</span>
                    )}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span>{entry.verified} {isSuperAdmin ? 'verificados' : 'verified'}</span>
                    <span>{entry.rate}% {isSuperAdmin ? 'tasa' : 'rate'}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-emerald-600">${entry.earnings.toFixed(0)}</p>
                  <p className="text-xs text-gray-500">{isSuperAdmin ? 'ganado' : 'earned'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Performance Summary */}
      <div className={`rounded-xl p-6 text-white ${isSuperAdmin ? 'bg-gradient-to-r from-amber-500 to-orange-600' : 'bg-gradient-to-r from-blue-500 to-purple-600'}`}>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h3 className="text-xl font-bold">
              {isSuperAdmin ? `Resumen de ${activeRecruiterName}` : 'Performance Summary'}
            </h3>
            <p className={`mt-1 ${isSuperAdmin ? 'text-amber-100' : 'text-blue-100'}`}>
              {isSuperAdmin ? 'Estadísticas del reclutador seleccionado' : 'Keep up the great work!'}
            </p>
          </div>
          <div className="flex flex-wrap gap-6">
            <div className="text-center">
              <p className="text-3xl font-bold">{myStats.total}</p>
              <p className={`text-sm ${isSuperAdmin ? 'text-amber-100' : 'text-blue-100'}`}>{isSuperAdmin ? 'Total Emisores' : 'Total Hosts'}</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">{myStats.verificationRate}%</p>
              <p className={`text-sm ${isSuperAdmin ? 'text-amber-100' : 'text-blue-100'}`}>{isSuperAdmin ? 'Tasa de Éxito' : 'Success Rate'}</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">${myStats.totalEarnings.toFixed(0)}</p>
              <p className={`text-sm ${isSuperAdmin ? 'text-amber-100' : 'text-blue-100'}`}>{isSuperAdmin ? 'Total Ganado' : 'Total Earned'}</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">${myStats.pendingEarnings.toFixed(0)}</p>
              <p className={`text-sm ${isSuperAdmin ? 'text-amber-100' : 'text-blue-100'}`}>{isSuperAdmin ? 'Pago Pendiente' : 'Pending Pay'}</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">#{activeRank || '-'}</p>
              <p className={`text-sm ${isSuperAdmin ? 'text-amber-100' : 'text-blue-100'}`}>Leaderboard</p>
            </div>
          </div>
        </div>
      </div>

      {/* Add Host Modal - Only for non-superadmin */}
      {!isSuperAdmin && (
        <Modal
          isOpen={showAddModal}
          onClose={() => setShowAddModal(false)}
          title="Register New Host"
          size="full"
        >
          <EntryForm
            entry={null}
            onSave={handleSave}
            onCancel={() => setShowAddModal(false)}
            isNewEntry={true}
            defaultRecruiter={activeRecruiterName}
          />
        </Modal>
      )}

      {/* View Host Modal */}
      <Modal
        isOpen={viewMode !== null}
        onClose={() => { setSelectedHost(null); setViewMode(null); }}
        title={isSuperAdmin ? 'Detalles del Emisor' : 'Host Details'}
        size="full"
      >
        <EntryForm
          entry={selectedHost}
          onSave={() => { setSelectedHost(null); setViewMode(null); fetchData(); }}
          onCancel={() => { setSelectedHost(null); setViewMode(null); }}
          disabled={true}
          isNewEntry={false}
        />
      </Modal>
    </div>
  );
}
