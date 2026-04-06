import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/user_avatar.dart';

// ─────────────────────────────────────────────────────────────────────────────
//  Provider (unchanged)
// ─────────────────────────────────────────────────────────────────────────────

final orgHierarchyProvider =
    FutureProvider.autoDispose<Map<String, dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/org/hierarchy',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];

  List<dynamic> flatList = [];
  if (d is List) {
    flatList = d;
  } else if (d is Map) {
    final items = d['employees'] ?? d['users'] ?? d['data'];
    if (items is List)
      flatList = items;
    else if (d['id'] != null || d['user_id'] != null)
      return Map<String, dynamic>.from(d);
  }

  if (flatList.isEmpty) return {};

  final Map<String, Map<String, dynamic>> byId = {};
  for (final item in flatList) {
    final m  = Map<String, dynamic>.from(item as Map);
    final id = (m['user_id'] ?? m['id'] ?? '').toString();
    if (id.isNotEmpty) {
      m['children']  = <Map<String, dynamic>>[];
      m['name']      ??= m['fullName'] ?? m['userName'] ?? '—';
      m['role']      ??= m['designation'] ?? m['jobTitle'] ?? '';
      m['avatarUrl'] ??= m['avatar_url'] ?? m['photoUrl'];
      byId[id] = m;
    }
  }

  final Set<String> childIds = {};
  for (final node in byId.values) {
    final managerId =
        (node['reporting_manager_id'] ?? node['managerId'] ?? '').toString();
    if (managerId.isNotEmpty && byId.containsKey(managerId)) {
      (byId[managerId]!['children'] as List).add(node);
      childIds.add((node['user_id'] ?? node['id'] ?? '').toString());
    }
  }

  final roots = byId.values
      .where((n) =>
          !childIds.contains((n['user_id'] ?? n['id'] ?? '').toString()))
      .toList();

  if (roots.isEmpty) return {};
  if (roots.length == 1) return roots.first;
  return {
    'name': 'Organisation',
    'role': '',
    'email': null,
    'avatarUrl': null,
    'children': roots,
  };
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
      extendBodyBehindAppBar: true,
      appBar: AppBar(
        title: const Text('Org Chart'),
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        surfaceTintColor: Colors.transparent,
        flexibleSpace: ClipRect(
          child: Container(
            decoration: BoxDecoration(
              gradient: LinearGradient(
                colors: [
                  ds.bgPage.withOpacity(0.95),
                  ds.bgPage.withOpacity(0),
                ],
                begin: Alignment.topCenter,
                end: Alignment.bottomCenter,
              ),
            ),
          ),
        ),
        actions: [
          IconButton(
            icon: Icon(Icons.refresh_rounded, color: ds.textSecondary),
            onPressed: () => ref.invalidate(orgHierarchyProvider),
          ),
        ],
      ),
      body: Stack(
        children: [
          const _OrgBody(),
          // ── Hint bar ──────────────────────────────────────────────────────
          Positioned(
            bottom: 16,
            left: 0,
            right: 0,
            child: Center(
              child: Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                decoration: BoxDecoration(
                  color: ds.bgCard.withOpacity(0.9),
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: ds.border),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withOpacity(0.12),
                      blurRadius: 12,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Icon(Icons.pinch_rounded, size: 14, color: ds.textMuted),
                    const SizedBox(width: 6),
                    Text(
                      'Pinch to zoom  ·  drag to pan  ·  tap to expand',
                      style: TextStyle(
                        fontSize: 11,
                        color: ds.textMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Body — handles loading / error / data
// ─────────────────────────────────────────────────────────────────────────────

class _OrgBody extends ConsumerWidget {
  const _OrgBody();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds    = context.ds;
    final async = ref.watch(orgHierarchyProvider);

    return async.when(
      data: (root) {
        if (root.isEmpty) {
          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                Container(
                  padding: const EdgeInsets.all(24),
                  decoration: BoxDecoration(
                    color: ds.bgCard,
                    shape: BoxShape.circle,
                    border: Border.all(color: ds.border),
                  ),
                  child: Icon(Icons.account_tree_rounded,
                      size: 40, color: ds.textMuted),
                ),
                const SizedBox(height: 16),
                Text('Org chart not available',
                    style: TextStyle(
                        color: ds.textPrimary,
                        fontSize: 16,
                        fontWeight: FontWeight.w700)),
                const SizedBox(height: 6),
                Text('Set up manager relationships in admin settings',
                    textAlign: TextAlign.center,
                    style: TextStyle(fontSize: 13, color: ds.textMuted)),
              ],
            ),
          );
        }

        final nodeCount    = _countNodes(root);
        final initialScale = nodeCount > 20
            ? 0.3
            : nodeCount > 10
                ? 0.5
                : nodeCount > 5
                    ? 0.72
                    : 1.0;

        return LayoutBuilder(builder: (ctx, constraints) {
          return InteractiveViewer(
            constrained: false,
            boundaryMargin: const EdgeInsets.all(80),
            minScale: 0.1,
            maxScale: 3.0,
            child: Transform.scale(
              scale: initialScale,
              alignment: Alignment.topCenter,
              child: Container(
                constraints: BoxConstraints(
                  minWidth: constraints.maxWidth / initialScale,
                  minHeight: constraints.maxHeight / initialScale,
                ),
                padding: const EdgeInsets.fromLTRB(24, 100, 24, 120),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.center,
                  children: [_OrgTree(node: root, depth: 0)],
                ),
              ),
            ),
          );
        });
      },
      loading: () => const Center(
        child: CircularProgressIndicator(
          valueColor: AlwaysStoppedAnimation(AppColors.primaryLight),
          strokeWidth: 2,
        ),
      ),
      error: (e, _) => Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
            const Icon(Icons.account_tree_rounded,
                size: 52, color: AppColors.error),
            const SizedBox(height: 12),
            Text('Could not load org chart',
                style: TextStyle(
                    color: context.ds.textPrimary,
                    fontWeight: FontWeight.w700,
                    fontSize: 16)),
            const SizedBox(height: 8),
            Text('$e',
                style: const TextStyle(
                    color: AppColors.error, fontSize: 12),
                textAlign: TextAlign.center),
          ]),
        ),
      ),
    );
  }
}

