/// Time Tracking screen — My Entries · Analytics (Week/Month/Overall) · Approvals
/// API: ${AppConstants.baseTime}/entries
library;

import 'package:fl_chart/fl_chart.dart';
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
import '../../../auth/providers/auth_provider.dart';
import '../../../dashboard/providers/dashboard_provider.dart';

// ── Helpers ───────────────────────────────────────────────────────────────────

/// Strip time component: '2026-04-10 00:00:00' → '2026-04-10'
String _stripDate(String raw) => raw.length >= 10 ? raw.substring(0, 10) : raw;

Map<String, dynamic> _normaliseEntry(Map<String, dynamic> r) => {
  'id':          (r['ROWID'] ?? r['id'] ?? '').toString(),
  'projectId':   (r['project_id'] ?? r['projectId'] ?? '').toString(),
  'projectName': r['project_name'] as String? ?? r['projectName'] as String? ?? '',
  'taskName':    r['task_name']    as String? ?? r['taskName']    as String? ?? '',
  'description': r['description'] as String? ?? '',
  'date':        _stripDate(r['entry_date'] as String? ?? r['date'] as String? ?? ''),
  'hours':       (r['hours'] as num? ?? 0).toDouble(),
  'isBillable':  r['is_billable'] == true || r['is_billable'] == 'true' || r['isBillable'] == true,
  'status':      r['status'] as String? ?? 'DRAFT',
  'userName':    r['user_name'] as String? ?? r['userName'] as String? ?? '',
};

// ── Providers ─────────────────────────────────────────────────────────────────

/// My-week summary: { entries, totalHours, billableHours, weekStart, weekEnd, days }
final _myWeekSummaryProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseTime}/entries/my-week',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final Map<String, dynamic> d = data is Map<String, dynamic> ? data : {};

  final List<dynamic> rawEntries = d['entries'] is List
      ? d['entries'] as List
      : (data is List ? data : []);
  final entries = rawEntries
      .whereType<Map<String, dynamic>>()
      .map(_normaliseEntry)
      .toList();

  final totalHours    = (d['total_hours'] as num? ?? 0).toDouble();
  final billableHours = (d['billable_hours'] as num? ?? 0).toDouble();
  final weekStart     = d['week_start'] as String? ?? '';
  final weekEnd       = d['week_end']   as String? ?? '';

  // Build per-day map
  final Map<String, List<Map<String, dynamic>>> byDate = {};
  for (final e in entries) {
    final day = e['date'] as String? ?? '';
    (byDate[day] ??= []).add(e);
  }

  // Build 7-day list from weekStart
  DateTime? wsDate;
  try { wsDate = DateTime.parse(weekStart); } catch (_) {}
  final days = List.generate(7, (i) {
    final dt  = wsDate?.add(Duration(days: i));
    final key = dt != null ? DateFormat('yyyy-MM-dd').format(dt) : '';
    final dayEntries = byDate[key] ?? [];
    final dayHours   = dayEntries.fold(0.0, (s, e) => s + (e['hours'] as num? ?? 0));
    return {
      'date':    key,
      'hours':   (dayHours * 100).roundToDouble() / 100,
      'entries': dayEntries,
    };
  });

  return {
    'entries':       entries,
    'totalHours':    totalHours,
    'billableHours': billableHours,
    'nonBillable':   ((totalHours - billableHours) * 100).roundToDouble() / 100,
    'daysLogged':    days.where((d) => (d['hours'] as double) > 0).length,
    'days':          days,
    'weekStart':     weekStart,
    'weekEnd':       weekEnd,
  };
});

/// Entries for a date range (month / overall)
final _entriesRangeProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, ({String? from, String? to})>(
        (ref, p) async {
  final qp = <String, String>{};
  if (p.from != null) qp['date_from'] = p.from!;
  if (p.to != null)   qp['date_to']   = p.to!;
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseTime}/entries',
    queryParameters: qp,
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  final list = d is List ? d : (d is Map ? (d['entries'] as List? ?? d['data'] as List? ?? []) : []);
  return list.whereType<Map<String, dynamic>>().map(_normaliseEntry).toList();
});

/// Paginated + filtered entries for the My Entries tab.
/// Mirrors web `MyTimeLogTab`: passes `page`, `pageSize`, `date_from`, `date_to`,
/// `project_id`, `status` (and `user_id` so the API scopes to the caller).
/// Response shape: `{ entries: [...], total, page, pageSize, totalPages }`.
typedef _EntriesFilter = ({
  String? from,
  String? to,
  String? projectId,
  String? status,
  String? userId,
  int page,
  int pageSize,
});

final _myEntriesProvider = FutureProvider.autoDispose
    .family<({List<Map<String, dynamic>> entries, int total, int totalPages}), _EntriesFilter>(
  (ref, p) async {
    final qp = <String, String>{
      'page':     p.page.toString(),
      'pageSize': p.pageSize.toString(),
    };
    if (p.from      != null && p.from!.isNotEmpty)      qp['date_from']  = p.from!;
    if (p.to        != null && p.to!.isNotEmpty)        qp['date_to']    = p.to!;
    if (p.projectId != null && p.projectId!.isNotEmpty) qp['project_id'] = p.projectId!;
    if (p.status    != null && p.status!.isNotEmpty)    qp['status']     = p.status!;
    if (p.userId    != null && p.userId!.isNotEmpty)    qp['user_id']    = p.userId!;

    final raw = await ApiClient.instance.get<Map<String, dynamic>>(
      '${AppConstants.baseTime}/entries',
      queryParameters: qp,
      fromJson: (r) => r as Map<String, dynamic>,
    );

    final d = raw['data'];
    // Paginated shape: { data: { entries: [...], pagination: { total, totalPages, ... } } }
    // Legacy shape:    { data: [...] }
    List<dynamic> list = const [];
    int total      = 0;
    int totalPages = 1;
    if (d is Map) {
      list = (d['entries'] as List?) ?? (d['data'] as List?) ?? const [];
      final pg = d['pagination'];
      if (pg is Map) {
        total      = (pg['total']      as num?)?.toInt() ?? list.length;
        totalPages = (pg['totalPages'] as num?)?.toInt()
            ?? (total == 0 ? 1 : ((total + p.pageSize - 1) ~/ p.pageSize));
      } else {
        // Server returned all rows in one go — slice client-side so the
        // pagination UI still works.
        total      = list.length;
        totalPages = total == 0 ? 1 : ((total + p.pageSize - 1) ~/ p.pageSize);
        final start = (p.page - 1) * p.pageSize;
        final end   = (start + p.pageSize).clamp(0, list.length);
        list = start < list.length ? list.sublist(start, end) : const [];
      }
    } else if (d is List) {
      total      = d.length;
      totalPages = total == 0 ? 1 : ((total + p.pageSize - 1) ~/ p.pageSize);
      final start = (p.page - 1) * p.pageSize;
      final end   = (start + p.pageSize).clamp(0, d.length);
      list = start < d.length ? d.sublist(start, end) : const [];
    }

    final entries = list.whereType<Map<String, dynamic>>().map(_normaliseEntry).toList();
    return (entries: entries, total: total, totalPages: totalPages.clamp(1, 1 << 30));
  },
);

final _pendingApprovalsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseTime}/approvals',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['approvals'] as List? ?? d['data'] as List? ?? [];
  return [];
});

/// Loads all tasks for a project from its most-recent active sprint.
/// Falls back to the newest sprint when none is active.
final _projectTasksProvider =
    FutureProvider.autoDispose.family<List<SprintTask>, String>((ref, projectId) async {
  if (projectId.isEmpty) return [];

  // 1. Fetch sprints for the project
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseSprints}/sprints',
    queryParameters: {'project_id': projectId},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  final sprintList = (d is List
      ? d
      : (d is Map ? (d['sprints'] as List? ?? d['data'] as List? ?? []) : []))
      .whereType<Map<String, dynamic>>().toList();

  if (sprintList.isEmpty) return [];

  // Prefer ACTIVE sprint; fall back to first
  final sprint = sprintList.firstWhere(
    (s) => (s['status'] as String? ?? '').toUpperCase() == 'ACTIVE',
    orElse: () => sprintList.first,
  );
  final sprintId = (sprint['ROWID'] ?? sprint['id'])?.toString() ?? '';
  if (sprintId.isEmpty) return [];

  // 2. Fetch sprint board and flatten tasks from all status columns
  final board = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseSprints}/sprints/$sprintId/board',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final bd = board['data'];
  final boardMap = (bd is Map && bd.containsKey('board'))
      ? bd['board'] as Map?
      : (bd is Map ? bd : null);
  if (boardMap == null) return [];

  final tasks = <SprintTask>[];
  for (final col in boardMap.values) {
    if (col is List) {
      tasks.addAll(
        col.whereType<Map<String, dynamic>>()
           .map((t) => SprintTask.fromJson(t)),
      );
    }
  }
  return tasks;
});

// ── Screen ────────────────────────────────────────────────────────────────────

class TimeTrackingScreen extends ConsumerStatefulWidget {
  const TimeTrackingScreen({super.key});

  @override
  ConsumerState<TimeTrackingScreen> createState() => _TimeTrackingScreenState();
}

class _TimeTrackingScreenState extends ConsumerState<TimeTrackingScreen>
    with TickerProviderStateMixin {
  late TabController _tabController;
  bool _isManager = false;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 3, vsync: this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final u = ref.read(currentUserProvider);
    final mgr = u?.role == 'TENANT_ADMIN'
        || u?.hasPermission(Permissions.timeApprove) == true;
    if (mgr != _isManager) {
      _isManager = mgr;
      _tabController.dispose();
      _tabController = TabController(length: mgr ? 4 : 3, vsync: this);
    }
  }

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
        title: const Text('Time Tracking'),
        backgroundColor: ds.bgPage,
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: [
            const Tab(icon: Icon(Icons.list_rounded, size: 18), text: 'My Entries'),
            const Tab(icon: Icon(Icons.grid_view_rounded, size: 18), text: 'Weekly Log'),
            const Tab(icon: Icon(Icons.bar_chart_rounded, size: 18), text: 'Analytics'),
            if (_isManager)
              const Tab(icon: Icon(Icons.approval_rounded, size: 18), text: 'Approvals'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _EntriesTab(onRefresh: () => ref.invalidate(_myWeekSummaryProvider)),
          const _WeeklyLogTab(),
          const _AnalyticsTab(),
          if (_isManager) _ApprovalsTab(),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAddEntry(context),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Log Time', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }

  void _showAddEntry(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AddTimeEntrySheet(
        onAdded: () {
          ref.invalidate(_myWeekSummaryProvider);
          ref.invalidate(_entriesRangeProvider);
          ref.invalidate(_myEntriesProvider);
          ref.invalidate(_weeklyGridProvider);
        },
      ),
    );
  }
}

// ── Entries tab ───────────────────────────────────────────────────────────────

/// Quick-pick date presets — mirrors web `MyTimeLogTab` PRESETS.
enum _DatePreset { today, yesterday, week, all, custom }

extension _DatePresetX on _DatePreset {
  String get label => switch (this) {
        _DatePreset.today     => 'Today',
        _DatePreset.yesterday => 'Yesterday',
        _DatePreset.week      => 'This Week',
        _DatePreset.all       => 'All Time',
        _DatePreset.custom    => 'Custom',
      };
}

class _EntriesTab extends ConsumerStatefulWidget {
  const _EntriesTab({required this.onRefresh});
  final VoidCallback onRefresh;

  @override
  ConsumerState<_EntriesTab> createState() => _EntriesTabState();
}

class _EntriesTabState extends ConsumerState<_EntriesTab> {
  // Filter state. Default range = Today, matching the brief.
  String _from   = DateFormat('yyyy-MM-dd').format(DateTime.now());
  String _to     = DateFormat('yyyy-MM-dd').format(DateTime.now());
  String _projectId = '';
  String _status    = '';
  int _page     = 1;
  int _pageSize = 5;

  static const _pageSizeOptions = [3, 5, 10, 20, 50];

