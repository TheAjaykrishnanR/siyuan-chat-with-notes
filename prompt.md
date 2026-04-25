I want to build a chat plugin for siyuan-note which allows a user to chat with an ai api such as gemini, claude, chatgpt, (open ai compatible) while attaching the notes using the `@` command which can also reference workspaces, images inside a note etc. The chat ui must be accessible from the sidebar (important not topbar) which upon being clicked will open a modern sleek chat interface (not a note tab). I should also have settings menu where i can configure api keys, models and other settings. I also should have a sidebar inside the chat interface for accessing previous conversations etc.

I want the interface to be similar to `open-webui`

# Subfolders

- I have put `siyuan-plugin-api-reference` folder which contains siyuan's plugin api which you can use as a reference.
- `open-webui`: the source code of open-webui chat interface to use as reference or inspiration

# Important consideration

- Terminal is `pwsh.exe` so use powershell versions of common commands inorder to interact with the system.
- The plugin must be built in the root and changes to it must reflect in the root because that where siyuan is looking, not in `dist` etc
