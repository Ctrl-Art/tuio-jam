var osc = require('osc-min');
var dgram = require('dgram');
var express = require('express.io');

var app = express();
app.http().io();

// TUIO Variables
var host = "192.168.1.255";
var port = 3333;
var frameId = 0;
var aliveIds = [];
var aliveTimes = {};

var serverPort;
var serverAddress;

setInterval(checkForStaleCursors, 500);

// Route Cursor Events to TUIO
app.io.route('cursorStart', function (req) {
    var cursor = req.data;
    aliveIds.push(cursor.id);
    aliveTimes[cursor.id] = new Date().getTime();
    var buffer = cursorToBuffer(cursor);
    udp.send(buffer, 0, buffer.length, port, host);

});

app.io.route('cursorMove', function (req) {
    var cursor = req.data;
    aliveTimes[cursor.id] = new Date().getTime();
    var buffer = cursorToBuffer(cursor);
    udp.send(buffer, 0, buffer.length, port, host);
});

app.io.route('cursorEnd', function (req) {
    var cursor = req.data;
    aliveIds.splice(aliveIds.indexOf(cursor.id), 1);
    delete aliveTimes[cursor.id];
    var buffer = cursorToBuffer();
    udp.send(buffer, 0, buffer.length, port, host);
});

app.use(express.static('web'));

// Send the client html.
app.get('/', function (req, res) {
    res.sendfile(__dirname + '/web/views/leap.html')
});

// Start HTTP & Socket Serving
app.listen(3456, function () {
    require('dns').lookup(require('os').hostname(), function (err, add, fam) {
        serverPort = 3456;
        serverAddress = add;
        console.log('Express server listening at ' + add + ' on port ' + serverPort);
    });
});

// Start TUIO Server
var udp = dgram.createSocket("udp4");
udp.bind(function () {
    udp.setBroadcast(true);
    console.log("TUIO Server running at", host, "on port", port);
});

function getAliveIds() {
    var aliveArgs = ["alive"];
    for (var i = 0; i < aliveIds.length; i++) {
        aliveArgs.push({
            type: "integer",
            value: aliveIds[i]
        });
    }
    return aliveArgs;
}

function getTuioPrefix() {
    return "/tuio/2Dcur";
}

function cursorToBuffer(cursor) {
    cursor = cursor || null;

    var elements = [];

    var source = {
        address: getTuioPrefix(),
        args: ["source", "LeapTogether@" + host]
    };

    var alive = {
        address: getTuioPrefix(),
        args: getAliveIds()
    };

    var fseq = {
        address: getTuioPrefix(),
        args: ["fseq", {type: "integer", value: frameId}]
    };
    frameId++;

    if (cursor !== null) {
        var pSet = {
            address: getTuioPrefix(),
            args: [
                "set",
                { type: "integer", value: cursor.id },
                cursor.x,
                cursor.y,
                1.0,
                1.0,
                0.0
            ]
        };

        elements = [source, alive, pSet, fseq];

    } else {

        elements = [source, alive, fseq];
    }

    return osc.toBuffer({
        oscType: "bundle",
        timetag: 0,
        elements: elements
    })

}

function checkForStaleCursors() {
    for (var i = aliveIds.length - 1; i >= 0; i--) {
        var id = aliveIds[i];
        var timeSinceLastActive = new Date().getTime() - aliveTimes[id];
        if (timeSinceLastActive > 200) {
            delete aliveTimes[id];
            aliveIds.splice(i, 1);
        }
    }
}