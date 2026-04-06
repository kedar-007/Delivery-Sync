/// Settings screen — theme, notifications, account preferences.
library;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:package_info_plus/package_info_plus.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../../app.dart' show themeModeProvider;
import '../../../../core/theme/app_colors.dart';
import '../../../auth/providers/auth_provider.dart';

// ── Notification prefs provider ───────────────────────────────────────────────

final _notifPrefsProvider =
    StateNotifierProvider<_NotifPrefsNotifier, _NotifPrefs>(
  (ref) => _NotifPrefsNotifier(),
);

class _NotifPrefs {
  final bool pushEnabled;
  final bool standupReminder;
  final bool eodReminder;
  const _NotifPrefs({
    this.pushEnabled      = true,
    this.standupReminder  = true,
    this.eodReminder      = true,
  });
  _NotifPrefs copyWith({
    bool? pushEnabled, bool? standupReminder, bool? eodReminder,
  }) => _NotifPrefs(
        pushEnabled:     pushEnabled     ?? this.pushEnabled,
        standupReminder: standupReminder ?? this.standupReminder,
        eodReminder:     eodReminder     ?? this.eodReminder,
      );
}

class _NotifPrefsNotifier extends StateNotifier<_NotifPrefs> {
  _NotifPrefsNotifier() : super(const _NotifPrefs()) {
    _load();
  }

  Future<void> _load() async {
    final prefs = await SharedPreferences.getInstance();
    state = _NotifPrefs(
      pushEnabled:     prefs.getBool('notif_push')    ?? true,
      standupReminder: prefs.getBool('notif_standup') ?? true,
      eodReminder:     prefs.getBool('notif_eod')     ?? true,
    );
  }

  Future<void> setPush(bool v) async {
    state = state.copyWith(pushEnabled: v);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('notif_push', v);
  }

  Future<void> setStandupReminder(bool v) async {
    state = state.copyWith(standupReminder: v);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('notif_standup', v);
  }

  Future<void> setEodReminder(bool v) async {
    state = state.copyWith(eodReminder: v);
    final prefs = await SharedPreferences.getInstance();
    await prefs.setBool('notif_eod', v);
  }
}

// ── Screen ────────────────────────────────────────────────────────────────────

class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds         = context.ds;
    final themeMode  = ref.watch(themeModeProvider);
    final notifPrefs = ref.watch(_notifPrefsProvider);
    final user       = ref.watch(currentUserProvider);

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Settings'),
        backgroundColor: ds.bgPage,
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(16, 8, 16, 80),
        children: [

          // ── Appearance ──────────────────────────────────────────────
          _SectionHeader('Appearance'),
          _Card(children: [
            Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('Theme',
                      style: TextStyle(
                          fontWeight: FontWeight.w600,
                          color: ds.textPrimary)),
                  const SizedBox(height: 12),
                  SegmentedButton<ThemeMode>(
                    showSelectedIcon: false,
                    style: ButtonStyle(
                      backgroundColor: WidgetStateProperty.resolveWith((states) {
                        if (states.contains(WidgetState.selected)) {
                          return AppColors.primary;
                        }
                        return ds.bgElevated;
                      }),
                      foregroundColor: WidgetStateProperty.resolveWith((states) {
                        if (states.contains(WidgetState.selected)) {
                          return Colors.white;
                        }
                        return ds.textSecondary;
                      }),
                    ),
                    segments: const [
                      ButtonSegment(
                        value: ThemeMode.light,
                        icon: Icon(Icons.wb_sunny_rounded, size: 16),
                        label: Text('Light'),
                      ),
                      ButtonSegment(
                        value: ThemeMode.system,
                        icon: Icon(Icons.auto_mode_rounded, size: 16),
                        label: Text('Auto'),
                      ),
                      ButtonSegment(
                        value: ThemeMode.dark,
                        icon: Icon(Icons.nightlight_rounded, size: 16),
                        label: Text('Dark'),
                      ),
                    ],
                    selected: {themeMode},
                    onSelectionChanged: (set) async {
                      ref.read(themeModeProvider.notifier).state = set.first;
                      final prefs = await SharedPreferences.getInstance();
                      await prefs.setString(
                          'theme_mode', set.first.name);
                    },
                  ),
                ],
              ),
            ),
          ]),

          const SizedBox(height: 16),

          // ── Notifications ────────────────────────────────────────────
          _SectionHeader('Notifications'),
          _Card(children: [
            _SwitchTile(
              icon: Icons.notifications_rounded,
              title: 'Push Notifications',
              subtitle: 'Receive alerts on your device',
              value: notifPrefs.pushEnabled,
              onChanged: (v) =>
                  ref.read(_notifPrefsProvider.notifier).setPush(v),
            ),
            _Divider(ds),
            _SwitchTile(
              icon: Icons.record_voice_over_rounded,
              title: 'Stand-up Reminder',
              subtitle: 'Daily reminder to post your update',
              value: notifPrefs.standupReminder,
              onChanged: (v) =>
                  ref.read(_notifPrefsProvider.notifier).setStandupReminder(v),
            ),
            _Divider(ds),
            _SwitchTile(
              icon: Icons.wb_twilight_rounded,
              title: 'EOD Reminder',
              subtitle: 'End-of-day report reminder',
              value: notifPrefs.eodReminder,
              onChanged: (v) =>
                  ref.read(_notifPrefsProvider.notifier).setEodReminder(v),
            ),
          ]),

          const SizedBox(height: 16),

          // ── Account ──────────────────────────────────────────────────
          _SectionHeader('Account'),
          _Card(children: [
            _NavTile(
              icon: Icons.person_rounded,
              title: 'My Profile',
              subtitle: user?.name ?? '',
              onTap: () => context.push('/more/profile'),
            ),
            _Divider(ds),
            _NavTile(
              icon: Icons.language_rounded,
              title: 'Language',
              subtitle: 'English',
              onTap: () {
                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(
                      content: Text('Language switching coming soon')),
                );
              },
            ),
          ]),

          const SizedBox(height: 16),

          // ── About ─────────────────────────────────────────────────────
          _SectionHeader('About'),
          _Card(children: [
            _AppVersionTile(),
            _Divider(ds),
            _NavTile(
              icon: Icons.description_rounded,
              title: 'Terms of Service',
              subtitle: '',
              onTap: () {},
            ),
            _Divider(ds),
            _NavTile(
              icon: Icons.privacy_tip_rounded,
              title: 'Privacy Policy',
              subtitle: '',
              onTap: () {},
            ),
          ]),

          const SizedBox(height: 16),

          // ── Danger zone ───────────────────────────────────────────────
          _SectionHeader('Account', color: AppColors.ragRed),
          _Card(children: [
            ListTile(
              leading: Container(
                width: 36, height: 36,
                decoration: BoxDecoration(
                  color: AppColors.ragRed.withOpacity(0.12),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(Icons.logout_rounded,
                    color: AppColors.ragRed, size: 18),
              ),
              title: const Text('Sign Out',
                  style: TextStyle(
                      fontWeight: FontWeight.w700,
                      color: AppColors.ragRed)),
              trailing: const Icon(Icons.chevron_right_rounded,
                  size: 18, color: AppColors.ragRed),
              onTap: () => _confirmSignOut(context, ref),
            ),
          ]),
        ],
      ),
    );
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (_) => AlertDialog(
        title: const Text('Sign out?'),
        content: const Text(
            'You will need to sign in again to access the app.'),
        actions: [
          TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Cancel')),
          TextButton(
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Sign Out',
                  style: TextStyle(color: AppColors.ragRed))),
        ],
      ),
    );
    if (ok == true) {
      await ref.read(authProvider.notifier).signOut();
      if (context.mounted) context.go('/login');
    }
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

