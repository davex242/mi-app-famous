import React, { useState, useEffect } from 'react';
import {
  History,
  RefreshCw,
  Search,
  Filter,
  ChevronDown,
  ChevronUp,
  User,
  Calendar,
  FileText,
  Plus,
  Edit,
  Trash2,
  LogIn,
  LogOut,
  DollarSign,
  Upload,
  Download,
  AlertTriangle,
  Eye,
  X,
  KeyRound
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { ActivityLog } from '@/types';
import Modal from './ui/Modal';


interface AuditTrailProps {
  hostId?: string; // Optional: filter by specific host
}

export default function AuditTrail({ hostId }: AuditTrailProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());

  const fetchLogs = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false });

      if (hostId) {
        query = query.eq('entity_id', hostId);
      }

      if (actionFilter !== 'all') {
        query = query.eq('action_type', actionFilter);
      }

      if (dateFrom) {
        query = query.gte('created_at', dateFrom);
      }

      if (dateTo) {
        query = query.lte('created_at', dateTo + 'T23:59:59');
      }

      const { data, error } = await query.limit(200);

      if (error) throw error;
      setLogs(data || []);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [hostId, actionFilter, dateFrom, dateTo]);

  const filteredLogs = logs.filter(log => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      log.action_description?.toLowerCase().includes(query) ||
      log.user_name?.toLowerCase().includes(query) ||
      log.user_email?.toLowerCase().includes(query) ||
      log.entity_id?.toLowerCase().includes(query)
    );
  });

  const getActionIcon = (actionType: string) => {
    switch (actionType) {
      case 'login': return <LogIn className="w-4 h-4 text-green-500" />;
      case 'logout': return <LogOut className="w-4 h-4 text-gray-500" />;
      case 'create': return <Plus className="w-4 h-4 text-blue-500" />;
      case 'update': return <Edit className="w-4 h-4 text-amber-500" />;
      case 'delete': return <Trash2 className="w-4 h-4 text-red-500" />;
      case 'commission_payment': return <DollarSign className="w-4 h-4 text-emerald-500" />;
      case 'import': return <Upload className="w-4 h-4 text-purple-500" />;
      case 'export': return <Download className="w-4 h-4 text-indigo-500" />;
      case 'escalation': return <AlertTriangle className="w-4 h-4 text-orange-500" />;
      case 'password_reset': return <KeyRound className="w-4 h-4 text-cyan-500" />;
      case 'bulk_verification': return <FileText className="w-4 h-4 text-teal-500" />;
      case 'commission_settings_update': return <DollarSign className="w-4 h-4 text-violet-500" />;
      default: return <FileText className="w-4 h-4 text-gray-500" />;
    }
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
        {actionType.replace(/_/g, ' ')}
      </span>
    );
  };




  const toggleExpand = (logId: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(logId)) {
      newExpanded.delete(logId);
    } else {
      newExpanded.add(logId);
    }
    setExpandedLogs(newExpanded);
  };

  const renderChanges = (oldValues: Record<string, any> | null, newValues: Record<string, any> | null) => {
    if (!oldValues && !newValues) return null;

    const allKeys = new Set([
      ...Object.keys(oldValues || {}),
      ...Object.keys(newValues || {})
    ]);

    const changes: { field: string; oldVal: any; newVal: any }[] = [];
    
    allKeys.forEach(key => {
      const oldVal = oldValues?.[key];
      const newVal = newValues?.[key];
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ field: key, oldVal, newVal });
      }
    });

    if (changes.length === 0) return null;

    return (
      <div className="mt-3 space-y-2">
        <p className="text-xs font-semibold text-gray-500 uppercase">Changes Made:</p>
        <div className="bg-gray-50 rounded-lg p-3 space-y-2">
          {changes.map(({ field, oldVal, newVal }) => (
            <div key={field} className="text-sm">
              <span className="font-medium text-gray-700">{field}:</span>
              <div className="flex items-center gap-2 mt-1 ml-4">
                {oldVal !== undefined && (
                  <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded text-xs line-through">
                    {typeof oldVal === 'object' ? JSON.stringify(oldVal) : String(oldVal || 'empty')}
                  </span>
                )}
                <span className="text-gray-400">→</span>
                {newVal !== undefined && (
                  <span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">
                    {typeof newVal === 'object' ? JSON.stringify(newVal) : String(newVal || 'empty')}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
          <p className="text-gray-500 mt-1">Track all changes made to host records</p>
        </div>
        <button
          onClick={fetchLogs}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by description, user, or entity..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Actions</option>
              <option value="create">Create</option>
              <option value="update">Update</option>
              <option value="delete">Delete</option>
              <option value="login">Login</option>
              <option value="logout">Logout</option>
              <option value="commission_payment">Commission</option>
              <option value="import">Import</option>
              <option value="export">Export</option>
              <option value="escalation">Escalation</option>
              <option value="password_reset">Password Reset</option>
              <option value="bulk_verification">Bulk Verification</option>
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="From"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="To"
            />
            {(dateFrom || dateTo || actionFilter !== 'all') && (
              <button
                onClick={() => { setDateFrom(''); setDateTo(''); setActionFilter('all'); }}
                className="px-3 py-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg flex items-center gap-1"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            )}
          </div>
        </div>
      </div>


      {/* Activity Timeline */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <History className="w-5 h-5 text-blue-500" />
              <h3 className="text-lg font-semibold text-gray-900">Activity Log</h3>
            </div>
            <span className="text-sm text-gray-500">{filteredLogs.length} entries</span>
          </div>
        </div>

        <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
          {loading ? (
            <div className="p-12 text-center">
              <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
              <p className="text-gray-500 mt-2">Loading activity logs...</p>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="p-12 text-center">
              <History className="w-12 h-12 text-gray-300 mx-auto" />
              <p className="text-gray-500 mt-2">No activity logs found</p>
            </div>
          ) : (
            filteredLogs.map((log) => {
              const isExpanded = expandedLogs.has(log.id);
              const hasDetails = log.old_values || log.new_values;

              return (
                <div key={log.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start gap-4">
                    <div className="mt-1">{getActionIcon(log.action_type)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {log.action_description}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <User className="w-3 h-3" />
                              {log.user_name}
                            </div>
                            <div className="flex items-center gap-1 text-xs text-gray-500">
                              <Calendar className="w-3 h-3" />
                              {new Date(log.created_at).toLocaleString()}
                            </div>
                            {log.entity_type && (
                              <span className="text-xs text-gray-400">
                                {log.entity_type}: {log.entity_id?.substring(0, 8)}...
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {getActionBadge(log.action_type)}
                          {hasDetails && (
                            <button
                              onClick={() => toggleExpand(log.id)}
                              className="p-1 hover:bg-gray-200 rounded"
                            >
                              {isExpanded ? (
                                <ChevronUp className="w-4 h-4 text-gray-500" />
                              ) : (
                                <ChevronDown className="w-4 h-4 text-gray-500" />
                              )}
                            </button>
                          )}
                          <button
                            onClick={() => setSelectedLog(log)}
                            className="p-1 hover:bg-gray-200 rounded"
                            title="View Details"
                          >
                            <Eye className="w-4 h-4 text-gray-500" />
                          </button>
                        </div>
                      </div>
                      {isExpanded && hasDetails && (
                        renderChanges(log.old_values, log.new_values)
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Detail Modal */}
      <Modal
        isOpen={selectedLog !== null}
        onClose={() => setSelectedLog(null)}
        title="Activity Details"
        size="lg"
      >
        {selectedLog && (
          <div className="space-y-6">
            <div className="flex items-center gap-3">
              {getActionIcon(selectedLog.action_type)}
              <div>
                <h3 className="font-semibold text-gray-900">{selectedLog.action_description}</h3>
                {getActionBadge(selectedLog.action_type)}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">User</p>
                <p className="font-medium text-gray-900">{selectedLog.user_name}</p>
                <p className="text-sm text-gray-500">{selectedLog.user_email}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Timestamp</p>
                <p className="font-medium text-gray-900">
                  {new Date(selectedLog.created_at).toLocaleDateString()}
                </p>
                <p className="text-sm text-gray-500">
                  {new Date(selectedLog.created_at).toLocaleTimeString()}
                </p>
              </div>
            </div>

            {selectedLog.entity_type && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Entity</p>
                <p className="text-sm">
                  <span className="font-medium">Type:</span> {selectedLog.entity_type}
                </p>
                <p className="text-sm">
                  <span className="font-medium">ID:</span> {selectedLog.entity_id}
                </p>
              </div>
            )}

            {selectedLog.old_values && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Previous Values</p>
                <pre className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm overflow-x-auto">
                  {JSON.stringify(selectedLog.old_values, null, 2)}
                </pre>
              </div>
            )}

            {selectedLog.new_values && (
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">New Values</p>
                <pre className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm overflow-x-auto">
                  {JSON.stringify(selectedLog.new_values, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
