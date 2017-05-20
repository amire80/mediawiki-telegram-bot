// Require Telegram API & http request
var TelegramBot = require( 'node-telegram-bot-api' );
var request = require( 'request' ).defaults( {
    jar: true
} );

var yaml = require( 'js-yaml' );
var fs = require( 'fs' );

var mwApi = require('./MediaWikiAPI.js');

var mode = 'fetching';
var apiUrl = 'https://translatewiki.net/w/api.php';

// Create object to contain userID and its information
var userStatus = {};
var currentMwMessageIndex = 0;

/*
 * Try to get the config settings to login & publish translations with
 * @param token - the token of the bot to connect to
 * @param username - TWN username of the user
 * @param password - TWN password of the user
 */
var config;

// Get document, or throw exception on error
try {
    config = yaml.safeLoad( fs.readFileSync(
        __dirname + '/config.yaml', 'utf8'
    ) );
} catch ( e ) {
    console.log( e );
}

var debugLevel = config.debugLevel;

/*
 * Debugging is level
 * Level 0 - nothing at all
 * Level 1 - show everything
 * Level 2 - in the future maybe control what is shown
*/
var debug = function ( userID, info, levelRequired ) {
    if ( !debugLevel ) {
        return;
    }

    var userConfig = debugLevel;

    // Display only if the userConfig is sufficient
    if( userConfig != 0 && userConfig >= levelRequired ) {
        tgBot.sendMessage( userID, info );
    }
};

// Returns the message of the current index
var getCurrentMwMessage = function ( userID ) {
    // It will short circuit if you don't check that the object exists
    if ( !Object.keys(userStatus).length || userStatus[userID]['currentMwMessageIndex'] > userStatus[userID]['messages'].length ) {
        userStatus[userID]['currentMwMessageIndex'] = 0;
        userStatus[userID]['messages'] = [];
        mode = 'fetching';
        return null;
    }

    return userStatus[userID]['messages'][userStatus[userID]['currentMwMessageIndex']];
};

// Create Telegram bot object
var tgBot = new TelegramBot( config.token, { polling: true } );

// Matches /echo [whatever]
tgBot.onText( /\/echo (.+)/, function ( msg, match ) {
    var userID = msg.from.id,
        resp = match[1];

    tgBot.sendMessage( userID, resp );
} );

// Matches /untranslated
tgBot.onText( /^\/setlanguage ?(.*)/, function ( msg, match ) {
    var userID = msg.from.id,
        newLanguageCode = match[1];

    debug( userID, "in onText setlanguage", 1 );
    debug( userID, "newLanguageCode is " + newLanguageCode, 1 );
    debug( userID, "newLanguageCode type is " + typeof( newLanguageCode ), 1 );

    // Check if a language code was provided
    if ( newLanguageCode === '' ) {
        tgBot.sendMessage( userID, "The current language code is " +
            getLanguageCode( userID )
        );

        // TODO - what if the language code is invalid?

        return;
    }
    setLanguageCode( userID, newLanguageCode );
} );

// Return the language code, if available
var getLanguageCode = function ( userID ) {
    var languageCode;

    // Check if the user is in the object of users
    if ( userStatus[userID] === undefined ) {
        // If not, add it, and don't return anything
        userStatus[userID] = {};
        return '';
    }

    // Get the language code and return it
    languageCode = userStatus[userID]['languageCode'];
    return languageCode;
};

// Sets language code to determine which language to fetch untranslated messages 
var setLanguageCode = function ( userID, newLanguageCode ) {
    debug( userID, "in setLanguageCode(), setting to " +
        newLanguageCode,
        1
    );

    // Check if the user is in the object of users
    if ( userStatus[userID] === undefined ) {
        userStatus[userID] = {};
    }

    // Change language code, empty messages, reset index
    userStatus[userID]['languageCode'] = newLanguageCode;
    userStatus[userID]['currentMwMessageIndex'] = 0;
    userStatus[userID]['messages'] = [];

    // TODO - Maybe consider autofetching messages in new language?
    tgBot.sendMessage( userID, "Set the language code to " + newLanguageCode );
};

// Returns a compiled string of the mw messages together
var getMwMessages = function( userID ) {
    // Merge all the mw messages together
    var mwMessages = userStatus[userID]['messages'].map(
            ( message, index ) => "Message " + index + ": " + message.definition
        ).join( '\n' );
    return mwMessages;
}

