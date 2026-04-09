import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/theme/app_colors.dart';
import '../../providers/auth_provider.dart';

class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  bool _signingIn = false;

  Future<void> _handleSignIn() async {
    if (_signingIn) return;
    setState(() => _signingIn = true);
    final success = await ref.read(authProvider.notifier).signIn();
    if (mounted) {
      setState(() => _signingIn = false);
      if (success) context.go('/home');
    }
  }

  @override
  Widget build(BuildContext context) {
    final authState = ref.watch(authProvider);
    final error     = authState.errorMessage;
    final size      = MediaQuery.sizeOf(context);

    // Show a loading screen while checking for an existing session so the
    // login page never flashes after the user has already signed in.
    if (authState.status == AuthStatus.checking ||
        authState.status == AuthStatus.initial) {
      return Scaffold(
        body: Container(
          decoration: const BoxDecoration(
            gradient: LinearGradient(
              colors: [Color(0xFF050810), Color(0xFF0A0F1E), Color(0xFF0D1B35)],
              begin: Alignment.topCenter,
              end: Alignment.bottomCenter,
            ),
          ),
          child: const Center(
            child: CircularProgressIndicator(color: Color(0xFF6366F1)),
          ),
        ),
      );
    }

    // Login page always uses dark gradient background regardless of theme
    return Scaffold(
      body: Container(
        width: double.infinity,
        height: double.infinity,
        decoration: const BoxDecoration(
          gradient: LinearGradient(
            colors: [Color(0xFF050810), Color(0xFF0A0F1E), Color(0xFF0D1B35)],
            begin: Alignment.topCenter,
            end: Alignment.bottomCenter,
          ),
        ),
        child: SafeArea(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 32),
            child: ConstrainedBox(
              constraints: BoxConstraints(minHeight: size.height - 80),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // ── Logo ───────────────────────────────────────────────
                  _LogoBadge()
                    .animate()
                    .fadeIn(duration: 600.ms)
                    .slideY(begin: -0.2, curve: Curves.easeOut),

                  const SizedBox(height: 40),

                  // ── Hero text ──────────────────────────────────────────
                  Text(
                    'Track.\u00a0Sync.',
                    style: Theme.of(context).textTheme.displayMedium?.copyWith(
                          fontSize: 40,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -1,
                          color: Colors.white,
                        ),
                  ).animate(delay: 100.ms).fadeIn().slideX(begin: -0.1),
                  ShaderMask(
                    shaderCallback: (r) => AppColors.primaryGradient.createShader(r),
                    child: Text(
                      'Deliver.',
                      style: Theme.of(context).textTheme.displayMedium?.copyWith(
                            fontSize: 40,
                            fontWeight: FontWeight.w800,
                            letterSpacing: -1,
                            color: Colors.white,
                          ),
                    ),
                  ).animate(delay: 150.ms).fadeIn().slideX(begin: -0.1),

                  const SizedBox(height: 16),

                  Text(
                    'The command centre for modern delivery operations. '
                    'Every shipment, team and route — unified.',
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          height: 1.6,
                          fontSize: 15,
                        ),
                  ).animate(delay: 200.ms).fadeIn(),

                  const SizedBox(height: 48),

                  // ── Feature chips ──────────────────────────────────────
                  ..._features.asMap().entries.map((e) => _FeatureRow(
                        icon: e.value.$1,
                        label: e.value.$2,
                        color: e.value.$3,
                      ).animate(delay: (250 + e.key * 60).ms).fadeIn().slideX(begin: -0.05)),

                  const SizedBox(height: 48),

                  // ── Error message ─────────────────────────────────────
                  if (error != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: AppColors.errorBg,
                        borderRadius: BorderRadius.circular(10),
                        border: Border.all(color: AppColors.error.withOpacity(0.4)),
                      ),
                      child: Row(
                        children: [
                          const Icon(Icons.error_outline, color: AppColors.error, size: 18),
                          const SizedBox(width: 8),
                          Expanded(
                            child: Text(error,
                                style: const TextStyle(color: AppColors.error, fontSize: 13)),
                          ),
                        ],
                      ),
                    ).animate().fadeIn().shakeX(),
                    const SizedBox(height: 16),
                  ],

                  // ── Sign-in button ────────────────────────────────────
                  SizedBox(
                    width: double.infinity,
                    height: 54,
                    child: ElevatedButton(
                      onPressed: _signingIn ? null : _handleSignIn,
                      style: ElevatedButton.styleFrom(
                        backgroundColor: AppColors.primary,
                        foregroundColor: Colors.white,
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(14),
                        ),
                        elevation: 0,
                      ),
                      child: _signingIn
                          ? const SizedBox(
                              width: 22,
                              height: 22,
                              child: CircularProgressIndicator(
                                color: Colors.white,
                                strokeWidth: 2.5,
                              ),
                            )
                          : const Row(
                              mainAxisAlignment: MainAxisAlignment.center,
                              children: [
                                Icon(Icons.lock_open_rounded, size: 20),
                                SizedBox(width: 10),
                                Text(
                                  'Sign in with Organisation Account',
                                  style: TextStyle(
                                    fontWeight: FontWeight.w700,
                                    fontSize: 15,
                                  ),
                                ),
                              ],
                            ),
                    ),
                  ).animate(delay: 400.ms).fadeIn().slideY(begin: 0.1),

                  const SizedBox(height: 16),

                  Center(
                    child: Text(
                      'Secured by Zoho Catalyst · SSO enabled',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(fontSize: 11),
                    ),
                  ).animate(delay: 450.ms).fadeIn(),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

// ── Supporting widgets ────────────────────────────────────────────────────────

class _LogoBadge extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Row(
        children: [
          Container(
            width: 48,
            height: 48,
            decoration: BoxDecoration(
              gradient: AppColors.primaryGradient,
              borderRadius: BorderRadius.circular(14),
              boxShadow: [
                BoxShadow(
                  color: AppColors.primary.withOpacity(0.35),
                  blurRadius: 16,
                  offset: const Offset(0, 6),
                ),
              ],
            ),
            child: const Icon(Icons.local_shipping_rounded, color: Colors.white, size: 26),
          ),
          const SizedBox(width: 12),
          Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Delivery Sync',
                style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.3,
                    ),
              ),
              Text(
                'Delivery Intelligence Platform',
                style: Theme.of(context).textTheme.bodySmall?.copyWith(
                      color: AppColors.accent,
                      fontSize: 11,
                      letterSpacing: 0.5,
                    ),
              ),
            ],
          ),
        ],
      );
}

class _FeatureRow extends StatelessWidget {
  const _FeatureRow({
    required this.icon,
    required this.label,
    required this.color,
  });

  final IconData icon;
  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Row(
          children: [
            Container(
              width: 36,
              height: 36,
              decoration: BoxDecoration(
                color: color.withOpacity(0.12),
                borderRadius: BorderRadius.circular(10),
                border: Border.all(color: color.withOpacity(0.2)),
              ),
              child: Icon(icon, color: color, size: 18),
            ),
            const SizedBox(width: 12),
            Text(
              label,
              style: const TextStyle(
                fontSize: 14,
                fontWeight: FontWeight.w600,
                color: Colors.white,
              ),
            ),
          ],
        ),
      );
}

const _features = [
  (Icons.track_changes_rounded,    'Live Delivery Tracking',        AppColors.info),
  (Icons.people_alt_rounded,       'Team Synchronisation',          AppColors.accent),
  (Icons.notifications_active_rounded, 'Real-Time Status Updates',  AppColors.success),
  (Icons.dashboard_rounded,        'Centralised Dispatch Control',  AppColors.warning),
];
