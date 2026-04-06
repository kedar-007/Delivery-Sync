import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../../../core/constants/app_constants.dart';
import '../../../../core/services/api_client.dart';
import '../../../../core/theme/app_colors.dart';
import '../../../../shared/widgets/ds_metric_card.dart';
import '../../../../shared/widgets/user_avatar.dart';

// ── Providers ─────────────────────────────────────────────────────────────────

final _announcementsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/announcements',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['announcements'] as List? ?? [];
  return [];
});

final _leaveRequestsProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/leave/requests',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['requests'] as List? ?? [];
  return [];
});

final _leaveBalanceProvider = FutureProvider.autoDispose<List<dynamic>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.basePeople}/leave/balance',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  final d = raw['data'];
  if (d is List) return d;
  if (d is Map) return d['balances'] as List? ?? [];
  return [];
});

final _peopleProvider = FutureProvider.autoDispose<List<Map<String, dynamic>>>((ref) async {
  final raw = await ApiClient.instance.get<Map<String, dynamic>>(
    '${AppConstants.baseCore}/auth/users',
    fromJson: (r) => r as Map<String, dynamic>,
  );
  // API returns { data: { users: [...] } } or { data: [...] }
  final data = raw['data'];
  final List<dynamic> list;
  if (data is List) {
    list = data;
  } else if (data is Map) {
    list = (data['users'] as List<dynamic>?)
        ?? (data['members'] as List<dynamic>?)
        ?? [];
  } else {
    list = [];
  }
  return list.cast<Map<String, dynamic>>();
});

// ── Screen ────────────────────────────────────────────────────────────────────

class PeopleScreen extends ConsumerStatefulWidget {
  const PeopleScreen({super.key});

  @override
  ConsumerState<PeopleScreen> createState() => _PeopleScreenState();
}

class _PeopleScreenState extends ConsumerState<PeopleScreen>
    with SingleTickerProviderStateMixin {
  late final _tabCtrl = TabController(length: 4, vsync: this);
  final _search = TextEditingController();
  String _query = '';

  @override
  void initState() {
    super.initState();
    _search.addListener(
        () => setState(() => _query = _search.text.trim().toLowerCase()));
  }

  @override
  void dispose() {
    _tabCtrl.dispose();
    _search.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Scaffold(
      backgroundColor: ds.bgPage,
      appBar: AppBar(
        title: const Text('People'),
        backgroundColor: ds.bgPage,
        bottom: TabBar(
          controller: _tabCtrl,
          isScrollable: true,
          tabs: const [
            Tab(text: 'Directory'),
            Tab(text: 'Announcements'),
            Tab(text: 'Leave'),
            Tab(text: 'Org Chart'),
          ],
        ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 12, 16, 0),
            child: TextField(
              controller: _search,
              decoration: const InputDecoration(
                hintText: 'Search people…',
                prefixIcon: Icon(Icons.search_rounded),
                contentPadding: EdgeInsets.symmetric(vertical: 12),
              ),
            ),
          ),
          Expanded(
            child: TabBarView(
              controller: _tabCtrl,
              children: [
                _DirectoryTab(query: _query),
                _AnnouncementsTab(),
                _LeaveTab(),
                _OrgChartTab(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

// ── Directory tab ─────────────────────────────────────────────────────────────

class _DirectoryTab extends ConsumerWidget {
  const _DirectoryTab({required this.query});
  final String query;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds     = context.ds;
    final people = ref.watch(_peopleProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_peopleProvider),
      color: AppColors.primaryLight,
      child: people.when(
        data: (list) {
          final filtered = query.isEmpty
              ? list
              : list.where((p) {
                  final name  = (p['name']  as String? ?? '').toLowerCase();
                  final email = (p['email'] as String? ?? '').toLowerCase();
                  return name.contains(query) || email.contains(query);
                }).toList();

          if (filtered.isEmpty) {
            return Center(
              child: Text('No results found',
                  style: TextStyle(color: ds.textMuted)),
            );
          }

          return ListView.builder(
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
            itemCount: filtered.length,
            itemBuilder: (ctx, i) => _PersonTile(filtered[i]),
          );
        },
        loading: () => ListView(
          children: List.generate(6, (_) => const ShimmerCard(height: 72)),
        ),
        error: (e, _) => Center(
          child: Text('$e', style: const TextStyle(color: AppColors.error)),
        ),
      ),
    );
  }
}

class _PersonTile extends StatelessWidget {
  const _PersonTile(this.person);
  final Map<String, dynamic> person;

  @override
  Widget build(BuildContext context) {
    final ds       = context.ds;
    final name   = person['name']      as String? ?? '—';
    final email  = person['email']     as String? ?? '';
    final role   = person['role']      as String? ?? '';
    final avatar = person['avatarUrl'] as String?;

    return Container(
      margin: const EdgeInsets.only(bottom: 6),
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ds.border),
      ),
      child: Row(
        children: [
          UserAvatar(name: name, avatarUrl: avatar, radius: 22),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(name,
                    style: TextStyle(
                        fontWeight: FontWeight.w600,
                        fontSize: 14,
                        color: ds.textPrimary)),
                const SizedBox(height: 2),
                Text(email,
                    style: TextStyle(
                        fontSize: 12, color: ds.textMuted),
                    overflow: TextOverflow.ellipsis),
              ],
            ),
          ),
          const SizedBox(width: 8),
          _RoleChip(role),
        ],
      ),
    );
  }

}

