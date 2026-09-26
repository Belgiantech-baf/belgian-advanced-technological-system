GeoFS ↔ Discord Bridge
======================

PURPOSE
-------
Create a two-way bridge between GeoFS multiplayer and a Discord bot.

FLOW
----
GeoFS → Bridge Server → Discord
Discord → Bridge Server → GeoFS


==================================================
1. GEOFS MULTIPLAYER DATA
==================================================

LOCAL MULTIPLAYER OBJECT
------------------------
window.multiplayer

Important properties:

multiplayer.myId
    Current GeoFS multiplayer session/player ID.

multiplayer.users
    Known multiplayer users.

multiplayer.visibleUsers
    Currently visible/active multiplayer users.

multiplayer.nbUsers
    Multiplayer player count maintained by the client.

multiplayer.avgPing
    Average multiplayer ping.

multiplayer.serverTimeOffset
    Difference between local browser time and GeoFS server time.

multiplayer.lastResponse
    Most recent multiplayer server response.

multiplayer.chatMessage
    Outgoing GeoFS chat message waiting to be sent.

multiplayer.chatMessageId
    Chat message ID.

multiplayer.started
    Whether multiplayer has started.

multiplayer.on
    Multiplayer state.

multiplayer.getServerTime()
    Returns GeoFS server-adjusted time.

multiplayer.getUser(id)
    Gets a multiplayer user by ID.

multiplayer.setChatMessage(message)
    Sends a chat message through the GeoFS multiplayer client.


==================================================
2. GEOFS USER DATA
==================================================

Each multiplayer user can contain:

id
    Multiplayer session/player ID.

acid
    GeoFS account/aircraft-related user ID.

cs
    Callsign.

ac
    Aircraft ID.

co
    Position/orientation array.

ve
    Velocity/angular-motion data.

st
    Aircraft state.

ti
    Server timestamp.

ad
    Traffic/ADS-B related flag where present.

lv
    Livery information where present.


POSITION ARRAY
--------------

co:

co[0] = latitude
co[1] = longitude
co[2] = altitude
co[3] = heading
co[4] = pitch
co[5] = roll


VELOCITY ARRAY
--------------

ve:

Contains velocity and angular-motion information.


STATE
-----

st.gr
    Landing gear state.

st.as
    Airspeed/KIAS.

st.lv
    Livery information when present.


==================================================
3. LOCAL GEOFS AIRCRAFT DATA
==================================================

For the current player:

geofs.aircraft.instance

Useful properties:

geofs.aircraft.instance.llaLocation
    [latitude, longitude, altitude]

geofs.aircraft.instance.htr
    Heading/pitch/roll.

geofs.aircraft.instance.aircraftRecord.id
    Current aircraft multiplayer ID.

geofs.aircraft.instance.liveryId
    Current livery ID when available.

geofs.aircraft.instance.rigidBody
    Physics body.

geofs.aircraft.instance.groundContact
    Whether aircraft is touching the ground.

geofs.aircraft.instance.engine.on
    Engine state.


==================================================
4. LOCAL GEOFS USER RECORD
==================================================

geofs.userRecord.id
    GeoFS user/account ID.

geofs.userRecord.sessionId
    Current GeoFS session ID.

geofs.userRecord.licenseid
    License/account-related ID used by some multiplayer
    map functionality.


==================================================
5. GEOFS OUTGOING MULTIPLAYER PACKET
==================================================

The current GeoFS client constructs a packet containing:

{
    acid,
    sid,
    id,
    ro,
    ac,
    co,
    ve,
    st,
    ti,
    m,
    ci
}

Meaning:

acid
    geofs.userRecord.id

sid
    geofs.userRecord.sessionId

id
    multiplayer.myId

ro
    ADS-B/traffic preference information

ac
    Current aircraftRecord.id

co
    Latitude/longitude/altitude/attitude

ve
    Velocity/angular data

st
    Aircraft state

ti
    GeoFS server time

m
    Outgoing chat message

ci
    Chat message ID


IMPORTANT
---------
Do NOT expose sid/session IDs to Discord.

Do NOT expose authentication/session credentials to
other users.

The bridge should use its own authentication.


==================================================
6. INCOMING MULTIPLAYER RESPONSE
==================================================

GeoFS multiplayer responses can contain:

{
    "myId": "...",
    "userCount": 0,
    "users": [],
    "chatMessages": [],
    "lastMsgId": 0,
    "serverTime": 0
}


myId
----
Current player's multiplayer ID.


userCount
---------
Number of multiplayer users.


users
-----
Array of multiplayer aircraft/users.


