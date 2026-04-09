import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/user_avatar.dart';
import '../../../auth/providers/auth_provider.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final user = ref.watch(currentUserProvider);
    if (user == null) {
      return Scaffold(
        backgroundColor: context.ds.bgPage,
        body: const Center(child: CircularProgressIndicator()),
      );
    }

    final ds      = context.ds;
    final isDark  = Theme.of(context).brightness == Brightness.dark;

    return Scaffold(
      backgroundColor: ds.bgPage,
      body: CustomScrollView(
        slivers: [
          // ── Hero app bar ─────────────────────────────────────────────────
          SliverAppBar(
            expandedHeight: 220,
            pinned: true,
            backgroundColor: ds.bgPage,
            surfaceTintColor: Colors.transparent,
            flexibleSpace: FlexibleSpaceBar(
              background: Container(
                decoration: BoxDecoration(
                  gradient: isDark
                      ? const LinearGradient(
                          colors: [Color(0xFF0F1729), Color(0xFF1A2540)],
                          begin: Alignment.topCenter,
                          end: Alignment.bottomCenter,
                        )
                      : const LinearGradient(
                          colors: [Color(0xFF4F46E5), Color(0xFF6366F1)],
                          begin: Alignment.topLeft,
                          end: Alignment.bottomRight,
                        ),
                ),
                child: Column(
                  mainAxisAlignment: MainAxisAlignment.end,
                  children: [
                    // Avatar
                    UserAvatar(
                      name: user.name,
                      avatarUrl: user.avatarUrl,
                      radius: 44,
                      border: true,
                    ).animate().scale(duration: 500.ms, curve: Curves.elasticOut),

                    const SizedBox(height: 12),

                    Text(
                      user.name,
                      style: const TextStyle(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: Colors.white,
                        letterSpacing: -0.3,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      user.email,
                      style: TextStyle(
                        fontSize: 13,
                        color: Colors.white.withOpacity(0.75),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],
                ),
              ),
            ),
          ),

          // ── Chips row ─────────────────────────────────────────────────────
          SliverToBoxAdapter(
            child: Container(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
              child: Row(
                children: [
                  _InfoChip(
                    icon: Icons.business_rounded,
                    label: user.tenantName ?? 'Organisation',
                    color: ds.textSecondary,
                  ),
                  const SizedBox(width: 8),
                  _InfoChip(
                    icon: Icons.badge_rounded,
                    label: _roleLabel(user.role),
                    color: AppColors.primaryLight,
                  ),
                  const SizedBox(width: 8),
                  _StatusChip(user.status),
                ],
              ),
            ).animate().fadeIn(duration: 350.ms),
          ),

          // ── Stats row ─────────────────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: Container(
                padding: const EdgeInsets.symmetric(vertical: 16),
                decoration: BoxDecoration(
                  color: ds.bgCard,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: ds.border),
                ),
                child: Row(
                  children: [
                    _StatItem(label: 'Projects', value: '—', icon: Icons.folder_rounded),
                    _Divider(),
                    _StatItem(label: 'Tasks', value: '—', icon: Icons.task_alt_rounded),
                    _Divider(),
                    _StatItem(label: 'Standups', value: '—', icon: Icons.record_voice_over_rounded),
                  ],
                ),
              ),
            ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.05),
          ),

          // ── Account section ───────────────────────────────────────────────
          SliverToBoxAdapter(
            child: _SectionHeader(label: 'Account'),
          ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _CardGroup(children: [
                _ProfileTile(
                  icon: Icons.person_rounded,
                  label: 'Edit Profile',
                  subtitle: 'Update your name and photo',
                  onTap: () {},
                ),
                _ProfileTile(
                  icon: Icons.notifications_rounded,
                  label: 'Notifications',
                  subtitle: 'Manage push and email alerts',
                  onTap: () {},
                ),
                _ProfileTile(
                  icon: Icons.lock_rounded,
                  label: 'Change Password',
                  subtitle: 'Update your security credentials',
                  onTap: () {},
                ),
              ]),
            ).animate().fadeIn(duration: 450.ms),
          ),

          // ── Organisation section ──────────────────────────────────────────
          SliverToBoxAdapter(
            child: _SectionHeader(label: 'Organisation'),
          ),

          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 16),
              child: _CardGroup(children: [
                _ProfileTile(
                  icon: Icons.corporate_fare_rounded,
                  label: user.tenantName ?? 'My Organisation',
                  subtitle: user.tenantSlug?.isNotEmpty == true
                      ? '@${user.tenantSlug}'
                      : 'View organisation details',
                  onTap: () {},
                ),
                _ProfileTile(
                  icon: Icons.people_rounded,
                  label: 'Team Directory',
                  subtitle: 'View all team members',
                  onTap: () => context.go('/people'),
                ),
                _ProfileTile(
                  icon: Icons.emoji_events_rounded,
                  label: 'Badges & Achievements',
                  subtitle: 'Your earned badges and rank',
                  color: const Color(0xFFF59E0B),
                  onTap: () => context.push('/more/badges'),
                ),
                if (UserRole.isAdmin(user.role))
                  _ProfileTile(
                    icon: Icons.admin_panel_settings_rounded,
                    label: 'Admin Settings',
                    subtitle: 'Manage users and permissions',
                    color: AppColors.warning,
                    onTap: () {},
                  ),
              ]),
            ).animate().fadeIn(duration: 500.ms),
          ),

          // ── Sign out ──────────────────────────────────────────────────────
          SliverToBoxAdapter(
            child: Padding(
              padding: const EdgeInsets.fromLTRB(16, 24, 16, 0),
              child: SizedBox(
                width: double.infinity,
                child: OutlinedButton.icon(
                  icon: const Icon(Icons.logout_rounded),
                  label: const Text('Sign Out'),
                  style: OutlinedButton.styleFrom(
                    foregroundColor: AppColors.error,
                    side: const BorderSide(color: AppColors.error),
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () async {
                    final confirmed = await showDialog<bool>(
                      context: context,
                      builder: (_) => AlertDialog(
                        title: const Text('Sign out?'),
                        content: const Text('You will need to sign in again.'),
                        actions: [
                          TextButton(
                              onPressed: () => Navigator.pop(_, false),
                              child: const Text('Cancel')),
                          TextButton(
                              onPressed: () => Navigator.pop(_, true),
                              child: const Text('Sign out',
                                  style: TextStyle(color: AppColors.error))),
                        ],
                      ),
                    );
                    if (confirmed == true) {
                      await ref.read(authProvider.notifier).signOut();
                      if (context.mounted) context.go('/login');
                    }
                  },
                ),
              ),
            ),
          ),

          const SliverToBoxAdapter(child: SizedBox(height: 100)),
        ],
      ),
    );
  }

  static String _roleLabel(String role) => switch (role) {
    UserRole.superAdmin   => 'Super Admin',
    UserRole.tenantAdmin  => 'Admin',
    UserRole.pmo          => 'PMO',
    UserRole.deliveryLead => 'Delivery Lead',
    UserRole.exec         => 'Executive',
    UserRole.client       => 'Client',
    _                     => 'Team Member',
  };
}

