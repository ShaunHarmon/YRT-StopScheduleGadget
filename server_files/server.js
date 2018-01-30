// Requirements for realtime feeds and application setup
var GtfsRealtimeBindings = require('gtfs-realtime-bindings');
var express = require('express');
var request = require('request');
var echo = require('node-echo');
// Requirements for working with mongodb and gtfs data
const gtfs = require('gtfs');
const mongoose = require('mongoose');
const config = require('./config.json');
var MongoClient = require('mongodb').MongoClient;
var url = "";

var app = express();
var data = [];
var feed;
var requestSettings = {
  method: 'GET',
  url: 'http://rtu.york.ca/gtfsrealtime/TripUpdates',
  encoding: null
};
request(requestSettings, function (error, response, body) {
  if (!error && response.statusCode == 200) {
    feed = GtfsRealtimeBindings.FeedMessage.decode(body);
  }
});

// UPDATE DB FUNCTION
function updateDB(){
  mongoose.Promise = global.Promise;
  mongoose.connect(config.mongoUrl, {useMongoClient: true});

  gtfs.import(config)
  .then(() => {
    console.log('Import Successful');
  })
  .catch(err => {
    console.error(err);
  });
}

MongoClient.connect(url, function(err, db) {
  if (err) throw err;
  //Query the database for the feed end date and update the database if the end date is today.
  db.collection('feedinfos').find({}).toArray(function(err, result) {
    if (err) throw err;
    // If therer are no errors grab the feed_end_date and convert it to a string
    var n = result[0].feed_end_date;
    var td = n.toString();
    // Parse the string to get the year month and day
    var year = td.slice(0,4);
    var month = td.slice(4,6) - 1;
    var day = td.slice(6,8);
    // Create the end_date and todays date then compare them. If they are equal the database will be updated
    var end_date = new Date(year, month, day);
    var today = new Date();
    if (end_date.getFullYear() === today.getFullYear() && end_date.getMonth() === today.getMonth() && end_date.getDate() === today.getDate()){
      updateDB();
    }
    console.log(end_date);
    db.close();
  });
});

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get('/', function(request, response) {
  console.log('Inside app.get function.');
  console.log(request.query.stop_id);

  function custom_sort(a, b) {
    return new Date(a.stop_time).getTime() - new Date(b.stop_time).getTime();
  }

  function sortNumber(a,b) {
    return a - b;
  }
  platformFlag = true; //request.query.stop_id; change to request parameter
  stop_code = request.query.stop_id;
  stop_code = stop_code.split(',');
  current_time = request.query.current_time;
  now = new Date(current_time);
  //now = now.setHours(now.getHours() - 6);
  //now = new Date(now);
  console.log(now);

  // Variable Declarations for Mongodb queries
  var monthNames = ["January", "February", "March", "April", "May", "June","July", "August", "September", "October", "November", "December"];
  var stop_times_json = [];
  var trip_id_array = [];
  var stop_name_dict = {};
  var stop_times_dict = {};
  var stop_id_dict = {};
  var stopName = '';
  var lastTripId = 0;
  // Opening connections to Mongodb 
  // db.collection('stoptimes').find({"stop_id":{"$in": stop_code}}).toArray((err, result)=> {
  MongoClient.connect(url, function(err, db){
    if (err) throw err;
    db.collection('stops').aggregate(
      [// Stage 1
        {$match: {"stop_id":{"$in": stop_code}}},
        // Stage 2
        {$lookup: {from: "stoptimes", localField: "stop_id", foreignField: "stop_id", as: "stoptime_objects"}},
        // Stage 3
        {$unwind: {path : "$stoptime_objects", includeArrayIndex : "arrayIndex", preserveNullAndEmptyArrays : false}},
        // Stage 4
        {$lookup: {from: "trips", localField: "stoptime_objects.trip_id", foreignField: "trip_id", as: "trip_objects" }},
        // Stage 5
        {$match: {"stoptime_objects.pickup_type" : 0, "trip_objects.service_id": "1"}},
        // Stage 6
        {$project: {stop_name: 1, "stoptime_objects.departure_time": 1, "trip_objects.trip_headsign": 1}},
      ]).toArray(function(err, result){;
        
        for (var i=0; len=result.length, i<len; i++){
          var item = {};
          var stop_str = result[i].stop_name;
          if (stop_str.indexOf("PLATFORM") !== -1) {
            var x = stop_str.indexOf("PLATFORM");
            var platfromName = stop_str.substr(0, x);;
            var platformNumberArray = stop_str.split(" ");
            var platformNumber = platformNumberArray[platformNumberArray.length -1];
            item["platform_name"] = platfromName;
            item["platform_number"] = platformNumber;
          }

          var d = now;
          var stop_string = monthNames[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear() + " " + result[i].stoptime_objects.departure_time;
          var stop_time = new Date(stop_string);
          item["stop_time"] = stop_time.toUTCString();

          var str = result[i].trip_objects[0].trip_headsign;
          if (str.indexOf("to") !== -1) {
              var n = str.indexOf("to");
              var route = str.substr(0, n);
              var routeArray = route.split(" ");
              if (routeArray[0] === "RT") {
                  route = routeArray[1];
              } else {
                  route = routeArray[0];
              }
              var destination = str.substr(n + 2, str.length);
              if (destination.indexOf("via") !== -1) {
                  destination = (destination.substr(0, destination.indexOf("via")));
              }
          } else {
              var route = str;
              var destination = "";
          }

          item["route"] = route;
          item["destination"] = destination;

          //console.log(item);
          stop_times_json.push(item);
          
        }
        
        //console.log(stop_times_json.sort(custom_sort));
        response.send(stop_times_json.sort(custom_sort));
        db.close();
      });
    
    
    });
  });

app.listen((process.env.PORT || 5000), function() {
  console.log('Node app is running on port', process.env.PORT);
  console.log(data);
});