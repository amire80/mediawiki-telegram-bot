var TelegramBot = require( 'node-telegram-bot-api' );
var request = require( 'request' ).defaults( {
    jar: true
} );
var yaml = require( 'js-yaml' );
var fs = require( 'fs' );

var mwApi = require('./MediaWikiAPI.js');

var mode = 'fetching';
var apiUrl = 'https://translatewiki.net/w/api.php';

var debugLevel = 0;

var mwMessageCollection = [];
var currentMwMessageIndex = 0;

var debug = function ( fromId, info ) {
    if ( !debugLevel ) {
        return;
    }

    tgBot.sendMessage( fromId, info );
};

var getCurrentMwMessage = function () {
    if ( !mwMessageCollection.length ||
        currentMwMessageIndex > mwMessageCollection.length
    ) {
        currentMwMessageIndex = 0;
        mwMessageCollection = [];
        mode = 'fetching';

        return null;
    }

    return mwMessageCollection[currentMwMessageIndex];
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
    var fromId = msg.from.id,
        resp = match[1];

    tgBot.sendMessage( fromId, resp );
} );

// Matches /untranslated
tgBot.onText( /\/untranslated/, function ( msg, match ) {
    var fromId = msg.from.id;

    mwApi.getUntranslatedMessages(res => {
        mwMessageCollection = res;

        currentMwMessageIndex = 0;
        tgBot.sendMessage( fromId, 'Fetched ' +
            mwMessageCollection.length +
            ' untranslated messages'
        );

        if ( mwMessageCollection.length ) {
            tgBot.sendMessage( 'Try to translate some!' );
            tgBot.sendMessage( fromId, getCurrentMwMessage().definition );
        }

        mode = 'translation';
    });
});

// Matches anything without a slash in the beginning
tgBot.onText( /([^\/].*)/, function ( msg, match ) {
    var fromId = msg.from.id,
        chatMessage = match[1];

    var targetTranslatableMessage = getCurrentMwMessage();

    if ( mode !== 'translation' ||
        targetTranslatableMessage === null
    ) {
        return;
    }

    debug( fromId, 'Got translation "' + chatMessage + '", getting token' );

    mwApi.login(config.username, config.password, () => {
        mwApi.addTranslation(
            getCurrentMwMessage().title,
            chatMessage,
            'Made with Telegram Bot',
            () => {
                tgBot.sendMessage( fromId, 'Translation published' );

                currentMwMessageIndex++;
                var nextMwMessage = getCurrentMwMessage();

                if ( nextMwMessage ) {
                    tgBot.sendMessage(
                        fromId,
                        nextMwMessage.definition
                    );
                }
            }
        )
    });
} );
