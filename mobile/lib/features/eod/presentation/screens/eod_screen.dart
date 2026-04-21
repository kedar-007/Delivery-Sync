/// EOD (End-of-Day) screen — daily report with accomplishments,
/// mood, and progress.
library;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:speech_to_text/speech_to_text.dart';

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

class _EodScreenState extends ConsumerState<EodScreen>
    with SingleTickerProviderStateMixin {
  late final TabController _tabController;

  @override
  void initState() {
    super.initState();
    _tabController = TabController(length: 2, vsync: this);
  }

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
        title: const Text('End of Day'),
        backgroundColor: ds.bgPage,
        bottom: TabBar(
          controller: _tabController,
          tabs: const [
            Tab(text: 'Submit'),
            Tab(text: 'My History'),
          ],
          labelColor: AppColors.primary,
          unselectedLabelColor: AppColors.textSecondary,
          indicatorColor: AppColors.primary,
        ),
      ),
      body: TabBarView(
        controller: _tabController,
        children: [
          _SubmitTab(),
          const _HistoryTab(),
        ],
      ),
    );
  }
}

// ── Submit Tab ────────────────────────────────────────────────────────────────

class _SubmitTab extends ConsumerStatefulWidget {
  @override
  ConsumerState<_SubmitTab> createState() => _SubmitTabState();
}

class _SubmitTabState extends ConsumerState<_SubmitTab> {
  final _accomplishmentsCtrl = TextEditingController();
  final _tomorrowCtrl        = TextEditingController();
  final _blockersCtrl        = TextEditingController();
  String? _selectedProjectId;
  double  _progress   = 50;
  String  _mood       = 'GREEN';
  bool    _submitting = false;
  bool    _submitted  = false;

  // Voice
  final _stt = SpeechToText();
  bool _sttAvailable = false;
  bool _listening    = false;
  bool _aiProcessing = false;
  String _liveTranscript = '';
  Set<String> _aiFilledFields = {};

  @override
  void initState() {
    super.initState();
    _initStt();
  }

  Future<void> _initStt() async {
    final ok = await _stt.initialize(
      onError: (e) => debugPrint('STT error: $e'),
    );
    if (mounted) setState(() => _sttAvailable = ok);
  }

  @override
  void dispose() {
    _accomplishmentsCtrl.dispose();
    _tomorrowCtrl.dispose();
    _blockersCtrl.dispose();
    _stt.stop();
    super.dispose();
  }

  Future<void> _toggleListening() async {
    if (_listening) {
      await _stt.stop();
      setState(() => _listening = false);
    } else {
      setState(() { _listening = true; _liveTranscript = ''; });
      await _stt.listen(
        onResult: (r) => setState(() => _liveTranscript = r.recognizedWords),
        listenFor: const Duration(minutes: 2),
        pauseFor: const Duration(seconds: 4),
        listenOptions: SpeechListenOptions(
          partialResults: true,
          cancelOnError: true,
        ),
      );
    }
  }

  Future<void> _processVoice() async {
    final transcript = _liveTranscript.trim();
    if (transcript.isEmpty) return;
    setState(() => _aiProcessing = true);
    try {
      final res = await ApiClient.instance.post(
        '${AppConstants.baseCore}/ai/process-voice',
        data: {
          'transcript': transcript,
          'type': 'eod',
          if (_selectedProjectId != null) 'project_id': _selectedProjectId,
          'date': DateTime.now().toIso8601String().substring(0, 10),
        },
      );
      final d = res['data'] ?? res;
      final filled = <String>{};

      if (d['accomplishments'] != null) {
        _accomplishmentsCtrl.text = d['accomplishments'];
        filled.add('accomplishments');
      }
      if (d['plan_for_tomorrow'] != null) {
        _tomorrowCtrl.text = d['plan_for_tomorrow'];
        filled.add('tomorrow');
      }
      if (d['blockers'] != null) {
        _blockersCtrl.text = d['blockers'];
        filled.add('blockers');
      }
      if (d['mood'] != null) {
        final moodVal = d['mood'].toString().toUpperCase();
        if (['GREEN', 'YELLOW', 'RED'].contains(moodVal)) {
          _mood = moodVal;
          filled.add('mood');
        }
      }
      // Map productivity score to progress
      final score = d['insights']?['productivityScore'];
      if (score != null) {
        final pct = (double.tryParse(score.toString()) ?? 0.0)
            .clamp(0.0, 100.0);
        _progress = (pct / 5).round() * 5.0;
        filled.add('progress');
      }

      setState(() {
        _aiFilledFields = filled;
        _liveTranscript = '';
      });
      _snack('Fields filled by AI ✓');
    } catch (e) {
      _snack('AI processing failed: $e');
    } finally {
      if (mounted) setState(() => _aiProcessing = false);
    }
  }