// ── Widgets ───────────────────────────────────────────────────────────────────

class _InfoChip extends StatelessWidget {
  const _InfoChip({required this.icon, required this.label, required this.color});
  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
    decoration: BoxDecoration(
      color: color.withOpacity(0.1),
      borderRadius: BorderRadius.circular(8),
      border: Border.all(color: color.withOpacity(0.25)),
    ),
    child: Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Icon(icon, size: 12, color: color),
        const SizedBox(width: 5),
        Text(label, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w600, color: color)),
      ],
    ),
  );
}

class _StatusChip extends StatelessWidget {
  const _StatusChip(this.status);
  final String status;

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      'ACTIVE'    => (AppColors.ragGreen, 'Active'),
      'SUSPENDED' => (AppColors.ragRed,   'Suspended'),
      _           => (AppColors.textMuted, status),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: color.withOpacity(0.1),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 5),
          Text(label,
              style: TextStyle(
                  fontSize: 12, fontWeight: FontWeight.w600, color: color)),
        ],
      ),
    );
  }
}

class _StatItem extends StatelessWidget {
  const _StatItem({required this.label, required this.value, required this.icon});
  final String label;
  final String value;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Expanded(
      child: Column(
        children: [
          Icon(icon, size: 18, color: AppColors.primaryLight),
          const SizedBox(height: 6),
          Text(value,
              style: TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w800,
                  color: ds.textPrimary)),
          const SizedBox(height: 2),
          Text(label,
              style: TextStyle(fontSize: 11, color: ds.textMuted,
                  fontWeight: FontWeight.w500)),
        ],
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
    width: 1, height: 40, color: context.ds.border,
  );
}

class _SectionHeader extends StatelessWidget {
  const _SectionHeader({required this.label});
  final String label;

  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.fromLTRB(16, 20, 16, 8),
    child: Text(
      label.toUpperCase(),
      style: TextStyle(
        fontSize: 11,
        fontWeight: FontWeight.w700,
        color: context.ds.textMuted,
        letterSpacing: 1.2,
      ),
    ),
  );
}

class _CardGroup extends StatelessWidget {
  const _CardGroup({required this.children});
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ds.border),
      ),
      child: Column(
        children: children.asMap().entries.map((e) {
          final isLast = e.key == children.length - 1;
          return Column(
            children: [
              e.value,
              if (!isLast) Divider(height: 1, color: ds.border, indent: 56),
            ],
          );
        }).toList(),
      ),
    );
  }
}

class _ProfileTile extends StatelessWidget {
  const _ProfileTile({
    required this.icon,
    required this.label,
    required this.onTap,
    this.subtitle,
    this.color,
  });

  final IconData icon;
  final String label;
  final String? subtitle;
  final VoidCallback onTap;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return ListTile(
      leading: Container(
        width: 36,
        height: 36,
        decoration: BoxDecoration(
          color: (color ?? AppColors.primaryLight).withOpacity(0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: color ?? AppColors.primaryLight, size: 18),
      ),
      title: Text(
        label,
        style: TextStyle(
          fontWeight: FontWeight.w600,
          fontSize: 14,
          color: color ?? ds.textPrimary,
        ),
      ),
      subtitle: subtitle?.isNotEmpty == true
          ? Text(subtitle!,
              style: TextStyle(fontSize: 12, color: ds.textMuted))
          : null,
      trailing: Icon(Icons.chevron_right_rounded, color: ds.textMuted, size: 18),
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    );
  }
}