class _RoleChip extends StatelessWidget {
  const _RoleChip(this.role);
  final String role;

  @override
  Widget build(BuildContext context) {
    final (color, label) = switch (role) {
      'TENANT_ADMIN'  => (AppColors.primaryLight, 'Admin'),
      'DELIVERY_LEAD' => (AppColors.info,         'Lead'),
      'PMO'           => (AppColors.warning,      'PMO'),
      'EXEC'          => (AppColors.accent,       'Exec'),
      'CLIENT'        => (AppColors.success,      'Client'),
      _               => (AppColors.textMuted,    'Member'),
    };
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withOpacity(0.12),
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withOpacity(0.3)),
      ),
      child: Text(label,
          style: TextStyle(
              fontSize: 10, fontWeight: FontWeight.w700, color: color)),
    );
  }
}

// ── Announcements tab ─────────────────────────────────────────────────────────

class _AnnouncementsTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds    = context.ds;
    final async = ref.watch(_announcementsProvider);

    return RefreshIndicator(
      onRefresh: () async => ref.invalidate(_announcementsProvider),
      color: AppColors.primaryLight,
      child: async.when(
        data: (list) => list.isEmpty
            ? Center(child: Text('No announcements yet', style: TextStyle(color: ds.textMuted)))
            : ListView.builder(
                padding: const EdgeInsets.all(16),
                itemCount: list.length,
                itemBuilder: (_, i) {
                  final a = list[i] as Map<String, dynamic>;
                  final title   = a['title'] as String? ?? '—';
                  final content = a['content'] as String? ?? '';
                  final author  = a['authorName'] as String?;
                  final date    = a['createdAt'] as String? ?? '';
                  final isRead  = a['isRead'] as bool? ?? false;

                  return Container(
                    margin: const EdgeInsets.only(bottom: 10),
                    padding: const EdgeInsets.all(14),
                    decoration: BoxDecoration(
                      color: ds.bgCard,
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(
                        color: isRead ? ds.border : AppColors.primaryLight.withOpacity(0.4),
                        width: isRead ? 1 : 1.5,
                      ),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(children: [
                        if (!isRead)
                          Container(
                            width: 7, height: 7,
                            margin: const EdgeInsets.only(right: 8),
                            decoration: const BoxDecoration(
                              color: AppColors.primaryLight,
                              shape: BoxShape.circle,
                            ),
                          ),
                        Expanded(child: Text(title,
                            style: TextStyle(fontWeight: FontWeight.w700,
                                fontSize: 14, color: ds.textPrimary))),
                      ]),
                      const SizedBox(height: 6),
                      Text(content,
                          style: TextStyle(fontSize: 13, color: ds.textSecondary, height: 1.4),
                          maxLines: 3, overflow: TextOverflow.ellipsis),
                      const SizedBox(height: 8),
                      Row(children: [
                        if (author != null) ...[
                          Icon(Icons.person_rounded, size: 12, color: ds.textMuted),
                          const SizedBox(width: 4),
                          Text(author, style: TextStyle(fontSize: 11, color: ds.textMuted)),
                          const SizedBox(width: 10),
                        ],
                        if (date.isNotEmpty)
                          Text(_fmtDate(date), style: TextStyle(fontSize: 11, color: ds.textMuted)),
                      ]),
                    ]),
                  );
                },
              ),
        loading: () => ListView(
          padding: const EdgeInsets.all(16),
          children: List.generate(4, (_) => const ShimmerCard(height: 90)),
        ),
        error: (e, _) => Center(
          child: Text('$e', style: const TextStyle(color: AppColors.error)),
        ),
      ),
    );
  }

  static String _fmtDate(String iso) {
    try {
      final dt = DateTime.parse(iso);
      return '${dt.day}/${dt.month}/${dt.year}';
    } catch (_) { return iso; }
  }
}

