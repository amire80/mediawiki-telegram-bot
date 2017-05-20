const read = require('read');

var mwApi = require('./MediaWikiAPI.js');

var mwMessageCollection = null;

// List of available commands
var commands = {
    help: help,
    fetch: fetch,
    exit: exit,
    login: login,
    skip: skip,
    translate: translate,
};

function chat() {
    input( 'Command:', answer => {
        if( commands.hasOwnProperty( answer ) ) {
            commands[answer]();
        } else {
            console.log('Sorry, no such command:', answer);
            chat();
        };
    });
}

exit.doc = 'Just exit this script';
function exit() {
    console.log('Bye');
}

fetch.doc = 'will fetch any available messages requiring translation';
function fetch() {
    input('LanguageCode: ', languageCode => {
        mwApi.getUntranslatedMessages( languageCode, function ( messageCollection ) {
            mwMessageCollection = messageCollection;

            console.log(`Fetched ${mwMessageCollection.length} untranslated messages`);

            // Check if there are any messages to be translated
            if( !mwMessageCollection.length > 0 ) {
                console.log('No messages to be translated.');
                return;
            }

            console.log('The current message to translate is:')
            console.log(mwMessageCollection[currentMessageIndex].definition);
            console.log("Type 'translate' to translate it or 'skip' to skip it.");

            chat();
        } );
    } );
};

var currentMessageIndex = 0;
translate.doc = 'Translate the current message: ';
function translate() {
    if( mwMessageCollection !== null ) {
        var firstMessage = mwMessageCollection[currentMessageIndex];

        console.log(firstMessage.definition);

        input('Translation: ', answer => {
            mwApi.addTranslation(firstMessage.title, answer, 'Added from CLI tool', () => {
                // We already have fetched messages at this point
                skip();
            });
        }); 
    }
    else {
        console.log('Please fetch messages first before attempting to translate.');
        chat();
    }
};

login.doc = 'Allows you to provide credentials';
function login() {
    var user = {};
    input('Username: ', answer => {
        user.name = answer;
        input('Password: ', answer => {
            user.password = answer;
            mwApi.login(user.name, user.password, err => {
                if(err) { 
                    console.log(err); 
                };
                chat();
            });
        }, true); // password is silent
    });

}

function input(prompt, cb, silent) {
    console.log("\x1b[32m"); // Switch to green
    read({prompt:prompt, silent: !!silent}, (err, answer) => {
        console.log("\x1b[0m"); // Reset console color
        cb(answer);
    });
}

help.doc = 'Shows help message';
function help() {
    console.log('Commands:');
    for(var command in commands) {
        console.log(command + ':', commands[command].doc || '');
    };
    console.log('\n');
    chat();
};

skip.doc = 'Skip and show the next message.';
function skip() {
    if( mwMessageCollection !== null ) {
        if( currentMessageIndex + 1 >= mwMessageCollection.length ) {
            console.log('No more messages to translate.');
            return;
        }
        currentMessageIndex++;
        console.log('The next message is: ');
        console.log(mwMessageCollection[currentMessageIndex]);
    }
    else {
        console.log('No messages have been fetched yet.');
    }
    chat();
}

if (require.main === module) { // not required as a module
    help();
} else {
    console.log( 'module.exports is', chat );
    module.exports = chat;
};
