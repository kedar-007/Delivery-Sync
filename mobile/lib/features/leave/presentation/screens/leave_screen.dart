/// Leave Management screen — requests, apply, who's off, calendar, balance, team.
/// API: ${AppConstants.basePeople}/leave
library;

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

// ── Providers ─────────────────────────────────────────────────────────────────

final leaveRequestsProvider =
    FutureProvider.autoDispose<List<LeaveRequest>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/leave/requests',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map ? (data['requests'] as List<dynamic>? ?? []) : []);
  return list
      .map((e) => LeaveRequest.fromJson(e as Map<String, dynamic>))
      .toList();
});

final teamLeaveRequestsProvider =
    FutureProvider.autoDispose<List<LeaveRequest>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/leave/requests',
    queryParameters: {'team': 'true'},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map ? (data['requests'] as List<dynamic>? ?? []) : []);
  return list
      .map((e) => LeaveRequest.fromJson(e as Map<String, dynamic>))
      .toList();
});

final leaveBalanceProvider =
    FutureProvider.autoDispose<List<LeaveBalance>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/leave/balance',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map ? (data['balance'] as List<dynamic>? ?? []) : []);
  return list
      .map((e) => LeaveBalance.fromJson(e as Map<String, dynamic>))
      .toList();
});

/// Lightweight leave type for the Apply form dropdown.
class _LeaveTypeOption {
  const _LeaveTypeOption({required this.id, required this.name});
  final String id;
  final String name;
}

final leaveTypesProvider =
    FutureProvider.autoDispose<List<_LeaveTypeOption>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/leave/types',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map ? (data['types'] as List<dynamic>? ?? []) : []);
  return list
      .whereType<Map>()
      .map((e) {
        final m = e.cast<String, dynamic>();
        final id = (m['ROWID'] ?? m['id'] ?? '').toString();
        final name = (m['name'] ?? m['code'] ?? '').toString();
        return _LeaveTypeOption(id: id, name: name);
      })
      .where((t) => t.id.isNotEmpty && t.name.isNotEmpty)
      .toList();
});

/// Calendar/who's-off entries for a date range.
/// Keyed by yyyy-MM-dd date range so we can refetch when the user pages months.
class _CalendarRange {
  const _CalendarRange(this.from, this.to);
  final String from;
  final String to;

  @override
  bool operator ==(Object other) =>
      other is _CalendarRange && other.from == from && other.to == to;
  @override
  int get hashCode => Object.hash(from, to);
}

class _CalendarEntry {
  const _CalendarEntry({
    required this.userName,
    required this.userAvatarUrl,
    required this.leaveTypeName,
    required this.date,
    required this.startDate,
    required this.endDate,
  });
  final String userName;
  final String userAvatarUrl;
  final String leaveTypeName;
  final String date; // yyyy-MM-dd (start)
  final String startDate;
  final String endDate;
}

final leaveCalendarProvider = FutureProvider.autoDispose
    .family<List<_CalendarEntry>, _CalendarRange>((ref, range) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/leave/calendar',
    queryParameters: {'date_from': range.from, 'date_to': range.to},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map ? (data['calendar'] as List<dynamic>? ?? []) : []);
  return list.whereType<Map>().map((e) {
    final m = e.cast<String, dynamic>();
    final lt = m['leave_type'];
    final leaveTypeName = (lt is Map ? lt['name'] as String? : null) ??
        m['leave_type_name'] as String? ??
        m['leaveTypeName'] as String? ??
        '';
    final start = m['start_date'] as String? ?? m['startDate'] as String? ?? '';
    final end = m['end_date'] as String? ?? m['endDate'] as String? ?? start;
    return _CalendarEntry(
      userName: (m['user_name'] ?? m['userName'] ?? m['name'] ?? '').toString(),
      userAvatarUrl:
          (m['user_avatar_url'] ?? m['userAvatarUrl'] ?? m['avatar_url'] ?? '')
              .toString(),
      leaveTypeName: leaveTypeName,
      date: (m['date'] as String?) ?? start,
      startDate: start,
      endDate: end,
    );
  }).toList();
});

// ── Screen ────────────────────────────────────────────────────────────────────

class LeaveScreen extends ConsumerStatefulWidget {
  const LeaveScreen({super.key});

  @override
  ConsumerState<LeaveScreen> createState() => _LeaveScreenState();
}

class _LeaveScreenState extends ConsumerState<LeaveScreen>
    with TickerProviderStateMixin {
  late TabController _tabController;
  bool _isTeamVisible = false;

  // Tab order: My Requests, Apply, Who's Off, Calendar, Balance, [Team]
  static const _baseTabCount = 5;

  @override
  void initState() {
    super.initState();
    final user = ref.read(currentUserProvider);
    _isTeamVisible = UserRole.isAdmin(user?.role ?? '') ||
        (user?.permissions.contains('LEAVE_ADMIN') ?? false) ||
        (user?.permissions.contains('LEAVE_APPROVE') ?? false);
    _tabController = TabController(
      length: _isTeamVisible ? _baseTabCount + 1 : _baseTabCount,
      vsync: this,
    );
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
        title: const Text('Leave'),
        backgroundColor: ds.bgPage,
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabs: [
            const Tab(icon: Icon(Icons.list_alt_rounded, size: 18), text: 'My Requests'),
            const Tab(icon: Icon(Icons.edit_note_rounded, size: 18), text: 'Apply'),
            const Tab(icon: Icon(Icons.beach_access_rounded, size: 18), text: "Who's Off"),
            const Tab(icon: Icon(Icons.calendar_month_rounded, size: 18), text: 'Calendar'),
            const Tab(icon: Icon(Icons.account_balance_wallet_rounded, size: 18), text: 'Balance'),
            if (_isTeamVisible)
              const Tab(icon: Icon(Icons.group_rounded, size: 18), text: 'Team'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _RequestsTab(onRefresh: () => ref.invalidate(leaveRequestsProvider)),
          _ApplyTab(
            onApplied: () {
              ref.invalidate(leaveRequestsProvider);
              ref.invalidate(leaveBalanceProvider);
              // Jump back to My Requests so the user sees the new entry.
              _tabController.animateTo(0);
            },
          ),
          const _WhosOffTab(),
          const _CalendarTab(),
          _BalanceTab(),
          if (_isTeamVisible) const _TeamRequestsTab(),
        ],
      ),
    );
  }
}

// ── Requests tab ──────────────────────────────────────────────────────────────

