import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/models/models.dart';
import '../../../../shared/widgets/ds_metric_card.dart';
import '../../../../shared/widgets/user_avatar.dart';
import '../../../auth/providers/auth_provider.dart';
import '../../../teams/presentation/screens/teams_screen.dart' show teamsProvider;

// ─────────────────────────────────────────────────────────────────────────────
//  Providers (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

final _projectDashboardProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>, String>(
        (ref, id) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/dashboard/project/$id',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is Map<String, dynamic>) {
    // API returns stats nested under 'stats' key — flatten into top level
    // so the Overview widgets can read d['totalMembers'] etc. directly.
    final stats = (d['stats'] as Map<String, dynamic>?) ?? {};
    return {...d, ...stats};
  }
  return {};
});

final _projectMembersProvider =
    FutureProvider.autoDispose.family<List<dynamic>, String>((ref, id) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/projects/$id/members',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['members'] as List? ?? d['data'] as List? ?? [];
  return [];
});

final _projectMilestonesProvider =
    FutureProvider.autoDispose.family<List<dynamic>, String>((ref, id) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/projects/$id/milestones',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['milestones'] as List? ?? d['data'] as List? ?? [];
  return [];
});

final _projectActionsProvider =
    FutureProvider.autoDispose.family<List<dynamic>, String>((ref, id) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/actions',
    queryParameters: {'projectId': id},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['actions'] as List? ?? d['data'] as List? ?? [];
  return [];
});

final _projectBlockersProvider =
    FutureProvider.autoDispose.family<List<dynamic>, String>((ref, id) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/blockers',
    queryParameters: {'projectId': id},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['blockers'] as List? ?? d['data'] as List? ?? [];
  return [];
});

// Org-wide user list used by the Add Member picker.
final _allUsersProvider =
    FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/auth/users',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['users'] as List? ?? d['data'] as List? ?? [];
  return [];
});

// ─────────────────────────────────────────────────────────────────────────────
//  Screen
// ─────────────────────────────────────────────────────────────────────────────

class ProjectDetailScreen extends ConsumerStatefulWidget {
  const ProjectDetailScreen({super.key, required this.project});
  final Project project;

  @override
  ConsumerState<ProjectDetailScreen> createState() =>
      _ProjectDetailScreenState();
}

class _ProjectDetailScreenState extends ConsumerState<ProjectDetailScreen>
    with TickerProviderStateMixin {
  late final TabController _tab = TabController(length: 4, vsync: this);

  @override
  void dispose() {
    _tab.dispose();
    super.dispose();
  }

  void _refresh() {
    HapticFeedback.lightImpact();
    ref.invalidate(_projectDashboardProvider(widget.project.id));
    ref.invalidate(_projectMembersProvider(widget.project.id));
    ref.invalidate(_projectMilestonesProvider(widget.project.id));
    ref.invalidate(_projectActionsProvider(widget.project.id));
    ref.invalidate(_projectBlockersProvider(widget.project.id));
  }

  @override
  Widget build(BuildContext context) {
    final ds      = context.ds;
    final project = widget.project;
    final ragColor = _ragColor(project.ragStatus);

    return Scaffold(
      backgroundColor: ds.bgPage,
      body: NestedScrollView(
        headerSliverBuilder: (_, __) => [
          SliverAppBar(
            expandedHeight: 200,
            pinned: true,
            stretch: true,
            backgroundColor: ds.bgCard,
            surfaceTintColor: Colors.transparent,
            elevation: 0,
            scrolledUnderElevation: 1,
            shadowColor: ds.border,
            actions: [
              IconButton(
                icon: Icon(Icons.refresh_rounded, size: 20, color: ds.textSecondary),
                onPressed: _refresh,
              ),
              const SizedBox(width: 4),
            ],
            title: Text(
              project.name,
              style: TextStyle(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: ds.textPrimary,
                letterSpacing: -0.3,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            flexibleSpace: FlexibleSpaceBar(
              collapseMode: CollapseMode.parallax,
              background: _ProjectHeader(project: project, ragColor: ragColor),
            ),
            bottom: PreferredSize(
              preferredSize: const Size.fromHeight(46),
              child: Container(
                color: ds.bgCard,
                child: TabBar(
                  controller: _tab,
                  isScrollable: true,
                  tabAlignment: TabAlignment.start,
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  indicatorWeight: 2.5,
                  indicatorColor: AppColors.primaryLight,
                  labelColor: AppColors.primaryLight,
                  unselectedLabelColor: ds.textMuted,
                  labelStyle: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w600,
                  ),
                  unselectedLabelStyle: const TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w400,
                  ),
                  dividerColor: ds.border,
                  tabs: const [
                    Tab(text: 'Overview'),
                    Tab(text: 'Members'),
                    Tab(text: 'Milestones'),
                    Tab(text: 'Activity'),
                  ],
                ),
              ),
            ),
          ),
        ],
        body: TabBarView(
          controller: _tab,
          children: [
            _OverviewTab(project: project),
            _MembersTab(project: project),
            _MilestonesTab(projectId: project.id),
            _ActivityTab(project: project),
          ],
        ),
      ),
    );
  }

  static Color _ragColor(String rag) => switch (rag) {
        'RED'   => AppColors.ragRed,
        'AMBER' => AppColors.ragAmber,
        _       => AppColors.ragGreen,
      };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Collapsing header background
// ─────────────────────────────────────────────────────────────────────────────

class _ProjectHeader extends StatelessWidget {
  const _ProjectHeader({required this.project, required this.ragColor});
  final Project project;
  final Color ragColor;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            ragColor.withOpacity(0.18),
            ragColor.withOpacity(0.06),
            ds.bgCard,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          stops: const [0.0, 0.5, 1.0],
        ),
      ),
      child: Stack(
        children: [
          // Background decorative circle
          Positioned(
            top: -40,
            right: -40,
            child: Container(
              width: 180,
              height: 180,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: ragColor.withOpacity(0.06),
              ),
            ),
          ),

          Padding(
            padding: const EdgeInsets.fromLTRB(20, 80, 20, 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                // Project name (large, for expanded state)
                Text(
                  project.name,
                  style: TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: ds.textPrimary,
                    letterSpacing: -0.5,
                    height: 1.2,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                const SizedBox(height: 10),
                // Badges row
                Row(children: [
                  _RagPill(rag: project.ragStatus),
                  const SizedBox(width: 8),
                  _StatusPill(status: project.status),
                  if (project.memberCount > 0) ...[
                    const SizedBox(width: 8),
                    _InfoPill(
                      icon: Icons.people_outline_rounded,
                      label: '${project.memberCount} members',
                    ),
                  ],
                ]),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _RagPill extends StatelessWidget {
  const _RagPill({required this.rag});
  final String rag;

  @override
  Widget build(BuildContext context) {
    final color = switch (rag) {
      'RED'   => AppColors.ragRed,
      'AMBER' => AppColors.ragAmber,
      _       => AppColors.ragGreen,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.15),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 7, height: 7,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 5),
        Text(rag,
            style: TextStyle(
                fontSize: 11, fontWeight: FontWeight.w700, color: color)),
      ]),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});
  final String status;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: ds.bgElevated,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: ds.border),
      ),
      child: Text(status,
          style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: ds.textSecondary)),
    );
  }
}

class _InfoPill extends StatelessWidget {
  const _InfoPill({required this.icon, required this.label});
  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: ds.bgElevated,
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: ds.border),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 12, color: ds.textMuted),
        const SizedBox(width: 4),
        Text(label,
            style: TextStyle(fontSize: 11, color: ds.textMuted)),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Overview tab
// ─────────────────────────────────────────────────────────────────────────────

