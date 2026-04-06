/// Reports screen — generate, list, and view project reports.
/// API: ${AppConstants.baseCore}/reports
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
import '../../../dashboard/providers/dashboard_provider.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final reportsProvider = FutureProvider.autoDispose<List<Report>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/reports',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map ? (data['reports'] as List<dynamic>? ?? []) : []);
  return list.map((e) => Report.fromJson(e as Map<String, dynamic>)).toList();
});

// ── Screen ────────────────────────────────────────────────────────────────────

class ReportsScreen extends ConsumerStatefulWidget {
  const ReportsScreen({super.key});

  @override
  ConsumerState<ReportsScreen> createState() => _ReportsScreenState();
}

class _ReportsScreenState extends ConsumerState<ReportsScreen> {
  String _filter = 'ALL'; // ALL | WEEKLY | MONTHLY | CUSTOM

  @override
  Widget build(BuildContext context) {
    final ds      = context.ds;
    final reports = ref.watch(reportsProvider);

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Reports'),
        backgroundColor: ds.bgPage,
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            onPressed: () => _showGenerateSheet(context),
          ),
        ],
      ),
      body: Column(
        children: [
          // Filter chips
          _FilterRow(selected: _filter,
              onSelected: (f) => setState(() => _filter = f)),

          // List
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(reportsProvider),
              color: AppColors.primaryLight,
              child: reports.when(
                data: (list) {
                  final filtered = _filter == 'ALL'
                      ? list
                      : list
                          .where((r) => r.reportType == _filter)
                          .toList();
                  if (filtered.isEmpty) {
                    return Center(
                      child: Column(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.bar_chart_rounded,
                            size: 56, color: ds.textMuted),
                        const SizedBox(height: 12),
                        Text('No reports yet',
                            style: TextStyle(
                                color: ds.textMuted, fontSize: 15)),
                        const SizedBox(height: 8),
                        TextButton.icon(
                          onPressed: () => _showGenerateSheet(context),
                          icon: const Icon(Icons.add_rounded),
                          label: const Text('Generate Report'),
                        ),
                      ]),
                    );
                  }
                  return ListView.builder(
                    padding: const EdgeInsets.fromLTRB(16, 8, 16, 100),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) => _ReportCard(
                      filtered[i],
                      onTap: () => _showDetail(context, filtered[i]),
                    ),
                  );
                },
                loading: () => ListView(
                  children: List.generate(3, (_) => const ShimmerCard()),
                ),
                error: (e, _) => Center(
                  child: Column(mainAxisSize: MainAxisSize.min, children: [
                    Icon(Icons.error_outline_rounded,
                        size: 48, color: AppColors.error),
                    const SizedBox(height: 12),
                    Text('$e',
                        style: const TextStyle(color: AppColors.error),
                        textAlign: TextAlign.center),
                    const SizedBox(height: 12),
                    OutlinedButton(
                      onPressed: () => ref.invalidate(reportsProvider),
                      child: const Text('Retry'),
                    ),
                  ]),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showGenerateSheet(context),
        backgroundColor: AppColors.primary,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.summarize_rounded),
        label: const Text('Generate', style: TextStyle(fontWeight: FontWeight.w700)),
      ),
    );
  }

  void _showGenerateSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) =>
          _GenerateReportSheet(onGenerated: () => ref.invalidate(reportsProvider)),
    );
  }

  void _showDetail(BuildContext context, Report report) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _ReportDetailSheet(report),
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
            ('WEEKLY', 'Weekly'),
            ('MONTHLY', 'Monthly'),
            ('CUSTOM', 'Custom'),
          ])
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: GestureDetector(
                onTap: () => onSelected(v),
                child: AnimatedContainer(
                  duration: 200.ms,
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
                  decoration: BoxDecoration(
                    color: selected == v ? AppColors.primary : ds.bgElevated,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(
                        color: selected == v ? AppColors.primary : ds.border),
                  ),
                  child: Text(l,
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: selected == v ? Colors.white : ds.textSecondary)),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

// ── Report card ───────────────────────────────────────────────────────────────

class _ReportCard extends StatelessWidget {
  const _ReportCard(this.report, {required this.onTap});
  final Report report;
  final VoidCallback onTap;

  static const _typeColors = {
    'WEEKLY':  AppColors.info,
    'MONTHLY': AppColors.ragAmber,
    'CUSTOM':  AppColors.accent,
  };

  @override
  Widget build(BuildContext context) {
    final ds    = context.ds;
    final color = _typeColors[report.reportType] ?? AppColors.info;

    DateTime? createdAt;
    try { createdAt = DateTime.parse(report.createdAt); } catch (_) {}

    return GestureDetector(
      onTap: onTap,
      child: Container(
        margin: const EdgeInsets.only(bottom: 10),
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: ds.border),
        ),
        child: Row(children: [
          Container(
            width: 44, height: 44,
            decoration: BoxDecoration(
              color: color.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Icon(Icons.summarize_rounded, color: color, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(5),
                  ),
                  child: Text(
                    report.reportType[0] + report.reportType.substring(1).toLowerCase(),
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color),
                  ),
                ),
                const SizedBox(width: 8),
                if (report.projectName != null)
                  Expanded(
                    child: Text(report.projectName!,
                        style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
                            color: ds.textPrimary),
                        overflow: TextOverflow.ellipsis),
                  ),
              ]),
              const SizedBox(height: 4),
              if (report.periodStart != null && report.periodEnd != null)
                Text(
                  '${_fmtDate(report.periodStart!)} – ${_fmtDate(report.periodEnd!)}',
                  style: TextStyle(fontSize: 12, color: ds.textSecondary),
                ),
              if (createdAt != null)
                Text(
                  'Generated ${DateFormat('d MMM yyyy').format(createdAt)}',
                  style: TextStyle(fontSize: 11, color: ds.textMuted),
                ),
            ]),
          ),
          Row(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.share_rounded, size: 18, color: ds.textMuted),
            const SizedBox(width: 8),
            Icon(Icons.chevron_right_rounded, size: 18, color: ds.textMuted),
          ]),
        ]),
      ),
    ).animate().fadeIn(duration: 300.ms).slideX(begin: 0.04);
  }

  String _fmtDate(String s) {
    try {
      return DateFormat('d MMM').format(DateTime.parse(s));
    } catch (_) {
      return s.length >= 10 ? s.substring(0, 10) : s;
    }
  }
}