chatMessages
------------
New GeoFS chat messages.


lastMsgId
---------
Latest GeoFS chat message ID.


serverTime
----------
GeoFS server timestamp.


==================================================
7. CHAT MESSAGE FORMAT
==================================================

Incoming GeoFS chat can contain:

{
    "uid": "4320988926187",
    "acid": 123456,
    "cs": "AIX123",
    "rs": "r1",
    "msg": "Hello%20world"
}

Fields:

uid
    GeoFS multiplayer/user ID.

acid
    GeoFS account/aircraft ID.

cs
    Callsign.

rs
    Chat/radio-related field.

msg
    URL-encoded message.


IMPORTANT
---------
Decode msg before displaying it in Discord.

Track lastMsgId so messages aren't duplicated.


==================================================
8. GEOFS → DISCORD MESSAGE TYPES
==================================================

The bridge should support:

player_update
player_join
player_leave
geofs_chat
player_count
status
error


Example player_update:

{
    "type": "player_update",
    "player": {
        "id": "4320988926187",
        "acid": 123456,
        "callsign": "AIX123",
        "aircraft": 27,
        "latitude": 35.5494,
        "longitude": 139.7798,
        "altitude": 35000,
        "heading": 90,
        "pitch": 2,
        "roll": 0,
        "speed": 450,
        "gear": 0
    },
    "timestamp": 1762433925624
}


Example GeoFS chat:

{
    "type": "geofs_chat",
    "playerId": "4320988926187",
    "acid": 123456,
    "callsign": "AIX123",
    "message": "Hello Discord!"
}


==================================================
9. DISCORD → GEOFS MESSAGE TYPES
==================================================

The bridge should support:

discord_chat
discord_command
ping
identify
subscribe
unsubscribe


Example:

{
    "type": "discord_chat",
    "message": "Hello from Discord!"
}


The GeoFS client receives it and calls:

multiplayer.setChatMessage(message)


==================================================
10. DISCORD COMMANDS
==================================================

Recommended commands:

!geo status
!geo players
!geo player <callsign>
!geo me
!geo nearby
!geo aircraft
!geo chat <message>


OPTIONAL:

!geo count
!geo ping
!geo locate <callsign>
!geo server
!geo help


==================================================
11. COMMAND BEHAVIOR
==================================================

!geo status

Return:

GeoFS Multiplayer
-----------------
Status: Online
Players: 123
Ping: 110 ms
Server time: <time>


!geo players

Return:

Current GeoFS Players
---------------------

AIX123
Aircraft: A320
Altitude: 35,000 ft
Speed: 450 kt

THY2010
Aircraft: ...
Altitude: ...
Speed: ...


!geo player AIX123

Return detailed information:

Callsign
GeoFS ID
Aircraft
Latitude
Longitude
Altitude
Heading
Pitch
Roll
Speed
Gear


!geo me

Return the connected user's:

GeoFS ID
Callsign
Aircraft
Position
Altitude
Speed
Heading


!geo chat Hello

Send:

{
    "type": "discord_chat",
    "message": "Hello"
}

to the connected GeoFS client.


==================================================
12. WEBSOCKET PROTOCOL
==================================================

Use WebSocket between GeoFS and your bridge server.

Example:

ws://YOUR-SERVER/ws

or:

wss://YOUR-SERVER/ws


GeoFS → Server:

{
    "type": "geo_update",
    "player": {
        "id": "...",
        "acid": 123456,
        "callsign": "AIX123",
        "aircraft": 27,
        "latitude": 35.5,
        "longitude": 139.7,
        "altitude": 35000,
        "heading": 90,
        "pitch": 2,
        "roll": 0,
        "speed": 450,
        "gear": 0
    }
}


Server → GeoFS:

{
    "type": "discord_chat",
    "message": "Hello from Discord!"
}


GeoFS → Server:

{
    "type": "geofs_chat",
    "playerId": "...",
    "callsign": "AIX123",
    "message": "Hello!"
}


Server → Discord:

{
    "type": "player_update",
    "callsign": "AIX123",
    "aircraft": 27,
    "latitude": 35.5,
    "longitude": 139.7,
    "altitude": 35000,
    "heading": 90,
    "speed": 450
}


==================================================
13. GEOFS BRIDGE API
==================================================

Expose these functions to the bridge:

GeoFSMultiplayer.getPlayers()

GeoFSMultiplayer.getVisiblePlayers()

GeoFSMultiplayer.getPlayer(id)

GeoFSMultiplayer.getLocalPlayer()

GeoFSMultiplayer.getMyId()

