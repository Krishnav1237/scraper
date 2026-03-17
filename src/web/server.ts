import express from 'express';
import path from 'path';
import crypto from 'crypto';
import { config } from '../config.js';
import { logger } from '../core/logger.js';
import {
  getMentions, getReviews, getStats, getRecentLogs, MentionFilters,
  getProjects, getProjectById, createProject, updateProject, deleteProject,
  getKeywordGroups, getKeywordGroupById, createKeywordGroup, updateKeywordGroup, deleteKeywordGroup,
  getEntities, getEntityById, createEntity, updateEntity, deleteEntity,
  getAlertRules, getAlertRuleById, createAlertRule, updateAlertRule, deleteAlertRule,
  getAlertEvents, getTrends, evaluateAlerts,
  getOutreachAuth, saveOutreachAuth, clearOutreachAuth,
  saveOAuthState, verifyAndDeleteOAuthState,
  getOutreachSubreddits, getOutreachSubredditById, createOutreachSubreddit,
  updateOutreachSubreddit, deleteOutreachSubreddit,
  getOutreachDrafts, getOutreachDraftById, createOutreachDraft,
  updateOutreachDraft, deleteOutreachDraft,
  createPostAttempt, getPostAttempts, OutreachAuth,
  // New features
  getInboxMentions, getInboxStats,
  setMentionBookmark, setMentionActionRequired, setMentionActionStatus, setMentionNotes,
  getEntityComparison,
  getWeeklyDigest,
  getBrandScore,
  getAudienceSegments,
} from '../db/queries.js';
import { GoogleSheetsService } from '../core/googleSheets.js';
import { getScheduleInfo } from '../scheduler/jobs.js';
import { getRateLimitState } from '../core/rateLimit.js';
import { apiCache } from '../core/cache.js';
import { getAllCircuitStatus } from '../core/circuitBreaker.js';

const app = express();
const appName = config.appName;

// Simple in-memory rate limiter for sensitive endpoints (e.g. OAuth routes)
const _rlWindows = new Map<string, { count: number; reset: number }>();
function simpleRateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = _rlWindows.get(key);
  if (!entry || now > entry.reset) {
    _rlWindows.set(key, { count: 1, reset: now + windowMs });
    return true; // allowed
  }
  if (entry.count >= maxRequests) return false; // blocked
  entry.count++;
  return true; // allowed
}

// Configure EJS
app.set('view engine', 'ejs');
app.set('views', config.paths.views);

// Static files
app.use('/static', express.static(path.join(config.paths.root, 'src', 'web', 'public')));

// Body parsing
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================================
// DASHBOARD
// ============================================================================

app.get('/', (req, res) => {
  const stats = getStats();
  const recentLogs = getRecentLogs(10);
  const recentMentions = getMentions({ limit: 5 });
  const recentReviews = getReviews({ limit: 5 });
  const alertEvents = getAlertEvents(undefined, 5);
  const trends = getTrends(7);
  const drafts = getOutreachDrafts();
  
  res.render('dashboard', {
    appName,
    title: appName,
    stats,
    recentLogs,
    recentMentions,
    recentReviews,
    alertEvents,
    trends,
    drafts,
  });
});

// ============================================================================
// MENTIONS
// ============================================================================

app.get('/mentions', (req, res) => {
  const filters: MentionFilters = {
    platform: req.query.platform as MentionFilters['platform'],
    sentiment: req.query.sentiment as string | undefined,
    search: req.query.search as string | undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    limit: 50,
    offset: parseInt(req.query.offset as string) || 0,
  };
  
  const mentions = getMentions(filters);
  
  res.render('mentions', {
    appName,
    title: `Mentions – ${appName}`,
    mentions,
    filters,
  });
});

// ============================================================================
// REVIEWS
// ============================================================================

app.get('/reviews', (req, res) => {
  const filters = {
    platform: req.query.platform as 'playstore' | 'appstore' | undefined,
    rating: req.query.rating ? parseInt(req.query.rating as string) : undefined,
    sentiment: req.query.sentiment as string | undefined,
    search: req.query.search as string | undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    limit: 50,
    offset: parseInt(req.query.offset as string) || 0,
  };
  
  const reviews = getReviews(filters);
  
  res.render('reviews', {
    appName,
    title: `App Reviews – ${appName}`,
    reviews,
    filters,
  });
});

// ============================================================================
// SYSTEM LOGS
// ============================================================================

app.get('/logs', (req, res) => {
  const logs = getRecentLogs(100);
  
  res.render('logs', {
    appName,
    title: `System Logs – ${appName}`,
    logs,
  });
});

// ============================================================================
// PROJECTS
// ============================================================================

app.get('/projects', (req, res) => {
  const projects = getProjects();
  res.render('projects', {
    appName,
    title: `Projects – ${appName}`,
    projects,
    error: req.query.error as string | undefined,
    success: req.query.success as string | undefined,
  });
});

