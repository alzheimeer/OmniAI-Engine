const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve('./content/database.sqlite');
try {
  const db = new Database(dbPath, { readonly: true });
  const stats = db.prepare('SELECT COUNT(*) as count, SUM(views) as totalViews, SUM(likes) as totalLikes, MIN(publishedAt) as firstVideoDate, MAX(publishedAt) as lastVideoDate FROM published_videos').get();
  console.log('--- STATS ---');
  console.log(stats);
} catch(e) {
  console.error('Error:', e.message);
}
