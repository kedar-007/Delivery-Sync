/// AmbientFestival — persistent background particles on all screens.
/// Pointer-events are none (IgnorePointer), opacity 0.55–0.85, driven by
/// the announcementsProvider exactly like the web AmbientFestival component.
library;

import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/announcements/presentation/screens/announcements_screen.dart'
    show announcementsProvider;

// ── Ambient theme data (mirrors web AMBIENT_THEMES) ──────────────────────────

class _AT {
  const _AT({
    required this.chars,
    required this.colors,
    required this.animation,
  });
  final List<String> chars;
  final List<Color> colors;
  final _Anim animation;
}

enum _Anim { float, fall, twinkle, drift }

const _ambientThemes = <String, _AT>{
  'DIWALI': _AT(
    chars:  ['✨', '✦', '⭐', '✵', '🪔'],
    colors: [Color(0xFFE65C00), Color(0xFFCC8800), Color(0xFFCC4400), Color(0xFFB8860B), Color(0xFFCC2200)],
    animation: _Anim.float,
  ),
  'CHRISTMAS': _AT(
    chars:  ['❄', '❅', '❆', '✦', '*'],
    colors: [Color(0xFF0077CC), Color(0xFFCC0000), Color(0xFF007700), Color(0xFF8844CC), Color(0xFFCC6600)],
    animation: _Anim.fall,
  ),
  'HOLI': _AT(
    chars:  ['●', '◉', '◎', '○', '◆'],
    colors: [Color(0xFFDD0000), Color(0xFFCC5500), Color(0xFFAAAA00), Color(0xFF008800), Color(0xFF0044CC), Color(0xFF880099)],
    animation: _Anim.drift,
  ),
  'EID': _AT(
    chars:  ['★', '✦', '✧', '✵', '☽'],
    colors: [Color(0xFFCC9900), Color(0xFF996600), Color(0xFF007700), Color(0xFF005500), Color(0xFFAA7700)],
    animation: _Anim.twinkle,
  ),
  'NEW_YEAR': _AT(
    chars:  ['✨', '⭐', '★', '✦', '🎆'],
    colors: [Color(0xFFCC9900), Color(0xFF2244CC), Color(0xFF8800CC), Color(0xFFCC4400), Color(0xFF0066AA)],
    animation: _Anim.float,
  ),
  'NAVRATRI': _AT(
    chars:  ['✨', '✦', '★', '◆', '●'],
    colors: [Color(0xFFCC0055), Color(0xFFCC4400), Color(0xFFAA8800), Color(0xFF8800BB), Color(0xFFDD0077)],
    animation: _Anim.drift,
  ),
  'DUSSEHRA': _AT(
    chars:  ['✨', '⭐', '★', '✵', '✦'],
    colors: [Color(0xFFCC4400), Color(0xFFAA7700), Color(0xFFCC2200), Color(0xFF886600), Color(0xFFBB3300)],
    animation: _Anim.float,
  ),
  'PONGAL': _AT(
    chars:  ['🌾', '☀', '✨', '⭐', '✦'],
    colors: [Color(0xFFAA8800), Color(0xFFCC5500), Color(0xFFAA3300), Color(0xFF996600), Color(0xFFCC7700)],
    animation: _Anim.float,
  ),
  'EASTER': _AT(
    chars:  ['🌸', '✨', '◆', '●', '✦'],
    colors: [Color(0xFFCC44CC), Color(0xFF008866), Color(0xFFAAAA00), Color(0xFF4488CC), Color(0xFFCC6699)],
    animation: _Anim.drift,
  ),
};

// ── Particle data ─────────────────────────────────────────────────────────────

class _AP {
  const _AP({
    required this.xFrac,
    required this.startYFrac,
    required this.char,
    required this.color,
    required this.size,
    required this.phase,   // 0–1 stagger
    required this.speed,   // 0.7–1.3
    required this.opacity, // 0.55–0.85
  });
  final double xFrac, startYFrac, size, phase, speed, opacity;
  final String char;
  final Color color;
}

List<_AP> _buildParticles(_AT t, int n) {
  return List.generate(n, (i) {
    final startY = (t.animation == _Anim.fall || t.animation == _Anim.drift)
        ? 0.0
        : 0.95 + (i % 5) * 0.01;
    return _AP(
      xFrac:     (i * 137.508) % 100 / 100,
      startYFrac: startY,
      char:      t.chars[i % t.chars.length],
      color:     t.colors[i % t.colors.length],
      size:      16 + (i % 5) * 5.0,
      phase:     i / n,
      speed:     0.7 + (i % 7) * 0.09,
      opacity:   0.55 + (i % 4) * 0.075,
    );
  });
}

// ── Painter ───────────────────────────────────────────────────────────────────

class _AmbientPainter extends CustomPainter {
  _AmbientPainter({required this.t, required this.ps, required this.tick});
  final _AT t;
  final List<_AP> ps;
  final double tick; // 0–1 repeating

  @override
  void paint(Canvas canvas, Size size) {
    for (final p in ps) {
      final raw   = (tick / p.speed + p.phase) % 1.0;
      final phase = raw < 0 ? raw + 1 : raw;

      switch (t.animation) {
        case _Anim.float:  _float(canvas, p, phase, size);
        case _Anim.fall:   _fall(canvas,  p, phase, size);
        case _Anim.twinkle:_twinkle(canvas, p, phase, size);
        case _Anim.drift:  _drift(canvas, p, phase, size);
      }
    }
  }

