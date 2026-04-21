import 'dart:async';

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

// ─────────────────────────────────────────────────────────────────────────────
//  Helpers
// ─────────────────────────────────────────────────────────────────────────────

double _numVal(dynamic v) {
  if (v == null) return 0.0;
  if (v is num) return v.toDouble();
  return double.tryParse(v.toString()) ?? 0.0;
}

int _intVal(dynamic v) {
  if (v == null) return 0;
  if (v is num) return v.toInt();
  return int.tryParse(v.toString().split('.').first) ?? 0;
}

Map<String, dynamic> _normaliseRecord(Map<String, dynamic> r) {
  final grossHours    = _numVal(r['work_hours']           ?? r['hoursWorked']);
  final netHoursRaw   = r['net_work_hours']               ?? r['netWorkHours'];
  final totalBreakMins = _intVal(r['total_break_minutes'] ?? r['totalBreakMinutes']);
  final netHours = netHoursRaw != null
      ? _numVal(netHoursRaw)
      : (totalBreakMins > 0
          ? (grossHours - totalBreakMins / 60).clamp(0.0, grossHours)
          : grossHours);
  return {
    'status':            r['status']?.toString()                                 ?? 'ABSENT',
    'checkInTime':       r['check_in_time']  as String? ?? r['checkInTime']  as String?,
    'checkOutTime':      r['check_out_time'] as String? ?? r['checkOutTime'] as String?,
    'isWfh':             r['is_wfh'] == true || r['is_wfh'] == 'true' || r['isWfh'] == true,
    'hoursWorked':       grossHours,
    'netHours':          netHours,
    'totalBreakMinutes': totalBreakMins,
    'attendanceDate':    r['attendance_date'] as String? ?? r['attendanceDate'] as String?,
    'name':              r['name'] as String?,
    'avatarUrl':         r['avatar_url'] as String? ?? r['avatarUrl'] as String?,
    'email':             r['email'] as String?,
    'breakSummary':      r['break_summary'] as Map<String, dynamic>? ?? r['breakSummary'] as Map<String, dynamic>?,
  };
}

String _clientTime() => DateFormat('yyyy-MM-dd HH:mm:ss').format(DateTime.now());

// ─────────────────────────────────────────────────────────────────────────────
//  Providers
// ─────────────────────────────────────────────────────────────────────────────

final myAttendanceProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/attendance/my-record',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];

  if (d is List) {
    final todayStr = DateFormat('yyyy-MM-dd').format(DateTime.now());
    final todayMap = d
        .whereType<Map<String, dynamic>>()
        .firstWhere(
          (r) => r['attendance_date'] == todayStr,
          orElse: () => <String, dynamic>{},
        );
    return _normaliseRecord(todayMap);
  }
  if (d is Map<String, dynamic>) {
    final today = d['today'];
    if (today is Map<String, dynamic>) return _normaliseRecord(today);
    return _normaliseRecord(d);
  }
  return {};
});

final liveAttendanceProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/attendance/live',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['users'] as List? ?? d['records'] as List? ?? [];
  return [];
});

final attendanceSummaryProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/attendance/summary',
    queryParameters: {'date': today},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is Map<String, dynamic>) return d;
  return {};
});

final weeklyRecordsProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final now  = DateTime.now();
  final mon  = now.subtract(Duration(days: now.weekday - 1));
  final from = DateFormat('yyyy-MM-dd').format(mon);
  final to   = DateFormat('yyyy-MM-dd').format(now);
  final raw  = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/attendance/records',
    queryParameters: {'date_from': from, 'date_to': to},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  final list = d is List ? d : (d is Map ? (d['records'] as List? ?? []) : []);
  return list.whereType<Map<String, dynamic>>().map(_normaliseRecord).toList();
});

final monthlySummaryProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>, ({int year, int month})>((ref, p) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/attendance/summary',
    queryParameters: {'year': p.year.toString(), 'month': p.month.toString()},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is Map<String, dynamic>) {
    final recs = (d['records'] as List? ?? [])
        .whereType<Map<String, dynamic>>()
        .map(_normaliseRecord)
        .toList();
    return {'summary': d['summary'] ?? {}, 'records': recs};
  }
  return {'summary': {}, 'records': <Map<String, dynamic>>[]};
});

final teamRecordsProvider =
    FutureProvider.autoDispose.family<List<Map<String, dynamic>>, ({String from, String to})>((ref, p) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/attendance/records',
    queryParameters: {'date_from': p.from, 'date_to': p.to},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  final list = d is List ? d : (d is Map ? (d['records'] as List? ?? []) : []);
  return list.whereType<Map<String, dynamic>>().map(_normaliseRecord).toList();
});