class _OverviewTab extends ConsumerWidget {
  const _OverviewTab({required this.project});
  final Project project;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds        = context.ds;
    final dashboard = ref.watch(_projectDashboardProvider(project.id));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_projectDashboardProvider(project.id)),
      color: AppColors.primaryLight,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
        children: [
          // ── Description card ────────────────────────────────────────
          if (project.description?.isNotEmpty == true) ...[
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: ds.bgCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: ds.border),
              ),
              child: Text(
                project.description!,
                style: TextStyle(fontSize: 14, color: ds.textSecondary, height: 1.6),
              ),
            ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.05),
            const SizedBox(height: 16),
          ],

          // ── Quick nav chips ─────────────────────────────────────────
          _QuickNavChips(projectId: project.id),
          const SizedBox(height: 16),

          // ── KPI stats ───────────────────────────────────────────────
          dashboard.when(
            data: (d) {
              final overdueActions    = d['overdueActions']    ?? 0;
              final criticalBlockers  = d['criticalBlockers']  ?? 0;
              final delayedMilestones = d['delayedMilestones'] ?? 0;
              final totalHours        = d['totalHours']        ?? d['total_hours']       ?? 0;
              final billableHours     = d['billableHours']     ?? d['billable_hours']    ?? 0;
              final nonBillableHours  = d['nonBillableHours']  ?? d['non_billable_hours'] ?? 0;

              String fmt(dynamic v) {
                if (v is double) return v == v.truncateToDouble() ? '${v.toInt()}' : v.toStringAsFixed(1);
                return '$v';
              }

              final stats = [
                _KpiStat(
                  '${d['totalMembers'] ?? d['memberCount'] ?? project.memberCount}',
                  'Members', Icons.group_rounded, AppColors.info,
                ),
                _KpiStat(
                  '${d['openActions'] ?? d['actionsCount'] ?? 0}',
                  'Actions', Icons.task_alt_rounded,
                  overdueActions > 0 ? AppColors.error : AppColors.success,
                  sublabel: overdueActions > 0 ? '$overdueActions overdue' : 'On track',
                ),
                _KpiStat(
                  '${d['openBlockers'] ?? d['blockersCount'] ?? 0}',
                  'Blockers', Icons.block_rounded,
                  criticalBlockers > 0 ? AppColors.error : AppColors.ragAmber,
                  sublabel: criticalBlockers > 0 ? '$criticalBlockers critical' : null,
                ),
                _KpiStat(
                  '${d['totalMilestones'] ?? d['milestoneCount'] ?? 0}',
                  'Milestones', Icons.flag_rounded,
                  delayedMilestones > 0 ? AppColors.error : AppColors.success,
                  sublabel: delayedMilestones > 0 ? '$delayedMilestones delayed' : 'On track',
                ),
                _KpiStat(
                  '${d['totalStandups'] ?? 0}',
                  'Standups (7d)', Icons.bar_chart_rounded, const Color(0xFF7c3aed),
                ),
                _KpiStat(
                  '${d['taskCount'] ?? 0}',
                  'Total Tasks', Icons.checklist_rounded, AppColors.info,
                ),
                _KpiStat(
                  fmt(billableHours),
                  'Billable Hrs', Icons.access_time_rounded, AppColors.success,
                  sublabel: 'hrs logged',
                ),
                _KpiStat(
                  fmt(nonBillableHours),
                  'Non-Billable', Icons.timelapse_rounded, AppColors.ragAmber,
                  sublabel: 'hrs logged',
                ),
                _KpiStat(
                  fmt(totalHours),
                  'Total Hours', Icons.schedule_rounded, const Color(0xFF7c3aed),
                  sublabel: 'hrs logged',
                ),
              ];

              return GridView.count(
                crossAxisCount: 3,
                shrinkWrap: true,
                physics: const NeverScrollableScrollPhysics(),
                crossAxisSpacing: 8,
                mainAxisSpacing: 8,
                childAspectRatio: 0.95,
                children: stats.map((s) => _KpiCard(stat: s)).toList(),
              ).animate().fadeIn(duration: 300.ms, delay: 100.ms);
            },
            loading: () => GridView.count(
              crossAxisCount: 3,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 8,
              mainAxisSpacing: 8,
              childAspectRatio: 0.95,
              children: List.generate(9, (_) => const ShimmerCard(height: 72)),
            ),
            error: (_, __) => const SizedBox.shrink(),
          ),

          // ── Timeline card ───────────────────────────────────────────
          if (project.startDate != null || project.endDate != null) ...[
            const SizedBox(height: 16),
            _TimelineCard(project: project)
                .animate()
                .fadeIn(duration: 300.ms, delay: 150.ms)
                .slideY(begin: 0.05),
          ],

          // ── RAG update CTA ──────────────────────────────────────────
          const SizedBox(height: 16),
          _RagUpdateCard(project: project)
              .animate()
              .fadeIn(duration: 300.ms, delay: 200.ms),

          // ── Reminder settings (project-managers only) ───────────────
          const SizedBox(height: 16),
          _RemindersCard(project: project)
              .animate()
              .fadeIn(duration: 300.ms, delay: 230.ms),

          // ── Milestones preview ──────────────────────────────────────
          const SizedBox(height: 24),
          const _PremiumSectionHeader(
            title: 'Milestones',
            icon: Icons.flag_rounded,
            color: AppColors.info,
          ),
          const SizedBox(height: 10),
          dashboard.when(
            data: (d) {
              final list = (d['milestones'] as List? ?? []).take(3).toList();
              if (list.isEmpty) {
                return const _EmptyState(
                  message: 'No milestones yet',
                  color: AppColors.success,
                  icon: Icons.check_circle_rounded,
                );
              }
              return Column(
                children: list.asMap().entries
                    .map((e) => _MilestonePreviewCard(
                          m: e.value as Map<String, dynamic>,
                          delay: e.key * 40,
                        ))
                    .toList(),
              );
            },
            loading: () => const ShimmerCard(height: 60),
            error: (_, __) => const SizedBox.shrink(),
          ),

          // ── Open Blockers preview ───────────────────────────────────
          const SizedBox(height: 24),
          const _PremiumSectionHeader(
            title: 'Open Blockers',
            icon: Icons.block_rounded,
            color: AppColors.error,
          ),
          const SizedBox(height: 10),
          dashboard.when(
            data: (d) {
              final list = (d['openBlockersPreview'] as List? ?? []).take(3).toList();
              if (list.isEmpty) {
                return const _EmptyState(
                  message: 'No open blockers',
                  color: AppColors.success,
                  icon: Icons.check_circle_rounded,
                );
              }
              return Column(
                children: list.asMap().entries
                    .map((e) => _BlockerCard(
                          b: e.value as Map<String, dynamic>,
                          delay: e.key * 40,
                        ))
                    .toList(),
              );
            },
            loading: () => const ShimmerCard(height: 64),
            error: (_, __) => const SizedBox.shrink(),
          ),

          // ── Overdue Actions preview ─────────────────────────────────
          const SizedBox(height: 24),
          const _PremiumSectionHeader(
            title: 'Overdue Actions',
            icon: Icons.task_alt_rounded,
            color: AppColors.warning,
          ),
          const SizedBox(height: 10),
          dashboard.when(
            data: (d) {
              final list = (d['openActionsPreview'] as List? ?? []).take(3).toList();
              if (list.isEmpty) {
                return const _EmptyState(
                  message: 'No overdue actions',
                  color: AppColors.success,
                  icon: Icons.check_circle_rounded,
                );
              }
              return Column(
                children: list.asMap().entries
                    .map((e) => _ActionCard(
                          a: e.value as Map<String, dynamic>,
                          delay: e.key * 40,
                        ))
                    .toList(),
              );
            },
            loading: () => const ShimmerCard(height: 64),
            error: (_, __) => const SizedBox.shrink(),
          ),

          const SizedBox(height: 80),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Quick nav chips
// ─────────────────────────────────────────────────────────────────────────────