  // ── Preset helpers ───────────────────────────────────────────────────────
  _DatePreset get _activePreset {
    final today = DateTime.now();
    final t  = DateFormat('yyyy-MM-dd').format(today);
    final y  = DateFormat('yyyy-MM-dd').format(today.subtract(const Duration(days: 1)));
    // Monday-anchored week boundary, matching web (startOfWeek weekStartsOn: 1)
    final wsDt = today.subtract(Duration(days: today.weekday - 1));
    final weDt = wsDt.add(const Duration(days: 6));
    final ws = DateFormat('yyyy-MM-dd').format(wsDt);
    final we = DateFormat('yyyy-MM-dd').format(weDt);

    if (_from.isEmpty && _to.isEmpty)         return _DatePreset.all;
    if (_from == t  && _to == t)              return _DatePreset.today;
    if (_from == y  && _to == y)              return _DatePreset.yesterday;
    if (_from == ws && _to == we)             return _DatePreset.week;
    return _DatePreset.custom;
  }

  void _applyPreset(_DatePreset p) {
    final today = DateTime.now();
    setState(() {
      _page = 1;
      switch (p) {
        case _DatePreset.all:
          _from = ''; _to = '';
          break;
        case _DatePreset.today:
          final d = DateFormat('yyyy-MM-dd').format(today);
          _from = d; _to = d;
          break;
        case _DatePreset.yesterday:
          final d = DateFormat('yyyy-MM-dd').format(today.subtract(const Duration(days: 1)));
          _from = d; _to = d;
          break;
        case _DatePreset.week:
          final wsDt = today.subtract(Duration(days: today.weekday - 1));
          final weDt = wsDt.add(const Duration(days: 6));
          _from = DateFormat('yyyy-MM-dd').format(wsDt);
          _to   = DateFormat('yyyy-MM-dd').format(weDt);
          break;
        case _DatePreset.custom:
          // no-op — custom is implied by manual date edits.
          break;
      }
    });
  }

  bool get _hasAnyFilter =>
      _from.isNotEmpty || _to.isNotEmpty || _projectId.isNotEmpty || _status.isNotEmpty;

  void _clearFilters() => setState(() {
    _from = ''; _to = '';
    _projectId = ''; _status = '';
    _page = 1;
  });

  Future<void> _pickFromDate() async {
    final init = DateTime.tryParse(_from) ?? DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: init,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (d != null) setState(() { _from = DateFormat('yyyy-MM-dd').format(d); _page = 1; });
  }

  Future<void> _pickToDate() async {
    final init = DateTime.tryParse(_to) ?? DateTime.now();
    final d = await showDatePicker(
      context: context,
      initialDate: init,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (d != null) setState(() { _to = DateFormat('yyyy-MM-dd').format(d); _page = 1; });
  }

  @override
  Widget build(BuildContext context) {
    final user        = ref.watch(currentUserProvider);
    final projects    = ref.watch(projectsProvider);
    final filter      = (
      from:      _from.isEmpty ? null : _from,
      to:        _to.isEmpty   ? null : _to,
      projectId: _projectId.isEmpty ? null : _projectId,
      status:    _status.isEmpty    ? null : _status,
      userId:    user?.id,
      page:      _page,
      pageSize:  _pageSize,
    );
    final entriesAsync = ref.watch(_myEntriesProvider(filter));

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(_myWeekSummaryProvider);
        ref.invalidate(_myEntriesProvider);
        widget.onRefresh();
      },
      color: AppColors.primaryLight,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
        children: [
          _FilterCard(
            from:           _from,
            to:             _to,
            projectId:      _projectId,
            status:         _status,
            projects:       projects,
            activePreset:   _activePreset,
            hasAnyFilter:   _hasAnyFilter,
            onPreset:       _applyPreset,
            onPickFrom:     _pickFromDate,
            onPickTo:       _pickToDate,
            onProject:      (v) => setState(() { _projectId = v ?? ''; _page = 1; }),
            onStatus:       (v) => setState(() { _status    = v ?? ''; _page = 1; }),
            onClear:        _clearFilters,
          ),
          const SizedBox(height: 12),
          entriesAsync.when(
            loading: () => Column(
              children: List.generate(_pageSize.clamp(1, 5), (_) => const ShimmerCard()),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.all(20),
              child: Text('$e', style: const TextStyle(color: AppColors.error)),
            ),
            data: (res) {
              if (res.entries.isEmpty) {
                return const _EmptyState();
              }
              // Group by date for the existing date-header pattern.
              final Map<String, List<Map<String, dynamic>>> grouped = {};
              for (final e in res.entries) {
                (grouped[e['date'] as String] ??= []).add(e);
              }
              final sortedDays = grouped.keys.toList()..sort((a, b) => b.compareTo(a));
              final start = (_page - 1) * _pageSize + 1;
              final end   = start + res.entries.length - 1;

              return Column(
                children: [
                  for (final day in sortedDays) ...[
                    Align(alignment: Alignment.centerLeft, child: _DateHeader(day)),
                    const SizedBox(height: 8),
                    ...grouped[day]!.map((e) => _TimeEntryCard(e)),
                    const SizedBox(height: 12),
                  ],
                  _PaginationFooter(
                    start:       start,
                    end:         end,
                    total:       res.total,
                    page:        _page,
                    totalPages:  res.totalPages,
                    pageSize:    _pageSize,
                    options:     _pageSizeOptions,
                    onPageSize:  (v) => setState(() { _pageSize = v; _page = 1; }),
                    onPage:      (p) => setState(() => _page = p.clamp(1, res.totalPages)),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }
}

// ── Filter card ───────────────────────────────────────────────────────────────

class _FilterCard extends StatelessWidget {
  const _FilterCard({
    required this.from,
    required this.to,
    required this.projectId,
    required this.status,
    required this.projects,
    required this.activePreset,
    required this.hasAnyFilter,
    required this.onPreset,
    required this.onPickFrom,
    required this.onPickTo,
    required this.onProject,
    required this.onStatus,
    required this.onClear,
  });

  final String from;
  final String to;
  final String projectId;
  final String status;
  final AsyncValue<List<Project>> projects;
  final _DatePreset activePreset;
  final bool hasAnyFilter;
  final ValueChanged<_DatePreset> onPreset;
  final VoidCallback onPickFrom;
  final VoidCallback onPickTo;
  final ValueChanged<String?> onProject;
  final ValueChanged<String?> onStatus;
  final VoidCallback onClear;

  static const _presets = [
    _DatePreset.today,
    _DatePreset.yesterday,
    _DatePreset.week,
    _DatePreset.all,
  ];

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final projectsList = projects.maybeWhen(data: (l) => l, orElse: () => const <Project>[]);

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Preset chips row
        Wrap(
          spacing: 6,
          runSpacing: 6,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            for (final p in _presets)
              _PresetChip(label: p.label, selected: activePreset == p, onTap: () => onPreset(p)),
            if (activePreset == _DatePreset.custom)
              _PresetChip(label: 'Custom', selected: true, onTap: null, tone: _ChipTone.info),
            if (hasAnyFilter)
              GestureDetector(
                onTap: onClear,
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.error.withOpacity(0.08),
                    border: Border.all(color: AppColors.error.withOpacity(0.4)),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: const Row(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.close_rounded, size: 12, color: AppColors.error),
                    SizedBox(width: 4),
                    Text('Clear', style: TextStyle(fontSize: 11, color: AppColors.error, fontWeight: FontWeight.w600)),
                  ]),
                ),
              ),
          ],
        ),
        const SizedBox(height: 10),
        // From / To row
        Row(children: [
          Expanded(child: _DatePickerField(label: 'From', value: from, onTap: onPickFrom)),
          const SizedBox(width: 8),
          Expanded(child: _DatePickerField(label: 'To',   value: to,   onTap: onPickTo)),
        ]),
        const SizedBox(height: 10),
        // Project / Status row
        Row(children: [
          Expanded(
            child: _DropdownField<String>(
              label:    'Project',
              value:    projectId,
              hint:     'All projects',
              items: [
                const DropdownMenuItem<String>(value: '', child: Text('All projects')),
                ...projectsList.map((p) => DropdownMenuItem<String>(value: p.id, child: Text(p.name, overflow: TextOverflow.ellipsis))),
              ],
              onChanged: onProject,
            ),
          ),
          const SizedBox(width: 8),
          Expanded(
            child: _DropdownField<String>(
              label:   'Status',
              value:   status,
              hint:    'All statuses',
              items: const [
                DropdownMenuItem(value: '',          child: Text('All statuses')),
                DropdownMenuItem(value: 'DRAFT',     child: Text('Draft')),
                DropdownMenuItem(value: 'SUBMITTED', child: Text('Submitted')),
                DropdownMenuItem(value: 'APPROVED',  child: Text('Approved')),
                DropdownMenuItem(value: 'REJECTED',  child: Text('Rejected')),
              ],
              onChanged: onStatus,
            ),
          ),
        ]),
      ]),
    );
  }
}

enum _ChipTone { primary, info }

class _PresetChip extends StatelessWidget {
  const _PresetChip({
    required this.label,
    required this.selected,
    required this.onTap,
    this.tone = _ChipTone.primary,
  });
  final String label;
  final bool selected;
  final VoidCallback? onTap;
  final _ChipTone tone;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final accent = tone == _ChipTone.info ? AppColors.info : AppColors.primary;
    final bg     = selected
        ? (tone == _ChipTone.info ? accent.withOpacity(0.12) : accent)
        : ds.bgCard;
    final fg = selected
        ? (tone == _ChipTone.info ? accent : Colors.white)
        : ds.textPrimary;
    final border = selected
        ? (tone == _ChipTone.info ? accent.withOpacity(0.4) : accent)
        : ds.border;

    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: border),
        ),
        child: Text(label, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: fg)),
      ),
    );
  }
}

class _DatePickerField extends StatelessWidget {
  const _DatePickerField({required this.label, required this.value, required this.onTap});
  final String label;
  final String value; // 'yyyy-MM-dd' or ''
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    String display = '—';
    if (value.isNotEmpty) {
      final dt = DateTime.tryParse(value);
      display = dt != null ? DateFormat('d MMM yyyy').format(dt) : value;
    }
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: TextStyle(fontSize: 10, color: ds.textMuted, fontWeight: FontWeight.w600, letterSpacing: 0.5)),
      const SizedBox(height: 4),
      GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
          decoration: BoxDecoration(
            color: ds.bgInput,
            border: Border.all(color: ds.border),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Row(children: [
            Icon(Icons.calendar_today_rounded, size: 14, color: ds.textMuted),
            const SizedBox(width: 8),
            Expanded(
              child: Text(
                display,
                style: TextStyle(fontSize: 12, color: value.isEmpty ? ds.textMuted : ds.textPrimary),
                overflow: TextOverflow.ellipsis,
              ),
            ),
          ]),
        ),
      ),
    ]);
  }
}

class _DropdownField<T> extends StatelessWidget {
  const _DropdownField({
    required this.label,
    required this.value,
    required this.hint,
    required this.items,
    required this.onChanged,
  });
  final String label;
  final T? value;
  final String hint;
  final List<DropdownMenuItem<T>> items;
  final ValueChanged<T?> onChanged;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(label, style: TextStyle(fontSize: 10, color: ds.textMuted, fontWeight: FontWeight.w600, letterSpacing: 0.5)),
      const SizedBox(height: 4),
      Container(
        padding: const EdgeInsets.symmetric(horizontal: 10),
        decoration: BoxDecoration(
          color: ds.bgInput,
          border: Border.all(color: ds.border),
          borderRadius: BorderRadius.circular(10),
        ),
        child: DropdownButtonHideUnderline(
          child: DropdownButton<T>(
            isExpanded: true,
            value: value,
            hint: Text(hint, style: TextStyle(fontSize: 12, color: ds.textMuted)),
            icon: Icon(Icons.expand_more_rounded, size: 18, color: ds.textMuted),
            style: TextStyle(fontSize: 12, color: ds.textPrimary),
            dropdownColor: ds.bgElevated,
            items: items,
            onChanged: onChanged,
          ),
        ),
      ),
    ]);
  }
}

// ── Pagination footer ─────────────────────────────────────────────────────────

class _PaginationFooter extends StatelessWidget {
  const _PaginationFooter({
    required this.start,
    required this.end,
    required this.total,
    required this.page,
    required this.totalPages,
    required this.pageSize,
    required this.options,
    required this.onPageSize,
    required this.onPage,
  });