app.post('/projects', (req, res) => {
  try {
    const { name, description, search_terms, required_terms, monitor_subreddits, playstore_app_id, appstore_app_id } = req.body;
    if (!name?.trim()) {
      return res.redirect('/projects?error=Project+name+is+required');
    }
    createProject({
      name: name.trim(),
      description: description?.trim() || null,
      search_terms: JSON.stringify((search_terms || '').split(',').map((s: string) => s.trim()).filter(Boolean)),
      required_terms: JSON.stringify((required_terms || '').split(',').map((s: string) => s.trim()).filter(Boolean)),
      filter_strict: req.body.filter_strict === 'on' ? 1 : 0,
      filter_balanced: req.body.filter_balanced === 'on' ? 1 : 0,
      monitor_subreddits: JSON.stringify((monitor_subreddits || '').split(',').map((s: string) => s.trim()).filter(Boolean)),
      playstore_app_id: playstore_app_id?.trim() || '',
      appstore_app_id: appstore_app_id?.trim() || '',
    });
    res.redirect('/projects?success=Project+created');
  } catch (err) {
    logger.error('Create project failed', { err });
    res.redirect('/projects?error=Failed+to+create+project');
  }
});

app.get('/projects/:id', (req, res) => {
  const project = getProjectById(parseInt(req.params.id));
  if (!project) return res.redirect('/projects?error=Project+not+found');
  const keywordGroups = getKeywordGroups(project.id);
  const entities = getEntities(project.id);
  const alertRules = getAlertRules(project.id);
  const alertEvents = getAlertEvents(project.id, 20);
  res.render('project_detail', {
    appName,
    title: `${project.name} – ${appName}`,
    project,
    keywordGroups,
    entities,
    alertRules,
    alertEvents,
    error: req.query.error as string | undefined,
    success: req.query.success as string | undefined,
  });
});

app.post('/projects/:id/update', (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const { name, description, search_terms, required_terms, monitor_subreddits, playstore_app_id, appstore_app_id } = req.body;
    if (!name?.trim()) {
      return res.redirect(`/projects/${id}?error=Project+name+is+required`);
    }
    updateProject(id, {
      name: name.trim(),
      description: description?.trim() || null,
      search_terms: JSON.stringify((search_terms || '').split(',').map((s: string) => s.trim()).filter(Boolean)),
      required_terms: JSON.stringify((required_terms || '').split(',').map((s: string) => s.trim()).filter(Boolean)),
      filter_strict: req.body.filter_strict === 'on' ? 1 : 0,
      filter_balanced: req.body.filter_balanced === 'on' ? 1 : 0,
      monitor_subreddits: JSON.stringify((monitor_subreddits || '').split(',').map((s: string) => s.trim()).filter(Boolean)),
      playstore_app_id: playstore_app_id?.trim() || '',
      appstore_app_id: appstore_app_id?.trim() || '',
    });
    res.redirect(`/projects/${id}?success=Project+updated`);
  } catch (err) {
    logger.error('Update project failed', { err });
    res.redirect(`/projects/${id}?error=Failed+to+update+project`);
  }
});

app.post('/projects/:id/delete', (req, res) => {
  const id = parseInt(req.params.id);
  const deleted = deleteProject(id);
  if (!deleted) {
    return res.redirect('/projects?error=Cannot+delete+the+default+project');
  }
  res.redirect('/projects?success=Project+deleted');
});

// ============================================================================
// KEYWORD GROUPS
// ============================================================================

app.post('/projects/:projectId/keyword-groups', (req, res) => {
  const projectId = parseInt(req.params.projectId);
  try {
    const { name, keywords, description } = req.body;
    if (!name?.trim()) {
      return res.redirect(`/projects/${projectId}?error=Keyword+group+name+is+required`);
    }
    createKeywordGroup({
      project_id: projectId,
      name: name.trim(),
      keywords: JSON.stringify((keywords || '').split(',').map((s: string) => s.trim()).filter(Boolean)),
      description: description?.trim() || null,
    });
    res.redirect(`/projects/${projectId}?success=Keyword+group+created`);
  } catch (err) {
    logger.error('Create keyword group failed', { err });
    res.redirect(`/projects/${projectId}?error=Failed+to+create+keyword+group`);
  }
});

app.post('/keyword-groups/:id/delete', (req, res) => {
  const group = getKeywordGroupById(parseInt(req.params.id));
  const projectId = group?.project_id;
  deleteKeywordGroup(parseInt(req.params.id));
  res.redirect(projectId ? `/projects/${projectId}?success=Keyword+group+deleted` : '/projects');
});

// ============================================================================
// ENTITIES (Competitors)
// ============================================================================

