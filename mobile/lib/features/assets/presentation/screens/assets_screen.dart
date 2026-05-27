import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';
import 'package:qr_flutter/qr_flutter.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../features/auth/providers/auth_provider.dart';
import '../../../../shared/widgets/ds_metric_card.dart';
import '../../../../shared/widgets/user_avatar.dart';

// ─────────────────────────────────────────────────────────────────────────────
//  Providers
// ─────────────────────────────────────────────────────────────────────────────

final myAssetsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseAssets}/inventory/my-assets',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['assets'] as List? ?? d['items'] as List? ?? [];
  return [];
});

final assetRequestsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseAssets}/requests',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['requests'] as List? ?? [];
  return [];
});

// Requests this caller has personally approved. Server-side filter via
// `?mode=approved` (AssetRequestController.list) — bypasses the default
// own + reportees + ops-queue scoping so the approver can audit their
// approvals even if the requester is no longer a direct report.
final approvedRequestsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseAssets}/requests',
    queryParameters: const {'mode': 'approved'},
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['requests'] as List? ?? [];
  return [];
});

final assetCategoriesProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseAssets}/categories',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['categories'] as List? ?? [];
  return [];
});

// ─────────────────────────────────────────────────────────────────────────────
//  Screen
// ─────────────────────────────────────────────────────────────────────────────

class AssetsScreen extends ConsumerStatefulWidget {
  const AssetsScreen({super.key});

  @override
  ConsumerState<AssetsScreen> createState() => _AssetsScreenState();
}

class _AssetsScreenState extends ConsumerState<AssetsScreen>
    with SingleTickerProviderStateMixin {
  TabController? _tabCtrl;
  // Tracks the tab-count used to build the current controller; when the
  // user's permissions change (e.g. an admin grants ASSET_APPROVE mid-session)
  // we rebuild the controller so the third tab can appear.
  int _tabCount = 0;

  @override
  void dispose() {
    _tabCtrl?.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    final user = ref.watch(currentUserProvider);
    final perms = user?.permissions ?? const <String>[];
    final isAdmin = user?.role == 'TENANT_ADMIN' || user?.role == 'SUPER_ADMIN';
    // Anyone with asset read access can scan a sticker; the backend decides
    // the response tier from ASSET_SCAN_FULL. Matches the web gate.
    final canScan = perms.contains('ASSET_READ')
        || perms.contains('ASSET_SCAN_FULL')
        || perms.contains('ASSET_SCAN_BASIC');
    // Approvers (and any system admin) get a third tab listing the requests
    // they have personally approved, fetched via /requests?mode=approved.
    final canApprove = isAdmin
        || perms.contains('ASSET_APPROVE')
        || perms.contains('ASSET_ADMIN');

    final desiredCount = canApprove ? 3 : 2;
    if (_tabCtrl == null || _tabCount != desiredCount) {
      _tabCtrl?.dispose();
      _tabCtrl  = TabController(length: desiredCount, vsync: this);
      _tabCount = desiredCount;
    }

    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Assets'),
        backgroundColor: ds.bgPage,
        surfaceTintColor: Colors.transparent,
        actions: [
          if (canScan)
            IconButton(
              tooltip: 'Scan QR',
              icon: const Icon(Icons.qr_code_scanner_rounded),
              // Route is registered under the More-tab branch
              // (`/more/assets/scan`). The previous `/home/...` path didn't
              // exist so go_router fell back to home and the camera screen
              // never opened.
              onPressed: () => context.push('/more/assets/scan'),
            ),
        ],
        bottom: TabBar(
          controller: _tabCtrl,
          tabs: [
            const Tab(text: 'My Assets'),
            const Tab(text: 'Requests'),
            if (canApprove) const Tab(text: 'Approved'),
          ],
        ),
      ),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showRequestDialog(context),
        icon: const Icon(Icons.add_rounded),
        label: const Text('Request Asset'),
        backgroundColor: AppColors.primaryLight,
        foregroundColor: Colors.white,
      ),
      body: TabBarView(
        controller: _tabCtrl,
        children: [
          _MyAssetsTab(),
          _RequestsTab(),
          if (canApprove) _ApprovedRequestsTab(),
        ],
      ),
    );
  }

  void _showRequestDialog(BuildContext context) {
    final formKey = GlobalKey<FormState>();
    final desc    = TextEditingController();
    final reason  = TextEditingController();
    String? selectedCategory;

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.ds.bgCard,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (_) => Consumer(builder: (ctx, ref, _) {
        final categories = ref.watch(assetCategoriesProvider);
        return Padding(
          padding: EdgeInsets.only(
            left: 20, right: 20, top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Form(
            key: formKey,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Request an Asset',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              categories.when(
                data: (cats) => DropdownButtonFormField<String>(
                  value: selectedCategory,
                  hint: const Text('Select category'),
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: cats.map((c) {
                    final m = c as Map<String, dynamic>;
                    return DropdownMenuItem(
                      value: m['id']?.toString() ?? m['name']?.toString(),
                      child: Text(m['name']?.toString() ?? ''),
                    );
                  }).toList(),
                  onChanged: (v) => selectedCategory = v,
                  validator: (v) => v == null ? 'Required' : null,
                ),
                loading: () => const CircularProgressIndicator(),
                error: (_, __) => TextFormField(
                  controller: desc,
                  decoration: const InputDecoration(labelText: 'Asset type / category'),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: desc,
                decoration: const InputDecoration(labelText: 'Asset description'),
                validator: (v) => v?.isEmpty == true ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: reason,
                decoration: const InputDecoration(labelText: 'Reason for request'),
                maxLines: 2,
              ),
              const SizedBox(height: 20),
              SizedBox(
                width: double.infinity,
                child: ElevatedButton(
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppColors.primaryLight,
                    foregroundColor: Colors.white,
                    padding: const EdgeInsets.symmetric(vertical: 14),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                  ),
                  onPressed: () async {
                    if (!formKey.currentState!.validate()) return;
                    try {
                      await ApiClient.instance.post(
                        '${AppConstants.baseAssets}/requests',
                        data: {
                          'category_id': selectedCategory,
                          'reason': reason.text.isNotEmpty ? reason.text : desc.text,
                        },
                      );
                      ref.invalidate(assetRequestsProvider);
                      if (ctx.mounted) {
                        Navigator.pop(ctx);
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(content: Text('Request submitted!'),
                              backgroundColor: AppColors.success),
                        );
                      }
                    } catch (e) {
                      if (ctx.mounted) {
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          SnackBar(content: Text('Failed: $e'), backgroundColor: AppColors.error),
                        );
                      }
                    }
                  },
                  child: const Text('Submit Request', style: TextStyle(fontWeight: FontWeight.w600)),
                ),
              ),
            ]),
          ),
        );
      }),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  My Assets tab
