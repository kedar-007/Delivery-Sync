'use strict';

/**
 * PromptService — builds deterministic, well-engineered prompts for each AI
 * insight type.
 *
 * Design principles:
 *  1. Always instruct the model to return ONLY valid JSON — no prose preamble.
 *  2. Each prompt includes a schema comment so the model knows the expected shape.
 *  3. Data sections are capped at ~500 words to stay within token budgets.
 *  4. Sensitive fields (emails, raw user IDs) are excluded from the prompt data.
 */
class PromptService {

  // ─── System Prompt (shared) ────────────────────────────────────────────────

  static get SYSTEM_PROMPT() {
    return (
      'You are an expert engineering performance analyst for "DeliverSync", a project management platform. ' +
      'Your role is to produce precise, evidence-based performance insights that managers can act on immediately. ' +

      'ANALYSIS RULES: ' +
      '1. Always cite specific numbers from the data (e.g. "missed 8/20 standups", "3 overdue tasks out of 7"). ' +
      '2. When team benchmarks are provided, state whether each person is above, at, or below the team median. ' +
      '3. Every suggestion must be concrete and time-bound (e.g. "Schedule a 30-min backlog review by Friday"). ' +
      '4. Distinguish between a data gap (no data available) and a genuine performance gap. ' +
      '5. Never invent numbers or infer effort from missing data — state "insufficient data" instead. ' +

      'OUTPUT RULES: ' +
      'Your entire response MUST be a single raw JSON object. ' +
      'Do NOT include any text before or after the JSON. ' +
      'Do NOT wrap the JSON in markdown code fences (no ```json or ```). ' +
      'Start your response with { and end with }. ' +
      'Keep string values concise (≤ 25 words each) and actionable.'
    );
  }

  // ─── Daily Summary ────────────────────────────────────────────────────────

  /**
   * @param {object} ctx
   * @param {string}   ctx.date
   * @param {object[]} ctx.projects
   * @param {object[]} ctx.standups
   * @param {object[]} ctx.eodEntries
   */
  static buildDailySummaryPrompt({ date, projects, standups, eodEntries }) {
    const projectNames = projects.map((p) => p.name).join(', ') || 'N/A';
    const standupText  = PromptService._formatEntries(standups,   ['today', 'blockers'], 10);
    const eodText      = PromptService._formatEntries(eodEntries, ['accomplishments', 'blockers', 'mood'], 10);

    return `
Analyse the following team activity for ${date} across project(s): ${projectNames}.

=== STANDUP ENTRIES (${standups.length}) ===
${standupText || 'No standups submitted today.'}

=== EOD ENTRIES (${eodEntries.length}) ===
${eodText || 'No EOD updates submitted today.'}

Return ONLY a JSON object matching this schema (no extra text):
{
  "summary": "2-3 sentence overview of the day",
  "highlights": ["achievement 1", "achievement 2"],
  "blockers": ["blocker 1", "blocker 2"],
  "missedSubmissions": ${standups.length === 0 && eodEntries.length === 0},
  "sentiment": "positive | neutral | negative | mixed",
  "suggestions": ["actionable suggestion 1", "actionable suggestion 2"]
}`.trim();
  }

  // ─── Project Health ───────────────────────────────────────────────────────

  /**
   * @param {object} ctx
   * @param {object[]} ctx.projects
   * @param {object[]} ctx.milestones
   * @param {object[]} ctx.actions
   * @param {object[]} ctx.blockers
   * @param {number}   ctx.standupCount  – standups in last 7 days
   */
  static buildProjectHealthPrompt({ projects, milestones, actions, blockers, standupCount }) {
    const total    = actions.length;
    const done     = actions.filter((a) => a.status === 'DONE').length;
    const open     = actions.filter((a) => ['OPEN', 'IN_PROGRESS'].includes(a.status)).length;
    const overdue  = actions.filter((a) => a.status !== 'DONE' && a.status !== 'CANCELLED' && a.due_date && a.due_date < new Date().toISOString().slice(0, 10)).length;

    const milestoneSummary = {
      total:     milestones.length,
      completed: milestones.filter((m) => m.status === 'COMPLETED').length,
      delayed:   milestones.filter((m) => m.status === 'DELAYED').length,
      inProgress:milestones.filter((m) => m.status === 'IN_PROGRESS').length,
    };

    const blockerSummary = {
      total:    blockers.length,
      critical: blockers.filter((b) => b.severity === 'CRITICAL').length,
      high:     blockers.filter((b) => b.severity === 'HIGH').length,
    };

    const projectList = projects.map((p) => ({
      name:      p.name,
      ragStatus: p.rag_status || 'UNKNOWN',
      endDate:   p.end_date   || 'N/A',
    }));

    return `
Analyse the following project health metrics and classify each project's status.

=== PROJECTS ===
${JSON.stringify(projectList, null, 2)}

=== ACTION METRICS ===
Total: ${total} | Completed: ${done} | Open: ${open} | Overdue: ${overdue}

=== MILESTONE METRICS ===
${JSON.stringify(milestoneSummary, null, 2)}

=== BLOCKER METRICS ===
${JSON.stringify(blockerSummary, null, 2)}

=== TEAM ENGAGEMENT ===
Standups submitted in last 7 days: ${standupCount}

Return ONLY a JSON object matching this schema:
{
  "overallStatus": "On Track | At Risk | Delayed",
  "score": 0-100,
  "projects": [
    { "name": "...", "status": "On Track | At Risk | Delayed", "ragStatus": "..." }
  ],
  "reasons": ["reason 1", "reason 2"],
  "recommendations": ["recommendation 1", "recommendation 2"],
  "riskFlags": ["flag 1", "flag 2"]
}`.trim();
  }