// ─────────────────────────────────────────────────────────────────────────────
//  Screen
// ─────────────────────────────────────────────────────────────────────────────

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen>
    with SingleTickerProviderStateMixin {
  late TabController _tabCtrl;

  @override
  void initState() {
    super.initState();
    final role = ref.read(currentUserProvider)?.role ?? '';
    final isAdmin = UserRole.isAdmin(role);
    _tabCtrl = TabController(length: isAdmin ? 4 : 3, vsync: this);
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds   = context.ds;
    final role = ref.watch(currentUserProvider)?.role ?? '';
    final isAdmin = UserRole.isAdmin(role);

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Attendance'),
        backgroundColor: ds.bgPage,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () {
              ref.invalidate(myAttendanceProvider);
              ref.invalidate(liveAttendanceProvider);
              ref.invalidate(attendanceSummaryProvider);
              ref.invalidate(weeklyRecordsProvider);
            },
          ),
        ],
        bottom: TabBar(
          controller: _tabCtrl,
          isScrollable: isAdmin,
          tabs: [
            const Tab(text: 'Today'),
            const Tab(text: 'This Week'),
            const Tab(text: 'Monthly'),
            if (isAdmin) const Tab(text: 'Team'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabCtrl,
        children: [
          const _TodayTab(),
          const _WeeklyTab(),
          const _MonthlyTab(),
          if (isAdmin) const _TeamTab(),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tab 0 — Today
// ─────────────────────────────────────────────────────────────────────────────

class _TodayTab extends ConsumerWidget {
  const _TodayTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds = context.ds;
    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(myAttendanceProvider);
        ref.invalidate(liveAttendanceProvider);
        ref.invalidate(attendanceSummaryProvider);
      },
      color: AppColors.primaryLight,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          const _TodayCard(),
          const SizedBox(height: 16),
          _SummarySection(),
          const SizedBox(height: 20),
          Text("WHO'S IN TODAY",
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                  color: ds.textMuted, letterSpacing: 1.2)),
          const SizedBox(height: 10),
          _LiveSection(),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Today card (stateful — owns break timer + all check-in/out actions)
// ─────────────────────────────────────────────────────────────────────────────

class _TodayCard extends ConsumerStatefulWidget {
  const _TodayCard();

  @override
  ConsumerState<_TodayCard> createState() => _TodayCardState();
}

class _TodayCardState extends ConsumerState<_TodayCard> {
  static const _allowances = {'LUNCH': 60, 'SHORT': 15};

  bool   _loading      = false;
  bool   _breakLoading = false;
  Timer? _breakTimer;
  int    _breakSecs    = 0;
  String? _trackedBreakStart;

  @override
  void dispose() {
    _breakTimer?.cancel();
    super.dispose();
  }

  static Map<String, dynamic>? _findActive(Map<String, dynamic>? bs) {
    if (bs == null) return null;
    return (bs['lunch'] as Map<String, dynamic>?)?['active'] as Map<String, dynamic>?
        ?? (bs['short'] as Map<String, dynamic>?)?['active'] as Map<String, dynamic>?;
  }

  void _syncBreakTimer(Map<String, dynamic>? activeBreak) {
    final start = activeBreak?['break_start'] as String?;
    if (start == _trackedBreakStart) return;
    _trackedBreakStart = start;
    _breakTimer?.cancel();
    _breakTimer = null;
    _breakSecs  = 0;
    if (start != null) {
      // IST times stored without TZ — parse as local, no 'Z' suffix
      final t = DateTime.parse(start.replaceFirst(' ', 'T'));
      void tick() { _breakSecs = DateTime.now().difference(t).inSeconds.clamp(0, 86400); }
      tick();
      _breakTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(tick);
      });
    }
  }

  Future<void> _checkIn() async {
    setState(() => _loading = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/attendance/check-in',
        data: {'client_time': _clientTime()},
      );
      _invalidateAll();
      if (mounted) _snack('Checked in successfully!', AppColors.success);
    } catch (e) {
      if (mounted) _handleCheckInError(e);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _checkInWfh(String reason) async {
    setState(() => _loading = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/attendance/check-in',
        data: {
          'client_time': _clientTime(),
          'is_wfh': true,
          if (reason.isNotEmpty) 'wfh_reason': reason,
        },
      );
      _invalidateAll();
      if (mounted) _snack('Checked in as WFH', AppColors.info);
    } catch (e) {
      if (mounted) _snack('WFH check-in failed: $e', AppColors.error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _checkOut() async {
    setState(() => _loading = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/attendance/check-out',
        data: {'client_time': _clientTime()},
      );
      _invalidateAll();
      if (mounted) _snack('Checked out!', AppColors.success);
    } catch (e) {
      if (mounted) _snack('Check-out failed: $e', AppColors.error);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _startBreak(String type) async {
    setState(() => _breakLoading = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/attendance/break-start',
        data: {'client_time': _clientTime(), 'break_type': type},
      );
      ref.invalidate(myAttendanceProvider);
    } catch (e) {
      if (mounted) _snack('Break start failed: $e', AppColors.error);
    } finally {
      if (mounted) setState(() => _breakLoading = false);
    }
  }

  Future<void> _endBreak() async {
    setState(() => _breakLoading = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/attendance/break-end',
        data: {'client_time': _clientTime()},
      );
      ref.invalidate(myAttendanceProvider);
    } catch (e) {
      if (mounted) _handleBreakEndError(e);
    } finally {
      if (mounted) setState(() => _breakLoading = false);
    }
  }

  void _handleBreakEndError(Object e) {
    final msg = e.toString().toLowerCase();
    if (msg.contains('403') || msg.contains('office network') || msg.contains('ip')) {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Cannot End Break'),
          content: const Text(
              'You must be on the office network to end your break.\n\nPlease connect to the office Wi-Fi and try again.'),
          actions: [
            FilledButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK')),
          ],
        ),
      );
    } else {
      _snack('Break end failed: $e', AppColors.error);
    }
  }

  void _invalidateAll() {
    ref.invalidate(myAttendanceProvider);
    ref.invalidate(liveAttendanceProvider);
    ref.invalidate(attendanceSummaryProvider);
    ref.invalidate(weeklyRecordsProvider);
  }

  void _handleCheckInError(Object e) {
    final msg = e.toString().toLowerCase();
    if (msg.contains('403') || msg.contains('not allowed') || msg.contains('ip')) {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Check-in Blocked'),
          content: const Text(
            'Check-in is not allowed from this network.\n\nYou can still check in as Working From Home.'),
          actions: [
            TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('Cancel')),
            FilledButton(
              onPressed: () { Navigator.pop(ctx); _showWfhDialog(); },
              child: const Text('Check In WFH'),
            ),
          ],
        ),
      );
    } else {
      _snack('Check-in failed: $e', AppColors.error);
    }
  }

  void _showWfhDialog() {
    final ctrl = TextEditingController();
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Row(children: [
          Icon(Icons.home_rounded, color: AppColors.info, size: 20),
          SizedBox(width: 8),
          Text('WFH Check-in'),
        ]),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          const Text('A notification will be sent to your manager.',
              style: TextStyle(fontSize: 13)),
          const SizedBox(height: 12),
          TextField(
            controller: ctrl,
            decoration: const InputDecoration(
              labelText: 'Reason (optional)',
              hintText: 'e.g. Doctor appointment…',
            ),
            maxLines: 2,
            textCapitalization: TextCapitalization.sentences,
          ),
        ]),
        actions: [
          TextButton(
            onPressed: () { Navigator.pop(ctx); ctrl.dispose(); },
            child: const Text('Cancel'),
          ),
          FilledButton(
            onPressed: () {
              final reason = ctrl.text.trim();
              Navigator.pop(ctx);
              ctrl.dispose();
              _checkInWfh(reason);
            },
            child: const Text('Check In WFH'),
          ),
        ],
      ),
    );
  }

  void _snack(String msg, Color color) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(msg), backgroundColor: color),
    );
  }

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final myRecord = ref.watch(myAttendanceProvider);

    return myRecord.when(
      loading: () => const ShimmerCard(height: 220),
      error: (e, _) => Container(
        padding: const EdgeInsets.all(20),
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(18),
          border: Border.all(color: ds.border),
        ),
        child: Text('Failed to load attendance: $e',
            style: const TextStyle(color: AppColors.error)),
      ),
      data: (record) {
        final bs          = record['breakSummary'] as Map<String, dynamic>?;
        final activeBreak = _findActive(bs);
        _syncBreakTimer(activeBreak); // idempotent, safe in build
        return _buildCard(ds, record, bs, activeBreak);
      },
    );
  }

  Widget _buildCard(
    DsColors ds,
    Map<String, dynamic> record,
    Map<String, dynamic>? bs,
    Map<String, dynamic>? activeBreak,
  ) {
    final status       = record['status'] as String? ?? 'ABSENT';
    final checkedIn    = record['checkInTime']  as String?;
    final checkedOut   = record['checkOutTime'] as String?;
    final hours        = (record['hoursWorked'] as num?)?.toDouble() ?? 0.0;
    final netHours     = (record['netHours'] as num?)?.toDouble() ?? hours;
    final totalBreakMins = (record['totalBreakMinutes'] as num?)?.toInt() ?? 0;
    final isWfh        = record['isWfh'] as bool? ?? false;
    final isWorking  = checkedIn != null && checkedOut == null;
    final onBreak    = activeBreak != null;

    final lunchInfo = bs?['lunch'] as Map<String, dynamic>? ?? {};
    final shortInfo = bs?['short'] as Map<String, dynamic>? ?? {};
    final breakType = activeBreak?['break_type'] as String? ?? 'SHORT';
    final allowance = _allowances[breakType] ?? 15;
    final breakMins = _breakSecs ~/ 60;
    final isOverBreak = breakMins > allowance;
    final overMins  = (breakMins - allowance).clamp(0, 9999);

    final (statusColor, statusLabel, statusIcon) = _statusInfo(status);
    final now = DateFormat('EEEE, d MMMM yyyy').format(DateTime.now());

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [statusColor.withOpacity(0.12), ds.bgCard],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: statusColor.withOpacity(0.3)),
      ),
      child: Column(children: [
        // ── Header ────────────────────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 0),
          child: Row(children: [
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: statusColor.withOpacity(0.15),
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(statusIcon, color: statusColor, size: 22),
            ),
            const SizedBox(width: 12),
            Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(now, style: TextStyle(fontSize: 12, color: ds.textMuted)),
              const SizedBox(height: 2),
              Row(children: [
                Text(statusLabel, style: TextStyle(fontSize: 18,
                    fontWeight: FontWeight.w800, color: statusColor)),
                if (isWfh) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.info.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(5),
                    ),
                    child: const Text('WFH', style: TextStyle(fontSize: 10,
                        fontWeight: FontWeight.w700, color: AppColors.info)),
                  ),
                ],
              ]),
            ])),
          ]),
        ),

        // ── Check-in / out time chips ─────────────────────────────────────────
        if (checkedIn != null || hours > 0)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Row(children: [
              if (checkedIn != null)
                _TimeChip(icon: Icons.login_rounded, label: 'In',
                    time: _formatTime(checkedIn), color: AppColors.success),
              if (checkedIn != null && checkedOut != null) const SizedBox(width: 10),
              if (checkedOut != null)
                _TimeChip(icon: Icons.logout_rounded, label: 'Out',
                    time: _formatTime(checkedOut), color: AppColors.error),
              if (hours > 0) ...[
                const SizedBox(width: 10),
                _TimeChip(
                  icon: Icons.schedule_rounded,
                  label: totalBreakMins > 0 ? 'Net Hrs' : 'Hours',
                  time: '${netHours.toStringAsFixed(1)}h',
                  color: AppColors.primaryLight,
                ),
              ],
            ]),
          ),

        // ── Active break display ──────────────────────────────────────────────
        if (onBreak) ...[
          const SizedBox(height: 12),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: (isOverBreak ? AppColors.ragRed : AppColors.ragAmber).withOpacity(0.1),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                    color: (isOverBreak ? AppColors.ragRed : AppColors.ragAmber).withOpacity(0.3)),
              ),
              child: Row(children: [
                Icon(
                  breakType == 'LUNCH' ? Icons.restaurant_rounded : Icons.coffee_rounded,
                  color: isOverBreak ? AppColors.ragRed : AppColors.ragAmber,
                  size: 14,
                ),
                const SizedBox(width: 6),
                Text(
                  '${breakType == 'LUNCH' ? 'Lunch' : 'Short'} Break  '
                  '${(_breakSecs ~/ 60).toString().padLeft(2, '0')}:'
                  '${(_breakSecs % 60).toString().padLeft(2, '0')}',
                  style: TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w600,
                    color: isOverBreak ? AppColors.ragRed : AppColors.ragAmber,
                  ),
                ),
                if (isOverBreak) ...[
                  const SizedBox(width: 6),
                  Icon(Icons.warning_rounded, size: 12, color: AppColors.ragRed),
                  Text('  +${overMins}m',
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                          color: AppColors.ragRed)),
                ],
                const Spacer(),
                GestureDetector(
                  onTap: _breakLoading ? null : _endBreak,
                  child: Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.ragAmber.withOpacity(0.2),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      _breakLoading ? '…' : 'End Break',
                      style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                          color: AppColors.ragAmber),
                    ),
                  ),
                ),
              ]),
            ),
          ),
        ],

        // ── Break buttons — only when working and not on break ────────────────
        if (isWorking && !onBreak) ...[
          const SizedBox(height: 10),
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(children: [
              Expanded(child: _BreakButton(
                icon: Icons.restaurant_rounded,
                label: 'Lunch',
                remaining: lunchInfo.isEmpty ? 60 : _intVal(lunchInfo['remaining_minutes']),
                loading: _breakLoading,
                onTap: () => _startBreak('LUNCH'),
              )),
              const SizedBox(width: 8),
              Expanded(child: _BreakButton(
                icon: Icons.coffee_rounded,
                label: 'Short Break',
                remaining: shortInfo.isEmpty ? 15 : _intVal(shortInfo['remaining_minutes']),
                loading: _breakLoading,
                onTap: () => _startBreak('SHORT'),
              )),
            ]),
          ),
        ],

        // ── Post-checkout break summary ───────────────────────────────────────
        if (checkedOut != null && bs != null)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 10, 16, 0),
            child: _BreakSummaryRow(bs: bs),
          ),

        // ── Action buttons ────────────────────────────────────────────────────
        Padding(
          padding: const EdgeInsets.all(16),
          child: _loading
              ? const Center(child: SizedBox(width: 24, height: 24,
                    child: CircularProgressIndicator(strokeWidth: 2)))
              : _buildActions(status, checkedIn, checkedOut),
        ),
      ]),
    ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.05);
  }

  Widget _buildActions(String status, String? checkedIn, String? checkedOut) {
    final canCheckIn  = checkedIn == null;
    final canCheckOut = checkedIn != null && checkedOut == null;
    final dayDone     = checkedIn != null && checkedOut != null;

    if (dayDone) {
      return Container(
        padding: const EdgeInsets.all(12),
        decoration: BoxDecoration(
          color: AppColors.success.withOpacity(0.1),
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.check_circle_rounded, color: AppColors.success, size: 16),
          SizedBox(width: 8),
          Text('Day Complete', style: TextStyle(color: AppColors.success, fontWeight: FontWeight.w600)),
        ]),
      );
    }

    return Row(children: [
      if (canCheckIn) ...[
        Expanded(child: _Btn(
          icon: Icons.login_rounded, label: 'Check In',
          color: AppColors.success, onTap: _checkIn,
        )),
        const SizedBox(width: 10),
        Expanded(child: _Btn(
          icon: Icons.home_rounded, label: 'WFH',
          color: AppColors.info, onTap: _showWfhDialog,
        )),
      ],
      if (canCheckOut)
        Expanded(child: _Btn(
          icon: Icons.logout_rounded, label: 'Check Out',
          color: AppColors.ragRed, onTap: _checkOut,
        )),
    ]);
  }

  static (Color, String, IconData) _statusInfo(String status) => switch (status) {
    'PRESENT' => (AppColors.success,   'Present',        Icons.check_circle_rounded),
    'ABSENT'  => (AppColors.ragRed,    'Not Checked In', Icons.cancel_rounded),
    'WFH'     => (AppColors.info,      'Work From Home', Icons.home_rounded),
    'LATE'    => (AppColors.ragAmber,  'Late',           Icons.schedule_rounded),
    _         => (AppColors.textMuted, status,           Icons.help_outline_rounded),
  };

  static String _formatTime(String iso) {
    try {
      final s = iso.contains('T') ? iso : iso.replaceFirst(' ', 'T');
      return DateFormat('h:mm a').format(DateTime.parse(s).toLocal());
    } catch (_) { return iso; }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Break widgets
// ─────────────────────────────────────────────────────────────────────────────

class _BreakButton extends StatelessWidget {
  const _BreakButton({
    required this.icon,
    required this.label,
    required this.remaining,
    required this.loading,
    required this.onTap,
  });
  final IconData icon;
  final String label;
  final int remaining;
  final bool loading;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds        = context.ds;
    final exhausted = remaining <= 0;
    final Color color = exhausted ? ds.textMuted : AppColors.ragAmber;

    return GestureDetector(
      onTap: (loading || exhausted) ? null : onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        decoration: BoxDecoration(
          color: exhausted ? ds.bgCard : AppColors.ragAmber.withOpacity(0.08),
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
              color: exhausted ? ds.border : AppColors.ragAmber.withOpacity(0.3)),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon, size: 13, color: color),
          const SizedBox(width: 5),
          Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
              color: color)),
          const SizedBox(width: 4),
          Text('${remaining}m',
              style: TextStyle(fontSize: 11, color: color.withOpacity(0.65))),
        ]),
      ),
    );
  }
}

