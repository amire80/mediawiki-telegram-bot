var TelegramBot = require( 'node-telegram-bot-api' );
var request = require( 'request' ).defaults( {
    jar: true
} );
var yaml = require( 'js-yaml' );
var fs = require( 'fs' );

var mwApi = require('./MediaWikiAPI.js');

var mode = 'fetching';
var apiUrl = 'https://translatewiki.net/w/api.php';

var userStatus = {};
var currentMwMessageIndex = 0;

var config;

var debug = function ( fromId, info ) {
    if ( !config.debugLevel ) {
        return;
    }

    tgBot.sendMessage( fromId, info );
};

var getCurrentMwMessage = function ( userID ) {
    // It will short circuit if you don't check that the object exists
    if ( !Object.keys(userStatus).length || userStatus[userID].currentMwMessageIndex > userStatus[userID].messages.length ) {
        userStatus[userID].currentMwMessageIndex = 0;
        userStatus[userID].messages = [];
        mode = 'fetching';
        return null;
    }

    return userStatus[userID].messages[userStatus[userID].currentMwMessageIndex];
};

// Get document, or throw exception on error
try {
    config = yaml.safeLoad( fs.readFileSync(
        __dirname + '/config.yaml', 'utf8'
    ) );
} catch ( e ) {
    console.log( e );
}

var tgBot = new TelegramBot( config.token, { polling: true } );

// Matches /echo [whatever]
tgBot.onText( /\/echo (.+)/, function ( msg, match ) {
    var userID = msg.from.id,
        resp = match[1];

    console.log( msg );

    tgBot.sendMessage( userID, resp );
} );

// Matches /setlanguage
tgBot.onText( /^\/setlanguage ?(.*)/, function ( msg, match ) {
    var userID = msg.from.id,
        newLanguageCode = match[1];

    debug( userID, "newLanguageCode is " + newLanguageCode );

    if ( newLanguageCode === '' ) {
        tgBot.sendMessage( userID, "The current language code is " +
            getLanguageCode( userID )
        );

        return;
    }

    setLanguageCode( userID, newLanguageCode );
} );

var getLanguageCode = function ( userID ) {
    var languageCode;

    if ( userStatus[userID] === undefined ) {
        userStatus[userID] = {};

        return '';
    }

    languageCode = userStatus[userID].languageCode;

    return languageCode;
};

var setLanguageCode = function ( userID, newLanguageCode ) {
    debug( userID, "in setLanguageCode(), setting to " +
        newLanguageCode
    );

    if ( userStatus[userID] === undefined ) {
        userStatus[userID] = {};
    }

    userStatus[userID].languageCode = newLanguageCode;
    userStatus[userID].currentMwMessageIndex = 0;
    userStatus[userID].messages = [];

    tgBot.sendMessage( userID, "Set the language code to " + newLanguageCode );
};

// Matches /untranslated
tgBot.onText( /\/untranslated/, function ( msg, match ) {
    var newLanguageCode,
        userID = msg.from.id,
        languageCode = getLanguageCode( userID );

    if ( languageCode === undefined ) {
        languageCode = msg.from.language_code;
        tgBot.sendMessage( userID, "Automatically setting language code to " +
            languageCode +
            ". To change your language, use the /setlanguage command" );
        setLanguageCode( userID, languageCode )
    }

    debug( userID, 'in onText untranslated' );

    mwApi.getUntranslatedMessages( languageCode, messageCollection => {
        var currentMwMessage;

        debug( userID, 'in getUntranslatedMessages' );

        if ( userStatus[userID] === undefined ) {
            userStatus[userID] = {};
        }

        userStatus[userID].messages = messageCollection.filter( function ( mwMessageData ) {
            // TODO: The Telegram hard limit is 4096, so we must skip them.
            // Ideally it should be configurable.
            return mwMessageData.definition.length < 1000; // TODO: Make configurable
        } );

        userStatus[userID].currentMwMessageIndex = 0;

        debug( userID, 'received messageCollection ' + JSON.stringify(
            userStatus[userID].messages,
            null,
            2
        ) );

        debug( userID, 'Fetched ' +
            userStatus[userID].messages.length + ' untranslated messages'
        );

        if ( userStatus[userID]['messages'].length ) {
            tgBot.sendMessage( userID, 'Try to translate some!' );
            tgBot.sendMessage( userID, getCurrentMwMessage( userID ).definition );
            mode = 'translation';
        } else {
            tgBot.sendMessage( userID, 'Nothing to translate!' );
        }
    });
});

// Matches anything without a slash in the beginning
tgBot.onText( /^([^\/].*)/, function ( msg, match ) {
    var userID = msg.from.id,
        chatMessage = match[1];

    var targetTranslatableMessage = getCurrentMwMessage( userID );

    if ( mode !== 'translation' ||
        targetTranslatableMessage === null
    ) {
        return;
    }

    debug( userID, 'Got translation "' + chatMessage + '", getting token' );

    mwApi.login(config.username, config.password, () => {
        mwApi.addTranslation(
            getCurrentMwMessage( userID ).title,
            chatMessage,
            'Made with Telegram Bot',
            () => {
                debug( userID, 'Translation published' );

                userStatus[userID].currentMwMessageIndex++;
                var nextMwMessage = getCurrentMwMessage( userID );

                if ( nextMwMessage ) {
                    tgBot.sendMessage(
                        userID,
                        nextMwMessage.definition
                    );
                }
            }
        )
    });
} );
