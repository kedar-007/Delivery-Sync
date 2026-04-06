import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/models/models.dart';
import '../../../../shared/widgets/ds_metric_card.dart';
import '../../../auth/providers/auth_provider.dart';
import '../../../dashboard/providers/dashboard_provider.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final _milestonesProvider =
    FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  // Fetch across all projects the user is on
  final projects = await ref.watch(projectsProvider.future);
  final all = <Map<String, dynamic>>[];

  await Future.wait(projects.map((p) async {
    try {
      final raw = await ApiClient.instance.get<Map<String, dynamic>>(
        '${AppConstants.baseCore}/projects/${p.id}/milestones',
        fromJson: (r) => r as Map<String, dynamic>,
      );
      final d = raw['data'];
      final List<dynamic> items;
      if (d is List) {
        items = d;
      } else if (d is Map) {
        items = d['milestones'] as List? ?? d['data'] as List? ?? [];
      } else {
        items = [];
      }
      for (final item in items) {
        final m = Map<String, dynamic>.from(item as Map);
        m['_projectName'] = p.name;
        m['_projectId']   = p.id;
        all.add(m);
      }
    } catch (_) {}
  }));

  // Sort: incomplete first, then by due date
  all.sort((a, b) {
    final aDone = (a['status'] as String? ?? '') == 'COMPLETED';
    final bDone = (b['status'] as String? ?? '') == 'COMPLETED';
    if (aDone != bDone) return aDone ? 1 : -1;
    final aDate = a['dueDate'] as String? ?? a['due_date'] as String? ?? '';
    final bDate = b['dueDate'] as String? ?? b['due_date'] as String? ?? '';
    return aDate.compareTo(bDate);
  });

  return all;
});

// ── Screen ────────────────────────────────────────────────────────────────────

class MilestonesScreen extends ConsumerStatefulWidget {
  const MilestonesScreen({super.key});

  @override
  ConsumerState<MilestonesScreen> createState() => _MilestonesScreenState();
}

class _MilestonesScreenState extends ConsumerState<MilestonesScreen> {
  String _filter = 'ALL';
  static const _filters = ['ALL', 'UPCOMING', 'OVERDUE', 'COMPLETED'];

  @override
  Widget build(BuildContext context) {
    final ds         = context.ds;
    final milestones = ref.watch(_milestonesProvider);

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Milestones'),
        backgroundColor: ds.bgPage,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(_milestonesProvider),
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              children: _filters.map((f) {
                final sel = _filter == f;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    selected: sel,
                    label: Text(_filterLabel(f)),
                    onSelected: (_) => setState(() => _filter = f),
                    selectedColor: AppColors.primaryLight.withOpacity(0.15),
                    checkmarkColor: AppColors.primaryLight,
                    labelStyle: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: sel ? AppColors.primaryLight : ds.textSecondary,
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(_milestonesProvider),
              color: AppColors.primaryLight,
              child: milestones.when(
                data: (list) {
                  final now      = DateTime.now();
                  final filtered = _filter == 'ALL'
                      ? list
                      : list.where((m) {
                          final status = (m['status'] as String? ?? '').toUpperCase();
                          final dueDateStr = m['dueDate'] as String?
                              ?? m['due_date'] as String?;
                          if (_filter == 'COMPLETED') return status == 'COMPLETED';
                          if (status == 'COMPLETED') return false;
                          if (_filter == 'UPCOMING') {
                            if (dueDateStr == null) return true;
                            try {
                              return DateTime.parse(dueDateStr).isAfter(now);
                            } catch (_) { return true; }
                          }
                          if (_filter == 'OVERDUE') {
                            if (dueDateStr == null) return false;
                            try {
                              return DateTime.parse(dueDateStr).isBefore(now);
                            } catch (_) { return false; }
                          }
                          return true;
                        }).toList();

                  if (filtered.isEmpty) {
                    return Center(
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(Icons.flag_rounded, size: 52, color: ds.textMuted),
                        const SizedBox(height: 12),
                        Text('No milestones', style: TextStyle(color: ds.textMuted)),
                        const SizedBox(height: 8),
                        Text('Milestones track key project checkpoints',
                            style: TextStyle(fontSize: 12, color: ds.textMuted),
                            textAlign: TextAlign.center),
                      ]),
                    );
                  }

                  return ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) => _MilestoneCard(filtered[i]),
                  );
                },
                loading: () => ListView(
                  padding: const EdgeInsets.all(16),
                  children: List.generate(5, (_) => const ShimmerCard(height: 110)),
                ),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(Icons.error_outline_rounded, size: 48, color: ds.textMuted),
                      const SizedBox(height: 12),
                      Text('$e',
                          style: const TextStyle(color: AppColors.error, fontSize: 12),
                          textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: () => ref.invalidate(_milestonesProvider),
                        child: const Text('Retry'),
                      ),
                    ]),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }

  static String _filterLabel(String f) => switch (f) {
    'ALL'       => 'All',
    'UPCOMING'  => 'Upcoming',
    'OVERDUE'   => 'Overdue',
    'COMPLETED' => 'Completed',
    _           => f,
  };
}