class _QuickNavChips extends StatelessWidget {
  const _QuickNavChips({required this.projectId});
  final String projectId;

  @override
  Widget build(BuildContext context) {
    // Mirrors the 11 sub-nav links on the web's ProjectDetailPage. Mobile
    // screens read projectId from go_router query params and scope their
    // own filters to it (already supported by Standup / EOD / Actions /
    // Blockers / RAID / Decisions / Milestones / Reports screens).
    final chips = <(IconData, String, String, Color)>[
      (Icons.checklist_rounded,        'Tasks',         '/sprints/my-tasks?projectId=$projectId', AppColors.info),
      (Icons.view_kanban_rounded,      'Sprint Board',  '/sprints?projectId=$projectId',          AppColors.primaryLight),
      (Icons.list_alt_rounded,         'Backlog',       '/sprints?projectId=$projectId&view=backlog', const Color(0xFF6366f1)),
      (Icons.bar_chart_rounded,        'Standup',       '/more/standup?projectId=$projectId',     const Color(0xFF7c3aed)),
      (Icons.wb_sunny_rounded,         'EOD',           '/more/eod?projectId=$projectId',         AppColors.ragAmber),
      (Icons.task_alt_rounded,         'Actions',       '/more/actions?projectId=$projectId',     AppColors.info),
      (Icons.block_rounded,            'Blockers',      '/more/blockers?projectId=$projectId',    AppColors.error),
      (Icons.warning_amber_rounded,    'RAID',          '/more/raid?projectId=$projectId',        AppColors.warning),
      (Icons.gavel_rounded,            'Decisions',     '/more/decisions?projectId=$projectId',   const Color(0xFF0891b2)),
      (Icons.flag_rounded,             'Milestones',    '/more/milestones?projectId=$projectId',  AppColors.success),
      (Icons.insert_chart_rounded,     'Reports',       '/more/reports?projectId=$projectId',     const Color(0xFF7c3aed)),
    ];

    return SingleChildScrollView(
      scrollDirection: Axis.horizontal,
      child: Row(
        children: chips.map((c) {
          final (icon, label, route, color) = c;
          return Padding(
            padding: const EdgeInsets.only(right: 8),
            child: GestureDetector(
              onTap: () => context.push(route),
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                decoration: BoxDecoration(
                  color: color.withOpacity(0.08),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: color.withOpacity(0.25)),
                ),
                child: Row(mainAxisSize: MainAxisSize.min, children: [
                  Icon(icon, size: 13, color: color),
                  const SizedBox(width: 5),
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: color,
                    ),
                  ),
                ]),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Milestone preview card (compact, for Overview tab)
// ─────────────────────────────────────────────────────────────────────────────

class _MilestonePreviewCard extends StatelessWidget {
  const _MilestonePreviewCard({required this.m, this.delay = 0});
  final Map<String, dynamic> m;
  final int delay;

  @override
  Widget build(BuildContext context) {
    final ds     = context.ds;
    final title  = m['title'] as String? ?? '—';
    final due    = m['dueDate'] as String? ?? m['due_date'] as String?;
    final status = (m['status'] as String? ?? 'PENDING').toUpperCase();
    final isDone = status == 'COMPLETED';
    DateTime? dueDate;
    try { if (due != null) dueDate = DateTime.parse(due); } catch (_) {}
    final isOver = dueDate != null && dueDate.isBefore(DateTime.now()) && !isDone;
    final color  = isDone ? AppColors.success : isOver ? AppColors.error : AppColors.info;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border(
          left: BorderSide(color: color, width: 3),
          top: BorderSide(color: ds.border),
          right: BorderSide(color: ds.border),
          bottom: BorderSide(color: ds.border),
        ),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        child: Row(children: [
          Icon(
            isDone ? Icons.check_circle_rounded : Icons.flag_rounded,
            size: 16,
            color: color,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              title,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w600,
                color: ds.textPrimary,
                decoration: isDone ? TextDecoration.lineThrough : null,
              ),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ),
          const SizedBox(width: 8),
          if (dueDate != null)
            Text(
              DateFormat('d MMM').format(dueDate),
              style: TextStyle(
                fontSize: 11,
                color: isOver ? AppColors.error : ds.textMuted,
                fontWeight: isOver ? FontWeight.w700 : FontWeight.normal,
              ),
            ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(
              isDone ? 'Done' : isOver ? 'Overdue' : 'Active',
              style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: color),
            ),
          ),
        ]),
      ),
    ).animate().fadeIn(duration: 250.ms, delay: Duration(milliseconds: delay));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  KPI card
// ─────────────────────────────────────────────────────────────────────────────

class _KpiStat {
  const _KpiStat(this.value, this.label, this.icon, this.color, {this.sublabel});
  final String value;
  final String label;
  final IconData icon;
  final Color color;
  final String? sublabel;
}

class _KpiCard extends StatelessWidget {
  const _KpiCard({required this.stat});
  final _KpiStat stat;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 10),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [stat.color.withOpacity(0.1), ds.bgCard],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: stat.color.withOpacity(0.2)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(stat.icon, color: stat.color, size: 16),
          const SizedBox(height: 6),
          FittedBox(
            fit: BoxFit.scaleDown,
            alignment: Alignment.centerLeft,
            child: Text(
              stat.value,
              style: TextStyle(
                fontSize: 22,
                fontWeight: FontWeight.w800,
                color: stat.color,
                letterSpacing: -0.5,
              ),
            ),
          ),
          const SizedBox(height: 1),
          Text(
            stat.label,
            style: TextStyle(
              fontSize: 10,
              color: ds.textMuted,
              fontWeight: FontWeight.w600,
            ),
          ),
          if (stat.sublabel != null && stat.sublabel!.isNotEmpty) ...[
            const SizedBox(height: 2),
            Text(
              stat.sublabel!,
              style: TextStyle(fontSize: 9, color: stat.color.withOpacity(0.8), fontWeight: FontWeight.w500),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Timeline card
// ─────────────────────────────────────────────────────────────────────────────

class _TimelineCard extends StatelessWidget {
  const _TimelineCard({required this.project});
  final Project project;

  @override
  Widget build(BuildContext context) {
    final ds    = context.ds;
    DateTime? start;
    DateTime? end;
    try {
      if (project.startDate != null) start = DateTime.parse(project.startDate!);
      if (project.endDate != null) end     = DateTime.parse(project.endDate!);
    } catch (_) {}

    double? progress;
    int? daysLeft;
    if (start != null && end != null) {
      final now     = DateTime.now();
      final total   = end.difference(start).inDays;
      final elapsed = now.difference(start).inDays.clamp(0, total);
      if (total > 0) progress = elapsed / total;
      daysLeft = end.difference(now).inDays;
    }

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ds.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.timeline_rounded, size: 14,
                color: AppColors.primaryLight),
            const SizedBox(width: 6),
            Text('Timeline',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primaryLight,
                    letterSpacing: 0.3)),
            const Spacer(),
            if (daysLeft != null)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: daysLeft < 0
                      ? AppColors.errorBg
                      : daysLeft < 14
                          ? AppColors.warningBg
                          : AppColors.infoBg,
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  daysLeft < 0
                      ? '${(-daysLeft)} days over'
                      : '$daysLeft days left',
                  style: TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: daysLeft < 0
                        ? AppColors.error
                        : daysLeft < 14
                            ? AppColors.warning
                            : AppColors.info,
                  ),
                ),
              ),
          ]),
          const SizedBox(height: 14),
          Row(children: [
            if (start != null) ...[
              Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text('Start',
                    style: TextStyle(fontSize: 10, color: ds.textMuted)),
                const SizedBox(height: 2),
                Text(_fmtDate(project.startDate!),
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: ds.textPrimary)),
              ]),
            ],
            const Spacer(),
            // Progress ring (visual)
            if (progress != null) ...[
              _ProgressRing(progress: progress),
              const Spacer(),
            ],
            if (end != null) ...[
              Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                Text('End',
                    style: TextStyle(fontSize: 10, color: ds.textMuted)),
                const SizedBox(height: 2),
                Text(_fmtDate(project.endDate!),
                    style: TextStyle(
                        fontSize: 13,
                        fontWeight: FontWeight.w700,
                        color: (daysLeft ?? 1) < 0
                            ? AppColors.error
                            : ds.textPrimary)),
              ]),
            ],
          ]),
          if (progress != null) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(6),
              child: LinearProgressIndicator(
                value: progress,
                minHeight: 6,
                backgroundColor: ds.border,
                valueColor: AlwaysStoppedAnimation(
                  progress > 0.8
                      ? AppColors.warning
                      : AppColors.primaryLight,
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              '${(progress * 100).toInt()}% timeline elapsed',
              style: TextStyle(fontSize: 10, color: ds.textMuted),
            ),
          ],
        ],
      ),
    );
  }

  static String _fmtDate(String s) {
    try {
      return DateFormat('d MMM yyyy').format(DateTime.parse(s));
    } catch (_) {
      return s;
    }
  }
}

