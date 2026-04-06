import 'package:flutter/material.dart';
import 'package:flutter_animate/flutter_animate.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/ds_metric_card.dart';

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
  late final _tabCtrl = TabController(length: 2, vsync: this);

  @override
  void dispose() {
    _tabCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('Assets'),
        backgroundColor: ds.bgPage,
        surfaceTintColor: Colors.transparent,
        bottom: TabBar(
          controller: _tabCtrl,
          tabs: const [
            Tab(text: 'My Assets'),
            Tab(text: 'Requests'),
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
        ],
      ),
    );
  }

  void _showRequestDialog(BuildContext context) {
    final _formKey = GlobalKey<FormState>();
    final _desc = TextEditingController();
    final _reason = TextEditingController();
    String? _selectedCategory;

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
            key: _formKey,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Request an Asset',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              // Category
              categories.when(
                data: (cats) => DropdownButtonFormField<String>(
                  value: _selectedCategory,
                  hint: const Text('Select category'),
                  decoration: const InputDecoration(labelText: 'Category'),
                  items: cats.map((c) {
                    final m = c as Map<String, dynamic>;
                    return DropdownMenuItem(
                      value: m['id']?.toString() ?? m['name']?.toString(),
                      child: Text(m['name']?.toString() ?? ''),
                    );
                  }).toList(),
                  onChanged: (v) => _selectedCategory = v,
                  validator: (v) => v == null ? 'Required' : null,
                ),
                loading: () => const CircularProgressIndicator(),
                error: (_, __) => TextFormField(
                  controller: _desc,
                  decoration: const InputDecoration(labelText: 'Asset type / category'),
                ),
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _desc,
                decoration: const InputDecoration(labelText: 'Asset description'),
                validator: (v) => v?.isEmpty == true ? 'Required' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _reason,
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
                    if (!_formKey.currentState!.validate()) return;
                    try {
                      await ApiClient.instance.post(
                        '${AppConstants.baseAssets}/requests',
                        data: {
                          'categoryId': _selectedCategory,
                          'description': _desc.text,
                          'reason': _reason.text,
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
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                itemBuilder: (_, i) => _AssetTile(list[i] as Map<String, dynamic>),
              ),
        loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children: List.generate(3, (_) => const ShimmerCard(height: 90)),
        ),
        error: (e, _) => Center(
          child: Text('$e', style: const TextStyle(color: AppColors.error)),
        ),
      ),
    );
  }
}

class _AssetTile extends StatelessWidget {
  const _AssetTile(this.asset);
  final Map<String, dynamic> asset;

  @override
  Widget build(BuildContext context) {
    final ds     = context.ds;
    final name   = asset['assetName'] as String? ?? asset['name'] as String? ?? '—';
    final tag    = asset['assetTag'] as String?;
    final status = asset['status'] as String? ?? 'ASSIGNED';
    final category = asset['categoryName'] as String? ?? asset['category'] as String?;
    final brand  = asset['brand'] as String?;
    final model  = asset['model'] as String?;

    final (statusColor, statusLabel) = _statusInfo(status);

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Row(children: [
        Container(
          width: 44, height: 44,
          decoration: BoxDecoration(
            color: AppColors.primaryLight.withOpacity(0.12),
            borderRadius: BorderRadius.circular(12),
          ),
          child: Icon(_categoryIcon(category), color: AppColors.primaryLight, size: 22),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(name, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: ds.textPrimary)),
          const SizedBox(height: 3),
          Text(
            [if (brand != null) brand, if (model != null) model].join(' ') .isEmpty
                ? (category ?? '')
                : [if (brand != null) brand, if (model != null) model].join(' '),
            style: TextStyle(fontSize: 12, color: ds.textMuted),
          ),
          if (tag != null) ...[
            const SizedBox(height: 3),
            Row(children: [
              Icon(Icons.tag_rounded, size: 11, color: ds.textMuted),
              const SizedBox(width: 3),
              Text(tag, style: TextStyle(fontSize: 11, color: ds.textMuted)),
            ]),
          ],
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
    ).animate().fadeIn(duration: 350.ms).slideX(begin: 0.03);
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
                padding: const EdgeInsets.all(16),
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
    final ds     = context.ds;
    final desc   = request['description'] as String? ?? request['assetName'] as String? ?? '—';
    final status = request['status'] as String? ?? 'PENDING';
    final reason = request['reason'] as String?;

    final (color, label) = switch (status) {
      'APPROVED'  => (AppColors.success,      'Approved'),
      'REJECTED'  => (AppColors.ragRed,       'Rejected'),
      'FULFILLED' => (AppColors.primaryLight, 'Fulfilled'),
      _           => (AppColors.ragAmber,     'Pending'),
    };

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(14),
        border: Border.all(color: ds.border),
      ),
      child: Row(children: [
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
          Text(desc, style: TextStyle(fontWeight: FontWeight.w700, fontSize: 14, color: ds.textPrimary)),
          if (reason != null)
            Text(reason, style: TextStyle(fontSize: 12, color: ds.textMuted),
                maxLines: 1, overflow: TextOverflow.ellipsis),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: color.withOpacity(0.12),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(label,
              style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
        ),
      ]),
    );
  }
}
