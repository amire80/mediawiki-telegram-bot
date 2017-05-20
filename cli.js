const read = require('read');

var mwApi = require('./MediaWikiAPI.js');

function chat() {
    input('Command:', answer => {
        if(commands.hasOwnProperty(answer)) {
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

untranslated.doc = 'will give you next untranslated message to translate';
function untranslated() {
    mwApi.getUntranslatedMessages(function (messageCollection) {
        console.log(`Fetched ${messageCollection.length} untranslated messages`);
        console.log('Try to translate some!');

        translate(messageCollection);
    });
};

function translate(mwMessageCollection) {
    var firstMessage = mwMessageCollection[0];

    console.log(firstMessage.definition);

    input('Translation: ', answer => {
        mwApi.addTranslation(firstMessage.title, answer, 'Added from CLI tool', () => {
            chat();
        });
    });
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
    for(var c in commands) {
        console.log(c + ':', commands[c].doc || '');
    };
    console.log('\n\n');
    chat();
};

var commands = {
    help: help,
    untranslated: untranslated,
    exit: exit,
    login: login,
};

if (require.main === module) { // not required as a module
    help();
} else {
    console.log('module.exports is', chat);
    module.exports = chat;
};