class _RequestsTab extends ConsumerWidget {
  const _RequestsTab({required this.onRefresh});
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final requests = ref.watch(leaveRequestsProvider);
    final ds = context.ds;

    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      color: AppColors.primaryLight,
      child: requests.when(
        data: (list) {
          if (list.isEmpty) {
            return Center(
              child: Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.event_note_rounded, size: 56, color: ds.textMuted),
                const SizedBox(height: 12),
                Text('No leave requests yet',
                    style: TextStyle(color: ds.textMuted)),
              ]),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
            itemCount: list.length,
            itemBuilder: (_, i) => _LeaveCard(
              list[i],
              onCancel: list[i].status == 'PENDING'
                  ? () => _cancel(ref, list[i].id)
                  : null,
            ),
          );
        },
        loading: () =>
            ListView(children: List.generate(3, (_) => const ShimmerCard())),
        error: (e, _) => Center(
            child: Text('$e', style: const TextStyle(color: AppColors.error))),
      ),
    );
  }

  Future<void> _cancel(WidgetRef ref, String id) async {
    try {
      await ApiClient.instance.patch(
        '${AppConstants.basePeople}/leave/requests/$id/cancel',
        data: {},
      );
      ref.invalidate(leaveRequestsProvider);
    } catch (_) {}
  }
}

// ── Team requests tab ─────────────────────────────────────────────────────────

class _TeamRequestsTab extends ConsumerStatefulWidget {
  const _TeamRequestsTab();
  @override
  ConsumerState<_TeamRequestsTab> createState() => _TeamRequestsTabState();
}

class _TeamRequestsTabState extends ConsumerState<_TeamRequestsTab> {
  String _filter = 'ALL';
  final _searchCtrl = TextEditingController();
  String _search = '';
  DateTime? _from;
  DateTime? _to;

  static const _filters = ['ALL', 'PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'];

  @override
  void dispose() {
    _searchCtrl.dispose();
    super.dispose();
  }

  Future<void> _pickDate(bool isFrom) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: (isFrom ? _from : _to) ?? now,
      firstDate: DateTime(now.year - 2),
      lastDate: DateTime(now.year + 1),
    );
    if (picked == null) return;
    setState(() {
      if (isFrom) _from = picked; else _to = picked;
    });
  }

  void _clearFilters() {
    setState(() {
      _from = null;
      _to = null;
      _filter = 'ALL';
      _searchCtrl.clear();
      _search = '';
    });
  }

  // Client-side filter pipeline: status chip → name/email search → date range.
  // Date overlap rule: keep the request if [startDate, endDate] intersects
  // [_from, _to] in any way — managers usually want to see leaves that touch
  // the window, not just those fully inside it.
  List<LeaveRequest> _applyFilters(List<LeaveRequest> all) {
    Iterable<LeaveRequest> iter = all;
    if (_filter != 'ALL') iter = iter.where((r) => r.status == _filter);
    if (_search.trim().isNotEmpty) {
      final q = _search.toLowerCase().trim();
      iter = iter.where((r) =>
          (r.employeeName ?? '').toLowerCase().contains(q));
    }
    if (_from != null || _to != null) {
      iter = iter.where((r) {
        DateTime? s, e;
        try { s = DateTime.parse(r.startDate); } catch (_) {}
        try { e = DateTime.parse(r.endDate); } catch (_) {}
        if (s == null || e == null) return true; // keep unparseable rows visible
        final lo = _from ?? DateTime(1900);
        final hi = _to   ?? DateTime(2100);
        // Intervals overlap iff start <= hi AND end >= lo.
        return !s.isAfter(hi) && !e.isBefore(lo);
      });
    }
    return iter.toList();
  }

  @override
  Widget build(BuildContext context) {
    final requests = ref.watch(teamLeaveRequestsProvider);
    final ds = context.ds;
    final activeFilters = _from != null || _to != null
        || _search.isNotEmpty || _filter != 'ALL';

    return Column(
      children: [
        // ─── Search + date range card ──────────────────────────────────
        Container(
          margin: const EdgeInsets.fromLTRB(12, 10, 12, 4),
          padding: const EdgeInsets.fromLTRB(12, 10, 12, 10),
          decoration: BoxDecoration(
            color: ds.bgCard,
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: ds.border),
          ),
          child: Column(
            children: [
              TextField(
                controller: _searchCtrl,
                onChanged: (v) => setState(() => _search = v),
                textInputAction: TextInputAction.search,
                decoration: InputDecoration(
                  hintText: 'Search by user name',
                  hintStyle: TextStyle(color: ds.textMuted, fontSize: 13),
                  prefixIcon: Icon(Icons.search_rounded, size: 18, color: ds.textMuted),
                  suffixIcon: _search.isEmpty ? null : IconButton(
                    icon: const Icon(Icons.close_rounded, size: 18),
                    onPressed: () { _searchCtrl.clear(); setState(() => _search = ''); },
                  ),
                  isDense: true,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: ds.border),
                  ),
                  enabledBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: BorderSide(color: ds.border),
                  ),
                  focusedBorder: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(10),
                    borderSide: const BorderSide(color: AppColors.primaryLight, width: 1.4),
                  ),
                ),
              ),
              const SizedBox(height: 8),
              Row(children: [
                Expanded(child: _TeamDateChip(
                  label: _from == null ? 'From' : DateFormat('d MMM yy').format(_from!),
                  active: _from != null,
                  onTap: () => _pickDate(true),
                )),
                const SizedBox(width: 8),
                Expanded(child: _TeamDateChip(
                  label: _to == null ? 'To' : DateFormat('d MMM yy').format(_to!),
                  active: _to != null,
                  onTap: () => _pickDate(false),
                )),
                if (activeFilters) ...[
                  const SizedBox(width: 6),
                  IconButton(
                    onPressed: _clearFilters,
                    icon: const Icon(Icons.filter_alt_off_rounded, size: 18),
                    tooltip: 'Clear filters',
                    visualDensity: VisualDensity.compact,
                    padding: const EdgeInsets.all(6),
                    constraints: const BoxConstraints(),
                  ),
                ],
              ]),
            ],
          ),
        ),

        // ─── Status chips ──────────────────────────────────────────────
        SizedBox(
          height: 42,
          child: ListView.separated(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
            scrollDirection: Axis.horizontal,
            itemCount: _filters.length,
            separatorBuilder: (_, __) => const SizedBox(width: 8),
            itemBuilder: (_, i) {
              final f = _filters[i];
              final selected = _filter == f;
              final count = requests.valueOrNull == null ? null
                  : f == 'ALL' ? requests.valueOrNull!.length
                  : requests.valueOrNull!.where((r) => r.status == f).length;
              return FilterChip(
                label: Text(
                  f == 'ALL' ? 'All${count != null ? ' ($count)' : ''}'
                      : '${f[0]}${f.substring(1).toLowerCase()}${count != null && count > 0 ? ' ($count)' : ''}',
                  style: TextStyle(
                    fontSize: 11,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                    color: selected ? Colors.white : ds.textSecondary,
                  ),
                ),
                selected: selected,
                onSelected: (_) => setState(() => _filter = f),
                selectedColor: AppColors.primary,
                backgroundColor: ds.bgCard,
                checkmarkColor: Colors.white,
                side: BorderSide(
                  color: selected ? AppColors.primary : ds.border,
                ),
                padding: const EdgeInsets.symmetric(horizontal: 4),
                visualDensity: VisualDensity.compact,
              );
            },
          ),
        ),
        Expanded(
          child: RefreshIndicator(
            onRefresh: () async => ref.invalidate(teamLeaveRequestsProvider),
            color: AppColors.primaryLight,
            child: requests.when(
              data: (all) {
                final list = _applyFilters(all);
                if (list.isEmpty) {
                  return ListView(
                    physics: const AlwaysScrollableScrollPhysics(),
                    children: [
                      const SizedBox(height: 60),
                      Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.group_rounded, size: 56, color: ds.textMuted),
                        const SizedBox(height: 12),
                        Text(
                          activeFilters
                              ? 'No requests match these filters'
                              : 'No team leave requests',
                          style: TextStyle(color: ds.textMuted),
                        ),
                      ])),
                    ],
                  );
                }
                return ListView.builder(
                  padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                  itemCount: list.length,
                  itemBuilder: (_, i) => _TeamLeaveCard(
                    list[i],
                    onApprove: list[i].status == 'PENDING'
                        ? () => _approve(list[i].id)
                        : null,
                    onReject: list[i].status == 'PENDING'
                        ? () => _showRejectDialog(list[i].id)
                        : null,
                  ),
                );
              },
              loading: () =>
                  ListView(children: List.generate(3, (_) => const ShimmerCard())),
              error: (e, _) => Center(
                  child: Text('$e', style: const TextStyle(color: AppColors.error))),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _approve(String id) async {
    try {
      await ApiClient.instance.patch(
        '${AppConstants.basePeople}/leave/requests/$id/approve',
        data: {},
      );
      ref.invalidate(teamLeaveRequestsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to approve: $e'), backgroundColor: AppColors.error),
        );
      }
    }
  }

  Future<void> _showRejectDialog(String id) async {
    final notesCtrl = TextEditingController();
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) {
        final ds = ctx.ds;
        return AlertDialog(
          backgroundColor: ds.bgCard,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          title: Text('Reject Leave Request',
              style: TextStyle(fontWeight: FontWeight.w800, color: ds.textPrimary)),
          content: Column(mainAxisSize: MainAxisSize.min, children: [
            Text('Please provide a reason for rejection.',
                style: TextStyle(fontSize: 13, color: ds.textSecondary)),
            const SizedBox(height: 12),
            TextField(
              controller: notesCtrl,
              autofocus: true,
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
              decoration: InputDecoration(
                hintText: 'Rejection reason (required)',
                hintStyle: TextStyle(color: ds.textMuted),
                border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
              ),
            ),
          ]),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: Text('Cancel', style: TextStyle(color: ds.textMuted)),
            ),
            ElevatedButton(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.ragRed,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
              ),
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Reject'),
            ),
          ],
        );
      },
    );
    if (confirmed != true) return;
    final notes = notesCtrl.text.trim();
    if (notes.isEmpty) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Rejection reason is required.'), backgroundColor: AppColors.error),
        );
      }
      return;
    }
    try {
      await ApiClient.instance.patch(
        '${AppConstants.basePeople}/leave/requests/$id/reject',
        data: {'notes': notes},
      );
      ref.invalidate(teamLeaveRequestsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to reject: $e'), backgroundColor: AppColors.error),
        );
      }
    }
  }
}

