import React, { useState, useEffect, useRef } from 'react';
import { 
  Filter, 
  Download, 
  FileText, 
  Image as ImageIcon, 
  File,
  X,
  RefreshCw,
  Calendar
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Host, FilterOptions } from '@/types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const PAY_METHODS = ['', 'Binance', 'Nequi', 'Payoneer', 'Paypal', 'Venmo', 'Zelle', 'CashApp'];
const ESTADOS = ['', 'Verified', 'Pending', 'Rejected'];
const COMISION_OPTIONS = ['', 'Paid', 'Pending'];

export default function Reports() {
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

  useEffect(() => {
    fetchHosts();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [filters, hosts]);

  const fetchHosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hosts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setHosts(data || []);
      
      // Extract unique reclutadores
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
    
    // Filter summary
    const activeFilters = Object.entries(filters)
      .filter(([_, v]) => v)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    if (activeFilters) {
      doc.text(`Filters: ${activeFilters}`, 14, 40);
    }

    // Table headers
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

    // Table rows
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-gray-500 mt-1">Filter and export host data</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchHosts}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

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
    </div>
  );
}
