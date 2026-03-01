import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { AppUser, UserRole } from '@/types';
import ActivityLogger from '@/lib/activityLogger';

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
    // Check for stored session
    const storedUser = localStorage.getItem('hostmanager_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
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

      // Update last login
      await supabase
        .from('app_users')
        .update({ last_login: new Date().toISOString() })
        .eq('id', data.id);

      setUser(data);
      localStorage.setItem('hostmanager_user', JSON.stringify(data));
      
      // Log the login activity
      await ActivityLogger.login(data);
      
      return { success: true };
    } catch (err) {
      return { success: false, error: 'Login failed' };
    }
  };

  const logout = async () => {
    // Log the logout activity before clearing user
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
