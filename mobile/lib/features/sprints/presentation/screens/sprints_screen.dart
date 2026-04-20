import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/models/models.dart';
import '../../../../shared/widgets/ds_metric_card.dart';
import '../../../../shared/widgets/user_avatar.dart';
import '../../../auth/providers/auth_provider.dart';
import '../../../dashboard/providers/dashboard_provider.dart';

// ─────────────────────────────────────────────────────────────────────────────
//  Providers
// ─────────────────────────────────────────────────────────────────────────────

// Sprints require project_id (backend BIGINT FK constraint)
final _sprintsProvider =
    FutureProvider.autoDispose.family<List<Sprint>, String>((ref, projectId) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseSprints}/sprints',
    queryParameters: {'project_id': projectId},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map
          ? (data['sprints'] as List<dynamic>? ?? data['data'] as List<dynamic>? ?? [])
          : []);
  return list.map((e) => Sprint.fromJson(e as Map<String, dynamic>)).toList();
});

final _myTasksSprintProvider = FutureProvider.autoDispose<List<SprintTask>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseSprints}/tasks/my-tasks',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map
          ? (data['tasks'] as List<dynamic>? ?? data['myTasks'] as List<dynamic>? ?? [])
          : []);
  return list.map((e) => SprintTask.fromJson(e as Map<String, dynamic>)).toList();
});

final _sprintTasksProvider =
    FutureProvider.autoDispose.family<List<SprintTask>, String>((ref, sprintId) async {
  // Backend exposes /board not /tasks; board returns { sprint, board: { STATUS: [tasks] } }
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseSprints}/sprints/$sprintId/board',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  if (data == null) return [];

  // data may be the board map directly, or wrapped in { board: {...} }
  final boardMap = (data is Map && data.containsKey('board'))
      ? data['board'] as Map?
      : (data is Map ? data : null);

  if (boardMap == null) return [];

  // Flatten all status columns into one list
  final allTasks = <SprintTask>[];
  for (final entry in boardMap.entries) {
    final col = entry.value;
    if (col is List) {
      allTasks.addAll(
        col.map((t) => SprintTask.fromJson(t as Map<String, dynamic>)),
      );
    }
  }
  return allTasks;
});

final _taskCommentsProvider =
    FutureProvider.autoDispose.family<List<dynamic>, String>((ref, taskId) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseSprints}/tasks/$taskId/comments',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['comments'] as List? ?? d['data'] as List? ?? [];
  return [];
});

final _taskTimeEntriesProvider =
    FutureProvider.autoDispose.family<List<dynamic>, String>((ref, taskId) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseTime}/entries',
    queryParameters: {'taskId': taskId},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['entries'] as List? ?? d['data'] as List? ?? [];
  return [];
});

// All users (for member picker + assignee lookup)
final _sprintUsersProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  try {
    final raw = await ApiClient.instance.get<Map<String, dynamic>>(
      '${AppConstants.baseCore}/auth/users',
      fromJson: (r) => r as Map<String, dynamic>,
    );
    final d = raw['data'];
    final List<dynamic> list = d is Map
        ? (d['users'] as List? ?? [])
        : (d is List ? d : []);
    return list.whereType<Map<String, dynamic>>().map((u) => {
      'id':        (u['id'] ?? u['ROWID'] ?? '').toString(),
      'name':      u['name'] as String? ?? '',
      'email':     u['email'] as String? ?? '',
      'avatarUrl': u['avatarUrl'] as String? ?? u['avatar_url'] as String?,
    }).where((u) => u['id']!.isNotEmpty).toList();
  } catch (_) {
    return [];
  }
});

// Fetches all time entries for the current user (no taskId filter)
final _myAllTimeEntriesProvider = FutureProvider.autoDispose<Map<String, double>>((ref) async {
  try {
    final raw = await ApiClient.instance.get<Map<String, dynamic>>(
      '${AppConstants.baseTime}/entries',
      fromJson: (r) => r as Map<String, dynamic>,
    );
    final d = raw['data'];
    final List<dynamic> entries = d is List
        ? d
        : (d is Map ? (d['entries'] as List? ?? d['data'] as List? ?? []) : []);
    final map = <String, double>{};
    for (final e in entries) {
      if (e is! Map) continue;
      final tid = (e['task_id'] ?? e['taskId'] ?? '').toString();
      if (tid.isEmpty || tid == '0') continue;
      map[tid] = (map[tid] ?? 0) + ((e['hours'] as num?) ?? 0).toDouble();
    }
    return map;
  } catch (_) {
    return {};
  }
});

// ─────────────────────────────────────────────────────────────────────────────
//  Screen — Sprint list + inline detail
// ─────────────────────────────────────────────────────────────────────────────

class SprintsScreen extends ConsumerStatefulWidget {
  const SprintsScreen({super.key});

  @override
  ConsumerState<SprintsScreen> createState() => _SprintsScreenState();
}

class _SprintsScreenState extends ConsumerState<SprintsScreen> {
  Sprint? _selected;

  @override
  Widget build(BuildContext context) {
    if (_selected != null) {
      return _SprintDetailView(
        sprint: _selected!,
        onBack: () => setState(() => _selected = null),
      );
    }
    return _SprintListView(onSelect: (s) => setState(() => _selected = s));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Sprint List
// ─────────────────────────────────────────────────────────────────────────────

class _SprintListView extends ConsumerStatefulWidget {
  const _SprintListView({required this.onSelect});
  final ValueChanged<Sprint> onSelect;

  @override
  ConsumerState<_SprintListView> createState() => _SprintListViewState();
}

class _SprintListViewState extends ConsumerState<_SprintListView> {
  String _filter = 'ACTIVE';
  Project? _selectedProject;

  static const _filters = [
    ('ALL',       'All'),
    ('ACTIVE',    'Active'),
    ('PLANNING',  'Planning'),
    ('COMPLETED', 'Completed'),
  ];

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final projects = ref.watch(projectsProvider);

    // Auto-select first project once loaded
    projects.whenData((list) {
      if (_selectedProject == null && list.isNotEmpty) {
        WidgetsBinding.instance.addPostFrameCallback((_) {
          if (mounted) setState(() => _selectedProject = list.first);
        });
      }
    });

    final sprints = _selectedProject != null
        ? ref.watch(_sprintsProvider(_selectedProject!.id))
        : const AsyncValue<List<Sprint>>.loading();

    final currentUser = ref.watch(currentUserProvider);
    final canWrite = currentUser?.hasPermission(Permissions.sprintWrite) == true
        || currentUser?.role == 'TENANT_ADMIN';

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Sprints'),
        backgroundColor: ds.bgPage,
        surfaceTintColor: Colors.transparent,
        actions: [
          if (_selectedProject != null)
            IconButton(
              icon: const Icon(Icons.refresh_rounded),
              onPressed: () => ref.invalidate(_sprintsProvider(_selectedProject!.id)),
            ),
        ],
      ),
      floatingActionButton: canWrite
          ? FloatingActionButton.extended(
              onPressed: () => _showCreateSprint(context),
              backgroundColor: AppColors.primary,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.add_rounded),
              label: const Text('Create Sprint',
                  style: TextStyle(fontWeight: FontWeight.w700)),
            )
          : null,
      body: Column(children: [
        // Project picker
        projects.when(
          data: (list) {
            if (list.isEmpty) return const SizedBox.shrink();
            return Container(
              height: 52,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
              child: DropdownButtonHideUnderline(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  decoration: BoxDecoration(
                    color: ds.bgElevated,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: ds.border),
                  ),
                  child: DropdownButton<Project>(
                    value: _selectedProject ?? list.first,
                    isExpanded: true,
                    dropdownColor: ds.bgElevated,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w600,
                        color: ds.textPrimary),
                    items: list.map((p) => DropdownMenuItem(
                      value: p,
                      child: Row(children: [
                        RagBadge(p.ragStatus ?? 'GREEN'),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(p.name,
                              overflow: TextOverflow.ellipsis,
                              style: TextStyle(
                                  fontSize: 13,
                                  fontWeight: FontWeight.w600,
                                  color: ds.textPrimary)),
                        ),
                      ]),
                    )).toList(),
                    onChanged: (p) {
                      if (p != null) setState(() => _selectedProject = p);
                    },
                  ),
                ),
              ),
            );
          },
          loading: () => const SizedBox(height: 52),
          error: (_, __) => const SizedBox.shrink(),
        ),

        // Status filter chips
        _FilterBar(
          filters: _filters,
          selected: _filter,
          onSelect: (v) => setState(() => _filter = v),
        ),

        // Sprint list
        Expanded(
          child: _selectedProject == null
              ? Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.folder_open_rounded, size: 52, color: ds.textMuted),
                    const SizedBox(height: 12),
                    Text('Select a project to view sprints',
                        style: TextStyle(color: ds.textMuted, fontSize: 15)),
                  ]),
                )
              : RefreshIndicator(
                  onRefresh: () async =>
                      ref.invalidate(_sprintsProvider(_selectedProject!.id)),
                  color: AppColors.primaryLight,
                  child: sprints.when(
                    data: (list) {
                      final isOrgWide = currentUser?.hasPermission(Permissions.orgRoleRead) == true
                          || currentUser?.role == 'TENANT_ADMIN';

                      if (list.isEmpty) {
                        return Center(
                          child: Padding(
                            padding: const EdgeInsets.all(32),
                            child: Column(mainAxisSize: MainAxisSize.min, children: [
                              Icon(Icons.directions_run_rounded,
                                  size: 52, color: ds.textMuted),
                              const SizedBox(height: 12),
                              Text(
                                isOrgWide
                                    ? 'No sprints yet for this project'
                                    : 'You are not part of any sprint',
                                style: TextStyle(
                                    color: ds.textPrimary,
                                    fontSize: 15,
                                    fontWeight: FontWeight.w600),
                                textAlign: TextAlign.center,
                              ),
                              const SizedBox(height: 8),
                              Text(
                                isOrgWide
                                    ? 'Create a sprint to start tracking work.'
                                    : 'Ask your team lead or admin to add you to a sprint.',
                                style: TextStyle(color: ds.textMuted, fontSize: 13),
                                textAlign: TextAlign.center,
                              ),
                            ]),
                          ),
                        );
                      }

                      final filtered = _filter == 'ALL'
                          ? list
                          : list.where((s) => s.status == _filter).toList();

                      if (filtered.isEmpty) {
                        return Center(
                          child: Column(mainAxisSize: MainAxisSize.min, children: [
                            Icon(Icons.directions_run_rounded,
                                size: 52, color: ds.textMuted),
                            const SizedBox(height: 12),
                            Text('No ${_filter.toLowerCase()} sprints',
                                style: TextStyle(color: ds.textMuted, fontSize: 15)),
                          ]),
                        );
                      }

                      return ListView.builder(
                        padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
                        itemCount: filtered.length,
                        itemBuilder: (_, i) => _SprintCard(
                          sprint: filtered[i],
                          onTap: () => widget.onSelect(filtered[i]),
                        ).animate().fadeIn(
                            duration: 250.ms,
                            delay: Duration(milliseconds: i * 40)),
                      );
                    },
                    loading: () => ListView(
                      padding: const EdgeInsets.all(16),
                      children: List.generate(4, (_) => const ShimmerCard(height: 90)),
                    ),
                    error: (e, _) => Center(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.error_outline_rounded,
                            size: 48, color: AppColors.error),
                        const SizedBox(height: 12),
                        Text('$e',
                            style: const TextStyle(color: AppColors.error),
                            textAlign: TextAlign.center),
                        const SizedBox(height: 12),
                        OutlinedButton(
                          onPressed: () =>
                              ref.invalidate(_sprintsProvider(_selectedProject!.id)),
                          child: const Text('Retry'),
                        ),
                      ]),
                    ),
                  ),
                ),
        ),
      ]),
    );
  }

  void _showCreateSprint(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CreateSprintSheet(
        preselectedProjectId: _selectedProject?.id,
        onCreated: (projectId) {
          ref.invalidate(_sprintsProvider(projectId));
        },
      ),
    );
  }
}

