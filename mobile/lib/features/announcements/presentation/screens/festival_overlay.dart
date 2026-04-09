/// Festival announcement overlay — mirrors the web FestivalOverlay component.
/// Shown automatically when a FESTIVAL-subtype announcement is unread.
/// Particles are rendered via CustomPainter for smooth, stable animation.
library;

import 'dart:math' as math;
import 'dart:ui' as ui;

import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/services/api_client.dart';
import '../../../../core/constants/app_constants.dart';
import 'announcements_screen.dart' show announcementsProvider;

// ── Theme definitions (mirrors web FestivalOverlay) ───────────────────────────

class _FT {
  const _FT({
    required this.name,
    required this.emoji,
    required this.overlay,
    required this.glowColor,
    required this.textColor,
    required this.accentColor,
    required this.cardBg,
    required this.ptype,
    required this.colors,
    required this.greeting,
    this.chars,
  });

  final String name, emoji, greeting;
  final Color overlay, glowColor, textColor, accentColor, cardBg;
  final _PT ptype;
  final List<Color> colors;
  final List<String>? chars;
}

enum _PT { fireworks, snow, confetti, stars, colors }

const _themes = <String, _FT>{
  'DIWALI': _FT(
    name: 'Diwali', emoji: '🪔',
    overlay: Color(0xD0280500), glowColor: Color(0x99FF9800),
    textColor: Color(0xFFFFD700), accentColor: Color(0xFFFF8C00),
    cardBg: Color(0xEE3C0F00), ptype: _PT.fireworks,
    colors: [Color(0xFFFF6B35), Color(0xFFFFD700), Color(0xFFFF3366), Color(0xFFFF9933), Color(0xFFCC33FF), Color(0xFFFFCC00), Color(0xFFFF6600), Color(0xFFFFEE00), Color(0xFFFF0066), Color(0xFFFFFFFF)],
    greeting: '✨ May the festival of lights bring joy, prosperity and happiness!',
  ),
  'CHRISTMAS': _FT(
    name: 'Christmas', emoji: '🎄',
    overlay: Color(0xCC051E05), glowColor: Color(0x72FF5050),
    textColor: Color(0xFFF8F8F8), accentColor: Color(0xFFFF4444),
    cardBg: Color(0xE80A230A), ptype: _PT.snow,
    colors: [Color(0xFFFFFFFF), Color(0xFFFF4444), Color(0xFF22CC22), Color(0xFFFFD700), Color(0xFFAAFFAA), Color(0xFFFFAAAA)],
    chars: ['❄', '❅', '❆', '✦', '*'],
    greeting: '🎁 Wishing you a very Merry Christmas! May your days be merry and bright!',
  ),
  'HOLI': _FT(
    name: 'Holi', emoji: '🌈',
    overlay: Color(0xC00A0014), glowColor: Color(0x66FF00C8),
    textColor: Color(0xFFFFFFFF), accentColor: Color(0xFFFF66FF),
    cardBg: Color(0xE00F001E), ptype: _PT.colors,
    colors: [Color(0xFFFF0000), Color(0xFFFF6600), Color(0xFFFFEE00), Color(0xFF00EE00), Color(0xFF0066FF), Color(0xFFCC00FF), Color(0xFFFF0099), Color(0xFF00FFEE)],
    greeting: '🎨 Happy Holi! May the colors fill your life with happiness and prosperity!',
  ),
  'EID': _FT(
    name: 'Eid', emoji: '🌙',
    overlay: Color(0xD0001408), glowColor: Color(0x80FFDC00),
    textColor: Color(0xFFFFD700), accentColor: Color(0xFFFFCC00),
    cardBg: Color(0xEE00190C), ptype: _PT.stars,
    colors: [Color(0xFFFFD700), Color(0xFFFFEE44), Color(0xFFFFFFFF), Color(0xFFAAFFAA), Color(0xFFFFCC44)],
    chars: ['★', '✦', '✧', '✨', '☽', '⭐', '✵'],
    greeting: '🌙 Eid Mubarak! May Allah bless you with peace, happiness and prosperity!',
  ),
  'NEW_YEAR': _FT(
    name: 'New Year', emoji: '🎆',
    overlay: Color(0xD000001E), glowColor: Color(0x806464FF),
    textColor: Color(0xFFFFFFFF), accentColor: Color(0xFFFFD700),
    cardBg: Color(0xEE050532), ptype: _PT.confetti,
    colors: [Color(0xFFFF4444), Color(0xFF4466FF), Color(0xFF44FF66), Color(0xFFFFD700), Color(0xFFFF44FF), Color(0xFF44FFFF), Color(0xFFFFFFFF)],
    greeting: '🎆 Happy New Year! Wishing you joy, success and happiness in the year ahead!',
  ),
  'NAVRATRI': _FT(
    name: 'Navratri', emoji: '💃',
    overlay: Color(0xC7190014), glowColor: Color(0x72FF0096),
    textColor: Color(0xFFFF99CC), accentColor: Color(0xFFFF44AA),
    cardBg: Color(0xEE23001C), ptype: _PT.colors,
    colors: [Color(0xFFFF0066), Color(0xFFFF6600), Color(0xFFFFCC00), Color(0xFF00CCFF), Color(0xFF9900FF), Color(0xFFFF3399)],
    greeting: '💃 Happy Navratri! May Goddess Durga bless you with strength and joy!',
  ),
  'DUSSEHRA': _FT(
    name: 'Dussehra', emoji: '🏹',
    overlay: Color(0xCC190300), glowColor: Color(0x80FF6400),
    textColor: Color(0xFFFF8800), accentColor: Color(0xFFFF3300),
    cardBg: Color(0xEE1E0600), ptype: _PT.fireworks,
    colors: [Color(0xFFFF6600), Color(0xFFFF3300), Color(0xFFFFD700), Color(0xFFFF9900), Color(0xFFFFCC00), Color(0xFFFFFFFF)],
    greeting: '🏹 Happy Dussehra! May good always triumph over evil!',
  ),
  'PONGAL': _FT(
    name: 'Pongal', emoji: '🍯',
    overlay: Color(0xCC190A00), glowColor: Color(0x80FFC800),
    textColor: Color(0xFFFFCC00), accentColor: Color(0xFFFF6600),
    cardBg: Color(0xEE1E0E00), ptype: _PT.fireworks,
    colors: [Color(0xFFFFCC00), Color(0xFFFF6600), Color(0xFFFF3300), Color(0xFFFFAA00), Color(0xFFFFFFFF), Color(0xFFFFDD44)],
    greeting: '🌾 Happy Pongal! May this harvest festival bring abundant blessings!',
  ),
  'EASTER': _FT(
    name: 'Easter', emoji: '🐣',
    overlay: Color(0xCC0A051E), glowColor: Color(0x66C864FF),
    textColor: Color(0xFFFFCCFF), accentColor: Color(0xFFFF99FF),
    cardBg: Color(0xEE0F0823), ptype: _PT.confetti,
    colors: [Color(0xFFFF99FF), Color(0xFF99FFCC), Color(0xFFFFFF99), Color(0xFF99CCFF), Color(0xFFFFCC99), Color(0xFFFF99CC)],
    greeting: '🐣 Happy Easter! May this special day bring joy, peace and new beginnings!',
  ),
};