class _TeamLeaveCard extends StatelessWidget {
  const _TeamLeaveCard(this.request, {this.onApprove, this.onReject});
  final LeaveRequest request;
  final VoidCallback? onApprove;
  final VoidCallback? onReject;

  Color get _statusColor => switch (request.status) {
        'APPROVED'  => AppColors.ragGreen,
        'REJECTED'  => AppColors.ragRed,
        'CANCELLED' => AppColors.textMuted,
        _           => AppColors.ragAmber,
      };

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    DateTime? start, end;
    try {
      start = DateTime.parse(request.startDate);
      end   = DateTime.parse(request.endDate);
    } catch (_) {}
    final days = start != null && end != null ? end.difference(start).inDays + 1 : null;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: _statusColor.withOpacity(0.3)),
      ),
      child: Row(children: [
        Container(
          width: 4,
          constraints: const BoxConstraints(minHeight: 80),
          decoration: BoxDecoration(
            color: _statusColor,
            borderRadius: const BorderRadius.horizontal(left: Radius.circular(15)),
          ),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                // Employee name
                Expanded(child: Text(request.employeeName ?? '—',
                    style: TextStyle(fontWeight: FontWeight.w700,
                        fontSize: 14, color: ds.textPrimary))),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: _statusColor.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(request.statusDisplay,
                      style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                          color: _statusColor)),
                ),
              ]),
              const SizedBox(height: 6),
              Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(5),
                  ),
                  child: Text(
                      request.leaveType.isEmpty
                          ? '—'
                          : request.leaveType[0] + request.leaveType.substring(1).toLowerCase(),
                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                          color: AppColors.primaryLight)),
                ),
                const SizedBox(width: 8),
                Icon(Icons.date_range_rounded, size: 12, color: ds.textMuted),
                const SizedBox(width: 4),
                Text(
                  start != null && end != null
                      ? '${DateFormat('d MMM').format(start)} – ${DateFormat('d MMM yyyy').format(end)}'
                          '${days != null ? '  ($days d)' : ''}'
                      : '${request.startDate} – ${request.endDate}',
                  style: TextStyle(fontSize: 12, color: ds.textSecondary),
                ),
              ]),
              if (request.reason != null && request.reason!.isNotEmpty) ...[
                const SizedBox(height: 5),
                Text(request.reason!,
                    style: TextStyle(fontSize: 11, color: ds.textMuted),
                    maxLines: 2, overflow: TextOverflow.ellipsis),
              ],
              if (onApprove != null || onReject != null) ...[
                const SizedBox(height: 10),
                Row(children: [
                  if (onReject != null)
                    Expanded(child: OutlinedButton.icon(
                      icon: const Icon(Icons.close_rounded, size: 14),
                      label: const Text('Reject', style: TextStyle(fontSize: 12)),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.ragRed,
                        side: BorderSide(color: AppColors.ragRed.withOpacity(0.4)),
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: onReject,
                    )),
                  if (onApprove != null && onReject != null) const SizedBox(width: 8),
                  if (onApprove != null)
                    Expanded(child: ElevatedButton.icon(
                      icon: const Icon(Icons.check_rounded, size: 14),
                      label: const Text('Approve', style: TextStyle(fontSize: 12)),
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.ragGreen,
                        foregroundColor: Colors.white,
                        padding: const EdgeInsets.symmetric(vertical: 8),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                      ),
                      onPressed: onApprove,
                    )),
                ]),
              ],
            ]),
          ),
        ),
      ]),
    ).animate().fadeIn(duration: 300.ms).slideX(begin: 0.04);
  }
}