class _BreakSummaryRow extends StatelessWidget {
  const _BreakSummaryRow({required this.bs});
  final Map<String, dynamic> bs;

  @override
  Widget build(BuildContext context) {
    final lunch = bs['lunch'] as Map<String, dynamic>?;
    final short = bs['short'] as Map<String, dynamic>?;
    final lunchUsed = _intVal(lunch?['used_minutes']);
    final shortUsed = _intVal(short?['used_minutes']);
    final lunchOver = _intVal(lunch?['exceeded_minutes']);
    final shortOver = _intVal(short?['exceeded_minutes']);

    if (lunchUsed == 0 && shortUsed == 0) return const SizedBox.shrink();

    return Row(children: [
      if (lunchUsed > 0)
        _BreakChip(Icons.restaurant_rounded, lunchUsed, lunchOver),
      if (lunchUsed > 0 && shortUsed > 0) const SizedBox(width: 6),
      if (shortUsed > 0)
        _BreakChip(Icons.coffee_rounded, shortUsed, shortOver),
    ]);
  }
}

class _BreakChip extends StatelessWidget {
  const _BreakChip(this.icon, this.used, this.over);
  final IconData icon;
  final int used;
  final int over;

  @override
  Widget build(BuildContext context) {
    final color = over > 0 ? AppColors.ragRed : AppColors.ragAmber;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(icon, size: 10, color: color),
        const SizedBox(width: 3),
        Text(_fmtMins(used),
            style: TextStyle(fontSize: 10, fontWeight: FontWeight.w600, color: color)),
        if (over > 0)
          Text(' +${over}m',
              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                  color: AppColors.ragRed)),
      ]),
    );
  }

  static String _fmtMins(int m) {
    final h = m ~/ 60;
    final rem = m % 60;
    return h > 0 ? '${h}h ${rem}m' : '${m}m';
  }
}

