import 'dart:convert';

import 'package:equatable/equatable.dart';

// ─────────────────────────────────────────────────────────────────────────────
//  USER
// ─────────────────────────────────────────────────────────────────────────────

class CurrentUser extends Equatable {
  const CurrentUser({
    required this.id,
    required this.email,
    required this.name,
    required this.role,
    required this.tenantId,
    this.tenantName,
    this.tenantSlug,
    this.avatarUrl,
    this.orgRoleName,
    this.status = 'ACTIVE',
    this.permissions = const [],
  });

  final String id;
  final String email;
  final String name;
  final String role;
  final String tenantId;
  final String? tenantName;
  final String? tenantSlug;
  final String? avatarUrl;
  final String? orgRoleName;
  final String status;
  /// Server-computed permissions array (from org role + per-user overrides).
  final List<String> permissions;

  /// Returns true if this user has the given permission string.
  bool hasPermission(String permission) => permissions.contains(permission);

  factory CurrentUser.fromJson(Map<String, dynamic> j) {
    final rawPerms = j['permissions'];
    final perms = rawPerms is List
        ? rawPerms.map((e) => e.toString()).toList()
        : <String>[];
    return CurrentUser(
      id:          j['id']?.toString() ?? '',
      email:       j['email'] as String? ?? '',
      name:        j['name'] as String? ?? '',
      role:        j['role'] as String? ?? 'TEAM_MEMBER',
      tenantId:    j['tenantId']?.toString() ?? '',
      tenantName:  j['tenantName'] as String?,
      tenantSlug:  j['tenantSlug'] as String?,
      avatarUrl:   j['avatarUrl'] as String? ?? j['avatar_url'] as String? ?? j['photoUrl'] as String?,
      orgRoleName: j['orgRoleName'] as String?,
      status:      j['status'] as String? ?? 'ACTIVE',
      permissions: perms,
    );
  }

  @override
  List<Object?> get props => [id, email, role, tenantId, orgRoleName, permissions];
}

// ─────────────────────────────────────────────────────────────────────────────
//  PROJECT
// ─────────────────────────────────────────────────────────────────────────────

class Project extends Equatable {
  const Project({
    required this.id,
    required this.name,
    required this.ragStatus,
    required this.status,
    this.description,
    this.startDate,
    this.endDate,
    this.memberCount = 0,
  });

  final String id;
  final String name;
  final String ragStatus;
  final String status;
  final String? description;
  final String? startDate;
  final String? endDate;
  final int memberCount;

  factory Project.fromJson(Map<String, dynamic> j) => Project(
        id:          j['id']?.toString() ?? '',
        name:        j['name'] as String? ?? '',
        ragStatus:   j['ragStatus'] as String? ?? 'GREEN',
        status:      j['status'] as String? ?? 'ACTIVE',
        description: j['description'] as String?,
        startDate:   j['startDate'] as String?,
        endDate:     j['endDate'] as String?,
        memberCount: (j['memberCount'] as num?)?.toInt() ?? 0,
      );

  @override
  List<Object?> get props => [id, name, ragStatus, status];
}

// ─────────────────────────────────────────────────────────────────────────────
//  DASHBOARD SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

class DashboardSummary extends Equatable {
  const DashboardSummary({
    required this.totalProjects,
    required this.activeProjects,
    required this.openBlockers,
    required this.openActions,
    required this.ragBreakdown,
    this.submittedStandup = false,
  });

  final int totalProjects;
  final int activeProjects;
  final int openBlockers;
  final int openActions;
  final Map<String, int> ragBreakdown;
  final bool submittedStandup;

  factory DashboardSummary.fromJson(Map<String, dynamic> j) {
    // API response shape: { projects[], ragSummary{RED,AMBER,GREEN},
    //   stats{totalProjects, overdueActionsCount, criticalBlockersCount},
    //   missingStandups[] }
    final rag = (j['ragSummary'] as Map<String, dynamic>?)
        ?? (j['ragBreakdown'] as Map<String, dynamic>?)
        ?? {};
    final stats = (j['stats'] as Map<String, dynamic>?) ?? {};
    final projects = (j['projects'] as List<dynamic>?) ?? [];
    final missingStandups = (j['missingStandups'] as List<dynamic>?) ?? [];

    return DashboardSummary(
      totalProjects:  (stats['totalProjects'] as num?)?.toInt()
                      ?? (j['totalProjects'] as num?)?.toInt()
                      ?? projects.length,
      activeProjects: projects.length,
      openBlockers:   (stats['criticalBlockersCount'] as num?)?.toInt()
                      ?? (j['openBlockers'] as num?)?.toInt()
                      ?? 0,
      openActions:    (stats['overdueActionsCount'] as num?)?.toInt()
                      ?? (j['openActions'] as num?)?.toInt()
                      ?? 0,
      ragBreakdown: {
        'RED':   (rag['RED'] as num?)?.toInt() ?? 0,
        'AMBER': (rag['AMBER'] as num?)?.toInt() ?? 0,
        'GREEN': (rag['GREEN'] as num?)?.toInt() ?? 0,
      },
      submittedStandup: missingStandups.isEmpty
                        ? (j['submittedStandup'] as bool? ?? true)
                        : false,
    );
  }