// ─────────────────────────────────────────────────────────────────────────────

class _MyAssetsTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds     = context.ds;
    final assets = ref.watch(myAssetsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(myAssetsProvider),
      color: AppColors.primaryLight,
      child: assets.when(
        data: (list) => list.isEmpty
            ? Center(
                child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                  Icon(Icons.inventory_2_rounded, size: 52, color: ds.textMuted),
                  const SizedBox(height: 12),
                  Text('No assets assigned to you',
                      style: TextStyle(color: ds.textMuted, fontSize: 15)),
                  const SizedBox(height: 8),
                  Text('Tap "Request Asset" to submit a request',
                      style: TextStyle(color: ds.textMuted, fontSize: 13)),
                ]),
              )
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                itemCount: list.length,
                itemBuilder: (_, i) => _AssetCard(list[i] as Map<String, dynamic>),
              ),
        loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children: List.generate(3, (_) => const ShimmerCard(height: 200)),
        ),
        error: (e, _) => Center(
          child: Text('$e', style: const TextStyle(color: AppColors.error)),
        ),
      ),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Rich asset card
// ─────────────────────────────────────────────────────────────────────────────

class _AssetCard extends StatelessWidget {
  const _AssetCard(this.asset);
  final Map<String, dynamic> asset;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;

    final name     = asset['assetName'] as String? ?? asset['asset_name'] as String? ?? asset['name'] as String? ?? '—';
    final tag      = asset['assetTag'] as String? ?? asset['asset_tag'] as String?;
    final serial   = asset['serialNumber'] as String? ?? asset['serial_number'] as String?;
    final status   = asset['status'] as String? ?? 'ASSIGNED';
    final category = asset['categoryName'] as String? ?? asset['category_name'] as String? ?? asset['category'] as String?;

