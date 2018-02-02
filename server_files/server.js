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

// GLOBALS
var service_id = [];

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
function checkUpdateDB(){
  MongoClient.connect(url, function(err, db) {
    if (err) throw err;
    //Query the database for the feed end date and update the database if the end date is today.
    db.collection('feedinfos').find({}).toArray(function(err, result) {
      if (err) throw err;
      // If therer are no errors grab the feed_end_date and convert it to a string
      console.log(result);
      var n = result[0].feed_end_date;
      end_date = convertToDate(n);
      var today = new Date();
      if (today > end_date){
        console.log("UPDATING DATABASE");
        updateDB();
      }
      console.log("END DATE: " + end_date);
      db.close();
    });
  });
}
// CONVERTS YRT DATE FORMAT TO JAVASCRIPT FORMAT
function convertToDate(date){
    var td = date.toString();
    // Parse the string to get the year month and day
    var year = td.slice(0,4);
    var month = td.slice(4,6) - 1;
    var day = td.slice(6,8);
    // Create the end_date and todays date then compare them. If they are equal the database will be updated
    var end_date = new Date(year, month, day);
    return end_date;
}

// CONVERTS JAVASCRIPT DATE FORMAT TO YRT DATE FORMAT YYYYMMDD as an int
function convertToYRTDate(date){
  var year = date.getFullYear();
  var month = date.getMonth() + 1;
  var day = date.getDate();

  if(date.getMonth() < 10){
    month = "0" + month;
  }
  if(date.getDate() < 10){
    day = "0" + day;
  }
  var strDate = date.getFullYear() +""+ month+ "" + day;
  //convert to int
  intDate = parseInt(strDate);
  return intDate;
}
// checks and updates the list of service ids
function updateServiceID(date){
  service_id = [];
  if(date.getDay() == 0){
    service_id.push("3");
  }
  if(date.getDay() == 6){
    service_id.push("2");
  }
  if(date.getDay() != 0 && date.getDay() != 6){
    service_id.push("1");
  }
  yrtDate = convertToYRTDate(date);
  MongoClient.connect(url, function(err, db){
    if (err) throw err;
    db.collection('calendardates').aggregate(
      [// Stage 1
        {$match: {"date":yrtDate}},
      ]).toArray(function(err, result){
        for(var i=0; i<result.length; i++){
          if(result[i].exception_type == 1){
            service_id.push(result[i].service_id);
          }
          if(result.exception_type == 2){
            var index = array.indexOf(result[i].service_id);
            if (index > -1) {
              service_id.splice(index, 1);
            }
          }
        }
        console.log(result);
        console.log(service_id);
    });
  });
}

app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.get('/', function(request, response) {
  console.log('Inside app.get function.');
  console.log(request.query.stop_id);

  checkUpdateDB();

  function custom_sort(a, b) {
    return new Date(a.stop_time).getTime() - new Date(b.stop_time).getTime();
  }

  function sortNumber(a,b) {
    return a - b;
  }
  platformFlag = true; //request.query.stop_id; change to request parameter
  stop_code = request.query.stop_id; // Name of the platform
  current_time = request.query.current_time;
  now = new Date(current_time);
  updateServiceID(now); // updating the service id to the current date
  console.log(now);

  // Variable Declarations for Mongodb queries
  var monthNames = ["January", "February", "March", "April", "May", "June","July", "August", "September", "October", "November", "December"];
  var stop_times_json = [];
  var trip_id_array = [];
  var stop_name_dict = {};
  var stop_times_dict = {};
  var stop_id_dict = {};
  var stopName = '';
  
  // Opening connections to Mongodb 
  // db.collection('stoptimes').find({"stop_id":{"$in": stop_code}}).toArray((err, result)=> {
  MongoClient.connect(url, function(err, db){
    if (err) throw err;
    db.collection('stops').aggregate(
      [// Stage 1
        {$match: {"stop_name":{"$regex": stop_code}}},
        // Stage 2
        {$lookup: {from: "stoptimes", localField: "stop_id", foreignField: "stop_id", as: "stoptime_objects"}},
        // Stage 3
        {$unwind: {path : "$stoptime_objects", includeArrayIndex : "arrayIndex", preserveNullAndEmptyArrays : false}},
        // Stage 4
        {$lookup: {from: "trips", localField: "stoptime_objects.trip_id", foreignField: "trip_id", as: "trip_objects" }},
        // Stage 5
        {$match: {"stoptime_objects.pickup_type" : 0, "trip_objects.service_id": {"$in": service_id}}},
        // Stage 6
        {$lookup:{from: "routes",localField: "trip_objects.route_id",foreignField: "route_id",as: "route_objects"}},
        // Stage 7
        {$project: {"route_objects.route_short_name":1, "trip_objects.trip_headsign": 1, "stoptime_objects.departure_time": 1, stop_name: 1}},
        // Stage 8
        {$sort: {"stoptime_objects.departure_time": -1}},
      ]).toArray(function(err, result){
        
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

          item["route"] = result[i].route_objects[0].route_short_name;
          item["destination"] = result[i].trip_objects[0].trip_headsign;

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
  var now = new Date();
});