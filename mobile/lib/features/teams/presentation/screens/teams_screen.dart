import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/ds_metric_card.dart';
import '../../../../shared/widgets/user_avatar.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final teamsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/teams',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['teams'] as List? ?? d['data'] as List? ?? [];
  return [];
});

// ── Screen ────────────────────────────────────────────────────────────────────

class TeamsScreen extends ConsumerStatefulWidget {
  const TeamsScreen({super.key});

  @override
  ConsumerState<TeamsScreen> createState() => _TeamsScreenState();
}

class _TeamsScreenState extends ConsumerState<TeamsScreen> {
  String _search = '';

  @override
  Widget build(BuildContext context) {
    final ds    = context.ds;
    final teams = ref.watch(teamsProvider);

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Teams'),
        backgroundColor: ds.bgPage,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(teamsProvider),
          ),
        ],
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 8, 16, 0),
            child: TextField(
              decoration: const InputDecoration(
                hintText: 'Search teams…',
                prefixIcon: Icon(Icons.search_rounded),
                contentPadding: EdgeInsets.symmetric(vertical: 12),
              ),
              onChanged: (v) => setState(() => _search = v.trim().toLowerCase()),
            ),
          ),
          Expanded(
            child: RefreshIndicator(
              onRefresh: () async => ref.invalidate(teamsProvider),
              color: AppColors.primaryLight,
              child: teams.when(
                data: (list) {
                  final filtered = _search.isEmpty
                      ? list
                      : list.where((t) {
                          final m = t as Map<String, dynamic>;
                          return (m['name'] as String? ?? '').toLowerCase().contains(_search) ||
                              (m['description'] as String? ?? '').toLowerCase().contains(_search);
                        }).toList();

                  if (filtered.isEmpty) {
                    return Center(
                      child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                        Icon(Icons.group_rounded, size: 52, color: ds.textMuted),
                        const SizedBox(height: 12),
                        Text('No teams found', style: TextStyle(color: ds.textMuted)),
                      ]),
                    );
                  }

                  return ListView.builder(
                    padding: const EdgeInsets.all(16),
                    itemCount: filtered.length,
                    itemBuilder: (_, i) => _TeamCard(filtered[i] as Map<String, dynamic>),
                  );
                },
                loading: () => ListView(
                  padding: const EdgeInsets.all(16),
                  children: List.generate(4, (_) => const ShimmerCard(height: 110)),
                ),
                error: (e, _) => Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                      Icon(Icons.error_outline_rounded, size: 48, color: ds.textMuted),
                      const SizedBox(height: 12),
                      Text('$e',
                          style: const TextStyle(color: AppColors.error, fontSize: 12),
                          textAlign: TextAlign.center),
                      const SizedBox(height: 16),
                      ElevatedButton(
                        onPressed: () => ref.invalidate(teamsProvider),
                        child: const Text('Retry'),
                      ),
                    ]),
                  ),
                ),
              ),
            ),
          ),
        ],
      ),
      floatingActionButton: FloatingActionButton.extended(
        backgroundColor: AppColors.primaryLight,
        foregroundColor: Colors.white,
        icon: const Icon(Icons.group_add_rounded),
        label: const Text('New Team'),
        onPressed: () => _showCreateTeam(context, ref),
      ),
    );
  }

  void _showCreateTeam(BuildContext context, WidgetRef ref) {
    final nameCtrl = TextEditingController();
    final descCtrl = TextEditingController();
    final formKey  = GlobalKey<FormState>();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.ds.bgCard,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(
          left: 20, right: 20, top: 20,
          bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
        ),
        child: Form(
          key: formKey,
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            const Text('Create Team',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 16),
            TextFormField(
              controller: nameCtrl,
              decoration: const InputDecoration(labelText: 'Team Name *'),
              validator: (v) => v?.isEmpty == true ? 'Required' : null,
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: descCtrl,
              decoration: const InputDecoration(labelText: 'Description'),
              maxLines: 2,
            ),
            const SizedBox(height: 20),
            SizedBox(
              width: double.infinity,
              child: ElevatedButton(
                style: ElevatedButton.styleFrom(
                  backgroundColor: AppColors.primaryLight,
                  foregroundColor: Colors.white,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                  shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                ),
                onPressed: () async {
                  if (!formKey.currentState!.validate()) return;
                  try {
                    await ApiClient.instance.post(
                      '${AppConstants.baseCore}/teams',
                      data: {
                        'name':        nameCtrl.text.trim(),
                        'description': descCtrl.text.trim(),
                      },
                    );
                    ref.invalidate(teamsProvider);
                    if (ctx.mounted) {
                      Navigator.pop(ctx);
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        const SnackBar(content: Text('Team created!'),
                            backgroundColor: AppColors.success),
                      );
                    }
                  } catch (e) {
                    if (ctx.mounted) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                        SnackBar(content: Text('Failed: $e'),
                            backgroundColor: AppColors.error),
                      );
                    }
                  }
                },
                child: const Text('Create Team', style: TextStyle(fontWeight: FontWeight.w600)),
              ),
            ),
          ]),
        ),
      ),
    );
  }
}

