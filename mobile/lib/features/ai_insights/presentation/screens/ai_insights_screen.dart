import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../auth/providers/auth_provider.dart';
import '../../../projects/providers/projects_provider.dart';

// ─────────────────────────────────────────────────────────────────────────────
//  State
// ─────────────────────────────────────────────────────────────────────────────

final _selectedProjectIdProvider = StateProvider<String?>((ref) => null);

// All AI endpoints are POST — send projectId in body
Future<Map<String, dynamic>> _aiPost(String path, Map<String, dynamic> body) async {
  final raw = await ApiClient.instance.post<Map<String, dynamic>>(
    '${AppConstants.baseAI}$path',
    data: body,
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is Map<String, dynamic>) return d;
  return {};
}

Future<List<dynamic>> _aiPostList(String path, Map<String, dynamic> body) async {
  final raw = await ApiClient.instance.post<Map<String, dynamic>>(
    '${AppConstants.baseAI}$path',
    data: body,
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) {
    return d['suggestions'] as List? ?? d['blockers'] as List? ?? d['items'] as List? ?? [];
  }
  return [];
}

final _aiDailySummaryProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final projectId = ref.watch(_selectedProjectIdProvider);
  if (projectId == null) return {};
  final today = DateFormat('yyyy-MM-dd').format(DateTime.now());
  return _aiPost('/daily-summary', {'projectId': projectId, 'date': today});
});

final _aiHealthProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final projectId = ref.watch(_selectedProjectIdProvider);
  if (projectId == null) return {};
  return _aiPost('/project-health', {'projectId': projectId});
});

final _aiSuggestionsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final projectId = ref.watch(_selectedProjectIdProvider);
  if (projectId == null) return [];
  return _aiPostList('/suggestions', {'projectId': projectId});
});

final _aiBlockersProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final projectId = ref.watch(_selectedProjectIdProvider);
  if (projectId == null) return [];
  return _aiPostList('/detect-blockers', {'projectId': projectId});
});

final _aiTrendsProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final projectId = ref.watch(_selectedProjectIdProvider);
  if (projectId == null) return {};
  final from = DateFormat('yyyy-MM-dd').format(DateTime.now().subtract(const Duration(days: 30)));
  final to   = DateFormat('yyyy-MM-dd').format(DateTime.now());
  return _aiPost('/trends', {'projectId': projectId, 'from': from, 'to': to});
});

final _aiHolisticPerfProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final projectId = ref.watch(_selectedProjectIdProvider);
  if (projectId == null) return {};
  return _aiPost('/holistic-performance', {'projectId': projectId});
});

// ─────────────────────────────────────────────────────────────────────────────
//  Screen
// ─────────────────────────────────────────────────────────────────────────────