// ── Balance tab ───────────────────────────────────────────────────────────────

class _BalanceTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final balance = ref.watch(leaveBalanceProvider);
    final ds = context.ds;

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(leaveBalanceProvider),
      color: AppColors.primaryLight,
      child: balance.when(
        data: (list) {
          if (list.isEmpty) {
            return Center(
              child: Text('No balance data',
                  style: TextStyle(color: ds.textMuted)),
            );
          }
          return ListView.builder(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
            itemCount: list.length,
            itemBuilder: (_, i) => _BalanceCard(list[i]),
          );
        },
        loading: () =>
            ListView(children: List.generate(4, (_) => const ShimmerCard())),
        error: (e, _) => Center(
            child: Text('$e', style: const TextStyle(color: AppColors.error))),
      ),
    );
  }
}

// ── Leave card ────────────────────────────────────────────────────────────────

class _LeaveCard extends StatelessWidget {
  const _LeaveCard(this.request, {this.onCancel});
  final LeaveRequest request;
  final VoidCallback? onCancel;

  Color get _statusColor => switch (request.status) {
        'APPROVED'  => AppColors.ragGreen,
        'REJECTED'  => AppColors.ragRed,
        'CANCELLED' => AppColors.textMuted,
        _           => AppColors.ragAmber,
      };

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    DateTime? start, end;
    try {
      start = DateTime.parse(request.startDate);
      end   = DateTime.parse(request.endDate);
    } catch (_) {}

    final days = start != null && end != null
        ? end.difference(start).inDays + 1
        : null;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: _statusColor.withOpacity(0.3)),
      ),
      child: Row(
        children: [
          Container(
            width: 4,
            constraints: const BoxConstraints(minHeight: 80),
            decoration: BoxDecoration(
              color: _statusColor,
              borderRadius:
                  const BorderRadius.horizontal(left: Radius.circular(15)),
            ),
          ),
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: AppColors.primary.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(
                          request.leaveType.isEmpty
                              ? '—'
                              : request.leaveType[0] +
                                  request.leaveType.substring(1).toLowerCase(),
                          style: const TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: AppColors.primaryLight)),
                    ),
                    const Spacer(),
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: _statusColor.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(6),
                      ),
                      child: Text(request.statusDisplay,
                          style: TextStyle(
                              fontSize: 11,
                              fontWeight: FontWeight.w700,
                              color: _statusColor)),
                    ),
                  ]),
                  const SizedBox(height: 8),
                  Row(children: [
                    Icon(Icons.date_range_rounded,
                        size: 13, color: ds.textMuted),
                    const SizedBox(width: 6),
                    Text(
                      start != null && end != null
                          ? '${DateFormat('d MMM').format(start)} – ${DateFormat('d MMM yyyy').format(end)}'
                          : '${request.startDate} – ${request.endDate}',
                      style: TextStyle(
                          fontSize: 12, color: ds.textSecondary),
                    ),
                    if (days != null) ...[
                      const SizedBox(width: 8),
                      Text('($days day${days == 1 ? '' : 's'})',
                          style: TextStyle(
                              fontSize: 11, color: ds.textMuted)),
                    ],
                  ]),
                  if (request.reason != null && request.reason!.isNotEmpty) ...[
                    const SizedBox(height: 6),
                    Text(request.reason!,
                        style: TextStyle(
                            fontSize: 12, color: ds.textSecondary),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis),
                  ],
                  if (onCancel != null) ...[
                    const SizedBox(height: 10),
                    GestureDetector(
                      onTap: onCancel,
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 10, vertical: 6),
                        decoration: BoxDecoration(
                          color: AppColors.ragRed.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(8),
                          border: Border.all(
                              color: AppColors.ragRed.withOpacity(0.3)),
                        ),
                        child: const Row(mainAxisSize: MainAxisSize.min, children: [
                          Icon(Icons.cancel_rounded,
                              size: 12, color: AppColors.ragRed),
                          SizedBox(width: 4),
                          Text('Cancel Request',
                              style: TextStyle(
                                  fontSize: 11,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.ragRed)),
                        ]),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms).slideX(begin: 0.04);
  }
}

// ── Balance card ──────────────────────────────────────────────────────────────

class _BalanceCard extends StatelessWidget {
  const _BalanceCard(this.balance);
  final LeaveBalance balance;

  @override
  Widget build(BuildContext context) {
    final ds  = context.ds;
    final pct = balance.total > 0 ? balance.used / balance.total : 0.0;
    final color = pct > 0.8
        ? AppColors.ragRed
        : pct > 0.5
            ? AppColors.ragAmber
            : AppColors.ragGreen;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ds.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              balance.leaveType.isEmpty
                  ? '—'
                  : balance.leaveType[0] +
                      balance.leaveType.substring(1).toLowerCase(),
              style: TextStyle(
                  fontSize: 14,
                  fontWeight: FontWeight.w700,
                  color: ds.textPrimary),
            ),
            RichText(
              text: TextSpan(
                children: [
                  TextSpan(
                      text: balance.remaining.toStringAsFixed(0),
                      style: TextStyle(
                          fontSize: 20,
                          fontWeight: FontWeight.w800,
                          color: color)),
                  TextSpan(
                      text:
                          ' / ${balance.total.toStringAsFixed(0)} days',
                      style: TextStyle(
                          fontSize: 12, color: ds.textMuted)),
                ],
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        ClipRRect(
          borderRadius: BorderRadius.circular(6),
          child: LinearProgressIndicator(
            value: pct,
            backgroundColor: ds.bgElevated,
            valueColor: AlwaysStoppedAnimation(color),
            minHeight: 8,
          ),
        ),
        const SizedBox(height: 6),
        Text(
          '${balance.used.toStringAsFixed(0)} days used',
          style: TextStyle(fontSize: 11, color: ds.textMuted),
        ),
      ]),
    ).animate().fadeIn(duration: 350.ms);
  }
}

