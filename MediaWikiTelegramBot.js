'use strict';

const TelegramBot = require('tgfancy');
const yaml = require('js-yaml');
const fs = require('fs');

const mwApi = require('./MediaWikiAPI.js');

let mode = 'fetching';

const userStatus = {};

let config;

// Get document, or throw exception on error
try {
    config = yaml.safeLoad(fs.readFileSync(
        'config.yaml', 'utf8'
    ));
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

function getCurrentMwMessage(userID) {
    // It will short circuit if you don't check that the object exists
    if (!Object.keys(userStatus).length ||
        userStatus[userID].currentMwMessageIndex > userStatus[userID].messages.length
    ) {
        userStatus[userID].currentMwMessageIndex = 0;
        userStatus[userID].messages = [];
        mode = 'fetching';
        return null;
    }

    return userStatus[userID].messages[userStatus[userID].currentMwMessageIndex];
}

// Matches /echo [whatever]
tgBot.onText(/\/echo (.+)/, (msg, match) => {
    const resp = match[1];
    const userID = msg.from.id;

    console.log(msg);

    tgBot.sendMessage(userID, resp);
});

// Returns true if the parameter contains
// a string that can be sent to Telegram.
function validTgMessage(tgMessage) {
    return (typeof tgMessage === 'string') &&
        // Telegram messages cannot be empty strings
        (tgMessage !== '') &&
        // The Telegram length hard limit is 4096
        (tgMessage.length < 4096);
}

function getLanguageCode(userID) {
    if (userStatus[userID] === undefined) {
        userStatus[userID] = {};

        return '';
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
    userStatus[userID].messages = [];

    tgBot.sendMessage(userID, `Set the language code to ${newLanguageCode}`);
}

// Matches /setlanguage
tgBot.onText(/^\/setlanguage ?(.*)/, (msg, match) => {
    const newLanguageCode = match[1];
    const userID = msg.from.id;

    debug(
        userID,
        `newLanguageCode is ${newLanguageCode}`,
        1
    );

    if (newLanguageCode === '') {
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
    return (typeof languageCode === 'string') && (languageCode !== '');
}

// Matches /untranslated
tgBot.onText(/\/untranslated/, (msg, match) => {
    const userID = msg.from.id;
    let languageCode = getLanguageCode(userID);

    if (!validLanguageCode(languageCode)) {
        languageCode = msg.from.language_code;
        tgBot.sendMessage(userID, `Automatically setting language code to ${
            languageCode
            }. To change your language, use the /setlanguage command`);

        setLanguageCode(userID, languageCode);
    }

    debug(userID, 'in onText untranslated', 1);

    if (!validLanguageCode(languageCode)) {
        tgBot.sendMessage(
            userID,
            `your language code is "${languageCode}" and it is not valid.`
        );

        return;
    }

    mwApi.getUntranslatedMessages(languageCode, (messageCollection) => {
        let currentMwMessage;

        debug(userID, 'in getUntranslatedMessages', 1);

        if (userStatus[userID] === undefined) {
            userStatus[userID] = {};
        }

        userStatus[userID].messages = messageCollection.filter((mwMessageData) => {
            return validTgMessage(mwMessageData.definition);
        });

        userStatus[userID].currentMwMessageIndex = 0;

        debug(
            userID,
            `got messageCollection: ${JSON.stringify(userStatus[userID].messages, null, 2)}`,
            2
        );

        debug(
            userID,
            `Fetched ${userStatus[userID].messages.length} untranslated messages`,
            1
        );

        if (userStatus[userID].messages.length) {
            currentMwMessage = getCurrentMwMessage(userID);
            console.log(currentMwMessage);
            tgBot.sendMessage(userID, currentMwMessage.definition);
            if (currentMwMessage.translation !== null) {
                tgBot.sendMessage(userID, 'the current translation is:');
                tgBot.sendMessage(userID, `"${currentMwMessage.translation}"`);
            }
            mode = 'translation';
        } else {
            tgBot.sendMessage(userID, 'Nothing to translate!');
        }
    });
});

// Matches /qqq
tgBot.onText(/\/qqq/, (msg, match) => {
    const userID = msg.from.id;
    const targetTranslatableMessage = getCurrentMwMessage(userID);

    if (mode !== 'translation' ||
        targetTranslatableMessage === null
    ) {
        return;
    }

    const title = targetTranslatableMessage.title;
    debug(userID, `Getting qqq for "${title}"`, 1);

    mwApi.getDocumentation(title, (documentation) => {
        debug(userID, 'in getDocumentation\'s callback', 1);

        console.log(documentation);

        tgBot.sendMessage(
            userID,
            documentation
        );
    });
});

// Matches /ttm
tgBot.onText(/\/ttm/, (msg, match) => {
    const userID = msg.from.id;
    const targetTranslatableMessage = getCurrentMwMessage(userID);

    if (mode !== 'translation' ||
        targetTranslatableMessage === null
    ) {
        return;
    }

    const title = targetTranslatableMessage.title;
    debug(userID, `Getting translation memory for "${title}"`, 1);

    mwApi.getTranslationMemory(title, (translationMemory) => {
        let i;

        debug(userID, 'in getTranslationMemory\'s callback', 1);

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
});

// Matches anything without a slash in the beginning
tgBot.onText(/^([^\/].*)/, (msg, match) => {
    const chatMessage = match[1];
    const userID = msg.from.id;
    const targetTranslatableMessage = getCurrentMwMessage(userID);

    if (mode !== 'translation' ||
        targetTranslatableMessage === null
    ) {
        return;
    }

    debug(userID, `Got translation "${chatMessage}", getting token`, 1);

    mwApi.login(config.username, config.password, () => {
        mwApi.addTranslation(
            getCurrentMwMessage(userID).title,
            chatMessage,
            'Made with Telegram Bot',
            () => {
                debug(userID, 'Translation published', 1);

                userStatus[userID].currentMwMessageIndex++;
                const nextMwMessage = getCurrentMwMessage(userID);

                if (nextMwMessage) {
                    tgBot.sendMessage(
                        userID,
                        nextMwMessage.definition
                    );
                    if (nextMwMessage.translation !== null) {
                        tgBot.sendMessage(userID, 'the current translation is:');
                        tgBot.sendMessage(userID, `"${nextMwMessage.translation}"`);
                    }
                }
            }
        );
    });
});
