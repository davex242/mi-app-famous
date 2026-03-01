// Type definitions for the Host Manager application

export interface Host {
  id: string;
  host_name: string;
  host_id: string;
  reg_date: string;
  whatsapp_num: string;
  pay_method: 'Binance' | 'Nequi' | 'Payoneer' | 'Paypal' | 'Venmo' | 'Zelle' | 'CashApp';
  user_id: string;
  captura: string;
  estado: 'Verified' | 'Pending' | 'Rejected';
  escalado: boolean;
  issue: string;
  resuelto: string;
  ver_date: string;
  reclutador: string;
  rec_id: string;
  capture1: string;
  capture2: string;
  capture3: string;
  comision: 'Paid' | 'Pending';
  real: boolean;
  created_at: string;
  updated_at: string;
}

export interface AppUser {
  id: string;
  email: string;
  name: string;
  role: 'superadmin' | 'subadmin' | 'edit' | 'readonly';
  is_active: boolean;
  created_at: string;
  last_login: string;
}


export interface ActivityLog {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  action_type: 'login' | 'logout' | 'create' | 'update' | 'delete' | 'commission_payment' | 'credit_purchase' | 'import' | 'export' | 'escalation' | 'password_reset';
  action_description: string;
  entity_type: string;
  entity_id: string;
  old_values: Record<string, any> | null;
  new_values: Record<string, any> | null;
  ip_address: string;
  created_at: string;
}

export type UserRole = 'superadmin' | 'subadmin' | 'edit' | 'readonly';


export type ActionType = 'login' | 'logout' | 'create' | 'update' | 'delete' | 'commission_payment' | 'credit_purchase' | 'import' | 'export' | 'escalation' | 'password_reset' | 'bulk_verification' | 'commission_settings_update' | 'EXPORT';





export interface FilterOptions {
  reclutador: string;
  estado: string;
  payMethod: string;
  escalado: string;
  dateFrom: string;
  dateTo: string;
  comision: string;
}

export interface CountryCode {
  name: string;
  code: string;
  dial_code: string;
}