class AiInsightsScreen extends ConsumerWidget {
  const AiInsightsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds         = context.ds;
    final user       = ref.watch(currentUserProvider);
    final hasAccess  = user?.hasPermission(Permissions.aiInsights) == true
        || user?.role == 'TENANT_ADMIN';
    final projects   = ref.watch(projectsListProvider);
    final selectedId = ref.watch(_selectedProjectIdProvider);

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: Row(
          children: [
            Container(
              width: 30, height: 30,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                  colors: [Color(0xFF7C3AED), Color(0xFF4F46E5)],
                  begin: Alignment.topLeft, end: Alignment.bottomRight,
                ),
                borderRadius: BorderRadius.circular(8),
              ),
              child: const Icon(Icons.auto_awesome_rounded, color: Colors.white, size: 16),
            ),
            const SizedBox(width: 10),
            const Text('AI Insights', style: TextStyle(fontWeight: FontWeight.w700)),
          ],
        ),
        backgroundColor: ds.bgPage,
        surfaceTintColor: Colors.transparent,
      ),
      body: !hasAccess
          ? Center(
              child: Padding(
                padding: const EdgeInsets.all(32),
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Container(
                    padding: const EdgeInsets.all(18),
                    decoration: BoxDecoration(
                      color: const Color(0xFFA855F7).withOpacity(0.1),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.auto_awesome_rounded,
                        color: Color(0xFFA855F7), size: 40),
                  ),
                  const SizedBox(height: 20),
                  Text('AI Insights Not Available',
                      style: TextStyle(fontSize: 17, fontWeight: FontWeight.w700,
                          color: ds.textPrimary)),
                  const SizedBox(height: 8),
                  Text(
                    'You need the AI_INSIGHTS permission to access this feature.\nContact your admin to enable it.',
                    style: TextStyle(fontSize: 13, color: ds.textMuted, height: 1.5),
                    textAlign: TextAlign.center,
                  ),
                ]),
              ),
            )
          : Column(
        children: [
          // ── Project selector ───────────────────────────────────────────
          projects.when(
            data: (list) => Container(
              margin: const EdgeInsets.fromLTRB(16, 8, 16, 0),
              padding: const EdgeInsets.symmetric(horizontal: 14),
              decoration: BoxDecoration(
                color: ds.bgCard,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: ds.border),
              ),
              child: DropdownButtonHideUnderline(
                child: DropdownButton<String>(
                  value: selectedId,
                  hint: Text('Select a project', style: TextStyle(color: ds.textMuted, fontSize: 14)),
                  isExpanded: true,
                  dropdownColor: ds.bgCard,
                  icon: Icon(Icons.keyboard_arrow_down_rounded, color: ds.textMuted),
                  items: list.map((p) => DropdownMenuItem(
                    value: p.id,
                    child: Text(p.name, style: TextStyle(color: ds.textPrimary, fontSize: 14)),
                  )).toList(),
                  onChanged: (v) {
                    ref.read(_selectedProjectIdProvider.notifier).state = v;
                  },
                ),
              ),
            ),
            loading: () => const SizedBox.shrink(),
            error: (_, __) => const SizedBox.shrink(),
          ),

          // ── Tab strip ──────────────────────────────────────────────────
          if (selectedId != null)
            _AiTabStrip(),

          Expanded(
            child: selectedId == null
                ? _EmptyState()
                : _AiContent(),
          ),
        ],
      ),
    );
  }
}

class _AiTabStrip extends ConsumerStatefulWidget {
  @override
  ConsumerState<_AiTabStrip> createState() => _AiTabStripState();
}

class _AiTabStripState extends ConsumerState<_AiTabStrip> {
  int _tab = 0;
  final _tabs = ['Summary', 'Health', 'Suggestions', 'Blockers', 'Trends'];
  final _icons = [
    Icons.summarize_rounded,
    Icons.health_and_safety_rounded,
    Icons.lightbulb_rounded,
    Icons.warning_amber_rounded,
    Icons.trending_up_rounded,
  ];

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      height: 42,
      margin: const EdgeInsets.fromLTRB(16, 12, 16, 0),
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: _tabs.length,
        separatorBuilder: (_, __) => const SizedBox(width: 8),
        itemBuilder: (_, i) {
          final selected = i == _tab;
          return GestureDetector(
            onTap: () => setState(() => _tab = i),
            child: AnimatedContainer(
              duration: 200.ms,
              padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              decoration: BoxDecoration(
                color: selected
                    ? const Color(0xFF7C3AED)
                    : ds.bgCard,
                borderRadius: BorderRadius.circular(10),
                border: Border.all(
                    color: selected
                        ? const Color(0xFF7C3AED)
                        : ds.border),
              ),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  Icon(_icons[i],
                      size: 14,
                      color: selected ? Colors.white : ds.textMuted),
                  const SizedBox(width: 6),
                  Text(_tabs[i],
                      style: TextStyle(
                          fontSize: 12,
                          fontWeight: FontWeight.w600,
                          color: selected ? Colors.white : ds.textMuted)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}

class _AiContent extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    // Re-use state from the tab strip — attach to parent widget state
    // We use a simple approach: read the tab from a local state provider
    return _AiTabContent();
  }
}

// Use a single scrollable list showing all cards
class _AiTabContent extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
      children: [
        _DailySummaryCard(),
        const SizedBox(height: 14),
        _HealthCard(),
        const SizedBox(height: 14),
        _SuggestionsCard(),
        const SizedBox(height: 14),
        _BlockersCard(),
        const SizedBox(height: 14),
        _TrendsCard(),
        const SizedBox(height: 14),
        _HolisticPerfCard(),
      ],
    );
  }
}

// ── Empty state ────────────────────────────────────────────────────────────────

