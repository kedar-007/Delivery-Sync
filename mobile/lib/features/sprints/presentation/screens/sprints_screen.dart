import 'dart:async';

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

// ─────────────────────────────────────────────────────────────────────────────
//  Providers
// ─────────────────────────────────────────────────────────────────────────────

final _myTasksSprintProvider = FutureProvider.autoDispose<List<SprintTask>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseSprints}/tasks/my-tasks',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list;
  if (data is List) {
    list = data;
  } else if (data is Map) {
    list = (data['tasks'] as List<dynamic>?) ?? (data['myTasks'] as List<dynamic>?) ?? [];
  } else {
    list = [];
  }
  return list.map((e) => SprintTask.fromJson(e as Map<String, dynamic>)).toList();
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

// ─────────────────────────────────────────────────────────────────────────────
//  Screen
// ─────────────────────────────────────────────────────────────────────────────

class SprintsScreen extends ConsumerStatefulWidget {
  const SprintsScreen({super.key});

  @override
  ConsumerState<SprintsScreen> createState() => _SprintsScreenState();
}

class _SprintsScreenState extends ConsumerState<SprintsScreen>
    with TickerProviderStateMixin {
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
        title: const Text('Sprints & Tasks'),
        backgroundColor: ds.bgPage,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(_myTasksSprintProvider),
          ),
        ],
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.list_alt_rounded, size: 18), text: 'My Tasks'),
            Tab(icon: Icon(Icons.view_kanban_rounded, size: 18), text: 'Board'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _MyTasksTab(),
          _KanbanTab(),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  My Tasks tab
// ─────────────────────────────────────────────────────────────────────────────

class _MyTasksTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(_myTasksSprintProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_myTasksSprintProvider),
      color: AppColors.primaryLight,
      child: tasks.when(
        data: (list) {
          if (list.isEmpty) {
            return const _EmptyState(icon: Icons.task_outlined, message: 'No tasks assigned to you');
          }
          final todo       = list.where((t) => t.status == 'TODO').toList();
          final inProgress = list.where((t) => t.status == 'IN_PROGRESS').toList();
          final done       = list.where((t) => t.status == 'DONE').toList();
          final blocked    = list.where((t) => t.status == 'BLOCKED').toList();

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              _ProgressBar(total: list.length, done: done.length),
              const SizedBox(height: 20),
              if (blocked.isNotEmpty) ...[
                _TaskSection(label: 'Blocked', tasks: blocked, color: AppColors.error),
                const SizedBox(height: 16),
              ],
              if (inProgress.isNotEmpty) ...[
                _TaskSection(label: 'In Progress', tasks: inProgress, color: AppColors.info),
                const SizedBox(height: 16),
              ],
              if (todo.isNotEmpty) ...[
                _TaskSection(label: 'To Do', tasks: todo, color: AppColors.warning),
                const SizedBox(height: 16),
              ],
              if (done.isNotEmpty)
                _TaskSection(label: 'Done', tasks: done, color: AppColors.success),
            ],
          );
        },
        loading: () => ListView(children: List.generate(4, (_) => const ShimmerCard(height: 64))),
        error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: AppColors.error))),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Kanban board
// ─────────────────────────────────────────────────────────────────────────────

const _kanbanColumns = [
  ('TODO',        'To Do',       AppColors.warning),
  ('IN_PROGRESS', 'In Progress', AppColors.info),
  ('BLOCKED',     'Blocked',     AppColors.error),
  ('DONE',        'Done',        AppColors.success),
];

class _KanbanTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final tasks = ref.watch(_myTasksSprintProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_myTasksSprintProvider),
      color: AppColors.primaryLight,
      child: tasks.when(
        data: (list) => list.isEmpty
            ? const _EmptyState(icon: Icons.view_kanban_rounded, message: 'No tasks to show on the board')
            : _KanbanBoard(tasks: list),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: AppColors.error))),
      ),
    );
  }
}