// ── Org Chart tab ─────────────────────────────────────────────────────────────

class _OrgChartTab extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 72, height: 72,
            decoration: BoxDecoration(
              color: AppColors.primaryLight.withOpacity(0.12),
              borderRadius: BorderRadius.circular(20),
            ),
            child: const Icon(Icons.account_tree_rounded,
                color: AppColors.primaryLight, size: 36),
          ),
          const SizedBox(height: 16),
          Text('Organisation Chart',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700, color: ds.textPrimary)),
          const SizedBox(height: 8),
          Text('View the full team hierarchy', style: TextStyle(color: ds.textMuted)),
          const SizedBox(height: 20),
          ElevatedButton.icon(
            icon: const Icon(Icons.account_tree_rounded, size: 18),
            label: const Text('Open Org Chart'),
            style: ElevatedButton.styleFrom(
              backgroundColor: AppColors.primaryLight,
              foregroundColor: Colors.white,
              padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
              shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
            ),
            onPressed: () => context.push('/people/org-chart'),
          ),
        ],
      ),
    );
  }
}

// ── Leave tab ─────────────────────────────────────────────────────────────────

class _LeaveTab extends ConsumerWidget {
  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final ds       = context.ds;
    final balance  = ref.watch(_leaveBalanceProvider);
    final requests = ref.watch(_leaveRequestsProvider);

