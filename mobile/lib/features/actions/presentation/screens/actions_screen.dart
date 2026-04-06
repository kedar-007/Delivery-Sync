/// Actions screen — full CRUD for action items.
/// API: GET/POST/PATCH/DELETE ${AppConstants.baseCore}/actions
library;

import 'package:flutter/material.dart' hide Action;
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/models/models.dart';
import '../../../../shared/widgets/ds_metric_card.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final _actionsProvider = FutureProvider.autoDispose<List<Action>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/actions',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map ? (data['actions'] as List<dynamic>? ?? []) : []);
  return list.map((e) => Action.fromJson(e as Map<String, dynamic>)).toList();
});

// ── Screen ────────────────────────────────────────────────────────────────────

class ActionsScreen extends ConsumerStatefulWidget {
  const ActionsScreen({super.key});

  @override
  ConsumerState<ActionsScreen> createState() => _ActionsScreenState();
}

class _ActionsScreenState extends ConsumerState<ActionsScreen> {
  String _filter = 'ALL'; // ALL | OPEN | IN_PROGRESS | DONE

  @override
  Widget build(BuildContext context) {
    final ds      = context.ds;
    final actions = ref.watch(_actionsProvider);

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Actions'),
        backgroundColor: ds.bgPage,
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            tooltip: 'New action',
            onPressed: () => _showCreateSheet(context),
          ),
        ],
      ),
      body: Column(
        children: [
          // ── Filter chips ──────────────────────────────────────────────────
          _FilterChips(
            selected: _filter,
            onSelected: (f) => setState(() => _filter = f),
          ),

          // ── List ──────────────────────────────────────────────────────────
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(_actionsProvider),
              color: AppColors.primaryLight,
              child: actions.when(
                data: (list) {
                  final filtered = _filter == 'ALL'
                      ? list
                      : list.where((a) => a.status == _filter).toList();
                  if (filtered.isEmpty) {
                    return _EmptyState(filter: _filter);
                  }
                  return ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) => _ActionCard(
                      filtered[i],
                      onMarkDone:    () => _markDone(filtered[i].id),
                      onDelete:      () => _delete(context, filtered[i].id),
                      onStatusTap:   () => _showStatusPicker(context, filtered[i]),
                    ),
                  );
                },
                loading: () => ListView(
                  children: List.generate(4, (_) => const ShimmerCard()),
                ),
                error: (e, _) => Center(
                  child: Text('$e', style: const TextStyle(color: AppColors.error)),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showCreateSheet(context),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_task_rounded),
        label: const Text('New Action',
            style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }

  Future<void> _markDone(String id) async {
    await _updateStatus(id, 'DONE');
  }

  Future<void> _updateStatus(String id, String status) async {
    try {
      // Backend only has PUT /:actionId — no PATCH endpoint
      await ApiClient.instance.put(
        '${AppConstants.baseCore}/actions/$id',
        data: {'status': status},
      );
      ref.invalidate(_actionsProvider);
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'),
              backgroundColor: AppColors.error),
        );
      }
    }
  }

  void _showStatusPicker(BuildContext context, Action action) {
    final statuses = [
      ('OPEN',        'Open',        Icons.radio_button_unchecked_rounded, AppColors.warning),
      ('IN_PROGRESS', 'In Progress', Icons.pending_rounded,               AppColors.info),
      ('DONE',        'Done',        Icons.check_circle_rounded,           AppColors.success),
      ('CANCELLED',   'Cancelled',   Icons.cancel_rounded,                 AppColors.textMuted),
    ];
    showModalBottomSheet(
      context: context,
      backgroundColor: context.ds.bgCard,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
        child: Column(mainAxisSize: MainAxisSize.min, children: [
          Container(
            width: 36, height: 4,
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
                color: context.ds.border,
                borderRadius: BorderRadius.circular(2)),
          ),
          Text('Update Status',
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700,
                  color: context.ds.textPrimary)),
          const SizedBox(height: 16),
          ...statuses.map((s) {
            final (val, label, icon, color) = s;
            final isCurrent = action.status == val;
            return ListTile(
              leading: Icon(icon, color: color),
              title: Text(label,
                  style: TextStyle(fontWeight: FontWeight.w600,
                      color: isCurrent ? color : context.ds.textPrimary)),
              trailing: isCurrent
                  ? Icon(Icons.check_rounded, color: color)
                  : null,
              onTap: () {
                Navigator.pop(context);
                if (!isCurrent) _updateStatus(action.id, val);
              },
            );
          }),
        ]),
      ),
    );
  }

  Future<void> _delete(BuildContext context, String id) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete action?'),
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
      await ApiClient.instance.delete('${AppConstants.baseCore}/actions/$id');
      ref.invalidate(_actionsProvider);
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
      builder: (_) => _CreateActionSheet(onCreated: () => ref.invalidate(_actionsProvider)),
    );
  }
}

