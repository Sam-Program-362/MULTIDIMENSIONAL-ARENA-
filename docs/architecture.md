# Architecture

> **Future plan — none of the architecture described here is implemented.**

The planned architecture follows these principles:

- Keep the simulation core separate from the UI and from the narrator.
- Treat persistent state as the source of truth.
- Use an event-driven model for changes and reactions in the world.
- Use deterministic or seeded randomness where practical, so simulation behavior can be reproduced and investigated.
