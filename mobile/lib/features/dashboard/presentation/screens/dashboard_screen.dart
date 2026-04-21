import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/scheduler.dart';
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
import '../../../attendance/presentation/screens/attendance_screen.dart';
import '../../providers/dashboard_provider.dart';
import '../../../../app.dart' show themeModeProvider;

// ── Current user avatar — fetched from people list as fallback ───────────────
/// Falls back to the /auth/users list to find the current user's avatarUrl
/// when the auth session doesn't carry it (old cached tokens).
final _currentUserAvatarProvider = FutureProvider.autoDispose<String?>((ref) async {
  final currentUser = ref.watch(currentUserProvider);
  // If we already have a non-empty avatar from the session, use it
  if (currentUser?.avatarUrl != null && currentUser!.avatarUrl!.isNotEmpty) {
    return currentUser.avatarUrl;
  }
  if (currentUser == null) return null;
  try {
    final raw = await ApiClient.instance.get<Map<String, dynamic>>(
      '${AppConstants.baseCore}/auth/users',
      fromJson: (r) => r as Map<String, dynamic>,
    );
    final data = raw['data'];
    final List<dynamic> list = data is Map
        ? (data['users'] as List? ?? [])
        : (data is List ? data : []);
    for (final u in list) {
      final m = u as Map<String, dynamic>;
      final email = m['email'] as String? ?? '';
      if (email == currentUser.email) {
        return m['avatarUrl'] as String? ?? m['avatar_url'] as String?;
      }
    }
    return null;
  } catch (_) {
    return null;
  }
});

// ── Attendance quick-status provider ─────────────────────────────────────────

// Delegates to myAttendanceProvider so that invalidating it from the
// attendance screen (check-in / check-out / wfh) automatically refreshes
// the dashboard widget too — no separate fetch needed.
final _dashAttendanceProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  try {
    return await ref.watch(myAttendanceProvider.future);
  } catch (_) {
    return {};
  }
});

class DashboardScreen extends ConsumerWidget {
  const DashboardScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds       = context.ds;
    final user     = ref.watch(currentUserProvider);
    final summary  = ref.watch(dashboardSummaryProvider);
    final projects = ref.watch(projectsProvider);

    return Scaffold(
      backgroundColor: ds.bgPage,
      body: CustomScrollView(
        slivers: [
          _DashboardAppBar(user: user),

          // ── Standup nudge ──────────────────────────────────────────────
          SliverToBoxAdapter(
            child: summary.when(
              data: (s) => s.submittedStandup
                  ? const SizedBox.shrink()
                  : _StandupNudge(),
              loading: () => const SizedBox.shrink(),
              error: (_, __) => const SizedBox.shrink(),
            ),
          ),

          // ── Attendance check-in widget ─────────────────────────────────
          SliverToBoxAdapter(child: _AttendanceWidget()),

          // ── Section: Metrics ───────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 10),
              child: Text('OVERVIEW',
                  style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                      color: ds.textMuted, letterSpacing: 1.2)),
            ),
          ),

