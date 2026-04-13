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
      'You are an AI system for a project management application called "DeliverSync". ' +
      'Your role is to analyze team activity data and generate intelligent, structured insights. ' +
      'CRITICAL OUTPUT RULE: Your entire response MUST be a single raw JSON object. ' +
      'Do NOT include any text before or after the JSON. ' +
      'Do NOT wrap the JSON in markdown code fences (no ```json or ```). ' +
      'Do NOT add explanations, preamble, or commentary outside the JSON object. ' +
      'Start your response with { and end with }. ' +
      'Keep string values concise and actionable. ' +
      'Base insights only on provided data.'
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
    const memberSummaries = Object.values(activityByMember).map((m) => {
      const actionsDone  = m.actions.filter((a) => a.status === 'DONE').length;
      const actionsOpen  = m.actions.filter((a) => ['OPEN', 'IN_PROGRESS'].includes(a.status)).length;
      const consistency  = days > 0 ? Math.round((m.standups.length / days) * 100) : 0;
      const avgMood      = PromptService._avgMood(m.eods);

      return {
        name:              m.name,
        standupCount:      m.standups.length,
        eodCount:          m.eods.length,
        consistency:       `${consistency}%`,
        actionsDone,
        actionsOpen,
        blockersRaised:    m.blockersRaised.length,
        averageMood:       avgMood,
        hasBlockers:       m.standups.some((s) => s.blockers && s.blockers.trim()),
      };
    });

    if (memberSummaries.length === 0) {
      memberSummaries.push({ name: 'Team', note: 'No activity data in this period.' });
    }

    return `
Analyse individual performance for the last ${days} days based on the following activity data.

=== TEAM ACTIVITY ===
${JSON.stringify(memberSummaries, null, 2)}

Return ONLY a JSON object matching this schema:
{
  "teamSummary": "2 sentence overall team assessment",
  "members": [
    {
      "name": "...",
      "performanceSummary": "...",
      "strengths": ["strength 1"],
      "areasOfImprovement": ["area 1"],
      "score": 0-100,
      "consistencyRating": "Excellent | Good | Average | Needs Improvement"
    }
  ],
  "topPerformer": "name or null",
  "teamMorale": "High | Medium | Low",
  "alerts": ["alert if any member has low consistency or many blockers"]
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

    return `
Analyse the following project data and provide smart, actionable suggestions across three dimensions.

=== PROJECT STATUS ===
${JSON.stringify(projectStatuses, null, 2)}

=== OPEN BLOCKERS (${openBlockers.length}) ===
Critical: ${openBlockers.filter((b) => b.severity === 'CRITICAL').length}
High: ${openBlockers.filter((b) => b.severity === 'HIGH').length}
Medium/Low: ${openBlockers.filter((b) => !['CRITICAL', 'HIGH'].includes(b.severity)).length}

=== OVERDUE ACTIONS (${overdueActions.length}) ===
High priority: ${overdueActions.filter((a) => (a.action_priority || a.priority) === 'HIGH').length}
${overdueActions.slice(0, 5).map((a) => `- ${a.title}`).join('\n')}

=== DELAYED MILESTONES (${delayedMilestones.length}) ===
${delayedMilestones.slice(0, 3).map((m) => `- ${m.title} (due ${m.due_date})`).join('\n') || 'None.'}

=== TEAM METRICS ===
Team size: ${teamSize}
Mood distribution (last 14 days): ${JSON.stringify(moodDist)}