class _EmptyState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 80, height: 80,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                  colors: [Color(0xFF7C3AED), Color(0xFF4F46E5)]),
              borderRadius: BorderRadius.circular(24),
            ),
            child: const Icon(Icons.auto_awesome_rounded, color: Colors.white, size: 36),
          ).animate().scale(duration: 400.ms, curve: Curves.elasticOut),
          const SizedBox(height: 20),
          Text('AI-Powered Insights',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: ds.textPrimary)),
          const SizedBox(height: 8),
          Text('Select a project above to get\nAI-generated insights',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 14, color: ds.textMuted, height: 1.5)),
          const SizedBox(height: 24),
          ...[
            (Icons.summarize_rounded,     'Daily Standups Summary'),
            (Icons.health_and_safety_rounded, 'Project Health Score'),
            (Icons.lightbulb_rounded,     'Smart Recommendations'),
            (Icons.warning_amber_rounded, 'Blocker Detection'),
            (Icons.trending_up_rounded,   'Productivity Trends'),
          ].map((e) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 4),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Container(
                  width: 28, height: 28,
                  decoration: BoxDecoration(
                    color: const Color(0xFF7C3AED).withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Icon(e.$1, size: 14, color: const Color(0xFF7C3AED)),
                ),
                const SizedBox(width: 10),
                Text(e.$2,
                    style: TextStyle(fontSize: 13, color: ds.textSecondary,
                        fontWeight: FontWeight.w500)),
              ],
            ),
          )),
        ],
      ),
    );
  }
}

// ── AI Cards ───────────────────────────────────────────────────────────────────

class _DailySummaryCard extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_aiDailySummaryProvider);
    return _AiCard(
      icon: Icons.summarize_rounded,
      title: 'Daily Summary',
      subtitle: DateFormat('EEEE, d MMM').format(DateTime.now()),
      child: async.when(
        data: (d) => d.isEmpty
            ? const _AiEmpty(label: 'No standups logged today — nothing to summarise')
            : _TextBlock(data: d, textKey: 'summary'),
        loading: () => const _AiLoading(label: 'Summarising today\'s standups…'),
        error: (e, _) => _AiError(message: e.toString()),
      ),
    );
  }
}

class _HealthCard extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_aiHealthProvider);
    return _AiCard(
      icon: Icons.health_and_safety_rounded,
      title: 'Project Health',
      child: async.when(
        data: (d) => d.isEmpty
            ? const _AiEmpty(label: 'No health data yet')
            : _HealthBody(data: d),
        loading: () => const _AiLoading(label: 'Analysing project health…'),
        error: (e, _) => _AiError(message: e.toString()),
      ),
    );
  }
}

class _SuggestionsCard extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_aiSuggestionsProvider);
    return _AiCard(
      icon: Icons.lightbulb_rounded,
      title: 'Smart Recommendations',
      child: async.when(
        data: (list) => list.isEmpty
            ? const _AiEmpty(label: 'No recommendations — project looks good!')
            : _ListBlock(items: list, textKeys: const ['suggestion', 'text', 'title']),
        loading: () => const _AiLoading(label: 'Generating recommendations…'),
        error: (e, _) => _AiError(message: e.toString()),
      ),
    );
  }
}

class _BlockersCard extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_aiBlockersProvider);
    return _AiCard(
      icon: Icons.warning_amber_rounded,
      title: 'Detected Blockers',
      child: async.when(
        data: (list) => list.isEmpty
            ? const _AiEmpty(label: 'No blockers detected — clear to go!')
            : _ListBlock(
                items: list,
                textKeys: const ['blocker', 'description', 'text', 'title'],
                accentColor: AppColors.ragAmber,
                dotIcon: Icons.warning_amber_rounded,
              ),
        loading: () => const _AiLoading(label: 'Scanning for blockers…'),
        error: (e, _) => _AiError(message: e.toString()),
      ),
    );
  }
}

class _TrendsCard extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_aiTrendsProvider);
    return _AiCard(
      icon: Icons.trending_up_rounded,
      title: 'Productivity Trends (30d)',
      child: async.when(
        data: (d) => d.isEmpty
            ? const _AiEmpty(label: 'Not enough data for trend analysis yet')
            : _TextBlock(data: d, textKey: 'summary'),
        loading: () => const _AiLoading(label: 'Analysing 30-day trends…'),
        error: (e, _) => _AiError(message: e.toString()),
      ),
    );
  }
}

// ── Reusable body widgets ──────────────────────────────────────────────────────