  // ─── Team Performance ────────────────────────────────────────────────────

  /**
   * @param {object} ctx
   * @param {object} ctx.activityByMember  – Map of userId → activity object
   * @param {number} ctx.days
   */
  static buildPerformancePrompt({ activityByMember, days }) {
    const allMembers = Object.values(activityByMember);
    const workdays   = Math.round(days * (5 / 7));

    const memberSummaries = allMembers.map((m) => {
      const actionsDone  = m.actions.filter((a) => a.status === 'DONE').length;
      const actionsTotal = m.actions.length;
      const consistency  = days > 0 ? Math.round((m.standups.length / days) * 100) : 0;
      return {
        name:          m.name,
        standupCount:  m.standups.length,
        expectedStandups: workdays,
        consistency:   `${consistency}%`,
        eodCount:      m.eods.length,
        actionsDone,
        actionsTotal,
        actionsOpen:   m.actions.filter((a) => ['OPEN', 'IN_PROGRESS'].includes(a.status)).length,
        blockersRaised: m.blockersRaised.length,
        averageMood:   PromptService._avgMood(m.eods),
        reportedBlockers: m.standups.filter((s) => s.blockers && s.blockers.trim()).length,
      };
    });

    if (memberSummaries.length === 0) {
      memberSummaries.push({ name: 'Team', note: 'No activity data in this period.' });
    }

    // Team-wide averages as benchmark context
    const avgStandups = allMembers.length > 0
      ? Math.round(memberSummaries.reduce((s, m) => s + (m.standupCount || 0), 0) / allMembers.length)
      : 0;
    const avgActions  = allMembers.length > 0
      ? Math.round(memberSummaries.reduce((s, m) => s + (m.actionsDone || 0), 0) / allMembers.length)
      : 0;

    return `
Analyse individual performance for the last ${days} days (≈${workdays} workdays expected).

=== TEAM BENCHMARKS ===
Avg standups across team: ${avgStandups} | Avg actions done: ${avgActions}

=== MEMBER DATA ===
${JSON.stringify(memberSummaries, null, 2)}

For each member, compare their standupCount vs expectedStandups and their actionsDone vs actionsTotal.
Cite specific numbers in every insight (e.g. "submitted 9/15 standups (60%)").

Return ONLY a JSON object:
{
  "teamSummary": "2 sentence team assessment with specific averages",
  "members": [
    {
      "name": "...",
      "performanceSummary": "2 sentences with ≥3 specific numbers",
      "strengths": ["specific achievement with number, e.g. '100% standup attendance (15/15)'"],
      "areasOfImprovement": ["specific gap with number, e.g. '4 open actions, only 1 closed'"],
      "score": 0-100,
      "consistencyRating": "Excellent | Good | Average | Needs Improvement"
    }
  ],
  "topPerformer": "name or null",
  "teamMorale": "High | Medium | Low",
  "alerts": ["urgent issue with specific evidence"]
}`.trim();
  }

  // ─── AI Report ───────────────────────────────────────────────────────────