// ── Particle data ─────────────────────────────────────────────────────────────

class _P {
  const _P({
    required this.xFrac,
    required this.yFrac,
    required this.color,
    required this.size,
    required this.phaseOffset,   // 0-1 — stagger each particle's cycle
    required this.speed,         // multiplier on duration
    this.char,
    this.rotation = 0,
    this.isRect = false,
  });

  final double xFrac, yFrac, phaseOffset, size, speed;
  final Color color;
  final String? char;
  final double rotation;
  final bool isRect;
}

List<_P> _gen(_FT t, int n) {
  return List.generate(n, (i) {
    final c   = t.colors[i % t.colors.length];
    final ch  = t.chars != null ? t.chars![i % t.chars!.length] : null;

    double sz;
    switch (t.ptype) {
      case _PT.snow:     sz = 20 + (i % 4) * 10.0;
      case _PT.colors:   sz = 50 + (i % 6) * 28.0;
      case _PT.stars:    sz = 18 + (i % 5) * 8.0;
      case _PT.confetti: sz = 12 + (i % 4) * 6.0;
      case _PT.fireworks: sz = 14 + (i % 6) * 7.0;
    }

    double sp;
    switch (t.ptype) {
      case _PT.snow:      sp = 0.7 + (i % 5) * 0.12;
      case _PT.fireworks: sp = 0.8 + (i % 4) * 0.15;
      case _PT.stars:     sp = 0.6 + (i % 5) * 0.2;
      default:            sp = 0.7 + (i % 5) * 0.14;
    }

    return _P(
      xFrac:       (i * 137.508) % 100 / 100,
      yFrac:       t.ptype == _PT.fireworks ? (8 + (i * 41) % 70) / 100
                 : t.ptype == _PT.stars     ? (i * 71) % 90 / 100
                 : 0,
      color:       c,
      size:        sz,
      phaseOffset: (i / n),
      speed:       sp,
      char:        ch,
      rotation:    (i * 73) % 360 * math.pi / 180,
      isRect:      i % 3 != 0,
    );
  });
}

