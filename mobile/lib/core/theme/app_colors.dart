import 'package:flutter/material.dart';

/// DS brand colour palette — supports both light and dark themes.
class AppColors {
  AppColors._();

  // ── Brand (shared) ────────────────────────────────────────────────────────
  static const Color primary         = Color(0xFF4F46E5);
  static const Color primaryLight    = Color(0xFF6366F1);
  static const Color primaryDark     = Color(0xFF3730A3);
  static const Color accent          = Color(0xFF818CF8);

  // ── Surface / background (dark mode) ─────────────────────────────────────
  static const Color bgDeep          = Color(0xFF070B14);
  static const Color bgDark          = Color(0xFF0A0F1E);
  static const Color bgSurface       = Color(0xFF0F1729);
  static const Color bgCard          = Color(0xFF141D35);
  static const Color bgElevated      = Color(0xFF1E2D4D);

  // ── Text (dark mode) ─────────────────────────────────────────────────────
  static const Color textPrimary     = Color(0xFFE2E8F0);
  static const Color textSecondary   = Color(0xFF94A3B8);
  static const Color textMuted       = Color(0xFF475569);
  static const Color textInverse     = Color(0xFF0F1729);

  // ── Borders (dark mode) ───────────────────────────────────────────────────
  static const Color border          = Color(0x336366F1);
  static const Color borderSubtle    = Color(0x1A6366F1);

  // ── Semantic ─────────────────────────────────────────────────────────────
  static const Color success         = Color(0xFF10B981);
  static const Color successBg       = Color(0x1A10B981);
  static const Color warning         = Color(0xFFF59E0B);
  static const Color warningBg       = Color(0x1AF59E0B);
  static const Color error           = Color(0xFFF87171);
  static const Color errorBg         = Color(0x1AF87171);
  static const Color info            = Color(0xFF60A5FA);
  static const Color infoBg          = Color(0x1A60A5FA);

  // ── RAG ──────────────────────────────────────────────────────────────────
  static const Color ragRed          = Color(0xFFF87171);
  static const Color ragRedBg        = Color(0x26F87171);
  static const Color ragAmber        = Color(0xFFFBBF24);
  static const Color ragAmberBg      = Color(0x26FBBF24);
  static const Color ragGreen        = Color(0xFF34D399);
  static const Color ragGreenBg      = Color(0x2634D399);

  // ── Priority ─────────────────────────────────────────────────────────────
  static const Color priorityCritical = Color(0xFFF87171);
  static const Color priorityHigh     = Color(0xFFFB923C);
  static const Color priorityMedium   = Color(0xFFFBBF24);
  static const Color priorityLow      = Color(0xFF4ADE80);

  // ── Gradients ────────────────────────────────────────────────────────────
  static const LinearGradient primaryGradient = LinearGradient(
    colors: [Color(0xFF4F46E5), Color(0xFF6366F1), Color(0xFF818CF8)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
  static const LinearGradient bgGradient = LinearGradient(
    colors: [Color(0xFF070B14), Color(0xFF0D1B35), Color(0xFF0F1729)],
    begin: Alignment.topCenter,
    end: Alignment.bottomCenter,
  );
  static const LinearGradient cardGradient = LinearGradient(
    colors: [Color(0xFF141D35), Color(0xFF0F1729)],
    begin: Alignment.topLeft,
    end: Alignment.bottomRight,
  );
}

/// Adaptive surface colours — register as a [ThemeExtension] so widgets can
/// call `Theme.of(context).extension<DsColors>()!` for adaptive values.
class DsColors extends ThemeExtension<DsColors> {
  const DsColors({
    required this.bgPage,
    required this.bgCard,
    required this.bgElevated,
    required this.bgInput,
    required this.textPrimary,
    required this.textSecondary,
    required this.textMuted,
    required this.border,
    required this.navBar,
  });

  final Color bgPage;
  final Color bgCard;
  final Color bgElevated;
  final Color bgInput;
  final Color textPrimary;
  final Color textSecondary;
  final Color textMuted;
  final Color border;
  final Color navBar;

  static const DsColors dark = DsColors(
    bgPage:       Color(0xFF0A0F1E),
    bgCard:       Color(0xFF141D35),
    bgElevated:   Color(0xFF1E2D4D),
    bgInput:      Color(0xFF1A2540),
    textPrimary:  Color(0xFFE2E8F0),
    textSecondary:Color(0xFF94A3B8),
    textMuted:    Color(0xFF475569),
    border:       Color(0x336366F1),
    navBar:       Color(0xFF0F1729),
  );

  static const DsColors light = DsColors(
    bgPage:       Color(0xFFF0F4FF),
    bgCard:       Color(0xFFFFFFFF),
    bgElevated:   Color(0xFFEEF2FF),
    bgInput:      Color(0xFFF8FAFF),
    textPrimary:  Color(0xFF1E293B),
    textSecondary:Color(0xFF475569),
    textMuted:    Color(0xFF94A3B8),
    border:       Color(0xFFE0E7FF),
    navBar:       Color(0xFFFFFFFF),
  );

  @override
  DsColors copyWith({
    Color? bgPage, Color? bgCard, Color? bgElevated, Color? bgInput,
    Color? textPrimary, Color? textSecondary, Color? textMuted,
    Color? border, Color? navBar,
  }) => DsColors(
    bgPage:       bgPage       ?? this.bgPage,
    bgCard:       bgCard       ?? this.bgCard,
    bgElevated:   bgElevated   ?? this.bgElevated,
    bgInput:      bgInput      ?? this.bgInput,
    textPrimary:  textPrimary  ?? this.textPrimary,
    textSecondary:textSecondary?? this.textSecondary,
    textMuted:    textMuted    ?? this.textMuted,
    border:       border       ?? this.border,
    navBar:       navBar       ?? this.navBar,
  );

  @override
  DsColors lerp(DsColors? other, double t) {
    if (other == null) return this;
    return DsColors(
      bgPage:       Color.lerp(bgPage, other.bgPage, t)!,
      bgCard:       Color.lerp(bgCard, other.bgCard, t)!,
      bgElevated:   Color.lerp(bgElevated, other.bgElevated, t)!,
      bgInput:      Color.lerp(bgInput, other.bgInput, t)!,
      textPrimary:  Color.lerp(textPrimary, other.textPrimary, t)!,
      textSecondary:Color.lerp(textSecondary, other.textSecondary, t)!,
      textMuted:    Color.lerp(textMuted, other.textMuted, t)!,
      border:       Color.lerp(border, other.border, t)!,
      navBar:       Color.lerp(navBar, other.navBar, t)!,
    );
  }
}

/// Convenient accessor: `context.ds` returns the current [DsColors].
extension DsColorsX on BuildContext {
  DsColors get ds =>
      Theme.of(this).extension<DsColors>() ?? DsColors.dark;
}