class _KanbanBoard extends StatelessWidget {
  const _KanbanBoard({required this.tasks});
  final List<SprintTask> tasks;

  @override
  Widget build(BuildContext context) {
    return LayoutBuilder(
      builder: (context, constraints) => SingleChildScrollView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.fromLTRB(12, 16, 12, 16),
        child: SizedBox(
          height: constraints.maxHeight,
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: _kanbanColumns.map((col) {
              final (status, label, color) = col;
              return _KanbanColumn(
                status: status, label: label, color: color,
                tasks: tasks.where((t) => t.status == status).toList(),
                height: constraints.maxHeight - 32,
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}

class _KanbanColumn extends StatelessWidget {
  const _KanbanColumn({
    required this.status, required this.label, required this.color,
    required this.tasks, required this.height,
  });
  final String status;
  final String label;
  final Color color;
  final List<SprintTask> tasks;
  final double height;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return SizedBox(
      width: 220,
      height: height,
      child: Container(
        margin: const EdgeInsets.only(right: 12),
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.25)),
        ),
        child: Column(children: [
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
            decoration: BoxDecoration(
              color: color.withOpacity(0.1),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(15)),
            ),
            child: Row(children: [
              Container(width: 8, height: 8,
                  decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
              const SizedBox(width: 8),
              Expanded(child: Text(label,
                  style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: color))),
              Container(
                width: 22, height: 22,
                decoration: BoxDecoration(color: color.withOpacity(0.2), shape: BoxShape.circle),
                child: Center(child: Text('${tasks.length}',
                    style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: color))),
              ),
            ]),
          ),
          Expanded(
            child: tasks.isEmpty
                ? Center(child: Text('Empty', style: TextStyle(fontSize: 12, color: ds.textMuted)))
                : ListView.builder(
                    padding: const EdgeInsets.all(10),
                    itemCount: tasks.length,
                    itemBuilder: (_, i) => _KanbanCard(tasks[i], color),
                  ),
          ),
        ]),
      ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.05),
    );
  }
}

class _KanbanCard extends StatelessWidget {
  const _KanbanCard(this.task, this.columnColor);
  final SprintTask task;
  final Color columnColor;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final (priorityColor, _) = _priorityInfo(task.priority);

