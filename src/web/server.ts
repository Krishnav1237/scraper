import express from 'express';
import path from 'path';
import { config } from '../config.js';
import { logger } from '../core/logger.js';
import {
  getMentions, getReviews, getStats, getRecentLogs, MentionFilters,
  getProjects, getProjectById, createProject, updateProject, deleteProject,
  getKeywordGroups, getKeywordGroupById, createKeywordGroup, updateKeywordGroup, deleteKeywordGroup,
  getEntities, getEntityById, createEntity, updateEntity, deleteEntity,
  getAlertRules, getAlertRuleById, createAlertRule, updateAlertRule, deleteAlertRule,
  getAlertEvents, getTrends, evaluateAlerts,
} from '../db/queries.js';
import { GoogleSheetsService } from '../core/googleSheets.js';
import { getScheduleInfo } from '../scheduler/jobs.js';
import { getRateLimitState } from '../core/rateLimit.js';

const app = express();
const appName = config.appName;

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
  
  res.render('dashboard', {
    appName,
    title: appName,
    stats,
    recentLogs,
    recentMentions,
    recentReviews,
    alertEvents,
    trends,
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
    const { name, type, threshold, window_hours } = req.body;
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
  res.json(getTrends(Math.min(days, 365)));
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

export function startServer() {
  app.listen(config.port, () => {
    logger.info(`Dashboard running at http://localhost:${config.port}`);
  });
  
  return app;
}

export { app };