  /**
   * @param {object} ctx
   * @param {string}   ctx.type     – 'daily' | 'weekly' | 'project'
   * @param {object[]} ctx.projects
   * @param {object[]} ctx.standups
   * @param {object[]} ctx.eods
   * @param {object[]} ctx.actions
   * @param {object[]} ctx.blockers
   * @param {object[]} ctx.milestones
   * @param {object[]} ctx.decisions
   * @param {string}   ctx.dateFrom
   * @param {string}   ctx.dateTo
   */
  static buildReportPrompt({ type, projects, standups, eods, actions, blockers, milestones, decisions, dateFrom, dateTo }) {
    const period = `${dateFrom} to ${dateTo}`;
    const projectNames = projects.map((p) => p.name).join(', ') || 'N/A';

    const actionMetrics = {
      total:     actions.length,
      done:      actions.filter((a) => a.status === 'DONE').length,
      overdue:   actions.filter((a) => a.status !== 'DONE' && a.status !== 'CANCELLED' && a.due_date < new Date().toISOString().slice(0, 10)).length,
    };

    const blockerMetrics = {
      total:    blockers.length,
      resolved: blockers.filter((b) => b.status === 'RESOLVED').length,
      open:     blockers.filter((b) => b.status !== 'RESOLVED').length,
      critical: blockers.filter((b) => b.severity === 'CRITICAL').length,
    };

    const milestoneMetrics = {
      total:     milestones.length,
      completed: milestones.filter((m) => m.status === 'COMPLETED').length,
      delayed:   milestones.filter((m) => m.status === 'DELAYED').length,
    };

    const recentDecisions = decisions.slice(0, 5).map((d) => d.title);

    return `
Generate a ${type.toUpperCase()} REPORT for project(s): ${projectNames}
Period: ${period}

=== ACTIVITY VOLUME ===
Standups submitted: ${standups.length}
EOD updates submitted: ${eods.length}

=== ACTIONS ===
${JSON.stringify(actionMetrics, null, 2)}

=== BLOCKERS ===
${JSON.stringify(blockerMetrics, null, 2)}

=== MILESTONES ===
${JSON.stringify(milestoneMetrics, null, 2)}

=== RECENT DECISIONS ===
${recentDecisions.length > 0 ? recentDecisions.join('\n') : 'None recorded.'}

Return ONLY a JSON object matching this schema:
{
  "title": "Report title",
  "period": "${period}",
  "executiveSummary": "3-4 sentence executive summary",
  "keyAchievements": ["achievement 1", "achievement 2"],
  "challenges": ["challenge 1", "challenge 2"],
  "actionableItems": ["item 1", "item 2"],
  "metrics": {
    "overallHealth": "On Track | At Risk | Delayed",
    "completionRate": "e.g. 72%",
    "teamEngagement": "High | Medium | Low"
  },
  "outlook": "Forward-looking statement for next period"
}`.trim();
  }

  // ─── Smart Suggestions ───────────────────────────────────────────────────

  /**
   * @param {object} ctx
   * @param {object[]} ctx.openBlockers
   * @param {object[]} ctx.overdueActions
   * @param {object[]} ctx.delayedMilestones
   * @param {number}   ctx.teamSize
   * @param {object[]} ctx.moods
   * @param {object[]} ctx.projects
   */
  static buildSuggestionsPrompt({ openBlockers, overdueActions, delayedMilestones, teamSize, moods, projects }) {
    const moodDist = PromptService._moodDistribution(moods);
    const projectStatuses = projects.map((p) => ({ name: p.name, rag: p.rag_status || 'UNKNOWN' }));

    const criticalBlockers = openBlockers.filter((b) => b.severity === 'CRITICAL').length;
    const highBlockers     = openBlockers.filter((b) => b.severity === 'HIGH').length;
    const highPrioOverdue  = overdueActions.filter((a) => (a.action_priority || a.priority) === 'HIGH').length;

    return `
Analyse the following project data and produce SMART, evidence-based suggestions.
SMART = Specific, Measurable, Achievable, Relevant, Time-bound. Each suggestion must name WHO does WHAT by WHEN.

=== PROJECT STATUS ===
${JSON.stringify(projectStatuses, null, 2)}

=== BLOCKERS (${openBlockers.length} open) ===
Critical: ${criticalBlockers} | High: ${highBlockers} | Med/Low: ${openBlockers.length - criticalBlockers - highBlockers}
${criticalBlockers + highBlockers > 0 ? 'Top blockers:\n' + openBlockers.filter(b => ['CRITICAL','HIGH'].includes(b.severity)).slice(0,3).map(b => `  - ${b.title} [${b.severity}]`).join('\n') : ''}

=== OVERDUE ACTIONS (${overdueActions.length} total, ${highPrioOverdue} HIGH priority) ===
${overdueActions.slice(0, 5).map((a) => `- ${a.title} [${a.action_priority || 'N/A'}]`).join('\n') || 'None.'}

=== DELAYED MILESTONES (${delayedMilestones.length}) ===
${delayedMilestones.slice(0, 3).map((m) => `- ${m.title} (due ${m.due_date})`).join('\n') || 'None.'}

=== TEAM ===
Size: ${teamSize} | Mood (14d): ${JSON.stringify(moodDist)}

Return ONLY a JSON object:
{
  "productivity": [
    { "suggestion": "SMART action string (who, what, by when)", "priority": "high|medium|low", "impact": "expected outcome", "dueHorizon": "today|this-week|this-sprint" }
  ],
  "riskMitigation": [
    { "suggestion": "SMART action string", "priority": "high|medium|low", "impact": "expected outcome", "dueHorizon": "today|this-week|this-sprint" }
  ],
  "resourceAllocation": [
    { "suggestion": "SMART action string", "priority": "high|medium|low", "impact": "expected outcome", "dueHorizon": "today|this-week|this-sprint" }
  ],
  "overallRiskLevel": "high|medium|low",
  "immediateActions": ["action with owner and deadline, e.g. 'Lead to resolve CRITICAL blocker X before EOD'"]
}`.trim();
  }

  // ─── Voice Transcript Processing ─────────────────────────────────────────