// ── Apply tab ─────────────────────────────────────────────────────────────────

class _ApplyTab extends ConsumerStatefulWidget {
  const _ApplyTab({required this.onApplied});
  final VoidCallback onApplied;

  @override
  ConsumerState<_ApplyTab> createState() => _ApplyTabState();
}

class _ApplyTabState extends ConsumerState<_ApplyTab>
    with AutomaticKeepAliveClientMixin {
  final _reasonCtrl = TextEditingController();
  String? _leaveTypeId;
  String? _leaveTypeName;
  DateTime? _startDate;
  DateTime? _endDate;
  bool _loading = false;
  String? _error;
  String? _success;

  // Fallback used only if /leave/types returns nothing — keeps the form usable
  // for tenants that pre-date the configurable-leave-types feature.
  static const _fallbackTypes = [
    _LeaveTypeOption(id: 'ANNUAL', name: 'Annual'),
    _LeaveTypeOption(id: 'SICK', name: 'Sick'),
    _LeaveTypeOption(id: 'CASUAL', name: 'Casual'),
    _LeaveTypeOption(id: 'MATERNITY', name: 'Maternity'),
    _LeaveTypeOption(id: 'PATERNITY', name: 'Paternity'),
    _LeaveTypeOption(id: 'OTHER', name: 'Other'),
  ];

  @override
  bool get wantKeepAlive => true;

  @override
  void dispose() {
    _reasonCtrl.dispose();
    super.dispose();
  }

  int get _daysCount {
    if (_startDate == null || _endDate == null) return 0;
    if (_endDate!.isBefore(_startDate!)) return 0;
    return _endDate!.difference(_startDate!).inDays + 1;
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final ds = context.ds;
    final typesAsync = ref.watch(leaveTypesProvider);
    final types = typesAsync.maybeWhen(
      data: (list) => list.isEmpty ? _fallbackTypes : list,
      orElse: () => _fallbackTypes,
    );

    // If the previously selected id is no longer in the list (after types load),
    // clear it so the dropdown doesn't throw an assertion.
    if (_leaveTypeId != null &&
        !types.any((t) => t.id == _leaveTypeId)) {
      _leaveTypeId = null;
      _leaveTypeName = null;
    }

    return SingleChildScrollView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Apply for Leave',
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: ds.textPrimary)),
          const SizedBox(height: 4),
          Text('Submit a new leave request for approval.',
              style: TextStyle(fontSize: 12, color: ds.textMuted)),
          const SizedBox(height: 20),

          // Leave Type
          Text('Leave Type *',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: ds.textSecondary)),
          const SizedBox(height: 6),
          Container(
            decoration: BoxDecoration(
              color: ds.bgInput,
              borderRadius: BorderRadius.circular(12),
              border: Border.all(color: ds.border),
            ),
            padding: const EdgeInsets.symmetric(horizontal: 12),
            child: DropdownButtonHideUnderline(
              child: DropdownButton<String>(
                value: _leaveTypeId,
                isExpanded: true,
                hint: Text('Select leave type…',
                    style: TextStyle(color: ds.textMuted)),
                icon: Icon(Icons.expand_more_rounded, color: ds.textMuted),
                dropdownColor: ds.bgElevated,
                items: types
                    .map((t) => DropdownMenuItem(
                          value: t.id,
                          child: Text(t.name,
                              style: TextStyle(color: ds.textPrimary)),
                        ))
                    .toList(),
                onChanged: (v) {
                  setState(() {
                    _leaveTypeId = v;
                    _leaveTypeName =
                        types.firstWhere((t) => t.id == v).name;
                  });
                },
              ),
            ),
          ),
          const SizedBox(height: 14),

          // Date range
          Row(children: [
            Expanded(child: _DateField(
              label: 'From *',
              value: _startDate,
              onTap: () => _pickDate(isStart: true),
            )),
            const SizedBox(width: 10),
            Expanded(child: _DateField(
              label: 'To *',
              value: _endDate,
              onTap: () => _pickDate(isStart: false),
            )),
          ]),
          if (_daysCount > 0) ...[
            const SizedBox(height: 8),
            Row(children: [
              Icon(Icons.timer_outlined, size: 14, color: ds.textMuted),
              const SizedBox(width: 6),
              Text(
                'Duration: $_daysCount day${_daysCount == 1 ? '' : 's'}',
                style: TextStyle(fontSize: 12, color: ds.textSecondary,
                    fontWeight: FontWeight.w600),
              ),
            ]),
          ],
          const SizedBox(height: 14),

          // Reason
          Text('Reason *',
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: ds.textSecondary)),
          const SizedBox(height: 6),
          TextField(
            controller: _reasonCtrl,
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              hintText: 'Briefly explain the reason for leave…',
              hintStyle: TextStyle(color: ds.textMuted, fontSize: 13),
              filled: true,
              fillColor: ds.bgInput,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: ds.border),
              ),
              enabledBorder: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide(color: ds.border),
              ),
            ),
          ),

          if (_error != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.ragRed.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.ragRed.withOpacity(0.3)),
              ),
              child: Row(children: [
                const Icon(Icons.error_outline_rounded,
                    size: 16, color: AppColors.ragRed),
                const SizedBox(width: 8),
                Expanded(child: Text(_error!,
                    style: const TextStyle(
                        color: AppColors.ragRed, fontSize: 12))),
              ]),
            ),
          ],
          if (_success != null) ...[
            const SizedBox(height: 12),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: AppColors.ragGreen.withOpacity(0.08),
                borderRadius: BorderRadius.circular(8),
                border: Border.all(color: AppColors.ragGreen.withOpacity(0.3)),
              ),
              child: Row(children: [
                const Icon(Icons.check_circle_outline_rounded,
                    size: 16, color: AppColors.ragGreen),
                const SizedBox(width: 8),
                Expanded(child: Text(_success!,
                    style: const TextStyle(
                        color: AppColors.ragGreen, fontSize: 12))),
              ]),
            ),
          ],

          const SizedBox(height: 20),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: _loading
                  ? const SizedBox(
                      width: 16, height: 16,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2))
                  : const Icon(Icons.send_rounded, size: 16),
              label: Text(_loading ? 'Submitting…' : 'Submit Request',
                  style: const TextStyle(fontWeight: FontWeight.w700)),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 14),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: _loading ? null : _submit,
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _pickDate({required bool isStart}) async {
    final initial = isStart
        ? (_startDate ?? DateTime.now())
        : (_endDate ?? (_startDate ?? DateTime.now()));
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() {
        if (isStart) {
          _startDate = picked;
          if (_endDate != null && _endDate!.isBefore(picked)) {
            _endDate = picked;
          }
        } else {
          _endDate = picked;
        }
      });
    }
  }

  Future<void> _submit() async {
    final reason = _reasonCtrl.text.trim();
    if (_leaveTypeId == null) {
      setState(() => _error = 'Please select a leave type');
      return;
    }
    if (_startDate == null || _endDate == null) {
      setState(() => _error = 'Please select start and end dates');
      return;
    }
    if (_endDate!.isBefore(_startDate!)) {
      setState(() => _error = 'End date must be on or after start date');
      return;
    }
    if (reason.isEmpty) {
      setState(() => _error = 'Please provide a reason');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
      _success = null;
    });
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/leave/requests',
        data: {
          // Backend accepts either a ROWID string or a leave_type name string.
          'leave_type_id': _leaveTypeId,
          'start_date': DateFormat('yyyy-MM-dd').format(_startDate!),
          'end_date':   DateFormat('yyyy-MM-dd').format(_endDate!),
          'days_count': _daysCount,
          'reason':     reason,
        },
      );
      if (!mounted) return;
      setState(() {
        _loading = false;
        _success =
            'Leave request submitted successfully${_leaveTypeName != null ? ' ($_leaveTypeName)' : ''}.';
        _reasonCtrl.clear();
        _startDate = null;
        _endDate = null;
      });
      widget.onApplied();
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _loading = false;
        _error = e.toString();
      });
    }
  }
}

