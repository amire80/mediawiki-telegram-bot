"use strict";

const TelegramBot = require("tgfancy");

const jsonfile = require("jsonfile");
const i18nCache = {};

const mwApi = require("./MediaWikiAPI.js");

const userStatus = {};

const FETCHING_MODE = "fetching";
const TRANSLATING_MODE = "translating";

const callbackPrefixes = {
    LOAD_UNTRANSLATED: "load",
    DOCUMENTATION: "qqq",
    TRANSLATION_MEMORY: "ttm"
};

const callbackActionsKeys = Object.keys(callbackPrefixes);
const callbackActions = {};
for (let i = 0; i < callbackActionsKeys.length; i++) {
    callbackActions[callbackPrefixes[callbackActionsKeys[i]]] = callbackActionsKeys[i];
}

console.log(callbackActions);

function callbackString(action, params) {
    const json = { action, params };
    return JSON.stringify(json);
}

function inlineKeyboardButton(text, action, params) {
    return [{ text, callback_data: callbackString(action, params) }];
}

let config;

try {
    config = jsonfile.readFileSync("config.json");
} catch (e) {
    console.log(e);
}

const tgBot = new TelegramBot(config.token, { polling: true });

function debug(fromId, info, levelRequired) {
    if (config.debugLevel < levelRequired) {
        return;
    }

    tgBot.sendMessage(fromId, info);
}

const REDIRECT_LANGUAGES = {
    "en-us": "en",
    "iw-il": "he",
    "iw": "he"
};

function normalizeLanguageCode(code) {
    const lower = code.toLowerCase();

    return REDIRECT_LANGUAGES[lower] || lower;
}

function initUser(userID) {
    userStatus[userID] = {
        languageCode: "",
        currentMwMessageIndex: 0,
        mwmessages: []
    };
}

function getUser(userID) {
    if (userStatus[userID] === undefined) {
        initUser(userID);
    }

    return userStatus[userID];
}

// Returns true if the parameter contains
// a string that can be sent to Telegram.
function validTgMessage(tgMsg) {
    return (typeof tgMsg === "string") &&
        // Telegram messages cannot be empty strings
        (tgMsg !== "") &&
        // The Telegram length hard limit is 4096
        (tgMsg.length < 4096);
}

// TODO: Should be much, much more deatiled.
// For now only checks that it's a string and it's not empty defined.
function validLanguageCode(languageCode) {
    return (typeof languageCode === "string") && (languageCode !== "");
}

function getLanguageCode(userID) {
    return getUser(userID).languageCode;
}

function setLanguageCode(userID, newLanguageCode) {
    const user = getUser(userID);

    debug(
        userID,
        `in setLanguageCode(), got ${newLanguageCode}`,
        2
    );

    newLanguageCode = normalizeLanguageCode(newLanguageCode);

    debug(
        userID,
        `in setLanguageCode(), setting to ${newLanguageCode}`,
        2
    );

    user.mode = FETCHING_MODE;
    user.languageCode = newLanguageCode;
    user.currentMwMessageIndex = 0;
    user.mwmessages = [];
}

// TODO: Replace with something like jquery.i18n
function i18n(language, key) {
    if (language === undefined) {
        language = "en";
    }

    if (i18nCache[language] === undefined) {
        try {
            i18nCache[language] = jsonfile.readFileSync(`i18n/${language}.json`);
        } catch (e) {
            console.log(e);
            i18nCache[language] = {};
        }
    }

    if (typeof i18nCache[language][key] !== "string") {
        if (language === "en") {
            // Give up
            return `<${key}>`;
        }

        // Fallback
        return i18n("en", key);
    }

    return i18nCache[language][key];
}

function getCurrentMwMessage(userID) {
    const user = getUser(userID);

    if (user.currentMwMessageIndex > user.mwmessages.length) {
        user.currentMwMessageIndex = 0;
        user.mwmessages = [];
        user.mode = FETCHING_MODE;

        return null;
    }

    return user.mwmessages[user.currentMwMessageIndex];
}

function showDocumentation(userID) {
    const targetMwMessage = getCurrentMwMessage(userID);
    const user = getUser(userID);

    if (user.mode !== TRANSLATING_MODE ||
        targetMwMessage === null
    ) {
        return;
    }

    const title = targetMwMessage.title;
    debug(userID, `Getting qqq for "${title}"`, 1);

    mwApi.getDocumentation(title, (documentation) => {
        tgBot.sendMessage(
            userID,
            documentation
        );
    });
}

