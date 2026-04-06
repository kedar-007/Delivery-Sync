import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/user_avatar.dart';

// ─────────────────────────────────────────────────────────────────────────────
//  Provider
// ─────────────────────────────────────────────────────────────────────────────

final orgHierarchyProvider = FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/org/hierarchy',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];

  // API returns flat list — build tree client-side via reporting_manager_id
  List<dynamic> flatList = [];
  if (d is List) {
    flatList = d;
  } else if (d is Map) {
    final items = d['employees'] ?? d['users'] ?? d['data'];
    if (items is List) flatList = items;
    else if (d['id'] != null || d['user_id'] != null) return Map<String, dynamic>.from(d);
  }

  if (flatList.isEmpty) return {};

  // Build id → mutable node map
  final Map<String, Map<String, dynamic>> byId = {};
  for (final item in flatList) {
    final m = Map<String, dynamic>.from(item as Map);
    final id = (m['user_id'] ?? m['id'] ?? '').toString();
    if (id.isNotEmpty) {
      m['children'] = <Map<String, dynamic>>[];
      // Normalise field names
      m['name']      ??= m['fullName'] ?? m['userName'] ?? '—';
      m['role']      ??= m['designation'] ?? m['jobTitle'] ?? '';
      m['avatarUrl'] ??= m['avatar_url'] ?? m['photoUrl'];
      byId[id] = m;
    }
  }

  // Attach children to parents
  final Set<String> childIds = {};
  for (final node in byId.values) {
    final managerId = (node['reporting_manager_id'] ?? node['managerId'] ?? '').toString();
    if (managerId.isNotEmpty && byId.containsKey(managerId)) {
      (byId[managerId]!['children'] as List).add(node);
      childIds.add((node['user_id'] ?? node['id'] ?? '').toString());
    }
  }

  // Roots = nodes with no parent in dataset
  final roots = byId.values
      .where((n) => !childIds.contains((n['user_id'] ?? n['id'] ?? '').toString()))
      .toList();

  if (roots.isEmpty) return {};
  if (roots.length == 1) return roots.first;
  return {'name': 'Organisation', 'role': '', 'email': null, 'avatarUrl': null, 'children': roots};
});

// ─────────────────────────────────────────────────────────────────────────────
//  Screen
// ─────────────────────────────────────────────────────────────────────────────

class OrgChartScreen extends ConsumerWidget {
  const OrgChartScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds = context.ds;
    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Org Chart'),
        backgroundColor: ds.bgPage,
        surfaceTintColor: Colors.transparent,
        actions: [
          IconButton(
            icon: const Icon(Icons.refresh_rounded),
            onPressed: () => ref.invalidate(orgHierarchyProvider),
          ),
        ],
      ),
      body: Column(
        children: [
          // Hint bar
          Container(
            width: double.infinity,
            color: const Color(0xFFF3F4F6),
            padding: const EdgeInsets.symmetric(vertical: 6),
            child: const Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Icon(Icons.pinch_rounded, size: 13, color: Color(0xFF9CA3AF)),
                SizedBox(width: 6),
                Text('Pinch to zoom · drag to pan · tap node to collapse',
                    style: TextStyle(fontSize: 11, color: Color(0xFF9CA3AF))),
              ],
            ),
          ),
          Expanded(child: _OrgBody()),
        ],
      ),
    );
  }
}

class _OrgBody extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds    = context.ds;
    final async = ref.watch(orgHierarchyProvider);
    return async.when(
        data: (root) => root.isEmpty
            ? Center(
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.account_tree_rounded, size: 52, color: ds.textMuted),
                  const SizedBox(height: 12),
                  Text('Org chart not available', style: TextStyle(color: ds.textMuted)),
                  const SizedBox(height: 8),
                  Text('Set up manager relationships in admin settings',
                      textAlign: TextAlign.center,
                      style: TextStyle(fontSize: 13, color: ds.textMuted)),
                ]),
              )
            : LayoutBuilder(
                builder: (ctx, constraints) => InteractiveViewer(
                  constrained: false,
                  boundaryMargin: const EdgeInsets.all(48),
                  minScale: 0.3,
                  maxScale: 2.0,
                  child: Container(
                    constraints: BoxConstraints(
                      minWidth: constraints.maxWidth,
                      minHeight: constraints.maxHeight,
                    ),
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.center,
                      children: [
                        _OrgTree(node: root, depth: 0),
                      ],
                    ),
                  ),
                ),
              ),
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => Center(
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.account_tree_rounded, size: 52, color: ds.textMuted),
              const SizedBox(height: 12),
              Text('Could not load org chart',
                  style: TextStyle(color: ds.textMuted, fontWeight: FontWeight.w600)),
              const SizedBox(height: 8),
              Text('$e', style: const TextStyle(color: AppColors.error, fontSize: 12),
                  textAlign: TextAlign.center),
            ]),
          ),
        ),
      );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Tree widget — recursively renders nodes