int _countNodes(Map<String, dynamic> node) {
  final children = node['children'] as List? ?? [];
  return 1 +
      children.fold<int>(
          0, (s, c) => s + _countNodes(c as Map<String, dynamic>));
}

// ─────────────────────────────────────────────────────────────────────────────
//  Role → accent color
// ─────────────────────────────────────────────────────────────────────────────

Color _roleColor(String role) => switch (role) {
      'TENANT_ADMIN'  => const Color(0xFFF43F5E),
      'DELIVERY_LEAD' => AppColors.primary,
      'PMO'           => const Color(0xFF8B5CF6),
      'EXEC'          => const Color(0xFFF59E0B),
      'CLIENT'        => const Color(0xFF06B6D4),
      'TEAM_MEMBER'   => AppColors.ragGreen,
      _               => AppColors.primaryLight,
    };

String _roleLabel(String role) => switch (role) {
      'TENANT_ADMIN'  => 'Admin',
      'DELIVERY_LEAD' => 'Delivery Lead',
      'PMO'           => 'PMO',
      'EXEC'          => 'Executive',
      'CLIENT'        => 'Client',
      'TEAM_MEMBER'   => 'Team Member',
      _               => role,
    };

// ─────────────────────────────────────────────────────────────────────────────
//  Tree widget (recursive)
// ─────────────────────────────────────────────────────────────────────────────

class _OrgTree extends StatefulWidget {
  const _OrgTree({required this.node, required this.depth});
  final Map<String, dynamic> node;
  final int depth;

  @override
  State<_OrgTree> createState() => _OrgTreeState();
}

