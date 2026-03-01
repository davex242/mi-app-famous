import { supabase } from '@/lib/supabase';

interface PendingHost {
  host_name: string;
  host_id: string;
  days_pending: number;
}

interface NotificationData {
  adminEmails?: string[];
  hostName?: string;
  hostId?: string;
  recruiterName?: string;
  pendingCount?: number;
  commissionAmount?: number;
  commissionCount?: number;
  pendingHosts?: PendingHost[];
}

class EmailNotificationService {
  private async sendNotification(type: string, data: NotificationData) {
    try {
      const { data: result, error } = await supabase.functions.invoke('send-notification', {
        body: { type, data }
      });

      if (error) {
        console.error('Email notification error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, ...result };
    } catch (err) {
      console.error('Email notification failed:', err);
      return { success: false, error: 'Failed to send notification' };
    }
  }

  async notifyPendingAccounts(
    pendingHosts: PendingHost[],
    adminEmails?: string[]
  ) {
    return this.sendNotification('pending_accounts', {
      adminEmails,
      pendingCount: pendingHosts.length,
      pendingHosts
    });
  }

  async notifyNewHost(
    hostName: string,
    hostId: string,
    recruiterName?: string,
    adminEmails?: string[]
  ) {
    return this.sendNotification('new_host', {
      adminEmails,
      hostName,
      hostId,
      recruiterName
    });
  }

  async notifyCommissionProcessed(
    recruiterName: string,
    commissionCount: number,
    commissionAmount: number,
    adminEmails?: string[]
  ) {
    return this.sendNotification('commission_processed', {
      adminEmails,
      recruiterName,
      commissionCount,
      commissionAmount
    });
  }
}

export const emailNotifications = new EmailNotificationService();
export default emailNotifications;
