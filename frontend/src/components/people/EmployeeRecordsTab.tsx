import React, { useMemo, useState } from 'react';
import {
  Search, Pencil, Eye, Copy, Check, BadgeCheck, CalendarDays, Landmark, LifeBuoy, UserCircle,
} from 'lucide-react';
import Modal, { ModalActions } from '../ui/Modal';
import Button from '../ui/Button';
import Spinner from '../ui/Spinner';
import { useAdminUsers, useUpdateUserDetails, useOrgRoles } from '../../hooks/useAdmin';
import { useProfile } from '../../hooks/useBadgeProfile';
import { useAuth } from '../../contexts/AuthContext';
import { hasPermission, PERMISSIONS } from '../../utils/permissions';

// ── Types ──────────────────────────────────────────────────────────────────────

interface AdminUser {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  avatarUrl?: string;
  employeeId?: string;
  dateOfJoining?: string;
  orgRoleId?: string | null;
}

interface OrgRole { id: string; name: string; }

interface DetailsForm {
  employee_id: string;
  date_of_joining: string;
  bank_account_name: string;
  bank_account_number: string;
  bank_name: string;
  bank_ifsc_code: string;
  bank_branch: string;
  emergency_contact_name: string;
  emergency_contact_relation: string;
  emergency_contact_phone: string;
  emergency_contact_email: string;
}

const EMPTY_FORM: DetailsForm = {
  employee_id: '', date_of_joining: '',
  bank_account_name: '', bank_account_number: '', bank_name: '', bank_ifsc_code: '', bank_branch: '',
  emergency_contact_name: '', emergency_contact_relation: '', emergency_contact_phone: '', emergency_contact_email: '',
};

// ── Read-only value with copy-to-clipboard ─────────────────────────────────────

const CopyValue = ({ label, value }: { label: string; value: string }) => {
  const [copied, setCopied] = useState(false);
  const has = !!value && value !== '—';
  const copy = () => {
    if (!has || !navigator.clipboard) return;
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => { /* clipboard unavailable */ });
  };
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-gray-400 mb-1">{label}</div>
      <div className="group flex items-center gap-2">
        <span className="text-sm text-gray-900 break-words min-w-0">{has ? value : '—'}</span>
        {has && (
          <button
            type="button"
            onClick={copy}
            title="Copy"
            className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-400 hover:text-blue-600"
          >
            {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
          </button>
        )}
      </div>
    </div>
  );
};

// ── Section heading ────────────────────────────────────────────────────────────

const SectionHead = ({ icon, color, children }: { icon: React.ReactNode; color: string; children: React.ReactNode }) => (
  <div className="flex items-center gap-2 mb-3">
    <span className={color}>{icon}</span>
    <h3 className="text-sm font-semibold text-gray-900">{children}</h3>
  </div>
);

// ── Detail modal (view / edit) ─────────────────────────────────────────────────

