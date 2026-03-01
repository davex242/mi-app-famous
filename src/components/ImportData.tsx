import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, AlertCircle, CheckCircle, X, ArrowLeft, ArrowRight } from 'lucide-react';
import { supabase } from '@/lib/supabase';

const DB_FIELDS = [
  { key: 'host_name', label: 'Host Name', required: true },
  { key: 'host_id', label: 'Host ID', required: true },
  { key: 'reg_date', label: 'Registration Date', required: true },
  { key: 'whatsapp_num', label: 'WhatsApp Number', required: false },
  { key: 'pay_method', label: 'Payment Method', required: false },
  { key: 'user_id', label: 'User ID', required: false },
  { key: 'estado', label: 'Estado', required: false },
  { key: 'escalado', label: 'Escalado', required: false },
  { key: 'issue', label: 'Issue', required: false },
  { key: 'resuelto', label: 'Resuelto', required: false },
  { key: 'ver_date', label: 'Verification Date', required: false },
  { key: 'reclutador', label: 'Reclutador', required: true },
  { key: 'rec_id', label: 'Recruiter ID', required: false },
  { key: 'comision', label: 'Comisión', required: false },
];

const PAY_METHODS = ['Binance', 'Nequi', 'Payoneer', 'Paypal', 'Venmo', 'Zelle', 'CashApp'];
const ESTADOS = ['Verified', 'Pending', 'Rejected'];
const COMISION_OPTIONS = ['Paid', 'Pending'];

interface ImportDataProps {
  onBack: () => void;
  onComplete: () => void;
}

interface ParsedRow {
  data: Record<string, string>;
  errors: string[];
  isValid: boolean;
}