class _ProgressRing extends StatelessWidget {
  const _ProgressRing({required this.progress});
  final double progress;

  @override
  Widget build(BuildContext context) {
    final color = progress > 0.8 ? AppColors.warning : AppColors.primaryLight;
    return SizedBox(
      width: 40,
      height: 40,
      child: Stack(
        alignment: Alignment.center,
        children: [
          CircularProgressIndicator(
            value: progress,
            strokeWidth: 4,
            backgroundColor: context.ds.border,
            valueColor: AlwaysStoppedAnimation(color),
          ),
          Text(
            '${(progress * 100).toInt()}%',
            style: TextStyle(
              fontSize: 9,
              fontWeight: FontWeight.w800,
              color: color,
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  RAG update CTA
// ─────────────────────────────────────────────────────────────────────────────

class _RagUpdateCard extends ConsumerWidget {
  const _RagUpdateCard({required this.project});
  final Project project;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds       = context.ds;
    final ragColor = switch (project.ragStatus) {
      'RED'   => AppColors.ragRed,
      'AMBER' => AppColors.ragAmber,
      _       => AppColors.ragGreen,
    };

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [
            AppColors.primary.withOpacity(0.08),
            ds.bgCard,
          ],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.primary.withOpacity(0.2)),
      ),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.all(10),
          decoration: BoxDecoration(
            color: ragColor.withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(Icons.speed_rounded, color: ragColor, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text('RAG Status',
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: ds.textPrimary)),
            Text('Current: ${project.ragStatus}',
                style: TextStyle(
                    fontSize: 11,
                    color: ragColor,
                    fontWeight: FontWeight.w600)),
          ]),
        ),
        TextButton.icon(
          icon: const Icon(Icons.edit_rounded, size: 14),
          label: const Text('Update'),
          style: TextButton.styleFrom(
            foregroundColor: AppColors.primaryLight,
            textStyle: const TextStyle(
                fontSize: 12, fontWeight: FontWeight.w700),
          ),
          onPressed: () => _showRagDialog(context, ref, project),
        ),
      ]),
    );
  }

  static void _showRagDialog(
      BuildContext ctx, WidgetRef ref, Project project) {
    String selected = project.ragStatus;
    final reasonCtrl = TextEditingController();

    showModalBottomSheet(
      context: ctx,
      isScrollControlled: true,
      backgroundColor: ctx.ds.bgCard,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
      builder: (_) => StatefulBuilder(
        builder: (ctx2, setS) => Padding(
          padding: EdgeInsets.fromLTRB(
              24, 24, 24, MediaQuery.viewInsetsOf(ctx2).bottom + 24),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // Handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  decoration: BoxDecoration(
                    color: ctx.ds.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              const SizedBox(height: 20),
              Text('Update RAG Status',
                  style: TextStyle(
                      fontSize: 18,
                      fontWeight: FontWeight.w800,
                      color: ctx.ds.textPrimary)),
              const SizedBox(height: 20),
              // RAG options
              ...['GREEN', 'AMBER', 'RED'].map((r) {
                final rc = switch (r) {
                  'RED'   => AppColors.ragRed,
                  'AMBER' => AppColors.ragAmber,
                  _       => AppColors.ragGreen,
                };
                final isSelected = selected == r;
                return GestureDetector(
                  onTap: () => setS(() => selected = r),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 200),
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: isSelected
                          ? rc.withOpacity(0.12)
                          : ctx.ds.bgElevated,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                          color: isSelected
                              ? rc.withOpacity(0.5)
                              : ctx.ds.border,
                          width: isSelected ? 1.5 : 1),
                    ),
                    child: Row(children: [
                      Container(
                        width: 12,
                        height: 12,
                        decoration: BoxDecoration(
                          color: rc,
                          shape: BoxShape.circle,
                        ),
                      ),
                      const SizedBox(width: 12),
                      Text(
                        switch (r) {
                          'RED'   => 'At Risk',
                          'AMBER' => 'Needs Attention',
                          _       => 'On Track',
                        },
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: isSelected ? rc : ctx.ds.textPrimary,
                        ),
                      ),
                      const Spacer(),
                      if (isSelected)
                        Icon(Icons.check_circle_rounded,
                            color: rc, size: 18),
                    ]),
                  ),
                );
              }),
              const SizedBox(height: 8),
              TextField(
                controller: reasonCtrl,
                decoration: const InputDecoration(
                  labelText: 'Reason / commentary (optional)',
                  prefixIcon: Icon(Icons.notes_rounded),
                ),
                maxLines: 2,
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primary,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(14)),
                  ),
                  onPressed: () async {
                    try {
                      await ApiClient.instance.post(
                        '${AppConstants.baseCore}/projects/${project.id}/rag',
                        data: {
                          'ragStatus': selected,
                          'reason': reasonCtrl.text.trim(),
                        },
                      );
                      if (ctx2.mounted) Navigator.pop(ctx2);
                    } catch (e) {
                      if (ctx2.mounted) {
                        ScaffoldMessenger.of(ctx2).showSnackBar(
                          SnackBar(
                            content: Text('$e'),
                            backgroundColor: AppColors.error,
                          ),
                        );
                      }
                    }
                  },
                  child: const Text('Update Status',
                      style: TextStyle(fontWeight: FontWeight.w700)),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Reminder settings card
//
//  Mirrors the web "Reminder Settings" card on ProjectDetailPage. Lets project
//  managers toggle the daily standup + EOD reminders that the backend cron
//  fires at 09:00 UTC / 16:30 UTC on weekdays. Only visible to users with
//  PROJECT_WRITE permission.
// ─────────────────────────────────────────────────────────────────────────────

class _RemindersCard extends ConsumerStatefulWidget {
  const _RemindersCard({required this.project});
  final Project project;

  @override
  ConsumerState<_RemindersCard> createState() => _RemindersCardState();
}

class _RemindersCardState extends ConsumerState<_RemindersCard> {
  late bool _standup = widget.project.standupEnabled;
  late bool _eod     = widget.project.eodEnabled;
  String? _saving; // 'standup' | 'eod'

