import { db } from './schema.js';

// Platform IDs
export const PLATFORMS = {
  reddit: 1,
  playstore: 4,
  appstore: 5,
} as const;

export type PlatformName = keyof typeof PLATFORMS;

// Mention types
export interface Mention {
  id?: number;
  platform_id: number;
  external_id: string;
  author: string | null;
  author_url: string | null;
  content: string | null;
  url: string | null;
  engagement_likes: number;
  engagement_comments: number;
  engagement_shares: number;
  sentiment_score: number | null;
  sentiment_label: string | null;
  created_at: string;
  scraped_at?: string;
}

export interface Review {
  id?: number;
  platform_id: number;
  external_id: string;
  author: string | null;
  rating: number;
  title: string | null;
  content: string | null;
  app_version: string | null;
  helpful_count: number;
  developer_reply: string | null;
  sentiment_score: number | null;
  sentiment_label: string | null;
  review_date: string;
  scraped_at?: string;
}

export interface ScrapeLog {
  id?: number;
  platform: string;
  status: 'running' | 'success' | 'failed';
  items_found: number;
  items_new: number;
  error: string | null;
  started_at: string;
  completed_at: string | null;
}

// Insert mention (upsert)
const insertMentionStmt = db.prepare(`
  INSERT INTO mentions (platform_id, external_id, author, author_url, content, url, 
    engagement_likes, engagement_comments, engagement_shares, sentiment_score, sentiment_label, created_at)
  VALUES (@platform_id, @external_id, @author, @author_url, @content, @url,
    @engagement_likes, @engagement_comments, @engagement_shares, @sentiment_score, @sentiment_label, @created_at)
  ON CONFLICT(platform_id, external_id) DO UPDATE SET
    author = excluded.author,
    author_url = excluded.author_url,
    content = excluded.content,
    url = excluded.url,
    engagement_likes = excluded.engagement_likes,
    engagement_comments = excluded.engagement_comments,
    engagement_shares = excluded.engagement_shares,
    sentiment_score = excluded.sentiment_score,
    sentiment_label = excluded.sentiment_label
`);

export function insertMention(mention: Mention): boolean {
  const result = insertMentionStmt.run(mention);
  return result.changes > 0;
}

// Batch insert mentions
export function insertMentions(mentions: Mention[]): number {
  let newCount = 0;
  const transaction = db.transaction((items: Mention[]) => {
    for (const mention of items) {
      try {
        const existing = db.prepare('SELECT id FROM mentions WHERE platform_id = ? AND external_id = ?')
          .get(mention.platform_id, mention.external_id);
        insertMentionStmt.run(mention);
        if (!existing) newCount++;
      } catch (e) {
        // Skip duplicates
      }
    }
  });
  transaction(mentions);
  return newCount;
}

// Insert review (upsert)
const insertReviewStmt = db.prepare(`
  INSERT INTO reviews (platform_id, external_id, author, rating, title, content,
    app_version, helpful_count, developer_reply, sentiment_score, sentiment_label, review_date)
  VALUES (@platform_id, @external_id, @author, @rating, @title, @content,
    @app_version, @helpful_count, @developer_reply, @sentiment_score, @sentiment_label, @review_date)
  ON CONFLICT(platform_id, external_id) DO UPDATE SET
    author = excluded.author,
    rating = excluded.rating,
    title = excluded.title,
    content = excluded.content,
    app_version = excluded.app_version,
    helpful_count = excluded.helpful_count,
    developer_reply = excluded.developer_reply,
    sentiment_score = excluded.sentiment_score,
    sentiment_label = excluded.sentiment_label
`);

export function insertReview(review: Review): boolean {
  const result = insertReviewStmt.run(review);
  return result.changes > 0;
}

// Batch insert reviews
export function insertReviews(reviews: Review[]): number {
  let newCount = 0;
  const transaction = db.transaction((items: Review[]) => {
    for (const review of items) {
      try {
        const existing = db.prepare('SELECT id FROM reviews WHERE platform_id = ? AND external_id = ?')
          .get(review.platform_id, review.external_id);
        insertReviewStmt.run(review);
        if (!existing) newCount++;
      } catch (e) {
        // Skip duplicates
      }
    }
  });
  transaction(reviews);
  return newCount;
}