  /**
   * Extracts structured standup/EOD fields and AI insights from a voice transcript.
   *
   * @param {object} ctx
   * @param {string} ctx.transcript  – Raw speech-to-text output
   * @param {'standup'|'eod'} ctx.type
   */
  static buildVoiceProcessPrompt({ transcript, type }) {
    const isStandup = type === 'standup';

    const schema = isStandup
      ? `{
  "summary": "2-3 sentence overview of what was said",
  "yesterday": "work done yesterday — detailed, first person, extracted from transcript",
  "today": "work planned for today — detailed, first person, extracted from transcript",
  "blockers": "any blockers or impediments mentioned (empty string if none)",
  "insights": {
    "keyHighlights": ["key point 1", "key point 2"],
    "risks": ["risk or concern detected"],
    "sentiment": "positive | neutral | negative",
    "productivityScore": 72,
    "suggestions": ["actionable recommendation based on the update"]
  }
}`
      : `{
  "summary": "2-3 sentence overview of what was said",
  "accomplishments": "what was accomplished today — detailed, first person, extracted from transcript",
  "plan_for_tomorrow": "plans for tomorrow — detailed, first person, extracted from transcript",
  "blockers": "any blockers or impediments (empty string if none)",
  "mood": "GREEN | YELLOW | RED",
  "insights": {
    "keyHighlights": ["key achievement or notable point"],
    "risks": ["any risk or concern detected"],
    "sentiment": "positive | neutral | negative",
    "productivityScore": 72,
    "suggestions": ["actionable recommendation based on the update"]
  }
}`;

    return `
You are processing a voice recording transcript from a ${isStandup ? 'daily standup' : 'end-of-day (EOD)'} update.

=== TRANSCRIPT ===
${transcript.substring(0, 2000)}

Extract structured information from this transcript and return ONLY valid JSON matching this exact schema:
${schema}

Rules:
- Extract only information that is actually present in the transcript — do not invent content.
- Keep field text in first person, concise but complete.
- mood (EOD only): GREEN = good/productive, YELLOW = okay/mixed, RED = tough/challenging.
- productivityScore: integer 0–100 based on work volume and sentiment clues.
- Use empty string for text fields when the information was not mentioned.
- Return ONLY the JSON object — no markdown fences, no extra text.
`.trim();
  }

  // ─── 6. Blocker Detection ────────────────────────────────────────────────

  /**
   * Detects explicit and implicit blockers from standup/EOD text entries.
   *
   * @param {object} ctx
   * @param {object[]} ctx.standups
   * @param {object[]} ctx.eods
   * @param {object[]} ctx.existingBlockers
   * @param {object[]} ctx.projects
   */
  static buildBlockerDetectionPrompt({ standups, eods, existingBlockers, projects }) {
    const standupText = PromptService._formatEntries(standups, ['yesterday', 'today', 'blockers'], 10);
    const eodText     = PromptService._formatEntries(eods,     ['accomplished', 'blockers'], 10);
    const known       = existingBlockers.slice(0, 20).map((b) => `- ${b.title} (${b.severity})`).join('\n');

    return `
Analyze the following team updates and detect ALL blockers — both explicit ("waiting for X") and implicit ("stuck on", "cannot proceed").

=== PROJECTS ===
${projects.map((p) => p.name).join(', ')}

=== RECENT STANDUP ENTRIES ===
${standupText || 'No standup entries.'}

=== RECENT EOD ENTRIES ===
${eodText || 'No EOD entries.'}

=== KNOWN OPEN BLOCKERS ===
${known || 'None.'}

Return ONLY a JSON object matching this schema:
{
  "type": "blocker_detection",
  "data": {
    "blockers": [
      {
        "text": "extracted text snippet",
        "blocker_type": "dependency | technical | resource | process | communication",
        "severity": "Low | Medium | High",
        "suggested_action": "specific resolution step",
        "source": "standup | eod | explicit"
      }
    ],
    "summary": "1-2 sentence overview of the blocker situation",
    "critical_count": 0,
    "requires_immediate_action": false
  }
}`.trim();
  }

  // ─── 7. Trend Analysis ───────────────────────────────────────────────────