class _OrgTreeState extends State<_OrgTree>
    with SingleTickerProviderStateMixin {
  late bool _expanded = widget.depth < 2;
  late final AnimationController _expandCtrl;
  late final Animation<double> _expandAnim;

  @override
  void initState() {
    super.initState();
    _expandCtrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 350),
      value: _expanded ? 1.0 : 0.0,
    );
    _expandAnim =
        CurvedAnimation(parent: _expandCtrl, curve: Curves.easeOutCubic);
  }

  @override
  void dispose() {
    _expandCtrl.dispose();
    super.dispose();
  }

  void _toggle() {
    HapticFeedback.lightImpact();
    setState(() => _expanded = !_expanded);
    if (_expanded)
      _expandCtrl.forward();
    else
      _expandCtrl.reverse();
  }

  @override
  Widget build(BuildContext context) {
    final ds         = context.ds;
    final name       = widget.node['name'] as String? ?? '—';
    final role       = widget.node['role'] as String? ??
        widget.node['jobTitle'] as String? ??
        '';
    final email      = widget.node['email'] as String?;
    final avatarUrl  = widget.node['avatarUrl'] as String?;
    final children   = widget.node['children'] as List? ??
        widget.node['reports'] as List? ??
        [];
    final hasChildren = children.isNotEmpty;
    final isRoot      = widget.depth == 0;
    final accentColor = role.isNotEmpty ? _roleColor(role) : AppColors.primaryLight;

    final nodeCard = GestureDetector(
      onTap: hasChildren ? _toggle : null,
      onLongPress: () {
        HapticFeedback.mediumImpact();
        _showNodeMenu(context, name, email, role);
      },
      child: Container(
        width: isRoot ? 200 : 172,
        padding: const EdgeInsets.all(14),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              isRoot
                  ? accentColor.withOpacity(0.15)
                  : ds.bgCard,
              isRoot
                  ? accentColor.withOpacity(0.05)
                  : ds.bgElevated.withOpacity(0.5),
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(18),
          border: Border.all(
            color: isRoot
                ? accentColor.withOpacity(0.5)
                : ds.border,
            width: isRoot ? 1.5 : 1,
          ),
          boxShadow: [
            BoxShadow(
              color: isRoot
                  ? accentColor.withOpacity(0.15)
                  : Colors.black.withOpacity(
                      Theme.of(context).brightness == Brightness.dark
                          ? 0.2
                          : 0.06),
              blurRadius: isRoot ? 20 : 10,
              offset: const Offset(0, 4),
            ),
          ],
        ),
        child: Column(
          children: [
            // ── Avatar with role ring ──────────────────────────────────
            Stack(
              alignment: Alignment.center,
              children: [
                // Glow ring
                Container(
                  width: isRoot ? 60 : 52,
                  height: isRoot ? 60 : 52,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    gradient: SweepGradient(
                      colors: [
                        accentColor.withOpacity(0.6),
                        accentColor.withOpacity(0.1),
                        accentColor.withOpacity(0.6),
                      ],
                    ),
                  ),
                ),
                Container(
                  width: isRoot ? 56 : 48,
                  height: isRoot ? 56 : 48,
                  decoration: BoxDecoration(
                    shape: BoxShape.circle,
                    color: ds.bgCard,
                  ),
                  padding: const EdgeInsets.all(2),
                  child: ClipOval(
                    child: UserAvatar(
                      name: name,
                      avatarUrl: avatarUrl,
                      radius: isRoot ? 26 : 22,
                    ),
                  ),
                ),
                // Online status dot
                Positioned(
                  bottom: 0,
                  right: 0,
                  child: Container(
                    width: 12,
                    height: 12,
                    decoration: BoxDecoration(
                      color: AppColors.ragGreen,
                      shape: BoxShape.circle,
                      border: Border.all(color: ds.bgCard, width: 2),
                    ),
                  ),
                ),
              ],
            ),

            const SizedBox(height: 10),

            // ── Name ───────────────────────────────────────────────────
            Text(
              name,
              style: TextStyle(
                fontSize: isRoot ? 13 : 12,
                fontWeight: FontWeight.w700,
                color: ds.textPrimary,
                height: 1.3,
              ),
              textAlign: TextAlign.center,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),

            // ── Role badge ─────────────────────────────────────────────
            if (role.isNotEmpty) ...[
              const SizedBox(height: 6),
              Container(
                padding:
                    const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: accentColor.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(20),
                  border:
                      Border.all(color: accentColor.withOpacity(0.3)),
                ),
                child: Text(
                  _roleLabel(role),
                  style: TextStyle(
                    fontSize: 9,
                    fontWeight: FontWeight.w700,
                    color: accentColor,
                    letterSpacing: 0.3,
                  ),
                  textAlign: TextAlign.center,
                ),
              ),
            ],

            // ── Email ──────────────────────────────────────────────────
            if (email != null) ...[
              const SizedBox(height: 4),
              Text(
                email,
                style: TextStyle(fontSize: 9, color: ds.textMuted),
                textAlign: TextAlign.center,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
              ),
            ],

            // ── Expand/collapse CTA ────────────────────────────────────
            if (hasChildren) ...[
              const SizedBox(height: 8),
              Row(
                mainAxisAlignment: MainAxisAlignment.center,
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 10, vertical: 4),
                    decoration: BoxDecoration(
                      color: accentColor.withOpacity(0.1),
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(
                          color: accentColor.withOpacity(0.25)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AnimatedRotation(
                          turns: _expanded ? 0.5 : 0,
                          duration: const Duration(milliseconds: 300),
                          curve: Curves.easeOutBack,
                          child: Icon(
                            Icons.keyboard_arrow_down_rounded,
                            size: 14,
                            color: accentColor,
                          ),
                        ),
                        const SizedBox(width: 4),
                        Text(
                          '${children.length}',
                          style: TextStyle(
                            fontSize: 10,
                            fontWeight: FontWeight.w700,
                            color: accentColor,
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ],
        ),
      ),
    )
        .animate()
        .fadeIn(duration: 350.ms, delay: Duration(milliseconds: widget.depth * 80))
        .scale(begin: const Offset(0.9, 0.9), curve: Curves.easeOutBack);

    if (!hasChildren) return nodeCard;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        nodeCard,

        // ── Connector lines + children ─────────────────────────────────
        SizeTransition(
          sizeFactor: _expandAnim,
          axisAlignment: -1,
          child: FadeTransition(
            opacity: _expandAnim,
            child: Column(
              children: [
                // Vertical drop from node
                _ConnectorLine(
                  color: accentColor.withOpacity(0.4),
                  isVertical: true,
                  length: 24,
                ),

                // Children row with horizontal connectors
                _ChildrenRow(
                  children: children,
                  depth: widget.depth,
                  accentColor: accentColor,
                ),
              ],
            ),
          ),
        ),
      ],
    );
  }

  void _showNodeMenu(
      BuildContext context, String name, String? email, String role) {
    final ds = context.ds;
    showModalBottomSheet(
      context: context,
      backgroundColor: ds.bgCard,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(children: [
              UserAvatar(name: name, radius: 24),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(name,
                          style: TextStyle(
                              fontSize: 16,
                              fontWeight: FontWeight.w700,
                              color: ds.textPrimary)),
                      if (email != null)
                        Text(email,
                            style: TextStyle(
                                fontSize: 12, color: ds.textMuted)),
                    ]),
              ),
            ]),
            const SizedBox(height: 20),
            if (email != null)
              ListTile(
                leading: Icon(Icons.mail_outline_rounded,
                    color: AppColors.primaryLight),
                title: Text('Send Email',
                    style: TextStyle(color: ds.textPrimary)),
                shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12)),
                onTap: () => Navigator.pop(context),
              ),
            ListTile(
              leading: Icon(Icons.person_outline_rounded,
                  color: AppColors.primaryLight),
              title: Text('View Profile',
                  style: TextStyle(color: ds.textPrimary)),
              shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12)),
              onTap: () => Navigator.pop(context),
            ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Children row with custom connector painting