class _BreakMinutesChip extends StatelessWidget {
  const _BreakMinutesChip(this.totalMins);
  final int totalMins;

  @override
  Widget build(BuildContext context) {
    final h = totalMins ~/ 60;
    final m = totalMins % 60;
    final label = h > 0 ? '${h}h ${m}m break' : '${totalMins}m break';
    return Row(mainAxisSize: MainAxisSize.min, children: [
      const Icon(Icons.free_breakfast_rounded, size: 11, color: AppColors.ragAmber),
      const SizedBox(width: 4),
      Text(label,
          style: const TextStyle(
              fontSize: 11, color: AppColors.ragAmber, fontWeight: FontWeight.w500)),
    ]);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tab 1 — This Week
// ─────────────────────────────────────────────────────────────────────────────

class _WeeklyTab extends ConsumerWidget {
  const _WeeklyTab();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds      = context.ds;
    final records = ref.watch(weeklyRecordsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(weeklyRecordsProvider),
      color: AppColors.primaryLight,
      child: records.when(
        data: (list) {
          final Map<String, Map<String, dynamic>> byDate = {};
          for (final r in list) {
            final d = r['attendanceDate'] as String?;
            if (d != null) byDate[d] = r;
          }

          final now = DateTime.now();
          final mon = now.subtract(Duration(days: now.weekday - 1));
          final days = List.generate(now.weekday, (i) => mon.add(Duration(days: i)));

          double totalHours = 0;
          int presentDays = 0, wfhDays = 0, absentDays = 0;

          for (final day in days) {
            final key    = DateFormat('yyyy-MM-dd').format(day);
            final r      = byDate[key];
            final status = r?['status'] as String? ?? 'ABSENT';
            final hrs    = (r?['netHours'] as num?)?.toDouble()
                        ?? (r?['hoursWorked'] as num?)?.toDouble() ?? 0;
            totalHours += hrs;
            if (status == 'PRESENT' || status == 'LATE') presentDays++;
            else if (status == 'WFH') { wfhDays++; presentDays++; }
            else absentDays++;
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Row(children: [
                Expanded(child: _StatMini('Present', '$presentDays/${days.length}', AppColors.success, Icons.check_circle_rounded)),
                const SizedBox(width: 8),
                Expanded(child: _StatMini('WFH', '$wfhDays', AppColors.info, Icons.home_rounded)),
                const SizedBox(width: 8),
                Expanded(child: _StatMini('Absent', '$absentDays', AppColors.ragRed, Icons.cancel_rounded)),
                const SizedBox(width: 8),
                Expanded(child: _StatMini('Hours', '${totalHours.toStringAsFixed(1)}h', AppColors.primaryLight, Icons.schedule_rounded)),
              ]),
              const SizedBox(height: 20),
              Text('DAILY BREAKDOWN',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                      color: ds.textMuted, letterSpacing: 1.2)),
              const SizedBox(height: 10),
              ...days.map((day) {
                final key    = DateFormat('yyyy-MM-dd').format(day);
                final record = byDate[key];
                return _DayRow(day: day, record: record);
              }),
            ],
          );
        },
        loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children: List.generate(5, (_) => const ShimmerCard(height: 72)),
        ),
        error: (e, _) => Center(
          child: Text('$e', style: const TextStyle(color: AppColors.error)),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tab 2 — Monthly
// ─────────────────────────────────────────────────────────────────────────────

class _MonthlyTab extends ConsumerStatefulWidget {
  const _MonthlyTab();

  @override
  ConsumerState<_MonthlyTab> createState() => _MonthlyTabState();
}

class _MonthlyTabState extends ConsumerState<_MonthlyTab> {
  late int _year;
  late int _month;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _year  = now.year;
    _month = now.month;
  }

  void _prev() => setState(() {
    if (_month == 1) { _month = 12; _year--; } else _month--;
  });

  void _next() {
    final now = DateTime.now();
    if (_year > now.year || (_year == now.year && _month >= now.month)) return;
    setState(() {
      if (_month == 12) { _month = 1; _year++; } else _month++;
    });
  }

  @override
  Widget build(BuildContext context) {
    final ds         = context.ds;
    final key        = (year: _year, month: _month);
    final summary    = ref.watch(monthlySummaryProvider(key));
    final monthLabel = DateFormat('MMMM yyyy').format(DateTime(_year, _month));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(monthlySummaryProvider(key)),
      color: AppColors.primaryLight,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Container(
            decoration: BoxDecoration(
              color: ds.bgCard,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: ds.border),
            ),
            child: Row(children: [
              IconButton(
                icon: const Icon(Icons.chevron_left_rounded),
                onPressed: _prev,
                color: ds.textSecondary,
              ),
              Expanded(child: Center(
                child: Text(monthLabel,
                    style: TextStyle(fontWeight: FontWeight.w700,
                        fontSize: 15, color: ds.textPrimary)),
              )),
              IconButton(
                icon: Icon(Icons.chevron_right_rounded,
                    color: (_year == DateTime.now().year && _month >= DateTime.now().month)
                        ? ds.border : ds.textSecondary),
                onPressed: _next,
              ),
            ]),
          ),
          const SizedBox(height: 16),
          summary.when(
            data: (data) {
              final s    = data['summary'] as Map<String, dynamic>? ?? {};
              final recs = data['records'] as List<Map<String, dynamic>>? ?? [];

              final present    = _intVal(s['present']);
              final absent     = _intVal(s['absent']);
              final wfh        = _intVal(s['wfh']);
              final late       = _intVal(s['late']);
              final totalHours = _numVal(s['net_hours'] ?? s['total_hours']);

              final Map<String, Map<String, dynamic>> byDate = {};
              for (final r in recs) {
                final d = r['attendanceDate'] as String?;
                if (d != null) byDate[d] = r;
              }

              return Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  GridView.count(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisCount: 3,
                    mainAxisSpacing: 8,
                    crossAxisSpacing: 8,
                    childAspectRatio: 1.2,
                    children: [
                      _StatMini('Present', '$present', AppColors.success,    Icons.check_circle_rounded),
                      _StatMini('Absent',  '$absent',  AppColors.ragRed,     Icons.cancel_rounded),
                      _StatMini('WFH',     '$wfh',     AppColors.info,       Icons.home_rounded),
                      _StatMini('Late',    '$late',    AppColors.ragAmber,   Icons.schedule_rounded),
                      _StatMini('Hours',   '${totalHours.toStringAsFixed(1)}h', AppColors.primaryLight, Icons.timer_rounded),
                      _StatMini('Days',    '${present + absent + wfh + late}', ds.textSecondary, Icons.calendar_today_rounded),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Text('ATTENDANCE LOG',
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                          color: ds.textMuted, letterSpacing: 1.2)),
                  const SizedBox(height: 10),
                  if (recs.isEmpty)
                    Center(child: Padding(
                      padding: const EdgeInsets.all(24),
                      child: Text('No records for $monthLabel',
                          style: TextStyle(color: ds.textMuted)),
                    ))
                  else
                    ...recs.map((r) {
                      final dateStr = r['attendanceDate'] as String? ?? '';
                      DateTime? day;
                      try { day = DateTime.parse(dateStr); } catch (_) {}
                      return _DayRow(day: day, record: r);
                    }),
                ],
              );
            },
            loading: () => Column(
              children: List.generate(6, (_) => const ShimmerCard(height: 72)),
            ),
            error: (e, _) => Center(
              child: Text('$e', style: const TextStyle(color: AppColors.error)),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tab 3 — Team (Admin only)
// ─────────────────────────────────────────────────────────────────────────────

class _TeamTab extends ConsumerStatefulWidget {
  const _TeamTab();

  @override
  ConsumerState<_TeamTab> createState() => _TeamTabState();
}

class _TeamTabState extends ConsumerState<_TeamTab> {
  late DateTime _from;
  late DateTime _to;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _from = now.subtract(Duration(days: now.weekday - 1));
    _to   = now;
  }

  Future<void> _pickFrom() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _from,
      firstDate: DateTime(2023),
      lastDate: _to,
    );
    if (d != null) setState(() => _from = d);
  }

  Future<void> _pickTo() async {
    final d = await showDatePicker(
      context: context,
      initialDate: _to,
      firstDate: _from,
      lastDate: DateTime.now(),
    );
    if (d != null) setState(() => _to = d);
  }

  @override
  Widget build(BuildContext context) {
    final ds   = context.ds;
    final fmtS = DateFormat('yyyy-MM-dd');
    final fmtD = DateFormat('d MMM');
    final key  = (from: fmtS.format(_from), to: fmtS.format(_to));
    final recs = ref.watch(teamRecordsProvider(key));

    return Column(
      children: [
        Container(
          color: ds.bgCard,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
          child: Row(children: [
            Expanded(child: _DateBtn(label: 'From', value: fmtD.format(_from), onTap: _pickFrom)),
            const SizedBox(width: 10),
            Icon(Icons.arrow_forward_rounded, size: 16, color: ds.textMuted),
            const SizedBox(width: 10),
            Expanded(child: _DateBtn(label: 'To', value: fmtD.format(_to), onTap: _pickTo)),
            const SizedBox(width: 12),
            FilledButton(
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.primaryLight,
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
              ),
              onPressed: () => ref.invalidate(teamRecordsProvider(key)),
              child: const Text('Refresh', style: TextStyle(fontSize: 13)),
            ),
          ]),
        ),
        Expanded(child: RefreshIndicator(
          onRefresh: () async => ref.invalidate(teamRecordsProvider(key)),
          color: AppColors.primaryLight,
          child: recs.when(
            data: (list) {
              if (list.isEmpty) {
                return Center(child: Text('No records for selected range',
                    style: TextStyle(color: ds.textMuted)));
              }

              final Map<String, List<Map<String, dynamic>>> grouped = {};
              for (final r in list) {
                final d = r['attendanceDate'] as String? ?? 'Unknown';
                grouped.putIfAbsent(d, () => []).add(r);
              }
              final sortedDates = grouped.keys.toList()..sort((a, b) => b.compareTo(a));

              return ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: sortedDates.length,
                itemBuilder: (_, i) {
                  final dateStr = sortedDates[i];
                  final dayRecs = grouped[dateStr]!;
                  DateTime? dt;
                  try { dt = DateTime.parse(dateStr); } catch (_) {}
                  final label = dt != null
                      ? DateFormat('EEE, d MMM yyyy').format(dt)
                      : dateStr;

                  int present = 0, absent = 0, wfh = 0;
                  for (final r in dayRecs) {
                    switch (r['status'] as String? ?? '') {
                      case 'PRESENT': present++; break;
                      case 'WFH':    wfh++; present++; break;
                      case 'LATE':   present++; break;
                      case 'ABSENT': absent++; break;
                    }
                  }

                  return Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Padding(
                        padding: const EdgeInsets.only(bottom: 8, top: 4),
                        child: Row(children: [
                          Expanded(child: Text(label, style: TextStyle(
                              fontWeight: FontWeight.w700, fontSize: 13, color: ds.textPrimary))),
                          _MiniChip('$present P', AppColors.success),
                          const SizedBox(width: 4),
                          if (wfh > 0) ...[
                            _MiniChip('$wfh W', AppColors.info),
                            const SizedBox(width: 4),
                          ],
                          if (absent > 0) _MiniChip('$absent A', AppColors.ragRed),
                        ]),
                      ),
                      ...dayRecs.map((r) => _TeamMemberTile(r)),
                      const SizedBox(height: 12),
                    ],
                  );
                },
              );
            },
            loading: () => ListView(
              padding: const EdgeInsets.all(16),
              children: List.generate(5, (_) => const ShimmerCard(height: 68)),
            ),
            error: (e, _) => Center(
              child: Text('$e', style: const TextStyle(color: AppColors.error)),
            ),
          ),
        )),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared sub-widgets
// ─────────────────────────────────────────────────────────────────────────────

class _DayRow extends StatelessWidget {
  const _DayRow({this.day, this.record});
  final DateTime? day;
  final Map<String, dynamic>? record;