class _SprintCard extends StatelessWidget {
  const _SprintCard({required this.sprint, required this.onTap});
  final Sprint sprint;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final isActive = sprint.status == 'ACTIVE';
    final accent = _statusColor(sprint.status);

    DateTime? start, end;
    try {
      if (sprint.startDate != null) start = DateTime.parse(sprint.startDate!);
      if (sprint.endDate != null) end     = DateTime.parse(sprint.endDate!);
    } catch (_) {}

    int? daysLeft;
    if (end != null) daysLeft = end.difference(DateTime.now()).inDays;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: ds.border),
          boxShadow: [
            BoxShadow(
              color: isActive
                  ? accent.withOpacity(0.08)
                  : Colors.black.withOpacity(0.04),
              blurRadius: 10,
              offset: const Offset(0, 3),
            ),
          ],
        ),
        // ClipRRect so the left accent strip respects the rounded corners
        child: ClipRRect(
          borderRadius: BorderRadius.circular(15),
          child: IntrinsicHeight(
            child: Row(children: [
              // Left accent strip
              Container(width: 3, color: accent),
              // Card content
              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Text(sprint.name,
                    style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w700,
                      color: ds.textPrimary,
                    )),
              ),
              _SprintStatusBadge(sprint.status),
            ]),
            if (sprint.goalDescription?.isNotEmpty == true) ...[
              const SizedBox(height: 6),
              Text(sprint.goalDescription!,
                  style: TextStyle(fontSize: 12, color: ds.textSecondary, height: 1.4),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis),
            ],
            const SizedBox(height: 12),
            Row(children: [
              if (start != null) ...[
                Icon(Icons.play_arrow_rounded, size: 14, color: ds.textMuted),
                const SizedBox(width: 4),
                Text(_fmtDate(sprint.startDate!),
                    style: TextStyle(fontSize: 11, color: ds.textMuted)),
                const SizedBox(width: 12),
              ],
              if (end != null) ...[
                Icon(Icons.flag_rounded, size: 14, color: ds.textMuted),
                const SizedBox(width: 4),
                Text(_fmtDate(sprint.endDate!),
                    style: TextStyle(
                      fontSize: 11,
                      color: (daysLeft ?? 1) < 0 ? AppColors.error : ds.textMuted,
                      fontWeight: (daysLeft ?? 1) < 0 ? FontWeight.w700 : FontWeight.normal,
                    )),
              ],
              const Spacer(),
              if (daysLeft != null && sprint.status == 'ACTIVE')
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: daysLeft < 0
                        ? AppColors.errorBg
                        : daysLeft < 3
                            ? AppColors.warningBg
                            : AppColors.infoBg,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    daysLeft < 0
                        ? '${-daysLeft}d over'
                        : '$daysLeft days left',
                    style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: daysLeft < 0
                          ? AppColors.error
                          : daysLeft < 3
                              ? AppColors.warning
                              : AppColors.info,
                    ),
                  ),
                ),
              const SizedBox(width: 8),
              Icon(Icons.chevron_right_rounded, size: 18, color: ds.textMuted),
            ]),
          ]),
                ),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  static Color _statusColor(String s) => switch (s) {
        'ACTIVE'    => AppColors.ragGreen,
        'PLANNING'  => AppColors.info,
        'COMPLETED' => AppColors.primaryLight,
        'CANCELLED' => AppColors.textMuted,
        _           => AppColors.textMuted,
      };

  static String _fmtDate(String s) {
    try { return DateFormat('d MMM').format(DateTime.parse(s)); } catch (_) { return s; }
  }
}

class _SprintStatusBadge extends StatelessWidget {
  const _SprintStatusBadge(this.status);
  final String status;

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      'ACTIVE'    => (AppColors.ragGreen,    'Active'),
      'PLANNING'  => (AppColors.info,        'Planning'),
      'COMPLETED' => (AppColors.primaryLight,'Completed'),
      'CANCELLED' => (AppColors.textMuted,   'Cancelled'),
      _           => (AppColors.textMuted,   status),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 6, height: 6,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 5),
        Text(label,
            style: TextStyle(
                fontSize: 10, fontWeight: FontWeight.w700, color: color)),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Create Sprint Bottom Sheet
// ─────────────────────────────────────────────────────────────────────────────

class _CreateSprintSheet extends ConsumerStatefulWidget {
  const _CreateSprintSheet({this.preselectedProjectId, required this.onCreated});
  final String? preselectedProjectId;
  final ValueChanged<String> onCreated;

  @override
  ConsumerState<_CreateSprintSheet> createState() => _CreateSprintSheetState();
}

class _CreateSprintSheetState extends ConsumerState<_CreateSprintSheet> {
  final _nameCtrl  = TextEditingController();
  final _goalCtrl  = TextEditingController();
  final _capsCtrl  = TextEditingController(text: '0');
  final _memberSearchCtrl = TextEditingController();

