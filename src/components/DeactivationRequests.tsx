import React, { useState, useEffect, useCallback } from 'react';
import { 
  AlertTriangle, 
  Check, 
  X, 
  RefreshCw, 
  Clock, 
  UserX, 
  Calendar,
  Mail,
  ChevronDown,
  ChevronUp,
  Shield,
  Activity,
  Settings,
  Play,
  History,
  Copy,
  ExternalLink,
  Timer,
  CheckCircle,
  XCircle,
  Info
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import Modal from './ui/Modal';
import ActivityLogger from '@/lib/activityLogger';

interface DeactivationRequest {
  id: string;
  recruiter_name: string;
  recruiter_email: string | null;
  user_id: string | null;
  last_entry_date: string | null;
  days_inactive: number;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
}

interface RecruiterActivityWarning {
  id: string;
  recruiter_name: string;
  recruiter_email: string | null;
  last_entry_date: string | null;
  warning_level: number;
  two_week_warning_sent_at: string | null;
  three_week_warning_sent_at: string | null;
  deactivation_requested: boolean;
  created_at: string;
  updated_at: string;
}

interface ScheduledJob {
  id: string;
  job_name: string;
  description: string | null;
  schedule_time: string;
  timezone: string;
  is_enabled: boolean;
  last_run_at: string | null;
  next_run_at: string | null;
  last_run_status: string | null;
  last_run_message: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

interface JobExecutionHistory {
  id: string;
  job_id: string;
  job_name: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  result_message: string | null;
  triggered_by: string;
}

export default function DeactivationRequests() {
  const { user: currentUser, isSuperAdmin } = useAuth();
  const [requests, setRequests] = useState<DeactivationRequest[]>([]);
  const [warnings, setWarnings] = useState<RecruiterActivityWarning[]>([]);
  const [scheduledJobs, setScheduledJobs] = useState<ScheduledJob[]>([]);
  const [executionHistory, setExecutionHistory] = useState<JobExecutionHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'pending' | 'history' | 'warnings' | 'scheduler'>('pending');
  const [selectedRequest, setSelectedRequest] = useState<DeactivationRequest | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [processing, setProcessing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState<{ request: DeactivationRequest; action: 'approve' | 'reject' } | null>(null);
  const [expandedWarnings, setExpandedWarnings] = useState<Set<string>>(new Set());
  const [runningCheck, setRunningCheck] = useState(false);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [scheduleTime, setScheduleTime] = useState('09:00');
  const [scheduleTimezone, setScheduleTimezone] = useState('UTC');
  const [copiedWebhook, setCopiedWebhook] = useState(false);
  const [totalActiveRecruiters, setTotalActiveRecruiters] = useState<number>(0);
  const [lastCheckResult, setLastCheckResult] = useState<any>(null);


  // Webhook URL for external cron services
  const webhookUrl = 'https://rbhhtibdaznvfzsqvaka.databasepad.com/functions/v1/check-recruiter-activity';

  useEffect(() => {
    fetchData();
    checkAndRunAutomaticJob();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch total active recruiters from app_users table
      const { data: recruitersData, error: recruitersError } = await supabase
        .from('app_users')
        .select('id', { count: 'exact' })
        .eq('is_active', true)
        .in('role', ['edit', 'readonly']);

      if (!recruitersError && recruitersData) {
        setTotalActiveRecruiters(recruitersData.length);
      }

      // Fetch deactivation requests
      const { data: requestsData, error: requestsError } = await supabase
        .from('deactivation_requests')
        .select('*')
        .order('requested_at', { ascending: false });

      if (requestsError) throw requestsError;
      setRequests(requestsData || []);

      // Fetch activity warnings
      const { data: warningsData, error: warningsError } = await supabase
        .from('recruiter_activity_warnings')
        .select('*')
        .order('warning_level', { ascending: false });

      if (warningsError) throw warningsError;
      setWarnings(warningsData || []);

      // Fetch scheduled jobs
      const { data: jobsData, error: jobsError } = await supabase
        .from('scheduled_jobs')
        .select('*')
        .order('job_name');

      if (!jobsError && jobsData) {
        setScheduledJobs(jobsData);
        // Set initial schedule time from the job
        const activityJob = jobsData.find(j => j.job_name === 'check-recruiter-activity');
        if (activityJob) {
          setScheduleTime(activityJob.schedule_time?.substring(0, 5) || '09:00');
          setScheduleTimezone(activityJob.timezone || 'UTC');
        }
      }

      // Fetch execution history
      const { data: historyData, error: historyError } = await supabase
        .from('job_execution_history')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(50);

      if (!historyError && historyData) {
        setExecutionHistory(historyData);
        
        // Try to get the last successful check result for active count
        const lastSuccess = historyData.find(h => h.status === 'success' && h.result_message);
        if (lastSuccess?.result_message) {
          try {
            const result = JSON.parse(lastSuccess.result_message);
            if (result.totalActiveRecruiters !== undefined) {
              setLastCheckResult(result);
            }
          } catch {}
        }
      }
    } catch (error) {
      console.error('Fetch error:', error);
    } finally {
      setLoading(false);
    }
  };


  // Check if we need to run the automatic job
  const checkAndRunAutomaticJob = useCallback(async () => {
    try {
      const { data: jobData } = await supabase
        .from('scheduled_jobs')
        .select('*')
        .eq('job_name', 'check-recruiter-activity')
        .single();

      if (!jobData || !jobData.is_enabled) return;

      const now = new Date();
      const lastRun = jobData.last_run_at ? new Date(jobData.last_run_at) : null;
      const nextRun = jobData.next_run_at ? new Date(jobData.next_run_at) : null;

      // Check if we should run the job:
      // 1. If next_run_at has passed and we haven't run today
      // 2. Or if we've never run before
      const shouldRun = !lastRun || 
        (nextRun && now >= nextRun) ||
        (lastRun && now.toDateString() !== lastRun.toDateString() && now.getHours() >= 9);

      if (shouldRun) {
        console.log('Auto-triggering daily activity check...');
        // Don't await - run in background
        supabase.functions.invoke('check-recruiter-activity', {
          body: { triggered_by: 'auto_scheduler' }
        }).then(() => {
          fetchData(); // Refresh data after auto-run
        }).catch(err => {
          console.error('Auto activity check failed:', err);
        });
      }
    } catch (error) {
      console.error('Error checking automatic job:', error);
    }
  }, []);

  const handleRunActivityCheck = async () => {
    setRunningCheck(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-recruiter-activity', {
        body: { triggered_by: 'manual' }
      });

      if (error) throw error;

      // Update the last check result and total active recruiters
      setLastCheckResult(data);
      if (data.totalActiveRecruiters !== undefined) {
        setTotalActiveRecruiters(data.totalActiveRecruiters);
      }

      alert(`Activity check completed!\n\nTotal Active Recruiters: ${data.totalActiveRecruiters}\nActive (< 14 days): ${data.activeCount}\n2-week warnings: ${data.twoWeekInactive}\n3-week deactivation requests: ${data.threeWeekInactive}`);
      fetchData();
    } catch (error) {
      console.error('Activity check error:', error);
      alert('Failed to run activity check');
    } finally {
      setRunningCheck(false);
    }
  };


  const handleUpdateSchedule = async () => {
    try {
      const { error } = await supabase
        .from('scheduled_jobs')
        .update({
          schedule_time: scheduleTime + ':00',
          timezone: scheduleTimezone,
          updated_at: new Date().toISOString()
        })
        .eq('job_name', 'check-recruiter-activity');

      if (error) throw error;

      setShowScheduleModal(false);
      fetchData();
      alert('Schedule updated successfully!');
    } catch (error) {
      console.error('Update schedule error:', error);
      alert('Failed to update schedule');
    }
  };

  const handleToggleJob = async (jobName: string, enabled: boolean) => {
    try {
      const { error } = await supabase
        .from('scheduled_jobs')
        .update({
          is_enabled: enabled,
          updated_at: new Date().toISOString()
        })
        .eq('job_name', jobName);

      if (error) throw error;
      fetchData();
    } catch (error) {
      console.error('Toggle job error:', error);
    }
  };

  const copyWebhookUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopiedWebhook(true);
    setTimeout(() => setCopiedWebhook(false), 2000);
  };

  const handleReviewRequest = async (action: 'approve' | 'reject') => {
    if (!showConfirmModal) return;
    const { request } = showConfirmModal;

    setProcessing(true);
    try {
      // Update the request status
      const { error: updateError } = await supabase
        .from('deactivation_requests')
        .update({
          status: action === 'approve' ? 'approved' : 'rejected',
          reviewed_by: currentUser?.name || 'Unknown',
          reviewed_at: new Date().toISOString(),
          review_notes: reviewNotes || null
        })
        .eq('id', request.id);

      if (updateError) throw updateError;

      // If approved, deactivate the user
      if (action === 'approve' && request.user_id) {
        const { error: deactivateError } = await supabase
          .from('app_users')
          .update({ is_active: false })
          .eq('id', request.user_id);

        if (deactivateError) throw deactivateError;

        // Log the activity
        await ActivityLogger.log({
          action: 'update',
          user_name: currentUser?.name || 'Unknown',
          user_email: currentUser?.email || 'Unknown',
          details: `Deactivated user ${request.recruiter_name} due to 3+ weeks of inactivity`,
          metadata: { 
            target_user: request.recruiter_name,
            days_inactive: request.days_inactive,
            reason: 'Prolonged inactivity'
          }
        });
      }

      // Update the warning record
      await supabase
        .from('recruiter_activity_warnings')
        .update({
          deactivation_approved: action === 'approve',
          deactivation_approved_by: currentUser?.name || 'Unknown',
          deactivation_approved_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('recruiter_name', request.recruiter_name);

      setShowConfirmModal(null);
      setReviewNotes('');
      fetchData();
    } catch (error) {
      console.error('Review error:', error);
      alert('Failed to process request');
    } finally {
      setProcessing(false);
    }
  };

  const toggleWarningExpanded = (id: string) => {
    const newExpanded = new Set(expandedWarnings);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedWarnings(newExpanded);
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const historyRequests = requests.filter(r => r.status !== 'pending');

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200"><Clock className="w-3 h-3" />Pending</span>;
      case 'approved':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 border border-red-200"><UserX className="w-3 h-3" />Deactivated</span>;
      case 'rejected':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 border border-green-200"><Check className="w-3 h-3" />Kept Active</span>;
      default:
        return null;
    }
  };

  const getWarningLevelBadge = (level: number) => {
    switch (level) {
      case 0:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 border border-green-200"><Check className="w-3 h-3" />Active</span>;
      case 1:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-yellow-100 text-yellow-700 border border-yellow-200"><AlertTriangle className="w-3 h-3" />2-Week Warning</span>;
      case 2:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 border border-red-200"><UserX className="w-3 h-3" />3-Week Critical</span>;
      default:
        return null;
    }
  };

  const getJobStatusBadge = (status: string | null) => {
    switch (status) {
      case 'success':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-green-100 text-green-700 border border-green-200"><CheckCircle className="w-3 h-3" />Success</span>;
      case 'error':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-red-100 text-red-700 border border-red-200"><XCircle className="w-3 h-3" />Error</span>;
      case 'running':
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-blue-100 text-blue-700 border border-blue-200"><RefreshCw className="w-3 h-3 animate-spin" />Running</span>;
      default:
        return <span className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-700 border border-gray-200"><Clock className="w-3 h-3" />Never Run</span>;
    }
  };

  if (!isSuperAdmin) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900">Access Restricted</h3>
          <p className="text-gray-500">Only Super Admins can view deactivation requests.</p>
        </div>
      </div>
    );
  }

  const activityJob = scheduledJobs.find(j => j.job_name === 'check-recruiter-activity');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Recruiter Activity Management</h1>
          <p className="text-gray-500 mt-1">Monitor recruiter activity and manage deactivation requests</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleRunActivityCheck}
            disabled={runningCheck}
            className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center gap-2 disabled:opacity-50"
          >
            <Activity className={`w-4 h-4 ${runningCheck ? 'animate-pulse' : ''}`} />
            {runningCheck ? 'Checking...' : 'Run Activity Check'}
          </button>
          <button
            onClick={fetchData}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-yellow-50 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Pending Requests</p>
              <p className="text-2xl font-bold text-gray-900">{pendingRequests.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-orange-50 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-orange-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">2-Week Warnings</p>
              <p className="text-2xl font-bold text-gray-900">{warnings.filter(w => w.warning_level === 1).length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-red-50 rounded-lg">
              <UserX className="w-6 h-6 text-red-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">3-Week Critical</p>
              <p className="text-2xl font-bold text-gray-900">{warnings.filter(w => w.warning_level === 2).length}</p>
            </div>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-200">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-50 rounded-lg">
              <Check className="w-6 h-6 text-green-500" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Active Recruiters</p>
              <p className="text-2xl font-bold text-gray-900">{totalActiveRecruiters}</p>
            </div>
          </div>
        </div>

      </div>

      {/* Tabs */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="border-b border-gray-200">
          <nav className="flex overflow-x-auto">
            <button
              onClick={() => setActiveTab('pending')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'pending'
                  ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Pending Requests
              {pendingRequests.length > 0 && (
                <span className="ml-2 px-2 py-0.5 text-xs font-semibold rounded-full bg-red-100 text-red-700">
                  {pendingRequests.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('warnings')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'warnings'
                  ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Activity Warnings
            </button>
            <button
              onClick={() => setActiveTab('history')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'history'
                  ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Review History
            </button>
            <button
              onClick={() => setActiveTab('scheduler')}
              className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === 'scheduler'
                  ? 'border-blue-500 text-blue-600 bg-blue-50/50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Timer className="w-4 h-4 inline mr-1" />
              Scheduler
            </button>
          </nav>
        </div>

        {/* Tab Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : activeTab === 'pending' ? (
            pendingRequests.length === 0 ? (
              <div className="text-center py-12">
                <Check className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900">No Pending Requests</h3>
                <p className="text-gray-500">All deactivation requests have been reviewed.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingRequests.map((request) => (
                  <div key={request.id} className="bg-gray-50 rounded-lg border border-gray-200 p-5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-semibold text-gray-900">{request.recruiter_name}</h3>
                          {getStatusBadge(request.status)}
                        </div>
                        {request.recruiter_email && (
                          <p className="text-sm text-gray-500 flex items-center gap-1">
                            <Mail className="w-4 h-4" />
                            {request.recruiter_email}
                          </p>
                        )}
                        <div className="flex flex-wrap gap-4 mt-3 text-sm">
                          <div className="flex items-center gap-1 text-red-600">
                            <AlertTriangle className="w-4 h-4" />
                            <span className="font-medium">{request.days_inactive} days inactive</span>
                          </div>
                          <div className="flex items-center gap-1 text-gray-500">
                            <Calendar className="w-4 h-4" />
                            <span>Last entry: {request.last_entry_date ? new Date(request.last_entry_date).toLocaleDateString() : 'Never'}</span>
                          </div>
                          <div className="flex items-center gap-1 text-gray-500">
                            <Clock className="w-4 h-4" />
                            <span>Requested: {new Date(request.requested_at).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setShowConfirmModal({ request, action: 'reject' })}
                          className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 flex items-center gap-2"
                        >
                          <Check className="w-4 h-4" />
                          Keep Active
                        </button>
                        <button
                          onClick={() => setShowConfirmModal({ request, action: 'approve' })}
                          className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 flex items-center gap-2"
                        >
                          <UserX className="w-4 h-4" />
                          Deactivate
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : activeTab === 'warnings' ? (
            warnings.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900">No Activity Warnings</h3>
                <p className="text-gray-500">All recruiters are active.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Recruiter</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Last Entry</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">2-Week Warning</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">3-Week Warning</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {warnings.map((warning) => (
                      <tr key={warning.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-gray-900">{warning.recruiter_name}</p>
                            {warning.recruiter_email && (
                              <p className="text-sm text-gray-500">{warning.recruiter_email}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">{getWarningLevelBadge(warning.warning_level)}</td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          {warning.last_entry_date ? new Date(warning.last_entry_date).toLocaleDateString() : 'Never'}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          {warning.two_week_warning_sent_at ? (
                            <span className="text-yellow-600">{new Date(warning.two_week_warning_sent_at).toLocaleDateString()}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          {warning.three_week_warning_sent_at ? (
                            <span className="text-red-600">{new Date(warning.three_week_warning_sent_at).toLocaleDateString()}</span>
                          ) : (
                            <span className="text-gray-400">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : activeTab === 'scheduler' ? (
            <div className="space-y-6">
              {/* Scheduled Job Card */}
              <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-xl border border-purple-200 p-6">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-purple-100 rounded-lg">
                      <Timer className="w-8 h-8 text-purple-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-gray-900">Daily Activity Check</h3>
                      <p className="text-sm text-gray-600 mt-1">
                        Automatically checks recruiter activity and sends warnings/deactivation requests
                      </p>
                      <div className="flex flex-wrap items-center gap-4 mt-3">
                        <div className="flex items-center gap-2 text-sm">
                          <Clock className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-600">
                            Scheduled: <strong>{activityJob?.schedule_time?.substring(0, 5) || '09:00'} {activityJob?.timezone || 'UTC'}</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <History className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-600">
                            Last run: <strong>{activityJob?.last_run_at ? new Date(activityJob.last_run_at).toLocaleString() : 'Never'}</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-sm">
                          <Play className="w-4 h-4 text-gray-500" />
                          <span className="text-gray-600">
                            Total runs: <strong>{activityJob?.run_count || 0}</strong>
                          </span>
                        </div>
                      </div>
                      {activityJob?.last_run_message && (
                        <p className="text-sm text-gray-500 mt-2 bg-white/50 rounded px-3 py-1.5">
                          {activityJob.last_run_message}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {getJobStatusBadge(activityJob?.last_run_status || null)}
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={activityJob?.is_enabled ?? true}
                        onChange={(e) => handleToggleJob('check-recruiter-activity', e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                      <span className="ms-3 text-sm font-medium text-gray-700">
                        {activityJob?.is_enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                    <button
                      onClick={() => setShowScheduleModal(true)}
                      className="px-4 py-2 border border-purple-300 text-purple-700 rounded-lg hover:bg-purple-100 flex items-center gap-2"
                    >
                      <Settings className="w-4 h-4" />
                      Configure
                    </button>
                  </div>
                </div>
              </div>

              {/* Webhook URL for External Cron */}
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <div className="flex items-start gap-4">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <ExternalLink className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">External Cron Service</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      Use this webhook URL with external cron services (like cron-job.org, EasyCron, or Zapier) for guaranteed daily execution.
                    </p>
                    <div className="mt-4 flex items-center gap-2">
                      <div className="flex-1 bg-gray-100 rounded-lg px-4 py-2.5 font-mono text-sm text-gray-700 overflow-x-auto">
                        {webhookUrl}
                      </div>
                      <button
                        onClick={copyWebhookUrl}
                        className={`px-4 py-2.5 rounded-lg flex items-center gap-2 transition-colors ${
                          copiedWebhook
                            ? 'bg-green-500 text-white'
                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        }`}
                      >
                        {copiedWebhook ? (
                          <>
                            <Check className="w-4 h-4" />
                            Copied!
                          </>
                        ) : (
                          <>
                            <Copy className="w-4 h-4" />
                            Copy
                          </>
                        )}
                      </button>
                    </div>
                    <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                      <div className="flex items-start gap-2">
                        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                        <div className="text-sm text-blue-800">
                          <p className="font-medium">How to set up external cron:</p>
                          <ol className="list-decimal list-inside mt-2 space-y-1">
                            <li>Go to a cron service like <a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" className="underline">cron-job.org</a> (free)</li>
                            <li>Create a new cron job with the webhook URL above</li>
                            <li>Set the schedule to run daily at your preferred time (e.g., 9:00 AM)</li>
                            <li>Set the HTTP method to POST with an empty JSON body: {'{}'}</li>
                            <li>Save and activate the cron job</li>
                          </ol>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Execution History */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
                  <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                    <History className="w-5 h-5" />
                    Execution History
                  </h3>
                </div>
                {executionHistory.length === 0 ? (
                  <div className="text-center py-12">
                    <History className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900">No Execution History</h3>
                    <p className="text-gray-500">The job hasn't been executed yet.</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-100 border-b border-gray-200">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Started At</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Completed At</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Status</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Triggered By</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {executionHistory.map((exec) => (
                          <tr key={exec.id} className="hover:bg-gray-50">
                            <td className="px-4 py-4 text-sm text-gray-600">
                              {new Date(exec.started_at).toLocaleString()}
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-600">
                              {exec.completed_at ? new Date(exec.completed_at).toLocaleString() : '-'}
                            </td>
                            <td className="px-4 py-4">
                              {getJobStatusBadge(exec.status)}
                            </td>
                            <td className="px-4 py-4 text-sm">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                exec.triggered_by === 'manual' 
                                  ? 'bg-blue-100 text-blue-700' 
                                  : exec.triggered_by === 'auto_scheduler'
                                  ? 'bg-purple-100 text-purple-700'
                                  : 'bg-gray-100 text-gray-700'
                              }`}>
                                {exec.triggered_by === 'manual' ? 'Manual' : 
                                 exec.triggered_by === 'auto_scheduler' ? 'Auto' : 
                                 exec.triggered_by === 'external_cron' ? 'External Cron' : 
                                 exec.triggered_by}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-sm text-gray-600 max-w-xs truncate">
                              {exec.result_message ? (
                                <span title={exec.result_message}>
                                  {(() => {
                                    try {
                                      const result = JSON.parse(exec.result_message);
                                      return `Checked: ${result.checked}, 2-week: ${result.twoWeekInactive}, 3-week: ${result.threeWeekInactive}`;
                                    } catch {
                                      return exec.result_message;
                                    }
                                  })()}
                                </span>
                              ) : '-'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            historyRequests.length === 0 ? (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-gray-900">No Review History</h3>
                <p className="text-gray-500">No deactivation requests have been reviewed yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-100 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Recruiter</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Decision</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Days Inactive</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Reviewed By</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Reviewed At</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {historyRequests.map((request) => (
                      <tr key={request.id} className="hover:bg-gray-50">
                        <td className="px-4 py-4">
                          <div>
                            <p className="font-medium text-gray-900">{request.recruiter_name}</p>
                            {request.recruiter_email && (
                              <p className="text-sm text-gray-500">{request.recruiter_email}</p>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-4">{getStatusBadge(request.status)}</td>
                        <td className="px-4 py-4 text-sm text-gray-600">{request.days_inactive} days</td>
                        <td className="px-4 py-4 text-sm text-gray-600">{request.reviewed_by || '-'}</td>
                        <td className="px-4 py-4 text-sm text-gray-600">
                          {request.reviewed_at ? new Date(request.reviewed_at).toLocaleString() : '-'}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 max-w-xs truncate">
                          {request.review_notes || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
        </div>
      </div>

      {/* Schedule Configuration Modal */}
      <Modal
        isOpen={showScheduleModal}
        onClose={() => setShowScheduleModal(false)}
        title="Configure Schedule"
        size="md"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Schedule Time</label>
            <input
              type="time"
              value={scheduleTime}
              onChange={(e) => setScheduleTime(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            />
            <p className="text-xs text-gray-500 mt-1">The time when the activity check will run daily</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
            <select
              value={scheduleTimezone}
              onChange={(e) => setScheduleTimezone(e.target.value)}
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
            >
              <option value="UTC">UTC</option>
              <option value="America/New_York">Eastern Time (ET)</option>
              <option value="America/Chicago">Central Time (CT)</option>
              <option value="America/Denver">Mountain Time (MT)</option>
              <option value="America/Los_Angeles">Pacific Time (PT)</option>
              <option value="America/Mexico_City">Mexico City</option>
              <option value="Europe/London">London (GMT)</option>
              <option value="Europe/Paris">Paris (CET)</option>
              <option value="Asia/Tokyo">Tokyo (JST)</option>
            </select>
          </div>

          <div className="bg-purple-50 rounded-lg p-4 border border-purple-200">
            <p className="text-sm text-purple-800">
              <strong>Note:</strong> The automatic check will run when an admin accesses this page after the scheduled time. 
              For guaranteed daily execution, set up an external cron service using the webhook URL.
            </p>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
            <button
              onClick={() => setShowScheduleModal(false)}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUpdateSchedule}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Save Schedule
            </button>
          </div>
        </div>
      </Modal>

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal !== null}
        onClose={() => { setShowConfirmModal(null); setReviewNotes(''); }}
        title={showConfirmModal?.action === 'approve' ? 'Confirm Deactivation' : 'Keep User Active'}
        size="md"
      >
        {showConfirmModal && (
          <div className="space-y-4">
            <div className={`p-4 rounded-lg ${showConfirmModal.action === 'approve' ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
              <div className="flex items-center gap-3">
                {showConfirmModal.action === 'approve' ? (
                  <UserX className="w-8 h-8 text-red-500" />
                ) : (
                  <Check className="w-8 h-8 text-green-500" />
                )}
                <div>
                  <h3 className="font-semibold text-gray-900">
                    {showConfirmModal.action === 'approve' 
                      ? `Deactivate ${showConfirmModal.request.recruiter_name}?`
                      : `Keep ${showConfirmModal.request.recruiter_name} Active?`
                    }
                  </h3>
                  <p className="text-sm text-gray-600">
                    {showConfirmModal.action === 'approve'
                      ? 'This will deactivate the user account. They will no longer be able to log in.'
                      : 'This will dismiss the deactivation request and keep the user active.'
                    }
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <h4 className="font-medium text-gray-900 mb-2">Request Details</h4>
              <div className="space-y-1 text-sm">
                <p><span className="text-gray-500">Days Inactive:</span> <span className="font-medium text-red-600">{showConfirmModal.request.days_inactive} days</span></p>
                <p><span className="text-gray-500">Last Entry:</span> {showConfirmModal.request.last_entry_date ? new Date(showConfirmModal.request.last_entry_date).toLocaleDateString() : 'Never'}</p>
                <p><span className="text-gray-500">Request Date:</span> {new Date(showConfirmModal.request.requested_at).toLocaleDateString()}</p>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Review Notes (Optional)</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                rows={3}
                placeholder="Add any notes about this decision..."
              />
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
              <button
                onClick={() => { setShowConfirmModal(null); setReviewNotes(''); }}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => handleReviewRequest(showConfirmModal.action)}
                disabled={processing}
                className={`px-4 py-2 text-white rounded-lg flex items-center gap-2 disabled:opacity-50 ${
                  showConfirmModal.action === 'approve'
                    ? 'bg-red-500 hover:bg-red-600'
                    : 'bg-green-500 hover:bg-green-600'
                }`}
              >
                {processing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : showConfirmModal.action === 'approve' ? (
                  <>
                    <UserX className="w-4 h-4" />
                    Confirm Deactivation
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Keep Active
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
