import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Plus, 
  Edit, 
  Trash2, 
  Shield, 
  Eye, 
  EyeOff,
  Pencil,
  AlertTriangle,
  RefreshCw,
  Check,
  X,
  ChevronDown,
  KeyRound,
  Copy,
  Mail,
  ShieldCheck,
  Crown
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AppUser, UserRole } from '@/types';
import Modal from './ui/Modal';
import ActivityLogger from '@/lib/activityLogger';
import { useAuth } from '@/context/AuthContext';
import { checkPasswordStrength, generateRandomPassword, isPasswordValid } from '@/lib/passwordUtils';
import PasswordStrengthIndicator from './PasswordStrengthIndicator';

export default function UserManagement() {
  const { user: currentUser, isSuperAdmin, isSubAdmin, canChangeUserRole } = useAuth();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState<AppUser | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<AppUser | null>(null);
  const [roleChangeConfirm, setRoleChangeConfirm] = useState<{user: AppUser, newRole: UserRole} | null>(null);
  const [formData, setFormData] = useState({ email: '', password: '', name: '', role: 'readonly' as UserRole });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  // Password reset states
  const [resetPasswordModal, setResetPasswordModal] = useState<AppUser | null>(null);
  const [resetPasswordType, setResetPasswordType] = useState<'generate' | 'manual'>('generate');
  const [manualPassword, setManualPassword] = useState('');
  const [confirmManualPassword, setConfirmManualPassword] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [passwordResetSuccess, setPasswordResetSuccess] = useState(false);
  const [sendEmailNotification, setSendEmailNotification] = useState(true);
  const [copiedPassword, setCopiedPassword] = useState(false);
  const [visiblePasswords, setVisiblePasswords] = useState<Set<string>>(new Set());

  const passwordStrength = checkPasswordStrength(manualPassword);

  useEffect(() => { fetchUsers(); }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('app_users').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      setUsers(data || []);
    } catch (error) { console.error('Fetch error:', error); }
    finally { setLoading(false); }
  };

  const resetForm = () => { setFormData({ email: '', password: '', name: '', role: 'readonly' }); setErrors({}); setEditingUser(null); };
  const openAddForm = () => { resetForm(); setShowForm(true); };
  const openEditForm = (user: AppUser) => { setEditingUser(user); setFormData({ email: user.email, password: '', name: user.name, role: user.role }); setShowForm(true); };

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(formData.email)) newErrors.email = 'Invalid email format';
    if (!editingUser && !formData.password.trim()) newErrors.password = 'Password is required';
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      if (editingUser) {
        const updateData: any = { email: formData.email, name: formData.name, role: formData.role };
        if (formData.password) updateData.password_hash = formData.password;
        const { error } = await supabase.from('app_users').update(updateData).eq('id', editingUser.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('app_users').insert([{ email: formData.email, password_hash: formData.password, name: formData.name, role: formData.role }]);
        if (error) throw error;
      }
      setShowForm(false); resetForm(); fetchUsers();
    } catch (error: any) {
      if (error.code === '23505') setErrors({ email: 'Email already exists' });
      else alert('Failed to save user');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const { error } = await supabase.from('app_users').delete().eq('id', deleteConfirm.id);
      if (error) throw error;
      setDeleteConfirm(null); fetchUsers();
    } catch (error) { alert('Failed to delete user'); }
  };

  const handleRoleChangeRequest = (user: AppUser, newRole: UserRole) => {
    if (user.role === newRole) return;
    
    // Check if current user can change this user's role
    if (!canChangeUserRole(user.role)) {
      alert('You do not have permission to change this user\'s role');
      return;
    }
    
    // SubAdmin cannot assign superadmin or subadmin roles
    if (isSubAdmin && (newRole === 'superadmin' || newRole === 'subadmin')) {
      alert('You do not have permission to assign this role');
      return;
    }
    
    setRoleChangeConfirm({ user, newRole });
  };

  const handleRoleChangeConfirm = async () => {
    if (!roleChangeConfirm) return;
    const { user, newRole } = roleChangeConfirm;
    setChangingRole(user.id);
    try {
      const oldRole = user.role;
      const { error } = await supabase.from('app_users').update({ role: newRole }).eq('id', user.id);
      if (error) throw error;
      await ActivityLogger.roleChange(currentUser, user.name, oldRole, newRole);
      setRoleChangeConfirm(null); fetchUsers();
    } catch (error) { alert('Failed to change user role'); }
    finally { setChangingRole(null); }
  };

  const toggleUserStatus = async (user: AppUser) => {
    // Check if current user can modify this user
    if (!canChangeUserRole(user.role) && user.id !== currentUser?.id) {
      alert('You do not have permission to modify this user');
      return;
    }
    
    try {
      const { error } = await supabase.from('app_users').update({ is_active: !user.is_active }).eq('id', user.id);
      if (error) throw error;
      fetchUsers();
    } catch (error) { console.error('Toggle error:', error); }
  };

  // Password Reset Functions
  const openResetPasswordModal = (user: AppUser) => {
    // Check if current user can reset this user's password
    if (!canChangeUserRole(user.role) && user.id !== currentUser?.id) {
      alert('You do not have permission to reset this user\'s password');
      return;
    }
    
    setResetPasswordModal(user);
    setResetPasswordType('generate');
    setManualPassword('');
    setConfirmManualPassword('');
    setGeneratedPassword(generateRandomPassword(12));
    setPasswordResetSuccess(false);
    setSendEmailNotification(true);
    setCopiedPassword(false);
  };

  const closeResetPasswordModal = () => {
    setResetPasswordModal(null);
    setManualPassword('');
    setConfirmManualPassword('');
    setGeneratedPassword('');
    setPasswordResetSuccess(false);
  };

  const regeneratePassword = () => {
    setGeneratedPassword(generateRandomPassword(12));
    setCopiedPassword(false);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPassword(true);
    setTimeout(() => setCopiedPassword(false), 2000);
  };

  const handleResetPassword = async () => {
    if (!resetPasswordModal) return;

    const newPassword = resetPasswordType === 'generate' ? generatedPassword : manualPassword;

    // Validate manual password
    if (resetPasswordType === 'manual') {
      if (!isPasswordValid(manualPassword)) {
        alert('Password does not meet strength requirements');
        return;
      }
      if (manualPassword !== confirmManualPassword) {
        alert('Passwords do not match');
        return;
      }
    }

    setResettingPassword(true);

    try {
      // Update password in database
      const { error } = await supabase
        .from('app_users')
        .update({ password_hash: newPassword })
        .eq('id', resetPasswordModal.id);

      if (error) throw error;

      // Log the activity
      await ActivityLogger.log({
        action: 'password_reset',
        user_name: currentUser?.name || 'Unknown',
        user_email: currentUser?.email || 'Unknown',
        details: `Admin reset password for user: ${resetPasswordModal.name} (${resetPasswordModal.email})`,
        metadata: { target_user: resetPasswordModal.email }
      });

      // Send email notification if enabled
      if (sendEmailNotification) {
        try {
          await supabase.functions.invoke('send-notification', {
            body: {
              type: 'password_reset_by_admin',
              data: {
                userEmail: resetPasswordModal.email,
                userName: resetPasswordModal.name,
                tempPassword: newPassword,
              },
            },
          });
        } catch (emailError) {
          console.error('Failed to send email notification:', emailError);
        }
      }

      setPasswordResetSuccess(true);
    } catch (error) {
      console.error('Password reset error:', error);
      alert('Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  };

  const getRoleBadge = (role: string) => {
    const styles: Record<string, string> = { 
      superadmin: 'bg-amber-100 text-amber-700 border-amber-200', 
      subadmin: 'bg-purple-100 text-purple-700 border-purple-200', 
      edit: 'bg-blue-100 text-blue-700 border-blue-200', 
      readonly: 'bg-gray-100 text-gray-700 border-gray-200' 
    };
    const icons: Record<string, React.ReactNode> = { 
      superadmin: <Crown className="w-3 h-3" />, 
      subadmin: <ShieldCheck className="w-3 h-3" />, 
      edit: <Pencil className="w-3 h-3" />, 
      readonly: <Eye className="w-3 h-3" /> 
    };
    const labels: Record<string, string> = {
      superadmin: 'Super Admin',
      subadmin: 'Sub Admin',
      edit: 'Edit',
      readonly: 'Readonly'
    };
    return <span className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border ${styles[role] || styles.readonly}`}>{icons[role]}{labels[role] || role}</span>;
  };

  const togglePasswordVisibility = (userId: string) => {
    const newVisible = new Set(visiblePasswords);
    if (newVisible.has(userId)) {
      newVisible.delete(userId);
    } else {
      newVisible.add(userId);
    }
    setVisiblePasswords(newVisible);
  };

  const getRoleColor = (role: string) => {
    switch (role) { 
      case 'superadmin': return 'text-amber-700 bg-amber-50'; 
      case 'subadmin': return 'text-purple-700 bg-purple-50'; 
      case 'edit': return 'text-blue-700 bg-blue-50'; 
      default: return 'text-gray-700 bg-gray-50'; 
    } 
  };

  // Get available roles for the dropdown based on current user's permissions
  const getAvailableRoles = (targetUser: AppUser): UserRole[] => {
    // If it's the current user, they can't change their own role
    if (targetUser.id === currentUser?.id) return [targetUser.role];
    
    // SuperAdmin can assign any role
    if (isSuperAdmin) {
      return ['readonly', 'edit', 'subadmin', 'superadmin'];
    }
    
    // SubAdmin can only assign edit and readonly roles
    if (isSubAdmin) {
      // If target user is superadmin or subadmin, SubAdmin can't change their role
      if (targetUser.role === 'superadmin' || targetUser.role === 'subadmin') {
        return [targetUser.role]; // Only show current role (disabled)
      }
      return ['readonly', 'edit'];
    }
    
    return [targetUser.role];
  };

  // Check if role dropdown should be disabled
  const isRoleChangeDisabled = (targetUser: AppUser): boolean => {
    // Can't change own role
    if (targetUser.id === currentUser?.id) return true;
    
    // If currently changing this user's role
    if (changingRole === targetUser.id) return true;
    
    // SubAdmin can't change superadmin or subadmin roles
    if (isSubAdmin && (targetUser.role === 'superadmin' || targetUser.role === 'subadmin')) {
      return true;
    }
    
    return false;
  };

  // Check if user can be deleted
  const canDeleteUser = (targetUser: AppUser): boolean => {
    // Can't delete yourself
    if (targetUser.id === currentUser?.id) return false;
    
    // SuperAdmin can delete anyone
    if (isSuperAdmin) return true;
    
    // SubAdmin can only delete edit and readonly users
    if (isSubAdmin) {
      return targetUser.role === 'edit' || targetUser.role === 'readonly';
    }
    
    return false;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div><h1 className="text-2xl font-bold text-gray-900">User Management</h1><p className="text-gray-500 mt-1">Manage user accounts and permissions</p></div>
        <div className="flex items-center gap-3">
          <button onClick={fetchUsers} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />Refresh</button>
          <button onClick={openAddForm} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 flex items-center gap-2"><Plus className="w-4 h-4" />Add User</button>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Role Permissions</h3>
        <div className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">{getRoleBadge('superadmin')}<span className="text-sm text-gray-600">Full access + can manage all users</span></div>
          <div className="flex items-center gap-2">{getRoleBadge('subadmin')}<span className="text-sm text-gray-600">Full access + can manage edit/readonly users</span></div>
          <div className="flex items-center gap-2">{getRoleBadge('edit')}<span className="text-sm text-gray-600">View + add/modify entries</span></div>
          <div className="flex items-center gap-2">{getRoleBadge('readonly')}<span className="text-sm text-gray-600">View data only</span></div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">User</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Password</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Role</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Change Role</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Last Login</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {loading ? (<tr><td colSpan={7} className="px-6 py-12 text-center"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto" /></td></tr>
              ) : users.length === 0 ? (<tr><td colSpan={7} className="px-6 py-12 text-center text-gray-500">No users found</td></tr>
              ) : (users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4"><div><p className="font-medium text-gray-900">{user.name}</p><p className="text-sm text-gray-500">{user.email}</p></div></td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-mono text-gray-600">
                        {visiblePasswords.has(user.id) ? (user.password_hash || '—') : '••••••••'}
                      </span>
                      <button
                        onClick={() => togglePasswordVisibility(user.id)}
                        className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                        title={visiblePasswords.has(user.id) ? 'Hide password' : 'Show password'}
                      >
                        {visiblePasswords.has(user.id) ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                  <td className="px-6 py-4">{getRoleBadge(user.role)}</td>
                  <td className="px-6 py-4">
                    <div className="relative">
                      <select 
                        value={user.role} 
                        onChange={(e) => handleRoleChangeRequest(user, e.target.value as UserRole)} 
                        disabled={isRoleChangeDisabled(user)} 
                        className={`appearance-none px-3 py-1.5 pr-8 rounded-lg border text-sm font-medium cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed ${getRoleColor(user.role)}`}
                      >
                        {getAvailableRoles(user).map(role => (
                          <option key={role} value={role}>
                            {role === 'superadmin' ? 'Super Admin' : 
                             role === 'subadmin' ? 'Sub Admin' : 
                             role.charAt(0).toUpperCase() + role.slice(1)}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 pointer-events-none text-gray-500" />
                    </div>
                    {user.id === currentUser?.id && <p className="text-xs text-gray-400 mt-1">Cannot change own role</p>}
                    {isSubAdmin && (user.role === 'superadmin' || user.role === 'subadmin') && user.id !== currentUser?.id && (
                      <p className="text-xs text-amber-500 mt-1">Cannot modify admin roles</p>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    <button 
                      onClick={() => toggleUserStatus(user)} 
                      disabled={!canChangeUserRole(user.role) && user.id !== currentUser?.id}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full disabled:opacity-50 disabled:cursor-not-allowed ${user.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                    >
                      {user.is_active ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}{user.is_active ? 'Active' : 'Inactive'}
                    </button>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1">
                      <button 
                        onClick={() => openResetPasswordModal(user)} 
                        className="p-2 text-gray-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed" 
                        title="Reset Password"
                        disabled={!canChangeUserRole(user.role) && user.id !== currentUser?.id}
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => openEditForm(user)} 
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed" 
                        title="Edit"
                        disabled={!canChangeUserRole(user.role) && user.id !== currentUser?.id}
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => setDeleteConfirm(user)} 
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed" 
                        title="Delete" 
                        disabled={!canDeleteUser(user)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit User Modal */}
      <Modal isOpen={showForm} onClose={() => { setShowForm(false); resetForm(); }} title={editingUser ? 'Edit User' : 'Add New User'} size="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label><input type="text" value={formData.name} onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))} className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.name ? 'border-red-500' : 'border-gray-300'}`} />{errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}</div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Email</label><input type="email" value={formData.email} onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))} className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.email ? 'border-red-500' : 'border-gray-300'}`} />{errors.email && <p className="mt-1 text-sm text-red-500">{errors.email}</p>}</div>
          <div><label className="block text-sm font-medium text-gray-700 mb-1">Password {editingUser && <span className="text-gray-400">(leave blank to keep current)</span>}</label><input type="password" value={formData.password} onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))} className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 ${errors.password ? 'border-red-500' : 'border-gray-300'}`} />{errors.password && <p className="mt-1 text-sm text-red-500">{errors.password}</p>}</div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select 
              value={formData.role} 
              onChange={(e) => setFormData(prev => ({ ...prev, role: e.target.value as UserRole }))} 
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="readonly">Read Only</option>
              <option value="edit">Edit</option>
              {/* SubAdmin can only create edit and readonly users */}
              {isSuperAdmin && <option value="subadmin">Sub Admin</option>}
              {isSuperAdmin && <option value="superadmin">Super Admin</option>}
            </select>
            {isSubAdmin && (
              <p className="text-xs text-amber-500 mt-1">As a Sub Admin, you can only create Edit and Readonly users</p>
            )}
          </div>
          <div className="flex justify-end gap-3 pt-4"><button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button><button type="submit" disabled={saving} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">{saving ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</> : (editingUser ? 'Update User' : 'Create User')}</button></div>
        </form>
      </Modal>

      {/* Role Change Confirmation Modal */}
      <Modal isOpen={roleChangeConfirm !== null} onClose={() => setRoleChangeConfirm(null)} title="Confirm Role Change" size="sm">
        <div className="text-center">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4"><Shield className="w-6 h-6 text-amber-600" /></div>
          <p className="text-gray-600 mb-4">Are you sure you want to change the role for <strong>{roleChangeConfirm?.user.name}</strong>?</p>
          <div className="flex items-center justify-center gap-3 mb-6"><div className="text-center"><p className="text-xs text-gray-500 mb-1">Current Role</p>{roleChangeConfirm && getRoleBadge(roleChangeConfirm.user.role)}</div><div className="text-gray-400">→</div><div className="text-center"><p className="text-xs text-gray-500 mb-1">New Role</p>{roleChangeConfirm && getRoleBadge(roleChangeConfirm.newRole)}</div></div>
          {(roleChangeConfirm?.newRole === 'superadmin' || roleChangeConfirm?.newRole === 'subadmin') && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6 text-left">
              <p className="text-amber-800 text-sm">
                <strong>Warning:</strong> {roleChangeConfirm?.newRole === 'superadmin' 
                  ? 'Super Admin users have full access to all system features including managing all users.' 
                  : 'Sub Admin users have full access to all features but can only manage Edit and Readonly users.'}
              </p>
            </div>
          )}
          <div className="flex justify-center gap-3"><button onClick={() => setRoleChangeConfirm(null)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleRoleChangeConfirm} disabled={changingRole !== null} className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 flex items-center gap-2">{changingRole ? <><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Changing...</> : 'Confirm Change'}</button></div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={deleteConfirm !== null} onClose={() => setDeleteConfirm(null)} title="Confirm Delete" size="sm">
        <div className="text-center">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-6 h-6 text-red-600" /></div>
          <p className="text-gray-600 mb-6">Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>? This action cannot be undone.</p>
          <div className="flex justify-center gap-3"><button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">Cancel</button><button onClick={handleDelete} className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600">Delete</button></div>
        </div>
      </Modal>

      {/* Password Reset Modal */}
      <Modal isOpen={resetPasswordModal !== null} onClose={closeResetPasswordModal} title="Reset User Password" size="md">
        {resetPasswordModal && (
          <div className="space-y-6">
            {!passwordResetSuccess ? (
              <>
                {/* User Info */}
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                  <p className="text-sm text-gray-500">Resetting password for:</p>
                  <p className="font-semibold text-gray-900">{resetPasswordModal.name}</p>
                  <p className="text-sm text-gray-600">{resetPasswordModal.email}</p>
                </div>

                {/* Reset Type Selection */}
                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">Password Reset Method</label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setResetPasswordType('generate')}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        resetPasswordType === 'generate'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <RefreshCw className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-gray-900">Auto Generate</span>
                      </div>
                      <p className="text-xs text-gray-500">Generate a secure random password</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setResetPasswordType('manual')}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        resetPasswordType === 'manual'
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Pencil className="w-4 h-4 text-blue-600" />
                        <span className="font-medium text-gray-900">Manual Entry</span>
                      </div>
                      <p className="text-xs text-gray-500">Set a specific password</p>
                    </button>
                  </div>
                </div>

                {/* Generated Password */}
                {resetPasswordType === 'generate' && (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-700">Generated Password</label>
                    <div className="flex gap-2">
                      <div className="flex-1 relative">
                        <input
                          type="text"
                          value={generatedPassword}
                          readOnly
                          className="w-full px-4 py-3 bg-gray-100 border border-gray-300 rounded-lg font-mono text-lg tracking-wider"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => copyToClipboard(generatedPassword)}
                        className={`px-4 py-2 rounded-lg border transition-all flex items-center gap-2 ${
                          copiedPassword
                            ? 'bg-green-50 border-green-300 text-green-700'
                            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {copiedPassword ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                        {copiedPassword ? 'Copied!' : 'Copy'}
                      </button>
                      <button
                        type="button"
                        onClick={regeneratePassword}
                        className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                )}

                {/* Manual Password Entry */}
                {resetPasswordType === 'manual' && (
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
                      <input
                        type="password"
                        value={manualPassword}
                        onChange={(e) => setManualPassword(e.target.value)}
                        className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        placeholder="Enter new password"
                      />
                    </div>
                    
                    {manualPassword && (
                      <PasswordStrengthIndicator strength={passwordStrength} />
                    )}

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
                      <input
                        type="password"
                        value={confirmManualPassword}
                        onChange={(e) => setConfirmManualPassword(e.target.value)}
                        className={`w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-blue-500 ${
                          confirmManualPassword && confirmManualPassword !== manualPassword
                            ? 'border-red-500'
                            : 'border-gray-300'
                        }`}
                        placeholder="Confirm new password"
                      />
                      {confirmManualPassword && confirmManualPassword !== manualPassword && (
                        <p className="text-red-500 text-sm mt-1">Passwords do not match</p>
                      )}
                    </div>
                  </div>
                )}

                {/* Email Notification Option */}
                <div className="flex items-center gap-3 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <input
                    type="checkbox"
                    id="sendEmail"
                    checked={sendEmailNotification}
                    onChange={(e) => setSendEmailNotification(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="sendEmail" className="flex items-center gap-2 text-sm text-blue-800 cursor-pointer">
                    <Mail className="w-4 h-4" />
                    Send password reset email to user
                  </label>
                </div>

                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
                  <button
                    type="button"
                    onClick={closeResetPasswordModal}
                    className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleResetPassword}
                    disabled={
                      resettingPassword ||
                      (resetPasswordType === 'manual' && (!isPasswordValid(manualPassword) || manualPassword !== confirmManualPassword))
                    }
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {resettingPassword ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      <>
                        <KeyRound className="w-4 h-4" />
                        Reset Password
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              /* Success State */
              <div className="text-center py-6">
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Check className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">Password Reset Successful!</h3>
                <p className="text-gray-600 mb-4">
                  The password for <strong>{resetPasswordModal.name}</strong> has been reset.
                </p>
                
                {sendEmailNotification && (
                  <div className="bg-blue-50 rounded-lg p-4 mb-6 text-left">
                    <div className="flex items-center gap-2 text-blue-800">
                      <Mail className="w-4 h-4" />
                      <span className="text-sm">An email with the new password has been sent to {resetPasswordModal.email}</span>
                    </div>
                  </div>
                )}

                <div className="bg-gray-50 rounded-lg p-4 mb-6">
                  <p className="text-sm text-gray-500 mb-2">New Password:</p>
                  <div className="flex items-center justify-center gap-2">
                    <code className="text-lg font-mono bg-white px-4 py-2 rounded border">
                      {resetPasswordType === 'generate' ? generatedPassword : manualPassword}
                    </code>
                    <button
                      onClick={() => copyToClipboard(resetPasswordType === 'generate' ? generatedPassword : manualPassword)}
                      className={`p-2 rounded-lg border transition-all ${
                        copiedPassword
                          ? 'bg-green-50 border-green-300 text-green-700'
                          : 'border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {copiedPassword ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  onClick={closeResetPasswordModal}
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Done
                </button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
