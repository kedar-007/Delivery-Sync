/// Admin screen — user management and audit log.
/// Only accessible to TENANT_ADMIN and SUPER_ADMIN roles.
/// API: ${AppConstants.baseCore}/admin
library;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/models/models.dart';
import '../../../../shared/widgets/ds_metric_card.dart';
import '../../../../shared/widgets/user_avatar.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final adminUsersProvider = FutureProvider.autoDispose<List<AdminUser>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/admin/users',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map ? (data['users'] as List<dynamic>? ?? []) : []);
  return list.map((e) => AdminUser.fromJson(e as Map<String, dynamic>)).toList();
});

final auditLogsProvider = FutureProvider.autoDispose<List<AuditLog>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/admin/audit-logs',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map ? (data['logs'] as List<dynamic>? ?? []) : []);
  return list.map((e) => AuditLog.fromJson(e as Map<String, dynamic>)).toList();
});


// ── Screen ────────────────────────────────────────────────────────────────────

class AdminScreen extends ConsumerStatefulWidget {
  const AdminScreen({super.key});

  @override
  ConsumerState<AdminScreen> createState() => _AdminScreenState();
}

class _AdminScreenState extends ConsumerState<AdminScreen>
    with SingleTickerProviderStateMixin {
  late final _tabController = TabController(length: 2, vsync: this);

  @override
  void dispose() {
    _tabController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Admin'),
        backgroundColor: ds.bgPage,
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.people_rounded, size: 18), text: 'Users'),
            Tab(icon: Icon(Icons.history_rounded, size: 18), text: 'Audit Log'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _UsersTab(onRefresh: () => ref.invalidate(adminUsersProvider)),
          _AuditLogTab(onRefresh: () => ref.invalidate(auditLogsProvider)),
        ],
      ),
    );
  }
}

// ── Users tab ─────────────────────────────────────────────────────────────────

class _UsersTab extends ConsumerStatefulWidget {
  const _UsersTab({required this.onRefresh});
  final VoidCallback onRefresh;

  @override
  ConsumerState<_UsersTab> createState() => _UsersTabState();
}

class _UsersTabState extends ConsumerState<_UsersTab> {
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final ds    = context.ds;
    final users = ref.watch(adminUsersProvider);

    return Column(
      children: [
        // Search bar
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 12, 16, 8),
          child: TextField(
            decoration: InputDecoration(
              hintText: 'Search users…',
              prefixIcon: const Icon(Icons.search_rounded),
              suffixIcon: _search.isNotEmpty
                  ? IconButton(
                      icon: const Icon(Icons.close_rounded),
                      onPressed: () => setState(() => _search = ''),
                    )
                  : null,
            ),
            onChanged: (v) => setState(() => _search = v),
          ),
        ),

        // List
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => widget.onRefresh(),
            color: AppColors.primaryLight,
            child: users.when(
              data: (list) {
                final filtered = _search.isEmpty
                    ? list
                    : list
                        .where((u) =>
                            u.name.toLowerCase().contains(_search.toLowerCase()) ||
                            u.email.toLowerCase().contains(_search.toLowerCase()))
                        .toList();
                if (filtered.isEmpty) {
                  return Center(
                    child: Text(
                      _search.isEmpty ? 'No users' : 'No results for "$_search"',
                      style: TextStyle(color: ds.textMuted),
                    ),
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 0, 16, 100),
                  itemCount: filtered.length,
                  itemBuilder: (_, i) => _UserCard(
                    filtered[i],
                    onTap: () => _showUserSheet(context, filtered[i]),
                  ),
                );
              },
              loading: () => ListView(
                children: List.generate(4, (_) => const ShimmerCard()),
              ),
              error: (e, _) => Center(
                child: Text('$e', style: const TextStyle(color: AppColors.error)),
              ),
            ),
          ),
        ),
      ],
    );
  }

  void _showUserSheet(BuildContext context, AdminUser user) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _UserDetailSheet(
        user: user,
        onUpdated: () => ref.invalidate(adminUsersProvider),
      ),
    );
  }
}

// ── Audit log tab ─────────────────────────────────────────────────────────────

class _AuditLogTab extends ConsumerWidget {
  const _AuditLogTab({required this.onRefresh});
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final logs = ref.watch(auditLogsProvider);
    final ds   = context.ds;

    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      color: AppColors.primaryLight,
      child: logs.when(
        data: (list) {
          if (list.isEmpty) {
            return Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.history_toggle_off_rounded,
                    size: 56, color: ds.textMuted),
                const SizedBox(height: 12),
                Text('No audit logs', style: TextStyle(color: ds.textMuted)),
              ]),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 80),
            itemCount: list.length,
            itemBuilder: (_, i) => _AuditLogItem(list[i]),
          );
        },
        loading: () => ListView(
          children: List.generate(5, (_) => const ShimmerCard(height: 60)),
        ),
        error: (e, _) => Center(
          child: Text('$e', style: const TextStyle(color: AppColors.error)),
        ),
      ),
    );
  }
}