  String? _projectId;
  DateTime _startDate = DateTime.now();
  DateTime _endDate   = DateTime.now().add(const Duration(days: 14));
  List<String> _selectedMembers = [];
  bool _loading = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    _projectId = widget.preselectedProjectId;
  }

  @override
  void dispose() {
    _nameCtrl.dispose();
    _goalCtrl.dispose();
    _capsCtrl.dispose();
    _memberSearchCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_projectId == null || _projectId!.isEmpty) {
      setState(() => _error = 'Please select a project');
      return;
    }
    if (_nameCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Sprint name is required');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseSprints}/sprints',
        data: {
          'project_id':       _projectId,
          'name':             _nameCtrl.text.trim(),
          'goal':             _goalCtrl.text.trim(),
          'start_date':       DateFormat('yyyy-MM-dd').format(_startDate),
          'end_date':         DateFormat('yyyy-MM-dd').format(_endDate),
          'capacity_points':  int.tryParse(_capsCtrl.text) ?? 0,
          'member_ids':       _selectedMembers,
        },
      );
      widget.onCreated(_projectId!);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() { _loading = false; _error = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final projects = ref.watch(projectsProvider);
    final users    = ref.watch(_sprintUsersProvider).valueOrNull ?? [];
    final query    = _memberSearchCtrl.text.toLowerCase();
    final filtered = users
        .where((u) =>
            (u['name'] as String).toLowerCase().contains(query) ||
            (u['email'] as String).toLowerCase().contains(query))
        .take(30)
        .toList();

    return DraggableScrollableSheet(
      initialChildSize: 0.92,
      minChildSize: 0.6,
      maxChildSize: 0.97,
      expand: false,
      builder: (_, ctrl) => Container(
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(children: [
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12),
              width: 36, height: 4,
              decoration: BoxDecoration(color: ds.border, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 0),
            child: Row(children: [
              Text('Create Sprint',
                  style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: ds.textPrimary)),
              const Spacer(),
              IconButton(
                icon: Icon(Icons.close_rounded, color: ds.textMuted),
                onPressed: () => Navigator.pop(context),
              ),
            ]),
          ),
          Expanded(
            child: SingleChildScrollView(
              controller: ctrl,
              padding: EdgeInsets.fromLTRB(20, 12, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                if (_error != null)
                  Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(
                      color: AppColors.error.withOpacity(0.08),
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppColors.error.withOpacity(0.3)),
                    ),
                    child: Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 12)),
                  ),

                // Project picker
                Text('Project *', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: ds.textMuted)),
                const SizedBox(height: 6),
                projects.when(
                  data: (list) => DropdownButtonHideUnderline(
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 12),
                      decoration: BoxDecoration(
                        color: ds.bgElevated,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: ds.border),
                      ),
                      child: DropdownButton<String>(
                        value: _projectId,
                        hint: Text('Select project', style: TextStyle(color: ds.textMuted, fontSize: 13)),
                        isExpanded: true,
                        dropdownColor: ds.bgElevated,
                        items: list.map((p) => DropdownMenuItem(
                          value: p.id,
                          child: Text(p.name, overflow: TextOverflow.ellipsis,
                              style: TextStyle(fontSize: 13, color: ds.textPrimary)),
                        )).toList(),
                        onChanged: (v) => setState(() => _projectId = v),
                      ),
                    ),
                  ),
                  loading: () => const LinearProgressIndicator(),
                  error: (_, __) => const SizedBox.shrink(),
                ),
                const SizedBox(height: 14),

                // Sprint name
                TextField(
                  controller: _nameCtrl,
                  decoration: const InputDecoration(
                    labelText: 'Sprint Name *',
                    hintText: 'e.g. Sprint 1 – Feature Hardening',
                  ),
                ),
                const SizedBox(height: 12),

                // Goal
                TextField(
                  controller: _goalCtrl,
                  maxLines: 2,
                  decoration: const InputDecoration(labelText: 'Goal (optional)'),
                ),
                const SizedBox(height: 12),

                // Dates
                Row(children: [
                  Expanded(
                    child: GestureDetector(
                      onTap: () async {
                        final d = await showDatePicker(
                          context: context,
                          initialDate: _startDate,
                          firstDate: DateTime.now().subtract(const Duration(days: 30)),
                          lastDate: DateTime.now().add(const Duration(days: 365)),
                        );
                        if (d != null) setState(() => _startDate = d);
                      },
                      child: _DateField(label: 'Start Date *', date: _startDate),
                    ),
                  ),
                  const SizedBox(width: 10),
                  Expanded(
                    child: GestureDetector(
                      onTap: () async {
                        final d = await showDatePicker(
                          context: context,
                          initialDate: _endDate,
                          firstDate: _startDate,
                          lastDate: DateTime.now().add(const Duration(days: 365)),
                        );
                        if (d != null) setState(() => _endDate = d);
                      },
                      child: _DateField(label: 'End Date *', date: _endDate),
                    ),
                  ),
                ]),
                const SizedBox(height: 12),

                // Capacity
                TextField(
                  controller: _capsCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(
                    labelText: 'Capacity Points',
                    suffixText: 'pts',
                  ),
                ),
                const SizedBox(height: 20),

                // Members section
                Row(children: [
                  Icon(Icons.group_rounded, size: 16, color: ds.textMuted),
                  const SizedBox(width: 6),
                  Text('Sprint Members',
                      style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700, color: ds.textPrimary)),
                  const SizedBox(width: 8),
                  if (_selectedMembers.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text('${_selectedMembers.length} selected',
                          style: const TextStyle(fontSize: 11, color: AppColors.primaryLight,
                              fontWeight: FontWeight.w700)),
                    ),
                ]),
                const SizedBox(height: 8),

                // Selected member chips
                if (_selectedMembers.isNotEmpty) ...[
                  Wrap(
                    spacing: 6,
                    runSpacing: 6,
                    children: _selectedMembers.map((uid) {
                      final u = users.firstWhere((x) => x['id'] == uid,
                          orElse: () => {'id': uid, 'name': uid, 'avatarUrl': null});
                      return Container(
                        padding: const EdgeInsets.fromLTRB(4, 4, 10, 4),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: AppColors.primary.withOpacity(0.3)),
                        ),
                        child: Row(mainAxisSize: MainAxisSize.min, children: [
                          UserAvatar(
                            name: u['name'] as String,
                            avatarUrl: u['avatarUrl'] as String?,
                            radius: 10,
                          ),
                          const SizedBox(width: 6),
                          Text(u['name'] as String,
                              style: const TextStyle(fontSize: 12, color: AppColors.primaryLight,
                                  fontWeight: FontWeight.w600)),
                          const SizedBox(width: 4),
                          GestureDetector(
                            onTap: () => setState(() => _selectedMembers.remove(uid)),
                            child: const Icon(Icons.close_rounded, size: 14, color: AppColors.primaryLight),
                          ),
                        ]),
                      );
                    }).toList(),
                  ),
                  const SizedBox(height: 8),
                ],

                // Member search
                TextField(
                  controller: _memberSearchCtrl,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: 'Search team members…',
                    prefixIcon: const Icon(Icons.search_rounded, size: 18),
                    isDense: true,
                    contentPadding: const EdgeInsets.symmetric(vertical: 10),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                ),
                const SizedBox(height: 8),

                // User list
                if (filtered.isEmpty)
                  Padding(
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    child: Text('No users found',
                        style: TextStyle(color: ds.textMuted, fontSize: 13)),
                  )
                else
                  Container(
                    constraints: const BoxConstraints(maxHeight: 220),
                    decoration: BoxDecoration(
                      color: ds.bgPage,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: ds.border),
                    ),
                    child: ListView.separated(
                      shrinkWrap: true,
                      physics: const ClampingScrollPhysics(),
                      itemCount: filtered.length,
                      separatorBuilder: (_, __) => Divider(height: 1, color: ds.border),
                      itemBuilder: (_, i) {
                        final u   = filtered[i];
                        final uid = u['id'] as String;
                        final sel = _selectedMembers.contains(uid);
                        return GestureDetector(
                          onTap: () => setState(() {
                            if (sel) _selectedMembers.remove(uid);
                            else _selectedMembers.add(uid);
                          }),
                          child: Container(
                            color: sel ? AppColors.primary.withOpacity(0.06) : Colors.transparent,
                            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                            child: Row(children: [
                              UserAvatar(
                                name: u['name'] as String,
                                avatarUrl: u['avatarUrl'] as String?,
                                radius: 16,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                                  Text(u['name'] as String,
                                      style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
                                          color: ds.textPrimary)),
                                  Text(u['email'] as String,
                                      style: TextStyle(fontSize: 11, color: ds.textMuted),
                                      overflow: TextOverflow.ellipsis),
                                ]),
                              ),
                              if (sel)
                                const Icon(Icons.check_circle_rounded,
                                    color: AppColors.primaryLight, size: 20),
                            ]),
                          ),
                        );
                      },
                    ),
                  ),

                const SizedBox(height: 24),

                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton(
                    onPressed: _loading ? null : _submit,
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.primary,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                    ),
                    child: _loading
                        ? const SizedBox(width: 22, height: 22,
                            child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                        : Text(
                            _selectedMembers.isEmpty
                                ? 'Create Sprint'
                                : 'Create Sprint & Add ${_selectedMembers.length} Member${_selectedMembers.length > 1 ? "s" : ""}',
                            style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 15),
                          ),
                  ),
                ),
              ]),
            ),
          ),
        ]),
      ),
    );
  }
}

class _DateField extends StatelessWidget {
  const _DateField({required this.label, required this.date});
  final String label;
  final DateTime date;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
      decoration: BoxDecoration(
        color: ds.bgElevated,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: ds.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: TextStyle(fontSize: 10, color: ds.textMuted)),
        const SizedBox(height: 2),
        Row(children: [
          Icon(Icons.calendar_today_rounded, size: 13, color: ds.textMuted),
          const SizedBox(width: 6),
          Text(DateFormat('d MMM yyyy').format(date),
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: ds.textPrimary)),
        ]),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Sprint Detail (inline — uses local Navigator.push or just StatefulWidget swap)
// ─────────────────────────────────────────────────────────────────────────────

class _SprintDetailView extends ConsumerStatefulWidget {
  const _SprintDetailView({required this.sprint, required this.onBack});
  final Sprint sprint;
  final VoidCallback onBack;

  @override
  ConsumerState<_SprintDetailView> createState() => _SprintDetailViewState();
}

class _SprintDetailViewState extends ConsumerState<_SprintDetailView>
    with TickerProviderStateMixin {
  late final TabController _tab = TabController(length: 3, vsync: this);

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds     = context.ds;
    final sprint = widget.sprint;

    return PopScope(
      canPop: false,
      onPopInvoked: (_) => widget.onBack(),
      child: Scaffold(
        backgroundColor: ds.bgPage,
        appBar: AppBar(
          backgroundColor: ds.bgPage,
          surfaceTintColor: Colors.transparent,
          leading: IconButton(
            icon: const Icon(Icons.arrow_back_ios_rounded),
            onPressed: widget.onBack,
          ),
          title: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(sprint.name,
                  style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w700),
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis),
              Text(sprint.statusDisplay,
                  style: TextStyle(fontSize: 11, color: ds.textMuted)),
            ],
          ),
          actions: [
            IconButton(
              icon: const Icon(Icons.auto_awesome_rounded, color: Color(0xFFA855F7)),
              tooltip: 'AI Sprint Analysis',
              onPressed: () => _showAiAnalysis(context, sprint),
            ),
            IconButton(
              icon: const Icon(Icons.refresh_rounded),
              onPressed: () {
                ref.invalidate(_sprintTasksProvider(sprint.id));
                ref.invalidate(_myTasksSprintProvider);
              },
            ),
          ],
          bottom: PreferredSize(
            preferredSize: const Size.fromHeight(44),
            child: TabBar(
              controller: _tab,
              tabs: const [
                Tab(icon: Icon(Icons.list_alt_rounded, size: 16), text: 'My Tasks'),
                Tab(icon: Icon(Icons.view_kanban_rounded, size: 16), text: 'Board'),
                Tab(icon: Icon(Icons.bar_chart_rounded, size: 16), text: 'Analytics'),
              ],
            ),
          ),
        ),
        body: Column(children: [
          _SprintProgressHeader(sprint: sprint),
          Expanded(
            child: TabBarView(
              controller: _tab,
              children: [
                _SprintMyTasksTab(sprint: sprint),
                _SprintBoardTab(sprint: sprint),
                _SprintAnalyticsTab(sprint: sprint),
              ],
            ),
          ),
        ]),
      ),
    );
  }

  void _showAiAnalysis(BuildContext ctx, Sprint sprint) {
    showModalBottomSheet(
      context: ctx,
      isScrollControlled: true,
      backgroundColor: ctx.ds.bgCard,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => _SprintAiSheet(sprint: sprint),
    );
  }
}

