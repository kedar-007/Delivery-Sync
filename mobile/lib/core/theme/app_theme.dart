import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

class AppTheme {
  AppTheme._();

  // ── Dark ──────────────────────────────────────────────────────────────────
  static ThemeData get dark {
    final base = GoogleFonts.interTextTheme(ThemeData.dark().textTheme);
    return _build(
      brightness: Brightness.dark,
      base: base,
      ds: DsColors.dark,
      scheme: const ColorScheme.dark(
        primary:          AppColors.primary,
        primaryContainer: AppColors.primaryDark,
        secondary:        AppColors.accent,
        surface:          Color(0xFF141D35),
        onPrimary:        Colors.white,
        onSecondary:      Colors.white,
        onSurface:        AppColors.textPrimary,
        error:            AppColors.error,
      ),
      scaffoldBg:   AppColors.bgDark,
      appBarBg:     AppColors.bgDark,
      statusStyle:  const SystemUiOverlayStyle(
        statusBarColor:              Colors.transparent,
        statusBarIconBrightness:     Brightness.light,
        systemNavigationBarColor:    Colors.transparent,
        systemNavigationBarIconBrightness: Brightness.light,
      ),
    );
  }

  // ── Light ─────────────────────────────────────────────────────────────────
  static ThemeData get light {
    final base = GoogleFonts.interTextTheme(ThemeData.light().textTheme);
    return _build(
      brightness: Brightness.light,
      base: base,
      ds: DsColors.light,
      scheme: ColorScheme.light(
        primary:          AppColors.primary,
        primaryContainer: const Color(0xFFEEF2FF),
        secondary:        AppColors.accent,
        surface:          Colors.white,
        onPrimary:        Colors.white,
        onSecondary:      Colors.white,
        onSurface:        const Color(0xFF1E293B),
        error:            const Color(0xFFDC2626),
        outline:          const Color(0xFFE0E7FF),
      ),
      scaffoldBg:   const Color(0xFFF0F4FF),
      appBarBg:     const Color(0xFFF0F4FF),
      statusStyle:  const SystemUiOverlayStyle(
        statusBarColor:              Colors.transparent,
        statusBarIconBrightness:     Brightness.dark,
        systemNavigationBarColor:    Colors.transparent,
        systemNavigationBarIconBrightness: Brightness.dark,
      ),
    );
  }

  // ── Builder ───────────────────────────────────────────────────────────────
  static ThemeData _build({
    required Brightness brightness,
    required TextTheme base,
    required DsColors ds,
    required ColorScheme scheme,
    required Color scaffoldBg,
    required Color appBarBg,
    required SystemUiOverlayStyle statusStyle,
  }) {
    final isDark = brightness == Brightness.dark;
    final labelColor = isDark ? AppColors.textPrimary : const Color(0xFF1E293B);

    return ThemeData(
      useMaterial3: true,
      brightness: brightness,
      extensions: [ds],
      textTheme: base.copyWith(
        displayLarge:   base.displayLarge?.copyWith(fontWeight: FontWeight.w800, color: ds.textPrimary),
        displayMedium:  base.displayMedium?.copyWith(fontWeight: FontWeight.w700, color: ds.textPrimary),
        headlineLarge:  base.headlineLarge?.copyWith(fontWeight: FontWeight.w700, color: ds.textPrimary),
        headlineMedium: base.headlineMedium?.copyWith(fontWeight: FontWeight.w700, color: ds.textPrimary),
        headlineSmall:  base.headlineSmall?.copyWith(fontWeight: FontWeight.w600, color: ds.textPrimary),
        titleLarge:     base.titleLarge?.copyWith(fontWeight: FontWeight.w700, color: ds.textPrimary),
        titleMedium:    base.titleMedium?.copyWith(fontWeight: FontWeight.w600, color: ds.textPrimary),
        titleSmall:     base.titleSmall?.copyWith(fontWeight: FontWeight.w600, color: ds.textSecondary),
        bodyLarge:      base.bodyLarge?.copyWith(fontWeight: FontWeight.w400, color: ds.textPrimary),
        bodyMedium:     base.bodyMedium?.copyWith(fontWeight: FontWeight.w400, color: ds.textSecondary),
        bodySmall:      base.bodySmall?.copyWith(fontWeight: FontWeight.w400, color: ds.textMuted),
        labelLarge:     base.labelLarge?.copyWith(fontWeight: FontWeight.w700, color: labelColor),
        labelMedium:    base.labelMedium?.copyWith(fontWeight: FontWeight.w600, color: ds.textSecondary),
        labelSmall:     base.labelSmall?.copyWith(fontWeight: FontWeight.w500, color: ds.textMuted),
      ),
      colorScheme: scheme,
      scaffoldBackgroundColor: scaffoldBg,

      // ── AppBar ───────────────────────────────────────────────────────────
      appBarTheme: AppBarTheme(
        backgroundColor: appBarBg,
        foregroundColor: ds.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 0.5,
        shadowColor: ds.border,
        centerTitle: false,
        systemOverlayStyle: statusStyle,
        titleTextStyle: GoogleFonts.inter(
          fontSize: 18,
          fontWeight: FontWeight.w700,
          color: ds.textPrimary,
          letterSpacing: -0.4,
        ),
      ),

      // ── Card ─────────────────────────────────────────────────────────────
      cardTheme: CardThemeData(
        color: ds.bgCard,
        elevation: isDark ? 0 : 2,
        shadowColor: isDark ? Colors.transparent : const Color(0x0F4F46E5),
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: ds.border, width: 1),
        ),
        margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
      ),