  final int start;
  final int end;
  final int total;
  final int page;
  final int totalPages;
  final int pageSize;
  final List<int> options;
  final ValueChanged<int> onPageSize;
  final ValueChanged<int> onPage;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    // Build elided page list: 1, ..., page-1, page, page+1, ..., last
    final List<int?> pageList = [];
    for (var i = 1; i <= totalPages; i++) {
      if (i == 1 || i == totalPages || (i - page).abs() <= 1) {
        if (pageList.isNotEmpty && pageList.last != null && i - (pageList.last as int) > 1) {
          pageList.add(null); // ellipsis sentinel
        }
        pageList.add(i);
      }
    }

    return Container(
      margin: const EdgeInsets.only(top: 4),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ds.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Showing X–Y of Z + rows-per-page selector
        Row(children: [
          Expanded(
            child: Text(
              'Showing $start–$end of $total entries',
              style: TextStyle(fontSize: 11, color: ds.textMuted),
            ),
          ),
          Text('Rows:', style: TextStyle(fontSize: 11, color: ds.textMuted)),
          const SizedBox(width: 6),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 6),
            decoration: BoxDecoration(
              color: ds.bgInput,
              borderRadius: BorderRadius.circular(6),
              border: Border.all(color: ds.border),
            ),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<int>(
                value: pageSize,
                isDense: true,
                icon: Icon(Icons.expand_more_rounded, size: 14, color: ds.textMuted),
                style: TextStyle(fontSize: 12, color: ds.textPrimary),
                dropdownColor: ds.bgElevated,
                items: options
                    .map((n) => DropdownMenuItem(value: n, child: Text('$n')))
                    .toList(),
                onChanged: (v) { if (v != null) onPageSize(v); },
              ),
            ),
          ),
        ]),
        if (totalPages > 1) ...[
          const SizedBox(height: 8),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            _PageBtn(icon: Icons.first_page_rounded, enabled: page > 1, onTap: () => onPage(1)),
            _PageBtn(icon: Icons.chevron_left_rounded, enabled: page > 1, onTap: () => onPage(page - 1)),
            ...pageList.map((p) => p == null
                ? Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 4),
                    child: Text('…', style: TextStyle(fontSize: 12, color: ds.textMuted)),
                  )
                : _PageNumber(n: p, active: p == page, onTap: () => onPage(p))),
            _PageBtn(icon: Icons.chevron_right_rounded, enabled: page < totalPages, onTap: () => onPage(page + 1)),
            _PageBtn(icon: Icons.last_page_rounded,     enabled: page < totalPages, onTap: () => onPage(totalPages)),
          ]),
        ],
      ]),
    );
  }
}

class _PageBtn extends StatelessWidget {
  const _PageBtn({required this.icon, required this.enabled, required this.onTap});
  final IconData icon;
  final bool enabled;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Opacity(
      opacity: enabled ? 1.0 : 0.35,
      child: GestureDetector(
        onTap: enabled ? onTap : null,
        child: Container(
          margin: const EdgeInsets.symmetric(horizontal: 2),
          padding: const EdgeInsets.all(4),
          decoration: BoxDecoration(
            color: ds.bgInput,
            border: Border.all(color: ds.border),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Icon(icon, size: 16, color: ds.textPrimary),
        ),
      ),
    );
  }
}

class _PageNumber extends StatelessWidget {
  const _PageNumber({required this.n, required this.active, required this.onTap});
  final int n;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 2),
        constraints: const BoxConstraints(minWidth: 28),
        padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 4),
        decoration: BoxDecoration(
          color: active ? AppColors.primary : ds.bgInput,
          border: Border.all(color: active ? AppColors.primary : ds.border),
          borderRadius: BorderRadius.circular(6),
        ),
        child: Text(
          '$n',
          textAlign: TextAlign.center,
          style: TextStyle(
            fontSize: 12,
            fontWeight: active ? FontWeight.w700 : FontWeight.w500,
            color: active ? Colors.white : ds.textPrimary,
          ),
        ),
      ),
    );
  }
}

// ── Weekly log helpers ────────────────────────────────────────────────────────

/// Format hours: 8.0 → '8h', 8.5 → '8h 30m', 0.75 → '45m'.
String _fmtHrs(double h) {
  if (h <= 0) return '0h';
  final hours   = h.floor();
  final minutes = ((h - hours) * 60).round();
  if (minutes == 0) return '${hours}h';
  if (hours == 0) return '${minutes}m';
  return '${hours}h ${minutes}m';
}

/// Fetches all entries for a date range scoped to the current user.
final _weeklyGridProvider = FutureProvider.autoDispose
    .family<List<Map<String, dynamic>>, ({String from, String to, String? userId})>(
  (ref, p) async {
    final qp = <String, String>{'date_from': p.from, 'date_to': p.to};
    if (p.userId?.isNotEmpty == true) qp['user_id'] = p.userId!;
    final raw = await ApiClient.instance.get<Map<String, dynamic>>(
      '${AppConstants.baseTime}/entries',
      queryParameters: qp,
      fromJson: (r) => r as Map<String, dynamic>,
    );
    final d = raw['data'];
    final list = d is List
        ? d
        : (d is Map ? (d['entries'] as List? ?? d['data'] as List? ?? []) : []);
    return list.whereType<Map<String, dynamic>>().map(_normaliseEntry).toList();
  },
);

/// A project-level row in the weekly grid — aggregates entries by project.
class _WeekRow {
  _WeekRow({
    required this.projectId,
    required this.projectName,
    required this.billable,
    required this.hoursByDate,
    required this.rawEntries,
  });
  final String? projectId;
  final String projectName;
  bool billable;
  final Map<String, double> hoursByDate;
  final List<Map<String, dynamic>> rawEntries;
  double get totalHours => hoursByDate.values.fold(0.0, (s, v) => s + v);
}

// ── Weekly log tab ────────────────────────────────────────────────────────────

class _WeeklyLogTab extends ConsumerStatefulWidget {
  const _WeeklyLogTab();
  @override
  ConsumerState<_WeeklyLogTab> createState() => _WeeklyLogTabState();
}

class _WeeklyLogTabState extends ConsumerState<_WeeklyLogTab> {
  late DateTime _weekStart;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _weekStart = DateTime(now.year, now.month, now.day)
        .subtract(Duration(days: now.weekday - 1));
  }

  DateTime get _weekEnd => _weekStart.add(const Duration(days: 6));
  String get _from => DateFormat('yyyy-MM-dd').format(_weekStart);
  String get _to   => DateFormat('yyyy-MM-dd').format(_weekEnd);

  int get _weekNumber {
    final d    = _weekStart;
    final jan4 = DateTime(d.year, 1, 4);
    final ws1  = jan4.subtract(Duration(days: jan4.weekday - 1));
    return (d.difference(ws1).inDays / 7).floor() + 1;
  }

  bool get _canGoNext {
    final next      = _weekStart.add(const Duration(days: 7));
    final todayDate = DateTime.now();
    final today     = DateTime(todayDate.year, todayDate.month, todayDate.day);
    return next.isBefore(today) || next == today;
  }

  void _prevWeek() =>
      setState(() => _weekStart = _weekStart.subtract(const Duration(days: 7)));

  void _nextWeek() {
    if (_canGoNext) setState(() => _weekStart = _weekStart.add(const Duration(days: 7)));
  }

  List<_WeekRow> _buildRows(List<Map<String, dynamic>> entries) {
    final Map<String, _WeekRow> map = {};
    for (final e in entries) {
      final pid  = e['projectId'] as String? ?? '';
      final rawN = e['projectName'] as String? ?? '';
      final name = rawN.isNotEmpty ? rawN : (pid.isNotEmpty ? pid : 'No Project');
      final key  = pid.isNotEmpty ? pid : '__none__';
      final date = e['date'] as String? ?? '';
      final hrs  = (e['hours'] as num? ?? 0).toDouble();
      final bill = e['isBillable'] as bool? ?? false;

      map.putIfAbsent(
        key,
        () => _WeekRow(
          projectId:   pid.isNotEmpty ? pid : null,
          projectName: name,
          billable:    bill,
          hoursByDate: {},
          rawEntries:  [],
        ),
      );
      if (date.isNotEmpty) {
        map[key]!.hoursByDate[date] = (map[key]!.hoursByDate[date] ?? 0) + hrs;
      }
      map[key]!.rawEntries.add(e);
    }
    return map.values.toList();
  }

  void _invalidateAll() {
    ref.invalidate(_weeklyGridProvider);
    ref.invalidate(_myWeekSummaryProvider);
    ref.invalidate(_entriesRangeProvider);
    ref.invalidate(_myEntriesProvider);
  }

  void _openCellEditor(
    BuildContext ctx,
    String dayKey,
    _WeekRow row,
    List<({DateTime dt, String key})> days,
  ) {
    final d = days.firstWhere((x) => x.key == dayKey);
    showModalBottomSheet(
      context: ctx,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CellEditorSheet(
        date:            d.dt,
        projectId:       row.projectId,
        projectName:     row.projectName,
        existingHrs:     row.hoursByDate[dayKey] ?? 0,
        existingEntries: row.rawEntries
            .where((e) => e['date'] == dayKey).toList(),
        onChanged:       _invalidateAll,
      ),
    );
  }

  void _openAddRow(BuildContext ctx) {
    showModalBottomSheet(
      context: ctx,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _AddWeeklyRowSheet(
        weekStart: _weekStart,
        weekEnd:   _weekEnd,
        onAdded:   _invalidateAll,
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ds   = context.ds;
    final user = ref.watch(currentUserProvider);
    final async = ref.watch(
      _weeklyGridProvider((from: _from, to: _to, userId: user?.id)),
    );

    final days = List.generate(7, (i) {
      final dt = _weekStart.add(Duration(days: i));
      return (dt: dt, key: DateFormat('yyyy-MM-dd').format(dt));
    });
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    return RefreshIndicator(
      onRefresh: () async => _invalidateAll(),
      color: AppColors.primaryLight,
      child: async.when(
        loading: () => _buildShimmer(ds),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Text('$e', style: const TextStyle(color: AppColors.error)),
          ),
        ),
        data: (entries) {
          final rows = _buildRows(entries);

          final dayTotals = {
            for (final d in days)
              d.key: entries
                  .where((e) => e['date'] == d.key)
                  .fold(0.0, (s, e) => s + (e['hours'] as num? ?? 0).toDouble()),
          };

          final totalHrs = entries.fold(
              0.0, (s, e) => s + (e['hours'] as num? ?? 0).toDouble());
          final billableHrs = entries
              .where((e) => e['isBillable'] == true)
              .fold(0.0, (s, e) => s + (e['hours'] as num? ?? 0).toDouble());
          final daysLogged =
              entries.map((e) => e['date'] as String).toSet().length;

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
            children: [
              // Week navigation
              _WeekHeader(
                weekStart:  _weekStart,
                weekEnd:    _weekEnd,
                weekNumber: _weekNumber,
                onPrev:     _prevWeek,
                onNext:     _nextWeek,
                canGoNext:  _canGoNext,
              ).animate().fadeIn(),
              const SizedBox(height: 12),

              // Summary bar
              _WeeklySummaryBar(
                totalHrs:    totalHrs,
                billableHrs: billableHrs,
                daysLogged:  daysLogged,
              ).animate().fadeIn(delay: 60.ms),
              const SizedBox(height: 16),

              // Project rows
              if (rows.isEmpty)
                _WeeklyEmptyState(onAdd: () => _openAddRow(context))
                    .animate().fadeIn(delay: 100.ms)
              else
                for (var i = 0; i < rows.length; i++) ...[
                  _WeeklyProjectCard(
                    row:       rows[i],
                    days:      days,
                    dayLabels: dayLabels,
                    onCellTap: (key) =>
                        _openCellEditor(context, key, rows[i], days),
                  ).animate()
                      .fadeIn(delay: Duration(milliseconds: 80 + i * 50))
                      .slideY(begin: 0.04, duration: 280.ms),
                  const SizedBox(height: 10),
                ],

              if (rows.isNotEmpty) ...[
                _AddWeekRowButton(onTap: () => _openAddRow(context))
                    .animate().fadeIn(delay: 200.ms),
                const SizedBox(height: 20),
              ],

              // Day totals
              _DayTotalsFooter(
                days:      days,
                dayLabels: dayLabels,
                dayTotals: dayTotals,
                totalHrs:  totalHrs,
              ).animate().fadeIn(delay: 240.ms),
            ],
          );
        },
      ),
    );
  }

  Widget _buildShimmer(DsColors ds) => ListView(
    padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
    children: [
      Container(
        height: 72,
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(16),
        ),
      ),
      const SizedBox(height: 12),
      const ShimmerCard(height: 44),
      const SizedBox(height: 16),
      const ShimmerCard(height: 130),
      const SizedBox(height: 10),
      const ShimmerCard(height: 130),
    ],
  );
}

