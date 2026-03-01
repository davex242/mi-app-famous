// Activity Logger utility for tracking user actions
import { supabase } from '@/lib/supabase';
import { AppUser, ActionType } from '@/types';

interface LogActivityParams {
  user: AppUser | null;
  actionType: ActionType;
  description: string;
  entityType?: string;
  entityId?: string;
  oldValues?: Record<string, any> | null;
  newValues?: Record<string, any> | null;
}

export async function logActivity({
  user,
  actionType,
  description,
  entityType,
  entityId,
  oldValues,
  newValues,
}: LogActivityParams): Promise<void> {
  try {
    const { error } = await supabase.from('activity_logs').insert({
      user_id: user?.id || null,
      user_email: user?.email || 'system',
      user_name: user?.name || 'System',
      action_type: actionType,
      action_description: description,
      entity_type: entityType || null,
      entity_id: entityId || null,
      old_values: oldValues || null,
      new_values: newValues || null,
      ip_address: null,
    });

    if (error) {
      console.error('Failed to log activity:', error);
    }
  } catch (err) {
    console.error('Activity logging error:', err);
  }
}

// Helper functions for common actions
export const ActivityLogger = {
  login: (user: AppUser) =>
    logActivity({
      user,
      actionType: 'login',
      description: `User ${user.name} logged in`,
      entityType: 'user',
      entityId: user.id,
    }),

  logout: (user: AppUser) =>
    logActivity({
      user,
      actionType: 'logout',
      description: `User ${user.name} logged out`,
      entityType: 'user',
      entityId: user.id,
    }),

  createHost: (user: AppUser | null, hostName: string, hostId: string, newData: Record<string, any>) =>
    logActivity({
      user,
      actionType: 'create',
      description: `Created new host: ${hostName} (ID: ${hostId})`,
      entityType: 'host',
      entityId: hostId,
      newValues: newData,
    }),

  updateHost: (user: AppUser | null, hostName: string, hostId: string, oldData: Record<string, any>, newData: Record<string, any>) =>
    logActivity({
      user,
      actionType: 'update',
      description: `Updated host: ${hostName} (ID: ${hostId})`,
      entityType: 'host',
      entityId: hostId,
      oldValues: oldData,
      newValues: newData,
    }),

  deleteHost: (user: AppUser | null, hostName: string, hostId: string, oldData: Record<string, any>) =>
    logActivity({
      user,
      actionType: 'delete',
      description: `Deleted host: ${hostName} (ID: ${hostId})`,
      entityType: 'host',
      entityId: hostId,
      oldValues: oldData,
    }),

  commissionPayment: (user: AppUser | null, recruiterName: string, count: number, totalAmount: number) =>
    logActivity({
      user,
      actionType: 'commission_payment',
      description: `Processed commission payment for ${recruiterName}: ${count} accounts, $${totalAmount.toFixed(2)}`,
      entityType: 'commission',
      newValues: { recruiter: recruiterName, count, amount: totalAmount },
    }),

  creditPurchase: (user: AppUser | null, amount: number, credits: number) =>
    logActivity({
      user,
      actionType: 'credit_purchase',
      description: `Purchased ${credits} credits for $${amount}`,
      entityType: 'credits',
      newValues: { amount, credits },
    }),

  importData: (user: AppUser | null, recordCount: number) =>
    logActivity({
      user,
      actionType: 'import',
      description: `Imported ${recordCount} records`,
      entityType: 'import',
      newValues: { recordCount },
    }),

  exportData: (user: AppUser | null, reportType: string, recordCount: number) =>
    logActivity({
      user,
      actionType: 'export',
      description: `Exported ${reportType} report with ${recordCount} records`,
      entityType: 'export',
      newValues: { reportType, recordCount },
    }),

  escalation: (user: AppUser | null, hostIds: string[], reportType: string) =>
    logActivity({
      user,
      actionType: 'escalation',
      description: `Escalated ${hostIds.length} accounts via ${reportType}`,
      entityType: 'escalation',
      newValues: { hostIds, reportType },
    }),

  markAsReal: (user: AppUser | null, hostName: string, hostId: string, isReal: boolean) =>
    logActivity({
      user,
      actionType: 'update',
      description: `Marked host ${hostName} as ${isReal ? 'Real' : 'Not Real'}`,
      entityType: 'host',
      entityId: hostId,
      newValues: { real: isReal },
    }),

  bulkUpdate: (user: AppUser | null, count: number, changes: Record<string, any>) =>
    logActivity({
      user,
      actionType: 'update',
      description: `Bulk updated ${count} records`,
      entityType: 'host',
      newValues: { count, changes },
    }),

  bulkVerification: (user: AppUser | null, successCount: number, notFoundCount: number, alreadyVerifiedCount: number, hostIds: string[]) =>
    logActivity({
      user,
      actionType: 'bulk_verification',
      description: `Bulk verification: ${successCount} verified, ${alreadyVerifiedCount} already verified, ${notFoundCount} not found`,
      entityType: 'host',
      newValues: { 
        successCount, 
        notFoundCount, 
        alreadyVerifiedCount,
        hostIds,
        verificationDate: new Date().toISOString().split('T')[0]
      },
    }),

  roleChange: (user: AppUser | null, targetUserName: string, oldRole: string, newRole: string) =>
    logActivity({
      user,
      actionType: 'update',
      description: `Changed role for ${targetUserName} from ${oldRole} to ${newRole}`,
      entityType: 'user',
      oldValues: { role: oldRole },
      newValues: { role: newRole },
    }),

  passwordReset: (user: AppUser | null, targetUserName: string, targetUserEmail: string, method: 'admin' | 'self') =>
    logActivity({
      user,
      actionType: 'password_reset',
      description: method === 'admin' 
        ? `Admin reset password for ${targetUserName} (${targetUserEmail})`
        : `User ${targetUserName} reset their own password`,
      entityType: 'user',
      newValues: { targetUser: targetUserEmail, method },
    }),

  commissionSettingsUpdate: (user: AppUser | null, recruiterName: string, baseCommission: number, additionalPercentage: number, totalCommission: number) =>
    logActivity({
      user,
      actionType: 'update',
      description: `Updated commission settings for ${recruiterName}: Base $${baseCommission.toFixed(2)}, Additional ${additionalPercentage}%, Total $${totalCommission.toFixed(2)}`,
      entityType: 'commission_settings',
      entityId: recruiterName,
      newValues: { 
        recruiter: recruiterName, 
        baseCommission, 
        additionalPercentage, 
        totalCommission 
      },
    }),

  // Generic log method for flexible logging
  log: (user: AppUser | null, actionType: ActionType, description: string, entityType?: string, entityId?: string, newValues?: Record<string, any>) =>
    logActivity({
      user,
      actionType,
      description,
      entityType,
      entityId,
      newValues,
    }),
};

export default ActivityLogger;