// ── User card ─────────────────────────────────────────────────────────────────

class _UserCard extends StatelessWidget {
  const _UserCard(this.user, {required this.onTap});
  final AdminUser user;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final isActive = user.status == 'ACTIVE';
    final roleColor = switch (user.role) {
      'TENANT_ADMIN'  => AppColors.ragRed,
      'DELIVERY_LEAD' => AppColors.ragAmber,
      'PMO'           => AppColors.info,
      'EXEC'          => const Color(0xFFA855F7),
      _               => AppColors.ragGreen,
    };

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ds.border),
        ),
        child: Row(children: [
          UserAvatar(name: user.name, avatarUrl: user.avatarUrl, radius: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(user.name,
                  style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700,
                      color: ds.textPrimary)),
              Text(user.email,
                  style: TextStyle(fontSize: 12, color: ds.textMuted),
                  overflow: TextOverflow.ellipsis),
            ]),
          ),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: roleColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(5),
              ),
              child: Text(
                user.role.replaceAll('_', ' '),
                style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700,
                    color: roleColor),
              ),
            ),
            const SizedBox(height: 4),
            Row(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 7, height: 7,
                decoration: BoxDecoration(
                  color: isActive ? AppColors.ragGreen : AppColors.ragRed,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 4),
              Text(isActive ? 'Active' : user.status.toLowerCase(),
                  style: TextStyle(fontSize: 10, color: ds.textMuted)),
            ]),
          ]),
        ]),
      ),
    ).animate().fadeIn(duration: 300.ms);
  }
}

// ── Audit log item ────────────────────────────────────────────────────────────

class _AuditLogItem extends StatefulWidget {
  const _AuditLogItem(this.log);
  final AuditLog log;

  @override
  State<_AuditLogItem> createState() => _AuditLogItemState();
}

class _AuditLogItemState extends State<_AuditLogItem> {
  bool _expanded = false;

  static Color _actionColor(String action) {
    final a = action.toUpperCase();
    if (a.contains('DELETE') || a.contains('REMOVE')) return AppColors.ragRed;
    if (a.contains('CREATE') || a.contains('ADD') || a.contains('INVITE')) return AppColors.ragGreen;
    if (a.contains('UPDATE') || a.contains('EDIT') || a.contains('CHANGE')) return AppColors.ragAmber;
    return AppColors.primaryLight;
  }

  @override
  Widget build(BuildContext context) {
    final ds  = context.ds;
    final log = widget.log;
    DateTime? ts;
    try { ts = DateTime.parse(log.createdAt); } catch (_) {}

    final hasDiff = (log.oldValue != null && log.oldValue!.isNotEmpty) ||
                    (log.newValue != null && log.newValue!.isNotEmpty);
    final actionColor = _actionColor(log.action);
    final name  = log.performedByName ?? log.performedByEmail ?? 'System';
    final email = log.performedByEmail;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Main row ───────────────────────────────────────────────────
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                UserAvatar(name: name, avatarUrl: log.avatarUrl, radius: 18),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      // actor name + timestamp
                      Row(children: [
                        Expanded(
                          child: Text(name,
                            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
                                color: ds.textPrimary),
                            overflow: TextOverflow.ellipsis),
                        ),
                        if (ts != null)
                          Text(
                            DateFormat('d MMM, h:mm a').format(ts.toLocal()),
                            style: TextStyle(fontSize: 10, color: ds.textMuted),
                          ),
                      ]),
                      if (email != null && email != name) ...[
                        const SizedBox(height: 1),
                        Text(email, style: TextStyle(fontSize: 10, color: ds.textMuted),
                          overflow: TextOverflow.ellipsis),
                      ],
                      const SizedBox(height: 6),
                      // action badge + entity chip
                      Wrap(spacing: 6, runSpacing: 4, children: [
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: actionColor.withValues(alpha: 0.12),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(
                            log.action.replaceAll('_', ' '),
                            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                                color: actionColor),
                          ),
                        ),
                        if (log.entityType != null)
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: ds.bgElevated,
                              borderRadius: BorderRadius.circular(6),
                              border: Border.all(color: ds.border),
                            ),
                            child: Text(
                              log.entityType!.replaceAll('_', ' '),
                              style: TextStyle(fontSize: 10, color: ds.textSecondary,
                                  fontWeight: FontWeight.w500),
                            ),
                          ),
                      ]),
                    ],
                  ),
                ),
                if (hasDiff) ...[
                  const SizedBox(width: 6),
                  GestureDetector(
                    onTap: () => setState(() => _expanded = !_expanded),
                    child: Icon(
                      _expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                      size: 18, color: ds.textMuted,
                    ),
                  ),
                ],
              ],
            ),
          ),
          // ── Diff section ───────────────────────────────────────────────
          if (hasDiff && _expanded)
            Container(
              width: double.infinity,
              decoration: BoxDecoration(
                color: ds.bgElevated,
                border: Border(top: BorderSide(color: ds.border)),
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(14)),
              ),
              padding: const EdgeInsets.fromLTRB(14, 10, 14, 12),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  if (log.oldValue != null && log.oldValue!.isNotEmpty) ...[
                    Text('Before', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600,
                        color: AppColors.ragRed)),
                    const SizedBox(height: 3),
                    Text(log.oldValue!, style: TextStyle(fontSize: 11, color: ds.textSecondary),
                        maxLines: 4, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 8),
                  ],
                  if (log.newValue != null && log.newValue!.isNotEmpty) ...[
                    Text('After', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600,
                        color: AppColors.ragGreen)),
                    const SizedBox(height: 3),
                    Text(log.newValue!, style: TextStyle(fontSize: 11, color: ds.textSecondary),
                        maxLines: 4, overflow: TextOverflow.ellipsis),
                  ],
                ],
              ),
            ),
        ],
      ),
    );
  }
}

