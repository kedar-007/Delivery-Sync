import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/ds_metric_card.dart';
import '../../../../shared/widgets/user_avatar.dart';
import '../../../auth/providers/auth_provider.dart';

num? _parseNum(dynamic v) {
  if (v == null) return null;
  if (v is num) return v;
  return num.tryParse(v.toString());
}

// ── Providers ─────────────────────────────────────────────────────────────────

final _announcementsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/announcements',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['announcements'] as List? ?? [];
  return [];
});

final _leaveRequestsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/leave/requests',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['requests'] as List? ?? [];
  return [];
});

final _teamLeaveRequestsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/leave/requests',
    queryParameters: {'team': 'true'},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['requests'] as List? ?? [];
  return [];
});

final _leaveBalanceProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/leave/balance',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['balances'] as List? ?? [];
  return [];
});

final _peopleProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/auth/users',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  // API returns { data: { users: [...] } } or { data: [...] }
  final data = raw['data'];
  final List<dynamic> list;
  if (data is List) {
    list = data;
  } else if (data is Map) {
    list = (data['users'] as List<dynamic>?)
        ?? (data['members'] as List<dynamic>?)
        ?? [];
  } else {
    list = [];
  }
  return list.cast<Map<String, dynamic>>();
});

// ── Screen ────────────────────────────────────────────────────────────────────

class PeopleScreen extends ConsumerStatefulWidget {
  const PeopleScreen({super.key});

  @override
  ConsumerState<PeopleScreen> createState() => _PeopleScreenState();
}

class _PeopleScreenState extends ConsumerState<PeopleScreen>
    with SingleTickerProviderStateMixin {
  late final _tabCtrl = TabController(length: 4, vsync: this);
  final _search = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _search.addListener(
        () => setState(() => _query = _search.text.trim().toLowerCase()));
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('People'),
        backgroundColor: ds.bgPage,
        bottom: TabBar(
          controller: _tabCtrl,
          isScrollable: true,
          tabs: const [
            Tab(text: 'Directory'),
            Tab(text: 'Announcements'),
            Tab(text: 'Leave'),
            Tab(text: 'Org Chart'),
          ],
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: TextField(
              controller: _search,
              decoration: const InputDecoration(
                hintText: 'Search people…',
                prefixIcon: Icon(Icons.search_rounded),
                contentPadding: EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabCtrl,
              children: [
                _DirectoryTab(query: _query),
                _AnnouncementsTab(),
                _LeaveTab(),
                _OrgChartTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Directory tab ─────────────────────────────────────────────────────────────

class _DirectoryTab extends ConsumerWidget {
  const _DirectoryTab({required this.query});
  final String query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds     = context.ds;
    final people = ref.watch(_peopleProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_peopleProvider),
      color: AppColors.primaryLight,
      child: people.when(
        data: (list) {
          final filtered = query.isEmpty
              ? list
              : list.where((p) {
                  final name  = (p['name']  as String? ?? '').toLowerCase();
                  final email = (p['email'] as String? ?? '').toLowerCase();
                  return name.contains(query) || email.contains(query);
                }).toList();

          if (filtered.isEmpty) {
            return Center(
              child: Text('No results found',
                  style: TextStyle(color: ds.textMuted)),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: filtered.length,
            itemBuilder: (ctx, i) => _PersonTile(filtered[i]),
          );
        },
        loading: () => ListView(
          children: List.generate(6, (_) => const ShimmerCard(height: 72)),
        ),
        error: (e, _) => Center(
          child: Text('$e', style: const TextStyle(color: AppColors.error)),
        ),
      ),
    );
  }
}

class _PersonTile extends ConsumerWidget {
  const _PersonTile(this.person);
  final Map<String, dynamic> person;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds       = context.ds;
    final name     = person['name']      as String? ?? '—';
    final email    = person['email']     as String? ?? '';
    final role        = person['role']        as String? ?? '';
    final orgRoleName = person['orgRoleName'] as String?;
    final avatar   = person['avatarUrl'] as String?
        ?? person['avatar_url'] as String?;
    final userId   = (person['user_id'] ?? person['ROWID'] ?? person['id'] ?? '').toString();
    final authUser = ref.watch(currentUserProvider);
    // AI_TEAM_ANALYSIS = can analyze others; AI_PERFORMANCE alone = self-only via profile page
    final canAnalyzeOthers = authUser?.hasPermission(Permissions.aiTeamAnalysis) ?? false;

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ds.border),
      ),
      child: Column(children: [
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          child: Row(
            children: [
              UserAvatar(name: name, avatarUrl: avatar, radius: 22),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(name,
                        style: TextStyle(
                            fontWeight: FontWeight.w600,
                            fontSize: 14,
                            color: ds.textPrimary)),
                    const SizedBox(height: 2),
                    Text(email,
                        style: TextStyle(fontSize: 12, color: ds.textMuted),
                        overflow: TextOverflow.ellipsis),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              _RoleChip(role, orgRoleName: orgRoleName),
            ],
          ),
        ),
        // Analyze Performance button — only visible to users with AI_PERFORMANCE permission
        if (canAnalyzeOthers)
          InkWell(
            onTap: () => PerformanceSheet.show(
              context,
              userId: userId,
              name: name,
              avatarUrl: avatar,
            ),
            borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
            child: Container(
              width: double.infinity,
              padding: const EdgeInsets.symmetric(vertical: 8),
              decoration: BoxDecoration(
                color: const Color(0xFF7C3AED).withOpacity(0.06),
                borderRadius: const BorderRadius.vertical(bottom: Radius.circular(12)),
                border: Border(top: BorderSide(color: ds.border)),
              ),
              child: const Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                Icon(Icons.auto_awesome_rounded, size: 13, color: Color(0xFF7C3AED)),
                SizedBox(width: 5),
                Text('Analyse Performance',
                    style: TextStyle(
                        fontSize: 12, fontWeight: FontWeight.w600,
                        color: Color(0xFF7C3AED))),
              ]),
            ),
          ),
      ]),
    );
  }
}