class _DateField extends StatelessWidget {
  const _DateField({
    required this.label,
    required this.value,
    required this.onTap,
  });
  final String label;
  final DateTime? value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: ds.bgInput,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: ds.border),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label,
              style: TextStyle(
                  fontSize: 11,
                  color: ds.textMuted,
                  fontWeight: FontWeight.w600)),
          const SizedBox(height: 6),
          Row(children: [
            Icon(Icons.calendar_today_rounded, size: 13, color: ds.textMuted),
            const SizedBox(width: 6),
            Text(
                value != null
                    ? DateFormat('d MMM yyyy').format(value!)
                    : 'Select date',
                style: TextStyle(
                    color: value != null ? ds.textPrimary : ds.textMuted,
                    fontWeight: FontWeight.w600,
                    fontSize: 13)),
          ]),
        ]),
      ),
    );
  }
}

// ── Who's Off tab ─────────────────────────────────────────────────────────────

/// Aggregates one user's calendar entries into a single row spanning their full
/// leave window (used in the Who's Off list).
class _PersonOnLeave {
  _PersonOnLeave({
    required this.userName,
    required this.avatarUrl,
    required this.leaveTypeName,
    required this.startDate,
    required this.endDate,
  });
  final String userName;
  final String avatarUrl;
  final String leaveTypeName;
  DateTime startDate;
  DateTime endDate;
}

class _WhosOffTab extends ConsumerStatefulWidget {
  const _WhosOffTab();
  @override
  ConsumerState<_WhosOffTab> createState() => _WhosOffTabState();
}

class _WhosOffTabState extends ConsumerState<_WhosOffTab>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final ds = context.ds;

    // Range: today → +14 days, so we can split into today / this week / next week.
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final endOfWindow = today.add(const Duration(days: 14));
    final range = _CalendarRange(
      DateFormat('yyyy-MM-dd').format(today),
      DateFormat('yyyy-MM-dd').format(endOfWindow),
    );
    final entriesAsync = ref.watch(leaveCalendarProvider(range));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(leaveCalendarProvider(range)),
      color: AppColors.primaryLight,
      child: entriesAsync.when(
        loading: () =>
            ListView(children: List.generate(4, (_) => const ShimmerCard())),
        error: (e, _) => ListView(children: [
          const SizedBox(height: 80),
          Center(
              child: Text('$e',
                  style: const TextStyle(color: AppColors.error))),
        ]),
        data: (entries) {
          final people = _aggregate(entries);
          if (people.isEmpty) {
            return ListView(children: [
              const SizedBox(height: 80),
              Column(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.beach_access_rounded,
                    size: 56, color: ds.textMuted),
                const SizedBox(height: 12),
                Text('All hands on deck!',
                    style: TextStyle(
                        color: ds.textPrimary,
                        fontWeight: FontWeight.w700,
                        fontSize: 14)),
                const SizedBox(height: 4),
                Text('No team members on leave in the next two weeks.',
                    style: TextStyle(color: ds.textMuted, fontSize: 12)),
              ]),
            ]);
          }

          // Group buckets
          final endOfThisWeek =
              today.add(Duration(days: DateTime.daysPerWeek - today.weekday));
          final endOfNextWeek =
              endOfThisWeek.add(const Duration(days: 7));

          final todayList = <_PersonOnLeave>[];
          final thisWeekList = <_PersonOnLeave>[];
          final nextWeekList = <_PersonOnLeave>[];

          for (final p in people) {
            final overlapsToday = !p.endDate.isBefore(today) &&
                !p.startDate.isAfter(today);
            if (overlapsToday) {
              todayList.add(p);
            } else if (!p.startDate.isAfter(endOfThisWeek)) {
              thisWeekList.add(p);
            } else if (!p.startDate.isAfter(endOfNextWeek)) {
              nextWeekList.add(p);
            } else {
              // Outside the next-week window — still inside the 14-day
              // fetch window. Bucket as "next week" for now.
              nextWeekList.add(p);
            }
          }

          return ListView(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
            children: [
              if (todayList.isNotEmpty) ...[
                _SectionHeader(title: 'Today', count: todayList.length),
                ...todayList.map((p) => _PersonRow(p)),
                const SizedBox(height: 16),
              ],
              if (thisWeekList.isNotEmpty) ...[
                _SectionHeader(title: 'This week', count: thisWeekList.length),
                ...thisWeekList.map((p) => _PersonRow(p)),
                const SizedBox(height: 16),
              ],
              if (nextWeekList.isNotEmpty) ...[
                _SectionHeader(title: 'Next week', count: nextWeekList.length),
                ...nextWeekList.map((p) => _PersonRow(p)),
              ],
            ],
          );
        },
      ),
    );
  }

  /// Merge raw calendar entries (one-per-day) into one row per (user, leaveType)
  /// spanning the min→max date for that pair.
  List<_PersonOnLeave> _aggregate(List<_CalendarEntry> entries) {
    final map = <String, _PersonOnLeave>{};
    for (final e in entries) {
      if (e.userName.isEmpty) continue;
      final start = _tryParse(e.startDate) ?? _tryParse(e.date);
      final end = _tryParse(e.endDate) ?? start;
      if (start == null || end == null) continue;
      final key = '${e.userName}::${e.leaveTypeName}';
      final existing = map[key];
      if (existing == null) {
        map[key] = _PersonOnLeave(
          userName: e.userName,
          avatarUrl: e.userAvatarUrl,
          leaveTypeName: e.leaveTypeName,
          startDate: start,
          endDate: end,
        );
      } else {
        if (start.isBefore(existing.startDate)) existing.startDate = start;
        if (end.isAfter(existing.endDate)) existing.endDate = end;
      }
    }
    final list = map.values.toList()
      ..sort((a, b) => a.startDate.compareTo(b.startDate));
    return list;
  }

  DateTime? _tryParse(String s) {
    if (s.isEmpty) return null;
    try {
      final d = DateTime.parse(s);
      return DateTime(d.year, d.month, d.day);
    } catch (_) {
      return null;
    }
  }
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.title, required this.count});
  final String title;
  final int count;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Padding(
      padding: const EdgeInsets.only(top: 4, bottom: 8),
      child: Row(children: [
        Text(title.toUpperCase(),
            style: TextStyle(
                fontSize: 11,
                fontWeight: FontWeight.w800,
                letterSpacing: 0.6,
                color: ds.textMuted)),
        const SizedBox(width: 8),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
          decoration: BoxDecoration(
            color: AppColors.primary.withOpacity(0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Text('$count',
              style: const TextStyle(
                  fontSize: 10,
                  fontWeight: FontWeight.w700,
                  color: AppColors.primaryLight)),
        ),
      ]),
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow(this.person);
  final _PersonOnLeave person;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final sameDay = person.startDate.isAtSameMomentAs(person.endDate);
    final days = person.endDate.difference(person.startDate).inDays + 1;
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Row(children: [
        UserAvatar(
          name: person.userName,
          avatarUrl: person.avatarUrl.isEmpty ? null : person.avatarUrl,
          radius: 20,
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(person.userName,
                style: TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: ds.textPrimary)),
            const SizedBox(height: 2),
            Row(children: [
              Icon(Icons.date_range_rounded, size: 12, color: ds.textMuted),
              const SizedBox(width: 4),
              Expanded(
                child: Text(
                  sameDay
                      ? DateFormat('d MMM yyyy').format(person.startDate)
                      : '${DateFormat('d MMM').format(person.startDate)} – ${DateFormat('d MMM yyyy').format(person.endDate)}  ($days d)',
                  style: TextStyle(fontSize: 12, color: ds.textSecondary),
                ),
              ),
            ]),
          ]),
        ),
        if (person.leaveTypeName.isNotEmpty)
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.12),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(person.leaveTypeName,
                style: const TextStyle(
                    fontSize: 10,
                    fontWeight: FontWeight.w700,
                    color: AppColors.primaryLight)),
          ),
      ]),
    ).animate().fadeIn(duration: 250.ms);
  }
}