Return ONLY a JSON object matching this schema:
{
  "productivity": [
    { "suggestion": "...", "priority": "high | medium | low", "impact": "..." }
  ],
  "riskMitigation": [
    { "suggestion": "...", "priority": "high | medium | low", "impact": "..." }
  ],
  "resourceAllocation": [
    { "suggestion": "...", "priority": "high | medium | low", "impact": "..." }
  ],
  "overallRiskLevel": "high | medium | low",
  "immediateActions": ["action 1", "action 2"]
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

    return `
Analyze the following historical data and identify productivity, engagement, and risk trends.

=== PERIOD ===
Last ${days} days | Projects: ${projects.map((p) => p.name).join(', ')}

=== ENGAGEMENT METRICS ===
Standups submitted: ${standups.length}
EODs submitted: ${eods.length}
Mood distribution: ${JSON.stringify(moodDist)}

=== ACTION METRICS ===
${JSON.stringify(actionMetrics, null, 2)}

=== BLOCKER METRICS ===
${JSON.stringify(blockerMetrics, null, 2)}

Return ONLY a JSON object matching this schema:
{
  "type": "trend_analysis",
  "data": {
    "productivityTrend": "increasing | decreasing | stable",
    "engagementTrend": "increasing | decreasing | stable",
    "moodTrend": "improving | declining | stable",
    "delayedTaskTrend": "improving | worsening | stable",
    "recurringBlockers": ["pattern 1", "pattern 2"],
    "riskAreas": ["area 1", "area 2"],
    "insights": ["data-driven insight 1", "insight 2", "insight 3"],
    "recommendations": ["recommendation 1", "recommendation 2"],
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
    // Cap at 10 members to keep prompt size manageable
    const members = Object.values(memberData).slice(0, 10);
    const isSingleUser = members.length === 1;

    // Build compact plain-text data lines (avoids embedded JSON which causes LLM 500s)
    const dataLines = members.map((m) => {
      const moodFreq = PromptService._countFreq(m.moods || []);
      const moodStr  = Object.entries(moodFreq).map(([k, v]) => `${k}:${v}`).join(',') || 'N/A';
      return [
        `Member: ${m.name} | Role: ${m.role || 'Team Member'}`,
        `  Engagement: standups=${m.standupCount}/${days}d (${m.consistencyPct}%), eods=${m.eodCount}, moods=[${moodStr}]`,
        `  Tasks: total=${m.tasksTotal}, done=${m.tasksDone}, overdue=${m.tasksOverdue}, completion=${m.taskCompletionPct !== null ? m.taskCompletionPct + '%' : 'N/A'}, storyPts=${m.storyPointsDone}`,
        `  Attendance: days=${m.attendanceDays}, wfh=${m.wfhDays}, avgHours=${m.avgWorkHours}h/day`,
        `  TimeTracking: hoursLogged=${m.hoursLogged}h`,
        `  Leave: daysTaken=${m.leaveDaysTaken}`,
        `  Accountability: actions=${m.actionsDone}/${m.actionsTotal}, blockersRaised=${m.blockersRaised}`,
      ].join('\n');
    }).join('\n\n');

    return (
      `Analyse this ${days}-day performance data for ${members.length} team member(s). ` +
      `Scope: ${scope}.\n\n` +
      `DATA:\n${dataLines}\n\n` +
      `SCORING (weights): Engagement 25%, Task Delivery 25%, Attendance 20%, Time Mgmt 15%, Accountability 15%.\n` +
      `Stars: 90-100=5, 75-89=4, 60-74=3, 40-59=2, 0-39=1.\n\n` +
      `Return ONLY valid JSON in this exact shape:\n` +
      `{"teamSummary":"string","members":[{"name":"string","starRating":1,"score":0,` +
      `"performanceSummary":"string","factors":[{"name":"Engagement","score":0,"detail":"string"},` +
      `{"name":"Task Delivery","score":0,"detail":"string"},{"name":"Attendance","score":0,"detail":"string"},` +
      `{"name":"Time Management","score":0,"detail":"string"},{"name":"Accountability","score":0,"detail":"string"}],` +
      `"issues":[{"problem":"specific problem title","evidence":"exact numbers or facts from the data that confirm this problem","severity":"high|medium|low"}],` +
      `"strengths":["string"],"areasOfImprovement":["string"],"suggestions":["concrete actionable improvement step"]}],` +
      `"topPerformer":${isSingleUser ? 'null' : '"string or null"'},"teamMorale":"High","alerts":["string"]}` +
      `\nFor issues: be specific — cite actual numbers (e.g. "missed 12/30 standups", "3 overdue tasks", "logged only 2h vs expected 8h/day"). ` +
      `For suggestions: give concrete steps tied directly to each issue (e.g. "Set a daily standup reminder at 9am", "Prioritise task X by EOD Friday"). ` +
      `No extra text, no markdown. Only the JSON object.`
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
      `Analyse this sprint and generate a star-rated performance report.\n\n` +
      `SPRINT: ${sName} | Status: ${sStatus} | ${sStart} to ${sEnd}\n` +
      `Goal: ${sGoal}\n` +
      `Capacity: ${sCap} pts | Completed: ${sComp} pts\n\n` +
      `TASKS: total=${taskMetrics.total}, done=${taskMetrics.done}, inProgress=${taskMetrics.inProgress}, ` +
      `todo=${taskMetrics.todo}, overdue=${taskMetrics.overdue}\n` +
      `Completion: ${completionRate}% | Story pts: ${taskMetrics.completedStoryPoints}/${taskMetrics.totalStoryPoints}` +
      (velocityPct !== null ? ` | Velocity: ${velocityPct}%` : '') + '\n\n' +
      `TEAM: size=${memberSummary.length}, standups=${standupCount}, EODs=${eodCount}\n` +
      `Member breakdown:\n${memberLines || '  No member data'}\n\n` +
      `RATING GUIDE: 5=goal met velocity>=90%, 4=mostly met 70-89%, 3=partial 50-69%, 2=gaps 30-49%, 1=failed <30%\n\n` +
      `Return ONLY valid JSON:\n` +
      `{"starRating":1,"score":0,"sprintSummary":"string","completionRate":${completionRate},` +
      `"velocityScore":${velocityPct || 0},"insights":"string","risks":["string"],` +
      `"recommendations":["string"],"memberHighlights":[{"name":"string","contribution":"string","tasksCompleted":0}],` +
      `"sprintHealth":"On Track"}\nNo markdown, no extra text.`
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