GeoFSMultiplayer.getServerTime()

GeoFSMultiplayer.getPing()

GeoFSMultiplayer.getPlayerCount()

GeoFSMultiplayer.getLastResponse()

GeoFSMultiplayer.sendChat(message)

GeoFSMultiplayer.onUpdate(callback)

GeoFSMultiplayer.onChat(callback)


Example:

GeoFSMultiplayer.getPlayers()


Returns:

[
    {
        id: "...",
        acid: 123456,
        callsign: "AIX123",
        aircraft: 27,
        latitude: 35.5,
        longitude: 139.7,
        altitude: 35000,
        heading: 90,
        pitch: 2,
        roll: 0,
        speed: 450,
        gear: 0
    }
]


==================================================
14. DISCORD BOT API
==================================================

The Discord bot should expose:

sendToGeoFS(message)

getGeoFSPlayers()

getGeoFSPlayer(id)

getGeoFSPlayerByCallsign(callsign)

getGeoFSStatus()

getGeoFSPing()

getGeoFSPlayerCount()

sendGeoFSChat(message)


Example:

sendToGeoFS({
    type: "discord_chat",
    message: "Hello!"
})


==================================================
15. SERVER STATE
==================================================

Maintain:

connectedGeoFSClients

players

lastChatMessageId

lastGeoFSUpdate

serverStatus

discordStatus


Example:

{
    "connectedGeoFSClients": 1,
    "players": {},
    "lastChatMessageId": 2062,
    "lastGeoFSUpdate": 1762433925624,
    "serverStatus": "online",
    "discordStatus": "online"
}


==================================================
16. UPDATE RATE
==================================================

GeoFS multiplayer normally updates frequently.

Do NOT forward every raw GeoFS update directly into Discord.

Instead:

GeoFS
  ↓
high-frequency telemetry
  ↓
Bridge
  ↓
rate limit / aggregate
  ↓
Discord


Recommended Discord telemetry interval:

1-5 seconds

Recommended GeoFS bridge telemetry:

as frequently as needed by the client/server,
while avoiding unnecessary bandwidth.


Chat should be event-driven rather than sent on a timer.


==================================================
17. DISCORD EMBEDS
==================================================

PLAYER EMBED

Title:
✈️ AIX123

Fields:

Aircraft
A320-200

Altitude
35,000 ft

Speed
450 kt

Heading
090°

Position
35.5494, 139.7798

Gear
UP


CHAT EMBED

Title:
💬 GeoFS Chat

Fields:

Pilot
AIX123

Message
Hello everyone!


STATUS EMBED

Title:
🌐 GeoFS Multiplayer

Fields:

Status
Online

Players
123

Ping
110 ms


==================================================
18. SECURITY
==================================================

Keep these ONLY on the server:

DISCORD_BOT_TOKEN
BRIDGE_SECRET
DATABASE credentials
API keys
private credentials


Never send:

GeoFS session IDs
Discord bot token
server secrets
private credentials

to Discord users.


The GeoFS client should authenticate to YOUR bridge,
not expose its GeoFS session credentials.


==================================================
19. CONNECTION AUTHENTICATION
==================================================

GeoFS client connects:

WebSocket
    ↓
Bridge authentication
    ↓
Server assigns connection ID
    ↓
Client becomes authorized


Example:

{
    "type": "identify",
    "token": "YOUR_BRIDGE_TOKEN",
    "client": "geofs"
}


Server response:

{
    "type": "identified",
    "clientId": "abc123"
}


Do not use a GeoFS session ID as your bridge token.


==================================================
20. RECOMMENDED PROJECT STRUCTURE
==================================================

geofs-discord-bridge/

    bot/
        index.js
        commands.js
        discord.js

    server/
        server.js
        websocket.js
        geofs.js
        auth.js
        state.js

    geofs/
        bridge.user.js

    shared/
        protocol.js

    .env

    package.json


==================================================
21. ENVIRONMENT VARIABLES
==================================================

DISCORD_BOT_TOKEN=
DISCORD_CLIENT_ID=
DISCORD_GUILD_ID=
DISCORD_CHANNEL_ID=
BRIDGE_SECRET=
PORT=3000


Never commit .env to GitHub.


==================================================
22. BASIC ARCHITECTURE
==================================================

                         DISCORD
                            │
                            │ Discord API
                            ▼
                  ┌──────────────────┐
                  │   Discord Bot    │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │  Bridge Server   │
                  │                  │
                  │  State           │
                  │  Authentication  │
                  │  WebSocket       │
                  │  Rate limiting   │
                  └────────┬─────────┘
                           │
                       WebSocket
                           │
                           ▼
                  ┌──────────────────┐
                  │ GeoFS Userscript │
                  └────────┬─────────┘
                           │
                           ▼
                  ┌──────────────────┐
                  │ GeoFS Multiplayer│
                  └──────────────────┘


