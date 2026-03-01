import React, { useState, useEffect, useMemo } from 'react';
import {
  DollarSign,
  CheckCircle,
  Clock,
  RefreshCw,
  Search,
  Users,
  ArrowLeft,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Settings,
  Percent,
  Calculator,
  Save,
  Info,
  Download,
  FileText,
  FileSpreadsheet
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Host } from '@/types';
import { useAuth } from '@/context/AuthContext';
import Modal from './ui/Modal';
import ActivityLogger from '@/lib/activityLogger';
import emailNotifications from '@/lib/emailNotifications';

interface CommissionManagementProps {
  onBack: () => void;
}

interface RecruiterCommissionSettings {
  id?: string;
  recruiter_name: string;
  base_commission: number;
  additional_percentage: number;
  max_commission: number;
  updated_at?: string;
  updated_by?: string;
}

interface RecruiterReportData {
  recruiterName: string;
  hosts: Host[];
  totalHosts: number;
  totalCommission: number;
  baseCommission: number;
  additionalPercentage: number;
  commissionPerHost: number;
}

const DEFAULT_BASE_COMMISSION = 25.00;

const MAX_COMMISSION_LIMIT = 42.00;

export default function CommissionManagement({ onBack }: CommissionManagementProps) {
  const { user, canEdit } = useAuth();
  const [hosts, setHosts] = useState<Host[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecruiter, setSelectedRecruiter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedHosts, setSelectedHosts] = useState<Set<string>>(new Set());
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [sortField, setSortField] = useState<'host_name' | 'reclutador' | 'ver_date'>('ver_date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Export modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);

  // Commission configuration state
  const [recruiterSettings, setRecruiterSettings] = useState<Record<string, RecruiterCommissionSettings>>({});
  const [currentBaseCommission, setCurrentBaseCommission] = useState<number>(DEFAULT_BASE_COMMISSION);
  const [currentAdditionalPercentage, setCurrentAdditionalPercentage] = useState<number>(0);
  const [savingSettings, setSavingSettings] = useState(false);
  const [settingsChanged, setSettingsChanged] = useState(false);

  const fetchHosts = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('hosts')
        .select('*')
        .eq('estado', 'Verified')
        .eq('real', true)
        .order('ver_date', { ascending: false });
      if (error) throw error;
      setHosts(data || []);
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };


  const fetchRecruiterSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('recruiter_commission_settings')
        .select('*');
      if (error) throw error;
      
      const settingsMap: Record<string, RecruiterCommissionSettings> = {};
      (data || []).forEach((setting: any) => {
        // Ensure numeric values are properly converted from database
        settingsMap[setting.recruiter_name] = {
          ...setting,
          base_commission: parseFloat(setting.base_commission) || DEFAULT_BASE_COMMISSION,
          additional_percentage: parseFloat(setting.additional_percentage) || 0,
          max_commission: parseFloat(setting.max_commission) || MAX_COMMISSION_LIMIT
        };
      });
      setRecruiterSettings(settingsMap);
    } catch (error) {
      console.error('Fetch recruiter settings error:', error);
    }
  };


  useEffect(() => { 
    fetchHosts(); 
    fetchRecruiterSettings();
  }, []);

  // Update commission values when recruiter filter changes
  useEffect(() => {
    if (selectedRecruiter !== 'all' && recruiterSettings[selectedRecruiter]) {
      const settings = recruiterSettings[selectedRecruiter];
      setCurrentBaseCommission(settings.base_commission);
      setCurrentAdditionalPercentage(settings.additional_percentage);
      setSettingsChanged(false);
    } else {
      setCurrentBaseCommission(DEFAULT_BASE_COMMISSION);
      setCurrentAdditionalPercentage(0);
      setSettingsChanged(false);
    }
  }, [selectedRecruiter, recruiterSettings]);

  const recruiters = useMemo(() => {
    return [...new Set(hosts.map(h => h.reclutador).filter(Boolean))].sort();
  }, [hosts]);

  const filteredHosts = useMemo(() => {
    let filtered = hosts.filter(h => h.comision === 'Pending');
    if (selectedRecruiter !== 'all') filtered = filtered.filter(h => h.reclutador === selectedRecruiter);
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(h =>
        h.host_name?.toLowerCase().includes(query) ||
        h.host_id?.toLowerCase().includes(query) ||
        h.reclutador?.toLowerCase().includes(query)
      );
    }
    filtered.sort((a, b) => {
      let aVal = a[sortField] || '';
      let bVal = b[sortField] || '';
      return sortDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return filtered;
  }, [hosts, selectedRecruiter, searchQuery, sortField, sortDirection]);

  // Calculate available additional percentages based on base commission
  const availablePercentages = useMemo(() => {
    const percentages: { value: number; label: string; total: number }[] = [];
    const baseAmount = currentBaseCommission;
    
    // Calculate percentages from 0% to max that doesn't exceed $42
    for (let pct = 0; pct <= 100; pct += 5) {
      const additionalAmount = baseAmount * (pct / 100);
      const total = baseAmount + additionalAmount;
      
      if (total <= MAX_COMMISSION_LIMIT) {
        percentages.push({
          value: pct,
          label: `${pct}% (+$${additionalAmount.toFixed(2)})`,
          total: total
        });
      } else {
        break;
      }
    }
    
    return percentages;
  }, [currentBaseCommission]);

  // Calculate total commission per host
  const calculateTotalCommission = (baseCommission: number, additionalPercentage: number): number => {
    const additional = baseCommission * (additionalPercentage / 100);
    return Math.min(baseCommission + additional, MAX_COMMISSION_LIMIT);
  };

  const currentTotalCommission = calculateTotalCommission(currentBaseCommission, currentAdditionalPercentage);

  const totals = useMemo(() => {
    const pendingCount = filteredHosts.length;
    const pendingAmount = pendingCount * currentTotalCommission;
    const selectedCount = selectedHosts.size;
    const selectedAmount = selectedCount * currentTotalCommission;
    const byRecruiter: Record<string, { count: number; amount: number }> = {};
    
    filteredHosts.forEach(h => {
      const recruiter = h.reclutador || 'Unknown';
      if (!byRecruiter[recruiter]) byRecruiter[recruiter] = { count: 0, amount: 0 };
      byRecruiter[recruiter].count++;
      
      // Use recruiter-specific settings if available
      const recruiterSetting = recruiterSettings[recruiter];
      if (recruiterSetting) {
        const total = calculateTotalCommission(recruiterSetting.base_commission, recruiterSetting.additional_percentage);
        byRecruiter[recruiter].amount += total;
      } else {
        byRecruiter[recruiter].amount += currentTotalCommission;
      }
    });
    
    return { pendingCount, pendingAmount, selectedCount, selectedAmount, byRecruiter };
  }, [filteredHosts, selectedHosts, currentTotalCommission, recruiterSettings]);

  // Generate report data grouped by recruiter
  const generateReportData = (): { reportData: RecruiterReportData[]; grandTotal: number; totalHosts: number } => {
    const pendingHosts = hosts.filter(h => h.comision === 'Pending');
    const recruiterGroups: Record<string, Host[]> = {};
    
    pendingHosts.forEach(host => {
      const recruiter = host.reclutador || 'Unknown';
      if (!recruiterGroups[recruiter]) {
        recruiterGroups[recruiter] = [];
      }
      recruiterGroups[recruiter].push(host);
    });

    const reportData: RecruiterReportData[] = [];
    let grandTotal = 0;
    let totalHosts = 0;

    Object.entries(recruiterGroups).sort((a, b) => a[0].localeCompare(b[0])).forEach(([recruiterName, recruiterHosts]) => {
      const settings = recruiterSettings[recruiterName];
      const baseCommission = settings?.base_commission || DEFAULT_BASE_COMMISSION;
      const additionalPercentage = settings?.additional_percentage || 0;
      const commissionPerHost = calculateTotalCommission(baseCommission, additionalPercentage);
      const totalCommission = recruiterHosts.length * commissionPerHost;

      reportData.push({
        recruiterName,
        hosts: recruiterHosts,
        totalHosts: recruiterHosts.length,
        totalCommission,
        baseCommission,
        additionalPercentage,
        commissionPerHost
      });

      grandTotal += totalCommission;
      totalHosts += recruiterHosts.length;
    });

    return { reportData, grandTotal, totalHosts };
  };

  // Export to CSV
  const exportToCSV = () => {
    setExportLoading(true);
    try {
      const { reportData, grandTotal, totalHosts } = generateReportData();
      const now = new Date();
      const dateStr = now.toISOString().split('T')[0];
      
      let csvContent = '';
      
      // Header
      csvContent += 'COMMISSION REPORT - PENDING PAYMENTS\n';
      csvContent += `Generated: ${now.toLocaleString()}\n`;
      csvContent += `Report Period: All Pending Commissions\n`;
      csvContent += '\n';
      
      // Summary Section
      csvContent += '=== SUMMARY ===\n';
      csvContent += `Total Recruiters,${reportData.length}\n`;
      csvContent += `Total Hosts with Pending Commissions,${totalHosts}\n`;
      csvContent += `Grand Total Amount,$${grandTotal.toFixed(2)}\n`;
      csvContent += '\n';
      
      // Recruiter Summary Table
      csvContent += '=== RECRUITER SUMMARY ===\n';
      csvContent += 'Recruiter,Hosts Count,Base Commission,Additional %,Commission per Host,Total Commission\n';
      reportData.forEach(data => {
        csvContent += `"${data.recruiterName}",${data.totalHosts},$${data.baseCommission.toFixed(2)},${data.additionalPercentage}%,$${data.commissionPerHost.toFixed(2)},$${data.totalCommission.toFixed(2)}\n`;
      });
      csvContent += `TOTAL,${totalHosts},,,,,$${grandTotal.toFixed(2)}\n`;
      csvContent += '\n';
      
      // Detailed Host List by Recruiter
      csvContent += '=== DETAILED HOST LIST ===\n';
      reportData.forEach(data => {
        csvContent += `\n--- ${data.recruiterName} (${data.totalHosts} hosts - $${data.totalCommission.toFixed(2)}) ---\n`;
        csvContent += 'Host Name,Host ID,User ID,Verification Date,Commission\n';
        data.hosts.forEach(host => {
          csvContent += `"${host.host_name || ''}","${host.host_id || ''}","${host.user_id || ''}","${host.ver_date || ''}",$${data.commissionPerHost.toFixed(2)}\n`;
        });
        csvContent += `Subtotal for ${data.recruiterName},,,,,$${data.totalCommission.toFixed(2)}\n`;
      });
      
      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `commission_report_${dateStr}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Log the export activity
      ActivityLogger.log(user, 'EXPORT', 'commission_report', 'csv', {
        totalRecruiters: reportData.length,
        totalHosts,
        grandTotal
      });
      
      setShowExportModal(false);
    } catch (error) {
      console.error('CSV export error:', error);
      alert('Failed to export CSV report');
    } finally {
      setExportLoading(false);
    }
  };

  // Export to PDF (using print-friendly HTML)
  const exportToPDF = () => {
    setExportLoading(true);
    try {
      const { reportData, grandTotal, totalHosts } = generateReportData();
      const now = new Date();
      
      // Create a new window with print-friendly content
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Please allow pop-ups to export PDF');
        setExportLoading(false);
        return;
      }

      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>Commission Report - ${now.toISOString().split('T')[0]}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { 
              font-family: 'Segoe UI', Arial, sans-serif; 
              padding: 40px; 
              color: #1f2937;
              line-height: 1.5;
            }
            .header { 
              text-align: center; 
              margin-bottom: 30px; 
              padding-bottom: 20px;
              border-bottom: 3px solid #3b82f6;
            }
            .header h1 { 
              color: #1e40af; 
              font-size: 28px; 
              margin-bottom: 8px;
            }
            .header p { 
              color: #6b7280; 
              font-size: 14px;
            }
            .summary-box {
              background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);
              border: 1px solid #93c5fd;
              border-radius: 12px;
              padding: 24px;
              margin-bottom: 30px;
            }
            .summary-box h2 {
              color: #1e40af;
              font-size: 18px;
              margin-bottom: 16px;
              display: flex;
              align-items: center;
              gap: 8px;
            }
            .summary-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 20px;
            }
            .summary-item {
              background: white;
              padding: 16px;
              border-radius: 8px;
              text-align: center;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .summary-item .label {
              font-size: 12px;
              color: #6b7280;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .summary-item .value {
              font-size: 24px;
              font-weight: 700;
              color: #1e40af;
              margin-top: 4px;
            }
            .summary-item .value.money {
              color: #059669;
            }
            .section { 
              margin-bottom: 30px; 
            }
            .section h2 { 
              color: #374151; 
              font-size: 18px; 
              margin-bottom: 16px;
              padding-bottom: 8px;
              border-bottom: 2px solid #e5e7eb;
            }
            table { 
              width: 100%; 
              border-collapse: collapse; 
              margin-bottom: 20px;
              font-size: 13px;
            }
            th { 
              background: #f3f4f6; 
              padding: 12px 10px; 
              text-align: left; 
              font-weight: 600;
              color: #374151;
              border-bottom: 2px solid #d1d5db;
              text-transform: uppercase;
              font-size: 11px;
              letter-spacing: 0.5px;
            }
            td { 
              padding: 10px; 
              border-bottom: 1px solid #e5e7eb;
            }
            tr:hover { background: #f9fafb; }
            .total-row { 
              background: #f0fdf4 !important; 
              font-weight: 700;
            }
            .total-row td {
              border-top: 2px solid #059669;
              color: #059669;
            }
            .recruiter-section {
              background: #fafafa;
              border: 1px solid #e5e7eb;
              border-radius: 8px;
              padding: 20px;
              margin-bottom: 20px;
              page-break-inside: avoid;
            }
            .recruiter-header {
              display: flex;
              justify-content: space-between;
              align-items: center;
              margin-bottom: 16px;
              padding-bottom: 12px;
              border-bottom: 1px solid #d1d5db;
            }
            .recruiter-name {
              font-size: 16px;
              font-weight: 600;
              color: #1f2937;
            }
            .recruiter-stats {
              display: flex;
              gap: 16px;
              font-size: 13px;
            }
            .recruiter-stats span {
              background: white;
              padding: 4px 12px;
              border-radius: 20px;
              border: 1px solid #d1d5db;
            }
            .recruiter-stats .hosts { color: #3b82f6; }
            .recruiter-stats .amount { color: #059669; font-weight: 600; }
            .money { color: #059669; }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e5e7eb;
              text-align: center;
              color: #9ca3af;
              font-size: 12px;
            }
            @media print {
              body { padding: 20px; }
              .recruiter-section { break-inside: avoid; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>Commission Report</h1>
            <p>Pending Payments - Generated on ${now.toLocaleString()}</p>
          </div>

          <div class="summary-box">
            <h2>📊 Executive Summary</h2>
            <div class="summary-grid">
              <div class="summary-item">
                <div class="label">Total Recruiters</div>
                <div class="value">${reportData.length}</div>
              </div>
              <div class="summary-item">
                <div class="label">Total Hosts</div>
                <div class="value">${totalHosts}</div>
              </div>
              <div class="summary-item">
                <div class="label">Grand Total</div>
                <div class="value money">$${grandTotal.toFixed(2)}</div>
              </div>
            </div>
          </div>

          <div class="section">
            <h2>Recruiter Summary</h2>
            <table>
              <thead>
                <tr>
                  <th>Recruiter</th>
                  <th>Hosts</th>
                  <th>Base Commission</th>
                  <th>Additional %</th>
                  <th>Per Host</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                ${reportData.map(data => `
                  <tr>
                    <td><strong>${data.recruiterName}</strong></td>
                    <td>${data.totalHosts}</td>
                    <td>$${data.baseCommission.toFixed(2)}</td>
                    <td>${data.additionalPercentage}%</td>
                    <td>$${data.commissionPerHost.toFixed(2)}</td>
                    <td class="money"><strong>$${data.totalCommission.toFixed(2)}</strong></td>
                  </tr>
                `).join('')}
                <tr class="total-row">
                  <td>GRAND TOTAL</td>
                  <td>${totalHosts}</td>
                  <td colspan="3"></td>
                  <td>$${grandTotal.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="section">
            <h2>Detailed Breakdown by Recruiter</h2>
            ${reportData.map(data => `
              <div class="recruiter-section">
                <div class="recruiter-header">
                  <span class="recruiter-name">${data.recruiterName}</span>
                  <div class="recruiter-stats">
                    <span class="hosts">${data.totalHosts} hosts</span>
                    <span class="amount">$${data.totalCommission.toFixed(2)}</span>
                  </div>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Host Name</th>
                      <th>Host ID</th>
                      <th>User ID</th>
                      <th>Verified Date</th>
                      <th>Commission</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${data.hosts.map(host => `
                      <tr>
                        <td>${host.host_name || '-'}</td>
                        <td><code>${host.host_id || '-'}</code></td>
                        <td>${host.user_id || '-'}</td>
                        <td>${host.ver_date || '-'}</td>
                        <td class="money">$${data.commissionPerHost.toFixed(2)}</td>
                      </tr>
                    `).join('')}
                    <tr class="total-row">
                      <td colspan="4">Subtotal for ${data.recruiterName}</td>
                      <td>$${data.totalCommission.toFixed(2)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            `).join('')}
          </div>

          <div class="footer">
            <p>This report was automatically generated by the Commission Management System</p>
            <p>Report ID: RPT-${Date.now()}</p>
          </div>
        </body>
        </html>
      `;

      printWindow.document.write(htmlContent);
      printWindow.document.close();
      
      // Wait for content to load then trigger print
      printWindow.onload = () => {
        printWindow.print();
      };

      // Log the export activity
      ActivityLogger.log(user, 'EXPORT', 'commission_report', 'pdf', {
        totalRecruiters: reportData.length,
        totalHosts,
        grandTotal
      });

      setShowExportModal(false);
    } catch (error) {
      console.error('PDF export error:', error);
      alert('Failed to export PDF report');
    } finally {
      setExportLoading(false);
    }
  };

  const toggleSelection = (hostId: string) => {
    const newSelected = new Set(selectedHosts);
    if (newSelected.has(hostId)) newSelected.delete(hostId);
    else newSelected.add(hostId);
    setSelectedHosts(newSelected);
  };

  const selectAll = () => {
    if (selectedHosts.size === filteredHosts.length) setSelectedHosts(new Set());
    else setSelectedHosts(new Set(filteredHosts.map(h => h.id)));
  };

  const handleBaseCommissionChange = (value: string) => {
    const numValue = parseFloat(value) || 0;
    const clampedValue = Math.min(Math.max(numValue, 0), MAX_COMMISSION_LIMIT);
    setCurrentBaseCommission(clampedValue);
    setSettingsChanged(true);
    
    // Reset additional percentage if it would exceed max
    const newTotal = clampedValue + (clampedValue * (currentAdditionalPercentage / 100));
    if (newTotal > MAX_COMMISSION_LIMIT) {
      setCurrentAdditionalPercentage(0);
    }
  };

  const handleAdditionalPercentageChange = (value: number) => {
    setCurrentAdditionalPercentage(value);
    setSettingsChanged(true);
  };

  const saveRecruiterSettings = async () => {
    if (selectedRecruiter === 'all') return;
    
    setSavingSettings(true);
    try {
      // Check if settings already exist for this recruiter
      const { data: existingSettings, error: fetchError } = await supabase
        .from('recruiter_commission_settings')
        .select('id')
        .eq('recruiter_name', selectedRecruiter)
        .maybeSingle();

      if (fetchError) {
        console.error('Fetch existing settings error:', fetchError);
        throw fetchError;
      }

      let saveError;
      
      if (existingSettings) {
        // Update existing record
        const { error } = await supabase
          .from('recruiter_commission_settings')
          .update({
            base_commission: currentBaseCommission,
            additional_percentage: currentAdditionalPercentage,
            max_commission: MAX_COMMISSION_LIMIT,
            updated_by: user?.email || 'unknown',
            updated_at: new Date().toISOString()
          })
          .eq('id', existingSettings.id);
        saveError = error;
      } else {
        // Insert new record
        const { error } = await supabase
          .from('recruiter_commission_settings')
          .insert({
            recruiter_name: selectedRecruiter,
            base_commission: currentBaseCommission,
            additional_percentage: currentAdditionalPercentage,
            max_commission: MAX_COMMISSION_LIMIT,
            updated_by: user?.email || 'unknown',
            updated_at: new Date().toISOString()
          });
        saveError = error;
      }

      if (saveError) {
        console.error('Save settings error:', saveError);
        throw saveError;
      }

      // Update local state
      setRecruiterSettings(prev => ({
        ...prev,
        [selectedRecruiter]: {
          recruiter_name: selectedRecruiter,
          base_commission: currentBaseCommission,
          additional_percentage: currentAdditionalPercentage,
          max_commission: MAX_COMMISSION_LIMIT,
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'unknown'
        }
      }));

      setSettingsChanged(false);
      
      // Log the activity
      await ActivityLogger.commissionSettingsUpdate(
        user, 
        selectedRecruiter, 
        currentBaseCommission, 
        currentAdditionalPercentage, 
        currentTotalCommission
      );
      
    } catch (error: any) {
      console.error('Save settings error:', error);
      alert(`Failed to save commission settings: ${error.message || 'Unknown error'}`);
    } finally {
      setSavingSettings(false);
    }
  };


  const markAsPaid = async () => {
    if (selectedHosts.size === 0) return;
    setProcessingPayment(true);
    try {
      const { error } = await supabase
        .from('hosts')
        .update({ comision: 'Paid' })
        .in('id', Array.from(selectedHosts));
      if (error) throw error;
      
      const recruiterName = selectedRecruiter !== 'all' ? selectedRecruiter : 'Multiple';
      const amount = totals.selectedAmount;
      
      // Log the activity with commission details
      await ActivityLogger.commissionPayment(user, recruiterName, selectedHosts.size, amount);
      
      // Send email notification
      try {
        await emailNotifications.notifyCommissionProcessed(
          recruiterName,
          selectedHosts.size,
          amount
        );
      } catch (emailError) {
        console.error('Email notification failed:', emailError);
      }
      
      setSelectedHosts(new Set());
      setShowPaymentModal(false);
      fetchHosts();
    } catch (error) {
      console.error('Payment update error:', error);
      alert('Failed to update commission status');
    } finally {
      setProcessingPayment(false);
    }
  };

  const markSingleAsPaid = async (hostId: string) => {
    try {
      const host = hosts.find(h => h.id === hostId);
      const { error } = await supabase.from('hosts').update({ comision: 'Paid' }).eq('id', hostId);
      if (error) throw error;
      
      // Log and notify with configured commission
      if (host) {
        const recruiterSetting = recruiterSettings[host.reclutador || ''];
        const commissionAmount = recruiterSetting 
          ? calculateTotalCommission(recruiterSetting.base_commission, recruiterSetting.additional_percentage)
          : currentTotalCommission;
        await ActivityLogger.commissionPayment(user, host.reclutador || 'Unknown', 1, commissionAmount);
      }
      
      fetchHosts();
    } catch (error) {
      console.error('Payment update error:', error);
    }
  };

  const handleSort = (field: 'host_name' | 'reclutador' | 'ver_date') => {
    if (sortField === field) setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDirection('asc'); }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />;
  };

  // Get commission for display in table
  const getHostCommission = (host: Host): number => {
    if (selectedRecruiter !== 'all') {
      return currentTotalCommission;
    }
    const recruiterSetting = recruiterSettings[host.reclutador || ''];
    if (recruiterSetting) {
      return calculateTotalCommission(recruiterSetting.base_commission, recruiterSetting.additional_percentage);
    }
    return DEFAULT_BASE_COMMISSION;
  };

  // Get pending hosts count for export button
  const pendingHostsCount = hosts.filter(h => h.comision === 'Pending').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Commission Management</h1>
            <p className="text-gray-500 mt-1">Manage and process recruiter commissions</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setShowExportModal(true)} 
            disabled={pendingHostsCount === 0}
            className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-lg hover:from-indigo-600 hover:to-purple-700 flex items-center gap-2 shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Download className="w-4 h-4" /> Export Report
          </button>
          <button onClick={fetchHosts} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-amber-50 rounded-lg"><Clock className="w-6 h-6 text-amber-500" /></div>
            <div><p className="text-sm text-gray-500">Pending</p><p className="text-2xl font-bold">{totals.pendingCount}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-emerald-50 rounded-lg"><DollarSign className="w-6 h-6 text-emerald-500" /></div>
            <div><p className="text-sm text-gray-500">Amount</p><p className="text-2xl font-bold text-emerald-600">${totals.pendingAmount.toFixed(2)}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-50 rounded-lg"><Users className="w-6 h-6 text-blue-500" /></div>
            <div><p className="text-sm text-gray-500">Recruiters</p><p className="text-2xl font-bold">{Object.keys(totals.byRecruiter).length}</p></div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-50 rounded-lg"><CheckCircle className="w-6 h-6 text-purple-500" /></div>
            <div><p className="text-sm text-gray-500">Selected</p><p className="text-2xl font-bold text-purple-600">{totals.selectedCount} (${totals.selectedAmount.toFixed(2)})</p></div>
          </div>
        </div>
      </div>

      {/* Commission Configuration Panel - Only for users with edit rights */}
      {canEdit && (
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl shadow-sm border border-indigo-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Settings className="w-5 h-5 text-indigo-600" />
            <h3 className="font-semibold text-indigo-900">Commission Configuration</h3>
            {selectedRecruiter !== 'all' && recruiterSettings[selectedRecruiter] && (
              <span className="ml-2 px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-xs">
                Saved settings loaded
              </span>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Base Commission */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Base Commission ($)
              </label>
              <div className="relative">
                <DollarSign className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="number"
                  min="0"
                  max={MAX_COMMISSION_LIMIT}
                  step="0.50"
                  value={currentBaseCommission}
                  onChange={(e) => handleBaseCommissionChange(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Additional Percentage */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Additional Percentage
              </label>
              <div className="relative">
                <Percent className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <select
                  value={currentAdditionalPercentage}
                  onChange={(e) => handleAdditionalPercentageChange(Number(e.target.value))}
                  className="w-full pl-9 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 appearance-none bg-white"
                >
                  {availablePercentages.map((pct) => (
                    <option key={pct.value} value={pct.value}>
                      {pct.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Total Preview */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Total per Host
              </label>
              <div className="flex items-center gap-2 px-4 py-2.5 bg-white border border-emerald-300 rounded-lg">
                <Calculator className="w-4 h-4 text-emerald-500" />
                <span className="text-xl font-bold text-emerald-600">${currentTotalCommission.toFixed(2)}</span>
                {currentAdditionalPercentage > 0 && (
                  <span className="text-xs text-gray-500">
                    (${currentBaseCommission.toFixed(2)} + {currentAdditionalPercentage}%)
                  </span>
                )}
              </div>
            </div>

            {/* Save Button - Only when a specific recruiter is selected */}
            <div className="flex items-end">
              {selectedRecruiter !== 'all' ? (
                <button
                  onClick={saveRecruiterSettings}
                  disabled={savingSettings || !settingsChanged}
                  className={`w-full px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-colors ${
                    settingsChanged
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
                >
                  {savingSettings ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  Save for {selectedRecruiter}
                </button>
              ) : (
                <div className="w-full px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-700 text-sm">
                    <Info className="w-4 h-4" />
                    <span>Select a recruiter to save settings</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Max Commission Warning */}
          <div className="mt-3 flex items-center gap-2 text-sm text-gray-600">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <span>Maximum commission limit: <strong>${MAX_COMMISSION_LIMIT.toFixed(2)}</strong> per host</span>
          </div>
        </div>
      )}

      {/* Search and Filter */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input 
              type="text" 
              placeholder="Search by name, ID, or recruiter..." 
              value={searchQuery} 
              onChange={(e) => setSearchQuery(e.target.value)} 
              className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500" 
            />
          </div>
          <select 
            value={selectedRecruiter} 
            onChange={(e) => setSelectedRecruiter(e.target.value)} 
            className="px-4 py-2.5 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All Recruiters</option>
            {recruiters.map(r => (
              <option key={r} value={r}>
                {r} {recruiterSettings[r] ? `(Custom: $${calculateTotalCommission(recruiterSettings[r].base_commission, recruiterSettings[r].additional_percentage).toFixed(2)})` : ''}
              </option>
            ))}
          </select>
        </div>
        {canEdit && selectedHosts.size > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <button 
              onClick={() => setShowPaymentModal(true)} 
              className="px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 flex items-center gap-2"
            >
              <CheckCircle className="w-4 h-4" /> Mark Selected as Paid ({selectedHosts.size}) - ${totals.selectedAmount.toFixed(2)}
            </button>
          </div>
        )}
      </div>

      {/* Recruiter Summary with Custom Settings */}
      {selectedRecruiter === 'all' && Object.keys(recruiterSettings).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
            <Settings className="w-4 h-4 text-gray-500" />
            Recruiters with Custom Commission Settings
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {Object.entries(recruiterSettings).map(([recruiter, settings]) => (
              <div key={recruiter} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p className="font-medium text-gray-900">{recruiter}</p>
                  <p className="text-sm text-gray-500">
                    Base: ${settings.base_commission.toFixed(2)} + {settings.additional_percentage}%
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-emerald-600">
                    ${calculateTotalCommission(settings.base_commission, settings.additional_percentage).toFixed(2)}
                  </p>
                  <p className="text-xs text-gray-400">per host</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input 
                    type="checkbox" 
                    checked={selectedHosts.size === filteredHosts.length && filteredHosts.length > 0} 
                    onChange={selectAll} 
                    className="w-4 h-4 rounded" 
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer" onClick={() => handleSort('host_name')}>
                  <div className="flex items-center gap-1">Host Name <SortIcon field="host_name" /></div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Host ID</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer" onClick={() => handleSort('reclutador')}>
                  <div className="flex items-center gap-1">Recruiter <SortIcon field="reclutador" /></div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase cursor-pointer" onClick={() => handleSort('ver_date')}>
                  <div className="flex items-center gap-1">Verified <SortIcon field="ver_date" /></div>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Commission</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto" />
                  </td>
                </tr>
              ) : filteredHosts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                    No pending commissions
                  </td>
                </tr>
              ) : (
                filteredHosts.map((host) => {
                  const hostCommission = getHostCommission(host);
                  const hasCustomSettings = recruiterSettings[host.reclutador || ''];
                  
                  return (
                    <tr key={host.id} className={`hover:bg-gray-50 ${selectedHosts.has(host.id) ? 'bg-blue-50' : ''}`}>
                      <td className="px-4 py-3">
                        <input 
                          type="checkbox" 
                          checked={selectedHosts.has(host.id)} 
                          onChange={() => toggleSelection(host.id)} 
                          className="w-4 h-4 rounded" 
                        />
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{host.host_name}</td>
                      <td className="px-4 py-3 text-gray-600 font-mono text-sm">{host.host_id}</td>
                      <td className="px-4 py-3">
                        <span className={`px-2.5 py-1 rounded-full text-sm ${hasCustomSettings ? 'bg-indigo-100 text-indigo-700' : 'bg-blue-100 text-blue-700'}`}>
                          {host.reclutador || 'Unknown'}
                          {hasCustomSettings && <Settings className="w-3 h-3 inline ml-1" />}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{host.ver_date || '-'}</td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-emerald-600">${hostCommission.toFixed(2)}</span>
                        {hasCustomSettings && selectedRecruiter === 'all' && (
                          <span className="ml-1 text-xs text-gray-400">(custom)</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {canEdit && (
                          <button 
                            onClick={() => markSingleAsPaid(host.id)} 
                            className="px-3 py-1.5 bg-emerald-100 text-emerald-700 rounded-lg text-sm flex items-center gap-1 hover:bg-emerald-200"
                          >
                            <Check className="w-4 h-4" /> Paid
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment Confirmation Modal */}
      <Modal isOpen={showPaymentModal} onClose={() => setShowPaymentModal(false)} title="Confirm Commission Payment" size="md">
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-4 bg-amber-50 rounded-lg border border-amber-200">
            <AlertTriangle className="w-6 h-6 text-amber-500" />
            <p className="text-amber-800">Mark <strong>{selectedHosts.size}</strong> commission(s) as paid?</p>
          </div>
          
          {/* Commission Breakdown */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Hosts Selected:</span>
              <span className="font-medium">{selectedHosts.size}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Commission per Host:</span>
              <span className="font-medium">${currentTotalCommission.toFixed(2)}</span>
            </div>
            {currentAdditionalPercentage > 0 && (
              <div className="flex justify-between text-sm text-indigo-600">
                <span>Includes Additional:</span>
                <span>{currentAdditionalPercentage}% (+${(currentBaseCommission * currentAdditionalPercentage / 100).toFixed(2)} each)</span>
              </div>
            )}
            <div className="border-t border-gray-200 pt-3 flex justify-between">
              <span className="font-semibold">Total Payment:</span>
              <span className="font-bold text-emerald-600 text-xl">${totals.selectedAmount.toFixed(2)}</span>
            </div>
          </div>

          {selectedRecruiter !== 'all' && (
            <div className="flex items-center gap-2 p-3 bg-indigo-50 rounded-lg text-sm text-indigo-700">
              <Info className="w-4 h-4" />
              <span>Paying commissions for recruiter: <strong>{selectedRecruiter}</strong></span>
            </div>
          )}
          
          <div className="flex justify-end gap-3 pt-2">
            <button 
              onClick={() => setShowPaymentModal(false)} 
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button 
              onClick={markAsPaid} 
              disabled={processingPayment} 
              className="px-4 py-2 bg-emerald-500 text-white rounded-lg flex items-center gap-2 hover:bg-emerald-600 disabled:opacity-50"
            >
              {processingPayment ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />} 
              Confirm Payment
            </button>
          </div>
        </div>
      </Modal>

      {/* Export Report Modal */}
      <Modal isOpen={showExportModal} onClose={() => setShowExportModal(false)} title="Export Commission Report" size="md">
        <div className="space-y-6">
          {/* Report Preview */}
          <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-5 border border-indigo-200">
            <h3 className="font-semibold text-indigo-900 mb-3 flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Report Contents
            </h3>
            <ul className="space-y-2 text-sm text-gray-700">
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                All verified & real accounts with pending commissions
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Grouped by recruiter with individual totals
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Commission breakdown (base + additional %)
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Summary statistics and grand totals
              </li>
            </ul>
          </div>

          {/* Report Stats Preview */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
              <p className="text-2xl font-bold text-indigo-600">{Object.keys(totals.byRecruiter).length}</p>
              <p className="text-xs text-gray-500 mt-1">Recruiters</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
              <p className="text-2xl font-bold text-blue-600">{pendingHostsCount}</p>
              <p className="text-xs text-gray-500 mt-1">Pending Hosts</p>
            </div>
            <div className="bg-white rounded-lg p-4 border border-gray-200 text-center">
              <p className="text-2xl font-bold text-emerald-600">${totals.pendingAmount.toFixed(2)}</p>
              <p className="text-xs text-gray-500 mt-1">Total Amount</p>
            </div>
          </div>

          {/* Export Format Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">Choose Export Format</label>
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={exportToCSV}
                disabled={exportLoading}
                className="flex flex-col items-center gap-3 p-5 border-2 border-gray-200 rounded-xl hover:border-emerald-500 hover:bg-emerald-50 transition-all group"
              >
                <div className="p-3 bg-emerald-100 rounded-lg group-hover:bg-emerald-200 transition-colors">
                  <FileSpreadsheet className="w-8 h-8 text-emerald-600" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-gray-900">CSV Spreadsheet</p>
                  <p className="text-xs text-gray-500 mt-1">For Excel, Google Sheets</p>
                </div>
              </button>

              <button
                onClick={exportToPDF}
                disabled={exportLoading}
                className="flex flex-col items-center gap-3 p-5 border-2 border-gray-200 rounded-xl hover:border-red-500 hover:bg-red-50 transition-all group"
              >
                <div className="p-3 bg-red-100 rounded-lg group-hover:bg-red-200 transition-colors">
                  <FileText className="w-8 h-8 text-red-600" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-gray-900">PDF Document</p>
                  <p className="text-xs text-gray-500 mt-1">Print-ready format</p>
                </div>
              </button>
            </div>
          </div>

          {exportLoading && (
            <div className="flex items-center justify-center gap-2 text-indigo-600">
              <RefreshCw className="w-5 h-5 animate-spin" />
              <span>Generating report...</span>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <button 
              onClick={() => setShowExportModal(false)} 
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
