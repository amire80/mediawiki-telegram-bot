Use the MediaWiki JavaScript coding conventions for Node.js. eslint is configured the same way as the Wikimedia node services.

In addition, since Telegram and MediaWiki have a lot of overlapping terminology, always make it explicit in the variable names, comments, etc., that you add, to which side do you refer when you talk about any of these:

    bot
    token
    message

Use "tg" and "mw" if you need short prefixes.

