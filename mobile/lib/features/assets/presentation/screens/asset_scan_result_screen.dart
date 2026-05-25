import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:intl/intl.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/user_avatar.dart';

/// Renders the response from `GET /assets/scan/<token>`.
///
/// The payload is shaped by the backend based on the caller's permission:
///   * `tier: 'FULL'`  → full asset record, current assignment, device credentials,
///                       and the full assignment history for this asset.
///   * `tier: 'BASIC'` → just owner + asset name/tag/category.
///
/// We always show the BASIC card up top; FULL tier adds the extra cards below.
class AssetScanResultScreen extends StatelessWidget {
  const AssetScanResultScreen({super.key, required this.payload});

  final Map<String, dynamic> payload;

  String _fmtDate(String? raw) {
    if (raw == null || raw.isEmpty) return '—';
    try {
      return DateFormat('MMM d, yyyy · hh:mm a').format(DateTime.parse(raw));
    } catch (_) {
      return raw;
    }
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final tier = payload['tier']?.toString() ?? 'BASIC';
    final asset = (payload['asset'] as Map?)?.cast<String, dynamic>() ?? {};
    final owner = (payload['owner'] as Map?)?.cast<String, dynamic>() ?? {};

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Asset Details'),
        backgroundColor: ds.bgPage,
        surfaceTintColor: Colors.transparent,
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(16, 12, 16, 32),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _OwnerCard(asset: asset, owner: owner),
            if (tier == 'FULL') ...[
              const SizedBox(height: 14),
              _AssetDetailsCard(asset: asset, fmt: _fmtDate),
              const SizedBox(height: 14),
              _CurrentAssignmentCard(
                assignment: (payload['current_assignment'] as Map?)?.cast<String, dynamic>() ?? {},
                fmt: _fmtDate,
              ),
              const SizedBox(height: 14),
              _HistoryCard(
                history: (payload['history'] as List?)?.cast<dynamic>() ?? const [],
                fmt: _fmtDate,
              ),
              if ((payload['maintenance'] as List?)?.isNotEmpty == true) ...[
                const SizedBox(height: 14),
                _MaintenanceCard(
                  records: (payload['maintenance'] as List).cast<dynamic>(),
                  fmt: _fmtDate,
                ),
              ],
            ] else
              Padding(
                padding: const EdgeInsets.only(top: 12),
                child: Text(
                  'You can see the owner of this asset. Full asset history is reserved for the IT/ops team.',
                  style: TextStyle(fontSize: 12, color: ds.textMuted),
                ),
              ),
          ],
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────

class _OwnerCard extends StatelessWidget {
  const _OwnerCard({required this.asset, required this.owner});
  final Map<String, dynamic> asset;
  final Map<String, dynamic> owner;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ds.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              UserAvatar(
                name: (owner['name'] ?? '') as String,
                avatarUrl: owner['avatar_url'] as String?,
                radius: 24,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      (owner['name'] ?? '—') as String,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
                    ),
                    if (owner['email'] != null)
                      Text(
                        owner['email'] as String,
                        style: TextStyle(fontSize: 12, color: ds.textMuted),
                      ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Divider(color: ds.border, height: 1),
          const SizedBox(height: 14),
          Text(
            (asset['name'] ?? '—') as String,
            style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600),
          ),
          const SizedBox(height: 2),
          Wrap(
            spacing: 6,
            runSpacing: 4,
            children: [
              if (asset['asset_tag'] != null)
                _Pill(text: asset['asset_tag'].toString(), mono: true),
              if (asset['category'] != null || asset['category_name'] != null)
                _Pill(text: (asset['category'] ?? asset['category_name']).toString()),
            ],
          ),
        ],
      ),
    );
  }
}

class _AssetDetailsCard extends StatelessWidget {
  const _AssetDetailsCard({required this.asset, required this.fmt});
  final Map<String, dynamic> asset;
  final String Function(String?) fmt;

  @override
  Widget build(BuildContext context) {
    return _Card(
      title: 'Asset',
      child: Column(
        children: [
          _Row(label: 'Serial number', value: asset['serial_number']?.toString()),
          _Row(label: 'Status', value: asset['status']?.toString()),
          _Row(label: 'Condition', value: asset['asset_condition']?.toString()),
          _Row(label: 'Purchase date', value: fmt(asset['purchase_date']?.toString())),
          _Row(label: 'Warranty expiry', value: fmt(asset['warranty_expiry']?.toString())),
        ],
      ),
    );
  }
}

class _CurrentAssignmentCard extends StatefulWidget {
  const _CurrentAssignmentCard({required this.assignment, required this.fmt});
  final Map<String, dynamic> assignment;
  final String Function(String?) fmt;

  @override
  State<_CurrentAssignmentCard> createState() => _CurrentAssignmentCardState();
}

class _CurrentAssignmentCardState extends State<_CurrentAssignmentCard> {
  bool _showCreds = false;