// ── Sprint progress header ─────────────────────────────────────────────────

class _SprintProgressHeader extends ConsumerWidget {
  const _SprintProgressHeader({required this.sprint});
  final Sprint sprint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds    = context.ds;
    final tasks = ref.watch(_sprintTasksProvider(sprint.id));

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [AppColors.primary.withOpacity(0.08), ds.bgCard],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.primary.withOpacity(0.15)),
      ),
      child: tasks.when(
        data: (list) {
          final done  = list.where((t) => t.status == 'DONE').length;
          final total = list.length;
          final pct   = total == 0 ? 0.0 : done / total;

          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              Expanded(
                child: Text(sprint.name,
                    style: TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: ds.textPrimary)),
              ),
              Text(
                '${(pct * 100).round()}%',
                style: const TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: AppColors.primaryLight),
              ),
            ]),
            const SizedBox(height: 8),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: pct,
                minHeight: 6,
                backgroundColor: ds.border,
                valueColor: AlwaysStoppedAnimation(
                  pct >= 1.0 ? AppColors.success : AppColors.primaryLight,
                ),
              ),
            ),
            const SizedBox(height: 6),
            Row(children: [
              Text('$done of $total tasks done',
                  style: TextStyle(fontSize: 11, color: ds.textMuted)),
              const Spacer(),
              if (sprint.endDate != null) ...[
                Icon(Icons.schedule_rounded, size: 12, color: ds.textMuted),
                const SizedBox(width: 4),
                Text(
                  _daysLabel(sprint.endDate!),
                  style: TextStyle(
                    fontSize: 11,
                    color: _daysColor(sprint.endDate!),
                    fontWeight: FontWeight.w600,
                  ),
                ),
              ],
            ]),
          ]);
        },
        loading: () => const SizedBox(height: 48,
            child: Center(child: LinearProgressIndicator())),
        error: (_, __) => const SizedBox.shrink(),
      ),
    );
  }

  static String _daysLabel(String endIso) {
    try {
      final d = DateTime.parse(endIso).difference(DateTime.now()).inDays;
      if (d < 0) return '${-d}d over';
      if (d == 0) return 'Due today';
      return '$d days left';
    } catch (_) { return ''; }
  }

  static Color _daysColor(String endIso) {
    try {
      final d = DateTime.parse(endIso).difference(DateTime.now()).inDays;
      if (d < 0) return AppColors.error;
      if (d < 3) return AppColors.warning;
      return AppColors.textMuted;
    } catch (_) { return AppColors.textMuted; }
  }
}

// ── My Tasks tab (filtered to sprint) ────────────────────────────────────────

class _SprintMyTasksTab extends ConsumerWidget {
  const _SprintMyTasksTab({required this.sprint});
  final Sprint sprint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final allMy    = ref.watch(_myTasksSprintProvider);
    final hoursMap = ref.watch(_myAllTimeEntriesProvider).valueOrNull ?? {};

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(_myTasksSprintProvider);
        ref.invalidate(_myAllTimeEntriesProvider);
      },
      color: AppColors.primaryLight,
      child: allMy.when(
        data: (list) {
          // Filter to tasks belonging to this sprint
          final mine = list
              .where((t) => t.sprintId == sprint.id || t.sprintId == null)
              .toList();

          if (mine.isEmpty) {
            return const _EmptyState(
                icon: Icons.task_outlined,
                message: 'No tasks assigned to you in this sprint');
          }

          final todo       = mine.where((t) => t.status == 'TODO').toList();
          final inProgress = mine.where((t) => t.status == 'IN_PROGRESS').toList();
          final done       = mine.where((t) => t.status == 'DONE').toList();
          final blocked    = mine.where((t) => t.status == 'BLOCKED').toList();

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
            children: [
              if (blocked.isNotEmpty) ...[
                _TaskSection(label: 'Blocked', tasks: blocked, color: AppColors.error, hoursMap: hoursMap),
                const SizedBox(height: 16),
              ],
              if (inProgress.isNotEmpty) ...[
                _TaskSection(label: 'In Progress', tasks: inProgress, color: AppColors.info, hoursMap: hoursMap),
                const SizedBox(height: 16),
              ],
              if (todo.isNotEmpty) ...[
                _TaskSection(label: 'To Do', tasks: todo, color: AppColors.warning, hoursMap: hoursMap),
                const SizedBox(height: 16),
              ],
              if (done.isNotEmpty)
                _TaskSection(label: 'Done', tasks: done, color: AppColors.success, hoursMap: hoursMap),
            ],
          );
        },
        loading: () => ListView(
            padding: const EdgeInsets.all(16),
            children: List.generate(4, (_) => const ShimmerCard(height: 64))),
        error: (e, _) => Center(
            child: Text('$e', style: const TextStyle(color: AppColors.error))),
      ),
    );
  }
}

// ── Board tab ─────────────────────────────────────────────────────────────────

class _SprintBoardTab extends ConsumerWidget {
  const _SprintBoardTab({required this.sprint});
  final Sprint sprint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(_sprintTasksProvider(sprint.id));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_sprintTasksProvider(sprint.id)),
      color: AppColors.primaryLight,
      child: tasks.when(
        data: (list) => list.isEmpty
            ? const _EmptyState(
                icon: Icons.view_kanban_rounded,
                message: 'No tasks in this sprint yet')
            : _KanbanBoard(tasks: list, sprintId: sprint.id),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
            child: Text('$e', style: const TextStyle(color: AppColors.error))),
      ),
    );
  }
}

const _kanbanColumns = [
  ('TODO',        'To Do',       AppColors.warning),
  ('IN_PROGRESS', 'In Progress', AppColors.info),
  ('BLOCKED',     'Blocked',     AppColors.error),
  ('DONE',        'Done',        AppColors.success),
];

class _KanbanBoard extends ConsumerWidget {
  const _KanbanBoard({required this.tasks, required this.sprintId});
  final List<SprintTask> tasks;
  final String sprintId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return LayoutBuilder(
      builder: (ctx, constraints) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 12),
        child: SizedBox(
          height: constraints.maxHeight,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: _kanbanColumns.map((col) {
              final (status, label, color) = col;
              return _KanbanColumn(
                status: status,
                label: label,
                color: color,
                tasks: tasks.where((t) => t.status == status).toList(),
                sprintId: sprintId,
                height: constraints.maxHeight - 24,
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}

class _KanbanColumn extends ConsumerWidget {
  const _KanbanColumn({
    required this.status, required this.label, required this.color,
    required this.tasks, required this.height, required this.sprintId,
  });
  final String status;
  final String label;
  final Color color;
  final List<SprintTask> tasks;
  final double height;
  final String sprintId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds = context.ds;
    return SizedBox(
      width: 220,
      height: height,
      child: Container(
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.2)),
          boxShadow: [
            BoxShadow(
              color: color.withOpacity(0.04),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(children: [
          // Column header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 11),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [color.withOpacity(0.12), color.withOpacity(0.04)],
              ),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(15)),
            ),
            child: Row(children: [
              Container(
                width: 8, height: 8,
                decoration: BoxDecoration(color: color, shape: BoxShape.circle),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(label,
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: color)),
              ),
              Container(
                width: 22, height: 22,
                decoration: BoxDecoration(
                    color: color.withOpacity(0.2), shape: BoxShape.circle),
                child: Center(
                  child: Text('${tasks.length}',
                      style: TextStyle(
                          fontSize: 11,
                          fontWeight: FontWeight.w800,
                          color: color)),
                ),
              ),
            ]),
          ),
          // Tasks
          Expanded(
            child: tasks.isEmpty
                ? Center(
                    child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Icon(Icons.inbox_rounded,
                              size: 28, color: ds.textMuted),
                          const SizedBox(height: 6),
                          Text('Empty',
                              style: TextStyle(
                                  fontSize: 12, color: ds.textMuted)),
                        ]),
                  )
                : ListView.builder(
                    padding: const EdgeInsets.all(10),
                    itemCount: tasks.length,
                    itemBuilder: (_, i) => _KanbanCard(
                      task: tasks[i],
                      columnColor: color,
                      sprintId: sprintId,
                    ),
                  ),
          ),
        ]),
      ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.05),
    );
  }
}

class _KanbanCard extends ConsumerWidget {
  const _KanbanCard({
    required this.task,
    required this.columnColor,
    required this.sprintId,
  });
  final SprintTask task;
  final Color columnColor;
  final String sprintId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds    = context.ds;
    final users = ref.watch(_sprintUsersProvider).valueOrNull ?? [];
    final (priorityColor, _) = _priorityInfo(task.priority);

    // Look up assignee by ID
    String? assigneeName    = task.assigneeName;
    String? assigneeAvatar  = task.assigneeAvatarUrl;
    if ((assigneeName == null || assigneeName.isEmpty) && task.assigneeId != null) {
      final u = users.where((x) => x['id'] == task.assigneeId).firstOrNull;
      assigneeName   = u?['name'] as String?;
      assigneeAvatar = u?['avatarUrl'] as String?;
    }

