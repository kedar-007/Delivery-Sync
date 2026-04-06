import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/ds_metric_card.dart';

// ─────────────────────────────────────────────────────────────────────────────
//  Providers
// ─────────────────────────────────────────────────────────────────────────────

/// Normalises a raw DB attendance record (snake_case fields) to camelCase.
Map<String, dynamic> _normaliseRecord(Map<String, dynamic> r) => {
  'status':       r['status'] as String? ?? 'ABSENT',
  'checkInTime':  r['check_in_time']  as String? ?? r['checkInTime']  as String?,
  'checkOutTime': r['check_out_time'] as String? ?? r['checkOutTime'] as String?,
  'isWfh':        r['is_wfh'] == true || r['is_wfh'] == 'true' || r['isWfh'] == true,
  'hoursWorked':  (r['work_hours'] as num? ?? r['hoursWorked'] as num? ?? 0).toDouble(),
};

final myAttendanceProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/attendance/my-record',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];

  // API returns a List of records ordered by date DESC
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

  // Fallback for {today: {...}, history: [...]} shape
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

// ─────────────────────────────────────────────────────────────────────────────
//  Screen
// ─────────────────────────────────────────────────────────────────────────────

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  bool _loading = false;

  Future<void> _checkIn() async {
    setState(() => _loading = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/attendance/check-in',
        data: {'timestamp': DateTime.now().toIso8601String()},
      );
      ref.invalidate(myAttendanceProvider);
      ref.invalidate(liveAttendanceProvider);
      ref.invalidate(attendanceSummaryProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Checked in successfully!'),
              backgroundColor: AppColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Check-in failed: $e'),
              backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _checkOut() async {
    setState(() => _loading = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/attendance/check-out',
        data: {'timestamp': DateTime.now().toIso8601String()},
      );
      ref.invalidate(myAttendanceProvider);
      ref.invalidate(liveAttendanceProvider);
      ref.invalidate(attendanceSummaryProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Checked out successfully!'),
              backgroundColor: AppColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Check-out failed: $e'),
              backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _markWfh() async {
    setState(() => _loading = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/attendance/wfh',
        data: {'date': DateFormat('yyyy-MM-dd').format(DateTime.now())},
      );
      ref.invalidate(myAttendanceProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Marked as Work From Home'),
              backgroundColor: AppColors.info),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
        );
      }
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds      = context.ds;
    final myRecord = ref.watch(myAttendanceProvider);

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
            },
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async {
          ref.invalidate(myAttendanceProvider);
          ref.invalidate(liveAttendanceProvider);
          ref.invalidate(attendanceSummaryProvider);
        },
        color: AppColors.primaryLight,
        child: ListView(
          padding: const EdgeInsets.all(16),
          children: [
            // ── Today's status card ──────────────────────────────────────
            myRecord.when(
              data: (record) => _TodayCard(
                record: record,
                loading: _loading,
                onCheckIn: _checkIn,
                onCheckOut: _checkOut,
                onWfh: _markWfh,
              ),
              loading: () => const ShimmerCard(height: 200),
              error: (e, _) => _TodayCard(
                record: const {},
                loading: _loading,
                onCheckIn: _checkIn,
                onCheckOut: _checkOut,
                onWfh: _markWfh,
              ),
            ),
            const SizedBox(height: 16),

            // ── Summary metrics ──────────────────────────────────────────
            _SummarySection(),
            const SizedBox(height: 20),

            // ── Who's in ─────────────────────────────────────────────────
            Text("WHO'S IN TODAY",
                style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                    color: ds.textMuted, letterSpacing: 1.2)),
            const SizedBox(height: 10),
            _LiveSection(),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Today's card
// ─────────────────────────────────────────────────────────────────────────────

class _TodayCard extends StatelessWidget {
  const _TodayCard({
    required this.record,
    required this.loading,
    required this.onCheckIn,
    required this.onCheckOut,
    required this.onWfh,
  });
  final Map<String, dynamic> record;
  final bool loading;
  final VoidCallback onCheckIn;
  final VoidCallback onCheckOut;
  final VoidCallback onWfh;

  @override
  Widget build(BuildContext context) {
    final ds        = context.ds;
    final status    = record['status'] as String? ?? 'ABSENT';
    final checkedIn = record['checkInTime'] as String?;
    final checkedOut = record['checkOutTime'] as String?;
    final hours     = (record['hoursWorked'] as num?)?.toDouble() ?? 0.0;
    final isWfh     = record['isWfh'] as bool? ?? false;

    final (statusColor, statusLabel, statusIcon) = _statusInfo(status);
    final now = DateFormat('EEEE, d MMMM yyyy').format(DateTime.now());

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          colors: [statusColor.withOpacity(0.12), ds.bgCard],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: statusColor.withOpacity(0.3)),
      ),
      child: Column(children: [
        // Header
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
                Text(statusLabel,
                    style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: statusColor)),
                if (isWfh) ...[
                  const SizedBox(width: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: AppColors.info.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(5),
                    ),
                    child: const Text('WFH',
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                            color: AppColors.info)),
                  ),
                ],
              ]),
            ])),
          ]),
        ),

        // Times row
        if (checkedIn != null || hours > 0)
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 14, 16, 0),
            child: Row(children: [
              if (checkedIn != null)
                _TimeChip(icon: Icons.login_rounded, label: 'In', time: _formatTime(checkedIn), color: AppColors.success),
              if (checkedIn != null && checkedOut != null)
                const SizedBox(width: 10),
              if (checkedOut != null)
                _TimeChip(icon: Icons.logout_rounded, label: 'Out', time: _formatTime(checkedOut), color: AppColors.error),
              if (hours > 0) ...[
                const SizedBox(width: 10),
                _TimeChip(icon: Icons.schedule_rounded, label: 'Hours',
                    time: '${hours.toStringAsFixed(1)}h', color: AppColors.primaryLight),
              ],
            ]),
          ),

        // Actions
        Padding(
          padding: const EdgeInsets.all(16),
          child: loading
              ? const Center(child: CircularProgressIndicator(strokeWidth: 2))
              : _ActionButtons(
                  status: status,
                  checkedIn: checkedIn,
                  checkedOut: checkedOut,
                  onCheckIn: onCheckIn,
                  onCheckOut: onCheckOut,
                  onWfh: onWfh,
                ),
        ),
      ]),
    ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.05);
  }

  static (Color, String, IconData) _statusInfo(String status) => switch (status) {
    'PRESENT' => (AppColors.success,       'Present',         Icons.check_circle_rounded),
    'ABSENT'  => (AppColors.ragRed,        'Not Checked In',  Icons.cancel_rounded),
    'WFH'     => (AppColors.info,          'Work From Home',  Icons.home_rounded),
    'LATE'    => (AppColors.ragAmber,      'Late',            Icons.schedule_rounded),
    _         => (AppColors.textMuted,     status,            Icons.help_outline_rounded),
  };

  static DateTime _parseTime(String s) {
    try {
      return DateTime.parse(s).toLocal();
    } catch (_) {
      final today = DateTime.now();
      final parts = s.split(':');
      return DateTime(today.year, today.month, today.day,
          int.tryParse(parts[0]) ?? 0,
          int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0,
          int.tryParse(parts.length > 2 ? parts[2] : '0') ?? 0);
    }
  }

  static String _formatTime(String iso) {
    try {
      return DateFormat('h:mm a').format(_parseTime(iso));
    } catch (_) {
      return iso;
    }
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

class _ActionButtons extends StatelessWidget {
  const _ActionButtons({
    required this.status,
    required this.checkedIn,
    required this.checkedOut,
    required this.onCheckIn,
    required this.onCheckOut,
    required this.onWfh,
  });
  final String status;
  final String? checkedIn;
  final String? checkedOut;
  final VoidCallback onCheckIn;
  final VoidCallback onCheckOut;
  final VoidCallback onWfh;

  @override
  Widget build(BuildContext context) {
    final canCheckIn  = checkedIn == null && status != 'WFH';
    final canCheckOut = checkedIn != null && checkedOut == null;
    final canWfh      = checkedIn == null && status != 'WFH';

    return Row(children: [
      if (canCheckIn)
        Expanded(child: _Btn(
          icon: Icons.login_rounded,
          label: 'Check In',
          color: AppColors.success,
          onTap: onCheckIn,
        )),
      if (canCheckIn && canWfh) const SizedBox(width: 10),
      if (canWfh)
        Expanded(child: _Btn(
          icon: Icons.home_rounded,
          label: 'Work From Home',
          color: AppColors.info,
          onTap: onWfh,
        )),
      if (canCheckOut)
        Expanded(child: _Btn(
          icon: Icons.logout_rounded,
          label: 'Check Out',
          color: AppColors.ragRed,
          onTap: onCheckOut,
        )),
      if (!canCheckIn && !canCheckOut && !canWfh)
        Expanded(child: Container(
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
        )),
    ]);
  }
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
//  Summary metrics
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
            Expanded(child: _StatTile('Present',
                '${d['presentCount'] ?? 0}', AppColors.success, Icons.check_circle_rounded)),
            const SizedBox(width: 10),
            Expanded(child: _StatTile('Absent',
                '${d['absentCount'] ?? 0}', AppColors.ragRed, Icons.cancel_rounded)),
            const SizedBox(width: 10),
            Expanded(child: _StatTile('WFH',
                '${d['wfhCount'] ?? 0}', AppColors.info, Icons.home_rounded)),
            const SizedBox(width: 10),
            Expanded(child: _StatTile('Late',
                '${d['lateCount'] ?? 0}', AppColors.ragAmber, Icons.schedule_rounded)),
          ]),
        ]);
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile(this.label, this.value, this.color, this.icon);
  final String label;
  final String value;
  final Color color;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 8),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(children: [
        Icon(icon, size: 16, color: color),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color)),
        Text(label, style: TextStyle(fontSize: 10, color: ds.textMuted, fontWeight: FontWeight.w500)),
      ]),
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
      error: (e, _) => Text('$e', style: const TextStyle(color: AppColors.error, fontSize: 12)),
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
    final time = user['checkInTime'] as String?;
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
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: AppColors.primaryGradient,
          ),
          child: Center(child: Text(initials, style: const TextStyle(
              color: Colors.white, fontWeight: FontWeight.w700, fontSize: 13))),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(name,
            style: TextStyle(fontWeight: FontWeight.w600, fontSize: 14, color: ds.textPrimary))),
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
    try { return DateFormat('h:mm a').format(DateTime.parse(iso).toLocal()); }
    catch (_) { return iso; }
  }
}
