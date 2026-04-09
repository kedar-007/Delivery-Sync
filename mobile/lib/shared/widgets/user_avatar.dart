import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';

import '../../core/services/token_manager.dart';

/// A reliable, reusable avatar widget. Shows a coloured circle with initials
/// when no photo URL is available. Falls back to initials on image error.
class UserAvatar extends StatelessWidget {
  const UserAvatar({
    super.key,
    required this.name,
    this.avatarUrl,
    this.radius = 22,
    this.fontSize,
    this.onTap,
    this.border = true,
  });

  final String name;
  final String? avatarUrl;
  final double radius;
  final double? fontSize;
  final VoidCallback? onTap;
  final bool border;

  @override
  Widget build(BuildContext context) {
    final initials = _initials(name);
    final bgColor  = _colorFromName(name);
    final size     = radius * 2;
    final fs       = fontSize ?? (radius * 0.65);

    Widget avatar = Container(
      width: size, height: size,
      decoration: BoxDecoration(
        shape: BoxShape.circle,
        color: bgColor,
        border: border
            ? Border.all(color: Colors.white.withOpacity(0.4), width: 2)
            : null,
      ),
      child: ClipOval(
        child: avatarUrl != null && avatarUrl!.isNotEmpty
            ? CachedNetworkImage(
                imageUrl: avatarUrl!,
                httpHeaders: _headersFor(avatarUrl!),
                fit: BoxFit.cover,
                placeholder: (_, __) => _initialsWidget(initials, fs),
                errorWidget:  (_, __, ___) => _initialsWidget(initials, fs),
              )
            : _initialsWidget(initials, fs),
      ),
    );

    if (onTap != null) {
      return GestureDetector(onTap: onTap, child: avatar);
    }
    return avatar;
  }

  /// Only attach the Zoho OAuth token for our own Catalyst backend URLs.
  /// Zoho profile CDN (zohostratus.in, zoho.com, etc.) uses public URLs
  /// and rejects the token header, causing image load failures.
  static Map<String, String> _headersFor(String url) {
    final isCatalyst = url.contains('catalystserverless') ||
        url.contains('catalyst.zoho');
    if (!isCatalyst) return const {};
    final token = TokenManager.instance.token;
    return token != null ? {'Authorization': 'Zoho-oauthtoken $token'} : const {};
  }

  Widget _initialsWidget(String text, double fs) => Center(
    child: Text(
      text,
      style: TextStyle(
        color: Colors.white,
        fontWeight: FontWeight.w800,
        fontSize: fs,
        letterSpacing: 0.5,
      ),
    ),
  );

  static String _initials(String name) {
    final parts = name.trim().split(' ').where((s) => s.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts[0][0].toUpperCase();
    return (parts[0][0] + parts.last[0]).toUpperCase();
  }

  /// Deterministic color from a name — always the same for the same name.
  static Color _colorFromName(String name) {
    const colors = [
      Color(0xFF4F46E5), // indigo
      Color(0xFF7C3AED), // violet
      Color(0xFF0EA5E9), // sky
      Color(0xFF10B981), // emerald
      Color(0xFFF59E0B), // amber
      Color(0xFFEF4444), // red
      Color(0xFF8B5CF6), // purple
      Color(0xFF06B6D4), // cyan
      Color(0xFFF97316), // orange
      Color(0xFF14B8A6), // teal
    ];
    if (name.isEmpty) return colors[0];
    final hash = name.codeUnits.fold(0, (a, b) => a + b);
    return colors[hash % colors.length];
  }
}
