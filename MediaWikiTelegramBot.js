var TelegramBot = require( 'node-telegram-bot-api' );
var request = require('request');
var yaml = require('js-yaml');
var fs = require('fs');

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
    request(
        'https://translatewiki.net/w/api.php?action=query&format=json&prop=&list=messagecollection&mcgroup=ext-0-wikimedia&mclanguage=he&mcfilter=!optional|!ignored|!translated',
        function ( error, response, body ) {
            body = JSON.parse( body );

            console.log( '********************* response:' );
            console.log( JSON.stringify( response, null, 2 ) );
            console.log( '********************* body:' );
            console.log( JSON.stringify( body, null, 2 ) );

            if ( !error && response.statusCode === 200 ) {
                bot.sendMessage( body.query.metadata );
            }
        }
    );
} );