          SliverPadding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            sliver: SliverGrid(
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 10,
                crossAxisSpacing: 10,
                childAspectRatio: 1.15,
              ),
              delegate: SliverChildListDelegate(
                summary.when(
                  data: (s) => [
                    DsMetricCard(
                      value: s.activeProjects.toString(),
                      label: 'Active Projects',
                      icon: Icons.folder_special_rounded,
                      color: AppColors.primaryLight,
                      onTap: () => context.go('/projects'),
                    ),
                    DsMetricCard(
                      value: s.openBlockers.toString(),
                      label: 'Critical Blockers',
                      icon: Icons.block_rounded,
                      color: AppColors.error,
                    ),
                    DsMetricCard(
                      value: s.openActions.toString(),
                      label: 'Overdue Actions',
                      icon: Icons.task_alt_rounded,
                      color: AppColors.warning,
                    ),
                    DsMetricCard(
                      value: _ragLabel(s.ragBreakdown),
                      label: 'RAG: Green',
                      icon: Icons.health_and_safety_rounded,
                      color: AppColors.ragGreen,
                    ),
                  ],
                  loading: () => List.generate(4, (_) => const ShimmerCard(height: 100)),
                  error: (e, _) => [_ErrorTile(e)],
                ),
              ),
            ),
          ),

          // ── Section: Projects ──────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 10),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text('Your Projects', style: TextStyle(
                    fontSize: 15, fontWeight: FontWeight.w700, color: ds.textPrimary)),
                  GestureDetector(
                    onTap: () => context.go('/projects'),
                    child: const Text('See all', style: TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w600,
                      color: AppColors.primaryLight)),
                  ),
                ],
              ),
            ),
          ),

          projects.when(
            data: (list) => list.isEmpty
                ? SliverToBoxAdapter(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                      child: Text('No projects yet', style: TextStyle(color: ds.textMuted)),
                    ),
                  )
                : SliverList(
                    delegate: SliverChildBuilderDelegate(
                      (ctx, i) => _ProjectTile(list[i]),
                      childCount: list.length.clamp(0, 4),
                    ),
                  ),
            loading: () => SliverList(
              delegate: SliverChildBuilderDelegate(
                (_, __) => const ShimmerCard(),
                childCount: 3,
              ),
            ),
            error: (e, _) => SliverToBoxAdapter(child: _ErrorTile(e)),
          ),

          // ── Section: My Tasks ──────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 10),
              child: Consumer(
                builder: (ctx, ref, _) {
                  final tasks = ref.watch(myTasksProvider);
                  final activeCount = tasks.whenOrNull(
                    data: (list) => list
                        .where((t) => t.status != 'DONE' && t.status != 'CANCELLED')
                        .length,
                  );
                  return Row(
                    children: [
                      Text('My Tasks', style: TextStyle(
                        fontSize: 15, fontWeight: FontWeight.w700, color: ds.textPrimary)),
                      if (activeCount != null && activeCount > 0) ...[
                        const SizedBox(width: 8),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
                          decoration: BoxDecoration(
                            color: AppColors.primaryLight.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(10),
                          ),
                          child: Text('$activeCount active',
                              style: const TextStyle(
                                fontSize: 11,
                                fontWeight: FontWeight.w700,
                                color: AppColors.primaryLight)),
                        ),
                      ],
                      const Spacer(),
                      GestureDetector(
                        onTap: () => context.go('/sprints/my-tasks'),
                        child: const Text('See all', style: TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w600,
                          color: AppColors.primaryLight)),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),

          SliverToBoxAdapter(child: _MyTasksSection()),
          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }

  String _ragLabel(Map<String, int> rag) =>
      '${rag['GREEN'] ?? 0}/${rag.values.fold(0, (a, b) => a + b)}';
}

// ── App bar ───────────────────────────────────────────────────────────────────

class _DashboardAppBar extends ConsumerWidget {
  const _DashboardAppBar({this.user});
  final CurrentUser? user;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds        = context.ds;
    final now       = DateFormat('EEEE, d MMMM').format(DateTime.now());
    final isDark    = Theme.of(context).brightness == Brightness.dark;
    final avatarUrl = ref.watch(_currentUserAvatarProvider).valueOrNull;

    return SliverAppBar(
      floating: true,
      snap: true,
      pinned: false,
      toolbarHeight: 68,
      backgroundColor: ds.bgPage,
      surfaceTintColor: Colors.transparent,
      title: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(
            'Good ${_greeting()}, ${user?.name.split(' ').first ?? ''}',
            style: TextStyle(
              fontSize: 19, fontWeight: FontWeight.w800,
              color: ds.textPrimary, letterSpacing: -0.3,
            ),
          ),
          Text(now, style: TextStyle(fontSize: 12, color: ds.textMuted)),
        ],
      ),
      actions: [
        // Dark / light mode toggle
        IconButton(
          icon: Icon(
            isDark ? Icons.wb_sunny_rounded : Icons.nightlight_rounded,
            color: ds.textSecondary, size: 20,
          ),
          tooltip: isDark ? 'Light mode' : 'Dark mode',
          onPressed: () => ref.read(themeModeProvider.notifier).state =
              isDark ? ThemeMode.light : ThemeMode.dark,
        ),
        // User avatar → profile
        GestureDetector(
          onTap: () => context.push('/more/profile'),
          child: Padding(
            padding: const EdgeInsets.only(right: 14),
            child: UserAvatar(
              name: user?.name ?? '',
              avatarUrl: avatarUrl ?? user?.avatarUrl,
              radius: 19,
              border: true,
            ),
          ),
        ),
      ],
    );
  }

  static String _greeting() {
    final h = DateTime.now().hour;
    if (h < 12) return 'morning';
    if (h < 17) return 'afternoon';
    return 'evening';
  }
}