  @override
  Widget build(BuildContext context) {
    final ds      = context.ds;
    final status   = record?['status']           as String? ?? 'ABSENT';
    final inTime   = record?['checkInTime']      as String?;
    final outTime  = record?['checkOutTime']     as String?;
    final hours    = (record?['hoursWorked']     as num?)?.toDouble() ?? 0;
    final netHours = (record?['netHours']        as num?)?.toDouble() ?? hours;
    final breakMins = (record?['totalBreakMinutes'] as num?)?.toInt() ?? 0;
    final isWfh    = record?['isWfh']            as bool? ?? false;
    final bs       = record?['breakSummary']     as Map<String, dynamic>?;

    final (color, icon) = _statusStyle(status);
    final dayLabel  = day != null ? DateFormat('EEE').format(day!)  : '—';
    final dateLabel = day != null ? DateFormat('d MMM').format(day!) : '';
    final isToday   = day != null &&
        DateFormat('yyyy-MM-dd').format(day!) ==
        DateFormat('yyyy-MM-dd').format(DateTime.now());

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: isToday ? color.withOpacity(0.06) : ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: isToday ? color.withOpacity(0.35) : ds.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          SizedBox(
            width: 44,
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Text(dayLabel, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: ds.textMuted)),
              Text(dateLabel, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w800,
                  color: isToday ? color : ds.textPrimary)),
            ]),
          ),
          const SizedBox(width: 12),
          Container(
            width: 36, height: 36,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(icon, size: 18, color: color),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            _StatusPill(status, isWfh),
            if (inTime != null) ...[
              const SizedBox(height: 3),
              Row(children: [
                Icon(Icons.login_rounded, size: 11, color: ds.textMuted),
                const SizedBox(width: 3),
                Text(_fmt(inTime), style: TextStyle(fontSize: 11, color: ds.textMuted)),
                if (outTime != null) ...[
                  const SizedBox(width: 8),
                  Icon(Icons.logout_rounded, size: 11, color: ds.textMuted),
                  const SizedBox(width: 3),
                  Text(_fmt(outTime), style: TextStyle(fontSize: 11, color: ds.textMuted)),
                ],
              ]),
            ],
          ])),
          if (hours > 0)
            Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                decoration: BoxDecoration(
                  color: AppColors.primaryLight.withOpacity(0.1),
                  borderRadius: BorderRadius.circular(7),
                ),
                child: Text('${netHours.toStringAsFixed(1)}h',
                    style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
                        color: AppColors.primaryLight)),
              ),
              if (breakMins > 0 && bs == null)
                Padding(
                  padding: const EdgeInsets.only(top: 2),
                  child: Text('${breakMins}m break',
                      style: TextStyle(fontSize: 10,
                          color: AppColors.ragAmber, fontWeight: FontWeight.w500)),
                ),
            ]),
        ]),
        // Break summary — always shown when break data exists
        if (bs != null) ...[
          const SizedBox(height: 6),
          _BreakSummaryRow(bs: bs),
        ] else if (breakMins > 0) ...[
          const SizedBox(height: 5),
          _BreakMinutesChip(breakMins),
        ],
      ]),
    ).animate().fadeIn(duration: 300.ms);
  }

  static (Color, IconData) _statusStyle(String s) => switch (s) {
    'PRESENT' => (AppColors.success,   Icons.check_circle_rounded),
    'WFH'     => (AppColors.info,      Icons.home_rounded),
    'LATE'    => (AppColors.ragAmber,  Icons.schedule_rounded),
    'ABSENT'  => (AppColors.ragRed,    Icons.cancel_rounded),
    _         => (AppColors.textMuted, Icons.help_outline_rounded),
  };

  static String _fmt(String iso) {
    try {
      final dt = DateTime.parse(iso.contains('T') ? iso : iso.replaceFirst(' ', 'T'));
      return DateFormat('h:mm a').format(dt.toLocal());
    } catch (_) { return iso; }
  }
}