  @override
  List<Object?> get props => [totalProjects, openBlockers, openActions];
}

// ─────────────────────────────────────────────────────────────────────────────
//  STANDUP
// ─────────────────────────────────────────────────────────────────────────────

class StandupEntry extends Equatable {
  const StandupEntry({
    required this.id,
    required this.projectId,
    required this.userId,
    required this.date,
    required this.yesterday,
    required this.today,
    this.blockers,
  });

  final String id;
  final String projectId;
  final String userId;
  final String date;
  final String yesterday;
  final String today;
  final String? blockers;

  factory StandupEntry.fromJson(Map<String, dynamic> j) => StandupEntry(
        id:        j['id']?.toString() ?? '',
        projectId: j['projectId']?.toString() ?? '',
        userId:    j['userId']?.toString() ?? '',
        date:      j['date'] as String? ?? '',
        yesterday: j['yesterday'] as String? ?? '',
        today:     j['today'] as String? ?? '',
        blockers:  j['blockers'] as String?,
      );

  @override
  List<Object?> get props => [id, projectId, date];
}

// ─────────────────────────────────────────────────────────────────────────────
//  EOD
// ─────────────────────────────────────────────────────────────────────────────

class EodEntry extends Equatable {
  const EodEntry({
    required this.id,
    required this.projectId,
    required this.userId,
    required this.date,
    required this.accomplishments,
    required this.progressPercentage,
    required this.mood,
    this.plannedTomorrow,
    this.blockers,
  });

  final String id;
  final String projectId;
  final String userId;
  final String date;
  final String accomplishments;
  final int progressPercentage;
  final String mood; // GREEN | YELLOW | RED
  final String? plannedTomorrow;
  final String? blockers;

  factory EodEntry.fromJson(Map<String, dynamic> j) => EodEntry(
        id:                  j['id']?.toString() ?? '',
        projectId:           j['projectId']?.toString() ?? '',
        userId:              j['userId']?.toString() ?? '',
        date:                j['date'] as String? ?? '',
        accomplishments:     j['accomplishments'] as String? ?? '',
        progressPercentage:  (j['progressPercentage'] as num?)?.toInt() ?? 0,
        mood:                j['mood'] as String? ?? 'GREEN',
        plannedTomorrow:     j['plannedTomorrow'] as String?,
        blockers:            j['blockers'] as String?,
      );

  @override
  List<Object?> get props => [id, projectId, date];
}

// ─────────────────────────────────────────────────────────────────────────────
//  ACTION
// ─────────────────────────────────────────────────────────────────────────────

class Action extends Equatable {
  const Action({
    required this.id,
    required this.title,
    required this.status,
    required this.priority,
    this.ownerUserId,
    this.dueDate,
    this.projectId,
  });

  final String id;
  final String title;
  final String status;   // OPEN | IN_PROGRESS | DONE | CANCELLED
  final String priority; // CRITICAL | HIGH | MEDIUM | LOW
  final String? ownerUserId;
  final String? dueDate;
  final String? projectId;

  factory Action.fromJson(Map<String, dynamic> j) => Action(
        id:          j['id']?.toString() ?? '',
        title:       j['title'] as String? ?? '',
        status:      j['status'] as String? ?? 'OPEN',
        priority:    j['priority'] as String? ?? 'MEDIUM',
        ownerUserId: j['ownerUserId']?.toString(),
        dueDate:     j['dueDate'] as String?,
        projectId:   j['projectId']?.toString(),
      );

  @override
  List<Object?> get props => [id, title, status];
}

// ─────────────────────────────────────────────────────────────────────────────
//  SPRINT TASK
// ─────────────────────────────────────────────────────────────────────────────

class SprintTask extends Equatable {
  const SprintTask({
    required this.id,
    required this.title,
    required this.status,
    required this.priority,
    this.type = 'TASK',
    this.assigneeId,
    this.assigneeName,
    this.assigneeAvatarUrl,
    this.createdBy,
    this.sprintId,
    this.projectId,
    this.storyPoints,
  });