// ── Attendance check-in widget ────────────────────────────────────────────────

class _AttendanceWidget extends ConsumerStatefulWidget {
  @override
  ConsumerState<_AttendanceWidget> createState() => _AttendanceWidgetState();
}

class _AttendanceWidgetState extends ConsumerState<_AttendanceWidget> {
  static const _allowances = {'LUNCH': 60, 'SHORT': 15};

  Timer?  _timer;
  Timer?  _breakTimer;
  Duration _elapsed     = Duration.zero;
  int      _breakSecs   = 0;
  String?  _trackedBreakStart;
  bool     _actionLoading = false;
  bool     _breakLoading  = false;

  @override
  void dispose() {
    _timer?.cancel();
    _breakTimer?.cancel();
    super.dispose();
  }

  static DateTime _parseTime(String s) {
    try {
      // IST times stored without TZ suffix — parse as local
      return DateTime.parse(s.contains('T') ? s : s.replaceFirst(' ', 'T'));
    } catch (_) {
      final today = DateTime.now();
      final parts = s.split(':');
      return DateTime(today.year, today.month, today.day,
          int.tryParse(parts[0]) ?? 0,
          int.tryParse(parts.length > 1 ? parts[1] : '0') ?? 0,
          int.tryParse(parts.length > 2 ? parts[2] : '0') ?? 0);
    }
  }