  Future<void> _toggle(String field, bool next) async {
    setState(() {
      _saving = field;
      if (field == 'standup') _standup = next;
      if (field == 'eod')     _eod     = next;
    });
    try {
      // Backend stores reminder flags as string row values — match the web's
      // useUpdateProject() payload shape so both clients hit the same code path.
      await ApiClient.instance.put(
        '${AppConstants.baseCore}/projects/${widget.project.id}',
        data: {
          if (field == 'standup') 'standup_enabled': next,
          if (field == 'eod')     'eod_enabled':     next,
        },
      );
    } catch (e) {
      // Roll back optimistic update on failure.
      if (mounted) {
        setState(() {
          if (field == 'standup') _standup = !next;
          if (field == 'eod')     _eod     = !next;
        });
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = null);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds   = context.ds;
    final user = ref.watch(currentUserProvider);
    final canManage = user?.hasPermission(Permissions.projectWrite) == true;
    if (!canManage) return const SizedBox.shrink();

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ds.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Icon(Icons.notifications_active_rounded,
                size: 16, color: ds.textSecondary),
            const SizedBox(width: 8),
            Text(
              'Reminder Settings',
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w800,
                color: ds.textPrimary,
                letterSpacing: 0.2,
              ),
            ),
          ]),
          const SizedBox(height: 14),
          _ReminderToggleRow(
            title: 'Daily Standup Reminder',
            subtitle: 'Sent at 09:00 UTC on weekdays to members who haven\'t submitted',
            value: _standup,
            busy: _saving == 'standup',
            onChanged: (v) => _toggle('standup', v),
          ),
          Divider(height: 18, color: ds.border),
          _ReminderToggleRow(
            title: 'Daily EOD Reminder',
            subtitle: 'Sent at 16:30 UTC on weekdays to members who haven\'t submitted',
            value: _eod,
            busy: _saving == 'eod',
            onChanged: (v) => _toggle('eod', v),
          ),
          if (!_standup || !_eod) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
              decoration: BoxDecoration(
                color: AppColors.warningBg,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: AppColors.warning.withOpacity(0.25)),
              ),
              child: Row(children: [
                Icon(Icons.notifications_off_rounded,
                    size: 13, color: AppColors.warning),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    '${[
                      if (!_standup) 'Standup',
                      if (!_eod)     'EOD',
                    ].join(' & ')} reminders are disabled for this project.',
                    style: const TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w600,
                      color: AppColors.warning,
                    ),
                  ),
                ),
              ]),
            ),
          ],
        ],
      ),
    );
  }
}

class _ReminderToggleRow extends StatelessWidget {
  const _ReminderToggleRow({
    required this.title,
    required this.subtitle,
    required this.value,
    required this.busy,
    required this.onChanged,
  });

  final String title;
  final String subtitle;
  final bool value;
  final bool busy;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Row(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(title,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: ds.textPrimary)),
            const SizedBox(height: 2),
            Text(subtitle,
                style: TextStyle(fontSize: 11, color: ds.textMuted)),
          ]),
        ),
        const SizedBox(width: 8),
        if (busy)
          const SizedBox(
            width: 18, height: 18,
            child: CircularProgressIndicator(strokeWidth: 2),
          )
        else
          Switch.adaptive(
            value: value,
            onChanged: onChanged,
            activeColor: AppColors.primaryLight,
          ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Members tab
// ─────────────────────────────────────────────────────────────────────────────

class _MembersTab extends ConsumerWidget {
  const _MembersTab({required this.project});
  final Project project;

  Future<void> _removeMember(
      BuildContext context, WidgetRef ref, String memberId, String name) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Remove member?'),
        content: Text('$name will lose access to this project.'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.pop(ctx, true),
            style: TextButton.styleFrom(foregroundColor: AppColors.error),
            child: const Text('Remove'),
          ),
        ],
      ),
    );
    if (ok != true) return;

    try {
      await ApiClient.instance.delete(
        '${AppConstants.baseCore}/projects/${project.id}/members/$memberId',
      );
      ref.invalidate(_projectMembersProvider(project.id));
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Remove failed: $e'),
              backgroundColor: AppColors.error),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds         = context.ds;
    final members    = ref.watch(_projectMembersProvider(project.id));
    final user       = ref.watch(currentUserProvider);
    final canManage  = user?.hasPermission(Permissions.projectWrite) == true;

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_projectMembersProvider(project.id)),
      color: AppColors.primaryLight,
      child: members.when(
        data: (list) {
          // Header row with Add button — always shown so the empty state
          // doesn't trap the user; the button itself is permission-gated.
          final header = canManage
              ? Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 4),
                  child: Row(children: [
                    Text(
                      '${list.length} member${list.length == 1 ? '' : 's'}',
                      style: TextStyle(
                          fontSize: 12,
                          color: ds.textMuted,
                          fontWeight: FontWeight.w600),
                    ),
                    const Spacer(),
                    OutlinedButton.icon(
                      onPressed: () => _showAddMemberSheet(context, ref, project, list),
                      icon: const Icon(Icons.person_add_alt_rounded, size: 14),
                      label: const Text('Add Member'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primaryLight,
                        side: BorderSide(color: AppColors.primaryLight.withOpacity(0.4)),
                        textStyle: const TextStyle(
                            fontSize: 12, fontWeight: FontWeight.w700),
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                    ),
                  ]),
                )
              : const SizedBox.shrink();

          if (list.isEmpty) {
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.symmetric(vertical: 24),
              children: [
                header,
                const SizedBox(height: 80),
                Center(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      Icon(Icons.people_outline_rounded,
                          size: 48, color: ds.textMuted),
                      const SizedBox(height: 12),
                      Text('No members yet',
                          style: TextStyle(color: ds.textMuted)),
                    ],
                  ),
                ),
              ],
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.only(bottom: 100),
            // +1 row for the header so the Add button scrolls naturally.
            itemCount: list.length + 1,
            itemBuilder: (_, idx) {
              if (idx == 0) return header;
              final i = idx - 1;
              final m      = list[i] as Map<String, dynamic>;
              final mid    = m['id']?.toString() ?? '';
              final name   = m['name'] as String? ??
                  m['userName'] as String? ?? '—';
              final email  = m['email'] as String? ?? '';
              final role   = m['projectRole'] as String? ??
                  m['role'] as String? ?? '';
              final avatar = m['avatarUrl'] as String? ??
                  m['avatar_url'] as String?;

              return Container(
                margin: const EdgeInsets.fromLTRB(16, 0, 16, 10),
                padding: const EdgeInsets.all(14),
                decoration: BoxDecoration(
                  color: ds.bgCard,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: ds.border),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(
                          Theme.of(context).brightness == Brightness.dark
                              ? 0.1
                              : 0.03),
                      blurRadius: 8,
                      offset: const Offset(0, 2),
                    ),
                  ],
                ),
                child: Row(children: [
                  UserAvatar(name: name, avatarUrl: avatar, radius: 24),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(name,
                              style: TextStyle(
                                  fontSize: 14,
                                  fontWeight: FontWeight.w700,
                                  color: ds.textPrimary)),
                          if (email.isNotEmpty)
                            Text(email,
                                style: TextStyle(
                                    fontSize: 11, color: ds.textMuted),
                                overflow: TextOverflow.ellipsis),
                        ]),
                  ),
                  if (role.isNotEmpty)
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 4),
                      decoration: BoxDecoration(
                        color:
                            AppColors.primaryLight.withOpacity(0.1),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                            color: AppColors.primaryLight
                                .withOpacity(0.3)),
                      ),
                      child: Text(
                        _fmtRole(role),
                        style: const TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: AppColors.primaryLight),
                      ),
                    ),
                  if (canManage && mid.isNotEmpty) ...[
                    const SizedBox(width: 4),
                    IconButton(
                      onPressed: () => _removeMember(context, ref, mid, name),
                      icon: Icon(Icons.delete_outline_rounded,
                          size: 18, color: ds.textMuted),
                      tooltip: 'Remove member',
                      visualDensity: VisualDensity.compact,
                      padding: const EdgeInsets.all(4),
                      constraints: const BoxConstraints(),
                    ),
                  ],
                ]),
              ).animate().fadeIn(
                  duration: 250.ms,
                  delay: Duration(milliseconds: i * 40));
            },
          );
        },
        loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children:
              List.generate(4, (_) => const ShimmerCard(height: 72)),
        ),
        error: (e, _) => Center(
          child: Text('$e',
              style: const TextStyle(
                  color: AppColors.error, fontSize: 12)),
        ),
      ),
    );
  }

  static String _fmtRole(String r) => r
      .replaceAll('_', ' ')
      .split(' ')
      .map((w) =>
          w.isEmpty ? '' : w[0].toUpperCase() + w.substring(1).toLowerCase())
      .join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
