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
        },
      ),
    );
  }
}

// ── Entries tab ───────────────────────────────────────────────────────────────

class _EntriesTab extends ConsumerWidget {
  const _EntriesTab({required this.onRefresh});
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summaryAsync = ref.watch(_myWeekSummaryProvider);

    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      color: AppColors.primaryLight,
      child: summaryAsync.when(
        data: (summary) {
          final entries = (summary['entries'] as List).cast<Map<String, dynamic>>();
          if (entries.isEmpty) {
            return const _EmptyState();
          }
          final totalHours = summary['totalHours'] as double;

          // Group by date
          final Map<String, List<Map<String, dynamic>>> grouped = {};
          for (final e in entries) {
            (grouped[e['date'] as String] ??= []).add(e);
          }
          final sortedDays = grouped.keys.toList()..sort((a, b) => b.compareTo(a));

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
            children: [
              _TotalHoursCard(totalHours: totalHours, count: entries.length),
              const SizedBox(height: 16),
              for (final day in sortedDays) ...[
                _DateHeader(day),
                const SizedBox(height: 8),
                ...grouped[day]!.map((e) => _TimeEntryCard(e)),
                const SizedBox(height: 12),
              ],
            ],
          );
        },
        loading: () => ListView(children: List.generate(4, (_) => const ShimmerCard())),
        error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: AppColors.error))),
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

    return SizedBox(
      height: 140,
      child: BarChart(
        BarChartData(
          alignment: BarChartAlignment.spaceAround,
          maxY: (maxY + 1).clamp(8, 16),
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
      ),
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
    final proj   = entry['projectName'] as String? ?? '';
    final status = entry['status'] as String? ?? 'DRAFT';
    final bill   = entry['isBillable'] as bool? ?? false;

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ds.border),
      ),
      child: Row(children: [
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
              desc.isNotEmpty ? desc : 'No description',
              style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600, color: ds.textPrimary),
              maxLines: 1, overflow: TextOverflow.ellipsis,
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
                decoration: BoxDecoration(color: ds.border, borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 20),
            Text('Log Time', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: ds.textPrimary)),
            const SizedBox(height: 16),

            // Date
            GestureDetector(
              onTap: _pickDate,
              child: Container(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                decoration: BoxDecoration(
                  color: ds.bgInput,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(color: ds.border),
                ),
                child: Row(children: [
                  Icon(Icons.calendar_today_rounded, size: 18, color: ds.textMuted),
                  const SizedBox(width: 12),
                  Text(DateFormat('EEE, d MMM yyyy').format(_date), style: TextStyle(color: ds.textPrimary)),
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
                onChanged: (v) => setState(() => _projectId = v),
                decoration: const InputDecoration(labelText: 'Project (optional)'),
                dropdownColor: ds.bgElevated,
              ),
              loading: () => const LinearProgressIndicator(),
              error:   (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 12),

            // Description
            TextField(
              controller: _descCtrl,
              decoration: const InputDecoration(labelText: 'What did you work on?'),
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
      firstDate: DateTime.now().subtract(const Duration(days: 90)),
      lastDate: DateTime.now(),
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _submit() async {
    final hours = double.tryParse(_hoursCtrl.text.trim());
    if (hours == null || hours <= 0 || hours > 24) {
      setState(() => _error = 'Enter valid hours (0.5 – 24)');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseTime}/entries',
        data: {
          'entry_date':  DateFormat('yyyy-MM-dd').format(_date),
          'hours':       hours,
          'is_billable': _billable,
          if (_projectId != null && _projectId!.isNotEmpty) 'project_id': _projectId,
          if (_descCtrl.text.trim().isNotEmpty) 'description': _descCtrl.text.trim(),
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
      await ApiClient.instance.post('${AppConstants.baseTime}/approvals/$id/approve', data: {});
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
      await ApiClient.instance.post('${AppConstants.baseTime}/approvals/$id/reject', data: {'reason': reasonCtrl.text.trim()});
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
    final ds    = context.ds;
    final e     = widget.entry;
    final name  = e['submittedByName'] as String? ?? e['userName'] as String? ?? e['submittedBy'] as String? ?? 'User';
    final proj  = e['projectName'] as String? ?? e['project'] as String? ?? '';
    final desc  = e['description'] as String? ?? '';
    final hours = (e['hours'] as num?)?.toDouble() ?? 0.0;
    final date  = _stripDate(e['date'] as String? ?? e['entry_date'] as String? ?? '');
    final bill  = e['isBillable'] as bool? ?? e['is_billable'] == true || e['is_billable'] == 'true';

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
