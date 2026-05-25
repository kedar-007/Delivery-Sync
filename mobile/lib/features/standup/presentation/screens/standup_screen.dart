import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';
import 'package:speech_to_text/speech_to_text.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/models/models.dart';
import '../../../../shared/providers/team_peers_provider.dart';
import '../../../../shared/widgets/user_avatar.dart';
import '../../../auth/providers/auth_provider.dart';
import '../../../dashboard/providers/dashboard_provider.dart';
import '../../providers/standup_providers.dart';

// Permission string for viewing team standups. Mirrors the backend constant
// `STANDUP_TEAM_VIEW` — kept local because `core/constants/app_constants.dart`
// is shared and intentionally not modified from feature code.
const String _kStandupTeamViewPerm = 'STANDUP_TEAM_VIEW';

// ── Screen ────────────────────────────────────────────────────────────────────

class StandupScreen extends ConsumerStatefulWidget {
  const StandupScreen({super.key});

  @override
  ConsumerState<StandupScreen> createState() => _StandupScreenState();
}

class _StandupScreenState extends ConsumerState<StandupScreen>
    with TickerProviderStateMixin {
  TabController? _tabController;
  bool _canSeeTeam = false;

  @override
  void initState() {
    super.initState();
    // Tab count depends on perms — initialise to 2 then expand once auth
    // resolves so we don't flash an empty third tab to non-permitted users.
    _tabController = TabController(length: 2, vsync: this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final u = ref.read(currentUserProvider);
    final canTeam = u?.hasPermission(_kStandupTeamViewPerm) == true;
    if (canTeam != _canSeeTeam) {
      _canSeeTeam = canTeam;
      _tabController?.dispose();
      _tabController = TabController(length: canTeam ? 3 : 2, vsync: this);
    }
  }

  @override
  void dispose() {
    _tabController?.dispose();
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
          isScrollable: _canSeeTeam,
          tabs: [
            const Tab(text: 'Submit'),
            const Tab(text: 'My History'),
            if (_canSeeTeam) const Tab(text: 'Team Standups'),
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
          if (_canSeeTeam) const _TeamStandupsTab(),
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
      final ds = context.ds;
      return Center(
        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(Icons.history_rounded, size: 56, color: ds.textMuted),
          const SizedBox(height: 16),
          Text('No standups yet',
              style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700,
                  color: ds.textPrimary)),
          const SizedBox(height: 6),
          Text('Your submitted standups will appear here.',
              style: TextStyle(color: ds.textSecondary, fontSize: 13)),
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
                  Icon(Icons.calendar_today_rounded,
                      size: 14, color: ds.textMuted),
                  const SizedBox(width: 6),
                  Text(date,
                      style: TextStyle(fontSize: 13,
                          fontWeight: FontWeight.w700,
                          color: ds.textPrimary)),
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
                    color: ds.textSecondary),
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
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label.toUpperCase(),
            style: TextStyle(
                fontSize: 10, fontWeight: FontWeight.w800,
                color: color, letterSpacing: 0.5)),
        const SizedBox(height: 3),
        Text(text,
            style: TextStyle(
                fontSize: 13, color: ds.textPrimary, height: 1.4)),
      ],
    );
  }
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

// ── Team Standups Tab ────────────────────────────────────────────────────────
//
// Mirrors the web "Team Standups" tab: filter card (date presets + custom
// range + project + user + clear) on top, scrollable list of standup cards
// in the middle, server-driven pagination footer at the bottom.

enum _TeamDatePreset { today, yesterday, week, all, custom }

class _TeamStandupsTab extends ConsumerStatefulWidget {
  const _TeamStandupsTab();

  @override
  ConsumerState<_TeamStandupsTab> createState() => _TeamStandupsTabState();
}

class _TeamStandupsTabState extends ConsumerState<_TeamStandupsTab> {
  // Default range = today (matches web behaviour).
  late String _dateFrom;
  late String _dateTo;
  String _userId    = '';
  String _projectId = '';
  int _page         = 1;
  int _pageSize     = 5;

  @override
  void initState() {
    super.initState();
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    _dateFrom = today;
    _dateTo   = today;
  }