//  Add Member / Add Team bottom sheet
//
//  Mirrors the web's "Add to Project" modal — Individual mode picks a user
//  from the org and assigns a project role; Team mode bulk-adds an entire
//  team's members using each user's existing team role.
// ─────────────────────────────────────────────────────────────────────────────

void _showAddMemberSheet(
    BuildContext ctx, WidgetRef parentRef, Project project, List<dynamic> existing) {
  showModalBottomSheet(
    context: ctx,
    isScrollControlled: true,
    backgroundColor: ctx.ds.bgCard,
    shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(top: Radius.circular(24))),
    builder: (_) => _AddMemberSheet(
      project: project,
      existingMemberUserIds: existing
          .map((m) => (m as Map<String, dynamic>)['userId']?.toString() ?? '')
          .where((s) => s.isNotEmpty)
          .toSet(),
    ),
  ).then((added) {
    if (added == true) {
      parentRef.invalidate(_projectMembersProvider(project.id));
    }
  });
}

class _AddMemberSheet extends ConsumerStatefulWidget {
  const _AddMemberSheet({
    required this.project,
    required this.existingMemberUserIds,
  });
  final Project project;
  final Set<String> existingMemberUserIds;

  @override
  ConsumerState<_AddMemberSheet> createState() => _AddMemberSheetState();
}

class _AddMemberSheetState extends ConsumerState<_AddMemberSheet> {
  String _mode = 'individual'; // 'individual' | 'team'
  String? _userId;
  String  _projectRole = 'MEMBER';
  String? _teamId;
  bool _saving = false;
  String? _error;

  // Mirrors the web's role dropdown groupings.
  static const _roleGroups = <(String, List<(String, String)>)>[
    ('Leadership', [
      ('DELIVERY_LEAD',     'Delivery Lead'),
      ('PROJECT_MANAGER',   'Project Manager'),
      ('TECH_LEAD',         'Tech Lead'),
      ('SCRUM_MASTER',      'Scrum Master'),
      ('PRODUCT_OWNER',     'Product Owner'),
    ]),
    ('Engineering', [
      ('SENIOR_DEVELOPER',  'Senior Developer'),
      ('DEVELOPER',         'Developer'),
      ('DEVOPS_ENGINEER',   'DevOps Engineer'),
    ]),
    ('Analysis & Reporting', [
      ('BUSINESS_ANALYST',  'Business Analyst (BA)'),
      ('MIS_ANALYST',       'MIS Analyst'),
      ('DATA_ANALYST',      'Data Analyst'),
    ]),
    ('Quality & Design', [
      ('TESTER',            'QA / Tester'),
      ('DESIGNER',          'UI/UX Designer'),
    ]),
    ('Entry Level', [
      ('TRAINEE',           'Trainee'),
      ('INTERN',            'Intern'),
    ]),
    ('Stakeholders', [
      ('MEMBER',            'Member'),
      ('STAKEHOLDER',       'Stakeholder'),
      ('OBSERVER',          'Observer'),
    ]),
  ];

  Future<void> _submit() async {
    setState(() {
      _error = null;
      _saving = true;
    });
    try {
      if (_mode == 'individual') {
        if (_userId == null || _userId!.isEmpty) {
          throw 'Select a user first';
        }
        await ApiClient.instance.post(
          '${AppConstants.baseCore}/projects/${widget.project.id}/members',
          data: {'user_id': _userId, 'role': _projectRole},
        );
      } else {
        if (_teamId == null || _teamId!.isEmpty) {
          throw 'Select a team first';
        }
        await ApiClient.instance.post(
          '${AppConstants.baseCore}/projects/${widget.project.id}/members/team',
          data: {'team_id': _teamId},
        );
      }
      if (mounted) Navigator.of(context).pop(true);
    } catch (e) {
      if (mounted) {
        setState(() {
          _error = e.toString();
          _saving = false;
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds      = context.ds;
    final users   = ref.watch(_allUsersProvider);
    final teams   = ref.watch(teamsProvider);

    return Padding(
      padding: EdgeInsets.fromLTRB(
          20, 20, 20, MediaQuery.viewInsetsOf(context).bottom + 24),
      child: SingleChildScrollView(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Center(
              child: Container(
                width: 40, height: 4,
                decoration: BoxDecoration(
                  color: ds.border,
                  borderRadius: BorderRadius.circular(2),
                ),
              ),
            ),
            const SizedBox(height: 18),
            Text('Add to Project',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: ds.textPrimary)),
            const SizedBox(height: 16),

            // Mode toggle
            Container(
              padding: const EdgeInsets.all(4),
              decoration: BoxDecoration(
                color: ds.bgElevated,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Row(children: [
                Expanded(child: _modeButton('individual', 'Individual')),
                Expanded(child: _modeButton('team', 'Add Team')),
              ]),
            ),
            const SizedBox(height: 18),

            if (_error != null) ...[
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(
                  color: AppColors.errorBg,
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: AppColors.error.withOpacity(0.3)),
                ),
                child: Text(_error!,
                    style: const TextStyle(
                        fontSize: 12, color: AppColors.error)),
              ),
              const SizedBox(height: 14),
            ],

            if (_mode == 'individual') ...[
              Text('User *',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: ds.textSecondary)),
              const SizedBox(height: 6),
              users.when(
                data: (list) {
                  final filtered = list
                      .map((u) => u as Map<String, dynamic>)
                      .where((u) =>
                          !widget.existingMemberUserIds.contains(u['id']?.toString()))
                      .toList();
                  return DropdownButtonFormField<String>(
                    value: _userId,
                    isExpanded: true,
                    decoration: _dropdownDecoration(ds, 'Select user…'),
                    items: filtered.map((u) {
                      final id    = u['id']?.toString() ?? '';
                      final name  = u['name'] as String? ?? u['email'] as String? ?? id;
                      final email = u['email'] as String? ?? '';
                      return DropdownMenuItem(
                        value: id,
                        child: Text(
                          email.isNotEmpty && email != name ? '$name · $email' : name,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13),
                        ),
                      );
                    }).toList(),
                    onChanged: (v) => setState(() => _userId = v),
                  );
                },
                loading: () => const SizedBox(
                  height: 48,
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                ),
                error: (e, _) => Text('Failed to load users: $e',
                    style: const TextStyle(color: AppColors.error, fontSize: 12)),
              ),
              const SizedBox(height: 14),
              Text('Project Role',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: ds.textSecondary)),
              const SizedBox(height: 6),
              DropdownButtonFormField<String>(
                value: _projectRole,
                isExpanded: true,
                decoration: _dropdownDecoration(ds, ''),
                items: [
                  for (final group in _roleGroups) ...[
                    // Section header is rendered as a disabled item.
                    DropdownMenuItem<String>(
                      enabled: false,
                      value: '__h_${group.$1}',
                      child: Text(group.$1.toUpperCase(),
                          style: TextStyle(
                              fontSize: 10,
                              color: ds.textMuted,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.5)),
                    ),
                    ...group.$2.map((r) => DropdownMenuItem<String>(
                          value: r.$1,
                          child: Padding(
                            padding: const EdgeInsets.only(left: 8),
                            child: Text(r.$2,
                                style: const TextStyle(fontSize: 13)),
                          ),
                        )),
                  ],
                ],
                onChanged: (v) {
                  if (v != null && !v.startsWith('__h_')) {
                    setState(() => _projectRole = v);
                  }
                },
              ),
            ] else ...[
              Text('Team *',
                  style: TextStyle(
                      fontSize: 11,
                      fontWeight: FontWeight.w700,
                      color: ds.textSecondary)),
              const SizedBox(height: 6),
              teams.when(
                data: (list) {
                  return DropdownButtonFormField<String>(
                    value: _teamId,
                    isExpanded: true,
                    decoration: _dropdownDecoration(ds, 'Select team…'),
                    items: list.map((t) {
                      final tt = t as Map<String, dynamic>;
                      final id    = tt['id']?.toString() ?? '';
                      final name  = tt['name'] as String? ?? id;
                      final count = (tt['memberCount'] as num?)?.toInt() ?? 0;
                      return DropdownMenuItem(
                        value: id,
                        child: Text(
                          count > 0 ? '$name ($count members)' : name,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13),
                        ),
                      );
                    }).toList(),
                    onChanged: (v) => setState(() => _teamId = v),
                  );
                },
                loading: () => const SizedBox(
                  height: 48,
                  child: Center(child: CircularProgressIndicator(strokeWidth: 2)),
                ),
                error: (e, _) => Text('Failed to load teams: $e',
                    style: const TextStyle(color: AppColors.error, fontSize: 12)),
              ),
              const SizedBox(height: 8),
              Text(
                'All members will be added using their existing team role. '
                'Existing project members are skipped.',
                style: TextStyle(fontSize: 11, color: ds.textMuted),
              ),
            ],

            const SizedBox(height: 24),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton.icon(
                onPressed: _saving ? null : _submit,
                icon: _saving
                    ? const SizedBox(
                        width: 14, height: 14,
                        child: CircularProgressIndicator(
                            strokeWidth: 2, color: Colors.white),
                      )
                    : Icon(_mode == 'team'
                        ? Icons.groups_rounded
                        : Icons.person_add_alt_rounded, size: 16),
                label: Text(_mode == 'team' ? 'Add Team' : 'Add Member',
                    style: const TextStyle(fontWeight: FontWeight.w700)),
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primary,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(14)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _modeButton(String mode, String label) {
    final selected = _mode == mode;
    final ds = context.ds;
    return GestureDetector(
      onTap: () => setState(() {
        _mode = mode;
        _error = null;
      }),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 160),
        padding: const EdgeInsets.symmetric(vertical: 8),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: selected ? ds.bgCard : Colors.transparent,
          borderRadius: BorderRadius.circular(10),
          boxShadow: selected
              ? [BoxShadow(color: Colors.black.withOpacity(0.05),
                  blurRadius: 6, offset: const Offset(0, 1))]
              : null,
        ),
        child: Text(label,
            style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: selected ? ds.textPrimary : ds.textMuted,
            )),
      ),
    );
  }

  InputDecoration _dropdownDecoration(dynamic ds, String hint) =>
      InputDecoration(
        hintText: hint,
        hintStyle: TextStyle(color: ds.textMuted, fontSize: 13),
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: ds.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(10),
          borderSide: BorderSide(color: AppColors.primaryLight, width: 1.5),
        ),
      );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Milestones tab
