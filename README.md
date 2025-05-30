# Demo Video MCP Server

An MCP (Model Context Protocol) server that records browser demos with animated cursor and automatically generates engaging social media posts based on user interactions.

## Features

- 🎬 **Video Recording**: Records browser sessions with custom animated cursor
- 🖱️ **Interactive Cursor**: Animated cursor that highlights clicks and movements
- 📱 **Social Media Posts**: Automatically generates engaging posts based on demo interactions
- 🎯 **Smart Summaries**: Creates narrative-driven descriptions of your demo journey
- 🔧 **Easy Integration**: Works seamlessly with Claude Desktop

## Installation

1. Clone this repository:
```bash
git clone https://github.com/yourusername/demo-video-mcp.git
cd demo-video-mcp
```

2. Install dependencies:
```bash
npm install
```

3. Build the project:
```bash
npm run build
```

## Configuration for Claude Desktop

1. Open your Claude Desktop configuration file:
   - **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
   - **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

2. Add the server configuration:
```json
{
  "mcpServers": {
    "demo_video": {
      "command": "node",
      "args": [
        "/absolute/path/to/demo-video-mcp/build/index.js"
      ],
      "workingDirectory": "/absolute/path/to/demo-video-mcp"
    }
  }
}
```

3. Restart Claude Desktop

## Usage

### Start a Demo Recording
```
"Start a demo recording for https://example.com, description 'Website Tour Demo'"
```

### Interact with the Page
```
"Click the 'Sign Up' button"
"Type 'john.doe@example.com' into the email field"
"Navigate to https://example.com/features"
```

### Generate Social Media Post
```
"Generate a social media post for this demo"
```

### Stop Recording
```
"Stop the demo recording"
```

## Available Tools

- **start_demo_recording**: Begins a new recording session
- **navigate_during_demo**: Navigate to a new URL
- **click_element_on_demo_page**: Click elements on the page
- **type_into_demo_element**: Type text into form fields
- **get_demo_page_snapshot**: Get current page state
- **generate_social_media_post**: Create social media content
- **stop_demo_recording**: Stop and save the video

## Video Output

Videos are saved in the `videos/` directory as `.webm` files with descriptive names including timestamp.

## Social Media Post Generation

The server tracks all interactions and generates posts that include:
- Demo title and description
- Journey highlights (pages visited, actions taken)
- Key interaction moments
- Engagement metrics
- Relevant hashtags
- Call-to-action

## Development

```bash
# Watch mode for development
npm run dev

# Build the project
npm run build

# Start the server
npm start
```

## License

ISC

## Contributing

Pull requests are welcome! Please feel free to submit a Pull Request.