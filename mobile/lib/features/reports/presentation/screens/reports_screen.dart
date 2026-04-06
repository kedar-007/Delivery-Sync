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

class _ReportDetailSheet extends StatelessWidget {
  const _ReportDetailSheet(this.report);
  final Report report;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final summary = report.summary;

    return Container(
      padding: const EdgeInsets.fromLTRB(24, 20, 24, 40),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Center(
            child: Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                  color: ds.border, borderRadius: BorderRadius.circular(2)),
            ),
          ),
          const SizedBox(height: 20),
          Text('Report Summary',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800,
                  color: ds.textPrimary)),
          if (report.projectName != null) ...[
            const SizedBox(height: 4),
            Text(report.projectName!,
                style: TextStyle(fontSize: 13, color: ds.textSecondary)),
          ],
          const SizedBox(height: 16),
          if (summary != null && summary.isNotEmpty)
            ...summary.entries.map((e) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        e.key
                            .replaceAll(RegExp(r'([A-Z])'), r' $1')
                            .trim(),
                        style: TextStyle(color: ds.textSecondary,
                            fontSize: 13),
                      ),
                      Text(
                        '${e.value}',
                        style: TextStyle(
                            color: ds.textPrimary,
                            fontWeight: FontWeight.w700,
                            fontSize: 13),
                      ),
                    ],
                  ),
                ))
          else
            Text('No summary data available.',
                style: TextStyle(color: ds.textMuted)),
        ],
      ),
    );
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
