import React, { useState, useRef } from 'react';
import { useForm } from 'react-hook-form';
import {
  Camera, Save, User, Mail, Shield, Check, CheckCircle, XCircle,
  Phone, Briefcase, BookOpen, Calendar, FileText, AlertTriangle, LogOut,
} from 'lucide-react';
import { canDo, PERMISSIONS } from '../utils/permissions';
import Layout from '../components/layout/Layout';
import Header from '../components/layout/Header';
import Button from '../components/ui/Button';
import Alert from '../components/ui/Alert';
import {
  useMyProfile, useUpdateProfile, useUploadAvatar,
  useMyExtendedProfile, useUpdateExtendedProfile, useUploadProfileFile,
  useUpdateEmail,
} from '../hooks/useUsers';
import { useAuth } from '../contexts/AuthContext';
import { PageLoader } from '../components/ui/Spinner';

interface ProfileForm { name: string; }
interface EmailForm { email: string; confirmEmail: string; }

interface ExtendedForm {
  bio: string;
  phone: string;
  department: string;
  designation: string;
  employee_id: string;
  birth_date: string;
  date_of_joining: string;
  timezone: string;
  resume_url: string;
}

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

const ProfilePage = () => {
  const { user: authUser, logout } = useAuth();
  const { data: profile, isLoading } = useMyProfile();
  const { data: extProfile } = useMyExtendedProfile();
  const updateProfile = useUpdateProfile();
  const updateExtended = useUpdateExtendedProfile();
  const uploadAvatar = useUploadAvatar();
  const uploadFile = useUploadProfileFile();
  const updateEmail = useUpdateEmail();

  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [emailError, setEmailError] = useState('');
  const [emailConfirmOpen, setEmailConfirmOpen] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [extSaveSuccess, setExtSaveSuccess] = useState(false);
  const [resumeUploading, setResumeUploading] = useState(false);
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const resumeInputRef = useRef<HTMLInputElement>(null);

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setUploadError('Resume must be under 10 MB'); return; }
    try {
      setResumeUploading(true);
      setUploadError('');
      const result = await uploadFile.mutateAsync({ file, type: 'resume' });
      setResumeUrl(result.url);
    } catch (err: unknown) {
      setUploadError((err as Error).message ?? 'Resume upload failed');
    } finally {
      setResumeUploading(false);
    }
  };

  const { register, handleSubmit, formState: { errors, isSubmitting, isDirty } } = useForm<ProfileForm>({
    values: { name: profile?.name ?? authUser?.name ?? '' },
  });

  const {
    register: regEmail,
    handleSubmit: handleEmailSubmit,
    watch: watchEmail,
    reset: resetEmail,
    formState: { errors: emailFormErrors, isSubmitting: isEmailSubmitting },
  } = useForm<EmailForm>({ defaultValues: { email: '', confirmEmail: '' } });

  const onEmailUpdate = async (data: EmailForm) => {
    setEmailError('');
    try {
      await updateEmail.mutateAsync({ email: data.email.trim().toLowerCase() });
      // Success — must log out immediately so the old session is invalidated
      // and the user re-authenticates with the new email.
      resetEmail();
      setEmailConfirmOpen(false);
      await logout();
    } catch (err: unknown) {
      setEmailError((err as Error).message ?? 'Email update failed');
    }
  };

  const { register: regExt, handleSubmit: handleExtSubmit, formState: { isSubmitting: isExtSubmitting, isDirty: isExtDirty }, setError: setExtError } = useForm<ExtendedForm>({
    values: {
      bio: extProfile?.bio ?? '',
      phone: extProfile?.phone ?? '',
      department: extProfile?.department ?? '',
      designation: extProfile?.designation ?? '',
      employee_id: extProfile?.employee_id ?? '',
      birth_date: extProfile?.birth_date ? String(extProfile.birth_date).slice(0, 10) : '',
      date_of_joining: extProfile?.date_of_joining ? String(extProfile.date_of_joining).slice(0, 10) : '',
      timezone: extProfile?.timezone ?? '',
      resume_url: extProfile?.resume_url ?? '',
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
        const MAX = 256;
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        const resized = canvas.toDataURL('image/jpeg', 0.85);
        setAvatarPreview(resized);
        try {
          await uploadAvatar.mutateAsync({ fileName: file.name, contentType: 'image/jpeg', base64: resized });
        } catch (err: unknown) {
          setUploadError((err as Error).message);
        }
      };
      img.src = ev.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const onSave = async (data: ProfileForm) => {
    try {
      setUploadError('');
      await updateProfile.mutateAsync({ name: data.name });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setUploadError((err as Error).message);
    }
  };

  const onExtSave = async (data: ExtendedForm) => {
    try {
      const payload: Record<string, string> = {};
      (Object.keys(data) as (keyof ExtendedForm)[]).forEach(k => {
        if (data[k] !== undefined && data[k] !== '') payload[k] = data[k];
      });
      await updateExtended.mutateAsync(payload);
      setExtSaveSuccess(true);
      setTimeout(() => setExtSaveSuccess(false), 3000);
    } catch (err: unknown) {
      setExtError('root', { message: (err as Error).message });
    }
  };

  if (isLoading) return <Layout><PageLoader /></Layout>;

  const displayAvatar = avatarPreview || profile?.avatarUrl || '';
  const displayName = profile?.name ?? authUser?.name ?? '';
  const initials = displayName.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?';

  return (
    <Layout>
      <Header title="My Profile" subtitle="Manage your account settings and profile details" />
      <div className="p-6 max-w-2xl space-y-6">

        {/* Avatar card */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">Profile Picture</h3>
          <div className="flex items-center gap-6">
            <div className="relative shrink-0">
              {displayAvatar ? (
                <img src={displayAvatar} alt={displayName} className="w-24 h-24 rounded-full object-cover ring-4 ring-white shadow-lg" />
              ) : (
                <div className={`w-24 h-24 rounded-full bg-gradient-to-br ${gradFor(displayName)} flex items-center justify-center text-white text-2xl font-bold ring-4 ring-white shadow-lg`}>
                  {initials}
                </div>
              )}
              {uploadAvatar.isPending && (
                <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center">
                  <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              )}
              <button onClick={() => fileInputRef.current?.click()}
                className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full bg-blue-600 hover:bg-blue-700 flex items-center justify-center text-white shadow-md transition-colors"
                title="Change photo">
                <Camera size={14} />
              </button>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-gray-900">{displayName}</p>
              <p className="text-xs text-gray-400 mt-0.5">{profile?.email ?? authUser?.email}</p>
              <div className="mt-3 space-y-1.5">
                <button onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors font-medium">
                  <Camera size={12} /> Upload new photo
                </button>
                <p className="text-xs text-gray-400">JPG, PNG or GIF · Max 2 MB · Auto-resized to 256×256</p>
              </div>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
          {uploadError && <Alert type="error" message={uploadError} className="mt-4" />}
          {uploadAvatar.isSuccess && !uploadError && (
            <div className="mt-4 flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
              <Check size={14} /> Profile picture updated
            </div>
          )}
        </div>

        {/* Account info */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">Account Information</h3>
          <form onSubmit={handleSubmit(onSave)} className="space-y-4">
            {saveSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                <Check size={14} /> Profile saved successfully
              </div>
            )}
            <div>
              <label className="form-label flex items-center gap-1.5"><User size={13} className="text-gray-400" /> Display Name</label>
              <input className="form-input" placeholder="Your full name"
                {...register('name', { required: 'Name is required', minLength: { value: 2, message: 'At least 2 characters' } })} />
              {errors.name && <p className="form-error">{errors.name.message}</p>}
            </div>
            <div>
              <label className="form-label flex items-center gap-1.5"><Mail size={13} className="text-gray-400" /> Email</label>
              <input className="form-input bg-gray-50 cursor-not-allowed" value={profile?.email ?? authUser?.email ?? ''} disabled />
              <p className="text-xs text-gray-400 mt-1">
                To change your email, use the{' '}
                <button type="button" onClick={() => setEmailConfirmOpen(true)}
                  className="text-blue-600 hover:underline font-medium">
                  Change Email
                </button>{' '}
                section below.
              </p>
            </div>
            <div>
              <label className="form-label flex items-center gap-1.5"><Shield size={13} className="text-gray-400" /> Role</label>
              <input className="form-input bg-gray-50 cursor-not-allowed" value={(profile?.role ?? authUser?.role ?? '').replace(/_/g, ' ')} disabled />
              <p className="text-xs text-gray-400 mt-1">Contact your admin to change your role.</p>
            </div>
            <div className="flex justify-end pt-2">
              <Button type="submit" loading={isSubmitting} disabled={!isDirty} icon={<Save size={15} />}>
                Save changes
              </Button>
            </div>
          </form>
        </div>

        {/* Extended profile */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-5">Professional Details</h3>
          <form onSubmit={handleExtSubmit(onExtSave)} className="space-y-4">
            {extSaveSuccess && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl px-4 py-2.5">
                <Check size={14} /> Details saved successfully
              </div>
            )}

            <div>
              <label className="form-label flex items-center gap-1.5"><BookOpen size={13} className="text-gray-400" /> Bio</label>
              <textarea className="form-textarea" rows={3} placeholder="A short bio about yourself…" {...regExt('bio')} />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label flex items-center gap-1.5"><Phone size={13} className="text-gray-400" /> Phone</label>
                <input className="form-input" placeholder="+1 234 567 8900" {...regExt('phone')} />
              </div>
              <div>
                <label className="form-label flex items-center gap-1.5"><Briefcase size={13} className="text-gray-400" /> Designation</label>
                <input className="form-input" placeholder="e.g. Senior Engineer" {...regExt('designation')} />
              </div>
              <div>
                <label className="form-label flex items-center gap-1.5"><Briefcase size={13} className="text-gray-400" /> Department</label>
                <input className="form-input" placeholder="e.g. Engineering" {...regExt('department')} />
              </div>
              <div>
                <label className="form-label">Employee ID</label>
                <input className="form-input" placeholder="e.g. EMP-001" {...regExt('employee_id')} />
              </div>
              <div>
                <label className="form-label flex items-center gap-1.5"><Calendar size={13} className="text-gray-400" /> Birth Date</label>
                <input type="date" className="form-input" {...regExt('birth_date')} />
              </div>
              <div>
                <label className="form-label flex items-center gap-1.5"><Calendar size={13} className="text-gray-400" /> Date of Joining</label>
                <input type="date" className="form-input" {...regExt('date_of_joining')} />
              </div>
              <div>
                <label className="form-label">Timezone</label>
                <input className="form-input" placeholder="e.g. Asia/Kolkata" {...regExt('timezone')} />
              </div>
              <div>
                <label className="form-label flex items-center gap-1.5"><FileText size={13} className="text-gray-400" /> Resume</label>
                <div className="flex items-center gap-2">
                  <input className="form-input flex-1 text-xs" placeholder="https://…" type="url" {...regExt('resume_url')} />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    loading={resumeUploading}
                    onClick={() => resumeInputRef.current?.click()}
                  >
                    Upload
                  </Button>
                  <input ref={resumeInputRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={handleResumeUpload} />
                </div>
                {(resumeUrl || extProfile?.resume_url) && (
                  <a
                    href={resumeUrl ?? extProfile?.resume_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
                  >
                    <FileText size={11} /> View uploaded resume
                  </a>
                )}
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <Button type="submit" loading={isExtSubmitting} disabled={!isExtDirty} icon={<Save size={15} />}>
                Save details
              </Button>
            </div>
          </form>
        </div>

        {/* ── Change Email ────────────────────────────────────────────────── */}
        <div className={`rounded-2xl border shadow-sm p-6 transition-colors ${emailConfirmOpen ? 'border-amber-300 bg-amber-50' : 'bg-white border-gray-200'}`}>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Mail size={15} className="text-gray-400" /> Change Email Address
            </h3>
            <button
              type="button"
              onClick={() => { setEmailConfirmOpen(!emailConfirmOpen); setEmailError(''); resetEmail(); }}
              className="text-xs text-blue-600 hover:underline font-medium"
            >
              {emailConfirmOpen ? 'Cancel' : 'Change email'}
            </button>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Current: <span className="font-medium text-gray-700">{profile?.email ?? authUser?.email}</span>
          </p>

          {!emailConfirmOpen && (
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle size={13} className="shrink-0 mt-0.5" />
              <span>Changing your email will send a confirmation link to the new address and <strong>log you out immediately</strong>. You will need to sign in again with your new email.</span>
            </div>
          )}

          {emailConfirmOpen && (
            <form onSubmit={handleEmailSubmit(onEmailUpdate)} className="space-y-4">
              <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-100 border border-amber-300 rounded-xl px-4 py-3">
                <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                <span>You will be <strong>logged out immediately</strong> after this change. A setup link will be sent to your new email to activate your account.</span>
              </div>

              <div>
                <label className="form-label flex items-center gap-1.5"><Mail size={13} className="text-gray-400" /> New Email Address</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="new@example.com"
                  autoComplete="off"
                  {...regEmail('email', {
                    required: 'Email is required',
                    pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Enter a valid email' },
                    validate: (v) => v.trim().toLowerCase() !== (profile?.email ?? authUser?.email ?? '').toLowerCase() || 'New email must be different from your current email',
                  })}
                />
                {emailFormErrors.email && <p className="form-error">{emailFormErrors.email.message}</p>}
              </div>

              <div>
                <label className="form-label flex items-center gap-1.5"><Mail size={13} className="text-gray-400" /> Confirm New Email</label>
                <input
                  type="email"
                  className="form-input"
                  placeholder="Repeat new email"
                  autoComplete="off"
                  {...regEmail('confirmEmail', {
                    required: 'Please confirm your new email',
                    validate: (v) => v.trim().toLowerCase() === watchEmail('email').trim().toLowerCase() || 'Emails do not match',
                  })}
                />
                {emailFormErrors.confirmEmail && <p className="form-error">{emailFormErrors.confirmEmail.message}</p>}
              </div>

              {emailError && <Alert type="error" message={emailError} />}

              <div className="flex justify-end gap-3 pt-1">
                <Button type="button" variant="outline" onClick={() => { setEmailConfirmOpen(false); setEmailError(''); resetEmail(); }}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  loading={isEmailSubmitting || updateEmail.isPending}
                  icon={<LogOut size={14} />}
                  className="bg-amber-600 hover:bg-amber-700 text-white border-amber-600"
                >
                  Update & Sign Out
                </Button>
              </div>
            </form>
          )}
        </div>

        {/* Account details */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">Account Details</h3>
          <div className="space-y-3">
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-500">Status</span>
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${profile?.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                {profile?.status ?? 'ACTIVE'}
              </span>
            </div>
            <div className="flex items-center justify-between py-2 border-b border-gray-50">
              <span className="text-sm text-gray-500">Authentication</span>
              <span className="text-xs text-gray-600 flex items-center gap-1">
                <svg className="w-3.5 h-3.5 text-blue-500" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
                </svg>
                Zoho SSO
              </span>
            </div>
            <div className="flex items-center justify-between py-2">
              <span className="text-sm text-gray-500">User ID</span>
              <span className="text-xs text-gray-400 font-mono">{authUser?.id}</span>
            </div>
          </div>
        </div>

        {/* Permissions */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <Shield size={15} className="text-gray-400" /> My Permissions
          </h3>
          <p className="text-xs text-gray-500 mb-4">Based on your <span className="font-medium text-gray-700">{(profile?.role ?? authUser?.role ?? '').replace(/_/g, ' ')}</span> role</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {[
              { label: 'View Projects', perm: PERMISSIONS.PROJECT_READ },
              { label: 'Manage Projects', perm: PERMISSIONS.PROJECT_WRITE },
              { label: 'Submit Standups', perm: PERMISSIONS.STANDUP_SUBMIT },
              { label: 'Submit EOD', perm: PERMISSIONS.EOD_SUBMIT },
              { label: 'Manage Actions', perm: PERMISSIONS.ACTION_WRITE },
              { label: 'Manage Blockers', perm: PERMISSIONS.BLOCKER_WRITE },
              { label: 'Manage RAID', perm: PERMISSIONS.RAID_WRITE },
              { label: 'Manage Decisions', perm: PERMISSIONS.DECISION_WRITE },
              { label: 'Manage Milestones', perm: PERMISSIONS.MILESTONE_WRITE },
              { label: 'Generate Reports', perm: PERMISSIONS.REPORT_WRITE },
              { label: 'Invite Users', perm: PERMISSIONS.INVITE_USER },
              { label: 'Admin Panel', perm: PERMISSIONS.ADMIN_USERS },
            ].map(({ label, perm }) => {
              const allowed = canDo(profile?.role ?? authUser?.role, perm);
              return (
                <div key={perm} className={`flex items-center gap-2 px-3 py-2 rounded-lg ${allowed ? 'bg-green-50' : 'bg-gray-50'}`}>
                  {allowed
                    ? <CheckCircle size={14} className="text-green-500 shrink-0" />
                    : <XCircle size={14} className="text-gray-300 shrink-0" />}
                  <span className={`text-xs ${allowed ? 'text-green-800 font-medium' : 'text-gray-400'}`}>{label}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </Layout>
  );
};

export default ProfilePage;