    return GestureDetector(
      onTap: () => _TaskDetailSheet.show(context, task),
      child: Container(
        margin: const EdgeInsets.only(bottom: 8),
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: ds.bgElevated,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: ds.border),
          boxShadow: [
            BoxShadow(color: Colors.black.withOpacity(
                Theme.of(context).brightness == Brightness.dark ? 0.2 : 0.04),
                blurRadius: 4, offset: const Offset(0, 2)),
          ],
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(task.title,
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: ds.textPrimary),
              maxLines: 2, overflow: TextOverflow.ellipsis),
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
                  style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: priorityColor)),
            ),
            if (task.storyPoints != null) ...[
              const SizedBox(width: 6),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                decoration: BoxDecoration(
                  color: ds.bgCard,
                  borderRadius: BorderRadius.circular(4),
                  border: Border.all(color: ds.border),
                ),
                child: Text('${task.storyPoints} pts',
                    style: TextStyle(fontSize: 9, fontWeight: FontWeight.w600, color: ds.textMuted)),
              ),
            ],
            const Spacer(),
            Icon(Icons.chevron_right_rounded, size: 14, color: ds.textMuted),
          ]),
        ]),
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
    final ds     = context.ds;
    final task   = widget.task;
    final (pColor, _) = _priorityColor(task.priority);

    return DraggableScrollableSheet(
      initialChildSize: 0.85,
      minChildSize: 0.5,
      maxChildSize: 0.95,
      builder: (_, scrollCtrl) => Container(
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(children: [
          // Drag handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 10),
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: ds.border, borderRadius: BorderRadius.circular(2)),
            ),
          ),

          // Header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
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
                      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: pColor)),
                ),
                const Spacer(),
                _StatusChip(task.status),
              ]),
              const SizedBox(height: 8),
              Text(task.title,
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: ds.textPrimary)),
              if (task.storyPoints != null) ...[
                const SizedBox(height: 4),
                Row(children: [
                  Icon(Icons.filter_tilt_shift_rounded, size: 13, color: ds.textMuted),
                  const SizedBox(width: 4),
                  Text('${task.storyPoints} story points',
                      style: TextStyle(fontSize: 12, color: ds.textMuted)),
                ]),
              ],
            ]),
          ),

          // Tabs
          TabBar(
            controller: _tab,
            labelStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
            indicatorColor: AppColors.primaryLight,
            labelColor: AppColors.primaryLight,
            unselectedLabelColor: ds.textMuted,
            tabs: const [
              Tab(icon: Icon(Icons.chat_bubble_outline_rounded, size: 16), text: 'Activity'),
              Tab(icon: Icon(Icons.timer_outlined, size: 16), text: 'Time Log'),
              Tab(icon: Icon(Icons.auto_awesome_rounded, size: 16), text: 'AI'),
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

// ── Activity (comments) tab ───────────────────────────────────────────────────

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
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

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
              ? Center(child: Text('No comments yet', style: TextStyle(color: ds.textMuted)))
              : ListView.builder(
                  padding: const EdgeInsets.all(16),
                  itemCount: list.length,
                  itemBuilder: (_, i) {
                    final c    = list[i] as Map<String, dynamic>;
                    final name = c['authorName'] as String?
                        ?? c['userName'] as String? ?? 'Unknown';
                    final body = c['content'] as String?
                        ?? c['comment'] as String? ?? '';
                    final date = c['createdAt'] as String?
                        ?? c['CREATEDTIME'] as String? ?? '';
                    return Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        UserAvatar(name: name, radius: 16),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                            Row(children: [
                              Text(name,
                                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
                                      color: ds.textPrimary)),
                              const SizedBox(width: 8),
                              Text(_fmtDate(date),
                                  style: TextStyle(fontSize: 10, color: ds.textMuted)),
                            ]),
                            const SizedBox(height: 4),
                            Container(
                              padding: const EdgeInsets.all(10),
                              decoration: BoxDecoration(
                                color: ds.bgPage,
                                borderRadius: BorderRadius.circular(10),
                              ),
                              child: Text(body,
                                  style: TextStyle(fontSize: 13, color: ds.textSecondary)),
                            ),
                          ]),
                        ),
                      ]),
                    );
                  },
                ),
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Center(child: Text('$e',
              style: const TextStyle(color: AppColors.error, fontSize: 12))),
        ),
      ),

      // Comment box
      Container(
        padding: EdgeInsets.fromLTRB(16, 8, 16,
            MediaQuery.of(context).viewInsets.bottom + 12),
        decoration: BoxDecoration(
          color: ds.bgCard,
          border: Border(top: BorderSide(color: ds.border)),
        ),
        child: Row(children: [
          Expanded(
            child: TextField(
              controller: _ctrl,
              decoration: const InputDecoration(
                hintText: 'Add a comment…',
                contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                border: OutlineInputBorder(borderRadius: BorderRadius.all(Radius.circular(12))),
                isDense: true,
              ),
              minLines: 1,
              maxLines: 3,
            ),
          ),
          const SizedBox(width: 8),
          _posting
              ? const SizedBox(width: 36, height: 36,
                    child: CircularProgressIndicator(strokeWidth: 2))
              : IconButton(
                  icon: const Icon(Icons.send_rounded, color: AppColors.primaryLight),
                  onPressed: _postComment,
                ),
        ]),
      ),
    ]);
  }

  static String _fmtDate(String s) {
    try {
      return DateFormat('d MMM, h:mm a').format(DateTime.parse(s).toLocal());
    } catch (_) { return s; }
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
  // Form state
  final _hoursCtrl = TextEditingController(text: '1');
  final _descCtrl  = TextEditingController();
  DateTime _date   = DateTime.now();
  bool _billable   = true;
  bool _submitting = false;

  // Timer state
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
      // Auto-fill hours from elapsed
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
      await ApiClient.instance.post(
        '${AppConstants.baseTime}/entries',
        data: {
          'taskId':      widget.task.id,
          'hours':       hours,
          'date':        DateFormat('yyyy-MM-dd').format(_date),
          'description': _descCtrl.text.trim(),
          'billable':    _billable,
        },
      );
      _descCtrl.clear();
      _hoursCtrl.text = '1';
      ref.invalidate(_taskTimeEntriesProvider(widget.task.id));
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Time logged!'),
              backgroundColor: AppColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
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

        // ── Timer ─────────────────────────────────────────────────────────
        Container(
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: _running
                ? AppColors.info.withOpacity(0.08)
                : ds.bgPage,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: _running
                ? AppColors.info.withOpacity(0.3) : ds.border),
          ),
          child: Row(children: [
            Icon(Icons.timer_outlined,
                color: _running ? AppColors.info : ds.textMuted, size: 20),
            const SizedBox(width: 10),
            Text(_fmt(_elapsed),
                style: TextStyle(
                  fontSize: 20, fontWeight: FontWeight.w800,
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
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                textStyle: const TextStyle(fontSize: 12, fontWeight: FontWeight.w600),
              ),
              onPressed: _toggleTimer,
            ),
          ]),
        ),

        const SizedBox(height: 16),

        // ── Log Time Form ─────────────────────────────────────────────────
        Text('LOG TIME', style: TextStyle(
            fontSize: 10, fontWeight: FontWeight.w800,
            color: ds.textMuted, letterSpacing: 1.2)),
        const SizedBox(height: 10),

        Row(children: [
          // Hours input
          Expanded(
            child: TextFormField(
              controller: _hoursCtrl,
              keyboardType: const TextInputType.numberWithOptions(decimal: true),
              decoration: const InputDecoration(
                labelText: 'Hours',
                prefixIcon: Icon(Icons.schedule_rounded, size: 18),
                isDense: true,
              ),
            ),
          ),
          const SizedBox(width: 12),
          // Date picker
          Expanded(
            child: GestureDetector(
              onTap: () async {
                final d = await showDatePicker(
                  context: context,
                  initialDate: _date,
                  firstDate: DateTime.now().subtract(const Duration(days: 30)),
                  lastDate: DateTime.now(),
                );
                if (d != null) setState(() => _date = d);
              },
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 13),
                decoration: BoxDecoration(
                  border: Border.all(color: ds.border),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Row(children: [
                  Icon(Icons.calendar_today_rounded, size: 16, color: ds.textMuted),
                  const SizedBox(width: 8),
                  Text(DateFormat('d MMM').format(_date),
                      style: TextStyle(fontSize: 13, color: ds.textPrimary)),
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
        const SizedBox(height: 10),

        Row(children: [
          Switch(
            value: _billable,
            onChanged: (v) => setState(() => _billable = v),
            activeColor: AppColors.success,
          ),
          Text('Billable', style: TextStyle(fontSize: 13, color: ds.textSecondary)),
          const Spacer(),
          _submitting
              ? const CircularProgressIndicator(strokeWidth: 2)
              : ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryLight,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 10),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: _submitLog,
                  child: const Text('Log Time', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13)),
                ),
        ]),

        const Divider(height: 28),

        // ── Time Entries History ──────────────────────────────────────────
        Text('TIME HISTORY', style: TextStyle(
            fontSize: 10, fontWeight: FontWeight.w800,
            color: ds.textMuted, letterSpacing: 1.2)),
        const SizedBox(height: 10),

        entries.when(
          data: (list) {
            if (list.isEmpty) {
              return Center(child: Padding(
                padding: const EdgeInsets.all(16),
                child: Text('No time logged yet', style: TextStyle(color: ds.textMuted)),
              ));
            }
            final total = list.fold(0.0, (sum, e) {
              final h = (e as Map<String, dynamic>)['hours'];
              return sum + (h is num ? h.toDouble() : 0.0);
            });
            return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                Text('Total: ',
                    style: TextStyle(fontSize: 12, color: ds.textMuted)),
                Text('${total.toStringAsFixed(1)}h',
                    style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w800,
                        color: AppColors.primaryLight)),
              ]),
              const SizedBox(height: 8),
              ...list.map((e) {
                final m     = e as Map<String, dynamic>;
                final name  = m['userName'] as String? ?? m['authorName'] as String? ?? 'User';
                final hours = (m['hours'] as num?)?.toDouble() ?? 0.0;
                final date  = m['date'] as String? ?? m['workDate'] as String? ?? '';
                final desc  = m['description'] as String? ?? '';
                final bill  = m['billable'] as bool? ?? false;
                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: ds.bgPage,
                    borderRadius: BorderRadius.circular(10),
                    border: Border.all(color: ds.border),
                  ),
                  child: Row(children: [
                    UserAvatar(name: name, radius: 16),
                    const SizedBox(width: 10),
                    Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Text(name, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                          color: ds.textPrimary)),
                      if (desc.isNotEmpty)
                        Text(desc, style: TextStyle(fontSize: 11, color: ds.textMuted),
                            maxLines: 1, overflow: TextOverflow.ellipsis),
                    ])),
                    Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Text('${hours.toStringAsFixed(1)}h',
                          style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w800,
                              color: AppColors.primaryLight)),
                      Text(date, style: TextStyle(fontSize: 10, color: ds.textMuted)),
                      if (bill)
                        const Text('\$', style: TextStyle(fontSize: 10, color: AppColors.success,
                            fontWeight: FontWeight.w800)),
                    ]),
                  ]),
                );
              }),
            ]);
          },
          loading: () => const Center(child: CircularProgressIndicator()),
          error: (e, _) => Text('$e', style: const TextStyle(color: AppColors.error, fontSize: 12)),
        ),

        const SizedBox(height: 80),
      ]),
    );
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
  void initState() {
    super.initState();
    _loadInsight();
  }

  Future<void> _loadInsight() async {
    setState(() { _loading = true; _error = null; });
    try {
      final raw = await ApiClient.instance.post(
        '${AppConstants.baseAI}/task-insight',
        data: {
          'taskId':      widget.task.id,
          'title':       widget.task.title,
          'status':      widget.task.status,
          'priority':    widget.task.priority,
        },
      );
      final insight = raw['data']?['insight'] as String?
          ?? raw['data']?['analysis'] as String?
          ?? raw['insight'] as String?
          ?? raw['analysis'] as String?
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
          const CircularProgressIndicator(color: Color(0xFFA855F7)),
          const SizedBox(height: 16),
          Text('Generating AI insights…', style: TextStyle(color: ds.textMuted, fontSize: 13)),
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
            Text('Could not load insights', style: TextStyle(color: ds.textMuted)),
            const SizedBox(height: 8),
            Text(_error!, style: const TextStyle(color: AppColors.error, fontSize: 11),
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
              style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: ds.textPrimary)),
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
            border: Border.all(color: const Color(0xFFA855F7).withOpacity(0.2)),
          ),
          child: Text(
            _insight ?? 'No insights available.',
            style: TextStyle(fontSize: 14, color: ds.textSecondary, height: 1.6),
          ),
        ),

        const SizedBox(height: 16),
        // Task metadata card
        Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            color: ds.bgPage,
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: ds.border),
          ),
          child: Column(children: [
            _MetaRow('Task', widget.task.title, ds),
            _MetaRow('Status', widget.task.status, ds),
            _MetaRow('Priority', widget.task.priority, ds),
            if (widget.task.storyPoints != null)
              _MetaRow('Story Points', '${widget.task.storyPoints}', ds),
          ]),
        ),
      ]),
    );
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow(this.label, this.value, this.ds);
  final String label;
  final String value;
  final DsColors ds;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 4),
    child: Row(children: [
      SizedBox(width: 80,
          child: Text(label, style: TextStyle(fontSize: 12, color: ds.textMuted))),
      Expanded(child: Text(value,
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: ds.textPrimary))),
    ]),
  );
}