class _TeamMemberTile extends StatelessWidget {
  const _TeamMemberTile(this.record);
  final Map<String, dynamic> record;

  @override
  Widget build(BuildContext context) {
    final ds         = context.ds;
    final name       = record['name']             as String? ?? '—';
    final status     = record['status']           as String? ?? 'ABSENT';
    final inTime     = record['checkInTime']      as String?;
    final outTime    = record['checkOutTime']     as String?;
    final netHours   = (record['netHours']        as num?)?.toDouble()
                    ?? (record['hoursWorked']     as num?)?.toDouble() ?? 0;
    final breakMins  = (record['totalBreakMinutes'] as num?)?.toInt() ?? 0;
    final isWfh      = record['isWfh']            as bool? ?? false;
    final bs         = record['breakSummary']     as Map<String, dynamic>?;
    final avatarUrl  = record['avatarUrl']        as String?;

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ds.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          UserAvatar(name: name, avatarUrl: avatarUrl, radius: 18, border: false),
          const SizedBox(width: 10),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(name, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: ds.textPrimary)),
            if (inTime != null)
              Row(children: [
                Icon(Icons.login_rounded, size: 10, color: ds.textMuted),
                const SizedBox(width: 2),
                Text(_DayRow._fmt(inTime), style: TextStyle(fontSize: 11, color: ds.textMuted)),
                if (outTime != null) ...[
                  const SizedBox(width: 6),
                  Icon(Icons.logout_rounded, size: 10, color: ds.textMuted),
                  const SizedBox(width: 2),
                  Text(_DayRow._fmt(outTime), style: TextStyle(fontSize: 11, color: ds.textMuted)),
                ],
              ]),
          ])),
          Column(crossAxisAlignment: CrossAxisAlignment.end, children: [
            _StatusPill(status, isWfh),
            if (netHours > 0) ...[
              const SizedBox(height: 3),
              Row(children: [
                Text('${netHours.toStringAsFixed(1)}h',
                    style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w600,
                        color: AppColors.primaryLight)),
                if (breakMins > 0 && bs == null) ...[
                  const SizedBox(width: 4),
                  Text('(${breakMins}m brk)',
                      style: TextStyle(fontSize: 10, color: ds.textMuted)),
                ],
              ]),
            ],
          ]),
        ]),
        if (bs != null) ...[
          const SizedBox(height: 6),
          _BreakSummaryRow(bs: bs),
        ] else if (breakMins > 0) ...[
          const SizedBox(height: 4),
          Row(children: [
            Icon(Icons.free_breakfast_rounded, size: 11, color: AppColors.ragAmber),
            const SizedBox(width: 4),
            Text('Break: ${breakMins}m',
                style: const TextStyle(fontSize: 11, color: AppColors.ragAmber,
                    fontWeight: FontWeight.w500)),
          ]),
        ],
      ]),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill(this.status, this.isWfh);
  final String status;
  final bool isWfh;

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      'PRESENT' => (AppColors.success,   'Present'),
      'WFH'     => (AppColors.info,      'WFH'),
      'LATE'    => (AppColors.ragAmber,  'Late'),
      'ABSENT'  => (AppColors.ragRed,    'Absent'),
      _         => (AppColors.textMuted, status),
    };
    final displayLabel = isWfh && status == 'PRESENT' ? 'WFH' : label;
    final displayColor = isWfh && status == 'PRESENT' ? AppColors.info : color;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: displayColor.withOpacity(0.12),
        borderRadius: BorderRadius.circular(5),
        border: Border.all(color: displayColor.withOpacity(0.3)),
      ),
      child: Text(displayLabel,
          style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: displayColor)),
    );
  }
}