// ── Team card ─────────────────────────────────────────────────────────────────

class _TeamCard extends StatelessWidget {
  const _TeamCard(this.team);
  final Map<String, dynamic> team;

  @override
  Widget build(BuildContext context) {
    final ds          = context.ds;
    final name        = team['name']        as String? ?? '—';
    final description = team['description'] as String?;
    final members     = team['members']     as List? ?? [];
    final leadName    = team['leadName']    as String?
        ?? (team['lead'] as Map?)?['name']  as String?;

    return Container(
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ds.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(
                Theme.of(context).brightness == Brightness.dark ? 0.2 : 0.04),
            blurRadius: 8, offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
        // Header row
        Row(children: [
          Container(
            width: 42, height: 42,
            decoration: BoxDecoration(
              color: AppColors.primaryLight.withOpacity(0.12),
              borderRadius: BorderRadius.circular(12),
            ),
            child: const Icon(Icons.group_rounded,
                color: AppColors.primaryLight, size: 22),
          ),
          const SizedBox(width: 12),
          Expanded(child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(name, style: TextStyle(
                  fontSize: 15, fontWeight: FontWeight.w700, color: ds.textPrimary)),
              if (description != null && description.isNotEmpty)
                Text(description,
                    style: TextStyle(fontSize: 12, color: ds.textMuted),
                    maxLines: 1, overflow: TextOverflow.ellipsis),
            ],
          )),
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
            decoration: BoxDecoration(
              color: AppColors.info.withOpacity(0.12),
              borderRadius: BorderRadius.circular(6),
            ),
            child: Text('${members.length} members',
                style: const TextStyle(
                    fontSize: 10, fontWeight: FontWeight.w700, color: AppColors.info)),
          ),
        ]),

        // Member avatars
        if (members.isNotEmpty) ...[
          const SizedBox(height: 12),
          Row(children: [
            // Stack of first 5 avatars
            SizedBox(
              height: 28,
              width: (members.length.clamp(1, 5) * 20 + 8).toDouble(),
              child: Stack(
                children: members.take(5).toList().asMap().entries.map((e) {
                  final m    = e.value as Map<String, dynamic>;
                  final mName = m['name'] as String? ?? m['fullName'] as String? ?? '?';
                  final mUrl  = m['avatarUrl'] as String? ?? m['avatar_url'] as String?;
                  return Positioned(
                    left: e.key * 20.0,
                    child: UserAvatar(name: mName, avatarUrl: mUrl, radius: 14, border: true),
                  );
                }).toList(),
              ),
            ),
            if (members.length > 5)
              Text(' +${members.length - 5} more',
                  style: TextStyle(fontSize: 11, color: ds.textMuted)),
          ]),
        ],

        // Lead
        if (leadName != null) ...[
          const SizedBox(height: 8),
          Row(children: [
            Icon(Icons.star_rounded, size: 13, color: AppColors.ragAmber),
            const SizedBox(width: 4),
            Text('Lead: $leadName',
                style: TextStyle(fontSize: 11, color: ds.textSecondary, fontWeight: FontWeight.w500)),
          ]),
        ],
      ]),
    ).animate().fadeIn(duration: 300.ms).slideY(begin: 0.04);
  }
}