// ── Filter chips ──────────────────────────────────────────────────────────────

class _FilterChips extends StatelessWidget {
  const _FilterChips({required this.selected, required this.onSelected});
  final String selected;
  final ValueChanged<String> onSelected;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final filters = [
      ('ALL', 'All'),
      ('OPEN', 'Open'),
      ('IN_PROGRESS', 'In Progress'),
      ('DONE', 'Done'),
    ];
    return Container(
      height: 52,
      color: ds.bgPage,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
        itemCount: filters.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final (value, label) = filters[i];
          final isSelected = selected == value;
          return GestureDetector(
            onTap: () => onSelected(value),
            child: AnimatedContainer(
              duration: 200.ms,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
              decoration: BoxDecoration(
                color: isSelected
                    ? AppColors.primary
                    : ds.bgElevated,
                borderRadius: BorderRadius.circular(20),
                border: Border.all(
                  color: isSelected
                      ? AppColors.primary
                      : ds.border,
                ),
              ),
              child: Text(
                label,
                style: TextStyle(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: isSelected ? Colors.white : ds.textSecondary,
                ),
              ),
            ),
          );
        },
      ),
    );
  }
}

// ── Action card ───────────────────────────────────────────────────────────────

class _ActionCard extends StatelessWidget {
  const _ActionCard(this.action,
      {required this.onMarkDone, required this.onDelete, required this.onStatusTap});
  final Action action;
  final VoidCallback onMarkDone;
  final VoidCallback onDelete;
  final VoidCallback onStatusTap;

  @override
  Widget build(BuildContext context) {
    final ds     = context.ds;
    final isDone = action.status == 'DONE';

    return Dismissible(
      key: ValueKey(action.id),
      direction: DismissDirection.endToStart,
      background: Container(
        alignment: Alignment.centerRight,
        padding: const EdgeInsets.only(right: 20),
        decoration: BoxDecoration(
          color: AppColors.error.withOpacity(0.15),
          borderRadius: BorderRadius.circular(16),
        ),
        child: const Icon(Icons.delete_rounded, color: AppColors.error),
      ),
      confirmDismiss: (_) async {
        onDelete();
        return false;
      },
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isDone
                ? AppColors.success.withOpacity(0.3)
                : ds.border,
          ),
        ),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: onStatusTap,
          onLongPress: onStatusTap,
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Row(
              children: [
                // Done toggle
                GestureDetector(
                  onTap: onMarkDone,
                  child: Container(
                    width: 24,
                    height: 24,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: isDone
                          ? AppColors.success
                          : Colors.transparent,
                      border: Border.all(
                        color: isDone
                            ? AppColors.success
                            : ds.textMuted,
                        width: 2,
                      ),
                    ),
                    child: isDone
                        ? const Icon(Icons.check_rounded,
                            color: Colors.white, size: 14)
                        : null,
                  ),
                ),
                const SizedBox(width: 12),

                // Title & meta
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        action.title,
                        style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: isDone ? ds.textMuted : ds.textPrimary,
                          decoration: isDone
                              ? TextDecoration.lineThrough
                              : null,
                        ),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis,
                      ),
                      const SizedBox(height: 6),
                      Row(children: [
                        PriorityBadge(action.priority),
                        const SizedBox(width: 8),
                        StatusChip(action.status),
                        if (action.dueDate != null) ...[
                          const SizedBox(width: 8),
                          _DueDateChip(action.dueDate!),
                        ],
                      ]),
                    ],
                  ),
                ),

                // Delete button
                IconButton(
                  icon: Icon(Icons.delete_outline_rounded,
                      size: 18, color: ds.textMuted),
                  onPressed: onDelete,
                  splashRadius: 18,
                ),
              ],
            ),
          ),
        ),
      ),
    ).animate().fadeIn(duration: 300.ms).slideX(begin: 0.04);
  }
}

class _DueDateChip extends StatelessWidget {
  const _DueDateChip(this.dateStr);
  final String dateStr;