// ── Performance analysis bottom sheet ─────────────────────────────────────────

class PerformanceSheet extends ConsumerStatefulWidget {
  const PerformanceSheet({
    super.key,
    required this.userId,
    required this.name,
    this.avatarUrl,
  });
  final String userId;
  final String name;
  final String? avatarUrl;

  static void show(BuildContext context, {
    required String userId,
    required String name,
    String? avatarUrl,
  }) {
    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ProviderScope(
        child: PerformanceSheet(userId: userId, name: name, avatarUrl: avatarUrl),
      ),
    );
  }

  @override
  ConsumerState<PerformanceSheet> createState() => _PerformanceSheetState();
}

class _PerformanceSheetState extends ConsumerState<PerformanceSheet> {
  late Future<Map<String, dynamic>> _future;

  @override
  void initState() {
    super.initState();
    _future = _fetchPerformance();
  }

  Future<Map<String, dynamic>> _fetchPerformance() async {
    final raw = await ApiClient.instance.post<Map<String, dynamic>>(
      '${AppConstants.baseAI}/holistic-performance',
      data: {'targetUserId': widget.userId, 'days': 30},
      fromJson: (r) => r as Map<String, dynamic>,
    );
    final d = raw['data'];
    if (d is! Map<String, dynamic>) return {};
    // Holistic-performance returns {members:[{...}], teamSummary, ...}
    // Extract the single member's data when targeting a specific user
    final members = d['members'];
    if (members is List && members.isNotEmpty) {
      final m = members.first;
      if (m is Map<String, dynamic>) return m;
    }
    return d;
  }

  static Color _scoreColor(int score) => score >= 80
      ? AppColors.ragGreen
      : score >= 60 ? AppColors.ragAmber : AppColors.ragRed;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return DraggableScrollableSheet(
      initialChildSize: 0.92,
      maxChildSize: 0.95,
      minChildSize: 0.4,
      builder: (_, ctrl) => Container(
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
        ),
        child: Column(children: [
          // Drag handle
          Center(
            child: Container(
              margin: const EdgeInsets.only(top: 12, bottom: 8),
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: ds.border,
                borderRadius: BorderRadius.circular(2),
              ),
            ),
          ),

          // Header with avatar + sparkles badge
          Padding(
            padding: const EdgeInsets.fromLTRB(20, 4, 20, 12),
            child: Row(children: [
              Stack(children: [
                UserAvatar(name: widget.name, avatarUrl: widget.avatarUrl, radius: 24),
                Positioned(
                  bottom: 0, right: 0,
                  child: Container(
                    width: 18, height: 18,
                    decoration: const BoxDecoration(
                      gradient: LinearGradient(
                        colors: [Color(0xFF7C3AED), Color(0xFF4F46E5)],
                        begin: Alignment.topLeft, end: Alignment.bottomRight,
                      ),
                      shape: BoxShape.circle,
                    ),
                    child: const Icon(Icons.auto_awesome_rounded,
                        size: 10, color: Colors.white),
                  ),
                ),
              ]),
              const SizedBox(width: 12),
              Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Text(widget.name,
                    style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700, color: ds.textPrimary)),
                Text('AI Performance Analysis',
                    style: TextStyle(fontSize: 12, color: ds.textMuted)),
              ])),
            ]),
          ),

          Divider(height: 1, color: ds.border),

          // Content
          Expanded(
            child: FutureBuilder<Map<String, dynamic>>(
              future: _future,
              builder: (_, snap) {
                if (snap.connectionState == ConnectionState.waiting) {
                  return const Center(child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      CircularProgressIndicator(
                        valueColor: AlwaysStoppedAnimation(Color(0xFF7C3AED)),
                      ),
                      SizedBox(height: 12),
                      Text('Analysing performance…', style: TextStyle(color: Colors.grey)),
                    ],
                  ));
                }
                if (snap.hasError) {
                  return Center(child: Text('Error: ${snap.error}',
                      style: const TextStyle(color: AppColors.error)));
                }
                final d = snap.data ?? {};
                if (d.isEmpty) {
                  return const Center(child: Text('No performance data available',
                      style: TextStyle(color: Colors.grey)));
                }
                return _PerfContent(data: d, scoreColor: _scoreColor, scrollCtrl: ctrl);
              },
            ),
          ),
        ]),
      ),
    );
  }
}

class _PerfContent extends StatelessWidget {
  const _PerfContent({required this.data, required this.scoreColor, this.scrollCtrl});
  final Map<String, dynamic> data;
  final Color Function(int) scoreColor;
  final ScrollController? scrollCtrl;

  static Color _severityColor(String? s) => switch (s?.toLowerCase()) {
    'high'   => AppColors.ragRed,
    'medium' => AppColors.ragAmber,
    _        => AppColors.ragGreen,
  };

