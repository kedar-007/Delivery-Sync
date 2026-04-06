import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/ds_metric_card.dart';

// ─────────────────────────────────────────────────────────────────────────────
//  Providers
// ─────────────────────────────────────────────────────────────────────────────

final myBadgesProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseBadge}/my-badges',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['badges'] as List? ?? d['earned'] as List? ?? [];
  return [];
});

final allBadgesProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseBadge}/badges',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['badges'] as List? ?? [];
  return [];
});

final leaderboardProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseBadge}/leaderboard',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['leaderboard'] as List? ?? d['users'] as List? ?? [];
  return [];
});

// ─────────────────────────────────────────────────────────────────────────────
//  Screen
// ─────────────────────────────────────────────────────────────────────────────

class BadgesScreen extends ConsumerStatefulWidget {
  const BadgesScreen({super.key});

  @override
  ConsumerState<BadgesScreen> createState() => _BadgesScreenState();
}

class _BadgesScreenState extends ConsumerState<BadgesScreen>
    with SingleTickerProviderStateMixin {
  late final _tabCtrl = TabController(length: 3, vsync: this);

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: Row(children: [
          Container(
            width: 28, height: 28,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                  colors: [Color(0xFFF59E0B), Color(0xFFEF4444)]),
              borderRadius: BorderRadius.circular(8),
            ),
            child: const Icon(Icons.emoji_events_rounded, color: Colors.white, size: 16),
          ),
          const SizedBox(width: 10),
          const Text('Badges & Achievements', style: TextStyle(fontWeight: FontWeight.w700)),
        ]),
        backgroundColor: ds.bgPage,
        surfaceTintColor: Colors.transparent,
        bottom: TabBar(
          controller: _tabCtrl,
          tabs: const [
            Tab(text: 'My Badges'),
            Tab(text: 'All Badges'),
            Tab(text: 'Leaderboard'),
          ],
        ),
      ),
      body: TabBarView(
        controller: _tabCtrl,
        children: [
          _MyBadgesTab(),
          _AllBadgesTab(),
          _LeaderboardTab(),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  My Badges tab
// ─────────────────────────────────────────────────────────────────────────────

class _MyBadgesTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(myBadgesProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(myBadgesProvider),
      color: AppColors.primaryLight,
      child: async.when(
        data: (list) => list.isEmpty
            ? _EmptyBadgesState()
            : ListView(
                padding: const EdgeInsets.all(16),
                children: [
                  _StatsRow(count: list.length),
                  const SizedBox(height: 16),
                  GridView.builder(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                      crossAxisCount: 2,
                      mainAxisSpacing: 12,
                      crossAxisSpacing: 12,
                      childAspectRatio: 0.85,
                    ),
                    itemCount: list.length,
                    itemBuilder: (_, i) => _BadgeCard(
                        list[i] as Map<String, dynamic>, earned: true),
                  ),
                ],
              ),
        loading: () => GridView.builder(
          padding: const EdgeInsets.all(16),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.85),
          itemCount: 6,
          itemBuilder: (_, __) => const ShimmerCard(height: 150),
        ),
        error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: AppColors.error))),
      ),
    );
  }
}

class _StatsRow extends StatelessWidget {
  const _StatsRow({required this.count});
  final int count;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        gradient: const LinearGradient(
          colors: [Color(0xFFF59E0B), Color(0xFFEF4444)],
          begin: Alignment.topLeft, end: Alignment.bottomRight,
        ),
        borderRadius: BorderRadius.circular(16),
      ),
      child: Row(children: [
        const Icon(Icons.emoji_events_rounded, color: Colors.white, size: 36),
        const SizedBox(width: 14),
        Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('$count', style: const TextStyle(
              fontSize: 28, fontWeight: FontWeight.w800, color: Colors.white)),
          Text('Badges Earned', style: TextStyle(
              fontSize: 13, color: Colors.white.withOpacity(0.85), fontWeight: FontWeight.w500)),
        ]),
      ]),
    ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.05);
  }
}