  @override
  Widget build(BuildContext context) {
    DateTime? date;
    try {
      date = DateTime.parse(dateStr);
    } catch (_) {}

    final isOverdue = date != null && date.isBefore(DateTime.now());
    final color = isOverdue ? AppColors.error : AppColors.textMuted;
    final label = date != null
        ? DateFormat('d MMM').format(date)
        : dateStr.substring(0, 10);

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(5),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.event_rounded, size: 10, color: color),
        const SizedBox(width: 3),
        Text(label,
            style: TextStyle(fontSize: 10, color: color,
                fontWeight: FontWeight.w600)),
      ]),
    );
  }
}

// ── Create action sheet ───────────────────────────────────────────────────────

class _CreateActionSheet extends ConsumerStatefulWidget {
  const _CreateActionSheet({required this.onCreated});
  final VoidCallback onCreated;

  @override
  ConsumerState<_CreateActionSheet> createState() => _CreateActionSheetState();
}

class _CreateActionSheetState extends ConsumerState<_CreateActionSheet> {
  final _titleCtrl = TextEditingController();
  final _descCtrl  = TextEditingController();
  String   _priority  = 'MEDIUM';
  DateTime? _dueDate;
  bool _loading = false;
  String? _error;

  static const _priorities = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

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
            // Handle
            Center(
              child: Container(
                width: 36, height: 4,
                decoration: BoxDecoration(
                    color: ds.border,
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 20),

            Text('New Action',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800,
                    color: ds.textPrimary)),
            const SizedBox(height: 16),

            TextField(
              controller: _titleCtrl,
              decoration: const InputDecoration(
                  labelText: 'Title *',
                  prefixIcon: Icon(Icons.task_alt_rounded)),
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descCtrl,
              decoration: const InputDecoration(
                  labelText: 'Description (optional)',
                  prefixIcon: Icon(Icons.notes_rounded)),
              maxLines: 2,
            ),
            const SizedBox(height: 12),

            // Priority
            DropdownButtonFormField<String>(
              value: _priority,
              decoration: const InputDecoration(
                  labelText: 'Priority',
                  prefixIcon: Icon(Icons.flag_rounded)),
              items: _priorities
                  .map((p) => DropdownMenuItem(
                      value: p,
                      child: Text(p[0] + p.substring(1).toLowerCase())))
                  .toList(),
              onChanged: (v) => setState(() => _priority = v!),
              dropdownColor: ds.bgElevated,
            ),
            const SizedBox(height: 12),

            // Due date
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
                  Icon(Icons.event_rounded,
                      size: 20, color: ds.textMuted),
                  const SizedBox(width: 12),
                  Text(
                    _dueDate != null
                        ? DateFormat('d MMM yyyy').format(_dueDate!)
                        : 'Due date (optional)',
                    style: TextStyle(
                        color: _dueDate != null
                            ? ds.textPrimary
                            : ds.textMuted),
                  ),
                  const Spacer(),
                  if (_dueDate != null)
                    GestureDetector(
                      onTap: () => setState(() => _dueDate = null),
                      child: Icon(Icons.close_rounded,
                          size: 16, color: ds.textMuted),
                    ),
                ]),
              ),
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
                        width: 20, height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : const Text('Create Action'),
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
      initialDate: DateTime.now().add(const Duration(days: 7)),
      firstDate: DateTime.now(),
      lastDate: DateTime.now().add(const Duration(days: 365)),
    );
    if (picked != null) setState(() => _dueDate = picked);
  }

  Future<void> _submit() async {
    if (_titleCtrl.text.trim().isEmpty) {
      setState(() => _error = 'Title is required');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseCore}/actions',
        data: {
          'title':    _titleCtrl.text.trim(),
          'priority': _priority,
          if (_descCtrl.text.trim().isNotEmpty)
            'description': _descCtrl.text.trim(),
          if (_dueDate != null)
            'dueDate': DateFormat('yyyy-MM-dd').format(_dueDate!),
        },
      );
      widget.onCreated();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() { _loading = false; _error = e.toString(); });
    }
  }
}

// ── Empty state ───────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  const _EmptyState({required this.filter});
  final String filter;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Center(
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.task_alt_rounded, size: 56, color: ds.textMuted),
        const SizedBox(height: 12),
        Text(
          filter == 'ALL'
              ? 'No actions yet'
              : 'No ${filter.toLowerCase()} actions',
          style: TextStyle(color: ds.textMuted, fontSize: 15),
        ),
      ]),
    );
  }
}
