/**
 * NearHelp — SQLite Database Bootstrap
 * All tables created here on first run.
 */

const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

const DB_PATH = path.join(__dirname, '..', 'nearhelp.db');
let db;

function getDB() {
  if (!db) db = new sqlite3.Database(DB_PATH);
  return db;
}

function initDB(callback) {
  db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) { console.error('DB connection error:', err); process.exit(1); }
    console.log('✅ SQLite connected →', DB_PATH);
  });

  db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON');

    // ── USERS ────────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT    NOT NULL,
      email         TEXT    UNIQUE,
      phone         TEXT    UNIQUE,
      password_hash TEXT    NOT NULL,
      age_group     TEXT    DEFAULT 'adult',   -- youth | adult | senior
      user_type     TEXT    DEFAULT 'general', -- general | student | provider | elderly | volunteer
      profile_pic   TEXT    DEFAULT '😊',
      bio           TEXT    DEFAULT '',
      interests     TEXT    DEFAULT '[]',      -- JSON array
      skills        TEXT    DEFAULT '[]',      -- JSON array
      status        TEXT    DEFAULT 'available', -- available | unavailable | at-work
      profile_theme TEXT    DEFAULT 'green',
      address       TEXT    DEFAULT '',
      pincode       TEXT    DEFAULT '',
      city          TEXT    DEFAULT '',
      latitude      REAL    DEFAULT 0,
      longitude     REAL    DEFAULT 0,
      aadhaar_verified INTEGER DEFAULT 0,
      rating_avg    REAL    DEFAULT 0,
      rating_count  INTEGER DEFAULT 0,
      near_points   INTEGER DEFAULT 0,
      dark_mode     INTEGER DEFAULT 0,
      elderly_mode  INTEGER DEFAULT 0,
      is_verified   INTEGER DEFAULT 0,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ── ITEMS (lend / borrow) ─────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS items (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_id    INTEGER NOT NULL REFERENCES users(id),
      title       TEXT    NOT NULL,
      description TEXT    DEFAULT '',
      category    TEXT    DEFAULT 'utility',  -- books | electrical | utility | other
      condition   TEXT    DEFAULT 'good',
      duration    TEXT    DEFAULT 'flexible',
      deposit     REAL    DEFAULT 0,
      image_url   TEXT    DEFAULT '',
      status      TEXT    DEFAULT 'available', -- available | borrowed | unavailable
      latitude    REAL    DEFAULT 0,
      longitude   REAL    DEFAULT 0,
      radius_km   REAL    DEFAULT 2,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ── SERVICES ──────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS services (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      provider_id   INTEGER NOT NULL REFERENCES users(id),
      type          TEXT    NOT NULL,  -- repair | tutoring | driving | cleaning | medical | grocery | other
      title         TEXT    NOT NULL,
      description   TEXT    DEFAULT '',
      availability  TEXT    DEFAULT '',
      is_paid       INTEGER DEFAULT 0,
      price         REAL    DEFAULT 0,
      latitude      REAL    DEFAULT 0,
      longitude     REAL    DEFAULT 0,
      radius_km     REAL    DEFAULT 2,
      status        TEXT    DEFAULT 'active', -- active | paused
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ── REQUESTS ──────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS requests (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      requester_id  INTEGER NOT NULL REFERENCES users(id),
      target_id     INTEGER REFERENCES users(id),  -- specific user or null (broadcast)
      item_id       INTEGER REFERENCES items(id),
      service_id    INTEGER REFERENCES services(id),
      type          TEXT    NOT NULL,  -- borrow | help | follow | service-availability
      message       TEXT    DEFAULT '',
      status        TEXT    DEFAULT 'pending', -- pending | accepted | declined | completed
      scheduled_at  DATETIME,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ── DRIVERS ───────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS drivers (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id         INTEGER NOT NULL REFERENCES users(id),
      vehicle_type    TEXT    DEFAULT 'car',  -- car | bike | auto | van
      experience_yrs  INTEGER DEFAULT 0,
      is_police_verified INTEGER DEFAULT 0,
      is_aadhaar_linked  INTEGER DEFAULT 0,
      background_check   INTEGER DEFAULT 0,
      specialization  TEXT    DEFAULT '',  -- hospital | airport | general
      available       INTEGER DEFAULT 1,
      rating_avg      REAL    DEFAULT 0,
      trip_count      INTEGER DEFAULT 0,
      created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ── CHAT MESSAGES ─────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS messages (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      sender_id   INTEGER NOT NULL REFERENCES users(id),
      receiver_id INTEGER NOT NULL REFERENCES users(id),
      content     TEXT    NOT NULL,
      is_read     INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ── REVIEWS ───────────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS reviews (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      reviewer_id INTEGER NOT NULL REFERENCES users(id),
      reviewed_id INTEGER NOT NULL REFERENCES users(id),
      request_id  INTEGER REFERENCES requests(id),
      rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      feedback    TEXT    DEFAULT '',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ── REWARDS / POINTS ──────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS rewards (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      action      TEXT    NOT NULL,  -- help_given | item_lent | review_received | etc.
      points      INTEGER DEFAULT 0,
      description TEXT    DEFAULT '',
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ── NOTIFICATIONS ─────────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS notifications (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      type        TEXT    NOT NULL,  -- emergency | request | chat | reward | system
      title       TEXT    NOT NULL,
      body        TEXT    DEFAULT '',
      is_read     INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    // ── EMERGENCY ALERTS ──────────────────────────────────
    db.run(`CREATE TABLE IF NOT EXISTS emergency_alerts (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL REFERENCES users(id),
      latitude    REAL    DEFAULT 0,
      longitude   REAL    DEFAULT 0,
      message     TEXT    DEFAULT 'I need help!',
      resolved    INTEGER DEFAULT 0,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
      console.log('✅ All tables ready');
      if (callback) callback();
    });
  });
}

module.exports = { getDB, initDB };
