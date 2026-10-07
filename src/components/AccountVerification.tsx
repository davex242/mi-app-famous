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
  Wand2,
  Download,
  PlusCircle
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
  totalValidIds: number;
  duplicatesRemoved: number;
  invalidTokens: string[];
  verificationDate: string;
}

// ===== SHARED ID PARSING / NORMALIZATION =====
// Splits by any combination of: whitespace (spaces, newlines, tabs, CR), commas, semicolons, pipes.
// Validates that tokens are numeric. Removes duplicates preserving first-occurrence order.
interface ParsedIds {
  validIds: string[];
  duplicatesRemoved: number;
  invalidTokens: string[];
}

const parseAndNormalizeIds = (input: string): ParsedIds => {
  if (!input.trim()) {
    return { validIds: [], duplicatesRemoved: 0, invalidTokens: [] };
  }

  const tokens = input
    .split(/[\s,;|]+/)
    .map(t => t.trim())
    .filter(t => t.length > 0);

  const validIds: string[] = [];
  const invalidTokens: string[] = [];
  const seenValid = new Set<string>();
  const seenInvalid = new Set<string>();
  let duplicatesRemoved = 0;

  for (const token of tokens) {
    if (!/^\d+$/.test(token)) {
      // Non-numeric token — report as invalid (dedupe for display)
      if (!seenInvalid.has(token)) {
        seenInvalid.add(token);
        invalidTokens.push(token);
      }
      continue;
    }
    if (seenValid.has(token)) {
      duplicatesRemoved++;
      continue;
    }
    seenValid.add(token);
    validIds.push(token);
  }

  return { validIds, duplicatesRemoved, invalidTokens };
};

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
  const [creatingMissing, setCreatingMissing] = useState(false);
  const [createMissingResult, setCreateMissingResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);

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

  const handleBulkIdsChange = (value: string) => {
    setBulkIds(value);
    setBulkValidationError(null);
    setBulkResult(null);
    setCreateMissingResult(null);
  };

  // Format the list to comma-separated
  const handleFormatList = () => {
    const { validIds, invalidTokens } = parseAndNormalizeIds(bulkIds);
    if (validIds.length === 0 && invalidTokens.length === 0) return;
    const allTokens = [...validIds, ...invalidTokens];
    if (allTokens.length > 0) {
      setBulkIds(allTokens.join(', '));
      setBulkValidationError(null);
    }
  };

  const handleBulkVerify = async () => {
    const parsed = parseAndNormalizeIds(bulkIds);

    if (parsed.validIds.length === 0) {
      if (parsed.invalidTokens.length > 0) {
        setBulkValidationError(
          `No se encontraron IDs numéricos válidos. Tokens inválidos detectados: ${parsed.invalidTokens.join(', ')}`
        );
      } else {
        setBulkValidationError('Por favor ingresa al menos un ID numérico');
      }
      return;
    }

    setBulkProcessing(true);
    setBulkValidationError(null);
    setBulkResult(null);
    setCreateMissingResult(null);

    try {
      const idsToVerify = parsed.validIds;
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
      const foundIds = new Set(allExistingHosts.map((h: any) => h.host_id));
      const notFoundIds = idsToVerify.filter(id => !foundIds.has(id));
      const alreadyVerifiedIds = allExistingHosts
        .filter((h: any) => h.estado === 'Verified')
        .map((h: any) => h.host_id);
      const toUpdateIds = allExistingHosts
        .filter((h: any) => h.estado !== 'Verified')
        .map((h: any) => h.host_id);

      // Update ONLY the hosts from the provided list that need verification
      if (toUpdateIds.length > 0) {
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
      }

      // Always log the bulk verification action
      await ActivityLogger.bulkVerification(
        user, 
        toUpdateIds.length, 
        notFoundIds.length, 
        alreadyVerifiedIds.length,
        [...toUpdateIds, ...alreadyVerifiedIds]
      );

      // Set the results
      setBulkResult({
        success: toUpdateIds,
        notFound: notFoundIds,
        alreadyVerified: alreadyVerifiedIds,
        totalValidIds: parsed.validIds.length,
        duplicatesRemoved: parsed.duplicatesRemoved,
        invalidTokens: parsed.invalidTokens,
        verificationDate: currentDate,
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
    setCreateMissingResult(null);
  };

  // Download not-found IDs as a TXT file (client-side)
  const downloadNotFoundTxt = () => {
    if (!bulkResult || bulkResult.notFound.length === 0) return;
    const date = bulkResult.verificationDate;
    const content =
      `NEW HOST MANAGER\n` +
      `IDs NOT FOUND\n` +
      `Verification date: ${date}\n\n` +
      `Total IDs not found: ${bulkResult.notFound.length}\n\n` +
      `${bulkResult.notFound.join('\n')}\n`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `not-found-host-ids-${date}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Create minimal host records for not-found IDs (requires explicit confirmation)
  const handleCreateMissingRecords = async () => {
    if (!bulkResult || bulkResult.notFound.length === 0) return;

    const confirmed = window.confirm(
      `Se crearán ${bulkResult.notFound.length} registro(s) minimal(es) para los IDs no encontrados.\n\n` +
      `Cada registro tendrá:\n` +
      `  • estado = "Verified"\n` +
      `  • ver_date = "${bulkResult.verificationDate}"\n` +
      `  • comision = "Pending"\n` +
      `  • real = false\n\n` +
      `No se asignará reclutador, nombre, teléfono ni capturas.\n\n` +
      `¿Deseas continuar?`
    );
    if (!confirmed) return;

    setCreatingMissing(true);
    const errors: string[] = [];
    let created = 0;
    let skipped = 0;

    try {
      const notFoundIds = bulkResult.notFound;
      const verificationDate = bulkResult.verificationDate;
      const batchSize = 100;

      // Re-check each ID against Supabase to avoid duplicates from concurrent processes
      let stillMissing: string[] = [];
      for (let i = 0; i < notFoundIds.length; i += batchSize) {
        const batch = notFoundIds.slice(i, i + batchSize);
        const { data: existing, error: checkError } = await supabase
          .from('hosts')
          .select('host_id')
          .in('host_id', batch);

        if (checkError) throw checkError;
        const existingIds = new Set((existing || []).map((h: any) => h.host_id));
        for (const id of batch) {
          if (!existingIds.has(id)) {
            stillMissing.push(id);
          } else {
            skipped++;
          }
        }
      }

      // Insert minimal records for IDs still missing
      for (const hostId of stillMissing) {
        const minimalRecord = {
          host_id: hostId,
          estado: 'Verified',
          ver_date: verificationDate,
          comision: 'Pending',
          real: false,
        };

        const { error: insertError } = await supabase
          .from('hosts')
          .insert([minimalRecord]);

        if (insertError) {
          errors.push(`${hostId}: ${insertError.message}`);
        } else {
          created++;
        }
      }

      // Log creation of missing host records as a separate auditable action
      await ActivityLogger.log(
        user,
        'create' as any,
        `Created ${created} missing host record(s) via verification (IDs: ${stillMissing.slice(0, 20).join(', ')}${stillMissing.length > 20 ? '...' : ''})`,
        'host',
        undefined,
        { createdCount: created, skippedCount: skipped, hostIds: stillMissing, source: 'verification_missing' }
      );

      setCreateMissingResult({ created, skipped, errors });

      // Refresh the hosts list
      fetchHosts();
    } catch (error) {
      console.error('Create missing records error:', error);
      setCreateMissingResult({ created, skipped, errors: [...errors, (error as any)?.message || 'Unknown error'] });
    } finally {
      setCreatingMissing(false);
    }
  };

  // Get detected IDs count for display
  const parsedPreview = parseAndNormalizeIds(bulkIds);

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
                  <li>• Pega o escribe los Host IDs en cualquier formato: uno por línea, separados por comas, espacios, tabulaciones, puntos y coma, etc.</li>
                  <li>• Los IDs deben ser numéricos — los tokens no numéricos se reportarán como inválidos</li>
                  <li>• Los IDs duplicados serán removidos automáticamente conservando el primer orden de aparición</li>
                  <li>• El sistema actualizará el estado a "Verified" y establecerá la fecha de verificación de hoy</li>
                  <li>• <strong>Solo se actualizarán los IDs proporcionados</strong> — ningún otro registro será modificado</li>
                  <li>• Los hosts ya verificados conservarán su fecha de verificación original sin cambios</li>
                  <li>• Los IDs no encontrados se listarán por separado y podrán descargarse como TXT</li>
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
                    placeholder={"Pega los IDs en cualquier formato, por ejemplo:\n\n3216497\n321321321\n98456321\n\no: 3216497, 321321321, 98456321\n\no: 3216497 321321321 98456321"}
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
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <p className="text-sm text-gray-600">
                        <span className="font-medium text-gray-900">{parsedPreview.validIds.length}</span> ID(s) numérico(s) válido(s)
                      </p>
                      {parsedPreview.duplicatesRemoved > 0 && (
                        <p className="text-sm text-amber-600">
                          <span className="font-medium">{parsedPreview.duplicatesRemoved}</span> duplicado(s) removido(s)
                        </p>
                      )}
                      {parsedPreview.invalidTokens.length > 0 && (
                        <p className="text-sm text-red-600">
                          <span className="font-medium">{parsedPreview.invalidTokens.length}</span> token(s) inválido(s): {parsedPreview.invalidTokens.join(', ')}
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
                  
                  {/* Invalid Tokens */}
                  {bulkResult.invalidTokens.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <XCircle className="w-5 h-5 text-red-600" />
                        <h4 className="font-semibold text-red-800">
                          Tokens Inválidos ({bulkResult.invalidTokens.length})
                        </h4>
                      </div>
                      <p className="text-sm text-red-700 mb-3">
                        Los siguientes tokens no son numéricos y fueron ignorados:
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {bulkResult.invalidTokens.map(token => (
                          <span key={token} className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-mono">
                            {token}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

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
                        Estos IDs ya estaban verificados y su fecha de verificación original se conservó sin cambios:
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
                        Los siguientes IDs no fueron encontrados en el sistema:
                      </p>
                      <div className="flex flex-wrap gap-2 mb-4">
                        {bulkResult.notFound.map(id => (
                          <span key={id} className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-mono">
                            {id}
                          </span>
                        ))}
                      </div>
                      {/* Download and Create Missing actions */}
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          onClick={downloadNotFoundTxt}
                          disabled={creatingMissing}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors disabled:opacity-50"
                        >
                          <Download className="w-4 h-4" />
                          Download Not Found IDs (.txt)
                        </button>
                        <button
                          onClick={handleCreateMissingRecords}
                          disabled={creatingMissing}
                          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {creatingMissing ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Creando...
                            </>
                          ) : (
                            <>
                              <PlusCircle className="w-4 h-4" />
                              Create Missing Host Records
                            </>
                          )}
                        </button>
                      </div>
                      {/* Create missing result */}
                      {createMissingResult && (
                        <div className={`mt-3 rounded-lg p-3 text-sm ${
                          createMissingResult.errors.length > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'
                        }`}>
                          <p className={createMissingResult.errors.length > 0 ? 'text-red-800' : 'text-green-800'}>
                            <span className="font-medium">{createMissingResult.created}</span> registro(s) creado(s), <span className="font-medium">{createMissingResult.skipped}</span> omitido(s) (ya existían).
                          </p>
                          {createMissingResult.errors.length > 0 && (
                            <ul className="mt-2 list-disc list-inside text-red-700">
                              {createMissingResult.errors.map((err, i) => (
                                <li key={i}>{err}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Summary */}
                  <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                    <h4 className="font-semibold text-gray-800 mb-3">Resumen</h4>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 text-center">
                      <div>
                        <p className="text-2xl font-bold text-gray-900">{bulkResult.totalValidIds}</p>
                        <p className="text-sm text-gray-500">IDs Válidos Únicos</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-amber-600">{bulkResult.duplicatesRemoved}</p>
                        <p className="text-sm text-gray-500">Duplicados Removidos</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-red-600">{bulkResult.invalidTokens.length}</p>
                        <p className="text-sm text-gray-500">Tokens Inválidos</p>
                      </div>
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
