import React, { useState } from 'react';
import { 
  ChevronUp, 
  ChevronDown, 
  Eye, 
  Edit, 
  Trash2, 
  ChevronLeft, 
  ChevronRight,
  Search,
  AlertTriangle,
  Edit2,
  X,
  CheckSquare,
  Square,
  AlertCircle,
  Image,
  Phone,
  ExternalLink,
  ZoomIn,
  CheckCircle
} from 'lucide-react';
import { Host } from '@/types';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';


interface DataTableProps {
  data: Host[];
  onView: (host: Host) => void;
  onEdit: (host: Host) => void;
  onDelete: (host: Host) => void;
  loading: boolean;
  onRefresh?: () => void;
}

const ESTADOS = ['Verified', 'Pending', 'Rejected'];
const COMISION_OPTIONS = ['Paid', 'Pending'];

export default function DataTable({ data, onView, onEdit, onDelete, loading, onRefresh }: DataTableProps) {
  const { canEdit, canManageUsers } = useAuth();
  const [sortField, setSortField] = useState<keyof Host>('created_at');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(25);
  
  // Bulk edit state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [bulkEditData, setBulkEditData] = useState({
    estado: '',
    comision: '',
    escalado: '',
  });
  const [bulkSaving, setBulkSaving] = useState(false);

  // Image preview state
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string>('');

  // Calculate days since registration
  const calculateDays = (regDate: string): number => {
    if (!regDate) return 0;
    const reg = new Date(regDate);
    const now = new Date();
    const diff = now.getTime() - reg.getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24));
  };

  // Check if host is pending and overdue (> 3 days)
  const isPendingOverdue = (host: Host): boolean => {
    if (host.estado !== 'Pending') return false;
    const days = calculateDays(host.reg_date);
    return days > 3;
  };

  // Filter and sort data
  const filteredData = data.filter(host => {
    const searchLower = search.toLowerCase();
    return (
      host.host_name?.toLowerCase().includes(searchLower) ||
      host.host_id?.toLowerCase().includes(searchLower) ||
      host.reclutador?.toLowerCase().includes(searchLower) ||
      host.user_id?.toLowerCase().includes(searchLower) ||
      host.estado?.toLowerCase().includes(searchLower) ||
      host.whatsapp_num?.toLowerCase().includes(searchLower) ||
      host.pay_method?.toLowerCase().includes(searchLower) ||
      host.issue?.toLowerCase().includes(searchLower)
    );
  });

  const sortedData = [...filteredData].sort((a, b) => {
    const aVal = a[sortField] || '';
    const bVal = b[sortField] || '';
    if (sortDirection === 'asc') {
      return aVal > bVal ? 1 : -1;
    }
    return aVal < bVal ? 1 : -1;
  });

  // Pagination
  const totalPages = Math.ceil(sortedData.length / rowsPerPage);
  const startIndex = (currentPage - 1) * rowsPerPage;
  const paginatedData = sortedData.slice(startIndex, startIndex + rowsPerPage);

  const handleSort = (field: keyof Host) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Bulk selection handlers
  const handleSelectAll = () => {
    if (selectedIds.size === paginatedData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedData.map(h => h.id)));
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

  const handleOpenBulkEdit = () => {
    setBulkEditData({ estado: '', comision: '', escalado: '' });
    setShowBulkEditModal(true);
  };

  const handleBulkEditConfirm = () => {
    if (!bulkEditData.estado && !bulkEditData.comision && bulkEditData.escalado === '') {
      alert('Please select at least one field to update');
      return;
    }
    setShowBulkEditModal(false);
    setShowBulkConfirm(true);
  };

  const handleBulkUpdate = async () => {
    setBulkSaving(true);
    try {
      const updateData: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };
      
      if (bulkEditData.estado) {
        updateData.estado = bulkEditData.estado;
      }
      if (bulkEditData.comision) {
        updateData.comision = bulkEditData.comision;
      }
      if (bulkEditData.escalado !== '') {
        updateData.escalado = bulkEditData.escalado === 'true';
      }

      const { error } = await supabase
        .from('hosts')
        .update(updateData)
        .in('id', Array.from(selectedIds));

      if (error) throw error;

      setShowBulkConfirm(false);
      setSelectedIds(new Set());
      setBulkEditData({ estado: '', comision: '', escalado: '' });
      
      if (onRefresh) {
        onRefresh();
      }
    } catch (error) {
      console.error('Bulk update error:', error);
      alert('Failed to update records: ' + (error as any)?.message || 'Unknown error');
    } finally {
      setBulkSaving(false);
    }
  };

  const clearSelection = () => {
    setSelectedIds(new Set());
  };

  // Image preview handlers
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

  const SortIcon = ({ field }: { field: keyof Host }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4" /> : 
      <ChevronDown className="w-4 h-4" />;
  };

  const getStatusBadge = (estado: string, isOverdue: boolean) => {
    const styles: Record<string, string> = {
      Verified: 'bg-green-100 text-green-700 border-green-200',
      Pending: isOverdue 
        ? 'bg-red-100 text-red-700 border-red-200' 
        : 'bg-yellow-100 text-yellow-700 border-yellow-200',
      Rejected: 'bg-red-100 text-red-700 border-red-200',
    };
    return (
      <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${styles[estado] || 'bg-gray-100 text-gray-700'}`}>
        {estado}
      </span>
    );
  };

  const getComisionBadge = (comision: string) => {
    return (
      <span className={`px-2.5 py-1 text-xs font-medium rounded-full border ${
        comision === 'Paid' 
          ? 'bg-green-100 text-green-700 border-green-200' 
          : 'bg-orange-100 text-orange-700 border-orange-200'
      }`}>
        {comision}
      </span>
    );
  };

  const getDaysBadge = (host: Host) => {
    const days = calculateDays(host.reg_date);
    const isOverdue = isPendingOverdue(host);
    
    if (isOverdue) {
      return (
        <div className="flex items-center gap-1">
          <span className="px-2 py-1 bg-red-100 text-red-700 rounded-md font-medium text-sm flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" />
            {days}d
          </span>
        </div>
      );
    }
    
    return (
      <span className="px-2 py-1 bg-blue-50 text-blue-700 rounded-md font-medium text-sm">
        {days}d
      </span>
    );
  };

  // Render image thumbnail
  const renderThumbnail = (imageUrl: string | undefined, title: string, hostName: string) => {
    if (!imageUrl) {
      return (
        <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
          <Image className="w-4 h-4 text-gray-400" />
        </div>
      );
    }
    
    return (
      <button
        onClick={() => openImagePreview(imageUrl, `${hostName} - ${title}`)}
        className="relative group w-10 h-10 rounded-lg overflow-hidden border border-gray-200 hover:border-blue-400 transition-colors"
        title={`Click to preview ${title}`}
      >
        <img
          src={imageUrl}
          alt={title}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
          }}
        />
        <div className="hidden w-full h-full bg-gray-100 items-center justify-center">
          <Image className="w-4 h-4 text-gray-400" />
        </div>
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>
    );
  };

  // Format date for display
  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    try {
      return new Date(dateStr).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch {
      return dateStr;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const isAllSelected = paginatedData.length > 0 && selectedIds.size === paginatedData.length;
  const isSomeSelected = selectedIds.size > 0 && selectedIds.size < paginatedData.length;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* Search and Controls */}
      <div className="p-4 border-b border-gray-200 flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
            placeholder="Search hosts, IDs, phone, payment..."
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && canEdit && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-blue-600 font-medium">
                {selectedIds.size} selected
              </span>
              <button
                onClick={handleOpenBulkEdit}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
              >
                <Edit2 className="w-4 h-4" />
                Bulk Edit
              </button>
              <button
                onClick={clearSelection}
                className="px-3 py-2 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
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
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1800px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {canEdit && (
                <th className="px-3 py-3 w-12 sticky left-0 bg-gray-50 z-10">
                  <button
                    onClick={handleSelectAll}
                    className="p-1 hover:bg-gray-200 rounded transition-colors"
                    title={isAllSelected ? 'Deselect all' : 'Select all'}
                  >
                    {isAllSelected ? (
                      <CheckSquare className="w-5 h-5 text-blue-600" />
                    ) : isSomeSelected ? (
                      <div className="w-5 h-5 border-2 border-blue-600 rounded bg-blue-100 flex items-center justify-center">
                        <div className="w-2 h-0.5 bg-blue-600" />
                      </div>
                    ) : (
                      <Square className="w-5 h-5 text-gray-400" />
                    )}
                  </button>
                </th>
              )}
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('host_name')}>
                <div className="flex items-center gap-1">Host Name <SortIcon field="host_name" /></div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('host_id')}>
                <div className="flex items-center gap-1">Host ID <SortIcon field="host_id" /></div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('reg_date')}>
                <div className="flex items-center gap-1">Reg Date <SortIcon field="reg_date" /></div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Days</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('whatsapp_num')}>
                <div className="flex items-center gap-1">WhatsApp <SortIcon field="whatsapp_num" /></div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('pay_method')}>
                <div className="flex items-center gap-1">Pay Method <SortIcon field="pay_method" /></div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('user_id')}>
                <div className="flex items-center gap-1">User ID <SortIcon field="user_id" /></div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('reclutador')}>
                <div className="flex items-center gap-1">Reclutador <SortIcon field="reclutador" /></div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('rec_id')}>
                <div className="flex items-center gap-1">Rec ID <SortIcon field="rec_id" /></div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('estado')}>
                <div className="flex items-center gap-1">Estado <SortIcon field="estado" /></div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('ver_date')}>
                <div className="flex items-center gap-1">Ver Date <SortIcon field="ver_date" /></div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Escalado</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('issue')}>
                <div className="flex items-center gap-1">Issue <SortIcon field="issue" /></div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('resuelto')}>
                <div className="flex items-center gap-1">Resuelto <SortIcon field="resuelto" /></div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onClick={() => handleSort('comision')}>
                <div className="flex items-center gap-1">Comisión <SortIcon field="comision" /></div>
              </th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Captura</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Capture 1</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Capture 2</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Capture 3</th>
              <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider sticky right-0 bg-gray-50 z-10">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {paginatedData.length === 0 ? (
              <tr>
                <td colSpan={canEdit ? 21 : 20} className="px-4 py-12 text-center text-gray-500">
                  No hosts found
                </td>
              </tr>
            ) : (
              paginatedData.map((host) => {
                const isOverdue = isPendingOverdue(host);
                return (
                  <tr 
                    key={host.id} 
                    className={`hover:bg-gray-50 transition-colors ${selectedIds.has(host.id) ? 'bg-blue-50' : ''} ${isOverdue ? 'bg-red-50/50' : ''}`}
                  >
                    {canEdit && (
                      <td className="px-3 py-3 sticky left-0 bg-inherit z-10">
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
                    )}
                    <td className="px-3 py-3 text-sm font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        <span className="max-w-[150px] truncate" title={host.host_name}>{host.host_name}</span>
                        {host.real && host.estado === 'Verified' && (
                          <CheckCircle className="w-4 h-4 text-green-500" title="Verified Real Account" />
                        )}
                        {isOverdue && (
                          <span className="inline-flex" title="Pending for more than 3 days">
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          </span>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-3 text-sm text-gray-600 font-mono">{host.host_id || '-'}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{formatDate(host.reg_date)}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{getDaysBadge(host)}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">
                      {host.whatsapp_num ? (
                        <a 
                          href={`https://wa.me/${host.whatsapp_num.replace(/\D/g, '')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-green-600 hover:text-green-700 hover:underline"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {host.whatsapp_num}
                        </a>
                      ) : '-'}
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <span className="px-2 py-1 bg-purple-50 text-purple-700 rounded text-xs font-medium">
                        {host.pay_method || '-'}
                      </span>
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 font-mono max-w-[100px] truncate" title={host.user_id}>
                      {host.user_id || '-'}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600">{host.reclutador || '-'}</td>
                    <td className="px-3 py-3 text-sm text-gray-600 font-mono">{host.rec_id || '-'}</td>
                    <td className="px-3 py-3">{getStatusBadge(host.estado, isOverdue)}</td>
                    <td className="px-3 py-3 text-sm text-gray-600">{formatDate(host.ver_date)}</td>
                    <td className="px-3 py-3">
                      {host.escalado ? (
                        <span className="flex items-center gap-1 text-amber-600">
                          <AlertTriangle className="w-4 h-4" />
                          <span className="text-xs font-medium">Yes</span>
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">No</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 max-w-[150px] truncate" title={host.issue}>
                      {host.issue || '-'}
                    </td>
                    <td className="px-3 py-3 text-sm text-gray-600 max-w-[150px] truncate" title={host.resuelto}>
                      {host.resuelto || '-'}
                    </td>
                    <td className="px-3 py-3">{getComisionBadge(host.comision)}</td>
                    <td className="px-3 py-3">
                      {renderThumbnail(host.captura, 'Captura', host.host_name)}
                    </td>
                    <td className="px-3 py-3">
                      {renderThumbnail(host.capture1, 'Capture 1', host.host_name)}
                    </td>
                    <td className="px-3 py-3">
                      {renderThumbnail(host.capture2, 'Capture 2', host.host_name)}
                    </td>
                    <td className="px-3 py-3">
                      {renderThumbnail(host.capture3, 'Capture 3', host.host_name)}
                    </td>
                    <td className="px-3 py-3 sticky right-0 bg-inherit z-10">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onView(host)}
                          className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="View"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {canEdit && (
                          <button
                            onClick={() => onEdit(host)}
                            className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                            title="Edit"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {canManageUsers && (
                          <button
                            onClick={() => onDelete(host)}
                            className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="px-4 py-3 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm text-gray-500">
          Showing {startIndex + 1} to {Math.min(startIndex + rowsPerPage, sortedData.length)} of {sortedData.length} entries
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
            {/* Close button */}
            <button
              onClick={closeImagePreview}
              className="absolute -top-12 right-0 p-2 text-white hover:text-gray-300 transition-colors"
            >
              <X className="w-8 h-8" />
            </button>
            
            {/* Title */}
            <div className="absolute -top-12 left-0 text-white text-lg font-medium">
              {previewTitle}
            </div>

            {/* Image container */}
            <div className="bg-white rounded-xl overflow-hidden shadow-2xl">
              <img
                src={previewImage}
                alt={previewTitle}
                className="w-full h-auto max-h-[80vh] object-contain"
              />
            </div>

            {/* Open in new tab button */}
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

      {/* Bulk Edit Modal */}
      {showBulkEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">Bulk Edit</h3>
              <button
                onClick={() => setShowBulkEditModal(false)}
                className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600">
                Update the following fields for <strong>{selectedIds.size}</strong> selected record(s). 
                Leave a field empty to keep its current value.
              </p>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Estado</label>
                <select
                  value={bulkEditData.estado}
                  onChange={(e) => setBulkEditData(prev => ({ ...prev, estado: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- No change --</option>
                  {ESTADOS.map(estado => (
                    <option key={estado} value={estado}>{estado}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Comisión</label>
                <select
                  value={bulkEditData.comision}
                  onChange={(e) => setBulkEditData(prev => ({ ...prev, comision: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- No change --</option>
                  {COMISION_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Escalado</label>
                <select
                  value={bulkEditData.escalado}
                  onChange={(e) => setBulkEditData(prev => ({ ...prev, escalado: e.target.value }))}
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">-- No change --</option>
                  <option value="true">Yes</option>
                  <option value="false">No</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
              <button
                onClick={() => setShowBulkEditModal(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkEditConfirm}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Edit Confirmation Modal */}
      {showBulkConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full">
            <div className="p-6 text-center">
              <div className="w-14 h-14 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Edit2 className="w-7 h-7 text-blue-600" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Confirm Bulk Update</h3>
              <p className="text-gray-600 mb-4">
                You are about to update <strong className="text-blue-600">{selectedIds.size}</strong> record(s) with the following changes:
              </p>
              
              <div className="bg-gray-50 rounded-lg p-4 text-left mb-6 space-y-2">
                {bulkEditData.estado && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Estado:</span>
                    <span className="font-medium">{bulkEditData.estado}</span>
                  </div>
                )}
                {bulkEditData.comision && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Comisión:</span>
                    <span className="font-medium">{bulkEditData.comision}</span>
                  </div>
                )}
                {bulkEditData.escalado !== '' && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Escalado:</span>
                    <span className="font-medium">{bulkEditData.escalado === 'true' ? 'Yes' : 'No'}</span>
                  </div>
                )}
              </div>

              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setShowBulkConfirm(false)}
                  disabled={bulkSaving}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBulkUpdate}
                  disabled={bulkSaving}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {bulkSaving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Updating...
                    </>
                  ) : (
                    <>
                      <CheckSquare className="w-4 h-4" />
                      Update {selectedIds.size} Records
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
