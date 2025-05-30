# Example Usage Script

This shows how to use the Playwright Demo Recorder MCP server with Claude Desktop.

## Example 1: Recording a Simple Website Tour

```
User: Start a demo recording for https://google.com, description "Google Search Demo"
Claude: [Starts recording and opens browser]

User: Type "MCP servers" into the search bar
Claude: [Types into search field]

User: Click the Google Search button
Claude: [Clicks search button]

User: Generate a social media post for this demo
Claude: [Generates engaging post about the demo]

User: Stop the demo recording
Claude: [Stops recording and provides video path + social media post]
```

## Example 2: E-commerce Site Demo

```
User: Start a demo recording for https://example-shop.com, description "Shopping Cart Workflow"
Claude: [Starts recording]

User: Click on the "Products" menu item
Claude: [Navigates to products]

User: Click on the first product card
Claude: [Shows product details]

User: Click the "Add to Cart" button
Claude: [Adds item to cart]

User: Navigate to the shopping cart
Claude: [Goes to cart page]

User: Generate a social media post
Claude: [Creates post highlighting the shopping experience]

User: Stop recording
Claude: [Saves video and displays social post]
```

## Example 3: Form Filling Demo

```
User: Start a demo recording for https://forms.example.com, description "User Registration Process"
Claude: [Starts recording]

User: Type "John Doe" into the name field
Claude: [Fills name field]

User: Type "john.doe@example.com" into the email field  
Claude: [Fills email field]

User: Click the "Submit" button
Claude: [Submits form]

User: Generate social media post and stop recording
Claude: [Generates post about the registration process and saves video]
```

## Tips for Best Results

1. **Be Descriptive**: Use clear descriptions for your demos
2. **Specify Elements**: When possible, describe the elements you want to interact with
3. **Check Snapshots**: Use "get demo page snapshot" to see the current state
4. **Generate Posts Early**: You can generate social media posts before stopping the recording
5. **Browser Choice**: Use Chromium for best compatibility, Firefox for privacy features, or WebKit for Safari testing