// ─────────────────────────────────────────────────────────────────────────────

class _OrgTree extends StatefulWidget {
  const _OrgTree({required this.node, required this.depth});
  final Map<String, dynamic> node;
  final int depth;

  @override
  State<_OrgTree> createState() => _OrgTreeState();
}

class _OrgTreeState extends State<_OrgTree> {
  bool _expanded = true;

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final name     = widget.node['name'] as String? ?? '—';
    final role     = widget.node['role'] as String? ?? widget.node['jobTitle'] as String? ?? '';
    final email    = widget.node['email'] as String?;
    final avatarUrl = widget.node['avatarUrl'] as String?;
    final children  = widget.node['children'] as List? ?? widget.node['reports'] as List? ?? [];
    final hasChildren = children.isNotEmpty;
    final isRoot     = widget.depth == 0;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        // Node card
        GestureDetector(
          onTap: hasChildren ? () => setState(() => _expanded = !_expanded) : null,
          child: Container(
            width: isRoot ? 200 : 180,
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(
              color: isRoot
                  ? AppColors.primary.withOpacity(0.1)
                  : ds.bgCard,
              borderRadius: BorderRadius.circular(14),
              border: Border.all(
                color: isRoot
                    ? AppColors.primaryLight.withOpacity(0.5)
                    : ds.border,
                width: isRoot ? 2 : 1,
              ),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withOpacity(
                      Theme.of(context).brightness == Brightness.dark ? 0.2 : 0.05),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            child: Column(children: [
              UserAvatar(
                name: name,
                avatarUrl: avatarUrl,
                radius: isRoot ? 24 : 20,
                border: true,
              ),
              const SizedBox(height: 8),
              Text(
                name,
                style: TextStyle(
                  fontSize: isRoot ? 13 : 12,
                  fontWeight: FontWeight.w700,
                  color: ds.textPrimary,
                ),
                textAlign: TextAlign.center,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
              ),
              if (role.isNotEmpty) ...[
                const SizedBox(height: 3),
                Text(
                  _roleLabel(role),
                  style: TextStyle(fontSize: 10, color: AppColors.primaryLight,
                      fontWeight: FontWeight.w600),
                  textAlign: TextAlign.center,
                ),
              ],
              if (email != null) ...[
                const SizedBox(height: 2),
                Text(email,
                    style: TextStyle(fontSize: 9, color: ds.textMuted),
                    textAlign: TextAlign.center,
                    maxLines: 1, overflow: TextOverflow.ellipsis),
              ],
              if (hasChildren) ...[
                const SizedBox(height: 6),
                Row(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(
                    _expanded ? Icons.keyboard_arrow_up_rounded : Icons.keyboard_arrow_down_rounded,
                    size: 16, color: ds.textMuted,
                  ),
                  Text('${children.length}',
                      style: TextStyle(fontSize: 10, color: ds.textMuted,
                          fontWeight: FontWeight.w600)),
                ]),
              ],
            ]),
          ),
        ).animate().fadeIn(duration: 300.ms).scale(begin: const Offset(0.95, 0.95)),

        // Connector + children
        if (hasChildren && _expanded) ...[
          // Vertical connector down from this node
          Container(width: 2, height: 20, color: ds.border),
          // Horizontal bar connecting children
          if (children.length > 1)
            IntrinsicWidth(
              child: Column(children: [
                Container(
                  height: 2,
                  decoration: BoxDecoration(
                    color: ds.border,
                    borderRadius: BorderRadius.circular(1),
                  ),
                ),
                const SizedBox(height: 0),
              ]),
            ),
          // Children row
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            children: children.asMap().entries.map((e) {
              final child = e.value as Map<String, dynamic>;
              final isFirst = e.key == 0;
              final isLast  = e.key == children.length - 1;
              return Padding(
                padding: EdgeInsets.only(
                  left: isFirst ? 0 : 8,
                  right: isLast ? 0 : 8,
                ),
                child: Column(children: [
                  // Small vertical connector to each child
                  Container(width: 2, height: 16, color: ds.border),
                  _OrgTree(node: child, depth: widget.depth + 1),
                ]),
              );
            }).toList(),
          ),
        ],
      ],
    );
  }

  static String _roleLabel(String role) => switch (role) {
    'TENANT_ADMIN'  => 'Admin',
    'DELIVERY_LEAD' => 'Delivery Lead',
    'PMO'           => 'PMO',
    'EXEC'          => 'Executive',
    'CLIENT'        => 'Client',
    'TEAM_MEMBER'   => 'Team Member',
    _               => role,
  };
}