function showTranslationMemory(userID) {
    const targetMwMessage = getCurrentMwMessage(userID);
    const user = getUser(userID);

    if (user.mode !== TRANSLATING_MODE ||
        targetMwMessage === null
    ) {
        return;
    }

    const title = targetMwMessage.title;
    debug(userID, `Getting translation memory for "${title}"`, 1);

    mwApi.getTranslationMemory(title, (translationMemory) => {
        let i;

        debug(userID, "in getTranslationMemory's callback", 1);

        if (translationMemory.length === 0) {
            tgBot.sendMessage(userID, `No translation memory was found for "${title}"`);

            return;
        }

        for (i = 0; i < translationMemory.length; i++) {
            tgBot.sendMessage(
                userID,
                translationMemory[i].target
            );
        }
    });
}

function showCurrentMwMessage(userID) {
    const targetMwMessage = getCurrentMwMessage(userID);

    if (targetMwMessage === undefined) {
        // TODO: Show the welcome menu instead
        return;
    }

    console.log(targetMwMessage);

    mwApi.getTranslationMemory(targetMwMessage.title, (translationMemory) => {
        targetMwMessage.translationMemory = translationMemory;

        debug(userID, "in getTranslationMemory's callback", 1);

        if (targetMwMessage.translationMemory.length === 0) {
            console.log(
                userID,
                `No translation memory was found for "${targetMwMessage.title}"`
            );
        }

        const inlineKeyboard = [];

        inlineKeyboard.push(inlineKeyboardButton(
            i18n(getLanguageCode(userID), "tgbot-get-documentation"),
            callbackPrefixes.DOCUMENTATION
        ));

        if (targetMwMessage.translationMemory.length) {
            inlineKeyboard.push(inlineKeyboardButton(
                i18n(getLanguageCode(userID), "tgbot-show-translations-of-similar"),
                callbackPrefixes.TRANSLATION_MEMORY
            ));
        }

        const tgMsgOptions = {
            reply_markup: JSON.stringify({
                inline_keyboard: inlineKeyboard
            })
        };

        tgBot.sendMessage(
            userID,
            targetMwMessage.definition,
            tgMsgOptions
        );

        if (targetMwMessage.translation !== null) {
            tgBot.sendMessage(
                userID,
                i18n(getLanguageCode(userID), "tgbot-the-current-translation-is")
            );
            tgBot.sendMessage(userID, targetMwMessage.translation);
        }
        const user = getUser(userID);
        user.mode = TRANSLATING_MODE;
    });
}

// Automatically sets the language code from the language
// of the chat message.
// Returns false if the language in the message was not valid,
// true otherwise.
function autoSetLanguage(tgMsg) {
    const userID = tgMsg.from.id;
    const newLanguageCode = normalizeLanguageCode(tgMsg.from.language_code);

    if (!validLanguageCode(newLanguageCode)) {
        tgBot.sendMessage(
            userID,
            `Your auto-detected language code is "${newLanguageCode}". It is not valid.`
        );

        return false;
    }

    tgBot.sendMessage(
        userID,
        i18n(newLanguageCode, "tgbot-automatically-setting-your-language")
    );

    tgBot.sendMessage(
        userID,
        newLanguageCode
    );

    tgBot.sendMessage(
        userID,
        i18n(newLanguageCode, "tgbot-to-change-your-language")
    );

    setLanguageCode(userID, newLanguageCode);

    return true;
}

function showUntranslated(tgMsg) {
    const userID = tgMsg.from.id;
    const languageCode = getLanguageCode(userID);

    debug(userID, "in onText untranslated", 1);

    if (!validLanguageCode(languageCode)) {
        if (!autoSetLanguage(tgMsg)) {
            return;
        }
    }

    mwApi.getUntranslatedMessages(languageCode, (mwMessageCollection) => {
        const user = getUser(userID);

        user.mwmessages = mwMessageCollection.filter((mwMessageData) => {
            return validTgMessage(mwMessageData.definition);
        });

        user.currentMwMessageIndex = 0;

        debug(
            userID,
            `got mwMessageCollection: ${JSON.stringify(user.mwmessages, null, 2)}`,
            2
        );

        debug(
            userID,
            `Fetched ${user.mwmessages.length} untranslated messages`,
            1
        );

        if (user.mwmessages.length) {
            showCurrentMwMessage(userID);
        } else {
            tgBot.sendMessage(userID, "Nothing to translate!");
        }
    });
}