  void _applyPreset(_TeamDatePreset preset) {
    final now = DateTime.now();
    setState(() {
      _page = 1;
      switch (preset) {
        case _TeamDatePreset.today:
          final d = DateFormat('yyyy-MM-dd').format(now);
          _dateFrom = d; _dateTo = d;
          break;
        case _TeamDatePreset.yesterday:
          final d = DateFormat('yyyy-MM-dd').format(
              now.subtract(const Duration(days: 1)));
          _dateFrom = d; _dateTo = d;
          break;
        case _TeamDatePreset.week:
          // Week starts Monday — match the web (`weekStartsOn: 1`).
          final weekday = now.weekday; // Mon=1 … Sun=7
          final ws = now.subtract(Duration(days: weekday - 1));
          final we = ws.add(const Duration(days: 6));
          _dateFrom = DateFormat('yyyy-MM-dd').format(ws);
          _dateTo   = DateFormat('yyyy-MM-dd').format(we);
          break;
        case _TeamDatePreset.all:
          _dateFrom = ''; _dateTo = '';
          break;
        case _TeamDatePreset.custom:
          break;
      }
    });
  }

  _TeamDatePreset get _activePreset {
    final now = DateTime.now();
    final t  = DateFormat('yyyy-MM-dd').format(now);
    final y  = DateFormat('yyyy-MM-dd').format(now.subtract(const Duration(days: 1)));
    final weekday = now.weekday;
    final ws = DateFormat('yyyy-MM-dd').format(now.subtract(Duration(days: weekday - 1)));
    final we = DateFormat('yyyy-MM-dd').format(
        now.subtract(Duration(days: weekday - 1)).add(const Duration(days: 6)));
    if (_dateFrom.isEmpty && _dateTo.isEmpty)         return _TeamDatePreset.all;
    if (_dateFrom == t  && _dateTo == t)              return _TeamDatePreset.today;
    if (_dateFrom == y  && _dateTo == y)              return _TeamDatePreset.yesterday;
    if (_dateFrom == ws && _dateTo == we)             return _TeamDatePreset.week;
    return _TeamDatePreset.custom;
  }

  bool get _hasFilter =>
      _dateFrom.isNotEmpty ||
      _dateTo.isNotEmpty ||
      _userId.isNotEmpty ||
      _projectId.isNotEmpty;

  void _clearFilters() {
    final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
    setState(() {
      _dateFrom  = today;
      _dateTo    = today;
      _userId    = '';
      _projectId = '';
      _page      = 1;
    });
  }