// ── Weekly log sub-widgets ─────────────────────────────────────────────────────

class _WeekHeader extends StatelessWidget {
  const _WeekHeader({
    required this.weekStart,
    required this.weekEnd,
    required this.weekNumber,
    required this.onPrev,
    required this.onNext,
    required this.canGoNext,
  });
  final DateTime weekStart, weekEnd;
  final int weekNumber;
  final VoidCallback onPrev, onNext;
  final bool canGoNext;

  @override
  Widget build(BuildContext context) {
    final ds  = context.ds;
    final fmt = DateFormat('d MMM');

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ds.border),
      ),
      child: Row(children: [
        IconButton(
          icon: const Icon(Icons.chevron_left_rounded, size: 22),
          color: ds.textPrimary,
          onPressed: onPrev,
          padding: EdgeInsets.zero,
          constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
        ),
        Expanded(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Text(
              '${fmt.format(weekStart)} – ${fmt.format(weekEnd)}, ${weekEnd.year}',
              style: TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w700, color: ds.textPrimary),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 4),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.14),
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                'WEEK $weekNumber',
                style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primaryLight,
                  letterSpacing: 1,
                ),
              ),
            ),
          ]),
        ),
        Opacity(
          opacity: canGoNext ? 1.0 : 0.3,
          child: IconButton(
            icon: const Icon(Icons.chevron_right_rounded, size: 22),
            color: ds.textPrimary,
            onPressed: canGoNext ? onNext : null,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(minWidth: 36, minHeight: 36),
          ),
        ),
      ]),
    );
  }
}

class _WeeklySummaryBar extends StatelessWidget {
  const _WeeklySummaryBar({
    required this.totalHrs,
    required this.billableHrs,
    required this.daysLogged,
  });
  final double totalHrs, billableHrs;
  final int daysLogged;

  @override
  Widget build(BuildContext context) => Row(children: [
    _SummaryPill(
      icon: Icons.access_time_rounded,
      label: 'Total',
      value: _fmtHrs(totalHrs),
      color: AppColors.primaryLight,
    ),
    const SizedBox(width: 8),
    _SummaryPill(
      icon: Icons.attach_money_rounded,
      label: 'Billable',
      value: _fmtHrs(billableHrs),
      color: AppColors.ragGreen,
    ),
    const SizedBox(width: 8),
    _SummaryPill(
      icon: Icons.calendar_today_rounded,
      label: 'Days',
      value: '$daysLogged',
      color: AppColors.info,
    ),
  ]);
}

class _SummaryPill extends StatelessWidget {
  const _SummaryPill({
    required this.icon,
    required this.label,
    required this.value,
    required this.color,
  });
  final IconData icon;
  final String label, value;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Expanded(
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
        decoration: BoxDecoration(
          color: color.withOpacity(0.08),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Row(children: [
          Icon(icon, size: 14, color: color),
          const SizedBox(width: 6),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: TextStyle(
                      fontSize: 9,
                      color: ds.textMuted,
                      fontWeight: FontWeight.w600,
                      letterSpacing: 0.3),
                ),
                Text(
                  value,
                  style: TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w800, color: color),
                ),
              ],
            ),
          ),
        ]),
      ),
    );
  }
}

class _WeeklyProjectCard extends StatelessWidget {
  const _WeeklyProjectCard({
    required this.row,
    required this.days,
    required this.dayLabels,
    required this.onCellTap,
  });
  final _WeekRow row;
  final List<({DateTime dt, String key})> days;
  final List<String> dayLabels;
  final ValueChanged<String> onCellTap;

  @override
  Widget build(BuildContext context) {
    final ds    = context.ds;
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());

    return Container(
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ds.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Header
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 10),
          child: Row(children: [
            Container(
              width: 8, height: 8,
              margin: const EdgeInsets.only(right: 8, top: 1),
              decoration: BoxDecoration(
                color: row.billable
                    ? AppColors.ragGreen
                    : AppColors.primaryLight,
                shape: BoxShape.circle,
              ),
            ),
            Expanded(
              child: Text(
                row.projectName,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: ds.textPrimary),
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ),
            const SizedBox(width: 8),
            if (row.billable)
              Container(
                margin: const EdgeInsets.only(right: 6),
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: AppColors.ragGreen.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                      color: AppColors.ragGreen.withOpacity(0.3)),
                ),
                child: const Text(
                  '\$ Bill',
                  style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w700,
                      color: AppColors.ragGreen),
                ),
              ),
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
              decoration: BoxDecoration(
                color: row.totalHours > 0
                    ? AppColors.primaryLight.withOpacity(0.14)
                    : ds.bgElevated,
                borderRadius: BorderRadius.circular(999),
              ),
              child: Text(
                _fmtHrs(row.totalHours),
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w800,
                  color: row.totalHours > 0
                      ? AppColors.primaryLight
                      : ds.textMuted,
                ),
              ),
            ),
          ]),
        ),

        Divider(height: 1, color: ds.border),

        // Day cells
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 10),
          child: Row(
            children: List.generate(7, (i) {
              final d        = days[i];
              final hrs      = row.hoursByDate[d.key] ?? 0;
              final isToday  = d.key == today;
              final hasHours = hrs > 0;

              final cellBg = hasHours
                  ? AppColors.primaryLight.withOpacity(0.1)
                  : isToday
                      ? AppColors.info.withOpacity(0.06)
                      : Colors.transparent;
              final cellBorderColor = hasHours
                  ? AppColors.primaryLight.withOpacity(0.35)
                  : isToday
                      ? AppColors.info.withOpacity(0.25)
                      : ds.border.withOpacity(0.5);

              return Expanded(
                child: GestureDetector(
                  onTap: () => onCellTap(d.key),
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 2),
                    padding: const EdgeInsets.symmetric(vertical: 8),
                    decoration: BoxDecoration(
                      color: cellBg,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(
                          color: cellBorderColor,
                          width: hasHours ? 1.5 : 1),
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          dayLabels[i],
                          style: TextStyle(
                            fontSize: 9,
                            fontWeight: FontWeight.w700,
                            color: isToday
                                ? AppColors.info
                                : ds.textMuted,
                            letterSpacing: 0.5,
                          ),
                        ),
                        const SizedBox(height: 1),
                        Text(
                          '${d.dt.day}',
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: isToday
                                ? AppColors.info
                                : ds.textSecondary,
                          ),
                        ),
                        const SizedBox(height: 4),
                        if (hasHours)
                          Text(
                            _fmtHrs(hrs),
                            style: const TextStyle(
                              fontSize: 9,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primaryLight,
                            ),
                            textAlign: TextAlign.center,
                          )
                        else
                          Icon(
                            Icons.add_rounded,
                            size: 14,
                            color: ds.textMuted.withOpacity(0.4),
                          ),
                      ],
                    ),
                  ),
                ),
              );
            }),
          ),
        ),
      ]),
    );
  }
}

class _WeeklyEmptyState extends StatelessWidget {
  const _WeeklyEmptyState({required this.onAdd});
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      margin: const EdgeInsets.symmetric(vertical: 24),
      padding: const EdgeInsets.all(32),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: ds.border),
      ),
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          padding: const EdgeInsets.all(20),
          decoration: BoxDecoration(
            color: AppColors.primary.withOpacity(0.1),
            shape: BoxShape.circle,
          ),
          child: const Icon(
            Icons.grid_view_rounded,
            size: 36,
            color: AppColors.primaryLight,
          ),
        ),
        const SizedBox(height: 16),
        Text(
          'No time logged this week',
          style: TextStyle(
              fontSize: 15,
              fontWeight: FontWeight.w700,
              color: ds.textPrimary),
        ),
        const SizedBox(height: 6),
        Text(
          'Add a project row to start\nlogging hours for each day',
          style: TextStyle(fontSize: 12, color: ds.textMuted, height: 1.5),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 20),
        ElevatedButton.icon(
          onPressed: onAdd,
          icon: const Icon(Icons.add_rounded, size: 18),
          label: const Text('Add Project Row'),
        ),
      ]),
    );
  }
}

class _AddWeekRowButton extends StatelessWidget {
  const _AddWeekRowButton({required this.onTap});
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.primary.withOpacity(0.06),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: AppColors.primary.withOpacity(0.22)),
        ),
        child: const Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(Icons.add_circle_outline_rounded,
                size: 18, color: AppColors.primaryLight),
            SizedBox(width: 8),
            Text(
              'Add Project Row',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: AppColors.primaryLight,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _DayTotalsFooter extends StatelessWidget {
  const _DayTotalsFooter({
    required this.days,
    required this.dayLabels,
    required this.dayTotals,
    required this.totalHrs,
  });
  final List<({DateTime dt, String key})> days;
  final List<String> dayLabels;
  final Map<String, double> dayTotals;
  final double totalHrs;

  @override
  Widget build(BuildContext context) {
    final ds    = context.ds;
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());

    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(
          'DAY TOTALS',
          style: TextStyle(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: ds.textMuted,
              letterSpacing: 0.8),
        ),
        const SizedBox(height: 10),
        Row(children: [
          ...List.generate(7, (i) {
            final d       = days[i];
            final hrs     = dayTotals[d.key] ?? 0;
            final isToday = d.key == today;

            return Expanded(
              child: Column(children: [
                Text(
                  dayLabels[i],
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: isToday ? AppColors.info : ds.textMuted,
                    letterSpacing: 0.5,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  '${d.dt.day}',
                  style: TextStyle(
                      fontSize: 10,
                      color: isToday ? AppColors.info : ds.textMuted),
                ),
                const SizedBox(height: 4),
                Text(
                  hrs > 0 ? _fmtHrs(hrs) : '—',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: hrs > 0 ? ds.textPrimary : ds.textMuted,
                  ),
                  textAlign: TextAlign.center,
                ),
              ]),
            );
          }),
          const SizedBox(width: 6),
          Container(width: 1, height: 40, color: ds.border),
          const SizedBox(width: 6),
          Column(children: [
            Text(
              'TOT',
              style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: ds.textMuted,
                  letterSpacing: 0.5),
            ),
            const SizedBox(height: 6),
            Text(
              _fmtHrs(totalHrs),
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w800,
                color: AppColors.primaryLight,
              ),
            ),
          ]),
        ]),
      ]),
    );
  }
}

// ── Cell editor bottom sheet ───────────────────────────────────────────────────

class _CellEditorSheet extends ConsumerStatefulWidget {
  const _CellEditorSheet({
    required this.date,
    required this.projectId,
    required this.projectName,
    required this.existingHrs,
    required this.existingEntries,
    required this.onChanged,
  });
  final DateTime date;
  final String? projectId;
  final String projectName;
  final double existingHrs;
  final List<Map<String, dynamic>> existingEntries;
  final VoidCallback onChanged;

  @override
  ConsumerState<_CellEditorSheet> createState() => _CellEditorSheetState();
}

class _CellEditorSheetState extends ConsumerState<_CellEditorSheet> {
  final _hoursCtrl = TextEditingController();
  final _descCtrl  = TextEditingController();
  bool _billable   = false;
  bool _loading    = false;
  String? _error;
  bool _showAddForm = false;

  @override
  void initState() {
    super.initState();
    _showAddForm = widget.existingHrs == 0;
    if (widget.existingHrs == 0) _hoursCtrl.text = '8';
  }

