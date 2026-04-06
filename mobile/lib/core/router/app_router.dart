import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../theme/app_colors.dart';
import '../../features/auth/presentation/screens/login_screen.dart';
import '../../features/auth/providers/auth_provider.dart';
import '../../features/dashboard/presentation/screens/dashboard_screen.dart';
import '../../features/projects/presentation/screens/projects_screen.dart';
import '../../features/standup/presentation/screens/standup_screen.dart';
import '../../features/eod/presentation/screens/eod_screen.dart';
import '../../features/people/presentation/screens/people_screen.dart';
import '../../features/sprints/presentation/screens/sprints_screen.dart';
import '../../features/profile/presentation/screens/profile_screen.dart';
import '../../features/ai_insights/presentation/screens/ai_insights_screen.dart';
import '../../features/attendance/presentation/screens/attendance_screen.dart';
import '../../features/assets/presentation/screens/assets_screen.dart';
import '../../features/badges/presentation/screens/badges_screen.dart';
import '../../features/people/presentation/screens/org_chart_screen.dart';
import '../../features/shell/presentation/screens/shell_screen.dart';
import '../../features/actions/presentation/screens/actions_screen.dart';
import '../../features/blockers/presentation/screens/blockers_screen.dart';
import '../../features/raid/presentation/screens/raid_screen.dart';
import '../../features/time_tracking/presentation/screens/time_tracking_screen.dart';
import '../../features/leave/presentation/screens/leave_screen.dart';
import '../../features/announcements/presentation/screens/announcements_screen.dart';
import '../../features/settings/presentation/screens/settings_screen.dart';
import '../../features/reports/presentation/screens/reports_screen.dart';
import '../../features/admin/presentation/screens/admin_screen.dart';
import '../../features/teams/presentation/screens/teams_screen.dart';
import '../../features/decisions/presentation/screens/decisions_screen.dart';
import '../../features/milestones/presentation/screens/milestones_screen.dart';

final routerProvider = Provider<GoRouter>((ref) {
  final auth = ref.watch(authProvider);

  return GoRouter(
    initialLocation: '/login',
    refreshListenable: _AuthListenable(ref),
    onException: (_, __, router) {
      // Ignore OAuth redirect URI parse errors (deliverysync://)
    },
    redirect: (context, state) {
      final status      = auth.status;
      final isLoginRoute = state.matchedLocation == '/login';

      if (status == AuthStatus.checking || status == AuthStatus.initial) {
        return null;
      }
      if ((status == AuthStatus.unauthenticated || status == AuthStatus.error) &&
          !isLoginRoute) {
        return '/login';
      }
      if (status == AuthStatus.authenticated && isLoginRoute) {
        return '/home';
      }
      return null;
    },
    routes: [
      GoRoute(
        path: '/login',
        builder: (_, __) => const LoginScreen(),
      ),

      // ── Shell with bottom nav ────────────────────────────────────────
      StatefulShellRoute.indexedStack(
        builder: (ctx, state, shell) => ShellScreen(navigationShell: shell),
        branches: [
          // Tab 0 — Dashboard
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/home',
              builder: (_, __) => const DashboardScreen(),
            ),
          ]),

          // Tab 1 — Projects
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/projects',
              builder: (_, __) => const ProjectsScreen(),
            ),
          ]),

          // Tab 2 — Sprints / Tasks
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/sprints',
              builder: (_, __) => const SprintsScreen(),
            ),
          ]),

          // Tab 3 — People
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/people',
              builder: (_, __) => const PeopleScreen(),
              routes: [
                GoRoute(
                  path: 'org-chart',
                  builder: (_, __) => const OrgChartScreen(),
                ),
              ],
            ),
          ]),

          // Tab 4 — More hub
          StatefulShellBranch(routes: [
            GoRoute(
              path: '/more',
              builder: (_, __) => const _MoreScreen(),
              routes: [
                GoRoute(
                  path: 'standup',
                  builder: (_, __) => const StandupScreen(),
                ),
                GoRoute(
                  path: 'eod',
                  builder: (_, __) => const EodScreen(),
                ),
                GoRoute(
                  path: 'profile',
                  builder: (_, __) => const ProfileScreen(),
                ),
                GoRoute(
                  path: 'ai-insights',
                  builder: (_, __) => const AiInsightsScreen(),
                ),
                GoRoute(
                  path: 'attendance',
                  builder: (_, __) => const AttendanceScreen(),
                ),
                GoRoute(
                  path: 'assets',
                  builder: (_, __) => const AssetsScreen(),
                ),
                GoRoute(
                  path: 'badges',
                  builder: (_, __) => const BadgesScreen(),
                ),
                GoRoute(
                  path: 'actions',
                  builder: (_, __) => const ActionsScreen(),
                ),
                GoRoute(
                  path: 'blockers',
                  builder: (_, __) => const BlockersScreen(),
                ),
                GoRoute(
                  path: 'raid',
                  builder: (_, __) => const RaidScreen(),
                ),
                GoRoute(
                  path: 'time-tracking',
                  builder: (_, __) => const TimeTrackingScreen(),
                ),
                GoRoute(
                  path: 'leave',
                  builder: (_, __) => const LeaveScreen(),
                ),
                GoRoute(
                  path: 'announcements',
                  builder: (_, __) => const AnnouncementsScreen(),
                ),
                GoRoute(
                  path: 'settings',
                  builder: (_, __) => const SettingsScreen(),
                ),
                GoRoute(
                  path: 'reports',
                  builder: (_, __) => const ReportsScreen(),
                ),
                GoRoute(
                  path: 'admin',
                  builder: (_, __) => const AdminScreen(),
                ),
                GoRoute(
                  path: 'teams',
                  builder: (_, __) => const TeamsScreen(),
                ),
                GoRoute(
                  path: 'decisions',
                  builder: (_, __) => const DecisionsScreen(),
                ),
                GoRoute(
                  path: 'milestones',
                  builder: (_, __) => const MilestonesScreen(),
                ),
              ],
            ),
          ]),
        ],
      ),
    ],
  );
});