  final String id;
  final String title;
  final String status;   // TODO | IN_PROGRESS | DONE | BLOCKED
  final String priority;
  final String type;     // TASK | STORY | BUG | EPIC | SUBTASK
  final String? assigneeId;
  final String? assigneeName;
  final String? assigneeAvatarUrl;
  final String? createdBy;
  final String? sprintId;
  final String? projectId;
  final int? storyPoints;

  factory SprintTask.fromJson(Map<String, dynamic> j) {
    // assignee_ids from Catalyst DataStore may be a JSON-encoded String or a List
    final rawAssigneeIds = j['assignee_ids'];
    List<dynamic>? assigneeIds;
    if (rawAssigneeIds is List) {
      assigneeIds = rawAssigneeIds;
    } else if (rawAssigneeIds is String && rawAssigneeIds.isNotEmpty) {
      try {
        final parsed = jsonDecode(rawAssigneeIds);
        if (parsed is List) assigneeIds = parsed;
      } catch (_) {}
    }

    return SprintTask(
      id:               j['id']?.toString() ?? j['ROWID']?.toString() ?? '',
      title:            j['title'] as String? ?? '',
      status:           j['status'] as String? ?? 'TODO',
      priority:         j['priority'] as String?
                        ?? j['task_priority'] as String?
                        ?? 'MEDIUM',
      type:             j['type'] as String? ?? j['taskType'] as String? ?? 'TASK',
      assigneeId:       j['assigneeId']?.toString()
                        ?? (assigneeIds?.isNotEmpty == true
                            ? assigneeIds!.first?.toString()
                            : null),
      assigneeName:     j['assigneeName'] as String?
                        ?? j['assignee_name'] as String?,
      assigneeAvatarUrl: j['assigneeAvatarUrl'] as String?
                        ?? j['assignee_avatar_url'] as String?,
      createdBy:        j['createdBy']?.toString() ?? j['created_by']?.toString(),
      sprintId:         j['sprintId']?.toString() ?? j['sprint_id']?.toString(),
      projectId:        j['project_id']?.toString() ?? j['projectId']?.toString(),
      storyPoints:      (j['storyPoints'] as num?)?.toInt()
                        ?? (j['story_points'] as num?)?.toInt(),
    );
  }

  @override
  List<Object?> get props => [id, title, status, assigneeId];
}

// ─────────────────────────────────────────────────────────────────────────────
//  ANNOUNCEMENT
// ─────────────────────────────────────────────────────────────────────────────

class Announcement extends Equatable {
  const Announcement({
    required this.id,
    required this.title,
    required this.content,
    required this.createdAt,
    this.isRead = false,
    this.isPinned = false,
    this.priority = 'NORMAL',
    this.type = 'GLOBAL',
    this.subtype = 'GENERAL',
    this.festivalKey,
    this.authorName,
    this.expiresAt,
  });

  final String id;
  final String title;
  final String content;
  final String createdAt;
  final bool isRead;
  final bool isPinned;
  final String priority;
  final String type;
  final String subtype;
  final String? festivalKey;
  final String? authorName;
  final String? expiresAt;

  /// Convert Catalyst CREATEDTIME (Unix ms number or ISO string) to ISO string.
  static String _parseCreatedAt(dynamic raw) {
    if (raw == null) return '';
    final n = num.tryParse(raw.toString());
    if (n != null && n > 946684800000) {
      return DateTime.fromMillisecondsSinceEpoch(n.toInt()).toIso8601String();
    }
    return raw.toString();
  }

  factory Announcement.fromJson(Map<String, dynamic> j) {
    // Backend returns raw Catalyst fields: ROWID, CREATEDTIME (Unix ms),
    // is_read, is_pinned, announcement_priority, author_name, etc.
    final rawId   = j['ROWID'] ?? j['id'];
    final rawRead = j['is_read'] ?? j['isRead'];
    final rawPin  = j['is_pinned'] ?? j['isPinned'];

    return Announcement(
      id:         rawId?.toString() ?? '',
      title:      j['title'] as String? ?? '',
      content:    j['content'] as String? ?? '',
      createdAt:  _parseCreatedAt(j['CREATEDTIME'] ?? j['created_at'] ?? j['createdAt']),
      isRead:     rawRead == true || rawRead == 'true',
      isPinned:   rawPin  == true || rawPin  == 'true',
      priority:   j['announcement_priority'] as String?
                  ?? j['priority'] as String?
                  ?? 'NORMAL',
      type:       j['type'] as String? ?? 'GLOBAL',
      subtype:    j['subtype'] as String? ?? 'GENERAL',
      festivalKey: j['festival_key'] as String? ?? j['festivalKey'] as String?,
      authorName: j['author_name'] as String?
                  ?? j['authorName'] as String?,
      expiresAt:  j['expires_at'] as String? ?? j['expiresAt'] as String?,
    );
  }