    final assignedDate       = asset['assignedDate'] as String? ?? asset['assigned_date'] as String?;
    final daysUsingRaw       = asset['daysUsing'] ?? asset['days_using'];
    final daysUsing          = daysUsingRaw is int ? daysUsingRaw : (daysUsingRaw is double ? daysUsingRaw.toInt() : (daysUsingRaw != null ? int.tryParse('$daysUsingRaw') : null));
    final assignedByName     = asset['assignedByName'] as String? ?? asset['assigned_by_name'] as String?;
    final assignedByAvatar   = asset['assignedByAvatar'] as String? ?? asset['assigned_by_avatar'] as String?;
    final approvedByName     = asset['approvedByName'] as String? ?? asset['approved_by_name'] as String?;
    final approvedByAvatar   = asset['approvedByAvatar'] as String? ?? asset['approved_by_avatar'] as String?;
    final handoverByName     = asset['handoverByName'] as String? ?? asset['handover_by_name'] as String?;
    final condition          = asset['conditionAtAssignment'] as String? ?? asset['condition_at_assignment'] as String?;
    final notes              = asset['assignmentNotes'] as String? ?? asset['assignment_notes'] as String?;
    final expectedReturn     = asset['expectedReturnDate'] as String? ?? asset['expected_return_date'] as String?;
    final qrToken            = asset['qrToken'] as String? ?? asset['qr_token'] as String?;

    final givenByName   = handoverByName ?? assignedByName;
    final givenByAvatar = handoverByName != null ? null : assignedByAvatar;

    final (statusColor, statusLabel) = _statusInfo(status);

