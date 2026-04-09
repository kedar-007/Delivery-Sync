import 'dart:ui';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../announcements/presentation/screens/announcements_screen.dart'
    show announcementsProvider;
import '../../../announcements/presentation/screens/festival_overlay.dart';
import '../../../../shared/widgets/ambient_festival.dart';

/// Root shell — hosts the bottom navigation bar and swaps between tabs.
class ShellScreen extends ConsumerStatefulWidget {
  const ShellScreen({super.key, required this.navigationShell});
  final StatefulNavigationShell navigationShell;

  @override
  ConsumerState<ShellScreen> createState() => _ShellScreenState();
}

class _ShellScreenState extends ConsumerState<ShellScreen>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Re-fetch announcements the moment the user returns to the app so that
  // deleted/replaced festival announcements are picked up immediately.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) {
      ref.invalidate(announcementsProvider);
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Scaffold(
      backgroundColor: ds.bgPage,
      extendBody: true,
      body: Stack(
        children: [
          widget.navigationShell,
          // Ambient particles — always visible while festival is active, pointer-events:none
          const Positioned.fill(child: AmbientFestival()),
          // Full-screen overlay — shown once per unread festival announcement
          const FestivalOverlay(),
        ],
      ),
      bottomNavigationBar: _PremiumNav(
        currentIndex: widget.navigationShell.currentIndex,
        onTap: (i) {
          HapticFeedback.selectionClick();
          widget.navigationShell.goBranch(
            i,
            initialLocation: i == widget.navigationShell.currentIndex,
          );
        },
      ),
    );
  }
}

// ── Premium animated bottom navigation ───────────────────────────────────────

class _PremiumNav extends StatefulWidget {
  const _PremiumNav({required this.currentIndex, required this.onTap});
  final int currentIndex;
  final ValueChanged<int> onTap;

  @override
  State<_PremiumNav> createState() => _PremiumNavState();
}

class _PremiumNavState extends State<_PremiumNav>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late Animation<double> _anim;
  int _prevIndex = 0;

  static const _items = [
    _NavItem('Home',     Icons.home_outlined,         Icons.home_rounded),
    _NavItem('Projects', Icons.folder_outlined,        Icons.folder_rounded),
    _NavItem('Sprints',  Icons.view_kanban_outlined,   Icons.view_kanban_rounded),
    _NavItem('People',   Icons.people_outline_rounded, Icons.people_rounded),
    _NavItem('More',     Icons.grid_view_outlined,     Icons.grid_view_rounded),
  ];

  @override
  void initState() {
    super.initState();
    _prevIndex = widget.currentIndex;
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 350),
    );
    _anim = CurvedAnimation(parent: _ctrl, curve: Curves.easeOutCubic);
  }

  @override
  void didUpdateWidget(_PremiumNav old) {
    super.didUpdateWidget(old);
    if (old.currentIndex != widget.currentIndex) {
      _prevIndex = old.currentIndex;
      _ctrl.forward(from: 0);
    }
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds    = context.ds;
    final isDark = Theme.of(context).brightness == Brightness.dark;

    return ClipRect(
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 20, sigmaY: 20),
        child: Container(
          decoration: BoxDecoration(
            color: isDark
                ? ds.navBar.withOpacity(0.85)
                : ds.navBar.withOpacity(0.92),
            border: Border(
              top: BorderSide(color: ds.border, width: 0.5),
            ),
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(isDark ? 0.35 : 0.06),
                blurRadius: 24,
                offset: const Offset(0, -6),
              ),
            ],
          ),
          child: SafeArea(
            top: false,
            child: SizedBox(
              height: 68,
              child: LayoutBuilder(
                builder: (context, constraints) {
                  final tabW = constraints.maxWidth / _items.length;
                  return Stack(
                    children: [
                      // ── Sliding pill indicator ──────────────────────────
                      AnimatedBuilder(
                        animation: _anim,
                        builder: (_, __) {
                          final from = _prevIndex * tabW + tabW / 2;
                          final to   = widget.currentIndex * tabW + tabW / 2;
                          final x    = from + (to - from) * _anim.value;
                          return Positioned(
                            top: 8,
                            left: x - 36,
                            child: Container(
                              width: 72,
                              height: 34,
                              decoration: BoxDecoration(
                                gradient: LinearGradient(
                                  colors: [
                                    AppColors.primary.withOpacity(0.18),
                                    AppColors.primaryLight.withOpacity(0.10),
                                  ],
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                ),
                                borderRadius: BorderRadius.circular(17),
                                border: Border.all(
                                  color: AppColors.primary.withOpacity(0.25),
                                  width: 1,
                                ),
                              ),
                            ),
                          );
                        },
                      ),

                      // ── Tab items ────────────────────────────────────────
                      Row(
                        children: _items.asMap().entries.map((e) {
                          final i        = e.key;
                          final item     = e.value;
                          final selected = widget.currentIndex == i;

                          return Expanded(
                            child: GestureDetector(
                              behavior: HitTestBehavior.opaque,
                              onTap: () => widget.onTap(i),
                              child: _NavTab(
                                item: item,
                                selected: selected,
                              ),
                            ),
                          );
                        }).toList(),
                      ),
                    ],
                  );
                },
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _NavTab extends StatelessWidget {
  const _NavTab({required this.item, required this.selected});
  final _NavItem item;
  final bool selected;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return AnimatedScale(
      scale: selected ? 1.0 : 0.92,
      duration: const Duration(milliseconds: 200),
      curve: Curves.easeOutBack,
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 200),
            transitionBuilder: (child, anim) => ScaleTransition(
              scale: Tween<double>(begin: 0.7, end: 1.0).animate(
                CurvedAnimation(parent: anim, curve: Curves.easeOutBack),
              ),
              child: FadeTransition(opacity: anim, child: child),
            ),
            child: Icon(
              selected ? item.activeIcon : item.icon,
              key: ValueKey('${item.label}$selected'),
              size: 22,
              color: selected ? AppColors.primary : ds.textMuted,
            ),
          ),
          const SizedBox(height: 4),
          AnimatedDefaultTextStyle(
            duration: const Duration(milliseconds: 200),
            style: TextStyle(
              fontFamily: 'Inter',
              fontSize: 10,
              fontWeight: selected ? FontWeight.w700 : FontWeight.w400,
              color: selected ? AppColors.primary : ds.textMuted,
              letterSpacing: selected ? 0.2 : 0,
            ),
            child: Text(item.label),
          ),
        ],
      ),
    );
  }
}

class _NavItem {
  const _NavItem(this.label, this.icon, this.activeIcon);
  final String   label;
  final IconData icon;
  final IconData activeIcon;
}