  void _startWorkTimer(String checkInTimeStr) {
    _timer?.cancel();
    try {
      final checkInTime = _parseTime(checkInTimeStr);
      _elapsed = DateTime.now().difference(checkInTime);
      _timer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(() => _elapsed += const Duration(seconds: 1));
      });
    } catch (_) {
      _elapsed = Duration.zero;
    }
  }

  void _syncBreakTimer(Map<String, dynamic>? activeBreak) {
    final start = activeBreak?['break_start'] as String?;
    if (start == _trackedBreakStart) return;
    _trackedBreakStart = start;
    _breakTimer?.cancel();
    _breakTimer = null;
    _breakSecs  = 0;
    if (start != null) {
      final t = _parseTime(start);
      void tick() { _breakSecs = DateTime.now().difference(t).inSeconds.clamp(0, 86400); }
      tick();
      _breakTimer = Timer.periodic(const Duration(seconds: 1), (_) {
        if (mounted) setState(tick);
      });
    }
  }

  static Map<String, dynamic>? _findActive(Map<String, dynamic>? bs) {
    if (bs == null) return null;
    return (bs['lunch'] as Map<String, dynamic>?)?['active'] as Map<String, dynamic>?
        ?? (bs['short'] as Map<String, dynamic>?)?['active'] as Map<String, dynamic>?;
  }

  static String _clientTime() => DateFormat('yyyy-MM-dd HH:mm:ss').format(DateTime.now());

  String _fmtElapsed(Duration d) {
    final h = d.inHours;
    final m = d.inMinutes.remainder(60).toString().padLeft(2, '0');
    final s = d.inSeconds.remainder(60).toString().padLeft(2, '0');
    return h > 0 ? '$h:$m:$s' : '$m:$s';
  }

  String _fmtTime(String iso) {
    try { return DateFormat('h:mm a').format(_parseTime(iso)); }
    catch (_) { return iso; }
  }

  Future<void> _checkIn() async {
    setState(() => _actionLoading = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/attendance/check-in',
        data: {'client_time': _clientTime()},
      );
      ref.invalidate(_dashAttendanceProvider);
      ref.invalidate(myAttendanceProvider);
    } catch (e) {
      if (mounted) _handleCheckInError(e);
    } finally {
      if (mounted) setState(() => _actionLoading = false);
    }
  }

  Future<void> _checkInWfh(String reason) async {
    setState(() => _actionLoading = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/attendance/check-in',
        data: {
          'client_time': _clientTime(),
          'is_wfh': true,
          if (reason.isNotEmpty) 'wfh_reason': reason,
        },
      );
      ref.invalidate(_dashAttendanceProvider);
      ref.invalidate(myAttendanceProvider);
    } catch (e) {
      if (mounted) {
        final is403 = e is DioException && e.response?.statusCode == 403;
        ScaffoldMessenger.of(context).showSnackBar(SnackBar(
          content: Text(is403
              ? 'Access denied. Contact your admin to enable attendance permissions.'
              : 'WFH check-in failed. Please try again.'),
          backgroundColor: AppColors.error,
        ));
      }
    } finally {
      if (mounted) setState(() => _actionLoading = false);
    }
  }

  Future<void> _checkOut() async {
    setState(() => _actionLoading = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/attendance/check-out',
        data: {'client_time': _clientTime()},
      );
      _timer?.cancel();
      _timer = null;
      ref.invalidate(_dashAttendanceProvider);
      ref.invalidate(myAttendanceProvider);
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(
        content: Text(e is DioException && e.response?.statusCode == 403
            ? 'Access denied for check-out.'
            : 'Check-out failed. Please try again.'),
        backgroundColor: AppColors.error));
    } finally {
      if (mounted) setState(() => _actionLoading = false);
    }
  }

  Future<void> _startBreak(String type) async {
    setState(() => _breakLoading = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/attendance/break-start',
        data: {'client_time': _clientTime(), 'break_type': type},
      );
      ref.invalidate(_dashAttendanceProvider);
      ref.invalidate(myAttendanceProvider);
    } catch (e) {
      if (mounted) {
        String msg = 'Break failed. Please try again.';
        if (e is DioException && e.response?.statusCode == 403) {
          final body = e.response?.data;
          final serverMsg = body is Map ? (body['message'] as String?) : null;
          msg = serverMsg != null && serverMsg.contains('network')
              ? 'Not on office network. Connect to office WiFi to take a break.'
              : 'Access denied for break. Contact your admin.';
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppColors.error));
      }
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
      ref.invalidate(_dashAttendanceProvider);
      ref.invalidate(myAttendanceProvider);
    } catch (e) {
      if (mounted) {
        String msg = 'End break failed. Please try again.';
        if (e is DioException && e.response?.statusCode == 403) {
          final body = e.response?.data;
          final serverMsg = body is Map ? (body['message'] as String?) : null;
          msg = serverMsg != null && serverMsg.contains('network')
              ? 'Not on office network. Connect to office WiFi to end the break.'
              : 'Access denied for break. Contact your admin.';
        }
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text(msg), backgroundColor: AppColors.error));
      }
    } finally {
      if (mounted) setState(() => _breakLoading = false);
    }
  }

  void _handleCheckInError(Object e) {
    final msg = e.toString().toLowerCase();
    if (msg.contains('403') || msg.contains('not allowed') || msg.contains('ip')) {
      showDialog(
        context: context,
        builder: (ctx) => AlertDialog(
          title: const Text('Check-in Blocked'),
          content: const Text(
              'Check-in is not allowed from this network.\nYou can still check in as WFH.'),
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
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Check-in failed: $e'), backgroundColor: AppColors.error));
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
          TextButton(onPressed: () { Navigator.pop(ctx); ctrl.dispose(); }, child: const Text('Cancel')),
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

  @override
  Widget build(BuildContext context) {
    final ds     = context.ds;
    final record = ref.watch(_dashAttendanceProvider);

    return record.when(
      data: (r) {
        final status       = r['status']      as String? ?? 'ABSENT';
        final checkInTime  = r['checkInTime']  as String?;
        final checkOutTime = r['checkOutTime'] as String?;
        final checkedIn    = checkInTime != null && checkOutTime == null;
        final isWfh        = r['isWfh']       as bool? ?? false;
        final dayComplete  = checkInTime != null && checkOutTime != null;
        final bs           = r['breakSummary'] as Map<String, dynamic>?;
        final activeBreak  = _findActive(bs);
        final onBreak      = activeBreak != null;

        // Sync work-elapsed timer
        if (checkedIn && _timer == null) {
          SchedulerBinding.instance.addPostFrameCallback((_) {
            if (mounted) _startWorkTimer(checkInTime);
          });
        } else if (!checkedIn && _timer != null) {
          SchedulerBinding.instance.addPostFrameCallback((_) {
            if (mounted) { _timer?.cancel(); _timer = null; setState(() => _elapsed = Duration.zero); }
          });
        }

        // Sync break timer from server data
        _syncBreakTimer(activeBreak);

        final breakType  = activeBreak?['break_type'] as String? ?? 'SHORT';
        final allowance  = _allowances[breakType] ?? 15;
        final breakMins  = _breakSecs ~/ 60;
        final isOverBreak = breakMins > allowance;
        final lunchInfo  = bs?['lunch'] as Map<String, dynamic>? ?? {};
        final shortInfo  = bs?['short'] as Map<String, dynamic>? ?? {};

        final (color, icon, label) = switch (status) {
          'PRESENT' => (AppColors.success,  Icons.check_circle_rounded, 'Checked In'),
          'WFH'     => (AppColors.info,     Icons.home_rounded,         'Working From Home'),
          'LATE'    => (AppColors.ragAmber, Icons.schedule_rounded,     'Late'),
          _         => dayComplete
                         ? (AppColors.success, Icons.task_alt_rounded,  'Day Complete')
                         : (AppColors.ragRed,  Icons.circle_outlined,   'Not Checked In'),
        };

        return Container(
          margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
          decoration: BoxDecoration(
            color: ds.bgCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: color.withOpacity(0.3)),
          ),
          child: Column(children: [
            // ── Header row ────────────────────────────────────────────
            Padding(
              padding: const EdgeInsets.fromLTRB(14, 14, 14, 10),
              child: Row(children: [
                Container(
                  width: 38, height: 38,
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, color: color, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Text(label, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: ds.textPrimary)),
                  if (checkedIn && !onBreak)
                    Text(_fmtElapsed(_elapsed),
                        style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800,
                            color: color, fontFeatures: const [FontFeature.tabularFigures()]))
                  else if (isWfh || dayComplete)
                    Text('Have a great day!', style: TextStyle(fontSize: 12, color: ds.textMuted))
                  else
                    Text(DateFormat('EEEE, d MMMM').format(DateTime.now()),
                        style: TextStyle(fontSize: 12, color: ds.textMuted)),
                ])),
                GestureDetector(
                  onTap: () => context.push('/more/attendance'),
                  child: Text('Details →', style: TextStyle(
                      fontSize: 12, fontWeight: FontWeight.w600, color: AppColors.primaryLight)),
                ),
              ]),
            ),

            // ── Check-in / check-out times ────────────────────────────
            if (checkInTime != null)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                child: Row(children: [
                  _TimeChipSmall(icon: Icons.login_rounded,
                      label: 'In: ${_fmtTime(checkInTime)}', color: AppColors.success),
                  if (checkOutTime != null) ...[
                    const SizedBox(width: 8),
                    _TimeChipSmall(icon: Icons.logout_rounded,
                        label: 'Out: ${_fmtTime(checkOutTime)}', color: AppColors.error),
                  ],
                ]),
              ),

            // ── Active break display ──────────────────────────────────
            if (onBreak)
              Container(
                margin: const EdgeInsets.fromLTRB(14, 0, 14, 10),
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                decoration: BoxDecoration(
                  color: (isOverBreak ? AppColors.ragRed : AppColors.ragAmber).withOpacity(0.1),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                      color: (isOverBreak ? AppColors.ragRed : AppColors.ragAmber).withOpacity(0.3)),
                ),
                child: Row(children: [
                  Icon(breakType == 'LUNCH' ? Icons.restaurant_rounded : Icons.coffee_rounded,
                      color: isOverBreak ? AppColors.ragRed : AppColors.ragAmber, size: 14),
                  const SizedBox(width: 6),
                  Text(
                    '${breakType == 'LUNCH' ? 'Lunch' : 'Short'} '
                    '${(_breakSecs ~/ 60).toString().padLeft(2, '0')}:'
                    '${(_breakSecs % 60).toString().padLeft(2, '0')}',
                    style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                        color: isOverBreak ? AppColors.ragRed : AppColors.ragAmber),
                  ),
                  if (isOverBreak) ...[
                    const SizedBox(width: 4),
                    Icon(Icons.warning_rounded, size: 11, color: AppColors.ragRed),
                    Text(' +${breakMins - allowance}m',
                        style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                            color: AppColors.ragRed)),
                  ],
                  const Spacer(),
                  GestureDetector(
                    onTap: _breakLoading ? null : _endBreak,
                    child: Container(
                      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.ragAmber.withOpacity(0.2),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(_breakLoading ? '…' : 'End',
                          style: const TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                              color: AppColors.ragAmber)),
                    ),
                  ),
                ]),
              ),

            // ── Action buttons ────────────────────────────────────────
            if (!dayComplete)
              Padding(
                padding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
                child: (_actionLoading || _breakLoading)
                    ? const Center(child: SizedBox(width: 24, height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2)))
                    : Column(children: [
                        Row(children: [
                          if (!checkedIn && !isWfh) ...[
                            Expanded(child: _AttBtn(
                                icon: Icons.login_rounded, label: 'Check In',
                                color: AppColors.success, onTap: _checkIn)),
                            const SizedBox(width: 8),
                            Expanded(child: _AttBtn(
                                icon: Icons.home_rounded, label: 'WFH',
                                color: AppColors.info, onTap: _showWfhDialog)),
                          ],
                          if (checkedIn)
                            Expanded(child: _AttBtn(
                                icon: Icons.logout_rounded, label: 'Check Out',
                                color: AppColors.ragRed, onTap: _checkOut)),
                        ]),
                        if (checkedIn && !onBreak) ...[
                          const SizedBox(height: 8),
                          Row(children: [
                            Expanded(child: _BreakBtn(
                              icon: Icons.restaurant_rounded,
                              label: 'Lunch  ${(lunchInfo['remaining_minutes'] as num?)?.toInt() ?? 60}m',
                              active: false,
                              onTap: () => _startBreak('LUNCH'),
                            )),
                            const SizedBox(width: 8),
                            Expanded(child: _BreakBtn(
                              icon: Icons.coffee_rounded,
                              label: 'Break  ${(shortInfo['remaining_minutes'] as num?)?.toInt() ?? 15}m',
                              active: false,
                              onTap: () => _startBreak('SHORT'),
                            )),
                          ]),
                        ],
                      ]),
              ),
          ]),
        ).animate().fadeIn(duration: 350.ms);
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _TimeChipSmall extends StatelessWidget {
  const _TimeChipSmall({required this.icon, required this.label, required this.color});
  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
    decoration: BoxDecoration(
      color: color.withOpacity(0.08),
      borderRadius: BorderRadius.circular(6),
      border: Border.all(color: color.withOpacity(0.2)),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 11, color: color),
      const SizedBox(width: 4),
      Text(label, style: TextStyle(fontSize: 11, color: color, fontWeight: FontWeight.w600)),
    ]),
  );
}