  Future<void> _submit() async {
    if (_selectedProjectId == null) { _snack('Please select a project'); return; }
    if (_accomplishmentsCtrl.text.trim().isEmpty) {
      _snack('Accomplishments are required');
      return;
    }
    setState(() => _submitting = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseCore}/eod',
        data: {
          'project_id':          _selectedProjectId,
          'date':                DateTime.now().toIso8601String().substring(0, 10),
          'accomplishments':     _accomplishmentsCtrl.text.trim(),
          'progress_percentage': _progress.round(),
          'mood':                _mood,
          if (_tomorrowCtrl.text.trim().isNotEmpty)
            'planned_tomorrow':  _tomorrowCtrl.text.trim(),
          if (_blockersCtrl.text.trim().isNotEmpty)
            'blockers':          _blockersCtrl.text.trim(),
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

  @override
  Widget build(BuildContext context) {
    if (_submitted) return _SuccessView(mood: _mood);
    final projects = ref.watch(projectsProvider);
    final ds = context.ds;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header card
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF4F46E5), Color(0xFF6366F1)],
                begin: Alignment.topLeft, end: Alignment.bottomRight,
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
                          style: TextStyle(color: Colors.white,
                              fontWeight: FontWeight.w800, fontSize: 15)),
                      SizedBox(height: 2),
                      Text('Share what you accomplished today',
                          style: TextStyle(color: Colors.white70, fontSize: 12)),
                    ]),
              ),
            ]),
          ).animate().fadeIn(duration: 350.ms),

          const SizedBox(height: 24),

          // Project picker
          _Label('Project'),
          const SizedBox(height: 6),
          projects.when(
            data: (list) => DropdownButtonFormField<String>(
              value: _selectedProjectId,
              items: list.map((p) => DropdownMenuItem(
                      value: p.id, child: Text(p.name)))
                  .toList(),
              onChanged: (v) => setState(() => _selectedProjectId = v),
              decoration: const InputDecoration(hintText: 'Select project'),
              dropdownColor: ds.bgElevated,
            ),
            loading: () => const LinearProgressIndicator(),
            error: (_, __) => const Text('Failed to load projects',
                style: TextStyle(color: AppColors.error)),
          ),

          const SizedBox(height: 20),

          // Voice recorder
          if (_sttAvailable) ...[
            _VoiceRecorderCard(
              listening: _listening,
              processing: _aiProcessing,
              transcript: _liveTranscript,
              onToggle: _toggleListening,
              onProcess: _liveTranscript.trim().isNotEmpty && !_listening
                  ? _processVoice
                  : null,
              onClear: () => setState(() => _liveTranscript = ''),
            ),
            const SizedBox(height: 20),
          ],

          // Accomplishments
          _Label('What did you accomplish today? *',
              aiTag: _aiFilledFields.contains('accomplishments')),
          const SizedBox(height: 6),
          TextField(
            controller: _accomplishmentsCtrl,
            decoration: const InputDecoration(
                hintText:
                    'e.g. Completed API integration, fixed 3 bugs, reviewed PRs'),
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
          ),

          const SizedBox(height: 20),

          // Tomorrow plan
          _Label('What are you planning for tomorrow?',
              aiTag: _aiFilledFields.contains('tomorrow')),
          const SizedBox(height: 6),
          TextField(
            controller: _tomorrowCtrl,
            decoration: const InputDecoration(
                hintText: 'e.g. Continue sprint tasks, team sync at 10 am'),
            maxLines: 3,
            textCapitalization: TextCapitalization.sentences,
          ),

          const SizedBox(height: 20),

          // Blockers
          _Label('Any blockers? (optional)',
              aiTag: _aiFilledFields.contains('blockers')),
          const SizedBox(height: 6),
          TextField(
            controller: _blockersCtrl,
            decoration: const InputDecoration(
                hintText: 'e.g. Waiting for design approval'),
            maxLines: 2,
            textCapitalization: TextCapitalization.sentences,
          ),

          const SizedBox(height: 24),

          // Progress slider
          _Label('Day Progress',
              aiTag: _aiFilledFields.contains('progress')),
          const SizedBox(height: 8),
          _ProgressSection(
              progress: _progress,
              onChanged: (v) => setState(() => _progress = v)),

          const SizedBox(height: 24),

          // Mood selector
          _Label('How was your day?',
              aiTag: _aiFilledFields.contains('mood')),
          const SizedBox(height: 10),
          _MoodSelector(
              selected: _mood,
              onSelected: (m) => setState(() => _mood = m)),

          const SizedBox(height: 32),

          SizedBox(
            width: double.infinity,
            height: 50,
            child: ElevatedButton(
              onPressed: _submitting ? null : _submit,
              child: _submitting
                  ? const SizedBox(width: 22, height: 22,
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

// ── History Tab ───────────────────────────────────────────────────────────────

class _HistoryTab extends ConsumerStatefulWidget {
  const _HistoryTab();

  @override
  ConsumerState<_HistoryTab> createState() => _HistoryTabState();
}

class _HistoryTabState extends ConsumerState<_HistoryTab> {
  List<Map<String, dynamic>>? _entries;
  bool _loading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _load();
  }

  Future<void> _load() async {
    setState(() { _loading = true; _error = null; });
    try {
      final res = await ApiClient.instance.get<Map<String, dynamic>>(
        '${AppConstants.baseCore}/eod',
        fromJson: (r) => r as Map<String, dynamic>,
      );
      final body = res['data'] as Map<String, dynamic>? ?? {};
      final list = (body['eods'] ?? []) as List;
      setState(() {
        _entries = list.map((e) => Map<String, dynamic>.from(e as Map)).toList();
        _loading = false;
      });
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_loading) return const Center(child: CircularProgressIndicator());
    if (_error != null) {
      return Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Text('Failed to load history',
              style: const TextStyle(color: AppColors.error)),
          const SizedBox(height: 12),
          ElevatedButton(onPressed: _load, child: const Text('Retry')),
        ]),
      );
    }
    if (_entries == null || _entries!.isEmpty) {
      return Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          const Icon(Icons.history_rounded, size: 56, color: AppColors.textMuted),
          const SizedBox(height: 16),
          const Text('No EODs yet',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary)),
          const SizedBox(height: 6),
          const Text('Your submitted EODs will appear here.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
        ]),
      );
    }

    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Count badge
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            margin: const EdgeInsets.only(bottom: 16),
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF4F46E5), Color(0xFF6366F1)],
                begin: Alignment.topLeft, end: Alignment.bottomRight,
              ),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(children: [
              const Icon(Icons.wb_sunny_rounded, color: Colors.white, size: 20),
              const SizedBox(width: 8),
              Text(
                '${_entries!.length} EOD${_entries!.length != 1 ? 's' : ''} submitted',
                style: const TextStyle(color: Colors.white,
                    fontWeight: FontWeight.w700, fontSize: 14),
              ),
            ]),
          ).animate().fadeIn(duration: 300.ms),

          ..._entries!.map((e) => _EodHistoryCard(entry: e)),
        ],
      ),
    );
  }
}