// ── CustomPainter ─────────────────────────────────────────────────────────────

class _ParticlePainter extends CustomPainter {
  _ParticlePainter({required this.t, required this.ps, required this.tick});
  final _FT t;
  final List<_P> ps;
  final double tick; // 0-1 global time, repeating

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint();
    for (final p in ps) {
      // Per-particle phase: offset so they stagger
      final raw = (tick / p.speed + p.phaseOffset) % 1.0;
      final phase = raw < 0 ? raw + 1 : raw;

      final x = p.xFrac * size.width;

      switch (t.ptype) {
        case _PT.fireworks: _fw(canvas, paint, p, phase, x, size);
        case _PT.snow:      _snow(canvas, paint, p, phase, x, size);
        case _PT.confetti:  _conf(canvas, paint, p, phase, x, size);
        case _PT.stars:     _star(canvas, paint, p, phase, x, size);
        case _PT.colors:    _blob(canvas, paint, p, phase, x, size);
      }
    }
  }

  // Firework burst + ring
  void _fw(Canvas canvas, Paint paint, _P p, double phase, double x, Size size) {
    final y = p.yFrac * size.height;
    final scale = phase * 3.2;
    final opacity = phase < 0.65 ? phase / 0.65 : (1 - (phase - 0.65) / 0.35);
    if (opacity <= 0.01) return;

    // Glow circle
    paint
      ..color = p.color.withOpacity((opacity * 0.9).clamp(0, 1))
      ..style = PaintingStyle.fill
      ..maskFilter = MaskFilter.blur(BlurStyle.normal, p.size * 0.8);
    canvas.drawCircle(Offset(x, y), p.size * scale / 2, paint);

    // Ring
    paint
      ..color = p.color.withOpacity((opacity * 0.7).clamp(0, 1))
      ..style = PaintingStyle.stroke
      ..strokeWidth = 2.5
      ..maskFilter = MaskFilter.blur(BlurStyle.normal, 3);
    canvas.drawCircle(Offset(x, y), p.size * scale, paint);

    paint
      ..style = PaintingStyle.fill
      ..maskFilter = null;
  }

  // Falling snow/chars
  void _snow(Canvas canvas, Paint paint, _P p, double phase, double x, Size size) {
    final y = -p.size + phase * (size.height + p.size * 2);
    final opacity = phase < 0.05 ? phase / 0.05 : phase > 0.9 ? (1 - (phase - 0.9) / 0.1) : 1.0;
    if (opacity <= 0.01) return;
    _drawChar(canvas, p.char ?? '❄', x, y, p.size, p.color.withOpacity(opacity.clamp(0, 1)), p.color);
  }

  // Confetti
  void _conf(Canvas canvas, Paint paint, _P p, double phase, double x, Size size) {
    final y = -p.size + phase * (size.height + p.size * 2);
    final opacity = phase < 0.05 ? phase / 0.05 : phase > 0.9 ? (1 - (phase - 0.9) / 0.1) : 1.0;
    if (opacity <= 0.01) return;

    canvas.save();
    canvas.translate(x, y);
    canvas.rotate(p.rotation + phase * 6 * math.pi);
    paint
      ..color = p.color.withOpacity(opacity.clamp(0, 1))
      ..style = PaintingStyle.fill
      ..maskFilter = null;

    if (p.isRect) {
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(center: Offset.zero, width: p.size * 0.5, height: p.size),
          const Radius.circular(2),
        ),
        paint,
      );
    } else {
      canvas.drawCircle(Offset.zero, p.size * 0.4, paint);
    }
    canvas.restore();
  }

  // Twinkling stars
  void _star(Canvas canvas, Paint paint, _P p, double phase, double x, Size size) {
    final y = p.yFrac * size.height;
    // Twinkle: sine wave on opacity + scale
    final t2 = (phase * 2 * math.pi);
    final opacity = 0.25 + 0.75 * (0.5 + 0.5 * math.sin(t2));
    final scale   = 0.5 + 0.5 * (0.5 + 0.5 * math.cos(t2));
    if (opacity <= 0.05) return;
    _drawChar(canvas, p.char ?? '★', x, y, p.size * scale, p.color.withOpacity(opacity.clamp(0, 1)), p.color);
  }

  // Color blobs (Holi / Navratri)
  void _blob(Canvas canvas, Paint paint, _P p, double phase, double x, Size size) {
    final y = p.yFrac * size.height + phase * size.height * 0.5;
    final scale = phase * 3.0;
    final opacity = phase < 0.6 ? phase / 0.6 : (1 - (phase - 0.6) / 0.4);
    if (opacity <= 0.01) return;

    paint
      ..color = p.color.withOpacity((opacity * 0.85).clamp(0, 1))
      ..style = PaintingStyle.fill
      ..maskFilter = MaskFilter.blur(BlurStyle.normal, p.size * 0.6);
    canvas.drawCircle(Offset(x, y), p.size * scale / 2, paint);
    paint.maskFilter = null;
  }

  void _drawChar(Canvas canvas, String char, double x, double y, double size, Color color, Color glowColor) {
    final tp = TextPainter(
      text: TextSpan(
        text: char,
        style: TextStyle(
          fontSize: size,
          color: color,
          shadows: [
            Shadow(color: glowColor.withOpacity(0.9), blurRadius: size),
            Shadow(color: glowColor.withOpacity(0.5), blurRadius: size * 2),
          ],
        ),
      ),
      textDirection: ui.TextDirection.ltr,
    )..layout();
    tp.paint(canvas, Offset(x - tp.width / 2, y - tp.height / 2));
  }

  @override
  bool shouldRepaint(_ParticlePainter old) => old.tick != tick;
}