// ── Calendar tab ──────────────────────────────────────────────────────────────

class _CalendarTab extends ConsumerStatefulWidget {
  const _CalendarTab();

  @override
  ConsumerState<_CalendarTab> createState() => _CalendarTabState();
}

class _CalendarTabState extends ConsumerState<_CalendarTab>
    with AutomaticKeepAliveClientMixin {
  late DateTime _viewMonth; // first day of the month being viewed

  @override
  bool get wantKeepAlive => true;

  @override
  void initState() {
    super.initState();
    final now = DateTime.now();
    _viewMonth = DateTime(now.year, now.month, 1);
  }

  @override
  Widget build(BuildContext context) {
    super.build(context);
    final ds = context.ds;

    final yr = _viewMonth.year;
    final mo = _viewMonth.month;
    final daysInMonth = DateTime(yr, mo + 1, 0).day;
    // Monday = 1 .. Sunday = 7; we render Sun-first to match the web reference.
    final firstWeekday = DateTime(yr, mo, 1).weekday % 7; // Sun = 0
    final range = _CalendarRange(
      DateFormat('yyyy-MM-dd').format(DateTime(yr, mo, 1)),
      DateFormat('yyyy-MM-dd').format(DateTime(yr, mo, daysInMonth)),
    );
    final entriesAsync = ref.watch(leaveCalendarProvider(range));

    // Build the date→entries map by expanding each entry across its full window.
    final byDate = <String, List<_CalendarEntry>>{};
    entriesAsync.whenData((entries) {
      for (final e in entries) {
        final start = _tryParse(e.startDate) ?? _tryParse(e.date);
        final end = _tryParse(e.endDate) ?? start;
        if (start == null || end == null) continue;
        var cursor = start;
        while (!cursor.isAfter(end)) {
          if (cursor.year == yr && cursor.month == mo) {
            final key = DateFormat('yyyy-MM-dd').format(cursor);
            byDate.putIfAbsent(key, () => []).add(e);
          }
          cursor = cursor.add(const Duration(days: 1));
        }
      }
    });

    final today = DateTime.now();
    final todayStr = DateFormat('yyyy-MM-dd').format(today);
    const weekDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

    // Total cells = leading blanks + days in month (we don't pad trailing — it just stops on the last day).
    final totalCells = firstWeekday + daysInMonth;

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(leaveCalendarProvider(range)),
      color: AppColors.primaryLight,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(12, 12, 12, 100),
        children: [
          // Month nav
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              IconButton(
                onPressed: () => setState(() {
                  _viewMonth = DateTime(yr, mo - 1, 1);
                }),
                icon: Icon(Icons.chevron_left_rounded, color: ds.textPrimary),
              ),
              Text(DateFormat('MMMM yyyy').format(_viewMonth),
                  style: TextStyle(
                      fontSize: 16,
                      fontWeight: FontWeight.w800,
                      color: ds.textPrimary)),
              IconButton(
                onPressed: () => setState(() {
                  _viewMonth = DateTime(yr, mo + 1, 1);
                }),
                icon: Icon(Icons.chevron_right_rounded, color: ds.textPrimary),
              ),
            ],
          ),
          const SizedBox(height: 4),

          // Day-of-week headers
          GridView.count(
            crossAxisCount: 7,
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            childAspectRatio: 2.2,
            children: weekDays
                .map((d) => Center(
                    child: Text(d,
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.4,
                            color: ds.textMuted))))
                .toList(),
          ),
          const SizedBox(height: 4),

          // Calendar grid
          GridView.builder(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
              crossAxisCount: 7,
              childAspectRatio: 0.85,
              crossAxisSpacing: 4,
              mainAxisSpacing: 4,
            ),
            itemCount: totalCells,
            itemBuilder: (_, idx) {
              if (idx < firstWeekday) {
                return const SizedBox.shrink();
              }
              final day = idx - firstWeekday + 1;
              final dateStr = DateFormat('yyyy-MM-dd')
                  .format(DateTime(yr, mo, day));
              final isToday = dateStr == todayStr;
              final entries = byDate[dateStr] ?? const <_CalendarEntry>[];
              return _CalendarCell(
                day: day,
                isToday: isToday,
                entryCount: entries.length,
                loading: entriesAsync.isLoading,
                onTap: entries.isEmpty
                    ? null
                    : () => _showDayDetail(
                          context,
                          DateTime(yr, mo, day),
                          entries,
                        ),
              );
            },
          ),
          const SizedBox(height: 16),

          // Legend
          Wrap(spacing: 14, runSpacing: 6, children: [
            _LegendChip(
                color: AppColors.primary.withOpacity(0.2),
                border: AppColors.primary.withOpacity(0.4),
                label: 'On Leave'),
            _LegendChip(
                color: AppColors.primaryLight.withOpacity(0.2),
                border: AppColors.primaryLight,
                label: 'Today'),
          ]),

          if (entriesAsync.hasError) ...[
            const SizedBox(height: 16),
            Text('${entriesAsync.error}',
                style: const TextStyle(color: AppColors.error, fontSize: 12)),
          ],
        ],
      ),
    );
  }

  void _showDayDetail(
      BuildContext context, DateTime date, List<_CalendarEntry> entries) {
    showModalBottomSheet(
      context: context,
      backgroundColor: context.ds.bgCard,
      shape: const RoundedRectangleBorder(
          borderRadius:
              BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) {
        final ds = ctx.ds;
        return Padding(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: ds.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 14),
            Row(children: [
              Icon(Icons.calendar_today_rounded,
                  size: 16, color: AppColors.primaryLight),
              const SizedBox(width: 8),
              Text(DateFormat('EEEE, d MMMM yyyy').format(date),
                  style: TextStyle(
                      fontSize: 15,
                      fontWeight: FontWeight.w800,
                      color: ds.textPrimary)),
            ]),
            const SizedBox(height: 4),
            Align(
              alignment: Alignment.centerLeft,
              child: Text(
                '${entries.length} team member${entries.length == 1 ? '' : 's'} on leave',
                style: TextStyle(fontSize: 12, color: ds.textMuted),
              ),
            ),
            const SizedBox(height: 12),
            Flexible(
              child: ListView.separated(
                shrinkWrap: true,
                itemCount: entries.length,
                separatorBuilder: (_, __) =>
                    Divider(height: 1, color: ds.border),
                itemBuilder: (_, i) {
                  final e = entries[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(vertical: 10),
                    child: Row(children: [
                      UserAvatar(
                        name: e.userName,
                        avatarUrl:
                            e.userAvatarUrl.isEmpty ? null : e.userAvatarUrl,
                        radius: 18,
                      ),
                      const SizedBox(width: 12),
                      Expanded(
                        child: Text(e.userName,
                            style: TextStyle(
                                fontSize: 14,
                                fontWeight: FontWeight.w700,
                                color: ds.textPrimary)),
                      ),
                      if (e.leaveTypeName.isNotEmpty)
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: AppColors.primary.withOpacity(0.12),
                            borderRadius: BorderRadius.circular(6),
                          ),
                          child: Text(e.leaveTypeName,
                              style: const TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: AppColors.primaryLight)),
                        ),
                    ]),
                  );
                },
              ),
            ),
          ]),
        );
      },
    );
  }

  DateTime? _tryParse(String s) {
    if (s.isEmpty) return null;
    try {
      final d = DateTime.parse(s);
      return DateTime(d.year, d.month, d.day);
    } catch (_) {
      return null;
    }
  }
}