  Future<void> _pickDate({required bool isFrom}) async {
    final current = (isFrom ? _dateFrom : _dateTo);
    DateTime initial;
    try {
      initial = current.isEmpty ? DateTime.now() : DateTime.parse(current);
    } catch (_) { initial = DateTime.now(); }
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(2020),
      lastDate: DateTime.now().add(const Duration(days: 1)),
    );
    if (picked == null || !mounted) return;
    final s = DateFormat('yyyy-MM-dd').format(picked);
    setState(() {
      if (isFrom) { _dateFrom = s; } else { _dateTo = s; }
      _page = 1;
    });
  }

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final projects = ref.watch(projectsProvider);
    final peers    = ref.watch(teamPeersProvider);
    final params = TeamStandupsParams(
      page:       _page,
      pageSize:   _pageSize,
      startDate:  _dateFrom.isEmpty ? null : _dateFrom,
      endDate:    _dateTo.isEmpty   ? null : _dateTo,
      userId:     _userId.isEmpty   ? null : _userId,
      projectId:  _projectId.isEmpty ? null : _projectId,
    );
    final teamAsync = ref.watch(teamStandupsProvider(params));

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(teamStandupsProvider(params)),
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Info banner
          Container(
            padding: const EdgeInsets.all(10),
            decoration: BoxDecoration(
              color: AppColors.primary.withOpacity(0.08),
              border: Border.all(color: AppColors.primary.withOpacity(0.25)),
              borderRadius: BorderRadius.circular(12),
            ),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.groups_rounded,
                  size: 16, color: AppColors.primary),
              const SizedBox(width: 8),
              Expanded(
                child: Text(
                  "Showing standups from members of teams you're in or lead.",
                  style: TextStyle(
                      fontSize: 12, color: ds.textSecondary, height: 1.35),
                ),
              ),
            ]),
          ),

          const SizedBox(height: 12),

          // Filter card
          _TeamFilterCard(
            activePreset: _activePreset,
            onPreset: _applyPreset,
            dateFrom: _dateFrom,
            dateTo:   _dateTo,
            onPickFrom: () => _pickDate(isFrom: true),
            onPickTo:   () => _pickDate(isFrom: false),
            projects:    projects,
            projectId:   _projectId,
            onProject:   (v) => setState(() { _projectId = v ?? ''; _page = 1; }),
            userOptions: _userOptionsFromPeers(peers.asData?.value ?? const []),
            userId:      _userId,
            onUser:      (v) => setState(() { _userId = v ?? ''; _page = 1; }),
            hasFilter:   _hasFilter,
            onClear:     _clearFilters,
          ),

          const SizedBox(height: 16),

          // Body — loading / error / empty / list
          teamAsync.when(
            loading: () => const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator()),
            ),
            error: (e, _) => Padding(
              padding: const EdgeInsets.symmetric(vertical: 32),
              child: Column(children: [
                Icon(Icons.error_outline_rounded, color: AppColors.error, size: 40),
                const SizedBox(height: 8),
                Text('Failed to load team standups',
                    style: TextStyle(color: ds.textPrimary, fontWeight: FontWeight.w700)),
                const SizedBox(height: 4),
                Text(e.toString(),
                    textAlign: TextAlign.center,
                    style: TextStyle(color: ds.textMuted, fontSize: 12)),
                const SizedBox(height: 12),
                ElevatedButton(
                  onPressed: () => ref.invalidate(teamStandupsProvider(params)),
                  child: const Text('Retry'),
                ),
              ]),
            ),
            data: (result) {
              if (result.entries.isEmpty) {
                return Padding(
                  padding: const EdgeInsets.symmetric(vertical: 48),
                  child: Column(children: [
                    Icon(Icons.inbox_rounded, size: 56, color: ds.textMuted),
                    const SizedBox(height: 14),
                    Text('No team standups in this range',
                        style: TextStyle(
                            fontSize: 16, fontWeight: FontWeight.w700,
                            color: ds.textPrimary)),
                    const SizedBox(height: 6),
                    Text(
                      'Try widening the date range or clearing the user / project filter.',
                      textAlign: TextAlign.center,
                      style: TextStyle(color: ds.textMuted, fontSize: 12),
                    ),
                  ]),
                );
              }
              return Column(
                children: [
                  ...result.entries.map((e) => _TeamStandupCard(entry: e)),
                  const SizedBox(height: 10),
                  _TeamPaginationFooter(
                    page:       _page,
                    pageSize:   _pageSize,
                    total:      result.total,
                    totalPages: result.totalPages,
                    onPage:     (p) => setState(() => _page = p),
                    onPageSize: (n) => setState(() {
                      _pageSize = n;
                      _page = 1;
                    }),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  // Build user options from the full team-peer roster (every user the caller
  // shares a team with — co-member, lead, or report). This populates the User
  // filter with every peer, not just those who happen to have an entry on the
  // currently-visible page.
  List<({String id, String name})> _userOptionsFromPeers(List<TeamPeer> peers) {
    return peers
        .map((p) => (id: p.id, name: p.name))
        .toList()
      ..sort((a, b) => a.name.compareTo(b.name));
  }
}

// ── Team filter card ─────────────────────────────────────────────────────────

class _TeamFilterCard extends StatelessWidget {
  const _TeamFilterCard({
    required this.activePreset,
    required this.onPreset,
    required this.dateFrom,
    required this.dateTo,
    required this.onPickFrom,
    required this.onPickTo,
    required this.projects,
    required this.projectId,
    required this.onProject,
    required this.userOptions,
    required this.userId,
    required this.onUser,
    required this.hasFilter,
    required this.onClear,
  });

  final _TeamDatePreset activePreset;
  final ValueChanged<_TeamDatePreset> onPreset;
  final String dateFrom;
  final String dateTo;
  final VoidCallback onPickFrom;
  final VoidCallback onPickTo;
  final AsyncValue<List<Project>> projects;
  final String projectId;
  final ValueChanged<String?> onProject;
  final List<({String id, String name})> userOptions;
  final String userId;
  final ValueChanged<String?> onUser;
  final bool hasFilter;
  final VoidCallback onClear;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ds.bgCard,
        border: Border.all(color: ds.border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Preset chips + Clear button
          Wrap(
            spacing: 8,
            runSpacing: 8,
            crossAxisAlignment: WrapCrossAlignment.center,
            children: [
              _PresetChip(
                label: 'Today',
                active: activePreset == _TeamDatePreset.today,
                onTap: () => onPreset(_TeamDatePreset.today),
              ),
              _PresetChip(
                label: 'Yesterday',
                active: activePreset == _TeamDatePreset.yesterday,
                onTap: () => onPreset(_TeamDatePreset.yesterday),
              ),
              _PresetChip(
                label: 'This Week',
                active: activePreset == _TeamDatePreset.week,
                onTap: () => onPreset(_TeamDatePreset.week),
              ),
              _PresetChip(
                label: 'All Time',
                active: activePreset == _TeamDatePreset.all,
                onTap: () => onPreset(_TeamDatePreset.all),
              ),
              if (activePreset == _TeamDatePreset.custom)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.1),
                    border: Border.all(color: AppColors.primary.withOpacity(0.3)),
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Text('Custom',
                      style: TextStyle(
                          fontSize: 11, fontWeight: FontWeight.w700,
                          color: AppColors.primary)),
                ),
              if (hasFilter)
                _PresetChip(
                  label: 'Clear filters',
                  active: false,
                  danger: true,
                  onTap: onClear,
                ),
            ],
          ),
          const SizedBox(height: 12),

          // Date row
          Row(children: [
            Expanded(
              child: _DatePickerField(
                label: 'From',
                value: dateFrom,
                onTap: onPickFrom,
              ),
            ),
            const SizedBox(width: 10),
            Expanded(
              child: _DatePickerField(
                label: 'To',
                value: dateTo,
                onTap: onPickTo,
              ),
            ),
          ]),
          const SizedBox(height: 10),

          // Project dropdown
          Text('Project',
              style: TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w700,
                  color: ds.textSecondary, letterSpacing: 0.3)),
          const SizedBox(height: 4),
          projects.when(
            data: (list) => DropdownButtonFormField<String>(
              value: projectId,
              isExpanded: true,
              items: [
                const DropdownMenuItem<String>(
                    value: '', child: Text('All projects',
                        style: TextStyle(fontSize: 13))),
                ...list.map((p) => DropdownMenuItem<String>(
                      value: p.id,
                      child: Text(p.name,
                          overflow: TextOverflow.ellipsis,
                          style: const TextStyle(fontSize: 13)),
                    )),
              ],
              onChanged: (v) => onProject(v ?? ''),
              dropdownColor: ds.bgElevated,
              decoration: const InputDecoration(isDense: true),
            ),
            loading: () => const LinearProgressIndicator(),
            error: (_, __) => Text('Failed to load projects',
                style: TextStyle(color: AppColors.error, fontSize: 12)),
          ),
          const SizedBox(height: 10),

          // User dropdown — populated from visible standups
          Text('User',
              style: TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w700,
                  color: ds.textSecondary, letterSpacing: 0.3)),
          const SizedBox(height: 4),
          DropdownButtonFormField<String>(
            // If userId points to someone not in the current page's user list
            // (can happen after filters narrow the result set), fall back to
            // the "All users" entry so Flutter doesn't assert on a missing
            // dropdown value.
            value: userOptions.any((u) => u.id == userId) ? userId : '',
            isExpanded: true,
            items: [
              const DropdownMenuItem<String>(
                  value: '', child: Text('All users',
                      style: TextStyle(fontSize: 13))),
              ...userOptions.map((u) => DropdownMenuItem<String>(
                    value: u.id,
                    child: Text(u.name,
                        overflow: TextOverflow.ellipsis,
                        style: const TextStyle(fontSize: 13)),
                  )),
            ],
            onChanged: (v) => onUser(v ?? ''),
            dropdownColor: ds.bgElevated,
            decoration: const InputDecoration(isDense: true),
          ),
        ],
      ),
    );
  }
}