  /**
   * Analyses historical data to surface productivity / engagement / blocker trends.
   *
   * @param {object} ctx
   * @param {object[]} ctx.standups
   * @param {object[]} ctx.eods
   * @param {object[]} ctx.actions
   * @param {object[]} ctx.blockers
   * @param {number}   ctx.days
   * @param {object[]} ctx.projects
   */
  static buildTrendAnalysisPrompt({ standups, eods, actions, blockers, days, projects }) {
    const moodDist = PromptService._moodDistribution(eods);

    const actionMetrics = {
      total:     actions.length,
      completed: actions.filter((a) => a.status === 'DONE').length,
      overdue:   actions.filter((a) =>
        a.status !== 'DONE' && a.status !== 'CANCELLED' &&
        a.due_date && a.due_date < new Date().toISOString().slice(0, 10)
      ).length,
    };

    const blockerMetrics = {
      total:    blockers.length,
      resolved: blockers.filter((b) => b.status === 'RESOLVED').length,
      open:     blockers.filter((b) => b.status !== 'RESOLVED').length,
      critical: blockers.filter((b) => b.severity === 'CRITICAL').length,
    };

    const engagementRate = days > 0 ? Math.round(((standups.length + eods.length) / (days * 2)) * 100) : 0;
    const completionRate = actionMetrics.total > 0
      ? Math.round((actionMetrics.completed / actionMetrics.total) * 100) : 0;
    const blockerResolutionRate = blockerMetrics.total > 0
      ? Math.round((blockerMetrics.resolved / blockerMetrics.total) * 100) : 0;

    return `
Analyse ${days}-day historical data for trend direction and root-cause patterns.
Projects: ${projects.map((p) => p.name).join(', ')}

=== ENGAGEMENT (${days}d) ===
Standups: ${standups.length} | EODs: ${eods.length} | Combined rate: ${engagementRate}%
Mood distribution: ${JSON.stringify(moodDist)}

=== TASK DELIVERY ===
Total actions: ${actionMetrics.total} | Completed: ${actionMetrics.completed} (${completionRate}%) | Overdue: ${actionMetrics.overdue}

=== BLOCKERS ===
Total: ${blockerMetrics.total} | Resolved: ${blockerMetrics.resolved} (${blockerResolutionRate}%) | Open: ${blockerMetrics.open} | Critical: ${blockerMetrics.critical}

For each trend field, reason from the numbers: e.g. engagement rate ${engagementRate}% ${engagementRate >= 70 ? 'is healthy' : 'is low — flag as declining'}.
For insights, cite the actual rates and what they imply (e.g. "${completionRate}% task completion over ${days} days indicates moderate velocity").

Return ONLY a JSON object:
{
  "type": "trend_analysis",
  "data": {
    "productivityTrend": "increasing|decreasing|stable",
    "engagementTrend": "increasing|decreasing|stable",
    "moodTrend": "improving|declining|stable",
    "delayedTaskTrend": "improving|worsening|stable",
    "recurringBlockers": ["pattern backed by data"],
    "riskAreas": ["specific area with evidence"],
    "insights": ["data-backed insight with numbers", "second insight", "third insight"],
    "recommendations": ["SMART recommendation 1", "SMART recommendation 2"],
    "period": "${days} days"
  }
}`.trim();
  }

  // ─── 8. Sprint Retrospective ─────────────────────────────────────────────

  /**
   * Generates a retrospective: went well, went wrong, and action items.
   *
   * @param {object} ctx
   * @param {object[]} ctx.standups
   * @param {object[]} ctx.eods
   * @param {object[]} ctx.actions
   * @param {object[]} ctx.blockers
   * @param {object[]} ctx.milestones
   * @param {object[]} ctx.projects
   * @param {string}   ctx.sprintStart
   * @param {string}   ctx.sprintEnd
   */
  static buildRetrospectivePrompt({ standups, eods, actions, blockers, milestones, projects, sprintStart, sprintEnd }) {
    const actionMetrics = {
      total:      actions.length,
      completed:  actions.filter((a) => a.status === 'DONE').length,
      inProgress: actions.filter((a) => a.status === 'IN_PROGRESS').length,
      open:       actions.filter((a) => a.status === 'OPEN').length,
    };

    const blockerMetrics = {
      total:    blockers.length,
      resolved: blockers.filter((b) => b.status === 'RESOLVED').length,
      critical: blockers.filter((b) => b.severity === 'CRITICAL').length,
    };

    const milestoneMetrics = {
      total:     milestones.length,
      completed: milestones.filter((m) => m.status === 'COMPLETED').length,
      delayed:   milestones.filter((m) => m.status === 'DELAYED').length,
    };

    return `
Generate a sprint retrospective based on the following sprint data.

=== SPRINT ===
Projects: ${projects.map((p) => p.name).join(', ')}
Period: ${sprintStart} to ${sprintEnd}

=== TEAM ACTIVITY ===
Standups submitted: ${standups.length}
EODs submitted: ${eods.length}
Average team mood: ${PromptService._avgMood(eods)}
Mood distribution: ${JSON.stringify(PromptService._moodDistribution(eods))}

=== ACTIONS ===
${JSON.stringify(actionMetrics, null, 2)}

=== BLOCKERS ===
${JSON.stringify(blockerMetrics, null, 2)}

=== MILESTONES ===
${JSON.stringify(milestoneMetrics, null, 2)}

Return ONLY a JSON object matching this schema:
{
  "type": "retrospective",
  "data": {
    "sprintSummary": "2-3 sentence sprint narrative",
    "wentWell": ["achievement 1", "achievement 2", "achievement 3"],
    "wentWrong": ["issue 1", "issue 2"],
    "actionItems": [
      { "action": "specific improvement action", "owner": "team | lead | member", "priority": "high | medium | low" }
    ],
    "velocityScore": 72,
    "teamMorale": "High | Medium | Low",
    "keyLearning": "single most important lesson from this sprint"
  }
}`.trim();
  }

