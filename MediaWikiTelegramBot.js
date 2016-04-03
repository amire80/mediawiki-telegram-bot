var TelegramBot = require( 'node-telegram-bot-api' );
var request = require( 'request' );
var yaml = require( 'js-yaml' );
var fs = require( 'fs' );

var mode = 'fetching';
var targetTranslatableMessageTitle = null;

var config;

// Get document, or throw exception on error
try {
    config = yaml.safeLoad(
        fs.readFileSync( __dirname + '/mediawiki-telegram-bot.config.yaml', 'utf8' )
    );
} catch ( e ) {
    console.log( e );
}

// Setup polling way
var bot = new TelegramBot( config.token, { polling: true } );

// Matches /echo [whatever]
bot.onText( /\/echo (.+)/, function ( msg, match ) {
    var fromId = msg.from.id,
        resp = match[1];

    bot.sendMessage( fromId, resp );
} );

bot.onText( /\/untranslated (.+)/, function ( msg, match ) {
    var fromId = msg.from.id,
        translatableMessageNumber = match[1];

    request(
        'https://translatewiki.net/w/api.php?action=query&format=json&prop=&list=messagecollection&mcgroup=ext-0-wikimedia&mclanguage=he&mcfilter=!optional|!ignored|!translated',
        function ( error, response, body ) {
            body = JSON.parse( body );

            console.log( '********************* response:' );
            console.log( JSON.stringify( response, null, 2 ) );
            console.log( '********************* body:' );
            console.log( JSON.stringify( body, null, 2 ) );
            console.log( 'body.query.metadata:' );
            console.log( body.query.metadata );
            console.log( 'messagecollection:' );
            console.log( body.query.messagecollection );

            var messageCollection = body.query.messagecollection;
            var targetTranslatableMessage =
                messageCollection[translatableMessageNumber];
            console.log( 'targetTranslatableMessage.definition:' );
            console.log( targetTranslatableMessage.definition );

            if ( !error && response.statusCode === 200 ) {
                bot.sendMessage( fromId, targetTranslatableMessage.definition );
            }

            mode = 'translation';
            targetTranslatableMessageTitle = targetTranslatableMessage.title;
        }
    );
} );

bot.onText( /([^\/].*)/, function ( msg, match ) {
    var fromId = msg.from.id,
        chatMessage = match[1];

    if ( mode !== 'translation' ||
        targetTranslatableMessageTitle === null
    ) {
        return;
    }

    bot.sendMessage( fromId, 'Got translation "' + chatMessage +
        '", getting token' );

    request(
        'https://translatewiki.net/w/api.php?action=query&format=json&prop=&meta=tokens&type=login',
        function ( error, response, body ) {
            bot.sendMessage( fromId, 'Token request over' );

            if ( error || response.statusCode !== 200 ) {
                bot.sendMessage( fromId, 'Error getting token' );
                bot.sendMessage( fromId, 'statusCode: ' + response.statusCode );
                bot.sendMessage( fromId, 'error: ' + error );

                return;
            }

            bot.sendMessage( fromId, 'Got MediaWiki login token: ' + body );

            body = JSON.parse( body );

            var mwLoginToken = body.query.tokens.logintoken;

            bot.sendMessage( fromId, 'Trying to authenticate' );
            request.post(
                'https://translatewiki.net/w/api.php?action=login&format=json&' +
                    'lgname=' + config.username + '&' +
                    'lgpassword=' + config.password + '&' +
                    'lgtoken=' + mwLoginToken,
                function ( error, response, body ) {
                    bot.sendMessage( fromId, 'Log in request over' );

                    if ( error || response.statusCode !== 200 ) {
                        bot.sendMessage( fromId, 'Error logging in' );
                        bot.sendMessage( fromId, 'statusCode: ' + response.statusCode );
                        bot.sendMessage( fromId, 'error: ' + error );

                        return;
                    }

                    bot.sendMessage( fromId, 'Login token request response: ' + body );

                    bot.sendMessage( fromId, 'Logged in, how nice' );

                    bot.sendMessage( fromId, 'title: "' + targetTranslatableMessageTitle + '"' );

                    bot.sendMessage( fromId, 'Getting CSRF token' );

                    var mwEditTokenRequestUrl = 'https://translatewiki.net/w/api.php?action=query&format=json&meta=tokens&type=csrf';
                    request(
                        mwEditTokenRequestUrl,
                        function ( error, response, body ) {
                            bot.sendMessage( fromId, 'Edit token request over' );

                            if ( error || response.statusCode !== 200 ) {
                                bot.sendMessage( fromId, 'Error getting edit token' );
                                bot.sendMessage( fromId, 'statusCode: ' + response.statusCode );
                                bot.sendMessage( fromId, 'error: ' + error );

                                return;
                            }

                            body = JSON.parse( body );
                            var mwEditToken = body.query.tokens.csrftoken;
                            bot.sendMessage( fromId, 'Got edit token ' + mwEditToken );

                            var editRequestUrl = 'https://translatewiki.net/w/api.php?action=edit&format=json&' +
                                'title=' + targetTranslatableMessageTitle + '&' +
                                'text=' + chatMessage + '&' +
                                'summary=Made+with+Telegram+Bot&' +
                                'token=' + mwEditToken;

                            request.post( editRequestUrl, function ( error, response, body ) {
                                bot.sendMessage( fromId, 'Edit request over' );

                                if ( error || response.statusCode !== 200 ) {
                                    bot.sendMessage( fromId, 'Error editing' );
                                    bot.sendMessage( fromId, 'statusCode: ' + response.statusCode );
                                    bot.sendMessage( fromId, 'error: ' + error );

                                    return;
                                }

                                bot.sendMessage( fromId, 'Looks like it worked!' );

                                mode = 'fetching';
                                targetTranslatableMessageTitle = null;
                            } );
                        }
                    );
                }
            );
        }
    );
} );