class _AttBtn extends StatelessWidget {
  const _AttBtn({required this.icon, required this.label, required this.color, required this.onTap});
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => ElevatedButton.icon(
    icon: Icon(icon, size: 15),
    label: Text(label, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600)),
    style: ElevatedButton.styleFrom(
      backgroundColor: color,
      foregroundColor: Colors.white,
      padding: const EdgeInsets.symmetric(vertical: 11),
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
      elevation: 0,
    ),
    onPressed: onTap,
  );
}

class _BreakBtn extends StatelessWidget {
  const _BreakBtn({required this.icon, required this.label,
      required this.active, required this.onTap});
  final IconData icon;
  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final color = AppColors.ragAmber;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 9),
        decoration: BoxDecoration(
          color: active ? color.withOpacity(0.15) : ds.bgElevated,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: active ? color.withOpacity(0.5) : ds.border,
          ),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon, size: 13, color: active ? color : ds.textMuted),
          const SizedBox(width: 5),
          Text(label, style: TextStyle(
              fontSize: 12, fontWeight: FontWeight.w600,
              color: active ? color : ds.textMuted)),
        ]),
      ),
    );
  }
}

class _QuickBtn extends StatelessWidget {
  const _QuickBtn({required this.label, required this.color, required this.onTap});
  final String label;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => GestureDetector(
    onTap: onTap,
    child: Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 7),
      decoration: BoxDecoration(
        color: color,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(label, style: const TextStyle(
          color: Colors.white, fontSize: 12, fontWeight: FontWeight.w700)),
    ),
  );
}

