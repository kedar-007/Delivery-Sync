/// Blockers screen — full CRUD with severity, escalation, and resolution.
/// API: GET/POST/PATCH/DELETE ${AppConstants.baseCore}/blockers
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

// ── Provider ──────────────────────────────────────────────────────────────────

final blockersProvider = FutureProvider.autoDispose<List<Blocker>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/blockers',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map ? (data['blockers'] as List<dynamic>? ?? []) : []);
  return list.map((e) => Blocker.fromJson(e as Map<String, dynamic>)).toList();
});

// ── Screen ────────────────────────────────────────────────────────────────────

class BlockersScreen extends ConsumerStatefulWidget {
  const BlockersScreen({super.key});

  @override
  ConsumerState<BlockersScreen> createState() => _BlockersScreenState();
}

class _BlockersScreenState extends ConsumerState<BlockersScreen> {
  String _filter = 'ALL'; // ALL | OPEN | RESOLVED

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final blockers = ref.watch(blockersProvider);

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Blockers'),
        backgroundColor: ds.bgPage,
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            onPressed: () => _showCreateSheet(context),
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Filter ───────────────────────────────────────────────────────
          _FilterRow(
            selected: _filter,
            onSelected: (f) => setState(() => _filter = f),
          ),

          // ── Summary chips ─────────────────────────────────────────────────
          blockers.when(
            data: (list) => _SummaryRow(blockers: list),
            loading: () => const SizedBox.shrink(),
            error:   (_, __) => const SizedBox.shrink(),
          ),

          // ── List ──────────────────────────────────────────────────────────
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(blockersProvider),
              color: AppColors.primaryLight,
              child: blockers.when(
                data: (list) {
                  final filtered = _filter == 'ALL'
                      ? list
                      : _filter == 'RESOLVED'
                          ? list.where((b) => b.status == 'RESOLVED').toList()
                          : list.where((b) => b.status != 'RESOLVED').toList();
                  if (filtered.isEmpty) {
                    return Center(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.check_circle_outline_rounded,
                            size: 56, color: ds.textMuted),
                        const SizedBox(height: 12),
                        Text('No blockers — great!',
                            style: TextStyle(color: ds.textMuted, fontSize: 15)),
                      ]),
                    );
                  }
                  return ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) => _BlockerCard(
                      filtered[i],
                      onResolve: () => _showResolveDialog(context, filtered[i]),
                      onDelete:  () => _delete(context, filtered[i].id),
                    ),
                  );
                },
                loading: () => ListView(
                  children: List.generate(3, (_) => const ShimmerCard()),
                ),
                error: (e, _) => Center(
                  child: Text('$e',
                      style: const TextStyle(color: AppColors.error)),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreateSheet(context),
        backgroundColor: AppColors.ragRed,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.block_rounded),
        label: const Text('Log Blocker',
            style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }

  Future<void> _showResolveDialog(BuildContext context, Blocker blocker) async {
    final ctrl = TextEditingController();
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Resolve Blocker'),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text(blocker.title,
              style: const TextStyle(fontWeight: FontWeight.w600)),
          const SizedBox(height: 12),
          TextField(
            controller: ctrl,
            decoration: const InputDecoration(
                labelText: 'Resolution note *',
                hintText: 'How was this resolved?'),
            maxLines: 3,
          ),
        ]),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(ctx, false),
              child: const Text('Cancel')),
          ElevatedButton(
              onPressed: () => Navigator.pop(ctx, true),
              child: const Text('Mark Resolved')),
        ],
      ),
    );
    if (ok != true || ctrl.text.trim().isEmpty) return;
    try {
      await ApiClient.instance.patch(
        '${AppConstants.baseCore}/blockers/${blocker.id}',
        data: {
          'status':     'RESOLVED',
          'resolution': ctrl.text.trim(),
          'resolvedDate': DateFormat('yyyy-MM-dd').format(DateTime.now()),
        },
      );
      ref.invalidate(blockersProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'),
              backgroundColor: AppColors.error),
        );
      }
    }
  }

  Future<void> _delete(BuildContext context, String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete blocker?'),
        content: const Text('This cannot be undone.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Delete',
                  style: TextStyle(color: AppColors.error))),
        ],
      ),
    );
    if (ok != true) return;
    try {
      await ApiClient.instance
          .delete('${AppConstants.baseCore}/blockers/$id');
      ref.invalidate(blockersProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'),
              backgroundColor: AppColors.error),
        );
      }
    }
  }

  void _showCreateSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) =>
          _CreateBlockerSheet(onCreated: () => ref.invalidate(blockersProvider)),
    );
  }
}