  @override
  Widget build(BuildContext context) {
    final ds          = context.ds;
    final score       = _parseNum(data['score'])?.toInt() ?? 0;
    final stars       = _parseNum(data['starRating'])?.toInt() ?? (score / 20).round().clamp(1, 5);
    final summary     = data['performanceSummary'] as String?;
    final factors     = (data['factors'] as List?) ?? [];
    final issues      = (data['issues'] as List?) ?? [];
    final strengths   = (data['strengths'] as List?) ?? [];
    final suggestions = (data['suggestions'] as List?) ?? [];
    final areasOfImprovement = (data['areasOfImprovement'] as List?) ?? [];
    final color       = scoreColor(score);

    return ListView(
      controller: scrollCtrl,
      padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
      children: [
        // Score ring + stars
        Center(
          child: Column(children: [
            SizedBox(
              width: 80, height: 80,
              child: Stack(alignment: Alignment.center, children: [
                CircularProgressIndicator(
                  value: score / 100,
                  strokeWidth: 6,
                  backgroundColor: color.withOpacity(0.15),
                  valueColor: AlwaysStoppedAnimation(color),
                ),
                Column(mainAxisSize: MainAxisSize.min, children: [
                  Text('$score', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800, color: color)),
                  Text('/100', style: TextStyle(fontSize: 9, color: ds.textMuted)),
                ]),
              ]),
            ),
            const SizedBox(height: 8),
            Row(mainAxisSize: MainAxisSize.min, children: List.generate(5, (i) => Icon(
              i < stars ? Icons.star_rounded : Icons.star_outline_rounded,
              size: 20,
              color: i < stars ? AppColors.ragAmber : ds.textMuted,
            ))),
            const SizedBox(height: 4),
            Text('$stars / 5 stars', style: TextStyle(fontSize: 12, color: ds.textMuted)),
          ]),
        ).animate().fadeIn(duration: 400.ms).scale(begin: const Offset(0.9, 0.9)),

        const SizedBox(height: 16),

        if (summary != null) ...[
          Text(summary, style: TextStyle(fontSize: 13, color: ds.textPrimary, height: 1.5),
              textAlign: TextAlign.center),
          const SizedBox(height: 16),
        ],

        // Factors
        if (factors.isNotEmpty) ...[
          _SectionLabel('PERFORMANCE FACTORS'),
          const SizedBox(height: 8),
          ...factors.map((f) {
            final fm = f as Map<String, dynamic>;
            final fs = _parseNum(fm['score'])?.toInt() ?? 0;
            final fc = scoreColor(fs);
            return Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Expanded(child: Text(fm['name'] as String? ?? '',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: ds.textPrimary))),
                  Text('$fs%', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: fc)),
                ]),
                const SizedBox(height: 4),
                ClipRRect(
                  borderRadius: BorderRadius.circular(4),
                  child: LinearProgressIndicator(
                    value: fs / 100, minHeight: 6,
                    backgroundColor: ds.border,
                    valueColor: AlwaysStoppedAnimation(fc),
                  ),
                ),
                if (fm['detail'] != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 2),
                    child: Text(fm['detail'] as String,
                        style: TextStyle(fontSize: 10, color: ds.textMuted)),
                  ),
              ]),
            );
          }),
          const SizedBox(height: 8),
        ],

        // Issues
        if (issues.isNotEmpty) ...[
          _SectionLabel('ISSUES'),
          const SizedBox(height: 8),
          ...issues.map((iss) {
            final im  = iss as Map<String, dynamic>;
            final sev = im['severity'] as String?;
            final sc  = _severityColor(sev);
            return Container(
              margin: const EdgeInsets.only(bottom: 6),
              padding: const EdgeInsets.all(10),
              decoration: BoxDecoration(
                color: sc.withOpacity(0.07),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: sc.withOpacity(0.2)),
              ),
              child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                Row(children: [
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
                    decoration: BoxDecoration(
                      color: sc.withOpacity(0.15),
                      borderRadius: BorderRadius.circular(4),
                    ),
                    child: Text((sev ?? 'low').toUpperCase(),
                        style: TextStyle(fontSize: 9, fontWeight: FontWeight.w700, color: sc)),
                  ),
                  const SizedBox(width: 6),
                  Expanded(child: Text(im['problem'] as String? ?? '',
                      style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: ds.textPrimary))),
                ]),
                if (im['evidence'] != null) ...[
                  const SizedBox(height: 4),
                  Text(im['evidence'] as String,
                      style: TextStyle(fontSize: 11, color: ds.textSecondary)),
                ],
              ]),
            );
          }),
          const SizedBox(height: 8),
        ],

        // Strengths
        if (strengths.isNotEmpty) ...[
          _SectionLabel('STRENGTHS'),
          const SizedBox(height: 8),
          ...strengths.map((s) => Padding(
            padding: const EdgeInsets.only(bottom: 5),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.check_circle_outline_rounded, size: 14, color: AppColors.ragGreen),
              const SizedBox(width: 6),
              Expanded(child: Text(s.toString(),
                  style: TextStyle(fontSize: 12, color: ds.textPrimary))),
            ]),
          )),
          const SizedBox(height: 8),
        ],

        // Areas of improvement
        if (areasOfImprovement.isNotEmpty) ...[
          _SectionLabel('AREAS FOR IMPROVEMENT'),
          const SizedBox(height: 8),
          ...areasOfImprovement.map((a) => Padding(
            padding: const EdgeInsets.only(bottom: 5),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Icon(Icons.trending_up_rounded, size: 14, color: AppColors.ragAmber),
              const SizedBox(width: 6),
              Expanded(child: Text(a.toString(),
                  style: TextStyle(fontSize: 12, color: ds.textPrimary))),
            ]),
          )),
          const SizedBox(height: 8),
        ],

        // Suggestions
        if (suggestions.isNotEmpty) ...[
          _SectionLabel('SUGGESTIONS'),
          const SizedBox(height: 8),
          ...suggestions.asMap().entries.map((e) => Padding(
            padding: const EdgeInsets.only(bottom: 6),
            child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Container(
                width: 18, height: 18,
                decoration: const BoxDecoration(
                  color: Color(0x1F7C3AED),
                  shape: BoxShape.circle,
                ),
                child: Center(child: Text('${e.key + 1}',
                    style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                        color: Color(0xFF7C3AED)))),
              ),
              const SizedBox(width: 8),
              Expanded(child: Text(e.value.toString(),
                  style: TextStyle(fontSize: 12, color: ds.textSecondary))),
            ]),
          )),
        ],
      ],
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.text);
  final String text;

  @override
  Widget build(BuildContext context) => Text(text,
      style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
          color: context.ds.textMuted, letterSpacing: 1));
}

