/// Leave Management screen — requests, balance, and calendar.
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

// ── Screen ────────────────────────────────────────────────────────────────────

class LeaveScreen extends ConsumerStatefulWidget {
  const LeaveScreen({super.key});

  @override
  ConsumerState<LeaveScreen> createState() => _LeaveScreenState();
}

class _LeaveScreenState extends ConsumerState<LeaveScreen>
    with SingleTickerProviderStateMixin {
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
        title: const Text('Leave'),
        backgroundColor: ds.bgPage,
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(icon: Icon(Icons.list_alt_rounded, size: 18),
                text: 'My Requests'),
            Tab(icon: Icon(Icons.account_balance_wallet_rounded, size: 18),
                text: 'Balance'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _RequestsTab(onRefresh: () => ref.invalidate(leaveRequestsProvider)),
          _BalanceTab(),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showApplySheet(context),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.event_available_rounded),
        label: const Text('Apply Leave',
            style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }

  void _showApplySheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ApplyLeaveSheet(
          onApplied: () => ref.invalidate(leaveRequestsProvider)),
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
        '${AppConstants.basePeople}/leave/requests/$id',
        data: {'status': 'CANCELLED'},
      );
      ref.invalidate(leaveRequestsProvider);
    } catch (_) {}
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
                          request.leaveType[0] +
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
              balance.leaveType[0] +
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

// ── Apply leave sheet ─────────────────────────────────────────────────────────

class _ApplyLeaveSheet extends ConsumerStatefulWidget {
  const _ApplyLeaveSheet({required this.onApplied});
  final VoidCallback onApplied;

  @override
  ConsumerState<_ApplyLeaveSheet> createState() => _ApplyLeaveSheetState();
}

class _ApplyLeaveSheetState extends ConsumerState<_ApplyLeaveSheet> {
  final _reasonCtrl = TextEditingController();
  String    _leaveType = 'ANNUAL';
  DateTime? _startDate;
  DateTime? _endDate;
  bool      _loading  = false;
  String?   _error;

  static const _types = [
    'ANNUAL', 'SICK', 'CASUAL', 'MATERNITY', 'PATERNITY', 'OTHER'
  ];

  @override
  void dispose() {
    _reasonCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
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
            Text('Apply for Leave',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: ds.textPrimary)),
            const SizedBox(height: 16),

            DropdownButtonFormField<String>(
              value: _leaveType,
              decoration: const InputDecoration(
                  labelText: 'Leave Type',
                  prefixIcon: Icon(Icons.category_rounded)),
              items: _types
                  .map((t) => DropdownMenuItem(
                      value: t,
                      child: Text(t[0] + t.substring(1).toLowerCase())))
                  .toList(),
              onChanged: (v) => setState(() => _leaveType = v!),
              dropdownColor: ds.bgElevated,
            ),
            const SizedBox(height: 12),

            // Date range
            Row(children: [
              Expanded(
                child: GestureDetector(
                  onTap: () => _pickDate(isStart: true),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 14),
                    decoration: BoxDecoration(
                      color: ds.bgInput,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: ds.border),
                    ),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('From',
                              style: TextStyle(
                                  fontSize: 11, color: ds.textMuted)),
                          const SizedBox(height: 4),
                          Text(
                              _startDate != null
                                  ? DateFormat('d MMM').format(_startDate!)
                                  : 'Select date',
                              style: TextStyle(
                                  color: _startDate != null
                                      ? ds.textPrimary
                                      : ds.textMuted,
                                  fontWeight: FontWeight.w600)),
                        ]),
                  ),
                ),
              ),
              const SizedBox(width: 8),
              Expanded(
                child: GestureDetector(
                  onTap: () => _pickDate(isStart: false),
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 12, vertical: 14),
                    decoration: BoxDecoration(
                      color: ds.bgInput,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: ds.border),
                    ),
                    child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('To',
                              style: TextStyle(
                                  fontSize: 11, color: ds.textMuted)),
                          const SizedBox(height: 4),
                          Text(
                              _endDate != null
                                  ? DateFormat('d MMM').format(_endDate!)
                                  : 'Select date',
                              style: TextStyle(
                                  color: _endDate != null
                                      ? ds.textPrimary
                                      : ds.textMuted,
                                  fontWeight: FontWeight.w600)),
                        ]),
                  ),
                ),
              ),
            ]),
            const SizedBox(height: 12),

            TextField(
              controller: _reasonCtrl,
              decoration: const InputDecoration(
                  labelText: 'Reason',
                  hintText: 'Brief reason for leave'),
              maxLines: 3,
              textCapitalization: TextCapitalization.sentences,
            ),

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
                    : const Text('Submit Request'),
              ),
            ),
          ],
        ),
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
      firstDate: DateTime.now(),
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
    if (_startDate == null || _endDate == null) {
      setState(() => _error = 'Please select start and end dates');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient.instance.post(
        '${AppConstants.basePeople}/leave/requests',
        data: {
          // Backend accepts leave_type name string as leave_type_id
          'leave_type_id': _leaveType,
          'start_date':    DateFormat('yyyy-MM-dd').format(_startDate!),
          'end_date':      DateFormat('yyyy-MM-dd').format(_endDate!),
          'reason':        _reasonCtrl.text.trim(),
        },
      );
      widget.onApplied();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() { _loading = false; _error = e.toString(); });
    }
  }
}