class _SectionHeader extends StatelessWidget {
  const _SectionHeader(this.label, {this.color});
  final String label;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Padding(
      padding: const EdgeInsets.only(bottom: 8, left: 4),
      child: Text(
        label.toUpperCase(),
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w700,
          color: color ?? ds.textMuted,
          letterSpacing: 1.2,
        ),
      ),
    );
  }
}

class _Card extends StatelessWidget {
  const _Card({required this.children});
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
      child: ClipRRect(
        borderRadius: BorderRadius.circular(16),
        child: Column(children: children),
      ),
    );
  }
}

class _Divider extends StatelessWidget {
  const _Divider(this.ds);
  final DsColors ds;

  @override
  Widget build(BuildContext context) => Container(
        height: 1,
        margin: const EdgeInsets.symmetric(horizontal: 16),
        color: ds.border,
      );
}

class _SwitchTile extends StatelessWidget {
  const _SwitchTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.value,
    required this.onChanged,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final bool value;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return ListTile(
      leading: Container(
        width: 36, height: 36,
        decoration: BoxDecoration(
          color: AppColors.primary.withOpacity(0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: AppColors.primaryLight, size: 18),
      ),
      title: Text(title,
          style: TextStyle(
              fontWeight: FontWeight.w600, color: ds.textPrimary,
              fontSize: 14)),
      subtitle: subtitle.isNotEmpty
          ? Text(subtitle,
              style: TextStyle(color: ds.textMuted, fontSize: 12))
          : null,
      trailing: Switch(
        value: value,
        activeColor: AppColors.primary,
        onChanged: onChanged,
      ),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    );
  }
}

class _NavTile extends StatelessWidget {
  const _NavTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
  });
  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return ListTile(
      leading: Container(
        width: 36, height: 36,
        decoration: BoxDecoration(
          color: AppColors.primary.withOpacity(0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: Icon(icon, color: AppColors.primaryLight, size: 18),
      ),
      title: Text(title,
          style: TextStyle(
              fontWeight: FontWeight.w600, color: ds.textPrimary,
              fontSize: 14)),
      subtitle: subtitle.isNotEmpty
          ? Text(subtitle,
              style: TextStyle(color: ds.textMuted, fontSize: 12))
          : null,
      trailing: Icon(Icons.chevron_right_rounded,
          size: 18, color: ds.textMuted),
      onTap: onTap,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    );
  }
}

class _AppVersionTile extends StatefulWidget {
  @override
  State<_AppVersionTile> createState() => _AppVersionTileState();
}

class _AppVersionTileState extends State<_AppVersionTile> {
  String _version = '—';

  @override
  void initState() {
    super.initState();
    PackageInfo.fromPlatform().then((info) {
      if (mounted) {
        setState(() => _version = '${info.version} (${info.buildNumber})');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return ListTile(
      leading: Container(
        width: 36, height: 36,
        decoration: BoxDecoration(
          color: AppColors.primary.withOpacity(0.12),
          borderRadius: BorderRadius.circular(10),
        ),
        child: const Icon(Icons.info_rounded,
            color: AppColors.primaryLight, size: 18),
      ),
      title: Text('App Version',
          style: TextStyle(
              fontWeight: FontWeight.w600, color: ds.textPrimary,
              fontSize: 14)),
      subtitle: Text(_version,
          style: TextStyle(color: ds.textMuted, fontSize: 12)),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 4),
    );
  }
}