// ── Standup nudge ─────────────────────────────────────────────────────────────

class _StandupNudge extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFF4F46E5), Color(0xFF6366F1)],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(14),
        boxShadow: [
          BoxShadow(
            color: AppColors.primary.withOpacity(0.3),
            blurRadius: 12, offset: const Offset(0, 4),
          ),
        ],
      ),
      child: Row(
        children: [
          const Icon(Icons.record_voice_over_rounded, color: Colors.white, size: 22),
          const SizedBox(width: 12),
          const Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Stand-up pending', style: TextStyle(
                    fontWeight: FontWeight.w700, fontSize: 13, color: Colors.white)),
                SizedBox(height: 2),
                Text("Share today's plan with your team",
                    style: TextStyle(fontSize: 12, color: Colors.white70)),
              ],
            ),
          ),
          TextButton(
            style: TextButton.styleFrom(
              backgroundColor: Colors.white.withOpacity(0.2),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
            ),
            onPressed: () => context.push('/more/standup'),
            child: const Text('Post', style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13)),
          ),
        ],
      ),
    ).animate().fadeIn().slideY(begin: -0.05);
  }
}

// ── Project tile ──────────────────────────────────────────────────────────────

class _ProjectTile extends StatelessWidget {
  const _ProjectTile(this.project);
  final Project project;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return GestureDetector(
      onTap: () => context.go('/projects'),
      child: Container(
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: ds.border),
        ),
        child: Row(
          children: [
            Container(
              width: 4, height: 44,
              decoration: BoxDecoration(
                color: _ragColor(project.ragStatus),
                borderRadius: BorderRadius.circular(4),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(project.name,
                      style: TextStyle(fontWeight: FontWeight.w700,
                          fontSize: 14, color: ds.textPrimary),
                      overflow: TextOverflow.ellipsis),
                  const SizedBox(height: 4),
                  Row(children: [
                    RagBadge(project.ragStatus),
                    const SizedBox(width: 8),
                    Text('${project.memberCount} members',
                        style: TextStyle(fontSize: 12, color: ds.textMuted)),
                  ]),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded, color: ds.textMuted, size: 20),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 350.ms).slideX(begin: 0.04);
  }

  Color _ragColor(String rag) => switch (rag) {
    'RED'   => AppColors.ragRed,
    'AMBER' => AppColors.ragAmber,
    _       => AppColors.ragGreen,
  };
}

// ── My tasks ──────────────────────────────────────────────────────────────────

class _MyTasksSection extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds    = context.ds;
    final tasks = ref.watch(myTasksProvider);
    return tasks.when(
      data: (list) => list.isEmpty
          ? Padding(
              padding: const EdgeInsets.all(24),
              child: Center(child: Text('No tasks assigned',
                  style: TextStyle(color: ds.textMuted))),
            )
          : Column(
              children: list.take(5).map((t) => _TaskTile(t)).toList(),
            ),
      loading: () => Column(
          children: List.generate(3, (_) => const ShimmerCard(height: 60))),
      error: (e, _) => _ErrorTile(e),
    );
  }
}