const DetailsModal = ({ user, roleLabel, canEdit, onClose }: { user: AdminUser; roleLabel: string; canEdit: boolean; onClose: () => void }) => {
  const { data: profile, isLoading } = useProfile(user.id);
  const updateDetails = useUpdateUserDetails(user.id);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState<DetailsForm | null>(null);

  // Seed the editable form from the loaded profile.
  const seeded = useMemo(() => {
    if (!profile) return null;
    const p = profile as Record<string, unknown>;
    const val = (k: string) => (p[k] == null ? '' : String(p[k]));
    return {
      employee_id: val('employee_id'),
      date_of_joining: val('date_of_joining').slice(0, 10),
      bank_account_name: val('bank_account_name'),
      bank_account_number: val('bank_account_number'),
      bank_name: val('bank_name'),
      bank_ifsc_code: val('bank_ifsc_code'),
      bank_branch: val('bank_branch'),
      emergency_contact_name: val('emergency_contact_name'),
      emergency_contact_relation: val('emergency_contact_relation'),
      emergency_contact_phone: val('emergency_contact_phone'),
      emergency_contact_email: val('emergency_contact_email'),
    } as DetailsForm;
  }, [profile]);

  const current = form ?? seeded ?? EMPTY_FORM;
  const set = (k: keyof DetailsForm) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...current, [k]: e.target.value });

  // Read-only value getter (view mode).
  const pv = (k: string) => {
    const v = (profile as Record<string, unknown> | undefined)?.[k];
    return v == null || v === '' ? '' : String(v);
  };

  const handleSave = async () => {
    try {
      await updateDetails.mutateAsync(current);
      setForm(null);       // re-seed from refetched profile
      setEditMode(false);
    } catch { /* toast handled in hook */ }
  };

  const cancelEdit = () => { setForm(null); setEditMode(false); };

  // Editable input (edit mode).
  const input = (label: string, key: keyof DetailsForm, opts: { type?: string; placeholder?: string } = {}) => (
    <div>
      <label className="form-label">{label}</label>
      <input
        className="form-input"
        type={opts.type || 'text'}
        placeholder={opts.placeholder}
        value={current[key]}
        onChange={set(key)}
      />
    </div>
  );

  return (
    <Modal open onClose={onClose} title={editMode ? 'Edit Employee' : 'Employee Details'} size="4xl" closeOnBackdropClick={false}>
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Spinner size="lg" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Identity header */}
          <div className="flex items-center gap-4 pb-4 border-b border-gray-100">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="w-14 h-14 rounded-full object-cover" />
            ) : (
              <UserCircle size={56} className="text-gray-300" />
            )}
            <div className="min-w-0">
              <div className="text-base font-semibold text-gray-900 truncate">{user.name || '—'}</div>
              <div className="text-sm text-gray-500 truncate">{user.email}</div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">{roleLabel}</span>
                <span className={[
                  'text-[11px] font-medium px-2 py-0.5 rounded-full',
                  user.status === 'ACTIVE' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500',
                ].join(' ')}>{user.status}</span>
              </div>
            </div>
          </div>

          {/* Professional — always read-only */}
          <section>
            <SectionHead icon={<UserCircle size={15} />} color="text-gray-400">Professional</SectionHead>
            <div className="grid grid-cols-3 gap-x-6 gap-y-4">
              <CopyValue label="Designation" value={pv('designation')} />
              <CopyValue label="Department" value={pv('department')} />
              <CopyValue label="Phone" value={pv('phone')} />
              <CopyValue label="Date of Birth" value={pv('birth_date').slice(0, 10)} />
              <CopyValue label="Timezone" value={pv('timezone')} />
            </div>
          </section>

          {editMode ? (
            /* ── EDIT MODE ─────────────────────────────────────────────── */
            <>
              <section>
                <SectionHead icon={<BadgeCheck size={15} />} color="text-blue-500">Employment</SectionHead>
                <div className="grid grid-cols-3 gap-4">
                  {input('Employee ID', 'employee_id', { placeholder: 'e.g. EMP-001' })}
                  {input('Date of Joining', 'date_of_joining', { type: 'date' })}
                </div>
              </section>
              <section>
                <SectionHead icon={<Landmark size={15} />} color="text-emerald-500">Bank Account Details</SectionHead>
                <div className="grid grid-cols-3 gap-4">
                  {input('Account Holder Name', 'bank_account_name', { placeholder: 'As per bank records' })}
                  {input('Account Number', 'bank_account_number')}
                  {input('Bank Name', 'bank_name', { placeholder: 'e.g. HDFC Bank' })}
                  {input('IFSC / SWIFT Code', 'bank_ifsc_code')}
                  {input('Branch', 'bank_branch')}
                </div>
              </section>
              <section>
                <SectionHead icon={<LifeBuoy size={15} />} color="text-rose-500">Emergency Contact</SectionHead>
                <div className="grid grid-cols-3 gap-4">
                  {input('Contact Name', 'emergency_contact_name')}
                  {input('Relationship', 'emergency_contact_relation', { placeholder: 'e.g. Spouse, Parent' })}
                  {input('Phone', 'emergency_contact_phone', { type: 'tel', placeholder: '+91 …' })}
                  {input('Email', 'emergency_contact_email', { type: 'email' })}
                </div>
              </section>
            </>
          ) : (
            /* ── VIEW MODE (read-only + copy) ──────────────────────────── */
            <>
              <section>
                <SectionHead icon={<BadgeCheck size={15} />} color="text-blue-500">Employment</SectionHead>
                <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                  <CopyValue label="Employee ID" value={pv('employee_id')} />
                  <CopyValue label="Date of Joining" value={pv('date_of_joining').slice(0, 10)} />
                </div>
              </section>
              <section>
                <SectionHead icon={<Landmark size={15} />} color="text-emerald-500">Bank Account Details</SectionHead>
                <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                  <CopyValue label="Account Holder Name" value={pv('bank_account_name')} />
                  <CopyValue label="Account Number" value={pv('bank_account_number')} />
                  <CopyValue label="Bank Name" value={pv('bank_name')} />
                  <CopyValue label="IFSC / SWIFT Code" value={pv('bank_ifsc_code')} />
                  <CopyValue label="Branch" value={pv('bank_branch')} />
                </div>
              </section>
              <section>
                <SectionHead icon={<LifeBuoy size={15} />} color="text-rose-500">Emergency Contact</SectionHead>
                <div className="grid grid-cols-3 gap-x-6 gap-y-4">
                  <CopyValue label="Contact Name" value={pv('emergency_contact_name')} />
                  <CopyValue label="Relationship" value={pv('emergency_contact_relation')} />
                  <CopyValue label="Phone" value={pv('emergency_contact_phone')} />
                  <CopyValue label="Email" value={pv('emergency_contact_email')} />
                </div>
              </section>
            </>
          )}
        </div>
      )}

      <ModalActions>
        {editMode ? (
          <>
            <Button variant="secondary" size="sm" onClick={cancelEdit} disabled={updateDetails.isPending}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" loading={updateDetails.isPending} onClick={handleSave}>
              Save Details
            </Button>
          </>
        ) : (
          <>
            <Button variant="danger" size="sm" type="button" onClick={onClose}>
              Close
            </Button>
            {canEdit && (
              <Button variant="primary" size="sm" type="button" icon={<Pencil size={14} />} onClick={() => setEditMode(true)}>
                Edit
              </Button>
            )}
          </>
        )}
      </ModalActions>
    </Modal>
  );
};