    return Container(
      margin: const EdgeInsets.only(bottom: 14),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: ds.border),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withOpacity(0.04),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Top gradient band
          Container(
            height: 4,
            decoration: BoxDecoration(
              gradient: const LinearGradient(
                colors: [Color(0xFF6366f1), Color(0xFF8b5cf6)],
              ),
              borderRadius: const BorderRadius.vertical(top: Radius.circular(16)),
            ),
          ),

          Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Header row
                Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
                  Container(
                    width: 44, height: 44,
                    decoration: BoxDecoration(
                      color: AppColors.primaryLight.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: Icon(_categoryIcon(category), color: AppColors.primaryLight, size: 22),
                  ),
                  const SizedBox(width: 10),
                  Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text(name, style: TextStyle(fontWeight: FontWeight.w800, fontSize: 15, color: ds.textPrimary)),
                    if (category != null)
                      Text(category, style: TextStyle(fontSize: 12, color: ds.textMuted)),
                  ])),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: statusColor.withOpacity(0.12),
                      borderRadius: BorderRadius.circular(6),
                      border: Border.all(color: statusColor.withOpacity(0.3)),
                    ),
                    child: Text(statusLabel,
                        style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: statusColor)),
                  ),
                ]),

                const SizedBox(height: 12),

                // Serial + condition pill
                if (serial != null || condition != null)
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 8),
                    decoration: BoxDecoration(
                      color: ds.bgElevated,
                      borderRadius: BorderRadius.circular(10),
                    ),
                    child: Row(children: [
                      Icon(Icons.tag_rounded, size: 12, color: ds.textMuted),
                      const SizedBox(width: 5),
                      Text(
                        serial ?? tag ?? '—',
                        style: TextStyle(
                          fontSize: 12,
                          fontFamily: 'monospace',
                          fontWeight: FontWeight.w600,
                          color: ds.textPrimary,
                        ),
                      ),
                      if (condition != null) ...[
                        const Spacer(),
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                          decoration: BoxDecoration(
                            color: _conditionColor(condition).withOpacity(0.15),
                            borderRadius: BorderRadius.circular(4),
                          ),
                          child: Text(condition,
                              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                                  color: _conditionColor(condition))),
                        ),
                      ],
                    ]),
                  ),

                const SizedBox(height: 10),

                // Info rows
                if (assignedDate != null)
                  _InfoRow(
                    icon: Icons.calendar_today_rounded,
                    iconColor: const Color(0xFF6366f1),
                    label: 'Assigned',
                    value: _fmtDate(assignedDate),
                    trailing: daysUsing != null
                        ? Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                            decoration: BoxDecoration(
                              color: const Color(0xFF6366f1).withOpacity(0.1),
                              borderRadius: BorderRadius.circular(6),
                            ),
                            child: Text(
                              daysUsing == 0 ? 'Today' : '${daysUsing}d',
                              style: const TextStyle(fontSize: 10, fontWeight: FontWeight.w700,
                                  color: Color(0xFF6366f1)),
                            ),
                          )
                        : null,
                  ),

                if (givenByName != null)
                  _PersonRow(
                    icon: Icons.local_shipping_rounded,
                    iconColor: const Color(0xFF0d9488),
                    label: 'Given by',
                    name: givenByName,
                    avatarUrl: givenByAvatar,
                  ),

                if (approvedByName != null)
                  _PersonRow(
                    icon: Icons.check_circle_rounded,
                    iconColor: AppColors.success,
                    label: 'Approved by',
                    name: approvedByName,
                    avatarUrl: approvedByAvatar,
                  ),

                if (expectedReturn != null)
                  _InfoRow(
                    icon: Icons.event_rounded,
                    iconColor: AppColors.ragAmber,
                    label: 'Return by',
                    value: _fmtDate(expectedReturn),
                    valueColor: AppColors.ragAmber,
                  ),

                if (notes != null && notes.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.all(10),
                    decoration: BoxDecoration(
                      color: ds.bgElevated,
                      borderRadius: BorderRadius.circular(8),
                    ),
                    child: Text(
                      '"$notes"',
                      style: TextStyle(
                        fontSize: 12,
                        color: ds.textSecondary,
                        fontStyle: FontStyle.italic,
                      ),
                    ),
                  ),
                ],

                if (qrToken != null && qrToken.isNotEmpty) ...[
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: OutlinedButton.icon(
                      onPressed: () => showAssetQrSheet(
                        context, qrToken,
                        assetTag: tag, assetName: name,
                      ),
                      icon: const Icon(Icons.qr_code_2_rounded, size: 16),
                      label: const Text('Show QR'),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppColors.primaryLight,
                        side: BorderSide(color: AppColors.primaryLight.withOpacity(0.4)),
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                      ),
                    ),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
    ).animate().fadeIn(duration: 350.ms).slideY(begin: 0.03);
  }

  static Color _conditionColor(String c) => switch (c.toUpperCase()) {
    'EXCELLENT' => AppColors.success,
    'GOOD'      => AppColors.info,
    'FAIR'      => AppColors.ragAmber,
    _           => AppColors.ragRed,
  };

  static String _fmtDate(String s) {
    try { return DateFormat('d MMM yyyy').format(DateTime.parse(s)); }
    catch (_) { return s; }
  }

  static (Color, String) _statusInfo(String status) => switch (status) {
    'ASSIGNED'    => (AppColors.primaryLight, 'Assigned'),
    'AVAILABLE'   => (AppColors.success,      'Available'),
    'MAINTENANCE' => (AppColors.ragAmber,     'Maintenance'),
    'RETIRED'     => (AppColors.textMuted,    'Retired'),
    _             => (AppColors.textMuted,    status),
  };

  static IconData _categoryIcon(String? cat) {
    final c = cat?.toLowerCase() ?? '';
    if (c.contains('laptop') || c.contains('computer')) return Icons.laptop_rounded;
    if (c.contains('phone') || c.contains('mobile'))    return Icons.smartphone_rounded;
    if (c.contains('monitor') || c.contains('display')) return Icons.monitor_rounded;
    if (c.contains('keyboard') || c.contains('mouse'))  return Icons.keyboard_rounded;
    if (c.contains('headset') || c.contains('audio'))   return Icons.headset_rounded;
    if (c.contains('desk') || c.contains('chair'))      return Icons.chair_rounded;
    return Icons.inventory_2_rounded;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Shared row widgets
// ─────────────────────────────────────────────────────────────────────────────

class _InfoRow extends StatelessWidget {
  const _InfoRow({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.value,
    this.trailing,
    this.valueColor,
  });
  final IconData icon;
  final Color iconColor;
  final String label;
  final String value;
  final Widget? trailing;
  final Color? valueColor;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(children: [
        Icon(icon, size: 13, color: iconColor),
        const SizedBox(width: 6),
        Text('$label ', style: TextStyle(fontSize: 12, color: ds.textMuted)),
        Text(value, style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700,
            color: valueColor ?? ds.textPrimary)),
        if (trailing != null) ...[const Spacer(), trailing!],
      ]),
    );
  }
}

