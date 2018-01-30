db[' stops'].aggregate(

	// Pipeline
	[
		// Stage 1
		{
			$match: {"stop_id":{"$in": ['9819','9820','9821','4461','4468','4453','4454','9723']}}
		},

		// Stage 2
		{
			$group: {_id: "$stop_id", name: {$first: "$stop_name"}}
		},

	]

	// Created with Studio 3T, the IDE for MongoDB - https://studio3t.com/

);
