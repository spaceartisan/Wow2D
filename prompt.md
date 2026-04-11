Create a browser-based top-down 2D MMORPG-inspired game strongly influenced by the feel of early World of Warcraft, but reimagined for a top-down perspective. The game should be built using HTML5 Canvas, JavaScript, and CSS, and served locally using Node.js with npm. This is not meant to be a full MMO at the start, but rather a strong prototype/foundation that captures the atmosphere, gameplay loop, and world structure of a Warcraft-like online RPG.

Core goal:
Build a playable top-down 2D fantasy RPG world with the feeling of an online MMO: a character moving through an overworld, fighting monsters, interacting with NPCs, gaining experience, collecting loot, and exploring distinct zones. Focus on making it feel like the early skeleton of a real game rather than a tech demo.

Requirements:
- Use HTML5 Canvas for rendering the game world
- Use JavaScript for gameplay systems
- Use CSS only for surrounding UI and layout
- Serve the project with Node.js/npm
- Organize the code cleanly so it can be expanded later into a larger multiplayer RPG
- Make the project playable immediately after install and run

Visual/style direction:
- Top-down 2D fantasy world
- Inspired by classic World of Warcraft zone design, color palette, and sense of adventure
- Hand-painted fantasy feel, not sci-fi
- Readable terrain, trees, roads, buildings, water, and enemies
- UI should feel game-like, not like a web dashboard
- The screen should be contained cleanly within the viewport

Initial gameplay features:
- Player movement in 8 directions
- Large scrolling overworld map or zone
- Basic collision with terrain and objects
- NPCs placed in towns or along roads
- Hostile creatures roaming outside safe areas
- Simple combat system with melee auto-attack or click-to-attack
- Health and mana/resource bars
- Experience and leveling
- Basic quest system such as “kill 5 wolves”
- Loot drops from enemies
- Inventory window
- Equipment slots
- Gold/currency counter
- Basic enemy respawning
- Simple death/respawn behavior

World structure:
- Include at least:
  - a safe starter town
  - a road leading outward
  - a beginner forest or wilderness zone
  - scattered monsters
  - quest-giver NPCs
- The world should feel like a real RPG zone rather than a single-screen arena

UI:
- Top-down game view is the priority
- Include a compact fantasy RPG interface with:
  - player portrait or status panel
  - HP/resource bars
  - XP bar
  - action bar with a few starter abilities
  - quest tracker
  - inventory/equipment panels
- Avoid excessive logs or debug text on screen
- Make the UI visually cohesive and immersive

Architecture:
- Separate the code into clear systems such as:
  - rendering
  - input
  - world/map
  - entities
  - combat
  - quests
  - UI
- Use placeholder assets where needed, but structure the project so art can easily be replaced later
- Include a simple npm start command
- Include a README with setup instructions

Important design goal:
This should feel like the beginning of a real top-down 2D “WoW-like” game. Prioritize atmosphere, exploration, RPG progression, and strong foundations over huge feature count. The result should feel like a starter zone from a fantasy MMORPG brought into a top-down 2D format.