// ── Small badge widgets ───────────────────────────────────────────────────────

class _TypeBadge extends StatelessWidget {
  const _TypeBadge(this.type);
  final String type;

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (type) {
      'BUG'     => (AppColors.error,    'BUG'),
      'STORY'   => (AppColors.success,  'STORY'),
      'EPIC'    => (const Color(0xFFA855F7), 'EPIC'),
      'SUBTASK' => (AppColors.info,     'SUB'),
      _         => (AppColors.primaryLight, 'TASK'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(label, style: TextStyle(fontSize: 9, fontWeight: FontWeight.w800, color: color)),
    );
  }
}

class _StatusChip extends StatelessWidget {
  const _StatusChip(this.status);
  final String status;

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      'DONE'        => (AppColors.success,  'Done'),
      'IN_PROGRESS' => (AppColors.info,     'In Progress'),
      'IN_REVIEW'   => (AppColors.warning,  'In Review'),
      'BLOCKED'     => (AppColors.error,    'Blocked'),
      _             => (AppColors.textMuted, 'To Do'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

class _ProgressBar extends StatelessWidget {
  const _ProgressBar({required this.total, required this.done});
  final int total;
  final int done;

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
          Text('Sprint Progress', style: TextStyle(
              fontWeight: FontWeight.w700, fontSize: 14, color: ds.textPrimary)),
          Text('${(pct * 100).round()}%', style: const TextStyle(
              fontWeight: FontWeight.w800, color: AppColors.primaryLight, fontSize: 16)),
        ]),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: pct,
            backgroundColor: ds.bgElevated,
            valueColor: const AlwaysStoppedAnimation(AppColors.primaryLight),
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
  const _TaskSection({required this.label, required this.tasks, required this.color});
  final String label;
  final List<SprintTask> tasks;
  final Color color;

