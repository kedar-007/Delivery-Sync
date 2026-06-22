import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { docsApi } from '../lib/api';
import { useToast } from '../components/ui/Toast';
import type { ProjectDocFolder, ProjectDocument, ProjectDocShare, ProjectDocVersion, ProjectMember, TenantUser } from '../types';

// ── Normalisers ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseFolder = (r: any): ProjectDocFolder => ({
  ...r,
  id:             String(r.ROWID ?? r.id ?? ''),
  tenantId:       r.tenant_id       ?? r.tenantId,
  projectId:      r.project_id      ?? r.projectId,
  parentFolderId: r.parent_folder_id || null,
  createdBy:      r.created_by       ?? r.createdBy,
  isDeleted:      r.is_deleted       ?? 'false',
  visibility:     (r.visibility ?? 'ALL') as 'ALL' | 'RESTRICTED',
  allowedUserIds: (() => { try { return JSON.parse(r.allowed_user_ids ?? '[]'); } catch { return []; } })(),
  createdAt:      r.CREATEDTIME      ?? r.createdAt,
  updatedAt:      r.MODIFIEDTIME     ?? r.updatedAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseDoc = (r: any): ProjectDocument => ({
  ...r,
  id:             String(r.ROWID ?? r.id ?? ''),
  tenantId:       r.tenant_id       ?? r.tenantId,
  projectId:      r.project_id      ?? r.projectId,
  folderId:       r.folder_id       || null,
  fileName:       r.file_name        ?? r.fileName,
  fileUrl:        r.file_url         ?? r.fileUrl,
  fileSizeKb:     parseFloat(r.file_size_kb ?? r.fileSizeKb ?? 0),
  mimeType:       r.mime_type        ?? r.mimeType,
  fileExtension:  r.file_extension   ?? r.fileExtension ?? '',
  currentVersion: r.current_version  ?? r.currentVersion ?? '1',
  uploadedBy:     r.uploaded_by      ?? r.uploadedBy,
  isDeleted:      r.is_deleted       ?? 'false',
  tags:           (() => { try { return JSON.parse(r.tags ?? '[]'); } catch { return []; } })(),
  versions:       Array.isArray(r.versions) ? r.versions.map(normaliseVersion) : undefined,
  createdAt:      r.CREATEDTIME      ?? r.createdAt,
  updatedAt:      r.MODIFIEDTIME     ?? r.updatedAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseVersion = (r: any): ProjectDocVersion => ({
  ...r,
  id:            String(r.ROWID ?? r.id ?? ''),
  documentId:    r.document_id   ?? r.documentId,
  versionNumber: r.version_number ?? r.versionNumber ?? '1',
  fileName:      r.file_name      ?? r.fileName,
  fileUrl:       r.file_url       ?? r.fileUrl,
  fileSizeKb:    parseFloat(r.file_size_kb ?? r.fileSizeKb ?? 0),
  mimeType:      r.mime_type      ?? r.mimeType,
  changeNote:    r.change_note    ?? r.changeNote ?? '',
  uploadedBy:    r.uploaded_by    ?? r.uploadedBy,
  createdAt:     r.CREATEDTIME    ?? r.createdAt,
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const normaliseShare = (r: any): ProjectDocShare => ({
  ...r,
  id:          String(r.ROWID ?? r.id ?? ''),
  tenantId:    r.tenant_id   ?? r.tenantId,
  projectId:   r.project_id  ?? r.projectId,
  shareType:   r.share_type  ?? r.shareType,
  documentId:  r.document_id || null,
  folderId:    r.folder_id   || null,
  shareToken:  r.share_token  ?? r.shareToken,
  shareUrl:    r.shareUrl    ?? r.share_url,
  targetName:  r.targetName  ?? r.target_name,
  accessLevel: r.access_level ?? r.accessLevel ?? 'VIEW',
  linkType:    r.link_type   ?? r.linkType   ?? 'PUBLIC',
  expiresAt:   r.expires_at  || null,
  isActive:    r.is_active   ?? 'true',
  viewCount:   r.view_count  ?? '0',
  createdBy:   r.created_by  ?? r.createdBy,
  createdAt:   r.CREATEDTIME ?? r.createdAt,
});

// ── Folder hooks ──────────────────────────────────────────────────────────────

export const useDocFolders = (projectId: string, parentFolderId?: string) =>
  useQuery({
    queryKey: ['doc-folders', projectId, parentFolderId ?? 'root'],
    queryFn:  () => docsApi.listFolders(projectId, parentFolderId).then((r) => (r as unknown[]).map(normaliseFolder)),
    enabled:  !!projectId,
  });

export const useDocFolderContents = (projectId: string, folderId: string | null) =>
  useQuery({
    queryKey: ['doc-folder-contents', projectId, folderId ?? 'root'],
    queryFn: async () => {
      if (folderId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await docsApi.getFolderContents(projectId, folderId) as any;
        return {
          folder:     res.folder     ? normaliseFolder(res.folder) : null,
          subFolders: (res.subFolders ?? []).map(normaliseFolder),
          documents:  (res.documents  ?? []).map(normaliseDoc),
        };
      }
      // Root level — two parallel queries
      const [folders, docs] = await Promise.all([
        docsApi.listFolders(projectId).then((r) => (r as unknown[]).map(normaliseFolder)),
        docsApi.listDocuments(projectId, '').then((r) => (r as unknown[]).map(normaliseDoc)),
      ]);
      return { folder: null, subFolders: folders, documents: docs };
    },
    enabled: !!projectId,
  });

export const useAllProjectDocuments = (projectId: string) =>
  useQuery({
    queryKey: ['doc-all-documents', projectId],
    queryFn:  () => docsApi.listDocuments(projectId, undefined, true).then((r) => (r as unknown[]).map(normaliseDoc)),
    enabled:  !!projectId,
  });

export const useCreateDocFolder = (projectId: string) => {
  const qc    = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: { name: string; parentFolderId?: string }) =>
      docsApi.createFolder(projectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc-folder-contents', projectId] });
      qc.invalidateQueries({ queryKey: ['doc-folders', projectId] });
      toast.success('Folder created');
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useRenameDocFolder = (projectId: string) => {
  const qc    = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ folderId, name }: { folderId: string; name: string }) =>
      docsApi.renameFolder(projectId, folderId, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc-folder-contents', projectId] });
      toast.success('Folder renamed');
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteDocFolder = (projectId: string) => {
  const qc    = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (folderId: string) => docsApi.deleteFolder(projectId, folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc-folder-contents', projectId] });
      toast.success('Folder deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ── Document hooks ────────────────────────────────────────────────────────────

export const useUploadDocument = (projectId: string) => {
  const qc    = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: { name?: string; fileName: string; contentType: string; base64: string; folderId?: string; description?: string; tags?: string[] }) =>
      docsApi.uploadDocument(projectId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc-folder-contents', projectId] });
      qc.invalidateQueries({ queryKey: ['doc-all-documents', projectId] });
      toast.success('File uploaded');
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useUpdateDocument = (projectId: string) => {
  const qc    = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ docId, ...data }: { docId: string; name?: string; description?: string; tags?: string[]; folderId?: string }) =>
      docsApi.updateDocument(projectId, docId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc-folder-contents', projectId] });
      qc.invalidateQueries({ queryKey: ['doc-all-documents', projectId] });
      toast.success('Document updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDeleteDocument = (projectId: string) => {
  const qc    = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (docId: string) => docsApi.deleteDocument(projectId, docId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc-folder-contents', projectId] });
      qc.invalidateQueries({ queryKey: ['doc-all-documents', projectId] });
      toast.success('Document deleted');
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useDocVersions = (projectId: string, docId: string) =>
  useQuery({
    queryKey: ['doc-versions', projectId, docId],
    queryFn:  () => docsApi.getVersions(projectId, docId).then((r) => (r as unknown[]).map(normaliseVersion)),
    enabled:  !!projectId && !!docId,
  });

// ── Share hooks ───────────────────────────────────────────────────────────────

export const useProjectDocShares = (projectId: string) =>
  useQuery({
    queryKey: ['doc-shares', projectId],
    queryFn:  () => docsApi.listShares(projectId).then((r) => (r as unknown[]).map(normaliseShare)),
    enabled:  !!projectId,
  });

export const useCreateDocShare = (projectId: string) => {
  const qc    = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: { shareType: 'DOCUMENT' | 'FOLDER'; documentId?: string; folderId?: string; accessLevel?: string; linkType?: string; expiresAt?: string }) =>
      docsApi.createShare(projectId, data).then(normaliseShare),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc-shares', projectId] });
      toast.success('Share link created');
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

export const useRevokeDocShare = (projectId: string) => {
  const qc    = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (shareToken: string) => docsApi.revokeShare(shareToken),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc-shares', projectId] });
      toast.success('Share link revoked');
    },
    onError: (e: Error) => toast.error(e.message),
  });
};

// ── Folder access control hooks ───────────────────────────────────────────────

export const useProjectMembers = (projectId: string) =>
  useQuery({
    queryKey: ['project-members', projectId],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn:  () => docsApi.getProjectMembers(projectId).then((r) => (r as any[]) as ProjectMember[]),
    enabled:  !!projectId,
    staleTime: 60_000,
  });

export const useTenantUsers = () =>
  useQuery({
    queryKey: ['tenant-users'],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    queryFn:  () => docsApi.getTenantUsers().then((r) => (r as any[]) as TenantUser[]),
    staleTime: 120_000,
  });

export const useUpdateFolderAccess = (projectId: string) => {
  const qc    = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ folderId, visibility, allowedUserIds }: { folderId: string; visibility: string; allowedUserIds: string[] }) =>
      docsApi.updateFolderAccess(projectId, folderId, { visibility, allowedUserIds }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['doc-folder-contents', projectId] });
      qc.invalidateQueries({ queryKey: ['doc-folders', projectId] });
      toast.success('Folder access updated');
    },
    onError: (e: Error) => toast.error(e.message),
  });
};
