import React from 'react';
import { ArrowLeft, Lock, AlertCircle, Eye } from 'lucide-react';
import EntryForm from './EntryForm';
import emailNotifications from '@/lib/emailNotifications';
import { useAuth } from '@/context/AuthContext';

interface AddEntryProps {
  onBack: () => void;
  onSave: () => void;
}

export default function AddEntry({ onBack, onSave }: AddEntryProps) {
  const { user, canEdit } = useAuth();
  const isReadonly = user?.role === 'readonly';

  const handleSave = async () => {
    // Note: The actual email notification is sent from EntryForm after successful save
    // This wrapper just handles the navigation
    onSave();
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-center gap-4">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isReadonly ? 'Ver Formulario de Registro' : 'Agregar Nuevo Registro'}
          </h1>
          <p className="text-gray-500 mt-1">
            {isReadonly ? 'Tienes acceso de solo lectura a este formulario' : 'Completa la información del emisor a continuación'}
          </p>
        </div>
      </div>

      {/* Advertencia de acceso de solo lectura */}
      {isReadonly && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-amber-100 rounded-lg">
              <Lock className="w-6 h-6 text-amber-600" />
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-amber-800">Acceso de Solo Lectura</h3>
              <p className="text-amber-700 mt-2">
                Actualmente tienes permisos de <strong>solo lectura</strong>. Puedes ver la estructura del formulario, 
                pero no puedes enviar nuevos registros ni editar los existentes.
              </p>
              <div className="mt-4 p-4 bg-white rounded-lg border border-amber-200">
                <h4 className="font-medium text-amber-800 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4" />
                  ¿Necesitas acceso de edición?
                </h4>
                <p className="text-amber-700 text-sm mt-2">
                  Para solicitar permisos de edición, contacta a tu administrador del sistema. 
                  Ellos pueden actualizar tu cuenta desde el panel de Gestión de Usuarios.
                </p>
              </div>
              <div className="mt-4 flex items-center gap-2 text-sm text-amber-600">
                <Eye className="w-4 h-4" />
                <span>El formulario a continuación se muestra en modo de vista previa</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Formulario */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        {isReadonly ? (
          <div className="relative">
            {/* Overlay para usuarios de solo lectura */}
            <div className="absolute inset-0 bg-gray-50/50 z-10 pointer-events-none" />
            <EntryForm
              onSave={handleSave}
              onCancel={onBack}
              isNewEntry={true}
              disabled={true}
            />
            {/* Mensaje de pie de página para solo lectura */}
            <div className="mt-6 pt-6 border-t border-gray-200">
              <div className="flex items-center justify-center gap-3 text-gray-500">
                <Lock className="w-5 h-5" />
                <span>El envío del formulario está deshabilitado para usuarios de solo lectura</span>
              </div>
            </div>
          </div>
        ) : (
          <EntryForm
            onSave={handleSave}
            onCancel={onBack}
            isNewEntry={true}
          />
        )}
      </div>
    </div>
  );
}
