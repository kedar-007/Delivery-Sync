/// RAID screen — Risks, Assumptions, Issues, Dependencies.
/// API: GET/POST/PATCH/DELETE ${AppConstants.baseCore}/raid
library;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/models/models.dart';
import '../../../../shared/widgets/ds_metric_card.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _raidProvider =
    FutureProvider.family.autoDispose<List<RaidItem>, String>((ref, type) async {
  final path = switch (type) {
    'RISK'       => 'risks',
    'ISSUE'      => 'issues',
    'DEPENDENCY' => 'dependencies',
    'ASSUMPTION' => 'assumptions',
    _            => 'risks',
  };
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/raid/$path',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map ? (data['items'] as List<dynamic>? ?? []) : []);
  return list.map((e) => RaidItem.fromJson(e as Map<String, dynamic>)).toList();
});

// ── Screen ────────────────────────────────────────────────────────────────────

class RaidScreen extends ConsumerStatefulWidget {
  const RaidScreen({super.key});

  @override
  ConsumerState<RaidScreen> createState() => _RaidScreenState();
}

class _RaidScreenState extends ConsumerState<RaidScreen>
    with SingleTickerProviderStateMixin {
  late final _tabController = TabController(length: 4, vsync: this);

  static const _tabs = [
    ('RISK',       'Risks',        Icons.warning_rounded,        AppColors.ragRed),
    ('ISSUE',      'Issues',       Icons.error_outline_rounded,  AppColors.ragAmber),
    ('DEPENDENCY', 'Dependencies', Icons.link_rounded,           AppColors.info),
    ('ASSUMPTION', 'Assumptions',  Icons.lightbulb_outline_rounded, AppColors.ragAmber),
  ];

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
        title: const Text('RAID Log'),
        backgroundColor: ds.bgPage,
        surfaceTintColor: Colors.transparent,
        bottom: TabBar(
          controller: _tabController,
          isScrollable: true,
          tabAlignment: TabAlignment.start,
          tabs: _tabs.map((t) {
            final (_, label, icon, color) = t;
            return Tab(
              child: Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(icon, size: 15, color: color),
                const SizedBox(width: 5),
                Text(label),
              ]),
            );
          }).toList(),
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: _tabs.map((t) {
          final (type, _, icon, color) = t;
          return _RaidTab(
            type:  type,
            color: color,
            icon:  icon,
            onAdd: () => _showAddSheet(context, type),
          );
        }).toList(),
      ),
    );
  }

  void _showAddSheet(BuildContext context, String type) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _AddRaidItemSheet(
        type: type,
        onCreated: () {
          ref.invalidate(_raidProvider(type));
        },
      ),
    );
  }
}

// ── RAID tab ──────────────────────────────────────────────────────────────────

class _RaidTab extends ConsumerWidget {
  const _RaidTab(
      {required this.type,
      required this.color,
      required this.icon,
      required this.onAdd});
  final String type;
  final Color color;
  final IconData icon;
  final VoidCallback onAdd;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds    = context.ds;
    final items = ref.watch(_raidProvider(type));

    return Scaffold(
      backgroundColor: ds.bgPage,
      floatingActionButton: FloatingActionButton(
        onPressed: onAdd,
        backgroundColor: color,
        foregroundColor: Colors.white,
        mini: true,
        child: const Icon(Icons.add_rounded),
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(_raidProvider(type)),
        color: color,
        child: items.when(
          data: (list) {
            if (list.isEmpty) {
              return Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(icon, size: 52, color: ds.textMuted),
                  const SizedBox(height: 12),
                  Text('No ${type.toLowerCase()}s',
                      style: TextStyle(color: ds.textMuted)),
                  const SizedBox(height: 16),
                  TextButton.icon(
                    onPressed: onAdd,
                    icon: const Icon(Icons.add_rounded),
                    label: Text('Add ${type[0] + type.substring(1).toLowerCase()}'),
                  ),
                ]),
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 100),
              itemCount: list.length,
              itemBuilder: (_, i) => _RaidItemCard(list[i], color),
            );
          },
          loading: () => ListView(
            children: List.generate(3, (_) => const ShimmerCard()),
          ),
          error: (e, _) => Center(
            child: Text('$e', style: const TextStyle(color: AppColors.error)),
          ),
        ),
      ),
    );
  }
}

// ── RAID item card ────────────────────────────────────────────────────────────

class _RaidItemCard extends StatelessWidget {
  const _RaidItemCard(this.item, this.accentColor);
  final RaidItem item;
  final Color accentColor;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;