// ── Milestone card ────────────────────────────────────────────────────────────

class _MilestoneCard extends StatelessWidget {
  const _MilestoneCard(this.milestone);
  final Map<String, dynamic> milestone;

  @override
  Widget build(BuildContext context) {
    final ds          = context.ds;
    final title       = milestone['title']       as String? ?? milestone['name'] as String? ?? '—';
    final description = milestone['description'] as String?;
    final status      = (milestone['status']     as String? ?? 'PENDING').toUpperCase();
    final dueDateStr  = milestone['dueDate']     as String? ?? milestone['due_date'] as String?;
    final projectName = milestone['_projectName'] as String?;
    final progress    = (milestone['progress']   as num? ?? 0).toDouble();

    final now     = DateTime.now();
    DateTime? due;
    try { if (dueDateStr != null) due = DateTime.parse(dueDateStr); } catch (_) {}

    final isComplete = status == 'COMPLETED';
    final isOverdue  = due != null && due.isBefore(now) && !isComplete;
    final daysLeft   = due != null ? due.difference(now).inDays : null;

    final (color, icon) = isComplete
        ? (AppColors.success, Icons.check_circle_rounded)
        : isOverdue
            ? (AppColors.error, Icons.warning_amber_rounded)
            : (AppColors.primaryLight, Icons.flag_rounded);

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.3)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(
                Theme.of(context).brightness == Brightness.dark ? 0.2 : 0.04),
            blurRadius: 8, offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(
                  fontSize: 14, fontWeight: FontWeight.w700, color: ds.textPrimary),
                  maxLines: 2, overflow: TextOverflow.ellipsis),
              if (projectName != null)
                Text(projectName,
                    style: TextStyle(fontSize: 11, color: AppColors.primaryLight,
                        fontWeight: FontWeight.w600)),
            ]),
          ),
          // Status chip
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              isComplete ? 'Done' : isOverdue ? 'Overdue' : 'On Track',
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color),
            ),
          ),
        ]),

        if (description != null && description.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(description,
              style: TextStyle(fontSize: 12, color: ds.textSecondary),
              maxLines: 2, overflow: TextOverflow.ellipsis),
        ],

        // Progress bar
        if (!isComplete && progress > 0) ...[
          const SizedBox(height: 10),
          Row(children: [
            Expanded(
              child: ClipRRect(
                borderRadius: BorderRadius.circular(4),
                child: LinearProgressIndicator(
                  value: progress / 100,
                  backgroundColor: ds.border,
                  color: color,
                  minHeight: 6,
                ),
              ),
            ),
            const SizedBox(width: 8),
            Text('${progress.toInt()}%',
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700, color: color)),
          ]),
        ],

        // Footer row
        const SizedBox(height: 10),
        Row(children: [
          if (due != null) ...[
            Icon(Icons.calendar_today_rounded, size: 12,
                color: isOverdue ? AppColors.error : ds.textMuted),
            const SizedBox(width: 4),
            Text(_fmtDate(due),
                style: TextStyle(fontSize: 11,
                    color: isOverdue ? AppColors.error : ds.textMuted,
                    fontWeight: isOverdue ? FontWeight.w600 : FontWeight.normal)),
          ],
          if (daysLeft != null && !isComplete) ...[
            const SizedBox(width: 10),
            Text(
              daysLeft < 0
                  ? '${daysLeft.abs()}d overdue'
                  : daysLeft == 0
                      ? 'Due today'
                      : '${daysLeft}d left',
              style: TextStyle(
                fontSize: 11,
                color: daysLeft < 0 ? AppColors.error : daysLeft <= 3 ? AppColors.ragAmber : ds.textMuted,
                fontWeight: FontWeight.w600,
              ),
            ),
          ],
        ]),
      ]),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.04);
  }

  static String _fmtDate(DateTime dt) =>
      DateFormat('d MMM yyyy').format(dt);
}