  @override
  void dispose() {
    _hoursCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final h = double.tryParse(_hoursCtrl.text.trim());
    if (h == null || h <= 0 || h > 24) {
      setState(() => _error = 'Enter valid hours (0.5 – 24)');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseTime}/entries',
        data: {
          'entry_date':  DateFormat('yyyy-MM-dd').format(widget.date),
          'hours':       h,
          'is_billable': _billable,
          if (widget.projectId?.isNotEmpty == true) 'project_id': widget.projectId,
          if (_descCtrl.text.trim().isNotEmpty)
            'description': _descCtrl.text.trim(),
        },
      );
      widget.onChanged();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() { _loading = false; _error = e.toString(); });
    }
  }

  Future<void> _deleteEntry(String id) async {
    setState(() => _loading = true);
    try {
      await ApiClient.instance.delete(
          '${AppConstants.baseTime}/entries/$id');
      widget.onChanged();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() { _loading = false; _error = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds         = context.ds;
    final dayFmt     = DateFormat('EEEE, d MMMM yyyy');
    final hasEntries = widget.existingEntries.isNotEmpty;

    return Container(
      decoration: BoxDecoration(
        color: ds.bgPage,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        left: 20, right: 20, top: 20,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
            const SizedBox(height: 16),

            // Header
            Row(children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      dayFmt.format(widget.date),
                      style: TextStyle(
                          fontSize: 11,
                          color: ds.textMuted,
                          fontWeight: FontWeight.w600),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      widget.projectName,
                      style: TextStyle(
                          fontSize: 16,
                          fontWeight: FontWeight.w800,
                          color: ds.textPrimary),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                    ),
                  ],
                ),
              ),
              if (widget.existingHrs > 0)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                  decoration: BoxDecoration(
                    color: AppColors.primaryLight.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    _fmtHrs(widget.existingHrs),
                    style: const TextStyle(
                        fontSize: 14,
                        fontWeight: FontWeight.w800,
                        color: AppColors.primaryLight),
                  ),
                ),
            ]),
            const SizedBox(height: 16),

            // Existing entries list
            if (hasEntries) ...[
              Text(
                'LOGGED',
                style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: ds.textMuted,
                    letterSpacing: 0.8),
              ),
              const SizedBox(height: 8),
              for (final e in widget.existingEntries) ...[
                _ExistingEntryTile(
                  entry:    e,
                  loading:  _loading,
                  onDelete: () => _deleteEntry(
                    (e['ROWID'] ?? e['id'] ?? '').toString(),
                  ),
                ),
                const SizedBox(height: 6),
              ],
              const SizedBox(height: 12),
            ],

            // Add-more toggle
            if (!_showAddForm && hasEntries)
              GestureDetector(
                onTap: () => setState(() => _showAddForm = true),
                child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 12),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.07),
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                        color: AppColors.primary.withOpacity(0.2)),
                  ),
                  child: const Row(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.add_rounded,
                          size: 16, color: AppColors.primaryLight),
                      SizedBox(width: 6),
                      Text(
                        'Log More Hours',
                        style: TextStyle(
                            fontSize: 13,
                            fontWeight: FontWeight.w600,
                            color: AppColors.primaryLight),
                      ),
                    ],
                  ),
                ),
              ),

            if (_showAddForm) ...[
              if (hasEntries) ...[
                Text(
                  'ADD MORE',
                  style: TextStyle(
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                      color: ds.textMuted,
                      letterSpacing: 0.8),
                ),
                const SizedBox(height: 8),
              ],
              TextField(
                controller: _hoursCtrl,
                keyboardType:
                    const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(
                  labelText: 'Hours *',
                  prefixIcon: Icon(Icons.access_time_rounded),
                  suffixText: 'hrs',
                ),
              ),
              const SizedBox(height: 10),
              TextField(
                controller: _descCtrl,
                decoration: const InputDecoration(
                    labelText: 'What did you work on? (optional)'),
                maxLines: 2,
                textCapitalization: TextCapitalization.sentences,
              ),
              const SizedBox(height: 10),
              Row(children: [
                Switch(
                  value: _billable,
                  activeColor: AppColors.ragGreen,
                  onChanged: (v) => setState(() => _billable = v),
                ),
                const SizedBox(width: 6),
                Text(
                  'Billable',
                  style: TextStyle(
                      color: ds.textPrimary,
                      fontWeight: FontWeight.w600,
                      fontSize: 13),
                ),
              ]),
              if (_error != null) ...[
                const SizedBox(height: 6),
                Text(_error!,
                    style: const TextStyle(
                        color: AppColors.error, fontSize: 12)),
              ],
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  onPressed: _loading ? null : _submit,
                  child: _loading
                      ? const SizedBox(
                          width: 20, height: 20,
                          child: CircularProgressIndicator(
                              color: Colors.white, strokeWidth: 2))
                      : const Text('Save Entry'),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ExistingEntryTile extends StatelessWidget {
  const _ExistingEntryTile({
    required this.entry,
    required this.onDelete,
    required this.loading,
  });
  final Map<String, dynamic> entry;
  final VoidCallback onDelete;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    final ds     = context.ds;
    final hrs    = (entry['hours'] as num? ?? 0).toDouble();
    final desc   = entry['description'] as String? ?? '';
    final bill   = entry['isBillable'] as bool? ?? false;
    final status = entry['status'] as String? ?? 'DRAFT';

    final statusColor = switch (status) {
      'APPROVED'  => AppColors.ragGreen,
      'SUBMITTED' => AppColors.warning,
      'REJECTED'  => AppColors.error,
      _           => AppColors.info,
    };

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ds.bgElevated,
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: ds.border),
      ),
      child: Row(children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(children: [
                Text(
                  _fmtHrs(hrs),
                  style: const TextStyle(
                      fontSize: 14,
                      fontWeight: FontWeight.w800,
                      color: AppColors.primaryLight),
                ),
                const SizedBox(width: 8),
                if (bill)
                  const Text('\$ Bill',
                      style: TextStyle(
                          fontSize: 10,
                          color: AppColors.ragGreen,
                          fontWeight: FontWeight.w600)),
                const Spacer(),
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: statusColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    status,
                    style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: statusColor),
                  ),
                ),
              ]),
              if (desc.isNotEmpty) ...[
                const SizedBox(height: 4),
                Text(desc,
                    style:
                        TextStyle(fontSize: 11, color: ds.textMuted),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis),
              ],
            ],
          ),
        ),
        if (status == 'DRAFT') ...[
          const SizedBox(width: 8),
          GestureDetector(
            onTap: loading ? null : onDelete,
            child: Padding(
              padding: const EdgeInsets.all(4),
              child: Icon(
                Icons.delete_outline_rounded,
                size: 18,
                color: AppColors.error.withOpacity(0.7),
              ),
            ),
          ),
        ],
      ]),
    );
  }
}

// ── Add weekly row sheet ──────────────────────────────────────────────────────

class _AddWeeklyRowSheet extends ConsumerStatefulWidget {
  const _AddWeeklyRowSheet({
    required this.weekStart,
    required this.weekEnd,
    required this.onAdded,
  });
  final DateTime weekStart, weekEnd;
  final VoidCallback onAdded;

  @override
  ConsumerState<_AddWeeklyRowSheet> createState() =>
      _AddWeeklyRowSheetState();
}

class _AddWeeklyRowSheetState extends ConsumerState<_AddWeeklyRowSheet> {
  String? _projectId;
  String? _taskId;
  String? _taskName;
  final _descCtrl     = TextEditingController();
  bool _billable      = false;
  bool _loading       = false;
  String? _error;
  final _dayControllers =
      List.generate(7, (_) => TextEditingController());

  static const _dayAbbrs  = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