class _RoleChip extends StatelessWidget {
  const _RoleChip(this.role, {this.orgRoleName});
  final String role;
  final String? orgRoleName;

  @override
  Widget build(BuildContext context) {
    // Prefer the human-readable org role name if available
    if (orgRoleName != null && orgRoleName!.isNotEmpty) {
      return Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(
          color: AppColors.primaryLight.withOpacity(0.12),
          borderRadius: BorderRadius.circular(6),
          border: Border.all(color: AppColors.primaryLight.withOpacity(0.3)),
        ),
        child: Text(orgRoleName!,
            style: const TextStyle(
                fontSize: 10, fontWeight: FontWeight.w700,
                color: AppColors.primaryLight)),
      );
    }
    final (color, label) = switch (role) {
      'TENANT_ADMIN'  => (AppColors.primaryLight, 'Admin'),
      'DELIVERY_LEAD' => (AppColors.info,         'Lead'),
      'PMO'           => (AppColors.warning,      'PMO'),
      'EXEC'          => (AppColors.accent,       'Exec'),
      'CLIENT'        => (AppColors.success,      'Client'),
      _               => (AppColors.textMuted,    'Member'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 10, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

// ── Announcements tab ─────────────────────────────────────────────────────────

class _AnnouncementsTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds    = context.ds;
    final async = ref.watch(_announcementsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_announcementsProvider),
      color: AppColors.primaryLight,
      child: async.when(
        data: (list) => list.isEmpty
            ? Center(child: Text('No announcements yet', style: TextStyle(color: ds.textMuted)))
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final a = list[i] as Map<String, dynamic>;
                  final title   = a['title'] as String? ?? '—';
                  final content = a['content'] as String? ?? '';
                  final author  = a['authorName'] as String?;
                  final date    = a['createdAt'] as String? ?? '';
                  final isRead  = a['isRead'] as bool? ?? false;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: ds.bgCard,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: isRead ? ds.border : AppColors.primaryLight.withOpacity(0.4),
                        width: isRead ? 1 : 1.5,
                      ),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        if (!isRead)
                          Container(
                            width: 7, height: 7,
                            margin: const EdgeInsets.only(right: 8),
                            decoration: const BoxDecoration(
                              color: AppColors.primaryLight,
                              shape: BoxShape.circle,
                            ),
                          ),
                        Expanded(child: Text(title,
                            style: TextStyle(fontWeight: FontWeight.w700,
                                fontSize: 14, color: ds.textPrimary))),
                      ]),
                      const SizedBox(height: 6),
                      Text(content,
                          style: TextStyle(fontSize: 13, color: ds.textSecondary, height: 1.4),
                          maxLines: 3, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 8),
                      Row(children: [
                        if (author != null) ...[
                          Icon(Icons.person_rounded, size: 12, color: ds.textMuted),
                          const SizedBox(width: 4),
                          Text(author, style: TextStyle(fontSize: 11, color: ds.textMuted)),
                          const SizedBox(width: 10),
                        ],
                        if (date.isNotEmpty)
                          Text(_fmtDate(date), style: TextStyle(fontSize: 11, color: ds.textMuted)),
                      ]),
                    ]),
                  );
                },
              ),
        loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children: List.generate(4, (_) => const ShimmerCard(height: 90)),
        ),
        error: (e, _) => Center(
          child: Text('$e', style: const TextStyle(color: AppColors.error)),
        ),
      ),
    );
  }

  static String _fmtDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) { return iso; }
  }
}

// ── Org Chart tab ─────────────────────────────────────────────────────────────

class _OrgChartTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 72, height: 72,
            decoration: BoxDecoration(
              color: AppColors.primaryLight.withOpacity(0.12),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Icon(Icons.account_tree_rounded,
                color: AppColors.primaryLight, size: 36),
          ),
          const SizedBox(height: 16),
          Text('Organisation Chart',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: ds.textPrimary)),
          const SizedBox(height: 8),
          Text('View the full team hierarchy', style: TextStyle(color: ds.textMuted)),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            icon: const Icon(Icons.account_tree_rounded, size: 18),
            label: const Text('Open Org Chart'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryLight,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () => context.push('/people/org-chart'),
          ),
        ],
      ),
    );
  }
}

// ── Leave tab ─────────────────────────────────────────────────────────────────

class _LeaveTab extends ConsumerStatefulWidget {
  @override
  ConsumerState<_LeaveTab> createState() => _LeaveTabState();
}

class _LeaveTabState extends ConsumerState<_LeaveTab> {
  bool _showTeam = false;