// ─────────────────────────────────────────────────────────────────────────────

class _MilestonesTab extends ConsumerWidget {
  const _MilestonesTab({required this.projectId});
  final String projectId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds         = context.ds;
    final milestones = ref.watch(_projectMilestonesProvider(projectId));

    return RefreshIndicator(
      onRefresh: () async =>
          ref.invalidate(_projectMilestonesProvider(projectId)),
      color: AppColors.primaryLight,
      child: milestones.when(
        data: (list) => list.isEmpty
            ? Center(
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    Icon(Icons.flag_rounded, size: 48, color: ds.textMuted),
                    const SizedBox(height: 12),
                    Text('No milestones yet',
                        style: TextStyle(color: ds.textMuted)),
                  ],
                ),
              )
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final m      = list[i] as Map<String, dynamic>;
                  final title  = m['title'] as String? ??
                      m['name'] as String? ?? '—';
                  final due    = m['dueDate'] as String? ??
                      m['due_date'] as String?;
                  final status =
                      (m['status'] as String? ?? 'PENDING').toUpperCase();
                  final prog   =
                      (m['progress'] as num? ?? 0).toDouble();
                  final isDone = status == 'COMPLETED';
                  DateTime? dueDate;
                  try {
                    if (due != null) dueDate = DateTime.parse(due);
                  } catch (_) {}
                  final isOver = dueDate != null &&
                      dueDate.isBefore(DateTime.now()) &&
                      !isDone;
                  final color = isDone
                      ? AppColors.success
                      : isOver
                          ? AppColors.error
                          : AppColors.primaryLight;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    decoration: BoxDecoration(
                      color: ds.bgCard,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: color.withOpacity(0.25)),
                      boxShadow: [
                        BoxShadow(
                          color: color.withOpacity(
                              Theme.of(context).brightness == Brightness.dark
                                  ? 0.08
                                  : 0.04),
                          blurRadius: 12,
                          offset: const Offset(0, 3),
                        ),
                      ],
                    ),
                    child: Column(children: [
                      // Color accent top bar
                      Container(
                        height: 3,
                        decoration: BoxDecoration(
                          color: color,
                          borderRadius: const BorderRadius.vertical(
                              top: Radius.circular(16)),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(14),
                        child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Row(children: [
                                Container(
                                  padding: const EdgeInsets.all(7),
                                  decoration: BoxDecoration(
                                    color: color.withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(10),
                                  ),
                                  child: Icon(
                                    isDone
                                        ? Icons.check_circle_rounded
                                        : Icons.flag_rounded,
                                    color: color,
                                    size: 16,
                                  ),
                                ),
                                const SizedBox(width: 10),
                                Expanded(
                                  child: Text(title,
                                      style: TextStyle(
                                          fontSize: 14,
                                          fontWeight: FontWeight.w700,
                                          color: ds.textPrimary)),
                                ),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 8, vertical: 3),
                                  decoration: BoxDecoration(
                                    color: color.withOpacity(0.1),
                                    borderRadius:
                                        BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    isDone
                                        ? 'Done'
                                        : isOver
                                            ? 'Overdue'
                                            : 'On Track',
                                    style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        color: color),
                                  ),
                                ),
                              ]),
                              if (dueDate != null) ...[
                                const SizedBox(height: 8),
                                Row(children: [
                                  Icon(
                                    Icons.calendar_today_rounded,
                                    size: 12,
                                    color: isOver
                                        ? AppColors.error
                                        : ds.textMuted,
                                  ),
                                  const SizedBox(width: 5),
                                  Text(
                                    DateFormat('d MMM yyyy').format(dueDate),
                                    style: TextStyle(
                                      fontSize: 12,
                                      color: isOver
                                          ? AppColors.error
                                          : ds.textMuted,
                                      fontWeight: isOver
                                          ? FontWeight.w700
                                          : FontWeight.normal,
                                    ),
                                  ),
                                ]),
                              ],
                              if (!isDone && prog > 0) ...[
                                const SizedBox(height: 10),
                                Row(children: [
                                  Expanded(
                                    child: ClipRRect(
                                      borderRadius:
                                          BorderRadius.circular(4),
                                      child: LinearProgressIndicator(
                                        value: prog / 100,
                                        minHeight: 5,
                                        backgroundColor: ds.border,
                                        color: color,
                                      ),
                                    ),
                                  ),
                                  const SizedBox(width: 8),
                                  Text(
                                    '${prog.toInt()}%',
                                    style: TextStyle(
                                        fontSize: 10,
                                        fontWeight: FontWeight.w700,
                                        color: color),
                                  ),
                                ]),
                              ],
                            ]),
                      ),
                    ]),
                  ).animate().fadeIn(
                      duration: 250.ms,
                      delay: Duration(milliseconds: i * 40));
                },
              ),
        loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children:
              List.generate(3, (_) => const ShimmerCard(height: 100)),
        ),
        error: (e, _) => Center(
          child: Text('$e',
              style: const TextStyle(
                  color: AppColors.error, fontSize: 12)),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Activity tab
// ─────────────────────────────────────────────────────────────────────────────

class _ActivityTab extends ConsumerWidget {
  const _ActivityTab({required this.project});
  final Project project;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final blockers = ref.watch(_projectBlockersProvider(project.id));
    final actions  = ref.watch(_projectActionsProvider(project.id));

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(_projectBlockersProvider(project.id));
        ref.invalidate(_projectActionsProvider(project.id));
      },
      color: AppColors.primaryLight,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
        children: [
          _PremiumSectionHeader(
              title: 'Blockers',
              icon: Icons.block_rounded,
              color: AppColors.error),
          const SizedBox(height: 10),
          blockers.when(
            data: (list) => list.isEmpty
                ? _EmptyState(
                    message: 'No blockers',
                    color: AppColors.success,
                    icon: Icons.check_circle_rounded,
                  )
                : Column(
                    children: list
                        .asMap()
                        .entries
                        .map((e) => _BlockerCard(
                              b: e.value as Map<String, dynamic>,
                              delay: e.key * 30,
                            ))
                        .toList(),
                  ),
            loading: () => const ShimmerCard(height: 70),
            error: (e, _) => Text('$e',
                style:
                    const TextStyle(color: AppColors.error, fontSize: 12)),
          ),
          const SizedBox(height: 24),
          _PremiumSectionHeader(
              title: 'Actions',
              icon: Icons.task_alt_rounded,
              color: AppColors.warning),
          const SizedBox(height: 10),
          actions.when(
            data: (list) => list.isEmpty
                ? _EmptyState(
                    message: 'No actions',
                    color: AppColors.success,
                    icon: Icons.check_circle_rounded,
                  )
                : Column(
                    children: list
                        .asMap()
                        .entries
                        .map((e) => _ActionCard(
                              a: e.value as Map<String, dynamic>,
                              delay: e.key * 30,
                            ))
                        .toList(),
                  ),
            loading: () => const ShimmerCard(height: 70),
            error: (e, _) => Text('$e',
                style: const TextStyle(
                    color: AppColors.error, fontSize: 12)),
          ),
          const SizedBox(height: 80),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Premium shared widgets
// ─────────────────────────────────────────────────────────────────────────────

class _PremiumSectionHeader extends StatelessWidget {
  const _PremiumSectionHeader({
    required this.title,
    required this.icon,
    required this.color,
  });
  final String title;
  final IconData icon;
  final Color color;

  @override
  Widget build(BuildContext context) => Row(children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: color.withOpacity(0.1),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, size: 14, color: color),
        ),
        const SizedBox(width: 8),
        Text(
          title.toUpperCase(),
          style: TextStyle(
            fontSize: 12,
            fontWeight: FontWeight.w800,
            color: color,
            letterSpacing: 0.8,
          ),
        ),
      ]);
}