class _StatMini extends StatelessWidget {
  const _StatMini(this.label, this.value, this.color, this.icon);
  final String label;
  final String value;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(icon, size: 15, color: color),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: color)),
        Text(label, style: TextStyle(fontSize: 9, color: ds.textMuted, fontWeight: FontWeight.w500),
            textAlign: TextAlign.center),
      ]),
    );
  }
}

class _MiniChip extends StatelessWidget {
  const _MiniChip(this.label, this.color);
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
    decoration: BoxDecoration(
      color: color.withOpacity(0.12),
      borderRadius: BorderRadius.circular(5),
    ),
    child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
  );
}

class _DateBtn extends StatelessWidget {
  const _DateBtn({required this.label, required this.value, required this.onTap});
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 9),
        decoration: BoxDecoration(
          color: ds.bgElevated,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: ds.border),
        ),
        child: Row(children: [
          Icon(Icons.calendar_today_rounded, size: 13, color: AppColors.primaryLight),
          const SizedBox(width: 6),
          Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(label, style: TextStyle(fontSize: 9, color: ds.textMuted, fontWeight: FontWeight.w600)),
            Text(value, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: ds.textPrimary)),
          ])),
        ]),
      ),
    );
  }
}

class _TimeChip extends StatelessWidget {
  const _TimeChip({required this.icon, required this.label, required this.time, required this.color});
  final IconData icon;
  final String label;
  final String time;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 7),
    decoration: BoxDecoration(
      color: color.withOpacity(0.1),
      borderRadius: BorderRadius.circular(10),
      border: Border.all(color: color.withOpacity(0.25)),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 13, color: color),
      const SizedBox(width: 5),
      Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Text(label, style: TextStyle(fontSize: 9, color: color.withOpacity(0.7), fontWeight: FontWeight.w600)),
        Text(time, style: TextStyle(fontSize: 12, color: color, fontWeight: FontWeight.w700)),
      ]),
    ]),
  );
}