// Matches /untranslated
tgBot.onText( /\/untranslated/, function ( msg, match ) {
    var newLanguageCode,
        userID = msg.from.id,
        languageCode = getLanguageCode( userID );

    // Sets language code if it's not there
    if ( languageCode === undefined ) {
        languageCode = msg.from.language_code;
        tgBot.sendMessage( userID, "Automatically setting language code to " +
            languageCode +
            ". To change your language, use the /setlanguage command" );
        setLanguageCode( userID, languageCode )
    }

    debug( userID, 'in onText untranslated', 1 );

    // Get the messages...
    mwApi.getUntranslatedMessages( languageCode, messageCollection => {
        debug( userID, 'in getUntranslatedMessages', 1 );

        // Check if a user with that ID exists, creates it if not
        if ( userStatus[userID] === undefined ) {
            userStatus[userID] = {};
        }

        // Set defaults
        userStatus[userID]['messages'] = messageCollection;
        userStatus[userID]['currentMwMessageIndex'] = 0;
        userStatus[userID]['translatedMessagesCount'] = 0;

        debug( userID, 'received messageCollection ' + JSON.stringify(
            userStatus[userID]['messages'],
            null,
            2
        ), 2 );

        tgBot.sendMessage( userID, 'Fetched ' +
            userStatus[userID]['messages'].length + ' untranslated messages'
        );

        // Check if the array exists and has stuff
        if ( userStatus[userID]['messages'] && userStatus[userID]['messages'].length > 0 ) {
            // Get the messages compiled together
            var mwMessages = getMwMessages( userID );

            // Add the fluff messages
            tgMessage = 'Here are the messages: \n' +
                mwMessages +
                '\nTry to translate some!' +
                "\nType\n '/translate [message number] to translate that message.";
            tgBot.sendMessage(
                userID,
                tgMessage
            )
        } else {
            tgBot.sendMessage( userID, 'Nothing to translate!' );
        }
    });
});

// Matches anything without a slash in the beginning
tgBot.onText( /^([^\/].*)/, function ( msg, match ) {
    var userID = msg.from.id,
        chatMessage = match[1];

    // Gets the message to publish translation too
    var targetTranslatableMessage = getCurrentMwMessage( userID );

    if ( mode !== 'translation' ||
        targetTranslatableMessage === null
    ) {
        return;
    }

    debug( userID, 'Got translation "' + chatMessage + '", getting token', 1 );

    mwApi.login(config.username, config.password, () => {
        mwApi.addTranslation(
            getCurrentMwMessage( userID ).title,
            chatMessage,
            'Made with Telegram Bot',
            ( errorInfo ) => {
                // We don't remove the message from the list yet
                // Set it to 0 to be safe
                // TODO - How do we tell user that all messages have been translated?
                if( errorInfo !== null ) {
                    var tgMessage = "Error while attempting to publish translation." + errorInfo;
                    mode = '';
                    tgBot.sendMessage( userID, tgMessage );
                    return;
                }
                currentMwMessageIndex = 0;
                userStatus[userID]['translatedMessagesCount']++;

                // Compile and display a message to the user
                var tgMessage = 'Translation published\n';
                if( userStatus[userID]['translatedMessagesCount'] >= userStatus[userID]['messages'].length ) {
                    tgMessage = tgMessage + "No more messages to translate.\nPlease fetch more by typing the command '/untranslated'";
                } else {
                    tgMessage = tgMessage +
                        userStatus[userID]['translatedMessagesCount'] + " messages translated\n"
                        "Here are the remaining messages:\n" +
                        getMwMessages( userID ) +
                        "\nType\n '/translate [message number] to choose a new message to translate." +
                        "\nOr translate message 0:" +
                        userStatus[userID]['messages'][0].definition;                  
                    }
                tgBot.sendMessage( userID, tgMessage );
            }
        )
    });
} );

// Matches /translate
tgBot.onText( /\/translate ?(.*)/, function ( msg, match ) {
    var userID = msg.from.id;
    var messageNumber = match[1];
    try {
        messageNumber = parseInt( messageNumber );
    }
    catch ( err ) {
        tgBot.sendMessage( userID, "There was an error. Did you forget to type the message number?" );
        return;
    }
    if( messageNumber < userStatus[userID]['messages'].length ) {
        currentMwMessageIndex = messageNumber;
        mode = 'translation';
        tgBot.sendMessage( userID, "Please translate message " + messageNumber + ":\n" + userStatus[userID]['messages'][currentMwMessageIndex].definition );
    } else {
        tgBot.sendMessage( userID, "Message " + messageNumber + ' does not exist.' );
    }
} );

// Matches /untranslated
tgBot.onText( /^\/setlanguage ?(.*)/, function ( msg, match ) {
    var userID = msg.from.id,
        newLanguageCode = match[1];
    debug( userID, "in onText setlanguage", 1 );
    debug( userID, "newLanguageCode is " + newLanguageCode, 1 );
    debug( userID, "newLanguageCode type is " + typeof( newLanguageCode ), 1 );

    if ( newLanguageCode === '' ) {
        tgBot.sendMessage( userID, "The current language code is " +
            getLanguageCode( userID )
        );

        return;
    }

    setLanguageCode( userID, newLanguageCode );
} );
