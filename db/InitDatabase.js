"use strict";

const sqlite3 = require("sqlite3").verbose();
const db = new sqlite3.Database("telegram-bot.db");

db.serialize(() => {
    const userColumns = [
        "user_telegram_id TEXT",
        // "user_mediawiki_username TEXT",
        // "user_oauth_key TEXT",
        // "user_oauth_secret TEXT",
        "user_language TEXT"
    ];
    const userColumnsClause = userColumns.join(", ");
    const userCreateStatement = `CREATE TABLE user (${userColumnsClause})`;

    db.run("DROP TABLE IF EXISTS user");

    db.run(userCreateStatement);
});

db.close();