class _CalendarCell extends StatelessWidget {
  const _CalendarCell({
    required this.day,
    required this.isToday,
    required this.entryCount,
    required this.loading,
    this.onTap,
  });

  final int day;
  final bool isToday;
  final int entryCount;
  final bool loading;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final hasLeaves = entryCount > 0;
    final bg = isToday
        ? AppColors.primaryLight.withOpacity(0.15)
        : hasLeaves
            ? AppColors.primary.withOpacity(0.10)
            : ds.bgCard;
    final borderColor = isToday
        ? AppColors.primaryLight
        : hasLeaves
            ? AppColors.primary.withOpacity(0.35)
            : ds.border;

    return InkWell(
      borderRadius: BorderRadius.circular(10),
      onTap: onTap,
      child: Container(
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: borderColor),
        ),
        padding: const EdgeInsets.all(4),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text('$day',
                style: TextStyle(
                    fontSize: 12,
                    fontWeight: FontWeight.w700,
                    color: isToday
                        ? AppColors.primaryLight
                        : ds.textPrimary)),
            if (hasLeaves)
              Align(
                alignment: Alignment.bottomCenter,
                child: Container(
                  padding: const EdgeInsets.symmetric(
                      horizontal: 4, vertical: 1),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.85),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text('$entryCount',
                      style: const TextStyle(
                          fontSize: 9,
                          fontWeight: FontWeight.w800,
                          color: Colors.white)),
                ),
              )
            else if (loading)
              Align(
                alignment: Alignment.bottomCenter,
                child: Container(
                  width: 14, height: 3,
                  decoration: BoxDecoration(
                    color: ds.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _LegendChip extends StatelessWidget {
  const _LegendChip({
    required this.color,
    required this.border,
    required this.label,
  });
  final Color color;
  final Color border;
  final String label;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Row(mainAxisSize: MainAxisSize.min, children: [
      Container(
        width: 14, height: 14,
        decoration: BoxDecoration(
          color: color,
          borderRadius: BorderRadius.circular(4),
          border: Border.all(color: border),
        ),
      ),
      const SizedBox(width: 6),
      Text(label,
          style: TextStyle(fontSize: 11, color: ds.textSecondary)),
    ]);
  }
}

class _TeamDateChip extends StatelessWidget {
  const _TeamDateChip({
    required this.label,
    required this.active,
    required this.onTap,
  });

  final String label;
  final bool active;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(10),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 9),
        decoration: BoxDecoration(
          color: active ? AppColors.primaryLight.withOpacity(0.10) : ds.bgPage,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(
            color: active ? AppColors.primaryLight.withOpacity(0.45) : ds.border,
          ),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(Icons.calendar_today_rounded,
              size: 13, color: active ? AppColors.primaryLight : ds.textMuted),
          const SizedBox(width: 6),
          Flexible(child: Text(label,
              maxLines: 1, overflow: TextOverflow.ellipsis,
              style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: active ? AppColors.primaryLight : ds.textSecondary))),
        ]),
      ),
    );
  }
}
