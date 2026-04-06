import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../auth/providers/auth_provider.dart';

/// The root shell that hosts the bottom navigation bar and swaps between tabs.
class ShellScreen extends ConsumerStatefulWidget {
  const ShellScreen({super.key, required this.navigationShell});
  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends ConsumerState<ShellScreen> {
  @override
  Widget build(BuildContext context) {
    final user = ref.watch(currentUserProvider);

    final ds = context.ds;
    return Scaffold(
      backgroundColor: ds.bgPage,
      body: widget.navigationShell,
      bottomNavigationBar: _DsBottomNav(
        currentIndex: widget.navigationShell.currentIndex,
        onTap: (i) => widget.navigationShell.goBranch(
          i,
          initialLocation: i == widget.navigationShell.currentIndex,
        ),
        userRole: user?.role ?? '',
      ),
    );
  }
}

// ── Bottom navigation ─────────────────────────────────────────────────────────

class _DsBottomNav extends StatelessWidget {
  const _DsBottomNav({
    required this.currentIndex,
    required this.onTap,
    required this.userRole,
  });

  final int currentIndex;
  final ValueChanged<int> onTap;
  final String userRole;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      decoration: BoxDecoration(
        color: ds.navBar,
        border: Border(top: BorderSide(color: ds.border, width: 0.5)),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(
                Theme.of(context).brightness == Brightness.dark ? 0.3 : 0.06),
            blurRadius: 16,
            offset: const Offset(0, -4),
          ),
        ],
      ),
      child: SafeArea(
        child: SizedBox(
          height: 60,
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: _tabs(userRole).asMap().entries.map((e) {
              final i = e.key;
              final tab = e.value;
              final selected = currentIndex == i;
              return Expanded(
                child: GestureDetector(
                  behavior: HitTestBehavior.opaque,
                  onTap: () => onTap(i),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 200),
                        child: Icon(
                          selected ? tab.activeIcon : tab.icon,
                          key: ValueKey('$i$selected'),
                          color: selected
                              ? AppColors.primaryLight
                              : ds.textMuted,
                          size: 22,
                        ),
                      ),
                      const SizedBox(height: 3),
                      Text(
                        tab.label,
                        style: TextStyle(
                          fontSize: 10,
                          fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
                          color: selected
                              ? AppColors.primaryLight
                              : ds.textMuted,
                        ),
                      ),
                    ],
                  ),
                ),
              );
            }).toList(),
          ),
        ),
      ),
    );
  }
}

class _NavTab {
  const _NavTab({
    required this.label,
    required this.icon,
    required this.activeIcon,
  });
  final String label;
  final IconData icon;
  final IconData activeIcon;
}

List<_NavTab> _tabs(String role) => [
      const _NavTab(
        label: 'Home',
        icon: Icons.home_outlined,
        activeIcon: Icons.home_rounded,
      ),
      const _NavTab(
        label: 'Projects',
        icon: Icons.folder_outlined,
        activeIcon: Icons.folder_rounded,
      ),
      const _NavTab(
        label: 'Sprints',
        icon: Icons.view_kanban_outlined,
        activeIcon: Icons.view_kanban_rounded,
      ),
      const _NavTab(
        label: 'People',
        icon: Icons.people_outline_rounded,
        activeIcon: Icons.people_rounded,
      ),
      const _NavTab(
        label: 'More',
        icon: Icons.grid_view_outlined,
        activeIcon: Icons.grid_view_rounded,
      ),
    ];