app.post('/projects/:projectId/entities', (req, res) => {
  const projectId = parseInt(req.params.projectId);
  try {
    const { name, search_terms, type, color } = req.body;
    if (!name?.trim()) {
      return res.redirect(`/projects/${projectId}?error=Entity+name+is+required`);
    }
    createEntity({
      project_id: projectId,
      name: name.trim(),
      search_terms: JSON.stringify((search_terms || '').split(',').map((s: string) => s.trim()).filter(Boolean)),
      type: (type as 'primary' | 'competitor' | 'peer') || 'competitor',
      color: color || '#6366F1',
    });
    res.redirect(`/projects/${projectId}?success=Entity+added`);
  } catch (err) {
    logger.error('Create entity failed', { err });
    res.redirect(`/projects/${projectId}?error=Failed+to+add+entity`);
  }
});

app.post('/entities/:id/delete', (req, res) => {
  const entity = getEntityById(parseInt(req.params.id));
  const projectId = entity?.project_id;
  deleteEntity(parseInt(req.params.id));
  res.redirect(projectId ? `/projects/${projectId}?success=Entity+deleted` : '/projects');
});

// ============================================================================
// ALERT RULES
// ============================================================================

app.post('/projects/:projectId/alerts', (req, res) => {
  const projectId = parseInt(req.params.projectId);
  try {
    const { name, type, threshold, window_hours, webhook_url } = req.body;
    if (!name?.trim() || !type || !threshold) {
      return res.redirect(`/projects/${projectId}?error=Alert+name%2C+type+and+threshold+are+required`);
    }
    createAlertRule({
      project_id: projectId,
      name: name.trim(),
      type: type as 'mention_spike' | 'negative_sentiment',
      threshold: parseFloat(threshold),
      window_hours: parseInt(window_hours) || 24,
      enabled: 1,
      webhook_url: webhook_url?.trim() || null,
    });
    res.redirect(`/projects/${projectId}?success=Alert+rule+created`);
  } catch (err) {
    logger.error('Create alert rule failed', { err });
    res.redirect(`/projects/${projectId}?error=Failed+to+create+alert+rule`);
  }
});

app.post('/alerts/:id/toggle', (req, res) => {
  const rule = getAlertRuleById(parseInt(req.params.id));
  if (rule) {
    updateAlertRule(rule.id!, { enabled: rule.enabled ? 0 : 1 });
  }
  res.redirect(rule ? `/projects/${rule.project_id}` : '/projects');
});

app.post('/alerts/:id/delete', (req, res) => {
  const rule = getAlertRuleById(parseInt(req.params.id));
  const projectId = rule?.project_id;
  deleteAlertRule(parseInt(req.params.id));
  res.redirect(projectId ? `/projects/${projectId}?success=Alert+rule+deleted` : '/projects');
});

// ============================================================================
// API ENDPOINTS
// ============================================================================

app.get('/api/stats', (req, res) => {
  res.json(getStats());
});

app.get('/api/mentions', (req, res) => {
  const filters: MentionFilters = {
    platform: req.query.platform as MentionFilters['platform'],
    sentiment: req.query.sentiment as string | undefined,
    search: req.query.search as string | undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    limit: parseInt(req.query.limit as string) || 50,
    offset: parseInt(req.query.offset as string) || 0,
  };
  res.json(getMentions(filters));
});

app.get('/api/reviews', (req, res) => {
  const filters = {
    platform: req.query.platform as 'playstore' | 'appstore' | undefined,
    rating: req.query.rating ? parseInt(req.query.rating as string) : undefined,
    sentiment: req.query.sentiment as string | undefined,
    search: req.query.search as string | undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    limit: parseInt(req.query.limit as string) || 50,
    offset: parseInt(req.query.offset as string) || 0,
  };
  res.json(getReviews(filters));
});

app.get('/api/trends', (req, res) => {
  const days = parseInt(req.query.days as string) || 30;
  const capped = Math.min(days, 365);
  const cacheKey = `trends:${capped}`;
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json(cached);
  const result = getTrends(capped);
  apiCache.set(cacheKey, result, 5 * 60 * 1000);
  res.json(result);
});

app.get('/api/alerts', (req, res) => {
  evaluateAlerts();
  const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
  res.json({
    rules: getAlertRules(projectId),
    events: getAlertEvents(projectId, 50),
  });
});

app.get('/api/projects', (req, res) => {
  res.json(getProjects());
});

// System status / health
app.get('/api/status', (req, res) => {
  const platforms = ['reddit', 'playstore', 'appstore'];
  const rateLimits = platforms.reduce((acc, platform) => {
    acc[platform] = getRateLimitState(platform);
    return acc;
  }, {} as Record<string, ReturnType<typeof getRateLimitState>>);

  res.json({
    uptimeSeconds: Math.round(process.uptime()),
    schedules: getScheduleInfo(),
    rateLimits,
    recentLogs: getRecentLogs(5),
  });
});

// Health check — minimal liveness probe suitable for uptime monitors
app.get('/api/health', (req, res) => {
  const stats = getStats();
  const totalMentions = (stats.mentions as any[]).reduce((s: number, p: any) => s + (p.total || 0), 0);
  const totalReviews = (stats.reviews as any[]).reduce((s: number, p: any) => s + (p.total || 0), 0);
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    data: {
      totalMentions,
      totalReviews,
      last24hMentions: stats.last24h.mentions,
      last24hReviews: stats.last24h.reviews,
    },
  });
});

