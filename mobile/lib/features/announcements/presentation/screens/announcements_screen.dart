/// Announcements screen — company-wide announcements with read tracking.
/// API: ${AppConstants.basePeople}/announcements
library;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:timeago/timeago.dart' as timeago;

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/models/models.dart';
import '../../../../shared/widgets/ds_metric_card.dart';
import '../../../../shared/widgets/user_avatar.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final announcementsProvider =
    FutureProvider.autoDispose<List<Announcement>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/announcements',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final data = raw['data'];
  final List<dynamic> list = data is List
      ? data
      : (data is Map
          ? (data['announcements'] as List<dynamic>? ?? [])
          : []);
  return list
      .map((e) => Announcement.fromJson(e as Map<String, dynamic>))
      .toList();
});

// ── Screen ────────────────────────────────────────────────────────────────────

class AnnouncementsScreen extends ConsumerWidget {
  const AnnouncementsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds            = context.ds;
    final announcements = ref.watch(announcementsProvider);

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Announcements'),
        backgroundColor: ds.bgPage,
        actions: [
          announcements.when(
            data: (list) {
              final unread = list.where((a) => !a.isRead).length;
              if (unread == 0) return const SizedBox.shrink();
              return Padding(
                padding: const EdgeInsets.only(right: 16),
                child: Center(
                  child: Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: AppColors.primary,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Text('$unread unread',
                        style: const TextStyle(
                            color: Colors.white,
                            fontSize: 11,
                            fontWeight: FontWeight.w700)),
                  ),
                ),
              );
            },
            loading: () => const SizedBox.shrink(),
            error:   (_, __) => const SizedBox.shrink(),
          ),
        ],
      ),
      body: RefreshIndicator(
        onRefresh: () async => ref.invalidate(announcementsProvider),
        color: AppColors.primaryLight,
        child: announcements.when(
          data: (list) {
            if (list.isEmpty) {
              return Center(
                child: Column(mainAxisSize: MainAxisSize.min, children: [
                  Icon(Icons.campaign_rounded, size: 64, color: ds.textMuted),
                  const SizedBox(height: 12),
                  Text('No announcements yet',
                      style: TextStyle(color: ds.textMuted, fontSize: 15)),
                  const SizedBox(height: 4),
                  Text('Check back later for company updates',
                      style: TextStyle(color: ds.textMuted, fontSize: 12)),
                ]),
              );
            }
            return ListView.builder(
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 80),
              itemCount: list.length,
              itemBuilder: (_, i) => _AnnouncementCard(
                list[i],
                onRead: () => _markRead(ref, list[i].id),
              ),
            );
          },
          loading: () => ListView(
            children: List.generate(4, (_) => const ShimmerCard()),
          ),
          error: (e, _) => Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
              Icon(Icons.error_outline_rounded,
                  size: 48, color: AppColors.error),
              const SizedBox(height: 12),
              Text('Failed to load announcements',
                  style: TextStyle(color: ds.textPrimary,
                      fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              OutlinedButton.icon(
                onPressed: () => ref.invalidate(announcementsProvider),
                icon: const Icon(Icons.refresh_rounded),
                label: const Text('Retry'),
              ),
            ]),
          ),
        ),
      ),
    );
  }

  Future<void> _markRead(WidgetRef ref, String id) async {
    try {
      await ApiClient.instance.patch(
        '${AppConstants.basePeople}/announcements/$id/read',
        data: {},
      );
      ref.invalidate(announcementsProvider);
    } catch (_) {}
  }
}

// ── Announcement card ─────────────────────────────────────────────────────────

class _AnnouncementCard extends ConsumerStatefulWidget {
  const _AnnouncementCard(this.announcement, {required this.onRead});
  final Announcement announcement;
  final VoidCallback onRead;

  @override
  ConsumerState<_AnnouncementCard> createState() => _AnnouncementCardState();
}

class _AnnouncementCardState extends ConsumerState<_AnnouncementCard> {
  bool _expanded = false;

