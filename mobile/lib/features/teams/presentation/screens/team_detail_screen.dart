/// Team detail screen — members list, lead info, add/remove members.
/// API: GET ${AppConstants.baseCore}/teams/:id
library;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/ds_metric_card.dart';
import '../../../../shared/widgets/user_avatar.dart';

// ── Provider ──────────────────────────────────────────────────────────────────

final _teamDetailProvider =
    FutureProvider.autoDispose.family<Map<String, dynamic>, String>((ref, teamId) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/teams/$teamId',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is Map && d['team'] is Map) return d['team'] as Map<String, dynamic>;
  if (d is Map) return d as Map<String, dynamic>;
  return {};
});

// ── Screen ────────────────────────────────────────────────────────────────────

class TeamDetailScreen extends ConsumerWidget {
  const TeamDetailScreen({super.key, required this.teamId, required this.teamName});
  final String teamId;
  final String teamName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds     = context.ds;
    final detail = ref.watch(_teamDetailProvider(teamId));

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: Text(teamName),
        backgroundColor: ds.bgPage,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded, size: 20),
            onPressed: () => ref.invalidate(_teamDetailProvider(teamId)),
          ),
        ],
      ),
      body: detail.when(
        loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children: List.generate(5, (_) => const ShimmerCard(height: 68)),
        ),
        error: (e, _) => Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            Icon(Icons.error_outline_rounded, size: 48, color: ds.textMuted),
            const SizedBox(height: 12),
            Text('$e',
                style: const TextStyle(color: AppColors.error, fontSize: 12),
                textAlign: TextAlign.center),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () => ref.invalidate(_teamDetailProvider(teamId)),
              child: const Text('Retry'),
            ),
          ]),
        ),
        data: (team) => _TeamDetailBody(
          team: team,
          onRefresh: () => ref.invalidate(_teamDetailProvider(teamId)),
        ),
      ),
    );
  }
}

// ── Body ──────────────────────────────────────────────────────────────────────

class _TeamDetailBody extends StatelessWidget {
  const _TeamDetailBody({required this.team, required this.onRefresh});
  final Map<String, dynamic> team;
  final VoidCallback onRefresh;