    return GestureDetector(
      onTap: () => _TaskDetailSheet.show(context, task),
      onLongPress: () {
        HapticFeedback.mediumImpact();
        _showStatusPicker(context, ref);
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: ds.bgPage,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: ds.border),
          boxShadow: [
            BoxShadow(
              color: Colors.black.withOpacity(
                  Theme.of(context).brightness == Brightness.dark
                      ? 0.15
                      : 0.04),
              blurRadius: 6,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          // Type badge + assignee avatar
          Row(children: [
            _TypeBadge(task.type),
            const Spacer(),
            if (assigneeName != null && assigneeName.isNotEmpty)
              UserAvatar(name: assigneeName, avatarUrl: assigneeAvatar, radius: 10)
            else
              Icon(Icons.more_vert_rounded, size: 14, color: ds.textMuted),
          ]),
          const SizedBox(height: 8),
          Text(task.title,
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: ds.textPrimary),
              maxLines: 2,
              overflow: TextOverflow.ellipsis),
          const SizedBox(height: 8),
          Row(children: [
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: priorityColor.withOpacity(0.12),
                borderRadius: BorderRadius.circular(4),
                border: Border.all(color: priorityColor.withOpacity(0.3)),
              ),
              child: Text(task.priority,
                  style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: priorityColor)),
            ),
            if (task.storyPoints != null) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: ds.bgElevated,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: ds.border),
                ),
                child: Text('${task.storyPoints} pts',
                    style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w600,
                        color: ds.textMuted)),
              ),
            ],
            const Spacer(),
            if (assigneeName != null && assigneeName.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(assigneeName.split(' ').first,
                    style: TextStyle(fontSize: 9, color: ds.textMuted)),
              ),
          ]),
        ]),
      ),
    );
  }

  void _showStatusPicker(BuildContext context, WidgetRef ref) {
    final ds = context.ds;
    showModalBottomSheet(
      context: context,
      backgroundColor: ds.bgCard,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Move Task',
                style: TextStyle(
                    fontSize: 16,
                    fontWeight: FontWeight.w700,
                    color: ds.textPrimary)),
            const SizedBox(height: 4),
            Text(task.title,
                style: TextStyle(fontSize: 13, color: ds.textSecondary),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
            const SizedBox(height: 16),
            ..._kanbanColumns.map((col) {
              final (s, label, color) = col;
              final isCurrent = task.status == s;
              return GestureDetector(
                onTap: isCurrent
                    ? null
                    : () async {
                        Navigator.pop(context);
                        try {
                          await ApiClient.instance.post(
                            '${AppConstants.baseSprints}/tasks/${task.id}/status',
                            data: {'status': s},
                          );
                          ref.invalidate(_sprintTasksProvider(sprintId));
                          ref.invalidate(_myTasksSprintProvider);
                          HapticFeedback.lightImpact();
                        } catch (e) {
                          if (context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(
                                  content: Text('Failed: $e'),
                                  backgroundColor: AppColors.error),
                            );
                          }
                        }
                      },
                child: Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: isCurrent
                        ? color.withOpacity(0.1)
                        : ds.bgElevated,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: isCurrent
                            ? color.withOpacity(0.4)
                            : ds.border),
                  ),
                  child: Row(children: [
                    Container(
                      width: 10, height: 10,
                      decoration: BoxDecoration(
                          color: color, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 10),
                    Text(label,
                        style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w600,
                            color: isCurrent ? color : ds.textPrimary)),
                    const Spacer(),
                    if (isCurrent)
                      Icon(Icons.check_rounded, color: color, size: 16),
                  ]),
                ),
              );
            }),
          ],
        ),
      ),
    );
  }

  static (Color, String) _priorityInfo(String p) => switch (p) {
        'CRITICAL' => (AppColors.priorityCritical, 'Critical'),
        'HIGH'     => (AppColors.priorityHigh,     'High'),
        'LOW'      => (AppColors.priorityLow,      'Low'),
        _          => (AppColors.priorityMedium,   'Medium'),
      };
}

// ── Analytics tab ─────────────────────────────────────────────────────────────

class _SprintAnalyticsTab extends ConsumerWidget {
  const _SprintAnalyticsTab({required this.sprint});
  final Sprint sprint;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds    = context.ds;
    final tasks = ref.watch(_sprintTasksProvider(sprint.id));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_sprintTasksProvider(sprint.id)),
      color: AppColors.primaryLight,
      child: tasks.when(
        data: (list) {
          final total      = list.length;
          final done       = list.where((t) => t.status == 'DONE').length;
          final inProgress = list.where((t) => t.status == 'IN_PROGRESS').length;
          final blocked    = list.where((t) => t.status == 'BLOCKED').length;
          final todo       = list.where((t) => t.status == 'TODO').length;
          final totalPts   = list.fold(0, (s, t) => s + (t.storyPoints ?? 0));
          final donePts    = list.where((t) => t.status == 'DONE')
              .fold(0, (s, t) => s + (t.storyPoints ?? 0));

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
            children: [
              // Stats grid
              Row(children: [
                Expanded(child: _StatTile('Total', '$total', Icons.task_alt_rounded, AppColors.info)),
                const SizedBox(width: 10),
                Expanded(child: _StatTile('Done', '$done', Icons.check_circle_rounded, AppColors.success)),
              ]),
              const SizedBox(height: 10),
              Row(children: [
                Expanded(child: _StatTile('In Progress', '$inProgress', Icons.timelapse_rounded, AppColors.primaryLight)),
                const SizedBox(width: 10),
                Expanded(child: _StatTile('Blocked', '$blocked', Icons.block_rounded, AppColors.error)),
              ]),
              const SizedBox(height: 16),

              // Story points
              if (totalPts > 0) ...[
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: ds.bgCard,
                    borderRadius: BorderRadius.circular(16),
                    border: Border.all(color: ds.border),
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Row(children: [
                      Icon(Icons.filter_tilt_shift_rounded,
                          size: 14, color: AppColors.primaryLight),
                      const SizedBox(width: 6),
                      Text('Story Points',
                          style: TextStyle(
                              fontSize: 12,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primaryLight,
                              letterSpacing: 0.3)),
                    ]),
                    const SizedBox(height: 12),
                    Row(children: [
                      Expanded(
                        child: ClipRRect(
                          borderRadius: BorderRadius.circular(6),
                          child: LinearProgressIndicator(
                            value: totalPts == 0 ? 0 : donePts / totalPts,
                            minHeight: 8,
                            backgroundColor: ds.border,
                            valueColor: const AlwaysStoppedAnimation(
                                AppColors.success),
                          ),
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text('$donePts / $totalPts pts',
                          style: const TextStyle(
                              fontSize: 13,
                              fontWeight: FontWeight.w800,
                              color: AppColors.success)),
                    ]),
                  ]),
                ),
                const SizedBox(height: 16),
              ],

              // Status breakdown bar
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: ds.bgCard,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: ds.border),
                ),
                child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text('Task Breakdown',
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: ds.textPrimary)),
                  const SizedBox(height: 12),
                  if (total > 0) ...[
                    ClipRRect(
                      borderRadius: BorderRadius.circular(6),
                      child: Row(children: [
                        if (done > 0)
                          Flexible(flex: done, child: Container(height: 10, color: AppColors.success)),
                        if (inProgress > 0)
                          Flexible(flex: inProgress, child: Container(height: 10, color: AppColors.info)),
                        if (blocked > 0)
                          Flexible(flex: blocked, child: Container(height: 10, color: AppColors.error)),
                        if (todo > 0)
                          Flexible(flex: todo, child: Container(height: 10, color: AppColors.warning)),
                      ]),
                    ),
                    const SizedBox(height: 10),
                    Wrap(
                      spacing: 12,
                      runSpacing: 6,
                      children: [
                        _LegendDot('Done ($done)', AppColors.success),
                        _LegendDot('In Progress ($inProgress)', AppColors.info),
                        _LegendDot('Blocked ($blocked)', AppColors.error),
                        _LegendDot('To Do ($todo)', AppColors.warning),
                      ],
                    ),
                  ],
                ]),
              ),

              const SizedBox(height: 16),

              // AI Analyze button
              SizedBox(
                width: double.infinity,
                child: ElevatedButton.icon(
                  icon: const Icon(Icons.auto_awesome_rounded, size: 18),
                  label: const Text('Analyze Sprint with AI',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: const Color(0xFFA855F7),
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: () => showModalBottomSheet(
                    context: context,
                    isScrollControlled: true,
                    backgroundColor: ds.bgCard,
                    shape: const RoundedRectangleBorder(
                        borderRadius:
                            BorderRadius.vertical(top: Radius.circular(24))),
                    builder: (_) => _SprintAiSheet(sprint: sprint),
                  ),
                ),
              ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) =>
            Center(child: Text('$e', style: const TextStyle(color: AppColors.error))),
      ),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile(this.label, this.value, this.icon, this.color);
  final String label;
  final String value;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [color.withOpacity(0.1), ds.bgCard],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.all(8),
          decoration: BoxDecoration(
            color: color.withOpacity(0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(icon, color: color, size: 16),
        ),
        const SizedBox(width: 10),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(value,
              style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: color,
                  letterSpacing: -0.5)),
          Text(label,
              style: TextStyle(
                  fontSize: 10, color: ds.textMuted, fontWeight: FontWeight.w600)),
        ]),
      ]),
    );
  }
}

class _LegendDot extends StatelessWidget {
  const _LegendDot(this.label, this.color);
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Row(mainAxisSize: MainAxisSize.min, children: [
    Container(
      width: 8, height: 8,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
    ),
    const SizedBox(width: 5),
    Text(label,
        style: TextStyle(fontSize: 11, color: context.ds.textMuted)),
  ]);
}

// ── Sprint AI Analysis bottom sheet ──────────────────────────────────────────

class _SprintAiSheet extends StatefulWidget {
  const _SprintAiSheet({required this.sprint});
  final Sprint sprint;

  @override
  State<_SprintAiSheet> createState() => _SprintAiSheetState();
}