  @override
  List<Object?> get props => [id, title, createdAt];
}

// ─────────────────────────────────────────────────────────────────────────────
//  BLOCKER
// ─────────────────────────────────────────────────────────────────────────────

class Blocker extends Equatable {
  const Blocker({
    required this.id,
    required this.projectId,
    required this.title,
    required this.severity,
    required this.status,
    this.description,
    this.ownerUserId,
    this.resolution,
    this.resolvedDate,
    this.createdAt,
  });

  final String id;
  final String projectId;
  final String title;
  final String severity; // CRITICAL | HIGH | MEDIUM | LOW
  final String status;   // OPEN | RESOLVED | ESCALATED
  final String? description;
  final String? ownerUserId;
  final String? resolution;
  final String? resolvedDate;
  final String? createdAt;

  String get severityDisplay => switch (severity) {
    'CRITICAL' => 'Critical',
    'HIGH'     => 'High',
    'MEDIUM'   => 'Medium',
    'LOW'      => 'Low',
    _          => severity,
  };

  String get statusDisplay => switch (status) {
    'OPEN'      => 'Open',
    'RESOLVED'  => 'Resolved',
    'ESCALATED' => 'Escalated',
    _           => status,
  };

  factory Blocker.fromJson(Map<String, dynamic> j) => Blocker(
        id:           j['id']?.toString() ?? '',
        projectId:    j['projectId']?.toString() ?? '',
        title:        j['title'] as String? ?? '',
        severity:     j['severity'] as String? ?? 'MEDIUM',
        status:       j['status'] as String? ?? 'OPEN',
        description:  j['description'] as String?,
        ownerUserId:  j['ownerUserId']?.toString(),
        resolution:   j['resolution'] as String?,
        resolvedDate: j['resolvedDate'] as String?,
        createdAt:    j['createdAt'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id':           id,
        'projectId':    projectId,
        'title':        title,
        'severity':     severity,
        'status':       status,
        if (description != null)  'description':  description,
        if (ownerUserId != null)  'ownerUserId':  ownerUserId,
        if (resolution != null)   'resolution':   resolution,
        if (resolvedDate != null) 'resolvedDate': resolvedDate,
        if (createdAt != null)    'createdAt':    createdAt,
      };

  @override
  List<Object?> get props => [id, title, status, severity];
}

// ─────────────────────────────────────────────────────────────────────────────
//  TIME ENTRY
// ─────────────────────────────────────────────────────────────────────────────

class TimeEntry extends Equatable {
  const TimeEntry({
    required this.id,
    required this.userId,
    required this.date,
    required this.hours,
    required this.isBillable,
    required this.status,
    this.projectId,
    this.taskId,
    this.description,
    this.createdAt,
  });

  final String id;
  final String userId;
  final String date;
  final double hours;
  final bool isBillable;
  final String status; // DRAFT | SUBMITTED | APPROVED | REJECTED
  final String? projectId;
  final String? taskId;
  final String? description;
  final String? createdAt;

  String get statusDisplay => switch (status) {
    'DRAFT'     => 'Draft',
    'SUBMITTED' => 'Submitted',
    'APPROVED'  => 'Approved',
    'REJECTED'  => 'Rejected',
    _           => status,
  };

  factory TimeEntry.fromJson(Map<String, dynamic> j) => TimeEntry(
        id:          j['id']?.toString() ?? '',
        userId:      j['userId']?.toString() ?? '',
        date:        j['date'] as String? ?? '',
        hours:       (j['hours'] as num?)?.toDouble() ?? 0.0,
        isBillable:  j['isBillable'] as bool? ?? false,
        status:      j['status'] as String? ?? 'DRAFT',
        projectId:   j['projectId']?.toString(),
        taskId:      j['taskId']?.toString(),
        description: j['description'] as String?,
        createdAt:   j['createdAt'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id':         id,
        'userId':     userId,
        'date':       date,
        'hours':      hours,
        'isBillable': isBillable,
        'status':     status,
        if (projectId != null)   'projectId':   projectId,
        if (taskId != null)      'taskId':      taskId,
        if (description != null) 'description': description,
        if (createdAt != null)   'createdAt':   createdAt,
      };

  @override
  List<Object?> get props => [id, userId, date, hours];
}

// ─────────────────────────────────────────────────────────────────────────────
//  LEAVE REQUEST
// ─────────────────────────────────────────────────────────────────────────────

class LeaveRequest extends Equatable {
  const LeaveRequest({
    required this.id,
    required this.userId,
    required this.leaveType,
    required this.startDate,
    required this.endDate,
    this.reason,
    required this.status,
    this.createdAt,
    this.employeeName,
  });

