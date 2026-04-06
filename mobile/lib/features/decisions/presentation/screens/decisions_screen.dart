import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/ds_metric_card.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final decisionsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/decisions',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['decisions'] as List? ?? d['data'] as List? ?? [];
  return [];
});

// ── Screen ────────────────────────────────────────────────────────────────────

class DecisionsScreen extends ConsumerStatefulWidget {
  const DecisionsScreen({super.key});

  @override
  ConsumerState<DecisionsScreen> createState() => _DecisionsScreenState();
}

class _DecisionsScreenState extends ConsumerState<DecisionsScreen> {
  String _filter = 'ALL';

  static const _filters = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'];

  @override
  Widget build(BuildContext context) {
    final ds        = context.ds;
    final decisions = ref.watch(decisionsProvider);

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Decisions'),
        backgroundColor: ds.bgPage,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(decisionsProvider),
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter chips
          SizedBox(
            height: 44,
            child: ListView(
              scrollDirection: Axis.horizontal,
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
              children: _filters.map((f) {
                final sel = _filter == f;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: FilterChip(
                    selected: sel,
                    label: Text(f == 'ALL' ? 'All' : _capitalize(f)),
                    onSelected: (_) => setState(() => _filter = f),
                    selectedColor: AppColors.primaryLight.withOpacity(0.15),
                    checkmarkColor: AppColors.primaryLight,
                    labelStyle: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w600,
                      color: sel ? AppColors.primaryLight : ds.textSecondary,
                    ),
                  ),
                );
              }).toList(),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(decisionsProvider),
              color: AppColors.primaryLight,
              child: decisions.when(
                data: (list) {
                  final filtered = _filter == 'ALL'
                      ? list
                      : list.where((d) {
                          final m = d as Map<String, dynamic>;
                          final s = (m['status'] as String? ?? '').toUpperCase();
                          return s == _filter;
                        }).toList();

                  if (filtered.isEmpty) {
                    return Center(
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(Icons.gavel_rounded, size: 52, color: ds.textMuted),
                        const SizedBox(height: 12),
                        Text('No decisions yet', style: TextStyle(color: ds.textMuted)),
                        const SizedBox(height: 8),
                        Text('Log decisions to track team choices',
                            style: TextStyle(fontSize: 12, color: ds.textMuted),
                            textAlign: TextAlign.center),
                      ]),
                    );
                  }

                  return ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) => _DecisionCard(filtered[i] as Map<String, dynamic>),
                  );
                },
                loading: () => ListView(
                  padding: const EdgeInsets.all(16),
                  children: List.generate(4, (_) => const ShimmerCard(height: 120)),
                ),
                error: (e, _) => Center(
                  child: Text('$e',
                      style: const TextStyle(color: AppColors.error, fontSize: 12),
                      textAlign: TextAlign.center),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primaryLight,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.add_rounded),
        label: const Text('Log Decision'),
        onPressed: () => _showCreateForm(context, ref),
      ),
    );
  }

  void _showCreateForm(BuildContext context, WidgetRef ref) {
    final titleCtrl  = TextEditingController();
    final detailCtrl = TextEditingController();
    final reasonCtrl = TextEditingController();
    String status    = 'APPROVED';
    final formKey    = GlobalKey<FormState>();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.ds.bgCard,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(builder: (ctx, setS) => Padding(
        padding: EdgeInsets.only(
          left: 20, right: 20, top: 20,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
        ),
        child: Form(
          key: formKey,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Log Decision',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            TextFormField(
              controller: titleCtrl,
              decoration: const InputDecoration(labelText: 'Decision Title *'),
              validator: (v) => v?.isEmpty == true ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: detailCtrl,
              decoration: const InputDecoration(labelText: 'Details'),
              maxLines: 2,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: reasonCtrl,
              decoration: const InputDecoration(labelText: 'Reason / Rationale'),
              maxLines: 2,
            ),
            const SizedBox(height: 12),
            DropdownButtonFormField<String>(
              value: status,
              decoration: const InputDecoration(labelText: 'Status'),
              items: ['APPROVED', 'PENDING', 'REJECTED'].map((s) =>
                  DropdownMenuItem(value: s, child: Text(_capitalize(s)))).toList(),
              onChanged: (v) => setS(() => status = v ?? status),
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryLight,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () async {
                  if (!formKey.currentState!.validate()) return;
                  try {
                    await ApiClient.instance.post(
                      '${AppConstants.baseCore}/decisions',
                      data: {
                        'title':   titleCtrl.text.trim(),
                        'details': detailCtrl.text.trim(),
                        'reason':  reasonCtrl.text.trim(),
                        'status':  status,
                      },
                    );
                    ref.invalidate(decisionsProvider);
                    if (ctx.mounted) {
                      Navigator.pop(ctx);
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        const SnackBar(content: Text('Decision logged!'),
                            backgroundColor: AppColors.success),
                      );
                    }
                  } catch (e) {
                    if (ctx.mounted) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
                      );
                    }
                  }
                },
                child: const Text('Log Decision', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
          ]),
        ),
      )),
    );
  }

  static String _capitalize(String s) =>
      s.isEmpty ? s : s[0] + s.substring(1).toLowerCase();
}