class _PresetChip extends StatelessWidget {
  const _PresetChip({
    required this.label,
    required this.active,
    required this.onTap,
    this.danger = false,
  });
  final String label;
  final bool active;
  final bool danger;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final Color bg, fg, border;
    if (danger) {
      bg     = AppColors.error.withOpacity(0.08);
      fg     = AppColors.error;
      border = AppColors.error.withOpacity(0.4);
    } else if (active) {
      bg     = AppColors.primary;
      fg     = Colors.white;
      border = AppColors.primary;
    } else {
      bg     = ds.bgElevated;
      fg     = ds.textPrimary;
      border = ds.border;
    }
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(20),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
        decoration: BoxDecoration(
          color: bg,
          border: Border.all(color: border),
          borderRadius: BorderRadius.circular(20),
        ),
        child: Text(label,
            style: TextStyle(
                fontSize: 12, fontWeight: FontWeight.w600, color: fg)),
      ),
    );
  }
}

class _DatePickerField extends StatelessWidget {
  const _DatePickerField({
    required this.label,
    required this.value,
    required this.onTap,
  });
  final String label;
  final String value;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final display = value.isEmpty ? '—' : _prettyDate(value);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label,
            style: TextStyle(
                fontSize: 11, fontWeight: FontWeight.w700,
                color: ds.textSecondary, letterSpacing: 0.3)),
        const SizedBox(height: 4),
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(8),
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            decoration: BoxDecoration(
              color: ds.bgInput,
              border: Border.all(color: ds.border),
              borderRadius: BorderRadius.circular(8),
            ),
            child: Row(children: [
              Icon(Icons.calendar_today_rounded, size: 14, color: ds.textMuted),
              const SizedBox(width: 8),
              Expanded(
                child: Text(display,
                    style: TextStyle(
                        fontSize: 13, color: ds.textPrimary,
                        fontWeight: FontWeight.w500)),
              ),
            ]),
          ),
        ),
      ],
    );
  }

  static String _prettyDate(String iso) {
    try {
      return DateFormat('d MMM yyyy').format(DateTime.parse(iso));
    } catch (_) { return iso; }
  }
}

