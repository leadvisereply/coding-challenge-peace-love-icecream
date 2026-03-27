# Leadvise Reply Coding Interview – Treasure Hunter Challenge

**Summary:** Your job is to write the code for the mind of an agent in a game to find a treasure.

The map the game takes place on is randomly generated with scattered obstacles, stackable blocks, and walls. Somewhere on the map, there is a tower with the treasure on top. To attain this treasure, your agent must stack blocks and build a staircase. Your goal is to put the minitroll onto the tower. The game is complete once the minitroll stands ontop of the purple field named with height 8. Your solution should be able to solve the game for an arbitrary height of the tower but will only be tested for a height of 8. The solution should be performant and not take too long to run. Ideally the solution should be able to solve the game in less than 1000 turns. If you find different solutions, make sure to benchmark them and provide the results in a Readme.md file. Document your solution in the code and in the Readme.md file for review.

**The objectives:**

- Write clean and functional code for an agent. The challenge provides a starter javascript file.
- The challenge provides a testing environment. The average number of turns and average run time at full speed for 100 maps will be the primary metrics.
- Please provide a rough estimate of the number of hours spent on your solution.

**Challenge Info:**

You can learn the game mechanics with the [testing engine](challenge.html) (use the arrow keys). The testing engine will automatically pull the file [solution.js](solution.js) for automated testing purposes.

You must implement a class named `Stacker` with a **turn** method that accepts a JSON object with information about the map and returns the action the agent should take. The simulator will call this **turn** method once per game cycle.

Example of JSON the game passes as the parameter of the **turn** method:

```json
{
    left: { type: someValue, level: someValue },
    up: { type: someValue, level: someValue },
    right: { type: someValue, level: someValue },
    down: { type: someValue, level: someValue },
    type: someValue,
    level: someValue
}
```

There are three types of tiles on the map. All are traversable except walls.

- `0` (empty)
- `1` (wall)
- `2` (block)
- `3` (gold)

All tiles also have an associated non-negative integer level (elevation off the ground). Empty cells are always at ground zero. Your agent can only move up or down by one level at a time.

Your turn method must then return a string representing one of six possible actions:

- `"left"`
- `"up"`
- `"right"`
- `"down"`
- `"pickup"`
- `"drop"`

The simulator will only count a turn if the action you specified was legal. So if you try to pickup a non-existent block, it simply does nothing.

**Contact:**

- Email: [h.hommel@reply.de](mailto:h.hommel@reply.de)
- Telephone: [+49 151 19567104](tel:+4915119567104)

@2025 Leadvise Reply. All rights reserved.