// ── More hub screen ───────────────────────────────────────────────────────────

class _MoreScreen extends ConsumerWidget {
  const _MoreScreen();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds   = context.ds;
    final user = ref.watch(currentUserProvider);
    final role = user?.role ?? '';
    final isAdmin = role == 'TENANT_ADMIN' || role == 'SUPER_ADMIN';

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('More'),
        backgroundColor: ds.bgPage,
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // ── Daily Sync ──────────────────────────────────────────────
          _SectionLabel('Daily Sync', ds),
          _MoreTile(
            icon: Icons.record_voice_over_rounded,
            label: 'Daily Stand-up',
            subtitle: 'Post your daily update',
            color: AppColors.primary,
            onTap: () => context.push('/more/standup'),
          ),
          _MoreTile(
            icon: Icons.wb_sunny_rounded,
            label: 'End of Day',
            subtitle: 'Wrap up with your EOD report',
            color: AppColors.ragAmber,
            onTap: () => context.push('/more/eod'),
          ),

          const SizedBox(height: 4),

          // ── Work Items ──────────────────────────────────────────────
          _SectionLabel('Work Items', ds),
          _MoreTile(
            icon: Icons.task_alt_rounded,
            label: 'Actions',
            subtitle: 'Track and manage action items',
            color: AppColors.info,
            onTap: () => context.push('/more/actions'),
          ),
          _MoreTile(
            icon: Icons.block_rounded,
            label: 'Blockers',
            subtitle: 'Log and resolve blockers',
            color: AppColors.ragRed,
            onTap: () => context.push('/more/blockers'),
          ),
          _MoreTile(
            icon: Icons.playlist_add_check_circle_rounded,
            label: 'RAID Log',
            subtitle: 'Risks, Assumptions, Issues, Dependencies',
            color: AppColors.ragAmber,
            onTap: () => context.push('/more/raid'),
          ),
          _MoreTile(
            icon: Icons.gavel_rounded,
            label: 'Decisions',
            subtitle: 'Log and track team decisions',
            color: AppColors.info,
            onTap: () => context.push('/more/decisions'),
          ),
          _MoreTile(
            icon: Icons.flag_rounded,
            label: 'Milestones',
            subtitle: 'Track key project checkpoints',
            color: AppColors.accent,
            onTap: () => context.push('/more/milestones'),
          ),

          const SizedBox(height: 4),

          // ── Time & Leave ─────────────────────────────────────────────
          _SectionLabel('Time & Leave', ds),
          _MoreTile(
            icon: Icons.access_time_rounded,
            label: 'Time Tracking',
            subtitle: 'Log and submit your time entries',
            color: AppColors.ragGreen,
            onTap: () => context.push('/more/time-tracking'),
          ),
          _MoreTile(
            icon: Icons.event_available_rounded,
            label: 'Leave',
            subtitle: 'Apply and track leave requests',
            color: AppColors.accent,
            onTap: () => context.push('/more/leave'),
          ),

          const SizedBox(height: 4),

          // ── People & Workspace ──────────────────────────────────────
          _SectionLabel('People & Workspace', ds),
          _MoreTile(
            icon: Icons.fingerprint_rounded,
            label: 'Attendance',
            subtitle: 'Check in / check out',
            color: AppColors.success,
            onTap: () => context.push('/more/attendance'),
          ),
          _MoreTile(
            icon: Icons.campaign_rounded,
            label: 'Announcements',
            subtitle: 'Company updates and news',
            color: AppColors.warning,
            onTap: () => context.push('/more/announcements'),
          ),
          _MoreTile(
            icon: Icons.emoji_events_rounded,
            label: 'Badges',
            subtitle: 'Your achievements and leaderboard',
            color: AppColors.ragAmber,
            onTap: () => context.push('/more/badges'),
          ),
          _MoreTile(
            icon: Icons.inventory_2_rounded,
            label: 'Assets',
            subtitle: 'My assigned assets & requests',
            color: AppColors.textSecondary,
            onTap: () => context.push('/more/assets'),
          ),
          _MoreTile(
            icon: Icons.groups_rounded,
            label: 'Teams',
            subtitle: 'View and manage your teams',
            color: AppColors.primaryLight,
            onTap: () => context.push('/more/teams'),
          ),

