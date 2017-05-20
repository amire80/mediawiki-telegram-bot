var TelegramBot = require( 'node-telegram-bot-api' );
var request = require( 'request' ).defaults( {
    jar: true
} );
var yaml = require( 'js-yaml' );
var fs = require( 'fs' );

var mwApi = require('./MediaWikiAPI.js');

var mode = 'fetching';
var apiUrl = 'https://translatewiki.net/w/api.php';

var debugLevel = 1;

var mwMessageCollection = {};
var currentMwMessageIndex = 0;

var debug = function ( fromId, info ) {
    if ( !debugLevel ) {
        return;
    }

    tgBot.sendMessage( fromId, info );
};

var getCurrentMwMessage = function ( userID ) {
    // It will short circuit if you don't check that the object exists
    if ( !Object.keys(mwMessageCollection).length || mwMessageCollection[userID]['currentMwMessageIndex'] > mwMessageCollection[userID]['messages'].length ) {
        mwMessageCollection[userID]['currentMwMessageIndex'] = 0;
        mwMessageCollection[userID]['messages'] = [];
        mode = 'fetching';
        return null;
    }

    return mwMessageCollection[userID]['messages'][mwMessageCollection[userID]['currentMwMessageIndex']];
};

var config;

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

    tgBot.sendMessage( userID, resp );
} );

// Matches /untranslated
tgBot.onText( /\/untranslated/, function ( msg, match ) {
    var userID = msg.from.id,
        languageCode = "vi"; // XXX

    debug( userID, 'in onText untranslated' );

    mwApi.getUntranslatedMessages( languageCode, messageCollection => {
        debug( userID, 'in getUntranslatedMessages' );

        mwMessageCollection[userID]['messages'] = messageCollection;
        mwMessageCollection[userID]['currentMwMessageIndex'] = 0;

        debug( userID, 'received messageCollection ' + JSON.stringify(
            mwMessageCollection[userID]['messages'],
            null,
            2
        ) );

        tgBot.sendMessage( userID, 'Fetched ' +
            mwMessageCollection[userID]['messages'].length + ' untranslated messages'
        );

        if ( mwMessageCollection[userID]['messages'].length ) {
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
                tgBot.sendMessage( userID, 'Translation published' );

                mwMessageCollection[userID]['currentMwMessageIndex']++;
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