  @override
  Widget build(BuildContext context) {
    final ds          = context.ds;
    final name        = team['name']        as String? ?? '—';
    final description = team['description'] as String? ?? '';
    final members     = (team['members'] as List? ?? []).cast<Map<String, dynamic>>();
    final lead        = team['lead'] as Map<String, dynamic>?;
    final leadName    = lead?['name']    as String? ?? team['leadName'] as String?;
    final leadAvatar  = lead?['avatarUrl'] as String?;
    final standupTime = team['standupTime'] as String?;
    final eodTime     = team['eodTime']     as String?;
    final timezone    = team['timezone']    as String?;

    return RefreshIndicator(
      onRefresh: () async => onRefresh(),
      color: AppColors.primaryLight,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
        children: [
          // ── Header card ──────────────────────────────────────────────────
          Container(
            padding: const EdgeInsets.all(20),
            decoration: BoxDecoration(
              color: ds.bgCard,
              borderRadius: BorderRadius.circular(20),
              border: Border.all(color: ds.border),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(0.05),
                  blurRadius: 12, offset: const Offset(0, 4),
                ),
              ],
            ),
            child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
              Row(children: [
                Container(
                  width: 52, height: 52,
                  decoration: BoxDecoration(
                    color: AppColors.primaryLight.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: const Icon(Icons.group_rounded,
                      color: AppColors.primaryLight, size: 26),
                ),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(name, style: TextStyle(
                        fontSize: 18, fontWeight: FontWeight.w800,
                        color: ds.textPrimary, letterSpacing: -0.3)),
                    if (description.isNotEmpty)
                      Text(description, style: TextStyle(
                          fontSize: 13, color: ds.textMuted, height: 1.4)),
                  ]),
                ),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppColors.info.withOpacity(0.12),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text('${members.length}',
                      style: const TextStyle(
                          fontSize: 16, fontWeight: FontWeight.w800,
                          color: AppColors.info)),
                ),
              ]),

              // Lead
              if (leadName != null) ...[
                const SizedBox(height: 16),
                Divider(height: 1, color: ds.border),
                const SizedBox(height: 14),
                Row(children: [
                  UserAvatar(name: leadName, avatarUrl: leadAvatar, radius: 18),
                  const SizedBox(width: 10),
                  Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('Team Lead', style: TextStyle(
                        fontSize: 10, fontWeight: FontWeight.w600,
                        color: ds.textMuted, letterSpacing: 0.8)),
                    Text(leadName, style: TextStyle(
                        fontSize: 14, fontWeight: FontWeight.w700,
                        color: ds.textPrimary)),
                  ]),
                  const Spacer(),
                  Icon(Icons.star_rounded, color: AppColors.ragAmber, size: 18),
                ]),
              ],

              // Schedule chips
              if (standupTime != null || eodTime != null || timezone != null) ...[
                const SizedBox(height: 14),
                Wrap(spacing: 8, runSpacing: 6, children: [
                  if (standupTime != null)
                    _Chip(Icons.record_voice_over_rounded,
                        'Standup: $standupTime', AppColors.primaryLight),
                  if (eodTime != null)
                    _Chip(Icons.wb_sunny_rounded, 'EOD: $eodTime', AppColors.ragAmber),
                  if (timezone != null)
                    _Chip(Icons.schedule_rounded, timezone, ds.textSecondary),
                ]),
              ],
            ]),
          ).animate().fadeIn(duration: 350.ms),

          const SizedBox(height: 20),

          // ── Members header ───────────────────────────────────────────────
          Row(children: [
            Text('MEMBERS', style: TextStyle(
                fontSize: 11, fontWeight: FontWeight.w700,
                color: ds.textMuted, letterSpacing: 1.2)),
            const SizedBox(width: 8),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
              decoration: BoxDecoration(
                color: AppColors.info.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text('${members.length}', style: const TextStyle(
                  fontSize: 11, fontWeight: FontWeight.w700,
                  color: AppColors.info)),
            ),
          ]),
          const SizedBox(height: 10),

          // ── Members list ─────────────────────────────────────────────────
          if (members.isEmpty)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 32),
              decoration: BoxDecoration(
                color: ds.bgCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: ds.border),
              ),
              child: Column(children: [
                Icon(Icons.people_outline_rounded, size: 40, color: ds.textMuted),
                const SizedBox(height: 10),
                Text('No members yet', style: TextStyle(color: ds.textMuted)),
              ]),
            )
          else
            Container(
              decoration: BoxDecoration(
                color: ds.bgCard,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: ds.border),
              ),
              child: Column(
                children: members.asMap().entries.map((entry) {
                  final i = entry.key;
                  final m = entry.value;
                  final mName   = m['name']      as String? ?? '?';
                  final mEmail  = m['email']     as String? ?? '';
                  final mAvatar = m['avatarUrl'] as String?;
                  final mRole   = m['role']      as String? ?? 'MEMBER';
                  final isLast  = i == members.length - 1;

                  return Column(
                    children: [
                      ListTile(
                        contentPadding: const EdgeInsets.symmetric(
                            horizontal: 16, vertical: 6),
                        leading: UserAvatar(
                            name: mName, avatarUrl: mAvatar, radius: 22),
                        title: Text(mName, style: TextStyle(
                            fontSize: 14, fontWeight: FontWeight.w600,
                            color: ds.textPrimary)),
                        subtitle: mEmail.isNotEmpty
                            ? Text(mEmail, style: TextStyle(
                                fontSize: 12, color: ds.textMuted))
                            : null,
                        trailing: _RoleChip(mRole),
                      ),
                      if (!isLast) Divider(
                          height: 1, color: ds.border, indent: 72),
                    ],
                  );
                }).toList(),
              ),
            ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.04),
        ],
      ),
    );
  }
}

// ── Small widgets ─────────────────────────────────────────────────────────────

class _Chip extends StatelessWidget {
  const _Chip(this.icon, this.label, this.color);
  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(
      color: color.withOpacity(0.10),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: color.withOpacity(0.25)),
    ),
    child: Row(mainAxisSize: MainAxisSize.min, children: [
      Icon(icon, size: 12, color: color),
      const SizedBox(width: 5),
      Text(label, style: TextStyle(
          fontSize: 11, fontWeight: FontWeight.w600, color: color)),
    ]),
  );
}

class _RoleChip extends StatelessWidget {
  const _RoleChip(this.role);
  final String role;

  static const _colors = <String, Color>{
    'LEAD':             Color(0xFF3B82F6),
    'TECH_LEAD':        Color(0xFF06B6D4),
    'DEVELOPER':        Color(0xFF10B981),
    'SENIOR_DEVELOPER': Color(0xFF059669),
    'BUSINESS_ANALYST': Color(0xFF8B5CF6),
    'TESTER':           Color(0xFFF97316),
    'DESIGNER':         Color(0xFFEC4899),
    'DEVOPS_ENGINEER':  Color(0xFF6B7280),
    'SCRUM_MASTER':     Color(0xFF6366F1),
    'PRODUCT_OWNER':    Color(0xFF7C3AED),
  };

  static String _label(String r) =>
      r.replaceAll('_', ' ')[0] + r.replaceAll('_', ' ').substring(1).toLowerCase();

  @override
  Widget build(BuildContext context) {
    final color = _colors[role] ?? const Color(0xFF6B7280);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(_label(role), style: TextStyle(
          fontSize: 10, fontWeight: FontWeight.w700, color: color)),
    );
  }
}