class _TextBlock extends StatelessWidget {
  const _TextBlock({required this.data, required this.textKey});
  final Map<String, dynamic> data;
  final String textKey;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final text = data[textKey] as String?
        ?? data['analysis'] as String?
        ?? data['text'] as String?
        ?? data.entries
            .where((e) => e.value is String)
            .map((e) => e.value as String)
            .firstOrNull
        ?? data.toString();

    final bullets = data['highlights'] as List?
        ?? data['keyPoints'] as List?
        ?? data['points'] as List?;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(text, style: TextStyle(fontSize: 13, color: ds.textPrimary, height: 1.6)),
        if (bullets != null && bullets.isNotEmpty) ...[
          const SizedBox(height: 10),
          ...bullets.map((b) => Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Padding(
                padding: EdgeInsets.only(top: 5),
                child: Icon(Icons.circle, size: 5, color: Color(0xFF7C3AED)),
              ),
              const SizedBox(width: 8),
              Expanded(child: Text(b.toString(),
                  style: TextStyle(fontSize: 12, color: ds.textSecondary, height: 1.4))),
            ]),
          )),
        ],
      ],
    );
  }
}

class _ListBlock extends StatelessWidget {
  const _ListBlock({
    required this.items,
    required this.textKeys,
    this.accentColor = const Color(0xFF7C3AED),
    this.dotIcon = Icons.circle,
  });
  final List<dynamic> items;
  final List<String> textKeys;
  final Color accentColor;
  final IconData dotIcon;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Column(
      children: items.asMap().entries.map((entry) {
        final i = entry.key;
        final item = entry.value;
        String text;
        String? badge;
        if (item is Map) {
          text = textKeys.map((k) => item[k] as String?).whereType<String>().firstOrNull
              ?? item.values.whereType<String>().firstOrNull
              ?? item.toString();
          badge = item['priority'] as String? ?? item['type'] as String? ?? item['severity'] as String?;
        } else {
          text = item.toString();
        }
        return Container(
          margin: EdgeInsets.only(bottom: i < items.length - 1 ? 8 : 0),
          padding: const EdgeInsets.all(12),
          decoration: BoxDecoration(
            color: accentColor.withOpacity(0.07),
            borderRadius: BorderRadius.circular(10),
            border: Border.all(color: accentColor.withOpacity(0.2)),
          ),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Container(
              width: 22, height: 22,
              margin: const EdgeInsets.only(top: 1),
              decoration: BoxDecoration(
                color: accentColor.withOpacity(0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Icon(dotIcon, size: 12, color: accentColor),
            ),
            const SizedBox(width: 10),
            Expanded(child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(text, style: TextStyle(fontSize: 13, color: ds.textPrimary, height: 1.4)),
                if (badge != null) ...[
                  const SizedBox(height: 4),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                    decoration: BoxDecoration(
                      color: accentColor.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text(badge.toUpperCase(),
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: accentColor)),
                  ),
                ],
              ],
            )),
          ]),
        );
      }).toList(),
    );
  }
}

class _HealthBody extends StatelessWidget {
  const _HealthBody({required this.data});
  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final score = (data['score'] as num?)?.toInt()
        ?? (data['healthScore'] as num?)?.toInt();
    final status = data['status'] as String? ?? data['overallStatus'] as String?;
    final analysis = data['analysis'] as String? ?? data['summary'] as String? ?? data['text'] as String?;
    final risks = data['risks'] as List? ?? data['riskFactors'] as List? ?? [];

    final scoreColor = score == null ? AppColors.primaryLight
        : score >= 70 ? AppColors.ragGreen
        : score >= 45 ? AppColors.ragAmber
        : AppColors.ragRed;

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      if (score != null) ...[
        Row(children: [
          SizedBox(
            width: 60, height: 60,
            child: Stack(alignment: Alignment.center, children: [
              CircularProgressIndicator(
                value: score / 100,
                strokeWidth: 5,
                backgroundColor: scoreColor.withOpacity(0.15),
                valueColor: AlwaysStoppedAnimation(scoreColor),
              ),
              Text('$score', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800, color: scoreColor)),
            ]),
          ),
          const SizedBox(width: 14),
          Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(
              status ?? (score >= 70 ? 'Healthy' : score >= 45 ? 'Needs Attention' : 'At Risk'),
              style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: scoreColor),
            ),
            Text('Health Score: $score / 100',
                style: TextStyle(fontSize: 12, color: ds.textMuted)),
          ]),
        ]),
        const SizedBox(height: 14),
      ],
      if (analysis != null) ...[
        Text(analysis, style: TextStyle(fontSize: 13, color: ds.textPrimary, height: 1.5)),
        const SizedBox(height: 10),
      ],
      if (risks.isNotEmpty) ...[
        Text('RISK FACTORS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
            color: ds.textMuted, letterSpacing: 1)),
        const SizedBox(height: 8),
        ...risks.map((r) => Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Padding(padding: EdgeInsets.only(top: 2),
                child: Icon(Icons.warning_rounded, size: 13, color: AppColors.ragAmber)),
            const SizedBox(width: 8),
            Expanded(child: Text(r.toString(),
                style: TextStyle(fontSize: 12, color: ds.textSecondary))),
          ]),
        )),
      ],
    ]);
  }
}