class _SprintAiSheetState extends State<_SprintAiSheet> {
  String? _insight;
  bool    _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final raw = await ApiClient.instance.post(
        '${AppConstants.baseAI}/sprint-analysis',
        data: {
          'sprintId':   widget.sprint.id,
          'sprintName': widget.sprint.name,
          'status':     widget.sprint.status,
          if (widget.sprint.goalDescription != null)
            'goal': widget.sprint.goalDescription,
        },
      );
      final d = raw['data'];
      // sprint-analysis returns structured data; join all text fields
      String insight;
      if (d is Map) {
        final parts = <String>[];
        if (d['summary'] != null) parts.add('${d['summary']}');
        if (d['highlights'] is List) {
          parts.add('\n✅ Highlights:');
          for (final h in d['highlights'] as List) parts.add('• $h');
        }
        if (d['recommendations'] is List) {
          parts.add('\n💡 Recommendations:');
          for (final r in d['recommendations'] as List) parts.add('• $r');
        }
        if (d['insight'] != null) parts.add('${d['insight']}');
        if (d['analysis'] != null) parts.add('${d['analysis']}');
        insight = parts.isNotEmpty ? parts.join('\n') : d.toString();
      } else {
        insight = d?.toString() ?? 'No insights available.';
      }
      if (mounted) setState(() { _insight = insight; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return DraggableScrollableSheet(
      initialChildSize: 0.6,
      maxChildSize: 0.9,
      expand: false,
      builder: (_, ctrl) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36, height: 4,
                decoration: BoxDecoration(
                    color: ds.border,
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 20),
            Row(children: [
              Container(
                padding: const EdgeInsets.all(8),
                decoration: BoxDecoration(
                  color: const Color(0xFFA855F7).withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.auto_awesome_rounded,
                    color: Color(0xFFA855F7), size: 20),
              ),
              const SizedBox(width: 10),
              Text('AI Sprint Analysis',
                  style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: ds.textPrimary)),
              const Spacer(),
              if (!_loading)
                IconButton(
                  icon: const Icon(Icons.refresh_rounded, size: 18),
                  onPressed: _load,
                  color: ds.textMuted,
                ),
            ]),
            const SizedBox(height: 16),
            Expanded(
              child: _loading
                  ? Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      const CircularProgressIndicator(
                          valueColor:
                              AlwaysStoppedAnimation(Color(0xFFA855F7))),
                      const SizedBox(height: 16),
                      Text('Analysing sprint…',
                          style: TextStyle(color: ds.textMuted)),
                    ])
                  : _error != null
                      ? Column(
                          mainAxisAlignment: MainAxisAlignment.center,
                          children: [
                            const Icon(Icons.auto_awesome_rounded,
                                size: 40, color: Color(0xFFA855F7)),
                            const SizedBox(height: 12),
                            Text('Could not load insights',
                                style: TextStyle(color: ds.textMuted)),
                            const SizedBox(height: 8),
                            Text(_error!,
                                style: const TextStyle(
                                    color: AppColors.error, fontSize: 11),
                                textAlign: TextAlign.center),
                          ],
                        )
                      : SingleChildScrollView(
                          controller: ctrl,
                          child: Container(
                            padding: const EdgeInsets.all(16),
                            decoration: BoxDecoration(
                              color: const Color(0xFFA855F7).withOpacity(0.06),
                              borderRadius: BorderRadius.circular(16),
                              border: Border.all(
                                  color: const Color(0xFFA855F7)
                                      .withOpacity(0.2)),
                            ),
                            child: Text(
                              _insight ?? '',
                              style: TextStyle(
                                  fontSize: 14,
                                  color: ds.textSecondary,
                                  height: 1.6),
                            ),
                          ),
                        ),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Task Detail Bottom Sheet
// ─────────────────────────────────────────────────────────────────────────────

class _TaskDetailSheet extends StatefulWidget {
  const _TaskDetailSheet({required this.task});
  final SprintTask task;

  static void show(BuildContext context, SprintTask task) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _TaskDetailSheet(task: task),
    );
  }

  @override
  State<_TaskDetailSheet> createState() => _TaskDetailSheetState();
}

class _TaskDetailSheetState extends State<_TaskDetailSheet>
    with SingleTickerProviderStateMixin {
  late final TabController _tab = TabController(length: 3, vsync: this);

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds    = context.ds;
    final task  = widget.task;
    final (pColor, _) = _priorityColor(task.priority);

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (_, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(children: [
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12),
              width: 36, height: 4,
              decoration: BoxDecoration(
                  color: ds.border, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                _TypeBadge(task.type),
                const SizedBox(width: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: pColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(task.priority,
                      style: TextStyle(
                          fontSize: 10,
                          fontWeight: FontWeight.w700,
                          color: pColor)),
                ),
                const Spacer(),
                _StatusChip(task.status),
              ]),
              const SizedBox(height: 10),
              Text(task.title,
                  style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                      color: ds.textPrimary)),
              if (task.storyPoints != null) ...[
                const SizedBox(height: 4),
                Row(children: [
                  Icon(Icons.filter_tilt_shift_rounded,
                      size: 13, color: ds.textMuted),
                  const SizedBox(width: 4),
                  Text('${task.storyPoints} story points',
                      style: TextStyle(fontSize: 12, color: ds.textMuted)),
                ]),
              ],
            ]),
          ),
          TabBar(
            controller: _tab,
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            labelStyle: const TextStyle(
                fontSize: 12, fontWeight: FontWeight.w600),
            indicatorColor: AppColors.primaryLight,
            labelColor: AppColors.primaryLight,
            unselectedLabelColor: ds.textMuted,
            dividerColor: ds.border,
            tabs: const [
              Tab(icon: Icon(Icons.chat_bubble_outline_rounded, size: 14), text: 'Activity'),
              Tab(icon: Icon(Icons.timer_outlined, size: 14), text: 'Time Log'),
              Tab(icon: Icon(Icons.auto_awesome_rounded, size: 14), text: 'AI'),
            ],
          ),
          Expanded(
            child: TabBarView(
              controller: _tab,
              children: [
                _ActivityTab(taskId: task.id),
                _TimeLogTab(task: task),
                _AiInsightsTab(task: task),
              ],
            ),
          ),
        ]),
      ),
    );
  }

  static (Color, String) _priorityColor(String p) => switch (p) {
        'CRITICAL' => (AppColors.priorityCritical, 'Critical'),
        'HIGH'     => (AppColors.priorityHigh,     'High'),
        'LOW'      => (AppColors.priorityLow,      'Low'),
        _          => (AppColors.priorityMedium,   'Medium'),
      };
}

// ── Activity tab ──────────────────────────────────────────────────────────────

class _ActivityTab extends ConsumerStatefulWidget {
  const _ActivityTab({required this.taskId});
  final String taskId;

  @override
  ConsumerState<_ActivityTab> createState() => _ActivityTabState();
}

class _ActivityTabState extends ConsumerState<_ActivityTab> {
  final _ctrl    = TextEditingController();
  bool  _posting = false;

  @override
  void dispose() { _ctrl.dispose(); super.dispose(); }

  Future<void> _postComment() async {
    if (_ctrl.text.trim().isEmpty) return;
    setState(() => _posting = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseSprints}/tasks/${widget.taskId}/comments',
        data: {'content': _ctrl.text.trim()},
      );
      _ctrl.clear();
      ref.invalidate(_taskCommentsProvider(widget.taskId));
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('$e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _posting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final comments = ref.watch(_taskCommentsProvider(widget.taskId));

    return Column(children: [
      Expanded(
        child: comments.when(
          data: (list) => list.isEmpty
              ? Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.chat_bubble_outline_rounded,
                        size: 40, color: ds.textMuted),
                    const SizedBox(height: 12),
                    Text('No comments yet',
                        style: TextStyle(color: ds.textMuted)),
                  ]),
                )
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final c = list[i] as Map<String, dynamic>;
                    // Try every possible author field name
                    final name = c['authorName'] as String?
                        ?? c['author_name'] as String?
                        ?? c['userName'] as String?
                        ?? c['user_name'] as String?
                        ?? c['author'] as String?
                        ?? c['name'] as String?
                        ?? c['createdBy'] as String?
                        ?? c['created_by'] as String?
                        ?? 'Team Member';
                    final avatar = c['authorAvatar'] as String?
                        ?? c['avatarUrl'] as String?
                        ?? c['avatar_url'] as String?;
                    final body = c['content'] as String?
                        ?? c['comment'] as String? ?? '';
                    final date = c['createdAt'] as String?
                        ?? c['CREATEDTIME'] as String?
                        ?? c['created_at'] as String? ?? '';

                    return Padding(
                      padding: const EdgeInsets.only(bottom: 14),
                      child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            UserAvatar(name: name, avatarUrl: avatar, radius: 17),
                            const SizedBox(width: 10),
                            Expanded(
                              child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Row(children: [
                                      Text(name,
                                          style: TextStyle(
                                              fontSize: 12,
                                              fontWeight: FontWeight.w700,
                                              color: ds.textPrimary)),
                                      const SizedBox(width: 8),
                                      Text(_fmtDate(date),
                                          style: TextStyle(
                                              fontSize: 10,
                                              color: ds.textMuted)),
                                    ]),
                                    const SizedBox(height: 4),
                                    Container(
                                      padding: const EdgeInsets.all(10),
                                      decoration: BoxDecoration(
                                        color: ds.bgPage,
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(color: ds.border),
                                      ),
                                      child: Text(body,
                                          style: TextStyle(
                                              fontSize: 13,
                                              color: ds.textSecondary,
                                              height: 1.4)),
                                    ),
                                  ]),
                            ),
                          ]),
                    );
                  },
                ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(
              child: Text('$e',
                  style: const TextStyle(
                      color: AppColors.error, fontSize: 12))),
        ),
      ),
      Container(
        padding: EdgeInsets.fromLTRB(
            16, 8, 16, MediaQuery.of(context).viewInsets.bottom + 12),
        decoration: BoxDecoration(
          color: ds.bgCard,
          border: Border(top: BorderSide(color: ds.border)),
        ),
        child: Row(children: [
          Expanded(
            child: TextField(
              controller: _ctrl,
              decoration: InputDecoration(
                hintText: 'Add a comment…',
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 14, vertical: 10),
                isDense: true,
                border: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: ds.border),
                ),
                enabledBorder: OutlineInputBorder(
                  borderRadius: BorderRadius.circular(12),
                  borderSide: BorderSide(color: ds.border),
                ),
              ),
              minLines: 1,
              maxLines: 3,
            ),
          ),
          const SizedBox(width: 8),
          _posting
              ? const SizedBox(
                  width: 36,
                  height: 36,
                  child: CircularProgressIndicator(strokeWidth: 2))
              : IconButton(
                  icon: const Icon(Icons.send_rounded,
                      color: AppColors.primaryLight),
                  onPressed: _postComment,
                ),
        ]),
      ),
    ]);
  }

  static String _fmtDate(String s) {
    try {
      return DateFormat('d MMM, h:mm a').format(DateTime.parse(s).toLocal());
    } catch (_) { return s.length > 16 ? s.substring(0, 16) : s; }
  }
}