// ── Provider + overlay widget ─────────────────────────────────────────────────

class FestivalOverlay extends ConsumerStatefulWidget {
  const FestivalOverlay({super.key});

  @override
  ConsumerState<FestivalOverlay> createState() => _FestivalOverlayState();
}

class _FestivalOverlayState extends ConsumerState<FestivalOverlay> {
  String? _dismissedId;

  @override
  Widget build(BuildContext context) {
    final announcements = ref.watch(announcementsProvider);

    final ann = announcements.whenData((list) {
      try {
        return list.firstWhere(
          (a) => a.subtype == 'FESTIVAL' && !a.isRead && a.id != _dismissedId,
        );
      } catch (_) {
        return null;
      }
    }).valueOrNull;

    if (ann == null) return const SizedBox.shrink();

    final festivalKey = (ann.festivalKey?.isNotEmpty == true
            ? ann.festivalKey!.toUpperCase()
            : _detectKey(ann.title, ann.expiresAt));

    final theme = festivalKey != null ? _themes[festivalKey] : null;
    if (theme == null) return const SizedBox.shrink();

    return _FestivalScreen(
      key: ValueKey(ann.id),
      theme: theme,
      title: ann.title,
      content: ann.content,
      onDismiss: () async {
        setState(() => _dismissedId = ann.id);
        try {
          await ApiClient.instance.patch(
            '${AppConstants.basePeople}/announcements/${ann.id}/read',
            data: {},
          );
          ref.invalidate(announcementsProvider);
        } catch (_) {}
      },
    );
  }