// ── Report detail sheet ───────────────────────────────────────────────────────

class _ReportDetailSheet extends ConsumerStatefulWidget {
  const _ReportDetailSheet(this.report);
  final Report report;

  @override
  ConsumerState<_ReportDetailSheet> createState() => _ReportDetailSheetState();
}

class _ReportDetailSheetState extends ConsumerState<_ReportDetailSheet> {
  bool _deleting = false;

  static String _label(String key) {
    // camelCase → Title Case with spaces
    return key
        .replaceAllMapped(RegExp(r'([A-Z])'), (m) => ' ${m.group(1)}')
        .replaceAll('_', ' ')
        .trim()
        .split(' ')
        .map((w) => w.isEmpty ? '' : w[0].toUpperCase() + w.substring(1))
        .join(' ');
  }

  @override
  Widget build(BuildContext context) {
    final ds      = context.ds;
    final report  = widget.report;
    final summary = report.summary;

    final typeColor = const {
      'WEEKLY':  AppColors.info,
      'MONTHLY': AppColors.ragAmber,
      'CUSTOM':  AppColors.accent,
    }[report.reportType] ?? AppColors.info;

    DateTime? createdAt;
    try { createdAt = DateTime.parse(report.createdAt); } catch (_) {}

    return DraggableScrollableSheet(
      initialChildSize: 0.75,
      minChildSize: 0.4,
      maxChildSize: 0.95,
      expand: false,
      builder: (_, sc) => Container(
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(24)),
        ),
        child: Column(children: [
          // Handle + header
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 14, 20, 0),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Center(
                child: Container(
                  width: 36, height: 4,
                  decoration: BoxDecoration(
                      color: ds.border,
                      borderRadius: BorderRadius.circular(2)),
                ),
              ),
              const SizedBox(height: 16),

              // Title row
              Row(children: [
                Container(
                  width: 42, height: 42,
                  decoration: BoxDecoration(
                    color: typeColor.withOpacity(0.13),
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(Icons.summarize_rounded,
                      color: typeColor, size: 20),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(children: [
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 2),
                            decoration: BoxDecoration(
                              color: typeColor.withOpacity(0.12),
                              borderRadius: BorderRadius.circular(5),
                            ),
                            child: Text(
                              report.reportType[0] +
                                  report.reportType.substring(1).toLowerCase(),
                              style: TextStyle(
                                  fontSize: 10,
                                  fontWeight: FontWeight.w700,
                                  color: typeColor),
                            ),
                          ),
                        ]),
                        const SizedBox(height: 3),
                        if (report.projectName != null)
                          Text(report.projectName!,
                              style: TextStyle(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w700,
                                  color: ds.textPrimary)),
                        if (report.periodStart != null &&
                            report.periodEnd != null)
                          Text(
                            '${_fmtDate(report.periodStart!)} – ${_fmtDate(report.periodEnd!)}',
                            style: TextStyle(
                                fontSize: 12, color: ds.textSecondary),
                          ),
                        if (createdAt != null)
                          Text(
                            'Generated ${DateFormat('d MMM yyyy').format(createdAt)}',
                            style: TextStyle(
                                fontSize: 11, color: ds.textMuted),
                          ),
                      ]),
                ),
                // Action buttons
                Row(mainAxisSize: MainAxisSize.min, children: [
                  if (report.shareUrl != null)
                    IconButton(
                      icon: const Icon(Icons.share_rounded),
                      color: ds.textMuted,
                      onPressed: () {},
                    ),
                  _deleting
                      ? const SizedBox(
                          width: 24, height: 24,
                          child: CircularProgressIndicator(strokeWidth: 2))
                      : IconButton(
                          icon: const Icon(Icons.delete_outline_rounded),
                          color: AppColors.error,
                          onPressed: () => _confirmDelete(context),
                        ),
                ]),
              ]),
              const SizedBox(height: 12),
              Divider(color: ds.border),
            ]),
          ),

          // Scrollable body
          Expanded(
            child: ListView(
              controller: sc,
              padding: const EdgeInsets.fromLTRB(20, 8, 20, 40),
              children: summary != null && summary.isNotEmpty
                  ? _buildSummaryWidgets(context, summary)
                  : [
                      const SizedBox(height: 48),
                      Center(
                        child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              Icon(Icons.bar_chart_rounded,
                                  size: 48, color: ds.textMuted),
                              const SizedBox(height: 8),
                              Text('No summary data available.',
                                  style: TextStyle(color: ds.textMuted)),
                            ]),
                      ),
                    ],
            ),
          ),
        ]),
      ),
    );
  }

  List<Widget> _buildSummaryWidgets(
      BuildContext context, Map<String, dynamic> summary) {
    final ds = context.ds;
    final widgets = <Widget>[];

    // Top-level scalar metrics first
    final scalars = summary.entries
        .where((e) => e.value is num || e.value is String || e.value is bool)
        .toList();

    if (scalars.isNotEmpty) {
      widgets.add(_sectionHeader(context, 'Overview', Icons.analytics_rounded,
          AppColors.primary));
      final rows = scalars.map((e) =>
          _metricRow(context, _label(e.key), '${e.value}')).toList();
      widgets.add(_card(context, rows));
      widgets.add(const SizedBox(height: 16));
    }

    // Nested maps as subsections
    for (final entry in summary.entries) {
      final key = entry.key;
      final val = entry.value;

      if (val is Map<String, dynamic>) {
        final (icon, color) = _sectionMeta(key);
        widgets.add(_sectionHeader(context, _label(key), icon, color));
        final rows = val.entries
            .map((e) => _metricRow(context, _label(e.key), '${e.value}',
                accent: color))
            .toList();
        widgets.add(_card(context, rows));
        widgets.add(const SizedBox(height: 16));
      } else if (val is List) {
        if (val.isEmpty) continue;
        final (icon, color) = _sectionMeta(key);
        widgets.add(_sectionHeader(context, _label(key), icon, color));
        widgets.add(_listCard(context, val, color));
        widgets.add(const SizedBox(height: 16));
      }
    }

    return widgets;
  }

  Widget _sectionHeader(
      BuildContext context, String title, IconData icon, Color color) {
    final ds = context.ds;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: Row(children: [
        Container(
          padding: const EdgeInsets.all(6),
          decoration: BoxDecoration(
            color: color.withOpacity(0.12),
            borderRadius: BorderRadius.circular(8),
          ),
          child: Icon(icon, color: color, size: 14),
        ),
        const SizedBox(width: 8),
        Text(
          title.toUpperCase(),
          style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w800,
              color: ds.textMuted,
              letterSpacing: 0.8),
        ),
      ]),
    );
  }

  Widget _card(BuildContext context, List<Widget> children) {
    final ds = context.ds;
    return Container(
      decoration: BoxDecoration(
        color: ds.bgElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Column(children: children),
    );
  }

  Widget _metricRow(BuildContext context, String label, String value,
      {Color? accent}) {
    final ds = context.ds;
    return Padding(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      child: Row(children: [
        Expanded(
          child: Text(label,
              style:
                  TextStyle(fontSize: 13, color: ds.textSecondary)),
        ),
        Text(
          value,
          style: TextStyle(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: accent ?? ds.textPrimary),
        ),
      ]),
    );
  }

  Widget _listCard(BuildContext context, List<dynamic> items, Color color) {
    final ds = context.ds;
    return Container(
      decoration: BoxDecoration(
        color: ds.bgElevated,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Column(
        children: items.asMap().entries.map((entry) {
          final i = entry.key;
          final item = entry.value;
          final isLast = i == items.length - 1;

          String text;
          if (item is Map<String, dynamic>) {
            // Try common text fields
            text = (item['title'] ?? item['name'] ?? item['description'] ??
                    item['text'] ?? item['content'] ?? item.toString())
                .toString();
          } else {
            text = item.toString();
          }

          return Column(children: [
            Padding(
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Container(
                      margin: const EdgeInsets.only(top: 4),
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                          color: color, shape: BoxShape.circle),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(text,
                          style: TextStyle(
                              fontSize: 13, color: ds.textPrimary)),
                    ),
                    if (item is Map<String, dynamic>) ...[
                      if (item['status'] != null)
                        StatusChip('${item['status']}'),
                      if (item['priority'] != null) ...[
                        const SizedBox(width: 6),
                        PriorityBadge('${item['priority']}'),
                      ],
                    ],
                  ]),
            ),
            if (!isLast) Divider(height: 1, color: ds.border),
          ]);
        }).toList(),
      ),
    );
  }

  (IconData, Color) _sectionMeta(String key) {
    final k = key.toLowerCase();
    if (k.contains('standup') || k.contains('meeting'))
      return (Icons.groups_rounded, AppColors.info);
    if (k.contains('action') || k.contains('task'))
      return (Icons.check_circle_outline_rounded, AppColors.success);
    if (k.contains('block') || k.contains('risk') || k.contains('issue'))
      return (Icons.warning_amber_rounded, AppColors.error);
    if (k.contains('milestone') || k.contains('goal'))
      return (Icons.flag_rounded, AppColors.ragAmber);
    if (k.contains('contributor') || k.contains('member') || k.contains('people'))
      return (Icons.people_alt_rounded, AppColors.accent);
    if (k.contains('velocity') || k.contains('metric') || k.contains('stat'))
      return (Icons.speed_rounded, AppColors.primary);
    if (k.contains('comment') || k.contains('note'))
      return (Icons.comment_rounded, AppColors.textSecondary);
    return (Icons.info_outline_rounded, AppColors.primary);
  }

  String _fmtDate(String s) {
    try {
      return DateFormat('d MMM').format(DateTime.parse(s));
    } catch (_) {
      return s.length >= 10 ? s.substring(0, 10) : s;
    }
  }

  Future<void> _confirmDelete(BuildContext context) async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Delete Report'),
        content: const Text('This report will be permanently deleted.'),
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
    if (confirmed != true || !mounted) return;
    setState(() => _deleting = true);
    try {
      await ApiClient.instance.delete(
        '${AppConstants.baseCore}/reports/${widget.report.id}',
      );
      if (mounted) {
        ref.invalidate(reportsProvider);
        Navigator.pop(context);
      }
    } catch (e) {
      if (mounted) setState(() => _deleting = false);
    }
  }
}