  @override
  Widget build(BuildContext context) {
    final ds         = context.ds;
    final balance    = ref.watch(_leaveBalanceProvider);
    final requests   = ref.watch(_leaveRequestsProvider);
    final user       = ref.watch(currentUserProvider);
    final canApprove = user?.hasPermission(Permissions.leaveApprove) == true
        || user?.hasPermission(Permissions.leaveAdmin) == true
        || UserRole.isAdmin(user?.role ?? '');

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(_leaveBalanceProvider);
        ref.invalidate(_leaveRequestsProvider);
        if (canApprove) ref.invalidate(_teamLeaveRequestsProvider);
      },
      color: AppColors.primaryLight,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Balance
          Text('LEAVE BALANCE',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                  color: ds.textMuted, letterSpacing: 1.2)),
          const SizedBox(height: 10),
          balance.when(
            data: (list) {
              final types = list.isEmpty
                  ? [('Annual', '—', AppColors.success),
                     ('Sick',   '—', AppColors.warning),
                     ('Casual', '—', AppColors.info)]
                  : _LeaveTabState._extractBalances(list);
              return Row(
                children: types.asMap().entries.map((e) {
                  final isLast = e.key == types.length - 1;
                  return Expanded(child: Padding(
                    padding: EdgeInsets.only(right: isLast ? 0 : 10),
                    child: _BalanceTile(e.value.$1, e.value.$2, e.value.$3),
                  ));
                }).toList(),
              );
            },
            loading: () => const ShimmerCard(height: 80),
            error: (_, __) => Row(children: [
              Expanded(child: _BalanceTile('Annual', '—', AppColors.success)),
              const SizedBox(width: 10),
              Expanded(child: _BalanceTile('Sick', '—', AppColors.warning)),
              const SizedBox(width: 10),
              Expanded(child: _BalanceTile('Casual', '—', AppColors.info)),
            ]),
          ),
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Apply for Leave'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryLight,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () => _showLeaveForm(context, ref, balance.valueOrNull ?? []),
            ),
          ),
          const SizedBox(height: 16),

          // Toggle — My Requests | Team Requests (only if manager)
          if (canApprove) ...[
            Container(
              decoration: BoxDecoration(
                color: ds.bgElevated,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: ds.border),
              ),
              child: Row(children: [
                Expanded(child: _ToggleBtn(
                  label: 'My Requests',
                  icon: Icons.person_rounded,
                  selected: !_showTeam,
                  onTap: () => setState(() => _showTeam = false),
                )),
                Container(width: 1, height: 36, color: ds.border),
                Expanded(child: _ToggleBtn(
                  label: 'Team Requests',
                  icon: Icons.group_rounded,
                  selected: _showTeam,
                  onTap: () => setState(() => _showTeam = true),
                  badge: ref.watch(_teamLeaveRequestsProvider).valueOrNull
                      ?.where((r) => (r as Map<String, dynamic>?)?['status'] == 'PENDING')
                      .length,
                )),
              ]),
            ),
            const SizedBox(height: 14),
          ] else
            const SizedBox(height: 8),

          // Content — My Requests
          if (!_showTeam || !canApprove) ...[
            requests.when(
              data: (list) => list.isEmpty
                  ? Container(
                      padding: const EdgeInsets.all(20),
                      decoration: BoxDecoration(
                        color: ds.bgCard,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: ds.border),
                      ),
                      child: Center(child: Text('No leave requests yet',
                          style: TextStyle(color: ds.textMuted))),
                    )
                  : Column(
                      children: list.map((r) => _LeaveRequestTile(r as Map<String, dynamic>)).toList(),
                    ),
              loading: () => const ShimmerCard(height: 80),
              error: (e, _) => Text('$e', style: const TextStyle(color: AppColors.error)),
            ),
          ],

          // Content — Team Requests
          if (_showTeam && canApprove)
            const _TeamLeaveSection(),
        ],
      ),
    );
  }

  static List<(String, String, Color)> _extractBalances(List<dynamic> list) {
    const colors = [AppColors.success, AppColors.warning, AppColors.info, AppColors.accent];
    return list.asMap().entries.map((e) {
      final b  = e.value as Map<String, dynamic>;
      final lt = b['leave_type'] is Map ? b['leave_type'] as Map<String, dynamic> : <String, dynamic>{};
      final name = lt['name'] as String? ?? b['leave_type_name'] as String? ?? b['leaveTypeName'] as String? ?? b['type'] as String? ?? 'Leave ${e.key + 1}';
      final rawRemaining = b['remaining_days'] ?? b['remaining'] ?? b['balance'] ?? b['remainingDays'] ?? b['days_remaining'] ?? b['available_days'];
      String remaining;
      if (rawRemaining != null) {
        remaining = rawRemaining is num ? rawRemaining.toInt().toString() : '$rawRemaining';
      } else {
        final total = (b['total_allocated'] as num?)?.toInt() ?? (b['total'] as num?)?.toInt() ?? (b['allocated_days'] as num?)?.toInt() ?? (lt['total_days'] as num?)?.toInt();
        final used  = (b['used_days'] as num?)?.toInt() ?? (b['used'] as num?)?.toInt() ?? (b['taken'] as num?)?.toInt() ?? (b['taken_days'] as num?)?.toInt();
        if (total != null && used != null) remaining = '${total - used}';
        else if (total != null) remaining = '$total';
        else remaining = '—';
      }
      return (name, remaining, colors[e.key % colors.length]);
    }).toList();
  }

  static void _showLeaveForm(BuildContext context, WidgetRef ref, List<dynamic> balanceList) {
    final formKey = GlobalKey<FormState>();
    final reason  = TextEditingController();
    DateTime? from;
    DateTime? to;
    String?   leaveTypeId;
    final leaveTypes = balanceList.map((b) {
      final m  = b as Map<String, dynamic>;
      final lt = m['leave_type'] as Map<String, dynamic>? ?? {};
      final id   = (lt['ROWID'] ?? lt['id'] ?? '').toString();
      final name = lt['name'] as String? ?? m['leave_type_name'] as String? ?? 'Leave';
      return (id, name);
    }).where((t) => t.$1.isNotEmpty).toList();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.ds.bgCard,
      shape: const RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(builder: (ctx, setState) {
        return SingleChildScrollView(
          padding: EdgeInsets.only(left: 20, right: 20, top: 20, bottom: MediaQuery.of(ctx).viewInsets.bottom + 24),
          child: Form(
            key: formKey,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Apply for Leave', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              if (leaveTypes.isNotEmpty) ...[
                DropdownButtonFormField<String>(
                  value: leaveTypeId,
                  decoration: const InputDecoration(labelText: 'Leave Type'),
                  items: leaveTypes.map((t) => DropdownMenuItem(value: t.$1, child: Text(t.$2))).toList(),
                  onChanged: (v) => setState(() => leaveTypeId = v),
                  validator: (v) => v == null ? 'Select a leave type' : null,
                ),
                const SizedBox(height: 12),
              ],
              Row(children: [
                Expanded(child: _DatePicker(label: 'From Date', value: from, onPick: (d) => setState(() => from = d))),
                const SizedBox(width: 12),
                Expanded(child: _DatePicker(label: 'To Date', value: to, onPick: (d) => setState(() => to = d))),
              ]),
              const SizedBox(height: 12),
              TextFormField(
                controller: reason,
                decoration: const InputDecoration(labelText: 'Reason'),
                maxLines: 2,
                validator: (v) => v?.isEmpty == true ? 'Required' : null,
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryLight, foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () async {
                    if (!formKey.currentState!.validate() || from == null || to == null) {
                      ScaffoldMessenger.of(ctx).showSnackBar(const SnackBar(content: Text('Please fill all fields')));
                      return;
                    }
                    try {
                      await ApiClient.instance.post(
                        '${AppConstants.basePeople}/leave/requests',
                        data: {
                          if (leaveTypeId != null) 'leave_type_id': leaveTypeId,
                          'start_date': from!.toIso8601String().substring(0, 10),
                          'end_date':   to!.toIso8601String().substring(0, 10),
                          'reason':     reason.text,
                        },
                      );
                      ref.invalidate(_leaveRequestsProvider);
                      ref.invalidate(_leaveBalanceProvider);
                      if (ctx.mounted) {
                        Navigator.pop(ctx);
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(content: Text('Leave request submitted!'), backgroundColor: AppColors.success),
                        );
                      }
                    } catch (e) {
                      if (ctx.mounted) ScaffoldMessenger.of(ctx).showSnackBar(
                        SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
                      );
                    }
                  },
                  child: const Text('Submit', style: TextStyle(fontWeight: FontWeight.w600)),
                ),
              ),
            ]),
          ),
        );
      }),
    );
  }
}

