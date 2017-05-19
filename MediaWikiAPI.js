var request = require( 'request' ).defaults( {
    jar: true
} );


const apiUrl = 'https://translatewiki.net/w/api.php';

exports.getUntranslatedMessages = function(cb) {
    request.post({
        url: apiUrl,
        form: {
            action: 'query',
            format: 'json',
            prop: '',
            list: 'messagecollection',
            mcgroup: 'ext-0-wikimedia',
            mclanguage: 'uk', // TODO: Make configurable
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
                    console.log( 'Log in request over' );

                    if ( error || response.statusCode !== 200 ) {
                        console.log( 'Error logging in' );
                        console.log( 'statusCode: ' + response.statusCode );
                        console.log( 'error: ' + error );

                        return;
                    }

                    console.log( 'Login token request response: ' + body );
                    console.log( 'Logged in, how nice' );
                    console.log( 'Getting CSRF token' );

                    if(cb) {
                        cb();
                    };
                }
            );
        }
    );
};