  String? _detectKey(String title, String? extra) {
    if (extra != null) {
      final k = extra.toUpperCase().replaceAll(RegExp(r'[\s\-]'), '_');
      if (_themes.containsKey(k)) return k;
    }
    final upper = title.toUpperCase();
    for (final key in _themes.keys) {
      if (upper.contains(key) || upper.contains(_themes[key]!.name.toUpperCase())) return key;
    }
    return null;
  }
}

// ── Full-screen festival widget (StatefulWidget for stable AnimationController)

class _FestivalScreen extends StatefulWidget {
  const _FestivalScreen({
    super.key,
    required this.theme,
    required this.title,
    required this.content,
    required this.onDismiss,
  });

  final _FT theme;
  final String title, content;
  final VoidCallback onDismiss;

  @override
  State<_FestivalScreen> createState() => _FestivalScreenState();
}

class _FestivalScreenState extends State<_FestivalScreen>
    with SingleTickerProviderStateMixin {
  late AnimationController _ctrl;
  late List<_P> _particles;

  @override
  void initState() {
    super.initState();
    _particles = _gen(widget.theme, 55);
    _ctrl = AnimationController(
      vsync: this,
      duration: const Duration(seconds: 8),
    )..repeat();
  }

  @override
  void dispose() {
    _ctrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final size = MediaQuery.sizeOf(context);
    final t    = widget.theme;

    return GestureDetector(
      onTap: widget.onDismiss,
      child: Material(
        color: Colors.transparent,
        child: SizedBox.expand(
          child: Stack(
            clipBehavior: Clip.none,
            children: [
              // ── Background overlay ─────────────────────────────────────
              Positioned.fill(child: ColoredBox(color: t.overlay)),

              // ── Radial glow ────────────────────────────────────────────
              Positioned.fill(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: RadialGradient(
                      radius: 0.85,
                      colors: [t.glowColor, Colors.transparent],
                    ),
                  ),
                ),
              ),

              // ── Particles via CustomPainter ────────────────────────────
              Positioned.fill(
                child: AnimatedBuilder(
                  animation: _ctrl,
                  builder: (_, __) => CustomPaint(
                    size: size,
                    painter: _ParticlePainter(
                      t: t, ps: _particles, tick: _ctrl.value,
                    ),
                  ),
                ),
              ),

              // ── Close button ───────────────────────────────────────────
              Positioned(
                top: MediaQuery.paddingOf(context).top + 12,
                right: 16,
                child: GestureDetector(
                  onTap: widget.onDismiss,
                  child: Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: Colors.white.withOpacity(0.18),
                      border: Border.all(color: Colors.white.withOpacity(0.35)),
                    ),
                    child: const Icon(Icons.close_rounded, color: Colors.white, size: 20),
                  ),
                ),
              ),

              // ── Content card ───────────────────────────────────────────
              Center(
                child: GestureDetector(
                  onTap: () {}, // prevent dismiss
                  child: Container(
                    margin: const EdgeInsets.symmetric(horizontal: 24),
                    padding: const EdgeInsets.fromLTRB(28, 36, 28, 28),
                    decoration: BoxDecoration(
                      color: t.cardBg,
                      borderRadius: BorderRadius.circular(28),
                      border: Border.all(
                        color: t.accentColor.withOpacity(0.45), width: 1.5),
                      boxShadow: [
                        BoxShadow(color: t.accentColor.withOpacity(0.35), blurRadius: 60),
                        BoxShadow(color: t.glowColor.withOpacity(0.5),   blurRadius: 30),
                        const BoxShadow(color: Colors.black54, blurRadius: 40, offset: Offset(0, 12)),
                      ],
                    ),
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        // Pulsing emoji
                        AnimatedBuilder(
                          animation: _ctrl,
                          builder: (_, __) {
                            final pulse = 1 + 0.08 * math.sin(_ctrl.value * 2 * math.pi * 2);
                            return Transform.scale(
                              scale: pulse,
                              child: Text(t.emoji,
                                  style: const TextStyle(fontSize: 72)),
                            );
                          },
                        ),
                        const SizedBox(height: 14),

                        // Shimmering title
                        ShaderMask(
                          shaderCallback: (r) => LinearGradient(
                            colors: [t.textColor, t.accentColor, Colors.white, t.accentColor, t.textColor],
                          ).createShader(r),
                          child: Text(
                            widget.title,
                            textAlign: TextAlign.center,
                            style: const TextStyle(
                              fontSize: 24, fontWeight: FontWeight.w800,
                              color: Colors.white, letterSpacing: -0.3, height: 1.2,
                            ),
                          ),
                        ),

                        const SizedBox(height: 12),

                        // Festival badge
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
                          decoration: BoxDecoration(
                            color: t.accentColor.withOpacity(0.15),
                            borderRadius: BorderRadius.circular(20),
                            border: Border.all(color: t.accentColor.withOpacity(0.5)),
                          ),
                          child: Row(mainAxisSize: MainAxisSize.min, children: [
                            Text(t.emoji, style: const TextStyle(fontSize: 12)),
                            const SizedBox(width: 6),
                            Text(
                              t.name.toUpperCase(),
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w800,
                                  color: t.accentColor, letterSpacing: 1.5),
                            ),
                          ]),
                        ),

                        const SizedBox(height: 14),

                        // Greeting
                        Text(
                          t.greeting,
                          textAlign: TextAlign.center,
                          style: TextStyle(fontSize: 13, color: t.textColor, height: 1.65),
                        ),

                        // Custom content
                        if (widget.content.isNotEmpty && widget.content != widget.title) ...[
                          const SizedBox(height: 8),
                          Text(
                            widget.content,
                            textAlign: TextAlign.center,
                            style: TextStyle(fontSize: 12,
                                color: t.textColor.withOpacity(0.7), height: 1.6),
                            maxLines: 3, overflow: TextOverflow.ellipsis,
                          ),
                        ],

                        const SizedBox(height: 22),

                        // Celebrate button
                        SizedBox(
                          width: double.infinity,
                          child: ElevatedButton(
                            onPressed: widget.onDismiss,
                            style: ElevatedButton.styleFrom(
                              backgroundColor: t.accentColor,
                              foregroundColor: Colors.black,
                              padding: const EdgeInsets.symmetric(vertical: 14),
                              shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(14)),
                              elevation: 0,
                            ),
                            child: const Text('Celebrate! 🎉',
                                style: TextStyle(fontSize: 15, fontWeight: FontWeight.w800)),
                          ),
                        ),

                        const SizedBox(height: 10),
                        Text(
                          'Tap anywhere to dismiss',
                          style: TextStyle(fontSize: 10,
                              color: t.textColor.withOpacity(0.35), letterSpacing: 0.4),
                        ),
                      ],
                    ),
                  )
                  .animate()
                  .scale(begin: const Offset(0.15, 0.15), end: const Offset(1, 1),
                         duration: 700.ms, curve: Curves.elasticOut)
                  .fade(duration: 300.ms),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
