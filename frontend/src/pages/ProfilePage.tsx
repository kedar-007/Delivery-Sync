import React, { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import {
  Camera, Save, User, Mail, Shield, Check, CheckCircle, XCircle,
  Phone, Briefcase, BookOpen, Calendar, FileText, AlertTriangle, LogOut,
  BarChart2, ChevronDown, ChevronUp, Lock, Wifi, WifiOff, Info,
  FolderOpen, Clock, Users, Package, Award, Settings, Zap, BarChart,
  ClipboardList, Eye,
} from 'lucide-react';
import { hasPermission, PERMISSIONS } from '../utils/permissions';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import PerformanceModal from '../components/ui/PerformanceModal';
import {
  useMyProfile, useUpdateProfile, useUploadAvatar,
  useMyExtendedProfile, useUpdateExtendedProfile, useUploadProfileFile,
  useUpdateEmail,
} from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';
import { PageLoader } from '../components/ui/Spinner';
import { attendanceApi } from '../lib/api';

interface ProfileForm { name: string; }
interface EmailForm { email: string; confirmEmail: string; }
interface ExtendedForm {
  bio: string; phone: string; department: string; designation: string;
  employee_id: string; birth_date: string; date_of_joining: string;
  timezone: string; resume_url: string;
}

// ── Gradient map ──────────────────────────────────────────────────────────────
const GRAD: Record<string, string> = {
  A: 'from-rose-400 to-pink-600', B: 'from-orange-400 to-red-500',
  C: 'from-amber-400 to-orange-500', D: 'from-yellow-400 to-amber-500',
  E: 'from-lime-400 to-green-500', F: 'from-green-400 to-teal-500',
  G: 'from-teal-400 to-cyan-500', H: 'from-cyan-400 to-blue-500',
  I: 'from-blue-400 to-indigo-500', J: 'from-indigo-400 to-violet-500',
  K: 'from-violet-400 to-purple-500', L: 'from-purple-400 to-fuchsia-500',
  M: 'from-fuchsia-400 to-pink-500', N: 'from-pink-400 to-rose-500',
  O: 'from-sky-400 to-blue-500', P: 'from-emerald-400 to-green-500',
};
const gradFor = (name: string) => GRAD[(name?.[0] ?? 'A').toUpperCase()] ?? 'from-blue-500 to-violet-600';

// ── Network check hook ────────────────────────────────────────────────────────
function useNetworkAllowed() {
  const [clientIp, setClientIp] = useState<string | null>(null);
  const [ipLoading, setIpLoading] = useState(true);

  const { data: settings, isLoading: settingsLoading } = useQuery({
    queryKey: ['ip-settings'],
    queryFn: () => attendanceApi.getIpSettings(),
    staleTime: 60_000,
  });
  const { data: configs, isLoading: configLoading } = useQuery({
    queryKey: ['ip-config'],
    queryFn: () => attendanceApi.getIpConfig(),
    staleTime: 60_000,
    enabled: settings?.enabled === true,
  });

  useEffect(() => {
    if (!settings?.enabled) { setIpLoading(false); return; }
    fetch('https://api64.ipify.org?format=json')
      .then(r => r.json())
      .then(d => setClientIp(d.ip ?? null))
      .catch(() => setClientIp(null))
      .finally(() => setIpLoading(false));
  }, [settings?.enabled]);

  if (!settings?.enabled) return { allowed: true, clientIp: null, checking: false, enabled: false };
  if (settingsLoading || configLoading || ipLoading) return { allowed: null, clientIp, checking: true, enabled: true };
  if (clientIp === null) return { allowed: true, clientIp: null, checking: false, enabled: true }; // fail open if IP undetectable

  const normalise = (ip: string) => ip.replace(/^::ffff:/, '').trim();
  const norm = normalise(clientIp);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const allowed = (configs as any[])?.some(c => normalise(c.ip_address ?? '') === norm) ?? false;
  return { allowed, clientIp, checking: false, enabled: true };
}

// ── Permission groups ─────────────────────────────────────────────────────────
const PERM_GROUPS = [
  {
    label: 'Delivery', Icon: FolderOpen, color: 'blue',
    items: [
      { label: 'View Projects',    perm: PERMISSIONS.PROJECT_READ },
      { label: 'Manage Projects',  perm: PERMISSIONS.PROJECT_WRITE },
      { label: 'Submit Standups',  perm: PERMISSIONS.STANDUP_SUBMIT },
      { label: 'Read Standups',    perm: PERMISSIONS.STANDUP_READ },
      { label: 'Submit EOD',       perm: PERMISSIONS.EOD_SUBMIT },
      { label: 'Read EOD',         perm: PERMISSIONS.EOD_READ },
      { label: 'Actions',          perm: PERMISSIONS.ACTION_WRITE },
      { label: 'Blockers',         perm: PERMISSIONS.BLOCKER_WRITE },
      { label: 'RAID Log',         perm: PERMISSIONS.RAID_WRITE },
      { label: 'Decisions',        perm: PERMISSIONS.DECISION_WRITE },
      { label: 'Milestones',       perm: PERMISSIONS.MILESTONE_WRITE },
      { label: 'Dashboard',        perm: PERMISSIONS.DASHBOARD_READ },
    ],
  },
  {
    label: 'Tasks & Sprints', Icon: ClipboardList, color: 'violet',
    items: [
      { label: 'View Tasks',       perm: PERMISSIONS.TASK_READ },
      { label: 'Manage Tasks',     perm: PERMISSIONS.TASK_WRITE },
      { label: 'Comment on Tasks', perm: PERMISSIONS.TASK_COMMENT_WRITE },
      { label: 'View Sprints',     perm: PERMISSIONS.SPRINT_READ },
      { label: 'Manage Sprints',   perm: PERMISSIONS.SPRINT_WRITE },
    ],
  },
  {
    label: 'Time Tracking', Icon: Clock, color: 'amber',
    items: [
      { label: 'View Time Entries',  perm: PERMISSIONS.TIME_READ },
      { label: 'Log Time Entries',   perm: PERMISSIONS.TIME_WRITE },
      { label: 'Approve Time',       perm: PERMISSIONS.TIME_APPROVE },
    ],
  },
  {
    label: 'People & HR', Icon: Users, color: 'emerald',
    items: [
      { label: 'View Attendance',    perm: PERMISSIONS.ATTENDANCE_READ },
      { label: 'Manage Attendance',  perm: PERMISSIONS.ATTENDANCE_WRITE },
      { label: 'Attendance Admin',   perm: PERMISSIONS.ATTENDANCE_ADMIN },
      { label: 'View Leave',         perm: PERMISSIONS.LEAVE_READ },
      { label: 'Apply Leave',        perm: PERMISSIONS.LEAVE_WRITE },
      { label: 'Approve Leave',      perm: PERMISSIONS.LEAVE_APPROVE },
      { label: 'Leave Admin',        perm: PERMISSIONS.LEAVE_ADMIN },
      { label: 'View Teams',         perm: PERMISSIONS.TEAM_READ },
      { label: 'Manage Teams',       perm: PERMISSIONS.TEAM_WRITE },
      { label: 'View Profiles',      perm: PERMISSIONS.PROFILE_READ },
      { label: 'Edit Profiles',      perm: PERMISSIONS.PROFILE_WRITE },
    ],
  },
  {
    label: 'Reports & Analytics', Icon: BarChart, color: 'cyan',
    items: [
      { label: 'View Reports',      perm: PERMISSIONS.REPORT_READ },
      { label: 'Generate Reports',  perm: PERMISSIONS.REPORT_WRITE },
    ],
  },
  {
    label: 'Assets', Icon: Package, color: 'orange',
    items: [
      { label: 'View Assets',       perm: PERMISSIONS.ASSET_READ },
      { label: 'Manage Assets',     perm: PERMISSIONS.ASSET_WRITE },
      { label: 'Assign Assets',     perm: PERMISSIONS.ASSET_ASSIGN },
      { label: 'Approve Assets',    perm: PERMISSIONS.ASSET_APPROVE },
      { label: 'Asset Admin',       perm: PERMISSIONS.ASSET_ADMIN },
    ],
  },
  {
    label: 'Badges & Announcements', Icon: Award, color: 'yellow',
    items: [
      { label: 'View Badges',       perm: PERMISSIONS.BADGE_READ },
      { label: 'Manage Badges',     perm: PERMISSIONS.BADGE_WRITE },
      { label: 'Award Badges',      perm: PERMISSIONS.BADGE_AWARD },
      { label: 'Announcements',     perm: PERMISSIONS.ANNOUNCEMENT_READ },
      { label: 'Post Announcements',perm: PERMISSIONS.ANNOUNCEMENT_WRITE },
    ],
  },
  {
    label: 'Admin & Config', Icon: Settings, color: 'red',
    items: [
      { label: 'Admin Panel',       perm: PERMISSIONS.ADMIN_USERS },
      { label: 'Admin Settings',    perm: PERMISSIONS.ADMIN_SETTINGS },
      { label: 'Invite Users',      perm: PERMISSIONS.INVITE_USER },
      { label: 'Org Roles (Read)',  perm: PERMISSIONS.ORG_ROLE_READ },
      { label: 'Org Roles (Write)', perm: PERMISSIONS.ORG_ROLE_WRITE },
      { label: 'IP Config',         perm: PERMISSIONS.IP_CONFIG_WRITE },
      { label: 'Config (Read)',     perm: PERMISSIONS.CONFIG_READ },
      { label: 'Config (Write)',    perm: PERMISSIONS.CONFIG_WRITE },
      { label: 'Organisation',      perm: PERMISSIONS.ORG_READ },
      { label: 'Data Seed',         perm: PERMISSIONS.DATA_SEED },
    ],
  },
  {
    label: 'AI & Insights', Icon: Zap, color: 'purple',
    items: [
      { label: 'AI Insights',       perm: PERMISSIONS.AI_INSIGHTS },
      { label: 'AI Performance',    perm: PERMISSIONS.AI_PERFORMANCE },
      { label: 'AI Team Analysis',  perm: PERMISSIONS.AI_TEAM_ANALYSIS },
    ],
  },
];

const COLOR_MAP: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  blue:   { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500' },
  violet: { bg: 'bg-violet-50', text: 'text-violet-700', border: 'border-violet-200', dot: 'bg-violet-500' },
  amber:  { bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500' },
  emerald:{ bg: 'bg-emerald-50',text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500' },
  cyan:   { bg: 'bg-cyan-50',   text: 'text-cyan-700',   border: 'border-cyan-200',   dot: 'bg-cyan-500' },
  orange: { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
  yellow: { bg: 'bg-yellow-50', text: 'text-yellow-700', border: 'border-yellow-200', dot: 'bg-yellow-500' },
  red:    { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
};

// ── Section wrapper ───────────────────────────────────────────────────────────
const Section = ({ title, icon: Icon, children, className = '' }: {
  title: string; icon?: React.ComponentType<{ size?: number; className?: string }>;
  children: React.ReactNode; className?: string;
}) => (
  <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm ${className}`}>
    <div className="px-6 pt-5 pb-4 border-b border-gray-100">
      <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
        {Icon && <Icon size={15} className="text-gray-400" />}
        {title}
      </h3>
    </div>
    <div className="p-6">{children}</div>
  </div>
);

// ── Profile page ──────────────────────────────────────────────────────────────
const ProfilePage = () => {
  const { user: authUser, logout } = useAuth();
  const { data: profile, isLoading } = useMyProfile();
  const { data: extProfile } = useMyExtendedProfile();
  const updateProfile   = useUpdateProfile();
  const updateExtended  = useUpdateExtendedProfile();
  const uploadAvatar    = useUploadAvatar();
  const uploadFile      = useUploadProfileFile();
  const updateEmail     = useUpdateEmail();
  const { allowed: networkAllowed, clientIp, checking: networkChecking, enabled: ipEnabled } = useNetworkAllowed();

  const [avatarPreview, setAvatarPreview]     = useState<string | null>(null);
  const [emailError, setEmailError]           = useState('');
  const [emailConfirmOpen, setEmailConfirmOpen] = useState(false);
  const [showPerfModal, setShowPerfModal]     = useState(false);
  const [uploadError, setUploadError]         = useState('');
  const [saveSuccess, setSaveSuccess]         = useState(false);
  const [extSaveSuccess, setExtSaveSuccess]   = useState(false);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeUrl, setResumeUrl]             = useState<string | null>(null);
  const [showExtended, setShowExtended]       = useState(false);
  const [showAllPerms, setShowAllPerms]       = useState(false);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  // email is shown from the live session first, falling back to DB profile
  const displayEmail = authUser?.email ?? profile?.email ?? '';

  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<ProfileForm>({
    values: { name: profile?.name ?? authUser?.name ?? '' },
  });
  const {
    register: regEmail, handleSubmit: handleEmailSubmit,
    watch: watchEmail, reset: resetEmail,
    formState: { errors: emailFormErrors, isSubmitting: isEmailSubmitting },
  } = useForm<EmailForm>({ defaultValues: { email: '', confirmEmail: '' } });
  const { register: regExt, handleSubmit: handleExtSubmit, formState: { isSubmitting: isExtSubmitting, isDirty: isExtDirty }, setError: setExtError } = useForm<ExtendedForm>({
    values: {
      bio: extProfile?.bio ?? '', phone: extProfile?.phone ?? '',
      department: extProfile?.department ?? '', designation: extProfile?.designation ?? '',
      employee_id: extProfile?.employee_id ?? '',
      birth_date: extProfile?.birth_date ? String(extProfile.birth_date).slice(0, 10) : '',
      date_of_joining: extProfile?.date_of_joining ? String(extProfile.date_of_joining).slice(0, 10) : '',
      timezone: extProfile?.timezone ?? '', resume_url: extProfile?.resume_url ?? '',
    },
  });

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError('');
    if (file.size > 2 * 1024 * 1024) { setUploadError('Image must be under 2 MB'); return; }
    if (!file.type.startsWith('image/')) { setUploadError('Please select an image file'); return; }
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const img = new Image();
      img.onload = async () => {
        const MAX = 256, scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const resized = canvas.toDataURL('image/jpeg', 0.85);
        setAvatarPreview(resized);
        try { await uploadAvatar.mutateAsync({ fileName: file.name, contentType: 'image/jpeg', base64: resized }); }
        catch (err: unknown) { setUploadError((err as Error).message); }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setUploadError('Resume must be under 10 MB'); return; }
    try {
      setResumeUploading(true); setUploadError('');
      const result = await uploadFile.mutateAsync({ file, type: 'resume' });
      setResumeUrl(result.url);
    } catch (err: unknown) { setUploadError((err as Error).message ?? 'Resume upload failed'); }
    finally { setResumeUploading(false); }
  };

  const onSave = async (data: ProfileForm) => {
    try {
      setUploadError('');
      await updateProfile.mutateAsync({ name: data.name });
      setSaveSuccess(true); setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) { setUploadError((err as Error).message); }
  };

  const onExtSave = async (data: ExtendedForm) => {
    try {
      const payload: Record<string, string> = {};
      (Object.keys(data) as (keyof ExtendedForm)[]).forEach(k => { if (data[k]) payload[k] = data[k]; });
      await updateExtended.mutateAsync(payload);
      setExtSaveSuccess(true); setTimeout(() => setExtSaveSuccess(false), 3000);
    } catch (err: unknown) { setExtError('root', { message: (err as Error).message }); }
  };

  const onEmailUpdate = async (data: EmailForm) => {
    setEmailError('');
    try {
      await updateEmail.mutateAsync({ email: data.email.trim().toLowerCase() });
      resetEmail(); setEmailConfirmOpen(false);
      await logout();
    } catch (err: unknown) { setEmailError((err as Error).message ?? 'Email update failed'); }
  };

  if (isLoading) return <Layout><PageLoader /></Layout>;

  const displayAvatar = avatarPreview || profile?.avatarUrl || '';
  const displayName   = profile?.name ?? authUser?.name ?? '';
  const initials      = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?';
  const role          = (profile?.role ?? authUser?.role ?? '').replace(/_/g, ' ');

  // Count granted permissions
  const grantedCount = Object.values(PERMISSIONS).filter(p => hasPermission(authUser, p)).length;
  const totalCount   = Object.values(PERMISSIONS).length;

  return (
    <Layout>
      <Header title="My Profile" subtitle="Manage your account settings and preferences" />
      <div className="p-6 max-w-4xl space-y-5">

        {/* ── Hero card ─────────────────────────────────────────────────── */}
        <div className="group bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 hover:border-gray-300">
          {/* Banner */}
          <div className={`h-28 bg-gradient-to-r ${gradFor(displayName)} opacity-80 transition-all duration-300 group-hover:opacity-100 group-hover:h-32`} />
          <div className="px-6 pb-6">
            <div className="flex items-end gap-4 -mt-12 mb-4">
              {/* Avatar */}
              <div className="relative shrink-0">
                {displayAvatar ? (
                  <img src={displayAvatar} alt={displayName}
                    className="w-20 h-20 rounded-2xl object-cover ring-4 ring-white shadow-lg" />
                ) : (
                  <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${gradFor(displayName)} flex items-center justify-center text-white text-2xl font-bold ring-4 ring-white shadow-lg`}>
                    {initials}
                  </div>
                )}
                {uploadAvatar.isPending && (
                  <div className="absolute inset-0 rounded-2xl bg-black/40 flex items-center justify-center">
                    <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
                <button onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white shadow-md transition-colors"
                  title="Change photo">
                  <Camera size={12} />
                </button>
              </div>
              {/* Name + role badges */}
              <div className="flex-1 pb-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {authUser?.orgRoleName && (
                    <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
                      {authUser.orgRoleName}
                    </span>
                  )}
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${profile?.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {profile?.status ?? 'ACTIVE'}
                  </span>
                </div>
              </div>
            </div>
            <p className="text-xl font-bold text-gray-900">{displayName}</p>
            <p className="text-sm text-gray-400 mt-0.5">{displayEmail}</p>
            {authUser?.orgRoleName && <p className="text-xs font-medium text-indigo-600 mt-1">{authUser.orgRoleName}</p>}
            {extProfile?.bio && <p className="text-xs text-gray-500 mt-2 max-w-xl leading-relaxed">{extProfile.bio}</p>}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          {uploadError && <div className="px-6 pb-4"><Alert type="error" message={uploadError} /></div>}
          {uploadAvatar.isSuccess && !uploadError && (
            <div className="px-6 pb-4">
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                <Check size={14} /> Profile picture updated
              </div>
            </div>
          )}
        </div>

        {/* ── Name edit ─────────────────────────────────────────────────── */}
        <Section title="Display Name" icon={User}>
          <form onSubmit={handleSubmit(onSave)} className="space-y-4">
            {saveSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                <Check size={14} /> Saved successfully
              </div>
            )}
            <div>
              <label className="form-label">Full Name</label>
              <input className="form-input" placeholder="Your full name"
                {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'At least 2 characters' } })} />
              {errors.name && <p className="form-error">{errors.name.message}</p>}
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={isSubmitting} disabled={!isDirty} icon={<Save size={14} />} size="sm">
                Save
              </Button>
            </div>
          </form>
        </Section>

        {/* ── Professional details (collapsible) ─────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <button
            className="w-full px-6 py-5 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-2xl"
            onClick={() => setShowExtended(v => !v)}
          >
            <div className="flex items-center gap-2">
              <Briefcase size={15} className="text-gray-400" />
              <span className="text-sm font-semibold text-gray-900">Professional Details</span>
            </div>
            {showExtended ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </button>
          {showExtended && (
            <div className="px-6 pb-6 border-t border-gray-100">
              <form onSubmit={handleExtSubmit(onExtSave)} className="space-y-4 mt-4">
                {extSaveSuccess && (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                    <Check size={14} /> Details saved
                  </div>
                )}
                <div>
                  <label className="form-label flex items-center gap-1.5"><BookOpen size={12} className="text-gray-400" /> Bio</label>
                  <textarea className="form-textarea" rows={3} placeholder="A short bio about yourself…" {...regExt('bio')} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="form-label flex items-center gap-1.5"><Phone size={12} className="text-gray-400" /> Phone</label>
                    <input className="form-input" placeholder="+1 234 567 8900" {...regExt('phone')} />
                  </div>
                  <div>
                    <label className="form-label flex items-center gap-1.5"><Briefcase size={12} className="text-gray-400" /> Designation</label>
                    <input className="form-input" placeholder="e.g. Senior Engineer" {...regExt('designation')} />
                  </div>
                  <div>
                    <label className="form-label flex items-center gap-1.5"><Briefcase size={12} className="text-gray-400" /> Department</label>
                    <input className="form-input" placeholder="e.g. Engineering" {...regExt('department')} />
                  </div>
                  <div>
                    <label className="form-label">Employee ID</label>
                    <input className="form-input" placeholder="e.g. EMP-001" {...regExt('employee_id')} />
                  </div>
                  <div>
                    <label className="form-label flex items-center gap-1.5"><Calendar size={12} className="text-gray-400" /> Birth Date</label>
                    <input type="date" className="form-input" {...regExt('birth_date')} />
                  </div>
                  <div>
                    <label className="form-label flex items-center gap-1.5"><Calendar size={12} className="text-gray-400" /> Date of Joining</label>
                    <input type="date" className="form-input" {...regExt('date_of_joining')} />
                  </div>
                  <div>
                    <label className="form-label">Timezone</label>
                    <input className="form-input" placeholder="e.g. Asia/Kolkata" {...regExt('timezone')} />
                  </div>
                  <div>
                    <label className="form-label flex items-center gap-1.5"><FileText size={12} className="text-gray-400" /> Resume</label>
                    <div className="flex items-center gap-2">
                      <input className="form-input flex-1 text-xs" placeholder="https://…" type="url" {...regExt('resume_url')} />
                      <Button type="button" variant="outline" size="sm" loading={resumeUploading} onClick={() => resumeInputRef.current?.click()}>Upload</Button>
                      <input ref={resumeInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleResumeUpload} />
                    </div>
                    {(resumeUrl || extProfile?.resume_url) && (
                      <a href={resumeUrl ?? extProfile?.resume_url} target="_blank" rel="noopener noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline">
                        <FileText size={11} /> View uploaded resume
                      </a>
                    )}
                  </div>
                </div>
                <div className="flex justify-end pt-1">
                  <Button type="submit" loading={isExtSubmitting} disabled={!isExtDirty} icon={<Save size={14} />} size="sm">
                    Save details
                  </Button>
                </div>
              </form>
            </div>
          )}
        </div>

        {/* ── Change email ──────────────────────────────────────────────── */}
        <div className={`rounded-2xl border shadow-sm overflow-hidden transition-colors ${emailConfirmOpen ? 'border-amber-300' : 'border-gray-200 bg-white'}`}>
          <div className={`px-6 py-5 border-b ${emailConfirmOpen ? 'bg-amber-50 border-amber-200' : 'bg-white border-gray-100'}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <Mail size={15} className="text-gray-400" /> Change Email Address
              </h3>
              <div className="flex items-center gap-3">
                {/* Network status badge */}
                {ipEnabled && (
                  networkChecking ? (
                    <span className="flex items-center gap-1.5 text-xs text-gray-400 bg-gray-100 px-2.5 py-1 rounded-full">
                      <div className="w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                      Checking network…
                    </span>
                  ) : networkAllowed ? (
                    <span className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full font-medium">
                      <Wifi size={11} /> Allowed network
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 border border-red-200 px-2.5 py-1 rounded-full font-medium">
                      <WifiOff size={11} /> Restricted network
                    </span>
                  )
                )}
                {networkAllowed !== false && (
                  <button type="button"
                    onClick={() => { setEmailConfirmOpen(!emailConfirmOpen); setEmailError(''); resetEmail(); }}
                    className="text-xs text-blue-600 hover:underline font-medium">
                    {emailConfirmOpen ? 'Cancel' : 'Change'}
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Current email: <span className="font-semibold text-gray-800">{displayEmail}</span>
            </p>
          </div>

          <div className={`px-6 py-5 ${emailConfirmOpen ? 'bg-amber-50' : 'bg-white'}`}>
            {/* Network blocked */}
            {ipEnabled && networkAllowed === false && !networkChecking && (
              <div className="flex items-start gap-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <Lock size={14} className="shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Email changes are restricted to the office network</p>
                  <p className="text-xs text-red-600 mt-0.5">
                    Your current IP ({clientIp}) is not on the allowed network list. Please connect to the office Wi-Fi or VPN and try again.
                  </p>
                </div>
              </div>
            )}

            {/* Warning (collapsed) */}
            {!emailConfirmOpen && networkAllowed !== false && (
              <div className="flex items-start gap-2.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>Changing your email will <strong>log you out immediately</strong>. You will need to sign in with your new email address.</span>
              </div>
            )}

            {/* Form (expanded) */}
            {emailConfirmOpen && networkAllowed !== false && (
              <form onSubmit={handleEmailSubmit(onEmailUpdate)} className="space-y-4">
                <div className="flex items-start gap-2.5 text-xs text-amber-800 bg-amber-100 border border-amber-300 rounded-xl px-4 py-3">
                  <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                  <span>A setup link will be sent to your new email. You will be <strong>logged out immediately</strong>.</span>
                </div>
                <div>
                  <label className="form-label flex items-center gap-1.5"><Mail size={12} className="text-gray-400" /> New Email Address</label>
                  <input type="email" className="form-input" placeholder="new@example.com" autoComplete="off"
                    {...regEmail('email', {
                      required: 'Email is required',
                      pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
                      validate: (v) => v.trim().toLowerCase() !== displayEmail.toLowerCase() || 'New email must be different from current',
                    })} />
                  {emailFormErrors.email && <p className="form-error">{emailFormErrors.email.message}</p>}
                </div>
                <div>
                  <label className="form-label flex items-center gap-1.5"><Mail size={12} className="text-gray-400" /> Confirm New Email</label>
                  <input type="email" className="form-input" placeholder="Repeat new email" autoComplete="off"
                    {...regEmail('confirmEmail', {
                      required: 'Please confirm your new email',
                      validate: (v) => v.trim().toLowerCase() === watchEmail('email').trim().toLowerCase() || 'Emails do not match',
                    })} />
                  {emailFormErrors.confirmEmail && <p className="form-error">{emailFormErrors.confirmEmail.message}</p>}
                </div>
                {emailError && <Alert type="error" message={emailError} />}
                <div className="flex justify-end gap-3">
                  <Button type="button" variant="outline" size="sm" onClick={() => { setEmailConfirmOpen(false); setEmailError(''); resetEmail(); }}>Cancel</Button>
                  <Button type="submit" size="sm" loading={isEmailSubmitting || updateEmail.isPending} icon={<LogOut size={13} />}
                    className="bg-amber-600 hover:bg-amber-700 text-white border-amber-600">
                    Update & Sign Out
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>

        {/* ── Account details ───────────────────────────────────────────── */}
        <Section title="Account Details" icon={Info}>
          <div className="divide-y divide-gray-50">
            {[
              { label: 'Authentication', value: 'Zoho SSO', icon: <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" /></svg> },
              { label: 'User ID', value: authUser?.id, mono: true },
              { label: 'Tenant', value: authUser?.tenantSlug ?? authUser?.tenantId, mono: true },
            ].map(({ label, value, icon, mono }) => (
              <div key={label} className="flex items-center justify-between py-3">
                <span className="text-sm text-gray-500">{label}</span>
                <span className={`text-xs flex items-center gap-1.5 ${mono ? 'font-mono text-gray-400' : 'font-medium text-gray-700'}`}>
                  {icon}{value ?? '—'}
                </span>
              </div>
            ))}
          </div>
        </Section>

        {/* ── AI Performance ────────────────────────────────────────────── */}
        {hasPermission(authUser, PERMISSIONS.AI_PERFORMANCE) && (
          <div className="bg-gradient-to-br from-indigo-50 via-violet-50 to-purple-50 rounded-2xl border border-indigo-100 shadow-sm p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-gray-900 mb-1 flex items-center gap-2">
                  <BarChart2 size={15} className="text-indigo-500" /> AI Performance Analysis
                </h3>
                <p className="text-xs text-gray-500 max-w-sm leading-relaxed">
                  Get an AI-powered breakdown — star rating, factor scores, strengths, areas to improve, and personalised suggestions.
                </p>
              </div>
              <button onClick={() => setShowPerfModal(true)}
                className="shrink-0 inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl shadow-sm transition-colors whitespace-nowrap">
                <BarChart2 size={13} /> Analyse
              </button>
            </div>
          </div>
        )}

        {/* ── Permissions ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">
          <div className="px-6 pt-5 pb-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Shield size={15} className="text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-900">My Permissions</h3>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-100">
                {grantedCount} / {totalCount}
              </span>
            </div>
            <button onClick={() => setShowAllPerms(v => !v)}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline font-medium">
              {showAllPerms ? <><ChevronUp size={13} /> Show granted only</> : <><Eye size={13} /> Show all</>}
            </button>
          </div>
          <div className="p-6 space-y-5">
            <p className="text-xs text-gray-500">
              Based on your <span className="font-semibold text-gray-700">{authUser?.orgRoleName ?? role}</span> role
              {authUser?.orgRoleName && <span className="text-gray-400"> (via org role)</span>}
            </p>
            {PERM_GROUPS.map(({ label, Icon, color, items }) => {
              const c = COLOR_MAP[color];
              const grantedItems  = items.filter(({ perm }) => hasPermission(authUser, perm));
              const deniedItems   = items.filter(({ perm }) => !hasPermission(authUser, perm));
              const visibleGranted = grantedItems;
              const visibleDenied  = showAllPerms ? deniedItems : [];
              if (!showAllPerms && grantedItems.length === 0) return null;
              return (
                <div key={label}>
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={12} className={c.text} />
                    <span className={`text-xs font-semibold uppercase tracking-wider ${c.text}`}>{label}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${c.bg} ${c.text} border ${c.border} font-semibold`}>
                      {grantedItems.length}/{items.length}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                    {visibleGranted.map(({ label: pl, perm }) => (
                      <div key={perm} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${c.bg} border ${c.border}`}>
                        <CheckCircle size={12} className={`${c.text} shrink-0`} />
                        <span className={`text-xs font-medium ${c.text} truncate`}>{pl}</span>
                      </div>
                    ))}
                    {visibleDenied.map(({ label: pl, perm }) => (
                      <div key={perm} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
                        <XCircle size={12} className="text-gray-300 shrink-0" />
                        <span className="text-xs text-gray-400 truncate">{pl}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {!showAllPerms && (
              <p className="text-xs text-gray-400 text-center pt-1">
                <button onClick={() => setShowAllPerms(true)} className="text-blue-500 hover:underline">Show all {totalCount} permissions</button>
              </p>
            )}
          </div>
        </div>

      </div>

      {showPerfModal && authUser && (
        <PerformanceModal open={showPerfModal} onClose={() => setShowPerfModal(false)}
          targetUserId={authUser.id} targetName={authUser.name} />
      )}
    </Layout>
  );
};

export default ProfilePage;