class _EmptyBadgesState extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Center(
      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
        Icon(Icons.emoji_events_outlined, size: 64, color: ds.textMuted),
        const SizedBox(height: 16),
        Text('No badges yet!', style: TextStyle(
            fontSize: 18, fontWeight: FontWeight.w700, color: ds.textPrimary)),
        const SizedBox(height: 8),
        Text('Complete tasks, submit standups, and stay\nconsistent to earn your first badge!',
            textAlign: TextAlign.center,
            style: TextStyle(fontSize: 13, color: ds.textMuted, height: 1.5)),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  All Badges tab
// ─────────────────────────────────────────────────────────────────────────────

class _AllBadgesTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final async = ref.watch(allBadgesProvider);
    final myBadges = ref.watch(myBadgesProvider).value ?? [];
    final myBadgeIds = myBadges.map((b) {
      final m = b as Map<String, dynamic>;
      return m['badgeId']?.toString() ?? m['id']?.toString() ?? '';
    }).toSet();

    return async.when(
      data: (list) => list.isEmpty
          ? Center(child: Text('No badges defined',
              style: TextStyle(color: context.ds.textMuted)))
          : GridView.builder(
              padding: const EdgeInsets.all(16),
              gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
                crossAxisCount: 2,
                mainAxisSpacing: 12,
                crossAxisSpacing: 12,
                childAspectRatio: 0.85,
              ),
              itemCount: list.length,
              itemBuilder: (_, i) {
                final badge = list[i] as Map<String, dynamic>;
                final id = badge['id']?.toString() ?? '';
                final earned = myBadgeIds.contains(id);
                return _BadgeCard(badge, earned: earned);
              },
            ),
      loading: () => GridView.builder(
        padding: const EdgeInsets.all(16),
        gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 2, mainAxisSpacing: 12, crossAxisSpacing: 12, childAspectRatio: 0.85),
        itemCount: 6,
        itemBuilder: (_, __) => const ShimmerCard(height: 150),
      ),
      error: (e, _) => Center(child: Text('$e', style: const TextStyle(color: AppColors.error))),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Leaderboard tab
// ─────────────────────────────────────────────────────────────────────────────