  // Float: rises from bottom, fades out
  void _float(Canvas canvas, _AP p, double phase, Size size) {
    final x = p.xFrac * size.width;
    final y = size.height * (1 - phase * 1.15);
    final op = phase < 0.1
        ? phase / 0.1
        : phase > 0.8
            ? (1 - (phase - 0.8) / 0.2)
            : 1.0;
    _draw(canvas, p, x, y, p.opacity * op.clamp(0, 1),
        rotate: phase * 2 * math.pi);
  }

  // Fall: drops from top
  void _fall(Canvas canvas, _AP p, double phase, Size size) {
    final x = p.xFrac * size.width;
    final y = -p.size + phase * (size.height + p.size * 2);
    final op = phase < 0.05
        ? phase / 0.05
        : phase > 0.9
            ? (1 - (phase - 0.9) / 0.1)
            : 1.0;
    _draw(canvas, p, x, y, p.opacity * op.clamp(0, 1),
        rotate: phase * 3 * math.pi);
  }

  // Twinkle: stays in place, pulses opacity/scale
  void _twinkle(Canvas canvas, _AP p, double phase, Size size) {
    final x  = p.xFrac * size.width;
    final y  = p.startYFrac * size.height;
    final sc = 0.5 + 0.5 * (0.5 + 0.5 * math.cos(phase * 2 * math.pi));
    final op = 0.2 + 0.8 * (0.5 + 0.5 * math.sin(phase * 2 * math.pi));
    _draw(canvas, p, x, y, p.opacity * op.clamp(0, 1), scale: sc);
  }

  // Drift: diagonal float
  void _drift(Canvas canvas, _AP p, double phase, Size size) {
    final x = p.xFrac * size.width +
        math.sin(phase * 2 * math.pi) * size.width * 0.05;
    final y = -p.size + phase * (size.height + p.size * 2);
    final op = phase < 0.05
        ? phase / 0.05
        : phase > 0.9
            ? (1 - (phase - 0.9) / 0.1)
            : 1.0;
    _draw(canvas, p, x, y, p.opacity * op.clamp(0, 1),
        rotate: phase * math.pi);
  }

  void _draw(Canvas canvas, _AP p, double x, double y, double opacity,
      {double rotate = 0, double scale = 1.0}) {
    if (opacity <= 0.02) return;
    canvas.save();
    canvas.translate(x, y);
    if (rotate != 0) canvas.rotate(rotate);
    if (scale != 1.0) canvas.scale(scale, scale);

    final tp = TextPainter(
      text: TextSpan(
        text: p.char,
        style: TextStyle(
          fontSize: p.size,
          color: p.color.withOpacity(opacity.clamp(0, 1)),
          shadows: [
            // Colour glow (dark bg) + dark outline (light bg) — works on any bg
            Shadow(color: p.color.withOpacity((opacity * 0.9).clamp(0, 1)),
                blurRadius: p.size * 0.4),
            const Shadow(color: Color(0xA0000000), blurRadius: 3,
                offset: Offset(0, 1)),
          ],
        ),
      ),
      textDirection: ui.TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(-tp.width / 2, -tp.height / 2));
    canvas.restore();
  }

  @override
  bool shouldRepaint(_AmbientPainter old) => old.tick != tick;
}

// ── Widget ────────────────────────────────────────────────────────────────────

/// Drop this into any Stack (or MaterialApp builder) to get ambient particles.
/// It detects the active festival from announcements and renders accordingly.
/// Uses IgnorePointer so it never blocks taps.
class AmbientFestival extends ConsumerStatefulWidget {
  const AmbientFestival({super.key});

  @override
  ConsumerState<AmbientFestival> createState() => _AmbientFestivalState();
}

class _AmbientFestivalState extends ConsumerState<AmbientFestival>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  String? _activeKey;
  List<_AP> _particles = [];

  @override
  void initState() {
    super.initState();
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 12),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  void _updateTheme(String? key) {
    if (key == _activeKey) return;
    _activeKey = key;
    if (key == null) {
      _particles = [];
    } else {
      final t = _ambientThemes[key];
      _particles = t != null ? _buildParticles(t, 28) : [];
    }
  }

  String? _detectKey(String title, String? festivalKey, String? expiresAt) {
    if (festivalKey?.isNotEmpty == true) {
      final k = festivalKey!.toUpperCase();
      if (_ambientThemes.containsKey(k)) return k;
    }
    if (expiresAt != null) {
      final k = expiresAt.toUpperCase().replaceAll(RegExp(r'[\s\-]'), '_');
      if (_ambientThemes.containsKey(k)) return k;
    }
    final upper = title.toUpperCase();
    for (final key in _ambientThemes.keys) {
      if (upper.contains(key)) return key;
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final announcements = ref.watch(announcementsProvider);
    final size = MediaQuery.sizeOf(context);

    String? festivalKey;
    announcements.whenData((list) {
      final today = DateTime.now().toIso8601String().substring(0, 10);
      try {
        final ann = list.firstWhere(
          (a) =>
              a.subtype == 'FESTIVAL' &&
              (a.expiresAt == null || a.expiresAt!.compareTo(today) >= 0),
        );
        festivalKey = _detectKey(ann.title, ann.festivalKey, ann.expiresAt);
      } catch (_) {}
    });

    _updateTheme(festivalKey);

    if (_activeKey == null || _particles.isEmpty) return const SizedBox.shrink();

    final theme = _ambientThemes[_activeKey]!;

    return IgnorePointer(
      child: AnimatedBuilder(
        animation: _ctrl,
        builder: (_, __) => CustomPaint(
          size: size,
          painter: _AmbientPainter(t: theme, ps: _particles, tick: _ctrl.value),
        ),
      ),
    );
  }
}