// ─────────────────────────────────────────────────────────────────────────────

class _ChildrenRow extends StatelessWidget {
  const _ChildrenRow({
    required this.children,
    required this.depth,
    required this.accentColor,
  });

  final List children;
  final int depth;
  final Color accentColor;

  @override
  Widget build(BuildContext context) {
    if (children.length == 1) {
      final child = children.first as Map<String, dynamic>;
      return Column(children: [
        _ConnectorLine(color: accentColor.withOpacity(0.4), isVertical: true, length: 16),
        _OrgTree(node: child, depth: depth + 1),
      ]);
    }

    return Column(
      children: [
        // Horizontal rail with drops drawn via CustomPaint
        CustomPaint(
          painter: _HRailPainter(
            count: children.length,
            color: accentColor.withOpacity(0.35),
          ),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            mainAxisAlignment: MainAxisAlignment.center,
            mainAxisSize: MainAxisSize.min,
            children: children.asMap().entries.map((e) {
              final child = e.value as Map<String, dynamic>;
              return Padding(
                padding: EdgeInsets.only(
                  left: e.key == 0 ? 0 : 8,
                  right: e.key == children.length - 1 ? 0 : 8,
                ),
                child: Column(children: [
                  SizedBox(height: 24), // space for the drop line
                  _OrgTree(node: child, depth: depth + 1),
                ]),
              );
            }).toList(),
          ),
        ),
      ],
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Custom painter — draws horizontal rail + vertical drops above each child
// ─────────────────────────────────────────────────────────────────────────────

class _HRailPainter extends CustomPainter {
  const _HRailPainter({required this.count, required this.color});
  final int count;
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    if (count < 2) return;

    final paint = Paint()
      ..color = color
      ..strokeWidth = 2
      ..strokeCap = StrokeCap.round
      ..style = PaintingStyle.stroke;

    final tabW = size.width / count;
    final railY = 0.0;
    final dropY = 24.0;

    // Horizontal rail connecting first to last child center
    final startX = tabW / 2;
    final endX   = size.width - tabW / 2;

    canvas.drawLine(
      Offset(startX, railY),
      Offset(endX, railY),
      paint,
    );

    // Vertical drop for each child
    for (int i = 0; i < count; i++) {
      final cx = tabW / 2 + i * tabW;
      canvas.drawLine(
        Offset(cx, railY),
        Offset(cx, dropY),
        paint,
      );
    }
  }

  @override
  bool shouldRepaint(_HRailPainter old) =>
      old.count != count || old.color != color;
}

// ─────────────────────────────────────────────────────────────────────────────
//  Simple connector line widget
// ─────────────────────────────────────────────────────────────────────────────

class _ConnectorLine extends StatelessWidget {
  const _ConnectorLine({
    required this.color,
    required this.isVertical,
    required this.length,
  });
  final Color color;
  final bool isVertical;
  final double length;

  @override
  Widget build(BuildContext context) => Container(
        width: isVertical ? 2 : length,
        height: isVertical ? length : 2,
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [color, color.withOpacity(0.2)],
            begin: isVertical ? Alignment.topCenter : Alignment.centerLeft,
            end: isVertical ? Alignment.bottomCenter : Alignment.centerRight,
          ),
          borderRadius: BorderRadius.circular(1),
        ),
      );
}
