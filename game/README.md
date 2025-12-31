# DF Pong Game Versions

This folder contains the DF Pong game with multiple class/session iterations. Each version is self-contained and can be modified independently.

## Game Structure

```
game/
├── _template/              # Template for creating new versions (copy this!)
│   ├── index.html          # Main HTML file
│   ├── players-config.json # Player names (45 generic players)
│   ├── js/                 # JavaScript game logic
│   │   ├── bleController.js
│   │   ├── gameController.js
│   │   ├── paddle.js
│   │   ├── puck.js
│   │   └── sketch.js
│   ├── css/
│   │   └── style.css
│   └── assets/
│       ├── paddle.wav
│       ├── wall.wav
│       ├── ding.mp3
│       └── gameStart.png
├── cc25/                   # Creation & Computation 2025
│   ├── index.html
│   ├── players-config.json
│   ├── js/
│   ├── css/
│   └── assets/
├── physComp26-501/         # Physical Computing 2026 - Section 501
│   └── (same structure)
└── physComp26-502/         # Physical Computing 2026 - Section 502
    └── (same structure)
```

## Available Versions

| Version | Description | Players | Link |
|---------|-------------|---------|------|
| **CC25** | Creation & Computation 2025 | 25 | [cc25/index.html](cc25/index.html) |
| **PhysComp26-501** | Physical Computing 2026 - Section 501 | 45 | [physComp26-501/index.html](physComp26-501/index.html) |
| **PhysComp26-502** | Physical Computing 2026 - Section 502 | 45 | [physComp26-502/index.html](physComp26-502/index.html) |
| **Test** | Test instance | 45 | [test/index.html](test/index.html) |

## Creating a New Iteration

To create a new class/session iteration:

1. **Copy the `_template/` folder** and rename it (e.g., `myClass27/`)
2. **Update the title** in `index.html`:
   ```html
   <title>DF Pong - Your Class Name</title>
   ```
3. **Edit `players-config.json`** with your player names:
   ```json
   {
     "players": [
       { "deviceNumber": 1, "name": "Player Name" },
       { "deviceNumber": 2, "name": "Another Player" },
       ...
     ]
   }
   ```

That's it! Each version has its own complete copy of js, css, and assets, allowing you to customize or update each version independently while maintaining backwards compatibility with older versions.

## Running Locally

To run the game locally, you need a local web server due to browser security restrictions on loading local files. Options include:

- **VS Code Live Server extension**: Right-click on an `index.html` and select "Open with Live Server"
- **Python**: `python -m http.server 8000` in the version folder
- **Node.js**: `npx serve` in the version folder

Then navigate to the appropriate instance URL (e.g., `http://localhost:8000/cc25/`)

## Customization

Each version can independently customize:
- **`players-config.json`**: Player names and device numbers
- **`index.html`**: Page title and any instance-specific settings
- **`js/`**: Game logic (modify for version-specific features)
- **`css/`**: Styles (customize look and feel per version)
- **`assets/`**: Sounds and images (swap out for different themes)
