import React, { useState, useEffect, useMemo } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import {
  TrendingUp,
  Users,
  CheckCircle,
  DollarSign,
  Calendar,
  RefreshCw,
  ArrowLeft,
  BarChart3,
  PieChart as PieChartIcon,
  Activity
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Host } from '@/types';

interface AnalyticsDashboardProps {
  onBack: () => void;
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

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];
const STATUS_COLORS = {
  Verified: '#10b981',
  Pending: '#f59e0b',
  Rejected: '#ef4444'
};

export default function AnalyticsDashboard({ onBack }: AnalyticsDashboardProps) {
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [recruiterSettings, setRecruiterSettings] = useState<Record<string, RecruiterCommissionSettings>>({});

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

  // Get commission amount for a specific recruiter
  const getRecruiterCommission = (recruiter: string, settings: Record<string, RecruiterCommissionSettings>): number => {
    const recruiterSetting = settings[recruiter];
    if (recruiterSetting) {
      return calculateTotalCommission(recruiterSetting.base_commission, recruiterSetting.additional_percentage);
    }
    return DEFAULT_BASE_COMMISSION;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch recruiter settings first
      const settings = await fetchRecruiterSettings();

      const { data, error } = await supabase
        .from('hosts')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      setHosts(data || []);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredHosts = useMemo(() => {
    if (dateRange === 'all') return hosts;
    
    const now = new Date();
    const daysMap = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[dateRange];
    const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    
    return hosts.filter(h => new Date(h.created_at) >= cutoff);
  }, [hosts, dateRange]);

  // Registration trends over time
  const registrationTrends = useMemo(() => {
    const grouped: Record<string, number> = {};
    
    filteredHosts.forEach(host => {
      const date = new Date(host.reg_date || host.created_at);
      const key = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      grouped[key] = (grouped[key] || 0) + 1;
    });

    return Object.entries(grouped)
      .slice(-14)
      .map(([date, count]) => ({ date, registrations: count }));
  }, [filteredHosts]);

  // Verification rates by recruiter
  const verificationByRecruiter = useMemo(() => {
    const recruiterStats: Record<string, { total: number; verified: number; pending: number; rejected: number }> = {};
    
    filteredHosts.forEach(host => {
      const recruiter = host.reclutador || 'Unknown';
      if (!recruiterStats[recruiter]) {
        recruiterStats[recruiter] = { total: 0, verified: 0, pending: 0, rejected: 0 };
      }
      recruiterStats[recruiter].total++;
      if (host.estado === 'Verified') recruiterStats[recruiter].verified++;
      else if (host.estado === 'Pending') recruiterStats[recruiter].pending++;
      else if (host.estado === 'Rejected') recruiterStats[recruiter].rejected++;
    });

    return Object.entries(recruiterStats)
      .map(([name, stats]) => ({
        name,
        ...stats,
        verificationRate: stats.total > 0 ? Math.round((stats.verified / stats.total) * 100) : 0
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [filteredHosts]);

  // Commission payment history with proper commission amounts
  const commissionHistory = useMemo(() => {
    const monthlyData: Record<string, { paid: number; pending: number; paidAmount: number; pendingAmount: number }> = {};

    filteredHosts.filter(h => h.estado === 'Verified' && h.real === true).forEach(host => {
      const date = new Date(host.ver_date || host.created_at);
      const key = date.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
      
      if (!monthlyData[key]) {
        monthlyData[key] = { paid: 0, pending: 0, paidAmount: 0, pendingAmount: 0 };
      }
      
      // Get the proper commission amount for this host's recruiter
      const commissionAmount = getRecruiterCommission(host.reclutador || 'Unknown', recruiterSettings);
      
      if (host.comision === 'Paid') {
        monthlyData[key].paid++;
        monthlyData[key].paidAmount += commissionAmount;
      } else {
        monthlyData[key].pending++;
        monthlyData[key].pendingAmount += commissionAmount;
      }
    });

    return Object.entries(monthlyData)
      .slice(-6)
      .map(([month, data]) => ({ month, ...data }));
  }, [filteredHosts, recruiterSettings]);


  // Status distribution
  const statusDistribution = useMemo(() => {
    const counts = { Verified: 0, Pending: 0, Rejected: 0 };
    filteredHosts.forEach(host => {
      if (host.estado in counts) {
        counts[host.estado as keyof typeof counts]++;
      }
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredHosts]);

  // Real vs Not Real distribution
  const realDistribution = useMemo(() => {
    const real = filteredHosts.filter(h => h.real).length;
    const notReal = filteredHosts.length - real;
    return [
      { name: 'Verified Real', value: real },
      { name: 'Not Verified', value: notReal }
    ];
  }, [filteredHosts]);

  // Summary stats with proper commission amounts
  const summaryStats = useMemo(() => {
    const total = filteredHosts.length;
    const verified = filteredHosts.filter(h => h.estado === 'Verified').length;
    const verificationRate = total > 0 ? Math.round((verified / total) * 100) : 0;
    
    // Calculate total commissions paid with proper amounts per recruiter
    let totalCommissionsPaid = 0;
    filteredHosts.filter(h => h.comision === 'Paid' && h.real === true).forEach(host => {
      totalCommissionsPaid += getRecruiterCommission(host.reclutador || 'Unknown', recruiterSettings);
    });
    
    // Calculate pending commissions with proper amounts per recruiter
    let pendingCommissions = 0;
    filteredHosts.filter(h => h.estado === 'Verified' && h.comision === 'Pending' && h.real === true).forEach(host => {
      pendingCommissions += getRecruiterCommission(host.reclutador || 'Unknown', recruiterSettings);
    });
    
    const realAccounts = filteredHosts.filter(h => h.real).length;

    return { total, verified, verificationRate, totalCommissionsPaid, pendingCommissions, realAccounts };
  }, [filteredHosts, recruiterSettings]);




  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h1>
            <p className="text-gray-500 mt-1">Visual insights and performance metrics</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as any)}
            className="px-4 py-2 border border-gray-300 rounded-lg bg-white"
          >
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
            <option value="all">All Time</option>
          </select>
          <button
            onClick={fetchData}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-lg">
              <Users className="w-6 h-6 text-blue-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Hosts</p>
              <p className="text-2xl font-bold text-gray-900">{summaryStats.total}</p>
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
              <p className="text-2xl font-bold text-green-600">{summaryStats.verified}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 rounded-lg">
              <TrendingUp className="w-6 h-6 text-purple-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Verification Rate</p>
              <p className="text-2xl font-bold text-purple-600">{summaryStats.verificationRate}%</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 rounded-lg">
              <DollarSign className="w-6 h-6 text-emerald-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Commissions Paid</p>
              <p className="text-2xl font-bold text-emerald-600">${summaryStats.totalCommissionsPaid}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 rounded-lg">
              <DollarSign className="w-6 h-6 text-amber-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending</p>
              <p className="text-2xl font-bold text-amber-600">${summaryStats.pendingCommissions}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-cyan-50 rounded-lg">
              <Activity className="w-6 h-6 text-cyan-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Real Accounts</p>
              <p className="text-2xl font-bold text-cyan-600">{summaryStats.realAccounts}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Registration Trends */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <BarChart3 className="w-5 h-5 text-blue-500" />
            <h3 className="text-lg font-semibold text-gray-900">Registration Trends</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={registrationTrends}>
              <defs>
                <linearGradient id="colorReg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
                }}
              />
              <Area 
                type="monotone" 
                dataKey="registrations" 
                stroke="#3b82f6" 
                strokeWidth={2}
                fill="url(#colorReg)" 
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Status Distribution */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <PieChartIcon className="w-5 h-5 text-purple-500" />
            <h3 className="text-lg font-semibold text-gray-900">Status Distribution</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={statusDistribution}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={100}
                paddingAngle={5}
                dataKey="value"
                label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
              >
                {statusDistribution.map((entry, index) => (
                  <Cell 
                    key={`cell-${index}`} 
                    fill={STATUS_COLORS[entry.name as keyof typeof STATUS_COLORS] || COLORS[index]} 
                  />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Verification by Recruiter */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <Users className="w-5 h-5 text-green-500" />
            <h3 className="text-lg font-semibold text-gray-900">Verification by Recruiter</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={verificationByRecruiter} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis type="number" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={80} stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}
              />
              <Legend />
              <Bar dataKey="verified" stackId="a" fill="#10b981" name="Verified" />
              <Bar dataKey="pending" stackId="a" fill="#f59e0b" name="Pending" />
              <Bar dataKey="rejected" stackId="a" fill="#ef4444" name="Rejected" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Commission History */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-2 mb-6">
            <DollarSign className="w-5 h-5 text-emerald-500" />
            <h3 className="text-lg font-semibold text-gray-900">Commission History</h3>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={commissionHistory}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'white', 
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px'
                }}
                formatter={(value: number, name: string) => {
                  if (name.includes('Amount')) return [`$${value.toFixed(2)}`, name];
                  return [value, name];
                }}
              />
              <Legend />
              <Bar dataKey="paidAmount" fill="#10b981" name="Paid ($)" />
              <Bar dataKey="pendingAmount" fill="#f59e0b" name="Pending ($)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Verification Rate Trend */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <div className="flex items-center gap-2 mb-6">
          <TrendingUp className="w-5 h-5 text-blue-500" />
          <h3 className="text-lg font-semibold text-gray-900">Recruiter Performance (Verification Rate %)</h3>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={verificationByRecruiter}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#9ca3af" />
            <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" domain={[0, 100]} />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: 'white', 
                border: '1px solid #e5e7eb',
                borderRadius: '8px'
              }}
              formatter={(value: number) => [`${value}%`, 'Verification Rate']}
            />
            <Bar dataKey="verificationRate" fill="#8b5cf6" radius={[4, 4, 0, 0]}>
              {verificationByRecruiter.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.verificationRate >= 70 ? '#10b981' : entry.verificationRate >= 50 ? '#f59e0b' : '#ef4444'} 
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
