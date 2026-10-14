import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { AppUser, UserRole } from '@/types';
import ActivityLogger from '@/lib/activityLogger';
import {hostedTrainingConfig} from '@/components/training/hostedTrainingConfig';
import {sharedTrainingApi,logoutSharedTraining} from '@/components/training/sharedTrainingSession';

interface AuthContextType {
  user: AppUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  hasPermission: (requiredRole: UserRole) => boolean;
  canEdit: boolean;
  canManageUsers: boolean;
  isSuperAdmin: boolean;
  isSubAdmin: boolean;
  canChangeUserRole: (targetUserRole: UserRole) => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Hosted preview uses one fresh login and keeps its verified session in memory.
    // A stored legacy profile alone must not restore the unified preview entry.
    if(hostedTrainingConfig()){localStorage.removeItem('hostmanager_user');setLoading(false);return;}
    // Check for stored session
    const storedUser = localStorage.getItem('hostmanager_user');
    if (storedUser) {
      try {const restored=JSON.parse(storedUser);restored.password_hash='';setUser(restored);localStorage.setItem('hostmanager_user',JSON.stringify(restored));} catch {localStorage.removeItem('hostmanager_user');}
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase
        .from('app_users')
        .select('*')
        .eq('email', email)
        .eq('password_hash', password)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return { success: false, error: 'Invalid credentials or account inactive' };
      }

      // In the isolated hosted preview, validate both backends from this one form.
      // The password is used for these requests only; it is never retained.
      const training=sharedTrainingApi(hostedTrainingConfig(),email);
      if(training){
        try {await training.login(email,password);}
        catch {return {success:false,error:'La app validó tus datos, pero capacitación no pudo iniciar. Ambas cuentas deben usar la misma contraseña y la cuenta de capacitación debe estar confirmada y autorizada.'};}
      }
      const profile={...data,password_hash:''};

      // Update last login
      await supabase
        .from('app_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.id);

      setUser(profile);
      if(!training)localStorage.setItem('hostmanager_user', JSON.stringify(profile));
      
      // Log the login activity
      await ActivityLogger.login(profile);
      
      return { success: true };
    } catch (err) {
      await logoutSharedTraining();setUser(null);localStorage.removeItem('hostmanager_user');
      return { success: false, error: 'Login failed' };
    }
  };

  const logout = async () => {
    const trainingLogout=logoutSharedTraining();
    setUser(null);localStorage.removeItem('hostmanager_user');
    await trainingLogout;
    // Log the logout activity after credentials/session state is cleared
    if (user) {
      await ActivityLogger.logout(user);
    }
    setUser(null);
    localStorage.removeItem('hostmanager_user');
  };

  // Role hierarchy: superadmin > subadmin > edit > readonly
  const roleHierarchy: Record<UserRole, number> = {
    readonly: 1,
    edit: 2,
    subadmin: 3,
    superadmin: 4,
  };

  const hasPermission = (requiredRole: UserRole): boolean => {
    if (!user) return false;
    return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
  };

  // SuperAdmin and SubAdmin can edit
  const canEdit = user?.role === 'edit' || user?.role === 'subadmin' || user?.role === 'superadmin';
  
  // Both SuperAdmin and SubAdmin can manage users
  const canManageUsers = user?.role === 'superadmin' || user?.role === 'subadmin';
  
  // Check if user is SuperAdmin
  const isSuperAdmin = user?.role === 'superadmin';
  
  // Check if user is SubAdmin
  const isSubAdmin = user?.role === 'subadmin';

  // Check if current user can change a target user's role
  const canChangeUserRole = (targetUserRole: UserRole): boolean => {
    if (!user) return false;
    
    // SuperAdmin can change any role
    if (user.role === 'superadmin') return true;
    
    // SubAdmin can only change roles of edit and readonly users
    // SubAdmin CANNOT change superadmin or other subadmin roles
    if (user.role === 'subadmin') {
      return targetUserRole === 'edit' || targetUserRole === 'readonly';
    }
    
    return false;
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      loading, 
      login, 
      logout, 
      hasPermission, 
      canEdit, 
      canManageUsers,
      isSuperAdmin,
      isSubAdmin,
      canChangeUserRole
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