// ── Toggle button ─────────────────────────────────────────────────────────────

class _ToggleBtn extends StatelessWidget {
  const _ToggleBtn({required this.label, required this.icon, required this.selected, required this.onTap, this.badge});
  final String label;
  final IconData icon;
  final bool selected;
  final VoidCallback onTap;
  final int? badge;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return GestureDetector(
      onTap: onTap,
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(vertical: 10),
        decoration: BoxDecoration(
          color: selected ? AppColors.primary : Colors.transparent,
          borderRadius: BorderRadius.circular(11),
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          Icon(icon, size: 14, color: selected ? Colors.white : ds.textMuted),
          const SizedBox(width: 6),
          Text(label,
              style: TextStyle(
                fontSize: 13,
                fontWeight: FontWeight.w700,
                color: selected ? Colors.white : ds.textMuted,
              )),
          if (badge != null && badge! > 0) ...[
            const SizedBox(width: 5),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 5, vertical: 1),
              decoration: BoxDecoration(
                color: selected ? Colors.white.withOpacity(0.25) : AppColors.ragAmber.withOpacity(0.2),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Text('$badge',
                  style: TextStyle(
                    fontSize: 10, fontWeight: FontWeight.w800,
                    color: selected ? Colors.white : AppColors.ragAmber,
                  )),
            ),
          ],
        ]),
      ),
    );
  }
}

// ── Team Leave Section ────────────────────────────────────────────────────────

class _TeamLeaveSection extends ConsumerStatefulWidget {
  const _TeamLeaveSection();
  @override
  ConsumerState<_TeamLeaveSection> createState() => _TeamLeaveSectionState();
}

class _TeamLeaveSectionState extends ConsumerState<_TeamLeaveSection> {
  String _filter = 'PENDING';

  static const _filters = ['ALL', 'PENDING', 'APPROVED', 'REJECTED'];