// ── Team standup card ────────────────────────────────────────────────────────

class _TeamStandupCard extends StatelessWidget {
  const _TeamStandupCard({required this.entry});
  final Map<String, dynamic> entry;

  @override
  Widget build(BuildContext context) {
    final ds        = context.ds;
    final userName  = (entry['userName']      ?? 'Team member').toString();
    final avatarUrl = entry['userAvatarUrl']?.toString();
    final project   = (entry['projectName']   ?? '').toString();
    final dateRaw   = (entry['date']          ?? '').toString();
    final date      = _fmt(dateRaw);
    final yesterday = (entry['yesterday'] ?? '').toString();
    final today     = (entry['today']     ?? '').toString();
    final blockers  = entry['blockers']?.toString();

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ds.bgCard,
        border: Border.all(color: ds.border),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Header — avatar + name + project + date
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              UserAvatar(
                name: userName,
                avatarUrl: avatarUrl,
                radius: 18,
                fontSize: 13,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(userName,
                        style: TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w700,
                            color: ds.textPrimary)),
                    if (project.isNotEmpty) ...[
                      const SizedBox(height: 3),
                      Container(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 7, vertical: 2),
                        decoration: BoxDecoration(
                          color: AppColors.primary.withOpacity(0.1),
                          borderRadius: BorderRadius.circular(6),
                        ),
                        child: Text(project,
                            overflow: TextOverflow.ellipsis,
                            style: const TextStyle(
                                fontSize: 10, fontWeight: FontWeight.w700,
                                color: AppColors.primary)),
                      ),
                    ],
                  ],
                ),
              ),
              Text(date,
                  style: TextStyle(
                      fontSize: 11, color: ds.textMuted,
                      fontWeight: FontWeight.w600)),
            ],
          ),
          const SizedBox(height: 10),
          _HistorySection(
              label: 'Yesterday', text: yesterday, color: ds.textSecondary),
          const SizedBox(height: 8),
          _HistorySection(
              label: 'Today', text: today, color: AppColors.primary),
          if (blockers != null && blockers.isNotEmpty) ...[
            const SizedBox(height: 8),
            _HistorySection(
                label: 'Blockers', text: blockers, color: AppColors.ragRed),
          ],
        ],
      ),
    ).animate().fadeIn(duration: 200.ms);
  }

  static String _fmt(String raw) {
    if (raw.isEmpty) return '';
    try { return DateFormat('d MMM yyyy').format(DateTime.parse(raw)); }
    catch (_) { return raw; }
  }
}

// ── Pagination footer ────────────────────────────────────────────────────────

class _TeamPaginationFooter extends StatelessWidget {
  const _TeamPaginationFooter({
    required this.page,
    required this.pageSize,
    required this.total,
    required this.totalPages,
    required this.onPage,
    required this.onPageSize,
  });