  @override
  void dispose() {
    _descCtrl.dispose();
    for (final c in _dayControllers) c.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    final entries = <({DateTime date, double hours})>[];
    for (var i = 0; i < 7; i++) {
      final raw = _dayControllers[i].text.trim();
      if (raw.isEmpty) continue;
      final h = double.tryParse(raw);
      if (h == null || h <= 0 || h > 24) {
        setState(
            () => _error = '${_dayAbbrs[i]}: enter valid hours (0.5–24)');
        return;
      }
      entries.add((
        date:  widget.weekStart.add(Duration(days: i)),
        hours: h,
      ));
    }
    if (entries.isEmpty) {
      setState(() => _error = 'Enter hours for at least one day');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      for (final e in entries) {
        await ApiClient.instance.post(
          '${AppConstants.baseTime}/entries',
          data: {
            'entry_date':  DateFormat('yyyy-MM-dd').format(e.date),
            'hours':       e.hours,
            'is_billable': _billable,
            if (_projectId?.isNotEmpty == true) 'project_id': _projectId,
            if (_taskId?.isNotEmpty == true)    'task_id':    _taskId,
            if (_descCtrl.text.trim().isNotEmpty)
              'description': _descCtrl.text.trim(),
          },
        );
      }
      widget.onAdded();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() { _loading = false; _error = e.toString(); });
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final projects = ref.watch(projectsProvider);
    final fmt      = DateFormat('d MMM');
    final todayStr = DateFormat('yyyy-MM-dd').format(DateTime.now());

    return Container(
      decoration: BoxDecoration(
        color: ds.bgPage,
        borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      padding: EdgeInsets.only(
        left: 20, right: 20, top: 20,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
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
            const SizedBox(height: 16),

            Text(
              'Add Project Row',
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: ds.textPrimary),
            ),
            Text(
              '${fmt.format(widget.weekStart)} – ${fmt.format(widget.weekEnd)}, ${widget.weekEnd.year}',
              style: TextStyle(fontSize: 12, color: ds.textMuted),
            ),
            const SizedBox(height: 20),

            // Project selector
            projects.when(
              data: (list) => DropdownButtonFormField<String>(
                value: _projectId,
                decoration:
                    const InputDecoration(labelText: 'Project (optional)'),
                items: list
                    .map((p) => DropdownMenuItem(
                          value: p.id,
                          child: Text(p.name,
                              overflow: TextOverflow.ellipsis),
                        ))
                    .toList(),
                onChanged: (v) => setState(() {
                  _projectId = v;
                  _taskId    = null;
                  _taskName  = null;
                }),
                dropdownColor: ds.bgElevated,
              ),
              loading: () => const LinearProgressIndicator(),
              error:   (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 12),

            // Task / Issue picker
            _TaskPickerField(
              projectId: _projectId,
              taskName:  _taskName,
              onSelect:  () => showModalBottomSheet(
                context:   context,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => _TaskPickerSheet(
                  projectId: _projectId!,
                  onSelect:  (t) => setState(() {
                    _taskId   = t.id;
                    _taskName = t.title;
                  }),
                ),
              ),
              onClear: () =>
                  setState(() { _taskId = null; _taskName = null; }),
            ),
            const SizedBox(height: 14),

            TextField(
              controller: _descCtrl,
              decoration: const InputDecoration(
                  labelText: 'Notes (optional)'),
              maxLines: 1,
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 16),

            Text(
              'HOURS PER DAY',
              style: TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: ds.textMuted,
                  letterSpacing: 0.8),
            ),
            const SizedBox(height: 10),

            // 7 day inputs
            for (var i = 0; i < 7; i++) ...[
              Builder(builder: (ctx) {
                final dt      = widget.weekStart.add(Duration(days: i));
                final label   = '${_dayAbbrs[i]} ${dt.day}';
                final isToday = DateFormat('yyyy-MM-dd').format(dt) == todayStr;

                return Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(children: [
                    SizedBox(
                      width: 58,
                      child: Text(
                        label,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: isToday
                              ? AppColors.info
                              : ds.textSecondary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: TextField(
                        controller: _dayControllers[i],
                        keyboardType:
                            const TextInputType.numberWithOptions(decimal: true),
                        decoration: InputDecoration(
                          hintText: '0',
                          suffixText: 'h',
                          isDense: true,
                          contentPadding: const EdgeInsets.symmetric(
                              horizontal: 12, vertical: 10),
                          enabledBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: BorderSide(
                              color: isToday
                                  ? AppColors.info.withOpacity(0.4)
                                  : ds.border,
                            ),
                          ),
                          focusedBorder: OutlineInputBorder(
                            borderRadius: BorderRadius.circular(10),
                            borderSide: const BorderSide(
                                color: AppColors.primaryLight, width: 1.5),
                          ),
                        ),
                      ),
                    ),
                  ]),
                );
              }),
            ],

            const SizedBox(height: 4),

            Row(children: [
              Switch(
                value: _billable,
                activeColor: AppColors.ragGreen,
                onChanged: (v) => setState(() => _billable = v),
              ),
              const SizedBox(width: 6),
              Text(
                'Billable hours',
                style: TextStyle(
                    color: ds.textPrimary,
                    fontWeight: FontWeight.w600,
                    fontSize: 13),
              ),
            ]),

            if (_error != null) ...[
              const SizedBox(height: 6),
              Text(_error!,
                  style: const TextStyle(
                      color: AppColors.error, fontSize: 12)),
            ],
            const SizedBox(height: 16),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(
                        width: 20, height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : const Text('Save Weekly Log'),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Analytics tab ─────────────────────────────────────────────────────────────

enum _Period { week, month, overall }

class _AnalyticsTab extends ConsumerStatefulWidget {
  const _AnalyticsTab();

  @override
  ConsumerState<_AnalyticsTab> createState() => _AnalyticsTabState();
}

class _AnalyticsTabState extends ConsumerState<_AnalyticsTab> {
  _Period _period = _Period.week;

  ({String? from, String? to}) get _rangeParams {
    final now = DateTime.now();
    if (_period == _Period.month) {
      final from = DateTime(now.year, now.month, 1);
      final to   = DateTime(now.year, now.month + 1, 0);
      return (from: DateFormat('yyyy-MM-dd').format(from), to: DateFormat('yyyy-MM-dd').format(to));
    }
    return (from: null, to: null);
  }

  @override
  Widget build(BuildContext context) {
    final ds          = context.ds;
    final weekAsync   = ref.watch(_myWeekSummaryProvider);
    final rangeAsync  = ref.watch(_entriesRangeProvider(_rangeParams));
    final projectsAsync = ref.watch(projectsProvider);

    final Map<String, String> projectMap = {};
    projectsAsync.whenData((list) {
      for (final p in list) { projectMap[p.id] = p.name; }
    });

    final isLoading = _period == _Period.week ? weekAsync.isLoading : rangeAsync.isLoading;

    // Compute stats
    List<Map<String, dynamic>> entries = [];
    double totalHours = 0, billableHours = 0;
    int daysLogged = 0;
    List<Map<String, dynamic>> days = [];

    if (_period == _Period.week) {
      weekAsync.whenData((s) {
        entries      = (s['entries'] as List).cast();
        totalHours   = s['totalHours'] as double;
        billableHours = s['billableHours'] as double;
        daysLogged   = s['daysLogged'] as int;
        days         = (s['days'] as List).cast();
      });
    } else {
      rangeAsync.whenData((list) {
        entries = list;
        for (final e in entries) {
          final h = (e['hours'] as num? ?? 0).toDouble();
          totalHours   += h;
          if (e['isBillable'] == true) billableHours += h;
        }
        final uniqueDays = entries.map((e) => e['date'] as String).toSet();
        daysLogged = uniqueDays.length;

        // Build day list for month
        if (_period == _Period.month) {
          final now  = DateTime.now();
          final daysInMonth = DateTime(now.year, now.month + 1, 0).day;
          final Map<String, List<Map<String, dynamic>>> byDate = {};
          for (final e in entries) { (byDate[e['date'] as String] ??= []).add(e); }
          days = List.generate(daysInMonth, (i) {
            final dt  = DateTime(now.year, now.month, i + 1);
            final key = DateFormat('yyyy-MM-dd').format(dt);
            final de  = byDate[key] ?? [];
            final h   = de.fold(0.0, (s, e) => s + (e['hours'] as num? ?? 0).toDouble());
            return {'date': key, 'hours': h, 'entries': de};
          });
        }
      });
    }

    final nonBillable    = (totalHours - billableHours).clamp(0.0, double.infinity);
    final maxDayHours    = days.isEmpty ? 8.0 : days.fold<double>(8.0, (m, d) => (d['hours'] as double) > m ? d['hours'] as double : m);
    final todayStr       = DateFormat('yyyy-MM-dd').format(DateTime.now());
    final billRatio      = totalHours > 0 ? billableHours / totalHours : 0.0;

    // Per-project aggregation
    final Map<String, ({String name, double total, double billable, int count})> projAgg = {};
    for (final e in entries) {
      final pid      = e['projectId'] as String? ?? '';
      final rawName  = e['projectName'] as String? ?? '';
      final name     = rawName.isNotEmpty ? rawName : (projectMap[pid] ?? pid);
      final h    = (e['hours'] as num? ?? 0).toDouble();
      final bill = e['isBillable'] as bool? ?? false;
      final prev = projAgg[pid];
      projAgg[pid] = (
        name:     prev?.name ?? name,
        total:    (prev?.total ?? 0) + h,
        billable: (prev?.billable ?? 0) + (bill ? h : 0),
        count:    (prev?.count ?? 0) + 1,
      );
    }
    final byProject = projAgg.values.toList()..sort((a, b) => b.total.compareTo(a.total));
    final maxProjHours = byProject.isEmpty ? 1.0 : byProject.first.total;

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(_myWeekSummaryProvider);
        ref.invalidate(_entriesRangeProvider);
      },
      color: AppColors.primaryLight,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
        children: [
          // Period switcher
          Container(
            decoration: BoxDecoration(
              color: ds.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: ds.border),
            ),
            padding: const EdgeInsets.all(4),
            child: Row(
              children: _Period.values.map((p) {
                final selected = p == _period;
                final label = p == _Period.week ? 'This Week' : p == _Period.month ? 'This Month' : 'Overall';
                return Expanded(
                  child: GestureDetector(
                    onTap: () => setState(() => _period = p),
                    child: AnimatedContainer(
                      duration: 200.ms,
                      padding: const EdgeInsets.symmetric(vertical: 8),
                      decoration: BoxDecoration(
                        color: selected ? AppColors.primary : Colors.transparent,
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Text(
                        label,
                        textAlign: TextAlign.center,
                        style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: selected ? Colors.white : ds.textMuted,
                        ),
                      ),
                    ),
                  ),
                );
              }).toList(),
            ),
          ).animate().fadeIn(),
          const SizedBox(height: 16),

          if (isLoading)
            ...List.generate(3, (_) => const ShimmerCard())
          else ...[
            // Stat cards
            Row(children: [
              Expanded(child: _StatCard(value: '${_fmt(totalHours)}h',    label: 'Total',        icon: Icons.access_time_rounded,  color: AppColors.primaryLight)),
              const SizedBox(width: 8),
              Expanded(child: _StatCard(value: '${_fmt(billableHours)}h', label: 'Billable',     icon: Icons.attach_money_rounded, color: AppColors.ragGreen)),
            ]),
            const SizedBox(height: 8),
            Row(children: [
              Expanded(child: _StatCard(value: '${_fmt(nonBillable)}h',   label: 'Non-Billable', icon: Icons.money_off_rounded,    color: AppColors.warning)),
              const SizedBox(width: 8),
              Expanded(child: _StatCard(value: '$daysLogged',             label: 'Days Logged',  icon: Icons.calendar_today_rounded, color: AppColors.info)),
            ]),
            const SizedBox(height: 16),

            // Day breakdown bar chart (week always, month condensed)
            if (days.isNotEmpty) ...[
              _SectionCard(
                title: _period == _Period.week ? 'This Week'
                    : _period == _Period.month ? DateFormat('MMMM yyyy').format(DateTime.now())
                    : 'Day Breakdown',
                child: _period == _Period.week
                    ? _WeekBarChart(days: days, maxY: maxDayHours)
                    : _MonthDayList(days: days, maxHours: maxDayHours, todayStr: todayStr),
              ),
              const SizedBox(height: 16),
            ],

            // By project breakdown
            if (byProject.isNotEmpty)
              _SectionCard(
                title: 'By Project (${byProject.length})',
                child: Column(
                  children: [
                    // Scrollable list capped at ~280dp
                    ConstrainedBox(
                      constraints: const BoxConstraints(maxHeight: 280),
                      child: ListView.separated(
                        shrinkWrap: true,
                        physics: const ClampingScrollPhysics(),
                        itemCount: byProject.length,
                        separatorBuilder: (_, __) => const SizedBox(height: 10),
                        itemBuilder: (_, i) {
                          final p       = byProject[i];
                          final pct     = maxProjHours > 0 ? p.total / maxProjHours : 0.0;
                          final billPct = p.total > 0 ? (p.billable / p.total * 100).round() : 0;
                          return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Expanded(
                                child: Text(
                                  p.name.isNotEmpty ? p.name : 'Unknown',
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: ds.textPrimary),
                                  maxLines: 1, overflow: TextOverflow.ellipsis,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Text('$billPct% bill', style: TextStyle(fontSize: 10, color: ds.textMuted)),
                              const SizedBox(width: 6),
                              Text('${_fmt(p.total)}h', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: ds.textPrimary)),
                            ]),
                            const SizedBox(height: 4),
                            ClipRRect(
                              borderRadius: BorderRadius.circular(4),
                              child: LinearProgressIndicator(
                                value: pct.clamp(0.0, 1.0),
                                minHeight: 5,
                                backgroundColor: ds.border,
                                valueColor: const AlwaysStoppedAnimation(AppColors.primaryLight),
                              ),
                            ),
                            const SizedBox(height: 2),
                            Text('${p.count} entr${p.count == 1 ? "y" : "ies"}', style: TextStyle(fontSize: 10, color: ds.textMuted)),
                          ]);
                        },
                      ),
                    ),
                    // Billable ratio summary
                    if (totalHours > 0) ...[
                      const Divider(height: 20),
                      Row(children: [
                        Text('Billable ratio', style: TextStyle(fontSize: 12, color: ds.textSecondary)),
                        const Spacer(),
                        Text('${(billRatio * 100).round()}%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: ds.textPrimary)),
                      ]),
                      const SizedBox(height: 6),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: billRatio.clamp(0.0, 1.0),
                          minHeight: 6,
                          backgroundColor: ds.border,
                          valueColor: const AlwaysStoppedAnimation(AppColors.ragGreen),
                        ),
                      ),
                    ],
                  ],
                ),
              ),

            // Overall: entries list (first 50)
            if (_period == _Period.overall && entries.isNotEmpty) ...[
              const SizedBox(height: 16),
              _SectionCard(
                title: 'All Entries (${entries.length})',
                child: Column(
                  children: entries.take(50).map((e) => _TimeEntryCard(e)).toList(),
                ),
              ),
              if (entries.length > 50)
                Padding(
                  padding: const EdgeInsets.only(top: 8),
                  child: Text(
                    'Showing 50 of ${entries.length} entries. Filter by project on My Entries tab.',
                    style: TextStyle(fontSize: 11, color: ds.textMuted),
                    textAlign: TextAlign.center,
                  ),
                ),
            ],
          ],
        ],
      ),
    );
  }

  String _fmt(double v) => (v * 10).round() / 10 == v.roundToDouble()
      ? v.toStringAsFixed(1)
      : v.toStringAsFixed(1);
}

// ── Week bar chart ─────────────────────────────────────────────────────────────

class _WeekBarChart extends StatelessWidget {
  const _WeekBarChart({required this.days, required this.maxY});
  final List<Map<String, dynamic>> days;
  final double maxY;

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final todayStr = DateFormat('yyyy-MM-dd').format(DateTime.now());
    const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

    // Scale the y-axis to the actual data with a sensible floor (so a quiet
    // week still renders a readable 8h ceiling) and *no* fixed upper cap
    // (the old clamp(8, 16) caused tall bars to overflow the chart bounds
    // and bleed into the cards above whenever a day exceeded 16h — which
    // happens with imported/summary entries or anyone logging >2 daily).
    final chartMaxY = (maxY + 1).clamp(8.0, double.infinity);
    return SizedBox(
      height: 140,
      // ClipRect contains anything that might still render past the chart's
      // box (gradient fringes, tooltip overflow). Belt-and-braces with the
      // maxY fix above.
      child: ClipRect(child: BarChart(
        BarChartData(
          alignment: BarChartAlignment.spaceAround,
          maxY: chartMaxY,
          barTouchData: BarTouchData(
            touchTooltipData: BarTouchTooltipData(
              getTooltipItem: (group, _, rod, __) {
                final h = rod.toY;
                return h > 0
                    ? BarTooltipItem('${h.toStringAsFixed(1)}h',
                        const TextStyle(color: Colors.white, fontSize: 11, fontWeight: FontWeight.w600))
                    : null;
              },
            ),
          ),
          titlesData: FlTitlesData(
            show: true,
            bottomTitles: AxisTitles(
              sideTitles: SideTitles(
                showTitles: true,
                getTitlesWidget: (val, _) {
                  final idx  = val.toInt();
                  final date = idx < days.length ? days[idx]['date'] as String : '';
                  final isToday = date == todayStr;
                  return Text(
                    dayLabels[idx.clamp(0, 6)],
                    style: TextStyle(
                      fontSize: 11,
                      fontWeight: isToday ? FontWeight.w800 : FontWeight.normal,
                      color: isToday ? AppColors.primary : ds.textMuted,
                    ),
                  );
                },
              ),
            ),
            leftTitles:  const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            topTitles:   const AxisTitles(sideTitles: SideTitles(showTitles: false)),
            rightTitles: const AxisTitles(sideTitles: SideTitles(showTitles: false)),
          ),
          gridData:   const FlGridData(show: false),
          borderData: FlBorderData(show: false),
          barGroups: List.generate(days.length, (i) {
            final date    = days[i]['date'] as String;
            final h       = (days[i]['hours'] as num? ?? 0).toDouble();
            final isToday = date == todayStr;
            return BarChartGroupData(
              x: i,
              barRods: [
                BarChartRodData(
                  toY: h,
                  width: 22,
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(6)),
                  gradient: LinearGradient(
                    colors: isToday
                        ? [AppColors.primary, AppColors.primaryLight]
                        : [AppColors.primaryLight.withOpacity(0.5), AppColors.primaryLight.withOpacity(0.3)],
                    begin: Alignment.bottomCenter,
                    end: Alignment.topCenter,
                  ),
                ),
              ],
            );
          }),
        ),
      )),
    );
  }
}

