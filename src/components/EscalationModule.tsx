import React, { useState, useEffect } from 'react';
import { 
  Search, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  AlertTriangle,
  FileText,
  MessageCircle,
  Download,
  CheckSquare,
  Square,
  X
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Host } from '@/types';
import { useAuth } from '@/context/AuthContext';
import ActivityLogger from '@/lib/activityLogger';

export default function EscalationModule() {
  const { user } = useAuth();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportContent, setReportContent] = useState('');
  const [whatsappSent, setWhatsappSent] = useState(false);

  // Calculate days since registration
  const calculateDays = (regDate: string): number => {
    if (!regDate) return 0;
    const reg = new Date(regDate);
    const now = new Date();
    const diff = now.getTime() - reg.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  const fetchOverdueHosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hosts')
        .select('*')
        .eq('estado', 'Pending')
        .eq('escalado', false)
        .order('reg_date', { ascending: true });

      if (error) throw error;

      // Filter to only include hosts pending > 3 days
      const overdueHosts = (data || []).filter(h => calculateDays(h.reg_date) > 3);
      setHosts(overdueHosts);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverdueHosts();
  }, []);

  // Filter and paginate
  const filteredHosts = hosts.filter(host => {
    const searchLower = search.toLowerCase();
    return (
      host.host_name?.toLowerCase().includes(searchLower) ||
      host.host_id?.toLowerCase().includes(searchLower) ||
      host.reclutador?.toLowerCase().includes(searchLower)
    );
  });

  const totalPages = Math.ceil(filteredHosts.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedHosts = filteredHosts.slice(startIndex, startIndex + rowsPerPage);

  // Selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === paginatedHosts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedHosts.map(h => h.id)));
    }
  };

  const handleSelectRow = (id: string) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  // Generate report content
  const generateReportContent = () => {
    const selectedHosts = hosts.filter(h => selectedIds.has(h.id));
    const now = new Date().toLocaleString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });

    let content = `ESCALATION REPORT\n`;
    content += `Generated: ${now}\n`;
    content += `Total Accounts: ${selectedHosts.length}\n`;
    content += `${'='.repeat(50)}\n\n`;

    content += `ID LIST:\n`;
    selectedHosts.forEach((host, index) => {
      content += `${index + 1}. ${host.host_id} - ${host.host_name}\n`;
    });

    return content;
  };

  // Generate and show report
  const handleGenerateReport = () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one account to generate report');
      return;
    }
    const content = generateReportContent();
    setReportContent(content);
    setWhatsappSent(false);
    setShowReportModal(true);
  };

  // Send via WhatsApp — does NOT mark as escalated yet
  const handleShareWhatsApp = () => {
    const message = encodeURIComponent(reportContent);
    window.open(`https://wa.me/?text=${message}`, '_blank');
    setWhatsappSent(true);
  };

  // Download as TXT — does NOT mark as escalated
  const handleDownloadTxt = () => {
    const blob = new Blob([reportContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `escalation_report_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Download as PDF — does NOT mark as escalated
  const handleDownloadPdf = () => {
    const printWindow = window.open('', '_blank');
    if (printWindow) {
      const selectedHosts = hosts.filter(h => selectedIds.has(h.id));
      const now = new Date().toLocaleString();
      
      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Escalation Report</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .meta { color: #666; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th, td { border: 1px solid #ddd; padding: 10px; text-align: left; }
            th { background-color: #f5f5f5; }
            .status { padding: 4px 8px; border-radius: 4px; font-size: 12px; }
            .pending { background-color: #fef3c7; color: #92400e; }
          </style>
        </head>
        <body>
          <h1>Escalation Report</h1>
          <div class="meta">
            <p>Generated: ${now}</p>
            <p>Total Accounts: ${selectedHosts.length}</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Host ID</th>
                <th>Host Name</th>
              </tr>
            </thead>
            <tbody>
              ${selectedHosts.map((host, index) => `
                <tr>
                  <td>${index + 1}</td>
                  <td>${host.host_id}</td>
                  <td>${host.host_name}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </body>
        </html>
      `);
      printWindow.document.close();
      printWindow.print();
    }
  };

  // Mark selected as escalated — after WhatsApp has been sent
  const handleMarkEscalated = async () => {
    setGenerating(true);
    try {
      const { error } = await supabase
        .from('hosts')
        .update({ escalado: true, updated_at: new Date().toISOString() })
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      await ActivityLogger.escalation(user, Array.from(selectedIds), 'WhatsApp');

      setShowReportModal(false);
      setSelectedIds(new Set());
      setWhatsappSent(false);
      fetchOverdueHosts();
    } catch (error) {
      console.error('Escalation error:', error);
      alert('Failed to mark as escalated');
    } finally {
      setGenerating(false);
    }
  };

  const isAllSelected = paginatedHosts.length > 0 && selectedIds.size === paginatedHosts.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Escalation Module</h1>
          <p className="text-gray-500 mt-1">Manage accounts pending verification for more than 3 days</p>
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <button
              onClick={handleGenerateReport}
              className="px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Generate Report ({selectedIds.size})
            </button>
          )}
          <button
            onClick={fetchOverdueHosts}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-orange-200">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-100 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <p className="text-2xl font-bold text-orange-600">{hosts.length}</p>
              <p className="text-sm text-orange-600">Overdue Accounts</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-blue-200">
          <p className="text-2xl font-bold text-blue-600">{selectedIds.size}</p>
          <p className="text-sm text-blue-600">Selected</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-200">
          <p className="text-2xl font-bold text-gray-600">
            {hosts.length > 0 ? Math.max(...hosts.map(h => calculateDays(h.reg_date))) : 0}
          </p>
          <p className="text-sm text-gray-500">Max Days Pending</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        {/* Search */}
        <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
              placeholder="Search by name, ID, or recruiter..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-500">Rows:</span>
            <select
              value={rowsPerPage}
              onChange={(e) => { setRowsPerPage(Number(e.target.value)); setCurrentPage(1); }}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
            </select>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : hosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <AlertTriangle className="w-12 h-12 text-green-500 mb-4" />
            <p className="text-lg font-medium">No overdue accounts!</p>
            <p className="text-sm">All pending accounts are within the 3-day window.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 w-12">
                    <button
                      onClick={handleSelectAll}
                      className="p-1 hover:bg-gray-200 rounded transition-colors"
                    >
                      {isAllSelected ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5 text-gray-400" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Host Name</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Host ID</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Days Pending</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Recruiter</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Reg Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {paginatedHosts.map((host) => {
                  const days = calculateDays(host.reg_date);
                  return (
                    <tr 
                      key={host.id} 
                      className={`hover:bg-gray-50 transition-colors ${selectedIds.has(host.id) ? 'bg-orange-50' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <button
                          onClick={() => handleSelectRow(host.id)}
                          className="p-1 hover:bg-gray-200 rounded transition-colors"
                        >
                          {selectedIds.has(host.id) ? (
                            <CheckSquare className="w-5 h-5 text-blue-600" />
                          ) : (
                            <Square className="w-5 h-5 text-gray-400" />
                          )}
                        </button>
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{host.host_name}</td>
                      <td className="px-4 py-3 text-sm font-mono text-gray-600">{host.host_id}</td>
                      <td className="px-4 py-3">
                        <span className="px-2.5 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700">
                          {host.estado}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                          days > 7 ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {days} days
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{host.reclutador}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {new Date(host.reg_date).toLocaleDateString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {hosts.length > 0 && (
          <div className="px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-sm text-gray-500">
              Showing {startIndex + 1} to {Math.min(startIndex + rowsPerPage, filteredHosts.length)} of {filteredHosts.length} entries
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600">
                Page {currentPage} of {totalPages || 1}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage >= totalPages}
                className="p-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Report Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Escalation Report</h3>
              <button
                onClick={() => setShowReportModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="p-4 max-h-[40vh] overflow-y-auto">
              <pre className="whitespace-pre-wrap text-sm text-gray-700 bg-gray-50 p-4 rounded-lg font-mono">
                {reportContent}
              </pre>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50">
              <p className="text-sm text-gray-600 mb-4">
                {whatsappSent
                  ? 'WhatsApp sent. Now mark these accounts as escalated to remove them from the overdue list.'
                  : 'Send this report via WhatsApp or download it. After sending, you can mark the accounts as escalated.'}
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleShareWhatsApp}
                  className="flex-1 min-w-[140px] px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors flex items-center justify-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" />
                  {whatsappSent ? 'Resend WhatsApp' : 'Send via WhatsApp'}
                </button>
                <button
                  onClick={handleDownloadTxt}
                  className="flex-1 min-w-[140px] px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center justify-center gap-2"
                >
                  <Download className="w-4 h-4" />
                  Download TXT
                </button>
                <button
                  onClick={handleDownloadPdf}
                  className="flex-1 min-w-[140px] px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                >
                  <FileText className="w-4 h-4" />
                  Download PDF
                </button>
              </div>
              {whatsappSent && (
                <button
                  onClick={handleMarkEscalated}
                  disabled={generating}
                  className="w-full mt-3 px-4 py-3 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 font-semibold"
                >
                  {generating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Marking...
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-4 h-4" />
                      Mark as Escalated ({selectedIds.size})
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
