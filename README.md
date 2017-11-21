# YRT-StopScheduleGadget
This google gadget grabs GTFS data from York Region Transit and displays the stop times for the stop id entered.

Setup 
1.) Set up a mongodb Atlas cluster.
2.) In server_files/config.json
    a.) Add your mondodb url
    b.) Add the agency information for the transit agency of your choice.
3.) Set up a node server with the files in the server_files folder. (I used Heroku)
4.) Change the GET request url to your connect to your server.
5.) Set the stop id and run the gadget.