// Global search — searches both mentions and reviews simultaneously
app.get('/api/search', (req, res) => {
  const q = (req.query.q as string || '').trim();
  const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }
  const mentions = getMentions({ search: q, limit });
  const reviews = getReviews({ search: q, limit });
  res.json({
    query: q,
    mentions: { count: mentions.length, items: mentions },
    reviews: { count: reviews.length, items: reviews },
    total: mentions.length + reviews.length,
  });
});

// Sentiment breakdown — positive/negative/neutral percentages for a date window
app.get('/api/sentiment/summary', (req, res) => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 365);
  const trends = getTrends(days);
  const totals = trends.reduce(
    (acc, t) => {
      acc.mentions += t.mentions;
      acc.positive += t.positive;
      acc.negative += t.negative;
      acc.neutral += t.neutral;
      return acc;
    },
    { mentions: 0, positive: 0, negative: 0, neutral: 0 }
  );
  const safeTotal = totals.mentions || 1;
  res.json({
    windowDays: days,
    totals,
    percentages: {
      positive: parseFloat(((totals.positive / safeTotal) * 100).toFixed(1)),
      negative: parseFloat(((totals.negative / safeTotal) * 100).toFixed(1)),
      neutral: parseFloat(((totals.neutral / safeTotal) * 100).toFixed(1)),
    },
    trend: trends,
  });
});

// Brand health score — aggregated sentiment + review score (0-100) with verdict label.
// Inspired by CrowdLens-style structured brand verdicts.
// Query param: ?days=30 (window, 1-365, default 30)
app.get('/api/brand/score', (req, res) => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 365);
  const cacheKey = `brand:score:${days}`;
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json({ ...cached as object, cached: true });
  const result = getBrandScore(days);
  apiCache.set(cacheKey, result, 5 * 60 * 1000); // 5 min
  res.json({ ...result, cached: false });
});

// ── Audience segment / persona analysis ─────────────────────────────────────
// Returns engagement tiers, platform breakdown, and time-of-day patterns so
// brand managers can answer "who is talking about us?"
// Query param: ?days=30 (window, 1-365, default 30)
app.get('/api/audience/segments', (req, res) => {
  const days = Math.min(parseInt(req.query.days as string) || 30, 365);
  const cacheKey = `audience:segments:${days}`;
  const cached = apiCache.get(cacheKey);
  if (cached) return res.json({ ...cached as object, cached: true });
  const result = getAudienceSegments(days);
  apiCache.set(cacheKey, result, 10 * 60 * 1000); // 10 min
  res.json({ ...result, cached: false });
});

// ── System status — circuit breakers + cache ─────────────────────────────────
// Production health endpoint; shows scraper circuit state and response-cache
// hit-rate so operators can spot degraded providers at a glance.
app.get('/api/status', (req, res) => {
  res.json({
    uptime: process.uptime(),
    circuitBreakers: getAllCircuitStatus(),
    cache: apiCache.stats(),
    scheduledJobs: getScheduleInfo(),
    rateLimits: ['reddit', 'playstore', 'appstore'].reduce((acc, p) => {
      acc[p] = getRateLimitState(p);
      return acc;
    }, {} as Record<string, unknown>),
  });
});

// ============================================================================
// EXPORT ENDPOINTS
// ============================================================================

app.get('/api/export/mentions', (req, res) => {
  const filters: MentionFilters = {
    platform: req.query.platform as MentionFilters['platform'],
    sentiment: req.query.sentiment as string | undefined,
    search: req.query.search as string | undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
  };
  const mentions = getMentions(filters);
  
  const csv = [
    ['Date', 'Platform', 'Author', 'Content', 'URL', 'Likes', 'Comments', 'Shares', 'Sentiment', 'Score'].join(','),
    ...mentions.map(m => [
      m.created_at,
      (m as any).platform_name || '',
      `"${(m.author || '').replace(/"/g, '""')}"`,
      `"${(m.content || '').replace(/"/g, '""')}"`,
      m.url || '',
      m.engagement_likes,
      m.engagement_comments,
      m.engagement_shares,
      m.sentiment_label || '',
      m.sentiment_score || '',
    ].join(','))
  ].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=mentions.csv');
  res.send(csv);
});

app.get('/api/export/mentions.json', (req, res) => {
  const filters: MentionFilters = {
    platform: req.query.platform as MentionFilters['platform'],
    sentiment: req.query.sentiment as string | undefined,
    search: req.query.search as string | undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
  };
  const mentions = getMentions(filters);
  res.setHeader('Content-Disposition', 'attachment; filename=mentions.json');
  res.json(mentions);
});