  @override
  Widget build(BuildContext context) {
    final ds     = context.ds;
    final ann    = widget.announcement;
    final isNew  = !ann.isRead;

    DateTime? createdAt;
    try {
      createdAt = DateTime.parse(ann.createdAt);
    } catch (_) {}
    final timeLabel = createdAt != null
        ? timeago.format(createdAt)
        : ann.createdAt.length >= 10
            ? ann.createdAt.substring(0, 10)
            : ann.createdAt;

    return GestureDetector(
      onTap: () {
        setState(() => _expanded = !_expanded);
        if (isNew) widget.onRead();
      },
      child: AnimatedContainer(
        duration: 250.ms,
        margin: const EdgeInsets.only(bottom: 12),
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(16),
          border: Border.all(
            color: isNew
                ? AppColors.primaryLight.withOpacity(0.4)
                : ds.border,
            width: isNew ? 1.5 : 1,
          ),
          boxShadow: isNew
              ? [
                  BoxShadow(
                    color: AppColors.primary.withOpacity(0.08),
                    blurRadius: 12,
                    offset: const Offset(0, 4),
                  )
                ]
              : null,
        ),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              // ── Header ────────────────────────────────────────────
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Unread dot
                  if (isNew)
                    Container(
                      width: 8, height: 8,
                      margin: const EdgeInsets.only(top: 5, right: 8),
                      decoration: const BoxDecoration(
                          color: AppColors.primaryLight, shape: BoxShape.circle),
                    ),

                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // Priority + pinned chips
                        if (ann.isPinned || ann.priority == 'CRITICAL' || ann.priority == 'HIGH')
                          Padding(
                            padding: const EdgeInsets.only(bottom: 4),
                            child: Wrap(spacing: 6, children: [
                              if (ann.isPinned)
                                _TypeChip(label: '📌 Pinned', color: AppColors.info),
                              if (ann.priority == 'CRITICAL')
                                _TypeChip(label: '🔴 Critical', color: AppColors.error),
                              if (ann.priority == 'HIGH')
                                _TypeChip(label: '🟠 High', color: AppColors.warning),
                            ]),
                          ),
                        Text(
                          ann.title,
                          style: TextStyle(
                            fontSize: 15,
                            fontWeight: isNew ? FontWeight.w800 : FontWeight.w600,
                            color: ds.textPrimary,
                          ),
                        ),
                      ],
                    ),
                  ),

                  // Expand indicator
                  Icon(
                    _expanded ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded,
                    size: 20, color: ds.textMuted,
                  ),
                ],
              ),

              const SizedBox(height: 8),

              // ── Content (collapsed: 3 lines, expanded: full) ───────
              AnimatedCrossFade(
                duration: 250.ms,
                crossFadeState: _expanded
                    ? CrossFadeState.showSecond
                    : CrossFadeState.showFirst,
                firstChild: Text(
                  ann.content,
                  maxLines: 3,
                  overflow: TextOverflow.ellipsis,
                  style: TextStyle(
                      fontSize: 13,
                      color: ds.textSecondary,
                      height: 1.5),
                ),
                secondChild: Text(
                  ann.content,
                  style: TextStyle(
                      fontSize: 13,
                      color: ds.textSecondary,
                      height: 1.6),
                ),
              ),

              const SizedBox(height: 10),

              // ── Footer ────────────────────────────────────────────
              Row(
                children: [
                  if (ann.authorName != null) ...[
                    UserAvatar(
                        name: ann.authorName!, radius: 10),
                    const SizedBox(width: 6),
                    Text(ann.authorName!,
                        style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w600,
                            color: ds.textSecondary)),
                    Container(
                      width: 3,
                      height: 3,
                      margin:
                          const EdgeInsets.symmetric(horizontal: 6),
                      decoration: BoxDecoration(
                          color: ds.textMuted, shape: BoxShape.circle),
                    ),
                  ],
                  Text(timeLabel,
                      style: TextStyle(
                          fontSize: 11, color: ds.textMuted)),
                  const Spacer(),
                  Row(mainAxisSize: MainAxisSize.min, children: [
                    if (ann.type == 'ROLE_TARGETED')
                      _TypeChip(label: 'Role', color: AppColors.info),
                    if (ann.type == 'USER_TARGETED')
                      _TypeChip(label: 'Direct', color: AppColors.primary),
                    if (ann.isRead) ...[
                      const SizedBox(width: 6),
                      const Icon(Icons.done_all_rounded, size: 12, color: AppColors.ragGreen),
                      const SizedBox(width: 3),
                      const Text('Read', style: TextStyle(fontSize: 10, color: AppColors.ragGreen, fontWeight: FontWeight.w600)),
                    ],
                  ]),
                ],
              ),
            ],
          ),
        ),
      ),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.05);
  }
}

// ── Type chip ─────────────────────────────────────────────────────────────────

class _TypeChip extends StatelessWidget {
  const _TypeChip({required this.label, required this.color});
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(4),
      ),
      child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
    );
  }
}
