# Y.O.L.O
# Online shooting game
Y.O.L.O — Tactical Online Shooter

A 2D browser shooter with AI bots, online lobbies and power-ups.

Gameplay
Modes: 1v1 duel and 10-player survival
Opponents: AI bots at three difficulty levels, or other players online
Multiplayer: lobbies with room codes and in-game chat (Socket.IO)
Features
Power-ups: clone, 2x shield and time slow
Minimap and a danger zone mechanic
Player profiles with match history
Leaderboards
Controls
Key	Action
(<>)	Move
(spacebar)	Shoot

# then visit file:///C:/Users/USER/.antigravity/public/index.html

Project structure
index.html   # menus, lobby, HUD and game canvas
js/game.js   # game loop and rendering
js/bot.js    # AI bot behaviour
server.js    # Socket.IO server (not reviewed)
Tech stack
JavaScript, HTML5 Canvas and CSS
Socket.IO for real-time multiplayer
Node.js backend
Customising
Menus and layout: edit index.html and the stylesheet.
Bot difficulty, power-ups and game rules: edit the scripts in js/.

