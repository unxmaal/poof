# poof

Hide any element in an Electron app by clicking it. Built for Discord, and the hidden things stay hidden across restarts.

Requires macOS and Node 22 or newer. No runtime dependencies.

## Use

    node bin/poof.js launch [app] [--restart] [-- app args]
    node bin/poof.js list [app]
    node bin/poof.js rm <n|all> [app]

`app` defaults to `discord`. It can be a name in `/Applications` or a path to a `.app`. `--restart` quits a copy that is already running, since poof can only attach to an app it started.

Inside the app:

| Key | Action |
| --- | --- |
| Ctrl+Option+P | Start or stop picking |
| Click | Hide the highlighted element |
| Shift-click | Hide something that covers most of the window |
| Scroll | Move the highlight to the parent or child |
| Esc | Cancel |
| Ctrl+Option+Z | Undo the last hide |

Rules are saved in `~/.config/poof/<app>.json`, and the log is beside them. Editing that file, or running `rm`, applies live.

## How it works

poof starts the app with `--remote-debugging-pipe` and injects a picker over the Chrome DevTools Protocol. The pipe opens no network port, and the app bundle is not modified. The script runs in an isolated world, so the app's own JavaScript cannot see it. Hiding is local CSS, and poof sends nothing to the app's servers.

Selectors prefer `aria-label` and stable `data-*` attributes, which also catches repeated controls. Hashed class names are matched by prefix so rules survive a rebuild.

## Limits

- Opening the app from the Dock does not load poof. Use `launch`.
- If Discord restarts itself to update, poof detaches. Run `launch --restart` again.
- A rule can stop matching when the app changes its UI. Pick the element again.
- Discord's terms of service prohibit client modification. Use at your own risk.

## Test

    npm install
    npm test

Tests use headless Chrome and a throwaway Electron app. They never start the target app.