// Query mentions with filters
export interface MentionFilters {
  platform?: PlatformName;
  sentiment?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export function getMentions(filters: MentionFilters = {}): Mention[] {
  let query = 'SELECT m.*, p.name as platform_name FROM mentions m JOIN platforms p ON m.platform_id = p.id WHERE 1=1';
  const params: any[] = [];
  
  if (filters.platform) {
    query += ' AND p.name = ?';
    params.push(filters.platform);
  }
  if (filters.sentiment) {
    query += ' AND m.sentiment_label = ?';
    params.push(filters.sentiment);
  }
  if (filters.search) {
    query += ' AND (m.content LIKE ? OR m.author LIKE ? OR m.url LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.startDate) {
    query += ' AND m.created_at >= ?';
    params.push(filters.startDate);
  }
  
  // Single Filter Mode: If only start date is picked, show ONLY that day.
  // Range Mode: If end date is also picked, use it.
  const effectiveEndDate = filters.endDate || filters.startDate;
  
  if (effectiveEndDate) {
    query += ' AND m.created_at <= ?';
    const end = effectiveEndDate.length === 10 ? effectiveEndDate + 'T23:59:59' : effectiveEndDate;
    params.push(end);
  }
  
  query += ' ORDER BY m.created_at DESC';
  
  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }
  }
  
  return db.prepare(query).all(...params) as Mention[];
}