    return RefreshIndicator(
      onRefresh: () async {
        ref.invalidate(_leaveBalanceProvider);
        ref.invalidate(_leaveRequestsProvider);
      },
      color: AppColors.primaryLight,
      child: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          // Balance
          Text('LEAVE BALANCE',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                  color: ds.textMuted, letterSpacing: 1.2)),
          const SizedBox(height: 10),
          balance.when(
            data: (list) {
              final types = list.isEmpty
                  ? [('Annual', '—', AppColors.success),
                     ('Sick',   '—', AppColors.warning),
                     ('Casual', '—', AppColors.info)]
                  : _extractBalances(list);
              return Row(
                children: types.asMap().entries.map((e) {
                  final isLast = e.key == types.length - 1;
                  return Expanded(child: Padding(
                    padding: EdgeInsets.only(right: isLast ? 0 : 10),
                    child: _BalanceTile(e.value.$1, e.value.$2, e.value.$3),
                  ));
                }).toList(),
              );
            },
            loading: () => const ShimmerCard(height: 80),
            error: (_, __) => Row(children: [
              Expanded(child: _BalanceTile('Annual', '—', AppColors.success)),
              const SizedBox(width: 10),
              Expanded(child: _BalanceTile('Sick', '—', AppColors.warning)),
              const SizedBox(width: 10),
              Expanded(child: _BalanceTile('Casual', '—', AppColors.info)),
            ]),
          ),
          const SizedBox(height: 16),
          SizedBox(
            width: double.infinity,
            child: ElevatedButton.icon(
              icon: const Icon(Icons.add_rounded, size: 18),
              label: const Text('Apply for Leave'),
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primaryLight,
                foregroundColor: Colors.white,
                padding: const EdgeInsets.symmetric(vertical: 13),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
              ),
              onPressed: () => _showLeaveForm(context, ref, balance.valueOrNull ?? []),
            ),
          ),
          const SizedBox(height: 24),
          Text('MY REQUESTS',
              style: TextStyle(fontSize: 11, fontWeight: FontWeight.w700,
                  color: ds.textMuted, letterSpacing: 1.2)),
          const SizedBox(height: 10),
          requests.when(
            data: (list) => list.isEmpty
                ? Container(
                    padding: const EdgeInsets.all(20),
                    decoration: BoxDecoration(
                      color: ds.bgCard,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: ds.border),
                    ),
                    child: Center(child: Text('No leave requests yet',
                        style: TextStyle(color: ds.textMuted))),
                  )
                : Column(
                    children: list.map((r) => _LeaveRequestTile(r as Map<String, dynamic>)).toList(),
                  ),
            loading: () => const ShimmerCard(height: 80),
            error: (e, _) => Text('$e', style: const TextStyle(color: AppColors.error)),
          ),
        ],
      ),
    );
  }

  static List<(String, String, Color)> _extractBalances(List<dynamic> list) {
    const colors = [AppColors.success, AppColors.warning, AppColors.info, AppColors.accent];
    return list.asMap().entries.map((e) {
      final b  = e.value as Map<String, dynamic>;
      // leave_type may be a nested map or a direct string
      final lt = b['leave_type'] is Map
          ? b['leave_type'] as Map<String, dynamic>
          : <String, dynamic>{};
      final name = lt['name'] as String?
          ?? b['leave_type_name'] as String?
          ?? b['leaveTypeName'] as String?
          ?? b['type'] as String?
          ?? 'Leave ${e.key + 1}';

      // --- remaining days: try direct fields first ---
      final rawRemaining = b['remaining_days']
          ?? b['remaining']
          ?? b['balance']
          ?? b['remainingDays']
          ?? b['days_remaining']
          ?? b['available_days'];

      String remaining;
      if (rawRemaining != null) {
        remaining = rawRemaining is num
            ? rawRemaining.toInt().toString()
            : '$rawRemaining';
      } else {
        // fallback: compute total_allocated − used_days
        final total = (b['total_allocated'] as num?)?.toInt()
            ?? (b['total'] as num?)?.toInt()
            ?? (b['allocated_days'] as num?)?.toInt()
            ?? (lt['total_days'] as num?)?.toInt();
        final used = (b['used_days'] as num?)?.toInt()
            ?? (b['used'] as num?)?.toInt()
            ?? (b['taken'] as num?)?.toInt()
            ?? (b['taken_days'] as num?)?.toInt();
        if (total != null && used != null) {
          remaining = '${total - used}';
        } else if (total != null) {
          remaining = '$total';
        } else {
          remaining = '—';
        }
      }

      return (name, remaining, colors[e.key % colors.length]);
    }).toList();
  }

  static void _showLeaveForm(BuildContext context, WidgetRef ref, List<dynamic> balanceList) {
    final formKey = GlobalKey<FormState>();
    final reason  = TextEditingController();
    DateTime? from;
    DateTime? to;
    String?   leaveTypeId;

    // Build leave-type options from balance list
    final leaveTypes = balanceList.map((b) {
      final m  = b as Map<String, dynamic>;
      final lt = m['leave_type'] as Map<String, dynamic>? ?? {};
      final id   = (lt['ROWID'] ?? lt['id'] ?? '').toString();
      final name = lt['name'] as String? ?? m['leave_type_name'] as String? ?? 'Leave';
      return (id, name);
    }).where((t) => t.$1.isNotEmpty).toList();

    showModalBottomSheet(
      context: context,
      isScrollControlled: true,
      backgroundColor: context.ds.bgCard,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => StatefulBuilder(builder: (ctx, setState) {
        return Padding(
          padding: EdgeInsets.only(
            left: 20, right: 20, top: 20,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 20,
          ),
          child: Form(
            key: formKey,
            child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
              const Text('Apply for Leave',
                  style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
              const SizedBox(height: 16),
              if (leaveTypes.isNotEmpty) ...[
                DropdownButtonFormField<String>(
                  value: leaveTypeId,
                  decoration: const InputDecoration(labelText: 'Leave Type'),
                  items: leaveTypes.map((t) =>
                    DropdownMenuItem(value: t.$1, child: Text(t.$2)),
                  ).toList(),
                  onChanged: (v) => setState(() => leaveTypeId = v),
                  validator: (v) => v == null ? 'Select a leave type' : null,
                ),
                const SizedBox(height: 12),
              ],
              Row(children: [
                Expanded(child: _DatePicker(
                  label: 'From Date',
                  value: from,
                  onPick: (d) => setState(() => from = d),
                )),
                const SizedBox(width: 12),
                Expanded(child: _DatePicker(
                  label: 'To Date',
                  value: to,
                  onPick: (d) => setState(() => to = d),
                )),
              ]),
              const SizedBox(height: 12),
              TextFormField(
                controller: reason,
                decoration: const InputDecoration(labelText: 'Reason'),
                maxLines: 2,
                validator: (v) => v?.isEmpty == true ? 'Required' : null,
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
                    if (!formKey.currentState!.validate() || from == null || to == null) {
                      ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(content: Text('Please fill all fields')));
                      return;
                    }
                    try {
                      await ApiClient.instance.post(
                        '${AppConstants.basePeople}/leave/requests',
                        data: {
                          if (leaveTypeId != null) 'leave_type_id': leaveTypeId,
                          'start_date': from!.toIso8601String().substring(0, 10),
                          'end_date':   to!.toIso8601String().substring(0, 10),
                          'reason':     reason.text,
                        },
                      );
                      ref.invalidate(_leaveRequestsProvider);
                      ref.invalidate(_leaveBalanceProvider);
                      if (ctx.mounted) {
                        Navigator.pop(ctx);
                        ScaffoldMessenger.of(ctx).showSnackBar(
                          const SnackBar(content: Text('Leave request submitted!'),
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
                  child: const Text('Submit', style: TextStyle(fontWeight: FontWeight.w600)),
                ),
              ),
            ]),
          ),
        );
      }),
    );
  }
}