    Color priorityColor(String p) => switch (p) {
          'CRITICAL' => AppColors.priorityCritical,
          'HIGH'     => AppColors.priorityHigh,
          'LOW'      => AppColors.priorityLow,
          _          => AppColors.priorityMedium,
        };

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ds.border),
      ),
      child: Row(
        children: [
          Container(
            width: 4,
            constraints: const BoxConstraints(minHeight: 72),
            decoration: BoxDecoration(
              color: accentColor,
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
                    Expanded(
                      child: Text(item.title,
                          style: TextStyle(
                              fontSize: 14,
                              fontWeight: FontWeight.w700,
                              color: ds.textPrimary),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis),
                    ),
                    const SizedBox(width: 8),
                    _StatusBadge(item.status),
                  ]),
                  if (item.description != null &&
                      item.description!.isNotEmpty) ...[
                    const SizedBox(height: 4),
                    Text(item.description!,
                        style: TextStyle(
                            fontSize: 12, color: ds.textSecondary),
                        maxLines: 2,
                        overflow: TextOverflow.ellipsis),
                  ],
                  const SizedBox(height: 8),
                  Row(children: [
                    PriorityBadge(item.priority),
                    if (item.impact != null && item.impact!.isNotEmpty) ...[
                      const SizedBox(width: 8),
                      _ImpactBadge(item.impact!),
                    ],
                  ]),
                ],
              ),
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 300.ms).slideX(begin: 0.04);
  }
}

class _StatusBadge extends StatelessWidget {
  const _StatusBadge(this.status);
  final String status;

  @override
  Widget build(BuildContext context) {
    final color = switch (status) {
      'RESOLVED' => AppColors.ragGreen,
      'CLOSED'   => AppColors.ragGreen,
      'OPEN'     => AppColors.ragRed,
      _          => AppColors.warning,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(5),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(
        status[0] + status.substring(1).toLowerCase(),
        style: TextStyle(
            fontSize: 10, fontWeight: FontWeight.w700, color: color),
      ),
    );
  }
}

class _ImpactBadge extends StatelessWidget {
  const _ImpactBadge(this.impact);
  final String impact;

  @override
  Widget build(BuildContext context) {
    final color = switch (impact.toUpperCase()) {
      'HIGH'   => AppColors.ragRed,
      'MEDIUM' => AppColors.ragAmber,
      _        => AppColors.ragGreen,
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(5),
      ),
      child: Row(mainAxisSize: MainAxisSize.min, children: [
        Icon(Icons.bolt_rounded, size: 10, color: color),
        const SizedBox(width: 2),
        Text('Impact: ${impact[0] + impact.substring(1).toLowerCase()}',
            style: TextStyle(
                fontSize: 10, fontWeight: FontWeight.w600, color: color)),
      ]),
    );
  }
}

// ── Add RAID item sheet ───────────────────────────────────────────────────────

class _AddRaidItemSheet extends ConsumerStatefulWidget {
  const _AddRaidItemSheet({required this.type, required this.onCreated});
  final String type;
  final VoidCallback onCreated;

  @override
  ConsumerState<_AddRaidItemSheet> createState() => _AddRaidItemSheetState();
}

class _AddRaidItemSheetState extends ConsumerState<_AddRaidItemSheet> {
  final _titleCtrl = TextEditingController();
  final _descCtrl  = TextEditingController();
  String _priority = 'MEDIUM';
  String _impact   = 'MEDIUM';
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds    = context.ds;
    final label = widget.type[0] + widget.type.substring(1).toLowerCase();

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
            Text('Add $label',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: ds.textPrimary)),
            const SizedBox(height: 16),
            TextField(
              controller: _titleCtrl,
              decoration: InputDecoration(labelText: '$label title *'),
              textCapitalization: TextCapitalization.sentences,
            ),
            const SizedBox(height: 12),
            TextField(
              controller: _descCtrl,
              decoration:
                  const InputDecoration(labelText: 'Description (optional)'),
              maxLines: 3,
            ),
            const SizedBox(height: 12),
            Row(children: [
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _priority,
                  decoration: const InputDecoration(labelText: 'Priority'),
                  items: ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']
                      .map((v) => DropdownMenuItem(
                          value: v,
                          child: Text(v[0] + v.substring(1).toLowerCase())))
                      .toList(),
                  onChanged: (v) => setState(() => _priority = v!),
                  dropdownColor: ds.bgElevated,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: DropdownButtonFormField<String>(
                  value: _impact,
                  decoration: const InputDecoration(labelText: 'Impact'),
                  items: ['HIGH', 'MEDIUM', 'LOW']
                      .map((v) => DropdownMenuItem(
                          value: v,
                          child: Text(v[0] + v.substring(1).toLowerCase())))
                      .toList(),
                  onChanged: (v) => setState(() => _impact = v!),
                  dropdownColor: ds.bgElevated,
                ),
              ),
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
                    : Text('Add $label'),
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
    final path = switch (widget.type) {
      'RISK'       => 'risks',
      'ISSUE'      => 'issues',
      'DEPENDENCY' => 'dependencies',
      'ASSUMPTION' => 'assumptions',
      _            => 'risks',
    };
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseCore}/raid/$path',
        data: {
          'title':    _titleCtrl.text.trim(),
          'type':     widget.type,
          'priority': _priority,
          'impact':   _impact,
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
