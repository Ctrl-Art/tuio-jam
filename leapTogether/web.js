console.log("\n\n");
////////////                                            ////////////
console.log("     _                ______)                       ");
console.log(" ___/__)             (, /                /)         ");
console.log("(, /    _  _  __       /   ____    _ _/_(/    _  __ ");
console.log("  /   _(/_(_(_/_)_  ) /   (_)(_/__(/_(__/ )__(/_/ (_");
console.log(" (_____    .-/     (_/      .-/                     ");
console.log("        ) (_/              (_/                      ");
////////////                                            ////////////
console.log("\n");

// YARGS
var yargs = require('yargs');
var argv = require('yargs').default({
            host: "localhost",
            port: 3333
        })
        .alias('h', 'host')
        .alias('p', 'port')
        .usage('Bridge Leap to TUIO via Web Page')
        .argv
    ;
yargs.showHelp();

// EXPRESS HTML SERVER
var serverPort;
var serverAddress;
var express = require('express.io');
var app = express();
app.http().io();

// TUIO
var osc = require('osc-min');
var dgram = require('dgram');
var frameId = 0;
var aliveIds = [];
var aliveTimes = {};
setInterval(checkForStaleCursors, 500);

// Start HTTP & Socket Serving
app.listen(3456, function () {
    require('dns').lookup(require('os').hostname(), function (err, add, fam) {
        serverPort = 3456;
        serverAddress = add;
        console.log("Serving HTML Interface at", add + ":" + serverPort, "with Socket.IO cursors");
    });
});

// Start TUIO Server
var udp = dgram.createSocket("udp4");
udp.bind(function () {
    udp.setBroadcast(true);
    console.log("Serving TUIO Stream at", argv.host + ":" + argv.port);
});


// Route Cursor Events to TUIO
app.io.route('cursorStart', function (req) {
    var cursor = req.data;
    aliveIds.push(cursor.id);
    aliveTimes[cursor.id] = new Date().getTime();
    var buffer = cursorToBuffer(cursor);
    udp.send(buffer, 0, buffer.length, port, argv.host);

});

app.io.route('cursorMove', function (req) {
    var cursor = req.data;
    aliveTimes[cursor.id] = new Date().getTime();
    var buffer = cursorToBuffer(cursor);
    udp.send(buffer, 0, buffer.length, port, argv.host);
});

app.io.route('cursorEnd', function (req) {
    var cursor = req.data;
    aliveIds.splice(aliveIds.indexOf(cursor.id), 1);
    delete aliveTimes[cursor.id];
    var buffer = cursorToBuffer();
    udp.send(buffer, 0, buffer.length, port, argv.host);
});

app.use(express.static('web'));

// Send the client html.
app.get('/', function (req, res) {
    res.sendfile(__dirname + '/web/views/leap.html')
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
        args: ["source", "LeapTogether@" + argv.host]
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