class _Btn extends StatelessWidget {
  const _Btn({required this.icon, required this.label, required this.color, required this.onTap});
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ElevatedButton.icon(
    icon: Icon(icon, size: 16),
    label: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
    style: ElevatedButton.styleFrom(
      backgroundColor: color,
      foregroundColor: Colors.white,
      padding: const EdgeInsets.symmetric(vertical: 13),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
    ),
    onPressed: onTap,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
//  Summary metrics (admin overview)
// ─────────────────────────────────────────────────────────────────────────────

class _SummarySection extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(attendanceSummaryProvider);
    return summary.when(
      data: (d) {
        if (d.isEmpty) return const SizedBox.shrink();
        return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text("TODAY'S SUMMARY",
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                  color: context.ds.textMuted, letterSpacing: 1.2)),
          const SizedBox(height: 10),
          Row(children: [
            Expanded(child: _StatMini('Present', '${d['presentCount'] ?? 0}', AppColors.success,  Icons.check_circle_rounded)),
            const SizedBox(width: 10),
            Expanded(child: _StatMini('Absent',  '${d['absentCount']  ?? 0}', AppColors.ragRed,   Icons.cancel_rounded)),
            const SizedBox(width: 10),
            Expanded(child: _StatMini('WFH',     '${d['wfhCount']     ?? 0}', AppColors.info,     Icons.home_rounded)),
            const SizedBox(width: 10),
            Expanded(child: _StatMini('Late',    '${d['lateCount']    ?? 0}', AppColors.ragAmber, Icons.schedule_rounded)),
          ]),
          const SizedBox(height: 16),
        ]);
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Live section
// ─────────────────────────────────────────────────────────────────────────────

class _LiveSection extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds   = context.ds;
    final live = ref.watch(liveAttendanceProvider);
    return live.when(
      data: (list) => list.isEmpty
          ? Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: ds.bgCard,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: ds.border),
              ),
              child: Center(child: Text('No one is checked in yet',
                  style: TextStyle(color: ds.textMuted))),
            )
          : Column(
              children: list.map((u) => _LiveUserTile(u as Map<String, dynamic>? ?? {})).toList(),
            ),
      loading: () => Column(
          children: List.generate(3, (_) => const ShimmerCard(height: 60))),
      error: (e, _) => Text('$e',
          style: const TextStyle(color: AppColors.error, fontSize: 12)),
    );
  }
}

class _LiveUserTile extends StatelessWidget {
  const _LiveUserTile(this.user);
  final Map<String, dynamic> user;

  @override
  Widget build(BuildContext context) {
    final ds   = context.ds;
    final name = user['name'] as String? ?? user['userName'] as String? ?? '—';
    final time = user['checkInTime'] as String? ?? user['check_in_time'] as String?;
    final initials = name.trim().split(' ').where((s) => s.isNotEmpty)
        .take(2).map((s) => s[0].toUpperCase()).join();

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ds.border),
      ),
      child: Row(children: [
        Container(
          width: 38, height: 38,
          decoration: BoxDecoration(shape: BoxShape.circle, gradient: AppColors.primaryGradient),
          child: Center(child: Text(initials, style: const TextStyle(
              color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13))),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(name, style: TextStyle(
            fontWeight: FontWeight.w600, fontSize: 14, color: ds.textPrimary))),
        if (time != null)
          Row(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.login_rounded, size: 12, color: AppColors.success),
            const SizedBox(width: 4),
            Text(_fmt(time), style: const TextStyle(fontSize: 11, color: AppColors.success)),
          ]),
      ]),
    );
  }

  static String _fmt(String iso) {
    try {
      final s = iso.contains('T') ? iso : iso.replaceFirst(' ', 'T');
      return DateFormat('h:mm a').format(DateTime.parse(s).toLocal());
    } catch (_) { return iso; }
  }
}
