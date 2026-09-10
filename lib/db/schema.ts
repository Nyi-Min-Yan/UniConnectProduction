import Database from 'better-sqlite3';
import path from 'path';


const DB_PATH = path.join(process.cwd(), 'uniconnect.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    initializeDb(db);
  }
  return db;
}

function initializeDb(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      author_email TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_initials TEXT NOT NULL,
      author_role TEXT NOT NULL,
      content TEXT,
      image TEXT,
      images TEXT,
      video_url TEXT,
      tags TEXT DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'approved',
      ai_flags TEXT,
      moderation_note TEXT,
      moderated_at INTEGER,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER,
      likes_count INTEGER NOT NULL DEFAULT 0,
      comments_count INTEGER NOT NULL DEFAULT 0,
      shares_count INTEGER NOT NULL DEFAULT 0,
      item_status TEXT,
      item_location TEXT
    );
  `);

  // Migration: add moderated_at column if missing
  const cols = db.prepare("PRAGMA table_info(posts)").all() as { name: string }[];
  if (!cols.some(c => c.name === 'moderated_at')) {
    db.exec("ALTER TABLE posts ADD COLUMN moderated_at INTEGER");
  }

  // Migration: multi-image posts
  if (!cols.some(c => c.name === 'images')) {
    db.exec("ALTER TABLE posts ADD COLUMN images TEXT");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS post_likes (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(post_id, user_email),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS post_shares (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      sharer_email TEXT NOT NULL,
      sharer_name TEXT NOT NULL,
      recipients TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS post_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      author_email TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_initials TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER,
      deleted_at INTEGER,
      FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      author_email TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_initials TEXT NOT NULL,
      author_role TEXT NOT NULL,
      kind TEXT NOT NULL,
      caption TEXT,
      media_url TEXT,
      media_urls TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      likes_count INTEGER NOT NULL DEFAULT 0,
      comments_count INTEGER NOT NULL DEFAULT 0,
      shares_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS activity_likes (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(activity_id, user_email),
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_comments (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      author_email TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_initials TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER,
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS activity_shares (
      id TEXT PRIMARY KEY,
      activity_id TEXT NOT NULL,
      sharer_email TEXT NOT NULL,
      sharer_name TEXT NOT NULL,
      recipients TEXT DEFAULT '[]',
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY (activity_id) REFERENCES activities(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS conversations (
      id TEXT PRIMARY KEY,
      participant_ids TEXT NOT NULL DEFAULT '[]',
      status TEXT NOT NULL DEFAULT 'active',
      requested_by TEXT,
      blocked_by TEXT,
      participant_meta TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      last_message_at INTEGER NOT NULL DEFAULT (unixepoch()),
      preview TEXT,
      unread_map TEXT DEFAULT '{}',
      hidden_map TEXT DEFAULT '{}'
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      sender_id TEXT,
      recipient_id TEXT,
      recipient_email TEXT,
      sender_email TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      attachments TEXT,
      mentions TEXT,
      message_type TEXT NOT NULL DEFAULT 'text',
      file_url TEXT,
      file_name TEXT,
      roll_number TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      is_read INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS message_reads (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      reader_email TEXT NOT NULL,
      read_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(message_id, reader_email),
      FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
      FOREIGN KEY (message_id) REFERENCES chat_messages(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      recipient_email TEXT,
      recipient_role TEXT,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      read INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      post_id TEXT,
      activity_id TEXT,
      conversation_id TEXT,
      actor_email TEXT,
      actor_name TEXT
    );

    CREATE TABLE IF NOT EXISTS events (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      location TEXT,
      event_date INTEGER NOT NULL,
      category TEXT NOT NULL DEFAULT 'Other',
      max_attendees INTEGER,
      image_url TEXT,
      visibility TEXT NOT NULL DEFAULT 'public',
      created_by TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS event_registrations (
      id TEXT PRIMARY KEY,
      event_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      user_name TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      UNIQUE(event_id, user_email),
      FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_presence (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      last_seen INTEGER NOT NULL DEFAULT (unixepoch()),
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS exam_results (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      recipient_email TEXT NOT NULL,
      roll_number TEXT NOT NULL,
      year TEXT NOT NULL,
      semester TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      storage_path TEXT NOT NULL,
      created_at INTEGER NOT NULL DEFAULT (unixepoch()),
      batch_id TEXT,
      student_name TEXT,
      student_id TEXT
    );

    CREATE TABLE IF NOT EXISTS exam_result_batches (
      id TEXT PRIMARY KEY,
      exam_type TEXT NOT NULL,
      semester TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      total_files INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PUBLISHED',
      created_by TEXT,
      created_at INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_posts_status_created ON posts(status, created_at);
    CREATE INDEX IF NOT EXISTS idx_posts_author ON posts(author_email);
    CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes(post_id);
    CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes(user_email);
    CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments(post_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_activities_created ON activities(created_at);
    CREATE INDEX IF NOT EXISTS idx_activities_author ON activities(author_email);
    CREATE INDEX IF NOT EXISTS idx_activity_likes_activity ON activity_likes(activity_id);
    CREATE INDEX IF NOT EXISTS idx_activity_comments_activity ON activity_comments(activity_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_conversations_participants ON conversations(participant_ids);
    CREATE INDEX IF NOT EXISTS idx_conversations_last_message ON conversations(last_message_at);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_email);
    CREATE INDEX IF NOT EXISTS idx_message_reads_conversation ON message_reads(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_message_reads_message ON message_reads(message_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_email, created_at);
    CREATE INDEX IF NOT EXISTS idx_notifications_role ON notifications(recipient_role, created_at);
    CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
    CREATE INDEX IF NOT EXISTS idx_events_created_by ON events(created_by);
    CREATE INDEX IF NOT EXISTS idx_events_visibility ON events(visibility);
    CREATE INDEX IF NOT EXISTS idx_event_registrations_event ON event_registrations(event_id);
    CREATE INDEX IF NOT EXISTS idx_user_presence_email ON user_presence(email);
    CREATE INDEX IF NOT EXISTS idx_exam_results_recipient ON exam_results(recipient_email);
    CREATE INDEX IF NOT EXISTS idx_exam_results_batch ON exam_results(batch_id);
    CREATE INDEX IF NOT EXISTS idx_exam_results_roll ON exam_results(roll_number);
    CREATE INDEX IF NOT EXISTS idx_exam_result_batches_created ON exam_result_batches(created_at);
    CREATE INDEX IF NOT EXISTS idx_exam_result_batches_year ON exam_result_batches(academic_year);
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS profile_overrides (
      email TEXT PRIMARY KEY,
      name TEXT,
      phone TEXT,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch())
    );
  `);

  // Migration: multi-photo activities
  const acols = db.prepare("PRAGMA table_info(activities)").all() as { name: string }[];
  if (!acols.some(c => c.name === 'media_urls')) {
    db.exec("ALTER TABLE activities ADD COLUMN media_urls TEXT");
  }

  // Migration: event dates were once stored in seconds while the UI (and the
  // create form) uses milliseconds, so "upcoming" filters never matched and the
  // rendered dates were 1970. Convert any legacy second timestamps to ms.
  db.exec("UPDATE events SET event_date = event_date * 1000 WHERE event_date > 0 AND event_date < 100000000000");
}

export default getDb;
