var request = require( 'request' ).defaults({
    jar: true
} );

const apiUrl = 'https://translatewiki.net/w/api.php';

exports.getUntranslatedMessages = function( languageCode ,cb ) {
    request.post({
        url: apiUrl,
        form: {
            action: 'query',
            format: 'json',
            prop: '',
            list: 'messagecollection',
            mcgroup: 'ext-0-wikimedia',
            mclanguage: languageCode,
            mclimit: 10, // TODO: Make configurable
            mcfilter: '!optional|!ignored|!translated'
        }
    }, function ( error, response, body ) {
            body = JSON.parse( body );

            mwMessageCollection = body.query.messagecollection;

            cb(mwMessageCollection);
        }
    );
}

exports.login = function(username, password, cb) {
    request.post( {
        url: apiUrl,
        form: {
            action: 'query',
            format: 'json',
            prop: '',
            meta: 'tokens',
            type: 'login'
        } },
        function ( error, response, body ) {
            console.log( 'Token request over' );

            if ( error || response.statusCode !== 200 ) {
                console.log('Error getting token' );
                console.log('statusCode: ' + response.statusCode );
                console.log('error: ' + error );

                return;
            }

            console.log( 'Got MediaWiki login token: ' + body );

            body = JSON.parse( body );

            var mwLoginToken = body.query.tokens.logintoken;

            console.log( 'Trying to authenticate' );
            request.post( {
                url: apiUrl,
                form: {
                    action: 'login',
                    format: 'json',
                    lgname: username,
                    lgpassword: password,
                    lgtoken: mwLoginToken
                } },
                function ( error, response, body ) {
                    if ( error || response.statusCode !== 200 ) {
                        console.log( 'Error logging in' );
                        console.log( 'statusCode: ' + response.statusCode );
                        console.log( 'error: ' + error );

                        return;
                    }

                    var res = JSON.parse(body);

                    if(cb) {
                        if(res.login.result == 'Failed') {
                            cb(res.login.reason);
                        } else {
                            console.log('Successfully logged in!');
                            cb();
                        }
                    };
                }
            );
        }
    );
};

exports.addTranslation = function(title, translation, summary, cb) {
    request.post( {
        url: apiUrl,
        form: {
            action: 'query',
            format: 'json',
            meta: 'tokens',
            type: 'csrf'
        } },
        function ( error, response, body ) {
            console.log('Edit token request over' );

            if ( error || response.statusCode !== 200 ) {
                console.log('Error getting edit token' );
                console.log('statusCode: ' + response.statusCode );
                console.log('error: ' + error );

                return;
            }

            body = JSON.parse( body );
            var mwEditToken = body.query.tokens.csrftoken;
            console.log('Got edit token ' + mwEditToken );

            request.post( {
                url: apiUrl,
                form: {
                    action: 'edit',
                    format: 'json',
                    title: title,
                    text: translation,
                    summary: summary,
                    tags: 'TelegramBot',
                    token: mwEditToken
                } },
                function ( error, response, body ) {
                console.log( 'Edit request over' );

                if ( error || response.statusCode !== 200 ) {
                    console.log('Error editing' );
                    console.log('statusCode: ' + response.statusCode );
                    console.log('error: ' + error );

                    return;
                }

                console.log( 'Translation published' );

                cb();
            } );
        }
    );
}