  // ─── 9. Natural Language Query ───────────────────────────────────────────

  /**
   * Answers a free-text query using a rich per-project context.
   *
   * Each project includes resolved member names, open actions with assignee
   * names, blockers, milestones and recent activity — so the LLM can answer
   * questions like "Who is in the Test project?" with factual names.
   *
   * @param {object}   ctx
   * @param {string}   ctx.query
   * @param {object[]} ctx.projectContexts  – Per-project objects built by DataService
   * @param {object[]} ctx.allMembers       – All unique workspace members
   */
  static buildNLQueryPrompt({ query, projectContexts = [], allMembers = [] }) {
    // Cap to 5 projects to keep prompt within LLM input limit
    const projects = projectContexts.slice(0, 5);

    // Build compact plain-text lines — avoids JSON pretty-print bloat
    const projectLines = projects.map((proj) => {
      const members = (proj.teamMembers ?? []).map((m) => m.name).slice(0, 10).join(', ') || 'none';
      const actions = (proj.openActions ?? []).slice(0, 5)
        .map((a) => `${a.title}(${a.status},${a.assignee})`).join('; ') || 'none';
      const blockers = (proj.openBlockers ?? []).slice(0, 5)
        .map((b) => `${b.title}[${b.severity}]`).join('; ') || 'none';
      const milestones = (proj.milestones ?? []).slice(0, 5)
        .map((m) => `${m.title}(${m.status},due:${m.due ?? 'N/A'})`).join('; ') || 'none';
      const activity = proj.recentActivity ?? {};
      return [
        `Project: ${proj.name} | Status: ${proj.status} | RAG: ${proj.ragStatus} | End: ${proj.endDate ?? 'N/A'} | Team: ${proj.teamSize}`,
        `  Members: ${members}`,
        `  Actions(open): ${actions}`,
        `  Blockers(open): ${blockers}`,
        `  Milestones: ${milestones}`,
        `  Activity(7d): standups=${activity.standups_last_7_days ?? 0}, eods=${activity.eods_last_7_days ?? 0}`,
      ].join('\n');
    }).join('\n\n');

    const memberList = allMembers.slice(0, 20).map((m) => m.name).join(', ') || 'none';

    // Hard cap at 12 000 chars to stay well within LLM input limit
    const MAX_CHARS = 12000;
    const body = [
      `Query: "${query}"`,
      '',
      `Workspace (${projects.length} project(s)):`,
      projectLines,
      '',
      `Members: ${memberList}`,
    ].join('\n');

    const truncatedBody = body.length > MAX_CHARS ? body.slice(0, MAX_CHARS) + '\n[data truncated]' : body;

    return (
      `You are answering a question about a project management workspace. ` +
      `Use ONLY the data provided — do not invent names or numbers.\n\n` +
      `${truncatedBody}\n\n` +
      `Return ONLY valid JSON:\n` +
      `{"type":"nl_query","data":{"answer":"1-3 sentence factual answer using real names/numbers",` +
      `"confidence":"high|medium|low","supportingData":["fact from data"],` +
      `"followUpSuggestions":["related question"]}}`
    );
  }

  // ─── Holistic Performance ────────────────────────────────────────────────