class _BalanceTile extends StatelessWidget {
  const _BalanceTile(this.type, this.days, this.color);
  final String type;
  final String days;
  final Color color;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return Container(
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: color.withOpacity(0.08),
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: color.withOpacity(0.25)),
      ),
      child: Column(children: [
        Text(days, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800, color: color)),
        const SizedBox(height: 3),
        Text(type, style: TextStyle(fontSize: 11, fontWeight: FontWeight.w600, color: ds.textSecondary)),
      ]),
    );
  }
}

class _LeaveRequestTile extends StatelessWidget {
  const _LeaveRequestTile(this.request);
  final Map<String, dynamic> request;

  @override
  Widget build(BuildContext context) {
    final ds     = context.ds;
    final from   = request['start_date'] as String? ?? request['fromDate']  as String? ?? '—';
    final to     = request['end_date']   as String? ?? request['toDate']    as String? ?? '—';
    final status = request['status']   as String? ?? 'PENDING';
    final reason = request['reason']   as String?;
    final (color, label) = switch (status) {
      'APPROVED' => (AppColors.success,  'Approved'),
      'REJECTED' => (AppColors.ragRed,   'Rejected'),
      _          => (AppColors.ragAmber, 'Pending'),
    };
    return Container(
      margin: const EdgeInsets.only(bottom: 8),
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        color: ds.bgCard,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: ds.border),
      ),
      child: Row(children: [
        Expanded(child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text('${_fmtDate(from)} → ${_fmtDate(to)}', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 13, color: ds.textPrimary)),
          if (reason != null)
            Text(reason, style: TextStyle(fontSize: 12, color: ds.textMuted), maxLines: 1, overflow: TextOverflow.ellipsis),
        ])),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
          decoration: BoxDecoration(
            color: color.withOpacity(0.12),
            borderRadius: BorderRadius.circular(6),
          ),
          child: Text(label, style: TextStyle(fontSize: 10, fontWeight: FontWeight.w700, color: color)),
        ),
      ]),
    );
  }

  static String _fmtDate(String s) {
    if (s == '—') return s;
    try {
      return DateFormat('d MMM yyyy').format(DateTime.parse(s));
    } catch (_) { return s; }
  }
}

class _DatePicker extends StatelessWidget {
  const _DatePicker({required this.label, required this.value, required this.onPick});
  final String label;
  final DateTime? value;
  final ValueChanged<DateTime> onPick;

  @override
  Widget build(BuildContext context) {
    final ds = context.ds;
    return GestureDetector(
      onTap: () async {
        final d = await showDatePicker(
          context: context,
          initialDate: value ?? DateTime.now(),
          firstDate: DateTime.now().subtract(const Duration(days: 7)),
          lastDate: DateTime.now().add(const Duration(days: 365)),
        );
        if (d != null) onPick(d);
      },
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
        decoration: BoxDecoration(
          color: ds.bgCard,
          borderRadius: BorderRadius.circular(10),
          border: Border.all(color: ds.border),
        ),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(label, style: TextStyle(fontSize: 11, color: ds.textMuted)),
          const SizedBox(height: 3),
          Text(
            value == null ? 'Pick date' : '${value!.day}/${value!.month}/${value!.year}',
            style: TextStyle(fontSize: 13, fontWeight: FontWeight.w600,
                color: value == null ? ds.textMuted : ds.textPrimary),
          ),
        ]),
      ),
    );
  }
}