class _TaskTile extends StatelessWidget {
  const _TaskTile(this.task);
  final SprintTask task;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ds.border),
      ),
      child: Row(
        children: [
          Icon(
            task.status == 'DONE'
                ? Icons.check_circle_rounded
                : Icons.radio_button_unchecked_rounded,
            color: task.status == 'DONE' ? AppColors.success : ds.textMuted,
            size: 20,
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(task.title,
                style: TextStyle(
                    fontSize: 13, fontWeight: FontWeight.w600,
                    color: task.status == 'DONE' ? ds.textMuted : ds.textPrimary,
                    decoration: task.status == 'DONE' ? TextDecoration.lineThrough : null),
                overflow: TextOverflow.ellipsis),
          ),
          const SizedBox(width: 8),
          PriorityBadge(task.priority),
        ],
      ),
    );
  }
}

class _ErrorTile extends StatelessWidget {
  const _ErrorTile(this.error);
  final Object error;

  bool get _is403 =>
      error is DioException && (error as DioException).response?.statusCode == 403;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
    child: Row(children: [
      Icon(
        _is403 ? Icons.lock_outline_rounded : Icons.error_outline_rounded,
        size: 16,
        color: _is403 ? AppColors.warning : AppColors.error,
      ),
      const SizedBox(width: 8),
      Expanded(
        child: Text(
          _is403
              ? 'Access restricted — contact your admin to grant permission.'
              : 'Failed to load. Please refresh.',
          style: TextStyle(
            color: _is403 ? AppColors.warning : AppColors.error,
            fontSize: 13,
          ),
        ),
      ),
    ]),
  );
}