// ── Filter row ────────────────────────────────────────────────────────────────

class _FilterRow extends StatelessWidget {
  const _FilterRow({required this.selected, required this.onSelected});
  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      height: 52,
      color: ds.bgPage,
      child: ListView(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        children: [
          for (final (v, l) in [
            ('ALL', 'All'),
            ('OPEN', 'Open'),
            ('RESOLVED', 'Resolved'),
          ])
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: GestureDetector(
                onTap: () => onSelected(v),
                child: AnimatedContainer(
                  duration: 200.ms,
                  padding: const EdgeInsets.symmetric(
                      horizontal: 14, vertical: 5),
                  decoration: BoxDecoration(
                    color: selected == v
                        ? AppColors.ragRed
                        : ds.bgElevated,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: selected == v
                            ? AppColors.ragRed
                            : ds.border),
                  ),
                  child: Text(l,
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: selected == v
                              ? Colors.white
                              : ds.textSecondary)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Summary row ───────────────────────────────────────────────────────────────

class _SummaryRow extends StatelessWidget {
  const _SummaryRow({required this.blockers});
  final List<Blocker> blockers;

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final open     = blockers.where((b) => b.status == 'OPEN').length;
    final critical = blockers
        .where((b) => b.severity == 'CRITICAL' && b.status == 'OPEN')
        .length;
    final resolved = blockers.where((b) => b.status == 'RESOLVED').length;

    return Container(
      margin: const EdgeInsets.fromLTRB(16, 0, 16, 8),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceAround,
        children: [
          _Stat(open.toString(), 'OPEN', AppColors.ragRed),
          Container(width: 1, height: 32, color: ds.border),
          _Stat(critical.toString(), 'CRITICAL', AppColors.priorityCritical),
          Container(width: 1, height: 32, color: ds.border),
          _Stat(resolved.toString(), 'RESOLVED', AppColors.ragGreen),
        ],
      ),
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat(this.value, this.label, this.color);
  final String value;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Column(children: [
      Text(value,
          style: TextStyle(
              fontSize: 22, fontWeight: FontWeight.w800, color: color)),
      Text(label,
          style: TextStyle(
              fontSize: 9, fontWeight: FontWeight.w700,
              color: ds.textMuted, letterSpacing: 0.5)),
    ]);
  }
}

// ── Blocker card ──────────────────────────────────────────────────────────────

class _BlockerCard extends StatelessWidget {
  const _BlockerCard(this.blocker,
      {required this.onResolve, required this.onDelete});
  final Blocker blocker;
  final VoidCallback onResolve;
  final VoidCallback onDelete;

  Color get _severityColor => switch (blocker.severity) {
        'CRITICAL' => AppColors.priorityCritical,
        'HIGH'     => AppColors.priorityHigh,
        'MEDIUM'   => AppColors.priorityMedium,
        _          => AppColors.info,
      };

  Color get _statusColor => switch (blocker.status) {
        'RESOLVED'  => AppColors.ragGreen,
        'ESCALATED' => const Color(0xFFA855F7),
        _           => AppColors.ragRed,
      };

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final isResolved = blocker.status == 'RESOLVED';

    // Calculate age in days
    int? age;
    if (blocker.createdAt != null) {
      try {
        final created = DateTime.parse(blocker.createdAt!);
        age = DateTime.now().difference(created).inDays;
      } catch (_) {}
    }

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: isResolved ? AppColors.ragGreen.withOpacity(0.3) : ds.border),
      ),
      child: Row(
        children: [
          // Severity color bar
          Container(
            width: 5,
            height: null,
            constraints: const BoxConstraints(minHeight: 80),
            decoration: BoxDecoration(
              color: _severityColor,
              borderRadius: const BorderRadius.horizontal(
                  left: Radius.circular(15)),
            ),
          ),

          // Content
          Expanded(
            child: Padding(
              padding: const EdgeInsets.all(14),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Expanded(
                      child: Text(
                        blocker.title,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w700,
                          color: isResolved ? ds.textMuted : ds.textPrimary,
                          decoration: isResolved
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                    ),
                    // Status badge
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 8, vertical: 3),
                      decoration: BoxDecoration(
                        color: _statusColor.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(6),
                        border: Border.all(
                            color: _statusColor.withOpacity(0.3)),
                      ),
                      child: Text(
                        blocker.statusDisplay,
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: _statusColor),
                      ),
                    ),
                  ]),

                  const SizedBox(height: 6),
                  Row(children: [
                    // Severity badge
                    Container(
                      padding: const EdgeInsets.symmetric(
                          horizontal: 6, vertical: 2),
                      decoration: BoxDecoration(
                        color: _severityColor.withOpacity(0.12),
                        borderRadius: BorderRadius.circular(4),
                      ),
                      child: Text(
                        blocker.severityDisplay,
                        style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: _severityColor),
                      ),
                    ),
                    if (age != null) ...[
                      const SizedBox(width: 8),
                      Text('$age days old',
                          style: TextStyle(
                              fontSize: 11, color: ds.textMuted)),
                    ],
                  ]),