  @override
  Widget build(BuildContext context) {
    final a = widget.assignment;
    final hasCreds = (a['device_id'] != null) || (a['device_username'] != null) || (a['device_password'] != null);
    return _Card(
      title: 'Current assignment',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          _Row(label: 'Handed over', value: widget.fmt(a['handover_at']?.toString())),
          _Row(label: 'Assigned by', value: a['assigned_by_name']?.toString()),
          _Row(label: 'Condition', value: a['condition_at_assignment']?.toString()),
          if (a['handover_notes'] != null) _Row(label: 'Notes', value: a['handover_notes']?.toString()),
          if (hasCreds) ...[
            const SizedBox(height: 8),
            TextButton.icon(
              onPressed: () => setState(() => _showCreds = !_showCreds),
              icon: Icon(_showCreds ? Icons.visibility_off_outlined : Icons.visibility_outlined, size: 16),
              label: Text(_showCreds ? 'Hide device credentials' : 'Show device credentials'),
            ),
            if (_showCreds) ...[
              _CopyRow(label: 'Device ID', value: a['device_id']?.toString()),
              _CopyRow(label: 'Username', value: a['device_username']?.toString()),
              _CopyRow(label: 'Password', value: a['device_password']?.toString()),
            ],
          ],
        ],
      ),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({required this.history, required this.fmt});
  final List<dynamic> history;
  final String Function(String?) fmt;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    if (history.isEmpty) return const SizedBox.shrink();
    return _Card(
      title: 'Assignment history',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: history.map((raw) {
          final h = (raw as Map).cast<String, dynamic>();
          return Padding(
            padding: const EdgeInsets.only(bottom: 10),
            child: Row(
              children: [
                Container(
                  width: 8, height: 8,
                  decoration: BoxDecoration(
                    color: h['is_active'] == true ? AppColors.primary : ds.textMuted,
                    shape: BoxShape.circle,
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        (h['user_name'] ?? '—') as String,
                        style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                      ),
                      Text(
                        '${fmt(h['assigned_date']?.toString())}'
                        '${h['returned_date'] != null ? '  →  ${fmt(h['returned_date']?.toString())}' : ''}',
                        style: TextStyle(fontSize: 11, color: ds.textMuted),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

class _MaintenanceCard extends StatelessWidget {
  const _MaintenanceCard({required this.records, required this.fmt});
  final List<dynamic> records;
  final String Function(String?) fmt;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return _Card(
      title: 'Maintenance',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: records.map((raw) {
          final m = (raw as Map).cast<String, dynamic>();
          return Padding(
            padding: const EdgeInsets.only(bottom: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${m['type'] ?? '—'}${m['status'] != null ? ' · ${m['status']}' : ''}',
                  style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w600),
                ),
                if (m['description'] != null)
                  Text(m['description'].toString(), style: TextStyle(fontSize: 12, color: ds.textMuted)),
                Text(fmt(m['performed_at']?.toString()), style: TextStyle(fontSize: 11, color: ds.textMuted)),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }
}

// ─── Local primitives ───────────────────────────────────────────────────────

class _Card extends StatelessWidget {
  const _Card({required this.title, required this.child});
  final String title;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            title.toUpperCase(),
            style: TextStyle(
              fontSize: 11,
              letterSpacing: 0.6,
              fontWeight: FontWeight.w700,
              color: ds.textMuted,
            ),
          ),
          const SizedBox(height: 10),
          child,
        ],
      ),
    );
  }
}

class _Row extends StatelessWidget {
  const _Row({required this.label, this.value});
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    if (value == null || value!.isEmpty || value == '—') return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: TextStyle(fontSize: 12, color: ds.textMuted)),
          ),
          Expanded(
            child: Text(value!, style: const TextStyle(fontSize: 13, fontWeight: FontWeight.w500)),
          ),
        ],
      ),
    );
  }
}

class _CopyRow extends StatelessWidget {
  const _CopyRow({required this.label, this.value});
  final String label;
  final String? value;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    if (value == null || value!.isEmpty) return const SizedBox.shrink();
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Row(
        children: [
          SizedBox(
            width: 110,
            child: Text(label, style: TextStyle(fontSize: 12, color: ds.textMuted)),
          ),
          Expanded(
            child: SelectableText(
              value!,
              style: const TextStyle(fontSize: 13, fontFamily: 'monospace'),
            ),
          ),
          IconButton(
            visualDensity: VisualDensity.compact,
            iconSize: 16,
            onPressed: () async {
              await Clipboard.setData(ClipboardData(text: value!));
              if (!context.mounted) return;
              ScaffoldMessenger.of(context).showSnackBar(
                SnackBar(content: Text('$label copied'), duration: const Duration(seconds: 1)),
              );
            },
            icon: const Icon(Icons.copy_outlined),
          ),
        ],
      ),
    );
  }
}

class _Pill extends StatelessWidget {
  const _Pill({required this.text, this.mono = false});
  final String text;
  final bool mono;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: ds.bgElevated,
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: ds.border),
      ),
      child: Text(
        text,
        style: TextStyle(
          fontSize: 11,
          color: ds.textMuted,
          fontFamily: mono ? 'monospace' : null,
        ),
      ),
    );
  }
}