// Query reviews with filters
export interface ReviewFilters {
  platform?: 'playstore' | 'appstore';
  rating?: number;
  sentiment?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export function getReviews(filters: ReviewFilters = {}): Review[] {
  let query = 'SELECT r.*, p.name as platform_name FROM reviews r JOIN platforms p ON r.platform_id = p.id WHERE 1=1';
  const params: any[] = [];
  
  if (filters.platform) {
    query += ' AND p.name = ?';
    params.push(filters.platform);
  }
  if (filters.rating) {
    query += ' AND r.rating = ?';
    params.push(filters.rating);
  }
  if (filters.sentiment) {
    query += ' AND r.sentiment_label = ?';
    params.push(filters.sentiment);
  }
  if (filters.search) {
    query += ' AND (r.content LIKE ? OR r.title LIKE ? OR r.author LIKE ?)';
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }
  if (filters.startDate) {
    query += ' AND r.review_date >= ?';
    params.push(filters.startDate);
  }
  
  // Single Filter Mode: If only start date is picked, show ONLY that day.
  // Range Mode: If end date is also picked, use it.
  const effectiveEndDate = filters.endDate || filters.startDate;

  if (effectiveEndDate) {
    query += ' AND r.review_date <= ?';
    const end = effectiveEndDate.length === 10 ? effectiveEndDate + 'T23:59:59' : effectiveEndDate;
    params.push(end);
  }
  
  query += ' ORDER BY r.review_date DESC';
  
  if (filters.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
    if (filters.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }
  }
  
  return db.prepare(query).all(...params) as Review[];
}

// Get stats
export function getStats() {
  const mentionStats = db.prepare(`
    SELECT 
      p.name as platform,
      COUNT(*) as total,
      SUM(CASE WHEN m.sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive,
      SUM(CASE WHEN m.sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral,
      SUM(CASE WHEN m.sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative,
      AVG(m.sentiment_score) as avg_sentiment
    FROM mentions m
    JOIN platforms p ON m.platform_id = p.id
    GROUP BY p.name
  `).all();
  
  const reviewStats = db.prepare(`
    SELECT 
      p.name as platform,
      COUNT(*) as total,
      AVG(r.rating) as avg_rating,
      SUM(CASE WHEN r.rating >= 4 THEN 1 ELSE 0 END) as positive_reviews,
      SUM(CASE WHEN r.rating <= 2 THEN 1 ELSE 0 END) as negative_reviews
    FROM reviews r
    JOIN platforms p ON r.platform_id = p.id
    GROUP BY p.name
  `).all();
  
  const recentMentions = db.prepare(`
    SELECT COUNT(*) as count FROM mentions WHERE created_at >= datetime('now', '-24 hours')
  `).get() as { count: number };
  
  const recentReviews = db.prepare(`
    SELECT COUNT(*) as count FROM reviews WHERE review_date >= datetime('now', '-24 hours')
  `).get() as { count: number };
  
  return {
    mentions: mentionStats,
    reviews: reviewStats,
    last24h: {
      mentions: recentMentions.count,
      reviews: recentReviews.count,
    },
  };
}

// Scrape logs
export function logScrapeStart(platform: string): number {
  const result = db.prepare(`
    INSERT INTO scrape_logs (platform, status, started_at) VALUES (?, 'running', datetime('now'))
  `).run(platform);
  return result.lastInsertRowid as number;
}

export function logScrapeEnd(id: number, status: 'success' | 'failed', itemsFound: number, itemsNew: number, error?: string) {
  db.prepare(`
    UPDATE scrape_logs SET status = ?, items_found = ?, items_new = ?, error = ?, completed_at = datetime('now')
    WHERE id = ?
  `).run(status, itemsFound, itemsNew, error || null, id);
}

export function getRecentLogs(limit = 20): ScrapeLog[] {
  return db.prepare(`
    SELECT * FROM scrape_logs ORDER BY started_at DESC LIMIT ?
  `).all(limit) as ScrapeLog[];
}

// ============================================================================
// INCREMENTAL SCRAPING CURSORS
// ============================================================================

export interface ScrapeCursor {
  platform: string;
  last_scraped_at: string;
  last_item_date: string | null;
  last_item_ids: string | null;
}

const getCursorStmt = db.prepare('SELECT * FROM scrape_cursors WHERE platform = ?');
const upsertCursorStmt = db.prepare(`
  INSERT INTO scrape_cursors (platform, last_scraped_at, last_item_date, last_item_ids, updated_at)
  VALUES (@platform, datetime('now'), @last_item_date, @last_item_ids, datetime('now'))
  ON CONFLICT(platform) DO UPDATE SET
    last_scraped_at = datetime('now'),
    last_item_date = excluded.last_item_date,
    last_item_ids = excluded.last_item_ids,
    updated_at = datetime('now')
`);

export function getScrapeCursor(platform: string): ScrapeCursor | null {
  return getCursorStmt.get(platform) as ScrapeCursor | null;
}

export function updateScrapeCursor(
  platform: string, 
  lastItemDate?: string, 
  lastItemIds?: string[]
): void {
  upsertCursorStmt.run({
    platform,
    last_item_date: lastItemDate || null,
    last_item_ids: lastItemIds ? JSON.stringify(lastItemIds) : null
  });
}

// Helper to get recent external IDs for deduplication
export function getRecentExternalIds(platform: PlatformName, limit = 1000): string[] {
  // Select IDs from appropriate table based on platform type
  const platformId = PLATFORMS[platform];
  if (!platformId) return [];

  // Determine which table to query
  const isAppStore = platform === 'appstore' || platform === 'playstore';
  const table = isAppStore ? 'reviews' : 'mentions';
  const orderBy = isAppStore ? 'review_date' : 'created_at';

  const rows = db.prepare(`
    SELECT external_id 
    FROM ${table} 
    WHERE platform_id = ? 
    ORDER BY ${orderBy} DESC 
    LIMIT ?
  `).all(platformId, limit) as { external_id: string }[];

  return rows.map(row => row.external_id);
}

// ============================================================================
// PROJECTS
// ============================================================================

export interface Project {
  id?: number;
  name: string;
  description: string | null;
  search_terms: string;       // JSON array string
  required_terms: string;     // JSON array string
  filter_strict: number;
  filter_balanced: number;
  monitor_subreddits: string; // JSON array string
  playstore_app_id: string;
  appstore_app_id: string;
  created_at?: string;
  updated_at?: string;
}

export function getProjects(): Project[] {
  return db.prepare('SELECT * FROM projects ORDER BY id ASC').all() as Project[];
}

export function getProjectById(id: number): Project | null {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as Project | null;
}

export function createProject(data: Omit<Project, 'id' | 'created_at' | 'updated_at'>): Project {
  const result = db.prepare(`
    INSERT INTO projects (name, description, search_terms, required_terms, filter_strict, filter_balanced,
      monitor_subreddits, playstore_app_id, appstore_app_id)
    VALUES (@name, @description, @search_terms, @required_terms, @filter_strict, @filter_balanced,
      @monitor_subreddits, @playstore_app_id, @appstore_app_id)
  `).run(data);
  return getProjectById(result.lastInsertRowid as number)!;
}

export function updateProject(id: number, data: Partial<Omit<Project, 'id' | 'created_at' | 'updated_at'>>): Project | null {
  const existing = getProjectById(id);
  if (!existing) return null;
  const merged = { ...existing, ...data, updated_at: new Date().toISOString() };
  db.prepare(`
    UPDATE projects SET name=@name, description=@description, search_terms=@search_terms,
      required_terms=@required_terms, filter_strict=@filter_strict, filter_balanced=@filter_balanced,
      monitor_subreddits=@monitor_subreddits, playstore_app_id=@playstore_app_id,
      appstore_app_id=@appstore_app_id, updated_at=@updated_at
    WHERE id=@id
  `).run({ ...merged, id });
  return getProjectById(id);
}

export function deleteProject(id: number): boolean {
  if (id === 1) return false; // Protect default project
  const result = db.prepare('DELETE FROM projects WHERE id = ?').run(id);
  return result.changes > 0;
}

// ============================================================================
// KEYWORD GROUPS
// ============================================================================

export interface KeywordGroup {
  id?: number;
  project_id: number;
  name: string;
  keywords: string; // JSON array string
  description: string | null;
  created_at?: string;
  updated_at?: string;
}

export function getKeywordGroups(projectId?: number): KeywordGroup[] {
  if (projectId !== undefined) {
    return db.prepare('SELECT * FROM keyword_groups WHERE project_id = ? ORDER BY name ASC').all(projectId) as KeywordGroup[];
  }
  return db.prepare('SELECT * FROM keyword_groups ORDER BY project_id, name ASC').all() as KeywordGroup[];
}

export function getKeywordGroupById(id: number): KeywordGroup | null {
  return db.prepare('SELECT * FROM keyword_groups WHERE id = ?').get(id) as KeywordGroup | null;
}

export function createKeywordGroup(data: Omit<KeywordGroup, 'id' | 'created_at' | 'updated_at'>): KeywordGroup {
  const result = db.prepare(`
    INSERT INTO keyword_groups (project_id, name, keywords, description)
    VALUES (@project_id, @name, @keywords, @description)
  `).run(data);
  return getKeywordGroupById(result.lastInsertRowid as number)!;
}

export function updateKeywordGroup(id: number, data: Partial<Omit<KeywordGroup, 'id' | 'created_at' | 'updated_at'>>): KeywordGroup | null {
  const existing = getKeywordGroupById(id);
  if (!existing) return null;
  const merged = { ...existing, ...data, updated_at: new Date().toISOString() };
  db.prepare(`
    UPDATE keyword_groups SET name=@name, keywords=@keywords, description=@description,
      project_id=@project_id, updated_at=@updated_at
    WHERE id=@id
  `).run({ ...merged, id });
  return getKeywordGroupById(id);
}

export function deleteKeywordGroup(id: number): boolean {
  const result = db.prepare('DELETE FROM keyword_groups WHERE id = ?').run(id);
  return result.changes > 0;
}

// ============================================================================
// ENTITIES (Competitors / Peers)
// ============================================================================

export interface Entity {
  id?: number;
  project_id: number;
  name: string;
  search_terms: string; // JSON array string
  type: 'primary' | 'competitor' | 'peer';
  color: string;
  created_at?: string;
  updated_at?: string;
}

export function getEntities(projectId?: number): Entity[] {
  if (projectId !== undefined) {
    return db.prepare('SELECT * FROM entities WHERE project_id = ? ORDER BY type, name ASC').all(projectId) as Entity[];
  }
  return db.prepare('SELECT * FROM entities ORDER BY project_id, type, name ASC').all() as Entity[];
}

export function getEntityById(id: number): Entity | null {
  return db.prepare('SELECT * FROM entities WHERE id = ?').get(id) as Entity | null;
}

export function createEntity(data: Omit<Entity, 'id' | 'created_at' | 'updated_at'>): Entity {
  const result = db.prepare(`
    INSERT INTO entities (project_id, name, search_terms, type, color)
    VALUES (@project_id, @name, @search_terms, @type, @color)
  `).run(data);
  return getEntityById(result.lastInsertRowid as number)!;
}

export function updateEntity(id: number, data: Partial<Omit<Entity, 'id' | 'created_at' | 'updated_at'>>): Entity | null {
  const existing = getEntityById(id);
  if (!existing) return null;
  const merged = { ...existing, ...data, updated_at: new Date().toISOString() };
  db.prepare(`
    UPDATE entities SET name=@name, search_terms=@search_terms, type=@type, color=@color,
      project_id=@project_id, updated_at=@updated_at
    WHERE id=@id
  `).run({ ...merged, id });
  return getEntityById(id);
}

export function deleteEntity(id: number): boolean {
  const result = db.prepare('DELETE FROM entities WHERE id = ?').run(id);
  return result.changes > 0;
}

// ============================================================================
// ALERT RULES
// ============================================================================

export interface AlertRule {
  id?: number;
  project_id: number;
  name: string;
  type: 'mention_spike' | 'negative_sentiment';
  threshold: number;
  window_hours: number;
  enabled: number;
  created_at?: string;
  updated_at?: string;
}

export interface AlertEvent {
  id?: number;
  rule_id: number;
  project_id: number;
  triggered_at?: string;
  value: number | null;
  message: string | null;
  // Joined fields
  rule_name?: string;
  rule_type?: string;
}

export function getAlertRules(projectId?: number): AlertRule[] {
  if (projectId !== undefined) {
    return db.prepare('SELECT * FROM alert_rules WHERE project_id = ? ORDER BY name ASC').all(projectId) as AlertRule[];
  }
  return db.prepare('SELECT * FROM alert_rules ORDER BY project_id, name ASC').all() as AlertRule[];
}

export function getAlertRuleById(id: number): AlertRule | null {
  return db.prepare('SELECT * FROM alert_rules WHERE id = ?').get(id) as AlertRule | null;
}

export function createAlertRule(data: Omit<AlertRule, 'id' | 'created_at' | 'updated_at'>): AlertRule {
  const result = db.prepare(`
    INSERT INTO alert_rules (project_id, name, type, threshold, window_hours, enabled)
    VALUES (@project_id, @name, @type, @threshold, @window_hours, @enabled)
  `).run(data);
  return getAlertRuleById(result.lastInsertRowid as number)!;
}

export function updateAlertRule(id: number, data: Partial<Omit<AlertRule, 'id' | 'created_at' | 'updated_at'>>): AlertRule | null {
  const existing = getAlertRuleById(id);
  if (!existing) return null;
  const merged = { ...existing, ...data, updated_at: new Date().toISOString() };
  db.prepare(`
    UPDATE alert_rules SET name=@name, type=@type, threshold=@threshold, window_hours=@window_hours,
      enabled=@enabled, project_id=@project_id, updated_at=@updated_at
    WHERE id=@id
  `).run({ ...merged, id });
  return getAlertRuleById(id);
}

export function deleteAlertRule(id: number): boolean {
  const result = db.prepare('DELETE FROM alert_rules WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getAlertEvents(projectId?: number, limit = 50): AlertEvent[] {
  if (projectId !== undefined) {
    return db.prepare(`
      SELECT ae.*, ar.name as rule_name, ar.type as rule_type
      FROM alert_events ae
      JOIN alert_rules ar ON ae.rule_id = ar.id
      WHERE ae.project_id = ?
      ORDER BY ae.triggered_at DESC
      LIMIT ?
    `).all(projectId, limit) as AlertEvent[];
  }
  return db.prepare(`
    SELECT ae.*, ar.name as rule_name, ar.type as rule_type
    FROM alert_events ae
    JOIN alert_rules ar ON ae.rule_id = ar.id
    ORDER BY ae.triggered_at DESC
    LIMIT ?
  `).all(limit) as AlertEvent[];
}

export function createAlertEvent(data: Omit<AlertEvent, 'id' | 'triggered_at'>): void {
  db.prepare(`
    INSERT INTO alert_events (rule_id, project_id, value, message)
    VALUES (@rule_id, @project_id, @value, @message)
  `).run(data);
}

// ============================================================================
// TRENDS (daily/weekly aggregates)
// ============================================================================

export interface TrendPoint {
  date: string;
  mentions: number;
  reviews: number;
  positive: number;
  negative: number;
  neutral: number;
}

export function getTrends(days = 30): TrendPoint[] {
  const mentionRows = db.prepare(`
    SELECT
      date(m.created_at) as date,
      COUNT(*) as mentions,
      SUM(CASE WHEN m.sentiment_label = 'positive' THEN 1 ELSE 0 END) as positive,
      SUM(CASE WHEN m.sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative,
      SUM(CASE WHEN m.sentiment_label = 'neutral' THEN 1 ELSE 0 END) as neutral
    FROM mentions m
    WHERE m.created_at >= date('now', ?)
    GROUP BY date(m.created_at)
    ORDER BY date ASC
  `).all(`-${days} days`) as any[];

  const reviewRows = db.prepare(`
    SELECT date(r.review_date) as date, COUNT(*) as reviews
    FROM reviews r
    WHERE r.review_date >= date('now', ?)
    GROUP BY date(r.review_date)
    ORDER BY date ASC
  `).all(`-${days} days`) as any[];

  // Merge by date
  const byDate = new Map<string, TrendPoint>();
  for (const row of mentionRows) {
    byDate.set(row.date, {
      date: row.date,
      mentions: row.mentions,
      reviews: 0,
      positive: row.positive,
      negative: row.negative,
      neutral: row.neutral,
    });
  }
  for (const row of reviewRows) {
    if (byDate.has(row.date)) {
      byDate.get(row.date)!.reviews = row.reviews;
    } else {
      byDate.set(row.date, { date: row.date, mentions: 0, reviews: row.reviews, positive: 0, negative: 0, neutral: 0 });
    }
  }

  return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
}

// ============================================================================
// OUTREACH
// ============================================================================

export interface OutreachAuth {
  id: 1;
  access_token: string | null;
  refresh_token: string | null;
  scope: string | null;
  token_type: string | null;
  expires_at: string | null;
  reddit_username: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OutreachSubreddit {
  id?: number;
  name: string;
  enabled: number;
  notes: string | null;
  cooldown_hours: number;
  rules_json: string | null;
  last_rules_sync_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface OutreachDraft {
  id?: number;
  subreddit_id: number;
  kind: 'self' | 'link';
  title: string;
  body: string | null;
  url: string | null;
  disclosure: string | null;
  status: 'draft' | 'posted' | 'failed';
  reddit_post_id: string | null;
  reddit_post_url: string | null;
  last_error: string | null;
  posted_at: string | null;
  created_at?: string;
  updated_at?: string;
  // Joined
  subreddit_name?: string;
}

export interface OutreachPostAttempt {
  id?: number;
  draft_id: number;
  status: 'success' | 'failed';
  response_json: string | null;
  error: string | null;
  attempted_at?: string;
}

// ---- Auth ----

export function getOutreachAuth(): OutreachAuth | null {
  return db.prepare('SELECT * FROM outreach_reddit_auth WHERE id = 1').get() as OutreachAuth | null;
}

export function saveOutreachAuth(data: Omit<OutreachAuth, 'id' | 'created_at' | 'updated_at'>): void {
  db.prepare(`
    INSERT INTO outreach_reddit_auth (id, access_token, refresh_token, scope, token_type, expires_at, reddit_username, updated_at)
    VALUES (1, @access_token, @refresh_token, @scope, @token_type, @expires_at, @reddit_username, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      scope = excluded.scope,
      token_type = excluded.token_type,
      expires_at = excluded.expires_at,
      reddit_username = excluded.reddit_username,
      updated_at = datetime('now')
  `).run(data);
}

export function clearOutreachAuth(): void {
  db.prepare('DELETE FROM outreach_reddit_auth WHERE id = 1').run();
}

// ---- OAuth states ----

export function saveOAuthState(state: string): void {
  db.prepare(`INSERT INTO outreach_oauth_states (state, created_at) VALUES (?, datetime('now'))`).run(state);
}

export function verifyAndDeleteOAuthState(state: string): boolean {
  db.prepare(`DELETE FROM outreach_oauth_states WHERE created_at < datetime('now', '-10 minutes')`).run();
  const row = db.prepare('SELECT state FROM outreach_oauth_states WHERE state = ?').get(state);
  if (row) {
    db.prepare('DELETE FROM outreach_oauth_states WHERE state = ?').run(state);
    return true;
  }
  return false;
}

// ---- Subreddits ----

export function getOutreachSubreddits(): OutreachSubreddit[] {
  return db.prepare('SELECT * FROM outreach_subreddits ORDER BY name ASC').all() as OutreachSubreddit[];
}

export function getOutreachSubredditById(id: number): OutreachSubreddit | null {
  return db.prepare('SELECT * FROM outreach_subreddits WHERE id = ?').get(id) as OutreachSubreddit | null;
}

export function createOutreachSubreddit(data: Pick<OutreachSubreddit, 'name' | 'notes' | 'cooldown_hours'>): OutreachSubreddit {
  const result = db.prepare(`
    INSERT INTO outreach_subreddits (name, enabled, notes, cooldown_hours)
    VALUES (@name, 1, @notes, @cooldown_hours)
  `).run(data);
  return getOutreachSubredditById(result.lastInsertRowid as number)!;
}

export function updateOutreachSubreddit(id: number, data: Partial<OutreachSubreddit>): void {
  const existing = getOutreachSubredditById(id);
  if (!existing) return;
  const merged = { ...existing, ...data, updated_at: new Date().toISOString() };
  db.prepare(`
    UPDATE outreach_subreddits SET name=@name, enabled=@enabled, notes=@notes,
      cooldown_hours=@cooldown_hours, rules_json=@rules_json,
      last_rules_sync_at=@last_rules_sync_at, updated_at=@updated_at
    WHERE id=@id
  `).run({ ...merged, id });
}

export function deleteOutreachSubreddit(id: number): void {
  db.prepare('DELETE FROM outreach_subreddits WHERE id = ?').run(id);
}

// ---- Drafts ----

export function getOutreachDrafts(subredditId?: number): OutreachDraft[] {
  if (subredditId !== undefined) {
    return db.prepare(`
      SELECT d.*, s.name as subreddit_name
      FROM outreach_drafts d JOIN outreach_subreddits s ON d.subreddit_id = s.id
      WHERE d.subreddit_id = ?
      ORDER BY d.created_at DESC
    `).all(subredditId) as OutreachDraft[];
  }
  return db.prepare(`
    SELECT d.*, s.name as subreddit_name
    FROM outreach_drafts d JOIN outreach_subreddits s ON d.subreddit_id = s.id
    ORDER BY d.created_at DESC
  `).all() as OutreachDraft[];
}

export function getOutreachDraftById(id: number): OutreachDraft | null {
  return db.prepare(`
    SELECT d.*, s.name as subreddit_name
    FROM outreach_drafts d JOIN outreach_subreddits s ON d.subreddit_id = s.id
    WHERE d.id = ?
  `).get(id) as OutreachDraft | null;
}

export function createOutreachDraft(
  data: Pick<OutreachDraft, 'subreddit_id' | 'kind' | 'title' | 'body' | 'url' | 'disclosure'>
): OutreachDraft {
  const result = db.prepare(`
    INSERT INTO outreach_drafts (subreddit_id, kind, title, body, url, disclosure, status)
    VALUES (@subreddit_id, @kind, @title, @body, @url, @disclosure, 'draft')
  `).run(data);
  return getOutreachDraftById(result.lastInsertRowid as number)!;
}

export function updateOutreachDraft(id: number, data: Partial<Omit<OutreachDraft, 'id' | 'created_at' | 'subreddit_name'>>): void {
  const existing = getOutreachDraftById(id);
  if (!existing) return;
  const merged = { ...existing, ...data, updated_at: new Date().toISOString() };
  db.prepare(`
    UPDATE outreach_drafts SET subreddit_id=@subreddit_id, kind=@kind, title=@title,
      body=@body, url=@url, disclosure=@disclosure, status=@status,
      reddit_post_id=@reddit_post_id, reddit_post_url=@reddit_post_url,
      last_error=@last_error, posted_at=@posted_at, updated_at=@updated_at
    WHERE id=@id
  `).run({ ...merged, id });
}

export function deleteOutreachDraft(id: number): void {
  db.prepare('DELETE FROM outreach_drafts WHERE id = ?').run(id);
}

// ---- Post attempts ----

export function createPostAttempt(data: Omit<OutreachPostAttempt, 'id' | 'attempted_at'>): void {
  db.prepare(`
    INSERT INTO outreach_post_attempts (draft_id, status, response_json, error)
    VALUES (@draft_id, @status, @response_json, @error)
  `).run(data);
}

export function getPostAttempts(draftId: number): OutreachPostAttempt[] {
  return db.prepare('SELECT * FROM outreach_post_attempts WHERE draft_id = ? ORDER BY attempted_at DESC').all(draftId) as OutreachPostAttempt[];
}

// ============================================================================
// ALERT EVALUATION
// ============================================================================

export function evaluateAlerts(): void {
  const rules = getAlertRules().filter(r => r.enabled);
  for (const rule of rules) {
    try {
      if (rule.type === 'mention_spike') {
        const row = db.prepare(`
          SELECT COUNT(*) as cnt FROM mentions
          WHERE created_at >= datetime('now', ?)
        `).get(`-${rule.window_hours} hours`) as { cnt: number };
        if (row.cnt >= rule.threshold) {
          // Only fire if no event in the last window
          const recent = db.prepare(`
            SELECT id FROM alert_events
            WHERE rule_id = ? AND triggered_at >= datetime('now', ?)
          `).get(rule.id, `-${rule.window_hours} hours`);
          if (!recent) {
            createAlertEvent({
              rule_id: rule.id!,
              project_id: rule.project_id,
              value: row.cnt,
              message: `Mention spike detected: ${row.cnt} mentions in the last ${rule.window_hours}h (threshold: ${rule.threshold})`,
            });
          }
        }
      } else if (rule.type === 'negative_sentiment') {
        const row = db.prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN sentiment_label = 'negative' THEN 1 ELSE 0 END) as negative
          FROM mentions
          WHERE created_at >= datetime('now', ?)
        `).get(`-${rule.window_hours} hours`) as { total: number; negative: number };
        if (row.total > 0) {
          const ratio = (row.negative / row.total) * 100;
          if (ratio >= rule.threshold) {
            const recent = db.prepare(`
              SELECT id FROM alert_events
              WHERE rule_id = ? AND triggered_at >= datetime('now', ?)
            `).get(rule.id, `-${rule.window_hours} hours`);
            if (!recent) {
              createAlertEvent({
                rule_id: rule.id!,
                project_id: rule.project_id,
                value: ratio,
                message: `High negative sentiment: ${ratio.toFixed(1)}% of ${row.total} mentions in the last ${rule.window_hours}h (threshold: ${rule.threshold}%)`,
              });
            }
          }
        }
      }
    } catch {
      // Skip failed rule evaluations
    }
  }
}