class _HolisticPerfCard extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(_aiHolisticPerfProvider);
    return _AiCard(
      icon: Icons.people_alt_rounded,
      title: 'Team Performance',
      child: async.when(
        data: (d) => d.isEmpty
            ? const _AiEmpty(label: 'No performance data for this project yet')
            : _HolisticPerfBody(data: d),
        loading: () => const _AiLoading(label: 'Analysing team performance…'),
        error: (e, _) => _AiError(message: e.toString()),
      ),
    );
  }
}

class _HolisticPerfBody extends StatelessWidget {
  const _HolisticPerfBody({required this.data});
  final Map<String, dynamic> data;

  static Color _severityColor(String? s) => switch (s?.toLowerCase()) {
    'high'   => AppColors.ragRed,
    'medium' => AppColors.ragAmber,
    _        => AppColors.ragGreen,
  };

  @override
  Widget build(BuildContext context) {
    final ds          = context.ds;
    final teamSummary = data['teamSummary'] as String?;
    final topPerf     = data['topPerformer'] as String?;
    final teamMorale  = data['teamMorale'] as String?;
    final alerts      = (data['alerts'] as List?)?.cast<String>() ?? [];
    final members     = (data['members'] as List?) ?? [];

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
      // Team summary
      if (teamSummary != null) ...[
        Text(teamSummary,
            style: TextStyle(fontSize: 13, color: ds.textPrimary, height: 1.5)),
        const SizedBox(height: 12),
      ],

      // Top performer + morale row
      if (topPerf != null || teamMorale != null) ...[
        Row(children: [
          if (topPerf != null)
            Expanded(child: _InfoChip(
              icon: Icons.star_rounded,
              color: AppColors.ragAmber,
              label: 'Top Performer',
              value: topPerf,
            )),
          if (topPerf != null && teamMorale != null) const SizedBox(width: 8),
          if (teamMorale != null)
            Expanded(child: _InfoChip(
              icon: Icons.mood_rounded,
              color: AppColors.primaryLight,
              label: 'Team Morale',
              value: teamMorale,
            )),
        ]),
        const SizedBox(height: 12),
      ],

      // Alerts
      if (alerts.isNotEmpty) ...[
        Text('ALERTS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
            color: ds.textMuted, letterSpacing: 1)),
        const SizedBox(height: 6),
        ...alerts.map((a) => Padding(
          padding: const EdgeInsets.only(bottom: 6),
          child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Padding(padding: EdgeInsets.only(top: 2),
                child: Icon(Icons.warning_amber_rounded, size: 13, color: AppColors.ragAmber)),
            const SizedBox(width: 6),
            Expanded(child: Text(a, style: TextStyle(fontSize: 12, color: ds.textSecondary))),
          ]),
        )),
        const SizedBox(height: 12),
      ],

      // Members
      if (members.isNotEmpty) ...[
        Text('TEAM MEMBERS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
            color: ds.textMuted, letterSpacing: 1)),
        const SizedBox(height: 8),
        ...members.map((m) => _MemberPerfTile(m as Map<String, dynamic>)),
      ],
    ]);
  }
}

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.color, required this.label, required this.value});
  final IconData icon;
  final Color color;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(10),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(10),
        border: Border.all(color: color.withOpacity(0.2)),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Row(children: [
          Icon(icon, size: 12, color: color),
          const SizedBox(width: 4),
          Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
        ]),
        const SizedBox(height: 4),
        Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.ds.textPrimary),
            maxLines: 2, overflow: TextOverflow.ellipsis),
      ]),
    );
  }
}

