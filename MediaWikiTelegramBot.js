// Require Telegram API & http request
var TelegramBot = require( 'node-telegram-bot-api' );
var request = require( 'request' ).defaults( {
    jar: true
} );

// Require yaml fs reader
var yaml = require( 'js-yaml' );
var fs = require( 'fs' );

// So we can use the other functions
var mwApi = require('./MediaWikiAPI.js');

var mode = 'fetching';
var apiUrl = 'https://translatewiki.net/w/api.php';

var debugLevel = 1;

// Create object to contain userID and its information
var userStatus = {};
var currentMwMessageIndex = 0;

// Debugging is good
var debug = function ( fromId, info ) {
    if ( !debugLevel ) {
        return;
    }

    tgBot.sendMessage( fromId, info );
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

// Create Telegram bot
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

    debug( userID, "in onText setlanguage" );
    debug( userID, "newLanguageCode is " + newLanguageCode );
    debug( userID, "newLanguageCode type is " + typeof( newLanguageCode ) );

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

    // Check if a user with that ID is in the object of users
    if ( userStatus[userID] === undefined ) {
        // If not, add it, and don't return anything
        userStatus[userID] = {};
        return '';
    }

    // Else get the language code and return it
    languageCode = userStatus[userID]['languageCode'];
    return languageCode;
};

// Sets language code to grab untranslated messages in
var setLanguageCode = function ( userID, newLanguageCode ) {
    debug( userID, "in setLanguageCode(), setting to " +
        newLanguageCode
    );

    // Check if a user with that ID is in the object of users
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

// Returns a compiled string of the messages together
var getMessages = function( userID ) {
    // Merge all the messages together
    var messages = userStatus[userID]['messages'].map(
            ( message, index ) => "Message " + index + ": " + message.definition
        ).join( '\n' );
    return messages;
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

    debug( userID, 'in onText untranslated' );

    // Get the messages...
    mwApi.getUntranslatedMessages( languageCode, messageCollection => {
        // debug( userID, 'in getUntranslatedMessages' );

        // Check if a user with that ID exists, creates it if not
        if ( userStatus[userID] === undefined ) {
            userStatus[userID] = {};
        }

        // Set defaults
        userStatus[userID]['messages'] = messageCollection;
        userStatus[userID]['currentMwMessageIndex'] = 0;

        // debug( userID, 'received messageCollection ' + JSON.stringify(
        //     userStatus[userID]['messages'],
        //     null,
        //     2
        // ) );

        tgBot.sendMessage( userID, 'Fetched ' +
            userStatus[userID]['messages'].length + ' untranslated messages'
        );
        // var messages = userStatus[userID]['messages'];


        // Check if the array exists and has stuff
        if ( userStatus[userID]['messages'] && userStatus[userID]['messages'].length > 0 ) {
            // Get the messages compiled together
            var messages = getMessages( userID );

            // Add the fluff messages
            messages = 'Here are the messages: \n' +
                messages +
                '\nTry to translate some!' +
                "\nType\n '/translate [message number] to translate that message.";
            tgBot.sendMessage(
                userID,
                messages
            )
            // mode = 'translation';
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

    debug( userID, 'Got translation "' + chatMessage + '", getting token' );

    mwApi.login(config.username, config.password, () => {
        mwApi.addTranslation(
            getCurrentMwMessage( userID ).title,
            chatMessage,
            'Made with Telegram Bot',
            () => {
                // Remove that message from the list and set index to 0
                // TODO - Update indexes in the array and the indexes shown to user after
                delete ( userStatus[userID]['messages'][currentMwMessageIndex] );
                currentMwMessageIndex = 0;

                // Compile and display a message to the user
                var message = 'Translation published\n';
                message = message +
                    "Here are the remaining messages:\n" +
                    getMessages( userID ) +
                    "\nType\n '/translate [message number] to choose a new message to translate." +
                    "\nOr translate message 0:" +
                    userStatus[userID]['messages'][0]; 
                tgBot.sendMessage( userID, message );

                // userStatus[userID]['currentMwMessageIndex']++;
                // var nextMwMessage = getCurrentMwMessage( userID );

                // if ( nextMwMessage ) {
                //     tgBot.sendMessage(
                //         userID,
                //         nextMwMessage.definition
                //     );
                // }
            }
        )
    });
} );

// Matches /translate
tgBot.onText( /\/translate ?(.*)/, function ( msg, match ) {
    var userID = msg.from.id;
    var messageNumber = match[1];
    tgBot.sendMessage( userID, messageNumber );
    // try {
    //     debug( 'messageNumber is ' + parseInt( match[1] ) );
    //     // messageNumber = parseInt( match[1], 10 );
    //     // debug( 'messageNumber is ' + messageNumber );
    //     // tgBot.sendMessage( 'messageNumber is ' + messageNumber );
    //     // currentMwMessageIndex = messageNumber;
    // }
    // catch ( err ) {
    //     tgBot.sendMessage( userID, "There was an error. Did you forget to type the message number?" );
    //     return;
    // }
    if( messageNumber < userStatus[userID]['messages'].length ) {
        currentMwMessageIndex = messageNumber;
        mode = 'translation';
        tgBot.sendMessage( userID, "Please translate message " + messageNumber + ":\n" + userStatus[userID]['messages'][currentMwMessageIndex].definition );
    } else {
        tgBot.sendMessage( userID, "Message " + messageNumber + ' does not exist.' );
    }
});

// Matches /untranslated
tgBot.onText( /^\/setlanguage ?(.*)/, function ( msg, match ) {
    var userID = msg.from.id,
        newLanguageCode = match[1];
    debug( userID, "in onText setlanguage" );
    debug( userID, "newLanguageCode is " + newLanguageCode );
    debug( userID, "newLanguageCode type is " + typeof( newLanguageCode ) );

    if ( newLanguageCode === '' ) {
        tgBot.sendMessage( userID, "The current language code is " +
            getLanguageCode( userID )
        );

        return;
    }

    setLanguageCode( userID, newLanguageCode );
} );