class _LeaderboardTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds    = context.ds;
    final async = ref.watch(leaderboardProvider);

    return async.when(
      data: (list) => list.isEmpty
          ? Center(child: Text('No leaderboard data yet',
              style: TextStyle(color: ds.textMuted)))
          : ListView.builder(
              padding: const EdgeInsets.all(16),
              itemCount: list.length,
              itemBuilder: (_, i) {
                final u = list[i] as Map<String, dynamic>;
                final name   = u['name']  as String? ?? '—';
                final points = u['points'] as num?   ?? u['badgeCount'] as num? ?? 0;
                final rank   = i + 1;

                return Container(
                  margin: const EdgeInsets.only(bottom: 8),
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                  decoration: BoxDecoration(
                    color: rank <= 3 ? _podiumColor(rank).withOpacity(0.08) : ds.bgCard,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(
                      color: rank <= 3 ? _podiumColor(rank).withOpacity(0.35) : ds.border,
                    ),
                  ),
                  child: Row(children: [
                    // Rank
                    SizedBox(
                      width: 32,
                      child: rank <= 3
                          ? Text(_medal(rank), style: const TextStyle(fontSize: 20))
                          : Text('#$rank', style: TextStyle(
                              fontSize: 13, fontWeight: FontWeight.w700, color: ds.textMuted)),
                    ),
                    const SizedBox(width: 10),
                    Expanded(child: Text(name,
                        style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600,
                            color: ds.textPrimary))),
                    Container(
                      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
                      decoration: BoxDecoration(
                        color: _podiumColor(rank).withOpacity(0.12),
                        borderRadius: BorderRadius.circular(8),
                      ),
                      child: Row(mainAxisSize: MainAxisSize.min, children: [
                        Icon(Icons.emoji_events_rounded, size: 12, color: _podiumColor(rank)),
                        const SizedBox(width: 4),
                        Text('$points', style: TextStyle(
                            fontSize: 13, fontWeight: FontWeight.w800, color: _podiumColor(rank))),
                      ]),
                    ),
                  ]),
                ).animate().fadeIn(
                    duration: Duration(milliseconds: 200 + i * 50));
              },
            ),
      loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children: List.generate(6, (_) => const ShimmerCard(height: 56))),
      error: (e, _) => Center(child: Text('$e',
          style: const TextStyle(color: AppColors.error))),
    );
  }

  static Color _podiumColor(int rank) => switch (rank) {
    1 => const Color(0xFFFFD700),
    2 => const Color(0xFFC0C0C0),
    3 => const Color(0xFFCD7F32),
    _ => AppColors.primaryLight,
  };

  static String _medal(int rank) => switch (rank) {
    1 => '🥇',
    2 => '🥈',
    _ => '🥉',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Badge card
// ─────────────────────────────────────────────────────────────────────────────

class _BadgeCard extends StatelessWidget {
  const _BadgeCard(this.badge, {required this.earned});
  final Map<String, dynamic> badge;
  final bool earned;

  @override
  Widget build(BuildContext context) {
    final ds         = context.ds;
    final name       = badge['name']        as String? ?? badge['title']    as String? ?? '—';
    final desc       = badge['description'] as String? ?? badge['criteria'] as String? ?? '';
    final iconStr    = badge['icon']        as String?;
    final earnedDate = badge['earnedAt']    as String? ?? badge['createdAt'] as String?;

    final color = earned ? const Color(0xFFF59E0B) : ds.textMuted;

    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: earned ? const Color(0xFFF59E0B).withOpacity(0.08) : ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(
          color: earned ? const Color(0xFFF59E0B).withOpacity(0.35) : ds.border,
          width: earned ? 1.5 : 1,
        ),
      ),
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          // Badge icon
          Container(
            width: 56, height: 56,
            decoration: BoxDecoration(
              shape: BoxShape.circle,
              color: color.withOpacity(0.12),
              border: Border.all(color: color.withOpacity(0.3), width: 2),
            ),
            child: Center(
              child: iconStr != null && iconStr.startsWith('http')
                  ? const Icon(Icons.emoji_events_rounded, color: Color(0xFFF59E0B), size: 28)
                  : Text(
                      iconStr?.isNotEmpty == true ? iconStr! : '🏅',
                      style: const TextStyle(fontSize: 28),
                    ),
            ),
          ),
          const SizedBox(height: 10),
          Text(name,
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w700,
                  color: earned ? ds.textPrimary : ds.textMuted),
              textAlign: TextAlign.center,
              maxLines: 2, overflow: TextOverflow.ellipsis),
          if (desc.isNotEmpty) ...[
            const SizedBox(height: 4),
            Text(desc,
                style: TextStyle(fontSize: 10, color: ds.textMuted, height: 1.3),
                textAlign: TextAlign.center,
                maxLines: 2, overflow: TextOverflow.ellipsis),
          ],
          if (earned && earnedDate != null) ...[
            const SizedBox(height: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
              decoration: BoxDecoration(
                color: const Color(0xFFF59E0B).withOpacity(0.15),
                borderRadius: BorderRadius.circular(6),
              ),
              child: Text(_fmtDate(earnedDate),
                  style: const TextStyle(fontSize: 9, fontWeight: FontWeight.w600,
                      color: Color(0xFFF59E0B))),
            ),
          ] else if (!earned) ...[
            const SizedBox(height: 6),
            Text('Locked', style: TextStyle(
                fontSize: 10, color: ds.textMuted, fontStyle: FontStyle.italic)),
          ],
        ],
      ),
    ).animate().fadeIn(duration: 350.ms).scale(begin: const Offset(0.95, 0.95));
  }

  static String _fmtDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) { return iso; }
  }
}