class _MemberPerfTile extends StatefulWidget {
  const _MemberPerfTile(this.member);
  final Map<String, dynamic> member;

  @override
  State<_MemberPerfTile> createState() => _MemberPerfTileState();
}

class _MemberPerfTileState extends State<_MemberPerfTile> {
  bool _expanded = false;

  static Color _scoreColor(int score) => score >= 80
      ? AppColors.ragGreen
      : score >= 60
          ? AppColors.ragAmber
          : AppColors.ragRed;

  static Color _severityColor(String? s) => switch (s?.toLowerCase()) {
    'high'   => AppColors.ragRed,
    'medium' => AppColors.ragAmber,
    _        => AppColors.ragGreen,
  };

  @override
  Widget build(BuildContext context) {
    final ds      = context.ds;
    final m       = widget.member;
    final name    = m['name'] as String? ?? 'Unknown';
    final score   = (m['score'] as num?)?.toInt() ?? 0;
    final stars   = (m['starRating'] as num?)?.toInt() ?? (score / 20).round().clamp(1, 5);
    final summary = m['performanceSummary'] as String?;
    final factors = (m['factors'] as List?) ?? [];
    final issues  = (m['issues'] as List?) ?? [];
    final strengths = (m['strengths'] as List?) ?? [];
    final suggestions = (m['suggestions'] as List?) ?? [];
    final color   = _scoreColor(score);

    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ds.border),
      ),
      child: Column(children: [
        // Header row — always visible
        InkWell(
          onTap: () => setState(() => _expanded = !_expanded),
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(children: [
              // Score ring
              SizedBox(
                width: 44, height: 44,
                child: Stack(alignment: Alignment.center, children: [
                  CircularProgressIndicator(
                    value: score / 100,
                    strokeWidth: 4,
                    backgroundColor: color.withOpacity(0.15),
                    valueColor: AlwaysStoppedAnimation(color),
                  ),
                  Text('$score', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w800, color: color)),
                ]),
              ),
              const SizedBox(width: 10),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(name, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: ds.textPrimary)),
                const SizedBox(height: 2),
                Row(children: List.generate(5, (i) => Icon(
                  i < stars ? Icons.star_rounded : Icons.star_outline_rounded,
                  size: 12,
                  color: i < stars ? AppColors.ragAmber : ds.textMuted,
                ))),
              ])),
              Icon(_expanded ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                  size: 18, color: ds.textMuted),
            ]),
          ),
        ),

        // Expanded detail
        if (_expanded) ...[
          Divider(height: 1, color: ds.border),
          Padding(
            padding: const EdgeInsets.fromLTRB(12, 10, 12, 12),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              if (summary != null) ...[
                Text(summary, style: TextStyle(fontSize: 12, color: ds.textSecondary, height: 1.4)),
                const SizedBox(height: 10),
              ],

              // Factors
              if (factors.isNotEmpty) ...[
                Text('FACTORS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                    color: ds.textMuted, letterSpacing: 1)),
                const SizedBox(height: 6),
                ...factors.map((f) {
                  final fm = f as Map<String, dynamic>;
                  final fs = (fm['score'] as num?)?.toInt() ?? 0;
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 6),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        Expanded(child: Text(fm['name'] as String? ?? '',
                            style: TextStyle(fontSize: 11, color: ds.textSecondary))),
                        Text('$fs%', style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                            color: _scoreColor(fs))),
                      ]),
                      const SizedBox(height: 3),
                      ClipRRect(
                        borderRadius: BorderRadius.circular(4),
                        child: LinearProgressIndicator(
                          value: fs / 100,
                          minHeight: 5,
                          backgroundColor: ds.border,
                          valueColor: AlwaysStoppedAnimation(_scoreColor(fs)),
                        ),
                      ),
                    ]),
                  );
                }),
                const SizedBox(height: 8),
              ],

              // Issues
              if (issues.isNotEmpty) ...[
                Text('ISSUES', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                    color: ds.textMuted, letterSpacing: 1)),
                const SizedBox(height: 6),
                ...issues.map((iss) {
                  final im = iss as Map<String, dynamic>;
                  final sev = im['severity'] as String?;
                  final sc = _severityColor(sev);
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 5),
                    child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Container(
                        margin: const EdgeInsets.only(top: 1),
                        padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                        decoration: BoxDecoration(
                          color: sc.withOpacity(0.12),
                          borderRadius: BorderRadius.circular(4),
                        ),
                        child: Text((sev ?? 'low').toUpperCase(),
                            style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: sc)),
                      ),
                      const SizedBox(width: 6),
                      Expanded(child: Text(im['problem'] as String? ?? '',
                          style: TextStyle(fontSize: 12, color: ds.textPrimary))),
                    ]),
                  );
                }),
                const SizedBox(height: 8),
              ],

              // Strengths
              if (strengths.isNotEmpty) ...[
                Text('STRENGTHS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                    color: ds.textMuted, letterSpacing: 1)),
                const SizedBox(height: 6),
                ...strengths.map((s) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    const Icon(Icons.check_circle_outline_rounded, size: 13, color: AppColors.ragGreen),
                    const SizedBox(width: 6),
                    Expanded(child: Text(s.toString(),
                        style: TextStyle(fontSize: 12, color: ds.textSecondary))),
                  ]),
                )),
                const SizedBox(height: 8),
              ],

              // Suggestions
              if (suggestions.isNotEmpty) ...[
                Text('SUGGESTIONS', style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                    color: ds.textMuted, letterSpacing: 1)),
                const SizedBox(height: 6),
                ...suggestions.asMap().entries.map((e) => Padding(
                  padding: const EdgeInsets.only(bottom: 4),
                  child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Container(
                      width: 16, height: 16,
                      margin: const EdgeInsets.only(top: 1),
                      decoration: BoxDecoration(
                        color: AppColors.primaryLight.withOpacity(0.12),
                        shape: BoxShape.circle,
                      ),
                      child: Center(child: Text('${e.key + 1}',
                          style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w700,
                              color: AppColors.primaryLight))),
                    ),
                    const SizedBox(width: 6),
                    Expanded(child: Text(e.value.toString(),
                        style: TextStyle(fontSize: 12, color: ds.textSecondary))),
                  ]),
                )),
              ],
            ]),
          ),
        ],
      ]),
    );
  }
}

