# DF Pong relay

A tiny WebSocket relay that lets the **admin panel** reach the game from another device: a phone, a
second laptop, or a Wi-Fi microcontroller with knobs on it.

You only need this for *other devices*. An admin panel opened in another tab or window of the same
browser as the game works with no server at all.

No dependencies: just Node.js 18 or newer.

## In the classroom (one laptop runs everything)

```bash
node server/relay.js
```

It serves the whole repo and the relay on port 5501 and prints the addresses to use:

```
Game:   http://localhost:5501/game/cc26/?relay=same-origin
Admin:  http://localhost:5501/game/admin/?room=cc26&relay=same-origin
Admin from another device on this network: http://10.0.0.29:5501/game/admin/?room=cc26&relay=same-origin
```

- Open the **game** on the laptop driving the projector (`localhost`, so Web Bluetooth works).
- Open the **admin** link on your phone (same Wi-Fi network).

Options (environment variables):

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `5501` | Port to listen on |
| `ADMIN_KEY` | none | If set, admin panels must enter this key. **Set one in a classroom**: otherwise anyone on the network who finds the admin page can change the rules. |
| `STATIC` | `1` | `0` = relay only, don't serve files (for cloud hosting) |

```bash
ADMIN_KEY=bluebird node server/relay.js
```

## With the GitHub Pages game

The game on GitHub Pages is served over `https`, so it can only reach a relay over secure WebSockets
(`wss://`). Host `relay.js` on any Node host that gives you HTTPS (Render, Railway, Fly.io, a university
server behind a TLS proxy…), with `STATIC=0` and an `ADMIN_KEY`. Then either:

- set `relay: 'wss://your-relay.example.com'` in the class page's `index.html`, or
- add `?relay=wss://your-relay.example.com` to the game URL and the admin URL.

## What it does

- Each game and admin joins a **room** (the class page's `instance`, e.g. `cc26`).
- Admin messages (`admin:*`) go to the games in the room; game messages (`game:*`) go to the admins.
  Nothing else is forwarded, and rooms can't see each other.
- Games can't send admin messages. With `ADMIN_KEY`, admins must authenticate.
- Messages over 16 KB, or more than 30 per second from one connection, are dropped.
- The game validates every value it receives anyway, so a bad message can't break it.

Message formats: [docs/PROTOCOL.md](../docs/PROTOCOL.md), section 6. Anything that can open a
WebSocket and send JSON can be an admin, for example an ESP32 with a few potentiometers that sends
`{"type":"admin:rules","rules":{"puckSpeed":8}}` when you turn a knob.
