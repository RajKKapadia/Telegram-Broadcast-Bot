# Telegram Broadcast Bot

* set up the .env file from the content of .env.example file
* run the Telegram bot in deamon mode using docker
```bash
docker build -t telegram-bot .
docker run -v $(pwd)/data:/usr/src/app/data --name telegram-bot telegram-bot
```

#### Message formats
* /schedule 22/12/2024 16:15 This is the message for my users.

* for media messages
    - send a media
    - reply the media with the message
    /schedule media 22/12/2024 16:15 This is the caption for the media.