// ── Month day list ─────────────────────────────────────────────────────────────

class _MonthDayList extends StatelessWidget {
  const _MonthDayList({required this.days, required this.maxHours, required this.todayStr});
  final List<Map<String, dynamic>> days;
  final double maxHours;
  final String todayStr;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    // Only show days with hours or today
    final relevant = days.where((d) => (d['hours'] as double) > 0 || d['date'] == todayStr).toList();
    if (relevant.isEmpty) {
      return Center(child: Padding(
        padding: const EdgeInsets.symmetric(vertical: 16),
        child: Text('No entries this month', style: TextStyle(color: ds.textMuted, fontSize: 13)),
      ));
    }
    return Column(
      children: relevant.map((d) {
        final date    = d['date'] as String;
        final h       = (d['hours'] as double);
        final pct     = maxHours > 0 ? (h / maxHours).clamp(0.0, 1.0) : 0.0;
        final isToday = date == todayStr;
        DateTime? dt;
        try { dt = DateTime.parse(date); } catch (_) {}
        final label = dt != null ? DateFormat('d EEE').format(dt) : date;

        return Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(children: [
            SizedBox(
              width: 48,
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: isToday ? FontWeight.w700 : FontWeight.normal,
                  color: isToday ? AppColors.primary : ds.textMuted,
                ),
              ),
            ),
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(3),
                child: LinearProgressIndicator(
                  value: pct,
                  minHeight: 8,
                  backgroundColor: ds.border,
                  valueColor: AlwaysStoppedAnimation(
                    h >= 8 ? AppColors.ragGreen : AppColors.primaryLight,
                  ),
                ),
              ),
            ),
            const SizedBox(width: 8),
            SizedBox(
              width: 36,
              child: Text(
                h > 0 ? '${h.toStringAsFixed(1)}h' : '—',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: ds.textPrimary),
                textAlign: TextAlign.right,
              ),
            ),
          ]),
        );
      }).toList(),
    );
  }
}

// ── Section card ──────────────────────────────────────────────────────────────

class _SectionCard extends StatelessWidget {
  const _SectionCard({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ds.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: ds.textPrimary)),
        const SizedBox(height: 12),
        child,
      ]),
    );
  }
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _TotalHoursCard extends StatelessWidget {
  const _TotalHoursCard({required this.totalHours, required this.count});
  final double totalHours;
  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF4F46E5), Color(0xFF6366F1)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(children: [
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(totalHours.toStringAsFixed(1),
              style: const TextStyle(fontSize: 40, fontWeight: FontWeight.w900, color: Colors.white, height: 1)),
          const Text('hours this week', style: TextStyle(color: Colors.white70, fontSize: 13)),
        ]),
        const Spacer(),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.15),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(children: [
            Text('$count', style: const TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: Colors.white)),
            const Text('entries', style: TextStyle(color: Colors.white70, fontSize: 11)),
          ]),
        ),
      ]),
    );
  }
}

class _DateHeader extends StatelessWidget {
  const _DateHeader(this.dateStr);
  final String dateStr;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    DateTime? date;
    try { date = DateTime.parse(dateStr); } catch (_) {}
    final label = date != null ? DateFormat('EEEE, d MMM').format(date) : dateStr;
    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text(label,
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: ds.textMuted, letterSpacing: 0.5)),
    );
  }
}

class _TimeEntryCard extends StatelessWidget {
  const _TimeEntryCard(this.entry);
  final Map<String, dynamic> entry;

  Color get _statusColor => switch (entry['status'] as String? ?? 'DRAFT') {
    'APPROVED'  => AppColors.ragGreen,
    'SUBMITTED' => AppColors.info,
    'REJECTED'  => AppColors.error,
    _           => AppColors.textMuted,
  };

  @override
  Widget build(BuildContext context) {
    final ds     = context.ds;
    final hours  = (entry['hours'] as num? ?? 0).toDouble();
    final desc   = entry['description'] as String? ?? '';
    final task   = entry['taskName']    as String? ?? '';
    final proj   = entry['projectName'] as String? ?? '';
    final status = entry['status'] as String? ?? 'DRAFT';
    final bill   = entry['isBillable'] as bool? ?? false;

    // Task column pattern (matches web `MyTimeLogTab`): task name in bold on
    // top, description below as secondary text. Fall back to description-only
    // when no task is set on the entry.
    final hasTask = task.isNotEmpty;
    final primary = hasTask ? task : (desc.isNotEmpty ? desc : 'No description');

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ds.border),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 50, height: 50,
          decoration: BoxDecoration(
            color: AppColors.primary.withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Text(
              '${hours.toStringAsFixed(1)}h',
              style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: AppColors.primaryLight),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            if (proj.isNotEmpty)
              Text(proj, style: TextStyle(fontSize: 11, color: AppColors.primaryLight, fontWeight: FontWeight.w600)),
            Text(
              primary,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: ds.textPrimary),
              maxLines: 1, overflow: TextOverflow.ellipsis,
            ),
            if (hasTask && desc.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(top: 2),
                child: Text(
                  desc,
                  style: TextStyle(fontSize: 11, color: ds.textMuted),
                  maxLines: 1, overflow: TextOverflow.ellipsis,
                ),
              ),
            const SizedBox(height: 4),
            Row(children: [
              if (bill)
                _Chip(label: 'Billable', color: AppColors.ragGreen),
              const SizedBox(width: 4),
              _Chip(label: status, color: _statusColor),
            ]),
          ]),
        ),
      ]),
    );
  }
}

class _Chip extends StatelessWidget {
  const _Chip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(label, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard({required this.value, required this.label, required this.icon, required this.color});
  final String value;
  final String label;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Icon(icon, color: color, size: 18),
        const SizedBox(height: 6),
        Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color)),
        Text(label, style: TextStyle(fontSize: 10, color: ds.textMuted)),
      ]),
    );
  }
}

class _EmptyState extends StatelessWidget {
  const _EmptyState();

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.access_time_outlined, size: 56, color: ds.textMuted),
        const SizedBox(height: 12),
        Text('No time entries this week', style: TextStyle(color: ds.textMuted)),
        const SizedBox(height: 8),
        Text('Tap + to log your time', style: TextStyle(color: ds.textMuted, fontSize: 12)),
      ]),
    );
  }
}

// ── Task / Issue picker ───────────────────────────────────────────────────────

/// Tappable field that opens a searchable task-picker bottom sheet.
class _TaskPickerField extends StatelessWidget {
  const _TaskPickerField({
    required this.projectId,
    required this.taskName,
    required this.onSelect,
    required this.onClear,
  });
  final String? projectId;
  final String? taskName;
  final VoidCallback onSelect;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final ds         = context.ds;
    final hasProject = projectId?.isNotEmpty == true;
    final hasTask    = taskName?.isNotEmpty == true;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      Text(
        'Task / Issue',
        style: TextStyle(
            fontSize: 11,
            color: ds.textMuted,
            fontWeight: FontWeight.w600,
            letterSpacing: 0.5),
      ),
      const SizedBox(height: 4),
      GestureDetector(
        onTap: hasProject ? onSelect : null,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
          decoration: BoxDecoration(
            color: ds.bgInput,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(
              color: hasTask
                  ? AppColors.primaryLight.withOpacity(0.45)
                  : ds.border,
            ),
          ),
          child: Row(children: [
            Icon(
              hasTask ? Icons.task_alt_rounded : Icons.search_rounded,
              size: 18,
              color: hasTask ? AppColors.primaryLight : ds.textMuted,
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                hasTask
                    ? taskName!
                    : (hasProject
                        ? 'Search tasks & issues…'
                        : 'Select a project first'),
                style: TextStyle(
                  color: hasTask ? ds.textPrimary : ds.textMuted,
                  fontWeight:
                      hasTask ? FontWeight.w600 : FontWeight.w400,
                  fontSize: 14,
                ),
                overflow: TextOverflow.ellipsis,
              ),
            ),
            if (hasTask)
              GestureDetector(
                behavior: HitTestBehavior.opaque,
                onTap: onClear,
                child: Padding(
                  padding: const EdgeInsets.only(left: 8),
                  child: Icon(Icons.close_rounded,
                      size: 16, color: ds.textMuted),
                ),
              ),
          ]),
        ),
      ),
    ]);
  }
}

class _TaskPickerSheet extends ConsumerStatefulWidget {
  const _TaskPickerSheet({
    required this.projectId,
    required this.onSelect,
  });
  final String projectId;
  final ValueChanged<SprintTask> onSelect;

  @override
  ConsumerState<_TaskPickerSheet> createState() => _TaskPickerSheetState();
}

class _TaskPickerSheetState extends ConsumerState<_TaskPickerSheet> {
  final _searchCtrl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds      = context.ds;
    final async   = ref.watch(_projectTasksProvider(widget.projectId));
    final tasksAsync = async.whenData((all) => _query.isEmpty
        ? all
        : all.where((t) =>
            t.title.toLowerCase().contains(_query.toLowerCase())).toList());

    return Container(
      decoration: BoxDecoration(
        color: ds.bgPage,
        borderRadius:
            const BorderRadius.vertical(top: Radius.circular(24)),
      ),
      constraints: BoxConstraints(
        maxHeight: MediaQuery.of(context).size.height * 0.75,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12),
              width: 36, height: 4,
              decoration: BoxDecoration(
                  color: ds.border,
                  borderRadius: BorderRadius.circular(2)),
            ),
          ),
          // Header + search
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 12),
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
              Text(
                'Select Task / Issue',
                style: TextStyle(
                    fontSize: 17,
                    fontWeight: FontWeight.w800,
                    color: ds.textPrimary),
              ),
              const SizedBox(height: 12),
              TextField(
                controller: _searchCtrl,
                autofocus: true,
                onChanged: (v) => setState(() => _query = v),
                decoration: InputDecoration(
                  hintText: 'Search by name…',
                  prefixIcon:
                      const Icon(Icons.search_rounded, size: 18),
                  suffixIcon: _query.isNotEmpty
                      ? IconButton(
                          icon: const Icon(Icons.close_rounded, size: 16),
                          onPressed: () {
                            _searchCtrl.clear();
                            setState(() => _query = '');
                          },
                        )
                      : null,
                  isDense: true,
                ),
              ),
            ]),
          ),
          Divider(height: 1, color: ds.border),
          // Task list
          Expanded(
            child: tasksAsync.when(
              loading: () => const Center(
                child: CircularProgressIndicator(),
              ),
              error: (e, _) => Center(
                child: Padding(
                  padding: const EdgeInsets.all(24),
                  child: Text('$e',
                      style: const TextStyle(
                          color: AppColors.error, fontSize: 12)),
                ),
              ),
              data: (tasks) => tasks.isEmpty
                  ? Center(
                      child: Column(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                        Icon(Icons.task_alt_rounded,
                            size: 44, color: ds.textMuted),
                        const SizedBox(height: 10),
                        Text(
                          _query.isEmpty
                              ? 'No tasks found for this project'
                              : 'No tasks match "$_query"',
                          style: TextStyle(
                              color: ds.textMuted, fontSize: 13),
                          textAlign: TextAlign.center,
                        ),
                      ]),
                    )
                  : ListView.builder(
                      padding: const EdgeInsets.fromLTRB(16, 10, 16, 24),
                      itemCount: tasks.length,
                      itemBuilder: (_, i) => _TaskTile(
                        task: tasks[i],
                        onTap: () {
                          widget.onSelect(tasks[i]);
                          Navigator.pop(context);
                        },
                      ),
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _TaskTile extends StatelessWidget {
  const _TaskTile({required this.task, required this.onTap});
  final SprintTask task;
  final VoidCallback onTap;

  Color get _statusColor => switch (task.status.toUpperCase()) {
        'DONE'        => AppColors.ragGreen,
        'IN_PROGRESS' => AppColors.info,
        'BLOCKED'     => AppColors.error,
        _             => AppColors.textMuted,
      };

  String get _statusLabel => switch (task.status.toUpperCase()) {
        'IN_PROGRESS' => 'In Progress',
        'DONE'        => 'Done',
        'BLOCKED'     => 'Blocked',
        _             => 'To Do',
      };

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(13),
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: ds.border),
        ),
        child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Container(
            width: 7, height: 7,
            margin: const EdgeInsets.only(right: 10, top: 4),
            decoration: BoxDecoration(
                color: _statusColor, shape: BoxShape.circle),
          ),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  task.title,
                  style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: ds.textPrimary),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (task.storyPoints != null) ...[
                  const SizedBox(height: 2),
                  Text(
                    '${task.storyPoints} pts',
                    style: TextStyle(fontSize: 10, color: ds.textMuted),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(width: 8),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
            decoration: BoxDecoration(
              color: _statusColor.withOpacity(0.1),
              borderRadius: BorderRadius.circular(999),
            ),
            child: Text(
              _statusLabel,
              style: TextStyle(
                  fontSize: 9,
                  fontWeight: FontWeight.w700,
                  color: _statusColor),
            ),
          ),
        ]),
      ),
    );
  }
}