app.get('/api/export/reviews', (req, res) => {
  const filters = {
    platform: req.query.platform as 'playstore' | 'appstore' | undefined,
    rating: req.query.rating ? parseInt(req.query.rating as string) : undefined,
    sentiment: req.query.sentiment as string | undefined,
    search: req.query.search as string | undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
  };
  const reviews = getReviews(filters);
  
  const csv = [
    ['Date', 'Store', 'Author', 'Rating', 'Title', 'Content', 'Version', 'Sentiment', 'Score'].join(','),
    ...reviews.map(r => [
      r.review_date,
      (r as any).platform_name || '',
      `"${(r.author || '').replace(/"/g, '""')}"`,
      r.rating,
      `"${(r.title || '').replace(/"/g, '""')}"`,
      `"${(r.content || '').replace(/"/g, '""')}"`,
      r.app_version || '',
      r.sentiment_label || '',
      r.sentiment_score || '',
    ].join(','))
  ].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=reviews.csv');
  res.send(csv);
});

app.get('/api/export/reviews.json', (req, res) => {
  const filters = {
    platform: req.query.platform as 'playstore' | 'appstore' | undefined,
    rating: req.query.rating ? parseInt(req.query.rating as string) : undefined,
    sentiment: req.query.sentiment as string | undefined,
    search: req.query.search as string | undefined,
    startDate: req.query.startDate as string | undefined,
    endDate: req.query.endDate as string | undefined,
    limit: req.query.limit ? parseInt(req.query.limit as string) : undefined,
    offset: req.query.offset ? parseInt(req.query.offset as string) : undefined,
  };
  const reviews = getReviews(filters);
  res.setHeader('Content-Disposition', 'attachment; filename=reviews.json');
  res.json(reviews);
});

// Google Sheets export
app.get('/api/export/all', (req, res) => {
  const startDate = req.query.startDate as string | undefined;
  const endDate = req.query.endDate as string | undefined;
  const mentions = getMentions({ startDate, endDate });
  const reviews = getReviews({ startDate, endDate });

  const mentionRows = mentions.map(m => [
    new Date(m.created_at).toISOString().slice(0, 10),
    'mention',
    (m as any).platform_name || 'reddit',
    `"${(m.author || '').replace(/"/g, '""')}"`,
    `"${(m.content || '').replace(/"/g, '""')}"`,
    m.url || '',
    m.engagement_likes,
    m.engagement_comments,
    '',
    '',
    m.sentiment_label || '',
  ].join(','));

  const reviewRows = reviews.map(r => [
    new Date(r.review_date).toISOString().slice(0, 10),
    'review',
    (r as any).platform_name || '',
    `"${(r.author || '').replace(/"/g, '""')}"`,
    `"${(r.content || '').replace(/"/g, '""')}"`,
    '',
    '',
    '',
    r.rating,
    `"${(r.title || '').replace(/"/g, '""')}"`,
    r.sentiment_label || '',
  ].join(','));

  const csv = [
    ['Date', 'Type', 'Platform', 'Author', 'Content', 'URL', 'Likes', 'Comments', 'Rating', 'Title', 'Sentiment'].join(','),
    ...mentionRows,
    ...reviewRows,
  ].join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=all-data.csv');
  res.send(csv);
});

// Google Sheets export
app.get('/api/export/sheets', async (req, res) => {
  if (!config.google.enabled) {
    return res.status(400).json({ error: 'Google Sheets export is disabled. Configure credentials in .env' });
  }
  
  try {
    const service = new GoogleSheetsService();
    const type = req.query.type as string;
    
    if (type === 'mentions') {
      const mentions = getMentions();
      await service.exportMentions(mentions);
      res.json({ success: true, message: `Exported ${mentions.length} mentions to Google Sheet` });
    } else if (type === 'reviews') {
      const reviews = getReviews();
      await service.exportReviews(reviews);
      res.json({ success: true, message: `Exported ${reviews.length} reviews to Google Sheet` });
    } else {
      res.status(400).json({ error: 'Invalid type. Use ?type=mentions or ?type=reviews' });
    }
  } catch (error) {
    logger.error('Export failed', { error });
    res.status(500).json({ error: 'Export failed. Check server logs.' });
  }
});

// ============================================================================
// OUTREACH
// ============================================================================

// Helper: exchange Reddit auth code for tokens
async function exchangeRedditCode(code: string): Promise<Omit<OutreachAuth, 'id' | 'created_at' | 'updated_at'> | null> {
  try {
    const credentials = Buffer.from(`${config.reddit.clientId}:${config.reddit.clientSecret}`).toString('base64');
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'User-Agent': config.reddit.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.reddit.redirectUri,
      }).toString(),
    });
    if (!response.ok) return null;
    const data = await response.json() as any;
    if (data.error || !data.access_token) return null;
    // Fetch Reddit username
    let reddit_username: string | null = null;
    try {
      const meRes = await fetch('https://oauth.reddit.com/api/v1/me', {
        headers: {
          'Authorization': `Bearer ${data.access_token}`,
          'User-Agent': config.reddit.userAgent,
        },
      });
      if (meRes.ok) {
        const me = await meRes.json() as any;
        reddit_username = me.name ?? null;
      }
    } catch { /* ignore */ }
    const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? null,
      scope: data.scope ?? null,
      token_type: data.token_type ?? null,
      expires_at: expiresAt,
      reddit_username,
    };
  } catch (err) {
    logger.error('Reddit token exchange failed', { err });
    return null;
  }
}