// ── Tab ────────────────────────────────────────────────────────────────────────

const EmployeeRecordsTab = () => {
  const { user } = useAuth();
  const canEdit = hasPermission(user, PERMISSIONS.EMPLOYEE_RECORD_WRITE)
    || hasPermission(user, PERMISSIONS.USER_WRITE)
    || hasPermission(user, PERMISSIONS.ADMIN_USERS);
  const { data: users, isLoading } = useAdminUsers();
  const { data: orgRoles } = useOrgRoles();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);

  // Resolve the assigned application (org) role name; fall back to the system role.
  const roleLabelFor = (u: AdminUser) => {
    const match = ((orgRoles as OrgRole[] | undefined) ?? []).find((r) => r.id === u.orgRoleId);
    return match?.name || u.role;
  };

  const filtered = useMemo(() => {
    const list = (users as AdminUser[] | undefined) ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((u) =>
      [u.name, u.email, u.employeeId].some((v) => (v || '').toLowerCase().includes(q))
    );
  }, [users, search]);

  return (
    <div>
      <p className="text-sm text-gray-500 mb-4">
        {canEdit
          ? "Click an employee to view their joining date, employee ID, bank account and emergency contact details — use Edit to update them."
          : "Click an employee to view their joining date, employee ID, bank account and emergency contact details."}
      </p>

      <div className="relative mb-4 max-w-sm">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          className="form-input pl-9"
          placeholder="Search by name, email or employee ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <Spinner size="lg" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-sm text-gray-400">No employees found.</div>
      ) : (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 sticky top-0 z-10">
              <tr>
                <th className="text-left font-medium px-4 py-2.5">Employee</th>
                <th className="text-left font-medium px-4 py-2.5">Employee ID</th>
                <th className="text-left font-medium px-4 py-2.5">Joining Date</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSelected(u)}
                  className="hover:bg-gray-50/60 cursor-pointer"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" className="w-7 h-7 rounded-full object-cover" />
                      ) : (
                        <UserCircle size={26} className="text-gray-300" />
                      )}
                      <div className="min-w-0">
                        <div className="font-medium text-gray-900 truncate">{u.name || '—'}</div>
                        <div className="text-xs text-gray-400 truncate">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {u.employeeId ? (
                      <span className="inline-flex items-center gap-1"><BadgeCheck size={12} className="text-gray-400" />{u.employeeId}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-600">
                    {u.dateOfJoining ? (
                      <span className="inline-flex items-center gap-1"><CalendarDays size={12} className="text-gray-400" />{u.dateOfJoining}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-600">
                      <Eye size={12} /> View
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {selected && <DetailsModal user={selected} roleLabel={roleLabelFor(selected)} canEdit={canEdit} onClose={() => setSelected(null)} />}
    </div>
  );
};

export default EmployeeRecordsTab;