class _EmptyState extends StatelessWidget {
  const _EmptyState({
    required this.message,
    required this.color,
    required this.icon,
  });
  final String message;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: color.withOpacity(0.06),
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Row(children: [
          Icon(icon, size: 18, color: color),
          const SizedBox(width: 10),
          Text(message,
              style: TextStyle(
                  fontSize: 13,
                  color: color,
                  fontWeight: FontWeight.w600)),
        ]),
      );
}

class _BlockerCard extends StatelessWidget {
  const _BlockerCard({required this.b, this.delay = 0});
  final Map<String, dynamic> b;
  final int delay;

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final title    = b['title'] as String? ?? '—';
    final severity = b['severity'] as String? ?? 'MEDIUM';
    final status   = b['status']   as String? ?? 'OPEN';
    final resolved = status == 'RESOLVED';
    final (sc, _)  = _sevColor(severity);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border(
          left: BorderSide(
            color: resolved ? AppColors.success : sc,
            width: 3,
          ),
          top: BorderSide(color: ds.border),
          right: BorderSide(color: ds.border),
          bottom: BorderSide(color: ds.border),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(
                title,
                style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: resolved ? ds.textMuted : ds.textPrimary,
                  decoration: resolved ? TextDecoration.lineThrough : null,
                ),
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              const SizedBox(height: 4),
              Row(children: [
                Icon(
                  resolved
                      ? Icons.check_circle_rounded
                      : Icons.block_rounded,
                  size: 12,
                  color: resolved ? AppColors.success : sc,
                ),
                const SizedBox(width: 4),
                Text(
                  resolved ? 'Resolved' : status,
                  style: TextStyle(fontSize: 11, color: ds.textMuted),
                ),
              ]),
            ]),
          ),
          const SizedBox(width: 8),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: sc.withOpacity(0.1),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Text(
              severity,
              style:
                  TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: sc),
            ),
          ),
        ]),
      ),
    ).animate().fadeIn(
        duration: 250.ms, delay: Duration(milliseconds: delay));
  }

  static (Color, String) _sevColor(String s) => switch (s) {
        'CRITICAL' => (AppColors.priorityCritical, s),
        'HIGH'     => (AppColors.priorityHigh,     s),
        'LOW'      => (AppColors.priorityLow,      s),
        _          => (AppColors.ragAmber,          s),
      };
}

class _ActionCard extends StatelessWidget {
  const _ActionCard({required this.a, this.delay = 0});
  final Map<String, dynamic> a;
  final int delay;

  @override
  Widget build(BuildContext context) {
    final ds     = context.ds;
    final title  = a['title'] as String? ?? a['action'] as String? ?? '—';
    final status = a['status'] as String? ?? 'OPEN';
    final due    = a['dueDate'] as String? ?? a['due_date'] as String?;
    final done   = status == 'DONE' || status == 'CANCELLED';
    DateTime? dueDate;
    bool overdue = false;
    try {
      if (due != null) {
        dueDate = DateTime.parse(due);
        overdue = dueDate.isBefore(DateTime.now()) && !done;
      }
    } catch (_) {}

    final accentColor = done
        ? AppColors.success
        : overdue
            ? AppColors.error
            : AppColors.warning;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border(
          left: BorderSide(color: accentColor, width: 3),
          top: BorderSide(color: ds.border),
          right: BorderSide(color: ds.border),
          bottom: BorderSide(color: ds.border),
        ),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 6,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        child: Row(children: [
          Icon(
            done
                ? Icons.check_circle_rounded
                : Icons.radio_button_unchecked_rounded,
            size: 18,
            color: accentColor,
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: TextStyle(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      color: done ? ds.textMuted : ds.textPrimary,
                      decoration: done ? TextDecoration.lineThrough : null,
                    ),
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                  ),
                  if (dueDate != null) ...[
                    const SizedBox(height: 3),
                    Row(children: [
                      Icon(Icons.calendar_today_rounded,
                          size: 11,
                          color: overdue ? AppColors.error : ds.textMuted),
                      const SizedBox(width: 4),
                      Text(
                        DateFormat('d MMM yyyy').format(dueDate),
                        style: TextStyle(
                          fontSize: 11,
                          color: overdue ? AppColors.error : ds.textMuted,
                          fontWeight: overdue
                              ? FontWeight.w700
                              : FontWeight.normal,
                        ),
                      ),
                    ]),
                  ],
                ]),
          ),
          if (overdue)
            Container(
              padding:
                  const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.errorBg,
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Text('OVERDUE',
                  style: TextStyle(
                      fontSize: 9,
                      fontWeight: FontWeight.w800,
                      color: AppColors.error)),
            ),
        ]),
      ),
    ).animate().fadeIn(
        duration: 250.ms, delay: Duration(milliseconds: delay));
  }
}
