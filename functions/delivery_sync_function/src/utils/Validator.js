'use strict';

const Joi = require('joi');
const { ROLES, RAG_STATUS, PROJECT_STATUS, ACTION_STATUS, BLOCKER_STATUS,
  SEVERITY, MILESTONE_STATUS, RISK_STATUS, ISSUE_STATUS, DEPENDENCY_STATUS,
  ASSUMPTION_STATUS, DECISION_STATUS, PROJECT_MEMBER_ROLES } = require('./Constants');

/**
 * Centralised input validation using Joi.
 * Each method returns { error, value }.
 */
class Validator {
  // ─── Helpers ────────────────────────────────────────────────────────────────
  static _validate(schema, data) {
    const { error, value } = schema.validate(data, { abortEarly: false, stripUnknown: true });
    if (error) {
      const details = error.details.map((d) => d.message);
      const err = new Error(details.join('; '));
      err.isValidation = true;
      err.details = details;
      throw err;
    }
    return value;
  }

  // ─── Tenant ─────────────────────────────────────────────────────────────────
  static validateCreateTenant(data) {
    const schema = Joi.object({
      name: Joi.string().min(2).max(100).required(),
      domain: Joi.string().lowercase().alphanum().min(3).max(50).required(),
      subscription_plan: Joi.string().valid('FREE', 'STARTER', 'PROFESSIONAL', 'ENTERPRISE').default('FREE'),
    });
    return Validator._validate(schema, data);
  }

  // ─── User / Auth ─────────────────────────────────────────────────────────────
  static validateInviteUser(data) {
    const schema = Joi.object({
      email:     Joi.string().email().required(),
      name:      Joi.string().min(2).max(100).required(),
      orgRoleId: Joi.string().optional().allow('', null),
    });
    return Validator._validate(schema, data);
  }

  static validateUpdateUserRole(data) {
    const schema = Joi.object({
      role: Joi.string().valid(...Object.values(ROLES)).required(),
    });
    return Validator._validate(schema, data);
  }

  // ─── Project ─────────────────────────────────────────────────────────────────
  static validateCreateProject(data) {
    const schema = Joi.object({
      name: Joi.string().min(2).max(150).required(),
      description: Joi.string().max(1000).allow('').default(''),
      start_date: Joi.string().isoDate().required(),
      end_date: Joi.string().isoDate().required(),
      rag_status: Joi.string().valid(...Object.values(RAG_STATUS)).default(RAG_STATUS.GREEN),
      owner_user_id: Joi.string().allow('').default(''),
    });
    return Validator._validate(schema, data);
  }

  static validateUpdateProject(data) {
    const schema = Joi.object({
      name: Joi.string().min(2).max(150),
      description: Joi.string().max(1000).allow(''),
      start_date: Joi.string().isoDate(),
      end_date: Joi.string().isoDate(),
      status: Joi.string().valid(...Object.values(PROJECT_STATUS)),
    });
    return Validator._validate(schema, data);
  }

  static validateUpdateRAG(data) {
    const schema = Joi.object({
      rag_status: Joi.string().valid(...Object.values(RAG_STATUS)).required(),
      reason: Joi.string().max(500).allow('').default(''),
    });
    return Validator._validate(schema, data);
  }

  // ─── Project Member ───────────────────────────────────────────────────────────
  static validateAddMember(data) {
    const schema = Joi.object({
      user_id: Joi.string().required(),
      role: Joi.string().valid(...PROJECT_MEMBER_ROLES).default('DEVELOPER'),
    });
    return Validator._validate(schema, data);
  }

  // ─── Milestone ────────────────────────────────────────────────────────────────
  static validateCreateMilestone(data) {
    const schema = Joi.object({
      title: Joi.string().min(2).max(200).required(),
      description: Joi.string().max(1000).allow('').default(''),
      due_date: Joi.string().isoDate().required(),
      owner_user_id: Joi.string().allow('').default(''),
    });
    return Validator._validate(schema, data);
  }

  static validateUpdateMilestone(data) {
    const schema = Joi.object({
      title: Joi.string().min(2).max(200),
      description: Joi.string().max(1000).allow(''),
      due_date: Joi.string().isoDate(),
      status: Joi.string().valid(...Object.values(MILESTONE_STATUS)),
      owner_user_id: Joi.string().allow(''),
    });
    return Validator._validate(schema, data);
  }

  // ─── Standup ──────────────────────────────────────────────────────────────────
  static validateSubmitStandup(data) {
    const schema = Joi.object({
      project_id: Joi.string().required(),
      date: Joi.string().isoDate().required(),
      yesterday: Joi.string().min(1).max(2000).required(),
      today: Joi.string().min(1).max(2000).required(),
      blockers: Joi.string().max(2000).allow('').default(''),
    });
    return Validator._validate(schema, data);
  }

  // ─── EOD ──────────────────────────────────────────────────────────────────────
  static validateSubmitEod(data) {
    const schema = Joi.object({
      project_id: Joi.string().required(),
      date: Joi.string().isoDate().required(),
      accomplishments: Joi.string().min(1).max(3000).required(),
      planned_tomorrow: Joi.string().max(2000).allow('').default(''),
      blockers: Joi.string().max(2000).allow('').default(''),
      progress_percentage: Joi.number().integer().min(0).max(100).default(0),
      mood: Joi.string().valid('GREEN', 'YELLOW', 'RED').default('GREEN'),
    });
    return Validator._validate(schema, data);
  }

