import React, { useState, useEffect, useRef } from 'react';
import { 
  Filter, 
  Download, 
  FileText, 
  Image as ImageIcon, 
  File,
  X,
  RefreshCw,
  Calendar,
  BarChart3,
  Users,
  History
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Host, FilterOptions, ActivityLog, ActionType } from '@/types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const PAY_METHODS = ['', 'Binance', 'Nequi', 'Payoneer', 'Paypal', 'Venmo', 'Zelle', 'CashApp'];
const ESTADOS = ['', 'Verified', 'Pending', 'Rejected'];
const COMISION_OPTIONS = ['', 'Paid', 'Pending'];

const ACTION_LABELS: Record<string, string> = {
  login: 'Login',
  logout: 'Logout',
  create: 'Create',
  update: 'Update',
  delete: 'Delete',
  commission_payment: 'Commission Payment',
  credit_purchase: 'Credit Purchase',
  import: 'Import',
  export: 'Export',
  escalation: 'Escalation',
  password_reset: 'Password Reset',
  bulk_verification: 'Bulk Verification',
  commission_settings_update: 'Commission Settings Update',
};

type ReportType = 'hosts' | 'activity' | 'audit';

export default function Reports() {
  const [reportType, setReportType] = useState<ReportType>('hosts');

  // Host report state
  const [hosts, setHosts] = useState<Host[]>([]);
  const [filteredHosts, setFilteredHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [reclutadores, setReclutadores] = useState<string[]>([]);
  const [filters, setFilters] = useState<FilterOptions>({
    reclutador: '',
    estado: '',
    payMethod: '',
    escalado: '',
    dateFrom: '',
    dateTo: '',
    comision: '',
  });
  const tableRef = useRef<HTMLDivElement>(null);

  // Activity logs state
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityFilters, setActivityFilters] = useState({
    actionType: '',
    userName: '',
    dateFrom: '',
    dateTo: '',
  });
  const [activityUsers, setActivityUsers] = useState<string[]>([]);

  useEffect(() => {
    if (reportType === 'hosts') fetchHosts();
    else fetchActivityLogs();
  }, [reportType]);

  useEffect(() => {
    applyFilters();
  }, [filters, hosts]);

  // ===== HOST REPORT =====
  const fetchHosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hosts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHosts(data || []);
      
      const uniqueReclutadores = [...new Set(data?.map(h => h.reclutador).filter(Boolean))];
      setReclutadores(uniqueReclutadores as string[]);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let result = [...hosts];

    if (filters.reclutador) {
      result = result.filter(h => h.reclutador === filters.reclutador);
    }
    if (filters.estado) {
      result = result.filter(h => h.estado === filters.estado);
    }
    if (filters.payMethod) {
      result = result.filter(h => h.pay_method === filters.payMethod);
    }
    if (filters.escalado) {
      result = result.filter(h => 
        filters.escalado === 'yes' ? h.escalado : !h.escalado
      );
    }
    if (filters.comision) {
      result = result.filter(h => h.comision === filters.comision);
    }
    if (filters.dateFrom) {
      result = result.filter(h => h.reg_date >= filters.dateFrom);
    }
    if (filters.dateTo) {
      result = result.filter(h => h.reg_date <= filters.dateTo);
    }

    setFilteredHosts(result);
  };

  const clearFilters = () => {
    setFilters({
      reclutador: '',
      estado: '',
      payMethod: '',
      escalado: '',
      dateFrom: '',
      dateTo: '',
      comision: '',
    });
  };

  const calculateDays = (regDate: string) => {
    if (!regDate) return 0;
    const reg = new Date(regDate);
    const now = new Date();
    const diff = now.getTime() - reg.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const exportToPDF = async () => {
    const doc = new jsPDF('l', 'mm', 'a4');
    const timestamp = new Date().toLocaleString();
    
    doc.setFontSize(18);
    doc.text('Host Manager Report', 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${timestamp}`, 14, 28);
    doc.text(`Total Records: ${filteredHosts.length}`, 14, 34);
    
    const activeFilters = Object.entries(filters)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    if (activeFilters) {
      doc.text(`Filters: ${activeFilters}`, 14, 40);
    }

    const headers = ['Host Name', 'Host ID', 'Reg Date', 'Count', 'Reclutador', 'Estado', 'Comisión'];
    const colWidths = [40, 30, 25, 20, 35, 25, 25];
    let y = 50;

    doc.setFillColor(59, 130, 246);
    doc.rect(14, y - 5, 270, 8, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    
    let x = 14;
    headers.forEach((header, i) => {
      doc.text(header, x + 2, y);
      x += colWidths[i];
    });

    doc.setTextColor(0, 0, 0);
    y += 8;

    filteredHosts.slice(0, 50).forEach((host, index) => {
      if (y > 190) {
        doc.addPage();
        y = 20;
      }

      if (index % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(14, y - 4, 270, 7, 'F');
      }

      x = 14;
      const row = [
        host.host_name?.substring(0, 20) || '',
        host.host_id?.substring(0, 15) || '',
        host.reg_date || '',
        `${calculateDays(host.reg_date)} days`,
        host.reclutador?.substring(0, 18) || '',
        host.estado || '',
        host.comision || '',
      ];

      row.forEach((cell, i) => {
        doc.text(cell, x + 2, y);
        x += colWidths[i];
      });

      y += 7;
    });

    doc.save(`host-report-${Date.now()}.pdf`);
  };

  const exportToTXT = () => {
    const timestamp = new Date().toLocaleString();
    let content = `Host Manager Report\n`;
    content += `Generated: ${timestamp}\n`;
    content += `Total Records: ${filteredHosts.length}\n\n`;

    const headers = ['Host Name', 'Host ID', 'Reg Date', 'Count', 'WhatsApp', 'Pay Method', 'User ID', 'Estado', 'Escalado', 'Reclutador', 'Comision'];
    content += headers.join(',') + '\n';
    content += '-'.repeat(100) + '\n';

    filteredHosts.forEach(host => {
      const row = [
        host.host_name || '',
        host.host_id || '',
        host.reg_date || '',
        `${calculateDays(host.reg_date)} days`,
        host.whatsapp_num || '',
        host.pay_method || '',
        host.user_id || '',
        host.estado || '',
        host.escalado ? 'Yes' : 'No',
        host.reclutador || '',
        host.comision || '',
      ];
      content += row.join(',') + '\n';
    });

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `host-report-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportToJPG = async () => {
    if (!tableRef.current) return;
    
    try {
      const canvas = await html2canvas(tableRef.current, {
        backgroundColor: '#ffffff',
        scale: 2,
      });
      
      const link = document.createElement('a');
      link.download = `host-report-${Date.now()}.jpg`;
      link.href = canvas.toDataURL('image/jpeg', 0.9);
      link.click();
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export as image');
    }
  };

  const getStatusBadge = (estado: string) => {
    const styles: Record<string, string> = {
      Verified: 'bg-green-100 text-green-700',
      Pending: 'bg-yellow-100 text-yellow-700',
      Rejected: 'bg-red-100 text-red-700',
    };
    return (
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${styles[estado] || 'bg-gray-100'}`}>
        {estado}
      </span>
    );
  };

  // ===== ACTIVITY LOGS / AUDIT TRAIL =====
  const fetchActivityLogs = async () => {
    setActivityLoading(true);
    try {
      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (activityFilters.actionType) {
        query = query.eq('action_type', activityFilters.actionType);
      }
      if (activityFilters.userName) {
        query = query.ilike('user_name', `%${activityFilters.userName}%`);
      }
      if (activityFilters.dateFrom) {
        query = query.gte('created_at', `${activityFilters.dateFrom}T00:00:00`);
      }
      if (activityFilters.dateTo) {
        query = query.lte('created_at', `${activityFilters.dateTo}T23:59:59`);
      }

      const { data, error } = await query.limit(500);

      if (error) throw error;
      setActivityLogs(data || []);

      // Extract unique users
      const uniqueUsers = [...new Set((data || []).map((l: ActivityLog) => l.user_name).filter(Boolean))] as string[];
      setActivityUsers(uniqueUsers);
    } catch (error) {
      console.error('Fetch activity logs error:', error);
    } finally {
      setActivityLoading(false);
    }
  };

  useEffect(() => {
    if (reportType !== 'hosts') fetchActivityLogs();
  }, [activityFilters]);

  const clearActivityFilters = () => {
    setActivityFilters({ actionType: '', userName: '', dateFrom: '', dateTo: '' });
  };

  // Group by activity type
  const groupedByActivity = activityLogs.reduce((acc, log) => {
    const type = log.action_type || 'unknown';
    if (!acc[type]) acc[type] = [];
    acc[type].push(log);
    return acc;
  }, {} as Record<string, ActivityLog[]>);

  // Group by user
  const groupedByUser = activityLogs.reduce((acc, log) => {
    const user = log.user_name || 'System';
    if (!acc[user]) acc[user] = [];
    acc[user].push(log);
    return acc;
  }, {} as Record<string, ActivityLog[]>);

  // Summary by activity type: count per activity per user
  const activitySummary = Object.entries(groupedByActivity).map(([action, logs]) => {
    const userCounts: Record<string, number> = {};
    logs.forEach(log => {
      const user = log.user_name || 'System';
      userCounts[user] = (userCounts[user] || 0) + 1;
    });
    return {
      action,
      actionLabel: ACTION_LABELS[action] || action,
      total: logs.length,
      userCounts,
    };
  }).sort((a, b) => b.total - a.total);

  // Summary by user: count per user per activity
  const userSummary = Object.entries(groupedByUser).map(([user, logs]) => {
    const actionCounts: Record<string, number> = {};
    logs.forEach(log => {
      const type = log.action_type || 'unknown';
      actionCounts[type] = (actionCounts[type] || 0) + 1;
    });
    return {
      user,
      total: logs.length,
      actionCounts,
    };
  }).sort((a, b) => b.total - a.total);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const exportActivityToTXT = () => {
    const isAudit = reportType === 'audit';
    const reportName = isAudit ? 'Audit Trail Report' : 'Activity Logs Report';
    let content = `${reportName}\n`;
    content += `Generated: ${new Date().toLocaleString()}\n`;
    content += `Total Records: ${activityLogs.length}\n`;
    content += `${'='.repeat(60)}\n\n`;

    // By Activity
    content += `BY ACTIVITY TYPE\n`;
    content += `${'-'.repeat(40)}\n`;
    activitySummary.forEach(item => {
      content += `\n${item.actionLabel} (${item.total} total)\n`;
      Object.entries(item.userCounts).forEach(([user, count]) => {
        content += `  - ${user}: ${count}\n`;
      });
    });

    content += `\n\nBY USER\n`;
    content += `${'-'.repeat(40)}\n`;
    userSummary.forEach(item => {
      content += `\n${item.user} (${item.total} total)\n`;
      Object.entries(item.actionCounts).forEach(([action, count]) => {
        content += `  - ${ACTION_LABELS[action] || action}: ${count}\n`;
      });
    });

    if (isAudit) {
      content += `\n\nDETAILED CHANGES\n`;
      content += `${'-'.repeat(40)}\n`;
      activityLogs.filter(l => l.old_values || l.new_values).forEach((log, i) => {
        content += `\n${i + 1}. [${formatDate(log.created_at)}] ${log.user_name} - ${ACTION_LABELS[log.action_type] || log.action_type}\n`;
        content += `   Description: ${log.action_description}\n`;
        if (log.old_values) content += `   Old: ${JSON.stringify(log.old_values)}\n`;
        if (log.new_values) content += `   New: ${JSON.stringify(log.new_values)}\n`;
      });
    }

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${reportName.toLowerCase().replace(/ /g, '-')}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportActivityToPDF = () => {
    const isAudit = reportType === 'audit';
    const reportName = isAudit ? 'Audit Trail Report' : 'Activity Logs Report';
    const doc = new jsPDF('l', 'mm', 'a4');
    
    doc.setFontSize(18);
    doc.text(reportName, 14, 20);
    doc.setFontSize(10);
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 28);
    doc.text(`Total Records: ${activityLogs.length}`, 14, 34);

    let y = 44;

    // By Activity
    doc.setFontSize(14);
    doc.text('By Activity Type', 14, y);
    y += 8;
    doc.setFontSize(9);
    
    doc.setFillColor(59, 130, 246);
    doc.rect(14, y - 5, 270, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('Activity', 16, y);
    doc.text('Total', 120, y);
    doc.text('User Breakdown', 150, y);
    doc.setTextColor(0, 0, 0);
    y += 7;

    activitySummary.forEach(item => {
      if (y > 190) { doc.addPage(); y = 20; }
      doc.text(item.actionLabel, 16, y);
      doc.text(String(item.total), 120, y);
      const breakdown = Object.entries(item.userCounts).map(([u, c]) => `${u}: ${c}`).join(', ');
      doc.text(breakdown.substring(0, 80), 150, y);
      y += 7;
    });

    y += 10;

    // By User
    doc.setFontSize(14);
    doc.text('By User', 14, y);
    y += 8;
    doc.setFontSize(9);
    
    doc.setFillColor(59, 130, 246);
    doc.rect(14, y - 5, 270, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.text('User', 16, y);
    doc.text('Total', 80, y);
    doc.text('Activity Breakdown', 110, y);
    doc.setTextColor(0, 0, 0);
    y += 7;

    userSummary.forEach(item => {
      if (y > 190) { doc.addPage(); y = 20; }
      doc.text(item.user.substring(0, 30), 16, y);
      doc.text(String(item.total), 80, y);
      const breakdown = Object.entries(item.actionCounts).map(([a, c]) => `${ACTION_LABELS[a] || a}: ${c}`).join(', ');
      doc.text(breakdown.substring(0, 80), 110, y);
      y += 7;
    });

    doc.save(`${reportName.toLowerCase().replace(/ /g, '-')}-${Date.now()}.pdf`);
  };

  const getActionBadge = (actionType: string) => {
    const styles: Record<string, string> = {
      login: 'bg-green-100 text-green-700',
      logout: 'bg-gray-100 text-gray-700',
      create: 'bg-blue-100 text-blue-700',
      update: 'bg-amber-100 text-amber-700',
      delete: 'bg-red-100 text-red-700',
      commission_payment: 'bg-emerald-100 text-emerald-700',
      import: 'bg-purple-100 text-purple-700',
      export: 'bg-indigo-100 text-indigo-700',
      escalation: 'bg-orange-100 text-orange-700',
      password_reset: 'bg-cyan-100 text-cyan-700',
      bulk_verification: 'bg-teal-100 text-teal-700',
      commission_settings_update: 'bg-violet-100 text-violet-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${styles[actionType] || 'bg-gray-100 text-gray-700'}`}>
        {ACTION_LABELS[actionType] || actionType}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 mt-1">Filter and export data</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => reportType === 'hosts' ? fetchHosts() : fetchActivityLogs()}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${(loading || activityLoading) ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Report Type Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        {[
          { id: 'hosts' as ReportType, label: 'Host Report', icon: BarChart3 },
          { id: 'activity' as ReportType, label: 'Activity Logs', icon: History },
          { id: 'audit' as ReportType, label: 'Audit Trail', icon: FileText },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = reportType === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setReportType(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-colors ${
                isActive
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ===== HOST REPORT ===== */}
      {reportType === 'hosts' && (
        <>
          {/* Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Reclutador</label>
                <select
                  value={filters.reclutador}
                  onChange={(e) => setFilters(prev => ({ ...prev, reclutador: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Reclutadores</option>
                  {reclutadores.map(r => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select
                  value={filters.estado}
                  onChange={(e) => setFilters(prev => ({ ...prev, estado: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {ESTADOS.map(e => (
                    <option key={e} value={e}>{e || 'All Status'}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
                <select
                  value={filters.payMethod}
                  onChange={(e) => setFilters(prev => ({ ...prev, payMethod: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {PAY_METHODS.map(p => (
                    <option key={p} value={p}>{p || 'All Methods'}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Escalado</label>
                <select
                  value={filters.escalado}
                  onChange={(e) => setFilters(prev => ({ ...prev, escalado: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comisión</label>
                <select
                  value={filters.comision}
                  onChange={(e) => setFilters(prev => ({ ...prev, comision: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {COMISION_OPTIONS.map(c => (
                    <option key={c} value={c}>{c || 'All'}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  value={filters.dateTo}
                  onChange={(e) => setFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={clearFilters}
                  className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Download className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">Export Report</h2>
              <span className="text-sm text-gray-500">({filteredHosts.length} records)</span>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button
                onClick={exportToPDF}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Export PDF
              </button>
              <button
                onClick={exportToTXT}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 flex items-center gap-2"
              >
                <File className="w-4 h-4" />
                Export TXT
              </button>
              <button
                onClick={exportToJPG}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"
              >
                <ImageIcon className="w-4 h-4" />
                Export JPG
              </button>
            </div>
          </div>

          {/* Results Table */}
          <div ref={tableRef} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Filtered Results</h2>
              <p className="text-sm text-gray-500">{filteredHosts.length} records match your filters</p>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Host Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Host ID</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Reg Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Count</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Reclutador</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Comisión</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {loading ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center">
                        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                      </td>
                    </tr>
                  ) : filteredHosts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                        No records match your filters
                      </td>
                    </tr>
                  ) : (
                    filteredHosts.map((host) => (
                      <tr key={host.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{host.host_name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{host.host_id}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{host.reg_date}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md font-medium">
                            {calculateDays(host.reg_date)} days
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">{host.reclutador}</td>
                        <td className="px-4 py-3">{getStatusBadge(host.estado)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                            host.comision === 'Paid' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
                          }`}>
                            {host.comision}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* ===== ACTIVITY LOGS / AUDIT TRAIL REPORT ===== */}
      {(reportType === 'activity' || reportType === 'audit') && (
        <>
          {/* Activity Filters */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Filter className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">Filters</h2>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Activity Type</label>
                <select
                  value={activityFilters.actionType}
                  onChange={(e) => setActivityFilters(prev => ({ ...prev, actionType: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Activities</option>
                  {Object.entries(ACTION_LABELS).map(([key, label]) => (
                    <option key={key} value={key}>{label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">User</label>
                <select
                  value={activityFilters.userName}
                  onChange={(e) => setActivityFilters(prev => ({ ...prev, userName: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">All Users</option>
                  {activityUsers.map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date From</label>
                <input
                  type="date"
                  value={activityFilters.dateFrom}
                  onChange={(e) => setActivityFilters(prev => ({ ...prev, dateFrom: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date To</label>
                <input
                  type="date"
                  value={activityFilters.dateTo}
                  onChange={(e) => setActivityFilters(prev => ({ ...prev, dateTo: e.target.value }))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={clearActivityFilters}
                  className="w-full px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Export Buttons */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="flex items-center gap-2 mb-4">
              <Download className="w-5 h-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">
                Export {reportType === 'audit' ? 'Audit Trail' : 'Activity Logs'} Report
              </h2>
              <span className="text-sm text-gray-500">({activityLogs.length} records)</span>
            </div>
            
            <div className="flex flex-wrap gap-3">
              <button
                onClick={exportActivityToPDF}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2"
              >
                <FileText className="w-4 h-4" />
                Export PDF
              </button>
              <button
                onClick={exportActivityToTXT}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 flex items-center gap-2"
              >
                <File className="w-4 h-4" />
                Export TXT
              </button>
            </div>
          </div>

          {/* Summary by Activity */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-500" />
                <h2 className="text-lg font-semibold text-gray-900">Summary by Activity</h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Activity</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">By User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {activityLoading ? (
                    <tr><td colSpan={3} className="px-4 py-12 text-center">
                      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    </td></tr>
                  ) : activitySummary.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-12 text-center text-gray-500">No records found</td></tr>
                  ) : (
                    activitySummary.map(item => (
                      <tr key={item.action} className="hover:bg-gray-50">
                        <td className="px-4 py-3">{getActionBadge(item.action)}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{item.total}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {Object.entries(item.userCounts).map(([user, count]) => (
                            <span key={user} className="inline-block mr-3">
                              <span className="font-medium">{user}:</span> {count}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Summary by User */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-green-500" />
                <h2 className="text-lg font-semibold text-gray-900">Summary by User</h2>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Total</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">By Activity</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {activityLoading ? (
                    <tr><td colSpan={3} className="px-4 py-12 text-center">
                      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    </td></tr>
                  ) : userSummary.length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-12 text-center text-gray-500">No records found</td></tr>
                  ) : (
                    userSummary.map(item => (
                      <tr key={item.user} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{item.user}</td>
                        <td className="px-4 py-3 text-sm font-semibold text-gray-900">{item.total}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {Object.entries(item.actionCounts).map(([action, count]) => (
                            <span key={action} className="inline-block mr-3">
                              <span className="font-medium">{ACTION_LABELS[action] || action}:</span> {count}
                            </span>
                          ))}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detailed Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">Detailed Records</h2>
              <p className="text-sm text-gray-500">{activityLogs.length} records</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Timestamp</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Activity</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Description</th>
                    {reportType === 'audit' && (
                      <>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Old Values</th>
                        <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">New Values</th>
                      </>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {activityLoading ? (
                    <tr><td colSpan={reportType === 'audit' ? 6 : 4} className="px-4 py-12 text-center">
                      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" />
                    </td></tr>
                  ) : activityLogs.length === 0 ? (
                    <tr><td colSpan={reportType === 'audit' ? 6 : 4} className="px-4 py-12 text-center text-gray-500">
                      No records found
                    </td></tr>
                  ) : (
                    activityLogs.slice(0, 100).map(log => (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{formatDate(log.created_at)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{log.user_name || 'System'}</td>
                        <td className="px-4 py-3">{getActionBadge(log.action_type)}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={log.action_description}>
                          {log.action_description}
                        </td>
                        {reportType === 'audit' && (
                          <>
                            <td className="px-4 py-3 text-xs text-gray-600 max-w-xs">
                              {log.old_values ? (
                                <pre className="bg-red-50 rounded p-2 overflow-x-auto text-xs">{JSON.stringify(log.old_values, null, 1)}</pre>
                              ) : <span className="text-gray-400">—</span>}
                            </td>
                            <td className="px-4 py-3 text-xs text-gray-600 max-w-xs">
                              {log.new_values ? (
                                <pre className="bg-green-50 rounded p-2 overflow-x-auto text-xs">{JSON.stringify(log.new_values, null, 1)}</pre>
                              ) : <span className="text-gray-400">—</span>}
                            </td>
                          </>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
