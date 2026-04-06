import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../dashboard/providers/dashboard_provider.dart';

class StandupScreen extends ConsumerStatefulWidget {
  const StandupScreen({super.key});

  @override
  ConsumerState<StandupScreen> createState() => _StandupScreenState();
}

class _StandupScreenState extends ConsumerState<StandupScreen> {
  final _yesterdayCtrl = TextEditingController();
  final _todayCtrl     = TextEditingController();
  final _blockersCtrl  = TextEditingController();
  String? _selectedProjectId;
  bool _submitting = false;
  bool _submitted  = false;

  @override
  void dispose() {
    _yesterdayCtrl.dispose();
    _todayCtrl.dispose();
    _blockersCtrl.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_selectedProjectId == null) {
      _snack('Please select a project');
      return;
    }
    if (_yesterdayCtrl.text.trim().isEmpty || _todayCtrl.text.trim().isEmpty) {
      _snack('Yesterday and Today fields are required');
      return;
    }

    setState(() => _submitting = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseCore}/standups',
        data: {
          'projectId': _selectedProjectId,
          'yesterday': _yesterdayCtrl.text.trim(),
          'today': _todayCtrl.text.trim(),
          'blockers': _blockersCtrl.text.trim().isEmpty
              ? null
              : _blockersCtrl.text.trim(),
        },
      );
      setState(() => _submitted = true);
      ref.invalidate(dashboardSummaryProvider);
    } catch (e) {
      _snack('Failed to submit standup: $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _snack(String msg) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(msg)));

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: context.ds.bgPage,
      appBar: AppBar(
        title: const Text('Daily Stand-up'),
        backgroundColor: context.ds.bgPage,
      ),
      body: _submitted ? _SuccessView() : _FormView(
        yesterdayCtrl:    _yesterdayCtrl,
        todayCtrl:        _todayCtrl,
        blockersCtrl:     _blockersCtrl,
        selectedProjectId: _selectedProjectId,
        onProjectChanged: (v) => setState(() => _selectedProjectId = v),
        submitting:       _submitting,
        onSubmit:         _submit,
      ),
    );
  }
}

class _FormView extends ConsumerWidget {
  const _FormView({
    required this.yesterdayCtrl,
    required this.todayCtrl,
    required this.blockersCtrl,
    required this.selectedProjectId,
    required this.onProjectChanged,
    required this.submitting,
    required this.onSubmit,
  });

  final TextEditingController yesterdayCtrl;
  final TextEditingController todayCtrl;
  final TextEditingController blockersCtrl;
  final String? selectedProjectId;
  final ValueChanged<String?> onProjectChanged;
  final bool submitting;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectsProvider);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Live indicator ──────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.successBg,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppColors.success.withOpacity(0.4)),
            ),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 7, height: 7,
                  decoration: const BoxDecoration(
                    color: AppColors.success, shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 6),
                const Text('Stand-up open',
                    style: TextStyle(
                        fontSize: 12,
                        fontWeight: FontWeight.w600,
                        color: AppColors.success)),
              ],
            ),
          ),

          const SizedBox(height: 24),

          // ── Project picker ──────────────────────────────────────────────
          _Label('Project'),
          const SizedBox(height: 6),
          projects.when(
            data: (list) => DropdownButtonFormField<String>(
              value: selectedProjectId,
              items: list.map((p) => DropdownMenuItem(
                    value: p.id,
                    child: Text(p.name,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 14)),
                  )).toList(),
              onChanged: onProjectChanged,
              decoration: const InputDecoration(
                hintText: 'Select project',
              ),
              dropdownColor: context.ds.bgElevated,
            ),
            loading: () => const LinearProgressIndicator(),
            error: (_, __) => const Text('Failed to load projects',
                style: TextStyle(color: AppColors.error)),
          ),

          const SizedBox(height: 20),

          // ── Yesterday ───────────────────────────────────────────────────
          _Label('What did you do yesterday?'),
          const SizedBox(height: 6),
          TextField(
            controller: yesterdayCtrl,
            decoration: const InputDecoration(
              hintText: 'e.g. Completed API integration for delivery tracking',
            ),
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
          ),

          const SizedBox(height: 20),

          // ── Today ───────────────────────────────────────────────────────
          _Label("What will you do today?"),
          const SizedBox(height: 6),
          TextField(
            controller: todayCtrl,
            decoration: const InputDecoration(
              hintText: 'e.g. Work on route optimisation module, team sync at 3 pm',
            ),
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
          ),

          const SizedBox(height: 20),

          // ── Blockers ────────────────────────────────────────────────────
          _Label('Any blockers? (optional)'),
          const SizedBox(height: 6),
          TextField(
            controller: blockersCtrl,
            decoration: const InputDecoration(
              hintText: 'e.g. Waiting for access to staging environment',
            ),
            maxLines: 3,
            textCapitalization: TextCapitalization.sentences,
          ),

          const SizedBox(height: 32),

          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton(
              onPressed: submitting ? null : onSubmit,
              child: submitting
                  ? const SizedBox(
                      width: 22, height: 22,
                      child: CircularProgressIndicator(
                          color: Colors.white, strokeWidth: 2.5))
                  : const Row(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Icon(Icons.send_rounded, size: 18),
                        SizedBox(width: 8),
                        Text('Submit Stand-up',
                            style: TextStyle(
                                fontWeight: FontWeight.w700, fontSize: 15)),
                      ],
                    ),
            ),
          ),
        ],
      ),
    );
  }
}

class _SuccessView extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Center(
        child: Padding(
          padding: const EdgeInsets.all(40),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              Container(
                width: 80, height: 80,
                decoration: const BoxDecoration(
                  color: AppColors.successBg, shape: BoxShape.circle,
                ),
                child: const Icon(Icons.check_rounded,
                    color: AppColors.success, size: 44),
              ),
              const SizedBox(height: 24),
              const Text('Stand-up Submitted!',
                  style: TextStyle(
                      fontSize: 22,
                      fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary)),
              const SizedBox(height: 8),
              const Text(
                'Your update has been shared with your team.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textSecondary, height: 1.5),
              ),
              const SizedBox(height: 32),
              ElevatedButton(
                onPressed: () => Navigator.pop(context),
                child: const Text('Back to Dashboard'),
              ),
            ],
          ),
        ),
      );
}

class _Label extends StatelessWidget {
  const _Label(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(
        text,
        style: const TextStyle(
          fontSize: 13,
          fontWeight: FontWeight.w700,
          color: AppColors.textSecondary,
          letterSpacing: 0.2,
        ),
      );
}