  /**
   * Builds a rich, multi-module performance analysis prompt.
   * The LLM returns a star rating (1–5), score, summary, factors, and suggestions.
   *
   * @param {object}  ctx
   * @param {object}  ctx.memberData  – map of userId → aggregated activity
   * @param {number}  ctx.days
   * @param {string}  ctx.scope
   */
  static buildHolisticPerformancePrompt({ memberData, days, scope }) {
    const members = Object.values(memberData).slice(0, 10);
    const isSingleUser = members.length === 1;
    const workdays = Math.round(days * (5 / 7));

    // ── Team benchmarks for comparative insights ─────────────────────────────
    const median = (arr) => {
      const xs = arr.filter((v) => v !== null && !isNaN(v)).sort((a, b) => a - b);
      if (xs.length === 0) return null;
      const mid = Math.floor(xs.length / 2);
      return xs.length % 2 ? xs[mid] : Math.round(((xs[mid - 1] + xs[mid]) / 2) * 10) / 10;
    };
    const medStandups   = median(members.map((m) => m.standupCount));
    const medTasksDone  = median(members.map((m) => m.tasksDone));
    const medHours      = median(members.map((m) => m.hoursLogged));
    const medAttendance = median(members.map((m) => m.attendanceDays));
    const medActions    = median(members.map((m) => m.actionsDone));

    const benchmarkLine = members.length > 1
      ? `TEAM BENCHMARKS (medians over ${days} days): standups=${medStandups}, tasks_done=${medTasksDone}, hours=${medHours}h, attendance_days=${medAttendance}, actions_done=${medActions}`
      : `PERIOD: last ${days} days (≈${workdays} work days expected)`;

    // ── Per-member compact data lines ────────────────────────────────────────
    const dataLines = members.map((m) => {
      const moodFreq  = PromptService._countFreq(m.moods || []);
      const moodStr   = Object.entries(moodFreq).map(([k, v]) => `${k}:${v}`).join(',') || 'no data';
      const taskPct   = m.taskCompletionPct !== null ? `${m.taskCompletionPct}%` : 'N/A';
      const aboveBelow = members.length > 1 ? [
        medStandups  !== null ? (m.standupCount >= medStandups  ? '▲standups' : '▼standups')  : '',
        medTasksDone !== null ? (m.tasksDone    >= medTasksDone ? '▲tasks'    : '▼tasks')    : '',
        medHours     !== null ? (m.hoursLogged  >= medHours     ? '▲hours'    : '▼hours')    : '',
      ].filter(Boolean).join(' ') : '';
      return [
        `[${m.name}] Role:${m.role || 'Team Member'} ${aboveBelow}`,
        `  Engagement: standups=${m.standupCount}/${workdays}expected (${m.consistencyPct}%), eods=${m.eodCount}, moods=[${moodStr}]`,
        `  Tasks: total=${m.tasksTotal} done=${m.tasksDone} inProgress=${m.tasksInProgress} overdue=${m.tasksOverdue} completion=${taskPct} storyPts=${m.storyPointsDone}`,
        `  Attendance: recorded=${m.attendanceDays}days wfh=${m.wfhDays} avg=${m.avgWorkHours}h/day`,
        `  Time: logged=${m.hoursLogged}h billable=${m.billableHours}h nonBillable=${m.nonBillableHours}h utilization=${m.billableUtilization}%`,
        `  Leave: approved=${m.leaveDaysTaken}days`,
        `  Accountability: actions=${m.actionsDone}/${m.actionsTotal} done, blockers_raised=${m.blockersRaised}`,
      ].join('\n');
    }).join('\n\n');

    return (
      `Analyse ${days}-day holistic performance for ${members.length} member(s). Scope: ${scope}.\n\n` +
      `${benchmarkLine}\n\n` +
      `MEMBER DATA:\n${dataLines}\n\n` +
      `SCORING WEIGHTS: Engagement 25% | Task Delivery 25% | Attendance 20% | Time Management 15% | Accountability 15%\n` +
      `STAR SCALE: 90-100=5★ | 75-89=4★ | 60-74=3★ | 40-59=2★ | 0-39=1★\n\n` +
      `REQUIRED ANALYSIS QUALITY:\n` +
      `- performanceSummary: cite 3+ actual numbers from the data (e.g. "completed 5/8 tasks (63%), submitted 12/20 standups, logged 42h")\n` +
      `- factors[].detail: include the raw number AND the team benchmark comparison if available (e.g. "12 standups vs team median 16")\n` +
      `- issues[].evidence: MUST include exact numbers proving the problem exists\n` +
      `- suggestions: SMART format — specific action, who does it, by when (e.g. "Block 30 min Tues/Thu for backlog grooming to clear 3 overdue tasks this sprint")\n\n` +
      `Return ONLY valid JSON:\n` +
      `{"teamSummary":"string citing team avg score and standout trends","members":[{"name":"string","starRating":1,"score":0,` +
      `"performanceSummary":"string with 3+ specific numbers","factors":[` +
      `{"name":"Engagement","score":0,"detail":"string with numbers+benchmark"},` +
      `{"name":"Task Delivery","score":0,"detail":"string with numbers+benchmark"},` +
      `{"name":"Attendance","score":0,"detail":"string with numbers+benchmark"},` +
      `{"name":"Time Management","score":0,"detail":"string with numbers+benchmark"},` +
      `{"name":"Accountability","score":0,"detail":"string with numbers+benchmark"}],` +
      `"issues":[{"problem":"title","evidence":"exact numbers","severity":"high|medium|low"}],` +
      `"strengths":["specific achievement with number"],"areasOfImprovement":["specific gap with number"],` +
      `"suggestions":["SMART action tied to a specific issue"]}],` +
      `"topPerformer":${isSingleUser ? 'null' : '"name or null"'},"teamMorale":"High|Medium|Low","alerts":["urgent issue string"]}\n` +
      `No markdown, no extra text. Only the JSON object.`
    );
  }

  // ─── Sprint Analysis ─────────────────────────────────────────────────────