==================================================
23. IMPORTANT GEOFS FUNCTIONS
==================================================

window.multiplayer

multiplayer.getServerTime()

multiplayer.getUser(id)

multiplayer.setChatMessage(message)

multiplayer.sendUpdate()

multiplayer.updateCallback(data)

multiplayer.lastResponse

multiplayer.users

multiplayer.visibleUsers

multiplayer.myId

multiplayer.avgPing

multiplayer.chatMessage

multiplayer.chatMessageId

multiplayer.nbUsers

multiplayer.serverTimeOffset


==================================================
24. IMPORTANT GEOFS GLOBALS
==================================================

geofs.multiplayerHost

geofs.MPSMinUpdateDelay

geofs.userRecord

geofs.aircraft.instance

geofs.aircraft.instance.llaLocation

geofs.aircraft.instance.htr

geofs.aircraft.instance.aircraftRecord

geofs.aircraft.instance.rigidBody

geofs.animation.values.kias


==================================================
25. MAP DATA
==================================================

GeoFS also has a multiplayer map update mechanism.

The client uses:

geofs.multiplayerHost + "/map"

with information including:

id
gid

where:

id
    multiplayer.myId

gid
    geofs.userRecord.licenseid


This is separate from the normal aircraft update stream.


==================================================
26. FINAL DATA FLOW
==================================================

                    GEOFS
                      │
        ┌─────────────┴──────────────┐
        │                            │
   Player data                   Chat data
        │                            │
        └─────────────┬──────────────┘
                      ▼
              GEOFS USERSCRIPT
                      │
                      ▼
                WEBSOCKET
                      │
                      ▼
              BRIDGE SERVER
                      │
          ┌───────────┴───────────┐
          │                       │
          ▼                       ▼
       DISCORD                GEOFS STATE
          │
          │
          ▼
      Discord users
          │
          │ !geo chat
          ▼
      BRIDGE SERVER
          │
          ▼
      WEBSOCKET
          │
          ▼
      GEOFS CLIENT
          │
          ▼
multiplayer.setChatMessage()
          │
          ▼
       GEOFS CHAT


==================================================
27. CORE REQUIREMENT
==================================================

The bot should NOT directly pretend to be another GeoFS
player or forge another player's multiplayer identity.

The bridge should communicate through a connected GeoFS
client/userscript and use the existing GeoFS multiplayer
client functionality.

The current GeoFS client itself constructs multiplayer
updates using the aircraft position, orientation, velocity,
aircraft ID, session/user information, server time, and
chat fields. Use that existing client-side data rather
than attempting to create fake player identities.


==================================================
28. MINIMUM FEATURES FOR VERSION 1
==================================================

Required:

[✓] GeoFS WebSocket connection
[✓] Discord bot connection
[✓] GeoFS player tracking
[✓] Callsign tracking
[✓] Aircraft tracking
[✓] Position tracking
[✓] Altitude tracking
[✓] Speed tracking
[✓] Heading tracking
[✓] Player count
[✓] GeoFS → Discord chat
[✓] Discord → GeoFS chat
[✓] !geo status
[✓] !geo players
[✓] !geo player
[✓] !geo me
[✓] Authentication
[✓] Rate limiting
[✓] Duplicate chat prevention
[✓] Connection/reconnection handling
[✓] Error handling


==================================================
29. DO NOT RELY ON THESE AS A PUBLIC API
==================================================

The following are internal/client-side GeoFS
implementation details:

multiplayer.sendUpdate()
multiplayer.updateCallback()
multiplayer.update()
multiplayer.users
multiplayer.visibleUsers
geofs.multiplayerHost

They can change when GeoFS changes.

Build the bridge so the GeoFS userscript is the adapter
between GeoFS and your own stable WebSocket protocol.


==================================================
30. SOURCE-VERIFIED MULTIPLAYER ENDPOINT
==================================================

Current community documentation shows the GeoFS client
using:

https://mps.geo-fs.com/update?l=<longitude-related value>

for multiplayer updates.

The exact host should preferably be read from:

geofs.multiplayerHost

instead of hard-coding it.

GeoFS documentation also shows the multiplayer response
containing:

myId
userCount
users
chatMessages
lastMsgId
serverTime


==================================================
END
==================================================