/// Time Tracking screen — weekly entries with chart and submission.
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

// ── Providers ─────────────────────────────────────────────────────────────────

final _pendingApprovalsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseTime}/approvals',
    queryParameters: {'status': 'SUBMITTED'},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['approvals'] as List? ?? d['entries'] as List? ?? d['data'] as List? ?? [];
  return [];
});

final _myWeekProvider =
    FutureProvider.autoDispose<List<TimeEntry>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseTime}/entries/my-week',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map ? (data['entries'] as List<dynamic>? ?? []) : []);
  return list
      .map((e) => TimeEntry.fromJson(e as Map<String, dynamic>))
      .toList();
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
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final role = ref.read(currentUserProvider)?.role ?? '';
    final mgr  = role == 'TENANT_ADMIN' || role == 'DELIVERY_LEAD' || role == 'PMO';
    if (mgr != _isManager) {
      _isManager = mgr;
      _tabController.dispose();
      _tabController = TabController(length: mgr ? 3 : 2, vsync: this);
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
          tabs: [
            const Tab(icon: Icon(Icons.list_rounded, size: 18), text: 'My Entries'),
            const Tab(icon: Icon(Icons.bar_chart_rounded, size: 18), text: 'Summary'),
            if (_isManager)
              const Tab(icon: Icon(Icons.approval_rounded, size: 18), text: 'Approvals'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _EntriesTab(onRefresh: () => ref.invalidate(_myWeekProvider)),
          _SummaryTab(onRefresh: () => ref.invalidate(_myWeekProvider)),
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
      builder: (_) =>
          _AddTimeEntrySheet(onAdded: () => ref.invalidate(_myWeekProvider)),
    );
  }
}

// ── Entries tab ───────────────────────────────────────────────────────────────

class _EntriesTab extends ConsumerWidget {
  const _EntriesTab({required this.onRefresh});
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final entries = ref.watch(_myWeekProvider);
    final ds = context.ds;

    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      color: AppColors.primaryLight,
      child: entries.when(
        data: (list) {
          if (list.isEmpty) {
            return const _EmptyState();
          }
          final totalHours = list.fold<double>(0, (s, e) => s + e.hours);

          // Group by date
          final Map<String, List<TimeEntry>> grouped = {};
          for (final entry in list) {
            final day = entry.date.length >= 10
                ? entry.date.substring(0, 10)
                : entry.date;
            (grouped[day] ??= []).add(entry);
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
            children: [
              // Total hours card
              _TotalHoursCard(totalHours: totalHours, count: list.length),
              const SizedBox(height: 16),

              for (final entry in grouped.entries) ...[
                _DateHeader(entry.key),
                const SizedBox(height: 8),
                ...entry.value
                    .map((e) => _TimeEntryCard(e))
                    .toList(),
                const SizedBox(height: 12),
              ],
            ],
          );
        },
        loading: () => ListView(
          children: List.generate(4, (_) => const ShimmerCard()),
        ),
        error: (e, _) => Center(
          child: Text('$e', style: const TextStyle(color: AppColors.error)),
        ),
      ),
    );
  }
}

// ── Summary tab ───────────────────────────────────────────────────────────────

class _SummaryTab extends ConsumerStatefulWidget {
  const _SummaryTab({required this.onRefresh});
  final VoidCallback onRefresh;

  @override
  ConsumerState<_SummaryTab> createState() => _SummaryTabState();
}

class _SummaryTabState extends ConsumerState<_SummaryTab> {
  bool _submitting = false;

