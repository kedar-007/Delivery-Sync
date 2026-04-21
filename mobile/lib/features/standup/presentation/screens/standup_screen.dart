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

class StandupScreen extends ConsumerStatefulWidget {
  const StandupScreen({super.key});

  @override
  ConsumerState<StandupScreen> createState() => _StandupScreenState();
}

class _StandupScreenState extends ConsumerState<StandupScreen>
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
        title: const Text('Daily Stand-up'),
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
  final _yesterdayCtrl  = TextEditingController();
  final _todayCtrl      = TextEditingController();
  final _blockersCtrl   = TextEditingController();
  String? _selectedProjectId;
  bool _submitting = false;
  bool _submitted  = false;

  // Voice
  final _stt = SpeechToText();
  bool _sttAvailable = false;
  bool _listening     = false;
  bool _aiProcessing  = false;
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
    _yesterdayCtrl.dispose();
    _todayCtrl.dispose();
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
          'type': 'standup',
          if (_selectedProjectId != null) 'project_id': _selectedProjectId,
          'date': DateTime.now().toIso8601String().substring(0, 10),
        },
      );
      final d = res['data'] ?? res;
      final filled = <String>{};
      if (d['yesterday'] != null) {
        _yesterdayCtrl.text = d['yesterday'];
        filled.add('yesterday');
      }
      if (d['today'] != null) {
        _todayCtrl.text = d['today'];
        filled.add('today');
      }
      if (d['blockers'] != null) {
        _blockersCtrl.text = d['blockers'];
        filled.add('blockers');
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
    if (_yesterdayCtrl.text.trim().isEmpty || _todayCtrl.text.trim().isEmpty) {
      _snack('Yesterday and Today fields are required');
      return;
    }
    setState(() => _submitting = true);
    try {
      await ApiClient.instance.post(
        '${AppConstants.baseCore}/standups',
        data: {
          'project_id': _selectedProjectId,
          'date':       DateTime.now().toIso8601String().substring(0, 10),
          'yesterday':  _yesterdayCtrl.text.trim(),
          'today':      _todayCtrl.text.trim(),
          if (_blockersCtrl.text.trim().isNotEmpty)
            'blockers': _blockersCtrl.text.trim(),
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
    if (_submitted) return _SuccessView();
    final projects = ref.watch(projectsProvider);
    final ds = context.ds;

    return SingleChildScrollView(
      padding: const EdgeInsets.all(20),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Live indicator
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
            decoration: BoxDecoration(
              color: AppColors.successBg,
              borderRadius: BorderRadius.circular(8),
              border: Border.all(color: AppColors.success.withOpacity(0.4)),
            ),
            child: Row(mainAxisSize: MainAxisSize.min, children: [
              Container(
                width: 7, height: 7,
                decoration: const BoxDecoration(
                  color: AppColors.success, shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 6),
              const Text('Stand-up open',
                  style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600,
                      color: AppColors.success)),
            ]),
          ).animate().fadeIn(duration: 300.ms),

          const SizedBox(height: 20),

          // Project picker
          _Label('Project'),
          const SizedBox(height: 6),
          projects.when(
            data: (list) => DropdownButtonFormField<String>(
              value: _selectedProjectId,
              items: list.map((p) => DropdownMenuItem(
                    value: p.id,
                    child: Text(p.name,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 14)),
                  )).toList(),
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

          // Yesterday
          _Label('What did you do yesterday? *',
              aiTag: _aiFilledFields.contains('yesterday')),
          const SizedBox(height: 6),
          TextField(
            controller: _yesterdayCtrl,
            decoration: const InputDecoration(
              hintText: 'e.g. Completed API integration for delivery tracking',
            ),
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
          ),

          const SizedBox(height: 20),

          // Today
          _Label("What will you do today? *",
              aiTag: _aiFilledFields.contains('today')),
          const SizedBox(height: 6),
          TextField(
            controller: _todayCtrl,
            decoration: const InputDecoration(
              hintText: 'e.g. Work on route optimisation module, team sync at 3 pm',
            ),
            maxLines: 4,
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
        '${AppConstants.baseCore}/standups',
        fromJson: (r) => r as Map<String, dynamic>,
      );
      final body = res['data'] as Map<String, dynamic>? ?? {};
      final list = (body['standups'] ?? []) as List;
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
          Text('Failed to load history', style: TextStyle(color: AppColors.error)),
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
          const Text('No standups yet',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700,
                  color: AppColors.textPrimary)),
          const SizedBox(height: 6),
          const Text('Your submitted standups will appear here.',
              style: TextStyle(color: AppColors.textSecondary, fontSize: 13)),
        ]),
      );
    }

    final ds = context.ds;
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
              const Icon(Icons.check_circle_rounded,
                  color: Colors.white, size: 20),
              const SizedBox(width: 8),
              Text('${_entries!.length} standup${_entries!.length != 1 ? 's' : ''} submitted',
                  style: const TextStyle(color: Colors.white,
                      fontWeight: FontWeight.w700, fontSize: 14)),
            ]),
          ).animate().fadeIn(duration: 300.ms),

          ..._entries!.map((e) => _StandupHistoryCard(entry: e)),
        ],
      ),
    );
  }
}

class _StandupHistoryCard extends StatelessWidget {
  const _StandupHistoryCard({required this.entry});
  final Map<String, dynamic> entry;

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
    final yesterday = entry['yesterday']?.toString() ?? '';
    final today = entry['today']?.toString() ?? '';
    final blockers = entry['blockers']?.toString();

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
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(6),
                  ),
                  child: Text(projectName,
                      style: const TextStyle(fontSize: 11,
                          fontWeight: FontWeight.w600,
                          color: AppColors.primary)),
                ),
              ],
            ),
          ),
          // Content
          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                _HistorySection(
                    label: 'Yesterday',
                    text: yesterday,
                    color: AppColors.textSecondary),
                const SizedBox(height: 10),
                _HistorySection(
                    label: 'Today',
                    text: today,
                    color: AppColors.primary),
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
              style: TextStyle(
                  fontSize: 10, fontWeight: FontWeight.w800,
                  color: color, letterSpacing: 0.5)),
          const SizedBox(height: 3),
          Text(text,
              style: const TextStyle(
                  fontSize: 13, color: AppColors.textPrimary, height: 1.4)),
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
        color: listening
            ? AppColors.ragRed.withOpacity(0.05)
            : ds.bgCard,
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
                  color: listening
                      ? AppColors.ragRed
                      : AppColors.primary,
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
                        : 'Tap mic, speak your update, let AI fill the form',
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
                  style: const TextStyle(
                      fontSize: 13, color: AppColors.textPrimary, height: 1.4)),
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

// ── Success View ──────────────────────────────────────────────────────────────

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
              )
                  .animate()
                  .scale(begin: const Offset(0.5, 0.5), duration: 400.ms,
                      curve: Curves.elasticOut),
              const SizedBox(height: 24),
              const Text('Stand-up Submitted!',
                  style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800,
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

// ── Label ─────────────────────────────────────────────────────────────────────

class _Label extends StatelessWidget {
  const _Label(this.text, {this.aiTag = false});
  final String text;
  final bool aiTag;

  @override
  Widget build(BuildContext context) => Row(
        children: [
          Text(text,
              style: const TextStyle(
                  fontSize: 13, fontWeight: FontWeight.w700,
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
