import React, { useState, useEffect } from 'react';
import { Save, X, AlertCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Host, AppUser } from '@/types';
import { useAuth } from '@/context/AuthContext';
import ImageUpload from './ui/ImageUpload';
import { sortedCountryCodes } from '@/lib/countryCodes';
import ActivityLogger from '@/lib/activityLogger';
import emailNotifications from '@/lib/emailNotifications';

interface EntryFormProps {
  entry?: Host | null;
  onSave: () => void;
  onCancel: () => void;
  disabled?: boolean;
  isNewEntry?: boolean;
  defaultRecruiter?: string;
}


const PAY_METHODS = ['Binance', 'Nequi', 'Payoneer', 'Paypal', 'Venmo', 'Zelle', 'CashApp'];
const ESTADOS = ['Verified', 'Pending', 'Rejected'];
const COMISION_OPTIONS = ['Paid', 'Pending'];

export default function EntryForm({ entry, onSave, onCancel, disabled, isNewEntry = false, defaultRecruiter }: EntryFormProps) {

  const { user, canManageUsers } = useAuth();
  const [formData, setFormData] = useState({
    host_name: '',
    host_id: '',
    reg_date: '',
    country_code: '+1',
    phone_number: '',
    whatsapp_num: '',
    pay_method: 'Binance',
    user_id: '',
    captura: '',
    estado: 'Pending',
    escalado: false,
    issue: '',
    resuelto: '',
    ver_date: '',
    reclutador: '',
    rec_id: '',
    capture1: '',
    capture2: '',
    capture3: '',
    comision: 'Pending',
    real: false,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [originalData, setOriginalData] = useState<Record<string, any> | null>(null);
  const [availableUsers, setAvailableUsers] = useState<AppUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);

  // Fetch available users for recruiter dropdown
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const { data, error } = await supabase
          .from('app_users')
          .select('*')
          .eq('is_active', true)
          .order('name', { ascending: true });

        if (error) throw error;
        setAvailableUsers(data || []);
      } catch (error) {
        console.error('Error fetching users:', error);
      } finally {
        setLoadingUsers(false);
      }
    };

    fetchUsers();
  }, []);

  // Check if user can edit this record (edit users can only edit their own records)
  const canEditRecord = () => {
    if (canManageUsers) return true; // Admins can edit all
    if (!user) return false;
    if (isNewEntry) return true; // Anyone with edit rights can create new
    // Edit users can only edit records they created (by reclutador matching their name)
    return entry?.reclutador === user.name;
  };

  // Check if user can edit commission field (admin only)
  const canEditCommission = canManageUsers;

  useEffect(() => {
    if (entry) {
      // Parse existing whatsapp number to extract country code and phone
      let countryCode = '+1';
      let phoneNumber = entry.whatsapp_num || '';
      
      if (entry.whatsapp_num) {
        // Try to match country code from the beginning
        const matchedCode = sortedCountryCodes.find(cc => 
          entry.whatsapp_num.startsWith(cc.dial_code)
        );
        if (matchedCode) {
          countryCode = matchedCode.dial_code;
          phoneNumber = entry.whatsapp_num.substring(matchedCode.dial_code.length);
        }
      }

      const data = {
        host_name: entry.host_name || '',
        host_id: entry.host_id || '',
        reg_date: entry.reg_date || '',
        country_code: countryCode,
        phone_number: phoneNumber,
        whatsapp_num: entry.whatsapp_num || '',
        pay_method: entry.pay_method || 'Binance',
        user_id: entry.user_id || '',
        captura: entry.captura || '',
        estado: entry.estado || 'Pending',
        escalado: entry.escalado || false,
        issue: entry.issue || '',
        resuelto: entry.resuelto || '',
        ver_date: entry.ver_date || '',
        reclutador: entry.reclutador || '',
        rec_id: entry.rec_id || '',
        capture1: entry.capture1 || '',
        capture2: entry.capture2 || '',
        capture3: entry.capture3 || '',
        comision: entry.comision || 'Pending',
        real: entry.real || false,
      };
      setFormData(data);
      setOriginalData(data);
    } else if (isNewEntry) {
      // Pre-fill reclutador with defaultRecruiter or current user's name for new entries
      setFormData(prev => ({
        ...prev,
        reclutador: defaultRecruiter || user?.name || '',
      }));
    }

  }, [entry, isNewEntry, user]);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    
    // Información Básica - Todos requeridos
    if (!formData.host_name.trim()) newErrors.host_name = 'El nombre del emisor es requerido';
    if (!formData.host_id.trim()) newErrors.host_id = 'El ID del emisor es requerido';
    if (!formData.reg_date) newErrors.reg_date = 'La fecha de registro es requerida';
    if (!formData.phone_number.trim()) newErrors.phone_number = 'El número de WhatsApp es requerido';
    
    // Estado y Reclutador - Todos requeridos excepto ver_date
    if (!formData.estado) newErrors.estado = 'El estado es requerido';
    if (!formData.reclutador.trim()) newErrors.reclutador = 'El reclutador es requerido';
    if (!formData.rec_id.trim()) newErrors.rec_id = 'El ID del reclutador es requerido';
    
    // Capturas - Todas requeridas excepto la primera (método de pago)
    if (!formData.capture1) newErrors.capture1 = 'La captura del formulario de verificación es requerida';
    if (!formData.capture2) newErrors.capture2 = 'La captura de transmisión es requerida';
    if (!formData.capture3) newErrors.capture3 = 'La captura del chat de WhatsApp es requerida';
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    if (!canEditRecord() && !isNewEntry) {
      alert('Solo puedes editar tus propios registros');
      return;
    }

    setSaving(true);
    try {
      // Merge country code and phone number
      const fullWhatsappNum = formData.phone_number 
        ? `${formData.country_code}${formData.phone_number.replace(/\D/g, '')}`
        : null;

      // Prepare data - convert empty strings to null for date fields and optional text fields
      const dataToSave: Record<string, any> = {
        host_name: formData.host_name,
        host_id: formData.host_id,
        reg_date: formData.reg_date,
        whatsapp_num: fullWhatsappNum,
        pay_method: formData.pay_method,
        user_id: formData.user_id || null,
        captura: formData.captura || null,
        estado: formData.estado,
        ver_date: formData.ver_date || null,
        reclutador: formData.reclutador,
        rec_id: formData.rec_id || null,
        capture1: formData.capture1 || null,
        capture2: formData.capture2 || null,
        capture3: formData.capture3 || null,
      };

      // Only include commission if user is admin
      if (canEditCommission) {
        dataToSave.comision = formData.comision;
      }

      // For editing existing entries, include escalado, issue, resuelto
      if (!isNewEntry) {
        dataToSave.escalado = formData.escalado;
        dataToSave.issue = formData.issue || null;
        dataToSave.resuelto = formData.resuelto || null;
      }

      if (entry?.id) {
        const { error } = await supabase
          .from('hosts')
          .update({ ...dataToSave, updated_at: new Date().toISOString() })
          .eq('id', entry.id);
        if (error) throw error;
        
        // Log the update
        await ActivityLogger.updateHost(user, formData.host_name, entry.id, originalData || {}, dataToSave);
      } else {
        const { data: newEntry, error } = await supabase
          .from('hosts')
          .insert([dataToSave])
          .select()
          .single();
        if (error) throw error;
        
        // Log the creation
        await ActivityLogger.createHost(user, formData.host_name, newEntry?.id || formData.host_id, dataToSave);
        
        // Send email notification for new host registration
        try {
          await emailNotifications.notifyNewHost(
            formData.host_name,
            formData.host_id,
            formData.reclutador
          );
        } catch (emailError) {
          console.error('Email notification failed:', emailError);
        }
      }
      onSave();
    } catch (error) {
      console.error('Save error:', error);
      alert('Error al guardar el registro: ' + (error as any)?.message || 'Error desconocido');
    } finally {
      setSaving(false);
    }
  };


  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  // Handle recruiter selection
  const handleRecruiterChange = (recruiterName: string) => {
    setFormData(prev => ({
      ...prev,
      reclutador: recruiterName,
    }));
    if (errors.reclutador) {
      setErrors(prev => ({ ...prev, reclutador: '' }));
    }
  };

  // Check if all required fields are filled
  const isFormValid = () => {
    return (
      formData.host_name.trim() !== '' &&
      formData.host_id.trim() !== '' &&
      formData.reg_date !== '' &&
      formData.phone_number.trim() !== '' &&
      formData.estado !== '' &&
      formData.reclutador.trim() !== '' &&
      formData.rec_id.trim() !== '' &&
      formData.capture1 !== '' &&
      formData.capture2 !== '' &&
      formData.capture3 !== ''
    );
  };

  const inputClass = (field: string) => `
    w-full px-4 py-2.5 border rounded-lg transition-colors
    ${errors[field] ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}
    focus:ring-2 focus:border-transparent
    ${disabled ? 'bg-gray-100 cursor-not-allowed' : ''}
  `;

  const isFormDisabled = disabled || (!canEditRecord() && !isNewEntry);


  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Advertencia de permisos */}
      {!canEditRecord() && !isNewEntry && !disabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5" />
          <div>
            <p className="text-amber-800 font-medium">Acceso de edición limitado</p>
            <p className="text-amber-700 text-sm">Solo puedes editar los registros que tú creaste. Este registro pertenece a {entry?.reclutador}.</p>
          </div>
        </div>
      )}

      {/* Información Básica */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Información Básica</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre del Emisor <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.host_name}
              onChange={(e) => handleChange('host_name', e.target.value)}
              className={inputClass('host_name')}
              disabled={isFormDisabled}
            />
            {errors.host_name && <p className="mt-1 text-sm text-red-500">{errors.host_name}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID del Emisor <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.host_id}
              onChange={(e) => handleChange('host_id', e.target.value)}
              className={inputClass('host_id')}
              disabled={isFormDisabled}
            />
            {errors.host_id && <p className="mt-1 text-sm text-red-500">{errors.host_id}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fecha de Registro <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={formData.reg_date}
              onChange={(e) => handleChange('reg_date', e.target.value)}
              className={inputClass('reg_date')}
              disabled={isFormDisabled}
            />
            {errors.reg_date && <p className="mt-1 text-sm text-red-500">{errors.reg_date}</p>}
          </div>

          {/* Número de WhatsApp con Código de País */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Número de WhatsApp <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              <select
                value={formData.country_code}
                onChange={(e) => handleChange('country_code', e.target.value)}
                className={`w-full px-3 py-2.5 border rounded-lg transition-colors border-gray-300 focus:ring-blue-500 focus:ring-2 focus:border-transparent ${isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                disabled={isFormDisabled}
              >
                {sortedCountryCodes.map(cc => (
                  <option key={`${cc.code}-${cc.dial_code}`} value={cc.dial_code}>
                    {cc.name} ({cc.dial_code})
                  </option>
                ))}
              </select>
              <input
                type="tel"
                value={formData.phone_number}
                onChange={(e) => handleChange('phone_number', e.target.value)}
                className={`w-full px-4 py-2.5 border rounded-lg transition-colors ${errors.phone_number ? 'border-red-500 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'} focus:ring-2 focus:border-transparent ${isFormDisabled ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                placeholder="Número de teléfono"
                disabled={isFormDisabled}
              />
            </div>
            {errors.phone_number && <p className="mt-1 text-sm text-red-500">{errors.phone_number}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID de Usuario
            </label>
            <input
              type="text"
              value={formData.user_id}
              onChange={(e) => handleChange('user_id', e.target.value)}
              className={inputClass('user_id')}
              disabled={isFormDisabled}
            />
            {errors.user_id && <p className="mt-1 text-sm text-red-500">{errors.user_id}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Método de Pago
            </label>
            <select
              value={formData.pay_method}
              onChange={(e) => handleChange('pay_method', e.target.value)}
              className={inputClass('pay_method')}
              disabled={isFormDisabled}
            >
              {PAY_METHODS.map(method => (
                <option key={method} value={method}>{method}</option>
              ))}
            </select>
            {errors.pay_method && <p className="mt-1 text-sm text-red-500">{errors.pay_method}</p>}
          </div>
        </div>
      </div>

      {/* Estado y Reclutador */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Estado y Reclutador</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Estado <span className="text-red-500">*</span>
            </label>
            <select
              value={formData.estado}
              onChange={(e) => handleChange('estado', e.target.value)}
              className={inputClass('estado')}
              disabled={isFormDisabled}
            >
              {ESTADOS.map(estado => (
                <option key={estado} value={estado}>{estado}</option>
              ))}
            </select>
            {errors.estado && <p className="mt-1 text-sm text-red-500">{errors.estado}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Fecha de Verificación</label>
            <input
              type="date"
              value={formData.ver_date}
              onChange={(e) => handleChange('ver_date', e.target.value)}
              className={inputClass('ver_date')}
              disabled={isFormDisabled}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Comisión
              {!canEditCommission && <span className="text-xs text-gray-500 ml-2">(Solo admin)</span>}
            </label>
            <select
              value={formData.comision}
              onChange={(e) => handleChange('comision', e.target.value)}
              className={`${inputClass('comision')} ${!canEditCommission ? 'bg-gray-100 cursor-not-allowed' : ''}`}
              disabled={isFormDisabled || !canEditCommission}
            >
              {COMISION_OPTIONS.map(option => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reclutador <span className="text-red-500">*</span>
            </label>
            {loadingUsers ? (
              <div className="w-full px-4 py-2.5 border border-gray-300 rounded-lg bg-gray-100 text-gray-500">
                Cargando usuarios...
              </div>
            ) : (
              <select
                value={formData.reclutador}
                onChange={(e) => handleRecruiterChange(e.target.value)}
                className={`${inputClass('reclutador')} ${(isFormDisabled || (isNewEntry && !canManageUsers)) ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                disabled={isFormDisabled || (isNewEntry && !canManageUsers)}
              >
                <option value="">Seleccionar reclutador</option>
                {availableUsers.map(u => (
                  <option key={u.id} value={u.name}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
            )}
            {errors.reclutador && <p className="mt-1 text-sm text-red-500">{errors.reclutador}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              ID del Reclutador <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={formData.rec_id}
              onChange={(e) => handleChange('rec_id', e.target.value)}
              className={inputClass('rec_id')}
              disabled={isFormDisabled}
              placeholder="Ingresa tu ID de reclutador"
            />
            {errors.rec_id && <p className="mt-1 text-sm text-red-500">{errors.rec_id}</p>}
          </div>

        </div>
      </div>

      {/* Problemas y Resolución - Solo mostrar al editar registros existentes */}
      {!isNewEntry && (
        <div className="bg-gray-50 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Problemas y Resolución</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.escalado}
                  onChange={(e) => handleChange('escalado', e.target.checked)}
                  className="w-5 h-5 text-blue-500 border-gray-300 rounded focus:ring-blue-500"
                  disabled={isFormDisabled}
                />
                <span className="text-sm font-medium text-gray-700">Escalado</span>
              </label>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Problema</label>
              <input
                type="text"
                value={formData.issue}
                onChange={(e) => handleChange('issue', e.target.value)}
                className={inputClass('issue')}
                disabled={isFormDisabled}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Resuelto</label>
              <textarea
                value={formData.resuelto}
                onChange={(e) => handleChange('resuelto', e.target.value)}
                className={`${inputClass('resuelto')} resize-none`}
                rows={3}
                disabled={isFormDisabled}
              />
            </div>
          </div>
        </div>
      )}

      {/* Capturas de Imágenes */}
      <div className="bg-gray-50 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Capturas <span className="text-red-500">*</span></h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <ImageUpload
              label="Método de Pago"
              value={formData.captura}
              onChange={(url) => handleChange('captura', url)}
              disabled={isFormDisabled}
            />
            {errors.captura && <p className="mt-1 text-sm text-red-500">{errors.captura}</p>}
          </div>
          <div>
            <ImageUpload
              label="Form de Verificación"
              value={formData.capture1}
              onChange={(url) => handleChange('capture1', url)}
              disabled={isFormDisabled}
              required
            />
            {errors.capture1 && <p className="mt-1 text-sm text-red-500">{errors.capture1}</p>}
          </div>
          <div>
            <ImageUpload
              label="Transmisión"
              value={formData.capture2}
              onChange={(url) => handleChange('capture2', url)}
              disabled={isFormDisabled}
              required
            />
            {errors.capture2 && <p className="mt-1 text-sm text-red-500">{errors.capture2}</p>}
          </div>
          <div>
            <ImageUpload
              label="Chat de WhatsApp"
              value={formData.capture3}
              onChange={(url) => handleChange('capture3', url)}
              disabled={isFormDisabled}
              required
            />
            {errors.capture3 && <p className="mt-1 text-sm text-red-500">{errors.capture3}</p>}
          </div>
        </div>
      </div>

      {/* Acciones */}
      {!disabled && canEditRecord() && (
        <div className="flex justify-end gap-3 pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="px-6 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving || !isFormValid()}
            className={`px-6 py-2.5 text-white rounded-lg transition-colors flex items-center gap-2 ${
              isFormValid() 
                ? 'bg-blue-500 hover:bg-blue-600' 
                : 'bg-gray-400 cursor-not-allowed'
            } disabled:opacity-50`}
            title={!isFormValid() ? 'Por favor completa todos los campos requeridos' : ''}
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Guardando...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Guardar Registro
              </>
            )}
          </button>
        </div>
      )}

    </form>
  );
}
