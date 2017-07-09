## Coding conventions

Use the MediaWiki JavaScript coding conventions for Node.js.
eslint is configured the same way as the Wikimedia node services.

### Identifier disambiguation

Since Telegram and MediaWiki have a lot of overlapping terminology, always make it explicit in the variable names, comments, etc., that you add, to which side do you refer when you talk about any of these:

- bot
- token
- message

Use "tg" and "mw" if you need short prefixes.

### Other terminology

- In-memory, in-process storage is **cache**. Items are **cached** there.
- Persistent storage is **database**. Items are **stored** there.
- The bot **sends** messages to the user.
- The user **submits** translations.
