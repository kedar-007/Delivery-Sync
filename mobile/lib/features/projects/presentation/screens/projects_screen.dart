import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/models/models.dart';
import '../../../../shared/widgets/ds_metric_card.dart';
import '../../../dashboard/providers/dashboard_provider.dart';

class ProjectsScreen extends ConsumerWidget {
  const ProjectsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds       = context.ds;
    final projects = ref.watch(projectsProvider);

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Projects'),
        backgroundColor: ds.bgPage,
        actions: [
          IconButton(
            icon: const Icon(Icons.add_rounded),
            tooltip: 'New project',
            onPressed: () => _showCreateProject(context, ref),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(projectsProvider),
        color: AppColors.primaryLight,
        child: projects.when(
          data: (list) => list.isEmpty
              ? Center(
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.folder_off_rounded,
                          size: 56, color: ds.textMuted),
                      const SizedBox(height: 12),
                      Text('No projects yet',
                          style: TextStyle(
                              color: ds.textMuted, fontSize: 15)),
                    ],
                  ))
              : _ProjectList(list),
          loading: () => ListView(
            children: List.generate(5, (_) => const ShimmerCard()),
          ),
          error: (e, _) => Center(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(Icons.error_outline_rounded,
                      size: 48, color: AppColors.error),
                  const SizedBox(height: 12),
                  Text('Failed to load projects',
                      style: TextStyle(
                          color: ds.textPrimary,
                          fontWeight: FontWeight.w600)),
                  const SizedBox(height: 4),
                  Text(e.toString(),
                      style: TextStyle(
                          color: AppColors.error, fontSize: 12),
                      textAlign: TextAlign.center),
                  const SizedBox(height: 16),
                  OutlinedButton.icon(
                    onPressed: () => ref.invalidate(projectsProvider),
                    icon: const Icon(Icons.refresh_rounded),
                    label: const Text('Retry'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  void _showCreateProject(BuildContext context, WidgetRef ref) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      builder: (_) => _CreateProjectSheet(ref: ref),
    );
  }
}

// ── Project list ──────────────────────────────────────────────────────────────

class _ProjectList extends StatelessWidget {
  const _ProjectList(this.projects);
  final List<Project> projects;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final red   = projects.where((p) => p.ragStatus == 'RED').toList();
    final amber = projects.where((p) => p.ragStatus == 'AMBER').toList();
    final green = projects.where((p) => p.ragStatus == 'GREEN').toList();

    return ListView(
      padding: const EdgeInsets.only(bottom: 100),
      children: [
        // ── Summary bar ──────────────────────────────────────────────────
        Container(
          margin: const EdgeInsets.fromLTRB(16, 12, 16, 4),
          padding: const EdgeInsets.all(16),
          decoration: BoxDecoration(
            color: ds.bgCard,
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: ds.border),
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _RagCount(red.length,   'AT RISK',  AppColors.ragRed),
              _Divider(ds),
              _RagCount(amber.length, 'CAUTION',  AppColors.ragAmber),
              _Divider(ds),
              _RagCount(green.length, 'ON TRACK', AppColors.ragGreen),
            ],
          ),
        ),

        if (red.isNotEmpty) ...[
          _SectionLabel('At Risk', AppColors.ragRed, Icons.warning_rounded, ds),
          ...red.map((p) => _ProjectCard(p)),
        ],
        if (amber.isNotEmpty) ...[
          _SectionLabel('Needs Attention', AppColors.ragAmber, Icons.info_outline_rounded, ds),
          ...amber.map((p) => _ProjectCard(p)),
        ],
        if (green.isNotEmpty) ...[
          _SectionLabel('On Track', AppColors.ragGreen, Icons.check_circle_outline_rounded, ds),
          ...green.map((p) => _ProjectCard(p)),
        ],
      ],
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider(this.ds);
  final DsColors ds;

  @override
  Widget build(BuildContext context) =>
      SizedBox(width: 1, height: 36,
          child: ColoredBox(color: ds.border));
}

class _RagCount extends StatelessWidget {
  const _RagCount(this.count, this.label, this.color);
  final int count;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Column(
      children: [
        Text('$count',
            style: TextStyle(
                fontSize: 24, fontWeight: FontWeight.w800, color: color)),
        const SizedBox(height: 2),
        Text(label,
            style: TextStyle(
                fontSize: 10, color: ds.textMuted,
                fontWeight: FontWeight.w700, letterSpacing: 0.5)),
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label, this.color, this.icon, this.ds);
  final String label;
  final Color color;
  final IconData icon;
  final DsColors ds;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
        child: Row(
          children: [
            Icon(icon, size: 16, color: color),
            const SizedBox(width: 6),
            Text(label,
                style: TextStyle(
                    fontSize: 13,
                    fontWeight: FontWeight.w700,
                    color: color,
                    letterSpacing: 0.3)),
          ],
        ),
      );
}