function publishTranslation(userID, text) {
    const targetMwMessage = getCurrentMwMessage(userID);
    const user = getUser(userID);

    if (user.mode !== TRANSLATING_MODE ||
        targetMwMessage === null
    ) {
        return;
    }

    debug(userID, `Got translation "${text}", getting token`, 1);

    mwApi.login(config.username, config.password, () => {
        mwApi.addTranslation(
            getCurrentMwMessage(userID).title,
            text,
            "Made with Telegram Bot",
            () => {
                debug(userID, "Translation published", 1);

                user.currentMwMessageIndex++;

                showCurrentMwMessage(userID);
            }
        );
    });
}

// Matches /echo [whatever].
// Just for testing. Shoudl be removed some day.
tgBot.onText(/\/echo (.+)/, (tgMsg, match) => {
    const resp = match[1];
    const userID = tgMsg.from.id;

    console.log(tgMsg);

    tgBot.sendMessage(userID, resp);
});

// Matches /setlanguage
tgBot.onText(/^\/setlanguage ?(.*)/, (tgMsg, match) => {
    const newLanguageCode = match[1];
    const userID = tgMsg.from.id;

    if (newLanguageCode === undefined || newLanguageCode === "") {
        const user = getUser(userID);
        tgBot.sendMessage(userID, i18n(user.language, "tgbot-your-language-is"));
        tgBot.sendMessage(userID, user.languageCode);

        return;
    }

    console.log(`in setlanguage. The user asked to change to ${newLanguageCode}.`);
    console.log("Received Telegram message:");
    console.log(tgMsg);

    const normalized = normalizeLanguageCode(newLanguageCode);
    if (normalized !== newLanguageCode) {
        console.log(`The normalized code is ${normalized}.`);
    }

    setLanguageCode(userID, normalized);
});

function documentationCallback(tgMsg) {
    showDocumentation(tgMsg.from.id);
}

function translationMemoryCallback(tgMsg) {
    showTranslationMemory(tgMsg.from.id);
}

function loadMessagesCallback(tgMsg) {
    showUntranslated(tgMsg);
}

const callbackFunctions = {
    LOAD_UNTRANSLATED: loadMessagesCallback,
    DOCUMENTATION: documentationCallback,
    TRANSLATION_MEMORY: translationMemoryCallback
};

tgBot.on("callback_query", (tgMsg) => {
    console.log("callback_query got tgMsg:");
    console.log(tgMsg);

    const callbackData = JSON.parse(tgMsg.data);

    console.log("Parsed callback data:");
    console.log(callbackData);

    callbackFunctions[callbackActions[callbackData.action]].call(null, tgMsg);
});

// Matches /untranslated
tgBot.onText(/\/untranslated/, (tgMsg, match) => {
    showUntranslated(tgMsg);
});

// Matches /qqq
tgBot.onText(/\/qqq/, (tgMsg, match) => {
    showDocumentation(tgMsg.from.id);
});

// Matches /ttm
tgBot.onText(/\/ttm/, (tgMsg, match) => {
    showTranslationMemory(tgMsg.from.id);
});

// Matches anything without a slash in the beginning
tgBot.onText(/^([^\/].*)/, (tgMsg, match) => {
    const userID = tgMsg.from.id;
    const user = getUser(userID);
    const tgMessage = match[1];
    const targetMwMessage = getCurrentMwMessage(userID);

    if (user.mode === TRANSLATING_MODE &&
        targetMwMessage !== null
    ) {
        publishTranslation(userID, tgMessage);

        return;
    }

    let languageCode = getLanguageCode(userID);
    if (!validLanguageCode(languageCode)) {
        if (!autoSetLanguage(tgMsg)) {
            return;
        }

        languageCode = getLanguageCode(userID);
    }

    const inlineKeyboard = [inlineKeyboardButton(
        i18n(languageCode, "tgbot-load-messages"),
        callbackPrefixes.LOAD_UNTRANSLATED
    )];

    const tgMsgOptions = {
        reply_markup: JSON.stringify({
            inline_keyboard: inlineKeyboard
        })
    };

    tgBot.sendMessage(
        userID,
        i18n(languageCode, "tgbot-what-would-you-like-prompt"),
        tgMsgOptions
    );
});