// Helper: refresh Reddit access token
async function refreshRedditToken(refreshToken: string): Promise<Omit<OutreachAuth, 'id' | 'created_at' | 'updated_at'> | null> {
  try {
    const credentials = Buffer.from(`${config.reddit.clientId}:${config.reddit.clientSecret}`).toString('base64');
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'User-Agent': config.reddit.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }).toString(),
    });
    if (!response.ok) return null;
    const data = await response.json() as any;
    if (data.error || !data.access_token) return null;
    const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
    const existing = getOutreachAuth();
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token ?? refreshToken,
      scope: data.scope ?? existing?.scope ?? null,
      token_type: data.token_type ?? existing?.token_type ?? null,
      expires_at: expiresAt,
      reddit_username: existing?.reddit_username ?? null,
    };
  } catch (err) {
    logger.error('Reddit token refresh failed', { err });
    return null;
  }
}

// Helper: get a valid access token (refresh if expired)
async function getValidAccessToken(): Promise<string | null> {
  const auth = getOutreachAuth();
  if (!auth?.access_token) return null;
  if (auth.expires_at && new Date(auth.expires_at) < new Date(Date.now() + 60_000)) {
    if (!auth.refresh_token) return null;
    const refreshed = await refreshRedditToken(auth.refresh_token);
    if (!refreshed) return null;
    saveOutreachAuth(refreshed);
    return refreshed.access_token;
  }
  return auth.access_token;
}

// GET /outreach - main page
app.get('/outreach', (req, res) => {
  const auth = getOutreachAuth();
  const subreddits = getOutreachSubreddits();
  const drafts = getOutreachDrafts();
  const oauthConfigured = !!(config.reddit.clientId && config.reddit.clientSecret);
  res.render('outreach', {
    appName,
    title: `Outreach – ${appName}`,
    auth,
    subreddits,
    drafts,
    oauthConfigured,
    error: req.query.error as string | undefined,
    success: req.query.success as string | undefined,
  });
});

// GET /outreach/auth - start Reddit OAuth flow
app.get('/outreach/auth', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (!simpleRateLimit(`oauth-init:${ip}`, 10, 60_000)) {
    return res.status(429).send('Too many requests. Please wait before trying again.');
  }
  if (!config.reddit.clientId || !config.reddit.clientSecret) {
    return res.redirect('/outreach?error=Reddit+OAuth+credentials+not+configured.+Set+REDDIT_CLIENT_ID+and+REDDIT_CLIENT_SECRET+in+.env');
  }
  const state = crypto.randomBytes(16).toString('hex');
  saveOAuthState(state);
  const authUrl = new URL('https://www.reddit.com/api/v1/authorize');
  authUrl.searchParams.set('client_id', config.reddit.clientId);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('redirect_uri', config.reddit.redirectUri);
  authUrl.searchParams.set('duration', 'permanent');
  authUrl.searchParams.set('scope', 'submit identity');
  res.redirect(authUrl.toString());
});

// GET /outreach/auth/callback - Reddit OAuth callback
app.get('/outreach/auth/callback', async (req, res) => {
  const ip = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (!simpleRateLimit(`oauth-cb:${ip}`, 10, 60_000)) {
    return res.status(429).send('Too many requests. Please wait before trying again.');
  }
  const { code, state, error } = req.query as Record<string, string>;
  if (error) {
    return res.redirect(`/outreach?error=Reddit+access+denied:+${encodeURIComponent(error)}`);
  }
  if (!state || !verifyAndDeleteOAuthState(state)) {
    return res.redirect('/outreach?error=Invalid+or+expired+OAuth+state.+Please+try+again.');
  }
  if (!code) {
    return res.redirect('/outreach?error=No+authorization+code+received+from+Reddit.');
  }
  const tokenData = await exchangeRedditCode(code);
  if (!tokenData) {
    return res.redirect('/outreach?error=Failed+to+exchange+code+for+token.+Check+your+Reddit+app+credentials.');
  }
  saveOutreachAuth(tokenData);
  logger.info(`Reddit outreach connected as u/${tokenData.reddit_username}`);
  res.redirect(`/outreach?success=Reddit+connected+as+u%2F${encodeURIComponent(tokenData.reddit_username ?? 'unknown')}`);
});