// ── Add time entry sheet ──────────────────────────────────────────────────────

class _AddTimeEntrySheet extends ConsumerStatefulWidget {
  const _AddTimeEntrySheet({required this.onAdded});
  final VoidCallback onAdded;

  @override
  ConsumerState<_AddTimeEntrySheet> createState() => _AddTimeEntrySheetState();
}

class _AddTimeEntrySheetState extends ConsumerState<_AddTimeEntrySheet> {
  final _hoursCtrl = TextEditingController(text: '8');
  final _descCtrl  = TextEditingController();
  // Date is mandatory (matches web Log Time form). Initialised to today so the
  // field can never be empty — the picker also disallows null returns.
  DateTime? _date = DateTime.now();
  String? _projectId;
  String? _taskId;
  String? _taskName;
  bool _billable          = false;
  bool _sendForApproval   = false;
  bool _loading           = false;
  String? _error;

  @override
  void dispose() {
    _hoursCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final projects = ref.watch(projectsProvider);

    return Padding(
      padding: EdgeInsets.only(
        left: 24, right: 24, top: 24,
        bottom: MediaQuery.viewInsetsOf(context).bottom + 24,
      ),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 36, height: 4,
                decoration: BoxDecoration(color: ds.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 20),
            Text('Log Time', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: ds.textPrimary)),
            const SizedBox(height: 16),

            // Date — required
            Text('Date *', style: TextStyle(fontSize: 11, color: ds.textMuted, fontWeight: FontWeight.w600, letterSpacing: 0.5)),
            const SizedBox(height: 4),
            GestureDetector(
              onTap: _pickDate,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: ds.bgInput,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: _date == null ? AppColors.error : ds.border,
                  ),
                ),
                child: Row(children: [
                  Icon(Icons.calendar_today_rounded, size: 18, color: ds.textMuted),
                  const SizedBox(width: 12),
                  Text(
                    _date != null ? DateFormat('EEE, d MMM yyyy').format(_date!) : 'Select date',
                    style: TextStyle(color: _date != null ? ds.textPrimary : ds.textMuted),
                  ),
                ]),
              ),
            ),
            const SizedBox(height: 12),

            // Hours
            TextField(
              controller: _hoursCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                  labelText: 'Hours *',
                  prefixIcon: Icon(Icons.access_time_rounded),
                  suffixText: 'hrs'),
            ),
            const SizedBox(height: 12),

            // Project
            projects.when(
              data: (list) => DropdownButtonFormField<String>(
                value: _projectId,
                items: list.map((p) => DropdownMenuItem(value: p.id, child: Text(p.name))).toList(),
                onChanged: (v) => setState(() {
                  _projectId = v;
                  // clear task when project changes
                  _taskId = null;
                  _taskName = null;
                }),
                decoration: const InputDecoration(labelText: 'Project (optional)'),
                dropdownColor: ds.bgElevated,
              ),
              loading: () => const LinearProgressIndicator(),
              error:   (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 12),

            // Task / Issue picker
            _TaskPickerField(
              projectId: _projectId,
              taskName:  _taskName,
              onSelect:  () => showModalBottomSheet(
                context:   context,
                isScrollControlled: true,
                backgroundColor: Colors.transparent,
                builder: (_) => _TaskPickerSheet(
                  projectId: _projectId!,
                  onSelect:  (t) => setState(() {
                    _taskId   = t.id;
                    _taskName = t.title;
                  }),
                ),
              ),
              onClear: () => setState(() { _taskId = null; _taskName = null; }),
            ),
            const SizedBox(height: 12),

            // Description
            TextField(
              controller: _descCtrl,
              decoration: const InputDecoration(labelText: 'Notes (optional)'),
              maxLines: 2,
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 12),

            // Billable toggle
            Row(children: [
              Switch(
                value: _billable,
                activeColor: AppColors.ragGreen,
                onChanged: (v) => setState(() => _billable = v),
              ),
              const SizedBox(width: 8),
              Text('Billable hours', style: TextStyle(color: ds.textPrimary, fontWeight: FontWeight.w600)),
            ]),
            const SizedBox(height: 8),

            // Send for approval toggle
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
              decoration: BoxDecoration(
                color: AppColors.info.withOpacity(0.07),
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.info.withOpacity(0.2)),
              ),
              child: Row(children: [
                Icon(Icons.send_rounded, size: 15, color: AppColors.info),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Send for approval',
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: ds.textPrimary)),
                    Text('Manager will be notified to review',
                        style: TextStyle(fontSize: 11, color: ds.textMuted)),
                  ]),
                ),
                Switch(
                  value: _sendForApproval,
                  activeColor: AppColors.info,
                  onChanged: (v) => setState(() => _sendForApproval = v),
                ),
              ]),
            ),

            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 12)),
            ],
            const SizedBox(height: 20),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(width: 20, height: 20,
                        child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2))
                    : Text(_sendForApproval ? 'Log & Send for Approval' : 'Save Entry'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDate() async {
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 90)),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _submit() async {
    if (_date == null) {
      setState(() => _error = 'Date is required');
      return;
    }
    final hours = double.tryParse(_hoursCtrl.text.trim());
    if (hours == null || hours <= 0 || hours > 24) {
      setState(() => _error = 'Enter valid hours (0.5 – 24)');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      final resp = await ApiClient.instance.post(
        '${AppConstants.baseTime}/entries',
        data: {
          'entry_date':  DateFormat('yyyy-MM-dd').format(_date!),
          'hours':       hours,
          'is_billable': _billable,
          if (_projectId != null && _projectId!.isNotEmpty) 'project_id': _projectId,
          if (_taskId != null && _taskId!.isNotEmpty)       'task_id':    _taskId,
          if (_descCtrl.text.trim().isNotEmpty) 'description': _descCtrl.text.trim(),
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
      widget.onAdded();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() { _loading = false; _error = e.toString(); });
    }
  }
}

// ── Approvals tab (managers only) ─────────────────────────────────────────────

class _ApprovalsTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds       = context.ds;
    final approval = ref.watch(_pendingApprovalsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_pendingApprovalsProvider),
      color: AppColors.primaryLight,
      child: approval.when(
        data: (list) => list.isEmpty
            ? Center(
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.approval_rounded, size: 52, color: ds.textMuted),
                  const SizedBox(height: 12),
                  Text('No pending approvals', style: TextStyle(color: ds.textMuted)),
                ]),
              )
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                itemBuilder: (_, i) => _ApprovalCard(
                  entry: list[i] as Map<String, dynamic>,
                  onAction: () => ref.invalidate(_pendingApprovalsProvider),
                ),
              ),
        loading: () => ListView(children: List.generate(3, (_) => const ShimmerCard(height: 90))),
        error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: AppColors.error))),
      ),
    );
  }
}

class _ApprovalCard extends StatefulWidget {
  const _ApprovalCard({required this.entry, required this.onAction});
  final Map<String, dynamic> entry;
  final VoidCallback onAction;

  @override
  State<_ApprovalCard> createState() => _ApprovalCardState();
}

class _ApprovalCardState extends State<_ApprovalCard> {
  bool _acting = false;

  Future<void> _approve() async {
    setState(() => _acting = true);
    try {
      final id = (widget.entry['ROWID'] ?? widget.entry['id'] ?? '').toString();
      await ApiClient.instance.patch('${AppConstants.baseTime}/approvals/$id/approve', data: {});
      widget.onAction();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error));
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  Future<void> _reject() async {
    final reasonCtrl = TextEditingController();
    final confirmed  = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reject Time Entry'),
        content: TextField(controller: reasonCtrl, decoration: const InputDecoration(labelText: 'Reason (optional)'), maxLines: 2),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: const Text('Cancel')),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.error, foregroundColor: Colors.white),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _acting = true);
    try {
      final id = (widget.entry['ROWID'] ?? widget.entry['id'] ?? '').toString();
      await ApiClient.instance.patch('${AppConstants.baseTime}/approvals/$id/reject', data: {'reason': reasonCtrl.text.trim()});
      widget.onAction();
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error));
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds        = context.ds;
    final e         = widget.entry;
    // Backend nests requester info under 'requester' and entry under 'entry'
    final requester = e['requester'] as Map? ?? {};
    final entry     = e['entry']     as Map? ?? {};
    final name      = requester['name']      as String?
                   ?? e['user_name']         as String?
                   ?? e['userName']          as String? ?? 'User';
    final avatarUrl = requester['avatar_url'] as String? ?? requester['avatarUrl'] as String?;
    final proj      = entry['project_name']  as String? ?? entry['projectName']  as String?
                   ?? e['projectName']       as String? ?? '';
    final desc      = entry['description']   as String? ?? e['description'] as String? ?? '';
    final hours     = (entry['hours'] as num? ?? e['hours'] as num? ?? 0).toDouble();
    final date      = _stripDate(entry['entry_date'] as String? ?? e['entry_date'] as String?
                   ?? e['date'] as String? ?? '');
    final bill      = entry['is_billable'] == true || entry['is_billable'] == 'true'
                   || e['is_billable'] == true;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: AppColors.warning.withOpacity(0.3)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          UserAvatar(name: name, avatarUrl: avatarUrl, radius: 18),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: ds.textPrimary)),
            if (proj.isNotEmpty)
              Text(proj, style: TextStyle(fontSize: 11, color: AppColors.primaryLight, fontWeight: FontWeight.w600)),
          ])),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text('${hours.toStringAsFixed(1)}h',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800, color: AppColors.primaryLight)),
            if (bill)
              const Text('\$ Billable', style: TextStyle(fontSize: 10, color: AppColors.success, fontWeight: FontWeight.w600)),
          ]),
        ]),
        if (desc.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(desc, style: TextStyle(fontSize: 12, color: ds.textSecondary), maxLines: 2, overflow: TextOverflow.ellipsis),
        ],
        const SizedBox(height: 8),
        Row(children: [
          Icon(Icons.calendar_today_rounded, size: 12, color: ds.textMuted),
          const SizedBox(width: 4),
          Text(date, style: TextStyle(fontSize: 11, color: ds.textMuted)),
          const Spacer(),
          if (_acting)
            const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2))
          else ...[
            TextButton(
              style: TextButton.styleFrom(foregroundColor: AppColors.error, padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6), minimumSize: Size.zero),
              onPressed: _reject,
              child: const Text('Reject', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
            ),
            const SizedBox(width: 6),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.success, foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
                minimumSize: Size.zero,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: _approve,
              child: const Text('Approve', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
            ),
          ],
        ]),
      ]),
    );
  }
}