  @override
  Widget build(BuildContext context) {
    final entries = ref.watch(_myWeekProvider);
    final ds = context.ds;

    return RefreshIndicator(
      onRefresh: () async => widget.onRefresh(),
      color: AppColors.primaryLight,
      child: entries.when(
        data: (list) {
          final totalHours    = list.fold<double>(0, (s, e) => s + e.hours);
          final billableHours = list
              .where((e) => e.isBillable)
              .fold<double>(0, (s, e) => s + e.hours);
          final submittedHours = list
              .where((e) => e.status != 'DRAFT')
              .fold<double>(0, (s, e) => s + e.hours);
          final draftCount = list.where((e) => e.status == 'DRAFT').length;

          // Build daily totals for chart (Mon-Sun)
          final now    = DateTime.now();
          final monday = now.subtract(Duration(days: now.weekday - 1));
          final dailyTotals = List.generate(7, (i) {
            final day  = monday.add(Duration(days: i));
            final date = DateFormat('yyyy-MM-dd').format(day);
            return list
                .where((e) => e.date.startsWith(date))
                .fold<double>(0, (s, e) => s + e.hours);
          });

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
            children: [
              // ── Bar chart ────────────────────────────────────────────
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: ds.bgCard,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: ds.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('This Week',
                        style: TextStyle(
                            fontSize: 14,
                            fontWeight: FontWeight.w700,
                            color: ds.textPrimary)),
                    const SizedBox(height: 16),
                    SizedBox(
                      height: 150,
                      child: BarChart(
                        BarChartData(
                          alignment: BarChartAlignment.spaceAround,
                          maxY: dailyTotals
                                  .reduce((a, b) => a > b ? a : b)
                                  .clamp(8, double.infinity) +
                              2,
                          barTouchData: BarTouchData(enabled: false),
                          titlesData: FlTitlesData(
                            show: true,
                            bottomTitles: AxisTitles(
                              sideTitles: SideTitles(
                                showTitles: true,
                                getTitlesWidget: (val, _) {
                                  const days = [
                                    'M', 'T', 'W', 'T', 'F', 'S', 'S'
                                  ];
                                  return Text(days[val.toInt()],
                                      style: TextStyle(
                                          fontSize: 11,
                                          color: ds.textMuted));
                                },
                              ),
                            ),
                            leftTitles: const AxisTitles(
                              sideTitles: SideTitles(showTitles: false)),
                            topTitles: const AxisTitles(
                              sideTitles: SideTitles(showTitles: false)),
                            rightTitles: const AxisTitles(
                              sideTitles: SideTitles(showTitles: false)),
                          ),
                          gridData: const FlGridData(show: false),
                          borderData: FlBorderData(show: false),
                          barGroups: List.generate(7, (i) {
                            final isToday = i == (now.weekday - 1);
                            return BarChartGroupData(
                              x: i,
                              barRods: [
                                BarChartRodData(
                                  toY: dailyTotals[i],
                                  width: 24,
                                  borderRadius: const BorderRadius.vertical(
                                      top: Radius.circular(6)),
                                  gradient: LinearGradient(
                                    colors: isToday
                                        ? [
                                            AppColors.primary,
                                            AppColors.primaryLight
                                          ]
                                        : [
                                            AppColors.primaryLight
                                                .withOpacity(0.5),
                                            AppColors.primaryLight
                                                .withOpacity(0.3),
                                          ],
                                    begin: Alignment.bottomCenter,
                                    end: Alignment.topCenter,
                                  ),
                                ),
                              ],
                            );
                          }),
                        ),
                      ),
                    ),
                  ],
                ),
              ).animate().fadeIn(duration: 350.ms),
              const SizedBox(height: 16),

              // ── Stats row ─────────────────────────────────────────────
              Row(children: [
                Expanded(
                  child: _StatCard(
                    value: '${totalHours.toStringAsFixed(1)}h',
                    label: 'Total',
                    icon: Icons.access_time_rounded,
                    color: AppColors.primaryLight,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _StatCard(
                    value: '${billableHours.toStringAsFixed(1)}h',
                    label: 'Billable',
                    icon: Icons.attach_money_rounded,
                    color: AppColors.ragGreen,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: _StatCard(
                    value: '${submittedHours.toStringAsFixed(1)}h',
                    label: 'Submitted',
                    icon: Icons.send_rounded,
                    color: AppColors.info,
                  ),
                ),
              ]),
              const SizedBox(height: 20),

              // ── Submit week button ────────────────────────────────────
              if (draftCount > 0)
                SizedBox(
                  width: double.infinity,
                  child: ElevatedButton.icon(
                    onPressed: _submitting ? null : _submitWeek,
                    icon: const Icon(Icons.send_rounded, size: 18),
                    label: _submitting
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2))
                        : Text(
                            'Submit $draftCount draft ${draftCount == 1 ? "entry" : "entries"}'),
                  ),
                ),
            ],
          );
        },
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Text('$e', style: const TextStyle(color: AppColors.error)),
        ),
      ),
    );
  }

  Future<void> _submitWeek() async {
    setState(() => _submitting = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseTime}/entries/bulk-submit',
        data: {},
      );
      widget.onRefresh();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'),
              backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _TotalHoursCard extends StatelessWidget {
  const _TotalHoursCard({required this.totalHours, required this.count});
  final double totalHours;
  final int count;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
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
              style: const TextStyle(
                  fontSize: 40,
                  fontWeight: FontWeight.w900,
                  color: Colors.white,
                  height: 1)),
          const Text('hours this week',
              style: TextStyle(color: Colors.white70, fontSize: 13)),
        ]),
        const Spacer(),
        Container(
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: Colors.white.withOpacity(0.15),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Column(children: [
            Text('$count',
                style: const TextStyle(
                    fontSize: 22,
                    fontWeight: FontWeight.w800,
                    color: Colors.white)),
            const Text('entries',
                style: TextStyle(color: Colors.white70, fontSize: 11)),
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
    try {
      date = DateTime.parse(dateStr);
    } catch (_) {}

    final label = date != null
        ? DateFormat('EEEE, d MMM').format(date)
        : dateStr;

    return Padding(
      padding: const EdgeInsets.only(bottom: 4),
      child: Text(label,
          style: TextStyle(
              fontSize: 12,
              fontWeight: FontWeight.w700,
              color: ds.textMuted,
              letterSpacing: 0.5)),
    );
  }
}

class _TimeEntryCard extends StatelessWidget {
  const _TimeEntryCard(this.entry);
  final TimeEntry entry;

  Color get _statusColor => switch (entry.status) {
        'APPROVED'  => AppColors.ragGreen,
        'SUBMITTED' => AppColors.info,
        'REJECTED'  => AppColors.error,
        _           => AppColors.textMuted,
      };

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ds.border),
      ),
      child: Row(children: [
        // Hours indicator
        Container(
          width: 50, height: 50,
          decoration: BoxDecoration(
            color: AppColors.primary.withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Center(
            child: Text(
              '${entry.hours.toStringAsFixed(1)}h',
              style: const TextStyle(
                  fontSize: 15,
                  fontWeight: FontWeight.w800,
                  color: AppColors.primaryLight),
            ),
          ),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              entry.description?.isNotEmpty == true
                  ? entry.description!
                  : 'No description',
              style: TextStyle(
                  fontSize: 13,
                  fontWeight: FontWeight.w600,
                  color: ds.textPrimary),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 4),
            Row(children: [
              // Billable indicator
              if (entry.isBillable)
                Container(
                  margin: const EdgeInsets.only(right: 6),
                  padding: const EdgeInsets.symmetric(
                      horizontal: 5, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.ragGreen.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: const Text('Billable',
                      style: TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w700,
                          color: AppColors.ragGreen)),
                ),
              // Status
              Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 5, vertical: 2),
                decoration: BoxDecoration(
                  color: _statusColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(4),
                ),
                child: Text(entry.statusDisplay,
                    style: TextStyle(
                        fontSize: 9,
                        fontWeight: FontWeight.w700,
                        color: _statusColor)),
              ),
            ]),
          ]),
        ),
      ]),
    );
  }
}