  /**
   * Builds a sprint analysis prompt covering velocity, completion, team health.
   *
   * @param {object}   ctx
   * @param {object}   ctx.sprint
   * @param {object}   ctx.taskMetrics
   * @param {object[]} ctx.memberSummary
   * @param {number}   ctx.standupCount
   * @param {number}   ctx.eodCount
   */
  static buildSprintAnalysisPrompt({ sprint, taskMetrics, memberSummary, standupCount, eodCount }) {
    const sName     = sprint ? (sprint.name || 'Sprint') : 'Sprint';
    const sStatus   = sprint ? (sprint.status || 'UNKNOWN') : 'UNKNOWN';
    const sStart    = sprint ? (sprint.start_date || sprint.startDate || 'N/A') : 'N/A';
    const sEnd      = sprint ? (sprint.end_date   || sprint.endDate   || 'N/A') : 'N/A';
    const sGoal     = sprint ? (sprint.goal || 'No goal set') : 'No goal set';
    const sCap      = parseFloat((sprint && (sprint.capacity_points || sprint.capacityPoints)) || 0);
    const sComp     = parseFloat((sprint && (sprint.completed_points || sprint.completedPoints)) || 0);

    const velocityPct = sCap > 0
      ? Math.round((taskMetrics.completedStoryPoints / sCap) * 100)
      : null;

    const completionRate = taskMetrics.total > 0
      ? Math.round((taskMetrics.done / taskMetrics.total) * 100)
      : 0;

    // Compact member lines (avoid embedded JSON)
    const memberLines = memberSummary.slice(0, 10).map((m) =>
      `  ${m.name}: tasks=${m.tasksDone || m.tasksCompleted || 0}/${m.tasksAssigned || 0}, storyPts=${m.storyPoints || 0}, overdue=${m.overdueCount || 0}, mood=${m.avgMood || 'N/A'}`
    ).join('\n');

    return (
      `Analyse this sprint and generate a star-rated, evidence-based report.\n\n` +
      `SPRINT: ${sName} | Status: ${sStatus} | ${sStart} to ${sEnd}\n` +
      `Goal: ${sGoal}\n` +
      `Capacity: ${sCap} pts | Completed: ${sComp} pts\n\n` +
      `TASK METRICS: total=${taskMetrics.total} done=${taskMetrics.done} inProgress=${taskMetrics.inProgress} ` +
      `todo=${taskMetrics.todo} overdue=${taskMetrics.overdue}\n` +
      `Completion: ${completionRate}% | Story pts delivered: ${taskMetrics.completedStoryPoints}/${taskMetrics.totalStoryPoints}` +
      (velocityPct !== null ? ` | Velocity vs capacity: ${velocityPct}%` : '') + '\n\n' +
      `TEAM ENGAGEMENT: ${memberSummary.length} members | standups=${standupCount} | EODs=${eodCount}\n` +
      `Per-member:\n${memberLines || '  No member data'}\n\n` +
      `RATING: 5★=goal met + velocity≥90% | 4★=mostly met 70-89% | 3★=partial 50-69% | 2★=gaps 30-49% | 1★=failed <30%\n\n` +
      `ANALYSIS QUALITY RULES:\n` +
      `- sprintSummary: cite completion rate, velocity %, and standout members\n` +
      `- insights: must include completion rate, velocity, engagement rate (standups vs days)\n` +
      `- recommendations: SMART format — who does what by when (e.g. "Lead to run mid-sprint check-in by day 5 to address overdue tasks")\n` +
      `- memberHighlights: name top 3 contributors with task count\n\n` +
      `Return ONLY valid JSON:\n` +
      `{"starRating":1,"score":0,"sprintSummary":"string with 3+ numbers","completionRate":${completionRate},` +
      `"velocityScore":${velocityPct || 0},"insights":"string with rates and percentages","risks":["specific risk with evidence"],` +
      `"recommendations":["SMART action with owner and timeline"],"memberHighlights":[{"name":"string","contribution":"string","tasksCompleted":0}],` +
      `"sprintHealth":"On Track|At Risk|Delayed"}\nNo markdown, no extra text.`
    );
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  /** Counts frequency of items in an array */
  static _countFreq(arr) {
    const dist = {};
    (arr || []).forEach((v) => { const k = String(v || 'unknown'); dist[k] = (dist[k] || 0) + 1; });
    return dist;
  }


  /**
   * Formats a list of DB rows into readable numbered entries.
   * Only includes the specified field names; caps at `limit` entries.
   */
  static _formatEntries(rows, fields, limit = 10) {
    return rows
      .slice(0, limit)
      .map((row, i) => {
        const parts = fields
          .filter((f) => row[f])
          .map((f) => `${f}: ${String(row[f]).substring(0, 80)}`);
        return parts.length > 0 ? `${i + 1}. ${parts.join(' | ')}` : null;
      })
      .filter(Boolean)
      .join('\n');
  }

  /** Computes average mood label from EOD entries */
  static _avgMood(eods) {
    const moodMap = { great: 5, good: 4, okay: 3, bad: 2, terrible: 1 };
    const vals = eods
      .map((e) => moodMap[String(e.mood).toLowerCase()])
      .filter(Boolean);
    if (vals.length === 0) return 'N/A';
    const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
    if (avg >= 4.5) return 'Great';
    if (avg >= 3.5) return 'Good';
    if (avg >= 2.5) return 'Okay';
    if (avg >= 1.5) return 'Bad';
    return 'Terrible';
  }

  /** Builds a mood distribution summary object */
  static _moodDistribution(moods) {
    const dist = {};
    moods.forEach((m) => {
      const key = String(m.mood || 'unknown').toLowerCase();
      dist[key] = (dist[key] || 0) + 1;
    });
    return dist;
  }
}

module.exports = PromptService;