// ── Time Log tab ──────────────────────────────────────────────────────────────

class _TimeLogTab extends ConsumerStatefulWidget {
  const _TimeLogTab({required this.task});
  final SprintTask task;

  @override
  ConsumerState<_TimeLogTab> createState() => _TimeLogTabState();
}

class _TimeLogTabState extends ConsumerState<_TimeLogTab> {
  final _hoursCtrl = TextEditingController(text: '1');
  final _descCtrl  = TextEditingController();
  DateTime _date   = DateTime.now();
  bool _billable        = true;
  bool _sendForApproval = false;
  bool _submitting      = false;
  Timer?   _timer;
  Duration _elapsed = Duration.zero;
  bool     _running = false;

  @override
  void dispose() {
    _timer?.cancel();
    _hoursCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  void _toggleTimer() {
    if (_running) {
      _timer?.cancel();
      final h = _elapsed.inMinutes / 60.0;
      _hoursCtrl.text = h.toStringAsFixed(1);
      setState(() => _running = false);
    } else {
      setState(() { _running = true; _elapsed = Duration.zero; });
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() => _elapsed += const Duration(seconds: 1));
      });
    }
  }

  String _fmt(Duration d) {
    final h = d.inHours.toString().padLeft(2, '0');
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return '$h:$m:$s';
  }

  Future<void> _submitLog() async {
    final hours = double.tryParse(_hoursCtrl.text);
    if (hours == null || hours <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Enter valid hours')));
      return;
    }
    setState(() => _submitting = true);
    try {
      final resp = await ApiClient.instance.post(
        '${AppConstants.baseTime}/entries',
        data: {
          'taskId':      widget.task.id,
          'hours':       hours,
          'date':        DateFormat('yyyy-MM-dd').format(_date),
          'description': _descCtrl.text.trim(),
          'billable':    _billable,
        },
      );
      if (_sendForApproval) {
        final d  = resp is Map ? (resp['data'] ?? resp) : null;
        final id = d is Map ? (d['ROWID'] ?? d['id'])?.toString() : null;
        if (id != null && id.isNotEmpty && id != 'null') {
          try {
            await ApiClient.instance.patch(
              '${AppConstants.baseTime}/entries/$id/submit',
              data: {},
            );
          } catch (_) {}
        }
      }
      _descCtrl.clear();
      _hoursCtrl.text = '1';
      setState(() => _sendForApproval = false);
      ref.invalidate(_taskTimeEntriesProvider(widget.task.id));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text(_sendForApproval ? 'Time logged & sent for approval!' : 'Time logged!'),
              backgroundColor: AppColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
              content: Text('Failed: $e'),
              backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds      = context.ds;
    final entries = ref.watch(_taskTimeEntriesProvider(widget.task.id));

    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

        // Timer card
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: _running ? AppColors.info.withOpacity(0.08) : ds.bgPage,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(
                color: _running
                    ? AppColors.info.withOpacity(0.4)
                    : ds.border),
          ),
          child: Row(children: [
            Icon(Icons.timer_outlined,
                color: _running ? AppColors.info : ds.textMuted, size: 20),
            const SizedBox(width: 10),
            Text(_fmt(_elapsed),
                style: TextStyle(
                  fontSize: 22,
                  fontWeight: FontWeight.w800,
                  color: _running ? AppColors.info : ds.textSecondary,
                  fontFeatures: const [FontFeature.tabularFigures()],
                )),
            const Spacer(),
            ElevatedButton.icon(
              icon: Icon(_running ? Icons.stop_rounded : Icons.play_arrow_rounded, size: 16),
              label: Text(_running ? 'Stop & Log' : 'Start Timer'),
              style: ElevatedButton.styleFrom(
                backgroundColor: _running ? AppColors.ragRed : AppColors.info,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(10)),
                textStyle: const TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w600),
              ),
              onPressed: _toggleTimer,
            ),
          ]),
        ),

        const SizedBox(height: 16),
        Text('LOG TIME',
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: ds.textMuted,
                letterSpacing: 1.2)),
        const SizedBox(height: 10),

        Row(children: [
          Expanded(
            child: TextFormField(
              controller: _hoursCtrl,
              keyboardType:
                  const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Hours',
                prefixIcon: Icon(Icons.schedule_rounded, size: 18),
                isDense: true,
              ),
            ),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: GestureDetector(
              onTap: () async {
                final d = await showDatePicker(
                  context: context,
                  initialDate: _date,
                  firstDate:
                      DateTime.now().subtract(const Duration(days: 30)),
                  lastDate: DateTime.now(),
                );
                if (d != null) setState(() => _date = d);
              },
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 12, vertical: 13),
                decoration: BoxDecoration(
                  color: ds.bgInput,
                  border: Border.all(color: ds.border),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(children: [
                  Icon(Icons.calendar_today_rounded,
                      size: 16, color: ds.textMuted),
                  const SizedBox(width: 8),
                  Text(DateFormat('d MMM').format(_date),
                      style: TextStyle(
                          fontSize: 13, color: ds.textPrimary)),
                ]),
              ),
            ),
          ),
        ]),

        const SizedBox(height: 10),
        TextField(
          controller: _descCtrl,
          decoration: const InputDecoration(
            labelText: 'Description (optional)',
            isDense: true,
          ),
          maxLines: 2,
        ),
        const SizedBox(height: 12),

        Row(children: [
          Switch(
            value: _billable,
            onChanged: (v) => setState(() => _billable = v),
            activeColor: AppColors.success,
          ),
          Text('Billable',
              style: TextStyle(fontSize: 13, color: ds.textSecondary)),
        ]),
        const SizedBox(height: 8),

        // Send for approval toggle
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
          decoration: BoxDecoration(
            color: AppColors.info.withOpacity(0.07),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: AppColors.info.withOpacity(0.2)),
          ),
          child: Row(children: [
            Icon(Icons.send_rounded, size: 14, color: AppColors.info),
            const SizedBox(width: 8),
            Expanded(
              child: Text('Send for approval',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: ds.textPrimary)),
            ),
            Switch(
              value: _sendForApproval,
              activeColor: AppColors.info,
              materialTapTargetSize: MaterialTapTargetSize.shrinkWrap,
              onChanged: (v) => setState(() => _sendForApproval = v),
            ),
          ]),
        ),
        const SizedBox(height: 10),

        Row(mainAxisAlignment: MainAxisAlignment.end, children: [
          _submitting
              ? const CircularProgressIndicator(strokeWidth: 2)
              : ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryLight,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(
                        horizontal: 20, vertical: 10),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: _submitLog,
                  child: Text(
                    _sendForApproval ? 'Log & Submit' : 'Log Time',
                    style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
                  ),
                ),
        ]),

        const Divider(height: 28),

        Text('TIME HISTORY',
            style: TextStyle(
                fontSize: 10,
                fontWeight: FontWeight.w800,
                color: ds.textMuted,
                letterSpacing: 1.2)),
        const SizedBox(height: 10),

        entries.when(
          data: (list) {
            if (list.isEmpty) {
              return Center(
                child: Padding(
                  padding: const EdgeInsets.all(16),
                  child: Text('No time logged yet',
                      style: TextStyle(color: ds.textMuted)),
                ),
              );
            }
            final total = list.fold(0.0, (sum, e) {
              final h = (e as Map<String, dynamic>)['hours'];
              return sum + (h is num ? h.toDouble() : 0.0);
            });
            return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                    Text('Total: ',
                        style: TextStyle(
                            fontSize: 12, color: ds.textMuted)),
                    Text('${total.toStringAsFixed(1)}h',
                        style: const TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w800,
                            color: AppColors.primaryLight)),
                  ]),
                  const SizedBox(height: 8),
                  ...list.map((e) {
                    final m = e as Map<String, dynamic>;
                    // Try all possible user name field names
                    final name = m['userName'] as String?
                        ?? m['user_name'] as String?
                        ?? m['authorName'] as String?
                        ?? m['author_name'] as String?
                        ?? m['loggedBy'] as String?
                        ?? m['logged_by'] as String?
                        ?? m['name'] as String?
                        ?? m['displayName'] as String?
                        ?? m['fullName'] as String?
                        ?? 'Team Member';
                    final avatar = m['avatarUrl'] as String?
                        ?? m['avatar_url'] as String?
                        ?? m['userAvatar'] as String?;
                    final hours  = (m['hours'] as num?)?.toDouble() ?? 0.0;
                    final date   = m['date'] as String?
                        ?? m['workDate'] as String?
                        ?? m['work_date'] as String? ?? '';
                    final desc   = m['description'] as String? ?? '';
                    final bill   = m['billable'] as bool? ?? false;

                    return Container(
                      margin: const EdgeInsets.only(bottom: 8),
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: ds.bgPage,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: ds.border),
                      ),
                      child: Row(children: [
                        UserAvatar(
                            name: name, avatarUrl: avatar, radius: 18),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(name,
                                    style: TextStyle(
                                        fontSize: 12,
                                        fontWeight: FontWeight.w700,
                                        color: ds.textPrimary)),
                                if (desc.isNotEmpty)
                                  Text(desc,
                                      style: TextStyle(
                                          fontSize: 11,
                                          color: ds.textMuted),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis),
                                if (date.isNotEmpty)
                                  Text(
                                    _fmtSimpleDate(date),
                                    style: TextStyle(
                                        fontSize: 10, color: ds.textMuted),
                                  ),
                              ]),
                        ),
                        Column(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Text('${hours.toStringAsFixed(1)}h',
                                  style: const TextStyle(
                                      fontSize: 15,
                                      fontWeight: FontWeight.w800,
                                      color: AppColors.primaryLight)),
                              if (bill)
                                const Text('Billable',
                                    style: TextStyle(
                                        fontSize: 9,
                                        color: AppColors.success,
                                        fontWeight: FontWeight.w700)),
                            ]),
                      ]),
                    );
                  }),
                ]);
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Text('$e',
              style: const TextStyle(
                  color: AppColors.error, fontSize: 12)),
        ),
        const SizedBox(height: 80),
      ]),
    );
  }

  static String _fmtSimpleDate(String s) {
    try {
      return DateFormat('d MMM yyyy').format(DateTime.parse(s));
    } catch (_) { return s.length >= 10 ? s.substring(0, 10) : s; }
  }
}

