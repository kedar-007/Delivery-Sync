/// EOD (End-of-Day) screen — daily report with accomplishments,
/// mood, and progress.
/// API: POST ${AppConstants.baseCore}/eod
library;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../dashboard/providers/dashboard_provider.dart';

// ── Screen ────────────────────────────────────────────────────────────────────

class EodScreen extends ConsumerStatefulWidget {
  const EodScreen({super.key});

  @override
  ConsumerState<EodScreen> createState() => _EodScreenState();
}

class _EodScreenState extends ConsumerState<EodScreen> {
  final _accomplishmentsCtrl = TextEditingController();
  final _tomorrowCtrl        = TextEditingController();
  final _blockersCtrl        = TextEditingController();

  String? _selectedProjectId;
  double  _progress  = 50;
  String  _mood      = 'GREEN'; // GREEN | YELLOW | RED
  bool    _submitting = false;
  bool    _submitted  = false;

  @override
  void dispose() {
    _accomplishmentsCtrl.dispose();
    _tomorrowCtrl.dispose();
    _blockersCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('End of Day'),
        backgroundColor: ds.bgPage,
      ),
      body: _submitted
          ? _SuccessView(mood: _mood)
          : _FormBody(
              accomplishmentsCtrl:  _accomplishmentsCtrl,
              tomorrowCtrl:         _tomorrowCtrl,
              blockersCtrl:         _blockersCtrl,
              selectedProjectId:    _selectedProjectId,
              onProjectChanged:     (v) => setState(() => _selectedProjectId = v),
              progress:             _progress,
              onProgressChanged:    (v) => setState(() => _progress = v),
              mood:                 _mood,
              onMoodChanged:        (m) => setState(() => _mood = m),
              submitting:           _submitting,
              onSubmit:             _submit,
            ),
    );
  }

  Future<void> _submit() async {
    if (_selectedProjectId == null) {
      _snack('Please select a project');
      return;
    }
    if (_accomplishmentsCtrl.text.trim().isEmpty) {
      _snack('Accomplishments are required');
      return;
    }
    setState(() => _submitting = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseCore}/eod',
        data: {
          'projectId':          _selectedProjectId,
          'accomplishments':    _accomplishmentsCtrl.text.trim(),
          'plannedTomorrow':    _tomorrowCtrl.text.trim().isEmpty
              ? null
              : _tomorrowCtrl.text.trim(),
          'blockers':           _blockersCtrl.text.trim().isEmpty
              ? null
              : _blockersCtrl.text.trim(),
          'progressPercentage': _progress.round(),
          'mood':               _mood,
        },
      );
      setState(() => _submitted = true);
      ref.invalidate(dashboardSummaryProvider);
    } catch (e) {
      _snack('Failed to submit: $e');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  void _snack(String msg) => ScaffoldMessenger.of(context)
      .showSnackBar(SnackBar(content: Text(msg)));
}

// ── Form body ─────────────────────────────────────────────────────────────────

class _FormBody extends ConsumerWidget {
  const _FormBody({
    required this.accomplishmentsCtrl,
    required this.tomorrowCtrl,
    required this.blockersCtrl,
    required this.selectedProjectId,
    required this.onProjectChanged,
    required this.progress,
    required this.onProgressChanged,
    required this.mood,
    required this.onMoodChanged,
    required this.submitting,
    required this.onSubmit,
  });

