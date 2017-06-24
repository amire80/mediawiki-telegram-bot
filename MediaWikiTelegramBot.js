"use strict";

const TelegramBot = require("tgfancy");

const jsonfile = require("jsonfile");
const i18nCache = {};

const mwApi = require("./MediaWikiAPI.js");

const userStatus = {};

const FETCHING_MODE = "fetching";
const TRANSLATING_MODE = "translating";

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

function getLanguageCode(userID) {
    if (userStatus[userID] === undefined) {
        userStatus[userID] = {};

        return "";
    }

    return userStatus[userID].languageCode;
}

function setLanguageCode(userID, newLanguageCode) {
    debug(
        userID,
        `in setLanguageCode(), setting to ${newLanguageCode}`,
        1
    );

    if (userStatus[userID] === undefined) {
        userStatus[userID] = {};
    }

    userStatus[userID].languageCode = newLanguageCode;
    userStatus[userID].currentMwMessageIndex = 0;
    userStatus[userID].mwmessages = [];

    tgBot.sendMessage(userID, `Set the language code to ${newLanguageCode}`);
}

// TODO: Replace with something like jquery.i18n
function i18n(language, key) {
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
            return key;
        }

        // Fallback
        return i18n("en", key);
    }

    return i18nCache[language][key];
}

function getCurrentMwMessage(userID) {
    // It will short circuit if you don't check that the object exists
    if (!Object.keys(userStatus).length ||
        userStatus[userID].currentMwMessageIndex > userStatus[userID].mwmessages.length
    ) {
        userStatus[userID].currentMwMessageIndex = 0;
        userStatus[userID].mwmessages = [];
        userStatus[userID].mode = FETCHING_MODE;
        return null;
    }

    return userStatus[userID].mwmessages[userStatus[userID].currentMwMessageIndex];
}

function showDocumentation(userID) {
    const targetMwMessage = getCurrentMwMessage(userID);

    if (userStatus[userID].mode !== TRANSLATING_MODE ||
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

    if (userStatus[userID].mode !== TRANSLATING_MODE ||
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

function showNextMwMessage(userID) {
    const currentMwMessage = getCurrentMwMessage(userID);

    if (currentMwMessage === undefined) {
        // TODO: Show the welcome menu instead
        return;
    }

    console.log(currentMwMessage);

    mwApi.getTranslationMemory(currentMwMessage.title, (translationMemory) => {
        let i;

        currentMwMessage.translationMemory = translationMemory;

        debug(userID, "in getTranslationMemory's callback", 1);

        if (currentMwMessage.translationMemory.length === 0) {
            console.log(
                userID,
                `No translation memory was found for "${currentMwMessage.title}"`
            );
        }

        const inlineKeyboard = [
            [{
                text: i18n(getLanguageCode(userID), "tgbot-get-documentation"),
                callback_data: "qqq"
            }]
        ];

        for (i = 0; i < currentMwMessage.translationMemory.length; i++) {
            inlineKeyboard.push([{
                text: currentMwMessage.translationMemory[i].target,
                callback_data: `ttm${i}`
            }]);
        }

        const tgMsgOptions = {
            reply_markup: JSON.stringify({
                inline_keyboard: inlineKeyboard
            })
        };

        tgBot.sendMessage(
            userID,
            currentMwMessage.definition,
            tgMsgOptions
        );

        if (currentMwMessage.translation !== null) {
            tgBot.sendMessage(
                userID,
                i18n(getLanguageCode(userID), "tgbot-the-current-translation-is")
            );
            tgBot.sendMessage(userID, currentMwMessage.translation);
        }
        userStatus[userID].mode = TRANSLATING_MODE;
    });
}

function publishTranslation(userID, text) {
    const targetMwMessage = getCurrentMwMessage(userID);

    if (userStatus[userID].mode !== TRANSLATING_MODE ||
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

                userStatus[userID].currentMwMessageIndex++;

                showNextMwMessage(userID);
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

// Returns true if the parameter contains
// a string that can be sent to Telegram.
function validTgMessage(tgMessage) {
    return (typeof tgMessage === "string") &&
        // Telegram messages cannot be empty strings
        (tgMessage !== "") &&
        // The Telegram length hard limit is 4096
        (tgMessage.length < 4096);
}

// Matches /setlanguage
tgBot.onText(/^\/setlanguage ?(.*)/, (tgMsg, match) => {
    const newLanguageCode = match[1];
    const userID = tgMsg.from.id;

    console.log(`setlanguage. newLanguageCode is ${newLanguageCode}`);
    console.log(tgMsg);

    debug(
        userID,
        `newLanguageCode is ${newLanguageCode}`,
        1
    );

    if (newLanguageCode === "") {
        tgBot.sendMessage(userID, `The current language code is ${
            getLanguageCode(userID)}`
        );

        return;
    }

    setLanguageCode(userID, newLanguageCode);
});

// TODO: Should be much, much more deatiled.
// For now only checks that it's a string and it's not empty defined.
function validLanguageCode(languageCode) {
    return (typeof languageCode === "string") && (languageCode !== "");
}

tgBot.on("callback_query", (tgMsg) => {
    const userID = tgMsg.from.id;

    console.log("callback_query got tgMsg:");
    console.log(tgMsg);

    if (tgMsg.data === "qqq") {
        showDocumentation(tgMsg.from.id);

        return;
    }

    const ttm = tgMsg.data.match(/^ttm(\d+)/);
    if (ttm !== null) {
        publishTranslation(
            userID,
            getCurrentMwMessage(userID).translationMemory[ttm[1]].target
        );

        return;
    }
});

// Matches /untranslated
tgBot.onText(/\/untranslated/, (tgMsg, match) => {
    const userID = tgMsg.from.id;
    let languageCode = getLanguageCode(userID);

    if (!validLanguageCode(languageCode)) {
        languageCode = tgMsg.from.language_code;
        tgBot.sendMessage(userID, `Automatically setting language code to ${
            languageCode
            }. To change your language, use the /setlanguage command`);

        setLanguageCode(userID, languageCode);
    }

    debug(userID, "in onText untranslated", 1);

    if (!validLanguageCode(languageCode)) {
        tgBot.sendMessage(
            userID,
            `your language code is "${languageCode}" and it is not valid.`
        );

        return;
    }

    mwApi.getUntranslatedMessages(languageCode, (mwMessageCollection) => {
        if (userStatus[userID] === undefined) {
            userStatus[userID] = {};
        }

        userStatus[userID].mwmessages = mwMessageCollection.filter((mwMessageData) => {
            return validTgMessage(mwMessageData.definition);
        });

        userStatus[userID].currentMwMessageIndex = 0;

        debug(
            userID,
            `got mwMessageCollection: ${JSON.stringify(userStatus[userID].mwmessages, null, 2)}`,
            2
        );

        debug(
            userID,
            `Fetched ${userStatus[userID].mwmessages.length} untranslated messages`,
            1
        );

        if (userStatus[userID].mwmessages.length) {
            showNextMwMessage(userID);
        } else {
            tgBot.sendMessage(userID, "Nothing to translate!");
        }
    });
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
    const tgMessage = match[1];
    const targetMwMessage = getCurrentMwMessage(userID);

    if (userStatus[userID].mode !== TRANSLATING_MODE ||
        targetMwMessage === null
    ) {
        return;
    }

    publishTranslation(userID, tgMessage);
});
