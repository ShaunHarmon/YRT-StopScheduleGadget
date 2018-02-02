db.calendardates.aggregate(

	// Pipeline
	[
		// Stage 1
		{
			$match: {
			    "date":NumberInt(20180201)
			}
		},

	]

	// Created with Studio 3T, the IDE for MongoDB - https://studio3t.com/

);