// ── Project card ──────────────────────────────────────────────────────────────

class _ProjectCard extends StatelessWidget {
  const _ProjectCard(this.project);
  final Project project;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 5),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ds.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(
                Theme.of(context).brightness == Brightness.dark ? 0.15 : 0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Material(
        color: Colors.transparent,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          borderRadius: BorderRadius.circular(16),
          onTap: () {},
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Container(
                      width: 4,
                      height: 36,
                      decoration: BoxDecoration(
                        color: _ragColor(project.ragStatus),
                        borderRadius: BorderRadius.circular(4),
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Text(
                        project.name,
                        style: TextStyle(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: ds.textPrimary,
                        ),
                      ),
                    ),
                    const SizedBox(width: 8),
                    RagBadge(project.ragStatus),
                  ],
                ),
                if (project.description?.isNotEmpty == true) ...[
                  const SizedBox(height: 8),
                  Text(
                    project.description!,
                    maxLines: 2,
                    overflow: TextOverflow.ellipsis,
                    style: TextStyle(
                        fontSize: 13, color: ds.textSecondary),
                  ),
                ],
                const SizedBox(height: 12),
                Row(
                  children: [
                    Icon(Icons.people_outline_rounded,
                        size: 14, color: ds.textMuted),
                    const SizedBox(width: 4),
                    Text('${project.memberCount}',
                        style: TextStyle(
                            fontSize: 12, color: ds.textMuted)),
                    const SizedBox(width: 12),
                    if (project.endDate != null) ...[
                      Icon(Icons.calendar_today_rounded,
                          size: 14, color: ds.textMuted),
                      const SizedBox(width: 4),
                      Text(
                        _formatDate(project.endDate!),
                        style: TextStyle(
                            fontSize: 12, color: ds.textMuted),
                      ),
                    ],
                    const Spacer(),
                    StatusChip(project.status),
                  ],
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }

  Color _ragColor(String rag) => switch (rag) {
    'RED'   => AppColors.ragRed,
    'AMBER' => AppColors.ragAmber,
    _       => AppColors.ragGreen,
  };

  String _formatDate(String iso) {
    try {
      final d = DateTime.parse(iso);
      return '${d.day}/${d.month}/${d.year}';
    } catch (_) {
      return iso.length >= 10 ? iso.substring(0, 10) : iso;
    }
  }
}

// ── Create project sheet ──────────────────────────────────────────────────────

class _CreateProjectSheet extends ConsumerStatefulWidget {
  const _CreateProjectSheet({required this.ref});
  final WidgetRef ref;

  @override
  ConsumerState<_CreateProjectSheet> createState() => _CreateProjectSheetState();
}

class _CreateProjectSheetState extends ConsumerState<_CreateProjectSheet> {
  final _nameCtrl  = TextEditingController();
  final _descCtrl  = TextEditingController();
  bool _loading    = false;
  String? _error;

  @override
  void dispose() {
    _nameCtrl.dispose();
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Text('New Project',
                style: TextStyle(
                    fontSize: 18,
                    fontWeight: FontWeight.w800,
                    color: ds.textPrimary)),
            const Spacer(),
            IconButton(
              icon: Icon(Icons.close_rounded, color: ds.textMuted),
              onPressed: () => Navigator.pop(context),
            ),
          ]),
          const SizedBox(height: 16),
          TextField(
            controller: _nameCtrl,
            decoration: const InputDecoration(
              labelText: 'Project name *',
              prefixIcon: Icon(Icons.folder_rounded),
            ),
            textCapitalization: TextCapitalization.words,
          ),
          const SizedBox(height: 12),
          TextField(
            controller: _descCtrl,
            decoration: const InputDecoration(
              labelText: 'Description (optional)',
              prefixIcon: Icon(Icons.notes_rounded),
            ),
            maxLines: 3,
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
                          color: Colors.white, strokeWidth: 2),
                    )
                  : const Text('Create Project'),
            ),
          ),
        ],
      ),
    );
  }

  Future<void> _submit() async {
    final name = _nameCtrl.text.trim();
    if (name.isEmpty) {
      setState(() => _error = 'Project name is required');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ApiClient.instance.post<Map<String, dynamic>>(
        '${AppConstants.baseCore}/projects',
        data: {
          'name': name,
          'description': _descCtrl.text.trim(),
          'rag_status': 'GREEN',
        },
        fromJson: (r) => r as Map<String, dynamic>,
      );
      widget.ref.invalidate(projectsProvider);
      if (mounted) Navigator.pop(context);
    } catch (e) {
      setState(() {
        _loading = false;
        _error   = e.toString();
      });
    }
  }
}