  @override
  Widget build(BuildContext context) => Column(
    crossAxisAlignment: CrossAxisAlignment.start,
    children: [
      Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Row(children: [
          Container(width: 8, height: 8,
              decoration: BoxDecoration(color: color, shape: BoxShape.circle)),
          const SizedBox(width: 6),
          Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
              color: color, letterSpacing: 0.5)),
          const SizedBox(width: 6),
          Text('(${tasks.length})',
              style: TextStyle(fontSize: 12, color: context.ds.textMuted)),
        ]),
      ),
      ...tasks.map((t) => _TaskItem(t)),
    ],
  );
}

class _TaskItem extends StatelessWidget {
  const _TaskItem(this.task);
  final SprintTask task;

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
            task.status == 'DONE' ? Icons.check_circle_rounded
                : task.status == 'BLOCKED' ? Icons.block_rounded
                : Icons.radio_button_unchecked_rounded,
            color: task.status == 'DONE' ? AppColors.success
                : task.status == 'BLOCKED' ? AppColors.error : ds.textMuted,
            size: 20,
          ),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(task.title,
                style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
                    color: task.status == 'DONE' ? ds.textMuted : ds.textPrimary,
                    decoration: task.status == 'DONE' ? TextDecoration.lineThrough : null)),
            if (task.storyPoints != null)
              Padding(
                padding: const EdgeInsets.only(top: 3),
                child: Text('${task.storyPoints} pts',
                    style: TextStyle(fontSize: 11, color: ds.textMuted)),
              ),
          ])),
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
        Icon(icon, size: 52, color: ds.textMuted),
        const SizedBox(height: 12),
        Text(message, style: TextStyle(color: ds.textMuted)),
      ]),
    );
  }
}
