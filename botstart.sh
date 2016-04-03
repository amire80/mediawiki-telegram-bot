#!/bin/bash

rm ../aharoni-telegram-bot.*
jstart -l release=trusty -mem 2g -N aharoni-telegram-bot node ./mediawiki-telegram-bot/MediaWikiTelegramBot.js