// ── AI Insights tab ───────────────────────────────────────────────────────────

class _AiInsightsTab extends StatefulWidget {
  const _AiInsightsTab({required this.task});
  final SprintTask task;

  @override
  State<_AiInsightsTab> createState() => _AiInsightsTabState();
}

class _AiInsightsTabState extends State<_AiInsightsTab> {
  String? _insight;
  bool    _loading = false;
  String? _error;

  @override
  void initState() { super.initState(); _loadInsight(); }

  Future<void> _loadInsight() async {
    setState(() { _loading = true; _error = null; });
    try {
      final raw = await ApiClient.instance.post(
        '${AppConstants.baseAI}/task-insight',
        data: {
          'taskId':   widget.task.id,
          'title':    widget.task.title,
          'status':   widget.task.status,
          'priority': widget.task.priority,
        },
      );
      final insight = raw['data']?['insight'] as String?
          ?? raw['data']?['analysis'] as String?
          ?? raw['insight'] as String?
          ?? raw['data']?.toString()
          ?? 'No insights available.';
      if (mounted) setState(() { _insight = insight; _loading = false; });
    } catch (e) {
      if (mounted) setState(() { _error = '$e'; _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;

    if (_loading) {
      return Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const CircularProgressIndicator(
              valueColor: AlwaysStoppedAnimation(Color(0xFFA855F7))),
          const SizedBox(height: 16),
          Text('Generating AI insights…',
              style: TextStyle(color: ds.textMuted, fontSize: 13)),
        ]),
      );
    }

    if (_error != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            Icon(Icons.auto_awesome_rounded, size: 40, color: ds.textMuted),
            const SizedBox(height: 12),
            Text('Could not load insights',
                style: TextStyle(color: ds.textMuted)),
            const SizedBox(height: 8),
            Text(_error!,
                style: const TextStyle(
                    color: AppColors.error, fontSize: 11),
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            TextButton.icon(
              icon: const Icon(Icons.refresh_rounded),
              label: const Text('Retry'),
              onPressed: _loadInsight,
            ),
          ]),
        ),
      );
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            padding: const EdgeInsets.all(8),
            decoration: BoxDecoration(
              color: const Color(0xFFA855F7).withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: const Icon(Icons.auto_awesome_rounded,
                color: Color(0xFFA855F7), size: 20),
          ),
          const SizedBox(width: 10),
          Text('AI Task Insights',
              style: TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w700,
                  color: ds.textPrimary)),
          const Spacer(),
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 18),
            onPressed: _loadInsight,
            color: ds.textMuted,
          ),
        ]),
        const SizedBox(height: 16),
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: const Color(0xFFA855F7).withOpacity(0.06),
            borderRadius: BorderRadius.circular(14),
            border:
                Border.all(color: const Color(0xFFA855F7).withOpacity(0.2)),
          ),
          child: Text(
            _insight ?? 'No insights available.',
            style: TextStyle(
                fontSize: 14, color: ds.textSecondary, height: 1.6),
          ),
        ),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Small reusable widgets
// ─────────────────────────────────────────────────────────────────────────────

class _FilterBar extends StatelessWidget {
  const _FilterBar({
    required this.filters,
    required this.selected,
    required this.onSelect,
  });
  final List<(String, String)> filters;
  final String selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return SizedBox(
      height: 48,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        children: filters.map((f) {
          final (value, label) = f;
          final isSelected = selected == value;
          return GestureDetector(
            onTap: () => onSelect(value),
            child: AnimatedContainer(
              duration: const Duration(milliseconds: 200),
              margin: const EdgeInsets.only(right: 8),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
              decoration: BoxDecoration(
                color: isSelected ? AppColors.primary : ds.bgElevated,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                    color: isSelected ? AppColors.primary : ds.border),
              ),
              child: Text(label,
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: isSelected ? Colors.white : ds.textSecondary)),
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _TypeBadge extends StatelessWidget {
  const _TypeBadge(this.type);
  final String type;

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (type) {
      'BUG'     => (AppColors.error,        'BUG'),
      'STORY'   => (AppColors.success,      'STORY'),
      'EPIC'    => (const Color(0xFFA855F7),'EPIC'),
      'SUBTASK' => (AppColors.info,         'SUB'),
      _         => (AppColors.primaryLight, 'TASK'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 9, fontWeight: FontWeight.w800, color: color)),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip(this.status);
  final String status;

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      'DONE'        => (AppColors.success, 'Done'),
      'IN_PROGRESS' => (AppColors.info,    'In Progress'),
      'IN_REVIEW'   => (AppColors.warning, 'In Review'),
      'BLOCKED'     => (AppColors.error,   'Blocked'),
      _             => (AppColors.warning, 'To Do'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 10, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.total, required this.done});
  final int total, done;

  @override
  Widget build(BuildContext context) {
    final ds  = context.ds;
    final pct = total == 0 ? 0.0 : done / total;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('Sprint Progress',
              style: TextStyle(
                  fontWeight: FontWeight.w700,
                  fontSize: 14,
                  color: ds.textPrimary)),
          Text('${(pct * 100).round()}%',
              style: const TextStyle(
                  fontWeight: FontWeight.w800,
                  color: AppColors.primaryLight,
                  fontSize: 16)),
        ]),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: pct,
            backgroundColor: ds.bgElevated,
            valueColor:
                const AlwaysStoppedAnimation(AppColors.primaryLight),
            minHeight: 8,
          ),
        ),
        const SizedBox(height: 8),
        Text('$done of $total tasks completed',
            style: TextStyle(fontSize: 12, color: ds.textMuted)),
      ]),
    );
  }
}

class _TaskSection extends StatelessWidget {
  const _TaskSection({
    required this.label,
    required this.tasks,
    required this.color,
    this.hoursMap = const {},
  });
  final String label;
  final List<SprintTask> tasks;
  final Color color;
  final Map<String, double> hoursMap;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Row(children: [
              Container(
                  width: 8,
                  height: 8,
                  decoration:
                      BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 6),
              Text(label,
                  style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: color)),
              const SizedBox(width: 6),
              Text('(${tasks.length})',
                  style: TextStyle(
                      fontSize: 12,
                      color: context.ds.textMuted)),
            ]),
          ),
          ...tasks.map((t) => _TaskItem(t, hoursLogged: hoursMap[t.id] ?? 0)),
        ],
      );
}

class _TaskItem extends StatelessWidget {
  const _TaskItem(this.task, {this.hoursLogged = 0});
  final SprintTask task;
  final double hoursLogged;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return GestureDetector(
      onTap: () => _TaskDetailSheet.show(context, task),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: ds.border),
        ),
        child: Row(children: [
          Icon(
            task.status == 'DONE'
                ? Icons.check_circle_rounded
                : task.status == 'BLOCKED'
                    ? Icons.block_rounded
                    : Icons.radio_button_unchecked_rounded,
            color: task.status == 'DONE'
                ? AppColors.success
                : task.status == 'BLOCKED'
                    ? AppColors.error
                    : ds.textMuted,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(task.title,
                      style: TextStyle(
                          fontSize: 13,
                          fontWeight: FontWeight.w600,
                          color: task.status == 'DONE'
                              ? ds.textMuted
                              : ds.textPrimary,
                          decoration: task.status == 'DONE'
                              ? TextDecoration.lineThrough
                              : null)),
                  Padding(
                    padding: const EdgeInsets.only(top: 3),
                    child: Row(children: [
                      if (task.storyPoints != null) ...[
                        Text('${task.storyPoints} pts',
                            style: TextStyle(fontSize: 11, color: ds.textMuted)),
                        const SizedBox(width: 8),
                      ],
                      if (hoursLogged > 0)
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: const Color(0xFF059669).withOpacity(0.1),
                            borderRadius: BorderRadius.circular(4),
                            border: Border.all(color: const Color(0xFF059669).withOpacity(0.3)),
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            const Icon(Icons.timer_outlined, size: 10, color: Color(0xFF059669)),
                            const SizedBox(width: 3),
                            Text(
                              hoursLogged % 1 == 0
                                  ? '${hoursLogged.toInt()}h'
                                  : '${hoursLogged.toStringAsFixed(1)}h',
                              style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w600,
                                  color: Color(0xFF059669)),
                            ),
                          ]),
                        ),
                    ]),
                  ),
                ]),
          ),
          const SizedBox(width: 8),
          PriorityBadge(task.priority),
          const SizedBox(width: 4),
          Icon(Icons.chevron_right_rounded, size: 14, color: ds.textMuted),
        ]),
      ),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.icon, required this.message});
  final IconData icon;
  final String message;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: ds.bgCard,
            shape: BoxShape.circle,
            border: Border.all(color: ds.border),
          ),
          child: Icon(icon, size: 32, color: ds.textMuted),
        ),
        const SizedBox(height: 14),
        Text(message,
            style: TextStyle(color: ds.textMuted, fontSize: 14),
            textAlign: TextAlign.center),
      ]),
    );
  }
}