  Future<void> _approve(String id) async {
    try {
      await ApiClient.instance.patch(
        '${AppConstants.basePeople}/leave/requests/$id/approve',
        data: {},
      );
      ref.invalidate(_teamLeaveRequestsProvider);
      ref.invalidate(_leaveBalanceProvider);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Leave approved'), backgroundColor: AppColors.success),
        );
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
        );
      }
    }
  }

  Future<void> _showRejectDialog(String id) async {
    final ctrl = TextEditingController();
    final ds   = context.ds;
    final ok   = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: ds.bgCard,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
        title: Text('Reject Leave', style: TextStyle(fontWeight: FontWeight.w800, color: ds.textPrimary)),
        content: Column(mainAxisSize: MainAxisSize.min, children: [
          Text('Provide a reason for rejection.', style: TextStyle(fontSize: 13, color: ds.textSecondary)),
          const SizedBox(height: 12),
          TextField(
            controller: ctrl,
            autofocus: true,
            maxLines: 3,
            textCapitalization: TextCapitalization.sentences,
            decoration: InputDecoration(
              hintText: 'Rejection reason (required)',
              hintStyle: TextStyle(color: ds.textMuted),
              border: OutlineInputBorder(borderRadius: BorderRadius.circular(10)),
            ),
          ),
        ]),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx, false), child: Text('Cancel', style: TextStyle(color: ds.textMuted))),
          ElevatedButton(
            style: ElevatedButton.styleFrom(backgroundColor: AppColors.ragRed, foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8))),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Reject'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    final notes = ctrl.text.trim();
    if (notes.isEmpty) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Rejection reason required.'), backgroundColor: AppColors.error),
      );
      return;
    }
    try {
      await ApiClient.instance.patch(
        '${AppConstants.basePeople}/leave/requests/$id/reject',
        data: {'notes': notes},
      );
      ref.invalidate(_teamLeaveRequestsProvider);
      ref.invalidate(_leaveBalanceProvider);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Leave rejected'), backgroundColor: AppColors.ragAmber),
      );
    } catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final teamData = ref.watch(_teamLeaveRequestsProvider);

    return Column(crossAxisAlignment: CrossAxisAlignment.start, children: [

      // Filter chips
      SizedBox(
        height: 36,
        child: ListView.separated(
          scrollDirection: Axis.horizontal,
          itemCount: _filters.length,
          separatorBuilder: (_, __) => const SizedBox(width: 8),
          itemBuilder: (_, i) {
            final f = _filters[i];
            final selected = _filter == f;
            final count = teamData.valueOrNull == null ? null
                : f == 'ALL' ? teamData.valueOrNull!.length
                : teamData.valueOrNull!.where((r) {
                    final m = r as Map<String, dynamic>;
                    return (m['status'] as String? ?? '') == f;
                  }).length;
            return FilterChip(
              label: Text(
                '${f[0]}${f.substring(1).toLowerCase()}${count != null && count > 0 ? ' ($count)' : ''}',
                style: TextStyle(
                  fontSize: 11,
                  fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  color: selected ? Colors.white : ds.textSecondary,
                ),
              ),
              selected: selected,
              onSelected: (_) => setState(() => _filter = f),
              selectedColor: AppColors.primary,
              backgroundColor: ds.bgCard,
              checkmarkColor: Colors.white,
              side: BorderSide(color: selected ? AppColors.primary : ds.border),
              padding: const EdgeInsets.symmetric(horizontal: 4),
              visualDensity: VisualDensity.compact,
            );
          },
        ),
      ),
      const SizedBox(height: 10),

      teamData.when(
        data: (all) {
          final list = _filter == 'ALL'
              ? all
              : all.where((r) {
                  final m = r as Map<String, dynamic>;
                  return (m['status'] as String? ?? '') == _filter;
                }).toList();

          if (list.isEmpty) {
            return Container(
              padding: const EdgeInsets.all(20),
              decoration: BoxDecoration(
                color: ds.bgCard,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: ds.border),
              ),
              child: Center(child: Text(
                _filter == 'ALL' ? 'No team leave requests' : 'No ${_filter.toLowerCase()} requests',
                style: TextStyle(color: ds.textMuted),
              )),
            );
          }

          return Column(
            children: list.map((r) {
              final m = r as Map<String, dynamic>;
              final id     = (m['ROWID'] ?? m['id'] ?? '').toString();
              final status = m['status'] as String? ?? 'PENDING';
              return _TeamLeaveCard(
                data: m,
                onApprove: status == 'PENDING' ? () => _approve(id) : null,
                onReject:  status == 'PENDING' ? () => _showRejectDialog(id) : null,
              );
            }).toList(),
          );
        },
        loading: () => Column(
          children: List.generate(2, (_) => const ShimmerCard(height: 90)),
        ),
        error: (e, _) => Text('$e', style: const TextStyle(color: AppColors.error)),
      ),
    ]);
  }
}

class _TeamLeaveCard extends StatelessWidget {
  const _TeamLeaveCard({required this.data, this.onApprove, this.onReject});
  final Map<String, dynamic> data;
  final VoidCallback? onApprove;
  final VoidCallback? onReject;