class _EodHistoryCard extends StatelessWidget {
  const _EodHistoryCard({required this.entry});
  final Map<String, dynamic> entry;

  static const _moodEmoji = {'GREEN': '😊', 'YELLOW': '😐', 'RED': '😔'};
  static const _moodColor = {
    'GREEN':  AppColors.ragGreen,
    'YELLOW': AppColors.ragAmber,
    'RED':    AppColors.ragRed,
  };

  @override
  static String _fmtDate(String? raw) {
    if (raw == null || raw.isEmpty) return '—';
    try {
      return DateFormat('d MMM yyyy').format(DateTime.parse(raw));
    } catch (_) { return raw; }
  }

  Widget build(BuildContext context) {
    final ds = context.ds;
    final date = _fmtDate(entry['date']?.toString());
    final projectName = entry['projectName']?.toString() ?? entry['projectId']?.toString() ?? '—';
    final accomplishments = entry['accomplishments']?.toString() ?? '';
    final plannedTomorrow = entry['plannedTomorrow']?.toString();
    final blockers = entry['blockers']?.toString();
    final mood = entry['mood']?.toString() ?? 'GREEN';
    final progress = int.tryParse(
            entry['progressPercentage']?.toString().split('.').first ?? '0') ??
        0;

    final moodColor = _moodColor[mood] ?? AppColors.ragGreen;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: BoxDecoration(
              color: ds.bgElevated,
              borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
            ),
            child: Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Row(children: [
                  const Icon(Icons.calendar_today_rounded,
                      size: 14, color: AppColors.textMuted),
                  const SizedBox(width: 6),
                  Text(date,
                      style: const TextStyle(fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: AppColors.textPrimary)),
                ]),
                Row(children: [
                  // Mood emoji
                  Text(_moodEmoji[mood] ?? '😊',
                      style: const TextStyle(fontSize: 16)),
                  const SizedBox(width: 8),
                  // Progress chip
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                    decoration: BoxDecoration(
                      color: _progressColor(progress).withOpacity(0.12),
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text('$progress%',
                        style: TextStyle(fontSize: 12,
                            fontWeight: FontWeight.w700,
                            color: _progressColor(progress))),
                  ),
                ]),
              ],
            ),
          ),
          // Project tag
          Padding(
            padding: const EdgeInsets.fromLTRB(14, 8, 14, 0),
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: AppColors.primary.withOpacity(0.1),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(projectName,
                  style: const TextStyle(fontSize: 11,
                      fontWeight: FontWeight.w600, color: AppColors.primary)),
            ),
          ),
          // Content
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _HistorySection(
                    label: 'Accomplishments',
                    text: accomplishments,
                    color: AppColors.textSecondary),
                if (plannedTomorrow != null && plannedTomorrow.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  _HistorySection(
                      label: 'Tomorrow',
                      text: plannedTomorrow,
                      color: AppColors.primary),
                ],
                if (blockers != null && blockers.isNotEmpty) ...[
                  const SizedBox(height: 10),
                  _HistorySection(
                      label: 'Blockers',
                      text: blockers,
                      color: AppColors.ragRed),
                ],
              ],
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 250.ms).slideY(begin: 0.05);
  }

  Color _progressColor(int pct) {
    if (pct >= 70) return AppColors.ragGreen;
    if (pct >= 40) return AppColors.ragAmber;
    return AppColors.ragRed;
  }
}