// ── User detail sheet ─────────────────────────────────────────────────────────

class _UserDetailSheet extends ConsumerStatefulWidget {
  const _UserDetailSheet({required this.user, required this.onUpdated});
  final AdminUser user;
  final VoidCallback onUpdated;

  @override
  ConsumerState<_UserDetailSheet> createState() => _UserDetailSheetState();
}

class _UserDetailSheetState extends ConsumerState<_UserDetailSheet> {
  late String _role;
  bool _loading = false;

  static const _roles = ['TENANT_ADMIN', 'TEAM_MEMBER'];

  @override
  void initState() {
    super.initState();
    _role = widget.user.role;
  }

  @override
  Widget build(BuildContext context) {
    final ds   = context.ds;
    final user = widget.user;

    return Padding(
      padding: EdgeInsets.only(
        left: 24, right: 24, top: 24,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                  color: ds.border, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 20),

          // User header
          Row(children: [
            UserAvatar(name: user.name, avatarUrl: user.avatarUrl, radius: 26),
            const SizedBox(width: 12),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(user.name,
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w800,
                      color: ds.textPrimary)),
              Text(user.email,
                  style: TextStyle(fontSize: 12, color: ds.textMuted)),
            ]),
          ]),
          const SizedBox(height: 20),

          // Role selector
          DropdownButtonFormField<String>(
            value: _role,
            decoration: const InputDecoration(labelText: 'Role'),
            items: _roles.map((r) => DropdownMenuItem(
              value: r,
              child: Text(r.replaceAll('_', ' ')),
            )).toList(),
            onChanged: (v) => setState(() => _role = v!),
            dropdownColor: ds.bgElevated,
          ),
          const SizedBox(height: 16),

          // Actions
          Row(children: [
            Expanded(
              child: ElevatedButton(
                onPressed: _loading ? null : _saveRole,
                child: _loading
                    ? const SizedBox(width: 20, height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : const Text('Save Role'),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: user.status == 'ACTIVE'
                      ? AppColors.ragRed
                      : AppColors.ragGreen,
                ),
                onPressed: _loading ? null : _toggleStatus,
                child: Text(user.status == 'ACTIVE'
                    ? 'Suspend'
                    : 'Activate'),
              ),
            ),
          ]),
        ],
      ),
    );
  }

  Future<void> _saveRole() async {
    setState(() => _loading = true);
    try {
      await ApiClient.instance.patch(
        '${AppConstants.baseCore}/admin/users/${widget.user.id}',
        data: {'role': _role},
      );
      widget.onUpdated();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'),
              backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _toggleStatus() async {
    final newStatus =
        widget.user.status == 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
    setState(() => _loading = true);
    try {
      await ApiClient.instance.patch(
        '${AppConstants.baseCore}/admin/users/${widget.user.id}',
        data: {'status': newStatus},
      );
      widget.onUpdated();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'),
              backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }
}