  @override
  Widget build(BuildContext context) {
    final ds     = context.ds;
    final name   = data['user_name']  as String? ?? data['employeeName'] as String? ?? '—';
    final avatar = data['user_avatar_url'] as String? ?? data['avatarUrl'] as String?;
    final status = data['status']     as String? ?? 'PENDING';
    final from   = data['start_date'] as String? ?? '—';
    final to     = data['end_date']   as String? ?? '—';
    final reason = data['reason']     as String?;
    final leaveType = data['leave_type_name'] as String?
        ?? (data['leave_type'] is Map ? (data['leave_type'] as Map)['name'] as String? : null)
        ?? data['leave_type'] as String? ?? '';

    final (statusColor, statusLabel) = switch (status) {
      'APPROVED'  => (AppColors.ragGreen,  'Approved'),
      'REJECTED'  => (AppColors.ragRed,    'Rejected'),
      'CANCELLED' => (AppColors.textMuted, 'Cancelled'),
      _           => (AppColors.ragAmber,  'Pending'),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: statusColor.withOpacity(0.3)),
      ),
      child: Row(children: [
        Container(
          width: 4,
          constraints: const BoxConstraints(minHeight: 80),
          decoration: BoxDecoration(
            color: statusColor,
            borderRadius: const BorderRadius.horizontal(left: Radius.circular(13)),
          ),
        ),
        Expanded(child: Padding(
          padding: const EdgeInsets.all(12),
          child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
            Row(children: [
              UserAvatar(name: name, avatarUrl: avatar, radius: 16, border: false),
              const SizedBox(width: 8),
              Expanded(child: Text(name,
                  style: TextStyle(fontWeight: FontWeight.w700, fontSize: 13, color: ds.textPrimary))),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                decoration: BoxDecoration(
                  color: statusColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(6),
                ),
                child: Text(statusLabel,
                    style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor)),
              ),
            ]),
            const SizedBox(height: 6),
            Row(children: [
              if (leaveType.isNotEmpty) ...[
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: AppColors.primary.withOpacity(0.1),
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(leaveType,
                      style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                          color: AppColors.primaryLight)),
                ),
                const SizedBox(width: 8),
              ],
              Icon(Icons.date_range_rounded, size: 11, color: ds.textMuted),
              const SizedBox(width: 4),
              Text('${_fmtDate(from)} – ${_fmtDate(to)}',
                  style: TextStyle(fontSize: 11, color: ds.textSecondary)),
            ]),
            if (reason != null && reason.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(reason, style: TextStyle(fontSize: 11, color: ds.textMuted),
                  maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
            if (onApprove != null || onReject != null) ...[
              const SizedBox(height: 8),
              Row(children: [
                if (onReject != null)
                  Expanded(child: OutlinedButton.icon(
                    icon: const Icon(Icons.close_rounded, size: 13),
                    label: const Text('Reject', style: TextStyle(fontSize: 12)),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.ragRed,
                      side: BorderSide(color: AppColors.ragRed.withOpacity(0.4)),
                      padding: const EdgeInsets.symmetric(vertical: 7),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    onPressed: onReject,
                  )),
                if (onApprove != null && onReject != null) const SizedBox(width: 8),
                if (onApprove != null)
                  Expanded(child: ElevatedButton.icon(
                    icon: const Icon(Icons.check_rounded, size: 13),
                    label: const Text('Approve', style: TextStyle(fontSize: 12)),
                    style: ElevatedButton.styleFrom(
                      backgroundColor: AppColors.ragGreen,
                      foregroundColor: Colors.white,
                      padding: const EdgeInsets.symmetric(vertical: 7),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
                    ),
                    onPressed: onApprove,
                  )),
              ]),
            ],
          ]),
        )),
      ]),
    );
  }

  static String _fmtDate(String s) {
    if (s == '—') return s;
    try { return DateFormat('d MMM').format(DateTime.parse(s)); } catch (_) { return s; }
  }
}

class _BalanceTile extends StatelessWidget {
  const _BalanceTile(this.type, this.days, this.color);
  final String type;
  final String days;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Column(children: [
        Text(days, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
        const SizedBox(height: 3),
        Text(type, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: ds.textSecondary)),
      ]),
    );
  }
}

class _LeaveRequestTile extends StatelessWidget {
  const _LeaveRequestTile(this.request);
  final Map<String, dynamic> request;

  @override
  Widget build(BuildContext context) {
    final ds     = context.ds;
    final from   = request['start_date'] as String? ?? request['fromDate']  as String? ?? '—';
    final to     = request['end_date']   as String? ?? request['toDate']    as String? ?? '—';
    final status = request['status']   as String? ?? 'PENDING';
    final reason = request['reason']   as String?;
    final (color, label) = switch (status) {
      'APPROVED' => (AppColors.success,  'Approved'),
      'REJECTED' => (AppColors.ragRed,   'Rejected'),
      _          => (AppColors.ragAmber, 'Pending'),
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ds.border),
      ),
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${_fmtDate(from)} → ${_fmtDate(to)}', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: ds.textPrimary)),
          if (reason != null)
            Text(reason, style: TextStyle(fontSize: 12, color: ds.textMuted), maxLines: 1, overflow: TextOverflow.ellipsis),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: color.withOpacity(0.12),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
        ),
      ]),
    );
  }

  static String _fmtDate(String s) {
    if (s == '—') return s;
    try {
      return DateFormat('d MMM yyyy').format(DateTime.parse(s));
    } catch (_) { return s; }
  }
}

class _DatePicker extends StatelessWidget {
  const _DatePicker({required this.label, required this.value, required this.onPick});
  final String label;
  final DateTime? value;
  final ValueChanged<DateTime> onPick;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return GestureDetector(
      onTap: () async {
        final d = await showDatePicker(
          context: context,
          initialDate: value ?? DateTime.now(),
          firstDate: DateTime.now().subtract(const Duration(days: 7)),
          lastDate: DateTime.now().add(const Duration(days: 365)),
        );
        if (d != null) onPick(d);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: ds.border),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: TextStyle(fontSize: 11, color: ds.textMuted)),
          const SizedBox(height: 3),
          Text(
            value == null ? 'Pick date' : '${value!.day}/${value!.month}/${value!.year}',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
                color: value == null ? ds.textMuted : ds.textPrimary),
          ),
        ]),
      ),
    );
  }
}