  final String id;
  final String userId;
  final String leaveType;
  final String startDate;
  final String endDate;
  final String? reason;
  final String status; // PENDING | APPROVED | REJECTED | CANCELLED
  final String? createdAt;
  final String? employeeName;

  String get statusDisplay => switch (status) {
    'PENDING'   => 'Pending',
    'APPROVED'  => 'Approved',
    'REJECTED'  => 'Rejected',
    'CANCELLED' => 'Cancelled',
    _           => status,
  };

  factory LeaveRequest.fromJson(Map<String, dynamic> j) {
    // DB returns snake_case (ROWID, user_id, start_date, end_date,
    // leave_type_name) — handle both conventions.
    final leaveTypeName = j['leave_type_name'] as String?
        ?? (j['leave_type'] is Map ? (j['leave_type'] as Map)['name'] as String? : null)
        ?? j['leaveType'] as String?
        ?? '';
    return LeaveRequest(
      id:           j['ROWID']?.toString() ?? j['id']?.toString() ?? '',
      userId:       j['user_id']?.toString() ?? j['userId']?.toString() ?? '',
      leaveType:    leaveTypeName,
      startDate:    j['start_date'] as String? ?? j['startDate'] as String? ?? '',
      endDate:      j['end_date']   as String? ?? j['endDate']   as String? ?? '',
      reason:       j['reason']     as String? ?? '',
      status:       j['status']     as String? ?? 'PENDING',
      createdAt:    j['CREATEDTIME'] as String? ?? j['createdAt'] as String?,
      employeeName: j['user_name'] as String? ?? j['employee_name'] as String?
                    ?? j['employeeName'] as String? ?? j['name'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id':        id,
        'userId':    userId,
        'leaveType': leaveType,
        'startDate': startDate,
        'endDate':   endDate,
        'reason':    reason,
        'status':    status,
        if (createdAt != null) 'createdAt': createdAt,
      };

  @override
  List<Object?> get props => [id, userId, startDate, endDate, status];
}

// ─────────────────────────────────────────────────────────────────────────────
//  SPRINT
// ─────────────────────────────────────────────────────────────────────────────

class Sprint extends Equatable {
  const Sprint({
    required this.id,
    required this.name,
    required this.projectId,
    required this.status,
    this.startDate,
    this.endDate,
    this.goalDescription,
    this.velocity,
  });

  final String id;
  final String name;
  final String projectId;
  final String status; // PLANNING | ACTIVE | COMPLETED | CANCELLED
  final String? startDate;
  final String? endDate;
  final String? goalDescription;
  final int? velocity;

  String get statusDisplay => switch (status) {
    'PLANNING'  => 'Planning',
    'ACTIVE'    => 'Active',
    'COMPLETED' => 'Completed',
    'CANCELLED' => 'Cancelled',
    _           => status,
  };

  factory Sprint.fromJson(Map<String, dynamic> j) => Sprint(
        // Catalyst DataStore returns ROWID; web may return id
        id:              j['ROWID']?.toString()
                      ?? j['id']?.toString()
                      ?? '',
        name:            j['name'] as String? ?? '',
        // snake_case from DataStore, camelCase from web
        projectId:       j['project_id']?.toString()
                      ?? j['projectId']?.toString()
                      ?? '',
        status:          j['status'] as String? ?? 'PLANNING',
        startDate:       j['start_date'] as String?
                      ?? j['startDate'] as String?,
        endDate:         j['end_date'] as String?
                      ?? j['endDate'] as String?,
        goalDescription: j['goal'] as String?
                      ?? j['goalDescription'] as String?,
        velocity:        (j['velocity'] as num?)?.toInt(),
      );

  Map<String, dynamic> toJson() => {
        'id':        id,
        'name':      name,
        'projectId': projectId,
        'status':    status,
        if (startDate != null)       'startDate':       startDate,
        if (endDate != null)         'endDate':         endDate,
        if (goalDescription != null) 'goalDescription': goalDescription,
        if (velocity != null)        'velocity':        velocity,
      };

  @override
  List<Object?> get props => [id, name, projectId, status];
}

// ─────────────────────────────────────────────────────────────────────────────
//  RAID ITEM
// ─────────────────────────────────────────────────────────────────────────────

class RaidItem extends Equatable {
  const RaidItem({
    required this.id,
    required this.projectId,
    required this.type,
    required this.title,
    required this.status,
    required this.priority,
    required this.impact,
    this.description,
    this.ownerId,
    this.createdAt,
  });

  final String id;
  final String projectId;
  final String type;     // RISK | ISSUE | DEPENDENCY | ASSUMPTION
  final String title;
  final String status;
  final String priority; // CRITICAL | HIGH | MEDIUM | LOW
  final String impact;
  final String? description;
  final String? ownerId;
  final String? createdAt;

  String get typeDisplay => switch (type) {
    'RISK'       => 'Risk',
    'ISSUE'      => 'Issue',
    'DEPENDENCY' => 'Dependency',
    'ASSUMPTION' => 'Assumption',
    _            => type,
  };

  factory RaidItem.fromJson(Map<String, dynamic> j) => RaidItem(
        id:          j['id']?.toString() ?? '',
        projectId:   j['projectId']?.toString() ?? '',
        type:        j['type'] as String? ?? 'RISK',
        title:       j['title'] as String? ?? '',
        status:      j['status'] as String? ?? 'OPEN',
        priority:    j['priority'] as String? ?? 'MEDIUM',
        impact:      j['impact'] as String? ?? '',
        description: j['description'] as String?,
        ownerId:     j['ownerId']?.toString(),
        createdAt:   j['createdAt'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id':        id,
        'projectId': projectId,
        'type':      type,
        'title':     title,
        'status':    status,
        'priority':  priority,
        'impact':    impact,
        if (description != null) 'description': description,
        if (ownerId != null)     'ownerId':     ownerId,
        if (createdAt != null)   'createdAt':   createdAt,
      };

  @override
  List<Object?> get props => [id, title, type, status];
}

// ─────────────────────────────────────────────────────────────────────────────
//  DECISION
// ─────────────────────────────────────────────────────────────────────────────

class Decision extends Equatable {
  const Decision({
    required this.id,
    required this.projectId,
    required this.title,
    required this.rationale,
    required this.status,
    this.madeBy,
    this.decisionDate,
    this.impact,
  });

  final String id;
  final String projectId;
  final String title;
  final String rationale;
  final String status;
  final String? madeBy;
  final String? decisionDate;
  final String? impact;

  factory Decision.fromJson(Map<String, dynamic> j) => Decision(
        id:           j['id']?.toString() ?? '',
        projectId:    j['projectId']?.toString() ?? '',
        title:        j['title'] as String? ?? '',
        rationale:    j['rationale'] as String? ?? '',
        status:       j['status'] as String? ?? 'OPEN',
        madeBy:       j['madeBy']?.toString(),
        decisionDate: j['decisionDate'] as String?,
        impact:       j['impact'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id':        id,
        'projectId': projectId,
        'title':     title,
        'rationale': rationale,
        'status':    status,
        if (madeBy != null)       'madeBy':       madeBy,
        if (decisionDate != null) 'decisionDate': decisionDate,
        if (impact != null)       'impact':       impact,
      };

  @override
  List<Object?> get props => [id, projectId, title, status];
}

// ─────────────────────────────────────────────────────────────────────────────
//  USER PROFILE
// ─────────────────────────────────────────────────────────────────────────────

class UserProfile extends Equatable {
  const UserProfile({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.tenantId,
    required this.status,
    this.tenantName,
    this.tenantSlug,
    this.avatarUrl,
    this.department,
    this.designation,
    this.joinDate,
    this.skills,
  });

  final String id;
  final String name;
  final String email;
  final String role;
  final String tenantId;
  final String status;
  final String? tenantName;
  final String? tenantSlug;
  final String? avatarUrl;
  final String? department;
  final String? designation;
  final String? joinDate;
  final List<String>? skills;

  factory UserProfile.fromJson(Map<String, dynamic> j) {
    final rawSkills = j['skills'];
    List<String>? skills;
    if (rawSkills is List) {
      skills = rawSkills.map((s) => s.toString()).toList();
    }

    return UserProfile(
      id:          j['id']?.toString() ?? '',
      name:        j['name'] as String? ?? '',
      email:       j['email'] as String? ?? '',
      role:        j['role'] as String? ?? 'TEAM_MEMBER',
      tenantId:    j['tenantId']?.toString() ?? '',
      status:      j['status'] as String? ?? 'ACTIVE',
      tenantName:  j['tenantName'] as String?,
      tenantSlug:  j['tenantSlug'] as String?,
      avatarUrl:   j['avatarUrl'] as String?,
      department:  j['department'] as String?,
      designation: j['designation'] as String?,
      joinDate:    j['joinDate'] as String?,
      skills:      skills,
    );
  }

  Map<String, dynamic> toJson() => {
        'id':        id,
        'name':      name,
        'email':     email,
        'role':      role,
        'tenantId':  tenantId,
        'status':    status,
        if (tenantName != null)  'tenantName':  tenantName,
        if (tenantSlug != null)  'tenantSlug':  tenantSlug,
        if (avatarUrl != null)   'avatarUrl':   avatarUrl,
        if (department != null)  'department':  department,
        if (designation != null) 'designation': designation,
        if (joinDate != null)    'joinDate':    joinDate,
        if (skills != null)      'skills':      skills,
      };

  @override
  List<Object?> get props => [id, email, role, tenantId, status];
}

// ─────────────────────────────────────────────────────────────────────────────
//  NOTIFICATION
// ─────────────────────────────────────────────────────────────────────────────

class DSNotification extends Equatable {
  const DSNotification({
    required this.id,
    required this.type,
    required this.title,
    required this.message,
    required this.isRead,
    required this.createdAt,
    this.link,
  });

  final String id;
  final String type;
  final String title;
  final String message;
  final bool isRead;
  final String createdAt;
  final String? link;

  factory DSNotification.fromJson(Map<String, dynamic> j) => DSNotification(
        id:        j['id']?.toString() ?? '',
        type:      j['type'] as String? ?? '',
        title:     j['title'] as String? ?? '',
        message:   j['message'] as String? ?? '',
        isRead:    j['isRead'] as bool? ?? false,
        createdAt: j['createdAt'] as String? ?? '',
        link:      j['link'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id':        id,
        'type':      type,
        'title':     title,
        'message':   message,
        'isRead':    isRead,
        'createdAt': createdAt,
        if (link != null) 'link': link,
      };

  @override
  List<Object?> get props => [id, type, isRead, createdAt];
}

// ─────────────────────────────────────────────────────────────────────────────
//  LEAVE BALANCE
// ─────────────────────────────────────────────────────────────────────────────

class LeaveBalance extends Equatable {
  const LeaveBalance({
    required this.leaveType,
    required this.total,
    required this.used,
    required this.remaining,
  });

  final String leaveType;
  final double total;
  final double used;
  final double remaining;

  factory LeaveBalance.fromJson(Map<String, dynamic> j) {
    // DB returns: leave_type (object with name), total_allocated,
    // used_days, remaining_days — handle both conventions.
    final typeObj = j['leave_type'];
    final leaveTypeName = (typeObj is Map ? typeObj['name'] as String? : null)
        ?? j['leaveType'] as String?
        ?? '';
    return LeaveBalance(
      leaveType: leaveTypeName,
      total:     (j['total_allocated'] as num? ?? j['total'] as num?)?.toDouble() ?? 0.0,
      used:      (j['used_days']       as num? ?? j['used']  as num?)?.toDouble() ?? 0.0,
      remaining: (j['remaining_days']  as num? ?? j['remaining'] as num?)?.toDouble() ?? 0.0,
    );
  }

  Map<String, dynamic> toJson() => {
        'leaveType': leaveType,
        'total':     total,
        'used':      used,
        'remaining': remaining,
      };

  @override
  List<Object?> get props => [leaveType, total, used, remaining];
}

// ─────────────────────────────────────────────────────────────────────────────
//  REPORT
// ─────────────────────────────────────────────────────────────────────────────

class Report extends Equatable {
  const Report({
    required this.id,
    required this.projectId,
    required this.reportType,
    required this.createdAt,
    this.projectName,
    this.periodStart,
    this.periodEnd,
    this.summary,
    this.shareUrl,
  });

  final String id;
  final String projectId;
  final String reportType; // WEEKLY | MONTHLY | CUSTOM
  final String createdAt;
  final String? projectName;
  final String? periodStart;
  final String? periodEnd;
  final Map<String, dynamic>? summary;
  final String? shareUrl;

  factory Report.fromJson(Map<String, dynamic> j) => Report(
        id:          j['id']?.toString() ?? '',
        projectId:   j['projectId']?.toString() ?? '',
        reportType:  j['reportType']  as String? ?? 'WEEKLY',
        createdAt:   j['createdAt']   as String? ?? '',
        projectName: j['projectName'] as String?,
        periodStart: j['periodStart'] as String?,
        periodEnd:   j['periodEnd']   as String?,
        summary:     j['summary']     as Map<String, dynamic>?,
        shareUrl:    j['shareUrl']    as String?,
      );

  @override
  List<Object?> get props => [id, projectId, reportType, createdAt];
}

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN USER
// ─────────────────────────────────────────────────────────────────────────────

class AdminUser extends Equatable {
  const AdminUser({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    required this.status,
    this.avatarUrl,
    this.createdAt,
  });

  final String id;
  final String name;
  final String email;
  final String role;
  final String status; // ACTIVE | SUSPENDED | INVITED
  final String? avatarUrl;
  final String? createdAt;

  factory AdminUser.fromJson(Map<String, dynamic> j) => AdminUser(
        id:        j['id']?.toString() ?? '',
        name:      j['name']      as String? ?? '',
        email:     j['email']     as String? ?? '',
        role:      j['role']      as String? ?? 'TEAM_MEMBER',
        status:    j['status']    as String? ?? 'ACTIVE',
        avatarUrl: j['avatarUrl'] as String?,
        createdAt: j['createdAt'] as String?,
      );

  @override
  List<Object?> get props => [id, email, role, status];
}

// ─────────────────────────────────────────────────────────────────────────────
//  AUDIT LOG
// ─────────────────────────────────────────────────────────────────────────────

class AuditLog extends Equatable {
  const AuditLog({
    required this.id,
    required this.action,
    required this.resource,
    required this.userId,
    required this.createdAt,
    this.userName,
    this.details,
    this.performedByName,
    this.performedByEmail,
    this.avatarUrl,
    this.entityType,
    this.entityId,
    this.oldValue,
    this.newValue,
  });

  final String id;
  final String action;
  final String resource;
  final String userId;
  final String createdAt;
  final String? userName;
  final String? details;
  final String? performedByName;
  final String? performedByEmail;
  final String? avatarUrl;
  final String? entityType;
  final String? entityId;
  final String? oldValue;
  final String? newValue;

  static String? _valStr(dynamic v) {
    if (v == null) return null;
    if (v is String) return v.isEmpty ? null : v;
    return v.toString();
  }

  factory AuditLog.fromJson(Map<String, dynamic> j) => AuditLog(
        id:               j['id']?.toString()           ?? j['ROWID']?.toString() ?? '',
        action:           j['action']    as String?     ?? '',
        resource:         j['resource']  as String?     ?? j['entity_type'] as String? ?? '',
        userId:           j['userId']?.toString()        ?? j['performed_by']?.toString() ?? '',
        createdAt:        j['createdAt'] as String?     ?? j['created_at'] as String? ?? j['CREATEDTIME'] as String? ?? '',
        userName:         j['userName']  as String?,
        details:          j['details']   as String?,
        performedByName:  j['performedByName']  as String? ?? j['performed_by_name']  as String?,
        performedByEmail: j['performedByEmail'] as String? ?? j['performed_by_email'] as String?,
        avatarUrl:        j['avatarUrl']  as String?    ?? j['avatar_url'] as String?,
        entityType:       j['entityType'] as String?   ?? j['entity_type'] as String?,
        entityId:         j['entityId']?.toString()    ?? j['entity_id']?.toString(),
        oldValue:         _valStr(j['oldValue'] ?? j['old_value']),
        newValue:         _valStr(j['newValue'] ?? j['new_value']),
      );

  @override
  List<Object?> get props => [id, action, resource, createdAt];
}

// ─────────────────────────────────────────────────────────────────────────────
//  MILESTONE
// ─────────────────────────────────────────────────────────────────────────────

class Milestone extends Equatable {
  const Milestone({
    required this.id,
    required this.projectId,
    required this.title,
    required this.status,
    this.description,
    this.dueDate,
    this.ownerUserId,
    this.ownerName,
  });

  final String id;
  final String projectId;
  final String title;
  final String status; // PENDING | IN_PROGRESS | COMPLETED | DELAYED
  final String? description;
  final String? dueDate;
  final String? ownerUserId;
  final String? ownerName;

  factory Milestone.fromJson(Map<String, dynamic> j) => Milestone(
        id:          j['id']?.toString() ?? '',
        projectId:   j['projectId']?.toString() ?? '',
        title:       j['title']  as String? ?? '',
        status:      j['status'] as String? ?? 'PENDING',
        description: j['description'] as String?,
        dueDate:     j['dueDate']     as String?,
        ownerUserId: j['ownerUserId']?.toString(),
        ownerName:   j['ownerName']   as String?,
      );

  @override
  List<Object?> get props => [id, projectId, title, status];
}
