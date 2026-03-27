// Example Stacker class
// You can use this as a starting point for your solution.
// Your function should return an object with a turn function.
// The turn function will be called once per game cycle.
// No properties are passed to the turn function.
// All you need to do is return the action you want to take.
// The action you return should be one of the following:
// "left", "right", "up", "down", "pickup", "drop"
class Stacker {
	turn(cell) {
		console.log(cell);
		/*
        //example of cell object passed to turn function
         {
            
            down: {type: 0, level: 0}
            left: {type: 1, level: 0}
            level: 0
            right: {type: 0, level: 0}
            type: 0
            up :{type: 0, level: 0}
        } */
		return "left";
	}
}