  final TextEditingController accomplishmentsCtrl;
  final TextEditingController tomorrowCtrl;
  final TextEditingController blockersCtrl;
  final String? selectedProjectId;
  final ValueChanged<String?> onProjectChanged;
  final double progress;
  final ValueChanged<double> onProgressChanged;
  final String mood;
  final ValueChanged<String> onMoodChanged;
  final bool submitting;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final projects = ref.watch(projectsProvider);
    final ds = context.ds;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // ── Header card ────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF4F46E5), Color(0xFF6366F1)],
                begin: Alignment.topLeft,
                end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(16),
            ),
            child: Row(children: [
              Container(
                width: 44, height: 44,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.2),
                  borderRadius: BorderRadius.circular(12),
                ),
                child: const Icon(Icons.wb_sunny_rounded,
                    color: Colors.white, size: 24),
              ),
              const SizedBox(width: 12),
              const Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('End of Day Report',
                          style: TextStyle(
                              color: Colors.white,
                              fontWeight: FontWeight.w800,
                              fontSize: 15)),
                      SizedBox(height: 2),
                      Text('Share what you accomplished today',
                          style: TextStyle(
                              color: Colors.white70, fontSize: 12)),
                    ]),
              ),
            ]),
          ).animate().fadeIn(duration: 350.ms),

          const SizedBox(height: 24),

          // ── Project picker ────────────────────────────────────────────
          _Label('Project'),
          const SizedBox(height: 6),
          projects.when(
            data: (list) => DropdownButtonFormField<String>(
              value: selectedProjectId,
              items: list
                  .map((p) => DropdownMenuItem(
                      value: p.id, child: Text(p.name)))
                  .toList(),
              onChanged: onProjectChanged,
              decoration: const InputDecoration(hintText: 'Select project'),
              dropdownColor: ds.bgElevated,
            ),
            loading: () => const LinearProgressIndicator(),
            error: (_, __) => const Text('Failed to load projects',
                style: TextStyle(color: AppColors.error)),
          ),

          const SizedBox(height: 20),

          // ── Accomplishments ───────────────────────────────────────────
          _Label("What did you accomplish today? *"),
          const SizedBox(height: 6),
          TextField(
            controller: accomplishmentsCtrl,
            decoration: const InputDecoration(
                hintText:
                    'e.g. Completed API integration, fixed 3 bugs, reviewed PRs'),
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
          ),

          const SizedBox(height: 20),

          // ── Tomorrow plan ─────────────────────────────────────────────
          _Label('What are you planning for tomorrow?'),
          const SizedBox(height: 6),
          TextField(
            controller: tomorrowCtrl,
            decoration: const InputDecoration(
                hintText: 'e.g. Continue sprint tasks, team sync at 10 am'),
            maxLines: 3,
            textCapitalization: TextCapitalization.sentences,
          ),

          const SizedBox(height: 20),

          // ── Blockers ──────────────────────────────────────────────────
          _Label('Any blockers? (optional)'),
          const SizedBox(height: 6),
          TextField(
            controller: blockersCtrl,
            decoration: const InputDecoration(
                hintText: 'e.g. Waiting for design approval'),
            maxLines: 2,
            textCapitalization: TextCapitalization.sentences,
          ),

          const SizedBox(height: 24),

          // ── Progress slider ───────────────────────────────────────────
          _Label('Day Progress'),
          const SizedBox(height: 8),
          _ProgressSection(progress: progress, onChanged: onProgressChanged),

          const SizedBox(height: 24),

          // ── Mood selector ─────────────────────────────────────────────
          _Label('How was your day?'),
          const SizedBox(height: 10),
          _MoodSelector(selected: mood, onSelected: onMoodChanged),

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
                        Text('Submit EOD',
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

// ── Progress section ──────────────────────────────────────────────────────────

class _ProgressSection extends StatelessWidget {
  const _ProgressSection(
      {required this.progress, required this.onChanged});
  final double progress;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    final ds      = context.ds;
    final pct     = progress.round();
    final color   = pct >= 70
        ? AppColors.ragGreen
        : pct >= 40
            ? AppColors.ragAmber
            : AppColors.ragRed;

    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Column(children: [
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('$pct%',
              style: TextStyle(
                  fontSize: 28,
                  fontWeight: FontWeight.w900,
                  color: color)),
          Text('of today\'s goals',
              style: TextStyle(fontSize: 12, color: ds.textMuted)),
        ]),
        const SizedBox(height: 12),
        SliderTheme(
          data: SliderTheme.of(context).copyWith(
            activeTrackColor: color,
            thumbColor: color,
            inactiveTrackColor: ds.bgElevated,
            trackHeight: 6,
            thumbShape: const RoundSliderThumbShape(enabledThumbRadius: 10),
          ),
          child: Slider(
            value: progress,
            min: 0,
            max: 100,
            divisions: 20,
            onChanged: onChanged,
          ),
        ),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('0%',
              style: TextStyle(fontSize: 11, color: ds.textMuted)),
          Text('100%',
              style: TextStyle(fontSize: 11, color: ds.textMuted)),
        ]),
      ]),
    );
  }
}

// ── Mood selector ─────────────────────────────────────────────────────────────

class _MoodSelector extends StatelessWidget {
  const _MoodSelector(
      {required this.selected, required this.onSelected});
  final String selected;
  final ValueChanged<String> onSelected;

  static const _moods = [
    ('GREEN',  '😊', 'Great',  AppColors.ragGreen),
    ('YELLOW', '😐', 'Okay',   AppColors.ragAmber),
    ('RED',    '😔', 'Tough',  AppColors.ragRed),
  ];

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Row(
      children: _moods.map((m) {
        final (value, emoji, label, color) = m;
        final isSelected = selected == value;
        return Expanded(
          child: GestureDetector(
            onTap: () => onSelected(value),
            child: AnimatedContainer(
              duration: 200.ms,
              margin: const EdgeInsets.symmetric(horizontal: 4),
              padding: const EdgeInsets.symmetric(vertical: 14),
              decoration: BoxDecoration(
                color: isSelected
                    ? color.withOpacity(0.15)
                    : ds.bgCard,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                  color: isSelected ? color : ds.border,
                  width: isSelected ? 2 : 1,
                ),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(emoji, style: const TextStyle(fontSize: 28)),
                  const SizedBox(height: 4),
                  Text(
                    label,
                    style: TextStyle(
                      fontSize: 12,
                      fontWeight: FontWeight.w700,
                      color: isSelected ? color : ds.textSecondary,
                    ),
                  ),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Success view ──────────────────────────────────────────────────────────────

class _SuccessView extends StatelessWidget {
  const _SuccessView({required this.mood});
  final String mood;

  @override
  Widget build(BuildContext context) {
    final emoji = mood == 'GREEN' ? '🎉' : mood == 'YELLOW' ? '👍' : '💪';
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(40),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Text(emoji, style: const TextStyle(fontSize: 72))
                .animate()
                .scale(begin: const Offset(0.5, 0.5), duration: 400.ms,
                    curve: Curves.elasticOut),
            const SizedBox(height: 24),
            const Text('EOD Submitted!',
                style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w800,
                    color: AppColors.textPrimary)),
            const SizedBox(height: 8),
            const Text(
              'Great job wrapping up your day.',
              textAlign: TextAlign.center,
              style: TextStyle(
                  color: AppColors.textSecondary, fontSize: 14, height: 1.5),
            ),
            const SizedBox(height: 32),
            ElevatedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Done'),
            ),
          ],
        ),
      ),
    );
  }
}

// ── Label widget ──────────────────────────────────────────────────────────────

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