class _HistorySection extends StatelessWidget {
  const _HistorySection(
      {required this.label, required this.text, required this.color});
  final String label;
  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) => Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(label.toUpperCase(),
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800,
                  color: color, letterSpacing: 0.5)),
          const SizedBox(height: 3),
          Text(text,
              style: const TextStyle(fontSize: 13,
                  color: AppColors.textPrimary, height: 1.4)),
        ],
      );
}

// ── Voice Recorder Card ───────────────────────────────────────────────────────

class _VoiceRecorderCard extends StatelessWidget {
  const _VoiceRecorderCard({
    required this.listening,
    required this.processing,
    required this.transcript,
    required this.onToggle,
    required this.onProcess,
    required this.onClear,
  });
  final bool listening;
  final bool processing;
  final String transcript;
  final VoidCallback onToggle;
  final VoidCallback? onProcess;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: listening ? AppColors.ragRed.withOpacity(0.05) : ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(
          color: listening ? AppColors.ragRed : ds.border,
          width: listening ? 1.5 : 1,
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            GestureDetector(
              onTap: processing ? null : onToggle,
              child: AnimatedContainer(
                duration: 200.ms,
                width: 44, height: 44,
                decoration: BoxDecoration(
                  color: listening ? AppColors.ragRed : AppColors.primary,
                  shape: BoxShape.circle,
                  boxShadow: listening
                      ? [BoxShadow(
                          color: AppColors.ragRed.withOpacity(0.4),
                          blurRadius: 10, spreadRadius: 2)]
                      : null,
                ),
                child: Icon(
                  listening ? Icons.stop_rounded : Icons.mic_rounded,
                  color: Colors.white, size: 22,
                ),
              ),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    listening ? 'Recording…' : 'Voice to AI',
                    style: TextStyle(
                      fontSize: 13, fontWeight: FontWeight.w700,
                      color: listening ? AppColors.ragRed : AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    listening
                        ? 'Tap stop when done speaking'
                        : 'Tap mic, describe your day, let AI fill the form',
                    style: const TextStyle(
                        fontSize: 11, color: AppColors.textSecondary),
                  ),
                ],
              ),
            ),
          ]),

          if (listening && transcript.isEmpty) ...[
            const SizedBox(height: 10),
            Row(children: [
              const SizedBox(width: 4),
              _PulseDot(),
              const SizedBox(width: 8),
              const Text('Listening…',
                  style: TextStyle(fontSize: 12, color: AppColors.textMuted)),
            ]),
          ],

          if (transcript.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: context.ds.bgElevated,
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(transcript,
                  style: const TextStyle(fontSize: 13,
                      color: AppColors.textPrimary, height: 1.4)),
            ),
            const SizedBox(height: 10),
            Row(children: [
              if (onProcess != null)
                Expanded(
                  child: ElevatedButton.icon(
                    onPressed: processing ? null : onProcess,
                    icon: processing
                        ? const SizedBox(width: 14, height: 14,
                            child: CircularProgressIndicator(
                                color: Colors.white, strokeWidth: 2))
                        : const Icon(Icons.auto_awesome_rounded, size: 16),
                    label: Text(processing ? 'Filling…' : 'Fill with AI'),
                    style: ElevatedButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 10),
                      textStyle: const TextStyle(
                          fontSize: 13, fontWeight: FontWeight.w700),
                    ),
                  ),
                ),
              const SizedBox(width: 8),
              IconButton(
                onPressed: onClear,
                icon: const Icon(Icons.clear_rounded),
                tooltip: 'Clear',
                color: AppColors.textMuted,
              ),
            ]),
          ],
        ],
      ),
    );
  }
}