// ── Shared UI pieces ───────────────────────────────────────────────────────────

class _AiCard extends StatelessWidget {
  const _AiCard({required this.icon, required this.title, required this.child, this.subtitle});
  final IconData icon;
  final String title;
  final String? subtitle;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ds.border),
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Row(children: [
            Container(
              width: 32, height: 32,
              decoration: BoxDecoration(
                gradient: const LinearGradient(
                    colors: [Color(0xFF7C3AED), Color(0xFF4F46E5)],
                    begin: Alignment.topLeft, end: Alignment.bottomRight),
                borderRadius: BorderRadius.circular(9),
              ),
              child: Icon(icon, color: Colors.white, size: 16),
            ),
            const SizedBox(width: 10),
            Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Text(title, style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: ds.textPrimary)),
              if (subtitle != null)
                Text(subtitle!, style: TextStyle(fontSize: 11, color: ds.textMuted)),
            ]),
          ]),
        ),
        Divider(height: 1, color: ds.border),
        Padding(padding: const EdgeInsets.all(14), child: child),
      ]),
    ).animate().fadeIn(duration: 350.ms).slideY(begin: 0.04);
  }
}

class _AiLoading extends StatelessWidget {
  const _AiLoading({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 24),
    child: Column(mainAxisSize: MainAxisSize.min, children: [
      const SizedBox(
        width: 32, height: 32,
        child: CircularProgressIndicator(
          strokeWidth: 3,
          valueColor: AlwaysStoppedAnimation(Color(0xFF7C3AED)),
        ),
      ),
      const SizedBox(height: 10),
      Text('AI is thinking…',
          style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: context.ds.textPrimary)),
      const SizedBox(height: 2),
      Text(label, style: TextStyle(fontSize: 11, color: context.ds.textMuted)),
    ]),
  );
}

class _AiEmpty extends StatelessWidget {
  const _AiEmpty({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 16),
    child: Center(
      child: Text(label,
          style: TextStyle(fontSize: 13, color: context.ds.textMuted), textAlign: TextAlign.center),
    ),
  );
}

class _AiError extends StatelessWidget {
  const _AiError({required this.message});
  final String message;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.symmetric(vertical: 8),
    child: Text('Error: $message', style: const TextStyle(color: AppColors.error, fontSize: 12)),
  );
}