class _PersonRow extends StatelessWidget {
  const _PersonRow({
    required this.icon,
    required this.iconColor,
    required this.label,
    required this.name,
    this.avatarUrl,
  });
  final IconData icon;
  final Color iconColor;
  final String label;
  final String name;
  final String? avatarUrl;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Row(children: [
        Icon(icon, size: 13, color: iconColor),
        const SizedBox(width: 6),
        Text('$label ', style: TextStyle(fontSize: 12, color: ds.textMuted)),
        const Spacer(),
        UserAvatar(name: name, avatarUrl: avatarUrl, radius: 10, fontSize: 8, border: false),
        const SizedBox(width: 5),
        Flexible(
          child: Text(name,
              style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: ds.textPrimary),
              overflow: TextOverflow.ellipsis),
        ),
      ]),
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  Requests tab
// ─────────────────────────────────────────────────────────────────────────────

class _RequestsTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds       = context.ds;
    final requests = ref.watch(assetRequestsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(assetRequestsProvider),
      color: AppColors.primaryLight,
      child: requests.when(
        data: (list) => list.isEmpty
            ? Center(child: Text('No asset requests yet',
                style: TextStyle(color: ds.textMuted)))
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                itemCount: list.length,
                itemBuilder: (_, i) => _RequestTile(list[i] as Map<String, dynamic>),
              ),
        loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children: List.generate(3, (_) => const ShimmerCard(height: 80)),
        ),
        error: (e, _) => Center(
          child: Text('$e', style: const TextStyle(color: AppColors.error)),
        ),
      ),
    );
  }
}

// Approver-only tab: lists requests the current user has personally approved.
// Reuses `_RequestTile` so the QR sheet works identically — the approver
// taps a HANDED_OVER tile and the same printable QR appears.
class _ApprovedRequestsTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds       = context.ds;
    final requests = ref.watch(approvedRequestsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(approvedRequestsProvider),
      color: AppColors.primaryLight,
      child: requests.when(
        data: (list) => list.isEmpty
            ? Center(child: Text('You have not approved any requests yet',
                style: TextStyle(color: ds.textMuted)))
            : ListView.builder(
                padding: const EdgeInsets.fromLTRB(16, 16, 16, 100),
                itemCount: list.length,
                itemBuilder: (_, i) => _RequestTile(list[i] as Map<String, dynamic>),
              ),
        loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children: List.generate(3, (_) => const ShimmerCard(height: 80)),
        ),
        error: (e, _) => Center(
          child: Text('$e', style: const TextStyle(color: AppColors.error)),
        ),
      ),
    );
  }
}

class _RequestTile extends StatelessWidget {
  const _RequestTile(this.request);
  final Map<String, dynamic> request;