                  // Resolution note
                  if (blocker.resolution != null) ...[
                    const SizedBox(height: 8),
                    Container(
                      padding: const EdgeInsets.all(8),
                      decoration: BoxDecoration(
                        color: AppColors.ragGreen.withOpacity(0.08),
                        borderRadius: BorderRadius.circular(8),
                        border: Border.all(
                            color: AppColors.ragGreen.withOpacity(0.2)),
                      ),
                      child: Row(children: [
                        Icon(Icons.check_circle_rounded,
                            size: 12, color: AppColors.ragGreen),
                        const SizedBox(width: 6),
                        Expanded(
                          child: Text(
                            blocker.resolution!,
                            style: TextStyle(
                                fontSize: 11, color: ds.textSecondary),
                            maxLines: 2,
                            overflow: TextOverflow.ellipsis,
                          ),
                        ),
                      ]),
                    ),
                  ],

                  // Actions
                  if (!isResolved)
                    Padding(
                      padding: const EdgeInsets.only(top: 10),
                      child: Row(children: [
                        _ActionBtn(
                          label: 'Resolve',
                          icon: Icons.check_circle_rounded,
                          color: AppColors.ragGreen,
                          onTap: onResolve,
                        ),
                        const SizedBox(width: 8),
                        _ActionBtn(
                          label: 'Delete',
                          icon: Icons.delete_rounded,
                          color: AppColors.error,
                          onTap: onDelete,
                        ),
                      ]),
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms).slideX(begin: 0.04);
  }
}

class _ActionBtn extends StatelessWidget {
  const _ActionBtn(
      {required this.label,
      required this.icon,
      required this.color,
      required this.onTap});
  final String label;
  final IconData icon;
  final Color color;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(
          color: color.withOpacity(0.1),
          borderRadius: BorderRadius.circular(8),
          border: Border.all(color: color.withOpacity(0.3)),
        ),
        child: Row(mainAxisSize: MainAxisSize.min, children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(label,
              style: TextStyle(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: color)),
        ]),
      ),
    );
  }
}

// ── Create blocker sheet ──────────────────────────────────────────────────────

class _CreateBlockerSheet extends ConsumerStatefulWidget {
  const _CreateBlockerSheet({required this.onCreated});
  final VoidCallback onCreated;

  @override
  ConsumerState<_CreateBlockerSheet> createState() =>
      _CreateBlockerSheetState();
}

class _CreateBlockerSheetState extends ConsumerState<_CreateBlockerSheet> {
  final _titleCtrl = TextEditingController();
  final _descCtrl  = TextEditingController();
  String _severity = 'HIGH';
  bool _loading = false;
  String? _error;

  static const _severities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
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
            Text('Log Blocker',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: ds.textPrimary)),
            const SizedBox(height: 16),
            TextField(
              controller: _titleCtrl,
              decoration: const InputDecoration(
                  labelText: 'What is blocking you? *',
                  prefixIcon: Icon(Icons.block_rounded)),
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descCtrl,
              decoration: const InputDecoration(
                  labelText: 'Description (optional)'),
              maxLines: 3,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: _severity,
              decoration: const InputDecoration(
                  labelText: 'Severity',
                  prefixIcon: Icon(Icons.warning_rounded)),
              items: _severities
                  .map((s) => DropdownMenuItem(
                      value: s,
                      child: Text(s[0] + s.substring(1).toLowerCase())))
                  .toList(),
              onChanged: (v) => setState(() => _severity = v!),
              dropdownColor: ds.bgElevated,
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
              child: ElevatedButton.icon(
                onPressed: _loading ? null : _submit,
                style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.ragRed),
                icon: const Icon(Icons.block_rounded, size: 18),
                label: _loading
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : const Text('Log Blocker'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _submit() async {
    if (_titleCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Title is required');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseCore}/blockers',
        data: {
          'title':    _titleCtrl.text.trim(),
          'severity': _severity,
          if (_descCtrl.text.trim().isNotEmpty)
            'description': _descCtrl.text.trim(),
        },
      );
      widget.onCreated();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() { _loading = false; _error = e.toString(); });
    }
  }
}