class _PulseDot extends StatefulWidget {
  @override
  State<_PulseDot> createState() => _PulseDotState();
}

class _PulseDotState extends State<_PulseDot>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
        vsync: this, duration: const Duration(milliseconds: 800))
      ..repeat(reverse: true);
    _anim = Tween<double>(begin: 0.4, end: 1.0).animate(_ctrl);
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => FadeTransition(
        opacity: _anim,
        child: Container(
          width: 8, height: 8,
          decoration: const BoxDecoration(
              color: AppColors.ragRed, shape: BoxShape.circle),
        ),
      );
}

// ── Progress Section ──────────────────────────────────────────────────────────

class _ProgressSection extends StatelessWidget {
  const _ProgressSection({required this.progress, required this.onChanged});
  final double progress;
  final ValueChanged<double> onChanged;

  @override
  Widget build(BuildContext context) {
    final ds    = context.ds;
    final pct   = progress.round();
    final color = pct >= 70
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
              style: TextStyle(fontSize: 28, fontWeight: FontWeight.w900,
                  color: color)),
          Text("of today's goals",
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
            value: progress, min: 0, max: 100, divisions: 20,
            onChanged: onChanged,
          ),
        ),
        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
          Text('0%', style: TextStyle(fontSize: 11, color: ds.textMuted)),
          Text('100%', style: TextStyle(fontSize: 11, color: ds.textMuted)),
        ]),
      ]),
    );
  }
}

// ── Mood Selector ─────────────────────────────────────────────────────────────

class _MoodSelector extends StatelessWidget {
  const _MoodSelector({required this.selected, required this.onSelected});
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
                color: isSelected ? color.withOpacity(0.15) : ds.bgCard,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(
                    color: isSelected ? color : ds.border,
                    width: isSelected ? 2 : 1),
              ),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Text(emoji, style: const TextStyle(fontSize: 28)),
                  const SizedBox(height: 4),
                  Text(label,
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
                          color: isSelected ? color : ds.textSecondary)),
                ],
              ),
            ),
          ),
        );
      }).toList(),
    );
  }
}

// ── Success View ──────────────────────────────────────────────────────────────

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
                style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800,
                    color: AppColors.textPrimary)),
            const SizedBox(height: 8),
            const Text('Great job wrapping up your day.',
                textAlign: TextAlign.center,
                style: TextStyle(color: AppColors.textSecondary,
                    fontSize: 14, height: 1.5)),
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

// ── Label ─────────────────────────────────────────────────────────────────────

class _Label extends StatelessWidget {
  const _Label(this.text, {this.aiTag = false});
  final String text;
  final bool aiTag;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Text(text,
              style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w700,
                  color: AppColors.textSecondary, letterSpacing: 0.2)),
          if (aiTag) ...[
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: const Color(0xFFEDE9FE),
                borderRadius: BorderRadius.circular(4),
              ),
              child: const Row(mainAxisSize: MainAxisSize.min, children: [
                Icon(Icons.auto_awesome_rounded,
                    size: 10, color: Color(0xFF7C3AED)),
                SizedBox(width: 3),
                Text('AI', style: TextStyle(fontSize: 10,
                    fontWeight: FontWeight.w700, color: Color(0xFF7C3AED))),
              ]),
            ),
          ],
        ],
      );
}