  @override
  Widget build(BuildContext context) {
    final ds           = context.ds;
    final reason       = request['reason'] as String? ?? request['description'] as String? ?? '';
    final desc         = reason.isNotEmpty ? reason : (request['assetName'] as String? ?? request['asset_name'] as String? ?? '—');
    final status       = request['status'] as String? ?? 'PENDING';
    final categoryName = request['categoryName'] as String? ?? request['category_name'] as String?;
    final handoverName = request['handoverByName'] as String? ?? request['handover_by_name'] as String?;
    final approvedName = request['approvedByName'] as String? ?? request['approved_by_name'] as String?;
    final qrToken      = request['qr_token'] as String? ?? request['qrToken'] as String?;
    final assetTag     = request['asset_tag'] as String? ?? request['assetTag'] as String?;

    final (color, label) = _statusInfo(status);

    final card = Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [
        Container(
          width: 40, height: 40,
          decoration: BoxDecoration(
            color: color.withOpacity(0.12),
            borderRadius: BorderRadius.circular(10),
          ),
          child: Icon(Icons.request_page_rounded, color: color, size: 20),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(desc,
              style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: ds.textPrimary),
              maxLines: 2, overflow: TextOverflow.ellipsis),
          if (categoryName != null) ...[
            const SizedBox(height: 2),
            Text(categoryName, style: TextStyle(fontSize: 11, color: ds.textMuted)),
          ],
          if (handoverName != null) ...[
            const SizedBox(height: 4),
            Row(children: [
              Icon(Icons.local_shipping_rounded, size: 11, color: const Color(0xFF0d9488)),
              const SizedBox(width: 3),
              Text('Handed over by $handoverName',
                  style: const TextStyle(fontSize: 11, color: Color(0xFF0d9488), fontWeight: FontWeight.w600)),
            ]),
          ] else if (approvedName != null && status != 'PENDING') ...[
            const SizedBox(height: 4),
            Row(children: [
              Icon(Icons.check_circle_rounded, size: 11, color: AppColors.success),
              const SizedBox(width: 3),
              Text('Approved by $approvedName',
                  style: TextStyle(fontSize: 11, color: AppColors.success, fontWeight: FontWeight.w600)),
            ]),
          ],
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: color.withOpacity(0.12),
            borderRadius: BorderRadius.circular(6),
            border: Border.all(color: color.withOpacity(0.3)),
          ),
          child: Text(label,
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
        ),
      ]),
    );

    // While the asset is in the requester's hands, expose the printable QR
    // sticker — they may need to re-print it or hand the device to ops.
    if (status == 'HANDED_OVER' && qrToken != null && qrToken.isNotEmpty) {
      return InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => _showQrSheet(context, qrToken, assetTag),
        child: card,
      );
    }
    return card;
  }

  void _showQrSheet(BuildContext context, String token, String? assetTag) {
    showAssetQrSheet(context, token, assetTag: assetTag);
  }

  static (Color, String) _statusInfo(String s) => switch (s) {
    'APPROVED'        => (AppColors.success,       'Approved'),
    'REJECTED'        => (AppColors.ragRed,        'Rejected'),
    'ASSIGNED_TO_OPS' => (AppColors.info,          'Ops Assigned'),
    'PROCESSING'      => (const Color(0xFF7c3aed), 'Processing'),
    'HANDED_OVER'     => (const Color(0xFF0d9488), 'Handed Over'),
    'RETURNED'        => (AppColors.ragAmber,      'Returned'),
    'RETURN_VERIFIED' => (AppColors.textMuted,     'Verified'),
    'FULFILLED'       => (AppColors.primaryLight,  'Fulfilled'),
    'CANCELLED'       => (AppColors.textMuted,     'Cancelled'),
    _                 => (AppColors.ragAmber,      'Pending'),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  Asset QR bottom sheet — shared by the Requests tile and the My-Assets card.
// ─────────────────────────────────────────────────────────────────────────────

void showAssetQrSheet(
  BuildContext context,
  String token, {
  String? assetTag,
  String? assetName,
}) {
  showModalBottomSheet(
    context: context,
    backgroundColor: context.ds.bgCard,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
    ),
    builder: (sheetCtx) {
      final ds = sheetCtx.ds;
      return Padding(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 28),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.center,
          children: [
            Container(
              width: 36, height: 4,
              decoration: BoxDecoration(
                color: ds.border, borderRadius: BorderRadius.circular(2),
              ),
            ),
            const SizedBox(height: 16),
            const Text('Asset QR Sticker',
                style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
            const SizedBox(height: 4),
            Text(
              'Print and stick this on the device. Authorised users scan it to look up asset details.',
              textAlign: TextAlign.center,
              style: TextStyle(fontSize: 12, color: ds.textMuted),
            ),
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: ds.border),
              ),
              child: QrImageView(
                data: 'dsync://asset-scan/$token',
                size: 220,
                version: QrVersions.auto,
                errorCorrectionLevel: QrErrorCorrectLevel.M,
              ),
            ),
            if (assetName != null && assetName.isNotEmpty) ...[
              const SizedBox(height: 12),
              Text(assetName,
                  style: const TextStyle(fontSize: 14, fontWeight: FontWeight.w600)),
            ],
            if (assetTag != null && assetTag.isNotEmpty) ...[
              const SizedBox(height: 4),
              Text(assetTag,
                  style: TextStyle(fontSize: 12, color: ds.textMuted, fontFamily: 'monospace')),
            ],
          ],
        ),
      );
    },
  );
}
