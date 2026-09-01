const Database = require('better-sqlite3');
const path = require('path');
const dbPath = path.resolve('./content/database.sqlite');
try {
  const db = new Database(dbPath, { readonly: true });
  const schema = db.prepare("SELECT name, sql FROM sqlite_master WHERE type='table'").all();
  console.log('--- SCHEMA ---');
  console.log(schema);
  
  if (schema.find(s => s.name === 'published_videos')) {
    const allVideos = db.prepare('SELECT * FROM published_videos').all();
    console.log('--- ALL VIDEOS ---');
    console.log(allVideos);
  } else {
    console.log('No published_videos table found.');
  }
} catch(e) {
  console.error('Error:', e.message);
}