export default function ImportData({ onBack, onComplete }: ImportDataProps) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'complete'>('upload');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<string[][]>([]);
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [parsedRows, setParsedRows] = useState<ParsedRow[]>([]);
  const [importResults, setImportResults] = useState({ success: 0, failed: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseCSV = (text: string): { headers: string[]; rows: string[][] } => {
    const lines = text.split(/\r?\n/).filter(line => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };
    
    const parseRow = (line: string): string[] => {
      const result: string[] = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          result.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      result.push(current.trim());
      return result;
    };
    
    const headers = parseRow(lines[0]);
    const rows = lines.slice(1).map(parseRow);
    return { headers, rows };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const { headers, rows } = parseCSV(text);
      setCsvHeaders(headers);
      setCsvData(rows);
      
      // Auto-map columns with matching names
      const autoMapping: Record<string, string> = {};
      DB_FIELDS.forEach(field => {
        const matchingHeader = headers.find(h => 
          h.toLowerCase().replace(/[_\s]/g, '') === field.key.toLowerCase().replace(/[_\s]/g, '') ||
          h.toLowerCase().replace(/[_\s]/g, '') === field.label.toLowerCase().replace(/[_\s]/g, '')
        );
        if (matchingHeader) {
          autoMapping[field.key] = matchingHeader;
        }
      });
      setColumnMapping(autoMapping);
      setStep('mapping');
    };
    reader.readAsText(file);
  };

  const validateRow = (row: string[], mapping: Record<string, string>): ParsedRow => {
    const data: Record<string, string> = {};
    const errors: string[] = [];
    
    // Map CSV columns to database fields
    Object.entries(mapping).forEach(([dbField, csvHeader]) => {
      const colIndex = csvHeaders.indexOf(csvHeader);
      if (colIndex !== -1) {
        data[dbField] = row[colIndex] || '';
      }
    });
    
    // Validate required fields
    DB_FIELDS.filter(f => f.required).forEach(field => {
      if (!data[field.key]?.trim()) {
        errors.push(`${field.label} is required`);
      }
    });
    
    // Validate date format
    if (data.reg_date && !/^\d{4}-\d{2}-\d{2}$/.test(data.reg_date)) {
      errors.push('Registration Date must be YYYY-MM-DD format');
    }
    if (data.ver_date && data.ver_date.trim() && !/^\d{4}-\d{2}-\d{2}$/.test(data.ver_date)) {
      errors.push('Verification Date must be YYYY-MM-DD format');
    }
    
    // Validate enum fields
    if (data.pay_method && !PAY_METHODS.includes(data.pay_method)) {
      errors.push(`Invalid Payment Method: ${data.pay_method}`);
    }
    if (data.estado && !ESTADOS.includes(data.estado)) {
      errors.push(`Invalid Estado: ${data.estado}`);
    }
    if (data.comision && !COMISION_OPTIONS.includes(data.comision)) {
      errors.push(`Invalid Comisión: ${data.comision}`);
    }
    
    // Convert escalado to boolean
    if (data.escalado) {
      data.escalado = ['true', 'yes', '1', 'si'].includes(data.escalado.toLowerCase()) ? 'true' : 'false';
    }
    
    return { data, errors, isValid: errors.length === 0 };
  };

  const processMapping = () => {
    const rows = csvData.map(row => validateRow(row, columnMapping));
    setParsedRows(rows);
    setStep('preview');
  };

  const handleImport = async () => {
    setStep('importing');
    let success = 0;
    let failed = 0;
    
    const validRows = parsedRows.filter(r => r.isValid);
    
    for (const row of validRows) {
      try {
        const insertData = {
          host_name: row.data.host_name,
          host_id: row.data.host_id,
          reg_date: row.data.reg_date,
          whatsapp_num: row.data.whatsapp_num || null,
          pay_method: row.data.pay_method || 'Binance',
          user_id: row.data.user_id || null,
          estado: row.data.estado || 'Pending',
          escalado: row.data.escalado === 'true',
          issue: row.data.issue || null,
          resuelto: row.data.resuelto || null,
          ver_date: row.data.ver_date || null,
          reclutador: row.data.reclutador,
          rec_id: row.data.rec_id || null,
          comision: row.data.comision || 'Pending',
        };
        
        const { error } = await supabase.from('hosts').insert([insertData]);
        if (error) throw error;
        success++;
      } catch (err) {
        failed++;
      }
    }
    
    setImportResults({ success, failed });
    setStep('complete');
  };

  const validCount = parsedRows.filter(r => r.isValid).length;
  const invalidCount = parsedRows.filter(r => !r.isValid).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Data</h1>
          <p className="text-gray-500">Bulk upload host data from CSV file</p>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="flex items-center justify-center gap-2">
        {['Upload', 'Map Columns', 'Preview', 'Import'].map((label, i) => {
          const stepIndex = ['upload', 'mapping', 'preview', 'importing'].indexOf(step);
          const isActive = i <= stepIndex || step === 'complete';
          return (
            <React.Fragment key={label}>
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${
                isActive ? 'bg-blue-500 text-white' : 'bg-gray-200 text-gray-500'
              }`}>
                <span className="w-5 h-5 flex items-center justify-center rounded-full bg-white/20 text-xs">
                  {i + 1}
                </span>
                {label}
              </div>
              {i < 3 && <ArrowRight className="w-4 h-4 text-gray-300" />}
            </React.Fragment>
          );
        })}
      </div>

      {/* Step Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {step === 'upload' && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <FileSpreadsheet className="w-8 h-8 text-blue-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Upload CSV File</h2>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Select a CSV file containing host data. The first row should contain column headers.
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2 mx-auto"
            >
              <Upload className="w-5 h-5" />
              Choose File
            </button>
            <p className="text-xs text-gray-400 mt-4">Supported formats: CSV, TXT (comma-separated)</p>
          </div>
        )}

        {step === 'mapping' && (
          <div>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Map CSV Columns to Database Fields</h2>
            <p className="text-sm text-gray-500 mb-6">Match your CSV columns to the corresponding database fields. Required fields are marked with *</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-96 overflow-y-auto">
              {DB_FIELDS.map(field => (
                <div key={field.key} className="flex items-center gap-3">
                  <label className="w-40 text-sm font-medium text-gray-700">
                    {field.label} {field.required && <span className="text-red-500">*</span>}
                  </label>
                  <select
                    value={columnMapping[field.key] || ''}
                    onChange={(e) => setColumnMapping(prev => ({ ...prev, [field.key]: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                  >
                    <option value="">-- Select Column --</option>
                    {csvHeaders.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setStep('upload')} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Back
              </button>
              <button onClick={processMapping} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
                Continue to Preview
              </button>
            </div>
          </div>
        )}

        {step === 'preview' && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Preview Import Data</h2>
              <div className="flex items-center gap-4">
                <span className="flex items-center gap-1 text-sm text-green-600">
                  <CheckCircle className="w-4 h-4" /> {validCount} valid
                </span>
                <span className="flex items-center gap-1 text-sm text-red-600">
                  <AlertCircle className="w-4 h-4" /> {invalidCount} errors
                </span>
              </div>
            </div>
            
            <div className="max-h-80 overflow-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Status</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Host Name</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Host ID</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Reg Date</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Reclutador</th>
                    <th className="px-3 py-2 text-left font-medium text-gray-600">Errors</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {parsedRows.slice(0, 50).map((row, i) => (
                    <tr key={i} className={row.isValid ? 'bg-green-50' : 'bg-red-50'}>
                      <td className="px-3 py-2">
                        {row.isValid ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                      </td>
                      <td className="px-3 py-2">{row.data.host_name || '-'}</td>
                      <td className="px-3 py-2">{row.data.host_id || '-'}</td>
                      <td className="px-3 py-2">{row.data.reg_date || '-'}</td>
                      <td className="px-3 py-2">{row.data.reclutador || '-'}</td>
                      <td className="px-3 py-2 text-red-600 text-xs">{row.errors.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            
            {parsedRows.length > 50 && (
              <p className="text-sm text-gray-500 mt-2">Showing first 50 of {parsedRows.length} rows</p>
            )}
            
            <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
              <button onClick={() => setStep('mapping')} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50">
                Back
              </button>
              <button 
                onClick={handleImport} 
                disabled={validCount === 0}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50"
              >
                Import {validCount} Valid Rows
              </button>
            </div>
          </div>
        )}

        {step === 'importing' && (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900">Importing Data...</h2>
            <p className="text-gray-500">Please wait while we import your data</p>
          </div>
        )}

        {step === 'complete' && (
          <div className="text-center py-12">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-500" />
            </div>
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Import Complete!</h2>
            <div className="flex items-center justify-center gap-6 mb-6">
              <span className="text-green-600 font-medium">{importResults.success} imported successfully</span>
              {importResults.failed > 0 && (
                <span className="text-red-600 font-medium">{importResults.failed} failed</span>
              )}
            </div>
            <button onClick={onComplete} className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600">
              Go to Dashboard
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
