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
var url = "Enter your mongodb url here";

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

  stop_code = request.query.stop_id;
  current_time = request.query.current_time;
  now = new Date(current_time);
  //now = now.setHours(now.getHours() - 6);
  //now = new Date(now);
  console.log(now);

  // Variable Declarations for Mongodb queries
  var monthNames = ["January", "February", "March", "April", "May", "June","July", "August", "September", "October", "November", "December"];
  var stop_times_json = [];
  var trip_id_array = [];
  var stop_times_dict = {};
  // Opening connections to Mongodb 
  MongoClient.connect(url, function(err, db){
    if (err) throw err;
    db.collection('stoptimes').find({"stop_id":stop_code}).toArray(function(err, result) {
      if (err) throw err;
      console.log("Getting the stop_times");
      // Getting the stop_times and constructing a dictionary of trip_ids and stop_times for the next query to reference
      for (var i=0; len=result.length, i<len; i++){
        var item = {};
        var d = now;
        var stop_string = monthNames[d.getMonth()] + " " + d.getDate() + ", " + d.getFullYear() + " " + result[i].departure_time;
        var stop_time = new Date(stop_string);
        stop_times_dict[result[i].trip_id] = stop_time.toUTCString();
        trip_id_array.push(result[i].trip_id);
      }
      
      MongoClient.connect(url, function(err, db){
        if (err) throw err;
        db.collection('trips').find({"trip_id":{ "$in":trip_id_array}}).toArray(function(err, result) {
          if (err) throw err;
          console.log("Getting route_id and trip_headsign");
          var d = now;
          console.log(d.toLocaleString());
          // Getting route_id and trip_headsign and constructing the JSON object with stop_times
          for (var i=0; len=result.length, i<len; i++){
            var item = {};
            item["trip_id"] = result[i].trip_id;
            item["stop_time"] = stop_times_dict[result[i].trip_id];
            item["route_id"] = result[i].route_id;
            item["trip_headsign"] = result[i].trip_headsign;
            item["service_id"] = result[i].service_id;
            stop_times_json.push(item);
          }
          //console.log(stop_times_json.sort(custom_sort));
          response.send(stop_times_json.sort(custom_sort));
        });
      });
      db.close();
    });
  });
});

app.listen((process.env.PORT || 5000), function() {
  console.log('Node app is running on port', process.env.PORT);
  console.log(data);
});