// ── Decision card ─────────────────────────────────────────────────────────────

class _DecisionCard extends StatelessWidget {
  const _DecisionCard(this.decision);
  final Map<String, dynamic> decision;

  @override
  Widget build(BuildContext context) {
    final ds      = context.ds;
    final title   = decision['title']  as String? ?? '—';
    final details = decision['details'] as String? ?? decision['description'] as String?;
    final reason  = decision['reason'] as String? ?? decision['rationale'] as String?;
    final status  = (decision['status'] as String? ?? 'PENDING').toUpperCase();
    final date    = decision['createdAt'] as String?
        ?? decision['CREATEDTIME'] as String?
        ?? decision['date'] as String?;
    final madeBy  = decision['madeBy'] as String?
        ?? decision['createdBy'] as String?
        ?? decision['author'] as String?;

    final (color, label) = switch (status) {
      'APPROVED' => (AppColors.success,  'Approved'),
      'REJECTED' => (AppColors.error,    'Rejected'),
      _          => (AppColors.ragAmber, 'Pending'),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withOpacity(0.3)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(
                Theme.of(context).brightness == Brightness.dark ? 0.2 : 0.04),
            blurRadius: 8, offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Container(
            width: 38, height: 38,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(10),
            ),
            child: Icon(Icons.gavel_rounded, color: color, size: 20),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Text(title, style: TextStyle(
                fontSize: 14, fontWeight: FontWeight.w700, color: ds.textPrimary)),
          ),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text(label,
                style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
          ),
        ]),
        if (details != null && details.isNotEmpty) ...[
          const SizedBox(height: 10),
          Text(details,
              style: TextStyle(fontSize: 13, color: ds.textSecondary, height: 1.4),
              maxLines: 3, overflow: TextOverflow.ellipsis),
        ],
        if (reason != null && reason.isNotEmpty) ...[
          const SizedBox(height: 8),
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: ds.bgPage,
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Icon(Icons.info_outline_rounded, size: 14, color: ds.textMuted),
              const SizedBox(width: 6),
              Expanded(child: Text(reason,
                  style: TextStyle(fontSize: 12, color: ds.textMuted),
                  maxLines: 2, overflow: TextOverflow.ellipsis)),
            ]),
          ),
        ],
        const SizedBox(height: 10),
        Row(children: [
          if (madeBy != null) ...[
            Icon(Icons.person_rounded, size: 12, color: ds.textMuted),
            const SizedBox(width: 4),
            Text(madeBy, style: TextStyle(fontSize: 11, color: ds.textMuted)),
            const SizedBox(width: 12),
          ],
          if (date != null) ...[
            Icon(Icons.calendar_today_rounded, size: 12, color: ds.textMuted),
            const SizedBox(width: 4),
            Text(_fmtDate(date), style: TextStyle(fontSize: 11, color: ds.textMuted)),
          ],
        ]),
      ]),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.04);
  }

  static String _fmtDate(String s) {
    try {
      return DateFormat('d MMM yyyy').format(DateTime.parse(s));
    } catch (_) { return s; }
  }
}
