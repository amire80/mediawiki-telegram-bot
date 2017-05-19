const readline = require('readline');

var mwApi = require('./MediaWikiAPI.js');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});


function chat() {
    var commands = {
        untranslated: untranslated,
        exit: exit,
        login: login,
    };
    console.log('chat() called');
    rl.question('Me: ', (answer) => {
        console.log('You typed:', answer);
        if(commands.hasOwnProperty(answer)) {
            commands[answer]();
        } else {
            console.log('Sorry, no such command:', answer);
            chat();
        };
    });
}



function exit() {
    console.log('exit() called');
    rl.close();
}


function untranslated() {
    mwApi.getUntranslatedMessages(function (messageCollection) {
        console.log(`Fetched ${mwMessageCollection.length} untranslated messages`);
        console.log('Try to translate some!');

        chat();
    });
};

function login() {
    var user = {};
    rl.question('Username: ', (answer) => {
        user.name = answer;
        hidden('Password: ', (answer) => {
            user.password = answer;
            mwApi.login(user.name, user.password, chat.bind(this));
        });
    });

}

function hidden(query, callback) {
    var stdin = process.openStdin();
    process.stdin.on("data", function(char) {
        char = char + "";
        switch (char) {
            case "\n":
            case "\r":
            case "\u0004":
                stdin.pause();
                break;
            default:
                process.stdout.write("\033[2K\033[200D" + query + Array(rl.line.length+1).join("*"));
                break;
        }
    });

    rl.question(query, function(value) {
        rl.history = rl.history.slice(1);
        callback(value);
    });
}



if (require.main === module) { // not required as a module

    console.log('Commands:');
    console.log('untranslated : will give you list of untranslated messages');
    console.log('login'); 
    console.log('exit : exit chat');

    chat();
} else {
    console.log('module.exports is', chat);
    module.exports = chat;
};