  final int page;
  final int pageSize;
  final int total;
  final int totalPages;
  final ValueChanged<int> onPage;
  final ValueChanged<int> onPageSize;

  @override
  Widget build(BuildContext context) {
    final ds   = context.ds;
    final from = total == 0 ? 0 : ((page - 1) * pageSize) + 1;
    final to   = (page * pageSize) > total ? total : page * pageSize;

    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ds.bgElevated,
        border: Border.all(color: ds.border),
        borderRadius: BorderRadius.circular(12),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(children: [
            Expanded(
              child: Text(
                'Showing $from–$to of $total',
                style: TextStyle(fontSize: 12, color: ds.textSecondary),
              ),
            ),
            Text('Rows: ',
                style: TextStyle(fontSize: 12, color: ds.textMuted)),
            DropdownButton<int>(
              value: pageSize,
              isDense: true,
              underline: const SizedBox.shrink(),
              dropdownColor: ds.bgElevated,
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w700,
                  color: ds.textPrimary),
              items: const [3, 5, 10, 20, 50]
                  .map((n) => DropdownMenuItem(
                        value: n,
                        child: Text(n.toString()),
                      ))
                  .toList(),
              onChanged: (v) { if (v != null) onPageSize(v); },
            ),
          ]),
          const SizedBox(height: 8),
          // Page-nav row — first, prev, numbered windows, next, last
          SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                _PageBtn(
                  label: '«',
                  enabled: page > 1,
                  onTap: () => onPage(1),
                  tooltip: 'First page',
                ),
                _PageBtn(
                  label: '‹',
                  enabled: page > 1,
                  onTap: () => onPage(page - 1),
                  tooltip: 'Previous page',
                ),
                ..._windowedPages(page, totalPages).map((p) => p == null
                    ? Padding(
                        padding: const EdgeInsets.symmetric(horizontal: 4),
                        child: Text('…',
                            style: TextStyle(color: ds.textMuted, fontSize: 13)),
                      )
                    : _PageBtn(
                        label: p.toString(),
                        enabled: true,
                        active: p == page,
                        onTap: () => onPage(p),
                      )),
                _PageBtn(
                  label: '›',
                  enabled: page < totalPages,
                  onTap: () => onPage(page + 1),
                  tooltip: 'Next page',
                ),
                _PageBtn(
                  label: '»',
                  enabled: page < totalPages,
                  onTap: () => onPage(totalPages),
                  tooltip: 'Last page',
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  // Build the page-number list: always show first, last, and a ±1 window
  // around the current page. Insert `null` as the gap marker (rendered as '…').
  static List<int?> _windowedPages(int current, int total) {
    final pages = <int>[];
    for (var p = 1; p <= total; p++) {
      if (p == 1 || p == total || (p - current).abs() <= 1) pages.add(p);
    }
    final out = <int?>[];
    for (var i = 0; i < pages.length; i++) {
      if (i > 0 && pages[i] - pages[i - 1] > 1) out.add(null);
      out.add(pages[i]);
    }
    return out;
  }
}

class _PageBtn extends StatelessWidget {
  const _PageBtn({
    required this.label,
    required this.enabled,
    required this.onTap,
    this.active = false,
    this.tooltip,
  });

  final String label;
  final bool enabled;
  final bool active;
  final VoidCallback onTap;
  final String? tooltip;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final Color bg, fg, border;
    if (active) {
      bg     = AppColors.primary;
      fg     = Colors.white;
      border = AppColors.primary;
    } else if (!enabled) {
      bg     = ds.bgCard;
      fg     = ds.textMuted;
      border = ds.border;
    } else {
      bg     = ds.bgCard;
      fg     = ds.textPrimary;
      border = ds.border;
    }
    final btn = Container(
      margin: const EdgeInsets.symmetric(horizontal: 2),
      constraints: const BoxConstraints(minWidth: 30, minHeight: 30),
      decoration: BoxDecoration(
        color: bg,
        border: Border.all(color: border),
        borderRadius: BorderRadius.circular(6),
      ),
      child: InkWell(
        onTap: enabled ? onTap : null,
        borderRadius: BorderRadius.circular(6),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          child: Center(
            child: Text(label,
                style: TextStyle(
                    fontSize: 12, fontWeight: FontWeight.w700, color: fg)),
          ),
        ),
      ),
    );
    return tooltip != null ? Tooltip(message: tooltip!, child: btn) : btn;
  }
}