// ── Generate report sheet ─────────────────────────────────────────────────────

class _GenerateReportSheet extends ConsumerStatefulWidget {
  const _GenerateReportSheet({required this.onGenerated});
  final VoidCallback onGenerated;

  @override
  ConsumerState<_GenerateReportSheet> createState() =>
      _GenerateReportSheetState();
}

class _GenerateReportSheetState extends ConsumerState<_GenerateReportSheet> {
  String?   _projectId;
  String    _reportType = 'WEEKLY';
  DateTime? _periodStart;
  DateTime? _periodEnd;
  bool      _loading  = false;
  String?   _error;

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
                decoration: BoxDecoration(
                    color: ds.border,
                    borderRadius: BorderRadius.circular(2)),
              ),
            ),
            const SizedBox(height: 20),
            Text('Generate Report',
                style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800,
                    color: ds.textPrimary)),
            const SizedBox(height: 16),

            // Project
            projects.when(
              data: (list) => DropdownButtonFormField<String>(
                value: _projectId,
                items: list.map((p) => DropdownMenuItem(
                    value: p.id, child: Text(p.name))).toList(),
                onChanged: (v) => setState(() => _projectId = v),
                decoration: const InputDecoration(labelText: 'Project *'),
                dropdownColor: ds.bgElevated,
              ),
              loading: () => const LinearProgressIndicator(),
              error: (_, __) => const SizedBox.shrink(),
            ),
            const SizedBox(height: 12),

            // Report type
            DropdownButtonFormField<String>(
              value: _reportType,
              decoration: const InputDecoration(labelText: 'Report Type'),
              items: ['WEEKLY', 'MONTHLY', 'CUSTOM'].map((t) =>
                  DropdownMenuItem(
                      value: t,
                      child: Text(t[0] + t.substring(1).toLowerCase()))).toList(),
              onChanged: (v) => setState(() => _reportType = v!),
              dropdownColor: ds.bgElevated,
            ),

            // Custom date range
            if (_reportType == 'CUSTOM') ...[
              const SizedBox(height: 12),
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
                      child: Text(
                        _periodStart != null
                            ? DateFormat('d MMM').format(_periodStart!)
                            : 'Start date',
                        style: TextStyle(
                            color: _periodStart != null
                                ? ds.textPrimary
                                : ds.textMuted),
                      ),
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
                      child: Text(
                        _periodEnd != null
                            ? DateFormat('d MMM').format(_periodEnd!)
                            : 'End date',
                        style: TextStyle(
                            color: _periodEnd != null
                                ? ds.textPrimary
                                : ds.textMuted),
                      ),
                    ),
                  ),
                ),
              ]),
            ],

            if (_error != null) ...[
              const SizedBox(height: 8),
              Text(_error!,
                  style: const TextStyle(color: AppColors.error, fontSize: 12)),
            ],
            const SizedBox(height: 20),

            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                onPressed: _loading ? null : _submit,
                child: _loading
                    ? const SizedBox(width: 20, height: 20,
                        child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2))
                    : const Text('Generate Report'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _pickDate({required bool isStart}) async {
    final picked = await showDatePicker(
      context: context,
      initialDate: DateTime.now(),
      firstDate: DateTime.now().subtract(const Duration(days: 365)),
      lastDate: DateTime.now(),
    );
    if (picked != null) {
      setState(() {
        if (isStart) _periodStart = picked;
        else _periodEnd = picked;
      });
    }
  }

  Future<void> _submit() async {
    if (_projectId == null) {
      setState(() => _error = 'Please select a project');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseCore}/reports',
        data: {
          'projectId':  _projectId,
          'reportType': _reportType,
          if (_periodStart != null)
            'periodStart': DateFormat('yyyy-MM-dd').format(_periodStart!),
          if (_periodEnd != null)
            'periodEnd': DateFormat('yyyy-MM-dd').format(_periodEnd!),
        },
      );
      widget.onGenerated();
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() { _loading = false; _error = e.toString(); });
    }
  }
}
