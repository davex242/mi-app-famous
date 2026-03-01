import React, { useState, useEffect } from 'react';
import { 
  Search, 
  RefreshCw, 
  ChevronLeft, 
  ChevronRight,
  CheckCircle,
  XCircle,
  Image,
  ZoomIn,
  X,
  ExternalLink,
  Filter,
  ListChecks,
  FileText,
  AlertTriangle,
  Check,
  Loader2,
  Wand2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Host } from '@/types';
import { useAuth } from '@/context/AuthContext';
import ActivityLogger from '@/lib/activityLogger';

type TabType = 'review' | 'bulk-verify';

interface BulkVerifyResult {
  success: string[];
  notFound: string[];
  alreadyVerified: string[];
}

export default function AccountVerification() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('review');
  
  // Review tab state
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  const [updating, setUpdating] = useState<string | null>(null);
  
  // Filters
  const [showFilters, setShowFilters] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'verified' | 'pending' | 'rejected'>('verified');
  const [filterReal, setFilterReal] = useState<'all' | 'real' | 'not_real'>('all');

  // Image preview
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');

  // Bulk verify state
  const [bulkIds, setBulkIds] = useState('');
  const [bulkValidationError, setBulkValidationError] = useState<string | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkResult, setBulkResult] = useState<BulkVerifyResult | null>(null);

  const fetchHosts = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('hosts')
        .select('*')
        .order('created_at', { ascending: false });

      // Apply status filter
      if (filterStatus !== 'all') {
        const statusMap = { verified: 'Verified', pending: 'Pending', rejected: 'Rejected' };
        query = query.eq('estado', statusMap[filterStatus]);
      }

      // Apply real filter
      if (filterReal === 'real') {
        query = query.eq('real', true);
      } else if (filterReal === 'not_real') {
        query = query.eq('real', false);
      }

      const { data, error } = await query;

      if (error) throw error;
      setHosts(data || []);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHosts();
  }, [filterStatus, filterReal]);

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

  const handleToggleReal = async (host: Host) => {
    setUpdating(host.id);
    try {
      const newRealValue = !host.real;
      const { error } = await supabase
        .from('hosts')
        .update({ real: newRealValue, updated_at: new Date().toISOString() })
        .eq('id', host.id);

      if (error) throw error;

      // Log the action
      await ActivityLogger.markAsReal(user, host.host_name, host.id, newRealValue);

      // Update local state
      setHosts(prev => prev.map(h => 
        h.id === host.id ? { ...h, real: newRealValue } : h
      ));
    } catch (error) {
      console.error('Update error:', error);
      alert('Failed to update record');
    } finally {
      setUpdating(null);
    }
  };

  const openImagePreview = (imageUrl: string, title: string) => {
    if (imageUrl) {
      setPreviewImage(imageUrl);
      setPreviewTitle(title);
    }
  };

  const closeImagePreview = () => {
    setPreviewImage(null);
    setPreviewTitle('');
  };

  const renderThumbnail = (imageUrl: string | undefined, title: string, hostName: string) => {
    if (!imageUrl) {
      return (
        <div className="w-16 h-16 bg-gray-100 rounded-lg flex items-center justify-center">
          <Image className="w-6 h-6 text-gray-400" />
        </div>
      );
    }
    
    return (
      <button
        onClick={() => openImagePreview(imageUrl, `${hostName} - ${title}`)}
        className="relative group w-16 h-16 rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors"
        title={`Click to preview ${title}`}
      >
        <img
          src={imageUrl}
          alt={title}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <ZoomIn className="w-5 h-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>
    );
  };

  // ===== BULK VERIFY FUNCTIONS =====

  // Parse IDs from any format: commas, newlines, spaces, tabs, semicolons, or any combination
  const parseIds = (input: string): string[] => {
    if (!input.trim()) return [];
    
    // Split by any common delimiter: comma, newline, tab, semicolon, pipe, or multiple spaces
    const ids = input
      .split(/[,\n\r\t;|]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0);

    // Remove duplicates while preserving order
    return [...new Set(ids)];
  };

  const validateBulkIds = (input: string): { valid: boolean; ids: string[]; error: string | null; duplicatesRemoved: number } => {
    if (!input.trim()) {
      return { valid: false, ids: [], error: 'Por favor ingresa al menos un ID', duplicatesRemoved: 0 };
    }

    // Split by any common delimiter
    const rawIds = input
      .split(/[,\n\r\t;|]+/)
      .map(id => id.trim())
      .filter(id => id.length > 0);

    if (rawIds.length === 0) {
      return { valid: false, ids: [], error: 'No se detectaron IDs válidos. Ingresa los IDs en cualquier formato (separados por comas, líneas, espacios, etc.)', duplicatesRemoved: 0 };
    }

    // Check for and remove duplicates
    const uniqueIds = [...new Set(rawIds)];
    const duplicatesRemoved = rawIds.length - uniqueIds.length;

    return { valid: true, ids: uniqueIds, error: null, duplicatesRemoved };
  };

  const handleBulkIdsChange = (value: string) => {
    setBulkIds(value);
    setBulkValidationError(null);
    setBulkResult(null);
  };

  // Format the list to comma-separated
  const handleFormatList = () => {
    const ids = parseIds(bulkIds);
    if (ids.length > 0) {
      setBulkIds(ids.join(', '));
      setBulkValidationError(null);
    }
  };

  const handleBulkVerify = async () => {
    const validation = validateBulkIds(bulkIds);
    
    if (!validation.valid) {
      setBulkValidationError(validation.error);
      return;
    }

    setBulkProcessing(true);
    setBulkValidationError(null);
    setBulkResult(null);

    try {
      const idsToVerify = validation.ids;
      const currentDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format

      // Process IDs in batches to handle large lists
      // Supabase .in() has a practical limit, so we batch in groups of 100
      const batchSize = 100;
      let allExistingHosts: any[] = [];

      for (let i = 0; i < idsToVerify.length; i += batchSize) {
        const batch = idsToVerify.slice(i, i + batchSize);
        const { data: batchHosts, error: fetchError } = await supabase
          .from('hosts')
          .select('id, host_id, host_name, estado, ver_date')
          .in('host_id', batch);

        if (fetchError) throw fetchError;
        if (batchHosts) {
          allExistingHosts = [...allExistingHosts, ...batchHosts];
        }
      }

      // Categorize the IDs
      const foundIds = new Set(allExistingHosts.map(h => h.host_id));
      const notFoundIds = idsToVerify.filter(id => !foundIds.has(id));
      const alreadyVerifiedIds = allExistingHosts
        .filter(h => h.estado === 'Verified')
        .map(h => h.host_id);
      const toUpdateIds = allExistingHosts
        .filter(h => h.estado !== 'Verified')
        .map(h => h.host_id);

      // Update ONLY the hosts from the provided list that need verification
      if (toUpdateIds.length > 0) {
        // Update in batches as well
        for (let i = 0; i < toUpdateIds.length; i += batchSize) {
          const batch = toUpdateIds.slice(i, i + batchSize);
          const { error: updateError } = await supabase
            .from('hosts')
            .update({ 
              estado: 'Verified', 
              ver_date: currentDate,
              updated_at: new Date().toISOString()
            })
            .in('host_id', batch);

          if (updateError) throw updateError;
        }

        // Log the bulk verification action
        await ActivityLogger.bulkVerification(
          user, 
          toUpdateIds.length, 
          notFoundIds.length, 
          alreadyVerifiedIds.length,
          [...toUpdateIds, ...alreadyVerifiedIds]
        );
      }

      // Set the results
      setBulkResult({
        success: toUpdateIds,
        notFound: notFoundIds,
        alreadyVerified: alreadyVerifiedIds
      });

      // Refresh the hosts list
      fetchHosts();

    } catch (error) {
      console.error('Bulk verify error:', error);
      setBulkValidationError('Ocurrió un error al procesar. Por favor intenta de nuevo.');
    } finally {
      setBulkProcessing(false);
    }
  };

  const clearBulkForm = () => {
    setBulkIds('');
    setBulkValidationError(null);
    setBulkResult(null);
  };

  // Get detected IDs count for display
  const detectedIds = parseIds(bulkIds);
  const rawIdsCount = bulkIds.trim() ? bulkIds.split(/[,\n\r\t;|]+/).map(id => id.trim()).filter(id => id.length > 0).length : 0;
  const duplicatesCount = rawIdsCount - detectedIds.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Account Verification</h1>
          <p className="text-gray-500 mt-1">Review and verify host accounts</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('review')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'review'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <FileText className="w-4 h-4" />
              Review Accounts
            </button>
            <button
              onClick={() => setActiveTab('bulk-verify')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                activeTab === 'bulk-verify'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <ListChecks className="w-4 h-4" />
              Bulk Verify by ID
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {activeTab === 'review' && (
            <div className="space-y-6">
              {/* Review Tab Controls */}
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setShowFilters(!showFilters)}
                    className={`px-4 py-2 border rounded-lg transition-colors flex items-center gap-2 ${
                      showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Filter className="w-4 h-4" />
                    Filters
                  </button>
                  <button
                    onClick={fetchHosts}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>
              </div>

              {/* Filters */}
              {showFilters && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Account Status</label>
                      <select
                        value={filterStatus}
                        onChange={(e) => { setFilterStatus(e.target.value as any); setCurrentPage(1); }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">All Statuses</option>
                        <option value="verified">Verified</option>
                        <option value="pending">Pending</option>
                        <option value="rejected">Rejected</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Real Status</label>
                      <select
                        value={filterReal}
                        onChange={(e) => { setFilterReal(e.target.value as any); setCurrentPage(1); }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="all">All</option>
                        <option value="real">Marked as Real</option>
                        <option value="not_real">Not Verified</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-gray-900">{hosts.length}</p>
                  <p className="text-sm text-gray-500">Total Accounts</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-green-600">{hosts.filter(h => h.real).length}</p>
                  <p className="text-sm text-green-600">Verified Real</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-yellow-600">{hosts.filter(h => !h.real && h.estado === 'Verified').length}</p>
                  <p className="text-sm text-yellow-600">Pending Review</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-2xl font-bold text-gray-600">{hosts.filter(h => !h.real).length}</p>
                  <p className="text-sm text-gray-500">Not Verified</p>
                </div>
              </div>

              {/* Table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Search */}
                <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 items-center justify-between bg-gray-50">
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
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Host Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Host ID</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Captura</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Capture 1</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Capture 2</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Capture 3</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Real</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {paginatedHosts.length === 0 ? (
                          <tr>
                            <td colSpan={8} className="px-4 py-12 text-center text-gray-500">
                              No accounts found
                            </td>
                          </tr>
                        ) : (
                          paginatedHosts.map((host) => (
                            <tr key={host.id} className={`hover:bg-gray-50 transition-colors ${host.real ? 'bg-green-50/50' : ''}`}>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-900">{host.host_name}</span>
                                  {host.real && host.estado === 'Verified' && (
                                    <CheckCircle className="w-4 h-4 text-green-500" />
                                  )}
                                </div>
                                <p className="text-xs text-gray-500">by {host.reclutador}</p>
                              </td>
                              <td className="px-4 py-3 text-sm font-mono text-gray-600">{host.host_id}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2.5 py-1 text-xs font-medium rounded-full ${
                                  host.estado === 'Verified' ? 'bg-green-100 text-green-700' :
                                  host.estado === 'Pending' ? 'bg-yellow-100 text-yellow-700' :
                                  'bg-red-100 text-red-700'
                                }`}>
                                  {host.estado}
                                </span>
                              </td>
                              <td className="px-4 py-3">
                                {renderThumbnail(host.captura, 'Captura', host.host_name)}
                              </td>
                              <td className="px-4 py-3">
                                {renderThumbnail(host.capture1, 'Capture 1', host.host_name)}
                              </td>
                              <td className="px-4 py-3">
                                {renderThumbnail(host.capture2, 'Capture 2', host.host_name)}
                              </td>
                              <td className="px-4 py-3">
                                {renderThumbnail(host.capture3, 'Capture 3', host.host_name)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <button
                                  onClick={() => handleToggleReal(host)}
                                  disabled={updating === host.id}
                                  className={`p-2 rounded-lg transition-colors ${
                                    host.real 
                                      ? 'bg-green-100 text-green-700 hover:bg-green-200' 
                                      : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                                  } ${updating === host.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                  title={host.real ? 'Marked as Real - Click to unmark' : 'Click to mark as Real'}
                                >
                                  {updating === host.id ? (
                                    <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  ) : host.real ? (
                                    <CheckCircle className="w-5 h-5" />
                                  ) : (
                                    <XCircle className="w-5 h-5" />
                                  )}
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Pagination */}
                <div className="px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4 bg-gray-50">
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
              </div>
            </div>
          )}

          {activeTab === 'bulk-verify' && (
            <div className="space-y-6">
              {/* Instructions */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-2">Instrucciones de Verificación Masiva</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• Pega o escribe los Host IDs en cualquier formato: uno por línea, separados por comas, espacios, tabulaciones, etc.</li>
                  <li>• El sistema detectará automáticamente los IDs sin importar el formato</li>
                  <li>• Los IDs duplicados serán removidos automáticamente</li>
                  <li>• El sistema actualizará el estado a "Verified" y establecerá la fecha de verificación de hoy</li>
                  <li>• <strong>Solo se actualizarán los IDs proporcionados</strong> — ningún otro registro será modificado</li>
                  <li>• Los IDs que no se encuentren en el sistema se listarán por separado</li>
                </ul>
              </div>

              {/* Input Form */}
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Ingresa los Host IDs
                    </label>
                    {bulkIds.trim() && (
                      <button
                        type="button"
                        onClick={handleFormatList}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                        title="Convertir la lista a formato separado por comas"
                      >
                        <Wand2 className="w-3.5 h-3.5" />
                        Formatear como lista con comas
                      </button>
                    )}
                  </div>
                  <textarea
                    value={bulkIds}
                    onChange={(e) => handleBulkIdsChange(e.target.value)}
                    placeholder={"Pega los IDs en cualquier formato, por ejemplo:\n\nABC123\nDEF456\nGHI789\n\no: ABC123, DEF456, GHI789\n\no: ABC123 DEF456 GHI789"}
                    className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 min-h-[160px] font-mono text-sm ${
                      bulkValidationError ? 'border-red-300 bg-red-50' : 'border-gray-300'
                    }`}
                    disabled={bulkProcessing}
                  />
                  {bulkValidationError && (
                    <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" />
                      {bulkValidationError}
                    </p>
                  )}
                  {bulkIds.trim() && !bulkValidationError && (
                    <div className="mt-2 flex items-center gap-3">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium text-gray-900">{detectedIds.length}</span> ID(s) detectado(s)
                      </p>
                      {duplicatesCount > 0 && (
                        <p className="text-sm text-amber-600">
                          <span className="font-medium">{duplicatesCount}</span> duplicado(s) serán removido(s)
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleBulkVerify}
                    disabled={bulkProcessing || !bulkIds.trim()}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {bulkProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Procesando...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        Verificar IDs
                      </>
                    )}
                  </button>
                  <button
                    onClick={clearBulkForm}
                    disabled={bulkProcessing}
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              {/* Results */}
              {bulkResult && (
                <div className="space-y-4">
                  <h3 className="font-semibold text-gray-900 text-lg">Resultados de Verificación</h3>
                  
                  {/* Success */}
                  {bulkResult.success.length > 0 && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Check className="w-5 h-5 text-green-600" />
                        <h4 className="font-semibold text-green-800">
                          Verificados Exitosamente ({bulkResult.success.length})
                        </h4>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {bulkResult.success.map(id => (
                          <span key={id} className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-mono">
                            {id}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Already Verified */}
                  {bulkResult.alreadyVerified.length > 0 && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                        <h4 className="font-semibold text-blue-800">
                          Ya Verificados ({bulkResult.alreadyVerified.length})
                        </h4>
                      </div>
                      <p className="text-sm text-blue-700 mb-3">
                        Estos IDs ya estaban verificados y no necesitaron actualización:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {bulkResult.alreadyVerified.map(id => (
                          <span key={id} className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-mono">
                            {id}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Not Found */}
                  {bulkResult.notFound.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                        <h4 className="font-semibold text-amber-800">
                          No Encontrados ({bulkResult.notFound.length})
                        </h4>
                      </div>
                      <p className="text-sm text-amber-700 mb-3">
                        Los siguientes IDs no fueron encontrados en el sistema. Por favor verifica que estos IDs estén registrados:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {bulkResult.notFound.map(id => (
                          <span key={id} className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-mono">
                            {id}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Summary */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-800 mb-3">Resumen</h4>
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-green-600">{bulkResult.success.length}</p>
                        <p className="text-sm text-gray-500">Nuevos Verificados</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-blue-600">{bulkResult.alreadyVerified.length}</p>
                        <p className="text-sm text-gray-500">Ya Verificados</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-amber-600">{bulkResult.notFound.length}</p>
                        <p className="text-sm text-gray-500">No Encontrados</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Image Preview Modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={closeImagePreview}
        >
          <div 
            className="relative max-w-4xl max-h-[90vh] w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={closeImagePreview}
              className="absolute -top-12 right-0 p-2 text-white hover:text-gray-300 transition-colors"
            >
              <X className="w-8 h-8" />
            </button>
            
            <div className="absolute -top-12 left-0 text-white text-lg font-medium">
              {previewTitle}
            </div>

            <div className="bg-white rounded-xl overflow-hidden shadow-2xl">
              <img
                src={previewImage}
                alt={previewTitle}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            </div>

            <div className="mt-4 flex justify-center">
              <a
                href={previewImage}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition-colors"
              >
                <ExternalLink className="w-4 h-4" />
                Open in new tab
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
