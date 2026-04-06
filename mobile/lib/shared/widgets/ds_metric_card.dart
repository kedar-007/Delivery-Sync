import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';

import '../../core/theme/app_colors.dart';
// DsColorsX extension brought in by app_colors.dart

/// Reusable metric tile — shown on the dashboard.
class DsMetricCard extends StatelessWidget {
  const DsMetricCard({
    super.key,
    required this.value,
    required this.label,
    required this.icon,
    this.color = AppColors.primary,
    this.trend,
    this.trendPositive = true,
    this.onTap,
  });

  final String value;
  final String label;
  final IconData icon;
  final Color color;
  final String? trend;
  final bool trendPositive;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
        decoration: BoxDecoration(
          gradient: LinearGradient(
            colors: [
              color.withOpacity(0.12),
              ds.bgCard,
            ],
            begin: Alignment.topLeft,
            end: Alignment.bottomRight,
          ),
          borderRadius: BorderRadius.circular(16),
          border: Border.all(color: color.withOpacity(0.25), width: 1),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Container(
                  padding: const EdgeInsets.all(8),
                  decoration: BoxDecoration(
                    color: color.withOpacity(0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(icon, color: color, size: 20),
                ),
                if (trend != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 3),
                    decoration: BoxDecoration(
                      color: trendPositive
                          ? AppColors.successBg
                          : AppColors.errorBg,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Icon(
                          trendPositive
                              ? Icons.trending_up_rounded
                              : Icons.trending_down_rounded,
                          size: 12,
                          color: trendPositive ? AppColors.success : AppColors.error,
                        ),
                        const SizedBox(width: 2),
                        Text(
                          trend!,
                          style: TextStyle(
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            color: trendPositive ? AppColors.success : AppColors.error,
                          ),
                        ),
                      ],
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 8),
            FittedBox(
              fit: BoxFit.scaleDown,
              alignment: Alignment.centerLeft,
              child: Text(
                value,
                style: TextStyle(
                  fontSize: 26,
                  fontWeight: FontWeight.w800,
                  color: color,
                  letterSpacing: -0.5,
                ),
              ),
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: const TextStyle(
                fontSize: 12,
                fontWeight: FontWeight.w500,
                color: AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    ).animate().fadeIn(duration: 400.ms).slideY(begin: 0.08, curve: Curves.easeOut);
  }
}

/// RAG status badge.
class RagBadge extends StatelessWidget {
  const RagBadge(this.rag, {super.key});
  final String rag;

  @override
  Widget build(BuildContext context) {
    final (color, bg, label) = switch (rag) {
      'RED'   => (AppColors.ragRed,   AppColors.ragRedBg,   'RED'),
      'AMBER' => (AppColors.ragAmber, AppColors.ragAmberBg, 'AMBER'),
      _       => (AppColors.ragGreen, AppColors.ragGreenBg, 'GREEN'),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.4)),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(
              color: color,
              shape: BoxShape.circle,
            ),
          ),
          const SizedBox(width: 5),
          Text(
            label,
            style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w700,
              color: color,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}

/// Priority colour badge.
class PriorityBadge extends StatelessWidget {
  const PriorityBadge(this.priority, {super.key});
  final String priority;

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (priority) {
      'CRITICAL' => (AppColors.priorityCritical, 'Critical'),
      'HIGH'     => (AppColors.priorityHigh,     'High'),
      'LOW'      => (AppColors.priorityLow,      'Low'),
      _          => (AppColors.priorityMedium,   'Medium'),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(5),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 10,
          fontWeight: FontWeight.w700,
          color: color,
        ),
      ),
    );
  }
}

/// Task status chip.
class StatusChip extends StatelessWidget {
  const StatusChip(this.status, {super.key});
  final String status;

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (status) {
      'DONE'        => (AppColors.success, 'Done'),
      'IN_PROGRESS' => (AppColors.info,    'In Progress'),
      'BLOCKED'     => (AppColors.error,   'Blocked'),
      'OPEN'        => (AppColors.warning, 'Open'),
      _             => (AppColors.textMuted, status),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Text(
        label,
        style: TextStyle(
          fontSize: 11,
          fontWeight: FontWeight.w600,
          color: color,
        ),
      ),
    );
  }
}

/// Loading shimmer placeholder.
class ShimmerCard extends StatelessWidget {
  const ShimmerCard({super.key, this.height = 80});
  final double height;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      height: height,
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: BoxDecoration(
        color: ds.bgElevated,
        borderRadius: BorderRadius.circular(16),
      ),
    ).animate(onPlay: (c) => c.repeat()).shimmer(
          duration: 1200.ms,
          color: ds.border,
        );
  }
}