      // ── Input ────────────────────────────────────────────────────────────
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: ds.bgInput,
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: ds.border),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: ds.border),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.primary, width: 2),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: const BorderSide(color: AppColors.error),
        ),
        labelStyle: TextStyle(color: ds.textSecondary),
        hintStyle: TextStyle(color: ds.textMuted),
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      ),

      // ── ElevatedButton ───────────────────────────────────────────────────
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          backgroundColor: AppColors.primary,
          foregroundColor: Colors.white,
          elevation: 0,
          shadowColor: Colors.transparent,
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
          textStyle: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 15),
        ),
      ),

      // ── OutlinedButton ───────────────────────────────────────────────────
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          foregroundColor: AppColors.primaryLight,
          side: BorderSide(color: ds.border),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 14),
        ),
      ),

      // ── BottomNavigationBar ──────────────────────────────────────────────
      bottomNavigationBarTheme: BottomNavigationBarThemeData(
        backgroundColor: ds.navBar,
        selectedItemColor: AppColors.primaryLight,
        unselectedItemColor: ds.textMuted,
        elevation: 0,
        type: BottomNavigationBarType.fixed,
        selectedLabelStyle: GoogleFonts.inter(fontSize: 11, fontWeight: FontWeight.w600),
        unselectedLabelStyle: GoogleFonts.inter(fontSize: 11),
      ),

      // ── Divider ──────────────────────────────────────────────────────────
      dividerTheme: DividerThemeData(
        color: ds.border, thickness: 1, space: 0,
      ),

      // ── Chip ─────────────────────────────────────────────────────────────
      chipTheme: ChipThemeData(
        backgroundColor: ds.bgElevated,
        labelStyle: GoogleFonts.inter(fontSize: 12, color: ds.textSecondary),
        side: BorderSide(color: ds.border),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(8)),
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      ),

      // ── SnackBar ─────────────────────────────────────────────────────────
      snackBarTheme: SnackBarThemeData(
        backgroundColor: ds.bgElevated,
        contentTextStyle: GoogleFonts.inter(color: ds.textPrimary),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        behavior: SnackBarBehavior.floating,
      ),

      // ── ListTile ─────────────────────────────────────────────────────────
      listTileTheme: ListTileThemeData(
        tileColor: Colors.transparent,
        iconColor: AppColors.primaryLight,
        textColor: ds.textPrimary,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
        contentPadding: const EdgeInsets.symmetric(horizontal: 12, vertical: 4),
      ),

      // ── TabBar ───────────────────────────────────────────────────────────
      tabBarTheme: TabBarThemeData(
        labelColor: AppColors.primaryLight,
        unselectedLabelColor: ds.textMuted,
        indicatorColor: AppColors.primaryLight,
        labelStyle: GoogleFonts.inter(fontSize: 13, fontWeight: FontWeight.w600),
        unselectedLabelStyle: GoogleFonts.inter(fontSize: 13),
        dividerColor: ds.border,
      ),

      // ── BottomSheet ───────────────────────────────────────────────────────
      bottomSheetTheme: BottomSheetThemeData(
        backgroundColor: ds.bgCard,
        modalBackgroundColor: ds.bgCard,
        shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
        ),
      ),
    );
  }
}