  // ─── Action ───────────────────────────────────────────────────────────────────
  static validateCreateAction(data) {
    const schema = Joi.object({
      project_id: Joi.string().required(),
      title: Joi.string().min(2).max(300).required(),
      description: Joi.string().max(1000).allow('').default(''),
      owner_user_id: Joi.string().required(),
      due_date: Joi.string().isoDate().required(),
      priority: Joi.string().valid(...Object.values(SEVERITY)).default(SEVERITY.MEDIUM),
      source: Joi.string().valid('STANDUP', 'EOD', 'MANUAL').default('MANUAL'),
      source_id: Joi.string().allow('').default(''),
    });
    return Validator._validate(schema, data);
  }

  static validateUpdateAction(data) {
    const schema = Joi.object({
      title: Joi.string().min(2).max(300),
      description: Joi.string().max(1000).allow(''),
      owner_user_id: Joi.string(),
      due_date: Joi.string().isoDate(),
      priority: Joi.string().valid(...Object.values(SEVERITY)),
      status: Joi.string().valid(...Object.values(ACTION_STATUS)),
    });
    return Validator._validate(schema, data);
  }

  // ─── Blocker ─────────────────────────────────��────────────────────────────────
  static validateCreateBlocker(data) {
    const schema = Joi.object({
      project_id: Joi.string().required(),
      title: Joi.string().min(2).max(300).required(),
      description: Joi.string().max(2000).allow('').default(''),
      severity: Joi.string().valid(...Object.values(SEVERITY)).default(SEVERITY.MEDIUM),
      owner_user_id: Joi.string().required(),
    });
    return Validator._validate(schema, data);
  }

  static validateUpdateBlocker(data) {
    const schema = Joi.object({
      title: Joi.string().min(2).max(300),
      description: Joi.string().max(2000).allow(''),
      severity: Joi.string().valid(...Object.values(SEVERITY)),
      status: Joi.string().valid(...Object.values(BLOCKER_STATUS)),
      resolution: Joi.string().max(2000).allow(''),
      escalated_to: Joi.string().allow(''),
    });
    return Validator._validate(schema, data);
  }

  // ─── Risk ─────────────────────────────────────────────────────────────────────
  static validateCreateRisk(data) {
    const schema = Joi.object({
      project_id: Joi.string().required(),
      title: Joi.string().min(2).max(300).required(),
      description: Joi.string().max(2000).allow('').default(''),
      probability: Joi.string().valid('HIGH', 'MEDIUM', 'LOW').required(),
      impact: Joi.string().valid('HIGH', 'MEDIUM', 'LOW').required(),
      mitigation: Joi.string().max(2000).allow('').default(''),
      owner_user_id: Joi.string().required(),
    });
    return Validator._validate(schema, data);
  }

  // ─── Issue ────────────────────────────────────────────────────────────────────
  static validateCreateIssue(data) {
    const schema = Joi.object({
      project_id: Joi.string().required(),
      title: Joi.string().min(2).max(300).required(),
      description: Joi.string().max(2000).allow('').default(''),
      severity: Joi.string().valid(...Object.values(SEVERITY)).default(SEVERITY.MEDIUM),
      owner_user_id: Joi.string().required(),
    });
    return Validator._validate(schema, data);
  }

  // ─── Dependency ───────────────────────────────────────────────────────────────
  static validateCreateDependency(data) {
    const schema = Joi.object({
      project_id: Joi.string().required(),
      title: Joi.string().min(2).max(300).required(),
      description: Joi.string().max(2000).allow('').default(''),
      dependency_type: Joi.string().valid('INTERNAL', 'EXTERNAL').required(),
      dependent_on: Joi.string().max(200).allow('').default(''),
      due_date: Joi.string().isoDate().allow('').default(''),
      owner_user_id: Joi.string().required(),
    });
    return Validator._validate(schema, data);
  }

  // ─── Assumption ───────────────────────────────────────────────────────────────
  static validateCreateAssumption(data) {
    const schema = Joi.object({
      project_id: Joi.string().required(),
      title: Joi.string().min(2).max(300).required(),
      description: Joi.string().max(2000).allow('').default(''),
      impact_if_wrong: Joi.string().max(1000).allow('').default(''),
      owner_user_id: Joi.string().required(),
    });
    return Validator._validate(schema, data);
  }

  // ─── Decision ─────────────────────────────────────────────────────────────────
  static validateCreateDecision(data) {
    const schema = Joi.object({
      project_id: Joi.string().required(),
      title: Joi.string().min(2).max(300).required(),
      description: Joi.string().max(2000).allow('').default(''),
      decision_date: Joi.string().isoDate().required(),
      rationale: Joi.string().max(2000).allow('').default(''),
      impact: Joi.string().max(1000).allow('').default(''),
    });
    return Validator._validate(schema, data);
  }

  static validateUpdateDecision(data) {
    const schema = Joi.object({
      title: Joi.string().min(2).max(300),
      description: Joi.string().max(2000).allow(''),
      decision_date: Joi.string().isoDate(),
      rationale: Joi.string().max(2000).allow(''),
      impact: Joi.string().max(1000).allow(''),
      status: Joi.string().valid(...Object.values(DECISION_STATUS)),
    });
    return Validator._validate(schema, data);
  }

  // ─── Report ───────────────────────────────────────────────────────────────────
  static validateGenerateReport(data) {
    const schema = Joi.object({
      project_id: Joi.string().required(),
      report_type: Joi.string().valid('WEEKLY', 'MONTHLY', 'CUSTOM').required(),
      period_start: Joi.string().isoDate().required(),
      period_end: Joi.string().isoDate().required(),
    });
    return Validator._validate(schema, data);
  }
}

module.exports = Validator;