// POST /outreach/auth/disconnect
app.post('/outreach/auth/disconnect', (req, res) => {
  const ip = (req.headers['x-forwarded-for'] as string || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
  if (!simpleRateLimit(`oauth-dc:${ip}`, 10, 60_000)) {
    return res.status(429).send('Too many requests. Please wait before trying again.');
  }
  clearOutreachAuth();
  res.redirect('/outreach?success=Reddit+account+disconnected');
});

// POST /outreach/subreddits - add target subreddit
app.post('/outreach/subreddits', (req, res) => {
  try {
    const { name, notes, cooldown_hours } = req.body;
    const cleaned = (name || '').trim().replace(/^r\//, '').toLowerCase();
    if (!cleaned) {
      return res.redirect('/outreach?error=Subreddit+name+is+required');
    }
    createOutreachSubreddit({
      name: cleaned,
      notes: notes?.trim() || null,
      cooldown_hours: parseInt(cooldown_hours) || 168,
    });
    res.redirect('/outreach?success=Subreddit+added');
  } catch (err: any) {
    logger.error('Add subreddit failed', { err });
    const msg = String(err?.message || err).includes('UNIQUE') ? 'Subreddit+already+exists' : 'Failed+to+add+subreddit';
    res.redirect(`/outreach?error=${msg}`);
  }
});

// POST /outreach/subreddits/:id/toggle
app.post('/outreach/subreddits/:id/toggle', (req, res) => {
  const sub = getOutreachSubredditById(parseInt(req.params.id));
  if (sub) {
    updateOutreachSubreddit(sub.id!, { enabled: sub.enabled ? 0 : 1 });
  }
  res.redirect('/outreach');
});

// POST /outreach/subreddits/:id/delete
app.post('/outreach/subreddits/:id/delete', (req, res) => {
  deleteOutreachSubreddit(parseInt(req.params.id));
  res.redirect('/outreach?success=Subreddit+removed');
});

// POST /outreach/drafts - create draft
app.post('/outreach/drafts', (req, res) => {
  try {
    const { subreddit_id, kind, title, body, url, disclosure } = req.body;
    if (!subreddit_id || !kind || !title?.trim()) {
      return res.redirect('/outreach?error=Subreddit%2C+type+and+title+are+required');
    }
    if (kind === 'link' && !url?.trim()) {
      return res.redirect('/outreach?error=URL+is+required+for+link+posts');
    }
    createOutreachDraft({
      subreddit_id: parseInt(subreddit_id),
      kind: kind as 'self' | 'link',
      title: title.trim(),
      body: kind === 'self' ? (body?.trim() || null) : null,
      url: kind === 'link' ? (url?.trim() || null) : null,
      disclosure: disclosure?.trim() || null,
    });
    res.redirect('/outreach?success=Draft+created');
  } catch (err) {
    logger.error('Create draft failed', { err });
    res.redirect('/outreach?error=Failed+to+create+draft');
  }
});

// POST /outreach/drafts/:id/submit - submit draft to Reddit
app.post('/outreach/drafts/:id/submit', async (req, res) => {
  const draftId = parseInt(req.params.id);
  const draft = getOutreachDraftById(draftId);
  if (!draft) {
    return res.redirect('/outreach?error=Draft+not+found');
  }
  if (draft.status === 'posted') {
    return res.redirect('/outreach?error=This+draft+has+already+been+posted');
  }
  const accessToken = await getValidAccessToken();
  if (!accessToken) {
    return res.redirect('/outreach?error=Reddit+account+not+connected+or+token+expired.+Please+reconnect.');
  }
  const subreddit = getOutreachSubredditById(draft.subreddit_id);
  if (!subreddit || !subreddit.enabled) {
    return res.redirect('/outreach?error=Target+subreddit+is+disabled+or+not+found');
  }
  try {
    const submitBody = new URLSearchParams({
      sr: subreddit.name,
      kind: draft.kind,
      title: draft.title,
      resubmit: 'true',
      nsfw: 'false',
    });
    if (draft.kind === 'self') {
      submitBody.set('text', draft.body || '');
    } else {
      submitBody.set('url', draft.url || '');
    }
    const response = await fetch('https://oauth.reddit.com/api/submit', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': config.reddit.userAgent,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: submitBody.toString(),
    });
    const json = await response.json() as any;
    const responseStr = JSON.stringify(json);
    // Reddit wraps errors in json.json.errors or json.json.data
    const errors = json?.json?.errors as [string, string, string][] | undefined;
    if (errors && errors.length > 0) {
      const errorMsg = errors[0][1] ?? 'Unknown Reddit error';
      createPostAttempt({ draft_id: draftId, status: 'failed', response_json: responseStr, error: errorMsg });
      updateOutreachDraft(draftId, { status: 'failed', last_error: errorMsg });
      logger.warn(`Reddit submit failed for draft ${draftId}: ${errorMsg}`);
      return res.redirect(`/outreach?error=Reddit+rejected+the+post:+${encodeURIComponent(errorMsg)}`);
    }
    const postUrl: string | undefined = json?.json?.data?.url;
    const postId: string | undefined = postUrl ? postUrl.split('/comments/')[1]?.split('/')[0] : undefined;
    createPostAttempt({ draft_id: draftId, status: 'success', response_json: responseStr, error: null });
    updateOutreachDraft(draftId, {
      status: 'posted',
      reddit_post_id: postId ?? null,
      reddit_post_url: postUrl ?? null,
      posted_at: new Date().toISOString(),
      last_error: null,
    });
    logger.info(`Reddit post submitted successfully: ${postUrl}`);
    res.redirect(`/outreach?success=Post+submitted+to+r%2F${encodeURIComponent(subreddit.name)}`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    createPostAttempt({ draft_id: draftId, status: 'failed', response_json: null, error: errorMsg });
    updateOutreachDraft(draftId, { status: 'failed', last_error: errorMsg });
    logger.error('Reddit submit error', { err });
    res.redirect(`/outreach?error=Failed+to+submit+post:+${encodeURIComponent(errorMsg)}`);
  }
});

// POST /outreach/drafts/:id/delete
app.post('/outreach/drafts/:id/delete', (req, res) => {
  deleteOutreachDraft(parseInt(req.params.id));
  res.redirect('/outreach?success=Draft+deleted');
});

// GET /api/outreach/drafts/:id/attempts - get post attempts for a draft
app.get('/api/outreach/drafts/:id/attempts', (req, res) => {
  const attempts = getPostAttempts(parseInt(req.params.id));
  res.json(attempts);
});

// ============================================================================
// FEATURE: RESPONSE INBOX (bookmarked / action-required mentions)
// ============================================================================

// Page: GET /inbox
app.get('/inbox', (req, res) => {
  const { status, bookmarked, action_required } = req.query as Record<string, string>;
  const filters: Record<string, any> = { limit: 100 };
  if (status === 'open' || status === 'in_progress' || status === 'resolved') filters.action_status = status;
  if (bookmarked === '1') filters.bookmarked = true;
  if (action_required === '1') filters.action_required = true;
  const mentions = getInboxMentions(filters);
  const stats = getInboxStats();
  res.render('inbox', {
    title: `${config.appName} – Response Inbox`,
    appName: config.appName,
    mentions,
    stats,
    filters: req.query,
  });
});

// API: toggle bookmark
app.post('/mentions/:id/bookmark', (req, res) => {
  const id = parseInt(req.params.id);
  const { bookmarked } = req.body;
  setMentionBookmark(id, bookmarked === '1' || bookmarked === 'true');
  res.json({ ok: true });
});

// API: toggle action-required
app.post('/mentions/:id/action', (req, res) => {
  const id = parseInt(req.params.id);
  const { required } = req.body;
  setMentionActionRequired(id, required === '1' || required === 'true');
  res.json({ ok: true });
});

// API: update action status
app.post('/mentions/:id/status', (req, res) => {
  const id = parseInt(req.params.id);
  const { status } = req.body;
  if (!['open', 'in_progress', 'resolved'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  setMentionActionStatus(id, status as 'open' | 'in_progress' | 'resolved');
  res.json({ ok: true });
});

// API: save internal notes
app.post('/mentions/:id/notes', (req, res) => {
  const id = parseInt(req.params.id);
  const { notes } = req.body;
  setMentionNotes(id, (notes || '').toString().slice(0, 2000));
  res.json({ ok: true });
});

// API: inbox JSON
app.get('/api/inbox', (req, res) => {
  const mentions = getInboxMentions({ limit: 200 });
  const stats = getInboxStats();
  res.json({ stats, mentions });
});

// ============================================================================
// FEATURE: COMPETITOR / ENTITY COMPARISON
// ============================================================================

// Page: GET /compare?projectId=1
app.get('/compare', (req, res) => {
  const projects = getProjects();
  const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : (projects[0]?.id ?? null);
  const project = projectId ? getProjectById(projectId) : null;
  const days = parseInt((req.query.days as string) || '30');
  const stats = projectId ? getEntityComparison(projectId, days) : [];
  res.render('compare', {
    title: `${config.appName} – Competitor Comparison`,
    appName: config.appName,
    projects,
    project,
    projectId,
    days,
    stats,
  });
});

// API: competitor comparison JSON
app.get('/api/compare', (req, res) => {
  const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : 1;
  const days = parseInt((req.query.days as string) || '30');
  const stats = getEntityComparison(projectId, days);
  res.json({ projectId, days, entities: stats });
});

// ============================================================================
// FEATURE: WEEKLY DIGEST REPORT
// ============================================================================

// Page: GET /report
app.get('/report', (req, res) => {
  const weeksAgo = parseInt((req.query.weeksAgo as string) || '0');
  const digest = getWeeklyDigest(weeksAgo);
  res.render('report', {
    title: `${config.appName} – Weekly Digest`,
    appName: config.appName,
    digest,
    weeksAgo,
  });
});

// API: digest JSON
app.get('/api/report/weekly', (req, res) => {
  const weeksAgo = parseInt((req.query.weeksAgo as string) || '0');
  res.json(getWeeklyDigest(weeksAgo));
});

export function startServer() {
  app.listen(config.port, () => {
    logger.info(`Dashboard running at http://localhost:${config.port}`);
  });
  
  return app;
}

export { app };