class _StatCard extends StatelessWidget {
  const _StatCard(
      {required this.value,
      required this.label,
      required this.icon,
      required this.color});
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
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: color, size: 18),
          const SizedBox(height: 6),
          Text(value,
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: color)),
          Text(label,
              style: TextStyle(fontSize: 10, color: ds.textMuted)),
        ],
      ),
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
        Text('No time entries this week',
            style: TextStyle(color: ds.textMuted)),
        const SizedBox(height: 8),
        Text('Tap + to log your time',
            style: TextStyle(color: ds.textMuted, fontSize: 12)),
      ]),
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
  DateTime _date   = DateTime.now();
  String? _projectId;
  bool _billable   = false;
  bool _loading    = false;
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
                decoration: BoxDecoration(
                    color: ds.border,
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 20),
            Text('Log Time',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: ds.textPrimary)),
            const SizedBox(height: 16),

            // Date
            GestureDetector(
              onTap: _pickDate,
              child: Container(
                padding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: ds.bgInput,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: ds.border),
                ),
                child: Row(children: [
                  Icon(Icons.calendar_today_rounded,
                      size: 18, color: ds.textMuted),
                  const SizedBox(width: 12),
                  Text(DateFormat('EEE, d MMM yyyy').format(_date),
                      style: TextStyle(color: ds.textPrimary)),
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
                items: list
                    .map((p) => DropdownMenuItem(
                        value: p.id, child: Text(p.name)))
                    .toList(),
                onChanged: (v) => setState(() => _projectId = v),
                decoration: const InputDecoration(
                    labelText: 'Project (optional)'),
                dropdownColor: ds.bgElevated,
              ),
              loading: () => const LinearProgressIndicator(),
              error:   (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 12),

            // Description
            TextField(
              controller: _descCtrl,
              decoration: const InputDecoration(
                  labelText: 'What did you work on?'),
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
              Text('Billable hours',
                  style: TextStyle(
                      color: ds.textPrimary, fontWeight: FontWeight.w600)),
            ]),

            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!,
                  style: const TextStyle(
                      color: AppColors.error, fontSize: 12)),
            ],
            const SizedBox(height: 20),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : const Text('Log Time'),
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
      initialDate: _date,
      firstDate: DateTime.now().subtract(const Duration(days: 30)),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _submit() async {
    final hoursStr = _hoursCtrl.text.trim();
    final hours    = double.tryParse(hoursStr);
    if (hours == null || hours <= 0 || hours > 24) {
      setState(() => _error = 'Enter valid hours (0.5 – 24)');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseTime}/entries',
        data: {
          'date':       DateFormat('yyyy-MM-dd').format(_date),
          'hours':      hours,
          'isBillable': _billable,
          if (_projectId != null)           'projectId':   _projectId,
          if (_descCtrl.text.trim().isNotEmpty)
            'description': _descCtrl.text.trim(),
        },
      );
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
        loading: () => ListView(
            children: List.generate(3, (_) => const ShimmerCard(height: 90))),
        error: (e, _) => Center(
            child: Text('$e', style: const TextStyle(color: AppColors.error))),
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
      await ApiClient.instance.post(
        '${AppConstants.baseTime}/approvals/$id/approve',
        data: {},
      );
      widget.onAction();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
        );
      }
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
        content: TextField(
          controller: reasonCtrl,
          decoration: const InputDecoration(labelText: 'Reason (optional)'),
          maxLines: 2,
        ),
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
      await ApiClient.instance.post(
        '${AppConstants.baseTime}/approvals/$id/reject',
        data: {'reason': reasonCtrl.text.trim()},
      );
      widget.onAction();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _acting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds    = context.ds;
    final e     = widget.entry;
    final name  = e['userName'] as String? ?? e['submittedBy'] as String? ?? 'User';
    final proj  = e['projectName'] as String? ?? e['project'] as String? ?? '';
    final desc  = e['description'] as String? ?? '';
    final hours = (e['hours'] as num?)?.toDouble() ?? 0.0;
    final date  = e['date'] as String? ?? e['workDate'] as String? ?? '';
    final bill  = e['billable'] as bool? ?? e['isBillable'] as bool? ?? false;

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
          UserAvatar(name: name, radius: 18),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700,
                color: ds.textPrimary)),
            if (proj.isNotEmpty)
              Text(proj, style: TextStyle(fontSize: 11, color: AppColors.primaryLight,
                  fontWeight: FontWeight.w600)),
          ])),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            Text('${hours.toStringAsFixed(1)}h',
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w800,
                    color: AppColors.primaryLight)),
            if (bill)
              const Text('\$ Billable',
                  style: TextStyle(fontSize: 10, color: AppColors.success,
                      fontWeight: FontWeight.w600)),
          ]),
        ]),
        if (desc.isNotEmpty) ...[
          const SizedBox(height: 6),
          Text(desc, style: TextStyle(fontSize: 12, color: ds.textSecondary),
              maxLines: 2, overflow: TextOverflow.ellipsis),
        ],
        const SizedBox(height: 8),
        Row(children: [
          Icon(Icons.calendar_today_rounded, size: 12, color: ds.textMuted),
          const SizedBox(width: 4),
          Text(date, style: TextStyle(fontSize: 11, color: ds.textMuted)),
          const Spacer(),
          if (_acting)
            const SizedBox(width: 20, height: 20,
                child: CircularProgressIndicator(strokeWidth: 2))
          else ...[
            TextButton(
              style: TextButton.styleFrom(
                foregroundColor: AppColors.error,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                minimumSize: Size.zero,
              ),
              onPressed: _reject,
              child: const Text('Reject', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600)),
            ),
            const SizedBox(width: 6),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.success,
                foregroundColor: Colors.white,
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