          const SizedBox(height: 4),

          // ── Insights ────────────────────────────────────────────────
          _SectionLabel('Insights', ds),
          _MoreTile(
            icon: Icons.auto_awesome_rounded,
            label: 'AI Insights',
            subtitle: 'Smart analysis of your team',
            color: const Color(0xFFA855F7),
            onTap: () => context.push('/more/ai-insights'),
          ),
          _MoreTile(
            icon: Icons.summarize_rounded,
            label: 'Reports',
            subtitle: 'Generate and view project reports',
            color: AppColors.info,
            onTap: () => context.push('/more/reports'),
          ),

          const SizedBox(height: 4),

          // ── Admin (role-gated) ──────────────────────────────────────
          if (isAdmin) ...[
            _SectionLabel('Admin', ds),
            _MoreTile(
              icon: Icons.admin_panel_settings_rounded,
              label: 'Admin Panel',
              subtitle: 'Manage users, permissions, and audit logs',
              color: AppColors.ragRed,
              onTap: () => context.push('/more/admin'),
            ),
          ],

          const SizedBox(height: 4),

          // ── Account ─────────────────────────────────────────────────
          _SectionLabel('Account', ds),
          _MoreTile(
            icon: Icons.person_rounded,
            label: 'My Profile',
            subtitle: user?.name ?? '',
            color: AppColors.primary,
            onTap: () => context.push('/more/profile'),
          ),
          _MoreTile(
            icon: Icons.settings_rounded,
            label: 'Settings',
            subtitle: 'Theme, notifications, preferences',
            color: ds.textSecondary,
            onTap: () => context.push('/more/settings'),
          ),

          const Divider(height: 32),

          _MoreTile(
            icon: Icons.logout_rounded,
            label: 'Sign Out',
            subtitle: '',
            color: AppColors.ragRed,
            onTap: () async {
              final confirmed = await showDialog<bool>(
                context: context,
                builder: (_) => AlertDialog(
                  title: const Text('Sign out?'),
                  content: const Text('You will need to sign in again.'),
                  actions: [
                    TextButton(
                        onPressed: () => Navigator.pop(context, false),
                        child: const Text('Cancel')),
                    TextButton(
                        onPressed: () => Navigator.pop(context, true),
                        child: const Text('Sign out',
                            style: TextStyle(color: AppColors.ragRed))),
                  ],
                ),
              );
              if (confirmed == true) {
                await ref.read(authProvider.notifier).signOut();
                if (context.mounted) context.go('/login');
              }
            },
          ),

          const SizedBox(height: 24),
        ],
      ),
    );
  }
}

class _SectionLabel extends StatelessWidget {
  const _SectionLabel(this.label, this.ds);
  final String label;
  final DsColors ds;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.fromLTRB(4, 12, 4, 6),
        child: Text(
          label.toUpperCase(),
          style: TextStyle(
            fontSize: 10,
            fontWeight: FontWeight.w800,
            color: ds.textMuted,
            letterSpacing: 1.2,
          ),
        ),
      );
}

class _MoreTile extends StatelessWidget {
  const _MoreTile({
    required this.icon,
    required this.label,
    required this.subtitle,
    required this.onTap,
    required this.color,
  });

  final IconData icon;
  final String label;
  final String subtitle;
  final VoidCallback onTap;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 4, vertical: 6),
          child: Row(children: [
            Container(
              width: 40, height: 40,
              decoration: BoxDecoration(
                color: color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(11),
              ),
              child: Icon(icon, color: color, size: 20),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(label,
                      style: TextStyle(
                          fontSize: 14,
                          fontWeight: FontWeight.w600,
                          color: ds.textPrimary)),
                  if (subtitle.isNotEmpty)
                    Text(subtitle,
                        style: TextStyle(
                            fontSize: 11, color: ds.textMuted),
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis),
                ],
              ),
            ),
            Icon(Icons.chevron_right_rounded,
                size: 18, color: ds.textMuted),
          ]),
        ),
      ),
    );
  }
}

/// Makes [GoRouter] react to auth state changes.
class _AuthListenable extends ChangeNotifier {
  _AuthListenable(this._ref) {
    _ref.listen(authProvider, (_, __) => notifyListeners());
  }
  final Ref _ref;
}
