# mediawiki-telegram-bot

##Descripton
This is a Node.js service that can fetch untranslated messages from
translatewiki.net and send translations to them using the Telegram
chat network.

## Coding conventions
Use the [MediaWiki JavaScript coding conventions](https://www.mediawiki.org/wiki/Manual:Coding_conventions/JavaScript).

In addition, since Telegram and MediaWiki have a lot of overlapping terminology, always make it explicit in the variable names, comments, etc., that you add, to which side do you refer when you talk about any of these:

* bot
* token
* message

Use "tg" and "mw" if you need short prefixes.

## Credits
Put together from nearly random code samples on npmjs.org and StackOverflow by
Amir E. Aharoni at the Wikimedia Hackathon 2016 in Jerusalem.

People without whom this wouldn't happen:

* Bryan Davis
* Marko Obrovac
* Petr Bena
* Brad Jorsch
* Siebrand Mazeland
* Niklas Laxström
* Merlijn van Deen

## License
Copyright (C) 2016 Amir E. Aharoni, amir.aharoni@mail.huji.ac.il

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
